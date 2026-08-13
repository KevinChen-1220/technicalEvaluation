import type { AssessmentPaper, AssessmentResult } from '@dynamic-assessment/assessment-core';
import { BlobPreconditionFailedError, type BlobPort } from './ports';

const INDEX_LIMIT = 200;
const INDEX_DISCOVERY_LIMIT = 64;
const REVISION_DISCOVERY_LIMIT = 256;
const INDEX_WRITE_RETRIES = 8;
const DEFAULT_DRAFT_RETENTION_DAYS = 30;
const DEFAULT_COMPLETED_RETENTION_DAYS = 365;
const DEFAULT_CLEANUP_LIMIT = 20;

export type AssessmentRecord = {
  id: string;
  ownerKey: string;
  revision: number;
  status: 'draft' | 'completed';
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult | Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type AssessmentSummary = Pick<AssessmentRecord, 'id' | 'revision' | 'status' | 'createdAt' | 'updatedAt' | 'submittedAt'> & {
  topic: string;
  questionCount: number;
  answeredCount: number;
  score: number | null;
};

export type AssessmentUpdate = {
  ownerKey: string;
  id: string;
  expectedRevision: number;
  answers: Record<string, string[]>;
  updatedAt: string;
};

export type AssessmentCompletion = AssessmentUpdate & {
  result: AssessmentRecord['result'];
  submittedAt: string;
};

export type AssessmentWriteResult =
  | { type: 'updated'; record: AssessmentRecord }
  | { type: 'conflict'; code: 'REVISION_CONFLICT' };

export interface AssessmentRepository {
  get(ownerKey: string, id: string): Promise<AssessmentRecord | null>;
  list(ownerKey: string): Promise<AssessmentSummary[]>;
  createIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord>;
  compareAndSwap(update: AssessmentUpdate): Promise<AssessmentWriteResult>;
  complete(update: AssessmentCompletion): Promise<AssessmentWriteResult>;
}

export class BlobAssessmentRepository implements AssessmentRepository {
  constructor(
    private readonly blob: BlobPort,
    private readonly options: { now: () => Date; draftRetentionDays?: number; cleanupLimit?: number },
  ) {}

  async get(ownerKey: string, id: string): Promise<AssessmentRecord | null> {
    const record = await this.readLatest(ownerKey, id);
    if (record !== null && this.isExpiredRecord(record)) {
      await this.deleteAssessment(ownerKey, id);
      return null;
    }
    return record;
  }

  async list(ownerKey: string): Promise<AssessmentSummary[]> {
    const index = await this.readIndex(ownerKey);
    const retained: AssessmentSummary[] = [];
    let cleanups = 0;
    const fullyCleaned = new Set<string>();
    for (const summary of index) {
      if (this.isExpiredSummary(summary)) {
        if (cleanups < this.cleanupLimit) {
          const remainingBudget = this.cleanupLimit - cleanups;
          const cleanup = await this.deleteAssessment(ownerKey, summary.id, remainingBudget);
          cleanups += cleanup.deleted;
          if (cleanup.complete) fullyCleaned.add(summary.id);
        }
        continue;
      }
      retained.push(summary);
    }
    if (fullyCleaned.size > 0) await this.mutateIndex(ownerKey, (summaries) => summaries.filter((summary) => (
      !fullyCleaned.has(summary.id) || !this.isExpiredSummary(summary)
    )));
    return retained.slice(0, INDEX_LIMIT);
  }

  async createIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord> {
    const normalized = clone(record);
    const key = this.revisionKey(normalized.ownerKey, normalized.id, 1);
    try {
      await this.blob.put(key, normalized, { onlyIfNew: true });
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      const existing = await this.get(normalized.ownerKey, normalized.id);
      if (existing !== null) {
        await this.upsertSummary(existing);
        return existing;
      }
      throw error;
    }
    await this.writePointer(normalized.ownerKey, normalized.id, 1);
    await this.upsertSummary(normalized);
    await this.pruneAssessmentRevisions(normalized.ownerKey, normalized.id, 1);
    return normalized;
  }

  async compareAndSwap(update: AssessmentUpdate): Promise<AssessmentWriteResult> {
    const current = await this.get(update.ownerKey, update.id);
    if (current === null || current.revision !== update.expectedRevision || current.status !== 'draft') return conflict();
    const next: AssessmentRecord = {
      ...current,
      revision: current.revision + 1,
      answers: clone(update.answers),
      updatedAt: update.updatedAt,
    };
    return await this.writeNext(next);
  }

  async complete(update: AssessmentCompletion): Promise<AssessmentWriteResult> {
    const current = await this.get(update.ownerKey, update.id);
    if (current === null || current.revision !== update.expectedRevision) return conflict();
    if (current.status === 'completed') return { type: 'updated', record: current };
    const next: AssessmentRecord = {
      ...current,
      revision: current.revision + 1,
      status: 'completed',
      answers: clone(update.answers),
      result: clone(update.result),
      submittedAt: update.submittedAt,
      updatedAt: update.updatedAt,
    };
    return await this.writeNext(next);
  }

  private async writeNext(next: AssessmentRecord): Promise<AssessmentWriteResult> {
    try {
      await this.blob.put(this.revisionKey(next.ownerKey, next.id, next.revision), next, { onlyIfNew: true });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return conflict();
      throw error;
    }
    // The revision object is the source of truth. Pointer and index writes are only discovery aids.
    await this.writePointer(next.ownerKey, next.id, next.revision);
    await this.upsertSummary(next);
    await this.pruneAssessmentRevisions(next.ownerKey, next.id, next.revision);
    return { type: 'updated', record: next };
  }

  private async readLatest(ownerKey: string, id: string): Promise<AssessmentRecord | null> {
    const prefix = `${this.baseKey(ownerKey, id)}/revisions/`;
    const revisions = (await this.blob.list(prefix, { consistency: 'strong', limit: REVISION_DISCOVERY_LIMIT })).blobs
      .map((key) => Number(/^.+\/revisions\/(\d{12})\.json$/.exec(key)?.[1]))
      .map((inverse) => 999_999_999_999 - inverse)
      .filter((value) => Number.isInteger(value) && value > 0);
    const revision = revisions.length === 0 ? null : Math.max(...revisions);
    if (revision === null) return null;
    return await this.blob.get<AssessmentRecord>(this.revisionKey(ownerKey, id, revision), { consistency: 'strong' });
  }

  private async readIndex(ownerKey: string): Promise<AssessmentSummary[]> {
    return (await this.readLatestIndex(ownerKey)).summaries;
  }

  private async upsertSummary(record: AssessmentRecord): Promise<void> {
    const summary = toSummary(record);
    await this.mutateIndex(record.ownerKey, (index) => [summary, ...index.filter((item) => item.id !== record.id)]);
  }

  private async mutateIndex(ownerKey: string, mutate: (summaries: AssessmentSummary[]) => AssessmentSummary[]): Promise<void> {
    for (let attempt = 0; attempt < INDEX_WRITE_RETRIES; attempt += 1) {
      const current = await this.readLatestIndex(ownerKey);
      const next: AssessmentIndexRevision = {
        revision: current.revision + 1,
        summaries: mutate(current.summaries).filter(isSummary).sort(sortSummaries).slice(0, INDEX_LIMIT),
      };
      try {
        await this.blob.put(this.indexRevisionKey(ownerKey, next.revision), next, { onlyIfNew: true });
        await this.pruneIndexRevisions(ownerKey, next.revision);
        return;
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new Error('INDEX_WRITE_CONFLICT');
  }

  private async readLatestIndex(ownerKey: string): Promise<AssessmentIndexRevision> {
    const prefix = `${this.indexPrefix(ownerKey)}/`;
    const revisions = (await this.blob.list(prefix, { consistency: 'strong', limit: INDEX_DISCOVERY_LIMIT })).blobs
      .map((key) => Number(/\/(\d{12})\.json$/.exec(key)?.[1]))
      .map((inverse) => 999_999_999_999 - inverse)
      .filter((revision) => Number.isInteger(revision) && revision > 0);
    const revision = revisions.length === 0 ? 0 : Math.max(...revisions);
    if (revision === 0) return { revision: 0, summaries: [] };
    return await this.blob.get<AssessmentIndexRevision>(this.indexRevisionKey(ownerKey, revision), { consistency: 'strong' })
      ?? { revision: 0, summaries: [] };
  }

  private async writePointer(ownerKey: string, id: string, revision: number): Promise<void> {
    await this.blob.put(`${this.baseKey(ownerKey, id)}.json`, { revision, updatedAt: this.options.now().toISOString() });
  }

  private async deleteAssessment(ownerKey: string, id: string, limit = this.cleanupLimit): Promise<{ complete: boolean; deleted: number }> {
    const prefix = `${this.baseKey(ownerKey, id)}/`;
    const keys = (await this.blob.list(prefix, { consistency: 'strong', limit: limit + 1 })).blobs;
    const deleteKeys = keys.slice(0, limit);
    await Promise.all(deleteKeys.map((key) => this.blob.delete(key)));
    const complete = keys.length <= limit;
    if (complete) await this.blob.delete(`${this.baseKey(ownerKey, id)}.json`);
    return { complete, deleted: deleteKeys.length };
  }

  private async pruneAssessmentRevisions(ownerKey: string, id: string, currentRevision: number): Promise<void> {
    await this.bestEffortPrune(`${this.baseKey(ownerKey, id)}/revisions/`, this.revisionKey(ownerKey, id, currentRevision));
  }

  private async pruneIndexRevisions(ownerKey: string, currentRevision: number): Promise<void> {
    await this.bestEffortPrune(`${this.indexPrefix(ownerKey)}/`, this.indexRevisionKey(ownerKey, currentRevision));
  }

  private async bestEffortPrune(prefix: string, protectedKey: string): Promise<void> {
    try {
      const keys = (await this.blob.list(prefix, { consistency: 'strong', limit: this.cleanupLimit + 1 })).blobs;
      await Promise.all(keys.filter((key) => key !== protectedKey).slice(0, this.cleanupLimit).map(async (key) => await this.blob.delete(key)));
    } catch {
      // Immutable cleanup cannot invalidate the current revision and is retried by later writes.
    }
  }

  private isExpiredRecord(record: AssessmentRecord): boolean {
    return this.isExpiredAt(record.status === 'completed' ? record.submittedAt ?? record.updatedAt : record.updatedAt, record.status);
  }

  private isExpiredSummary(summary: AssessmentSummary): boolean {
    return this.isExpiredAt(summary.status === 'completed' ? summary.submittedAt ?? summary.updatedAt : summary.updatedAt, summary.status);
  }

  private isExpiredAt(value: string, status: AssessmentRecord['status']): boolean {
    const retentionDays = status === 'completed'
      ? DEFAULT_COMPLETED_RETENTION_DAYS
      : this.options.draftRetentionDays ?? DEFAULT_DRAFT_RETENTION_DAYS;
    const cutoff = this.options.now().getTime() - retentionDays * 86_400_000;
    return new Date(value).getTime() < cutoff;
  }

  private get cleanupLimit(): number { return this.options.cleanupLimit ?? DEFAULT_CLEANUP_LIMIT; }
  private baseKey(ownerKey: string, id: string): string { return `assessments/${part(ownerKey)}/${part(id)}`; }
  private revisionKey(ownerKey: string, id: string, revision: number): string {
    return `${this.baseKey(ownerKey, id)}/revisions/${String(999_999_999_999 - revision).padStart(12, '0')}.json`;
  }
  private indexPrefix(ownerKey: string): string { return `assessments/${part(ownerKey)}/index-revisions`; }
  private indexRevisionKey(ownerKey: string, revision: number): string {
    return `${this.indexPrefix(ownerKey)}/${String(999_999_999_999 - revision).padStart(12, '0')}.json`;
  }
}

type AssessmentIndexRevision = { revision: number; summaries: AssessmentSummary[] };

function toSummary(record: AssessmentRecord): AssessmentSummary {
  return { id: record.id, revision: record.revision, status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt, submittedAt: record.submittedAt, topic: record.paper.topic, questionCount: record.paper.questions.length || record.paper.questionCount, answeredCount: Object.values(record.answers).filter((answer) => answer.length > 0).length, score: score(record.result) };
}
function score(result: AssessmentRecord['result']): number | null { return result !== null && typeof result.score === 'number' ? result.score : null; }
function sortSummaries(left: AssessmentSummary, right: AssessmentSummary): number { return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id); }
function isSummary(value: unknown): value is AssessmentSummary { return typeof value === 'object' && value !== null && typeof (value as AssessmentSummary).id === 'string' && typeof (value as AssessmentSummary).updatedAt === 'string'; }
function conflict(): AssessmentWriteResult { return { type: 'conflict', code: 'REVISION_CONFLICT' }; }
function part(value: string): string { return encodeURIComponent(value); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
