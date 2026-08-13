import type { BlobPort } from './ports';

export type ReportRecord = {
  id: string;
  ownerKey: string;
  reason: string;
  policyVersion?: string;
  detail?: string;
  assessmentId?: string;
  createdAt: string;
  updatedAt: string;
};

type ReportIndexEntry = Pick<ReportRecord, 'id' | 'createdAt'>;
type OrphanSweepState = { cursor: string };

export class BlobReportRepository {
  constructor(private readonly blob: BlobPort, private readonly options: { now: () => Date; retentionDays?: number; cleanupLimit?: number }) {}

  async create(record: ReportRecord): Promise<ReportRecord> {
    const written = JSON.parse(JSON.stringify(record)) as ReportRecord;
    await this.cleanupExpired(written.ownerKey);
    const indexKey = this.indexKey(written.ownerKey, written.createdAt, written.id);
    await this.blob.put(indexKey, {
      id: written.id, createdAt: written.createdAt,
    } satisfies ReportIndexEntry, { onlyIfNew: true });
    try {
      await this.blob.put(this.recordKey(written.ownerKey, written.id), written, { onlyIfNew: true });
    } catch (error) {
      try {
        await this.blob.delete(indexKey);
      } catch {
        // A later bounded cleanup pass repairs a failed compensation.
      }
      throw error;
    }
    return written;
  }

  async list(ownerKey: string): Promise<ReportRecord[]> {
    await this.cleanupExpired(ownerKey);
    const records = await this.records(ownerKey);
    return records.filter((record) => new Date(record.createdAt).getTime() >= this.cutoff())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async cleanupExpired(ownerKey: string): Promise<void> {
    let remaining = this.cleanupLimit;
    const recordCache = new Map<string, ReportRecord | null>();
    const entries = (await this.blob.list(this.indexPrefix(ownerKey), { consistency: 'strong', limit: remaining })).blobs;
    for (const key of entries) {
      const entry = await this.blob.get<ReportIndexEntry>(key, { consistency: 'strong' });
      if (entry === null || typeof entry.id !== 'string' || typeof entry.createdAt !== 'string') {
        await this.blob.delete(key);
        remaining -= 1;
        if (remaining === 0) return;
        continue;
      }
      const createdAt = new Date(entry.createdAt).getTime();
      if (!Number.isFinite(createdAt)) {
        await this.blob.delete(key);
        remaining -= 1;
        if (remaining === 0) return;
        continue;
      }
      if (createdAt < this.cutoff()) {
        await this.blob.delete(this.recordKey(ownerKey, entry.id));
        await this.blob.delete(key);
        remaining -= 1;
        if (remaining === 0) return;
        continue;
      }
      const recordKey = this.recordKey(ownerKey, entry.id);
      const record = await this.blob.get<ReportRecord>(recordKey, { consistency: 'strong' });
      recordCache.set(recordKey, record);
      if (record !== null) continue;
      await this.blob.delete(key);
      remaining -= 1;
      if (remaining === 0) return;
    }
    for (const record of await this.legacyRecords(ownerKey)) {
      if (remaining === 0) return;
      if (new Date(record.createdAt).getTime() >= this.cutoff()) continue;
      await this.blob.delete(this.legacyKey(ownerKey, record.id));
      remaining -= 1;
    }
    for (const record of await this.orphanRecordCandidates(ownerKey, remaining, recordCache)) {
      if (remaining === 0) return;
      if (new Date(record.createdAt).getTime() >= this.cutoff()) continue;
      await this.blob.delete(this.recordKey(ownerKey, record.id));
      remaining -= 1;
    }
  }

  private async records(ownerKey: string): Promise<ReportRecord[]> {
    const keys = (await this.blob.list(this.recordsPrefix(ownerKey), { consistency: 'strong', limit: 200 })).blobs;
    const records = await Promise.all(keys.map((key) => this.blob.get<ReportRecord>(key, { consistency: 'strong' })));
    return [
      ...records.filter((record): record is ReportRecord => record !== null && record.ownerKey === ownerKey),
      ...await this.legacyRecords(ownerKey),
    ];
  }

  private async legacyRecords(ownerKey: string): Promise<ReportRecord[]> {
    const keys = (await this.blob.list(this.prefix(ownerKey), { consistency: 'strong', directories: true })).blobs;
    const records = await Promise.all(keys.map((key) => this.blob.get<ReportRecord>(key, { consistency: 'strong' })));
    return records.filter((record): record is ReportRecord => record !== null && record.ownerKey === ownerKey);
  }

  private async orphanRecordCandidates(
    ownerKey: string,
    limit: number,
    recordCache: Map<string, ReportRecord | null>,
  ): Promise<ReportRecord[]> {
    const sweepKey = this.orphanSweepKey(ownerKey);
    const state = await this.blob.get<OrphanSweepState>(sweepKey, { consistency: 'strong' });
    const cursor = state !== null && typeof state.cursor === 'string' ? state.cursor : undefined;
    const listing = await this.blob.list(this.recordsPrefix(ownerKey), {
      consistency: 'strong', limit, ...(cursor === undefined ? {} : { cursor }),
    });
    if (listing.cursor === undefined) await this.blob.delete(sweepKey);
    else await this.blob.put(sweepKey, { cursor: listing.cursor } satisfies OrphanSweepState);
    const keys = listing.blobs;
    const records = await Promise.all(keys.map(async (key) => {
      if (recordCache.has(key)) return recordCache.get(key) ?? null;
      return await this.blob.get<ReportRecord>(key, { consistency: 'strong' });
    }));
    return records.filter((record): record is ReportRecord => record !== null && record.ownerKey === ownerKey);
  }

  private cutoff(): number { return this.options.now().getTime() - (this.options.retentionDays ?? 365) * 86_400_000; }
  private get cleanupLimit(): number { return this.options.cleanupLimit ?? 20; }
  private prefix(ownerKey: string): string { return `reports/${encodeURIComponent(ownerKey)}/`; }
  private recordsPrefix(ownerKey: string): string { return `${this.prefix(ownerKey)}records/`; }
  private indexPrefix(ownerKey: string): string { return `${this.prefix(ownerKey)}index/`; }
  private orphanSweepKey(ownerKey: string): string { return `${this.prefix(ownerKey)}ops/orphan-sweep.json`; }
  private recordKey(ownerKey: string, id: string): string { return `${this.recordsPrefix(ownerKey)}${encodeURIComponent(id)}.json`; }
  private legacyKey(ownerKey: string, id: string): string { return `${this.prefix(ownerKey)}${encodeURIComponent(id)}.json`; }
  private indexKey(ownerKey: string, createdAt: string, id: string): string {
    return `${this.indexPrefix(ownerKey)}${encodeURIComponent(createdAt)}/${encodeURIComponent(id)}.json`;
  }
}
