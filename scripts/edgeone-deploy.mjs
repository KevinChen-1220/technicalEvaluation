import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';
import {
  assertDeploymentOrigin,
  assertHealthContract,
} from './edgeone-release-contracts.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const serviceRoot = join(repoRoot, 'services', 'edgeone');
const args = parseArgs(process.argv.slice(2));
verifyArtifacts();

if (args.dryRun || args.checkOnly) {
  process.stdout.write('EdgeOne deployment dry run passed: project=<not-configured> version=<not-configured>\n');
  process.exit(0);
}

const project = resolveProjectName();
const token = args.localLogin ? undefined : required('EDGEONE_API_TOKEN');
const version = required('EDGEONE_DEPLOYMENT_VERSION');
if (!args.production) fail('EdgeOne deployment requires --production');
if (args.verifyRuntimeEnv) verifyHealth({ version, requireVersion: false });

const edgeoneCommand = resolveEdgeOneCommand();
runLocalBuild();
runEdgeOneBuild(edgeoneCommand);
verifyEdgeOneBuildPackage();
const result = spawnSync(
  edgeoneCommand.command,
  [
    ...edgeoneCommand.args,
    'makers',
    'deploy',
    '-n',
    project,
    ...(token === undefined ? [] : ['-t', token]),
    '-e',
    'production',
    '--json',
  ],
  { cwd: serviceRoot, encoding: 'utf8', windowsHide: true, timeout: 600_000, env: process.env },
);
if (result.status !== 0) fail('EdgeOne deployment failed; inspect the protected provider log.');
try {
  assertDeploymentOrigin(`${result.stdout ?? ''}\n${result.stderr ?? ''}`, process.env.TARO_APP_EDGEONE_API_BASE_URL, process.env.EDGEONE_ALLOW_MISSING_DEPLOYMENT_ORIGIN === 'true');
} catch (error) {
  fail(error instanceof Error ? error.message : 'EdgeOne deployment origin validation failed.');
}

if (args.verifyHealth) verifyHealth({ version, requireVersion: true });
process.stdout.write(`EdgeOne deployment completed: project=${safe(project)} version=${safe(version)}\n`);

function verifyArtifacts() {
  const config = JSON.parse(readFileSync(join(repoRoot, 'services/edgeone/edgeone.json'), 'utf8'));
  if (config.cloudFunctions?.maxDuration !== 120) fail('EdgeOne deployment requires a 120-second Node Function budget');
  const functions = ['health.js', 'session.js', 'generation.js', 'settings.js', 'reports.js', 'assessments/[[path]].js'];
  for (const file of functions) {
    const path = join(repoRoot, 'services/edgeone/cloud-functions/api', file);
    if (!existsSync(path) || statSync(path).size === 0) fail(`EdgeOne deployment package is incomplete: ${file}`);
    const source = readFileSync(path, 'utf8');
    if (!/export\s*\{[\s\S]*onRequest/.test(source)) fail(`EdgeOne deployment package is not a Node Function module: ${file}`);
  }
}

function runLocalBuild() {
  const result = spawnSync(process.execPath, [join(serviceRoot, 'scripts', 'build.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: process.env,
  });
  if (result.status !== 0) fail('EdgeOne local function build failed.');
}

function runEdgeOneBuild(edgeoneCommand) {
  const result = spawnSync(
    edgeoneCommand.command,
    [...edgeoneCommand.args, 'makers', 'build'],
    { cwd: serviceRoot, encoding: 'utf8', windowsHide: true, timeout: 600_000, env: process.env },
  );
  if (result.status !== 0) fail('EdgeOne provider build failed; inspect the protected provider log.');
}

function verifyEdgeOneBuildPackage() {
  const configPath = join(serviceRoot, '.edgeone', 'cloud-functions', 'api-node', 'config.json');
  if (!existsSync(configPath)) fail('EdgeOne provider build did not produce api-node config.json.');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const routes = Array.isArray(config.routes) ? config.routes : [];
  if (!routes.some((route) => typeof route?.src === 'string' && route.src.includes('/api/'))) {
    fail('EdgeOne provider build did not include API Node Function routes.');
  }
}

function verifyHealth({ version, requireVersion }) {
  const origin = process.env.TARO_APP_EDGEONE_API_BASE_URL;
  if (!isProductionEdgeOneApiBaseUrl(origin)) fail('EdgeOne health verification requires a public HTTPS API origin root');
  const script = [
    `fetch(${JSON.stringify(`${origin}/api/health`)})`,
    '.then(async response => {',
    'if (!response.ok) process.exit(1);',
    'const body = await response.json();',
    `const expected = ${JSON.stringify({ version, requireVersion })};`,
    `return import(${JSON.stringify(new URL('./edgeone-release-contracts.mjs', import.meta.url).href)}).then(({ assertHealthContract }) => assertHealthContract(body, expected));`,
    '})',
    '.catch(() => process.exit(1));',
  ].join('');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repoRoot, timeout: 20_000 });
  if (result.status !== 0) fail('EdgeOne health verification failed.');
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`EdgeOne deployment requires ${name}`);
  return value.trim();
}

function resolveProjectName() {
  const configured = process.env.EDGEONE_PROJECT_NAME;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  if (!args.localLogin) fail('EdgeOne deployment requires EDGEONE_PROJECT_NAME');
  const linkedProjectPath = linkedProjectFilePath();
  if (!existsSync(linkedProjectPath)) fail('EdgeOne local-login deployment requires a linked EdgeOne project');
  try {
    const linked = JSON.parse(readFileSync(linkedProjectPath, 'utf8'));
    if (typeof linked.Name === 'string' && linked.Name.trim() !== '') return linked.Name.trim();
  } catch {
    fail('EdgeOne linked project file is not readable');
  }
  fail('EdgeOne linked project file is missing a project name');
}

function linkedProjectFilePath() {
  const configured = process.env.EDGEONE_LINKED_PROJECT_FILE;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return join(serviceRoot, '.edgeone', 'project.json');
}

function safe(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

function resolveEdgeOneCommand() {
  const cli = process.env.NODE_ENV === 'test' && process.env.EDGEONE_CLI_BIN
    ? process.env.EDGEONE_CLI_BIN
    : process.platform === 'win32'
      ? join(repoRoot, 'node_modules/.bin/edgeone.cmd')
      : join(repoRoot, 'node_modules/.bin/edgeone');
  if (process.platform === 'win32' && /\.cmd$/i.test(cli)) {
    return { command: 'cmd.exe', args: ['/d', '/c', cli] };
  }
  return { command: cli, args: [] };
}

function parseArgs(values) {
  const parsed = { dryRun: false, checkOnly: false, production: false, verifyHealth: false, verifyRuntimeEnv: false, localLogin: false };
  for (const value of values) {
    if (value === '--dry-run') parsed.dryRun = true;
    else if (value === '--check-only') parsed.checkOnly = true;
    else if (value === '--production') parsed.production = true;
    else if (value === '--verify-health') parsed.verifyHealth = true;
    else if (value === '--verify-runtime-env') parsed.verifyRuntimeEnv = true;
    else if (value === '--local-login') parsed.localLogin = true;
    else fail(`Unsupported EdgeOne deployment argument: ${value}`);
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
