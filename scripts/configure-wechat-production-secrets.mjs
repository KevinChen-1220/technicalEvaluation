import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';

const args = parseArgs(process.argv.slice(2));
const githubEnvironment = args.githubEnv ?? 'wechat-production';
const updates = [];

if (args.apiBaseUrl !== undefined) {
  if (!isProductionEdgeOneApiBaseUrl(args.apiBaseUrl)) {
    fail('TARO_APP_EDGEONE_API_BASE_URL must be a production HTTPS origin root');
  }
  updates.push(['TARO_APP_EDGEONE_API_BASE_URL', args.apiBaseUrl.trim()]);
}

if (args.privateKeyPath !== undefined) {
  if (!existsSync(args.privateKeyPath)) fail('WECHAT private key path does not exist');
  const pem = readFileSync(args.privateKeyPath, 'utf8');
  if (!/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/.test(pem) || !/-----END (?:[A-Z ]+)?PRIVATE KEY-----/.test(pem)) {
    fail('WECHAT private key file must contain a PEM private key');
  }
  updates.push(['WECHAT_PRIVATE_KEY_PEM', pem]);
}

if (updates.length === 0) {
  fail('Provide --api-base-url, --private-key-path, or both');
}

for (const [name, value] of updates) {
  setGithubSecret(name, value);
  process.stdout.write(`Configured GitHub environment secret ${name}\n`);
}

function setGithubSecret(name, value) {
  const gh = process.env.GH_CLI_BIN || 'gh';
  const command = resolveExecutable(gh, ['secret', 'set', name, '--env', githubEnvironment, '--body-file', '-']);
  const result = spawnSync(command.file, command.args, {
    input: value,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.status !== 0) fail(`Unable to configure GitHub environment secret ${name}`);
}

function resolveExecutable(file, commandArgs) {
  if (process.platform === 'win32' && /\.cmd$/i.test(file)) {
    return { file: 'cmd.exe', args: ['/d', '/c', file, ...commandArgs] };
  }
  return { file, args: commandArgs };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${key}`);
    if (key === '--api-base-url') parsed.apiBaseUrl = value;
    else if (key === '--private-key-path') parsed.privateKeyPath = value;
    else if (key === '--github-env') parsed.githubEnv = value;
    else fail(`Unsupported secret configuration argument: ${key}`);
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
