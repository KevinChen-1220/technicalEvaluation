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

function isUpdateResult(result: unknown): result is { stats: { updated: number } } {
  return isRecord(result) && isRecord(result.stats) && typeof result.stats.updated === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
