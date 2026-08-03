import { GenerationController } from '../src/generation/controller';
import type { CachedAssessment } from '../src/storage/assessmentCache';

const request = { topic: 'TypeScript', notes: 'Generics', questionCount: 50 as const };

describe('GenerationController', () => {
  test('moves through creating and polling with bounded delays until completion', async () => {
    const states: string[] = [];
    const delays: number[] = [];
    const statuses = [
      { jobId: 'job-1', status: 'queued' as const, progress: 0, retryable: false },
      { jobId: 'job-1', status: 'running' as const, progress: 40, retryable: false },
      { jobId: 'job-1', status: 'running' as const, progress: 80, retryable: false },
      { jobId: 'job-1', status: 'running' as const, progress: 90, retryable: false },
      { jobId: 'job-1', status: 'completed' as const, progress: 100, retryable: false, assessmentId: 'assessment-1' },
    ];
    const controller = new GenerationController({
      createJob: async () => ({ jobId: 'job-1', status: 'queued' }),
      getJob: async () => statuses.shift()!,
      getAssessment: async () => assessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      onChange: (state) => states.push(state.status),
    });

    await expect(controller.start(request)).resolves.toBe(true);

    expect(states).toEqual(['creating', 'polling', 'polling', 'polling', 'polling', 'polling', 'completed']);
    expect(delays).toEqual([1000, 1500, 2000, 3000, 3000]);
    expect(controller.getState()).toMatchObject({ status: 'completed', progress: 100, assessmentId: 'assessment-1' });
  });

  test('prevents a duplicate create while active', async () => {
    let releaseCreate!: (value: { jobId: string; status: 'queued' }) => void;
    const createJob = jest.fn(() => new Promise<{ jobId: string; status: 'queued' }>((resolve) => {
      releaseCreate = resolve;
    }));
    const controller = new GenerationController({
      createJob,
      getJob: async () => ({ jobId: 'job-1', status: 'failed', progress: 0, retryable: true, errorCode: 'PROVIDER_ERROR' }),
      getAssessment: async () => assessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: async () => undefined,
    });

    const active = controller.start(request);
    await Promise.resolve();
    await expect(controller.start(request)).resolves.toBe(false);
    expect(createJob).toHaveBeenCalledTimes(1);
    releaseCreate({ jobId: 'job-1', status: 'queued' });
    await active;
  });

  test('cancellation stops local polling without changing the server job', async () => {
    let releaseSleep!: () => void;
    const getJob = jest.fn();
    const controller = new GenerationController({
      createJob: async () => ({ jobId: 'job-1', status: 'queued' }),
      getJob,
      getAssessment: async () => assessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: () => new Promise<void>((resolve) => { releaseSleep = resolve; }),
    });

    const active = controller.start(request);
    await Promise.resolve();
    await Promise.resolve();
    controller.cancel();
    releaseSleep();
    await active;

    expect(controller.getState().status).toBe('cancelled');
    expect(getJob).not.toHaveBeenCalled();
  });

  test('caches the persisted assessment before navigating', async () => {
    const events: string[] = [];
    const controller = new GenerationController({
      createJob: async () => ({ jobId: 'job-1', status: 'queued' }),
      getJob: async () => ({ jobId: 'job-1', status: 'completed', progress: 100, retryable: false, assessmentId: 'assessment-1' }),
      getAssessment: async () => { events.push('fetch'); return assessment; },
      cacheAssessment: () => { events.push('cache'); },
      navigate: async (assessmentId) => { events.push(`navigate:${assessmentId}`); },
      sleep: async () => undefined,
    });

    await controller.start(request);

    expect(events).toEqual(['fetch', 'cache', 'navigate:assessment-1']);
  });

  test('retry creates a new job and exposes a safe localized error', async () => {
    const createJob = jest.fn()
      .mockResolvedValueOnce({ jobId: 'job-1', status: 'queued' })
      .mockResolvedValueOnce({ jobId: 'job-2', status: 'queued' });
    const getJob = jest.fn()
      .mockResolvedValueOnce({ jobId: 'job-1', status: 'failed', progress: 10, retryable: true, errorCode: 'PROVIDER_ERROR' })
      .mockResolvedValueOnce({ jobId: 'job-2', status: 'completed', progress: 100, retryable: false, assessmentId: 'assessment-1' });
    const controller = new GenerationController({
      createJob,
      getJob,
      getAssessment: async () => assessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: async () => undefined,
    });

    await controller.start(request);
    expect(controller.getState()).toMatchObject({ status: 'failed', error: '生成服务暂时不可用，请稍后重试。' });
    await controller.retry(request);

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('completed');
  });

  test('fails immediately when a completed job has no persisted assessment id', async () => {
    const getJob = jest.fn()
      .mockResolvedValueOnce({ jobId: 'job-1', status: 'completed', progress: 100, retryable: false })
      .mockResolvedValueOnce({ jobId: 'job-1', status: 'failed', progress: 100, retryable: false });
    const getAssessment = jest.fn();
    const controller = new GenerationController({
      createJob: async () => ({ jobId: 'job-1', status: 'queued' }),
      getJob,
      getAssessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: async () => undefined,
    });

    await controller.start(request);

    expect(getJob).toHaveBeenCalledTimes(1);
    expect(getAssessment).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: 'failed', error: '生成结果不完整，请重新生成。', retryable: true,
    });
  });

  test('stops polling at the overall deadline', async () => {
    let elapsed = 0;
    const delays: number[] = [];
    const getJob = jest.fn(async () => ({
      jobId: 'job-1', status: 'running' as const, progress: 50, retryable: false,
    }));
    const controller = new GenerationController({
      createJob: async () => ({ jobId: 'job-1', status: 'queued' }),
      getJob,
      getAssessment: async () => assessment,
      cacheAssessment: () => undefined,
      navigate: async () => undefined,
      sleep: async (milliseconds) => { delays.push(milliseconds); elapsed += milliseconds; },
    }, {
      maxPollingDurationMs: 2500,
      now: () => elapsed,
    });

    await controller.start(request);

    expect(delays).toEqual([1000, 1500]);
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      status: 'failed', error: '生成等待超时，请重新生成。', retryable: true,
    });
  });
});

const assessment: CachedAssessment = {
  id: 'assessment-1',
  revision: 1,
  status: 'draft',
  answers: {},
  paper: {
    id: 'paper-1',
    topic: 'TypeScript',
    questionCount: 50,
    generatedAt: '2026-08-03T10:00:00.000Z',
    scoring: { maxScore: 100, levels: [] },
    questions: [],
  },
};
