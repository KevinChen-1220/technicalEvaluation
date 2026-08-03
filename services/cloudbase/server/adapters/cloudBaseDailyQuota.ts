import type { database as cloudDatabase } from 'wx-server-sdk';
import type {
  DailyGenerationQuotaCounter,
  GenerationJob,
} from '../../shared/contracts';
import type { DailyGenerationQuota } from '../generation/jobService';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

class QuotaExceededTransactionError extends Error {}

export class CloudBaseDailyQuota implements DailyGenerationQuota {
  constructor(
    private readonly database: CloudDatabase,
    private readonly dailyLimit: number,
  ) {}

  async reserveJob(input: Parameters<DailyGenerationQuota['reserveJob']>[0]): ReturnType<DailyGenerationQuota['reserveJob']> {
    try {
      return await this.database.runTransaction(async (transaction: TransactionLike) => {
        const jobReference = transaction.collection('generation_jobs').doc(input.job._id);
        const existing = readJob(await jobReference.get());
        if (existing !== null) {
          if (
            existing._openid !== input.ownerOpenId
            || existing.clientRequestId !== input.job.clientRequestId
          ) {
            throw new Error('Generation job transaction conflict.');
          }
          return { type: 'existing' as const, job: existing };
        }

        const counterReference = transaction.collection('daily_generation_quotas').doc(input.counterId);
        const existingCounter = readCounter(await counterReference.get());
        if (existingCounter !== null && (
          existingCounter._openid !== input.ownerOpenId
          || existingCounter.utcDay !== input.utcDay
        )) {
          throw new Error('Daily quota counter transaction conflict.');
        }
        const count = existingCounter?.count ?? 0;
        if (count >= this.dailyLimit) throw new QuotaExceededTransactionError();

        const counter: DailyGenerationQuotaCounter = {
          _id: input.counterId,
          _openid: input.ownerOpenId,
          schemaVersion: 1,
          utcDay: input.utcDay,
          count: count + 1,
          createdAt: existingCounter?.createdAt ?? input.now,
          updatedAt: input.now,
        };
        await counterReference.set({ data: counter });
        await jobReference.set({ data: input.job });
        return { type: 'created' as const, job: input.job };
      }, 5);
    } catch (error) {
      if (error instanceof QuotaExceededTransactionError) {
        return { type: 'quota_exceeded' };
      }
      throw error;
    }
  }
}

type TransactionDocument = {
  get(): Promise<unknown>;
  set(input: { data: Record<string, unknown> }): Promise<unknown>;
};

type TransactionLike = {
  collection(name: string): { doc(id: string): TransactionDocument };
};

function readJob(result: unknown): GenerationJob | null {
  const value = readDocument(result);
  if (value === undefined) return null;
  if (
    !isRecord(value)
    || typeof value._id !== 'string'
    || typeof value._openid !== 'string'
    || (value.status !== 'queued' && value.status !== 'running'
      && value.status !== 'completed' && value.status !== 'failed')
  ) {
    throw new Error('Invalid generation job state.');
  }
  return value as GenerationJob;
}

function readCounter(result: unknown): DailyGenerationQuotaCounter | null {
  const value = readDocument(result);
  if (value === undefined) return null;
  if (
    !isRecord(value)
    || typeof value._id !== 'string'
    || typeof value._openid !== 'string'
    || typeof value.utcDay !== 'string'
    || !Number.isInteger(value.count)
    || (value.count as number) < 0
    || typeof value.createdAt !== 'string'
  ) {
    throw new Error('Invalid daily quota counter state.');
  }
  return value as DailyGenerationQuotaCounter;
}

function readDocument(result: unknown): unknown {
  return isRecord(result) ? result.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
