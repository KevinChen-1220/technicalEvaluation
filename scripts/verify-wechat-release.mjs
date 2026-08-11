import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isProductionEdgeOneApiBaseUrl, verifyFormalPreflight } from './wechat-release-validation.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { inspectEdgeOneReleaseDocuments } = createRequire(import.meta.url)('./release-doc-contracts.cjs');
const args = parseReleaseArgs(process.argv.slice(2));
verifyReleaseCandidate({
  profile: args.profile ?? 'development',
  checkOnly: args['check-only'] === true,
  disclosureFile: args['disclosure-file'],
});

function verifyReleaseCandidate({ profile, checkOnly, disclosureFile: selectedDisclosureFile }) {
  if (!['development', 'trial', 'formal'].includes(profile)) {
    fail([`Unsupported release profile: ${profile}`]);
  }
  if (profile === 'formal' && checkOnly) {
    fail(['formal profile check-only is not allowed; run the full formal verifier or formal preflight command']);
  }

  const disclosureFile = selectedDisclosureFile ?? (profile === 'formal'
    ? 'docs/wechat/release-disclosure.production.template.json'
    : 'docs/wechat/release-disclosure.development.json');
  const mode = profile === 'formal' ? 'production' : 'development';
  const evidence = [];

  verifyStaticReleaseContracts(profile, { inspectDist: false });
  evidence.push(`static contracts: passed for ${profile}`);

  if (profile === 'formal') {
    verifyFormalPreflight({ repoRoot, disclosureFile });
    evidence.push('formal preflight: passed');
  }

  if (checkOnly) {
    process.stdout.write('release candidate static verification passed\n');
    process.stdout.write('external blockers recorded\n');
    return;
  }

  cleanReleaseArtifacts();
  evidence.push('clean release artifacts: apps/wechat/dist removed');

  const buildEnv = {
    ...process.env,
    TARO_APP_RELEASE_PROFILE: profile,
    TARO_APP_RELEASE_FIXTURE_MODE: 'disabled',
    TARO_APP_RELEASE_DISCLOSURE_FILE: disclosureFile,
    TARO_APP_EDGEONE_API_BASE_URL: process.env.TARO_APP_EDGEONE_API_BASE_URL
      ?? (profile === 'formal' ? '' : 'https://release-development.edgeone.run'),
  };

  const commands = [
    ['npm', ['run', 'test', '--', '--runInBand']],
    ['npm', ['run', 'test:wechat', '--', '--runInBand']],
    ['npm', ['run', 'test:edgeone', '--', '--runInBand']],
    ['npm', ['run', 'typecheck']],
    ['npm', ['run', 'typecheck:wechat']],
    ['npm', ['run', 'typecheck:edgeone']],
    ['npm', ['run', 'build:edgeone']],
    ['npm', ['run', 'build:web']],
    ['npm', ['run', 'verify:web']],
    ['npm', ['run', 'verify:assets']],
    ['npm', ['run', 'verify:github-workflows']],
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
    'scripts/verify-wechat-disclosure.mjs',
    '--file', disclosureFile,
    '--mode', mode,
    ...(mode === 'production' ? ['--dist', 'apps/wechat/dist'] : []),
  ]);
  evidence.push(formatCommandEvidence(process.execPath, [
    'scripts/verify-wechat-disclosure.mjs',
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
    'services/edgeone/edgeone.json',
  ]);
  writeCandidateEvidence(profile, evidence, hashes);

  process.stdout.write(`release candidate verification passed for ${profile}\n`);
  process.stdout.write('external blockers recorded\n');
}

function verifyStaticReleaseContracts(profile, options = { inspectDist: true }) {
  const requiredFiles = [
    'docs/wechat/privacy-policy.zh-CN.md',
    'docs/wechat/privacy-data-map.md',
    'docs/wechat/operations-runbook.md',
    'docs/wechat/release-checklist.md',
    'docs/wechat/deployment-runbook.md',
    'docs/wechat/review-submission.md',
    'docs/wechat/release-completion-matrix.md',
    'docs/wechat/release-profiles.md',
    'docs/wechat/release-audit.md',
    'docs/wechat/release-evidence/2026-08-10-local-release-candidate.md',
    'docs/wechat/release-evidence/external-smoke-checklist.md',
    'docs/wechat/release-evidence/screenshot-naming.md',
    'docs/wechat/release-manifest.template.json',
    '.github/workflows/wechat-release.yml',
    '.github/ISSUE_TEMPLATE/wechat_filing.yml',
    '.github/ISSUE_TEMPLATE/wechat_production_smoke.yml',
    'apps/wechat/project.config.json',
    'apps/wechat/project.private.config.example.json',
    'services/edgeone/edgeone.json',
    'services/edgeone/cloud-functions/api/session.js',
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));
  if (missing.length > 0) fail(missing.map((file) => `${file} is required`));

  const documentFindings = inspectEdgeOneReleaseDocuments({
    checklist: readFileSync(join(repoRoot, 'docs/wechat/release-checklist.md'), 'utf8'),
    deployment: readFileSync(join(repoRoot, 'docs/wechat/deployment-runbook.md'), 'utf8'),
    manifest: readFileSync(join(repoRoot, 'docs/wechat/release-manifest.template.json'), 'utf8'),
    relatedDocuments: [
      'docs/wechat/go-live-operator-guide.md',
      'docs/wechat/operations-runbook.md',
      'docs/wechat/privacy-policy.zh-CN.md',
      'docs/wechat/privacy-data-map.md',
      'docs/wechat/review-submission.md',
      'docs/wechat/release-completion-matrix.md',
      'docs/wechat/release-profiles.md',
      'docs/wechat/release-audit.md',
      'docs/wechat/release-evidence/external-smoke-checklist.md',
      '.github/ISSUE_TEMPLATE/wechat_filing.yml',
      '.github/ISSUE_TEMPLATE/wechat_production_smoke.yml',
    ].map((file) => ({ label: file, source: readFileSync(join(repoRoot, file), 'utf8') })),
  });
  if (documentFindings.length > 0) fail(documentFindings);

  const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  if (rootPackage.scripts?.['verify:wechat-release'] !== 'node scripts/verify-wechat-release.mjs --profile development') {
    fail(['package.json is missing verify:wechat-release']);
  }
  if (rootPackage.scripts?.['verify:github-workflows'] !== 'node scripts/verify-github-workflows.mjs') {
    fail(['package.json is missing verify:github-workflows']);
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

  verifyNoLegacyClientConfiguration(options.inspectDist);

  const edgeone = JSON.parse(readFileSync(join(repoRoot, 'services/edgeone/edgeone.json'), 'utf8'));
  if (edgeone.cloudFunctions?.nodejs?.maxDuration !== 120) fail(['EdgeOne Node Functions must allow the 120-second generation budget']);
  const requiredFunctions = ['health.js', 'session.js', 'generation.js', 'settings.js', 'reports.js', 'assessments/[[path]].js'];
  const absentFunctions = requiredFunctions.filter((file) => !existsSync(join(repoRoot, 'services/edgeone/cloud-functions/api', file)));
  if (absentFunctions.length > 0) fail(absentFunctions.map((file) => `missing EdgeOne function ${file}`));

  if (profile === 'formal') {
    if (!isProductionEdgeOneApiBaseUrl(process.env.TARO_APP_EDGEONE_API_BASE_URL)) fail(['formal profile requires a production HTTPS EdgeOne API origin root']);
  }

  if (options.inspectDist) verifyNoFixtureInDistIfPresent();
}

function cleanReleaseArtifacts() {
  for (const path of ['apps/wechat/dist']) {
    rmSync(join(repoRoot, path), { recursive: true, force: true });
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

function verifyNoLegacyClientConfiguration(inspectDist) {
  const paths = [join(repoRoot, 'apps/wechat/src'), join(repoRoot, 'apps/wechat/config')];
  if (inspectDist && existsSync(join(repoRoot, 'apps/wechat/dist'))) paths.push(join(repoRoot, 'apps/wechat/dist'));
  const forbidden = [
    /TARO_APP_CLOUDBASE_ENV_ID/,
    /Taro\.cloud\.callFunction/,
    /(?:LLM_API_KEY|LLM_BASE_URL|LLM_MODEL|WECHAT_APP_SECRET|SESSION_HMAC_KEY|OWNER_HMAC_KEY|OPENID_ENCRYPTION_KEY)/,
  ];
  const findings = paths.flatMap((directory) => readableFiles(directory).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return forbidden.filter((pattern) => pattern.test(source)).map((pattern) => `${relative(repoRoot, path)} contains forbidden client configuration ${pattern}`);
  }));
  if (findings.length > 0) fail(findings);
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
    '- 仍需真实 WeChat AppID、登录态、上传私钥、EdgeOne HTTPS 域名和真机预览结果。',
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

function parseReleaseArgs(values) {
  const parsed = {};
  const formalRequested = values.some((value, index) => value === '--profile' && values[index + 1] === 'formal');
  const valueArguments = new Set(['--profile', '--disclosure-file']);
  const booleanArguments = new Set(['--check-only']);

  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!valueArguments.has(key) && !booleanArguments.has(key)) {
      fail([formalRequested
        ? `formal profile has unsupported argument ${key}`
        : `Unsupported release argument ${key}`]);
    }
    const name = key.slice(2);
    if (parsed[name] !== undefined) {
      fail([formalRequested
        ? `formal profile does not allow duplicate argument ${key}`
        : `Duplicate release argument ${key}`]);
    }
    if (booleanArguments.has(key)) {
      parsed[name] = true;
      continue;
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail([formalRequested
        ? `formal profile requires a value for ${key}`
        : `Missing value for release argument ${key}`]);
    }
    parsed[name] = value;
    index += 1;
  }
  return parsed;
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
