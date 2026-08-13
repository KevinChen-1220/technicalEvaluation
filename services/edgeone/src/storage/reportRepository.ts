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

export class BlobReportRepository {
  constructor(private readonly blob: BlobPort, private readonly options: { now: () => Date; retentionDays?: number; cleanupLimit?: number }) {}

  async create(record: ReportRecord): Promise<ReportRecord> {
    const written = JSON.parse(JSON.stringify(record)) as ReportRecord;
    await this.cleanupExpired(written.ownerKey);
    await this.blob.put(this.recordKey(written.ownerKey, written.id), written, { onlyIfNew: true });
    await this.blob.put(this.indexKey(written.ownerKey, written.createdAt, written.id), {
      id: written.id, createdAt: written.createdAt,
    } satisfies ReportIndexEntry, { onlyIfNew: true });
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
    const entries = (await this.blob.list(this.indexPrefix(ownerKey), { consistency: 'strong', limit: remaining })).blobs;
    for (const key of entries) {
      const entry = await this.blob.get<ReportIndexEntry>(key, { consistency: 'strong' });
      if (entry === null || typeof entry.id !== 'string' || typeof entry.createdAt !== 'string') {
        await this.blob.delete(key);
        continue;
      }
      if (new Date(entry.createdAt).getTime() >= this.cutoff()) break;
      await this.blob.delete(this.recordKey(ownerKey, entry.id));
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

  private cutoff(): number { return this.options.now().getTime() - (this.options.retentionDays ?? 365) * 86_400_000; }
  private get cleanupLimit(): number { return this.options.cleanupLimit ?? 20; }
  private prefix(ownerKey: string): string { return `reports/${encodeURIComponent(ownerKey)}/`; }
  private recordsPrefix(ownerKey: string): string { return `${this.prefix(ownerKey)}records/`; }
  private indexPrefix(ownerKey: string): string { return `${this.prefix(ownerKey)}index/`; }
  private recordKey(ownerKey: string, id: string): string { return `${this.recordsPrefix(ownerKey)}${encodeURIComponent(id)}.json`; }
  private legacyKey(ownerKey: string, id: string): string { return `${this.prefix(ownerKey)}${encodeURIComponent(id)}.json`; }
  private indexKey(ownerKey: string, createdAt: string, id: string): string {
    return `${this.indexPrefix(ownerKey)}${encodeURIComponent(createdAt)}/${encodeURIComponent(id)}.json`;
  }
}
