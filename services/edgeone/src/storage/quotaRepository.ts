import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError, type BlobPort } from './ports';

const MAX_REVISION = 999_999_999_999;
const MAX_CAS_ATTEMPTS = 8;

export type QuotaDecision = 'allowed' | 'rate_limited' | 'quota_exceeded' | 'generation_disabled';

export function quotaErrorCode(decision: QuotaDecision): 'FREE_TIER_LIMIT' | 'GENERATION_DISABLED' | null {
  if (decision === 'rate_limited' || decision === 'quota_exceeded') return 'FREE_TIER_LIMIT';
  return decision === 'generation_disabled' ? 'GENERATION_DISABLED' : null;
}

export class BlobQuotaRepository {
  constructor(private readonly blob: BlobPort) {}

  async reserve(ownerKey: string, now: Date, generationEnabled: boolean, reservationId?: string): Promise<QuotaDecision> {
    if (!generationEnabled) return 'generation_disabled';
    const utcDay = now.toISOString().slice(0, 10);

    if (reservationId !== undefined) {
      const marker = await this.readMarker(ownerKey, reservationId);
      if (marker !== null) {
        return await this.ensureDailyReservation(ownerKey, marker.reservedDate, reservationId, now.toISOString());
      }
    }

    const today = await this.readLatestDay(ownerKey, utcDay);
    if (reservationId !== undefined && normalizedReservationIds(today).includes(reservationId)) {
      const marker = await this.claimMarker(ownerKey, reservationId, utcDay, now.toISOString());
      return await this.ensureDailyReservation(ownerKey, marker.reservedDate, reservationId, now.toISOString());
    }
    const previous = await this.readLatestDay(ownerKey, previousUtcDay(utcDay));
    const mostRecent = latestByRequestTime(today, previous);
    if (mostRecent !== null && now.getTime() - new Date(mostRecent.lastRequestAt).getTime() < 60_000) {
      return 'rate_limited';
    }
    if ((today?.dailyCount ?? 0) >= 5) return 'quota_exceeded';

    if (reservationId === undefined) {
      return await this.appendDailyReservation(ownerKey, utcDay, undefined, now.toISOString());
    }
    const marker = await this.claimMarker(ownerKey, reservationId, utcDay, now.toISOString());
    return await this.ensureDailyReservation(ownerKey, marker.reservedDate, reservationId, now.toISOString());
  }

  private async claimMarker(
    ownerKey: string,
    reservationId: string,
    reservedDate: string,
    reservedAt: string,
  ): Promise<QuotaReservationMarker> {
    const marker: QuotaReservationMarker = {
      reservationIdHash: hashReservationId(reservationId), reservedDate, reservedAt,
    };
    try {
      await this.blob.put(this.markerKey(ownerKey, reservationId), marker, { onlyIfNew: true });
      return marker;
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
      const winner = await this.readMarker(ownerKey, reservationId);
      if (winner === null) throw new Error('QUOTA_MARKER_CONFLICT');
      return winner;
    }
  }

  private async readMarker(ownerKey: string, reservationId: string): Promise<QuotaReservationMarker | null> {
    const marker = await this.blob.get<QuotaReservationMarker>(this.markerKey(ownerKey, reservationId), { consistency: 'strong' });
    if (marker === null) return null;
    if (marker.reservationIdHash !== hashReservationId(reservationId)
      || !/^\d{4}-\d{2}-\d{2}$/.test(marker.reservedDate)
      || !Number.isFinite(new Date(marker.reservedAt).getTime())) throw new Error('INVALID_QUOTA_MARKER');
    return marker;
  }

  private async ensureDailyReservation(
    ownerKey: string,
    utcDay: string,
    reservationId: string,
    requestAt: string,
  ): Promise<QuotaDecision> {
    return await this.appendDailyReservation(ownerKey, utcDay, reservationId, requestAt);
  }

  private async appendDailyReservation(
    ownerKey: string,
    utcDay: string,
    reservationId: string | undefined,
    requestAt: string,
  ): Promise<QuotaDecision> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const latest = await this.readLatestDay(ownerKey, utcDay);
      const reservationIds = normalizedReservationIds(latest);
      if (reservationId !== undefined && reservationIds.includes(reservationId)) return 'allowed';
      if (latest !== null && new Date(requestAt).getTime() - new Date(latest.lastRequestAt).getTime() < 60_000) {
        return 'rate_limited';
      }
      const dailyCount = latest?.dailyCount ?? 0;
      if (dailyCount >= 5) return 'quota_exceeded';
      const next: QuotaReservation = {
        revision: (latest?.revision ?? 0) + 1,
        lastRequestAt: latestRequestTime(latest?.lastRequestAt, requestAt),
        utcDay,
        dailyCount: dailyCount + 1,
        reservationIds: reservationId === undefined ? reservationIds : [...reservationIds, reservationId],
        ...(reservationId === undefined ? {} : { reservationId }),
      };
      try {
        await this.blob.put(this.ledgerKey(ownerKey, utcDay, next.revision), next, { onlyIfNew: true });
        return 'allowed';
      } catch (error) {
        if (isPreconditionFailure(error)) continue;
        throw error;
      }
    }
    return 'rate_limited';
  }

  private async readLatestDay(ownerKey: string, utcDay: string): Promise<QuotaReservation | null> {
    const prefix = this.ledgerPrefix(ownerKey, utcDay);
    const keys = (await this.blob.list(prefix, { consistency: 'strong' })).blobs;
    const revisions = keys
      .map((key) => Number(/\/(\d{12})\.json$/.exec(key)?.[1]))
      .map((inverse) => MAX_REVISION - inverse)
      .filter((revision) => Number.isInteger(revision) && revision > 0);
    const revision = revisions.length === 0 ? null : Math.max(...revisions);
    return revision === null
      ? null
      : await this.blob.get<QuotaReservation>(this.ledgerKey(ownerKey, utcDay, revision), { consistency: 'strong' });
  }

  private ledgerPrefix(ownerKey: string, utcDay: string): string {
    return `quotas/${encodeURIComponent(ownerKey)}/ledger/${utcDay}/`;
  }

  private ledgerKey(ownerKey: string, utcDay: string, revision: number): string {
    const inverseRevision = MAX_REVISION - revision;
    return `${this.ledgerPrefix(ownerKey, utcDay)}${String(inverseRevision).padStart(12, '0')}.json`;
  }

  private markerKey(ownerKey: string, reservationId: string): string {
    return `quotas/${encodeURIComponent(ownerKey)}/reservations/${hashReservationId(reservationId)}.json`;
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

type QuotaReservationMarker = {
  reservationIdHash: string;
  reservedDate: string;
  reservedAt: string;
};

function normalizedReservationIds(record: QuotaReservation | null): string[] {
  if (record === null) return [];
  const ids = Array.isArray(record.reservationIds)
    ? record.reservationIds.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 5)
    : [];
  if (typeof record.reservationId === 'string' && record.reservationId.length > 0 && !ids.includes(record.reservationId)) {
    ids.push(record.reservationId);
  }
  return ids.slice(0, 5);
}

function hashReservationId(reservationId: string): string {
  return createHash('sha256').update(reservationId, 'utf8').digest('hex');
}

function previousUtcDay(utcDay: string): string {
  return new Date(new Date(`${utcDay}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

function latestByRequestTime(left: QuotaReservation | null, right: QuotaReservation | null): QuotaReservation | null {
  if (left === null) return right;
  if (right === null) return left;
  return new Date(left.lastRequestAt).getTime() >= new Date(right.lastRequestAt).getTime() ? left : right;
}

function latestRequestTime(existing: string | undefined, candidate: string): string {
  if (existing === undefined) return candidate;
  return new Date(existing).getTime() >= new Date(candidate).getTime() ? existing : candidate;
}

function isPreconditionFailure(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError
    || (typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: unknown }).code === 'BLOB_PRECONDITION_FAILED');
}
