import { findFirstUnansweredQuestionIndex } from '@dynamic-assessment/assessment-core';
import type {
  AssessmentCache,
  CachedAssessment,
  CachedCompletedAssessment,
  PendingAssessmentUpdate,
} from '../storage/assessmentCache';

export type AssessmentListResponse = {
  assessments: CachedAssessment[];
  nextCursor: string | null;
};

export type ReconcileInput = {
  localRecords: CachedAssessment[];
  cloudRecords: CachedAssessment[];
  pendingUpdates: PendingAssessmentUpdate[];
};

export type ReconcileResult = {
  records: CachedAssessment[];
  pendingUpdates: PendingAssessmentUpdate[];
  syncRequests: PendingAssessmentUpdate[];
};

export type HistoryRow = {
  id: string;
  topic: string;
  status: CachedAssessment['status'];
  statusLabel: string;
  updatedAt: string;
  updatedLabel: string;
  scoreLabel: string | null;
  progressLabel: string;
};

export type HistoryState = {
  rows: HistoryRow[];
  records: CachedAssessment[];
  status: 'idle' | 'ready' | 'refreshing' | 'offline' | 'error';
  nextCursor: string | null;
};

export type AssessmentOpenTarget =
  | { route: 'answer'; assessmentId: string; startIndex: number }
  | { route: 'result'; assessmentId: string };

export function reconcileAssessmentRecords(input: ReconcileInput): ReconcileResult {
  const localById = new Map(input.localRecords.map((record) => [record.id, record]));
  const cloudById = new Map(input.cloudRecords.map((record) => [record.id, record]));
  const pendingById = new Map(input.pendingUpdates.map((pending) => [pending.assessmentId, pending]));
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  const records: CachedAssessment[] = [];
  const pendingUpdates: PendingAssessmentUpdate[] = [];
  const syncRequests: PendingAssessmentUpdate[] = [];

  for (const id of ids) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    const pending = pendingById.get(id);

    if (cloud?.status === 'completed') {
      records.push(cloud);
      continue;
    }

    const chosen = chooseRecord(local, cloud);
    const pendingMerge = pending !== undefined && chosen?.status === 'draft'
      ? mergePendingDraft(chosen, local, pending)
      : null;

    if (pendingMerge !== null) {
      records.push(pendingMerge.record);
      pendingUpdates.push(pendingMerge.pending);
      syncRequests.push(pendingMerge.pending);
      continue;
    }

    if (chosen !== undefined) records.push(chosen);
    if (pending !== undefined) pendingUpdates.push(pending);
  }

  for (const pending of input.pendingUpdates) {
    if (!ids.has(pending.assessmentId)) pendingUpdates.push(pending);
  }

  return {
    records: sortRecords(records),
    pendingUpdates,
    syncRequests,
  };
}

export function createHistoryRows(records: CachedAssessment[]): HistoryRow[] {
  return sortRecords(records).map((record) => {
    const answeredCount = record.paper.questions.filter((question) => (record.answers[question.id]?.length ?? 0) > 0).length;
    return {
      id: record.id,
      topic: record.paper.topic,
      status: record.status,
      statusLabel: record.status === 'completed' ? '已完成' : '草稿',
      updatedAt: record.updatedAt,
      updatedLabel: formatUpdatedAt(record.updatedAt),
      scoreLabel: record.status === 'completed' ? `${record.result.score} 分` : null,
      progressLabel: `${answeredCount}/${record.paper.questions.length}`,
    };
  });
}

export function getAssessmentOpenTarget(record: CachedAssessment): AssessmentOpenTarget {
  if (record.status === 'completed') {
    return { route: 'result', assessmentId: record.id };
  }
  return {
    route: 'answer',
    assessmentId: record.id,
    startIndex: findFirstUnansweredQuestionIndex(record.paper as never, record.answers),
  };
}

export function getAssessmentRecordForOpen(
  historyRecord: CachedAssessment | undefined,
  cachedRecord: CachedAssessment | undefined,
): CachedAssessment | undefined {
  return chooseRecord(historyRecord, cachedRecord);
}

export function createHistoryController(dependencies: {
  cache: AssessmentCache;
  listAssessments(input: { cursor?: string | null; pageSize?: number }): Promise<AssessmentListResponse>;
  syncPendingUpdate?(update: PendingAssessmentUpdate): Promise<void>;
}) {
  let state: HistoryState = {
    rows: [],
    records: [],
    status: 'idle',
    nextCursor: null,
  };

  function setRecords(records: CachedAssessment[], status: HistoryState['status'], nextCursor = state.nextCursor): HistoryState {
    const sorted = sortRecords(records);
    state = {
      records: sorted,
      rows: createHistoryRows(sorted),
      status,
      nextCursor,
    };
    return state;
  }

  return {
    getState(): HistoryState {
      return state;
    },
    loadCached(): HistoryState {
      return setRecords(dependencies.cache.listAssessments(), 'ready', null);
    },
    async refreshFromCloud(cursor: string | null = null): Promise<HistoryState> {
      state = { ...state, status: 'refreshing' };
      try {
        const page = await dependencies.listAssessments({ cursor, pageSize: 20 });
        const reconciled = reconcileAssessmentRecords({
          localRecords: dependencies.cache.listAssessments(),
          cloudRecords: page.assessments,
          pendingUpdates: dependencies.cache.getPendingUpdates(),
        });
        dependencies.cache.saveAssessments(reconciled.records);
        dependencies.cache.savePendingUpdates(reconciled.pendingUpdates);
        await Promise.all(reconciled.syncRequests.map((update) => dependencies.syncPendingUpdate?.(update)));
        return setRecords(dependencies.cache.listAssessments(), 'ready', page.nextCursor);
      } catch {
        return setRecords(dependencies.cache.listAssessments(), state.records.length > 0 ? 'offline' : 'error', state.nextCursor);
      }
    },
  };
}

function mergePendingDraft(
  base: CachedAssessment,
  local: CachedAssessment | undefined,
  pending: PendingAssessmentUpdate,
): { record: CachedAssessment; pending: PendingAssessmentUpdate } | null {
  if (base.status !== 'draft') return null;
  const answers = { ...base.answers };
  for (const questionId of pending.changedQuestionIds) {
    answers[questionId] = pending.answers[questionId] ?? local?.answers[questionId] ?? [];
  }
  const record = { ...base, answers };
  return {
    record,
    pending: {
      ...pending,
      answers,
      expectedRevision: base.revision,
    },
  };
}

function chooseRecord(
  local: CachedAssessment | undefined,
  cloud: CachedAssessment | undefined,
): CachedAssessment | undefined {
  if (local === undefined) return cloud;
  if (cloud === undefined) return local;
  if (cloud.revision !== local.revision) return cloud.revision > local.revision ? cloud : local;
  return cloud.updatedAt >= local.updatedAt ? cloud : local;
}

function sortRecords(records: CachedAssessment[]): CachedAssessment[] {
  return [...records].sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
  ));
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function isCompletedAssessment(record: CachedAssessment): record is CachedCompletedAssessment {
  return record.status === 'completed';
}
