import { spawnSync } from 'node:child_process';
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
    else fail(`Unsupported go-live readiness argument: ${key}`);
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
