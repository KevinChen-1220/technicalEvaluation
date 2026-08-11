export function success<T>(data: T, status = 200): Response {
  return json({ ok: true, data }, status);
}

export function failure(code: string, retryable: boolean, status: number): Response {
  return json({ ok: false, error: { code, retryable } }, status);
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
