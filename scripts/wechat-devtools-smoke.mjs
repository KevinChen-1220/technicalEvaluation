import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const defaultCli = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const cli = args.cli ?? process.env.WECHAT_DEVTOOLS_CLI ?? defaultCli;
const projectPath = resolve(repoRoot, args['project-path'] ?? 'apps/wechat');
const evidencePath = join(repoRoot, 'docs/wechat/release-evidence/2026-08-10-devtools-cli.md');

const evidence = [
  '# 2026-08-10 微信开发者工具 CLI 记录',
  '',
  `CLI: ${cli}`,
  `Project: ${projectPath}`,
  '',
];

if (!existsSync(cli)) {
  evidence.push('Status: 微信开发者工具 CLI 未安装或路径不存在。');
  writeEvidence(evidence);
  process.stdout.write('WeChat DevTools CLI missing; external blocker recorded\n');
  process.exit(0);
}

const cliState = findDevToolsCliState();
if (cliState.ready === false) {
  evidence.push('Status: 微信开发者工具已安装，但 CLI 用户态未初始化。');
  evidence.push('');
  evidence.push('```text');
  evidence.push(cliState.reason);
  evidence.push('```');
  evidence.push('');
  evidence.push('## Skipped Commands');
  evidence.push('');
  evidence.push('- `islogin`、`open --project`、`compile --project` 已作为外部 blocker 跳过，避免重复触发长时间 setlocal recursion 或 `.cli` 初始化失败。');
  evidence.push('- 先在微信开发者工具 GUI 中完成首次启动/登录并生成 User Data `.cli` 后，再重新运行 `npm run wechat:devtools:smoke`。');
  evidence.push('');
  evidence.push('## 结论');
  evidence.push('');
  evidence.push('- 未导入/编译/截图/真机验证；缺少 DevTools CLI 初始化态、真实 AppID 和登录态。');
  writeEvidence(evidence);
  process.stdout.write('WeChat DevTools CLI initialization blocker recorded\n');
  process.exit(0);
}

const commands = [
  ['islogin', ['islogin']],
  ['open project hidden', ['open', '--project', projectPath]],
  ['compile project', ['compile', '--project', projectPath]],
];

for (const [label, commandArgs] of commands) {
  const runnable = buildCommand(cli, commandArgs);
  const result = spawnSync(runnable.command, runnable.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: label === 'compile project' ? 20_000 : 10_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  evidence.push(`## ${label}`);
  evidence.push('');
  evidence.push(`Command: ${cli} ${commandArgs.join(' ')}`);
  evidence.push(`Status: ${formatStatus(result)}`);
  evidence.push('');
  evidence.push('```text');
  evidence.push(summarizeOutput(redact(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim())));
  evidence.push('```');
  evidence.push('');
  if (result.error !== undefined || result.status !== 0) {
    evidence.push('## Skipped Commands');
    evidence.push('');
    evidence.push('- 后续 DevTools 命令已跳过；请先完成登录/AppID/初始化后再重新运行。');
    evidence.push('');
    break;
  }
}

evidence.push('## 结论');
evidence.push('');
evidence.push('- 该文件记录 CLI 的真实返回；未登录、缺少 AppID 或无法初始化均作为外部 blocker 记录。');
evidence.push('- 未记录截图或真机通过，因为当前机器没有可验证的微信账号登录态和 AppID。');
writeEvidence(evidence);
process.stdout.write('WeChat DevTools CLI evidence recorded\n');

function writeEvidence(lines) {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${lines.join('\n')}\n`);
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

function redact(value) {
  return value
    .replaceAll(repoRoot, '<repo>')
    .replace(/(privateKeyPath|token|secret|key)[^\r\n]*/gi, '$1=<redacted>');
}

function buildCommand(command, commandArgs) {
  if (process.platform !== 'win32') {
    return { command, args: commandArgs };
  }
  const commandLine = `& ${quoteForPowerShell(command)} ${commandArgs.map(quoteForPowerShell).join(' ')}`.trim();
  return { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandLine] };
}

function formatStatus(result) {
  if (result.error !== undefined) {
    return `error ${result.error.message}`;
  }
  if (result.status !== null) {
    return `exit ${result.status}`;
  }
  return `signal ${result.signal ?? 'unknown'}`;
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

function quoteForPowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function findDevToolsCliState() {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData === undefined) {
    return { ready: false, reason: 'LOCALAPPDATA is unavailable; cannot locate WeChat DevTools User Data/.cli.' };
  }
  const userDataRoot = join(localAppData, '微信开发者工具', 'User Data');
  if (!existsSync(userDataRoot)) {
    return { ready: false, reason: `${userDataRoot} does not exist; DevTools has not completed first-run initialization for this user.` };
  }
  const cliFiles = findFilesNamed(userDataRoot, '.cli', 5);
  if (cliFiles.length === 0) {
    return { ready: false, reason: `${userDataRoot} exists, but no Default/.cli marker was found; earlier direct CLI islogin failed at initialization with missing .cli.` };
  }
  return { ready: true, reason: cliFiles[0] };
}

function findFilesNamed(directory, filename, remainingDepth) {
  if (remainingDepth < 0) return [];
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return [fullPath];
    if (entry.isDirectory()) return findFilesNamed(fullPath, filename, remainingDepth - 1);
    return [];
  });
}
