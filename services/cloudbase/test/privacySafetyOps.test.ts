import { getTrustedWeChatContext } from '../server/trustedContext';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  type Assessment,
  type GenerationJob,
  type UserReport,
  type UserSettings,
} from '../shared/contracts';
import {
  acceptPrivacyPolicy,
  getUserSettings,
  type SettingsRepository,
} from '../server/settings/service';
import {
  createReport,
  type ReportRepository,
} from '../server/reports/service';
import {
  createGenerationJob,
  type GenerationJobServiceDependencies,
} from '../server/generation/jobService';
import {
  generationResponseLimits,
  runGenerationWorker,
  type CompletionBatchRequest,
  type CompletionCallOptions,
  type GenerationWorkerDependencies,
  type WorkerClaimInput,
  type WorkerFailureInput,
  type WorkerLeaseInput,
  type WorkerProgressInput,
} from '../server/generation/worker';
import { runRetentionCleanup, type RetentionRepository } from '../server/retention/service';
import { retentionPolicyFromEnvironment } from '../server/retention/policy';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };
const now = new Date('2026-08-10T08:00:00.000Z');

describe('privacy settings service', () => {
  test('records current-version consent using trusted owner and server time only', async () => {
    const settings = new MemorySettingsRepository();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    const result = await acceptPrivacyPolicy({
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      privacyConsentAt: 'spoofed-client-time',
      ownerOpenId: 'spoofed-owner',
      displayPreferences: { theme: 'dark' },
    }, getTrustedWeChatContext(), {
      repository: settings,
      clock: { now: () => now },
      ids: { settingsId: (owner: string) => `settings-${owner}` },
    });

    expect(result).toEqual({
      type: 'accepted',
      settings: {
        privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        privacyConsentAt: '2026-08-10T08:00:00.000Z',
        hasCurrentPrivacyConsent: true,
      },
    });
    expect(settings.records).toEqual([
      expect.objectContaining({
        _id: 'settings-owner-1',
        _openid: 'owner-1',
        locale: 'zh-CN',
        privacyConsentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        privacyConsentAt: '2026-08-10T08:00:00.000Z',
      }),
    ]);
    expect(JSON.stringify(settings.records)).not.toContain('spoofed');
    expect(JSON.stringify(settings.records)).not.toContain('dark');
  });

  test('reports whether the trusted owner has accepted the current policy', async () => {
    const settings = new MemorySettingsRepository([{
      ...makeSettings('owner-1'),
      privacyConsentVersion: '2026-07-01',
      privacyConsentAt: '2026-07-01T00:00:00.000Z',
    }]);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(getUserSettings({}, getTrustedWeChatContext(), { repository: settings })).resolves.toEqual({
      type: 'found',
      settings: {
        privacyPolicyVersion: '2026-07-01',
        privacyConsentAt: '2026-07-01T00:00:00.000Z',
        hasCurrentPrivacyConsent: false,
      },
    });
  });
});

describe('generation privacy, moderation, and rate limiting', () => {
  test('requires current privacy consent before moderating or reserving a job', async () => {
    const dependencies = generationDependencies({ hasConsent: false });
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createGenerationJob(
      { topic: 'TypeScript', questionCount: 50 },
      getTrustedWeChatContext(),
      dependencies,
    )).rejects.toMatchObject({ code: 'PRIVACY_CONSENT_REQUIRED', retryable: false });
    expect(dependencies.inputModeration.checkText).not.toHaveBeenCalled();
    expect(dependencies.quota.reserveJob).not.toHaveBeenCalled();
  });

  test('uses input moderation before quota reservation and exposes only a stable block code', async () => {
    const dependencies = generationDependencies({ inputAllowed: false });
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createGenerationJob(
      {
        topic: 'private topic',
        notes: 'private notes',
        questionCount: 50,
        providerError: 'must-not-escape',
      },
      getTrustedWeChatContext(),
      dependencies,
    )).rejects.toMatchObject({ code: 'CONTENT_BLOCKED', retryable: false });
    expect(dependencies.inputModeration.checkText).toHaveBeenCalledWith({
      ownerOpenId: 'owner-1',
      content: 'private topic\nprivate notes',
      scene: 'generation_input',
      title: 'SkillScope generation input',
    });
    expect(dependencies.quota.reserveJob).not.toHaveBeenCalled();
    expect(JSON.stringify(dependencies.logger.events)).not.toContain('private topic');
    expect(JSON.stringify(dependencies.logger.events)).not.toContain('private notes');
  });

  test('reserves a short-window rate bucket atomically with daily quota and job creation', async () => {
    const dependencies = generationDependencies({});
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });
    const context = getTrustedWeChatContext();

    await createGenerationJob({ topic: 'One', questionCount: 50, clientRequestId: 'request-1' }, context, dependencies);
    await createGenerationJob({ topic: 'One duplicate', questionCount: 100, clientRequestId: 'request-1' }, context, dependencies);
    await createGenerationJob({ topic: 'Two', questionCount: 50, clientRequestId: 'request-2' }, context, dependencies);
    await createGenerationJob({ topic: 'Three', questionCount: 50, clientRequestId: 'request-3' }, context, dependencies);

    await expect(createGenerationJob(
      { topic: 'Four', questionCount: 50, clientRequestId: 'request-4' },
      context,
      dependencies,
    )).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: false });
    expect(dependencies.repository.jobs).toHaveLength(3);
    expect(dependencies.quota.rateCounts.get('rate-owner-1-2026-08-10T08:00:00.000Z')).toBe(3);
    expect(dependencies.quota.dailyCounts.get('quota-owner-1-2026-08-10')).toBe(3);
  });
});

describe('generation worker output safety', () => {
  test('checks generated output before persisting an assessment', async () => {
    const repository = new WorkerRepository();
    repository.jobs.push(makeJob('job-1', 'owner-1'));
    const dependencies = workerDependencies(repository, { outputAllowed: false });

    await expect(runGenerationWorker(dependencies)).resolves.toEqual({
      claimed: true,
      jobId: 'job-1',
      status: 'failed',
      errorCode: 'CONTENT_BLOCKED',
    });
    expect(repository.assessments).toHaveLength(0);
    expect(repository.events).toContain('fail:CONTENT_BLOCKED');
    expect(JSON.stringify(dependencies.logger.events)).not.toContain('Question 1');
  });

  test('rejects a model response that exceeds the configured byte limit', async () => {
    const tooLarge = JSON.stringify({
      questions: [],
      padding: 'x'.repeat(generationResponseLimits.maxBatchBytes + 1),
    });

    expect(() => generationResponseLimits.assertBatchWithinLimit(tooLarge))
      .toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
  });
});

describe('reports and retention', () => {
  test('creates an owner-isolated report with bounded client fields and trusted metadata', async () => {
    const reports = new MemoryReportRepository();
    const assessments = [makeAssessment('assessment-1', 'owner-1')];
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createReport({
      assessmentId: 'assessment-1',
      reason: 'content_safety',
      detail: '  这道题的内容可能不合适  ',
      policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      status: 'closed',
      operatorNotes: 'spoofed',
      reporterOpenId: 'spoofed-owner',
    }, getTrustedWeChatContext(), {
      repository: reports,
      assessments: {
        findOwnedAssessment: async (id: string, owner: string) => assessments.find((item) => item._id === id && item._openid === owner) ?? null,
      },
      clock: { now: () => now },
      ids: { reportId: () => 'report-1' },
    })).resolves.toEqual({ type: 'created', reportId: 'report-1' });

    expect(reports.records).toEqual([
      expect.objectContaining({
        _id: 'report-1',
        _openid: 'owner-1',
        assessmentId: 'assessment-1',
        reason: 'content_safety',
        detail: '这道题的内容可能不合适',
        policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        status: 'open',
        createdAt: '2026-08-10T08:00:00.000Z',
      }),
    ]);
    expect(JSON.stringify(reports.records)).not.toContain('spoofed');
  });

  test('rejects malformed or foreign report submissions with the same public code', async () => {
    const reports = new MemoryReportRepository();
    const dependencies = {
      repository: reports,
      assessments: { findOwnedAssessment: async () => null },
      clock: { now: () => now },
      ids: { reportId: () => 'report-1' },
    };
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createReport({
      assessmentId: 'foreign-assessment',
      reason: 'content_safety',
      policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    }, getTrustedWeChatContext(), dependencies)).resolves.toEqual({
      type: 'invalid',
      errorCode: 'INVALID_REQUEST',
    });
    await expect(createReport({
      assessmentId: 'assessment-1',
      reason: 'other',
      detail: 'x'.repeat(501),
      policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    }, getTrustedWeChatContext(), dependencies)).resolves.toEqual({
      type: 'invalid',
      errorCode: 'INVALID_REQUEST',
    });
    expect(reports.records).toHaveLength(0);
  });

  test('retention cleanup deletes bounded expired operational records and redacts logs', async () => {
    const repository = new MemoryRetentionRepository({
      generationJobs: 42,
      dailyQuotas: 3,
      rateBuckets: 5,
      assessments: 2,
      draftAssessments: 4,
      reports: 1,
    });
    const logger = { events: [] as unknown[], log(event: unknown) { this.events.push(event); } };

    await expect(runRetentionCleanup({
      repository,
      clock: { now: () => now },
      policy: {
        batchSize: 50,
        jobRetentionDays: 1,
        quotaRetentionDays: 2,
        rateLimitRetentionDays: 2,
        staleDraftAssessmentRetentionDays: 30,
        completedAssessmentRetentionDays: 365,
        reportRetentionDays: 365,
      },
      logger,
    })).resolves.toEqual({
      generationJobs: 42,
      dailyQuotas: 3,
      rateBuckets: 5,
      draftAssessments: 4,
      completedAssessments: 2,
      reports: 1,
    });
    expect(repository.batchSizes).toEqual([50, 50, 50, 50, 50, 50]);
    expect(repository.draftCutoffs).toEqual(['2026-07-11T08:00:00.000Z']);
    expect(JSON.stringify(logger.events)).toContain('retention_cleanup_completed');
    expect(JSON.stringify(logger.events)).not.toContain('owner-');
    expect(JSON.stringify(logger.events)).not.toContain('topic');
  });

  test('uses an independently configurable stale-draft retention window', () => {
    expect(retentionPolicyFromEnvironment({
      DRAFT_ASSESSMENT_RETENTION_DAYS: '14',
      COMPLETED_ASSESSMENT_RETENTION_DAYS: '730',
    })).toMatchObject({
      staleDraftAssessmentRetentionDays: 14,
      completedAssessmentRetentionDays: 730,
    });
  });
});

class MemorySettingsRepository implements SettingsRepository {
  constructor(readonly records: UserSettings[] = []) {}
  async findByOwner(ownerOpenId: string): Promise<UserSettings | null> {
    return this.records.find((record) => record._openid === ownerOpenId) ?? null;
  }
  async save(record: UserSettings): Promise<UserSettings> {
    const index = this.records.findIndex((item) => item._id === record._id);
    if (index >= 0) this.records[index] = record;
    else this.records.push(record);
    return record;
  }
  async hasCurrentPrivacyConsent(ownerOpenId: string, version: string): Promise<boolean> {
    const record = await this.findByOwner(ownerOpenId);
    return record?.privacyConsentVersion === version && record.privacyConsentAt !== null;
  }
}

class MemoryReportRepository implements ReportRepository {
  readonly records: UserReport[] = [];
  async create(report: UserReport): Promise<void> {
    this.records.push(report);
  }
}

class ReservationStore {
  readonly dailyCounts = new Map<string, number>();
  readonly rateCounts = new Map<string, number>();

  constructor(private readonly repository: JobRepository) {}

  reserveJob = jest.fn(async (input: Parameters<GenerationJobServiceDependencies['quota']['reserveJob']>[0]) => {
    const existing = this.repository.jobs.find((job) => job._id === input.job._id);
    if (existing) return { type: 'existing' as const, job: existing };

    const rateCount = this.rateCounts.get(input.rateLimit.bucketId) ?? 0;
    if (rateCount >= input.rateLimit.limit) return { type: 'rate_limited' as const };
    const dailyCount = this.dailyCounts.get(input.counterId) ?? 0;
    if (dailyCount >= 5) return { type: 'quota_exceeded' as const };

    this.rateCounts.set(input.rateLimit.bucketId, rateCount + 1);
    this.dailyCounts.set(input.counterId, dailyCount + 1);
    this.repository.jobs.push(input.job);
    return { type: 'created' as const, job: input.job };
  });
}

class JobRepository {
  readonly jobs: GenerationJob[] = [];
  async findIdempotent(ownerOpenId: string, clientRequestId: string): Promise<GenerationJob | null> {
    return this.jobs.find((job) => job._openid === ownerOpenId && job.clientRequestId === clientRequestId) ?? null;
  }
  async findOwnedJob(jobId: string, ownerOpenId: string): Promise<GenerationJob | null> {
    return this.jobs.find((job) => job._id === jobId && job._openid === ownerOpenId) ?? null;
  }
}

function generationDependencies(options: { hasConsent?: boolean; inputAllowed?: boolean }) {
  const repository = new JobRepository();
  const quota = new ReservationStore(repository);
  const logger = { events: [] as unknown[], log(event: unknown) { this.events.push(event); } };
  return {
    repository,
    clock: { now: () => now },
    ids: {
      jobId: (ownerOpenId: string, clientRequestId?: string) => clientRequestId ? `job-${ownerOpenId}-${clientRequestId}` : 'job-random',
      quotaCounterId: (ownerOpenId: string, utcDay: string) => `quota-${ownerOpenId}-${utcDay}`,
      rateLimitBucketId: (ownerOpenId: string, windowStart: string) => `rate-${ownerOpenId}-${windowStart}`,
    },
    quota,
    settings: {
      hasCurrentPrivacyConsent: jest.fn(async () => options.hasConsent ?? true),
    },
    inputModeration: {
      checkText: jest.fn(async () => ({ allowed: options.inputAllowed ?? true })),
    },
    logger,
  };
}

class WorkerRepository {
  readonly jobs: GenerationJob[] = [];
  readonly assessments: Assessment[] = [];
  readonly events: string[] = [];

  async claimNext(input: WorkerClaimInput): Promise<GenerationJob | null> {
    const job = this.jobs.find((candidate) => candidate.status === 'queued') ?? null;
    if (job === null) return null;
    Object.assign(job, {
      status: 'running',
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: input.now,
    });
    return { ...job };
  }
  async findAssessment(assessmentId: string): Promise<Assessment | null> {
    return this.assessments.find((assessment) => assessment._id === assessmentId) ?? null;
  }
  async renewLease(input: WorkerLeaseInput): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate._id === input.jobId);
    if (!job) return false;
    Object.assign(job, { leaseExpiresAt: input.leaseExpiresAt, updatedAt: input.now });
    return true;
  }
  async updateProgress(input: WorkerProgressInput): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate._id === input.jobId);
    if (!job) return false;
    Object.assign(job, { progress: input.progress, updatedAt: input.now });
    return true;
  }
  async createAssessmentIfAbsent(assessment: Assessment): Promise<Assessment> {
    this.assessments.push(assessment);
    this.events.push(`assessment:${assessment._id}`);
    return assessment;
  }
  async completeJob(input: { jobId: string; assessmentId: string; now: string }): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate._id === input.jobId);
    if (!job) return false;
    Object.assign(job, { status: 'completed', assessmentId: input.assessmentId, updatedAt: input.now, progress: 100 });
    this.events.push(`complete:${input.jobId}`);
    return true;
  }
  async recordFailure(input: WorkerFailureInput): Promise<void> {
    const job = this.jobs.find((candidate) => candidate._id === input.jobId);
    if (!job) return;
    Object.assign(job, {
      status: input.requeue ? 'queued' : 'failed',
      retryable: input.requeue,
      errorCode: input.errorCode,
      updatedAt: input.now,
    });
    this.events.push(`${input.requeue ? 'requeue' : 'fail'}:${input.errorCode}`);
  }
}

function workerDependencies(
  repository: WorkerRepository,
  options: { outputAllowed: boolean },
): GenerationWorkerDependencies & { logger: { events: unknown[] } } {
  const logger = { events: [] as unknown[], log(event: unknown) { this.events.push(event); } };
  return {
    repository,
    completionClient: {
      complete: async (request: CompletionBatchRequest, _options: CompletionCallOptions) => batchResponse(request.batchNumber),
    },
    outputModeration: {
      checkText: jest.fn(async () => ({ allowed: options.outputAllowed })),
    },
    clock: { now: () => now },
    ids: { leaseOwner: () => 'worker-1', assessmentId: (jobId) => `assessment-${jobId}` },
    logger,
  };
}

class MemoryRetentionRepository implements RetentionRepository {
  readonly batchSizes: number[] = [];
  readonly draftCutoffs: string[] = [];
  constructor(private readonly counts: {
    generationJobs: number;
    dailyQuotas: number;
    rateBuckets: number;
    assessments: number;
    draftAssessments: number;
    reports: number;
  }) {}
  async deleteExpiredGenerationJobs(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    return this.counts.generationJobs;
  }
  async deleteExpiredDailyQuotas(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    return this.counts.dailyQuotas;
  }
  async deleteExpiredRateLimitBuckets(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    return this.counts.rateBuckets;
  }
  async deleteExpiredCompletedAssessments(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    return this.counts.assessments;
  }
  async deleteExpiredDraftAssessments(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    this.draftCutoffs.push(input.before);
    return this.counts.draftAssessments;
  }
  async deleteExpiredReports(input: { before: string; limit: number }): Promise<number> {
    this.batchSizes.push(input.limit);
    return this.counts.reports;
  }
}

function makeSettings(owner: string): UserSettings {
  return {
    _id: `settings-${owner}`,
    _openid: owner,
    schemaVersion: 1,
    locale: 'zh-CN',
    privacyConsentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    privacyConsentAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function makeJob(id: string, owner: string): GenerationJob {
  return {
    _id: id,
    _openid: owner,
    schemaVersion: 1,
    status: 'queued',
    progress: 0,
    request: { topic: 'TypeScript', questionCount: 50 },
    retryable: false,
    attempt: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: '2026-08-11T08:00:00.000Z',
  };
}

function makeAssessment(id: string, owner: string): Assessment {
  return {
    _id: id,
    _openid: owner,
    schemaVersion: 1,
    status: 'completed',
    answers: {},
    result: {
      totalQuestions: 0,
      correctCount: 0,
      score: 0,
      accuracy: 0,
      level: { minPercent: 0, maxPercent: 100, title: '完成', summary: '完成' },
      questionResults: [],
      knowledgePointResults: [],
      wrongQuestionIds: [],
    },
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: now.toISOString(),
    paper: {
      id,
      topic: 'TypeScript',
      questionCount: 50,
      generatedAt: now.toISOString(),
      scoring: { maxScore: 100, levels: [] },
      questions: [],
    },
  };
}

function batchResponse(batchNumber: number): string {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    id: `model-${batchNumber}-${index}`,
    type: 'single_choice',
    difficulty: 'easy',
    knowledgePoint: 'TypeScript',
    prompt: `Question ${batchNumber * 10 + index + 1}`,
    options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Incorrect' }],
    correctOptionIds: ['A'],
    explanation: 'A is correct.',
  }));
  return JSON.stringify({
    questions,
    ...(batchNumber === 0 ? {
      scoring: {
        maxScore: 100,
        levels: [{ minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' }],
      },
    } : {}),
  });
}
