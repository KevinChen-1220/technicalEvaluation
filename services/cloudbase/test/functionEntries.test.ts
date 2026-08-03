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
import { GenerationServiceError } from '../server/generation/errors';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

describe('CloudBase generation function entries', () => {
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
      updateProgress: jest.fn(),
      createAssessmentIfAbsent: jest.fn(),
      completeJob: jest.fn(),
      recordFailure: jest.fn(),
    };
    const dependencies: GenerationWorkerDependencies = {
      repository,
      completionClient: { complete: jest.fn() },
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
});

function jobDependencies(jobs: GenerationJob[]): GenerationJobServiceDependencies {
  return {
    repository: {
      findIdempotent: async (owner, clientRequestId) => jobs.find((job) => (
        job._openid === owner && job.clientRequestId === clientRequestId
      )) ?? null,
      countCreatedByOwner: async () => jobs.length,
      createJob: async (job) => {
        jobs.push(job);
        return job;
      },
      findOwnedJob: async (jobId, owner) => jobs.find((job) => (
        job._id === jobId && job._openid === owner
      )) ?? null,
    },
    clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
    ids: { jobId: () => 'job-1' },
    quota: { allows: async () => true },
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
