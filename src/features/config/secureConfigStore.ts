import * as SecureStore from 'expo-secure-store';
import type { ModelConfig } from './modelConfig';

const configKey = 'skill_scope_model_config';

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await SecureStore.setItemAsync(configKey, JSON.stringify(config));
}

export async function loadModelConfig(): Promise<ModelConfig | null> {
  const raw = await SecureStore.getItemAsync(configKey);
  if (!raw) return null;
  return JSON.parse(raw) as ModelConfig;
}
