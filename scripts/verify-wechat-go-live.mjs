import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';

const args = parseArgs(process.argv.slice(2));
const environment = process.env;
const githubEnvironment = args.githubEnv ?? 'wechat-production';
const apiBaseUrl = args.apiBaseUrl ?? environment.TARO_APP_EDGEONE_API_BASE_URL;
const appId = args.appId ?? environment.WECHAT_APP_ID;
const findings = [];

const requiredGithubSecrets = [
  'EDGEONE_API_TOKEN',
  'EDGEONE_PROJECT_NAME',
  'EDGEONE_DEPLOYMENT_VERSION',
  'TARO_APP_EDGEONE_API_BASE_URL',
  'WECHAT_APP_ID',
  'WECHAT_PRIVATE_KEY_PEM',
];

const requiredProtectedEnvironmentVariables = [
  'EDGEONE_DEPLOYMENT_VERSION',
  'TARO_APP_EDGEONE_API_BASE_URL',
  'WECHAT_APP_ID',
  'WECHAT_PRIVATE_KEY_PEM',
];

if (!/^wx[0-9a-f]{16}$/i.test(String(appId ?? '').trim())) {
  findings.push('WECHAT_APP_ID must be the real Mini Program AppID');
}

if (!isProductionEdgeOneApiBaseUrl(apiBaseUrl) || isEdgeOnePreviewHost(apiBaseUrl)) {
  findings.push('TARO_APP_EDGEONE_API_BASE_URL must be a stable public HTTPS origin root, not localhost, example, tokenized preview, edgeone.cool, or a path under /api');
}

if (args.fromEnv) {
  for (const name of requiredProtectedEnvironmentVariables) {
    if (!hasUsableValue(environment[name])) findings.push(`protected upload environment is missing ${name}`);
  }
} else {
  const githubSecrets = readGithubEnvironmentSecretNames(githubEnvironment);
  if (githubSecrets.ok) {
    const names = new Set(githubSecrets.names);
    for (const name of requiredGithubSecrets) {
      if (!names.has(name)) findings.push(`GitHub environment ${githubEnvironment} is missing ${name}`);
    }
  } else {
    findings.push(githubSecrets.message);
  }
}

if (findings.length === 0) {
  const dns = await inspectDns(apiBaseUrl, args);
  if (!dns.ok) findings.push(dns.message);
}

if (!args.skipHealth && findings.length === 0) {
  const health = await fetchHealth(apiBaseUrl);
  if (!health.ok) findings.push(health.message);
}

if (args.skipHealth) {
  process.stdout.write('health check skipped; run again without --skip-health before WeChat upload\n');
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('WeChat go-live readiness passed\n');

function readGithubEnvironmentSecretNames(name) {
  const gh = environment.GH_CLI_BIN || 'gh';
  const command = resolveExecutable(gh, ['secret', 'list', '--env', name, '--json', 'name']);
  const result = spawnSync(command.file, command.args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.status !== 0) {
    return { ok: false, message: `unable to list GitHub environment ${name} secret names with gh` };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) return { ok: false, message: `GitHub environment ${name} secret list returned an unexpected shape` };
    return {
      ok: true,
      names: parsed.map((item) => item?.name).filter((value) => typeof value === 'string'),
    };
  } catch {
    return { ok: false, message: `GitHub environment ${name} secret list was not valid JSON` };
  }
}

function resolveExecutable(file, args) {
  if (process.platform === 'win32' && /\.cmd$/i.test(file)) {
    return { file: 'cmd.exe', args: ['/d', '/c', file, ...args] };
  }
  return { file, args };
}

function isEdgeOnePreviewHost(value) {
  try {
    return /\.edgeone\.cool$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function hasUsableValue(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && !/^(?:placeholder|changeme|example|todo|tbd|待配置|replace-)/i.test(value.trim());
}

async function inspectDns(origin, options) {
  let host = '';
  try {
    host = new URL(origin).hostname;
  } catch {
    return { ok: false, message: 'TARO_APP_EDGEONE_API_BASE_URL must be a valid HTTPS origin before DNS verification' };
  }
  const addresses = options.dnsResult
    ? splitList(options.dnsResult)
    : await resolveHost(host);
  const publicAddresses = addresses.filter(isPublicAddress);
  if (addresses.length === 0) return { ok: false, message: 'production request domain DNS lookup returned no addresses' };
  if (publicAddresses.length === 0) {
    return { ok: false, message: 'production request domain DNS resolves only to non-public addresses; verify a publicly reachable HTTPS origin before WeChat upload' };
  }
  return { ok: true };
}

async function resolveHost(host) {
  try {
    const records = await lookup(host, { all: true });
    return records.map((record) => record.address).filter(Boolean);
  } catch {
    return [];
  }
}

function splitList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function isPublicAddress(address) {
  const kind = isIP(address);
  if (kind === 4) return isPublicIpv4(address);
  if (kind === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(address) {
  const normalized = address.toLowerCase();
  return !(
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80')
    || normalized.startsWith('2001:db8')
  );
}

async function fetchHealth(origin) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/health', origin), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `EdgeOne health check returned HTTP ${response.status}` };
    const body = await response.json();
    if (body?.ok !== true || body?.data?.service !== 'skillscope-edgeone') {
      return { ok: false, message: 'EdgeOne health check did not return the SkillScope service contract' };
    }
    if (body.data.configurationReady !== true) {
      return { ok: false, message: 'EdgeOne health check reports configurationReady=false' };
    }
    if (typeof body.data.generationEnabled !== 'boolean') {
      return { ok: false, message: 'EdgeOne health check does not report generationEnabled' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'EdgeOne health check failed; verify the public HTTPS request domain and runtime environment' };
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(values) {
  const parsed = { skipHealth: false, fromEnv: false };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--skip-health') {
      parsed.skipHealth = true;
      continue;
    }
    if (key === '--from-env') {
      parsed.fromEnv = true;
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${key}`);
    if (key === '--app-id') parsed.appId = value;
    else if (key === '--api-base-url') parsed.apiBaseUrl = value;
    else if (key === '--github-env') parsed.githubEnv = value;
    else if (key === '--dns-result') parsed.dnsResult = value;
    else fail(`Unsupported go-live readiness argument: ${key}`);
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
