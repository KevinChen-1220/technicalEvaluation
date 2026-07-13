import * as SecureStore from 'expo-secure-store';
import { getAppDatabase, type AppDatabase } from '../../storage/database';
import type { ModelConfig } from './modelConfig';

const settingsId = 'default';
const apiKeyKey = 'skill_scope_model_api_key';
const legacyConfigKey = 'skill_scope_model_config';
const memoryFallbackStorage = new Map<string, string>();

type ModelSettingsRow = {
  id: string;
  base_url: string;
  model: string;
  updated_at: string;
};

export type SecureKeyStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

type FallbackStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type ModelConfigStoreOptions = {
  database?: AppDatabase;
  secureStore?: SecureKeyStore;
  fallbackStore?: FallbackStore;
  now?: () => string;
};

export async function saveModelConfig(config: ModelConfig, options: ModelConfigStoreOptions = {}): Promise<void> {
  const database = options.database ?? (await getAppDatabase());
  const updatedAt = options.now?.() ?? new Date().toISOString();

  await ensureModelSettingsSchema(database);
  await database.runAsync(
    `INSERT INTO model_settings (id, base_url, model, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        base_url = excluded.base_url,
        model = excluded.model,
        updated_at = excluded.updated_at`,
    settingsId,
    config.baseUrl,
    config.model,
    updatedAt,
  );
  await setStoredSecret(apiKeyKey, config.apiKey, options);
}

export async function loadModelConfig(options: ModelConfigStoreOptions = {}): Promise<ModelConfig | null> {
  const database = options.database ?? (await getAppDatabase());
  await ensureModelSettingsSchema(database);

  const settings = await database.getFirstAsync<ModelSettingsRow>('SELECT * FROM model_settings WHERE id = ?', settingsId);
  if (settings) {
    return {
      baseUrl: settings.base_url,
      apiKey: (await getStoredSecret(apiKeyKey, options)) ?? '',
      model: settings.model,
    };
  }

  return loadLegacyModelConfig(options);
}

async function ensureModelSettingsSchema(database: AppDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS model_settings (
      id TEXT PRIMARY KEY NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

async function loadLegacyModelConfig(options: ModelConfigStoreOptions): Promise<ModelConfig | null> {
  const raw = await getStoredSecret(legacyConfigKey, options);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ModelConfig;
  } catch {
    return null;
  }
}

async function getStoredSecret(key: string, options: ModelConfigStoreOptions): Promise<string | null> {
  const fallbackStore = options.fallbackStore ?? defaultFallbackStore;

  try {
    const secureStore = options.secureStore ?? (await getDefaultSecureStore());
    return await secureStore.getItemAsync(key);
  } catch {
    return fallbackStore.getItem(key);
  }
}

async function setStoredSecret(key: string, value: string, options: ModelConfigStoreOptions): Promise<void> {
  const fallbackStore = options.fallbackStore ?? defaultFallbackStore;

  try {
    const secureStore = options.secureStore ?? (await getDefaultSecureStore());
    await secureStore.setItemAsync(key, value);
  } catch {
    await fallbackStore.setItem(key, value);
  }
}

async function getDefaultSecureStore(): Promise<SecureKeyStore> {
  return SecureStore;
}

const defaultFallbackStore: FallbackStore = {
  async getItem(key) {
    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage.getItem(key);
    }

    return memoryFallbackStorage.get(key) ?? null;
  },
  async setItem(key, value) {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    memoryFallbackStorage.set(key, value);
  },
};
