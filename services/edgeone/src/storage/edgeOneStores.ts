import { BlobAssessmentRepository } from './assessmentRepository';
import type { BlobPort } from './ports';
import { BlobQuotaRepository } from './quotaRepository';
import { BlobReportRepository } from './reportRepository';
import { BlobSettingsRepository } from './settingsRepository';

export type StoreOptions = { now: () => Date; draftRetentionDays?: number; reportRetentionDays?: number; cleanupLimit?: number };

export function createEdgeOneStores(blob: BlobPort, options: StoreOptions) {
  return {
    assessments: new BlobAssessmentRepository(blob, options),
    settings: new BlobSettingsRepository(blob),
    quota: new BlobQuotaRepository(blob),
    reports: new BlobReportRepository(blob, {
      now: options.now,
      ...(options.reportRetentionDays === undefined ? {} : { retentionDays: options.reportRetentionDays }),
      ...(options.cleanupLimit === undefined ? {} : { cleanupLimit: options.cleanupLimit }),
    }),
  };
}
