import type { OperationalLogger } from '../operations/logger';

export type RetentionPolicy = {
  batchSize: number;
  jobRetentionDays: number;
  quotaRetentionDays: number;
  rateLimitRetentionDays: number;
  staleDraftAssessmentRetentionDays: number;
  completedAssessmentRetentionDays: number;
  reportRetentionDays: number;
};

export type RetentionCounts = {
  generationJobs: number;
  dailyQuotas: number;
  rateBuckets: number;
  draftAssessments: number;
  completedAssessments: number;
  reports: number;
};

export type RetentionRepository = {
  deleteExpiredGenerationJobs(input: { before: string; limit: number }): Promise<number>;
  deleteExpiredDailyQuotas(input: { before: string; limit: number }): Promise<number>;
  deleteExpiredRateLimitBuckets(input: { before: string; limit: number }): Promise<number>;
  deleteExpiredDraftAssessments(input: { before: string; limit: number }): Promise<number>;
  deleteExpiredCompletedAssessments(input: { before: string; limit: number }): Promise<number>;
  deleteExpiredReports(input: { before: string; limit: number }): Promise<number>;
};

export type RetentionDependencies = {
  repository: RetentionRepository;
  clock: { now(): Date };
  policy: RetentionPolicy;
  logger: OperationalLogger;
};

export async function runRetentionCleanup(
  dependencies: RetentionDependencies,
): Promise<RetentionCounts> {
  const now = dependencies.clock.now();
  const limit = normalizeBatchSize(dependencies.policy.batchSize);
  const counts: RetentionCounts = {
    generationJobs: await dependencies.repository.deleteExpiredGenerationJobs({
      before: cutoff(now, dependencies.policy.jobRetentionDays),
      limit,
    }),
    dailyQuotas: await dependencies.repository.deleteExpiredDailyQuotas({
      before: cutoff(now, dependencies.policy.quotaRetentionDays),
      limit,
    }),
    rateBuckets: await dependencies.repository.deleteExpiredRateLimitBuckets({
      before: cutoff(now, dependencies.policy.rateLimitRetentionDays),
      limit,
    }),
    draftAssessments: await dependencies.repository.deleteExpiredDraftAssessments({
      before: cutoff(now, dependencies.policy.staleDraftAssessmentRetentionDays),
      limit,
    }),
    completedAssessments: await dependencies.repository.deleteExpiredCompletedAssessments({
      before: cutoff(now, dependencies.policy.completedAssessmentRetentionDays),
      limit,
    }),
    reports: await dependencies.repository.deleteExpiredReports({
      before: cutoff(now, dependencies.policy.reportRetentionDays),
      limit,
    }),
  };
  dependencies.logger.log({
    eventName: 'retention_cleanup_completed',
    counts,
  });
  return counts;
}

function normalizeBatchSize(value: number): number {
  return Number.isInteger(value) && value > 0 && value <= 100 ? value : 50;
}

function cutoff(now: Date, days: number): string {
  return new Date(now.getTime() - Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString();
}
