import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const repoRoot = join(__dirname, '..', '..', '..');

function runNode(script: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
}

function runModule(code: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe('EdgeOne production release gates', () => {
  test('requires runtime environment checks, parses deployment origins, and validates health contract', async () => {
    const moduleUrl = pathToFileURL(join(repoRoot, 'scripts', 'edgeone-release-contracts.mjs')).href;
    const result = runModule(`
      import * as contracts from ${JSON.stringify(moduleUrl)};
      const deploymentMismatch = (() => { try { contracts.assertDeploymentOrigin('https://other.example.com', 'https://skill.example.com', false); return false; } catch { return true; } })();
      const mixedDeploymentOutput = (() => { try { contracts.assertDeploymentOrigin('deployed https://wrong.example.com also https://skill.example.com', 'https://skill.example.com', false); return false; } catch { return true; } })();
      const missingOrigin = (() => { try { contracts.assertDeploymentOrigin('deployment completed', 'https://skill.example.com', false); return false; } catch { return true; } })();
      const missingOriginAllowed = (() => { try { contracts.assertDeploymentOrigin('deployment completed', 'https://skill.example.com', true); return true; } catch { return false; } })();
      const healthy = (() => { try { contracts.assertHealthContract({ ok: true, data: { service: 'skillscope-edgeone', version: 'build-123', configurationReady: true, generationEnabled: true } }, { version: 'build-123', generationEnabled: true, requireVersion: true }); return true; } catch { return false; } })();
      const unhealthy = (() => { try { contracts.assertHealthContract({ ok: true, data: { service: 'skillscope-edgeone', version: 'build-123', configurationReady: false, generationEnabled: true } }, { version: 'build-123', generationEnabled: true, requireVersion: true }); return false; } catch { return true; } })();
      console.log(JSON.stringify({
        completeMissing: contracts.getMissingRequiredRuntimeEnv({
          WECHAT_APP_ID: 'wx-runtime-appid',
          WECHAT_APP_SECRET: 'secret',
          SESSION_HMAC_KEY: 'session',
          OWNER_HMAC_KEY: 'owner',
          OPENID_ENCRYPTION_KEY: 'encrypted-openid-key',
          LLM_BASE_URL: 'https://llm.example.test',
          LLM_API_KEY: 'llm-secret',
          LLM_MODEL: 'model',
          GENERATION_ENABLED: 'true',
          EDGEONE_DEPLOYMENT_VERSION: 'build-123',
        }),
        incompleteMissing: contracts.getMissingRequiredRuntimeEnv({ WECHAT_APP_ID: 'wx-runtime-appid' }),
        origins: contracts.extractHttpsOrigins('deployed to https://skill.example.com/api/health and https://other.example.com'),
        deploymentMismatch,
        mixedDeploymentOutput,
        missingOrigin,
        missingOriginAllowed,
        healthy,
        unhealthy,
      }));
    `);
    expect(result.status).toBe(0);
    const contracts = JSON.parse(result.stdout);

    expect(contracts.completeMissing).toEqual([]);
    expect(contracts.incompleteMissing).toContain('WECHAT_APP_SECRET');
    expect(contracts.origins).toEqual(['https://skill.example.com', 'https://other.example.com']);
    expect(contracts.deploymentMismatch).toBe(true);
    expect(contracts.mixedDeploymentOutput).toBe(true);
    expect(contracts.missingOrigin).toBe(true);
    expect(contracts.missingOriginAllowed).toBe(true);
    expect(contracts.healthy).toBe(true);
    expect(contracts.unhealthy).toBe(true);
  });

  test('production deploy needs only deployment inputs and fails closed for mismatched CLI origins', () => {
    const temp = mkdtempSync(join(tmpdir(), 'edgeone-release-'));
    const fakeCli = join(temp, process.platform === 'win32' ? 'edgeone.cmd' : 'edgeone');
    if (process.platform === 'win32') {
      writeFileSync(fakeCli, '@echo off\r\necho deployed to https://wrong.example.com\r\nexit /b 0\r\n');
    } else {
      writeFileSync(fakeCli, '#!/bin/sh\necho deployed to https://wrong.example.com\nexit 0\n');
      chmodSync(fakeCli, 0o700);
    }
    const baseEnv = {
      ...process.env,
      NODE_ENV: 'test',
      EDGEONE_CLI_BIN: fakeCli,
      EDGEONE_API_TOKEN: 'token-that-must-not-appear',
      EDGEONE_PROJECT_NAME: 'skillscope',
      EDGEONE_DEPLOYMENT_VERSION: 'build-123',
      TARO_APP_EDGEONE_API_BASE_URL: 'https://skill.example.com',
    };

    const mismatch = runNode('scripts/edgeone-deploy.mjs', ['--production'], baseEnv);
    expect(mismatch.status).not.toBe(0);
    expect(`${mismatch.stdout}${mismatch.stderr}`).toMatch(/deployment origin/i);
    expect(`${mismatch.stdout}${mismatch.stderr}`).not.toContain('token-that-must-not-appear');
    rmSync(temp, { recursive: true, force: true });
  });

  test('miniprogram-ci creates and cleans an ephemeral private key from env pem', async () => {
    const moduleUrl = pathToFileURL(join(repoRoot, 'scripts', 'wechat-upload-tempfile.mjs')).href;
    const result = runModule(`
      import { existsSync } from 'node:fs';
      import { withEphemeralPrivateKeyFile } from ${JSON.stringify(moduleUrl)};
      let observedPath = '';
      let existedDuringCallback = false;
      try {
        await withEphemeralPrivateKeyFile('---PRIVATE KEY---', async (privateKeyPath) => {
          observedPath = privateKeyPath;
          existedDuringCallback = existsSync(privateKeyPath);
          throw new Error('upload failed');
        });
      } catch {}
      console.log(JSON.stringify({ observedPath, existedDuringCallback, existsAfter: existsSync(observedPath) }));
    `);
    expect(result.status).toBe(0);
    const cleanup = JSON.parse(result.stdout);

    expect(cleanup.observedPath).toMatch(/wechat-upload/);
    expect(cleanup.existedDuringCallback).toBe(true);
    expect(cleanup.existsAfter).toBe(false);
  });

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

  test('keeps production configuration in EdgeOne and GitHub limited to deployment and upload inputs', () => {
    const environmentTemplate = readFileSync(join(repoRoot, 'docs', 'wechat', 'edgeone-env.production.example'), 'utf8');
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'wechat-release.yml'), 'utf8');
    const docs = [
      'docs/wechat/deployment-runbook.md',
      'docs/wechat/release-checklist.md',
      'docs/wechat/go-live-operator-guide.md',
    ].map((path) => readFileSync(join(repoRoot, path), 'utf8')).join('\n');

    for (const name of [
      'WECHAT_APP_SECRET',
      'SESSION_HMAC_KEY',
      'OWNER_HMAC_KEY',
      'OPENID_ENCRYPTION_KEY',
      'LLM_BASE_URL',
      'LLM_API_KEY',
      'LLM_MODEL',
      'GENERATION_ENABLED',
    ]) {
      expect(environmentTemplate).toContain(`${name}=`);
      expect(workflow).not.toContain(`secrets.${name}`);
    }

    expect(environmentTemplate).not.toMatch(/EDGEONE_API_TOKEN=|TARO_APP_EDGEONE_API_BASE_URL=/);
    expect(environmentTemplate).toMatch(/GENERATION_ENABLED=false/);
    expect(workflow).toMatch(/environment:\s*\n\s+name: wechat-production/);
    expect(workflow).toMatch(/Deploy EdgeOne production/);
    expect(workflow.indexOf('Deploy EdgeOne production')).toBeLessThan(workflow.indexOf('Run formal release verification'));
    expect(workflow).not.toMatch(/cloudbase|TARO_APP_CLOUDBASE_ENV_ID/i);
    expect(workflow).toContain('secrets.EDGEONE_API_TOKEN');
    expect(workflow).toContain('secrets.EDGEONE_PROJECT_NAME');
    expect(workflow).toContain('secrets.EDGEONE_DEPLOYMENT_VERSION');
    expect(workflow).toContain('secrets.TARO_APP_EDGEONE_API_BASE_URL');
    expect(workflow).toContain('secrets.WECHAT_APP_ID');
    expect(workflow).toContain('secrets.WECHAT_PRIVATE_KEY_PEM');
    expect(docs).toMatch(/免费|free tier|免费额度/i);
    expect(docs).toMatch(/熔断|GENERATION_ENABLED/);
    expect(docs).toMatch(/LLM.*(?:计费|收费|cost)/i);
    expect(docs).toMatch(/request合法域名/);
    expect(docs).toMatch(/轮换|rotation/i);
  });
});
