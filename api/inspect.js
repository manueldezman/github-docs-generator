import { errorStatus, handleMethod, safeError } from './lib/http.js';
import {
  LIMITS,
  githubRequest,
  parseRepositoryUrl,
  selectFiles,
} from './lib/repository.js';

export default async function handler(req, res) {
  if (!handleMethod(req, res)) return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GitHub access is not configured' });

  try {
    const identity = parseRepositoryUrl(req.body?.repositoryUrl);
    const apiBase = `https://api.github.com/repos/${identity.owner}/${identity.repo}`;
    const repositoryResponse = await githubRequest(apiBase, token);
    const metadata = await repositoryResponse.json();

    const treeResponse = await githubRequest(
      `${apiBase}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`,
      token
    );
    const treeData = await treeResponse.json();
    const rawTree = Array.isArray(treeData.tree) ? treeData.tree : [];
    const { eligible, selectedFiles, warnings } = selectFiles(rawTree);

    if (treeData.truncated) {
      warnings.push('GitHub truncated the recursive tree, so repository coverage is partial.');
    }
    if (eligible.length > LIMITS.maxTreeEntries) {
      warnings.push(`The returned file tree is limited to ${LIMITS.maxTreeEntries} entries.`);
    }
    if (!selectedFiles.length) {
      warnings.push('No analyzable text files were found.');
    }

    return res.status(200).json({
      repository: {
        owner: identity.owner,
        name: identity.repo,
        fullName: metadata.full_name,
        description: metadata.description || '',
        defaultBranch: metadata.default_branch,
        language: metadata.language || '',
        topics: metadata.topics || [],
        license: metadata.license?.name || '',
        stars: metadata.stargazers_count || 0,
        htmlUrl: metadata.html_url,
      },
      tree: eligible.slice(0, LIMITS.maxTreeEntries).map(file => ({
        path: file.path,
        size: file.size || 0,
        score: file.score,
      })),
      selectedFiles: selectedFiles.map(file => ({
        path: file.path,
        size: file.size || 0,
        sha: file.sha,
        reason: file.reason,
      })),
      warnings,
    });
  } catch (error) {
    const status = errorStatus(error, /not found/i.test(error.message) ? 404 : 400);
    return res.status(status).json({ error: safeError(error, 'Unable to inspect this repository') });
  }
}
