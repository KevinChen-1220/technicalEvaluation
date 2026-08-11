export type EdgeOneRequestInput = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: Record<string, unknown>;
  timeoutMs: number;
};

export type SessionPort = {
  ensureSession(): Promise<string>;
  refreshSession(): Promise<string>;
  clearSession(): void;
};

export type TaroRequestPort = (input: {
  url: string;
  method: EdgeOneRequestInput['method'];
  data?: Record<string, unknown>;
  header?: Record<string, string>;
  timeout: number;
}) => Promise<{ statusCode: number; data: unknown }>;

export type EdgeOneRuntime = {
  request<T>(input: EdgeOneRequestInput): Promise<T>;
  requestPublic<T>(input: EdgeOneRequestInput): Promise<T>;
};

export function createEdgeOneRuntime(input: {
  apiBaseUrl: string | undefined;
  request: TaroRequestPort;
  session: SessionPort;
}): EdgeOneRuntime {
  let baseUrl: string | undefined;
  const resolveBaseUrl = (): string => {
    baseUrl ??= normalizeApiBaseUrl(input.apiBaseUrl);
    return baseUrl;
  };

  async function requestPublic<T>(requestInput: EdgeOneRequestInput): Promise<T> {
    return await send<T>(resolveBaseUrl(), input.request, requestInput);
  }

  return {
    requestPublic,
    async request<T>(requestInput: EdgeOneRequestInput): Promise<T> {
      const token = await input.session.ensureSession();
      try {
        return await send<T>(resolveBaseUrl(), input.request, requestInput, token);
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
      const refreshed = await input.session.refreshSession();
      return await send<T>(resolveBaseUrl(), input.request, requestInput, refreshed);
    },
  };
}

export function normalizeApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) throw publicError('CONFIGURATION_ERROR', 'EdgeOne API base URL is required.');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw publicError('CONFIGURATION_ERROR', 'EdgeOne API base URL must be HTTPS.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw publicError('CONFIGURATION_ERROR', 'EdgeOne API base URL must be HTTPS.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

async function send<T>(
  baseUrl: string,
  request: TaroRequestPort,
  input: EdgeOneRequestInput,
  token?: string,
): Promise<T> {
  if (!input.path.startsWith('/api/')) throw publicError('INVALID_REQUEST', 'EdgeOne API paths must begin with /api/.');
  try {
    const response = await request({
      url: `${baseUrl}${input.path}`,
      method: input.method,
      ...(input.body === undefined ? {} : { data: input.body }),
      header: {
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
      timeout: input.timeoutMs,
    });
    const payload = parsePayload(response.data);
    if (isSuccessEnvelope(payload) && response.statusCode >= 200 && response.statusCode < 300) return payload.data as T;
    const code = isFailureEnvelope(payload) ? payload.error.code : 'HTTP_ERROR';
    const retryable = isFailureEnvelope(payload) ? payload.error.retryable : response.statusCode >= 500;
    throw publicError(code, 'EdgeOne API request failed.', response.statusCode, retryable);
  } catch (error) {
    if (isPublicError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) throw publicError('REQUEST_TIMEOUT', 'EdgeOne API request timed out.', undefined, true);
    throw publicError('NETWORK_ERROR', 'EdgeOne API network request failed.', undefined, true);
  }
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw publicError('INVALID_RESPONSE', 'EdgeOne API returned malformed JSON.', undefined, true);
  }
}

function isSuccessEnvelope(value: unknown): value is { ok: true; data: unknown } {
  return isRecord(value) && value.ok === true && Object.prototype.hasOwnProperty.call(value, 'data');
}

function isFailureEnvelope(value: unknown): value is { ok: false; error: { code: string; retryable: boolean } } {
  return isRecord(value) && value.ok === false && isRecord(value.error)
    && typeof value.error.code === 'string' && typeof value.error.retryable === 'boolean';
}

function isUnauthorized(error: unknown): boolean {
  return isPublicError(error) && error.statusCode === 401;
}

export function publicError(
  errorCode: string,
  message: string,
  statusCode?: number,
  retryable = false,
): Error & { errorCode: string; statusCode?: number; retryable: boolean } {
  const error = new Error(message) as Error & { errorCode: string; statusCode?: number; retryable: boolean };
  error.errorCode = errorCode;
  error.retryable = retryable;
  if (statusCode !== undefined) error.statusCode = statusCode;
  return error;
}

function isPublicError(value: unknown): value is Error & { errorCode: string; statusCode?: number } {
  return value instanceof Error && 'errorCode' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
