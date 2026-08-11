import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

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
  'EDGEONE_API_TOKEN',
  'EDGEONE_PROJECT_NAME',
  'WECHAT_APP_SECRET',
  'SESSION_HMAC_KEY',
  'OWNER_HMAC_KEY',
  'OPENID_ENCRYPTION_KEY',
  'GENERATION_ENABLED',
  'EDGEONE_DEPLOYMENT_VERSION',
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
const secretFilenamePattern = /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|(?:wechat|weixin)[._-](?:mini[._-]program[._-])?(?:upload[._-])?(?:private[._-])?key)$|(?:^|[._-])(?:private|secret|credential|signing)(?:[._-]|$)|\.(?:key|pem|p8|p12)$/i;
const configuredSecrets = Object.entries(process.env)
  .filter(([name, value]) => (
    /(?:API_KEY|SECRET|TOKEN|PASSWORD|CONTENT_SAFETY|LLM_)/i.test(name)
    && typeof value === 'string'
    && value.length >= 8
    && !/^(待配置|placeholder|changeme|example)$/i.test(value)
  ))
  .map(([name, value]) => ({ name, value }));

const findings = [];
const files = new Map();
for (const file of roots.flatMap((root) => collectFiles(root))) {
  files.set(resolve(file), file);
}

if (target === 'source') {
  const trackedFiles = [...listTrackedFiles(), ...args.trackedFiles];
  for (const file of trackedFiles) {
    if (isSecretFilename(file)) findings.push(`${file}: tracked secret filename`);
    if (isRegularFile(file)) files.set(resolve(file), file);
  }
}

for (const [absolutePath, displayPath] of files) {
  if (isSecretFilename(displayPath)) findings.push(`${displayPath}: secret filename`);
  const content = readTextFileSafely(absolutePath);
  if (content === null) continue;
  for (const check of secretPatterns) {
    if (check.pattern.test(content)) findings.push(`${displayPath}: ${check.label}`);
  }
  for (const secret of configuredSecrets) {
    if (content.includes(secret.value)) findings.push(`${displayPath}: configured secret value ${secret.name}`);
  }
  if (target === 'dist') {
    for (const name of serverOnlyNames) {
      if (content.includes(name)) findings.push(`${displayPath}: server-only name ${name}`);
    }
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

function isRegularFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function readTextFileSafely(file) {
  const content = readFileSync(file);
  if (content.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return null;
  }
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
