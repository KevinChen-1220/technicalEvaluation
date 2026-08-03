import Taro from '@tarojs/taro';
import type { CachedAssessment } from '../storage/assessmentCache';

export type CreateGenerationInput = {
  topic: string;
  notes?: string;
  questionCount: 50 | 100;
};

export type GenerationJobStatus = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  retryable: boolean;
  assessmentId?: string;
  errorCode?: string;
};

export type UpdateAssessmentInput = {
  assessmentId: string;
  answers: Record<string, string[]>;
  expectedRevision: number;
};

export type UpdateAssessmentResponse =
  | { type: 'updated'; revision: number }
  | { type: 'conflict'; current: CachedAssessment };

type CloudCall = (input: { name: string; data: Record<string, unknown> }) => Promise<{ result?: unknown }>;

export function createCloudClient(callFunction: CloudCall = taroCloudCall) {
  async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
    const response = await callFunction({ name, data });
    return response.result as T;
  }

  return {
    async createGenerationJob(input: CreateGenerationInput): Promise<{ jobId: string; status: 'queued' | 'running' | 'completed' | 'failed' }> {
      const data = {
        topic: input.topic,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        questionCount: input.questionCount,
      };
      const result = await call<unknown>('create-generation-job', data);
      if (!isRecord(result) || typeof result.jobId !== 'string' || !isGenerationStatus(result.status)) {
        throwPublicError(result);
      }
      return result as { jobId: string; status: 'queued' | 'running' | 'completed' | 'failed' };
    },
    async getGenerationJob(input: { jobId: string }): Promise<GenerationJobStatus> {
      const result = await call<unknown>('get-generation-job', { jobId: input.jobId });
      if (!isRecord(result) || !isGenerationStatus(result.status)) throwPublicError(result);
      return result as GenerationJobStatus;
    },
    getAssessment(input: { assessmentId: string }): Promise<
      | { type: 'found'; assessment: CachedAssessment }
      | { type: 'not_found'; errorCode: 'INVALID_REQUEST' }
    > {
      return call('get-assessment', { assessmentId: input.assessmentId });
    },
    async updateAssessment(input: UpdateAssessmentInput): Promise<UpdateAssessmentResponse> {
      const result = await call<unknown>('update-assessment', {
        assessmentId: input.assessmentId,
        answers: input.answers,
        expectedRevision: input.expectedRevision,
      });
      if (!isRecord(result) || (result.type !== 'updated' && result.type !== 'conflict')) {
        throwPublicError(result);
      }
      return result as UpdateAssessmentResponse;
    },
  };
}

async function taroCloudCall(input: { name: string; data: Record<string, unknown> }): Promise<{ result?: unknown }> {
  return Taro.cloud.callFunction(input) as Promise<{ result?: unknown }>;
}

export const cloudClient = createCloudClient();

function isSafeErrorCode(value: string): boolean {
  return value === 'INVALID_REQUEST'
    || value === 'QUOTA_EXCEEDED'
    || value === 'PROVIDER_ERROR'
    || value === 'INVALID_MODEL_RESPONSE'
    || value === 'CONFIGURATION_ERROR'
    || value === 'INTERNAL_ERROR';
}

function isGenerationStatus(value: unknown): value is GenerationJobStatus['status'] {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed';
}

function throwPublicError(result: unknown): never {
  const value = isRecord(result) && typeof result.errorCode === 'string'
    ? result.errorCode
    : 'INTERNAL_ERROR';
  const error = new Error('Cloud function request failed.') as Error & { errorCode: string };
  error.errorCode = isSafeErrorCode(value) ? value : 'INTERNAL_ERROR';
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
