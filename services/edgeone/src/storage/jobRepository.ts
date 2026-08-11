import { BlobPreconditionFailedError, type BlobPort } from './ports';

const MAX_ATTEMPTS = 8;

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
  createdAt: string;
  updatedAt: string;
};

type StoredClaim = GenerationJobRecord & { leaseToken: string };
export type BeginJobInput = Omit<StoredClaim, 'attempt' | 'revision' | 'status' | 'errorCode' | 'retryable' | 'createdAt' | 'updatedAt'> & {
  now: string;
  retry: boolean;
};
export type BeginJobResult =
  | { type: 'claimed'; job: GenerationJobRecord }
  | { type: 'existing'; job: GenerationJobRecord };

export class BlobGenerationJobRepository {
  constructor(private readonly blob: BlobPort) {}

  async begin(input: BeginJobInput): Promise<BeginJobResult> {
    for (let turn = 0; turn < MAX_ATTEMPTS; turn += 1) {
      const latest = await this.get(input.ownerKey, input.jobId);
      if (latest !== null && (latest.status !== 'failed' || !input.retry)) return { type: 'existing', job: latest };
      const attempt = (latest?.attempt ?? 0) + 1;
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
    const prefix = `${this.baseKey(ownerKey, jobId)}/attempts/`;
    const keys = (await this.blob.list(prefix, { consistency: 'strong', limit: 64 })).blobs;
    const attempts = keys
      .map((key) => Number(/\/attempts\/(\d{4})\/claim\.json$/.exec(key)?.[1]))
      .filter((attempt) => Number.isInteger(attempt) && attempt > 0);
    if (attempts.length === 0) return null;
    const attempt = Math.max(...attempts);
    const result = await this.blob.get<GenerationJobRecord>(this.resultKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (result !== null) return publicJob(result);
    const claim = await this.blob.get<StoredClaim>(this.claimKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    return claim === null ? null : publicJob(claim);
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
    return await this.finish(ownerKey, jobId, attempt, leaseToken, { status: 'failed', errorCode, retryable, now });
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
    if (existing !== null) return publicJob(existing);
    const claim = await this.blob.get<StoredClaim>(this.claimKey(ownerKey, jobId, attempt), { consistency: 'strong' });
    if (claim === null || claim.leaseToken !== leaseToken) throw new Error('JOB_LEASE_CONFLICT');
    const finished: GenerationJobRecord = {
      ...publicJob(claim),
      revision: 2,
      status: result.status,
      errorCode: result.errorCode,
      retryable: result.retryable,
      updatedAt: result.now,
    };
    try {
      await this.blob.put(this.resultKey(ownerKey, jobId, attempt), finished, { onlyIfNew: true });
      return finished;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      const winner = await this.blob.get<GenerationJobRecord>(this.resultKey(ownerKey, jobId, attempt), { consistency: 'strong' });
      if (winner === null) throw new Error('JOB_RESULT_CONFLICT');
      return winner;
    }
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
}

function publicJob(record: GenerationJobRecord): GenerationJobRecord {
  const { jobId, ownerKey, clientRequestIdHash, assessmentId, attempt, revision, status, errorCode, retryable, createdAt, updatedAt } = record;
  return { jobId, ownerKey, clientRequestIdHash, assessmentId, attempt, revision, status, errorCode, retryable, createdAt, updatedAt };
}
