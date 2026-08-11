import { ApiError } from '../http/errors';

const PROVIDER_TIMEOUT_MS = 105_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type CompletionInput = { topic: string; notes?: string };
export type FetchPort = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenAICompletionDependencies {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  fetch?: FetchPort;
}

export async function requestOpenAICompletion(
  input: CompletionInput,
  dependencies: OpenAICompletionDependencies,
): Promise<string> {
  const { baseUrl, apiKey, model } = requireConfiguration(dependencies);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await (dependencies.fetch ?? fetch)(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Generate exactly 50 assessment questions in one response.',
              'Return one JSON object with questions and scoring. Do not return HTML, XML, Markdown, or commentary.',
              'Write the assessment in the same language as the topic and notes. When language is unclear, default to Chinese.',
              'Each question must include id, type, difficulty, knowledgePoint, prompt, options, correctOptionIds, and explanation.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({ topic: input.topic, ...(input.notes === undefined ? {} : { notes: input.notes }) }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiError('PROVIDER_ERROR', 502, true);
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
    }
    const content = completionContent(payload);
    if (content === null) throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
    return content;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('PROVIDER_ERROR', 502, true);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function completionContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') return null;
  return first.message.content;
}

function requireConfiguration(dependencies: OpenAICompletionDependencies): { baseUrl: string; apiKey: string; model: string } {
  if (!dependencies.baseUrl || !dependencies.apiKey || !dependencies.model) {
    throw new ApiError('CONFIGURATION_ERROR', 503, false);
  }
  let url: URL;
  try {
    url = new URL(dependencies.baseUrl);
  } catch {
    throw new ApiError('CONFIGURATION_ERROR', 503, false);
  }
  if (url.protocol !== 'https:') throw new ApiError('CONFIGURATION_ERROR', 503, false);
  return { baseUrl: dependencies.baseUrl, apiKey: dependencies.apiKey, model: dependencies.model };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
