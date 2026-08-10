import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));

if (args.file) {
  verifyDisclosure({
    file: resolve(repoRoot, args.file),
    mode: args.mode ?? 'development',
    dist: args.dist === undefined ? undefined : resolve(repoRoot, args.dist),
  });
  process.stdout.write(`release disclosure ${args.mode ?? 'development'} verification passed\n`);
} else {
  verifyReleaseCandidate({
    profile: args.profile ?? 'development',
    checkOnly: args['check-only'] === true,
    preflightOnly: args['preflight-only'] === true,
    disclosureFile: args['disclosure-file'],
  });
}

function verifyReleaseCandidate({ profile, checkOnly, preflightOnly, disclosureFile: selectedDisclosureFile }) {
  if (!['development', 'trial', 'formal'].includes(profile)) {
    fail([`Unsupported release profile: ${profile}`]);
  }
  if (profile === 'formal' && checkOnly) {
    fail(['formal profile check-only is not allowed; run the full formal verifier or formal preflight command']);
  }
  if (preflightOnly && profile !== 'formal') {
    fail(['preflight-only is only supported by the formal profile']);
  }

  const disclosureFile = selectedDisclosureFile ?? (profile === 'formal'
    ? 'docs/wechat/release-disclosure.production.template.json'
    : 'docs/wechat/release-disclosure.development.json');
  const mode = profile === 'formal' ? 'production' : 'development';
  const evidence = [];

  verifyStaticReleaseContracts(profile, { inspectDist: false });
  evidence.push(`static contracts: passed for ${profile}`);

  if (profile === 'formal') {
    verifyFormalPreflight(disclosureFile);
    evidence.push('formal preflight: passed');
  }

  if (preflightOnly) {
    process.stdout.write('formal release preflight passed; full release verification was not run\n');
    process.stdout.write('external blockers recorded\n');
    return;
  }

  if (checkOnly) {
    process.stdout.write('release candidate static verification passed\n');
    process.stdout.write('external blockers recorded\n');
    return;
  }

  cleanReleaseArtifacts();
  evidence.push('clean release artifacts: apps/wechat/dist and services/cloudbase/dist removed');

  const buildEnv = {
    ...process.env,
    TARO_APP_RELEASE_PROFILE: profile,
    TARO_APP_RELEASE_FIXTURE_MODE: 'disabled',
    TARO_APP_RELEASE_DISCLOSURE_FILE: disclosureFile,
    TARO_APP_CLOUDBASE_ENV_ID: process.env.TARO_APP_CLOUDBASE_ENV_ID
      ?? (profile === 'formal' ? '' : 'release-development-public-env'),
  };

  const commands = [
    ['npm', ['run', 'test', '--', '--runInBand']],
    ['npm', ['run', 'test:wechat', '--', '--runInBand']],
    ['npm', ['run', 'test:cloudbase', '--', '--runInBand']],
    ['npm', ['run', 'typecheck']],
    ['npm', ['run', 'typecheck:wechat']],
    ['npm', ['run', 'typecheck:cloudbase']],
    ['npm', ['run', 'build:cloudbase']],
    ['npm', ['run', 'build:web']],
    ['npm', ['run', 'verify:web']],
    ['npm', ['run', 'verify:assets']],
    ['npm', ['run', 'build:weapp'], { env: buildEnv }],
    ['npm', ['run', 'scan:secrets:source']],
    ['npm', ['run', 'scan:secrets:wechat-dist']],
  ];

  for (const [command, commandArgs, options] of commands) {
    const result = run(command, commandArgs, options);
    evidence.push(formatCommandEvidence(command, commandArgs, result));
    if (result.status !== 0) {
      writeCandidateEvidence(profile, evidence, []);
      fail([`command failed: ${command} ${commandArgs.join(' ')}`]);
    }
  }

  const disclosureResult = run(process.execPath, [
    'scripts/verify-wechat-release.mjs',
    '--file', disclosureFile,
    '--mode', mode,
    ...(mode === 'production' ? ['--dist', 'apps/wechat/dist'] : []),
  ]);
  evidence.push(formatCommandEvidence(process.execPath, [
    'scripts/verify-wechat-release.mjs',
    '--file', disclosureFile,
    '--mode', mode,
    ...(mode === 'production' ? ['--dist', 'apps/wechat/dist'] : []),
  ], disclosureResult));
  if (disclosureResult.status !== 0) {
    writeCandidateEvidence(profile, evidence, []);
    process.stdout.write(disclosureResult.stdout);
    process.stderr.write(disclosureResult.stderr);
    process.exit(disclosureResult.status ?? 1);
  }

  const auditResult = run('npm', ['audit', '--omit=optional', '--json'], { timeout: 120_000 });
  evidence.push(formatCommandEvidence('npm', ['audit', '--omit=optional', '--json'], auditResult, true));

  const devtoolsResult = run(process.execPath, ['scripts/wechat-devtools-smoke.mjs'], { timeout: 30_000 });
  evidence.push(formatCommandEvidence(process.execPath, ['scripts/wechat-devtools-smoke.mjs'], devtoolsResult, true));

  verifyStaticReleaseContracts(profile, { inspectDist: true });
  const hashes = hashArtifacts([
    'apps/wechat/dist/app.json',
    'apps/wechat/dist/app.js',
    'services/cloudbase/dist/cloudbaserc.json',
  ]);
  writeCandidateEvidence(profile, evidence, hashes);

  process.stdout.write(`release candidate verification passed for ${profile}\n`);
  process.stdout.write('external blockers recorded\n');
}

function verifyDisclosure({ file, mode, dist, requireDist = true }) {
  if (mode !== 'development' && mode !== 'production') {
    fail([`Unsupported mode: ${mode}`]);
  }
  if (!existsSync(file)) {
    fail([`${file} does not exist`]);
  }

  const disclosure = JSON.parse(readFileSync(file, 'utf8'));
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
  const missing = required.filter((field) => !isNonEmpty(disclosure[field]));

  if (disclosure.environment !== mode) {
    fail([`release disclosure environment must be ${mode}`]);
  }

  if (mode === 'production') {
    const placeholders = required.filter((field) => isPlaceholder(disclosure[field]));
    if (missing.length > 0 || placeholders.length > 0) {
      fail([...missing, ...placeholders].map((field) => `${field} is required for production`));
    }
    if (requireDist && !dist) fail(['--dist is required for production']);
    if (dist) verifyBuiltDisclosure(dist, disclosure, required);
  }

  if (mode === 'development' && missing.length > 0) {
    fail(missing.map((field) => `${field} is required`));
  }
}

function verifyStaticReleaseContracts(profile, options = { inspectDist: true }) {
  const requiredFiles = [
    'docs/wechat/privacy-policy.zh-CN.md',
    'docs/wechat/privacy-data-map.md',
    'docs/wechat/operations-runbook.md',
    'docs/wechat/release-profiles.md',
    'docs/wechat/release-audit.md',
    'docs/wechat/release-evidence/2026-08-10-local-release-candidate.md',
    'docs/wechat/release-evidence/external-smoke-checklist.md',
    'docs/wechat/release-evidence/screenshot-naming.md',
    'apps/wechat/project.config.json',
    'apps/wechat/project.private.config.example.json',
    'services/cloudbase/deploy/cloudbaserc.json',
    'services/cloudbase/database/indexes.json',
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));
  if (missing.length > 0) fail(missing.map((file) => `${file} is required`));

  const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  if (rootPackage.scripts?.['verify:wechat-release'] !== 'node scripts/verify-wechat-release.mjs --profile development') {
    fail(['package.json is missing verify:wechat-release']);
  }

  const publicConfig = JSON.parse(readFileSync(join(repoRoot, 'apps/wechat/project.config.json'), 'utf8'));
  if (publicConfig.appid !== 'touristappid') {
    fail(['shared project.config.json must keep touristappid; use project.private.config.json locally']);
  }
  if (publicConfig.miniprogramRoot !== 'dist/') fail(['project.config.json miniprogramRoot must be dist/']);

  const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
  for (const pattern of ['apps/wechat/project.private.config.json', 'apps/wechat/private.*.key']) {
    if (!gitignore.includes(pattern)) fail([`.gitignore must include ${pattern}`]);
  }

  const sourceConfig = readFileSync(join(repoRoot, 'apps/wechat/src/app.config.ts'), 'utf8');
  const requiredPages = [
    'pages/generate/index',
    'pages/answer/index',
    'pages/result/index',
    'pages/history/index',
    'pages/settings/index',
    'pages/privacy/index',
    'pages/report/index',
  ];
  const absentPages = requiredPages.filter((page) => !sourceConfig.includes(page));
  if (absentPages.length > 0) fail(absentPages.map((page) => `missing route ${page}`));

  const cloudbaserc = JSON.parse(readFileSync(join(repoRoot, 'services/cloudbase/deploy/cloudbaserc.json'), 'utf8'));
  const rulesDirectory = join(repoRoot, 'services/cloudbase/database/security-rules');
  const rules = existsSync(rulesDirectory)
    ? readdirSync(rulesDirectory).filter((name) => name.endsWith('.json'))
    : [];
  if (rules.length < 5) fail(['CloudBase per-collection security rules are required']);
  const functionNames = new Set(cloudbaserc.functions?.map((entry) => entry.name));
  const requiredFunctions = [
    'create-generation-job',
    'get-generation-job',
    'get-assessment',
    'update-assessment',
    'list-assessments',
    'complete-assessment',
    'get-user-settings',
    'update-user-settings',
    'create-report',
    'generation-worker',
    'retention-cleanup',
  ];
  const absentFunctions = requiredFunctions.filter((name) => !functionNames.has(name));
  if (absentFunctions.length > 0) fail(absentFunctions.map((name) => `missing CloudBase function ${name}`));
  const retention = cloudbaserc.functions.find((entry) => entry.name === 'retention-cleanup');
  if (!Array.isArray(retention?.triggers) || retention.triggers.every((trigger) => trigger.type !== 'timer')) {
    fail(['retention-cleanup must include a timer trigger']);
  }
  const worker = cloudbaserc.functions.find((entry) => entry.name === 'generation-worker');
  const workerTimer = worker?.triggers?.find((trigger) => trigger.type === 'timer');
  if (workerTimer?.config !== '0 */1 * * * * *') {
    fail(['generation-worker must include the controlled one-minute timer trigger']);
  }
  const inputModerationConfig = JSON.parse(readFileSync(join(repoRoot, 'services/cloudbase/functions/create-generation-job/config.json'), 'utf8'));
  if (!inputModerationConfig.permissions?.openapi?.includes('security.msgSecCheck')) {
    fail(['create-generation-job must declare the WeChat security.msgSecCheck capability']);
  }
  const invokeRules = JSON.parse(readFileSync(join(repoRoot, 'services/cloudbase/database/function-invoke-rules.json'), 'utf8'));
  if (invokeRules['generation-worker']?.invoke !== false && invokeRules['*']?.invoke !== false) {
    fail(['generation-worker must remain denied to client invocation']);
  }

  if (options.inspectDist) {
    for (const entry of cloudbaserc.functions) {
      const bundlePath = join(repoRoot, 'services/cloudbase/dist', entry.name, 'index.js');
      const packagePath = join(repoRoot, 'services/cloudbase/functions', entry.name, 'package.json');
      if (!existsSync(bundlePath) || !existsSync(packagePath)) continue;
      const bundle = readFileSync(bundlePath, 'utf8');
      const functionPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
      if (bundle.includes('require("wx-server-sdk")') && functionPackage.dependencies?.['wx-server-sdk'] !== '4.0.2') {
        fail([`${entry.name} must declare pinned wx-server-sdk@4.0.2`]);
      }
    }
  }

  if (profile === 'formal') {
    const envId = process.env.TARO_APP_CLOUDBASE_ENV_ID?.trim() ?? '';
    if (envId.length === 0 || /(?:dev|test|placeholder|example|待配置)/i.test(envId)) {
      fail(['formal profile requires a production CloudBase environment id']);
    }
  }

  if (options.inspectDist) verifyNoFixtureInDistIfPresent();
}

function verifyFormalPreflight(disclosureFile) {
  verifyDisclosure({
    file: resolve(repoRoot, disclosureFile),
    mode: 'production',
    requireDist: false,
  });
  const missing = [];
  if (process.env.SKILLSCOPE_ENV !== 'production') missing.push('SKILLSCOPE_ENV must be production');
  verifyFormalConfigurationValue('CONTENT_SAFETY_URL', process.env.CONTENT_SAFETY_URL, missing);
  verifyFormalConfigurationValue('CONTENT_SAFETY_API_KEY', process.env.CONTENT_SAFETY_API_KEY, missing);
  verifyFormalConfigurationValue('CONTENT_SAFETY_PROVIDER', process.env.CONTENT_SAFETY_PROVIDER, missing);
  if (process.env.SKILLSCOPE_ALLOW_UNSAFE_MODERATION === 'true') {
    missing.push('SKILLSCOPE_ALLOW_UNSAFE_MODERATION cannot be true for formal release');
  }
  if (isNonEmpty(process.env.CONTENT_SAFETY_URL)) {
    try {
      const url = new URL(process.env.CONTENT_SAFETY_URL);
      if (url.protocol !== 'https:' || url.username || url.password) missing.push('CONTENT_SAFETY_URL must be a credential-free HTTPS URL');
    } catch {
      missing.push('CONTENT_SAFETY_URL must be a valid HTTPS URL');
    }
  }
  if (missing.length > 0) fail(missing);
}

function verifyFormalConfigurationValue(name, value, findings) {
  if (!isNonEmpty(value)) {
    findings.push(`${name} is required`);
  } else if (isPlaceholder(value)) {
    findings.push(`${name} cannot be a placeholder`);
  }
}

function cleanReleaseArtifacts() {
  for (const path of ['apps/wechat/dist', 'services/cloudbase/dist']) {
    rmSync(join(repoRoot, path), { recursive: true, force: true });
  }
}

function verifyBuiltDisclosure(directory, disclosure, fields) {
  const packagedText = readableFiles(directory)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (/待配置|\\u5f85\\u914d\\u7f6e/i.test(packagedText)) {
    fail(['dist contains a release disclosure placeholder']);
  }
  const absent = fields.filter((field) => !packagedText.includes(disclosure[field]));
  if (absent.length > 0) {
    fail(absent.map((field) => `dist does not contain matching ${field}`));
  }
}

function verifyNoFixtureInDistIfPresent() {
  const dist = join(repoRoot, 'apps/wechat/dist');
  if (!existsSync(dist)) return;
  const packagedText = readableFiles(dist)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (/SKILLSCOPE_RELEASE_FIXTURE_MODE|fixture-assessment-|fixture-job-|Release fixture question/i.test(packagedText)) {
    fail(['dist contains deterministic release fixture code']);
  }
}

function writeCandidateEvidence(profile, commandEvidence, hashes) {
  const directory = join(repoRoot, 'docs/wechat/release-evidence');
  mkdirSync(directory, { recursive: true });
  const lines = [
    '# 2026-08-10 本地发布候选验证输出',
    '',
    `Profile: ${profile}`,
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Commands',
    '',
    ...commandEvidence,
    '',
    '## Artifact Hashes',
    '',
    ...(hashes.length === 0 ? ['暂无；验证在构建完成前中断。'] : hashes.map((item) => `- ${item.path}: ${item.sha256}`)),
    '',
    '## External Blockers',
    '',
    '- 仍需真实 WeChat AppID、登录态、上传私钥、CloudBase 环境和真机预览结果。',
    '- 当前证据只覆盖本机可执行验证，不声明微信审核或真机通过。',
    '',
  ];
  writeFileSync(join(directory, '2026-08-10-command-output.md'), `${lines.join('\n')}\n`);
}

function hashArtifacts(paths) {
  return paths
    .filter((path) => existsSync(join(repoRoot, path)))
    .map((path) => {
      const content = readFileSync(join(repoRoot, path));
      return { path, sha256: createHash('sha256').update(content).digest('hex') };
    });
}

function readableFiles(directory) {
  const paths = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) paths.push(...readableFiles(path));
    else if (['.js', '.json', '.wxml', '.wxss', '.map', '.txt'].includes(extname(path))) paths.push(path);
  }
  return paths;
}

function run(command, commandArgs, options = {}) {
  const executable = resolveCommand(command, commandArgs);
  return spawnSync(executable.command, executable.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 25 * 1024 * 1024,
    timeout: options.timeout ?? 600_000,
    ...options,
    env: options.env ?? process.env,
  });
}

function resolveCommand(command, commandArgs) {
  if (process.platform === 'win32' && command === 'npm') {
    return { command: 'cmd.exe', args: ['/d', '/c', 'npm', ...commandArgs] };
  }
  return { command, args: commandArgs };
}

function formatCommandEvidence(command, commandArgs, result, informational = false) {
  const status = result.error !== undefined
    ? `error ${result.error.message}`
    : result.status === null
      ? `signal ${result.signal}`
      : `exit ${result.status}`;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const tail = output
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .slice(-20)
    .map((line) => line.trimEnd())
    .join('\n');
  return [
    `### ${command} ${commandArgs.join(' ')}`,
    '',
    `Status: ${status}${informational ? ' (informational)' : ''}`,
    '',
    '```text',
    redact(tail),
    '```',
    '',
  ].join('\n');
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--file' || key === '--mode' || key === '--dist' || key === '--profile' || key === '--disclosure-file') {
      parsed[key.slice(2)] = values[index + 1];
      index += 1;
    } else if (key === '--check-only' || key === '--preflight-only') {
      parsed[key.slice(2)] = true;
    }
  }
  return parsed;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlaceholder(value) {
  return typeof value !== 'string'
    || /待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}

function redact(value) {
  const cwd = repoRoot.replace(/\\/g, '\\\\');
  return value
    .replace(new RegExp(cwd, 'gi'), '<repo>')
    .replace(/(privateKeyPath|WECHAT_PRIVATE_KEY_PATH|CONTENT_SAFETY_API_KEY|LLM_API_KEY)[^\r\n]*/gi, '$1=<redacted>');
}

function fail(messages) {
  process.stderr.write(`${messages.join('\n')}\n`);
  process.exit(1);
}
