import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export function verifyDisclosure({ file, mode, dist, requireDist = true }) {
  if (mode !== 'development' && mode !== 'production') fail([`Unsupported mode: ${mode}`]);
  if (!existsSync(file)) fail([`${file} does not exist`]);

  const disclosure = JSON.parse(readFileSync(file, 'utf8'));
  const required = [
    'productVersion',
    'privacyPolicyVersion',
    'serviceOperator',
    'modelDisclosure',
    'generativeAiRegistration',
    'miniProgramFiling',
    'reportRoute',
    'privacyRoute',
  ];
  const missing = required.filter((field) => !isNonEmpty(disclosure[field]));

  if (disclosure.environment !== mode) fail([`release disclosure environment must be ${mode}`]);
  if (mode === 'production') {
    const placeholders = required.filter((field) => isPlaceholder(disclosure[field]));
    if (missing.length > 0 || placeholders.length > 0) {
      fail([...missing, ...placeholders].map((field) => `${field} is required for production`));
    }
    if (requireDist && !dist) fail(['--dist is required for production']);
    if (dist) verifyBuiltDisclosure(dist, disclosure, required);
  }
  if (mode === 'development' && missing.length > 0) {
    fail(missing.map((field) => `${field} is required`));
  }
}

export function verifyFormalPreflight({ repoRoot, disclosureFile, environment = process.env }) {
  verifyDisclosure({
    file: resolve(repoRoot, disclosureFile),
    mode: 'production',
    requireDist: false,
  });

  const findings = [];
  if (!isProductionEdgeOneApiBaseUrl(environment.TARO_APP_EDGEONE_API_BASE_URL)) {
    findings.push('formal profile requires a production HTTPS EdgeOne API origin root');
  }
  if (isNonEmpty(environment.TARO_APP_CLOUDBASE_ENV_ID)) {
    findings.push('TARO_APP_CLOUDBASE_ENV_ID is forbidden for formal EdgeOne release');
  }
  if (environment.SKILLSCOPE_ENV !== 'production') findings.push('SKILLSCOPE_ENV must be production');
  if (findings.length > 0) fail(findings);
}

export function isProductionEdgeOneApiBaseUrl(value) {
  if (!isNonEmpty(value) || /(?:dev|test|example|invalid|placeholder|localhost|待配置)/i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && url.pathname === '/';
  } catch {
    return false;
  }
}

function verifyBuiltDisclosure(directory, disclosure, fields) {
  const packagedText = readableFiles(directory)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (/待配置|\\u5f85\\u914d\\u7f6e/i.test(packagedText)) {
    fail(['dist contains a release disclosure placeholder']);
  }
  const absent = fields.filter((field) => !packagedText.includes(disclosure[field]));
  if (absent.length > 0) fail(absent.map((field) => `dist does not contain matching ${field}`));
}

function readableFiles(directory) {
  const paths = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) paths.push(...readableFiles(path));
    else if (['.js', '.json', '.wxml', '.wxss', '.map', '.txt'].includes(extname(path))) paths.push(path);
  }
  return paths;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlaceholder(value) {
  return typeof value !== 'string'
    || /待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}

function fail(messages) {
  process.stderr.write(`${messages.join('\n')}\n`);
  process.exit(1);
}
