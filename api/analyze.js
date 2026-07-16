import { callGeminiJson } from './lib/gemini.js';
import { errorStatus, handleMethod, safeError } from './lib/http.js';
import {
  LIMITS,
  chunkText,
  encodeGitHubPath,
  exclusionReason,
  githubRequest,
} from './lib/repository.js';

const ANALYSIS_FIELDS = [
  'purpose', 'architecture', 'entryPoints', 'features', 'commands',
  'configuration', 'environmentVariables', 'publicApis', 'dataFlow',
  'dependencies', 'testing', 'usageExamples', 'deployment', 'uncertainties',
];

function validateRequest(body) {
  const repository = body?.repository;
  const files = body?.selectedFiles;
  if (!repository?.owner || !repository?.name || !repository?.defaultBranch) {
    throw new Error('Missing repository identity');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(repository.owner) || !/^[A-Za-z0-9_.-]+$/.test(repository.name)) {
    throw new Error('Invalid repository identity');
  }
  if (!Array.isArray(files) || !files.length) throw new Error('No files selected for analysis');
  return { repository, files: files.slice(0, LIMITS.maxSelectedFiles) };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function summarizeChunk(path, chunk, part, total) {
  return callGeminiJson(
    `Analyze this repository file using only the supplied content.
File: ${path}
Chunk: ${part} of ${total}

Extract concrete facts useful for developer documentation: responsibilities, exported/public interfaces, commands, configuration, environment variables, dependencies, data flow, usage, tests, and deployment behavior. Include identifiers and exact commands when visible. Say "not established" for anything unsupported. Return concise JSON with keys: summary, facts, commands, configuration, APIs, tests, uncertainties.

FILE CONTENT:
${chunk}`,
    { maxOutputTokens: 2400 }
  );
}

export default async function handler(req, res) {
  if (!handleMethod(req, res)) return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GitHub access is not configured' });

  try {
    const { repository, files } = validateRequest(req.body);
    const analyzedFiles = [];
    const skippedFiles = [];
    const warnings = [];
    let firstFileError;
    let totalBytes = 0;

    for (const file of files) {
      const normalized = {
        path: String(file.path || '').replace(/^\/+/, ''),
        size: Number(file.size) || 0,
        type: 'blob',
      };
      const exclusion = exclusionReason(normalized);
      if (exclusion || normalized.path.includes('..')) {
        skippedFiles.push({ path: normalized.path, reason: exclusion || 'invalid path' });
        continue;
      }
      if (totalBytes + normalized.size > LIMITS.maxTotalBytes) {
        skippedFiles.push({ path: normalized.path, reason: 'total analysis limit reached' });
        continue;
      }

      try {
        const url = `https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${encodeGitHubPath(normalized.path)}?ref=${encodeURIComponent(repository.defaultBranch)}`;
        const response = await githubRequest(url, token, { accept: 'application/vnd.github.raw+json' });
        const content = await response.text();
        const byteSize = Buffer.byteLength(content, 'utf8');
        if (byteSize > LIMITS.maxFileBytes || totalBytes + byteSize > LIMITS.maxTotalBytes) {
          skippedFiles.push({ path: normalized.path, reason: 'content size limit reached' });
          continue;
        }
        if (content.includes('\u0000')) {
          skippedFiles.push({ path: normalized.path, reason: 'binary content detected' });
          continue;
        }
        totalBytes += byteSize;
        analyzedFiles.push({ path: normalized.path, bytes: byteSize, content });
      } catch (error) {
        firstFileError ||= error;
        skippedFiles.push({ path: normalized.path, reason: 'file unavailable during analysis' });
      }
    }

    if (!analyzedFiles.length) {
      throw firstFileError || new Error('No selected files could be analyzed');
    }

    const chunkJobs = analyzedFiles.flatMap(file => {
      const chunks = chunkText(file.content);
      return chunks.map((chunk, index) => ({
        path: file.path,
        chunk,
        part: index + 1,
        total: chunks.length,
      }));
    });

    const summaries = await mapWithConcurrency(
      chunkJobs,
      4,
      job => summarizeChunk(job.path, job.chunk, job.part, job.total)
    );
    const attributedSummaries = summaries.map((analysis, index) => ({
      file: chunkJobs[index].path,
      part: chunkJobs[index].part,
      analysis,
    }));

    const report = await callGeminiJson(
      `Create a factual repository analysis from the metadata, file tree, and file analyses below.
Do not infer unsupported behavior. Deduplicate repeated facts. Prefer source code, manifests, tests, examples, and configuration over claims found only in README files. Preserve exact commands, identifiers, file paths, APIs, configuration keys, and environment variable names. Put missing or conflicting information in uncertainties.
Return JSON with exactly these top-level keys: ${ANALYSIS_FIELDS.join(', ')}. Values may be strings, arrays, or objects as appropriate.

REPOSITORY:
${JSON.stringify(repository)}

FILE TREE:
${JSON.stringify(req.body?.tree || []).slice(0, 120000)}

FILE ANALYSES:
${JSON.stringify(attributedSummaries).slice(0, 500000)}`,
      { maxOutputTokens: 7500 }
    );

    if (skippedFiles.length) {
      warnings.push(`${skippedFiles.length} selected file(s) were skipped; generated documentation has partial coverage.`);
    }

    return res.status(200).json({
      report,
      analyzedFiles: analyzedFiles.map(({ path, bytes }) => ({ path, bytes })),
      skippedFiles,
      warnings,
    });
  } catch (error) {
    return res.status(errorStatus(error, 400)).json({
      error: safeError(error, 'Unable to analyze this repository'),
    });
  }
}
