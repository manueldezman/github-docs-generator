/* ─── State ──────────────────────────────────────────── */
let selectedType = 'readme';

/* ─── Doc type labels ────────────────────────────────── */
const typeLabels = {
  readme:       'README',
  api:          'API reference',
  full:         'Full docs',
  contributing: 'Contributing',
  quickstart:   'Quickstart',
  changelog:    'Changelog',
};

/* ─── Prompts per doc type ───────────────────────────── */
const prompts = {
  readme:
    'Generate a comprehensive README.md: title, description, features, installation, usage with code examples, tech stack, and license.',
  api:
    'Generate a detailed API Reference: all public functions/endpoints with signature, description, parameters, return values, and usage examples.',
  full:
    'Generate complete documentation: overview, architecture, installation, configuration, API reference, usage examples, troubleshooting, and FAQ.',
  contributing:
    'Generate a CONTRIBUTING.md: dev setup, code style, branching strategy, PR process, testing instructions, and commit message format.',
  quickstart:
    'Generate a concise Quickstart Guide: prerequisites, install command, minimal config, and a working hello-world example.',
  changelog:
    'Generate a CHANGELOG.md using Keep a Changelog format with entries for Added, Changed, Deprecated, Removed, Fixed, and Security.',
};

/* ─── Doc type selector ──────────────────────────────── */
document.querySelectorAll('.type').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
  });
});

/* ─── Fetch repo data from GitHub public API ─────────── */
async function fetchRepo(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#\s]+)/);
  if (!match) throw new Error('Invalid GitHub URL. Use: https://github.com/owner/repo');

  const [, owner, repo] = match;
  const base = `https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, '')}`;

  const [repoRes, readmeRes, contentsRes] = await Promise.all([
    fetch(base),
    fetch(`${base}/readme`),
    fetch(`${base}/contents`),
  ]);

  if (!repoRes.ok) throw new Error(`Repo not found or private (${repoRes.status})`);

  const repoData = await repoRes.json();

  let readme = '';
  if (readmeRes.ok) {
    const rm = await readmeRes.json();
    try { readme = atob(rm.content.replace(/\n/g, '')); } catch (e) {}
  }

  let files = [];
  if (contentsRes.ok) {
    const contents = await contentsRes.json();
    files = Array.isArray(contents)
      ? contents.map(f => `${f.type === 'dir' ? '[dir]' : '[file]'} ${f.name}`)
      : [];
  }

  return { repoData, readme, files };
}

/* ─── Build context string for the AI ───────────────── */
function buildContext(repoData, readme, files) {
  return `Repository: ${repoData.full_name}
Description: ${repoData.description || 'N/A'}
Language: ${repoData.language || 'N/A'}
Stars: ${repoData.stargazers_count ?? 'N/A'}
Topics: ${(repoData.topics || []).join(', ') || 'N/A'}
License: ${repoData.license?.name || 'N/A'}

File structure:
${files.join('\n') || 'N/A'}

Existing README:
${readme ? readme.slice(0, 3000) : 'None found'}`.trim();
}

/* ─── Call backend proxy ─────────────────────────────── */
async function callAPI(context, prompt) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, prompt }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data.text;
}

/* ─── Main generate function ─────────────────────────── */
async function generate() {
  const url      = document.getElementById('repo-url').value.trim();
  const errEl    = document.getElementById('error-msg');
  const btn      = document.getElementById('gen-btn');
  const output   = document.getElementById('output');

  errEl.textContent = '';

  if (!url) {
    errEl.textContent = 'Please enter a GitHub repo URL.';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Fetching repo...';
  output.style.display = 'none';

  try {
    const { repoData, readme, files } = await fetchRepo(url);

    btn.innerHTML = '<span class="spinner"></span>Generating docs...';

    const context = buildContext(repoData, readme, files);
    const text    = await callAPI(context, prompts[selectedType]);

    document.getElementById('output-tag').textContent = typeLabels[selectedType];
    document.getElementById('doc-out').textContent    = text;
    output.style.display = 'block';
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    errEl.textContent = e.message || 'Something went wrong. Please try again.';
  } finally {
    btn.disabled     = false;
    btn.textContent  = 'Generate docs';
  }
}

/* ─── Copy to clipboard ──────────────────────────────── */
function copyDocs() {
  const text = document.getElementById('doc-out').textContent;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy markdown';
      btn.classList.remove('copied');
    }, 2000);
  });
}
