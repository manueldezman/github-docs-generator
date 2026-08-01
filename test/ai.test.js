import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_STAGE_CONFIG,
  generateText,
  parseJsonResponse,
} from '../api/lib/ai.js';
import { errorStatus, upstreamError } from '../api/lib/http.js';

test('parses plain and markdown-fenced GLM JSON', () => {
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

test('NVIDIA requests use GLM 5.2 and explicit generation settings', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NVIDIA_API_KEY;
  let requestUrl;
  let requestOptions;
  process.env.NVIDIA_API_KEY = 'test-key';
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'complete' },
        }],
      }),
    };
  };

  try {
    await generateText('test', {
      maxTokens: 16384,
      stage: 'Documentation generation',
    });
    const body = JSON.parse(requestOptions.body);
    assert.equal(requestUrl, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(requestOptions.headers.Authorization, 'Bearer test-key');
    assert.equal(body.model, 'z-ai/glm-5.2');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'test' }]);
    assert.equal(body.max_tokens, 16384);
    assert.equal(body.top_p, 1);
    assert.equal(body.seed, 42);
    assert.equal(body.stream, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
  }
});

test('production stages use bounded GLM output limits', () => {
  assert.deepEqual(AI_STAGE_CONFIG.fileAnalysis, {
    maxTokens: 4096,
  });
  assert.deepEqual(AI_STAGE_CONFIG.repositoryReport, {
    maxTokens: 16384,
    stage: 'Repository report',
  });
  assert.deepEqual(AI_STAGE_CONFIG.documentation, {
    maxTokens: 16384,
    stage: 'Documentation generation',
    temperature: 0.3,
  });
});

test('length errors identify the failed AI stage', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = 'test-key';
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      choices: [{
        finish_reason: 'length',
        message: { content: '{"partial":true}' },
      }],
    }),
  });

  try {
    for (const stage of ['File analysis', 'Repository report', 'Documentation generation']) {
      await assert.rejects(
        generateText('test', { stage }),
        error => error.statusCode === 422 && error.message === `${stage} exceeded its output limit.`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
  }
});
