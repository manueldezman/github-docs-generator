let selectedType = 'readme';

const typeLabels = {
  readme: 'README.md',
  quickstart: 'QUICKSTART.md',
};

const typeButtons = document.querySelectorAll('.type');
const repoInput = document.getElementById('repo-url');
const generateButton = document.getElementById('gen-btn');

typeButtons.forEach(button => {
  button.addEventListener('click', () => {
    typeButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    selectedType = button.dataset.type;
    document.getElementById('output-tag').textContent = typeLabels[selectedType];
    updateTerminal('Ready for a repository');
  });
});

repoInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !generateButton.disabled) generate();
});

async function callAPI(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
  if (!response.ok) throw new Error(data.error || `Server error ${response.status}`);
  return data;
}

function updateTerminal(message) {
  const mode = selectedType === 'readme' ? '--readme' : '--quickstart';
  document.getElementById('terminal-command').textContent = `docs.from.code ${mode}`;
  document.getElementById('progress-text').textContent = message;
}

function setOutputStatus(message, isError = false) {
  const placeholder = document.getElementById('output-placeholder');
  document.getElementById('output-status').textContent = message;
  placeholder.classList.toggle('is-error', isError);
  placeholder.setAttribute('role', isError ? 'alert' : 'status');
  placeholder.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  placeholder.style.display = 'flex';
  document.getElementById('doc-out').style.display = 'none';
}

function setStage(id, state, value) {
  const stage = document.getElementById(id);
  stage.className = `stage-cell ${state || ''}`.trim();
  stage.querySelector('b').textContent = value;
}

function resetWorkspace() {
  setStage('stage-tree', '', '—');
  setStage('stage-code', '', '—');
  setStage('stage-docs', '', '—');
  document.getElementById('file-count').textContent = '0 / 20';
  document.getElementById('file-tree').innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'empty-tree';
  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.textContent = '□';
  const text = document.createElement('p');
  text.textContent = 'Scanning for relevant source files...';
  empty.append(icon, text);
  document.getElementById('file-tree').appendChild(empty);

  document.getElementById('doc-out').textContent = '';
  document.getElementById('copy-btn').disabled = true;
  document.getElementById('analysis-summary').style.display = 'none';
  setOutputStatus('Waiting for repository analysis...');
}

function makeTree(paths) {
  const root = { name: '.', directory: true, children: new Map() };
  paths.forEach(path => {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      if (!current.children.has(part)) {
        const directory = index < parts.length - 1;
        current.children.set(part, {
          name: part,
          directory,
          children: directory ? new Map() : null,
        });
      }
      current = current.children.get(part);
    });
  });
  return root;
}

function renderTreeList(nodes) {
  const list = document.createElement('ul');
  list.className = 'tree-list';
  const sorted = [...nodes].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach(node => {
    const item = document.createElement('li');
    item.className = 'tree-item';
    const row = document.createElement('div');
    row.className = `tree-row ${node.directory ? 'folder' : 'file'}`;
    if (/^readme/i.test(node.name)) row.classList.add('file-readme');

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = node.directory ? '□' : fileIcon(node.name);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = node.name;
    name.title = node.name;
    row.append(icon, name);
    item.appendChild(row);

    if (node.directory && node.children.size) {
      item.appendChild(renderTreeList(node.children.values()));
    }
    list.appendChild(item);
  });
  return list;
}

function fileIcon(name) {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (['js', 'jsx', 'ts', 'tsx', 'json'].includes(extension)) return '{}';
  if (['md', 'mdx'].includes(extension)) return 'M↓';
  if (['test', 'spec'].some(word => name.toLowerCase().includes(word))) return '◇';
  return '▤';
}

function renderSelectedFiles(files) {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  const tree = makeTree(files.map(file => file.path));
  container.appendChild(renderTreeList([tree]));
  document.getElementById('file-count').textContent = `${files.length} / 20`;
}

async function generate() {
  const url = repoInput.value.trim();
  const buttonLabel = generateButton.querySelector('.button-label');

  if (!url) {
    setOutputStatus('Error: Enter a public GitHub repository URL.', true);
    repoInput.focus();
    return;
  }

  generateButton.disabled = true;
  buttonLabel.textContent = 'Analyzing';
  resetWorkspace();

  try {
    setStage('stage-tree', 'active', '');
    updateTerminal('Inspecting repository structure...');
    setOutputStatus('Mapping repository structure...');
    const inspection = await callAPI('/api/inspect', { repositoryUrl: url });

    renderSelectedFiles(inspection.selectedFiles);
    setStage('stage-tree', 'done', '✓');
    setStage('stage-code', 'active', '');
    updateTerminal(`${inspection.selectedFiles.length} relevant files selected`);
    setOutputStatus('Analyzing architecture...');

    const analysis = await callAPI('/api/analyze', {
      repository: inspection.repository,
      tree: inspection.tree,
      selectedFiles: inspection.selectedFiles,
    });

    setStage('stage-code', 'done', `${analysis.analyzedFiles.length}/${inspection.selectedFiles.length}`);
    setStage('stage-docs', 'active', '');
    updateTerminal(`Understood ${analysis.analyzedFiles.length} files. Writing documentation...`);
    setOutputStatus(`Writing ${typeLabels[selectedType]}...`);

    const warnings = [...inspection.warnings, ...analysis.warnings];
    const generated = await callAPI('/api/generate', {
      repository: inspection.repository,
      report: analysis.report,
      documentType: selectedType,
      coverage: {
        inspectedFiles: inspection.tree.length,
        selectedFiles: inspection.selectedFiles.length,
        analyzedFiles: analysis.analyzedFiles.length,
        skippedFiles: analysis.skippedFiles.length,
        warnings,
      },
    });

    setStage('stage-docs', 'done', '✓');
    updateTerminal(`${typeLabels[selectedType]} generated from ${analysis.analyzedFiles.length} files`);
    document.getElementById('output-placeholder').style.display = 'none';
    const output = document.getElementById('doc-out');
    output.textContent = generated.text;
    output.style.display = 'block';
    document.getElementById('copy-btn').disabled = false;

    const summary = document.getElementById('analysis-summary');
    summary.textContent = `${inspection.tree.length} inspected · ${inspection.selectedFiles.length} selected · ${analysis.analyzedFiles.length} analyzed` +
      (analysis.skippedFiles.length ? ` · ${analysis.skippedFiles.length} skipped` : '');
    summary.title = warnings.join('\n');
    summary.style.display = 'block';
  } catch (caught) {
    const active = document.querySelector('.stage-cell.active');
    if (active) {
      active.classList.remove('active');
      active.classList.add('error-stage');
      active.querySelector('b').textContent = '!';
    }
    const message = caught.message || 'Something went wrong. Please try again.';
    updateTerminal('Generation stopped');
    setOutputStatus(`Error: ${message}`, true);
  } finally {
    generateButton.disabled = false;
    buttonLabel.textContent = 'Generate docs';
  }
}

async function copyDocs() {
  const text = document.getElementById('doc-out').textContent;
  if (!text) return;
  const button = document.getElementById('copy-btn');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = 'Copy';
      button.classList.remove('copied');
    }, 2000);
    setTimeout(openStarModal, 350);
  } catch {
    button.textContent = 'Copy failed';
  }
}

function openStarModal() {
  const modal = document.getElementById('star-modal');
  if (!modal.open) {
    modal.showModal();
    document.getElementById('star-action').focus();
  }
}

function closeStarModal() {
  const modal = document.getElementById('star-modal');
  if (modal.open) modal.close();
}

document.getElementById('star-modal').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeStarModal();
});
