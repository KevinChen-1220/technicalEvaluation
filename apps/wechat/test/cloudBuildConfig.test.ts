import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('WeChat CloudBase build configuration', () => {
  test('injects the deploy-selected public environment id', () => {
    const previous = process.env.TARO_APP_CLOUDBASE_ENV_ID;
    process.env.TARO_APP_CLOUDBASE_ENV_ID = 'cloudbase-production-1';
    jest.resetModules();

    const config = require('../config').default as { env?: Record<string, string> };

    expect(config.env?.TARO_APP_CLOUDBASE_ENV_ID).toBe('"cloudbase-production-1"');
    expect(JSON.parse(JSON.parse(config.env?.TARO_APP_RELEASE_DISCLOSURE_JSON ?? '')))
      .toMatchObject({ environment: 'development' });
    if (previous === undefined) delete process.env.TARO_APP_CLOUDBASE_ENV_ID;
    else process.env.TARO_APP_CLOUDBASE_ENV_ID = previous;
  });

  test('injects a complete selected production disclosure into the Taro build', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
    const previous = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify(completeProductionDisclosure()));
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = file;
      jest.resetModules();

      const config = require('../config').default as { env?: Record<string, string> };
      const injected = JSON.parse(JSON.parse(config.env?.TARO_APP_RELEASE_DISCLOSURE_JSON ?? ''));

      expect(injected).toEqual(completeProductionDisclosure());
    } finally {
      if (previous === undefined) delete process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
      else process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = previous;
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
  });

  test('resolves a selected disclosure path from the repository root', () => {
    const previous = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    try {
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = 'docs/wechat/release-disclosure.development.json';
      jest.resetModules();

      const config = require('../config').default as { env?: Record<string, string> };
      const injected = JSON.parse(JSON.parse(config.env?.TARO_APP_RELEASE_DISCLOSURE_JSON ?? ''));

      expect(injected.environment).toBe('development');
    } finally {
      if (previous === undefined) delete process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
      else process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = previous;
      jest.resetModules();
    }
  });

  test.each(['待配置', 'TBD', 'example operator', 'placeholder', '']) (
    'fails a production build when serviceOperator is %p',
    (serviceOperator) => {
      const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
      const previous = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
      try {
        const file = join(directory, 'production.json');
        writeFileSync(file, JSON.stringify({ ...completeProductionDisclosure(), serviceOperator }));
        process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = file;
        jest.resetModules();

        expect(() => require('../config')).toThrow(/serviceOperator/);
      } finally {
        if (previous === undefined) delete process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
        else process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = previous;
        rmSync(directory, { recursive: true, force: true });
        jest.resetModules();
      }
    },
  );

  test('allows deterministic release fixtures only outside the formal profile', () => {
    const previousMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE;
    const previousProfile = process.env.TARO_APP_RELEASE_PROFILE;
    try {
      process.env.TARO_APP_RELEASE_FIXTURE_MODE = 'enabled';
      process.env.TARO_APP_RELEASE_PROFILE = 'development';
      jest.resetModules();

      const config = require('../config').default as { env?: Record<string, string> };

      expect(config.env?.TARO_APP_RELEASE_FIXTURE_MODE).toBe('"enabled"');
    } finally {
      restoreEnv('TARO_APP_RELEASE_FIXTURE_MODE', previousMode);
      restoreEnv('TARO_APP_RELEASE_PROFILE', previousProfile);
      jest.resetModules();
    }
  });

  test('rejects deterministic release fixtures in the formal profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
    const previousMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE;
    const previousProfile = process.env.TARO_APP_RELEASE_PROFILE;
    const previousDisclosure = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    const previousEnv = process.env.TARO_APP_CLOUDBASE_ENV_ID;
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify(completeProductionDisclosure()));
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = file;
      process.env.TARO_APP_RELEASE_FIXTURE_MODE = 'enabled';
      process.env.TARO_APP_RELEASE_PROFILE = 'formal';
      process.env.TARO_APP_CLOUDBASE_ENV_ID = 'prod-cloudbase-release-1';
      jest.resetModules();

      expect(() => require('../config')).toThrow(/fixture/i);
    } finally {
      restoreEnv('TARO_APP_RELEASE_FIXTURE_MODE', previousMode);
      restoreEnv('TARO_APP_RELEASE_PROFILE', previousProfile);
      restoreEnv('TARO_APP_RELEASE_DISCLOSURE_FILE', previousDisclosure);
      restoreEnv('TARO_APP_CLOUDBASE_ENV_ID', previousEnv);
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
  });

  test('requires a production CloudBase environment for the formal profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
    const previousMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE;
    const previousProfile = process.env.TARO_APP_RELEASE_PROFILE;
    const previousDisclosure = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    const previousEnv = process.env.TARO_APP_CLOUDBASE_ENV_ID;
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify(completeProductionDisclosure()));
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = file;
      process.env.TARO_APP_RELEASE_FIXTURE_MODE = 'disabled';
      process.env.TARO_APP_RELEASE_PROFILE = 'formal';
      delete process.env.TARO_APP_CLOUDBASE_ENV_ID;
      jest.resetModules();

      expect(() => require('../config')).toThrow(/CloudBase/);
    } finally {
      restoreEnv('TARO_APP_RELEASE_FIXTURE_MODE', previousMode);
      restoreEnv('TARO_APP_RELEASE_PROFILE', previousProfile);
      restoreEnv('TARO_APP_RELEASE_DISCLOSURE_FILE', previousDisclosure);
      restoreEnv('TARO_APP_CLOUDBASE_ENV_ID', previousEnv);
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
  });
});

function completeProductionDisclosure() {
  return {
    environment: 'production',
    productVersion: '1.0.0',
    privacyPolicyVersion: '2026-08-10',
    serviceOperator: 'Skill Scope QA Operator',
    modelDisclosure: 'Skill Scope QA Model 1',
    generativeAiRegistration: 'Registration 2026-001',
    miniProgramFiling: 'ICP 20260001',
    reportRoute: '/pages/report/index',
    privacyRoute: '/pages/privacy/index',
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
