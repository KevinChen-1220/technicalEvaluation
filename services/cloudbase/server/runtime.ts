import { createHash, randomUUID } from 'node:crypto';
import {
  DYNAMIC_CURRENT_ENV,
  database,
  init,
  logger,
} from 'wx-server-sdk';
import { CloudBaseGenerationRepository } from './adapters/cloudBaseGenerationRepository';
import { createOpenAICompletionClient, type FetchTransport } from './adapters/openAICompletionClient';
import type { GenerationJobServiceDependencies } from './generation/jobService';
import type { GenerationWorkerDependencies } from './generation/worker';

const dailyGenerationLimit = 5;

let repository: CloudBaseGenerationRepository | undefined;

export function getGenerationJobDependencies(): GenerationJobServiceDependencies {
  return {
    repository: getRepository(),
    clock: systemClock,
    ids: serverIds,
    quota: {
      allows: async (_ownerOpenId, createdToday) => createdToday < dailyGenerationLimit,
    },
  };
}

export function getGenerationWorkerDependencies(): GenerationWorkerDependencies {
  const cloudLogger = logger();
  return {
    repository: getRepository(),
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
};

function getRepository(): CloudBaseGenerationRepository {
  if (repository === undefined) {
    init({ env: DYNAMIC_CURRENT_ENV as unknown as string });
    repository = new CloudBaseGenerationRepository(database());
  }
  return repository;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
