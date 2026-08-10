import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const target = args.target ?? 'source';
const roots = args.paths;
if (roots.length === 0) {
  process.stderr.write('At least one path is required\n');
  process.exit(1);
}

const serverOnlyNames = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'CONTENT_SAFETY_API_KEY',
  'CONTENT_SAFETY_URL',
  'CONTENT_SAFETY_PROVIDER',
  'OWNER_OVERRIDE',
  'wxCloudApiToken',
];
const secretPatterns = [
  { label: 'secret-like token', pattern: /\bsk[-_](?:live|test|proj)?[-_A-Za-z0-9]{20,}\b/i },
  { label: 'secret-like token', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'secret-like token', pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/ },
  { label: 'secret-like token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/i },
  { label: 'private key header', pattern: /-----BEGIN (?:OPENSSH |ENCRYPTED |RSA |EC |DSA )?PRIVATE KEY-----/ },
];
const secretFilenamePattern = /(?:^|[._-])(?:private|secret|credential|signing)(?:[._-]|$)|\.(?:key|pem|p8|p12)$/i;
const configuredSecrets = Object.entries(process.env)
  .filter(([name, value]) => (
    /(?:API_KEY|SECRET|TOKEN|PASSWORD|CONTENT_SAFETY|LLM_)/i.test(name)
    && typeof value === 'string'
    && value.length >= 8
    && !/^(待配置|placeholder|changeme|example)$/i.test(value)
  ))
  .map(([name, value]) => ({ name, value }));

const findings = [];
for (const file of roots.flatMap((root) => collectFiles(root))) {
  if (isSecretFilename(file)) findings.push(`${file}: secret filename`);
  const content = readFileSync(file, 'utf8');
  for (const check of secretPatterns) {
    if (check.pattern.test(content)) findings.push(`${file}: ${check.label}`);
  }
  for (const secret of configuredSecrets) {
    if (content.includes(secret.value)) findings.push(`${file}: configured secret value ${secret.name}`);
  }
  if (target === 'dist') {
    for (const name of serverOnlyNames) {
      if (content.includes(name)) findings.push(`${file}: server-only name ${name}`);
    }
  }
}

if (target === 'source') {
  const trackedFiles = args.trackedFiles.length > 0 ? args.trackedFiles : listTrackedFiles();
  for (const file of trackedFiles) {
    if (isSecretFilename(file)) findings.push(`${file}: tracked secret filename`);
  }
}

function isSecretFilename(file) {
  const name = basename(file);
  if (name === 'project.private.config.example.json') return false;
  return secretFilenamePattern.test(name);
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`secret scan passed for ${target}\n`);

function parseArgs(values) {
  const parsed = { paths: [], trackedFiles: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--target') {
      parsed.target = values[index + 1];
      index += 1;
    } else if (value === '--tracked-file') {
      parsed.trackedFiles.push(values[index + 1]);
      index += 1;
    } else {
      parsed.paths.push(value);
    }
  }
  return parsed;
}

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  if (result.status !== 0) {
    findings.push('git ls-files: unable to inspect tracked secret filenames');
    return [];
  }
  return result.stdout.split('\0').filter(Boolean);
}

function collectFiles(root) {
  const info = statSync(root);
  if (info.isFile()) return [root];
  if (!info.isDirectory()) return [];
  const ignored = new Set(['.git', '.worktrees', 'node_modules', 'dist', 'build', '.expo']);
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return entry.isFile() && (isTextFile(entry.name) || secretFilenamePattern.test(entry.name)) ? [fullPath] : [];
  });
}

function isTextFile(name) {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|html|xml|yml|yaml|env|txt|key|pem|p8|p12)$/i.test(name);
}
