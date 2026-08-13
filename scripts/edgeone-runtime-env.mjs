import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const appId = args.appId ?? process.env.WECHAT_APP_ID;
const version = args.version ?? currentGitHead();

if (!isValidMiniProgramAppId(appId)) fail('A valid WeChat Mini Program AppID is required via --app-id or WECHAT_APP_ID');
if (!isSafeVersion(version)) fail('A valid deployment version is required via --version or git HEAD');

const values = {
  WECHAT_APP_ID: appId,
  WECHAT_APP_SECRET: 'replace-in-edgeone-console-only',
  SESSION_HMAC_KEY: randomSecret(),
  OWNER_HMAC_KEY: randomSecret(),
  OPENID_ENCRYPTION_KEY: randomSecret(),
  LLM_BASE_URL: 'replace-with-provider-base-url',
  LLM_API_KEY: 'replace-in-edgeone-console-only',
  LLM_MODEL: 'replace-with-provider-model',
  GENERATION_ENABLED: 'false',
  EDGEONE_DEPLOYMENT_VERSION: version,
};

process.stdout.write([
  '# Paste these values into the EdgeOne project runtime environment only.',
  '# Do not save this output in Git, GitHub Secrets, screenshots, issues, or Mini Program build env.',
  ...Object.entries(values).map(([name, value]) => `${name}=${value}`),
  '',
].join('\n'));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--app-id') {
      parsed.appId = values[index + 1];
      index += 1;
    } else if (value === '--version') {
      parsed.version = values[index + 1];
      index += 1;
    } else {
      fail(`Unsupported runtime env argument: ${value}`);
    }
  }
  return parsed;
}

function currentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function randomSecret() {
  return randomBytes(32).toString('base64');
}

function isValidMiniProgramAppId(value) {
  return typeof value === 'string' && /^wx[0-9a-f]{16}$/i.test(value.trim());
}

function isSafeVersion(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value.trim());
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
