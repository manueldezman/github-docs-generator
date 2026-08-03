import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocumentationPrompt,
  DOCUMENT_REQUESTS,
} from '../api/lib/document.js';

const repository = { fullName: 'owner/project', name: 'project' };

test('README policy requests diagrams, a tree, and a discovered API docs link', () => {
  const prompt = createDocumentationPrompt({
    repository,
    report: { apiDocumentation: ['/api-docs'] },
    documentType: 'readme',
    coverage: { analyzedFiles: 10 },
  });

  assert.match(prompt, /Mermaid flowchart/);
  assert.match(prompt, /fenced text tree/);
  assert.match(prompt, /apiDocumentation/);
  assert.match(prompt, /Markdown link only for an absolute URL/);
  assert.match(prompt, /never enumerate individual endpoints/i);
  assert.match(prompt, /only the essential runnable commands/i);
  assert.match(prompt, /Do not claim that the repository is public, private/);
});

test('Quickstart policy excludes diagrams and repository inventories', () => {
  assert.match(DOCUMENT_REQUESTS.quickstart, /Do not include architecture diagrams/);
  assert.match(DOCUMENT_REQUESTS.quickstart, /smallest supported usage example/);
});

test('document policy rejects unsupported document types', () => {
  assert.throws(
    () => createDocumentationPrompt({ repository, report: {}, documentType: 'api' }),
    /Unsupported document type/
  );
});
