export const CURRENT_PRIVACY_POLICY_VERSION = '2026-08-10' as const;

export type PrivacyConsentRecord = {
  privacyPolicyVersion: string;
  privacyConsentAt: string | null;
};

export type ReleaseDisclosure = {
  environment: 'development' | 'production';
  productVersion: string;
  privacyPolicyVersion?: string;
  serviceOperator: string;
  modelDisclosure: string;
  generativeAiRegistration: string;
  miniProgramFiling: string;
  reportRoute?: string;
  privacyRoute?: string;
};

export type NormalizedReleaseDisclosure = Required<ReleaseDisclosure> & {
  readyForFormalRelease: boolean;
};

export function hasCurrentPrivacyConsent(record: PrivacyConsentRecord | undefined): boolean {
  return record?.privacyPolicyVersion === CURRENT_PRIVACY_POLICY_VERSION
    && typeof record.privacyConsentAt === 'string'
    && record.privacyConsentAt.length > 0;
}

export function createPrivacyConsentViewModel(record: PrivacyConsentRecord | undefined) {
  return {
    currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    requiresConsentForGeneration: !hasCurrentPrivacyConsent(record),
    blocksLocalHistory: false,
    title: '隐私保护提示',
    acceptLabel: '同意并继续',
    reviewLabel: '查看隐私政策',
  };
}

export function normalizeReleaseDisclosure(input: ReleaseDisclosure): NormalizedReleaseDisclosure {
  const normalized: NormalizedReleaseDisclosure = {
    environment: input.environment,
    productVersion: input.productVersion.trim(),
    serviceOperator: input.serviceOperator.trim(),
    modelDisclosure: input.modelDisclosure.trim(),
    generativeAiRegistration: input.generativeAiRegistration.trim(),
    miniProgramFiling: input.miniProgramFiling.trim(),
    privacyPolicyVersion: input.privacyPolicyVersion?.trim() || CURRENT_PRIVACY_POLICY_VERSION,
    reportRoute: input.reportRoute?.trim() ?? '/pages/report/index',
    privacyRoute: input.privacyRoute?.trim() ?? '/pages/privacy/index',
    readyForFormalRelease: false,
  };
  normalized.readyForFormalRelease = input.environment === 'production'
    && [
      normalized.serviceOperator,
      normalized.modelDisclosure,
      normalized.generativeAiRegistration,
      normalized.miniProgramFiling,
    ].every((value) => value.length > 0 && !isPlaceholder(value));

  if (input.environment === 'production' && !normalized.readyForFormalRelease) {
    throw new Error('Production release disclosure is incomplete.');
  }
  return normalized;
}

function isPlaceholder(value: string): boolean {
  return containsUnconfiguredMarker(value)
    || /\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value);
}

function containsUnconfiguredMarker(value: string): boolean {
  const marker = [0x5f85, 0x914d, 0x7f6e];
  for (let start = 0; start <= value.length - marker.length; start += 1) {
    if (marker.every((code, offset) => value.charCodeAt(start + offset) === code)) return true;
  }
  return false;
}
