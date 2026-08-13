import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';
import { inspectDns, inspectHealth, parseOrigin } from './wechat-domain-readiness.mjs';

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
  const parsed = parseOrigin(apiBaseUrl, { requireRoot: true });

  checks.originRoot = parsed.ok
    ? { ok: true, message: 'HTTPS origin root format is valid.' }
    : { ok: false, message: parsed.message };

  checks.stableHost = parsed.ok && !isPreviewOrDefaultHost(parsed.url.hostname)
    ? { ok: true, message: 'Host is not a known preview/default EdgeOne host.' }
    : { ok: false, message: parsed.ok ? 'Do not use edgeone.cool or tokenized preview/default domains as WeChat production request合法域名.' : 'Stable host check skipped because the URL is not a valid origin root.' };

  checks.productionShape = isProductionEdgeOneApiBaseUrl(apiBaseUrl)
    ? { ok: true, message: 'Origin passes production URL shape validation.' }
    : { ok: false, message: 'Origin must be a stable public HTTPS URL, not localhost, example, preview, tokenized, IP-only, or a URL with /api.' };

  checks.dns = await inspectDns(parsed, options, options.dnsResult ? 'DNS result supplied for offline verification.' : 'DNS resolves publicly.');
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

function isPreviewOrDefaultHost(hostname) {
  return /\.edgeone\.cool$/i.test(hostname);
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
    if (key === '--api-base-url' || key === '--url') parsed.apiBaseUrl = value;
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
