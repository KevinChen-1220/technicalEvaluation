import { createOpenAICompletionClient, type FetchTransport } from '../server/adapters/openAICompletionClient';
import type { CompletionBatchRequest } from '../server/generation/worker';

const request: CompletionBatchRequest = {
  topic: 'TypeScript',
  notes: 'Generics',
  questionCount: 10,
  batchNumber: 0,
  totalBatches: 5,
  includeScoring: true,
};

function callOptions(): { signal: AbortSignal } {
  return { signal: new AbortController().signal };
}

describe('OpenAI-compatible completion client', () => {
  test.each(['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'] as const)(
    'fails safely when %s is missing',
    async (missingKey) => {
      const environment: Record<string, string | undefined> = {
        LLM_BASE_URL: 'https://provider.example/api/v1',
        LLM_API_KEY: 'server-secret',
        LLM_MODEL: 'server-model',
      };
      delete environment[missingKey];

      expect(() => createOpenAICompletionClient({
        environment,
        fetch: jest.fn() as unknown as FetchTransport,
      })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', retryable: false }));
    },
  );

  test('rejects an HTTP provider base URL as configuration error', () => {
    const fetch = jest.fn() as unknown as FetchTransport;

    expect(() => createOpenAICompletionClient({
      environment: {
        LLM_BASE_URL: 'http://provider.example/v1',
        LLM_API_KEY: 'server-secret',
        LLM_MODEL: 'server-model',
      },
      fetch,
    })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', retryable: false }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['https://provider.example/api', 'https://provider.example/api/v1/chat/completions'],
    ['https://provider.example/api/v1/', 'https://provider.example/api/v1/chat/completions'],
    ['https://provider.example/api/v1/chat/completions', 'https://provider.example/api/v1/chat/completions'],
    ['https://provider.example/api/chat/completions', 'https://provider.example/api/v1/chat/completions'],
  ])('normalizes %s without duplicating completion path segments', async (baseUrl, expectedUrl) => {
    const fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"questions":[]}' } }] }),
    })) as unknown as FetchTransport;
    const client = createOpenAICompletionClient({
      environment: {
        LLM_BASE_URL: baseUrl,
        LLM_API_KEY: 'server-secret',
        LLM_MODEL: 'server-model',
      },
      fetch,
    });

    await expect(client.complete(request, callOptions())).resolves.toBe('{"questions":[]}');
    expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer server-secret',
        'Content-Type': 'application/json',
      },
    }));
  });

  test('does not read or expose a failed provider body, endpoint, model, or key', async () => {
    const bodyReader = jest.fn(async () => ({ secretProviderBody: 'must-not-escape' }));
    const fetch = jest.fn(async () => ({ ok: false, json: bodyReader })) as unknown as FetchTransport;
    const client = createOpenAICompletionClient({
      environment: {
        LLM_BASE_URL: 'https://private-provider.example/v1',
        LLM_API_KEY: 'private-key',
        LLM_MODEL: 'private-model',
      },
      fetch,
    });

    let received: unknown;
    try {
      await client.complete(request, callOptions());
    } catch (error) {
      received = error;
    }

    expect(received).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(bodyReader).not.toHaveBeenCalled();
    const serialized = JSON.stringify(received);
    expect(serialized).not.toContain('must-not-escape');
    expect(serialized).not.toContain('private-provider');
    expect(serialized).not.toContain('private-key');
    expect(serialized).not.toContain('private-model');
  });

  test('passes the worker AbortSignal to fetch and safely maps abort rejection', async () => {
    const controller = new AbortController();
    const fetch = jest.fn((_url: string, init: { signal: AbortSignal }) => (
      new Promise<never>((_resolve, reject) => {
        expect(init.signal).toBe(controller.signal);
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    )) as unknown as FetchTransport;
    const client = createOpenAICompletionClient({
      environment: {
        LLM_BASE_URL: 'https://provider.example/v1',
        LLM_API_KEY: 'server-secret',
        LLM_MODEL: 'server-model',
      },
      fetch,
    });

    const completion = client.complete(request, { signal: controller.signal });
    controller.abort();

    await expect(completion).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
