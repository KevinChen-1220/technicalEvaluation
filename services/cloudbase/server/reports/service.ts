import {
  COLLECTION_SCHEMA_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  type Assessment,
  type ReportReason,
  type UserReport,
} from '../../shared/contracts';
import { readTrustedOpenId } from '../trustedContext';

export type ReportRepository = {
  create(report: UserReport): Promise<void>;
};

export type ReportAssessmentLookup = {
  findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null>;
};

export type CreateReportDependencies = {
  repository: ReportRepository;
  assessments: ReportAssessmentLookup;
  clock: { now(): Date };
  ids: { reportId(): string };
};

const invalid = { type: 'invalid', errorCode: 'INVALID_REQUEST' } as const;

export async function createReport(
  input: unknown,
  trustedContext: unknown,
  dependencies: CreateReportDependencies,
): Promise<
  | { type: 'created'; reportId: string }
  | typeof invalid
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const parsed = parseReportInput(input);
  if (ownerOpenId === null || parsed === null) return invalid;

  if (requiresAssessment(parsed.reason) && parsed.assessmentId === undefined) return invalid;
  if (parsed.assessmentId !== undefined) {
    const assessment = await dependencies.assessments.findOwnedAssessment(parsed.assessmentId, ownerOpenId);
    if (assessment === null) return invalid;
  }

  const now = dependencies.clock.now().toISOString();
  const report: UserReport = {
    _id: dependencies.ids.reportId(),
    _openid: ownerOpenId,
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    ...(parsed.assessmentId === undefined ? {} : { assessmentId: parsed.assessmentId }),
    reason: parsed.reason,
    ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
    policyVersion: parsed.policyVersion,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  await dependencies.repository.create(report);
  return { type: 'created', reportId: report._id };
}

function parseReportInput(input: unknown): {
  assessmentId?: string;
  reason: ReportReason;
  detail?: string;
  policyVersion: string;
} | null {
  if (!isRecord(input)) return null;
  if ((input.assessmentId !== undefined && typeof input.assessmentId !== 'string') || typeof input.reason !== 'string' || typeof input.policyVersion !== 'string') {
    return null;
  }
  const assessmentId = typeof input.assessmentId === 'string' ? input.assessmentId.trim() : undefined;
  const policyVersion = input.policyVersion.trim();
  if (
    (assessmentId !== undefined && (assessmentId.length === 0 || assessmentId.length > 128))
    || policyVersion !== CURRENT_PRIVACY_POLICY_VERSION
    || !isReportReason(input.reason)
  ) return null;

  const detail = input.detail === undefined ? undefined : input.detail;
  if (detail !== undefined && typeof detail !== 'string') return null;
  const trimmedDetail = detail?.trim();
  if (trimmedDetail !== undefined && trimmedDetail.length > 500) return null;
  return {
    ...(assessmentId === undefined ? {} : { assessmentId }),
    reason: input.reason,
    policyVersion,
    ...(trimmedDetail === undefined || trimmedDetail.length === 0 ? {} : { detail: trimmedDetail }),
  };
}

function requiresAssessment(reason: ReportReason): boolean {
  return reason === 'question_error' || reason === 'content_safety';
}

function isReportReason(value: string): value is ReportReason {
  return value === 'question_error'
    || value === 'content_safety'
    || value === 'privacy'
    || value === 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
