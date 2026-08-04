import type { database as cloudDatabase } from 'wx-server-sdk';
import type {
  Assessment,
  AssessmentCompareAndSwapQuery,
} from '../../shared/contracts';
import type { AssessmentRepository } from '../assessment/service';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

export class CloudBaseAssessmentRepository implements AssessmentRepository {
  constructor(private readonly database: CloudDatabase) {}

  async findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null> {
    const result = await this.database.collection('assessments')
      .where({ _id: id, _openid: ownerOpenId })
      .limit(1)
      .get();
    return firstAssessment(result);
  }

  async compareAndSwap(query: AssessmentCompareAndSwapQuery): Promise<Assessment | null> {
    const result = await this.database.collection(query.collection)
      .where(query.filter)
      .limit(1)
      .update({ data: {
        ...query.update.$set,
        revision: this.database.command.inc(query.update.$inc.revision),
      } });
    if (!isUpdateResult(result) || result.stats.updated !== 1) return null;
    return this.findOwnedAssessment(query.filter._id, query.filter._openid);
  }

  async getRevision(input: { id: string; openId: string }): Promise<number | null> {
    return (await this.findOwnedAssessment(input.id, input.openId))?.revision ?? null;
  }

  async listOwnedAssessments(input: {
    ownerOpenId: string;
    limit: number;
    cursor: string | null;
  }): Promise<{ records: Assessment[]; nextCursor: string | null }> {
    const filter = createListFilter(this.database, input.ownerOpenId, input.cursor);
    const result = await this.database.collection('assessments')
      .where(filter as never)
      .orderBy('updatedAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(input.limit + 1)
      .get();
    const records = assessments(result);
    const page = records.slice(0, input.limit);
    const last = page[page.length - 1];
    return {
      records: page,
      nextCursor: records.length > input.limit && last !== undefined
        ? encodeCursor({ updatedAt: last.updatedAt, id: last._id })
        : null,
    };
  }
}

type Cursor = { updatedAt: string; id: string };

function createListFilter(database: CloudDatabase, ownerOpenId: string, cursor: string | null): unknown {
  if (cursor === null) return { _openid: ownerOpenId };
  const parsed = decodeCursor(cursor);
  if (parsed === null) return { _openid: ownerOpenId, updatedAt: database.command.lt('') };
  return database.command.and(
    { _openid: ownerOpenId },
    database.command.or(
      { updatedAt: database.command.lt(parsed.updatedAt) },
      { updatedAt: parsed.updatedAt, _id: database.command.lt(parsed.id) },
    ),
  );
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
    return typeof parsed.updatedAt === 'string' && typeof parsed.id === 'string'
      ? { updatedAt: parsed.updatedAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function firstAssessment(result: unknown): Assessment | null {
  const value = isRecord(result) && Array.isArray(result.data) ? result.data[0] : undefined;
  return isRecord(value)
    && typeof value._id === 'string'
    && typeof value._openid === 'string'
    && typeof value.revision === 'number'
    ? value as Assessment
    : null;
}

function assessments(result: unknown): Assessment[] {
  const values = isRecord(result) && Array.isArray(result.data) ? result.data : [];
  return values.filter((value): value is Assessment => (
    isRecord(value)
    && typeof value._id === 'string'
    && typeof value._openid === 'string'
    && typeof value.revision === 'number'
  ));
}

function isUpdateResult(result: unknown): result is { stats: { updated: number } } {
  return isRecord(result) && isRecord(result.stats) && typeof result.stats.updated === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
