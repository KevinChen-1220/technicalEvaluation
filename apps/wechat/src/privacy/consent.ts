export const CURRENT_PRIVACY_POLICY_VERSION = '2026-08-10' as const;

export type PrivacyConsentRecord = {
  privacyPolicyVersion: string;
  privacyConsentAt: string | null;
};

export type ReleaseDisclosure = {
  environment: 'development' | 'production';
  productVersion: string;
  serviceOperator?: string;
  modelDisclosure?: string;
  generativeAiRegistration?: string;
  miniProgramFiling?: string;
};

export type NormalizedReleaseDisclosure = Required<ReleaseDisclosure> & {
  privacyPolicyVersion: typeof CURRENT_PRIVACY_POLICY_VERSION;
  readyForFormalRelease: boolean;
};

const placeholder = '待配置';

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
    productVersion: input.productVersion,
    serviceOperator: nonEmpty(input.serviceOperator) ?? placeholder,
    modelDisclosure: nonEmpty(input.modelDisclosure) ?? placeholder,
    generativeAiRegistration: nonEmpty(input.generativeAiRegistration) ?? placeholder,
    miniProgramFiling: nonEmpty(input.miniProgramFiling) ?? placeholder,
    privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    readyForFormalRelease: false,
  };
  normalized.readyForFormalRelease = input.environment === 'production'
    && normalized.serviceOperator !== placeholder
    && normalized.modelDisclosure !== placeholder
    && normalized.generativeAiRegistration !== placeholder
    && normalized.miniProgramFiling !== placeholder;

  if (input.environment === 'production' && !normalized.readyForFormalRelease) {
    throw new Error('Production release disclosure is incomplete.');
  }
  return normalized;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
