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
  const envId = environment.TARO_APP_CLOUDBASE_ENV_ID?.trim() ?? '';
  if (envId.length === 0 || /(?:dev|test|placeholder|example|待配置)/i.test(envId)) {
    findings.push('formal profile requires a production CloudBase environment id');
  }
  if (environment.SKILLSCOPE_ENV !== 'production') findings.push('SKILLSCOPE_ENV must be production');
  verifyFormalConfigurationValue('CONTENT_SAFETY_URL', environment.CONTENT_SAFETY_URL, findings);
  verifyFormalConfigurationValue('CONTENT_SAFETY_API_KEY', environment.CONTENT_SAFETY_API_KEY, findings);
  verifyFormalConfigurationValue('CONTENT_SAFETY_PROVIDER', environment.CONTENT_SAFETY_PROVIDER, findings);
  if (environment.SKILLSCOPE_ALLOW_UNSAFE_MODERATION === 'true') {
    findings.push('SKILLSCOPE_ALLOW_UNSAFE_MODERATION cannot be true for formal release');
  }
  if (isNonEmpty(environment.CONTENT_SAFETY_URL)) {
    try {
      const url = new URL(environment.CONTENT_SAFETY_URL);
      if (url.protocol !== 'https:' || url.username || url.password) {
        findings.push('CONTENT_SAFETY_URL must be a credential-free HTTPS URL');
      }
    } catch {
      findings.push('CONTENT_SAFETY_URL must be a valid HTTPS URL');
    }
  }

  const moderationConfig = JSON.parse(readFileSync(
    join(repoRoot, 'services/cloudbase/functions/create-generation-job/config.json'),
    'utf8',
  ));
  if (!moderationConfig.permissions?.openapi?.includes('security.msgSecCheck')) {
    findings.push('create-generation-job must declare the WeChat security.msgSecCheck capability');
  }
  if (findings.length > 0) fail(findings);
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

function verifyFormalConfigurationValue(name, value, findings) {
  if (!isNonEmpty(value)) findings.push(`${name} is required`);
  else if (isPlaceholder(value)) findings.push(`${name} cannot be a placeholder`);
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
