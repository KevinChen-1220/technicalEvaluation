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

export class BlobReportRepository {
  constructor(private readonly blob: BlobPort, private readonly options: { now: () => Date; retentionDays?: number; cleanupLimit?: number }) {}

  async create(record: ReportRecord): Promise<ReportRecord> {
    const written = JSON.parse(JSON.stringify(record)) as ReportRecord;
    await this.cleanupExpired(written.ownerKey);
    await this.blob.put(this.key(written.ownerKey, written.id), written, { onlyIfNew: true });
    return written;
  }

  async list(ownerKey: string): Promise<ReportRecord[]> {
    const records = await this.records(ownerKey);
    const retained: ReportRecord[] = [];
    let cleanups = 0;
    for (const record of records) {
      if (new Date(record.createdAt).getTime() < this.cutoff()) {
        if (cleanups < this.cleanupLimit) {
          cleanups += 1;
          await this.blob.delete(this.key(ownerKey, record.id));
        }
        continue;
      }
      retained.push(record);
    }
    return retained.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async cleanupExpired(ownerKey: string): Promise<void> {
    let cleanups = 0;
    for (const record of await this.records(ownerKey)) {
      if (new Date(record.createdAt).getTime() >= this.cutoff() || cleanups >= this.cleanupLimit) continue;
      cleanups += 1;
      await this.blob.delete(this.key(ownerKey, record.id));
    }
  }

  private async records(ownerKey: string): Promise<ReportRecord[]> {
    const keys = (await this.blob.list(this.prefix(ownerKey), { consistency: 'strong', limit: 200 })).blobs;
    const records = await Promise.all(keys.map((key) => this.blob.get<ReportRecord>(key, { consistency: 'strong' })));
    return records.filter((record): record is ReportRecord => record !== null && record.ownerKey === ownerKey);
  }

  private cutoff(): number { return this.options.now().getTime() - (this.options.retentionDays ?? 365) * 86_400_000; }
  private get cleanupLimit(): number { return this.options.cleanupLimit ?? 20; }
  private prefix(ownerKey: string): string { return `reports/${encodeURIComponent(ownerKey)}/`; }
  private key(ownerKey: string, id: string): string { return `${this.prefix(ownerKey)}${encodeURIComponent(id)}.json`; }
}
