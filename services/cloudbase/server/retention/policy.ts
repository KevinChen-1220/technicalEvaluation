import type { RetentionPolicy } from './service';

export function retentionPolicyFromEnvironment(
  environment: Record<string, string | undefined>,
): RetentionPolicy {
  return {
    batchSize: parsePositiveInteger(environment.RETENTION_BATCH_SIZE, 50, 100),
    jobRetentionDays: parsePositiveInteger(environment.GENERATION_JOB_RETENTION_DAYS, 1, 30),
    quotaRetentionDays: parsePositiveInteger(environment.QUOTA_RETENTION_DAYS, 2, 30),
    rateLimitRetentionDays: parsePositiveInteger(environment.RATE_LIMIT_RETENTION_DAYS, 2, 30),
    staleDraftAssessmentRetentionDays: parsePositiveInteger(
      environment.DRAFT_ASSESSMENT_RETENTION_DAYS,
      30,
      3650,
    ),
    completedAssessmentRetentionDays: parsePositiveInteger(
      environment.COMPLETED_ASSESSMENT_RETENTION_DAYS,
      365,
      3650,
    ),
    reportRetentionDays: parsePositiveInteger(environment.REPORT_RETENTION_DAYS, 365, 3650),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}
