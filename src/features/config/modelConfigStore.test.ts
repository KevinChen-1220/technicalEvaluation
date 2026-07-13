import { loadModelConfig, saveModelConfig, type SecureKeyStore } from './modelConfigStore';
import type { AppDatabase, DatabaseValue } from '../../storage/database';

type SettingsRow = {
  id: string;
  base_url: string;
  model: string;
  updated_at: string;
};

function createMemoryDatabase(): AppDatabase {
  const settings = new Map<string, SettingsRow>();

  return {
    async execAsync() {},
    async runAsync(sql: string, ...params: DatabaseValue[]) {
      if (sql.includes('INSERT INTO model_settings')) {
        const [id, baseUrl, model, updatedAt] = params as [string, string, string, string];
        settings.set(id, { id, base_url: baseUrl, model, updated_at: updatedAt });
      }
    },
    async getAllAsync<T>() {
      return Array.from(settings.values()) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: DatabaseValue[]) {
      if (sql.includes('FROM model_settings WHERE id = ?')) {
        return (settings.get(params[0] as string) ?? null) as T | null;
      }

      return null;
    },
  };
}

function createMemorySecureStore(initial?: Record<string, string>): SecureKeyStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));

  return {
    values,
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
  };
}

function createMemoryFallbackStore(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));

  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('model config store', () => {
  it('saves non-secret settings in the database and api key in secure storage', async () => {
    const database = createMemoryDatabase();
    const secureStore = createMemorySecureStore();

    await saveModelConfig(
      { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-test' },
      { database, secureStore, now: () => '2026-07-13T08:00:00.000Z' },
    );

    await expect(loadModelConfig({ database, secureStore })).resolves.toEqual({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });
    expect(secureStore.values.get('skill_scope_model_api_key')).toBe('sk-test');
  });

  it('falls back to local storage when secure storage throws', async () => {
    const database = createMemoryDatabase();
    const fallbackStore = createMemoryFallbackStore();
    const failingSecureStore: SecureKeyStore = {
      async getItemAsync() {
        throw new Error('SecureStore unavailable');
      },
      async setItemAsync() {
        throw new Error('SecureStore unavailable');
      },
    };

    await saveModelConfig(
      { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-fallback', model: 'gpt-test' },
      { database, secureStore: failingSecureStore, fallbackStore },
    );

    await expect(loadModelConfig({ database, secureStore: failingSecureStore, fallbackStore })).resolves.toEqual({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-fallback',
      model: 'gpt-test',
    });
  });

  it('loads the legacy full config json when sqlite settings do not exist yet', async () => {
    const database = createMemoryDatabase();
    const secureStore = createMemorySecureStore({
      skill_scope_model_config: JSON.stringify({
        baseUrl: 'https://legacy.example.com/v1',
        apiKey: 'sk-legacy',
        model: 'legacy-model',
      }),
    });

    await expect(loadModelConfig({ database, secureStore })).resolves.toEqual({
      baseUrl: 'https://legacy.example.com/v1',
      apiKey: 'sk-legacy',
      model: 'legacy-model',
    });
  });

  it('loads legacy config from fallback storage when secure storage returns empty', async () => {
    const database = createMemoryDatabase();
    const secureStore = createMemorySecureStore();
    const fallbackStore = createMemoryFallbackStore({
      skill_scope_model_config: JSON.stringify({
        baseUrl: 'https://legacy-fallback.example.com/v1',
        apiKey: 'sk-legacy-fallback',
        model: 'legacy-fallback-model',
      }),
    });

    await expect(loadModelConfig({ database, secureStore, fallbackStore })).resolves.toEqual({
      baseUrl: 'https://legacy-fallback.example.com/v1',
      apiKey: 'sk-legacy-fallback',
      model: 'legacy-fallback-model',
    });
  });
});
