import type {
  AssessmentPaper,
  AssessmentResult,
} from '@dynamic-assessment/assessment-core';

export const COLLECTION_SCHEMA_VERSION = 1 as const;

export type TrustedWeChatContext = {
  OPENID?: string;
};

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

export class MissingTrustedOpenIdError extends Error {
  constructor() {
    super('Trusted WeChat OPENID is required.');
    this.name = 'MissingTrustedOpenIdError';
  }
}

export class RecordOwnershipError extends Error {
  constructor() {
    super('The trusted WeChat OPENID does not own this record.');
    this.name = 'RecordOwnershipError';
  }
}

export class InvalidContractInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContractInputError';
  }
}

export type CreateGenerationJobInput = {
  id: string;
  request: GenerationRequest;
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

export function requireTrustedOpenId(context: TrustedWeChatContext): string {
  if (typeof context.OPENID !== 'string' || context.OPENID.length === 0) {
    throw new MissingTrustedOpenIdError();
  }

  return context.OPENID;
}

export function canAccessOwnRecord(
  record: Pick<{ _openid: string }, '_openid'>,
  trustedOpenId: string,
): boolean {
  return record._openid === trustedOpenId;
}

export function createGenerationJob(
  input: CreateGenerationJobInput,
  context: TrustedWeChatContext,
  now: string,
): GenerationJob {
  return {
    _id: requireNonEmpty(input.id, 'Generation job id is required.'),
    _openid: requireTrustedOpenId(context),
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    status: 'queued',
    progress: 0,
    request: sanitizeGenerationRequest(input.request),
    retryable: false,
    attempt: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: requireNonEmpty(input.expiresAt, 'Generation job expiry is required.'),
  };
}

export function createAssessment(
  input: CreateAssessmentInput,
  context: TrustedWeChatContext,
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
  input: CreateUserSettingsInput,
  context: TrustedWeChatContext,
  now: string,
): UserSettings {
  const displayPreferences = input.displayPreferences === undefined
    ? {}
    : { displayPreferences: input.displayPreferences };

  return {
    _id: requireNonEmpty(input.id, 'User settings id is required.'),
    _openid: requireTrustedOpenId(context),
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    locale: input.locale,
    ...displayPreferences,
    privacyConsentVersion: requireNonEmpty(
      input.privacyConsentVersion,
      'Privacy consent version is required.',
    ),
    privacyConsentAt: input.privacyConsentAt,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateAssessment(
  record: Assessment,
  input: UpdateAssessmentInput,
  context: TrustedWeChatContext,
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

function requireNonEmpty(value: string, message: string): string {
  if (value.length === 0) {
    throw new InvalidContractInputError(message);
  }

  return value;
}
