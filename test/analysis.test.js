import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRepositoryAnalyzer,
  validateAnalysisRequest,
} from '../api/lib/analysis.js';

const repository = {
  owner: 'openai',
  name: 'example',
  defaultBranch: 'main',
};

test('validates analysis input at the application boundary', () => {
  assert.throws(() => validateAnalysisRequest({}), /Missing repository identity/);
  assert.throws(
    () => validateAnalysisRequest({ repository, selectedFiles: [] }),
    /No files selected/
  );
  assert.deepEqual(
    validateAnalysisRequest({
      repository,
      selectedFiles: [{ path: 'src/index.js', size: 10 }],
    }).repository,
    repository
  );
});

test('analysis policy works with injected repository and AI adapters', async () => {
  const calls = [];
  const analyzeRepository = createRepositoryAnalyzer({
    fetchFile: async (_repository, path) => `export const source = "${path}";`,
    analyzeJson: async (prompt, options) => {
      calls.push({ prompt, options });
      return options.kind === 'repositoryReport'
        ? { purpose: 'test report' }
        : { summary: 'test file' };
    },
  });

  const result = await analyzeRepository({
    repository,
    selectedFiles: [{ path: 'src/index.js', size: 10 }],
    tree: [{ path: 'src/index.js' }],
  });

  assert.deepEqual(result.report, { purpose: 'test report' });
  assert.deepEqual(result.analyzedFiles, [{ path: 'src/index.js', bytes: 37 }]);
  assert.deepEqual(result.skippedFiles, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.kind, 'fileAnalysis');
  assert.equal(calls[1].options.kind, 'repositoryReport');
});

test('skips unsafe files without invoking infrastructure dependencies', async () => {
  let fetchCount = 0;
  const analyzeRepository = createRepositoryAnalyzer({
    fetchFile: async () => {
      fetchCount += 1;
      return 'valid';
    },
    analyzeJson: async (_prompt, options) => (
      options.kind === 'repositoryReport' ? { purpose: 'test' } : { summary: 'test' }
    ),
  });

  const result = await analyzeRepository({
    repository,
    selectedFiles: [
      { path: '../secret.js', size: 10 },
      { path: 'src/index.js', size: 5 },
    ],
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(result.skippedFiles, [{ path: '../secret.js', reason: 'invalid path' }]);
  assert.equal(result.warnings.length, 1);
});
