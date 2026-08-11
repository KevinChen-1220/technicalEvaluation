import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('WeChat EdgeOne build configuration', () => {
  test('injects only the deploy-selected public HTTPS API base URL', () => {
    const previous = process.env.TARO_APP_EDGEONE_API_BASE_URL;
    process.env.TARO_APP_EDGEONE_API_BASE_URL = 'https://api.example.edgeone.run/';
    jest.resetModules();
    const config = require('../config').default as { env?: Record<string, string> };

    expect(config.env?.TARO_APP_EDGEONE_API_BASE_URL).toBe('"https://api.example.edgeone.run/"');
    expect(JSON.stringify(config.env)).not.toMatch(/APP_SECRET|API_KEY|HMAC|OPENID_ENCRYPTION/i);
    restoreEnv('TARO_APP_EDGEONE_API_BASE_URL', previous);
    jest.resetModules();
  });

  test.each(['', 'http://api.example.edgeone.run', 'not-a-url'])('rejects a non-HTTPS formal API URL: %p', (url) => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
    const previousUrl = process.env.TARO_APP_EDGEONE_API_BASE_URL;
    const previousProfile = process.env.TARO_APP_RELEASE_PROFILE;
    const previousDisclosure = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    try {
      const disclosure = join(directory, 'production.json');
      writeFileSync(disclosure, JSON.stringify(completeProductionDisclosure()));
      process.env.TARO_APP_EDGEONE_API_BASE_URL = url;
      process.env.TARO_APP_RELEASE_PROFILE = 'formal';
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = disclosure;
      jest.resetModules();
      expect(() => require('../config')).toThrow(/HTTPS EdgeOne API base URL/i);
    } finally {
      restoreEnv('TARO_APP_EDGEONE_API_BASE_URL', previousUrl);
      restoreEnv('TARO_APP_RELEASE_PROFILE', previousProfile);
      restoreEnv('TARO_APP_RELEASE_DISCLOSURE_FILE', previousDisclosure);
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
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
      expect(JSON.parse(JSON.parse(config.env?.TARO_APP_RELEASE_DISCLOSURE_JSON ?? ''))).toEqual(completeProductionDisclosure());
    } finally {
      restoreEnv('TARO_APP_RELEASE_DISCLOSURE_FILE', previous);
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
  });

  test('keeps release fixtures out of the formal profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-scope-disclosure-'));
    const previousMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE;
    const previousProfile = process.env.TARO_APP_RELEASE_PROFILE;
    const previousDisclosure = process.env.TARO_APP_RELEASE_DISCLOSURE_FILE;
    const previousUrl = process.env.TARO_APP_EDGEONE_API_BASE_URL;
    try {
      const file = join(directory, 'production.json');
      writeFileSync(file, JSON.stringify(completeProductionDisclosure()));
      process.env.TARO_APP_RELEASE_DISCLOSURE_FILE = file;
      process.env.TARO_APP_RELEASE_FIXTURE_MODE = 'enabled';
      process.env.TARO_APP_RELEASE_PROFILE = 'formal';
      process.env.TARO_APP_EDGEONE_API_BASE_URL = 'https://api.example.edgeone.run';
      jest.resetModules();
      expect(() => require('../config')).toThrow(/fixture/i);
    } finally {
      restoreEnv('TARO_APP_RELEASE_FIXTURE_MODE', previousMode);
      restoreEnv('TARO_APP_RELEASE_PROFILE', previousProfile);
      restoreEnv('TARO_APP_RELEASE_DISCLOSURE_FILE', previousDisclosure);
      restoreEnv('TARO_APP_EDGEONE_API_BASE_URL', previousUrl);
      rmSync(directory, { recursive: true, force: true });
      jest.resetModules();
    }
  });
});

function completeProductionDisclosure() {
  return {
    environment: 'production', productVersion: '1.0.0', privacyPolicyVersion: '2026-08-10',
    serviceOperator: 'Skill Scope QA Operator', modelDisclosure: 'Skill Scope QA Model 1',
    generativeAiRegistration: 'Registration 2026-001', miniProgramFiling: 'ICP 20260001',
    reportRoute: '/pages/report/index', privacyRoute: '/pages/privacy/index',
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
