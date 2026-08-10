import type { CreateGenerationInput } from '../services/cloud';
import type { StoragePort } from './assessmentCache';

const GENERATION_INTENT_KEY = 'skill-scope:generation-intent';

export type GenerationIntent = {
  clientRequestId: string;
  input: Omit<CreateGenerationInput, 'clientRequestId'>;
  jobId?: string;
};

export type GenerationIntentStore = {
  load(): GenerationIntent | undefined;
  save(intent: GenerationIntent): void;
  clear(): void;
};

export function createGenerationIntentStore(storage: StoragePort): GenerationIntentStore {
  return {
    load() {
      const value = storage.get<unknown>(GENERATION_INTENT_KEY);
      return isGenerationIntent(value) ? value : undefined;
    },
    save(intent) {
      storage.set(GENERATION_INTENT_KEY, intent);
    },
    clear() {
      storage.set(GENERATION_INTENT_KEY, null);
    },
  };
}

function isGenerationIntent(value: unknown): value is GenerationIntent {
  if (!isRecord(value) || !isRecord(value.input)) return false;
  return typeof value.clientRequestId === 'string'
    && value.clientRequestId.length > 0
    && typeof value.input.topic === 'string'
    && (value.input.notes === undefined || typeof value.input.notes === 'string')
    && (value.input.questionCount === 50 || value.input.questionCount === 100)
    && (value.jobId === undefined || (typeof value.jobId === 'string' && value.jobId.length > 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
