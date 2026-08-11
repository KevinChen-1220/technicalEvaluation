import { ApiError } from './errors';

export type Deadline = { expiresAt: number; now(): number };

export function createDeadline(durationMs: number, now: () => number = Date.now): Deadline {
  return { expiresAt: now() + durationMs, now };
}

export function remainingMilliseconds(deadline: Deadline): number {
  return Math.max(0, deadline.expiresAt - deadline.now());
}

export function assertWithinDeadline(deadline: Deadline): void {
  if (remainingMilliseconds(deadline) <= 0) throw requestTimeout();
}

export async function withinDeadline<T>(operation: Promise<T>, deadline: Deadline): Promise<T> {
  const remaining = remainingMilliseconds(deadline);
  if (remaining <= 0) throw requestTimeout();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(requestTimeout()), remaining);
  });
  try {
    return await Promise.race([operation, expiry]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export function requestTimeout(): ApiError {
  return new ApiError('REQUEST_TIMEOUT', 504, true);
}
