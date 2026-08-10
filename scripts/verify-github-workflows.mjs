import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'yaml';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDirectory = join(repoRoot, '.github', 'workflows');
const issueTemplateDirectory = join(repoRoot, '.github', 'ISSUE_TEMPLATE');
const releaseWorkflowPath = readReleaseWorkflowPath(process.argv.slice(2));
const findings = [];
const checkoutAction = 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
const setupNodeAction = 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38';

const releaseCheckStepAllowlist = [
  { name: 'Checkout', uses: checkoutAction },
  {
    name: 'Set up Node.js',
    uses: setupNodeAction,
    with: { 'node-version': 22, cache: 'npm' },
  },
  { name: 'Install dependencies', run: 'npm ci' },
  { name: 'Verify GitHub workflow YAML', run: 'npm run verify:github-workflows' },
  { name: 'Run shared tests', run: 'npm test -- --runInBand' },
  { name: 'Run WeChat tests', run: 'npm run test:wechat -- --runInBand' },
  { name: 'Run CloudBase tests', run: 'npm run test:cloudbase -- --runInBand' },
  { name: 'Check root types', run: 'npm run typecheck' },
  { name: 'Check WeChat types', run: 'npm run typecheck:wechat' },
  { name: 'Check CloudBase types', run: 'npm run typecheck:cloudbase' },
  { name: 'Build CloudBase artifacts', run: 'npm run build:cloudbase' },
  { name: 'Build web app', run: 'npm run build:web' },
  { name: 'Verify web metadata', run: 'npm run verify:web' },
  { name: 'Verify native brand assets', run: 'npm run verify:assets' },
  {
    name: 'Build WeChat Mini Program',
    run: 'npm run build:weapp',
    env: {
      TARO_APP_RELEASE_PROFILE: 'development',
      TARO_APP_RELEASE_FIXTURE_MODE: 'disabled',
      TARO_APP_CLOUDBASE_ENV_ID: 'release-development-public-env',
      TARO_APP_RELEASE_DISCLOSURE_FILE: 'docs/wechat/release-disclosure.development.json',
    },
  },
  { name: 'Scan source for committed credentials', run: 'npm run scan:secrets:source' },
  { name: 'Scan WeChat dist for server-only names', run: 'npm run scan:secrets:wechat-dist' },
  { name: 'Run release verifier static checks', run: 'npm run verify:wechat-release -- --check-only' },
  {
    name: 'Run miniprogram-ci dry run',
    run: 'npm run wechat:ci:dry-run -- --version "0.0.0-ci" --description "GitHub release dry run"',
  },
];

const uploadStepAllowlist = [
  { name: 'Checkout', uses: checkoutAction },
  {
    name: 'Set up Node.js',
    uses: setupNodeAction,
    with: { 'node-version': 22, cache: 'npm' },
  },
  { name: 'Install dependencies', run: 'npm ci' },
  {
    name: 'Verify production disclosure file exists',
    run: 'test -n "$DISCLOSURE_FILE" && test -f "$DISCLOSURE_FILE"',
    env: { DISCLOSURE_FILE: '${{ inputs.disclosure_file }}' },
  },
  {
    name: 'Write WeChat upload key',
    shell: 'bash',
    env: { WECHAT_PRIVATE_KEY_PEM: '${{ secrets.WECHAT_PRIVATE_KEY_PEM }}' },
    run: [
      'test -n "$WECHAT_PRIVATE_KEY_PEM"',
      'umask 077',
      'printf \'%s\' "$WECHAT_PRIVATE_KEY_PEM" > "$RUNNER_TEMP/wechat-upload.key"',
    ].join('\n'),
  },
  {
    name: 'Run formal release verification',
    run: 'npm run verify:wechat-release:formal -- --disclosure-file "$DISCLOSURE_FILE"',
    env: {
      DISCLOSURE_FILE: '${{ inputs.disclosure_file }}',
      TARO_APP_CLOUDBASE_ENV_ID: '${{ secrets.TARO_APP_CLOUDBASE_ENV_ID }}',
      SKILLSCOPE_ENV: 'production',
      SKILLSCOPE_ALLOW_UNSAFE_MODERATION: 'false',
      CONTENT_SAFETY_URL: '${{ secrets.CONTENT_SAFETY_URL }}',
      CONTENT_SAFETY_API_KEY: '${{ secrets.CONTENT_SAFETY_API_KEY }}',
      CONTENT_SAFETY_PROVIDER: '${{ secrets.CONTENT_SAFETY_PROVIDER }}',
    },
  },
  {
    name: 'Upload to WeChat draft',
    run: 'npm run wechat:ci:upload',
    env: {
      WECHAT_APP_ID: '${{ secrets.WECHAT_APP_ID }}',
      WECHAT_PRIVATE_KEY_PATH: '${{ runner.temp }}/wechat-upload.key',
      WECHAT_RELEASE_VERSION: '${{ inputs.release_version }}',
      WECHAT_RELEASE_DESC: '${{ inputs.release_description }}',
      WECHAT_CI_ROBOT: '${{ inputs.robot }}',
    },
  },
];

verifyWorkflowSyntax();
verifyPackageScripts();
verifyWeChatReleaseWorkflow();
verifyReleaseIssueTemplates();

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('GitHub workflow verification passed\n');

function verifyWorkflowSyntax() {
  if (!existsSync(workflowDirectory)) fail('.github/workflows is missing');
  const workflows = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/i.test(name));
  if (workflows.length === 0) fail('no GitHub workflow YAML files found');
  for (const workflow of workflows) {
    const path = join(workflowDirectory, workflow);
    const parsed = parseYamlFile(path);
    verifyActionPins(path, parsed);
    verifyInputsAreNotInterpolatedInRunBlocks(path, parsed);
  }
}

function verifyPackageScripts() {
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const required = [
    'verify:github-workflows',
    'verify:wechat-release',
    'verify:wechat-release:formal',
    'verify:wechat-release:formal-preflight',
    'wechat:ci:dry-run',
    'wechat:ci:upload',
  ];
  for (const script of required) {
    if (!rootPackage.scripts?.[script]) fail(`package.json script ${script} is missing`);
  }
}

function verifyWeChatReleaseWorkflow() {
  const workflowPath = releaseWorkflowPath ?? join(workflowDirectory, 'wechat-release.yml');
  if (!existsSync(workflowPath)) fail('.github/workflows/wechat-release.yml is missing');

  const workflow = parseYamlFile(workflowPath);
  verifyActionPins(workflowPath, workflow);
  verifyInputsAreNotInterpolatedInRunBlocks(workflowPath, workflow);
  const on = workflow.on ?? workflow.true;
  const jobs = workflow.jobs ?? {};
  const releaseChecks = jobs['release-checks'];
  const upload = jobs.upload;

  if (!isRecord(on) || !Object.hasOwn(on, 'pull_request')) {
    fail('wechat-release workflow must run release checks on pull_request');
  }
  if (!isRecord(on) || !Object.hasOwn(on, 'workflow_dispatch')) {
    fail('wechat-release workflow must expose workflow_dispatch');
  }
  if (isRecord(on) && Object.hasOwn(on, 'pull_request_target')) {
    fail('wechat-release workflow must not use pull_request_target');
  }
  if (!releaseChecks) fail('wechat-release workflow is missing release-checks job');
  if (!upload) fail('wechat-release workflow is missing upload job');
  if (!isRecord(releaseChecks) || !isRecord(upload)) return;

  verifyCanonicalSteps('release-checks', releaseChecks.steps, releaseCheckStepAllowlist);
  verifyCanonicalSteps('upload', upload.steps, uploadStepAllowlist);

  verifyReadOnlyPermissions('workflow', workflow.permissions);
  for (const [jobName, job] of Object.entries(jobs)) {
    if (isRecord(job)) verifyReadOnlyPermissions(jobName, job.permissions);
  }

  const needs = Array.isArray(upload.needs) ? upload.needs : [upload.needs];
  if (needs.length !== 1 || needs[0] !== 'release-checks') {
    fail('upload.needs must contain exactly release-checks');
  }

  const releaseCheckRuns = workflowRuns(releaseChecks);
  const requiredReleaseCheckCommands = [
    'npm run verify:github-workflows',
    'npm run verify:wechat-release -- --check-only',
    'npm run wechat:ci:dry-run -- --version "0.0.0-ci" --description "GitHub release dry run"',
  ];
  for (const command of requiredReleaseCheckCommands) {
    if (!releaseCheckRuns.some((run) => run === command)) {
      fail(`release-checks must run the exact command: ${command}`);
    }
  }

  const uploadIf = String(upload.if ?? '');
  if (uploadIf !== "github.event_name == 'workflow_dispatch' && inputs.publish_target == 'upload'") {
    fail('upload job must be workflow_dispatch-only');
  }
  if (!isExactEnvironment(upload.environment, 'wechat-production')) {
    fail('upload environment must be exactly wechat-production');
  }
  if (Object.hasOwn(upload, 'timeout-minutes')) {
    fail('upload job must not define timeout-minutes');
  }
  if (hasRunShell(workflow.defaults) || hasRunShell(upload.defaults)) {
    fail('upload job must use the GitHub default shell failure propagation');
  }

  const uploadSteps = Array.isArray(upload.steps) ? upload.steps : [];
  const protectedStepSpecs = [
    {
      label: 'WeChat upload key',
      name: 'Write WeChat upload key',
      bindings: [
        ['WECHAT_PRIVATE_KEY_PEM', 'WECHAT_PRIVATE_KEY_PEM'],
      ],
    },
    {
      label: 'formal release verification',
      name: 'Run formal release verification',
      command: 'npm run verify:wechat-release:formal -- --disclosure-file "$DISCLOSURE_FILE"',
      bindings: [
        ['TARO_APP_CLOUDBASE_ENV_ID', 'TARO_APP_CLOUDBASE_ENV_ID'],
        ['CONTENT_SAFETY_URL', 'CONTENT_SAFETY_URL'],
        ['CONTENT_SAFETY_API_KEY', 'CONTENT_SAFETY_API_KEY'],
        ['CONTENT_SAFETY_PROVIDER', 'CONTENT_SAFETY_PROVIDER'],
      ],
    },
    {
      label: 'WeChat upload',
      name: 'Upload to WeChat draft',
      command: 'npm run wechat:ci:upload',
      bindings: [
        ['WECHAT_APP_ID', 'WECHAT_APP_ID'],
      ],
    },
  ];

  const protectedSteps = new Map();
  for (const spec of protectedStepSpecs) {
    const matches = uploadSteps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => isRecord(step) && step.name === spec.name);
    if (matches.length !== 1) {
      fail(`upload job must have exactly one ${spec.label} step`);
      continue;
    }
    const resolved = matches[0];
    protectedSteps.set(spec.name, resolved);
    if (spec.command) verifyCriticalUploadStep(spec.label, resolved.step, spec.command);
  }

  const formalStep = protectedSteps.get('Run formal release verification');
  const uploadStep = protectedSteps.get('Upload to WeChat draft');
  if (formalStep && uploadStep && formalStep.index >= uploadStep.index) {
    fail('formal release verification must run before upload');
  }

  verifySecretBindings(workflow, protectedStepSpecs, protectedSteps);
}

function verifyReleaseIssueTemplates() {
  const required = [
    'wechat_filing.yml',
    'wechat_production_smoke.yml',
  ];
  for (const file of required) {
    const path = join(issueTemplateDirectory, file);
    if (!existsSync(path)) fail(`${file} issue template is missing`);
    parseYamlFile(path);
  }
}

function parseYamlFile(path) {
  const document = yaml.parseDocument(readFileSync(path, 'utf8'), { prettyErrors: false });
  if (document.errors.length > 0) {
    fail(`${relative(path)} has YAML errors: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  if (document.warnings.length > 0) {
    fail(`${relative(path)} has YAML warnings: ${document.warnings.map((warning) => warning.message).join('; ')}`);
  }
  return document.toJSON();
}

function verifyActionPins(path, workflow) {
  walk(workflow, (value, key) => {
    if (key !== 'uses' || typeof value !== 'string') return;
    const match = value.match(/^(actions\/[a-z0-9-]+)@(.+)$/i);
    if (match && !/^[0-9a-f]{40}$/.test(match[2])) {
      fail(`${relative(path)} must pin ${match[1]} to a full commit SHA`);
    }
  });
}

function verifyInputsAreNotInterpolatedInRunBlocks(path, workflow) {
  walk(workflow, (value, key) => {
    if (key === 'run' && typeof value === 'string' && /\$\{\{\s*inputs\./.test(value)) {
      fail(`${relative(path)} must pass workflow_dispatch inputs through env, not run commands`);
    }
  });
}

function verifyReadOnlyPermissions(label, permissions) {
  if (!isRecord(permissions)
      || Object.keys(permissions).length !== 1
      || permissions.contents !== 'read') {
    fail(`${label} permissions must be exactly contents: read`);
  }
}

function verifyCanonicalSteps(label, actual, expected) {
  if (!Array.isArray(actual)
      || !isDeepStrictEqual(normalizeStepRuns(actual), normalizeStepRuns(expected))) {
    fail(`${label} steps must exactly match the canonical allowlist`);
  }
}

function normalizeStepRuns(value, key = null) {
  if (typeof value === 'string' && key === 'run') {
    return value.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeStepRuns(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, normalizeStepRuns(child, childKey)]),
    );
  }
  return value;
}

function workflowRuns(job) {
  if (!Array.isArray(job.steps)) return [];
  return job.steps
    .map((step) => isRecord(step) && typeof step.run === 'string' ? step.run : null)
    .filter((run) => run !== null);
}

function verifyCriticalUploadStep(label, step, command) {
  if (step.run !== command) {
    fail(`${label} step must use the exact command: ${command}`);
  }
  for (const property of ['if', 'continue-on-error', 'timeout-minutes']) {
    if (Object.hasOwn(step, property)) fail(`${label} step must not define ${property}`);
  }
  if (Object.hasOwn(step, 'shell')) {
    fail(`${label} step must use the default shell failure propagation`);
  }
}

function hasRunShell(defaults) {
  return isRecord(defaults)
    && isRecord(defaults.run)
    && Object.hasOwn(defaults.run, 'shell');
}

function verifySecretBindings(workflow, specs, protectedSteps) {
  const allowedReferences = new Map();
  for (const spec of specs) {
    const resolved = protectedSteps.get(spec.name);
    if (!resolved) continue;
    const env = isRecord(resolved.step.env) ? resolved.step.env : {};
    for (const [envKey, secretName] of spec.bindings) {
      const expected = `\${{ secrets.${secretName} }}`;
      if (!Object.hasOwn(env, envKey)) {
        fail(`upload job is missing required upload secret ${secretName}`);
      }
      if (env[envKey] !== expected) {
        fail(`secret binding ${envKey} must be exactly ${expected}`);
      }
      allowedReferences.set(
        ['jobs', 'upload', 'steps', resolved.index, 'env', envKey].join('.'),
        secretName,
      );
    }
  }

  for (const reference of collectSecretReferences(workflow)) {
    if (reference.dynamic) {
      fail(`dynamic secret indexes are not allowed at ${reference.path.join('.')}`);
      continue;
    }
    const path = reference.path.join('.');
    const allowedName = allowedReferences.get(path);
    if (!allowedName || allowedName !== reference.name) {
      fail(`secret references are only allowed in the corresponding protected upload step env: ${reference.name} at ${path}`);
    }
  }
}

function collectSecretReferences(value, path = [], references = []) {
  if (typeof value === 'string') {
    for (const expression of value.matchAll(/\$\{\{([\s\S]*?)}}/g)) {
      const body = expression[1];
      let matchedReferences = 0;
      for (const match of body.matchAll(
        /\bsecrets\s*(?:\.\s*([a-z_][a-z0-9_]*)|\[\s*(?:(['"])([a-z_][a-z0-9_]*)\2|([^\]]+))\s*\])/gi,
      )) {
        matchedReferences += 1;
        const staticName = match[1] ?? match[3];
        references.push({
          name: staticName ? staticName.toUpperCase() : '<dynamic>',
          path,
          dynamic: !staticName,
        });
      }
      const secretTokens = [...body.matchAll(/\bsecrets\b/gi)].length;
      for (let index = matchedReferences; index < secretTokens; index += 1) {
        references.push({ name: '<unparsed>', path, dynamic: true });
      }
    }
    return references;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSecretReferences(item, [...path, index], references));
    return references;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectSecretReferences(child, [...path, key], references);
    }
  }
  return references;
}

function isExactEnvironment(environment, expectedName) {
  if (typeof environment === 'string') return environment === expectedName;
  return isRecord(environment)
    && Object.keys(environment).length === 1
    && environment.name === expectedName;
}

function walk(value, visit, key = null) {
  visit(value, key);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
  } else if (isRecord(value)) {
    for (const [childKey, child] of Object.entries(value)) walk(child, visit, childKey);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readReleaseWorkflowPath(args) {
  const index = args.indexOf('--release-workflow');
  if (index < 0) return null;
  const path = args[index + 1];
  if (!path) throw new Error('--release-workflow requires a YAML file path');
  return path;
}

function relative(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function fail(message) {
  findings.push(message);
}
