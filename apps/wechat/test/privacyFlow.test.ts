import appConfig from '../src/app.config';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  createPrivacyConsentViewModel,
  hasCurrentPrivacyConsent,
  normalizeReleaseDisclosure,
} from '../src/privacy/consent';

describe('Mini Program privacy flow', () => {
  test('requires consent when the local or server policy version is missing or stale', () => {
    expect(hasCurrentPrivacyConsent(undefined)).toBe(false);
    expect(hasCurrentPrivacyConsent({
      privacyPolicyVersion: '2026-07-01',
      privacyConsentAt: '2026-07-01T00:00:00.000Z',
    })).toBe(false);
    expect(hasCurrentPrivacyConsent({
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      privacyConsentAt: '2026-08-10T08:00:00.000Z',
    })).toBe(true);
  });

  test('builds a Chinese consent gate that does not block local history viewing', () => {
    expect(createPrivacyConsentViewModel(undefined)).toEqual({
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      requiresConsentForGeneration: true,
      blocksLocalHistory: false,
      title: '隐私保护提示',
      acceptLabel: '同意并继续',
      reviewLabel: '查看隐私政策',
    });
  });

  test('shows development placeholders while marking production disclosure as incomplete', () => {
    expect(normalizeReleaseDisclosure({
      environment: 'development',
      productVersion: '1.0.0',
    })).toMatchObject({
      serviceOperator: '待配置',
      modelDisclosure: '待配置',
      generativeAiRegistration: '待配置',
      miniProgramFiling: '待配置',
      readyForFormalRelease: false,
    });
    expect(() => normalizeReleaseDisclosure({
      environment: 'production',
      productVersion: '1.0.0',
    })).toThrow('Production release disclosure is incomplete.');
  });

  test('declares privacy/report pages and no sensitive permission prompts', () => {
    expect(appConfig.pages).toEqual(expect.arrayContaining([
      'pages/privacy/index',
      'pages/report/index',
    ]));
    expect(JSON.stringify(appConfig)).not.toMatch(/userLocation|camera|microphone|album|clipboard|phone|avatar|nickname/i);
  });
});
