import { createCloudClient } from '../src/services/cloud';

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { cloud: { callFunction: jest.fn() } },
}));

describe('Mini Program cloud adapter', () => {
  test('rebuilds safe public payloads without owner or provider fields', async () => {
    const calls: Array<{ name: string; data: unknown }> = [];
    const client = createCloudClient(async (input) => {
      calls.push(input);
      if (input.name === 'create-generation-job') return { result: { jobId: 'job-1', status: 'queued' } };
      if (input.name === 'get-generation-job') return { result: { jobId: 'job-1', status: 'queued', progress: 0, retryable: false } };
      if (input.name === 'get-assessment') return { result: { type: 'not_found', errorCode: 'INVALID_REQUEST' } };
      return { result: { type: 'updated', revision: 2 } };
    });
    const unsafe = { OPENID: 'spoofed', owner: 'spoofed', provider: 'x', model: 'x', endpoint: 'http://x', apiKey: 'secret' };

    await client.createGenerationJob({ topic: 'TS', notes: 'types', questionCount: 50, ...unsafe });
    await client.getGenerationJob({ jobId: 'job-1', ...unsafe });
    await client.getAssessment({ assessmentId: 'assessment-1', ...unsafe });
    await client.updateAssessment({ assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1, ...unsafe });

    expect(calls).toEqual([
      { name: 'create-generation-job', data: { topic: 'TS', notes: 'types', questionCount: 50 } },
      { name: 'get-generation-job', data: { jobId: 'job-1' } },
      { name: 'get-assessment', data: { assessmentId: 'assessment-1' } },
      { name: 'update-assessment', data: { assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1 } },
    ]);
  });

  test('turns a safe cloud error response into a typed rejection', async () => {
    const client = createCloudClient(async () => ({ result: { errorCode: 'QUOTA_EXCEEDED' } }));

    await expect(client.createGenerationJob({ topic: 'TS', questionCount: 50 }))
      .rejects.toMatchObject({ errorCode: 'QUOTA_EXCEEDED' });
  });
});
