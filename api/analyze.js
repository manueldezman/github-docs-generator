import { AI_STAGE_CONFIG, generateJson } from './lib/ai.js';
import { errorStatus, handleMethod, safeError } from './lib/http.js';
import {
  createGitHubFileFetcher,
  createRepositoryAnalyzer,
} from './lib/analysis.js';
import { githubRequest } from './lib/repository.js';

export default async function handler(req, res) {
  if (!handleMethod(req, res)) return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GitHub access is not configured' });

  try {
    const analyzeRepository = createRepositoryAnalyzer({
      fetchFile: createGitHubFileFetcher({ request: githubRequest, token }),
      analyzeJson: (prompt, options) => generateJson(prompt, {
        ...AI_STAGE_CONFIG[options.kind],
        ...(options.stage ? { stage: options.stage } : {}),
      }),
    });
    return res.status(200).json(await analyzeRepository(req.body));
  } catch (error) {
    return res.status(errorStatus(error, 400)).json({
      error: safeError(error, 'Unable to analyze this repository'),
    });
  }
}
