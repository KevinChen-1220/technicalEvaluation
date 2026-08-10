import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssessmentPaper } from '../../../packages/assessment-core/src';
import * as currentContracts from '../shared/contracts';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

type CompareAndSwapQuery = {
  collection: 'assessments';
  filter: { _id: string; _openid: string; revision: number };
  update: {
    $set: Record<string, unknown>;
    $inc: { revision: 1 };
  };
};

type FutureContracts = typeof currentContracts & {
  updateAssessmentWithCompareAndSwap?: (
    persistence: {
      compareAndSwap(query: CompareAndSwapQuery): Promise<Record<string, unknown> | null>;
      getRevision(input: { id: string; openId: string }): Promise<number | null>;
    },
    record: Record<string, unknown>,
    input: Record<string, unknown>,
    context: unknown,
    now: string,
  ) => Promise<unknown>;
  createUserSettings?: (input: unknown, context: unknown, now: string) => unknown;
};

type TrustedContextRuntime = {
  getTrustedWeChatContext?: () => unknown;
};

const contracts = currentContracts as FutureContracts;
const databaseDirectory = join(__dirname, '..', 'database');
const securityRulesDirectory = join(databaseDirectory, 'security-rules');
const now = '2026-08-03T00:00:00.000Z';
const paper = {
  id: 'paper-1',
  topic: 'TypeScript',
  questionCount: 50,
  generatedAt: now,
  scoring: { maxScore: 100, levels: [] },
  questions: [],
} satisfies AssessmentPaper;

function readJsonIfPresent(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function loadTrustedContextRuntime(): TrustedContextRuntime {
  try {
    return require('../server/trustedContext') as TrustedContextRuntime;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return {};
    }
    throw error;
  }
}

describe('CloudBase deployable configuration', () => {
  test('declares the server-only daily quota counter collection and owner/day index', () => {
    const collections = readJsonIfPresent(join(databaseDirectory, 'collections.json')) as {
      collections?: Array<{ name?: string; required?: string[] }>;
    };
    const indexes = readJsonIfPresent(join(databaseDirectory, 'indexes.json')) as {
      indexes?: Array<{ collection?: string; name?: string; keys?: Array<{ field?: string; order?: number }> }>;
    };

    expect(collections.collections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'daily_generation_quotas',
        required: expect.arrayContaining(['_id', '_openid', 'utcDay', 'count']),
      }),
    ]));
    const reports = collections.collections?.find((collection) => collection.name === 'user_reports');
    expect(reports?.required).not.toContain('assessmentId');
    expect(indexes.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'daily_generation_quotas',
        name: 'owner_utc_day',
        keys: [
          { field: '_openid', order: 1 },
          { field: 'utcDay', order: 1 },
        ],
      }),
    ]));
    expect(readJsonIfPresent(join(securityRulesDirectory, 'daily_generation_quotas.json'))).toEqual({
      read: false,
      write: false,
    });
  });

  test('defines the generation API quota and idempotency query indexes', () => {
    const indexes = readJsonIfPresent(join(databaseDirectory, 'indexes.json')) as {
      indexes?: Array<{ name?: string; keys?: Array<{ field?: string; order?: number }> }>;
    };

    expect(indexes.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'owner_created_at',
        keys: [
          { field: '_openid', order: 1 },
          { field: 'createdAt', order: 1 },
        ],
      }),
      expect.objectContaining({
        name: 'owner_client_request_id',
        keys: [
          { field: '_openid', order: 1 },
          { field: 'clientRequestId', order: 1 },
        ],
      }),
    ]));
  });

  test('keeps each collection rule in a deployable top-level read/write file', () => {
    expect(readJsonIfPresent(join(securityRulesDirectory, 'generation_jobs.json'))).toEqual({
      read: 'doc._openid == auth.openid',
      write: false,
    });
    expect(readJsonIfPresent(join(securityRulesDirectory, 'assessments.json'))).toEqual({
      read: 'doc._openid == auth.openid',
      write: false,
    });
    expect(readJsonIfPresent(join(securityRulesDirectory, 'user_settings.json'))).toEqual({
      read: 'doc._openid == auth.openid',
      write: false,
    });
    expect(readJsonIfPresent(join(securityRulesDirectory, 'generation_rate_limits.json'))).toEqual({
      read: false,
      write: false,
    });
    expect(readJsonIfPresent(join(securityRulesDirectory, 'user_reports.json'))).toEqual({
      read: false,
      write: false,
    });
  });

  test('uses an environment-level deny-by-default function invoke policy', () => {
    expect(readJsonIfPresent(join(databaseDirectory, 'function-invoke-rules.json'))).toEqual({
      '*': { invoke: false },
      'create-generation-job': { invoke: 'auth != null' },
      'get-generation-job': { invoke: 'auth != null' },
      'update-assessment': { invoke: 'auth != null' },
      'get-assessment': { invoke: 'auth != null' },
      'list-assessments': { invoke: 'auth != null' },
      'complete-assessment': { invoke: 'auth != null' },
      'get-user-settings': { invoke: 'auth != null' },
      'update-user-settings': { invoke: 'auth != null' },
      'create-report': { invoke: 'auth != null' },
    });
  });

  test('declares report and rate-limit collections with deployable indexes', () => {
    const collections = readJsonIfPresent(join(databaseDirectory, 'collections.json')) as {
      collections?: Array<{ name?: string; required?: string[] }>;
    };
    const indexes = readJsonIfPresent(join(databaseDirectory, 'indexes.json')) as {
      indexes?: Array<{ collection?: string; name?: string; keys?: Array<{ field?: string; order?: number }> }>;
    };

    expect(collections.collections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'generation_rate_limits',
        required: expect.arrayContaining(['_id', '_openid', 'windowStartedAt', 'expiresAt', 'count']),
      }),
      expect.objectContaining({
        name: 'user_reports',
        required: expect.arrayContaining(['_id', '_openid', 'reason', 'policyVersion', 'status', 'createdAt']),
        properties: expect.objectContaining({ assessmentId: 'string?' }),
      }),
    ]));
    expect(indexes.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'generation_rate_limits',
        name: 'expires_at',
        keys: [{ field: 'expiresAt', order: 1 }],
      }),
      expect.objectContaining({
        collection: 'user_reports',
        name: 'owner_created_at',
        keys: [
          { field: '_openid', order: 1 },
          { field: 'createdAt', order: -1 },
        ],
      }),
    ]));
  });

  test('declares msgSecCheck OpenAPI permission only on client-triggered generation create', () => {
    expect(readJsonIfPresent(join(__dirname, '..', 'functions', 'create-generation-job', 'config.json'))).toEqual({
      permissions: { openapi: ['security.msgSecCheck'] },
    });
    expect(readJsonIfPresent(join(__dirname, '..', 'functions', 'generation-worker', 'config.json'))).toBeUndefined();
  });
});

describe('trusted CloudBase mutation contracts', () => {
  test('derives ownership only from the injected getWXContext boundary, not event OPENID', () => {
    const { createGenerationJob } = contracts;
    const { getTrustedWeChatContext } = loadTrustedContextRuntime();
    const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

    expect(getTrustedWeChatContext).toBeDefined();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'runtime-openid' });
    const trustedContext = getTrustedWeChatContext!();
    const event = { OPENID: 'spoofed-event-openid' };

    expect(createGenerationJob({
      id: 'job-1',
      request: { topic: 'TypeScript', questionCount: 50 },
      expiresAt: '2026-08-04T00:00:00.000Z',
      ...event,
    }, trustedContext as Parameters<typeof createGenerationJob>[1], now)).toMatchObject({
      _openid: 'runtime-openid',
    });
    expect(() => createGenerationJob({
      id: 'job-2',
      request: { topic: 'TypeScript', questionCount: 50 },
      expiresAt: '2026-08-04T00:00:00.000Z',
    }, event as unknown as Parameters<typeof createGenerationJob>[1], now)).toThrow('Trusted WeChat OPENID is required');
  });

  test('performs assessment persistence through an owner-and-revision compare-and-swap query', async () => {
    const { createAssessment, updateAssessmentWithCompareAndSwap } = contracts;
    const { getTrustedWeChatContext } = loadTrustedContextRuntime();
    const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

    expect(getTrustedWeChatContext).toBeDefined();
    expect(updateAssessmentWithCompareAndSwap).toBeDefined();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'runtime-openid' });
    const trustedContext = getTrustedWeChatContext!();
    let stored = createAssessment({
      id: 'assessment-1', paper, answers: {}, result: null, status: 'draft', completedAt: null,
    }, trustedContext as Parameters<typeof createAssessment>[1], now) as unknown as Record<string, unknown>;
    const persistence = {
      compareAndSwap: async (query: CompareAndSwapQuery) => {
        if (
          stored._id !== query.filter._id
          || stored._openid !== query.filter._openid
          || stored.revision !== query.filter.revision
        ) {
          return null;
        }
        stored = {
          ...stored,
          ...query.update.$set,
          revision: (stored.revision as number) + query.update.$inc.revision,
        };
        return stored;
      },
      getRevision: async () => stored.revision as number,
    };
    const first = updateAssessmentWithCompareAndSwap!(persistence, stored, {
      expectedRevision: 1,
      answers: { 'question-1': ['option-a'] },
      result: null,
      status: 'draft',
      completedAt: null,
    }, trustedContext, '2026-08-03T01:00:00.000Z');
    const second = updateAssessmentWithCompareAndSwap!(persistence, {
      ...stored,
      revision: 1,
      answers: {},
    }, {
      expectedRevision: 1,
      answers: { 'question-1': ['option-b'] },
      result: null,
      status: 'draft',
      completedAt: null,
    }, trustedContext, '2026-08-03T01:00:00.000Z');

    await expect(first).resolves.toMatchObject({ type: 'updated', record: { revision: 2 } });
    await expect(second).resolves.toEqual({ type: 'conflict', currentRevision: 2 });
    expect(stored).toMatchObject({ revision: 2, answers: { 'question-1': ['option-a'] } });
  });

  test('rejects arbitrary user settings fields before a server-only write', () => {
    const { createUserSettings } = contracts;
    const { getTrustedWeChatContext } = loadTrustedContextRuntime();
    const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

    expect(getTrustedWeChatContext).toBeDefined();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'runtime-openid' });
    const trustedContext = getTrustedWeChatContext!();
    expect(() => createUserSettings!({
      id: 'settings-1',
      locale: 'zh-CN',
      privacyConsentVersion: '2026-08',
      privacyConsentAt: null,
      providerApiKey: 'spoofed-value',
    }, trustedContext, now)).toThrow('Unsupported user settings field');
  });

  test('reprojects user settings updates so legacy provider fields are removed', () => {
    const { updateUserSettings } = contracts;
    const { getTrustedWeChatContext } = loadTrustedContextRuntime();
    const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

    expect(getTrustedWeChatContext).toBeDefined();
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'runtime-openid' });
    const trustedContext = getTrustedWeChatContext!();
    const updated = updateUserSettings({
      _id: 'settings-1',
      _openid: 'runtime-openid',
      schemaVersion: 1,
      locale: 'zh-CN',
      privacyConsentVersion: '2026-07',
      privacyConsentAt: null,
      createdAt: now,
      updatedAt: now,
      providerApiKey: 'legacy-secret',
      providerEndpoint: 'legacy-endpoint',
    } as Parameters<typeof updateUserSettings>[0], {
      locale: 'zh-CN',
      privacyConsentVersion: '2026-08',
      privacyConsentAt: null,
    }, trustedContext as Parameters<typeof updateUserSettings>[2], '2026-08-03T01:00:00.000Z');

    expect(updated).toEqual({
      _id: 'settings-1',
      _openid: 'runtime-openid',
      schemaVersion: 1,
      locale: 'zh-CN',
      privacyConsentVersion: '2026-08',
      privacyConsentAt: null,
      createdAt: now,
      updatedAt: '2026-08-03T01:00:00.000Z',
    });
  });
});
