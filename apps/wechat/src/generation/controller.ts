import type { CachedAssessment } from '../storage/assessmentCache';
import type { CreateGenerationInput, GenerationJobStatus } from '../services/cloud';

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

export class GenerationController {
  private state: GenerationState = { status: 'idle', progress: 0 };
  private active = false;
  private runId = 0;

  constructor(private readonly dependencies: GenerationDependencies) {}

  getState(): GenerationState {
    return this.state;
  }

  async start(input: CreateGenerationInput): Promise<boolean> {
    if (this.active) return false;
    this.active = true;
    const currentRun = this.runId += 1;
    this.setState({ status: 'creating', progress: 0 });

    try {
      const job = await this.dependencies.createJob(input);
      if (!this.isCurrent(currentRun)) return true;
      this.setState({ status: 'polling', progress: 0, jobId: job.jobId });
      await this.poll(job.jobId, currentRun);
    } catch (error) {
      if (this.isCurrent(currentRun)) {
        this.setState({ status: 'failed', progress: this.state.progress, error: localizeError(error), retryable: true });
      }
    } finally {
      if (this.runId === currentRun) this.active = false;
    }
    return true;
  }

  retry(input: CreateGenerationInput): Promise<boolean> {
    return this.start(input);
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
    while (this.isCurrent(runId)) {
      const delay = pollIntervals[Math.min(attempt, pollIntervals.length - 1)] ?? 3000;
      await this.dependencies.sleep(delay);
      if (!this.isCurrent(runId)) return;
      const job = await this.dependencies.getJob(jobId);
      if (!this.isCurrent(runId)) return;
      if (job.status === 'failed') {
        this.setState({
          status: 'failed', jobId, progress: job.progress,
          error: localizeError(job.errorCode), retryable: job.retryable,
        });
        return;
      }
      if (job.status === 'completed' && job.assessmentId !== undefined) {
        const assessment = await this.dependencies.getAssessment(job.assessmentId);
        if (!this.isCurrent(runId)) return;
        this.dependencies.cacheAssessment(assessment);
        await this.dependencies.navigate(job.assessmentId);
        if (this.isCurrent(runId)) {
          this.setState({ status: 'completed', jobId, assessmentId: job.assessmentId, progress: 100 });
        }
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
}

function localizeError(error: unknown): string {
  const code = typeof error === 'string'
    ? error
    : typeof error === 'object' && error !== null && 'errorCode' in error
      ? String(error.errorCode)
      : '';
  if (code === 'QUOTA_EXCEEDED') return '今日生成次数已用完，请明天再试。';
  if (code === 'INVALID_REQUEST') return '生成参数无效，请检查后重试。';
  if (code === 'PROVIDER_ERROR') return '生成服务暂时不可用，请稍后重试。';
  if (code === 'INVALID_MODEL_RESPONSE') return '生成内容校验失败，请重新生成。';
  return '网络连接异常，请稍后重试。';
}
