import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const serviceRoot = join(repoRoot, 'services', 'edgeone');
const args = parseArgs(process.argv.slice(2));
verifyArtifacts();

if (args.dryRun || args.checkOnly) {
  process.stdout.write('EdgeOne deployment dry run passed: project=<not-configured> version=<not-configured>\n');
  process.exit(0);
}

const project = required('EDGEONE_PROJECT_NAME');
const token = required('EDGEONE_API_TOKEN');
const version = required('EDGEONE_DEPLOYMENT_VERSION');
if (!args.production) fail('EdgeOne deployment requires --production');

const result = spawnSync(
  process.platform === 'win32' ? join(repoRoot, 'node_modules/.bin/edgeone.cmd') : join(repoRoot, 'node_modules/.bin/edgeone'),
  ['makers', 'deploy', '-n', project, '-t', token, '-e', 'production'],
  { cwd: serviceRoot, encoding: 'utf8', windowsHide: true, timeout: 600_000 },
);
if (result.status !== 0) fail('EdgeOne deployment failed; inspect the protected provider log.');

if (args.verifyHealth) verifyHealth(version);
process.stdout.write(`EdgeOne deployment completed: project=${safe(project)} version=${safe(version)}\n`);

function verifyArtifacts() {
  const config = JSON.parse(readFileSync(join(repoRoot, 'services/edgeone/edgeone.json'), 'utf8'));
  if (config.cloudFunctions?.nodejs?.maxDuration !== 120) fail('EdgeOne deployment requires a 120-second Node Function budget');
  const functions = ['health.js', 'session.js', 'generation.js', 'settings.js', 'reports.js', 'assessments/[[path]].js'];
  for (const file of functions) {
    const path = join(repoRoot, 'services/edgeone/cloud-functions/api', file);
    if (!existsSync(path) || statSync(path).size === 0) fail(`EdgeOne deployment package is incomplete: ${file}`);
  }
}

function verifyHealth(version) {
  const origin = process.env.TARO_APP_EDGEONE_API_BASE_URL;
  if (!isProductionEdgeOneApiBaseUrl(origin)) fail('EdgeOne health verification requires a public HTTPS API origin root');
  const result = spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(`${origin}/api/health`)}).then(async response => { if (!response.ok) process.exit(1); const body = await response.json(); if (body?.data?.version !== ${JSON.stringify(version)}) process.exit(1); }).catch(() => process.exit(1));`], { cwd: repoRoot, timeout: 20_000 });
  if (result.status !== 0) fail('EdgeOne health verification failed.');
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`EdgeOne deployment requires ${name}`);
  return value.trim();
}

function safe(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

function parseArgs(values) {
  const parsed = { dryRun: false, checkOnly: false, production: false, verifyHealth: false };
  for (const value of values) {
    if (value === '--dry-run') parsed.dryRun = true;
    else if (value === '--check-only') parsed.checkOnly = true;
    else if (value === '--production') parsed.production = true;
    else if (value === '--verify-health') parsed.verifyHealth = true;
    else fail(`Unsupported EdgeOne deployment argument: ${value}`);
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
