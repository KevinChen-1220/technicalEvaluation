import type { database as cloudDatabase } from 'wx-server-sdk';
import type { RetentionRepository } from '../retention/service';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

export class CloudBaseRetentionRepository implements RetentionRepository {
  constructor(private readonly database: CloudDatabase) {}

  async deleteExpiredGenerationJobs(input: { before: string; limit: number }): Promise<number> {
    return removeExpired(this.database, 'generation_jobs', { expiresAt: this.database.command.lte(input.before) }, input.limit);
  }

  async deleteExpiredDailyQuotas(input: { before: string; limit: number }): Promise<number> {
    return removeExpired(this.database, 'daily_generation_quotas', { updatedAt: this.database.command.lte(input.before) }, input.limit);
  }

  async deleteExpiredRateLimitBuckets(input: { before: string; limit: number }): Promise<number> {
    return removeExpired(this.database, 'generation_rate_limits', { expiresAt: this.database.command.lte(input.before) }, input.limit);
  }

  async deleteExpiredCompletedAssessments(input: { before: string; limit: number }): Promise<number> {
    return removeExpired(this.database, 'assessments', { status: 'completed', completedAt: this.database.command.lte(input.before) }, input.limit);
  }

  async deleteExpiredReports(input: { before: string; limit: number }): Promise<number> {
    return removeExpired(this.database, 'user_reports', { createdAt: this.database.command.lte(input.before) }, input.limit);
  }
}

async function removeExpired(
  database: CloudDatabase,
  collection: string,
  query: Record<string, unknown>,
  limit: number,
): Promise<number> {
  const result = await database.collection(collection)
    .where(query)
    .limit(limit)
    .remove();
  return isRecord(result) && isRecord(result.stats) && typeof result.stats.removed === 'number'
    ? result.stats.removed
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
