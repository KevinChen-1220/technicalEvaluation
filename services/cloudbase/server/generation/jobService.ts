import { readTrustedOpenId } from '../trustedContext';
import {
  InvalidContractInputError,
  CURRENT_PRIVACY_POLICY_VERSION,
  createGenerationJob as createGenerationJobRecord,
  sanitizeGenerationRequest,
  type GenerationJob,
  type GenerationJobStatus,
  type GenerationRequest,
} from '../../shared/contracts';
import { GenerationServiceError, type SafeGenerationErrorCode } from './errors';
import { ownerCorrelationHash, type OperationalLogger } from '../operations/logger';
import { type TextModerationPort } from '../moderation/ports';

export type GenerationJobRepository = {
  findIdempotent(ownerOpenId: string, clientRequestId: string): Promise<GenerationJob | null>;
  findOwnedJob(jobId: string, ownerOpenId: string): Promise<GenerationJob | null>;
};

export type GenerationClock = { now(): Date };

export type GenerationJobIdSource = {
  jobId(ownerOpenId: string, clientRequestId?: string): string;
  quotaCounterId(ownerOpenId: string, utcDay: string): string;
  rateLimitBucketId(ownerOpenId: string, windowStartedAt: string): string;
};

export const shortWindowRateLimit = {
  windowMs: 60 * 1000,
  limit: 3,
} as const;

export type DailyGenerationQuota = {
  reserveJob(input: {
    job: GenerationJob;
    counterId: string;
    ownerOpenId: string;
    utcDay: string;
    now: string;
    rateLimit: {
      bucketId: string;
      windowStartedAt: string;
      expiresAt: string;
      limit: number;
    };
  }): Promise<
    | { type: 'created' | 'existing'; job: GenerationJob }
    | { type: 'quota_exceeded' }
    | { type: 'rate_limited' }
  >;
};

export type GenerationJobServiceDependencies = {
  repository: GenerationJobRepository;
  clock: GenerationClock;
  ids: GenerationJobIdSource;
  quota: DailyGenerationQuota;
  settings: {
    hasCurrentPrivacyConsent(ownerOpenId: string, version: string): Promise<boolean>;
  };
  inputModeration: TextModerationPort;
  logger: OperationalLogger;
};

export type CreateGenerationJobResponse = {
  jobId: string;
  status: GenerationJobStatus;
};

export type PublicGenerationJobStatus = {
  jobId: string;
  status: GenerationJobStatus;
  progress: number;
  retryable: boolean;
  assessmentId?: string;
  errorCode?: SafeGenerationErrorCode;
};

export type GenerationJobNotFoundResponse = {
  type: 'not_found';
  errorCode: 'INVALID_REQUEST';
};

export async function createGenerationJob(
  input: unknown,
  trustedContext: unknown,
  dependencies: GenerationJobServiceDependencies,
): Promise<CreateGenerationJobResponse> {
  const ownerOpenId = requireTrustedOwner(trustedContext);
  const parsed = parseCreateInput(input);

  if (parsed.clientRequestId !== undefined) {
    const existing = await dependencies.repository.findIdempotent(ownerOpenId, parsed.clientRequestId);
    if (existing !== null) {
      return { jobId: existing._id, status: existing.status };
    }
  }

  const hasConsent = await dependencies.settings.hasCurrentPrivacyConsent(
    ownerOpenId,
    CURRENT_PRIVACY_POLICY_VERSION,
  );
  if (!hasConsent) {
    dependencies.logger.log({
      eventName: 'generation_privacy_consent_required',
      ownerHash: ownerCorrelationHash(ownerOpenId),
      safeCode: 'PRIVACY_CONSENT_REQUIRED',
    });
    throw new GenerationServiceError('PRIVACY_CONSENT_REQUIRED', false);
  }

  const moderation = await dependencies.inputModeration.checkText({
    ownerOpenId,
    content: moderationContent(parsed.request),
    scene: 'generation_input',
    title: 'SkillScope generation input',
  });
  if (!moderation.allowed) {
    dependencies.logger.log({
      eventName: 'generation_input_blocked',
      ownerHash: ownerCorrelationHash(ownerOpenId),
      safeCode: 'CONTENT_BLOCKED',
    });
    throw new GenerationServiceError('CONTENT_BLOCKED', false);
  }

  const current = dependencies.clock.now();
  const utcDay = current.toISOString().slice(0, 10);
  const rateWindow = rateWindowFor(current);
  const job = createGenerationJobRecord({
    id: dependencies.ids.jobId(ownerOpenId, parsed.clientRequestId),
    request: parsed.request,
    ...(parsed.clientRequestId === undefined ? {} : { clientRequestId: parsed.clientRequestId }),
    expiresAt: new Date(current.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }, trustedContext, current.toISOString());
  const reservation = await dependencies.quota.reserveJob({
    job,
    counterId: dependencies.ids.quotaCounterId(ownerOpenId, utcDay),
    ownerOpenId,
    utcDay,
    now: current.toISOString(),
    rateLimit: {
      bucketId: dependencies.ids.rateLimitBucketId(ownerOpenId, rateWindow.windowStartedAt),
      windowStartedAt: rateWindow.windowStartedAt,
      expiresAt: rateWindow.expiresAt,
      limit: shortWindowRateLimit.limit,
    },
  });
  if (reservation.type === 'quota_exceeded') {
    dependencies.logger.log({
      eventName: 'generation_quota_exhausted',
      ownerHash: ownerCorrelationHash(ownerOpenId),
      safeCode: 'QUOTA_EXCEEDED',
    });
    throw new GenerationServiceError('QUOTA_EXCEEDED', false);
  }
  if (reservation.type === 'rate_limited') {
    dependencies.logger.log({
      eventName: 'generation_rate_limited',
      ownerHash: ownerCorrelationHash(ownerOpenId),
      safeCode: 'RATE_LIMITED',
    });
    throw new GenerationServiceError('RATE_LIMITED', false);
  }
  return { jobId: reservation.job._id, status: reservation.job.status };
}

export async function getGenerationJob(
  input: unknown,
  trustedContext: unknown,
  dependencies: Pick<GenerationJobServiceDependencies, 'repository'>,
): Promise<PublicGenerationJobStatus | GenerationJobNotFoundResponse> {
  const ownerOpenId = requireTrustedOwner(trustedContext);
  const jobId = parseJobId(input);
  const job = await dependencies.repository.findOwnedJob(jobId, ownerOpenId);
  if (job === null) {
    return { type: 'not_found', errorCode: 'INVALID_REQUEST' };
  }

  return {
    jobId: job._id,
    status: job.status,
    progress: job.progress,
    retryable: job.retryable,
    ...(job.assessmentId === undefined ? {} : { assessmentId: job.assessmentId }),
    ...(isSafeErrorCode(job.errorCode) ? { errorCode: job.errorCode } : {}),
  };
}

function parseCreateInput(input: unknown): {
  request: GenerationRequest;
  clientRequestId?: string;
} {
  if (!isRecord(input)) {
    throw new GenerationServiceError('INVALID_REQUEST', false);
  }

  try {
    const request = sanitizeGenerationRequest({
      topic: typeof input.topic === 'string' ? input.topic : '',
      ...(typeof input.notes === 'string' ? { notes: input.notes } : {}),
      questionCount: input.questionCount as 50 | 100,
    });
    if (input.notes !== undefined && typeof input.notes !== 'string') {
      throw new InvalidContractInputError('Generation notes must be a string.');
    }
    if (input.clientRequestId !== undefined && typeof input.clientRequestId !== 'string') {
      throw new InvalidContractInputError('Client request id must be a string.');
    }

    const clientRequestId = typeof input.clientRequestId === 'string'
      ? input.clientRequestId.trim()
      : undefined;
    if (clientRequestId !== undefined && clientRequestId.length > 100) {
      throw new InvalidContractInputError('Client request id must not exceed 100 characters.');
    }

    return {
      request,
      ...(clientRequestId === undefined || clientRequestId.length === 0 ? {} : { clientRequestId }),
    };
  } catch (error) {
    if (error instanceof InvalidContractInputError) {
      throw new GenerationServiceError('INVALID_REQUEST', false);
    }
    throw error;
  }
}

function parseJobId(input: unknown): string {
  if (!isRecord(input) || typeof input.jobId !== 'string' || input.jobId.trim().length === 0) {
    throw new GenerationServiceError('INVALID_REQUEST', false);
  }
  return input.jobId.trim();
}

function requireTrustedOwner(context: unknown): string {
  const ownerOpenId = readTrustedOpenId(context);
  if (ownerOpenId === null) {
    throw new GenerationServiceError('INVALID_REQUEST', false);
  }
  return ownerOpenId;
}

function isSafeErrorCode(value: unknown): value is SafeGenerationErrorCode {
  return value === 'INVALID_REQUEST'
    || value === 'PRIVACY_CONSENT_REQUIRED'
    || value === 'CONTENT_BLOCKED'
    || value === 'RATE_LIMITED'
    || value === 'QUOTA_EXCEEDED'
    || value === 'PROVIDER_ERROR'
    || value === 'INVALID_MODEL_RESPONSE'
    || value === 'CONFIGURATION_ERROR'
    || value === 'INTERNAL_ERROR';
}

function moderationContent(request: GenerationRequest): string {
  return request.notes === undefined ? request.topic : `${request.topic}\n${request.notes}`;
}

function rateWindowFor(date: Date): { windowStartedAt: string; expiresAt: string } {
  const startMs = Math.floor(date.getTime() / shortWindowRateLimit.windowMs) * shortWindowRateLimit.windowMs;
  return {
    windowStartedAt: new Date(startMs).toISOString(),
    expiresAt: new Date(startMs + shortWindowRateLimit.windowMs).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
