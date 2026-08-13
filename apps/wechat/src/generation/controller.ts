import type { CachedAssessment } from '../storage/assessmentCache';
import type { CreateGenerationInput, GenerationJobStatus } from '../services/cloud';
import type { GenerationIntent, GenerationIntentStore } from '../storage/generationIntent';

export type GenerationState = {
  status: 'idle' | 'creating' | 'polling' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  jobId?: string;
  assessmentId?: string;
  error?: string;
  retryable?: boolean;
};

type GenerationDependencies = {
  createJob(input: CreateGenerationInput): Promise<{ jobId: string; status: GenerationJobStatus['status'] }>;
  getJob(jobId: string): Promise<GenerationJobStatus>;
  getAssessment(assessmentId: string): Promise<CachedAssessment>;
  cacheAssessment(assessment: CachedAssessment): void;
  navigate(assessmentId: string): Promise<void>;
  sleep(milliseconds: number): Promise<void>;
  onChange?(state: GenerationState): void;
};

const pollIntervals = [1000, 1500, 2000, 3000] as const;
const defaultMaxPollingDurationMs = 5 * 60 * 1000;

type GenerationControllerOptions = {
  maxPollingDurationMs?: number;
  now?: () => number;
  intentStore?: GenerationIntentStore;
  createRequestId?: () => string;
};

export class GenerationController {
  private state: GenerationState = { status: 'idle', progress: 0 };
  private active = false;
  private runId = 0;
  private retryRequiresNewAttempt = false;

  private readonly maxPollingDurationMs: number;
  private readonly now: () => number;
  private readonly intentStore: GenerationIntentStore;
  private readonly createRequestId: () => string;

  constructor(
    private readonly dependencies: GenerationDependencies,
    options: GenerationControllerOptions = {},
  ) {
    this.maxPollingDurationMs = options.maxPollingDurationMs ?? defaultMaxPollingDurationMs;
    this.now = options.now ?? Date.now;
    this.intentStore = options.intentStore ?? memoryIntentStore();
    this.createRequestId = options.createRequestId ?? defaultRequestId;
  }

  getState(): GenerationState {
    return this.state;
  }

  async start(input: CreateGenerationInput): Promise<boolean> {
    if (this.active) return false;
    const intent = newIntent(input, this.createRequestId());
    this.intentStore.save(intent);
    return this.createAndPoll(intent);
  }

  async retry(input: CreateGenerationInput): Promise<boolean> {
    if (this.active) return false;
    const persisted = this.intentStore.load();
    if (persisted === undefined || !sameInput(persisted.input, input)) return this.start(input);
    if (persisted.jobId === undefined) return this.createAndPoll(persisted, this.retryRequiresNewAttempt);
    if (this.state.status === 'failed' && this.state.retryable && this.retryRequiresNewAttempt) {
      return this.createAndPoll(persisted, true);
    }

    this.active = true;
    this.retryRequiresNewAttempt = false;
    const currentRun = this.runId += 1;
    this.setState({ status: 'polling', progress: this.state.progress, jobId: persisted.jobId });
    try {
      await this.poll(persisted.jobId, currentRun);
    } catch (error) {
      if (this.isCurrent(currentRun) && errorCode(error) === 'INCOMPLETE_JOB') {
        this.active = false;
        return this.createAndPoll(persisted);
      }
      if (this.isCurrent(currentRun)) this.fail(error);
    } finally {
      if (this.runId === currentRun) this.active = false;
    }
    return true;
  }

  async resumePending(): Promise<boolean> {
    const persisted = this.intentStore.load();
    if (persisted === undefined) return false;
    return this.retry(persisted.input);
  }

  private async createAndPoll(intent: GenerationIntent, retry = false): Promise<boolean> {
    this.active = true;
    const currentRun = this.runId += 1;
    this.setState({ status: 'creating', progress: 0 });

    try {
      const job = await this.dependencies.createJob({
        ...intent.input, clientRequestId: intent.clientRequestId, ...(retry ? { retry: true } : {}),
      });
      if (!this.isCurrent(currentRun)) return true;
      this.intentStore.save({ ...intent, jobId: job.jobId });
      this.setState({ status: 'polling', progress: 0, jobId: job.jobId });
      await this.poll(job.jobId, currentRun);
    } catch (error) {
      if (this.isCurrent(currentRun)) this.fail(error, isExplicitlyRetryable(error));
    } finally {
      if (this.runId === currentRun) this.active = false;
    }
    return true;
  }

  cancel(): void {
    if (!this.active) return;
    this.runId += 1;
    this.active = false;
    const { error: _error, ...state } = this.state;
    this.setState({ ...state, status: 'cancelled' });
  }

  private async poll(jobId: string, runId: number): Promise<void> {
    let attempt = 0;
    const startedAt = this.now();
    while (this.isCurrent(runId)) {
      const delay = pollIntervals[Math.min(attempt, pollIntervals.length - 1)] ?? 3000;
      await this.dependencies.sleep(delay);
      if (!this.isCurrent(runId)) return;
      const job = await this.dependencies.getJob(jobId);
      if (!this.isCurrent(runId)) return;
      if (job.status === 'failed') {
        this.retryRequiresNewAttempt = job.retryable;
        this.setState({
          status: 'failed', jobId, progress: job.progress,
          error: localizeError(job.errorCode), retryable: job.retryable,
        });
        return;
      }
      if (job.status === 'completed') {
        const assessmentId = job.assessmentId;
        if (assessmentId === undefined) {
          this.setState({
            status: 'failed', jobId, progress: job.progress,
            error: localizeError('INCOMPLETE_JOB'), retryable: true,
          });
          return;
        }
        const assessment = await this.dependencies.getAssessment(assessmentId);
        if (!this.isCurrent(runId)) return;
        this.dependencies.cacheAssessment(assessment);
        await this.dependencies.navigate(assessmentId);
        if (this.isCurrent(runId)) {
          this.setState({ status: 'completed', jobId, assessmentId, progress: 100 });
          this.intentStore.clear();
        }
        return;
      }
      if (this.now() - startedAt >= this.maxPollingDurationMs) {
        this.setState({
          status: 'failed', jobId, progress: job.progress,
          error: localizeError('POLLING_TIMEOUT'), retryable: true,
        });
        return;
      }
      this.setState({ status: 'polling', jobId, progress: job.progress });
      attempt += 1;
    }
  }

  private isCurrent(runId: number): boolean {
    return this.active && this.runId === runId;
  }

  private setState(state: GenerationState): void {
    this.state = state;
    this.dependencies.onChange?.(state);
  }

  private fail(error: unknown, retryRequiresNewAttempt = false): void {
    this.retryRequiresNewAttempt = retryRequiresNewAttempt;
    this.setState({
      status: 'failed',
      progress: this.state.progress,
      ...(this.state.jobId === undefined ? {} : { jobId: this.state.jobId }),
      error: localizeError(error),
      retryable: true,
    });
  }
}

function newIntent(input: CreateGenerationInput, clientRequestId: string): GenerationIntent {
  return {
    clientRequestId,
    input: {
      topic: input.topic,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
  };
}

function sameInput(left: GenerationIntent['input'], right: CreateGenerationInput): boolean {
  return left.topic === right.topic
    && left.notes === right.notes;
}

function defaultRequestId(): string {
  return `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function memoryIntentStore(): GenerationIntentStore {
  let value: GenerationIntent | undefined;
  return {
    load: () => value,
    save: (intent) => { value = intent; },
    clear: () => { value = undefined; },
  };
}

function localizeError(error: unknown): string {
  const code = errorCode(error);
  if (code === 'QUOTA_EXCEEDED' || code === 'FREE_TIER_LIMIT') return '免费生成额度已用完，请稍后再试。';
  if (code === 'GENERATION_DISABLED') return '生成服务暂时关闭，请稍后再试。';
  if (code === 'INVALID_REQUEST') return '生成参数无效，请检查后重试。';
  if (code === 'PROVIDER_ERROR') return '生成服务暂时不可用，请稍后重试。';
  if (code === 'INVALID_MODEL_RESPONSE') return '生成内容校验失败，请重新生成。';
  if (code === 'INCOMPLETE_JOB') return '生成结果不完整，请重新生成。';
  if (code === 'POLLING_TIMEOUT' || code === 'REQUEST_TIMEOUT') return '生成等待超时，请重新生成。';
  return '网络连接异常，请稍后重试。';
}

function errorCode(error: unknown): string {
  return typeof error === 'string'
    ? error
    : typeof error === 'object' && error !== null && 'errorCode' in error
      ? String(error.errorCode)
      : '';
}

function isExplicitlyRetryable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'retryable' in error
    && (error as { retryable?: unknown }).retryable === true;
}
