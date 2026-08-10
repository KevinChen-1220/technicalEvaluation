import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { getTrustedWeChatContext } from '../server/trustedContext';
import type { GenerationJob } from '../shared/contracts';
import type { GenerationJobServiceDependencies } from '../server/generation/jobService';
import type { GenerationWorkerDependencies } from '../server/generation/worker';
import { createMain as createJobMain } from '../functions/create-generation-job';
import { createMain as createPollMain } from '../functions/get-generation-job';
import {
  createMain as createWorkerMain,
  createRuntimeMain as createWorkerRuntimeMain,
} from '../functions/generation-worker';
import { createMain as createGetSettingsMain } from '../functions/get-user-settings';
import { createMain as createUpdateSettingsMain } from '../functions/update-user-settings';
import { createMain as createReportMain } from '../functions/create-report';
import { createMain as createRetentionMain } from '../functions/retention-cleanup';
import { GenerationServiceError } from '../server/generation/errors';
import { CURRENT_PRIVACY_POLICY_VERSION, type Assessment, type UserReport, type UserSettings } from '../shared/contracts';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

describe('CloudBase generation function entries', () => {
  test('built worker cold start initializes the real SDK boundary before obtaining its logger', () => {
    const serviceRoot = join(__dirname, '..');
    execFileSync(process.execPath, [join(serviceRoot, 'scripts', 'build.mjs')], {
      cwd: join(serviceRoot, '..', '..'),
    });
    const bundle = join(serviceRoot, 'dist', 'generation-worker', 'index.js');
    const script = [
      `const worker = require(${JSON.stringify(bundle)});`,
      'worker.main({}, {}).then((result) => process.stdout.write(`RESULT:${JSON.stringify(result)}`));',
    ].join(' ');
    const environment = { ...process.env };
    delete environment.LLM_BASE_URL;
    delete environment.LLM_API_KEY;
    delete environment.LLM_MODEL;

    const child = spawnSync(process.execPath, ['-e', script], {
      cwd: join(serviceRoot, '..', '..'),
      env: environment,
      encoding: 'utf8',
    });

    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout.slice(child.stdout.lastIndexOf('RESULT:') + 7))).toEqual({
      errorCode: 'CONFIGURATION_ERROR',
    });
  });

  test('create entry obtains trusted context itself and ignores event OPENID', async () => {
    const jobs: GenerationJob[] = [];
    const dependencies = jobDependencies(jobs);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'trusted-owner' });

    const result = await createJobMain(dependencies)({
      topic: 'TypeScript',
      questionCount: 50,
      OPENID: 'spoofed-event-owner',
    }, {});

    expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
    expect(jobs[0]?._openid).toBe('trusted-owner');
  });

  test('create entry returns only a stable safe code for missing authentication', async () => {
    wxServerSdk.getWXContext.mockReturnValue({});

    await expect(createJobMain(jobDependencies([]))({
      topic: 'private topic', notes: 'private notes', questionCount: 50,
    }, {})).resolves.toEqual({ errorCode: 'INVALID_REQUEST' });
  });

  test('poll entry gives the same typed response for foreign and missing IDs', async () => {
    const jobs = [makeJob('job-1', 'owner-1')];
    const main = createPollMain(jobDependencies(jobs));
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-2' });

    await expect(main({ jobId: 'job-1', OPENID: 'owner-1' }, {})).resolves.toEqual({
      type: 'not_found', errorCode: 'INVALID_REQUEST',
    });
    await expect(main({ jobId: 'missing' }, {})).resolves.toEqual({
      type: 'not_found', errorCode: 'INVALID_REQUEST',
    });
  });

  test('worker entry ignores all event fields', async () => {
    const repository = {
      claimNext: jest.fn(async () => null),
      findAssessment: jest.fn(),
      renewLease: jest.fn(),
      updateProgress: jest.fn(),
      createAssessmentIfAbsent: jest.fn(),
      completeJob: jest.fn(),
      recordFailure: jest.fn(),
    };
    const dependencies: GenerationWorkerDependencies = {
      repository,
      completionClient: { complete: jest.fn() },
      outputModeration: { checkText: async () => ({ allowed: true }) },
      clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
      ids: { leaseOwner: () => 'worker-1', assessmentId: (jobId) => `assessment-${jobId}` },
      logger: { log: jest.fn() },
    };

    await expect(createWorkerMain(dependencies)({
      OPENID: 'spoofed',
      prompt: 'private prompt',
      providerBody: 'private provider body',
    }, {})).resolves.toEqual({ claimed: false });
    expect(repository.claimNext).toHaveBeenCalledTimes(1);
  });

  test('worker entry safely maps missing provider environment during runtime initialization', async () => {
    const main = createWorkerRuntimeMain(() => {
      throw new GenerationServiceError('CONFIGURATION_ERROR', false);
    });

    await expect(main({ providerEndpoint: 'must-not-escape' }, {})).resolves.toEqual({
      errorCode: 'CONFIGURATION_ERROR',
    });
  });

  test('trusted context helper remains the only OPENID source', () => {
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'trusted-owner' });
    expect(getTrustedWeChatContext()).toBeDefined();
  });

  test('settings entries use trusted context and trusted acceptance timestamp', async () => {
    const dependencies = settingsDependencies();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createUpdateSettingsMain(dependencies)({
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      privacyConsentAt: 'spoofed',
      ownerOpenId: 'spoofed',
    }, {})).resolves.toEqual({
      type: 'accepted',
      settings: {
        privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        privacyConsentAt: '2026-08-03T10:30:00.000Z',
        hasCurrentPrivacyConsent: true,
      },
    });
    await expect(createGetSettingsMain({ repository: dependencies.repository })({ ownerOpenId: 'spoofed' }, {}))
      .resolves.toMatchObject({ type: 'found', settings: { hasCurrentPrivacyConsent: true } });
    expect(dependencies.repository.records[0]).toMatchObject({ _openid: 'owner-1' });
  });

  test('report entry ignores spoofed reporter fields and persists only bounded public input', async () => {
    const dependencies = reportDependencies([assessment('assessment-1', 'owner-1')]);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createReportMain(dependencies)({
      assessmentId: 'assessment-1',
      reason: 'question_error',
      detail: '题干有误',
      policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      status: 'closed',
      operatorNotes: 'spoofed',
      reporterOpenId: 'spoofed',
    }, {})).resolves.toEqual({ type: 'created', reportId: 'report-1' });
    expect(dependencies.repository.records).toEqual([
      expect.objectContaining({
        _id: 'report-1',
        _openid: 'owner-1',
        reason: 'question_error',
        status: 'open',
      }),
    ]);
    expect(JSON.stringify(dependencies.repository.records)).not.toContain('spoofed');
  });

  test('retention entry ignores event fields and returns redacted counts', async () => {
    const dependencies = retentionDependencies();

    await expect(createRetentionMain(dependencies)({
      ownerOpenId: 'spoofed',
      deleteAll: true,
      apiKey: 'secret',
    }, {})).resolves.toEqual({
      generationJobs: 1,
      dailyQuotas: 1,
      rateBuckets: 1,
      draftAssessments: 0,
      completedAssessments: 0,
      reports: 0,
    });
    expect(JSON.stringify(dependencies.logger.events)).not.toContain('secret');
    expect(JSON.stringify(dependencies.logger.events)).not.toContain('spoofed');
  });
});

function jobDependencies(jobs: GenerationJob[]): GenerationJobServiceDependencies {
  return {
    repository: {
      findIdempotent: async (owner, clientRequestId) => jobs.find((job) => (
        job._openid === owner && job.clientRequestId === clientRequestId
      )) ?? null,
      findOwnedJob: async (jobId, owner) => jobs.find((job) => (
        job._id === jobId && job._openid === owner
      )) ?? null,
    },
    clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
    ids: {
      jobId: () => 'job-1',
      quotaCounterId: () => 'quota-1',
      rateLimitBucketId: () => 'rate-1',
    },
    quota: {
      reserveJob: async ({ job }) => {
        const existing = jobs.find((candidate) => candidate._id === job._id);
        if (existing) return { type: 'existing', job: existing };
        jobs.push(job);
        return { type: 'created', job };
      },
    },
    settings: { hasCurrentPrivacyConsent: async () => true },
    inputModeration: { checkText: async () => ({ allowed: true }) },
    logger: { log: jest.fn() },
  };
}

function settingsDependencies() {
  const repository = {
    records: [] as UserSettings[],
    async findByOwner(ownerOpenId: string) {
      return this.records.find((record) => record._openid === ownerOpenId) ?? null;
    },
    async save(record: UserSettings) {
      this.records = [record, ...this.records.filter((item) => item._id !== record._id)];
      return record;
    },
    async hasCurrentPrivacyConsent(ownerOpenId: string, version: string) {
      const record = await this.findByOwner(ownerOpenId);
      return record?.privacyConsentVersion === version && record.privacyConsentAt !== null;
    },
  };
  return {
    repository,
    clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
    ids: { settingsId: (ownerOpenId: string) => `settings-${ownerOpenId}` },
  };
}

function reportDependencies(assessments: Assessment[]) {
  const repository = {
    records: [] as UserReport[],
    async create(report: UserReport) {
      this.records.push(report);
    },
  };
  return {
    repository,
    assessments: {
      findOwnedAssessment: async (id: string, owner: string) => assessments.find((item) => item._id === id && item._openid === owner) ?? null,
    },
    clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
    ids: { reportId: () => 'report-1' },
  };
}

function retentionDependencies() {
  const repository = {
    deleteExpiredGenerationJobs: jest.fn(async () => 1),
    deleteExpiredDailyQuotas: jest.fn(async () => 1),
    deleteExpiredRateLimitBuckets: jest.fn(async () => 1),
    deleteExpiredDraftAssessments: jest.fn(async () => 0),
    deleteExpiredCompletedAssessments: jest.fn(async () => 0),
    deleteExpiredReports: jest.fn(async () => 0),
  };
  const logger = { events: [] as unknown[], log(event: unknown) { this.events.push(event); } };
  return {
    repository,
    clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
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
  };
}

function assessment(id: string, owner: string): Assessment {
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
    createdAt: '2026-08-03T10:30:00.000Z',
    updatedAt: '2026-08-03T10:30:00.000Z',
    completedAt: '2026-08-03T10:30:00.000Z',
    paper: {
      id,
      topic: 'TypeScript',
      questionCount: 50,
      generatedAt: '2026-08-03T10:30:00.000Z',
      scoring: { maxScore: 100, levels: [] },
      questions: [],
    },
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
    createdAt: '2026-08-03T10:30:00.000Z',
    updatedAt: '2026-08-03T10:30:00.000Z',
    expiresAt: '2026-08-04T10:30:00.000Z',
  };
}
