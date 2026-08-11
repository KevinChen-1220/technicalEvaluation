import { BlobPreconditionFailedError, type BlobPort } from './ports';

export type QuotaDecision = 'allowed' | 'rate_limited' | 'quota_exceeded' | 'generation_disabled';

export function quotaErrorCode(decision: QuotaDecision): 'FREE_TIER_LIMIT' | 'GENERATION_DISABLED' | null {
  if (decision === 'rate_limited' || decision === 'quota_exceeded') return 'FREE_TIER_LIMIT';
  return decision === 'generation_disabled' ? 'GENERATION_DISABLED' : null;
}

export class BlobQuotaRepository {
  constructor(private readonly blob: BlobPort) {}

  async reserve(ownerKey: string, now: Date, generationEnabled: boolean): Promise<QuotaDecision> {
    if (!generationEnabled) return 'generation_disabled';
    const bucket = Math.floor(now.getTime() / 60_000);
    const rateKey = `quotas/${encodeURIComponent(ownerKey)}/rate/${bucket}.json`;
    try {
      await this.blob.put(rateKey, { reservedAt: now.toISOString() }, { onlyIfNew: true });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return 'rate_limited';
      throw error;
    }

    const utcDay = now.toISOString().slice(0, 10);
    for (let slot = 1; slot <= 5; slot += 1) {
      try {
        await this.blob.put(`quotas/${encodeURIComponent(ownerKey)}/daily/${utcDay}/${slot}.json`, { reservedAt: now.toISOString() }, { onlyIfNew: true });
        return 'allowed';
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) {
          await this.blob.delete(rateKey);
          throw error;
        }
      }
    }
    await this.blob.delete(rateKey);
    return 'quota_exceeded';
  }
}
