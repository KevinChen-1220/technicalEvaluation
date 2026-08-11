import { BlobPreconditionFailedError, type BlobPort } from './ports';

const MAX_CLAIM_RETRIES = 8;
const MAX_JOB_ATTEMPTS = 3;
const JOB_LEASE_MS = 2 * 60 * 1000;

export type GenerationJobStatus = 'running' | 'completed' | 'failed';
export type GenerationJobRecord = {
  jobId: string;
  ownerKey: string;
  clientRequestIdHash: string;
  assessmentId: string;
  attempt: number;
  revision: number;
  status: GenerationJobStatus;
  errorCode: string | null;
  retryable: boolean;
  quotaReserved: boolean;
  leaseUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredClaim = GenerationJobRecord & { leaseToken: string };
type StoredQuotaMarker = { jobId: string; attempt: number; reservedAt: string };
type LatestState = { job: GenerationJobRecord; claim: StoredClaim };
export type BeginJobInput = Omit<StoredClaim,
  'attempt' | 'revision' | 'status' | 'errorCode' | 'retryable' | 'quotaReserved' | 'leaseUntil' | 'createdAt' | 'updatedAt'
> & {
  now: string;
  retry: boolean;
};
export type BeginJobResult =
  | { type: 'claimed'; job: GenerationJobRecord }
  | { type: 'existing'; job: GenerationJobRecord };

export class BlobGenerationJobRepository {
  constructor(private readonly blob: BlobPort) {}

  async begin(input: BeginJobInput): Promise<BeginJobResult> {
    for (let turn = 0; turn < MAX_CLAIM_RETRIES; turn += 1) {
      const latest = await this.readLatestState(input.ownerKey, input.jobId);
      if (latest !== null) {
        if (latest.job.status === 'completed') return { type: 'existing', job: latest.job };
        if (latest.job.status === 'running' && (!input.retry || !leaseExpired(latest.job, input.now))) {
          return { type: 'existing', job: latest.job };
        }
        if (latest.job.status === 'failed' && !input.retry) return { type: 'existing', job: latest.job };
        if (latest.job.attempt >= MAX_JOB_ATTEMPTS) {
          if (latest.job.status === 'running') {
            const exhausted = await this.finish(input.ownerKey, input.jobId, latest.job.attempt, latest.claim.leaseToken, {
              status: 'failed', errorCode: 'JOB_ATTEMPT_LIMIT', retryable: false, now: input.now,
            });
            return { type: 'existing', job: exhausted };
          }
          return { type: 'existing', job: latest.job };
        }
      }

      const attempt = (latest?.job.attempt ?? 0) + 1;
      const claim: StoredClaim = {
        jobId: input.jobId,
        ownerKey: input.ownerKey,
        clientRequestIdHash: input.clientRequestIdHash,
        assessmentId: input.assessmentId,
        leaseToken: input.leaseToken,
        attempt,
        revision: 1,
        status: 'running',
        errorCode: null,
        retryable: false,
        quotaReserved: latest?.job.quotaReserved ?? false,
        leaseUntil: new Date(new Date(input.now).getTime() + JOB_LEASE_MS).toISOString(),
        createdAt: input.now,
        updatedAt: input.now,
      };
      try {
        await this.blob.put(this.claimKey(input.ownerKey, input.jobId, attempt), claim, { onlyIfNew: true });
        return { type: 'claimed', job: publicJob(claim) };
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new Error('JOB_CLAIM_CONFLICT');
  }

  async get(ownerKey: string, jobId: string): Promise<GenerationJobRecord | null> {
    return (await this.readLatestState(ownerKey, jobId))?.job ?? null;
  }

  async markQuotaReserved(
    ownerKey: string,
    jobId: string,
    attempt: number,
    leaseToken: string,
    now: string,
  ): Promise<GenerationJobRecord> {
    const existing = await this.blob.get<StoredQuotaMarker>(this.quotaMarkerKey(ownerKey, jobId), { consistency: 'strong' });
    if (existing === null) {
      const latest = await this.readLatestState(ownerKey, jobId);
      if (latest === null || latest.job.attempt !== attempt || latest.job.status !== 'running'
        || latest.claim.leaseToken !== leaseToken) throw new Error('JOB_LEASE_CONFLICT');
      try {
        await this.blob.put(this.quotaMarkerKey(ownerKey, jobId), { jobId, attempt, reservedAt: now }, { onlyIfNew: true });
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    const updated = await this.get(ownerKey, jobId);
    if (updated === null) throw new Error('JOB_CLAIM_MISSING');
    return updated;
  }

  async complete(ownerKey: string, jobId: string, attempt: number, leaseToken: string, now: string): Promise<GenerationJobRecord> {
    return await this.finish(ownerKey, jobId, attempt, leaseToken, {
      status: 'completed', errorCode: null, retryable: false, now,
    });
  }

  async fail(
    ownerKey: string,
    jobId: string,
    attempt: number,
    leaseToken: string,
    errorCode: string,
    retryable: boolean,
    now: string,
  ): Promise<GenerationJobRecord> {
    return await this.finish(ownerKey, jobId, attempt, leaseToken, {
      status: 'failed', errorCode, retryable: retryable && attempt < MAX_JOB_ATTEMPTS, now,
    });
  }

  async recoverCompleted(ownerKey: string, jobId: string, attempt: number, now: string): Promise<GenerationJobRecord> {
    const claim = await this.blob.get<StoredClaim>(this.claimKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (claim === null) throw new Error('JOB_CLAIM_MISSING');
    return await this.finish(ownerKey, jobId, attempt, claim.leaseToken, {
      status: 'completed', errorCode: null, retryable: false, now,
    });
  }

  private async finish(
    ownerKey: string,
    jobId: string,
    attempt: number,
    leaseToken: string,
    result: { status: 'completed' | 'failed'; errorCode: string | null; retryable: boolean; now: string },
  ): Promise<GenerationJobRecord> {
    const existing = await this.blob.get<GenerationJobRecord>(this.resultKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (existing !== null) return await this.withQuota(ownerKey, jobId, existing);
    const claim = await this.blob.get<StoredClaim>(this.claimKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (claim === null || claim.leaseToken !== leaseToken) throw new Error('JOB_LEASE_CONFLICT');
    const finished: GenerationJobRecord = {
      ...publicJob(claim),
      revision: 2,
      status: result.status,
      errorCode: result.errorCode,
      retryable: result.retryable,
      leaseUntil: null,
      updatedAt: result.now,
    };
    try {
      await this.blob.put(this.resultKey(ownerKey, jobId, attempt), finished, { onlyIfNew: true });
      return await this.withQuota(ownerKey, jobId, finished);
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      const winner = await this.blob.get<GenerationJobRecord>(this.resultKey(ownerKey, jobId, attempt), { consistency: 'strong' });
      if (winner === null) throw new Error('JOB_RESULT_CONFLICT');
      return await this.withQuota(ownerKey, jobId, winner);
    }
  }

  private async readLatestState(ownerKey: string, jobId: string): Promise<LatestState | null> {
    const prefix = `${this.baseKey(ownerKey, jobId)}/attempts/`;
    const keys = (await this.blob.list(prefix, { consistency: 'strong', limit: 64 })).blobs;
    const attempts = keys
      .map((key) => Number(/\/attempts\/(\d{4})\/claim\.json$/.exec(key)?.[1]))
      .filter((attempt) => Number.isInteger(attempt) && attempt > 0);
    if (attempts.length === 0) return null;
    const attempt = Math.max(...attempts);
    const claim = await this.blob.get<StoredClaim>(this.claimKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (claim === null) return null;
    const result = await this.blob.get<GenerationJobRecord>(this.resultKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    return { job: await this.withQuota(ownerKey, jobId, result ?? claim), claim };
  }

  private async withQuota(ownerKey: string, jobId: string, record: GenerationJobRecord): Promise<GenerationJobRecord> {
    const marker = await this.blob.get<StoredQuotaMarker>(this.quotaMarkerKey(ownerKey, jobId), { consistency: 'strong' });
    return publicJob(record, marker !== null);
  }

  private baseKey(ownerKey: string, jobId: string): string {
    return `jobs/${encodeURIComponent(ownerKey)}/${encodeURIComponent(jobId)}`;
  }
  private claimKey(ownerKey: string, jobId: string, attempt: number): string {
    return `${this.baseKey(ownerKey, jobId)}/attempts/${String(attempt).padStart(4, '0')}/claim.json`;
  }
  private resultKey(ownerKey: string, jobId: string, attempt: number): string {
    return `${this.baseKey(ownerKey, jobId)}/attempts/${String(attempt).padStart(4, '0')}/result.json`;
  }
  private quotaMarkerKey(ownerKey: string, jobId: string): string {
    return `${this.baseKey(ownerKey, jobId)}/quota-reserved.json`;
  }
}

function leaseExpired(job: GenerationJobRecord, now: string): boolean {
  const leaseUntil = job.leaseUntil ?? job.updatedAt;
  return new Date(leaseUntil).getTime() <= new Date(now).getTime();
}

function publicJob(record: GenerationJobRecord, quotaReserved = record.quotaReserved === true): GenerationJobRecord {
  const {
    jobId, ownerKey, clientRequestIdHash, assessmentId, attempt, revision, status, errorCode, retryable,
    createdAt, updatedAt,
  } = record;
  const leaseUntil = status === 'running' && typeof record.leaseUntil === 'string' ? record.leaseUntil : null;
  return {
    jobId, ownerKey, clientRequestIdHash, assessmentId, attempt, revision, status, errorCode, retryable,
    quotaReserved, leaseUntil, createdAt, updatedAt,
  };
}
