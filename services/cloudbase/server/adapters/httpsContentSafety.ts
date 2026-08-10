import { GenerationServiceError } from '../generation/errors';
import { allowAllTextModeration, type TextModerationPort } from '../moderation/ports';

export type ContentSafetyFetchTransport = (
  url: string,
  init: {
    method: 'POST';
    headers: { Authorization: string; 'Content-Type': 'application/json' };
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function createHttpsContentSafetyModeration(options: {
  environment: Record<string, string | undefined>;
  fetch: ContentSafetyFetchTransport;
}): TextModerationPort {
  const production = options.environment.SKILLSCOPE_ENV === 'production';
  const url = options.environment.CONTENT_SAFETY_URL?.trim();
  const apiKey = options.environment.CONTENT_SAFETY_API_KEY?.trim();
  const provider = options.environment.CONTENT_SAFETY_PROVIDER?.trim() || 'configured-provider';
  if (!url || !apiKey) {
    if (production) throw new GenerationServiceError('CONFIGURATION_ERROR', false);
    return allowAllTextModeration;
  }
  const endpoint = normalizeHttpsUrl(url);

  return {
    async checkText(input) {
      try {
        const response = await options.fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider,
            scene: input.scene,
            title: input.title,
            content: input.content,
          }),
        });
        if (!response.ok) return { allowed: false };
        return isAllowed(await response.json()) ? { allowed: true } : { allowed: false };
      } catch {
        return { allowed: false };
      }
    },
  };
}

function normalizeHttpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }
  url.hash = '';
  return url.toString();
}

function isAllowed(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.allowed === true) return true;
  const result = value.result;
  return isRecord(result) && result.suggest === 'pass';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
