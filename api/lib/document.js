export const DOCUMENT_REQUESTS = Object.freeze({
  readme: `Generate a focused, evidence-based README.md using this structure when supported:
1. Project title and a concise description.
2. Features as short bullet points.
3. Architecture with a Mermaid flowchart of discovered components and relationships, followed by short component bullets. Omit the diagram if fewer than two supported components or no supported relationship exists.
4. Data Flow as a Mermaid flowchart or sequenceDiagram when the report supports a meaningful flow. Do not duplicate the architecture diagram.
5. Prerequisites, installation, configuration, and usage with only the essential runnable commands. Never produce an exhaustive command inventory. Show the correct working directory with cd or use a workspace-qualified command.
6. Repository Structure as a fenced text tree using tree glyphs such as ├──, └──, and │. Start with the repository name, include meaningful directories and key entry files, and add concise inline comments. Never render this section as prose bullets or a table.
7. API Reference only when apiDocumentation contains an explicitly discovered Swagger/OpenAPI documentation path or URL. Use a Markdown link only for an absolute URL; otherwise show the discovered route as inline code. Include one concise reference and never enumerate individual endpoints.
8. Testing and deployment only when supported.

Do not claim that the repository is public, private, production-ready, secure, or complete unless repository metadata explicitly establishes it. Do not include contributing or versioning sections. Omit unsupported sections.`,
  quickstart: `Generate a concise Quickstart Guide focused on prerequisites, installation, minimal configuration, and the smallest supported usage example. Include only essential commands established by the report, with the correct working directory. Do not include architecture diagrams, repository inventories, endpoint lists, or exhaustive command lists. Keep it under one page.`,
});

export function createDocumentationPrompt({ repository, report, documentType, coverage }) {
  const request = DOCUMENT_REQUESTS[documentType];
  if (!request) throw new Error('Unsupported document type');

  return `You are writing developer documentation from a structured repository analysis.
Use only facts supported by the report. Never invent commands, APIs, environment variables, examples, architecture, relationships, or behavior. If coverage is partial, avoid claims about unanalyzed areas. Treat existing README-derived facts as secondary evidence.

For Mermaid diagrams, use GitHub-compatible syntax with simple node identifiers and plain text labels. Do not use click actions, links, HTML labels, custom initialization directives, custom themes, or styling directives.

Repository metadata:
${JSON.stringify(repository)}

Analysis coverage:
${JSON.stringify(coverage || {})}

Structured report:
${JSON.stringify(report)}

Document request:
${request}

Return only clean markdown with no preamble or explanation.`;
}
