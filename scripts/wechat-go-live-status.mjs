import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';

const args = parseArgs(process.argv.slice(2));
const githubEnvironmentName = args.githubEnv ?? 'wechat-production';
const disclosureFile = args.disclosureFile ?? 'docs/wechat/release-disclosure.production.json';
const requiredGithubSecrets = [
  'EDGEONE_API_TOKEN',
  'EDGEONE_PROJECT_NAME',
  'EDGEONE_DEPLOYMENT_VERSION',
  'TARO_APP_EDGEONE_API_BASE_URL',
  'WECHAT_APP_ID',
  'WECHAT_PRIVATE_KEY_PEM',
];

const githubEnvironment = readGithubEnvironmentSecretNames(githubEnvironmentName);
const productionDisclosure = inspectProductionDisclosure(disclosureFile);
const apiBaseUrl = args.apiBaseUrl ?? process.env.TARO_APP_EDGEONE_API_BASE_URL;
const apiOrigin = inspectApiOrigin(apiBaseUrl);
const domainCandidate = await inspectDomainCandidate(apiBaseUrl, args);
const appId = /^wx[0-9a-f]{16}$/i.test(String(args.appId ?? process.env.WECHAT_APP_ID ?? '').trim());
const nextActions = [];

if (githubEnvironment.missingSecrets.length > 0) {
  nextActions.push(`Configure ${githubEnvironment.missingSecrets.join(' and ')} in GitHub environment ${githubEnvironmentName}.`);
}
if (!productionDisclosure.ready) {
  nextActions.push(`Create ${disclosureFile} with real non-placeholder production disclosure.`);
}
if (!apiOrigin.productionOrigin) {
  nextActions.push('Bind a stable production HTTPS origin root to EdgeOne and use it for WeChat request合法域名.');
}
for (const action of domainCandidate.nextActions) nextActions.push(action);
nextActions.push('Run verify:wechat-go-live without --skip-health after the production HTTPS origin is bound.');

const report = {
  ready: githubEnvironment.missingSecrets.length === 0
    && productionDisclosure.ready
    && apiOrigin.productionOrigin
    && domainCandidate.ready
    && appId,
  githubEnvironment,
  productionDisclosure,
  apiOrigin,
  domainCandidate,
  appId: { valid: appId },
  nextActions: [...new Set(nextActions)],
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(renderText(report));
}

function readGithubEnvironmentSecretNames(name) {
  const gh = process.env.GH_CLI_BIN || 'gh';
  const command = resolveExecutable(gh, ['secret', 'list', '--env', name, '--json', 'name']);
  const result = spawnSync(command.file, command.args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.status !== 0) {
    return {
      name,
      readable: false,
      presentSecrets: [],
      missingSecrets: requiredGithubSecrets,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const presentSecrets = Array.isArray(parsed)
      ? parsed.map((item) => item?.name).filter((value) => typeof value === 'string').sort()
      : [];
    const present = new Set(presentSecrets);
    return {
      name,
      readable: true,
      presentSecrets,
      missingSecrets: requiredGithubSecrets.filter((secret) => !present.has(secret)),
    };
  } catch {
    return {
      name,
      readable: false,
      presentSecrets: [],
      missingSecrets: requiredGithubSecrets,
    };
  }
}

function inspectProductionDisclosure(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    return { file: path, exists: false, ready: false, placeholderFields: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(absolute, 'utf8'));
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
    const placeholderFields = required.filter((field) => isPlaceholder(parsed[field]));
    return {
      file: path,
      exists: true,
      ready: parsed.environment === 'production' && placeholderFields.length === 0,
      placeholderFields,
    };
  } catch {
    return { file: path, exists: true, ready: false, placeholderFields: ['invalid-json'] };
  }
}

function inspectApiOrigin(value) {
  return {
    configured: typeof value === 'string' && value.trim().length > 0,
    productionOrigin: isProductionEdgeOneApiBaseUrl(value) && !isEdgeOnePreviewHost(value),
  };
}

async function inspectDomainCandidate(value, options) {
  const checks = {};
  const parsed = parseOrigin(value);
  checks.dns = await inspectDns(parsed, options);
  checks.health = await inspectHealth(parsed, options);
  const ready = apiOrigin.productionOrigin
    && checks.dns.ok === true
    && checks.health.ok === true;
  return {
    ready,
    checks,
    nextActions: buildDomainNextActions(checks),
  };
}

function parseOrigin(value) {
  try {
    return { ok: true, url: new URL(String(value ?? '').trim()) };
  } catch {
    return { ok: false };
  }
}

async function inspectDns(parsed, options) {
  if (!parsed.ok) return { ok: false, message: 'DNS check skipped because the API origin is invalid.' };
  if (options.dnsResult) return inspectResolvedAddresses(splitList(options.dnsResult));
  try {
    const records = await lookup(parsed.url.hostname, { all: true });
    return inspectResolvedAddresses(records.map((record) => record.address).filter(Boolean));
  } catch {
    return { ok: false, addresses: [], message: 'DNS lookup failed; configure the candidate domain before using it in WeChat.' };
  }
}

function inspectResolvedAddresses(addresses) {
  const publicAddresses = addresses.filter(isPublicAddress);
  if (addresses.length === 0) return { ok: false, addresses: [], message: 'DNS lookup returned no addresses.' };
  if (publicAddresses.length === 0) {
    return {
      ok: false,
      addresses,
      message: 'DNS resolves only to non-public addresses; WeChat production request domains need a publicly reachable HTTPS origin.',
    };
  }
  return { ok: true, addresses, publicAddresses, message: 'DNS resolves to at least one public address.' };
}

async function inspectHealth(parsed, options) {
  if (!parsed.ok) return { ok: false, message: 'Health check skipped because the API origin is invalid.' };
  if (options.skipHealth) return { ok: false, skipped: true, message: 'Health check skipped by --skip-health.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/health', parsed.url.origin), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `Health endpoint returned HTTP ${response.status}.` };
    const body = await response.json();
    if (body?.ok !== true || body?.data?.service !== 'skillscope-edgeone') {
      return { ok: false, message: 'Health endpoint did not return the SkillScope EdgeOne service contract.' };
    }
    if (body.data.configurationReady !== true) {
      return { ok: false, message: 'Health endpoint reports configurationReady=false.' };
    }
    if (typeof body.data.generationEnabled !== 'boolean') {
      return { ok: false, message: 'Health endpoint does not report generationEnabled.' };
    }
    return { ok: true, message: 'Health endpoint returns the SkillScope service contract.' };
  } catch {
    return { ok: false, message: 'Health check failed; verify EdgeOne binding, HTTPS certificate, and runtime environment.' };
  } finally {
    clearTimeout(timeout);
  }
}

function buildDomainNextActions(checks) {
  const actions = [];
  if (!checks.dns.ok && !checks.dns.skipped) {
    actions.push('Configure DNS for the candidate domain and wait for public resolution.');
  }
  if (!checks.health.ok && !checks.health.skipped) {
    actions.push('Deploy EdgeOne production, configure runtime environment, and verify /api/health over HTTPS.');
  }
  if (!checks.dns.ok || !checks.health.ok) {
    actions.push('Run wechat:domain-candidate and verify ready=true before configuring WeChat request合法域名.');
  }
  return actions;
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

function isPlaceholder(value) {
  return typeof value !== 'string'
    || value.trim().length === 0
    || /待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}

function isEdgeOnePreviewHost(value) {
  try {
    return /\.edgeone\.cool$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function renderText(report) {
  return [
    `WeChat go-live ready: ${report.ready ? 'yes' : 'no'}`,
    `GitHub environment ${report.githubEnvironment.name}: ${report.githubEnvironment.missingSecrets.length === 0 ? 'complete' : `missing ${report.githubEnvironment.missingSecrets.join(', ')}`}`,
    `Production disclosure: ${report.productionDisclosure.ready ? 'ready' : 'not ready'}`,
    `API origin: ${report.apiOrigin.productionOrigin ? 'production origin format' : 'not production-ready'}`,
    `Domain candidate: ${report.domainCandidate.ready ? 'ready' : 'not ready'}`,
    'Next actions:',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
  ].join('\n');
}

function resolveExecutable(file, commandArgs) {
  if (process.platform === 'win32' && /\.cmd$/i.test(file)) {
    return { file: 'cmd.exe', args: ['/d', '/c', file, ...commandArgs] };
  }
  return { file, args: commandArgs };
}

function parseArgs(values) {
  const parsed = { json: false, skipHealth: false };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--json') {
      parsed.json = true;
      continue;
    }
    if (key === '--skip-health') {
      parsed.skipHealth = true;
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${key}`);
    if (key === '--app-id') parsed.appId = value;
    else if (key === '--api-base-url') parsed.apiBaseUrl = value;
    else if (key === '--github-env') parsed.githubEnv = value;
    else if (key === '--disclosure-file') parsed.disclosureFile = value;
    else if (key === '--dns-result') parsed.dnsResult = value;
    else fail(`Unsupported go-live status argument: ${key}`);
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
