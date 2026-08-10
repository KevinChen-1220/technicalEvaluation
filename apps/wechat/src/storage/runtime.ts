import Taro from '@tarojs/taro';
import { AssessmentSyncQueue } from '../answer/syncQueue';
import { cloudClient } from '../services/cloud';
import { createAssessmentCache, type StoragePort } from './assessmentCache';
import { createPrivacyConsentStore } from './privacyConsent';

const taroStorage: StoragePort = {
  get<T>(key: string): T | undefined {
    const value = Taro.getStorageSync<T | ''>(key);
    return value === '' ? undefined : value;
  },
  set<T>(key: string, value: T): void {
    Taro.setStorageSync(key, value);
  },
};

export const assessmentCache = createAssessmentCache(taroStorage);
export const privacyConsentStore = createPrivacyConsentStore(taroStorage);
export const assessmentSyncQueue = new AssessmentSyncQueue({
  cache: assessmentCache,
  updateAssessment: cloudClient.updateAssessment,
});
