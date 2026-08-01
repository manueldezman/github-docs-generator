import { upstreamError } from './http.js';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'z-ai/glm-5.2';

export const AI_STAGE_CONFIG = Object.freeze({
  fileAnalysis: Object.freeze({
    maxTokens: 4096,
  }),
  repositoryReport: Object.freeze({
    maxTokens: 16384,
    stage: 'Repository report',
  }),
  documentation: Object.freeze({
    maxTokens: 16384,
    stage: 'Documentation generation',
    temperature: 0.3,
  }),
});

export async function generateText(prompt, options = {}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw upstreamError('NVIDIA AI access is not configured', 500);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.2,
          top_p: options.topP ?? 1,
          max_tokens: options.maxTokens || 4096,
          seed: options.seed ?? 42,
          stream: false,
        }),
      });
    } catch {
      if (attempt < 2) {
        await wait(400 * (2 ** attempt));
        continue;
      }
      throw upstreamError('NVIDIA AI is temporarily unreachable. Please try again.', 503);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
        await wait(retryDelay(response, attempt));
        continue;
      }
      const message = RETRYABLE_STATUSES.has(response.status)
        ? 'NVIDIA AI is temporarily unavailable after several attempts. Please try again.'
        : data?.error?.message || `NVIDIA AI request failed (${response.status})`;
      throw upstreamError(message, RETRYABLE_STATUSES.has(response.status) ? 503 : response.status);
    }

    const choice = data?.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (choice?.finish_reason === 'length') {
      const stage = options.stage || 'AI response';
      throw upstreamError(`${stage} exceeded its output limit.`, 422);
    }
    if (!text) {
      if (attempt < 2) {
        await wait(250 * (attempt + 1));
        continue;
      }
      throw upstreamError('GLM returned an empty response after several attempts.', 502);
    }
    return text;
  }

  throw upstreamError('GLM did not return a usable response.', 502);
}

export async function generateJson(prompt, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const strictPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return one complete JSON value only. Do not use markdown fences or commentary.`;
    const text = await generateText(strictPrompt, {
      ...options,
      temperature: attempt === 0 ? (options.temperature ?? 0.1) : 0,
    });
    try {
      return parseJsonResponse(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || upstreamError('GLM returned an invalid analysis result.', 502);
}

export function parseJsonResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw upstreamError('GLM returned an invalid analysis result.', 502);
  }

  const withoutFence = text
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [withoutFence];
  const firstObject = withoutFence.indexOf('{');
  const firstArray = withoutFence.indexOf('[');
  const starts = [firstObject, firstArray].filter(index => index >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const opener = withoutFence[start];
    const closer = opener === '{' ? '}' : ']';
    const end = withoutFence.lastIndexOf(closer);
    if (end > start) candidates.push(withoutFence.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
      } catch {
        // Try the next recoverable representation.
      }
    }
  }
  throw upstreamError('GLM returned an invalid analysis result.', 502);
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 3000);
  }
  return 400 * (2 ** attempt);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
