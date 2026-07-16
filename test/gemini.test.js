import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from '../api/lib/gemini.js';
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
