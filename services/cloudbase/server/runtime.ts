import { createHash, randomUUID } from 'node:crypto';
import {
  DYNAMIC_CURRENT_ENV,
  database,
  init,
  logger,
  openapi,
} from 'wx-server-sdk';
import { CloudBaseGenerationRepository } from './adapters/cloudBaseGenerationRepository';
import { CloudBaseAssessmentRepository } from './adapters/cloudBaseAssessmentRepository';
import { CloudBaseDailyQuota } from './adapters/cloudBaseDailyQuota';
import { CloudBaseUserSettingsRepository } from './adapters/cloudBaseUserSettingsRepository';
import { CloudBaseReportRepository } from './adapters/cloudBaseReportRepository';
import { CloudBaseRetentionRepository } from './adapters/cloudBaseRetentionRepository';
import { createOpenAICompletionClient, type FetchTransport } from './adapters/openAICompletionClient';
import { createWeChatMsgSecCheckModeration } from './adapters/weChatMsgSecCheck';
import { createHttpsContentSafetyModeration, type ContentSafetyFetchTransport } from './adapters/httpsContentSafety';
import type { GenerationJobServiceDependencies } from './generation/jobService';
import type { GenerationWorkerDependencies } from './generation/worker';
import type { AcceptPrivacyPolicyDependencies, SettingsDependencies } from './settings/service';
import type { CreateReportDependencies } from './reports/service';
import type { RetentionDependencies } from './retention/service';
import type { OperationalEvent } from './operations/logger';

const dailyGenerationLimit = 5;

let repository: CloudBaseGenerationRepository | undefined;
let quota: CloudBaseDailyQuota | undefined;
let currentDatabase: ReturnType<typeof database> | undefined;
let assessmentRepository: CloudBaseAssessmentRepository | undefined;
let settingsRepository: CloudBaseUserSettingsRepository | undefined;
let reportRepository: CloudBaseReportRepository | undefined;
let retentionRepository: CloudBaseRetentionRepository | undefined;

export function getAssessmentDependencies(): {
  repository: CloudBaseAssessmentRepository;
  clock: typeof systemClock;
  logger: { log(event: OperationalEvent): void };
} {
  const cloudLogger = logger();
  return {
    repository: getAssessmentRepository(),
    clock: systemClock,
    logger: { log: (event) => cloudLogger.info(event) },
  };
}

export function getAssessmentReadDependencies(): { repository: CloudBaseAssessmentRepository } {
  return { repository: getAssessmentRepository() };
}

export function getGenerationJobDependencies(): GenerationJobServiceDependencies {
  const cloudLogger = logger();
  return {
    repository: getRepository(),
    clock: systemClock,
    ids: serverIds,
    quota: getQuota(),
    settings: getSettingsRepository(),
    inputModeration: createWeChatMsgSecCheckModeration({
      openapi,
      environment: process.env,
    }),
    logger: { log: (event) => cloudLogger.info(event) },
  };
}

export function getGenerationWorkerDependencies(): GenerationWorkerDependencies {
  const currentRepository = getRepository();
  const cloudLogger = logger();
  return {
    repository: currentRepository,
    completionClient: createOpenAICompletionClient({
      environment: process.env,
      fetch: ((url, options) => fetch(url, options)) as FetchTransport,
    }),
    outputModeration: createHttpsContentSafetyModeration({
      environment: process.env,
      fetch: ((url, options) => fetch(url, options)) as ContentSafetyFetchTransport,
    }),
    clock: systemClock,
    ids: serverIds,
    logger: { log: (event) => cloudLogger.info(event) },
  };
}

export function getUserSettingsDependencies(): SettingsDependencies {
  return { repository: getSettingsRepository() };
}

export function getAcceptPrivacyPolicyDependencies(): AcceptPrivacyPolicyDependencies {
  return {
    repository: getSettingsRepository(),
    clock: systemClock,
    ids: serverIds,
  };
}

export function getReportDependencies(): CreateReportDependencies {
  return {
    repository: getReportRepository(),
    assessments: getAssessmentRepository(),
    clock: systemClock,
    ids: serverIds,
  };
}

export function getRetentionDependencies(): RetentionDependencies {
  const cloudLogger = logger();
  return {
    repository: getRetentionRepository(),
    clock: systemClock,
    policy: {
      batchSize: parsePositiveInteger(process.env.RETENTION_BATCH_SIZE, 50, 100),
      jobRetentionDays: parsePositiveInteger(process.env.GENERATION_JOB_RETENTION_DAYS, 1, 30),
      quotaRetentionDays: parsePositiveInteger(process.env.QUOTA_RETENTION_DAYS, 2, 30),
      rateLimitRetentionDays: parsePositiveInteger(process.env.RATE_LIMIT_RETENTION_DAYS, 2, 30),
      completedAssessmentRetentionDays: parsePositiveInteger(process.env.COMPLETED_ASSESSMENT_RETENTION_DAYS, 365, 3650),
      reportRetentionDays: parsePositiveInteger(process.env.REPORT_RETENTION_DAYS, 365, 3650),
    },
    logger: { log: (event) => cloudLogger.info(event) },
  };
}

const systemClock = { now: () => new Date() };

const serverIds = {
  jobId(ownerOpenId: string, clientRequestId?: string): string {
    if (clientRequestId === undefined) return `job-${randomUUID()}`;
    return `job-${digest(`${ownerOpenId}\0${clientRequestId}`)}`;
  },
  leaseOwner(): string {
    return `worker-${randomUUID()}`;
  },
  assessmentId(jobId: string): string {
    return `assessment-${digest(jobId)}`;
  },
  quotaCounterId(ownerOpenId: string, utcDay: string): string {
    return `quota-${digest(`${ownerOpenId}\0${utcDay}`)}`;
  },
  rateLimitBucketId(ownerOpenId: string, windowStartedAt: string): string {
    return `rate-${digest(`${ownerOpenId}\0${windowStartedAt}`)}`;
  },
  settingsId(ownerOpenId: string): string {
    return `settings-${digest(ownerOpenId)}`;
  },
  reportId(): string {
    return `report-${randomUUID()}`;
  },
};

function getRepository(): CloudBaseGenerationRepository {
  if (repository === undefined) {
    repository = new CloudBaseGenerationRepository(getDatabase());
  }
  return repository;
}

function getQuota(): CloudBaseDailyQuota {
  if (quota === undefined) quota = new CloudBaseDailyQuota(getDatabase(), dailyGenerationLimit);
  return quota;
}

function getAssessmentRepository(): CloudBaseAssessmentRepository {
  if (assessmentRepository === undefined) {
    assessmentRepository = new CloudBaseAssessmentRepository(getDatabase());
  }
  return assessmentRepository;
}

function getSettingsRepository(): CloudBaseUserSettingsRepository {
  if (settingsRepository === undefined) {
    settingsRepository = new CloudBaseUserSettingsRepository(getDatabase());
  }
  return settingsRepository;
}

function getReportRepository(): CloudBaseReportRepository {
  if (reportRepository === undefined) {
    reportRepository = new CloudBaseReportRepository(getDatabase());
  }
  return reportRepository;
}

function getRetentionRepository(): CloudBaseRetentionRepository {
  if (retentionRepository === undefined) {
    retentionRepository = new CloudBaseRetentionRepository(getDatabase());
  }
  return retentionRepository;
}

function getDatabase(): ReturnType<typeof database> {
  if (currentDatabase === undefined) {
    init({ env: DYNAMIC_CURRENT_ENV as unknown as string });
    currentDatabase = database();
  }
  return currentDatabase;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parsePositiveInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}
