import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = join(__dirname, '..', '..', '..');

describe('WeChat release verification assets', () => {
  test('keeps Chinese privacy, data-map, operations, and environment templates in source control', () => {
    const requiredFiles = [
      'docs/wechat/privacy-policy.zh-CN.md',
      'docs/wechat/privacy-data-map.md',
      'docs/wechat/operations-runbook.md',
      'docs/wechat/release-profiles.md',
      'docs/wechat/release-audit.md',
      'docs/wechat/release-evidence/2026-08-10-local-release-candidate.md',
      'docs/wechat/release-evidence/external-smoke-checklist.md',
      'docs/wechat/release-evidence/screenshot-naming.md',
      'docs/wechat/release-disclosure.development.json',
      'docs/wechat/release-disclosure.production.template.json',
      'apps/wechat/cloudbase.env.development.example',
      'apps/wechat/cloudbase.env.production.example',
      'apps/wechat/project.private.config.example.json',
      'services/cloudbase/env.development.example',
      'services/cloudbase/env.production.example',
    ];

    for (const file of requiredFiles) {
      const fullPath = join(repoRoot, file);
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf8')).toMatch(/SkillScope|技能测评|隐私|CloudBase|待配置/);
    }
  });

  test('exposes one release verification command and keeps private WeChat config out of git', () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    const publicProjectConfig = JSON.parse(readFileSync(join(repoRoot, 'apps/wechat/project.config.json'), 'utf8'));
    const privateTemplate = JSON.parse(readFileSync(join(repoRoot, 'apps/wechat/project.private.config.example.json'), 'utf8'));

    expect(rootPackage.scripts['verify:wechat-release']).toBe('node scripts/verify-wechat-release.mjs --profile development');
    expect(rootPackage.scripts['wechat:ci:dry-run']).toContain('scripts/wechat-miniprogram-ci.mjs --mode dry-run');
    expect(rootPackage.scripts['wechat:ci:preview']).toContain('scripts/wechat-miniprogram-ci.mjs --mode preview');
    expect(rootPackage.scripts['wechat:ci:upload']).toContain('scripts/wechat-miniprogram-ci.mjs --mode upload');
    expect(publicProjectConfig.appid).toBe('touristappid');
    expect(privateTemplate.appid).toBe('wx-your-mini-program-appid');
    expect(gitignore).toMatch(/apps\/wechat\/project\.private\.config\.json/);
    expect(gitignore).toMatch(/apps\/wechat\/private\.\*\.key/);
  });

  test('miniprogram-ci dry run works without credentials and redacts private key paths', () => {
    const dryRun = spawnSync(process.execPath, [
      join(repoRoot, 'scripts', 'wechat-miniprogram-ci.mjs'),
      '--mode', 'dry-run',
      '--project-path', join(repoRoot, 'apps/wechat'),
      '--version', '0.0.0-task8',
      '--description', 'Task 8 dry run',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WECHAT_PRIVATE_KEY_PATH: join(repoRoot, 'apps/wechat/private.secret.key'),
      },
    });

    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('miniprogram-ci dry run passed');
    expect(dryRun.stdout).not.toContain('private.secret.key');
  });

  test('release candidate verifier can run static checks without external credentials', () => {
    const check = spawnSync(process.execPath, [
      join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
      '--profile',
      'development',
      '--check-only',
    ], { cwd: repoRoot, encoding: 'utf8' });

    expect(check.status).toBe(0);
    expect(check.stdout).toContain('release candidate static verification passed');
    expect(check.stdout).toContain('external blockers recorded');
  });

  test('passes development disclosure but fails formal production placeholders', () => {
    execFileSync(process.execPath, [
      join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
      '--file',
      join(repoRoot, 'docs/wechat/release-disclosure.development.json'),
      '--mode',
      'development',
    ], { cwd: repoRoot });

    const formal = spawnSync(process.execPath, [
      join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
      '--file',
      join(repoRoot, 'docs/wechat/release-disclosure.production.template.json'),
      '--mode',
      'production',
    ], { cwd: repoRoot, encoding: 'utf8' });
    expect(formal.status).not.toBe(0);
    expect(`${formal.stdout}${formal.stderr}`).toMatch(/serviceOperator|modelDisclosure|miniProgramFiling/);
  });

  test('formal verification requires matching disclosure in dist and rejects packaged placeholders', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-release-'));
    try {
      const disclosure = {
        environment: 'production',
        productVersion: '1.0.0',
        privacyPolicyVersion: '2026-08-10',
        serviceOperator: 'Skill Scope Technology Co., Ltd.',
        modelDisclosure: 'Production Model 1',
        generativeAiRegistration: 'Registration 2026-001',
        miniProgramFiling: 'ICP 20260001',
        reportRoute: '/pages/report/index',
        privacyRoute: '/pages/privacy/index',
      };
      const file = join(directory, 'production.json');
      const dist = join(directory, 'dist');
      require('node:fs').mkdirSync(dist);
      writeFileSync(file, JSON.stringify(disclosure));
      writeFileSync(join(dist, 'settings.js'), JSON.stringify(disclosure));

      execFileSync(process.execPath, [
        join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
        '--file', file,
        '--mode', 'production',
        '--dist', dist,
      ], { cwd: repoRoot });

      writeFileSync(join(dist, 'settings.js'), `${JSON.stringify(disclosure)}\n待配置`);
      const packagedPlaceholder = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
        '--file', file,
        '--mode', 'production',
        '--dist', dist,
      ], { cwd: repoRoot, encoding: 'utf8' });
      expect(packagedPlaceholder.status).not.toBe(0);
      expect(`${packagedPlaceholder.stdout}${packagedPlaceholder.stderr}`).toMatch(/dist.*placeholder/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('formal verification rejects a disclosure marked as development', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-release-mode-'));
    try {
      const disclosure = {
        environment: 'development',
        productVersion: '1.0.0',
        privacyPolicyVersion: '2026-08-10',
        serviceOperator: 'Skill Scope QA Operator',
        modelDisclosure: 'Skill Scope QA Model',
        generativeAiRegistration: 'Registration 2026-001',
        miniProgramFiling: 'ICP 20260001',
        reportRoute: '/pages/report/index',
        privacyRoute: '/pages/privacy/index',
      };
      const file = join(directory, 'development.json');
      const dist = join(directory, 'dist');
      require('node:fs').mkdirSync(dist);
      writeFileSync(file, JSON.stringify(disclosure));
      writeFileSync(join(dist, 'settings.js'), JSON.stringify(disclosure));

      const formal = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'verify-wechat-release.mjs'),
        '--file', file,
        '--mode', 'production',
        '--dist', dist,
      ], { cwd: repoRoot, encoding: 'utf8' });

      expect(formal.status).not.toBe(0);
      expect(`${formal.stdout}${formal.stderr}`).toMatch(/environment.*production/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('secret scanner rejects common keys and server-only env names in compiled output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-scan-'));
    try {
      const sourceFile = join(directory, 'source.js');
      const distFile = join(directory, 'dist.js');
      const fakeSecret = ['sk', 'live_123456789012345678901234'].join('-');
      writeFileSync(sourceFile, `const token = "${fakeSecret}";`);
      writeFileSync(distFile, 'const leaked = "LLM_API_KEY";');

      const source = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'),
        '--target',
        'source',
        sourceFile,
      ], { cwd: repoRoot, encoding: 'utf8' });
      expect(source.status).not.toBe(0);
      expect(`${source.stdout}${source.stderr}`).toContain('secret-like token');

      const dist = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'),
        '--target',
        'dist',
        distFile,
      ], { cwd: repoRoot, encoding: 'utf8' });
      expect(dist.status).not.toBe(0);
      expect(`${dist.stdout}${dist.stderr}`).toContain('server-only name');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
