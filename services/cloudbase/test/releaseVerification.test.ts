import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'yaml';

const repoRoot = join(__dirname, '..', '..', '..');

describe('WeChat release verification assets', () => {
  test('keeps Chinese privacy, data-map, operations, and environment templates in source control', () => {
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
      'docs/wechat/release-disclosure.development.json',
      'docs/wechat/release-disclosure.production.template.json',
      'docs/wechat/release-manifest.template.json',
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

  test('keeps Task 9 handoff docs honest about external WeChat prerequisites', () => {
    const checklist = readFileSync(join(repoRoot, 'docs/wechat/release-checklist.md'), 'utf8');
    const deployment = readFileSync(join(repoRoot, 'docs/wechat/deployment-runbook.md'), 'utf8');
    const submission = readFileSync(join(repoRoot, 'docs/wechat/review-submission.md'), 'utf8');
    const matrix = readFileSync(join(repoRoot, 'docs/wechat/release-completion-matrix.md'), 'utf8');
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

    for (const value of [checklist, deployment, submission, matrix]) {
      expect(value).toContain('真实');
      expect(value).toContain('待配置');
      expect(value).toMatch(/AppID|备案|隐私|生产|真机|审核/);
      expect(value).toMatch(/不能|不得|不可/);
    }

    expect(checklist).toMatch(/主体认证.*AppID.*类目.*ICP备案.*隐私声明.*生成式人工智能/s);
    expect(deployment).toMatch(/集合.*索引.*安全规则.*函数调用规则.*定时触发器.*环境变量.*回滚/s);
    expect(submission).toMatch(/版本号.*上传命令.*审核备注.*截图.*AI.*驳回.*重新提交/s);
    expect(submission).toMatch(/PowerShell.*Bash/s);
    expect(matrix).toMatch(/本地已验证.*外部就绪.*外部阻塞/s);
    expect(readme).toContain('微信小程序');
    expect(readme).toContain('docs/wechat/release-checklist.md');
    expect(readme).not.toContain('Use Sample Paper');
  });

  test('keeps a machine-readable release manifest template without secrets or invented identifiers', () => {
    const manifestText = readFileSync(join(repoRoot, 'docs/wechat/release-manifest.template.json'), 'utf8');
    const manifest = JSON.parse(manifestText) as {
      schemaVersion?: number;
      release?: Record<string, unknown>;
      wechat?: Record<string, unknown>;
      cloudbase?: Record<string, unknown>;
      compliance?: Record<string, unknown>;
      artifacts?: Record<string, unknown>;
      approvals?: unknown[];
      externalEvidence?: Record<string, unknown>;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.release).toMatchObject({
      product: 'SkillScope',
      commitSha: '待配置',
      tag: '待配置',
      rolloutPercentage: 0,
    });
    expect(manifest.wechat).toMatchObject({
      appId: '待配置',
      appVersion: '待配置',
    });
    expect(manifest.cloudbase).toMatchObject({
      productionEnvId: '待配置',
    });
    expect(manifest.compliance).toMatchObject({
      serviceOperator: '待配置',
      miniProgramFiling: '待配置',
      modelDisclosure: '待配置',
      generativeAiRegistration: '待配置',
    });
    expect(manifest.artifacts).toHaveProperty('wechatDistSha256');
    expect(manifest.artifacts).toHaveProperty('cloudbaseDistSha256');
    expect(manifest.externalEvidence).toHaveProperty('realDeviceSmokeIssue');
    expect(manifestText).not.toMatch(/secret|api[_-]?key|private[_-]?key|token/i);
    expect(manifestText).not.toMatch(/wx[0-9a-f]{16,}/i);
  });

  test('validates GitHub workflows and release issue templates without reading secrets on PRs', () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/wechat-release.yml'), 'utf8');
    const filingIssue = readFileSync(join(repoRoot, '.github/ISSUE_TEMPLATE/wechat_filing.yml'), 'utf8');
    const smokeIssue = readFileSync(join(repoRoot, '.github/ISSUE_TEMPLATE/wechat_production_smoke.yml'), 'utf8');

    expect(rootPackage.scripts['verify:github-workflows']).toBe('node scripts/verify-github-workflows.mjs');
    execFileSync(process.execPath, [join(repoRoot, 'scripts', 'verify-github-workflows.mjs')], { cwd: repoRoot });

    expect(releaseWorkflow).toContain('pull_request');
    expect(releaseWorkflow).toContain('workflow_dispatch');
    expect(releaseWorkflow).toContain('wechat-production');
    expect(releaseWorkflow).toMatch(/inputs\.publish_target == 'upload'/);
    expect(releaseWorkflow).not.toMatch(/pull_request_target/);
    expect(releaseWorkflow).not.toContain('test -f "${{ inputs.disclosure_file }}"');
    expect(releaseWorkflow).not.toContain('--disclosure-file "${{ inputs.disclosure_file }}"');
    expect(releaseWorkflow).toContain('DISCLOSURE_FILE: ${{ inputs.disclosure_file }}');
    expect(releaseWorkflow).toContain('test -n "$DISCLOSURE_FILE" && test -f "$DISCLOSURE_FILE"');
    expect(releaseWorkflow).toContain('--disclosure-file "$DISCLOSURE_FILE"');
    const checksJob = releaseWorkflow.slice(
      releaseWorkflow.indexOf('release-checks:'),
      releaseWorkflow.indexOf('upload:'),
    );
    expect(checksJob).not.toContain('secrets.');
    expect(filingIssue).toMatch(/AppID.*备案.*隐私.*生成式人工智能/s);
    expect(filingIssue).toContain('CONTENT_SAFETY_PROVIDER');
    expect(filingIssue).toContain('wechat_production_smoke');
    expect(smokeIssue).toMatch(/真机.*CloudBase.*截图.*回滚/s);
    expect(smokeIssue).toContain('wechat_filing');
  });

  test.each([
    {
      name: 'a comment that names a required release-check command',
      expected: /release-checks.*verify:github-workflows/i,
      mutate: (source: string) => source.replace(
        '      - name: Verify GitHub workflow YAML\n        run: npm run verify:github-workflows',
        '      # npm run verify:github-workflows\n      - name: Verify GitHub workflow YAML',
      ),
    },
    {
      name: 'an echo that names a required release-check command',
      expected: /release-checks.*verify:github-workflows/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs['release-checks'].steps, 'Verify GitHub workflow YAML').run =
          'echo "npm run verify:github-workflows"';
      }),
    },
    {
      name: 'an upload job without the release-checks dependency',
      expected: /upload\.needs.*release-checks/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        delete workflow.jobs.upload.needs;
      }),
    },
    {
      name: 'an upload job that runs before formal verification',
      expected: /formal.*before.*upload/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        const steps = workflow.jobs.upload.steps as WorkflowStep[];
        const formalIndex = steps.findIndex((step) => step.name === 'Run formal release verification');
        const uploadIndex = steps.findIndex((step) => step.name === 'Upload to WeChat draft');
        if (formalIndex < 0 || uploadIndex < 0) throw new Error('Workflow fixture is missing release steps');
        const formalStep = steps[formalIndex];
        const uploadStep = steps[uploadIndex];
        if (!formalStep || !uploadStep) throw new Error('Workflow fixture has invalid release step indexes');
        steps[formalIndex] = uploadStep;
        steps[uploadIndex] = formalStep;
      }),
    },
    {
      name: 'a formal verifier step guarded by if false',
      expected: /formal release verification.*must not define if/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification').if = false;
      }),
    },
    {
      name: 'an upload step guarded by if false',
      expected: /WeChat upload.*must not define if/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft').if = false;
      }),
    },
    {
      name: 'a formal verifier step that continues on error',
      expected: /formal release verification.*continue-on-error/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification')['continue-on-error'] = true;
      }),
    },
    {
      name: 'an upload step with a shortened timeout',
      expected: /WeChat upload.*timeout-minutes/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft')['timeout-minutes'] = 1;
      }),
    },
    {
      name: 'a formal verifier step with a custom shell',
      expected: /formal release verification.*default shell/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification').shell = 'bash {0}';
      }),
    },
    {
      name: 'an upload job that inherits a custom run shell',
      expected: /upload job.*default shell/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.jobs.upload.defaults = { run: { shell: 'bash {0}' } };
      }),
    },
    {
      name: 'an upload job with a shortened timeout',
      expected: /upload job.*timeout-minutes/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.jobs.upload['timeout-minutes'] = 1;
      }),
    },
    {
      name: 'a formal verifier command that swallows failure with or true',
      expected: /formal release verification.*exact command/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification').run += ' || true';
      }),
    },
    {
      name: 'a formal verifier command with an and true suffix',
      expected: /formal release verification.*exact command/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification').run += ' && true';
      }),
    },
    {
      name: 'an upload command with a semicolon exit zero suffix',
      expected: /WeChat upload.*exact command/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft').run += '; exit 0';
      }),
    },
    {
      name: 'a formal verifier command piped through another process',
      expected: /formal release verification.*exact command/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Run formal release verification').run += ' | tee verification.log';
      }),
    },
    {
      name: 'an upload command with a successful multiline suffix',
      expected: /WeChat upload.*exact command/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft').run += '\nexit 0';
      }),
    },
    {
      name: 'workflow-level write permissions',
      expected: /workflow permissions.*contents: read/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.permissions = { contents: 'write' };
      }),
    },
    {
      name: 'job-level id-token permissions',
      expected: /release-checks permissions.*contents: read/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.jobs['release-checks'].permissions = { contents: 'read', 'id-token': 'write' };
      }),
    },
    {
      name: 'a secret reference outside upload env',
      expected: /secret references.*upload.*env/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft').run =
          'npm run wechat:ci:upload ${{ secrets.WECHAT_APP_ID }}';
      }),
    },
    {
      name: 'a conditional secret expression outside upload env',
      expected: /secret references.*upload.*env/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        findStep(workflow.jobs.upload.steps, 'Install dependencies').run =
          'echo "${{ secrets.optional_release_key != \'\' }}" && npm ci';
      }),
    },
    {
      name: 'a bracket secret expression at workflow scope',
      expected: /secret references.*protected upload step env/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.env = { RELEASE_KEY: "${{ secrets['WECHAT_APP_ID'] }}" };
      }),
    },
    {
      name: 'a dynamic bracket secret expression in release-checks',
      expected: /dynamic secret indexes.*not allowed/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.jobs['release-checks'].env = {
          RELEASE_KEY: '${{ secrets[inputs.secret_name] }}',
        };
      }),
    },
    {
      name: 'required upload secrets mapped to the wrong env keys',
      expected: /secret binding.*WECHAT_APP_ID.*secrets\.WECHAT_APP_ID/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        const keyStep = findStep(workflow.jobs.upload.steps, 'Write WeChat upload key');
        const uploadStep = findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft');
        keyStep.env!.WECHAT_PRIVATE_KEY_PEM = '${{ secrets.WECHAT_APP_ID }}';
        uploadStep.env!.WECHAT_APP_ID = '${{ secrets.WECHAT_PRIVATE_KEY_PEM }}';
      }),
    },
    {
      name: 'a required secret moved to an alias env key',
      expected: /secret binding.*WECHAT_APP_ID.*secrets\.WECHAT_APP_ID/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        const uploadStep = findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft');
        delete uploadStep.env!.WECHAT_APP_ID;
        uploadStep.env!.APP_ID_ALIAS = '${{ secrets.WECHAT_APP_ID }}';
      }),
    },
    {
      name: 'a required secret exposed at upload job scope',
      expected: /secret references.*protected upload step env/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        const uploadStep = findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft');
        delete uploadStep.env!.WECHAT_APP_ID;
        workflow.jobs.upload.env = { WECHAT_APP_ID: '${{ secrets.WECHAT_APP_ID }}' };
      }),
    },
    {
      name: 'a bracket secret binding hidden behind a duplicate dot reference',
      expected: /secret binding.*WECHAT_APP_ID.*secrets\.WECHAT_APP_ID/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        const uploadStep = findStep(workflow.jobs.upload.steps, 'Upload to WeChat draft');
        uploadStep.env!.WECHAT_APP_ID = "${{ secrets['WECHAT_APP_ID'] }}";
        uploadStep.env!.APP_ID_ALIAS = '${{ secrets.WECHAT_APP_ID }}';
      }),
    },
    {
      name: 'a missing required upload secret hidden in a comment',
      expected: /missing required upload secret.*CONTENT_SAFETY_PROVIDER/i,
      mutate: (source: string) => source.replace(
        '          CONTENT_SAFETY_PROVIDER: ${{ secrets.CONTENT_SAFETY_PROVIDER }}',
        '          # secrets.CONTENT_SAFETY_PROVIDER',
      ),
    },
    {
      name: 'an environment with additional dynamic configuration',
      expected: /upload environment.*wechat-production/i,
      mutate: (source: string) => mutateWorkflow(source, (workflow) => {
        workflow.jobs.upload.environment.url = '${{ steps.deploy.outputs.url }}';
      }),
    },
  ])('rejects $name', ({ mutate, expected }) => {
    const source = readFileSync(join(repoRoot, '.github/workflows/wechat-release.yml'), 'utf8');
    const mutated = mutate(source);
    expect(mutated).not.toBe(source);

    const result = runWorkflowVerifier(mutated);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(expected);
  });

  test('pins GitHub Actions used by release workflows to immutable commits', () => {
    const workflowFiles = [
      '.github/workflows/ci.yml',
      '.github/workflows/pages.yml',
      '.github/workflows/wechat-release.yml',
    ];

    for (const file of workflowFiles) {
      const workflow = readFileSync(join(repoRoot, file), 'utf8');
      expect(workflow).not.toMatch(/uses:\s+actions\/[a-z0-9-]+@v\d+/i);
      for (const match of workflow.matchAll(/uses:\s+(actions\/[a-z0-9-]+)@([^\s]+)/gi)) {
        expect(match[2]).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  test('classifies audit reachability without treating all Taro packages as build-only', () => {
    const audit = readFileSync(join(repoRoot, 'docs/wechat/release-audit.md'), 'utf8');
    expect(audit).toContain('125');
    expect(audit).toMatch(/Build-only/i);
    expect(audit).toMatch(/Mini Program runtime/i);
    expect(audit).toMatch(/CloudBase runtime/i);
    expect(audit).toContain('@tarojs/runtime');
    expect(audit).toContain('apps/wechat/dist/app.js');
    expect(audit).toContain('services/cloudbase/dist');
    expect(audit).not.toMatch(/Taro.*不会被打入正式小程序业务包/);
  });

  test('documents strict moderation preflight boundaries and external availability smoke', () => {
    const operations = readFileSync(join(repoRoot, 'docs/wechat/operations-runbook.md'), 'utf8');
    const profiles = readFileSync(join(repoRoot, 'docs/wechat/release-profiles.md'), 'utf8');

    expect(operations).toContain('SKILLSCOPE_ENV=development');
    expect(operations).toMatch(/CONTENT_SAFETY_URL.*CONTENT_SAFETY_API_KEY.*CONTENT_SAFETY_PROVIDER/);
    expect(operations).toMatch(/placeholder|changeme|example|TBD/);
    expect(operations).toMatch(/真实可用性.*外部.*smoke/i);
    expect(profiles).toMatch(/formal.*拒绝.*--check-only/is);
    expect(profiles).toMatch(/formal-preflight.*不代表.*发布验证成功/is);
  });

  test('exposes one release verification command and keeps private WeChat config out of git', () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    const publicProjectConfig = JSON.parse(readFileSync(join(repoRoot, 'apps/wechat/project.config.json'), 'utf8'));
    const privateTemplate = JSON.parse(readFileSync(join(repoRoot, 'apps/wechat/project.private.config.example.json'), 'utf8'));

    expect(rootPackage.scripts['verify:wechat-release']).toBe('node scripts/verify-wechat-release.mjs --profile development');
    expect(rootPackage.scripts['verify:wechat-release:formal']).toBe('node scripts/verify-wechat-release.mjs --profile formal');
    expect(rootPackage.scripts['verify:wechat-disclosure:dev']).toBe('node scripts/verify-wechat-disclosure.mjs --file docs/wechat/release-disclosure.development.json --mode development');
    expect(rootPackage.scripts['verify:wechat-release:formal-preflight']).toBe('node scripts/verify-wechat-formal-preflight.mjs');
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
      join(repoRoot, 'scripts', 'verify-wechat-disclosure.mjs'),
      '--file',
      join(repoRoot, 'docs/wechat/release-disclosure.development.json'),
      '--mode',
      'development',
    ], { cwd: repoRoot });

    const formal = spawnSync(process.execPath, [
      join(repoRoot, 'scripts', 'verify-wechat-disclosure.mjs'),
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
        join(repoRoot, 'scripts', 'verify-wechat-disclosure.mjs'),
        '--file', file,
        '--mode', 'production',
        '--dist', dist,
      ], { cwd: repoRoot });

      writeFileSync(join(dist, 'settings.js'), `${JSON.stringify(disclosure)}\n待配置`);
      const packagedPlaceholder = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'verify-wechat-disclosure.mjs'),
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
        join(repoRoot, 'scripts', 'verify-wechat-disclosure.mjs'),
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

  test('formal runner rejects every downgrade or unknown argument regardless of arrangement', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-formal-preflight-'));
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify({
        environment: 'production', productVersion: '1.0.0', privacyPolicyVersion: '2026-08-10',
        serviceOperator: 'Skill Scope Technology Co., Ltd.', modelDisclosure: 'Production Model 1',
        generativeAiRegistration: 'Registration 2026-001', miniProgramFiling: 'ICP 20260001',
        reportRoute: '/pages/report/index', privacyRoute: '/pages/privacy/index',
      }));
      const environment = {
        ...process.env,
        TARO_APP_CLOUDBASE_ENV_ID: 'prod-cloudbase-1',
        SKILLSCOPE_ENV: 'production',
        CONTENT_SAFETY_URL: 'https://moderation.skillscope.invalid/v1/check',
        CONTENT_SAFETY_API_KEY: 'formal-test-secret',
        CONTENT_SAFETY_PROVIDER: 'skillscope-moderation',
        SKILLSCOPE_ALLOW_UNSAFE_MODERATION: 'false',
      };
      const downgradeCases = [
        ['--file', join(repoRoot, 'docs/wechat/release-disclosure.development.json'), '--mode', 'development'],
        ['--mode', 'development', '--file', join(repoRoot, 'docs/wechat/release-disclosure.development.json')],
        ['--file', join(repoRoot, 'docs/wechat/release-disclosure.development.json'), '--dist', 'apps/wechat/dist', '--mode', 'development'],
        ['--preflight-only', '--disclosure-file', file],
        ['--disclosure-file', file, '--preflight-only'],
        ['--mystery', 'value', '--check-only'],
      ];

      for (const extraArgs of downgradeCases) {
        const result = spawnNpm([
          'run', 'verify:wechat-release:formal', '--', ...extraArgs,
        ], { cwd: repoRoot, env: environment });
        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toMatch(/formal.*(?:unsupported|not allowed).*(?:--file|--mode|--dist|--preflight-only|--mystery)/i);
        expect(`${result.stdout}${result.stderr}`).not.toContain('release candidate verification passed for formal');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('formal preflight is an independent script with placeholder gates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-formal-preflight-'));
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify({
        environment: 'production', productVersion: '1.0.0', privacyPolicyVersion: '2026-08-10',
        serviceOperator: 'Skill Scope Technology Co., Ltd.', modelDisclosure: 'Production Model 1',
        generativeAiRegistration: 'Registration 2026-001', miniProgramFiling: 'ICP 20260001',
        reportRoute: '/pages/report/index', privacyRoute: '/pages/privacy/index',
      }));
      const baseArgs = [
        join(repoRoot, 'scripts', 'verify-wechat-formal-preflight.mjs'),
        '--disclosure-file', file,
      ];
      const missingSafety = spawnSync(process.execPath, baseArgs, {
        cwd: repoRoot, encoding: 'utf8',
        env: {
          ...process.env,
          TARO_APP_CLOUDBASE_ENV_ID: 'prod-cloudbase-1',
          SKILLSCOPE_ENV: 'production',
          CONTENT_SAFETY_URL: '',
          CONTENT_SAFETY_API_KEY: '',
          CONTENT_SAFETY_PROVIDER: '',
          SKILLSCOPE_ALLOW_UNSAFE_MODERATION: 'false',
        },
      });
      expect(missingSafety.status).not.toBe(0);
      expect(`${missingSafety.stdout}${missingSafety.stderr}`).toMatch(/CONTENT_SAFETY_URL|CONTENT_SAFETY_API_KEY/);

      for (const [name, value, expected] of [
        ['CONTENT_SAFETY_URL', 'https://example.com/check', /CONTENT_SAFETY_URL.*placeholder/i],
        ['CONTENT_SAFETY_API_KEY', 'changeme', /CONTENT_SAFETY_API_KEY.*placeholder/i],
        ['CONTENT_SAFETY_PROVIDER', 'TBD', /CONTENT_SAFETY_PROVIDER.*placeholder/i],
      ] as const) {
        const placeholder = spawnSync(process.execPath, baseArgs, {
          cwd: repoRoot, encoding: 'utf8',
          env: {
            ...process.env,
            TARO_APP_CLOUDBASE_ENV_ID: 'prod-cloudbase-1',
            SKILLSCOPE_ENV: 'production',
            CONTENT_SAFETY_URL: 'https://moderation.skillscope.invalid/v1/check',
            CONTENT_SAFETY_API_KEY: 'formal-test-secret',
            CONTENT_SAFETY_PROVIDER: 'skillscope-moderation',
            [name]: value,
          },
        });
        expect(placeholder.status).not.toBe(0);
        expect(`${placeholder.stdout}${placeholder.stderr}`).toMatch(expected);
      }
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

  test('secret scanner rejects private-key files, private-key headers, and tracked secret filenames', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-private-key-scan-'));
    try {
      const privateKey = join(directory, 'release.p8');
      const sourceFile = join(directory, 'source.txt');
      const encryptedPem = join(directory, 'encrypted.txt');
      writeFileSync(privateKey, 'placeholder');
      writeFileSync(sourceFile, ['-----BEGIN OPENSSH', 'PRIVATE KEY-----\nplaceholder'].join(' '));
      writeFileSync(encryptedPem, ['-----BEGIN ENCRYPTED', 'PRIVATE KEY-----\nplaceholder'].join(' '));

      for (const file of [privateKey, sourceFile, encryptedPem]) {
        const result = spawnSync(process.execPath, [
          join(repoRoot, 'scripts', 'scan-secrets.mjs'), '--target', 'source', file,
        ], { cwd: repoRoot, encoding: 'utf8' });
        expect(result.status).not.toBe(0);
      }

      const tracked = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'),
        '--target', 'source',
        '--tracked-file', 'apps/wechat/private.release.key',
        join(repoRoot, 'package.json'),
      ], { cwd: repoRoot, encoding: 'utf8' });
      expect(tracked.status).not.toBe(0);
      expect(`${tracked.stdout}${tracked.stderr}`).toMatch(/tracked secret filename/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('secret scanner reads every tracked regular file and rejects extensionless private keys and key names', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-tracked-key-scan-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: directory });
      const extensionlessPem = join(directory, 'NOTICE');
      writeFileSync(extensionlessPem, ['-----BEGIN OPENSSH', 'PRIVATE KEY-----\nplaceholder\n-----END OPENSSH PRIVATE KEY-----'].join(' '));
      execFileSync('git', ['add', 'NOTICE'], { cwd: directory });

      const contentResult = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'), '--target', 'source', '.',
      ], { cwd: directory, encoding: 'utf8' });
      expect(contentResult.status).not.toBe(0);
      expect(`${contentResult.stdout}${contentResult.stderr}`).toMatch(/NOTICE.*private key header/i);

      const injectedTrackedFile = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'), '--target', 'source',
        '--tracked-file', 'harmless-test-entry', '.',
      ], { cwd: directory, encoding: 'utf8' });
      expect(injectedTrackedFile.status).not.toBe(0);
      expect(`${injectedTrackedFile.stdout}${injectedTrackedFile.stderr}`).toMatch(/NOTICE.*private key header/i);

      rmSync(extensionlessPem);
      execFileSync('git', ['rm', '--cached', '--quiet', 'NOTICE'], { cwd: directory });
      for (const name of ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'private.wx1234567890abcdef.key', 'wechat-upload-key']) {
        writeFileSync(join(directory, name), 'not-a-secret-value');
      }
      execFileSync('git', ['add', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'private.wx1234567890abcdef.key', 'wechat-upload-key'], { cwd: directory });

      const filenameResult = spawnSync(process.execPath, [
        join(repoRoot, 'scripts', 'scan-secrets.mjs'), '--target', 'source', '.',
      ], { cwd: directory, encoding: 'utf8' });
      expect(filenameResult.status).not.toBe(0);
      const output = `${filenameResult.stdout}${filenameResult.stderr}`;
      for (const name of ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'private.wx1234567890abcdef.key', 'wechat-upload-key']) {
        expect(output).toMatch(new RegExp(`${name.replace('.', '\\.')}: tracked secret filename`, 'i'));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function spawnNpm(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ReturnType<typeof spawnSync> {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/c', 'npm', ...args], { ...options, encoding: 'utf8' });
  }
  return spawnSync('npm', args, { ...options, encoding: 'utf8' });
}

type WorkflowStep = {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  if?: string | boolean;
  shell?: string;
  'continue-on-error'?: boolean | string;
  'timeout-minutes'?: number | string;
};

function mutateWorkflow(source: string, mutate: (workflow: any) => void): string {
  const workflow = yaml.parse(source);
  mutate(workflow);
  return yaml.stringify(workflow);
}

function findStep(steps: WorkflowStep[], name: string): WorkflowStep {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`Workflow fixture is missing step: ${name}`);
  return step;
}

function runWorkflowVerifier(workflowSource: string): ReturnType<typeof spawnSync> {
  const directory = mkdtempSync(join(tmpdir(), 'skill-scope-workflow-'));
  try {
    const workflowPath = join(directory, 'wechat-release.yml');
    writeFileSync(workflowPath, workflowSource);
    return spawnSync(process.execPath, [
      join(repoRoot, 'scripts', 'verify-github-workflows.mjs'),
      '--release-workflow',
      workflowPath,
    ], { cwd: repoRoot, encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
