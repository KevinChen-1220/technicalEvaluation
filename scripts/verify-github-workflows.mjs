import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDirectory = join(repoRoot, '.github', 'workflows');
const issueTemplateDirectory = join(repoRoot, '.github', 'ISSUE_TEMPLATE');
const releaseWorkflowPath = readReleaseWorkflowPath(process.argv.slice(2));
const findings = [];

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

  const secretReferences = collectSecretReferences(workflow);
  for (const reference of secretReferences) {
    if (!isUploadEnvironmentPath(reference.path)) {
      fail(`secret references are only allowed in upload job env: ${reference.name} at ${reference.path.join('.')}`);
    }
  }
  if (secretReferences.some((reference) => reference.path[1] === 'release-checks')) {
    fail('release-checks job must not reference secrets');
  }

  const uploadIf = String(upload.if ?? '');
  if (uploadIf !== "github.event_name == 'workflow_dispatch' && inputs.publish_target == 'upload'") {
    fail('upload job must be workflow_dispatch-only');
  }
  if (!isExactEnvironment(upload.environment, 'wechat-production')) {
    fail('upload environment must be exactly wechat-production');
  }

  const requiredSecrets = [
    'WECHAT_APP_ID',
    'WECHAT_PRIVATE_KEY_PEM',
    'TARO_APP_CLOUDBASE_ENV_ID',
    'CONTENT_SAFETY_URL',
    'CONTENT_SAFETY_API_KEY',
    'CONTENT_SAFETY_PROVIDER',
  ];
  const configuredSecrets = new Set(secretReferences.map((reference) => reference.name));
  for (const secret of requiredSecrets) {
    if (!configuredSecrets.has(secret)) fail(`upload job is missing required upload secret ${secret}`);
  }

  const uploadRuns = workflowRuns(upload);
  const formalCommand = 'npm run verify:wechat-release:formal';
  const uploadCommand = 'npm run wechat:ci:upload';
  const formalIndexes = commandStartIndexes(uploadRuns, formalCommand);
  const uploadIndexes = commandStartIndexes(uploadRuns, uploadCommand);
  if (formalIndexes.length !== 1) {
    fail(`upload job must have exactly one run starting with ${formalCommand}`);
  }
  if (uploadIndexes.length !== 1) {
    fail(`upload job must have exactly one run starting with ${uploadCommand}`);
  }
  if (formalIndexes.length === 1 && uploadIndexes.length === 1 && formalIndexes[0] >= uploadIndexes[0]) {
    fail('formal release verification must run before upload');
  }
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

function workflowRuns(job) {
  if (!Array.isArray(job.steps)) return [];
  return job.steps
    .map((step) => isRecord(step) && typeof step.run === 'string' ? step.run : null)
    .filter((run) => run !== null);
}

function commandStartIndexes(runs, command) {
  const indexes = [];
  for (const [index, run] of runs.entries()) {
    const firstLine = run.trimStart().split(/\r?\n/, 1)[0].trimEnd();
    if (firstLine === command || firstLine.startsWith(`${command} `)) indexes.push(index);
  }
  return indexes;
}

function collectSecretReferences(value, path = [], references = []) {
  if (typeof value === 'string') {
    for (const expression of value.matchAll(/\$\{\{([\s\S]*?)}}/g)) {
      for (const match of expression[1].matchAll(/\bsecrets\.([a-z_][a-z0-9_]*)\b/gi)) {
        references.push({ name: match[1].toUpperCase(), path });
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

function isUploadEnvironmentPath(path) {
  if (path[0] !== 'jobs' || path[1] !== 'upload') return false;
  if (path[2] === 'env' && path.length === 4) return true;
  return path[2] === 'steps'
    && Number.isInteger(path[3])
    && path[4] === 'env'
    && path.length === 6;
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
