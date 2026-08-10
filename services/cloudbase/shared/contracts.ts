import type {
  AssessmentPaper,
  AssessmentResult,
} from '@dynamic-assessment/assessment-core';
import { readTrustedOpenId } from '../server/trustedContext';
import {
  InvalidContractInputError,
  MissingTrustedOpenIdError,
  RecordOwnershipError,
} from './errors';

export {
  InvalidContractInputError,
  MissingTrustedOpenIdError,
  RecordOwnershipError,
} from './errors';

export const COLLECTION_SCHEMA_VERSION = 1 as const;
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-08-10' as const;

export type GenerationRequest = {
  topic: string;
  notes?: string;
  questionCount: 50 | 100;
};

export type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type GenerationJob = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  status: GenerationJobStatus;
  progress: number;
  request: GenerationRequest;
  clientRequestId?: string;
  assessmentId?: string;
  errorCode?: string;
  retryable: boolean;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
};

export type DailyGenerationQuotaCounter = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  utcDay: string;
  count: number;
  createdAt: string;
  updatedAt: string;
};

export type GenerationRateLimitCounter = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  windowStartedAt: string;
  expiresAt: string;
  count: number;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentStatus = 'draft' | 'completed';

export type Assessment = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  status: AssessmentStatus;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DisplayPreferences = {
  theme?: 'system' | 'light' | 'dark';
  compactMode?: boolean;
};

export type UserSettings = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  locale: 'zh-CN';
  displayPreferences?: DisplayPreferences;
  privacyConsentVersion: string;
  privacyConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportReason = 'question_error' | 'content_safety' | 'privacy' | 'other';

export type UserReport = {
  _id: string;
  _openid: string;
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  assessmentId: string;
  reason: ReportReason;
  detail?: string;
  policyVersion: string;
  status: 'open';
  createdAt: string;
  updatedAt: string;
};

export type CreateGenerationJobInput = {
  id: string;
  request: GenerationRequest;
  clientRequestId?: string;
  expiresAt: string;
};

export type CreateAssessmentInput = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult | null;
  status: AssessmentStatus;
  completedAt: string | null;
};

export type CreateUserSettingsInput = {
  id: string;
  locale: 'zh-CN';
  displayPreferences?: DisplayPreferences;
  privacyConsentVersion: string;
  privacyConsentAt: string | null;
};

export type UpdateUserSettingsInput = Omit<CreateUserSettingsInput, 'id'>;

export type UpdateAssessmentInput = {
  expectedRevision: number;
  answers: Record<string, string[]>;
  result: AssessmentResult | null;
  status: AssessmentStatus;
  completedAt: string | null;
};

export type AssessmentUpdateResult =
  | { type: 'updated'; record: Assessment }
  | { type: 'conflict'; currentRevision: number };

export type AssessmentCompareAndSwapQuery = {
  collection: 'assessments';
  filter: {
    _id: string;
    _openid: string;
    revision: number;
  };
  update: {
    $set: {
      answers: Record<string, string[]>;
      result: AssessmentResult | null;
      status: AssessmentStatus;
      completedAt: string | null;
      updatedAt: string;
    };
    $inc: { revision: 1 };
  };
};

export type AssessmentCompareAndSwapPersistence = {
  compareAndSwap(query: AssessmentCompareAndSwapQuery): Promise<Assessment | null>;
  getRevision(input: { id: string; openId: string }): Promise<number | null>;
};

export function canAccessOwnRecord(
  record: Pick<{ _openid: string }, '_openid'>,
  trustedOpenId: string,
): boolean {
  return record._openid === trustedOpenId;
}

export function createGenerationJob(
  input: CreateGenerationJobInput,
  context: unknown,
  now: string,
): GenerationJob {
  const clientRequestId = input.clientRequestId === undefined
    ? {}
    : { clientRequestId: requireNonEmpty(input.clientRequestId, 'Client request id is required.') };

  return {
    _id: requireNonEmpty(input.id, 'Generation job id is required.'),
    _openid: requireTrustedOpenId(context),
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    status: 'queued',
    progress: 0,
    request: sanitizeGenerationRequest(input.request),
    ...clientRequestId,
    retryable: false,
    attempt: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: requireNonEmpty(input.expiresAt, 'Generation job expiry is required.'),
  };
}

export function createAssessment(
  input: CreateAssessmentInput,
  context: unknown,
  now: string,
): Assessment {
  return {
    _id: requireNonEmpty(input.id, 'Assessment id is required.'),
    _openid: requireTrustedOpenId(context),
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    status: input.status,
    paper: input.paper,
    answers: input.answers,
    result: input.result,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: input.completedAt,
  };
}

export function createUserSettings(
  input: unknown,
  context: unknown,
  now: string,
): UserSettings {
  const parsed = parseUserSettingsInput(input, true);
  const displayPreferences = parsed.displayPreferences === undefined
    ? {}
    : { displayPreferences: parsed.displayPreferences };

  return {
    _id: parsed.id,
    _openid: requireTrustedOpenId(context),
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    locale: parsed.locale,
    ...displayPreferences,
    privacyConsentVersion: parsed.privacyConsentVersion,
    privacyConsentAt: parsed.privacyConsentAt,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateUserSettings(
  record: UserSettings,
  input: unknown,
  context: unknown,
  now: string,
): UserSettings {
  const trustedOpenId = requireTrustedOpenId(context);
  if (!canAccessOwnRecord(record, trustedOpenId)) {
    throw new RecordOwnershipError();
  }

  const parsed = parseUserSettingsInput(input, false);
  const displayPreferences = parsed.displayPreferences === undefined
    ? {}
    : { displayPreferences: parsed.displayPreferences };

  return {
    _id: record._id,
    _openid: record._openid,
    schemaVersion: record.schemaVersion,
    locale: parsed.locale,
    ...displayPreferences,
    privacyConsentVersion: parsed.privacyConsentVersion,
    privacyConsentAt: parsed.privacyConsentAt,
    createdAt: record.createdAt,
    updatedAt: now,
  };
}

export function updateAssessment(
  record: Assessment,
  input: UpdateAssessmentInput,
  context: unknown,
  now: string,
): AssessmentUpdateResult {
  const trustedOpenId = requireTrustedOpenId(context);
  if (!canAccessOwnRecord(record, trustedOpenId)) {
    throw new RecordOwnershipError();
  }

  if (record.revision !== input.expectedRevision) {
    return { type: 'conflict', currentRevision: record.revision };
  }

  return {
    type: 'updated',
    record: {
      ...record,
      answers: input.answers,
      result: input.result,
      status: input.status,
      completedAt: input.completedAt,
      revision: record.revision + 1,
      updatedAt: now,
    },
  };
}

export async function updateAssessmentWithCompareAndSwap(
  persistence: AssessmentCompareAndSwapPersistence,
  record: Assessment,
  input: UpdateAssessmentInput,
  context: unknown,
  now: string,
): Promise<AssessmentUpdateResult> {
  const prepared = updateAssessment(record, input, context, now);
  if (prepared.type === 'conflict') {
    return prepared;
  }

  const query: AssessmentCompareAndSwapQuery = {
    collection: 'assessments',
    filter: {
      _id: record._id,
      _openid: record._openid,
      revision: input.expectedRevision,
    },
    update: {
      $set: {
        answers: input.answers,
        result: input.result,
        status: input.status,
        completedAt: input.completedAt,
        updatedAt: now,
      },
      $inc: { revision: 1 },
    },
  };
  const updated = await persistence.compareAndSwap(query);
  if (updated !== null) {
    return { type: 'updated', record: updated };
  }

  const currentRevision = await persistence.getRevision({
    id: record._id,
    openId: requireTrustedOpenId(context),
  });
  return { type: 'conflict', currentRevision: currentRevision ?? record.revision };
}

export function sanitizeGenerationRequest(request: GenerationRequest): GenerationRequest {
  const topic = requireNonEmpty(request.topic.trim(), 'Generation topic is required.');
  if (topic.length > 200) {
    throw new InvalidContractInputError('Generation topic must not exceed 200 characters.');
  }
  if (request.questionCount !== 50 && request.questionCount !== 100) {
    throw new InvalidContractInputError('Question count must be 50 or 100.');
  }

  const notes = request.notes?.trim();
  if (notes !== undefined && notes.length > 2000) {
    throw new InvalidContractInputError('Generation notes must not exceed 2000 characters.');
  }

  return notes === undefined || notes.length === 0
    ? { topic, questionCount: request.questionCount }
    : { topic, notes, questionCount: request.questionCount };
}

function requireTrustedOpenId(context: unknown): string {
  const openId = readTrustedOpenId(context);
  if (openId === null) {
    throw new MissingTrustedOpenIdError();
  }

  return openId;
}

function parseUserSettingsInput(
  input: unknown,
  includesId: true,
): CreateUserSettingsInput;
function parseUserSettingsInput(
  input: unknown,
  includesId: false,
): UpdateUserSettingsInput;
function parseUserSettingsInput(
  input: unknown,
  includesId: boolean,
): CreateUserSettingsInput | UpdateUserSettingsInput {
  if (!isRecord(input)) {
    throw new InvalidContractInputError('User settings input must be an object.');
  }

  const allowedKeys = includesId
    ? ['id', 'locale', 'displayPreferences', 'privacyConsentVersion', 'privacyConsentAt']
    : ['locale', 'displayPreferences', 'privacyConsentVersion', 'privacyConsentAt'];
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) {
      throw new InvalidContractInputError(`Unsupported user settings field: ${key}.`);
    }
  }

  if (input.locale !== 'zh-CN') {
    throw new InvalidContractInputError('User settings locale must be zh-CN.');
  }
  if (typeof input.privacyConsentVersion !== 'string' || input.privacyConsentVersion.length === 0) {
    throw new InvalidContractInputError('Privacy consent version is required.');
  }
  if (input.privacyConsentAt !== null && typeof input.privacyConsentAt !== 'string') {
    throw new InvalidContractInputError('Privacy consent timestamp must be a string or null.');
  }

  const displayPreferences = parseDisplayPreferences(input.displayPreferences);
  const common = {
    locale: input.locale,
    ...(displayPreferences === undefined ? {} : { displayPreferences }),
    privacyConsentVersion: input.privacyConsentVersion,
    privacyConsentAt: input.privacyConsentAt,
  } as const;
  if (!includesId) {
    return common;
  }

  if (typeof input.id !== 'string') {
    throw new InvalidContractInputError('User settings id is required.');
  }
  return { id: requireNonEmpty(input.id, 'User settings id is required.'), ...common };
}

function parseDisplayPreferences(input: unknown): DisplayPreferences | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!isRecord(input)) {
    throw new InvalidContractInputError('Display preferences must be an object.');
  }

  for (const key of Object.keys(input)) {
    if (key !== 'theme' && key !== 'compactMode') {
      throw new InvalidContractInputError(`Unsupported display preference: ${key}.`);
    }
  }
  if (input.theme !== undefined && input.theme !== 'system' && input.theme !== 'light' && input.theme !== 'dark') {
    throw new InvalidContractInputError('Display preference theme is invalid.');
  }
  if (input.compactMode !== undefined && typeof input.compactMode !== 'boolean') {
    throw new InvalidContractInputError('Display preference compactMode must be boolean.');
  }

  return input as DisplayPreferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmpty(value: string, message: string): string {
  if (value.length === 0) {
    throw new InvalidContractInputError(message);
  }

  return value;
}
