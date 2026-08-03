import type { CachedAssessment } from '../storage/assessmentCache';
import { cloudRuntime } from './cloudRuntime';

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

type CloudClientOptions = { callTimeoutMs?: number };

export function createCloudClient(
  callFunction: CloudCall = cloudRuntime.callFunction,
  options: CloudClientOptions = {},
) {
  const callTimeoutMs = options.callTimeoutMs ?? 15_000;

  async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
    const response: unknown = await withTimeout(callFunction({ name, data }), callTimeoutMs);
    if (!isRecord(response) || !Object.prototype.hasOwnProperty.call(response, 'result')) {
      throw createPublicError('INTERNAL_ERROR');
    }
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
      if (!isRecord(result) || !isNonEmptyString(result.jobId) || !isGenerationStatus(result.status)) {
        throwPublicError(result);
      }
      return result as { jobId: string; status: 'queued' | 'running' | 'completed' | 'failed' };
    },
    async getGenerationJob(input: { jobId: string }): Promise<GenerationJobStatus> {
      const result = await call<unknown>('get-generation-job', { jobId: input.jobId });
      if (!isGenerationJobStatus(result)) throwPublicError(
        isRecord(result) && result.status === 'completed' ? { errorCode: 'INCOMPLETE_JOB' } : result,
      );
      return result as GenerationJobStatus;
    },
    async getAssessment(input: { assessmentId: string }): Promise<
      | { type: 'found'; assessment: CachedAssessment }
      | { type: 'not_found'; errorCode: 'INVALID_REQUEST' }
    > {
      const result = await call<unknown>('get-assessment', { assessmentId: input.assessmentId });
      if (isRecord(result) && result.type === 'not_found' && result.errorCode === 'INVALID_REQUEST') {
        return { type: 'not_found', errorCode: 'INVALID_REQUEST' };
      }
      if (!isRecord(result) || result.type !== 'found' || !isCachedAssessment(result.assessment)) {
        throwPublicError(result);
      }
      return { type: 'found', assessment: result.assessment };
    },
    async updateAssessment(input: UpdateAssessmentInput): Promise<UpdateAssessmentResponse> {
      const result = await call<unknown>('update-assessment', {
        assessmentId: input.assessmentId,
        answers: input.answers,
        expectedRevision: input.expectedRevision,
      });
      if (isRecord(result) && result.type === 'updated' && isPositiveInteger(result.revision)) {
        return { type: 'updated', revision: result.revision };
      }
      if (isRecord(result) && result.type === 'conflict' && isCachedAssessment(result.current)) {
        return { type: 'conflict', current: result.current };
      }
      throwPublicError(result);
    },
  };
}

export const cloudClient = createCloudClient();

function isSafeErrorCode(value: string): boolean {
  return value === 'INVALID_REQUEST'
    || value === 'QUOTA_EXCEEDED'
    || value === 'PROVIDER_ERROR'
    || value === 'INVALID_MODEL_RESPONSE'
    || value === 'CONFIGURATION_ERROR'
    || value === 'INTERNAL_ERROR'
    || value === 'INCOMPLETE_JOB'
    || value === 'REQUEST_TIMEOUT';
}

function isGenerationStatus(value: unknown): value is GenerationJobStatus['status'] {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed';
}

function isGenerationJobStatus(value: unknown): value is GenerationJobStatus {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.jobId)
    || !isGenerationStatus(value.status)
    || !isFiniteNumber(value.progress)
    || value.progress < 0
    || value.progress > 100
    || typeof value.retryable !== 'boolean'
  ) return false;
  if (value.status === 'completed' && !isNonEmptyString(value.assessmentId)) return false;
  if (value.assessmentId !== undefined && !isNonEmptyString(value.assessmentId)) return false;
  if (value.errorCode !== undefined && typeof value.errorCode !== 'string') return false;
  return true;
}

function isCachedAssessment(value: unknown): value is CachedAssessment {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.id)
    || !isPositiveInteger(value.revision)
    || (value.status !== 'draft' && value.status !== 'completed')
    || !isAnswerablePaper(value.paper)
    || !isAnswers(value.answers, value.paper)
  ) return false;
  return true;
}

function isAnswerablePaper(value: unknown): value is CachedAssessment['paper'] {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.topic)
    || !isNonEmptyString(value.generatedAt)
    || (value.questionCount !== 50 && value.questionCount !== 100)
    || !isScoring(value.scoring)
    || !Array.isArray(value.questions)
    || value.questions.length !== value.questionCount
  ) return false;
  const ids = new Set<string>();
  for (const question of value.questions) {
    if (!isAnswerableQuestion(question) || ids.has(question.id)) return false;
    ids.add(question.id);
  }
  return true;
}

function isScoring(value: unknown): value is CachedAssessment['paper']['scoring'] {
  return isRecord(value)
    && isFiniteNumber(value.maxScore)
    && value.maxScore >= 0
    && Array.isArray(value.levels)
    && value.levels.every((level) => (
      isRecord(level)
      && isFiniteNumber(level.minPercent)
      && isFiniteNumber(level.maxPercent)
      && isNonEmptyString(level.title)
      && isNonEmptyString(level.summary)
    ));
}

function isAnswerableQuestion(value: unknown): value is CachedAssessment['paper']['questions'][number] {
  if (
    !isRecord(value)
    || Object.prototype.hasOwnProperty.call(value, 'correctOptionIds')
    || Object.prototype.hasOwnProperty.call(value, 'explanation')
    || !isNonEmptyString(value.id)
    || (value.type !== 'single_choice' && value.type !== 'multiple_choice' && value.type !== 'true_false')
    || (value.difficulty !== 'easy' && value.difficulty !== 'medium' && value.difficulty !== 'hard')
    || !isNonEmptyString(value.knowledgePoint)
    || !isNonEmptyString(value.prompt)
    || !Array.isArray(value.options)
    || value.options.length < 2
  ) return false;
  const optionIds = new Set<string>();
  for (const option of value.options) {
    if (!isRecord(option) || !isNonEmptyString(option.id) || !isNonEmptyString(option.text) || optionIds.has(option.id)) {
      return false;
    }
    optionIds.add(option.id);
  }
  return value.materials === undefined
    || (Array.isArray(value.materials) && value.materials.every(isMaterial));
}

function isMaterial(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === 'text') return isNonEmptyString(value.text);
  if (value.type === 'image') {
    return isHttpsUrl(value.uri)
      && isNonEmptyString(value.alt)
      && (value.caption === undefined || isNonEmptyString(value.caption))
      && (value.aspectRatio === undefined || (isFiniteNumber(value.aspectRatio) && value.aspectRatio > 0));
  }
  if (value.type === 'table') {
    if (
      (value.caption !== undefined && !isNonEmptyString(value.caption))
      || !Array.isArray(value.columns)
      || value.columns.length === 0
      || !value.columns.every(isNonEmptyString)
      || !Array.isArray(value.rows)
      || value.rows.length === 0
    ) return false;
    const columnCount = value.columns.length;
    return value.rows.every((row) => (
      Array.isArray(row) && row.length === columnCount && row.every(isNonEmptyString)
    ));
  }
  if (value.type === 'bar_chart') {
    return (value.title === undefined || isNonEmptyString(value.title))
      && (value.unit === undefined || isNonEmptyString(value.unit))
      && Array.isArray(value.items)
      && value.items.length >= 2
      && value.items.every((item) => (
        isRecord(item)
        && isNonEmptyString(item.label)
        && isFiniteNumber(item.value)
        && item.value >= 0
        && (item.displayValue === undefined || isNonEmptyString(item.displayValue))
      ));
  }
  return false;
}

function isAnswers(value: unknown, paper: CachedAssessment['paper']): value is Record<string, string[]> {
  if (!isRecord(value)) return false;
  const questions = new Map(paper.questions.map((question) => [question.id, question]));
  return Object.entries(value).every(([questionId, selected]) => {
    const question = questions.get(questionId);
    if (question === undefined || !Array.isArray(selected) || !selected.every(isNonEmptyString)) return false;
    const optionIds = new Set(question.options.map((option) => option.id));
    return new Set(selected).size === selected.length && selected.every((optionId) => optionIds.has(optionId));
  });
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(createPublicError('REQUEST_TIMEOUT')), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function throwPublicError(result: unknown): never {
  const value = isRecord(result) && typeof result.errorCode === 'string'
    ? result.errorCode
    : 'INTERNAL_ERROR';
  throw createPublicError(isSafeErrorCode(value) ? value : 'INTERNAL_ERROR');
}

function createPublicError(errorCode: string): Error & { errorCode: string } {
  const error = new Error('Cloud function request failed.') as Error & { errorCode: string };
  error.errorCode = errorCode;
  return error;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
