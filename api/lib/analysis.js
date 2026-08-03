import {
  LIMITS,
  chunkText,
  encodeGitHubPath,
  exclusionReason,
} from './repository.js';

const ANALYSIS_FIELDS = [
  'purpose', 'components', 'entryPoints', 'features', 'prerequisites',
  'commands', 'configuration', 'environmentVariables', 'apiDocumentation',
  'dataFlow', 'dependencies', 'testing', 'usageExamples', 'deployment',
  'repositoryStructure', 'uncertainties',
];

export function validateAnalysisRequest(body) {
  const repository = body?.repository;
  const files = body?.selectedFiles;
  if (!repository?.owner || !repository?.name || !repository?.defaultBranch) {
    throw new Error('Missing repository identity');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(repository.owner) || !/^[A-Za-z0-9_.-]+$/.test(repository.name)) {
    throw new Error('Invalid repository identity');
  }
  if (!Array.isArray(files) || !files.length) {
    throw new Error('No files selected for analysis');
  }
  return { repository, files: files.slice(0, LIMITS.maxSelectedFiles) };
}

export function createRepositoryAnalyzer({ fetchFile, analyzeJson }) {
  if (typeof fetchFile !== 'function' || typeof analyzeJson !== 'function') {
    throw new TypeError('Repository analyzer dependencies must be functions');
  }

  return async function analyzeRepository(body) {
    const { repository, files } = validateAnalysisRequest(body);
    const { analyzedFiles, skippedFiles } = await collectFiles(repository, files, fetchFile);
    const chunkJobs = createChunkJobs(analyzedFiles);
    const summaries = await mapWithConcurrency(
      chunkJobs,
      4,
      job => analyzeJson(createFilePrompt(job), {
        stage: `File analysis (${job.path}, chunk ${job.part}/${job.total})`,
        kind: 'fileAnalysis',
      })
    );
    const attributedSummaries = summaries.map((analysis, index) => ({
      file: chunkJobs[index].path,
      part: chunkJobs[index].part,
      analysis,
    }));
    const report = await analyzeJson(
      createReportPrompt(repository, body?.tree || [], attributedSummaries),
      { kind: 'repositoryReport' }
    );
    const warnings = skippedFiles.length
      ? [`${skippedFiles.length} selected file(s) were skipped; generated documentation has partial coverage.`]
      : [];

    return {
      report,
      analyzedFiles: analyzedFiles.map(({ path, bytes }) => ({ path, bytes })),
      skippedFiles,
      warnings,
    };
  };
}

async function collectFiles(repository, files, fetchFile) {
  const analyzedFiles = [];
  const skippedFiles = [];
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
      const content = await fetchFile(repository, normalized.path);
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
  return { analyzedFiles, skippedFiles };
}

function createChunkJobs(files) {
  return files.flatMap(file => {
    const chunks = chunkText(file.content);
    return chunks.map((chunk, index) => ({
      path: file.path,
      chunk,
      part: index + 1,
      total: chunks.length,
    }));
  });
}

function createFilePrompt({ path, chunk, part, total }) {
  return `Analyze this repository file using only the supplied content.
File: ${path}
Chunk: ${part} of ${total}

Extract only concrete facts useful for developer documentation: responsibilities, system components, essential setup or usage commands, configuration, environment variables, dependencies, data-flow relationships, usage, tests, deployment behavior, and explicit Swagger/OpenAPI documentation locations. Include identifiers and exact commands when visible. Associate commands with their working directory or manifest when known. Do not enumerate individual HTTP endpoints. Keep the summary under 80 words, use short strings, include at most 12 high-value facts, and omit unsupported or empty items. Return concise JSON with keys: summary, facts, components, commands, configuration, apiDocumentation, dataFlow, tests, uncertainties.

FILE CONTENT:
${chunk}`;
}

function createReportPrompt(repository, tree, attributedSummaries) {
  return `Create a factual repository analysis from the metadata, file tree, and file analyses below.
Do not infer unsupported behavior. Deduplicate repeated facts and keep descriptions concise. Prefer source code, manifests, tests, examples, and configuration over claims found only in README files. Describe architecture as components and supported relationships, not prose. Preserve exact commands, identifiers, file paths, configuration keys, and environment variable names. For commands, preserve their working directory or owning manifest. For apiDocumentation, include only explicit Swagger/OpenAPI documentation URLs or paths; never list individual endpoints. Build repositoryStructure from meaningful directories visible in the file tree, with short evidence-based purposes. Prioritize high-value developer information; omit repetitive or empty details. Put missing or conflicting information in uncertainties.
Return JSON with exactly these top-level keys: ${ANALYSIS_FIELDS.join(', ')}. Values may be strings, arrays, or objects as appropriate.

REPOSITORY:
${JSON.stringify(repository)}

FILE TREE:
${JSON.stringify(tree).slice(0, 120000)}

FILE ANALYSES:
${JSON.stringify(attributedSummaries).slice(0, 500000)}`;
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

export function createGitHubFileFetcher({ request, token }) {
  return async function fetchFile(repository, path) {
    const url = `https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(repository.defaultBranch)}`;
    const response = await request(url, token, {
      accept: 'application/vnd.github.raw+json',
    });
    return response.text();
  };
}
