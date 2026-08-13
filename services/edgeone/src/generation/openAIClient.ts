import { ApiError } from '../http/errors';
import type { Deadline } from '../http/deadline';

const PROVIDER_TIMEOUT_MS = 105_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type CompletionInput = {
  topic: string;
  notes?: string;
  questionCount: 10;
  batchNumber: number;
  totalBatches: number;
  includeScoring: boolean;
};
export type FetchPort = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenAICompletionDependencies {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  fetch?: FetchPort;
  deadline?: Deadline;
}

export async function requestOpenAICompletion(
  input: CompletionInput,
  dependencies: OpenAICompletionDependencies,
): Promise<string> {
  const { baseUrl, apiKey, model } = requireConfiguration(dependencies);
  const controller = new AbortController();
  const startedAt = Date.now();
  const globalExpiry = dependencies.deadline?.expiresAt ?? Number.POSITIVE_INFINITY;
  const providerExpiry = startedAt + PROVIDER_TIMEOUT_MS;
  const expiresAt = Math.min(globalExpiry, providerExpiry);
  const timeoutError = globalExpiry <= providerExpiry
    ? new ApiError('REQUEST_TIMEOUT', 504, true)
    : new ApiError('PROVIDER_ERROR', 502, true);
  const timeoutMs = Math.max(0, expiresAt - Date.now());
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    if (timeoutMs <= 0) throw timeoutError;
    const response = await Promise.race([
      (dependencies.fetch ?? fetch)(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: buildMessages(input),
        }),
        signal: controller.signal,
      }),
      expiry,
    ]);
    if (!response.ok) {
      cancelUnreadBody(response);
      throw new ApiError('PROVIDER_ERROR', 502, true);
    }
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES, expiresAt, timeoutError);
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
    if (timedOut) throw timeoutError;
    throw new ApiError('PROVIDER_ERROR', 502, true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function buildMessages(input: CompletionInput): Array<{ role: 'system' | 'user'; content: string }> {
  const scoringInstruction = input.includeScoring
    ? 'Also include scoring with maxScore and localized levels covering integer percentages 0 through 100 without gaps.'
    : 'Return questions only and omit scoring.';
  return [
    {
      role: 'system',
      content: [
        'Return one JSON object and no HTML, XML, Markdown, or prose.',
        'Generate exactly 10 assessment questions with id, type, difficulty, knowledgePoint, prompt, options, correctOptionIds, and explanation.',
        'Option IDs must be unique inside each question and every correctOptionId must reference an option.',
        'Write the assessment in the same language as the topic and notes. When language is unclear, default to Chinese.',
        scoringInstruction,
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        topic: input.topic,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        batchNumber: input.batchNumber + 1,
        totalBatches: input.totalBatches,
        questionCount: input.questionCount,
      }),
    },
  ];
}

async function readBoundedBody(response: Response, limit: number, expiresAt: number, timeoutError: ApiError): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    cancelUnreadBody(response);
    throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const remaining = Math.max(0, expiresAt - Date.now());
      if (remaining <= 0) throw timeoutError;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError), remaining);
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) break;
      if (result.value === undefined) continue;
      total += result.value.byteLength;
      if (total > limit) throw new ApiError('INVALID_MODEL_RESPONSE', 502, true);
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function cancelUnreadBody(response: Response): void {
  if (response.body !== null && !response.body.locked) void response.body.cancel().catch(() => undefined);
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
