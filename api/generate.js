import { AI_STAGE_CONFIG, generateText } from './lib/ai.js';
import { createDocumentationPrompt, DOCUMENT_REQUESTS } from './lib/document.js';
import { errorStatus, handleMethod, safeError } from './lib/http.js';

export default async function handler(req, res) {
  if (!handleMethod(req, res)) return;

  const { repository, report, documentType = 'readme', coverage } = req.body || {};
  if (!repository?.fullName || !report || !DOCUMENT_REQUESTS[documentType]) {
    return res.status(400).json({ error: 'Missing or invalid repository analysis' });
  }

  try {
    const text = await generateText(
      createDocumentationPrompt({ repository, report, documentType, coverage }),
      AI_STAGE_CONFIG.documentation
    );
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(errorStatus(error, 500)).json({
      error: safeError(error, 'Unable to generate documentation'),
    });
  }
}
