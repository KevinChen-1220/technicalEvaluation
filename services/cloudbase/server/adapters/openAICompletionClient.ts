import { GenerationServiceError } from '../generation/errors';
import type { CompletionBatchRequest, CompletionClient } from '../generation/worker';

export type FetchTransport = (
  url: string,
  init: {
    method: 'POST';
    headers: { Authorization: string; 'Content-Type': 'application/json' };
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type OpenAICompletionClientOptions = {
  environment: Record<string, string | undefined>;
  fetch: FetchTransport;
};

export function createOpenAICompletionClient(
  options: OpenAICompletionClientOptions,
): CompletionClient {
  const baseUrl = requireEnvironmentValue(options.environment.LLM_BASE_URL);
  const apiKey = requireEnvironmentValue(options.environment.LLM_API_KEY);
  const model = requireEnvironmentValue(options.environment.LLM_MODEL);
  const completionUrl = normalizeCompletionUrl(baseUrl);

  return {
    async complete(request, callOptions): Promise<string> {
      let response: Awaited<ReturnType<FetchTransport>>;
      try {
        response = await options.fetch(completionUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: buildMessages(request),
            response_format: { type: 'json_object' },
          }),
          signal: callOptions.signal,
        });
      } catch {
        throw new GenerationServiceError('PROVIDER_ERROR', true);
      }

      if (!response.ok) {
        throw new GenerationServiceError('PROVIDER_ERROR', true);
      }

      try {
        const body = await response.json();
        const content = readCompletionContent(body);
        if (content === null) {
          throw new GenerationServiceError('PROVIDER_ERROR', true);
        }
        return content;
      } catch (error) {
        if (error instanceof GenerationServiceError) throw error;
        throw new GenerationServiceError('PROVIDER_ERROR', true);
      }
    },
  };
}

function buildMessages(request: CompletionBatchRequest): Array<{ role: 'system' | 'user'; content: string }> {
  const scoringInstruction = request.includeScoring
    ? 'Also include scoring with maxScore and localized levels covering integer percentages 0 through 100 without gaps.'
    : 'Return questions only and omit scoring.';
  return [
    {
      role: 'system',
      content: [
        'Return one JSON object and no HTML, XML, Markdown, or prose.',
        'Generate exactly 10 assessment questions with type, difficulty, knowledgePoint, prompt, options, correctOptionIds, and explanation.',
        'Option IDs must be unique inside each question and every correctOptionId must reference an option.',
        scoringInstruction,
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        topic: request.topic,
        ...(request.notes === undefined ? {} : { notes: request.notes }),
        batchNumber: request.batchNumber + 1,
        totalBatches: request.totalBatches,
        questionCount: request.questionCount,
      }),
    },
  ];
}

function normalizeCompletionUrl(configuredBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(configuredBaseUrl);
  } catch {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }

  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/chat\/completions$/i, '');
  if (!/\/v1$/i.test(path)) path = `${path}/v1`;
  url.pathname = `${path}/chat/completions`.replace(/\/{2,}/g, '/');
  return url.toString();
}

function requireEnvironmentValue(value: string | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }
  return value.trim();
}

function readCompletionContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
    return null;
  }
  const message = value.choices[0].message;
  if (!isRecord(message) || typeof message.content !== 'string' || message.content.length === 0) {
    return null;
  }
  return message.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
