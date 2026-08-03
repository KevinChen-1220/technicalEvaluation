import type { UpdateAssessmentInput, UpdateAssessmentResponse } from '../services/cloud';
import type { AssessmentCache, CachedAssessment, PendingAssessmentUpdate } from '../storage/assessmentCache';
import { selectOption } from './selection';

export type AssessmentSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

type AssessmentSyncDependencies = {
  cache: AssessmentCache;
  updateAssessment(input: UpdateAssessmentInput): Promise<UpdateAssessmentResponse>;
};

let pendingSequence = 0;

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
      answers: {
        ...assessment.answers,
        [questionId]: selectOption(question, assessment.answers[questionId] ?? [], optionId),
      },
    };
    this.dependencies.cache.saveAssessment(updated);
    this.enqueue({
      id: `pending-${pendingSequence += 1}`,
      assessmentId,
      answers: updated.answers,
      expectedRevision: assessment.revision,
      changedQuestionIds: [questionId],
    });

    return {
      assessment: updated,
      sync: Promise.resolve().then(() => this.process(assessmentId)),
    };
  }

  resume(assessmentId: string): Promise<void> {
    return this.process(assessmentId);
  }

  private enqueue(update: PendingAssessmentUpdate): void {
    this.dependencies.cache.savePendingUpdates([
      ...this.dependencies.cache.getPendingUpdates(),
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
        this.dependencies.cache.savePendingUpdates(pending);
      }

      try {
        const result = await this.dependencies.updateAssessment(toInput(item));
        if (result.type === 'conflict') {
          await this.retryConflict(item, result.current);
        } else {
          this.applyRevision(assessmentId, result.revision);
        }
        this.removePending(item.id);
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
    const answers = { ...server.answers };
    const local = this.requireCached(item.assessmentId);
    const locallyChangedQuestionIds = new Set(
      this.dependencies.cache.getPendingUpdates()
        .filter((pending) => pending.assessmentId === item.assessmentId)
        .flatMap((pending) => pending.changedQuestionIds),
    );
    for (const questionId of locallyChangedQuestionIds) {
      answers[questionId] = local.answers[questionId] ?? [];
    }
    const merged = { ...server, answers };
    this.dependencies.cache.saveAssessment(merged);
    item.answers = answers;
    item.expectedRevision = server.revision;
    this.replacePending(item);

    const retry = await this.dependencies.updateAssessment(toInput(item));
    if (retry.type === 'conflict') throw new Error('Assessment changed again.');
    this.applyRevision(item.assessmentId, retry.revision);
  }

  private applyRevision(assessmentId: string, revision: number): void {
    const current = this.requireCached(assessmentId);
    this.dependencies.cache.saveAssessment({ ...current, revision });
  }

  private replacePending(update: PendingAssessmentUpdate): void {
    this.dependencies.cache.savePendingUpdates(
      this.dependencies.cache.getPendingUpdates().map((candidate) => (
        candidate.id === update.id ? update : candidate
      )),
    );
  }

  private removePending(pendingId: string): void {
    this.dependencies.cache.savePendingUpdates(
      this.dependencies.cache.getPendingUpdates().filter((candidate) => candidate.id !== pendingId),
    );
  }

  private requireCached(assessmentId: string): CachedAssessment {
    const assessment = this.dependencies.cache.getAssessment(assessmentId);
    if (assessment === undefined) throw new Error('Assessment is not cached.');
    return assessment;
  }
}

function toInput(item: PendingAssessmentUpdate): UpdateAssessmentInput {
  return {
    assessmentId: item.assessmentId,
    answers: item.answers,
    expectedRevision: item.expectedRevision,
  };
}
