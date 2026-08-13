import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isProductionEdgeOneApiBaseUrl } from './wechat-release-validation.mjs';
import { inspectDns, inspectHealth, parseOrigin } from './wechat-domain-readiness.mjs';

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
const forbiddenGithubSecrets = [
  'TARO_APP_CLOUDBASE_ENV_ID',
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
for (const secret of githubEnvironment.forbiddenSecrets) {
  nextActions.push(`Remove ${secret} from GitHub environment ${githubEnvironmentName} before formal EdgeOne release.`);
}
if (!productionDisclosure.ready) {
  nextActions.push(`Create ${disclosureFile} with real non-placeholder production disclosure.`);
}
if (!apiOrigin.productionOrigin) {
  nextActions.push('Bind a stable production HTTPS origin root to EdgeOne and use it for WeChat request合法域名.');
}
for (const action of domainCandidate.nextActions) nextActions.push(action);
nextActions.push('Run verify:wechat-go-live without --skip-health after the production HTTPS origin is bound.');
const nextCommands = buildNextCommands({ apiBaseUrl, appId: args.appId ?? process.env.WECHAT_APP_ID, disclosureFile });

const report = {
  ready: githubEnvironment.missingSecrets.length === 0
    && githubEnvironment.forbiddenSecrets.length === 0
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
  nextCommands,
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
      forbiddenSecrets: [],
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
      forbiddenSecrets: forbiddenGithubSecrets.filter((secret) => present.has(secret)),
    };
  } catch {
    return {
      name,
      readable: false,
      presentSecrets: [],
      missingSecrets: requiredGithubSecrets,
      forbiddenSecrets: [],
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

function buildNextCommands({ apiBaseUrl, appId, disclosureFile }) {
  const origin = isProductionEdgeOneApiBaseUrl(apiBaseUrl) && !isEdgeOnePreviewHost(apiBaseUrl)
    ? apiBaseUrl.trim()
    : '<production-api-origin>';
  const miniProgramAppId = /^wx[0-9a-f]{16}$/i.test(String(appId ?? '').trim())
    ? String(appId).trim()
    : '<wechat-app-id>';
  return [
    `npm run wechat:domain-candidate -- --url ${origin} --json`,
    `npm run wechat:configure-production-secrets -- --api-base-url ${origin} --private-key-path <wechat-upload-private-key.pem>`,
    [
      'npm run wechat:create-production-disclosure --',
      '--product-version <product-version>',
      '--privacy-policy-version <privacy-policy-version>',
      '--service-operator <service-operator>',
      '--model-disclosure <model-disclosure>',
      '--generative-ai-registration <generative-ai-registration>',
      '--mini-program-filing <mini-program-filing>',
    ].join(' '),
    `node scripts/verify-wechat-disclosure.mjs --file ${disclosureFile} --mode production --dist apps/wechat/dist`,
    `npm run wechat:go-live-status -- --app-id ${miniProgramAppId} --api-base-url ${origin} --json`,
    `npm run verify:wechat-go-live -- --app-id ${miniProgramAppId} --api-base-url ${origin}`,
  ];
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
    'Next commands:',
    ...report.nextCommands.map((command) => `- ${command}`),
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
