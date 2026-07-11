export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ConfigValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateModelConfig(config: Partial<ModelConfig>): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.baseUrl || !isValidUrl(config.baseUrl)) {
    errors.push('Base URL must be a valid URL.');
  }

  if (!config.apiKey?.trim()) {
    errors.push('API Key is required.');
  }

  if (!config.model?.trim()) {
    errors.push('Model is required.');
  }

  return { ok: errors.length === 0, errors };
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
