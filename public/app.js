/* ─── State ──────────────────────────────────────────── */
let selectedType = 'readme';

/* ─── Doc type labels ────────────────────────────────── */
const typeLabels = {
  readme:     'README',
  quickstart: 'Quickstart',
};

/* ─── Doc type selector ──────────────────────────────── */
document.querySelectorAll('.type').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
  });
});

/* ─── Call a staged backend endpoint ─────────────────── */
async function callAPI(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
  if (!res.ok) throw new Error(data.error || 'Server error ' + res.status);
  return data;
}

function setProgress(message) {
  const btn = document.getElementById('gen-btn');
  const progress = document.getElementById('progress');
  btn.innerHTML = '<span class="spinner"></span>' + message;
  progress.textContent = message;
  progress.style.display = 'block';
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
  output.style.display = 'none';
  document.getElementById('analysis-summary').style.display = 'none';

  try {
    setProgress('Inspecting repository...');
    const inspection = await callAPI('/api/inspect', { repositoryUrl: url });

    setProgress('Analyzing selected files...');
    const analysis = await callAPI('/api/analyze', {
      repository: inspection.repository,
      tree: inspection.tree,
      selectedFiles: inspection.selectedFiles,
    });

    setProgress('Generating documentation...');
    const generated = await callAPI('/api/generate', {
      repository: inspection.repository,
      report: analysis.report,
      documentType: selectedType,
      coverage: {
        inspectedFiles: inspection.tree.length,
        selectedFiles: inspection.selectedFiles.length,
        analyzedFiles: analysis.analyzedFiles.length,
        skippedFiles: analysis.skippedFiles.length,
        warnings: [...inspection.warnings, ...analysis.warnings],
      },
    });

    document.getElementById('output-tag').textContent = typeLabels[selectedType];
    document.getElementById('doc-out').textContent = generated.text;
    const summary = document.getElementById('analysis-summary');
    summary.textContent =
      'Inspected ' + inspection.tree.length + ' files · Selected ' +
      inspection.selectedFiles.length + ' · Analyzed ' + analysis.analyzedFiles.length +
      (analysis.skippedFiles.length ? ' · Skipped ' + analysis.skippedFiles.length : '');
    summary.title = [...inspection.warnings, ...analysis.warnings].join('\n');
    summary.style.display = 'block';
    output.style.display = 'block';
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    errEl.textContent = e.message || 'Something went wrong. Please try again.';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Generate';
    document.getElementById('progress').style.display = 'none';
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
