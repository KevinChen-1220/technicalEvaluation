import type { UpdateAssessmentInput, UpdateAssessmentResponse } from '../services/cloud';
import type { AssessmentCache, CachedAssessment, PendingAssessmentUpdate } from '../storage/assessmentCache';
import { selectOption } from './selection';

export type AssessmentSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

type AssessmentSyncDependencies = {
  cache: AssessmentCache;
  updateAssessment(input: UpdateAssessmentInput): Promise<UpdateAssessmentResponse>;
};

export class AssessmentSyncQueue {
  private readonly active = new Map<string, Promise<void>>();
  private readonly statuses = new Map<string, AssessmentSyncStatus>();

  constructor(private readonly dependencies: AssessmentSyncDependencies) {}

  getStatus(assessmentId: string): AssessmentSyncStatus {
    return this.statuses.get(assessmentId) ?? 'idle';
  }

  recordSelection(assessmentId: string, questionId: string, optionId: string): {
    assessment: CachedAssessment;
    sync: Promise<void>;
  } {
    const assessment = this.dependencies.cache.getAssessment(assessmentId);
    if (assessment === undefined) throw new Error('Assessment is not cached.');
    if (assessment.status !== 'draft') throw new Error('Completed assessments cannot be changed.');
    const question = assessment.paper.questions.find((candidate) => candidate.id === questionId);
    if (question === undefined) throw new Error('Question does not exist.');
    if (!question.options.some((option) => option.id === optionId)) throw new Error('Option does not exist.');

    const updated: CachedAssessment = {
      ...assessment,
      updatedAt: new Date().toISOString(),
      answers: {
        ...assessment.answers,
        [questionId]: selectOption(question, assessment.answers[questionId] ?? [], optionId),
      },
    };
    this.dependencies.cache.saveAssessment(updated);
    this.enqueue(assessmentId, updated.answers, assessment.revision, questionId);

    return {
      assessment: updated,
      sync: Promise.resolve().then(() => this.process(assessmentId)),
    };
  }

  resume(assessmentId: string): Promise<void> {
    return this.process(assessmentId);
  }

  private enqueue(
    assessmentId: string,
    answers: Record<string, string[]>,
    expectedRevision: number,
    changedQuestionId: string,
  ): void {
    const pending = this.dependencies.cache.getPendingUpdates();
    const existing = pending.find((candidate) => candidate.assessmentId === assessmentId);
    const update: PendingAssessmentUpdate = existing === undefined
      ? {
          id: `assessment:${assessmentId}`,
          version: 1,
          assessmentId,
          answers,
          expectedRevision,
          changedQuestionIds: [changedQuestionId],
        }
      : {
          ...existing,
          version: pendingVersion(existing) + 1,
          answers,
          changedQuestionIds: [...new Set([...existing.changedQuestionIds, changedQuestionId])],
        };
    this.dependencies.cache.savePendingUpdates([
      ...pending.filter((candidate) => candidate.assessmentId !== assessmentId),
      update,
    ]);
  }

  private process(assessmentId: string): Promise<void> {
    const existing = this.active.get(assessmentId);
    if (existing !== undefined) return existing;

    const operation = this.drain(assessmentId).finally(() => {
      this.active.delete(assessmentId);
    });
    this.active.set(assessmentId, operation);
    return operation;
  }

  private async drain(assessmentId: string): Promise<void> {
    this.statuses.set(assessmentId, 'syncing');
    while (true) {
      const pending = this.dependencies.cache.getPendingUpdates();
      const item = pending.find((candidate) => candidate.assessmentId === assessmentId);
      if (item === undefined) {
        this.statuses.set(assessmentId, 'synced');
        return;
      }

      const cached = this.requireCached(assessmentId);
      if (item.expectedRevision !== cached.revision) {
        item.expectedRevision = cached.revision;
        item.answers = cached.answers;
        this.dependencies.cache.savePendingUpdates(pending);
      }

      try {
        const result = await this.dependencies.updateAssessment(toInput(item));
        if (result.type === 'conflict') {
          await this.retryConflict(item, result.current);
        } else {
          this.completeSentItem(item, result.revision);
        }
      } catch {
        this.statuses.set(assessmentId, 'offline');
        return;
      }
    }
  }

  private async retryConflict(
    item: PendingAssessmentUpdate,
    server: CachedAssessment,
  ): Promise<void> {
    if (server.status === 'completed') {
      this.dependencies.cache.saveAssessment(server);
      this.dependencies.cache.removePendingForAssessment(item.assessmentId);
      this.statuses.set(item.assessmentId, 'synced');
      return;
    }
    const answers = { ...server.answers };
    const local = this.requireCached(item.assessmentId);
    const currentPending = this.requirePending(item.assessmentId);
    for (const questionId of currentPending.changedQuestionIds) {
      answers[questionId] = local.answers[questionId] ?? [];
    }
    const merged = { ...server, answers };
    this.dependencies.cache.saveAssessment(merged);
    const retryItem = {
      ...currentPending,
      answers,
      expectedRevision: server.revision,
    };
    this.replacePending(retryItem);

    const retry = await this.dependencies.updateAssessment(toInput(retryItem));
    if (retry.type === 'conflict') throw new Error('Assessment changed again.');
    this.completeSentItem(retryItem, retry.revision);
  }

  private completeSentItem(item: PendingAssessmentUpdate, revision: number): void {
    const cached = this.requireCached(item.assessmentId);
    this.dependencies.cache.saveAssessment({ ...cached, revision });
    const current = this.dependencies.cache.getPendingUpdates()
      .find((candidate) => candidate.assessmentId === item.assessmentId);
    if (current === undefined) return;
    if (pendingVersion(current) === pendingVersion(item)) {
      this.removePending(item);
      return;
    }

    const answers = { ...item.answers };
    for (const questionId of current.changedQuestionIds) {
      answers[questionId] = cached.answers[questionId] ?? [];
    }
    this.dependencies.cache.savePendingUpdates(
      this.dependencies.cache.getPendingUpdates().map((candidate) => (
        candidate.assessmentId === item.assessmentId
          ? { ...current, answers, expectedRevision: revision }
          : candidate
      )),
    );
  }

  private replacePending(update: PendingAssessmentUpdate): void {
    this.dependencies.cache.savePendingUpdates(
      this.dependencies.cache.getPendingUpdates().map((candidate) => (
        candidate.assessmentId === update.assessmentId ? update : candidate
      )),
    );
  }

  private removePending(completed: PendingAssessmentUpdate): void {
    this.dependencies.cache.savePendingUpdates(
      this.dependencies.cache.getPendingUpdates().filter((candidate) => (
        candidate.assessmentId !== completed.assessmentId
        || pendingVersion(candidate) !== pendingVersion(completed)
      )),
    );
  }

  private requirePending(assessmentId: string): PendingAssessmentUpdate {
    const pending = this.dependencies.cache.getPendingUpdates()
      .find((candidate) => candidate.assessmentId === assessmentId);
    if (pending === undefined) throw new Error('Pending assessment update is missing.');
    return pending;
  }

  private requireCached(assessmentId: string): CachedAssessment {
    const assessment = this.dependencies.cache.getAssessment(assessmentId);
    if (assessment === undefined) throw new Error('Assessment is not cached.');
    return assessment;
  }
}

function pendingVersion(item: PendingAssessmentUpdate): number {
  return item.version ?? 1;
}

function toInput(item: PendingAssessmentUpdate): UpdateAssessmentInput {
  return {
    assessmentId: item.assessmentId,
    answers: item.answers,
    expectedRevision: item.expectedRevision,
  };
}
