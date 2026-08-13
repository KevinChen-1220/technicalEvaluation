import { createDeadline } from '../src/http/deadline';
import { readJsonObject } from '../src/routes/support';
import { requestOpenAICompletion } from '../src/generation/openAIClient';

describe('global request deadline and bounded readers', () => {
  test('times out and cancels a stalled request body reader', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const request = new Request('https://example.test/api/generation', {
      method: 'POST', body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const outcome = await settlesWithin(readJsonObject(request, createDeadline(10)), 100);
    expect(outcome).toEqual({ type: 'rejected', error: expect.objectContaining({
      code: 'REQUEST_TIMEOUT', status: 504, retryable: true,
    }) });
    expect(cancelled).toBe(true);
  });

  test('cancels a multi-chunk provider body immediately after crossing 2 MiB', async () => {
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024 + 1).fill(65);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const operation = requestOpenAICompletion(batchInput('JavaScript'), {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
      fetch: async () => new Response(body),
      deadline: createDeadline(115_000),
    });
    const outcome = await settlesWithin(operation, 100);
    expect(outcome).toEqual({ type: 'rejected', error: expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }) });
    expect(cancelled).toBe(true);
  });

  test('limits the provider timeout to the remaining global budget', async () => {
    jest.useFakeTimers();
    try {
      const operation = requestOpenAICompletion(batchInput('JavaScript'), {
        baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
        deadline: createDeadline(50),
        fetch: async (_url, init) => await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      });
      const rejection = expect(operation).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', retryable: true });
      await jest.advanceTimersByTimeAsync(50);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });
});

function batchInput(topic: string) {
  return {
    topic,
    questionCount: 10 as const,
    batchNumber: 0,
    totalBatches: 5,
    includeScoring: true,
  };
}

async function settlesWithin(operation: Promise<unknown>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(
        (value) => ({ type: 'resolved' as const, value }),
        (error: unknown) => ({ type: 'rejected' as const, error }),
      ),
      new Promise<{ type: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ type: 'timeout' }), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
