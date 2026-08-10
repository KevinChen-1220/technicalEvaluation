import {
  COLLECTION_SCHEMA_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  type UserSettings,
} from '../../shared/contracts';
import { readTrustedOpenId } from '../trustedContext';

export type PublicUserSettings = {
  privacyPolicyVersion: string;
  privacyConsentAt: string | null;
  hasCurrentPrivacyConsent: boolean;
};

export type SettingsRepository = {
  findByOwner(ownerOpenId: string): Promise<UserSettings | null>;
  save(record: UserSettings): Promise<UserSettings>;
  hasCurrentPrivacyConsent(ownerOpenId: string, version: string): Promise<boolean>;
};

export type SettingsDependencies = {
  repository: SettingsRepository;
};

export type AcceptPrivacyPolicyDependencies = SettingsDependencies & {
  clock: { now(): Date };
  ids: { settingsId(ownerOpenId: string): string };
};

const invalid = { type: 'invalid', errorCode: 'INVALID_REQUEST' } as const;
const notFound = { type: 'not_found', errorCode: 'INVALID_REQUEST' } as const;

export async function getUserSettings(
  _input: unknown,
  trustedContext: unknown,
  dependencies: SettingsDependencies,
): Promise<
  | { type: 'found'; settings: PublicUserSettings }
  | typeof notFound
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  if (ownerOpenId === null) return notFound;
  const record = await dependencies.repository.findByOwner(ownerOpenId);
  return record === null ? notFound : { type: 'found', settings: toPublicSettings(record) };
}

export async function acceptPrivacyPolicy(
  input: unknown,
  trustedContext: unknown,
  dependencies: AcceptPrivacyPolicyDependencies,
): Promise<
  | { type: 'accepted'; settings: PublicUserSettings }
  | typeof invalid
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const version = parsePrivacyVersion(input);
  if (ownerOpenId === null || version !== CURRENT_PRIVACY_POLICY_VERSION) return invalid;

  const now = dependencies.clock.now().toISOString();
  const existing = await dependencies.repository.findByOwner(ownerOpenId);
  const record: UserSettings = {
    _id: existing?._id ?? dependencies.ids.settingsId(ownerOpenId),
    _openid: ownerOpenId,
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    locale: 'zh-CN',
    privacyConsentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    privacyConsentAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const saved = await dependencies.repository.save(record);
  return { type: 'accepted', settings: toPublicSettings(saved) };
}

function toPublicSettings(record: UserSettings): PublicUserSettings {
  return {
    privacyPolicyVersion: record.privacyConsentVersion,
    privacyConsentAt: record.privacyConsentAt,
    hasCurrentPrivacyConsent:
      record.privacyConsentVersion === CURRENT_PRIVACY_POLICY_VERSION
      && record.privacyConsentAt !== null,
  };
}

function parsePrivacyVersion(input: unknown): string | null {
  if (!isRecord(input) || typeof input.privacyPolicyVersion !== 'string') return null;
  const version = input.privacyPolicyVersion.trim();
  return version.length === 0 ? null : version;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
