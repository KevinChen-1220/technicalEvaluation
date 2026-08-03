import { jsonrepair } from 'jsonrepair';
import {
  validateAssessmentPaper,
  validateAssessmentQuestions,
  type AssessmentQuestion,
  type ScoringLevel,
} from '@dynamic-assessment/assessment-core';
import type { Assessment, GenerationJob } from '../../shared/contracts';
import { GenerationServiceError, asGenerationServiceError, type SafeGenerationErrorCode } from './errors';
import type { GenerationClock } from './jobService';

const batchSize = 10;
const leaseDurationMs = 2 * 60 * 1000;
const providerTimeoutMs = 90 * 1000;

export type CompletionBatchRequest = {
  topic: string;
  notes?: string;
  questionCount: 10;
  batchNumber: number;
  totalBatches: number;
  includeScoring: boolean;
};

export type CompletionClient = {
  complete(request: CompletionBatchRequest, options: CompletionCallOptions): Promise<string>;
};

export type CompletionCallOptions = { signal: AbortSignal };

export type WorkerClaimInput = {
  leaseOwner: string;
  now: string;
  leaseExpiresAt: string;
};

export type WorkerProgressInput = WorkerClaimInput & {
  jobId: string;
  progress: number;
};

export type WorkerLeaseInput = WorkerClaimInput & { jobId: string };

export type WorkerFailureInput = {
  jobId: string;
  leaseOwner: string;
  errorCode: SafeGenerationErrorCode;
  requeue: boolean;
  now: string;
};

export type WorkerRepository = {
  claimNext(input: WorkerClaimInput): Promise<GenerationJob | null>;
  findAssessment(assessmentId: string): Promise<Assessment | null>;
  renewLease(input: WorkerLeaseInput): Promise<boolean>;
  updateProgress(input: WorkerProgressInput): Promise<boolean>;
  createAssessmentIfAbsent(assessment: Assessment): Promise<Assessment>;
  completeJob(input: {
    jobId: string;
    leaseOwner: string;
    assessmentId: string;
    now: string;
  }): Promise<boolean>;
  recordFailure(input: WorkerFailureInput): Promise<void>;
};

export type WorkerLogEvent = {
  eventName: 'generation_batch_completed' | 'generation_batch_failed' | 'generation_job_completed';
  jobId: string;
  batchNumber: number;
  durationMs: number;
  safeCode?: SafeGenerationErrorCode;
};

export type SafeGenerationLogger = {
  log(event: WorkerLogEvent): void;
};

export type GenerationWorkerDependencies = {
  repository: WorkerRepository;
  completionClient: CompletionClient;
  clock: GenerationClock;
  ids: {
    leaseOwner(): string;
    assessmentId(jobId: string): string;
  };
  logger: SafeGenerationLogger;
};

export type GenerationWorkerResult =
  | { claimed: false }
  | {
      claimed: true;
      jobId: string;
      status: 'queued' | 'failed';
      errorCode: SafeGenerationErrorCode;
    }
  | {
      claimed: true;
      jobId: string;
      status: 'completed';
      assessmentId: string;
    };

export type ParsedGenerationBatch = {
  questions: AssessmentQuestion[];
  scoring?: { maxScore: number; levels: ScoringLevel[] };
};

export async function runGenerationWorker(
  dependencies: GenerationWorkerDependencies,
): Promise<GenerationWorkerResult> {
  const leaseOwner = dependencies.ids.leaseOwner();
  const claimTime = dependencies.clock.now();
  const job = await dependencies.repository.claimNext({
    leaseOwner,
    now: claimTime.toISOString(),
    leaseExpiresAt: addMilliseconds(claimTime, leaseDurationMs).toISOString(),
  });
  if (job === null) {
    return { claimed: false };
  }

  const assessmentId = dependencies.ids.assessmentId(job._id);
  const persisted = await dependencies.repository.findAssessment(assessmentId);
  if (persisted !== null) {
    return completeClaimedJob(dependencies, job, leaseOwner, persisted._id, 0);
  }

  const totalBatches = job.request.questionCount / batchSize;
  const questions: AssessmentQuestion[] = [];
  let scoring: ParsedGenerationBatch['scoring'];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const leaseTime = dependencies.clock.now();
    const leaseRenewed = await dependencies.repository.renewLease({
      jobId: job._id,
      leaseOwner,
      now: leaseTime.toISOString(),
      leaseExpiresAt: addMilliseconds(leaseTime, leaseDurationMs).toISOString(),
    });
    if (!leaseRenewed) {
      return recordWorkerFailure(
        dependencies,
        job,
        leaseOwner,
        batchIndex + 1,
        leaseTime,
        new GenerationServiceError('INTERNAL_ERROR', false),
      );
    }

    const startedAt = dependencies.clock.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);
    try {
      const raw = await dependencies.completionClient.complete({
        topic: job.request.topic,
        ...(job.request.notes === undefined ? {} : { notes: job.request.notes }),
        questionCount: batchSize,
        batchNumber: batchIndex,
        totalBatches,
        includeScoring: batchIndex === 0,
      }, { signal: controller.signal });
      const batch = parseGeneratedBatch(raw, batchIndex === 0);
      questions.push(...batch.questions);
      if (batch.scoring !== undefined) scoring = batch.scoring;

      const finishedAt = dependencies.clock.now();
      dependencies.logger.log({
        eventName: 'generation_batch_completed',
        jobId: job._id,
        batchNumber: batchIndex + 1,
        durationMs: elapsedMilliseconds(startedAt, finishedAt),
      });

      const progress = Math.floor(((batchIndex + 1) / totalBatches) * 90);
      const leaseUpdated = await dependencies.repository.updateProgress({
        jobId: job._id,
        leaseOwner,
        progress,
        now: finishedAt.toISOString(),
        leaseExpiresAt: addMilliseconds(finishedAt, leaseDurationMs).toISOString(),
      });
      if (!leaseUpdated) {
        throw new GenerationServiceError('INTERNAL_ERROR', false);
      }
    } catch (error) {
      const safeError = controller.signal.aborted
        ? new GenerationServiceError('PROVIDER_ERROR', true)
        : error;
      return recordWorkerFailure(
        dependencies,
        job,
        leaseOwner,
        batchIndex + 1,
        startedAt,
        safeError,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  if (scoring === undefined) {
    return recordWorkerFailure(
      dependencies,
      job,
      leaseOwner,
      1,
      claimTime,
      new GenerationServiceError('INVALID_MODEL_RESPONSE', true),
    );
  }

  const normalizedQuestions = questions.map((question, index) => ({
    ...question,
    id: `q${index + 1}`,
  }));
  const generatedAt = dependencies.clock.now();
  const paper = {
    id: assessmentId,
    topic: job.request.topic,
    questionCount: job.request.questionCount,
    generatedAt: generatedAt.toISOString(),
    scoring,
    questions: normalizedQuestions,
  };
  const validation = validateAssessmentPaper(paper);
  if (!validation.ok) {
    return recordWorkerFailure(
      dependencies,
      job,
      leaseOwner,
      totalBatches,
      generatedAt,
      new GenerationServiceError('INVALID_MODEL_RESPONSE', true),
    );
  }

  const assessment: Assessment = {
    _id: assessmentId,
    _openid: job._openid,
    schemaVersion: 1,
    status: 'draft',
    paper: validation.paper,
    answers: {},
    result: null,
    revision: 1,
    createdAt: generatedAt.toISOString(),
    updatedAt: generatedAt.toISOString(),
    completedAt: null,
  };
  await dependencies.repository.createAssessmentIfAbsent(assessment);
  return completeClaimedJob(dependencies, job, leaseOwner, assessmentId, totalBatches);
}

export function parseGeneratedBatch(raw: string, includeScoring: boolean): ParsedGenerationBatch {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }

  try {
    const { candidate, external } = extractJsonObject(raw);
    if (containsMarkup(external)) {
      throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
    }
    const parsed: unknown = JSON.parse(jsonrepair(candidate));
    if (!isRecord(parsed)) {
      throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
    }

    const questionValidation = validateAssessmentQuestions(parsed.questions);
    if (!questionValidation.ok || questionValidation.questions.length !== batchSize) {
      throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
    }

    if (!includeScoring) {
      return { questions: questionValidation.questions };
    }
    const scoring = parseScoring(parsed.scoring);
    return { questions: questionValidation.questions, scoring };
  } catch (error) {
    if (error instanceof GenerationServiceError) throw error;
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }
}

async function completeClaimedJob(
  dependencies: GenerationWorkerDependencies,
  job: GenerationJob,
  leaseOwner: string,
  assessmentId: string,
  batchNumber: number,
): Promise<GenerationWorkerResult> {
  const completedAt = dependencies.clock.now();
  const completed = await dependencies.repository.completeJob({
    jobId: job._id,
    leaseOwner,
    assessmentId,
    now: completedAt.toISOString(),
  });
  if (!completed) {
    return recordWorkerFailure(
      dependencies,
      job,
      leaseOwner,
      batchNumber,
      completedAt,
      new GenerationServiceError('INTERNAL_ERROR', false),
    );
  }
  dependencies.logger.log({
    eventName: 'generation_job_completed',
    jobId: job._id,
    batchNumber,
    durationMs: 0,
  });
  return { claimed: true, jobId: job._id, status: 'completed', assessmentId };
}

async function recordWorkerFailure(
  dependencies: GenerationWorkerDependencies,
  job: GenerationJob,
  leaseOwner: string,
  batchNumber: number,
  startedAt: Date,
  error: unknown,
): Promise<GenerationWorkerResult> {
  const safeError = asGenerationServiceError(error);
  const failedAt = dependencies.clock.now();
  const requeue = safeError.retryable && job.attempt < 2;
  dependencies.logger.log({
    eventName: 'generation_batch_failed',
    jobId: job._id,
    batchNumber,
    durationMs: elapsedMilliseconds(startedAt, failedAt),
    safeCode: safeError.code,
  });
  await dependencies.repository.recordFailure({
    jobId: job._id,
    leaseOwner,
    errorCode: safeError.code,
    requeue,
    now: failedAt.toISOString(),
  });
  return {
    claimed: true,
    jobId: job._id,
    status: requeue ? 'queued' : 'failed',
    errorCode: safeError.code,
  };
}

function parseScoring(value: unknown): { maxScore: number; levels: ScoringLevel[] } {
  if (!isRecord(value) || typeof value.maxScore !== 'number' || !Number.isFinite(value.maxScore)) {
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }
  if (!Array.isArray(value.levels) || value.levels.length === 0) {
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }

  const valid = value.levels.every((level) => (
    isRecord(level)
    && typeof level.minPercent === 'number'
    && typeof level.maxPercent === 'number'
    && isNonEmptyString(level.title)
    && isNonEmptyString(level.summary)
  ));
  if (!valid) {
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }
  return { maxScore: value.maxScore, levels: value.levels as ScoringLevel[] };
}

function extractJsonObject(raw: string): { candidate: string; external: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const source = fenced?.[1] ?? raw;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new GenerationServiceError('INVALID_MODEL_RESPONSE', true);
  }
  const outsideFence = fenced === null
    ? ''
    : `${raw.slice(0, fenced.index)}${raw.slice(fenced.index + fenced[0].length)}`;
  return {
    candidate: source.slice(firstBrace, lastBrace + 1),
    external: `${outsideFence}${source.slice(0, firstBrace)}${source.slice(lastBrace + 1)}`,
  };
}

function containsMarkup(value: string): boolean {
  return /(?:<!doctype\s+html|<\?xml\b|<\/?[a-z][^>]*>)/i.test(value);
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function elapsedMilliseconds(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
