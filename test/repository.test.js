import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  chunkText,
  exclusionReason,
  parseRepositoryUrl,
  selectFiles,
} from '../api/lib/repository.js';

test('accepts only canonical public GitHub repository URLs', () => {
  assert.deepEqual(parseRepositoryUrl('https://github.com/openai/openai-node'), {
    owner: 'openai',
    repo: 'openai-node',
    fullName: 'openai/openai-node',
  });
  assert.throws(() => parseRepositoryUrl('https://example.com/openai/openai-node'));
  assert.throws(() => parseRepositoryUrl('https://github.com/openai/openai-node/issues'));
});

test('excludes secrets, dependencies, binaries, lockfiles, and oversized files', () => {
  const excluded = [
    { path: '.env', type: 'blob', size: 10 },
    { path: 'node_modules/pkg/index.js', type: 'blob', size: 10 },
    { path: 'public/logo.png', type: 'blob', size: 10 },
    { path: 'package-lock.json', type: 'blob', size: 10 },
    { path: 'src/huge.ts', type: 'blob', size: LIMITS.maxFileBytes + 1 },
  ];
  excluded.forEach(file => assert.ok(exclusionReason(file)));
  assert.equal(exclusionReason({ path: 'src/index.ts', type: 'blob', size: 100 }), '');
});

test('prioritizes manifests and entry points and caps selection', () => {
  const tree = [
    { path: 'docs/notes.txt', type: 'blob', size: 10 },
    { path: 'src/index.ts', type: 'blob', size: 100 },
    { path: 'package.json', type: 'blob', size: 100 },
    ...Array.from({ length: 30 }, (_, index) => ({
      path: `src/module-${index}.ts`,
      type: 'blob',
      size: 100,
    })),
  ];
  const { selectedFiles } = selectFiles(tree);
  assert.equal(selectedFiles.length, LIMITS.maxSelectedFiles);
  assert.ok(selectedFiles.slice(0, 2).some(file => file.path === 'package.json'));
  assert.ok(selectedFiles.some(file => file.path === 'src/index.ts'));
});

test('chunks text without dropping content', () => {
  const input = 'abcdefghij';
  const chunks = chunkText(input, 3);
  assert.deepEqual(chunks, ['abc', 'def', 'ghi', 'j']);
  assert.equal(chunks.join(''), input);
});
