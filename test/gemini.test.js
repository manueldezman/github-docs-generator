import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callGemini,
  GEMINI_STAGE_CONFIG,
  parseJsonResponse,
} from '../api/lib/gemini.js';
import { errorStatus, upstreamError } from '../api/lib/http.js';

test('parses plain and markdown-fenced Gemini JSON', () => {
  assert.deepEqual(parseJsonResponse('{"summary":"ok"}'), { summary: 'ok' });
  assert.deepEqual(
    parseJsonResponse('```json\n{"summary":"ok"}\n```'),
    { summary: 'ok' }
  );
});

test('recovers JSON surrounded by model commentary and trailing commas', () => {
  assert.deepEqual(
    parseJsonResponse('Here is the result:\n{"facts":["one",],}\nDone.'),
    { facts: ['one'] }
  );
});

test('invalid or truncated JSON has a 502 upstream status', () => {
  assert.throws(
    () => parseJsonResponse('{"summary":'),
    error => error.statusCode === 502
  );
});

test('upstream statuses are preserved for API responses', () => {
  assert.equal(errorStatus(upstreamError('Unavailable', 503), 400), 503);
  assert.equal(errorStatus(new Error('Validation failed'), 400), 400);
});

test('Gemini requests include explicit output and thinking budgets', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let requestBody;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'complete' }] },
        }],
      }),
    };
  };

  try {
    await callGemini('test', {
      maxOutputTokens: 16384,
      thinkingBudget: 2048,
      stage: 'Documentation generation',
    });
    assert.equal(requestBody.generationConfig.maxOutputTokens, 16384);
    assert.equal(requestBody.generationConfig.thinkingConfig.thinkingBudget, 2048);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('production Gemini stages use the intended Flash budgets', () => {
  assert.deepEqual(GEMINI_STAGE_CONFIG.fileAnalysis, {
    maxOutputTokens: 4096,
    thinkingBudget: 0,
  });
  assert.deepEqual(GEMINI_STAGE_CONFIG.repositoryReport, {
    maxOutputTokens: 16384,
    thinkingBudget: 0,
    stage: 'Repository report',
  });
  assert.deepEqual(GEMINI_STAGE_CONFIG.documentation, {
    maxOutputTokens: 16384,
    thinkingBudget: 2048,
    stage: 'Documentation generation',
    temperature: 0.3,
  });
});

test('MAX_TOKENS errors identify the failed Gemini stage', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      candidates: [{
        finishReason: 'MAX_TOKENS',
        content: { parts: [{ text: '{"partial":true}' }] },
      }],
    }),
  });

  try {
    for (const stage of ['File analysis', 'Repository report', 'Documentation generation']) {
      await assert.rejects(
        callGemini('test', { stage }),
        error => error.statusCode === 422 && error.message === `${stage} exceeded its output limit.`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
