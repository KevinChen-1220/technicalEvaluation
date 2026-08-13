import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';

const args = parseArgs(process.argv.slice(2));
const value = args.apiBaseUrl ?? process.env.TARO_APP_EDGEONE_API_BASE_URL;
const report = await inspectCandidate(value, args);

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(renderText(report));
}

process.exit(report.ready ? 0 : 1);

async function inspectCandidate(apiBaseUrl, options) {
  const checks = {};
  const parsed = parseOrigin(apiBaseUrl);

  checks.originRoot = parsed.ok
    ? { ok: true, message: 'HTTPS origin root format is valid.' }
    : { ok: false, message: parsed.message };

  checks.stableHost = parsed.ok && !isPreviewOrDefaultHost(parsed.url.hostname)
    ? { ok: true, message: 'Host is not a known preview/default EdgeOne host.' }
    : { ok: false, message: parsed.ok ? 'Do not use edgeone.cool or tokenized preview/default domains as WeChat production request合法域名.' : 'Stable host check skipped because the URL is not a valid origin root.' };

  checks.productionShape = isProductionEdgeOneApiBaseUrl(apiBaseUrl)
    ? { ok: true, message: 'Origin passes production URL shape validation.' }
    : { ok: false, message: 'Origin must be a stable public HTTPS URL, not localhost, example, preview, tokenized, IP-only, or a URL with /api.' };

  checks.dns = await inspectDns(parsed, options);
  checks.health = await inspectHealth(parsed, options);

  const ready = Object.values(checks).every((check) => check.ok === true);
  return {
    ready,
    origin: parsed.ok ? parsed.url.origin : String(apiBaseUrl ?? ''),
    host: parsed.ok ? parsed.url.hostname : '',
    checks,
    nextActions: buildNextActions(checks),
  };
}

function parseOrigin(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    const isRoot = url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && (url.pathname === '' || url.pathname === '/')
      && url.search === ''
      && url.hash === '';
    if (!isRoot) {
      return {
        ok: false,
        message: 'Use an HTTPS origin root such as https://api.example.com, not a URL with /api, query, hash, credentials, or token.',
      };
    }
    return { ok: true, url };
  } catch {
    return {
      ok: false,
      message: 'Candidate request domain must be a valid HTTPS origin root.',
    };
  }
}

function isPreviewOrDefaultHost(hostname) {
  return /\.edgeone\.cool$/i.test(hostname);
}

async function inspectDns(parsed, options) {
  if (!parsed.ok) return { ok: false, message: 'DNS check skipped because the URL is invalid.' };
  if (options.skipNetwork) return { ok: false, skipped: true, message: 'DNS check skipped by --skip-network.' };
  if (options.dnsResult) return inspectResolvedAddresses(splitList(options.dnsResult), 'DNS result supplied for offline verification.');
  try {
    const records = await lookup(parsed.url.hostname, { all: true });
    const addresses = records.map((record) => record.address).filter(Boolean);
    return inspectResolvedAddresses(addresses, 'DNS resolves publicly.');
  } catch {
    return { ok: false, addresses: [], message: 'DNS lookup failed; configure the candidate domain before using it in WeChat.' };
  }
}

function inspectResolvedAddresses(addresses, okMessage) {
  const publicAddresses = addresses.filter(isPublicAddress);
  if (addresses.length === 0) return { ok: false, addresses: [], message: 'DNS lookup returned no addresses.' };
  if (publicAddresses.length === 0) {
    return {
      ok: false,
      addresses,
      message: 'DNS resolves only to non-public addresses; WeChat production request domains need a publicly reachable HTTPS origin.',
    };
  }
  return { ok: true, addresses, publicAddresses, message: okMessage };
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

async function inspectHealth(parsed, options) {
  if (!parsed.ok) return { ok: false, message: 'Health check skipped because the URL is invalid.' };
  if (options.skipNetwork) return { ok: false, skipped: true, message: 'Health check skipped by --skip-network.' };
  if (options.healthJson) return inspectHealthBody(parseHealthJson(options.healthJson));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/health', parsed.url.origin), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `Health endpoint returned HTTP ${response.status}.` };
    return inspectHealthBody(await response.json());
  } catch {
    return { ok: false, message: 'Health check failed; verify EdgeOne binding, HTTPS certificate, and runtime environment.' };
  } finally {
    clearTimeout(timeout);
  }
}

function inspectHealthBody(body) {
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
}

function parseHealthJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildNextActions(checks) {
  const actions = [];
  if (!checks.originRoot.ok) {
    actions.push('Use an HTTPS origin root such as https://api.example.com, not a URL with /api, query, hash, credentials, or token.');
  }
  if (!checks.stableHost.ok) {
    actions.push('Bind an owned stable custom domain to EdgeOne instead of using edgeone.cool or preview/default URLs.');
  }
  if (!checks.dns.ok && !checks.dns.skipped) {
    actions.push('Configure DNS for the candidate domain and wait for public resolution.');
  }
  if (!checks.health.ok && !checks.health.skipped) {
    actions.push('Deploy EdgeOne production, configure runtime environment, and verify /api/health over HTTPS.');
  }
  actions.push('After this report is ready, add the exact origin to WeChat request合法域名 and set TARO_APP_EDGEONE_API_BASE_URL in GitHub wechat-production.');
  return [...new Set(actions)];
}

function renderText(report) {
  return [
    `WeChat request domain candidate ready: ${report.ready ? 'yes' : 'no'}`,
    `Origin: ${report.origin}`,
    ...Object.entries(report.checks).map(([name, check]) => `- ${name}: ${check.ok ? 'ok' : 'not ready'} - ${check.message}`),
    'Next actions:',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
  ].join('\n');
}

function splitList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function parseArgs(values) {
  const parsed = { json: false, skipNetwork: false };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--json') {
      parsed.json = true;
      continue;
    }
    if (key === '--skip-network') {
      parsed.skipNetwork = true;
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${key}`);
    if (key === '--api-base-url') parsed.apiBaseUrl = value;
    else if (key === '--dns-result') parsed.dnsResult = value;
    else if (key === '--health-json') parsed.healthJson = value;
    else fail(`Unsupported domain candidate argument: ${key}`);
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
