import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDirectory = join(repoRoot, '.github', 'workflows');
const issueTemplateDirectory = join(repoRoot, '.github', 'ISSUE_TEMPLATE');
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
    parseYamlFile(path);
    verifyActionPins(path);
    verifyInputsAreNotInterpolatedInRunBlocks(path);
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
  const workflowPath = join(workflowDirectory, 'wechat-release.yml');
  if (!existsSync(workflowPath)) fail('.github/workflows/wechat-release.yml is missing');

  const text = readFileSync(workflowPath, 'utf8');
  const workflow = parseYamlFile(workflowPath);
  const on = workflow.on ?? workflow.true;
  const jobs = workflow.jobs ?? {};
  const releaseChecks = jobs['release-checks'];
  const upload = jobs.upload;

  if (!on?.pull_request) fail('wechat-release workflow must run release checks on pull_request');
  if (!on?.workflow_dispatch) fail('wechat-release workflow must expose workflow_dispatch');
  if (text.includes('pull_request_target')) fail('wechat-release workflow must not use pull_request_target');
  if (!releaseChecks) fail('wechat-release workflow is missing release-checks job');
  if (!upload) fail('wechat-release workflow is missing upload job');

  const releaseChecksText = section(text, 'release-checks:', 'upload:');
  if (JSON.stringify(releaseChecks).includes('secrets.')) {
    fail('release-checks job must not reference secrets');
  }
  if (!releaseChecksText.includes('npm run verify:github-workflows')) {
    fail('release-checks job must validate GitHub workflow YAML');
  }
  if (!releaseChecksText.includes('npm run verify:wechat-release -- --check-only')) {
    fail('release-checks job must run release verifier static checks without credentials');
  }
  if (!releaseChecksText.includes('npm run wechat:ci:dry-run')) {
    fail('release-checks job must run miniprogram-ci dry-run without credentials');
  }

  const uploadIf = String(upload.if ?? '');
  if (!uploadIf.includes("github.event_name == 'workflow_dispatch'")) {
    fail('upload job must be workflow_dispatch-only');
  }
  if (!uploadIf.includes("inputs.publish_target == 'upload'")) {
    fail('upload job must require the upload dispatch input');
  }
  const environment = typeof upload.environment === 'string'
    ? upload.environment
    : upload.environment?.name;
  if (environment !== 'wechat-production') {
    fail('upload job must target the protected wechat-production environment');
  }

  const uploadText = section(text, 'upload:', '');
  const requiredUploadSnippets = [
    'secrets.WECHAT_APP_ID',
    'secrets.WECHAT_PRIVATE_KEY_PEM',
    'secrets.TARO_APP_CLOUDBASE_ENV_ID',
    'secrets.CONTENT_SAFETY_URL',
    'secrets.CONTENT_SAFETY_API_KEY',
    'secrets.CONTENT_SAFETY_PROVIDER',
    'npm run verify:wechat-release:formal',
    'npm run wechat:ci:upload',
  ];
  for (const snippet of requiredUploadSnippets) {
    if (!uploadText.includes(snippet)) fail(`upload job is missing ${snippet}`);
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

function verifyActionPins(path) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/uses:\s+(actions\/[a-z0-9-]+)@([^\s]+)/gi)) {
    if (!/^[0-9a-f]{40}$/.test(match[2])) {
      fail(`${relative(path)} must pin ${match[1]} to a full commit SHA`);
    }
  }
}

function verifyInputsAreNotInterpolatedInRunBlocks(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  let runBlockIndent = null;
  for (const line of lines) {
    if (runBlockIndent !== null) {
      if (line.trim().length === 0) continue;
      const indent = line.match(/^\s*/)[0].length;
      if (indent <= runBlockIndent) {
        runBlockIndent = null;
      } else if (line.includes('${{ inputs.')) {
        fail(`${relative(path)} must pass workflow_dispatch inputs through env, not run blocks`);
      }
    }

    const runMatch = line.match(/^(\s*)run:\s*(.*)$/);
    if (!runMatch) continue;
    if (runMatch[2].includes('${{ inputs.')) {
      fail(`${relative(path)} must pass workflow_dispatch inputs through env, not run lines`);
    }
    if (/^[|>]/.test(runMatch[2].trim())) {
      runBlockIndent = runMatch[1].length;
    }
  }
}

function section(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return '';
  const endIndex = end.length === 0 ? text.length : text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex < 0 ? text.length : endIndex);
}

function relative(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function fail(message) {
  findings.push(message);
}
