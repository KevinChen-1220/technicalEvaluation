import { ApiError } from '../http/errors';
import { failure } from '../http/envelope';
import type { Deadline } from '../http/deadline';
import { remainingMilliseconds, requestTimeout } from '../http/deadline';

const MAX_REQUEST_BYTES = 64 * 1024;

export async function readJsonObject(request: Request, deadline?: Deadline): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw invalidRequest();
  let text: string;
  try {
    text = deadline === undefined ? await request.text() : await readRequestBody(request, deadline);
  } catch (error) {
    if (error instanceof ApiError) throw error;
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

async function readRequestBody(request: Request, deadline: Deadline): Promise<string> {
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const remaining = remainingMilliseconds(deadline);
      if (remaining <= 0) throw requestTimeout();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(requestTimeout()), remaining);
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      if (result.done) break;
      if (result.value === undefined) continue;
      total += result.value.byteLength;
      if (total > MAX_REQUEST_BYTES) throw invalidRequest();
      chunks.push(result.value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function routeFailure(error: unknown): Response {
  if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
  return failure('INTERNAL_ERROR', true, 500);
}

export function invalidRequest(): ApiError {
  return new ApiError('INVALID_REQUEST', 400, false);
}

export function methodNotAllowed(): ApiError {
  return new ApiError('METHOD_NOT_ALLOWED', 405, false);
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
