import { ApiError } from '../http/errors';
import { failure } from '../http/envelope';

const MAX_REQUEST_BYTES = 64 * 1024;

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw invalidRequest();
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw invalidRequest();
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BYTES) throw invalidRequest();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw invalidRequest();
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidRequest();
  }
}

export function routeFailure(error: unknown): Response {
  if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
  return failure('INTERNAL_ERROR', true, 500);
}

export function invalidRequest(): ApiError {
  return new ApiError('INVALID_REQUEST', 400, false);
}

export function nonEmptyString(value: unknown, maximum = 10_000): string {
  if (typeof value !== 'string') throw invalidRequest();
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) throw invalidRequest();
  return normalized;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
