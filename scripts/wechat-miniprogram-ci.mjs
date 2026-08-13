import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withEphemeralPrivateKeyFile } from './wechat-upload-tempfile.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? 'dry-run';
const projectPath = resolve(repoRoot, args['project-path'] ?? process.env.WECHAT_MINIPROGRAM_PROJECT_PATH ?? 'apps/wechat');
const appid = args.appid ?? process.env.WECHAT_APP_ID ?? '';
const configuredPrivateKeyPath = args['private-key-path'] ?? process.env.WECHAT_PRIVATE_KEY_PATH ?? '';
const privateKeyPem = process.env.WECHAT_PRIVATE_KEY_PEM ?? '';
const robot = Number.parseInt(args.robot ?? process.env.WECHAT_CI_ROBOT ?? '1', 10);
const version = args.version ?? process.env.WECHAT_RELEASE_VERSION ?? readPackageVersion();
const description = args.description ?? process.env.WECHAT_RELEASE_DESC ?? 'SkillScope release candidate';
const qrcodeOutputDest = args['qrcode-output'] ?? process.env.WECHAT_CI_QRCODE_OUTPUT ?? 'docs/wechat/release-evidence/preview-qrcode.png';

if (!['dry-run', 'preview', 'upload'].includes(mode)) {
  fail(`Unsupported miniprogram-ci mode: ${mode}`);
}
if (!existsSync(join(projectPath, 'project.config.json'))) {
  fail(`project.config.json not found under ${projectPath}`);
}
if (!Number.isInteger(robot) || robot < 1 || robot > 30) {
  fail('WECHAT_CI_ROBOT must be an integer from 1 to 30');
}
if (version.trim().length === 0 || description.trim().length === 0) {
  fail('version and description are required');
}

if (mode === 'dry-run') {
  const projectConfig = JSON.parse(readFileSync(join(projectPath, 'project.config.json'), 'utf8'));
  process.stdout.write(JSON.stringify({
    mode,
    projectPath: relativePath(projectPath),
    appid: appid ? '<provided>' : projectConfig.appid,
    privateKeyPath: configuredPrivateKeyPath || privateKeyPem ? '<redacted>' : '<not-required-for-dry-run>',
    robot,
    version,
    description,
    miniprogramRoot: projectConfig.miniprogramRoot,
  }, null, 2));
  process.stdout.write('\nminiprogram-ci dry run passed\n');
  process.exit(0);
}

if (!/^wx[0-9a-z]{8,}$/i.test(appid)) {
  fail('WECHAT_APP_ID must be a real wx AppID for preview/upload');
}
if (configuredPrivateKeyPath.trim().length === 0 && privateKeyPem.trim().length === 0) {
  fail('WECHAT_PRIVATE_KEY_PATH or WECHAT_PRIVATE_KEY_PEM is required for preview/upload');
}

const require = createRequire(import.meta.url);
const ci = require('miniprogram-ci');

if (configuredPrivateKeyPath.trim()) {
  if (!existsSync(configuredPrivateKeyPath)) {
    fail('WECHAT_PRIVATE_KEY_PATH must point to the downloaded upload private key for preview/upload');
  }
  await runCi(configuredPrivateKeyPath);
} else {
  await withEphemeralPrivateKeyFile(privateKeyPem, runCi);
}

async function runCi(privateKeyPath) {
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*', 'test/**/*', 'src/**/*', '.swc/**/*'],
  });

  if (mode === 'preview') {
    const result = await ci.preview({
      project,
      desc: description,
      setting: { minify: true, es6: true },
      qrcodeFormat: 'image',
      qrcodeOutputDest,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\nminiprogram-ci preview completed\n`);
  } else {
    const result = await ci.upload({
      project,
      version,
      desc: description,
      robot,
      setting: { minify: true, es6: true },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\nminiprogram-ci upload completed\n`);
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key.startsWith('--')) {
      parsed[key.slice(2)] = values[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readPackageVersion() {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
}

function relativePath(value) {
  return value.startsWith(repoRoot) ? value.slice(repoRoot.length + 1) : value;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
