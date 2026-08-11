import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError, type BlobPort } from './ports';

const MAX_REVISION = 999_999_999_999;
const MAX_CAS_ATTEMPTS = 8;
const RATE_RESERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const RATE_REVISION_KEEP_COUNT = 8;
const RATE_REVISION_CLEANUP_LIMIT = 32;

export type QuotaDecision = 'allowed' | 'rate_limited' | 'quota_exceeded' | 'generation_disabled';

export function quotaErrorCode(decision: QuotaDecision): 'FREE_TIER_LIMIT' | 'GENERATION_DISABLED' | null {
  if (decision === 'rate_limited' || decision === 'quota_exceeded') return 'FREE_TIER_LIMIT';
  return decision === 'generation_disabled' ? 'GENERATION_DISABLED' : null;
}

export class BlobQuotaRepository {
  constructor(private readonly blob: BlobPort) {}

  async reserve(ownerKey: string, now: Date, generationEnabled: boolean, reservationId?: string): Promise<QuotaDecision> {
    if (!generationEnabled) return 'generation_disabled';
    const requestAt = now.toISOString();
    const utcDay = now.toISOString().slice(0, 10);
    let reservedDate = utcDay;

    if (reservationId !== undefined) {
      const existing = await this.readMarker(ownerKey, reservationId);
      const marker = existing ?? await this.claimMarker(ownerKey, reservationId, utcDay, requestAt);
      reservedDate = marker.reservedDate;
    }

    const dailyPreflight = await this.preflightDailyReservation(ownerKey, reservedDate, reservationId);
    if (dailyPreflight !== 'allowed') return dailyPreflight;
    const rateDecision = await this.appendRateReservation(ownerKey, reservationId, requestAt);
    if (rateDecision !== 'allowed') return rateDecision;
    return await this.appendDailyReservation(ownerKey, reservedDate, reservationId);
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

  private async appendRateReservation(
    ownerKey: string,
    reservationId: string | undefined,
    requestAt: string,
  ): Promise<QuotaDecision> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const latest = await this.readLatestRate(ownerKey);
      const reservations = retainedRateReservations(latest, requestAt);
      if (reservationId !== undefined
        && reservations.some((reservation) => reservation.reservationId === reservationId)) return 'allowed';
      if (latest !== null && new Date(requestAt).getTime() - new Date(latest.lastRequestAt).getTime() < 60_000) {
        return 'rate_limited';
      }
      const next: RateReservationLedger = {
        revision: (latest?.revision ?? 0) + 1,
        lastRequestAt: requestAt,
        reservations: reservationId === undefined
          ? reservations
          : [...reservations, { reservationId, acceptedAt: requestAt }],
      };
      try {
        await this.blob.put(this.rateLedgerKey(ownerKey, next.revision), next, { onlyIfNew: true });
        await this.cleanupRateRevisions(ownerKey, next.revision, requestAt);
        return 'allowed';
      } catch (error) {
        if (isPreconditionFailure(error)) continue;
        throw error;
      }
    }
    return 'rate_limited';
  }

  private async preflightDailyReservation(
    ownerKey: string,
    utcDay: string,
    reservationId: string | undefined,
  ): Promise<'allowed' | 'quota_exceeded'> {
    const latest = await this.readLatestDay(ownerKey, utcDay);
    if (reservationId !== undefined && normalizedReservationIds(latest).includes(reservationId)) return 'allowed';
    return (latest?.dailyCount ?? 0) >= 5 ? 'quota_exceeded' : 'allowed';
  }

  private async appendDailyReservation(
    ownerKey: string,
    utcDay: string,
    reservationId: string | undefined,
  ): Promise<QuotaDecision> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const latest = await this.readLatestDay(ownerKey, utcDay);
      const reservationIds = normalizedReservationIds(latest);
      if (reservationId !== undefined && reservationIds.includes(reservationId)) return 'allowed';
      const dailyCount = latest?.dailyCount ?? 0;
      if (dailyCount >= 5) return 'quota_exceeded';
      const next: QuotaReservation = {
        revision: (latest?.revision ?? 0) + 1,
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

  private async readLatestRate(ownerKey: string): Promise<RateReservationLedger | null> {
    const prefix = this.rateLedgerPrefix(ownerKey);
    const keys = (await this.blob.list(prefix, { consistency: 'strong' })).blobs;
    const revision = latestRevision(keys);
    return revision === null
      ? null
      : await this.blob.get<RateReservationLedger>(this.rateLedgerKey(ownerKey, revision), { consistency: 'strong' });
  }

  private async cleanupRateRevisions(ownerKey: string, writtenRevision: number, requestAt: string): Promise<void> {
    try {
      const listing = await this.blob.list(this.rateLedgerPrefix(ownerKey), { consistency: 'strong' });
      const revisions = rateRevisionEntries(listing.blobs);
      if (revisions.length <= 1) return;

      const latestRevisionNumber = revisions[0]!.revision;
      const protectedRevisions = new Set(revisions.slice(0, RATE_REVISION_KEEP_COUNT).map((entry) => entry.revision));
      protectedRevisions.add(latestRevisionNumber);
      protectedRevisions.add(writtenRevision);
      const deletionCandidates = new Map<number, string>();
      for (const entry of revisions) {
        if (!protectedRevisions.has(entry.revision)) deletionCandidates.set(entry.revision, entry.key);
      }

      const cutoff = new Date(requestAt).getTime() - RATE_RESERVATION_RETENTION_MS;
      const ageCandidates = revisions.slice(1, RATE_REVISION_KEEP_COUNT)
        .filter((entry) => entry.revision !== writtenRevision && entry.revision !== latestRevisionNumber);
      for (const entry of ageCandidates) {
        try {
          const record = await this.blob.get<RateReservationLedger>(entry.key, { consistency: 'strong' });
          if (record !== null && new Date(record.lastRequestAt).getTime() < cutoff) {
            deletionCandidates.set(entry.revision, entry.key);
          }
        } catch {
          // Cleanup is best effort; a later successful reservation retries discovery.
        }
      }

      const deletions = [...deletionCandidates.entries()]
        .sort(([left], [right]) => left - right)
        .slice(0, RATE_REVISION_CLEANUP_LIMIT);
      for (const [, key] of deletions) {
        try {
          await this.blob.delete(key);
        } catch {
          // Failed revisions stay discoverable and are retried by the next cleanup pass.
        }
      }
    } catch {
      // Cleanup cannot change the outcome after the immutable rate revision is committed.
    }
  }

  private async readLatestDay(ownerKey: string, utcDay: string): Promise<QuotaReservation | null> {
    const prefix = this.ledgerPrefix(ownerKey, utcDay);
    const keys = (await this.blob.list(prefix, { consistency: 'strong' })).blobs;
    const revision = latestRevision(keys);
    return revision === null
      ? null
      : await this.blob.get<QuotaReservation>(this.ledgerKey(ownerKey, utcDay, revision), { consistency: 'strong' });
  }

  private ledgerPrefix(ownerKey: string, utcDay: string): string {
    return `quotas/${encodeURIComponent(ownerKey)}/ledger/${utcDay}/`;
  }

  private ledgerKey(ownerKey: string, utcDay: string, revision: number): string {
    return `${this.ledgerPrefix(ownerKey, utcDay)}${inverseRevision(revision)}.json`;
  }

  private rateLedgerPrefix(ownerKey: string): string {
    return `quotas/${encodeURIComponent(ownerKey)}/rate-ledger/`;
  }

  private rateLedgerKey(ownerKey: string, revision: number): string {
    return `${this.rateLedgerPrefix(ownerKey)}${inverseRevision(revision)}.json`;
  }

  private markerKey(ownerKey: string, reservationId: string): string {
    return `quotas/${encodeURIComponent(ownerKey)}/reservations/${hashReservationId(reservationId)}.json`;
  }
}

type QuotaReservation = {
  revision: number;
  utcDay: string;
  dailyCount: number;
  reservationIds?: string[];
  reservationId?: string;
};

type RateReservationLedger = {
  revision: number;
  lastRequestAt: string;
  reservations: RateReservation[];
};

type RateReservation = {
  reservationId: string;
  acceptedAt: string;
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

function retainedRateReservations(record: RateReservationLedger | null, requestAt: string): RateReservation[] {
  if (record === null || !Array.isArray(record.reservations)) return [];
  const cutoff = new Date(requestAt).getTime() - RATE_RESERVATION_RETENTION_MS;
  const seen = new Set<string>();
  return record.reservations.filter((reservation): reservation is RateReservation => {
    if (typeof reservation?.reservationId !== 'string' || reservation.reservationId.length === 0
      || typeof reservation.acceptedAt !== 'string'
      || new Date(reservation.acceptedAt).getTime() < cutoff
      || seen.has(reservation.reservationId)) return false;
    seen.add(reservation.reservationId);
    return true;
  });
}

function latestRevision(keys: string[]): number | null {
  return rateRevisionEntries(keys)[0]?.revision ?? null;
}

function rateRevisionEntries(keys: string[]): Array<{ key: string; revision: number }> {
  return keys.map((key) => {
    const inverse = Number(/\/(\d{12})\.json$/.exec(key)?.[1]);
    return { key, revision: MAX_REVISION - inverse };
  }).filter((entry) => Number.isInteger(entry.revision) && entry.revision > 0)
    .sort((left, right) => right.revision - left.revision);
}

function inverseRevision(revision: number): string {
  return String(MAX_REVISION - revision).padStart(12, '0');
}

function isPreconditionFailure(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError
    || (typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: unknown }).code === 'BLOB_PRECONDITION_FAILED');
}
