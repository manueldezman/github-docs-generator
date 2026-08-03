import { marked } from 'https://cdn.jsdelivr.net/npm/marked@18.0.7/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.es.mjs';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs';

let diagramSequence = 0;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  theme: 'neutral',
  maxTextSize: 50000,
  secure: ['securityLevel', 'startOnLoad', 'maxTextSize'],
});

export async function renderMarkdownPreview(markdown, target) {
  const source = String(markdown || '').replace(/^[\u200B-\u200F\uFEFF]/, '');
  const rendered = marked.parse(source, { gfm: true });
  target.innerHTML = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'iframe', 'object', 'style'],
    FORBID_ATTR: ['style'],
  });

  const diagrams = [...target.querySelectorAll('pre > code.language-mermaid')];
  await Promise.all(diagrams.map(renderDiagram));
}

async function renderDiagram(code) {
  const source = code.textContent.trim();
  const sourceBlock = code.parentElement;
  if (!source || source.length > 50000 || /%%\s*\{\s*init\s*:/i.test(source) || /^\s*click\s+/im.test(source)) {
    sourceBlock.classList.add('diagram-source');
    sourceBlock.title = 'This diagram was left as source because it contains unsupported directives.';
    return;
  }

  try {
    const id = `readme-diagram-${diagramSequence++}`;
    const { svg } = await mermaid.render(id, source);
    const diagram = document.createElement('div');
    diagram.className = 'mermaid-preview';
    diagram.innerHTML = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_ATTR: ['style'],
    });
    sourceBlock.replaceWith(diagram);
  } catch {
    sourceBlock.classList.add('diagram-source');
    sourceBlock.title = 'Mermaid could not render this diagram. The source is shown instead.';
  }
}
