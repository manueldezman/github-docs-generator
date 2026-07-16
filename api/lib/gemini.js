import { upstreamError } from './http.js';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export async function callGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw upstreamError('Gemini is not configured', 500);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: options.maxOutputTokens || 4096,
              temperature: options.temperature ?? 0.2,
              ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
            },
          }),
        }
      );
    } catch {
      if (attempt < 2) {
        await wait(400 * (2 ** attempt));
        continue;
      }
      throw upstreamError('Gemini is temporarily unreachable. Please try again.', 503);
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
        ? 'Gemini is temporarily unavailable after several attempts. Please try again.'
        : data?.error?.message || `Gemini request failed (${response.status})`;
      throw upstreamError(message, RETRYABLE_STATUSES.has(response.status) ? 503 : response.status);
    }

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!text) {
      if (attempt < 2) {
        await wait(250 * (attempt + 1));
        continue;
      }
      throw upstreamError('Gemini returned an empty response after several attempts.', 502);
    }

    if (candidate.finishReason === 'MAX_TOKENS') {
      throw upstreamError('Gemini analysis exceeded its output limit. Try a smaller repository.', 422);
    }
    return text;
  }

  throw upstreamError('Gemini did not return a usable response.', 502);
}

export async function callGeminiJson(prompt, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const strictPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return one complete JSON value only. Do not use markdown fences or commentary.`;
    const text = await callGemini(strictPrompt, {
      ...options,
      responseMimeType: 'application/json',
      temperature: attempt === 0 ? (options.temperature ?? 0.1) : 0,
    });
    try {
      return parseJsonResponse(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || upstreamError('Gemini returned an invalid analysis result.', 502);
}

export function parseJsonResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw upstreamError('Gemini returned an invalid analysis result.', 502);
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
  throw upstreamError('Gemini returned an invalid analysis result.', 502);
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
