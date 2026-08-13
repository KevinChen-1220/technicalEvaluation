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
  { name: 'Run EdgeOne tests', run: 'npm run test:edgeone -- --runInBand' },
  { name: 'Check root types', run: 'npm run typecheck' },
  { name: 'Check WeChat types', run: 'npm run typecheck:wechat' },
  { name: 'Check EdgeOne types', run: 'npm run typecheck:edgeone' },
  { name: 'Build EdgeOne artifacts', run: 'npm run build:edgeone' },
  { name: 'Run EdgeOne release gate', run: 'npm run verify:edgeone-release -- --check-only' },
  { name: 'Build web app', run: 'npm run build:web' },
  { name: 'Verify web metadata', run: 'npm run verify:web' },
  { name: 'Verify native brand assets', run: 'npm run verify:assets' },
  {
    name: 'Build WeChat Mini Program',
    run: 'npm run build:weapp',
    env: {
      TARO_APP_RELEASE_PROFILE: 'development',
      TARO_APP_RELEASE_FIXTURE_MODE: 'disabled',
      TARO_APP_EDGEONE_API_BASE_URL: 'https://release-development.edgeone.run',
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
    name: 'Run formal EdgeOne environment gate',
    run: 'npm run verify:edgeone-release -- --production --check-only',
    env: {
      EDGEONE_API_TOKEN: '${{ secrets.EDGEONE_API_TOKEN }}',
      EDGEONE_PROJECT_NAME: '${{ secrets.EDGEONE_PROJECT_NAME }}',
      EDGEONE_DEPLOYMENT_VERSION: '${{ secrets.EDGEONE_DEPLOYMENT_VERSION }}',
      TARO_APP_EDGEONE_API_BASE_URL: '${{ secrets.TARO_APP_EDGEONE_API_BASE_URL }}',
    },
  },
  {
    name: 'Deploy EdgeOne production',
    run: 'npm run edgeone:deploy -- --production --verify-runtime-env --verify-health',
    env: {
      EDGEONE_API_TOKEN: '${{ secrets.EDGEONE_API_TOKEN }}',
      EDGEONE_PROJECT_NAME: '${{ secrets.EDGEONE_PROJECT_NAME }}',
      EDGEONE_DEPLOYMENT_VERSION: '${{ secrets.EDGEONE_DEPLOYMENT_VERSION }}',
      TARO_APP_EDGEONE_API_BASE_URL: '${{ secrets.TARO_APP_EDGEONE_API_BASE_URL }}',
    },
  },
  {
    name: 'Run formal release verification',
    run: 'npm run verify:wechat-release:formal -- --disclosure-file "$DISCLOSURE_FILE"',
    env: {
      DISCLOSURE_FILE: '${{ inputs.disclosure_file }}',
      TARO_APP_EDGEONE_API_BASE_URL: '${{ secrets.TARO_APP_EDGEONE_API_BASE_URL }}',
      SKILLSCOPE_ENV: 'production',
    },
  },
  {
    name: 'Upload to WeChat draft',
    run: 'npm run wechat:ci:upload',
    env: {
      WECHAT_APP_ID: '${{ secrets.WECHAT_APP_ID }}',
      WECHAT_PRIVATE_KEY_PEM: '${{ secrets.WECHAT_PRIVATE_KEY_PEM }}',
      WECHAT_RELEASE_VERSION: '${{ inputs.release_version }}',
      WECHAT_RELEASE_DESC: '${{ inputs.release_description }}',
      WECHAT_CI_ROBOT: '${{ inputs.robot }}',
    },
  },
];

const releasePaths = [
  '.github/workflows/**',
  'apps/wechat/**',
  'docs/wechat/**',
  'packages/**',
  'scripts/**',
  'services/edgeone/**',
  'package.json',
  'package-lock.json',
];

const wechatReleaseWorkflowAllowlist = {
  name: 'WeChat Mini Program Release',
  on: {
    pull_request: { paths: releasePaths },
    push: { branches: ['main'], paths: releasePaths },
    workflow_dispatch: {
      inputs: {
        publish_target: {
          description: 'Run checks only or upload after protected approval',
          type: 'choice',
          required: true,
          default: 'checks',
          options: ['checks', 'upload'],
        },
        release_version: {
          description: 'WeChat upload version, for example 1.0.0',
          required: false,
          default: '1.0.0',
        },
        release_description: {
          description: 'WeChat upload description',
          required: false,
          default: 'SkillScope release candidate',
        },
        robot: {
          description: 'miniprogram-ci robot number 1-30',
          required: false,
          default: '1',
        },
        disclosure_file: {
          description: 'Production disclosure JSON path committed by the operator',
          required: false,
          default: 'docs/wechat/release-disclosure.production.json',
        },
      },
    },
  },
  permissions: { contents: 'read' },
  concurrency: {
    group: 'wechat-release-${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress': false,
  },
  jobs: {
    'release-checks': {
      'runs-on': 'ubuntu-latest',
      permissions: { contents: 'read' },
      steps: releaseCheckStepAllowlist,
    },
    upload: {
      if: "github.event_name == 'workflow_dispatch' && inputs.publish_target == 'upload'",
      needs: 'release-checks',
      'runs-on': 'ubuntu-latest',
      environment: { name: 'wechat-production' },
      permissions: { contents: 'read' },
      steps: uploadStepAllowlist,
    },
  },
};

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
    'verify:edgeone-release',
    'edgeone:deploy',
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
  verifyCanonicalWorkflow(workflow, wechatReleaseWorkflowAllowlist);
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
    'npm run verify:edgeone-release -- --check-only',
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
      label: 'formal EdgeOne environment gate',
      name: 'Run formal EdgeOne environment gate',
      command: 'npm run verify:edgeone-release -- --production --check-only',
      bindings: [
        ['EDGEONE_API_TOKEN', 'EDGEONE_API_TOKEN'],
        ['EDGEONE_PROJECT_NAME', 'EDGEONE_PROJECT_NAME'],
        ['EDGEONE_DEPLOYMENT_VERSION', 'EDGEONE_DEPLOYMENT_VERSION'],
        ['TARO_APP_EDGEONE_API_BASE_URL', 'TARO_APP_EDGEONE_API_BASE_URL'],
      ],
    },
    {
      label: 'EdgeOne deployment',
      name: 'Deploy EdgeOne production',
      command: 'npm run edgeone:deploy -- --production --verify-runtime-env --verify-health',
      bindings: [
        ['EDGEONE_API_TOKEN', 'EDGEONE_API_TOKEN'],
        ['EDGEONE_PROJECT_NAME', 'EDGEONE_PROJECT_NAME'],
        ['EDGEONE_DEPLOYMENT_VERSION', 'EDGEONE_DEPLOYMENT_VERSION'],
        ['TARO_APP_EDGEONE_API_BASE_URL', 'TARO_APP_EDGEONE_API_BASE_URL'],
      ],
    },
    {
      label: 'formal release verification',
      name: 'Run formal release verification',
      command: 'npm run verify:wechat-release:formal -- --disclosure-file "$DISCLOSURE_FILE"',
      bindings: [
        ['TARO_APP_EDGEONE_API_BASE_URL', 'TARO_APP_EDGEONE_API_BASE_URL'],
      ],
    },
    {
      label: 'WeChat upload',
      name: 'Upload to WeChat draft',
      command: 'npm run wechat:ci:upload',
      bindings: [
        ['WECHAT_APP_ID', 'WECHAT_APP_ID'],
        ['WECHAT_PRIVATE_KEY_PEM', 'WECHAT_PRIVATE_KEY_PEM'],
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

  const environmentGateStep = protectedSteps.get('Run formal EdgeOne environment gate');
  const deploymentStep = protectedSteps.get('Deploy EdgeOne production');
  const formalStep = protectedSteps.get('Run formal release verification');
  const uploadStep = protectedSteps.get('Upload to WeChat draft');
  if (environmentGateStep && deploymentStep && environmentGateStep.index >= deploymentStep.index) {
    fail('formal EdgeOne environment gate must run before deployment');
  }
  if (deploymentStep && formalStep && deploymentStep.index >= formalStep.index) {
    fail('EdgeOne deployment must complete before the production Mini Program build');
  }
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

function verifyCanonicalWorkflow(actual, expected) {
  const normalizedActual = normalizeStepRuns(actual);
  const normalizedExpected = normalizeStepRuns(expected);
  if (isDeepStrictEqual(normalizedActual, normalizedExpected)) return;

  const difference = findFirstDifference(normalizedActual, normalizedExpected);
  fail(`canonical workflow mismatch at ${formatPath(difference)}`);
}

function findFirstDifference(actual, expected, path = []) {
  if (isDeepStrictEqual(actual, expected)) return null;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return path;
    if (actual.length !== expected.length) return [...path, 'length'];
    for (let index = 0; index < expected.length; index += 1) {
      const difference = findFirstDifference(actual[index], expected[index], [...path, index]);
      if (difference) return difference;
    }
    return path;
  }
  if (isRecord(actual) || isRecord(expected)) {
    if (!isRecord(actual) || !isRecord(expected)) return path;
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) return [...path, key];
    }
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) return [...path, key];
      const difference = findFirstDifference(actual[key], expected[key], [...path, key]);
      if (difference) return difference;
    }
    return path;
  }
  return path;
}

function formatPath(path) {
  if (!path || path.length === 0) return '<root>';
  return path.reduce((result, part) => (
    typeof part === 'number' ? `${result}[${part}]` : result ? `${result}.${part}` : part
  ), '');
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
