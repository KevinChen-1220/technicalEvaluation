import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';
import { requiredServerRuntimeEnvNames } from './edgeone-release-contracts.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const productionVariables = [
  'EDGEONE_API_TOKEN',
  'EDGEONE_PROJECT_NAME',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'SESSION_HMAC_KEY',
  'OWNER_HMAC_KEY',
  'OPENID_ENCRYPTION_KEY',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'GENERATION_ENABLED',
  'EDGEONE_DEPLOYMENT_VERSION',
];

verifyStaticContracts();
if (args.production) verifyProductionEnvironment(process.env);

if (!args.checkOnly) {
  for (const [command, commandArgs] of [
    ['npm', ['run', 'test:edgeone', '--', '--runInBand']],
    ['npm', ['run', 'typecheck:edgeone']],
    ['npm', ['run', 'build:edgeone']],
    ['npm', ['run', 'scan:secrets:source']],
    ['npm', ['run', 'scan:secrets:wechat-dist']],
  ]) {
    const result = run(command, commandArgs);
    if (result.status !== 0) fail(`EdgeOne release gate failed: ${command} ${commandArgs.join(' ')}`);
  }
}

process.stdout.write(`EdgeOne release verification passed${args.production ? ' for production configuration' : ''}\n`);

function verifyStaticContracts() {
  const findings = [];
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
  if (packageJson.scripts?.['verify:edgeone-release'] !== 'node scripts/verify-edgeone-release.mjs') findings.push('package.json must expose verify:edgeone-release');
  if (packageJson.scripts?.['edgeone:deploy'] !== 'node scripts/edgeone-deploy.mjs') findings.push('package.json must expose edgeone:deploy');
  if (packageJson.devDependencies?.edgeone !== '1.6.23') findings.push('EdgeOne CLI must be exactly pinned to 1.6.23');
  if (lockfile.packages?.['node_modules/edgeone']?.version !== '1.6.23') findings.push('package-lock must pin EdgeOne CLI to 1.6.23');

  const config = JSON.parse(readFileSync(join(repoRoot, 'services/edgeone/edgeone.json'), 'utf8'));
  if (config.cloudFunctions?.nodejs?.maxDuration !== 120) findings.push('EdgeOne Node Functions must retain the 120-second generation budget');

  const requiredFunctions = ['health.js', 'session.js', 'generation.js', 'settings.js', 'reports.js', 'assessments/[[path]].js'];
  for (const file of requiredFunctions) {
    const path = join(repoRoot, 'services/edgeone/cloud-functions/api', file);
    if (!existsSync(path) || statSync(path).size === 0) findings.push(`EdgeOne deployment package is missing cloud-functions/api/${file}`);
  }

  const generation = readFileSync(join(repoRoot, 'services/edgeone/src/routes/generation.ts'), 'utf8');
  const generatePage = readFileSync(join(repoRoot, 'apps/wechat/src/pages/generate/index.tsx'), 'utf8');
  if (!/generateFiftyQuestionAssessment|questionCount:\s*50|FIXED_QUESTION_COUNT/.test(generation)) findings.push('EdgeOne generation route must enforce exactly 50 questions');
  if (/\[\s*50\s*,\s*100\s*\]|questionCount.*100/s.test(generatePage)) findings.push('Mini Program must not expose a 50/100 question selector');

  const deploymentWrapper = readFileSync(join(repoRoot, 'scripts/edgeone-deploy.mjs'), 'utf8');
  if (!/['"]makers['"]\s*,\s*['"]deploy['"]/.test(deploymentWrapper)) findings.push('EdgeOne deployment wrapper must use the Makers deploy command');
  if (!deploymentWrapper.includes('--dry-run')) findings.push('EdgeOne deployment wrapper must support credential-free dry runs');
  if (!deploymentWrapper.includes('assertDeploymentOrigin')) findings.push('EdgeOne deployment wrapper must validate the provider-reported deployment origin');
  if (!deploymentWrapper.includes('--verify-runtime-env')) findings.push('EdgeOne deployment wrapper must verify runtime configuration before production deploy');
  if (!deploymentWrapper.includes('configurationReady')) findings.push('EdgeOne deployment wrapper must require configurationReady from health');

  const healthRoute = readFileSync(join(repoRoot, 'services/edgeone/src/routes/health.ts'), 'utf8');
  if (!/configurationReady/.test(healthRoute)) findings.push('EdgeOne health route must report configuration readiness without exposing secret values');

  const wechatCi = readFileSync(join(repoRoot, 'scripts/wechat-miniprogram-ci.mjs'), 'utf8');
  if (!/WECHAT_PRIVATE_KEY_PEM/.test(wechatCi) || !/withEphemeralPrivateKeyFile/.test(wechatCi)) findings.push('WeChat CI wrapper must own ephemeral private-key file creation and cleanup');

  const clientFiles = [
    join(repoRoot, 'apps/wechat/src'),
    join(repoRoot, 'apps/wechat/config'),
  ];
  for (const directory of clientFiles) {
    for (const path of readableFiles(directory)) {
      const source = readFileSync(path, 'utf8');
      if (/TARO_APP_CLOUDBASE_ENV_ID|Taro\.cloud\.callFunction/.test(source)) findings.push(`${relative(repoRoot, path)} retains a CloudBase client dependency`);
      if (/(?:LLM_API_KEY|WECHAT_APP_SECRET|SESSION_HMAC_KEY|OWNER_HMAC_KEY|OPENID_ENCRYPTION_KEY|EDGEONE_API_TOKEN)/.test(source)) findings.push(`${relative(repoRoot, path)} exposes a server-only variable`);
    }
  }
  if (findings.length > 0) fail(findings.join('\n'));
}

function verifyProductionEnvironment(environment) {
  const findings = [];
  for (const name of productionVariables) {
    const value = environment[name];
    if (typeof value !== 'string' || value.trim() === '' || /^(?:placeholder|changeme|example|todo|tbd|待配置)$/i.test(value.trim())) {
      findings.push(`production EdgeOne environment requires ${name}`);
    }
  }
  for (const name of requiredServerRuntimeEnvNames) {
    if (!productionVariables.includes(name)) findings.push(`production allowlist omits runtime env ${name}`);
  }
  if (!isProductionEdgeOneApiBaseUrl(environment.TARO_APP_EDGEONE_API_BASE_URL)) findings.push('production EdgeOne environment requires a public HTTPS API origin root');
  if (environment.GENERATION_ENABLED !== 'true' && environment.GENERATION_ENABLED !== 'false') findings.push('GENERATION_ENABLED must be true or false');
  if (typeof environment.EDGEONE_DEPLOYMENT_VERSION === 'string' && !/^[A-Za-z0-9._-]{1,128}$/.test(environment.EDGEONE_DEPLOYMENT_VERSION)) findings.push('EDGEONE_DEPLOYMENT_VERSION has an invalid format');
  if (typeof environment.TARO_APP_CLOUDBASE_ENV_ID === 'string' && environment.TARO_APP_CLOUDBASE_ENV_ID.trim()) findings.push('TARO_APP_CLOUDBASE_ENV_ID is forbidden for EdgeOne production release');
  if (findings.length > 0) fail(findings.join('\n'));
}

function readableFiles(directory) {
  const entries = [];
  for (const entry of readFileDirectory(directory)) {
    if (entry.directory) entries.push(...readableFiles(entry.path));
    else if (/\.(?:ts|tsx|js|mjs|json)$/i.test(entry.path)) entries.push(entry.path);
  }
  return entries;
}

function readFileDirectory(directory) {
  return readdirSync(directory, { withFileTypes: true }).map((entry) => ({ path: join(directory, entry.name), directory: entry.isDirectory() }));
}

function run(command, commandArgs) {
  const executable = process.platform === 'win32' && command === 'npm'
    ? { command: 'cmd.exe', args: ['/d', '/c', 'npm', ...commandArgs] }
    : { command, args: commandArgs };
  return spawnSync(executable.command, executable.args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 600_000 });
}

function parseArgs(values) {
  const parsed = { checkOnly: false, production: false };
  for (const value of values) {
    if (value === '--check-only') parsed.checkOnly = true;
    else if (value === '--production') parsed.production = true;
    else fail(`Unsupported EdgeOne release argument: ${value}`);
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
