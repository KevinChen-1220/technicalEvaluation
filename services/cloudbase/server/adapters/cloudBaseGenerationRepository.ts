import type { database as cloudDatabase } from 'wx-server-sdk';
import type { Assessment, GenerationJob } from '../../shared/contracts';
import type { GenerationJobRepository } from '../generation/jobService';
import type {
  WorkerClaimInput,
  WorkerFailureInput,
  WorkerLeaseInput,
  WorkerProgressInput,
  WorkerRepository,
} from '../generation/worker';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

export class CloudBaseGenerationRepository implements GenerationJobRepository, WorkerRepository {
  constructor(private readonly database: CloudDatabase) {}

  async findIdempotent(ownerOpenId: string, clientRequestId: string): Promise<GenerationJob | null> {
    const result = await this.database.collection('generation_jobs')
      .where({ _openid: ownerOpenId, clientRequestId })
      .limit(1)
      .get();
    return firstJob(result);
  }

  async findOwnedJob(jobId: string, ownerOpenId: string): Promise<GenerationJob | null> {
    const result = await this.database.collection('generation_jobs')
      .where({ _id: jobId, _openid: ownerOpenId })
      .limit(1)
      .get();
    return firstJob(result);
  }

  async claimNext(input: WorkerClaimInput): Promise<GenerationJob | null> {
    const eligible = this.database.command.or(
      { status: 'queued' },
      { status: 'running', leaseExpiresAt: this.database.command.lte(input.now) },
    );
    const candidateResult = await this.database.collection('generation_jobs')
      .where(eligible)
      .orderBy('updatedAt', 'asc')
      .limit(1)
      .get();
    const candidate = firstJob(candidateResult);
    if (candidate === null) return null;

    const observedState = candidate.status === 'queued'
      ? { _id: candidate._id, status: 'queued' }
      : {
          _id: candidate._id,
          status: 'running',
          leaseExpiresAt: candidate.leaseExpiresAt,
        };
    const result = await this.database.collection('generation_jobs')
      .where(observedState)
      .limit(1)
      .update({ data: {
        status: 'running',
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
      } });
    if (!isUpdateResult(result) || result.stats.updated !== 1) return null;
    return this.findJob(candidate._id);
  }

  async findAssessment(assessmentId: string): Promise<Assessment | null> {
    const result = await this.database.collection('assessments')
      .where({ _id: assessmentId })
      .limit(1)
      .get();
    return firstAssessment(result);
  }

  async updateProgress(input: WorkerProgressInput): Promise<boolean> {
    const result = await this.database.collection('generation_jobs')
      .where({ _id: input.jobId, status: 'running', leaseOwner: input.leaseOwner })
      .limit(1)
      .update({ data: {
        progress: input.progress,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
      } });
    return isUpdateResult(result) && result.stats.updated === 1;
  }

  async renewLease(input: WorkerLeaseInput): Promise<boolean> {
    const result = await this.database.collection('generation_jobs')
      .where({ _id: input.jobId, status: 'running', leaseOwner: input.leaseOwner })
      .limit(1)
      .update({ data: {
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
      } });
    return isUpdateResult(result) && result.stats.updated === 1;
  }

  async createAssessmentIfAbsent(assessment: Assessment): Promise<Assessment> {
    try {
      await this.database.collection('assessments').add({ data: assessment });
      return assessment;
    } catch (error) {
      const existing = await this.findAssessment(assessment._id);
      if (existing !== null && existing._openid === assessment._openid) return existing;
      throw error;
    }
  }

  async completeJob(input: {
    jobId: string;
    leaseOwner: string;
    assessmentId: string;
    now: string;
  }): Promise<boolean> {
    const remove = this.database.command.remove();
    const result = await this.database.collection('generation_jobs')
      .where({ _id: input.jobId, status: 'running', leaseOwner: input.leaseOwner })
      .limit(1)
      .update({ data: {
        status: 'completed',
        assessmentId: input.assessmentId,
        progress: 100,
        retryable: false,
        errorCode: remove,
        leaseOwner: remove,
        leaseExpiresAt: remove,
        updatedAt: input.now,
      } });
    if (isUpdateResult(result) && result.stats.updated === 1) return true;

    const existing = await this.findJob(input.jobId);
    return existing?.status === 'completed' && existing.assessmentId === input.assessmentId;
  }

  async recordFailure(input: WorkerFailureInput): Promise<void> {
    const remove = this.database.command.remove();
    await this.database.collection('generation_jobs')
      .where({ _id: input.jobId, status: 'running', leaseOwner: input.leaseOwner })
      .limit(1)
      .update({ data: {
        status: input.requeue ? 'queued' : 'failed',
        ...(input.requeue ? { attempt: 2 } : {}),
        retryable: input.requeue,
        errorCode: input.errorCode,
        leaseOwner: remove,
        leaseExpiresAt: remove,
        updatedAt: input.now,
      } });
  }

  private async findJob(jobId: string): Promise<GenerationJob | null> {
    const result = await this.database.collection('generation_jobs')
      .where({ _id: jobId })
      .limit(1)
      .get();
    return firstJob(result);
  }
}

function firstJob(result: unknown): GenerationJob | null {
  const value = firstDocument(result);
  return isRecord(value)
    && typeof value._id === 'string'
    && typeof value._openid === 'string'
    && (value.status === 'queued' || value.status === 'running'
      || value.status === 'completed' || value.status === 'failed')
    ? value as GenerationJob
    : null;
}

function firstAssessment(result: unknown): Assessment | null {
  const value = firstDocument(result);
  return isRecord(value) && typeof value._id === 'string' && typeof value._openid === 'string'
    ? value as Assessment
    : null;
}

function firstDocument(result: unknown): unknown {
  return isRecord(result) && Array.isArray(result.data) ? result.data[0] : undefined;
}

function isUpdateResult(result: unknown): result is { stats: { updated: number } } {
  return isRecord(result) && isRecord(result.stats) && typeof result.stats.updated === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
