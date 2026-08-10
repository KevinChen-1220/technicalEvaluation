import type { PrivacyConsentRecord } from '../privacy/consent';
import type { StoragePort } from './assessmentCache';

const PRIVACY_CONSENT_KEY = 'privacy-consent:v1';

export function createPrivacyConsentStore(storage: StoragePort) {
  return {
    get(): PrivacyConsentRecord | undefined {
      return storage.get<PrivacyConsentRecord>(PRIVACY_CONSENT_KEY);
    },
    save(record: PrivacyConsentRecord): void {
      storage.set(PRIVACY_CONSENT_KEY, record);
    },
  };
}
