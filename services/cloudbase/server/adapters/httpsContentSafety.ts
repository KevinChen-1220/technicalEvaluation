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
  ) => Promise<{
    ok: boolean;
    headers?: { get(name: string): string | null };
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;

const defaultTimeoutMs = 5_000;
const defaultMaxResponseBytes = 16 * 1024;

export function createHttpsContentSafetyModeration(options: {
  environment: Record<string, string | undefined>;
  fetch: ContentSafetyFetchTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
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
  const timeoutMs = positiveInteger(options.timeoutMs, defaultTimeoutMs);
  const maxResponseBytes = positiveInteger(options.maxResponseBytes, defaultMaxResponseBytes);

  return {
    async checkText(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          signal: controller.signal,
        });
        if (!response.ok) return { allowed: false };
        if (contentLengthExceeds(response.headers?.get('content-length'), maxResponseBytes)) {
          return { allowed: false };
        }
        const body = await response.arrayBuffer();
        if (body.byteLength > maxResponseBytes) return { allowed: false };
        const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
        return isAllowed(parsed) ? { allowed: true } : { allowed: false };
      } catch {
        return { allowed: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function contentLengthExceeds(value: string | null | undefined, maximum: number): boolean {
  if (value === undefined || value === null || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > maximum;
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
