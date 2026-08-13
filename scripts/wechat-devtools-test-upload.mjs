import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const defaultCli = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const cli = args.cli ?? process.env.WECHAT_DEVTOOLS_CLI ?? defaultCli;
const projectPath = resolve(repoRoot, args['project-path'] ?? 'apps/wechat');
const version = args.version ?? process.env.WECHAT_TEST_VERSION ?? buildDefaultVersion();
const description = args.description ?? process.env.WECHAT_TEST_DESCRIPTION ?? 'SkillScope EdgeOne test build';
const evidencePath = resolve(repoRoot, args.evidence ?? 'docs/wechat/release-evidence/devtools-test-upload.md');
const previewQrcodeOutput = args['preview-qrcode-output'] === undefined
  ? undefined
  : resolve(repoRoot, args['preview-qrcode-output']);

if (!existsSync(cli)) fail('WeChat DevTools CLI is not installed or WECHAT_DEVTOOLS_CLI points to a missing file');
if (!existsSync(join(projectPath, 'project.config.json'))) fail(`project.config.json not found under ${projectPath}`);
if (!existsSync(join(projectPath, 'project.private.config.json'))) fail('project.private.config.json with a real AppID is required for DevTools test upload');
if (!existsSync(join(projectPath, 'dist', 'app.js'))) fail('apps/wechat/dist is missing; run npm run build:weapp before DevTools test upload');
if (!isSafeUploadVersion(version)) fail('test upload version must be 1-64 characters and contain only letters, numbers, dots, underscores, or hyphens');
if (description.trim().length === 0) fail('test upload description is required');

const appid = readPrivateAppId(projectPath);
if (!/^wx[0-9a-f]{16}$/i.test(appid)) fail('project.private.config.json must contain the real WeChat Mini Program AppID');

const commands = [
  ['islogin', ['islogin']],
  ['upload', ['upload', '--project', projectPath, '--version', version, '--desc', description, '--info-output', temporaryInfoPath('upload')]],
];
if (previewQrcodeOutput !== undefined) {
  commands.push([
    'preview',
    ['preview', '--project', projectPath, '--qr-format', 'image', '--qr-output', previewQrcodeOutput, '--info-output', temporaryInfoPath('preview')],
  ]);
}

const evidence = [
  '# WeChat DevTools Test Upload Evidence',
  '',
  `AppID: ${appid}`,
  `Version: ${version}`,
  `Description: ${description}`,
  `Project: ${projectPath}`,
  previewQrcodeOutput === undefined ? 'Preview QR: not requested' : `Preview QR: ${previewQrcodeOutput}`,
  '',
];

for (const [label, commandArgs] of commands) {
  const runnable = buildCommand(cli, commandArgs);
  const result = spawnSync(runnable.command, runnable.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: sanitizeEnv(runnable.env ?? process.env),
  });
  evidence.push(`## ${label}`);
  evidence.push('');
  evidence.push(`Status: ${formatStatus(result)}`);
  evidence.push('');
  evidence.push('```text');
  evidence.push(summarizeOutput(redact(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim())));
  evidence.push('```');
  evidence.push('');
  if (result.error !== undefined || result.status !== 0) {
    writeEvidence(evidence);
    fail(`WeChat DevTools ${label} failed; evidence written to ${evidencePath}`);
  }
}

writeEvidence(evidence);
process.stdout.write(`WeChat DevTools test upload completed: appid=${appid} version=${version}\n`);
process.stdout.write(`Evidence: ${evidencePath}\n`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith('--')) fail(`Unsupported test upload argument: ${key}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for test upload argument: ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function readPrivateAppId(path) {
  try {
    const config = JSON.parse(readFileSync(join(path, 'project.private.config.json'), 'utf8'));
    return typeof config.appid === 'string' ? config.appid.trim() : '';
  } catch {
    return '';
  }
}

function temporaryInfoPath(kind) {
  return join(repoRoot, 'docs', 'wechat', 'release-evidence', `devtools-test-${kind}-info.json`);
}

function writeEvidence(lines) {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${lines.join('\n')}\n`);
}

function buildCommand(command, commandArgs) {
  if (process.platform !== 'win32' || !/\.(?:bat|cmd)$/i.test(command)) {
    return { command, args: commandArgs };
  }
  const installRoot = dirname(command);
  const electron = findWindowsElectronExecutable(installRoot);
  const cliEntry = join(installRoot, 'resources', 'app.asar.unpacked', 'js', 'common', 'cli', 'index.js');
  if (!existsSync(cliEntry)) {
    return { command: 'cmd.exe', args: ['/d', '/c', command, ...commandArgs] };
  }
  const bootstrap = "const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,'--ms-enable-electron-run-as-node',e,'--electron'].concat(a);require(e)";
  return {
    command: electron,
    args: ['-e', bootstrap, cliEntry, ...commandArgs],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON: '',
      cwd: process.cwd(),
    },
  };
}

function findWindowsElectronExecutable(installRoot) {
  const candidates = readdirSync(installRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
    .map((entry) => join(installRoot, entry.name))
    .filter((path) => {
      try {
        return !/node(?:-18)?\.exe|wxfilewatcher|notification_helper|wechatdevtools|卸载/u.test(path)
          && existsSync(path);
      } catch {
        return false;
      }
    });
  return candidates[0] ?? join(installRoot, '微信开发者工具.exe');
}

function sanitizeEnv(source) {
  const env = { ...source };
  delete env.WECHAT_PRIVATE_KEY_PEM;
  delete env.WECHAT_PRIVATE_KEY_PATH;
  return env;
}

function redact(value) {
  return value
    .replaceAll(repoRoot, '<repo>')
    .replace(/(privateKeyPath|token|secret|key)[^\r\n]*/gi, '$1=<redacted>');
}

function summarizeOutput(value) {
  const lines = value.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length <= 80) return lines.join('\n');
  return [
    ...lines.slice(0, 40),
    `... ${lines.length - 80} lines omitted ...`,
    ...lines.slice(-40),
  ].join('\n');
}

function formatStatus(result) {
  if (result.error !== undefined) return `error ${result.error.message}`;
  if (result.status !== null) return `exit ${result.status}`;
  return `signal ${result.signal ?? 'unknown'}`;
}

function buildDefaultVersion() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `1.0.0-test.${date}`;
}

function isSafeUploadVersion(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value.trim());
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
