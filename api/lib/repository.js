export const LIMITS = {
  maxSelectedFiles: 20,
  maxFileBytes: 250 * 1024,
  maxTotalBytes: 750 * 1024,
  chunkCharacters: 20000,
  maxTreeEntries: 2000,
};

const BINARY_EXTENSIONS = new Set([
  '7z', 'avi', 'bin', 'bmp', 'class', 'dll', 'dmg', 'doc', 'docx', 'eot',
  'exe', 'gif', 'gz', 'ico', 'jar', 'jpeg', 'jpg', 'lockb', 'mov', 'mp3',
  'mp4', 'otf', 'pdf', 'png', 'ppt', 'pptx', 'pyc', 'rar', 'so', 'tar',
  'tiff', 'ttf', 'wav', 'webm', 'webp', 'woff', 'woff2', 'xls', 'xlsx', 'zip',
]);

const SOURCE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'ex', 'exs', 'go', 'h', 'hpp', 'html',
  'java', 'js', 'jsx', 'kt', 'kts', 'php', 'py', 'rb', 'rs', 'scala',
  'scss', 'sh', 'sol', 'sql', 'svelte', 'swift', 'ts', 'tsx', 'vue',
]);

const EXCLUDED_SEGMENTS = new Set([
  '.git', '.next', '.nuxt', '.output', '.turbo', '.vercel', 'build',
  'coverage', 'dist', 'generated', 'node_modules', 'out', 'target', 'vendor',
]);

const SECRET_NAMES = [
  '.env', '.env.local', '.env.production', '.env.development',
  'id_rsa', 'id_ed25519', 'credentials.json', 'service-account.json',
];

const LOCKFILE_NAMES = new Set([
  'bun.lock', 'bun.lockb', 'composer.lock', 'cargo.lock', 'gemfile.lock',
  'package-lock.json', 'pnpm-lock.yaml', 'poetry.lock', 'yarn.lock',
]);

const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt', 'cargo.toml',
  'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'gemfile',
  'composer.json', 'mix.exs', 'deno.json', 'dockerfile', 'docker-compose.yml',
  'docker-compose.yaml', 'vercel.json', 'netlify.toml',
]);

function extension(path) {
  const name = path.split('/').pop() || '';
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

export function parseRepositoryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid GitHub URL. Use https://github.com/owner/repository');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only public github.com repository URLs are supported');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('Use a repository URL such as https://github.com/owner/repository');
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  const validPart = /^[A-Za-z0-9_.-]+$/;
  if (!validPart.test(owner) || !validPart.test(repo)) {
    throw new Error('The GitHub owner or repository name is invalid');
  }

  return { owner, repo, fullName: `${owner}/${repo}` };
}

export function exclusionReason(file) {
  const path = String(file.path || '').replace(/^\/+/, '');
  const lower = path.toLowerCase();
  const name = lower.split('/').pop() || '';
  const segments = lower.split('/');

  if (!path || file.type !== 'blob') return 'not a file';
  if (segments.some(segment => EXCLUDED_SEGMENTS.has(segment))) return 'generated or dependency directory';
  if (SECRET_NAMES.some(secret => name === secret || name.startsWith(`${secret}.`))) return 'possible secret file';
  if (LOCKFILE_NAMES.has(name)) return 'lockfile';
  if (BINARY_EXTENSIONS.has(extension(lower))) return 'binary file';
  if (name.endsWith('.min.js') || name.endsWith('.min.css') || name.includes('.generated.')) return 'generated or minified file';
  if (file.size > LIMITS.maxFileBytes) return 'file exceeds 250 KB';
  return '';
}

export function scoreFile(file) {
  const path = file.path.toLowerCase();
  const name = path.split('/').pop();
  const ext = extension(path);
  let score = 0;
  const reasons = [];

  if (MANIFEST_NAMES.has(name)) {
    score += 100;
    reasons.push('project manifest or deployment configuration');
  }
  if (/^(readme|architecture|getting-started|quickstart)(\.[^.]+)?$/i.test(name)) {
    score += 75;
    reasons.push('project documentation');
  }
  if (/^(main|index|app|server|cli|mod|lib)\.(js|jsx|ts|tsx|py|go|rs|java|rb|php|ex|exs|sol)$/i.test(name)) {
    score += 70;
    reasons.push('likely application entry point');
  }
  if (/(^|\/)(src|app|lib|packages|apps)\//.test(path) && SOURCE_EXTENSIONS.has(ext)) {
    score += 42;
    reasons.push('primary source code');
  } else if (SOURCE_EXTENSIONS.has(ext)) {
    score += 24;
    reasons.push('source code');
  }
  if (/(^|\/)(test|tests|spec|__tests__)\//.test(path) || /\.(test|spec)\.[^.]+$/.test(path)) {
    score += 35;
    reasons.push('tests describe expected behavior');
  }
  if (/(^|\/)(examples?|samples?|demo)\//.test(path)) {
    score += 38;
    reasons.push('usage example');
  }
  if (/(config|settings|schema|routes?|api|controller|service)/.test(name)) {
    score += 22;
    reasons.push('configuration or public behavior');
  }
  if (path.split('/').length <= 2) score += 8;
  score -= Math.min(path.split('/').length * 2, 16);
  score -= Math.min(Math.floor((file.size || 0) / 50000), 5);

  return {
    ...file,
    score,
    reason: reasons.slice(0, 2).join('; ') || 'representative repository file',
  };
}

export function selectFiles(tree) {
  const warnings = [];
  const eligible = [];
  let excludedCount = 0;

  for (const file of tree) {
    const reason = exclusionReason(file);
    if (reason) {
      excludedCount += 1;
      continue;
    }
    eligible.push(scoreFile(file));
  }

  eligible.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selectedFiles = eligible.slice(0, LIMITS.maxSelectedFiles);

  if (eligible.length > selectedFiles.length) {
    warnings.push(`Selected ${selectedFiles.length} of ${eligible.length} eligible files using relevance scoring.`);
  }
  if (excludedCount) {
    warnings.push(`Excluded ${excludedCount} binary, generated, dependency, oversized, lock, or secret files.`);
  }

  return { eligible, selectedFiles, warnings };
}

export function chunkText(text, size = LIMITS.chunkCharacters) {
  const chunks = [];
  for (let start = 0; start < text.length; start += size) {
    chunks.push(text.slice(start, start + size));
  }
  return chunks.length ? chunks : [''];
}

export function githubHeaders(token, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'User-Agent': 'github-docs-generator',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders(token, options.accept),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `GitHub request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data.message) message = data.message;
    } catch {
      // Keep the safe generic message.
    }
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      message = 'GitHub API rate limit reached. Try again after the limit resets.';
    }
    throw new Error(message);
  }
  return response;
}

export function encodeGitHubPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
