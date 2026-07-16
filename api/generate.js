import { callGemini } from './lib/gemini.js';
import { handleMethod, safeError } from './lib/http.js';

const prompts = {
  readme: `Generate a comprehensive README.md with useful, evidence-based sections for this specific project. Prefer: title, description, features, architecture, tech stack, prerequisites, installation, configuration, usage, repository structure, testing, deployment, and license. Omit any section not supported by the report. Do not include contributing or versioning sections.`,
  quickstart: `Generate a concise Quickstart Guide focused on prerequisites, installation, minimal configuration, and the smallest supported usage example. Include only commands and behavior established by the report. Keep it under one page.`,
};

export default async function handler(req, res) {
  if (!handleMethod(req, res)) return;

  const { repository, report, documentType = 'readme', coverage } = req.body || {};
  if (!repository?.fullName || !report || !prompts[documentType]) {
    return res.status(400).json({ error: 'Missing or invalid repository analysis' });
  }

  try {
    const text = await callGemini(
      `You are writing developer documentation from a structured repository analysis.
Use only facts supported by the report. Never invent commands, APIs, environment variables, examples, architecture, or behavior. If coverage is partial, avoid claims about unanalyzed areas. Treat existing README-derived facts as secondary evidence.

Repository metadata:
${JSON.stringify(repository)}

Analysis coverage:
${JSON.stringify(coverage || {})}

Structured report:
${JSON.stringify(report)}

Document request:
${prompts[documentType]}

Return only clean markdown with no preamble or explanation.`,
      { maxOutputTokens: 8192, temperature: 0.3 }
    );
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: safeError(error, 'Unable to generate documentation') });
  }
}
