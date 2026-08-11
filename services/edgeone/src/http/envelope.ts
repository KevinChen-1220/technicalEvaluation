export function success<T>(data: T, status = 200): Response {
  return json({ ok: true, data }, status);
}

export function failure(code: string, retryable: boolean, status: number): Response {
  return json({ ok: false, error: { code, message: publicMessage(code), retryable } }, status);
}

function publicMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_REQUEST: 'The request is invalid.',
    METHOD_NOT_ALLOWED: 'The HTTP method is not supported.',
    UNAUTHORIZED: 'Authentication is required.',
    SESSION_EXPIRED: 'The session has expired.',
    PRIVACY_CONSENT_REQUIRED: 'Current privacy consent is required.',
    CONTENT_BLOCKED: 'The content did not pass safety review.',
    FREE_TIER_LIMIT: 'The free generation limit has been reached.',
    GENERATION_DISABLED: 'Assessment generation is temporarily disabled.',
    PROVIDER_ERROR: 'The model provider is temporarily unavailable.',
    INVALID_MODEL_RESPONSE: 'The model returned an invalid assessment.',
    CONFIGURATION_ERROR: 'The service is not configured.',
    REQUEST_TIMEOUT: 'The request timed out.',
    BACKEND_UNAVAILABLE: 'The backend is temporarily unavailable.',
    INTERNAL_ERROR: 'An internal error occurred.',
  };
  return messages[code] ?? 'The request could not be completed.';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
