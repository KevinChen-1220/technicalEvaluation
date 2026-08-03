import { createHash, randomUUID } from 'node:crypto';
import {
  DYNAMIC_CURRENT_ENV,
  database,
  init,
  logger,
} from 'wx-server-sdk';
import { CloudBaseGenerationRepository } from './adapters/cloudBaseGenerationRepository';
import { CloudBaseAssessmentRepository } from './adapters/cloudBaseAssessmentRepository';
import { CloudBaseDailyQuota } from './adapters/cloudBaseDailyQuota';
import { createOpenAICompletionClient, type FetchTransport } from './adapters/openAICompletionClient';
import type { GenerationJobServiceDependencies } from './generation/jobService';
import type { GenerationWorkerDependencies } from './generation/worker';

const dailyGenerationLimit = 5;

let repository: CloudBaseGenerationRepository | undefined;
let quota: CloudBaseDailyQuota | undefined;
let currentDatabase: ReturnType<typeof database> | undefined;
let assessmentRepository: CloudBaseAssessmentRepository | undefined;

export function getAssessmentDependencies(): {
  repository: CloudBaseAssessmentRepository;
  clock: typeof systemClock;
} {
  return { repository: getAssessmentRepository(), clock: systemClock };
}

export function getAssessmentReadDependencies(): { repository: CloudBaseAssessmentRepository } {
  return { repository: getAssessmentRepository() };
}

export function getGenerationJobDependencies(): GenerationJobServiceDependencies {
  return {
    repository: getRepository(),
    clock: systemClock,
    ids: serverIds,
    quota: getQuota(),
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
    clock: systemClock,
    ids: serverIds,
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
