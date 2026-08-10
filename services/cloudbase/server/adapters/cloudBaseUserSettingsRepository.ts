import type { database as cloudDatabase } from 'wx-server-sdk';
import type { UserSettings } from '../../shared/contracts';
import type { SettingsRepository } from '../settings/service';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

export class CloudBaseUserSettingsRepository implements SettingsRepository {
  constructor(private readonly database: CloudDatabase) {}

  async findByOwner(ownerOpenId: string): Promise<UserSettings | null> {
    const result = await this.database.collection('user_settings')
      .where({ _openid: ownerOpenId })
      .limit(1)
      .get();
    const value = firstDocument(result);
    return isUserSettings(value) ? value : null;
  }

  async save(record: UserSettings): Promise<UserSettings> {
    await this.database.collection('user_settings').doc(record._id).set({ data: record });
    return record;
  }

  async hasCurrentPrivacyConsent(ownerOpenId: string, version: string): Promise<boolean> {
    const record = await this.findByOwner(ownerOpenId);
    return record?.privacyConsentVersion === version && record.privacyConsentAt !== null;
  }
}

function firstDocument(result: unknown): unknown {
  return isRecord(result) && Array.isArray(result.data) ? result.data[0] : undefined;
}

function isUserSettings(value: unknown): value is UserSettings {
  return isRecord(value)
    && typeof value._id === 'string'
    && typeof value._openid === 'string'
    && value.locale === 'zh-CN'
    && typeof value.privacyConsentVersion === 'string'
    && (value.privacyConsentAt === null || typeof value.privacyConsentAt === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
