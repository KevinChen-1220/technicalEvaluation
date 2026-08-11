import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

function runNode(script: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
}

describe('EdgeOne production release gates', () => {
  test('ships a credential-free release verifier and a dry-run deployment wrapper', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

    expect(packageJson.scripts['verify:edgeone-release']).toBe('node scripts/verify-edgeone-release.mjs');
    expect(packageJson.scripts['edgeone:deploy']).toBe('node scripts/edgeone-deploy.mjs');
    expect(packageJson.devDependencies.edgeone).toBe('1.6.23');
    expect(existsSync(join(repoRoot, 'scripts', 'verify-edgeone-release.mjs'))).toBe(true);
    expect(existsSync(join(repoRoot, 'scripts', 'edgeone-deploy.mjs'))).toBe(true);

    const verify = runNode('scripts/verify-edgeone-release.mjs', ['--check-only']);
    expect(verify.status).toBe(0);

    const dryRun = runNode('scripts/edgeone-deploy.mjs', ['--dry-run']);
    expect(dryRun.status).toBe(0);
    expect(`${dryRun.stdout}${dryRun.stderr}`).not.toMatch(/edgeone[_-]?api[_-]?token|llm_api_key|openid_encryption_key|[A-Za-z]:\\[^\r\n]+/i);

    const deploymentWrapper = readFileSync(join(repoRoot, 'scripts', 'edgeone-deploy.mjs'), 'utf8');
    expect(deploymentWrapper).toMatch(/const serviceRoot = join\(repoRoot, 'services', 'edgeone'\)/);
    expect(deploymentWrapper).toMatch(/cwd: serviceRoot/);
  });

  test('verifies the EdgeOne artifact, 120-second budget, fixed 50-question contract, and public HTTPS origin', () => {
    const verifier = readFileSync(join(repoRoot, 'scripts', 'verify-edgeone-release.mjs'), 'utf8');
    const edgeoneConfig = readFileSync(join(repoRoot, 'services', 'edgeone', 'edgeone.json'), 'utf8');
    const generationRoute = readFileSync(join(repoRoot, 'services', 'edgeone', 'src', 'routes', 'generation.ts'), 'utf8');

    expect(edgeoneConfig).toMatch(/"maxDuration"\s*:\s*120/);
    expect(generationRoute).toMatch(/generateFiftyQuestionAssessment|questionCount:\s*50|FIXED_QUESTION_COUNT/);
    expect(verifier).toMatch(/test:edgeone/);
    expect(verifier).toMatch(/typecheck:edgeone/);
    expect(verifier).toMatch(/build:edgeone/);
    expect(verifier).toMatch(/120-second|120 second|maxDuration/);
    expect(verifier).toMatch(/questionCount|50 questions|FIXED_QUESTION_COUNT/);
    expect(verifier).toMatch(/https/i);
    expect(verifier).toMatch(/scan:secrets:source/);
    expect(verifier).toMatch(/scan:secrets:wechat-dist/);
    expect(verifier).toMatch(/cloud-functions\/api/);
    expect(verifier).toMatch(/CloudBase|CLOUDBASE/);
  });

  test('keeps production configuration server-only, complete, and free-tier gated', () => {
    const environmentTemplate = readFileSync(join(repoRoot, 'docs', 'wechat', 'edgeone-env.production.example'), 'utf8');
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'wechat-release.yml'), 'utf8');
    const docs = [
      'docs/wechat/deployment-runbook.md',
      'docs/wechat/release-checklist.md',
      'docs/wechat/go-live-operator-guide.md',
    ].map((path) => readFileSync(join(repoRoot, path), 'utf8')).join('\n');

    for (const name of [
      'EDGEONE_API_TOKEN',
      'EDGEONE_PROJECT_NAME',
      'WECHAT_APP_ID',
      'WECHAT_APP_SECRET',
      'SESSION_HMAC_KEY',
      'OWNER_HMAC_KEY',
      'OPENID_ENCRYPTION_KEY',
      'LLM_BASE_URL',
      'LLM_API_KEY',
      'LLM_MODEL',
      'GENERATION_ENABLED',
      'EDGEONE_DEPLOYMENT_VERSION',
    ]) {
      expect(environmentTemplate).toContain(`${name}=`);
    }

    expect(environmentTemplate).toMatch(/TARO_APP_EDGEONE_API_BASE_URL/);
    expect(environmentTemplate).toMatch(/GENERATION_ENABLED=false/);
    expect(workflow).toMatch(/environment:\s*\n\s+name: wechat-production/);
    expect(workflow).toMatch(/Deploy EdgeOne production/);
    expect(workflow.indexOf('Deploy EdgeOne production')).toBeLessThan(workflow.indexOf('Run formal release verification'));
    expect(workflow).not.toMatch(/cloudbase|TARO_APP_CLOUDBASE_ENV_ID/i);
    expect(docs).toMatch(/免费|free tier|免费额度/i);
    expect(docs).toMatch(/熔断|GENERATION_ENABLED/);
    expect(docs).toMatch(/LLM.*(?:计费|收费|cost)/i);
    expect(docs).toMatch(/request合法域名/);
    expect(docs).toMatch(/轮换|rotation/i);
  });
});
