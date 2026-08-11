import { BlobPreconditionFailedError, type BlobPort } from './ports';

export type QuotaDecision = 'allowed' | 'rate_limited' | 'quota_exceeded' | 'generation_disabled';

export function quotaErrorCode(decision: QuotaDecision): 'FREE_TIER_LIMIT' | 'GENERATION_DISABLED' | null {
  if (decision === 'rate_limited' || decision === 'quota_exceeded') return 'FREE_TIER_LIMIT';
  return decision === 'generation_disabled' ? 'GENERATION_DISABLED' : null;
}

export class BlobQuotaRepository {
  constructor(private readonly blob: BlobPort) {}

  async reserve(ownerKey: string, now: Date, generationEnabled: boolean, reservationId?: string): Promise<QuotaDecision> {
    if (!generationEnabled) return 'generation_disabled';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const latest = await this.readLatest(ownerKey);
      const utcDay = now.toISOString().slice(0, 10);
      const reservationIds = latest?.utcDay === utcDay ? normalizedReservationIds(latest) : [];
      if (reservationId !== undefined && reservationIds.includes(reservationId)) return 'allowed';
      if (latest !== null && now.getTime() - new Date(latest.lastRequestAt).getTime() < 60_000) return 'rate_limited';
      const dailyCount = latest?.utcDay === utcDay ? latest.dailyCount : 0;
      if (dailyCount >= 5) return 'quota_exceeded';
      const next: QuotaReservation = {
        revision: (latest?.revision ?? 0) + 1,
        lastRequestAt: now.toISOString(),
        utcDay,
        dailyCount: dailyCount + 1,
        reservationIds: reservationId === undefined ? reservationIds : [...reservationIds, reservationId],
        ...(reservationId === undefined ? {} : { reservationId }),
      };
      try {
        await this.blob.put(this.key(ownerKey, next.revision), next, { onlyIfNew: true });
        return 'allowed';
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        throw error;
      }
    }
    return 'rate_limited';
  }

  private async readLatest(ownerKey: string): Promise<QuotaReservation | null> {
    const prefix = `quotas/${encodeURIComponent(ownerKey)}/ledger/`;
    const keys = (await this.blob.list(prefix, { consistency: 'strong', limit: 32 })).blobs;
    const revisions = keys
      .map((key) => Number(/\/(\d{12})\.json$/.exec(key)?.[1]))
      .map((inverse) => 999_999_999_999 - inverse)
      .filter((revision) => Number.isInteger(revision) && revision > 0);
    const revision = revisions.length === 0 ? null : Math.max(...revisions);
    return revision === null
      ? null
      : await this.blob.get<QuotaReservation>(this.key(ownerKey, revision), { consistency: 'strong' });
  }

  private key(ownerKey: string, revision: number): string {
    const inverseRevision = 999_999_999_999 - revision;
    return `quotas/${encodeURIComponent(ownerKey)}/ledger/${String(inverseRevision).padStart(12, '0')}.json`;
  }
}

type QuotaReservation = {
  revision: number;
  lastRequestAt: string;
  utcDay: string;
  dailyCount: number;
  reservationIds?: string[];
  reservationId?: string;
};

function normalizedReservationIds(record: QuotaReservation): string[] {
  const ids = Array.isArray(record.reservationIds)
    ? record.reservationIds.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 5)
    : [];
  if (typeof record.reservationId === 'string' && record.reservationId.length > 0 && !ids.includes(record.reservationId)) {
    ids.push(record.reservationId);
  }
  return ids.slice(0, 5);
}
