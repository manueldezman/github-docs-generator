/* ─── State ──────────────────────────────────────────── */
let selectedType = 'readme';

/* ─── Doc type labels ────────────────────────────────── */
const typeLabels = {
  readme:     'README',
  quickstart: 'Quickstart',
};

/* ─── Prompts per doc type ───────────────────────────── */
const prompts = {
  readme:
  'Generate a comprehensive README.md with the following sections in this order: ' +
  'project title, short description, features list, tech stack, prerequisites, ' +
  'installation & quick start (with code examples), repository structure (shown as a file tree using a markdown code block), ' +
  'architecture overview, example usage, testing instructions, license. ' +
  'Only include an environment variables section (shown as a table) if the project actually has environment variables based on the repo data. ' +
  'Do not include contributing guidelines or versioning sections. ' +
  'Make it clear, concise and developer-friendly.',
  quickstart:
    'Generate a concise Quickstart Guide with the following sections: ' +
    'prerequisites, installation (one command where possible), minimal configuration, ' +
    'and a working hello-world or minimal usage example. ' +
    'Keep it under one page. Focus only on getting the developer running as fast as possible.',
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
  const base = 'https://api.github.com/repos/' + owner + '/' + repo.replace(/\.git$/, '');

  const [repoRes, readmeRes, contentsRes] = await Promise.all([
    fetch(base),
    fetch(base + '/readme'),
    fetch(base + '/contents'),
  ]);

  if (!repoRes.ok) throw new Error('Repo not found or private (' + repoRes.status + ')');

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
      ? contents.map(function(f) {
          return (f.type === 'dir' ? '[dir]' : '[file]') + ' ' + f.name;
        })
      : [];
  }

  return { repoData, readme, files };
}

/* ─── Build context string for the AI ───────────────── */
function buildContext(repoData, readme, files) {
  return 'Repository: ' + repoData.full_name + '\n' +
    'Description: ' + (repoData.description || 'N/A') + '\n' +
    'Language: ' + (repoData.language || 'N/A') + '\n' +
    'Stars: ' + (repoData.stargazers_count != null ? repoData.stargazers_count : 'N/A') + '\n' +
    'Topics: ' + (repoData.topics && repoData.topics.length ? repoData.topics.join(', ') : 'N/A') + '\n' +
    'License: ' + (repoData.license && repoData.license.name ? repoData.license.name : 'N/A') + '\n\n' +
    'File structure:\n' + (files.length ? files.join('\n') : 'N/A') + '\n\n' +
    'Existing README:\n' + (readme ? readme.slice(0, 3000) : 'None found');
}

/* ─── Call backend proxy ─────────────────────────────── */
async function callAPI(context, prompt) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: context, prompt: prompt }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error ' + res.status);
  return data.text;
}

/* ─── Main generate function ─────────────────────────── */
async function generate() {
  const url    = document.getElementById('repo-url').value.trim();
  const errEl  = document.getElementById('error-msg');
  const btn    = document.getElementById('gen-btn');
  const output = document.getElementById('output');

  errEl.textContent = '';

  if (!url) {
    errEl.textContent = 'Please enter a GitHub repo URL.';
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span>Fetching repo...';
  output.style.display = 'none';

  try {
    const { repoData, readme, files } = await fetchRepo(url);

    btn.innerHTML = '<span class="spinner"></span>Generating...';

    const context = buildContext(repoData, readme, files);
    const text    = await callAPI(context, prompts[selectedType]);

    document.getElementById('output-tag').textContent = typeLabels[selectedType];
    document.getElementById('doc-out').textContent    = text;
    output.style.display = 'block';
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    errEl.textContent = e.message || 'Something went wrong. Please try again.';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Generate';
  }
}

/* ─── Copy to clipboard ──────────────────────────────── */
function copyDocs() {
  const text = document.getElementById('doc-out').textContent;

  navigator.clipboard.writeText(text).then(function() {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function() {
      btn.textContent = 'Copy markdown';
      btn.classList.remove('copied');
    }, 2000);
  });
}