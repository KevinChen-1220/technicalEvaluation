import { buildResultViewModel } from '../src/services/result-view-model';
import { createReleaseFixtureCloudClient } from '../src/fixtures/releaseFixtureClient';

describe('release fixture cloud client', () => {
  test('returns the same fixture job for the same client request id', async () => {
    const client = createReleaseFixtureCloudClient({ now: () => '2026-08-10T08:00:00.000Z' });
    const input = { topic: '幂等', clientRequestId: 'request-1' };

    const first = await client.createGenerationJob(input);
    const second = await client.createGenerationJob({ ...input, topic: '重复提交不应创建新试卷' });

    expect(second).toEqual(first);
    await expect(client.listAssessments()).resolves.toMatchObject({ assessments: [expect.any(Object)] });
  });
  test('generates a deterministic 50 question draft with rich Mini Program edge cases', async () => {
    const client = createReleaseFixtureCloudClient({ now: () => '2026-08-10T08:00:00.000Z' });

    const created = await client.createGenerationJob({
      topic: '微信小程序发布候选验证',
      notes: '覆盖长题干、宽表格、柱状图、图片失败回退、单选和多选。',
    });
    const job = await client.getGenerationJob({ jobId: created.jobId });
    const result = await client.getAssessment({ assessmentId: job.assessmentId ?? '' });

    expect(job).toMatchObject({ status: 'completed', progress: 100, retryable: false });
    expect(result.type).toBe('found');
    if (result.type !== 'found') return;
    expect(result.assessment.status).toBe('draft');
    expect(result.assessment.paper.questions).toHaveLength(50);
    const firstQuestion = result.assessment.paper.questions[0];
    expect(firstQuestion).toBeDefined();
    expect(firstQuestion?.prompt.length).toBeGreaterThan(240);
    expect(result.assessment.paper.questions.some((question) => question.type === 'multiple_choice')).toBe(true);
    expect(result.assessment.paper.questions.some((question) => question.materials?.some((material) => material.type === 'table'))).toBe(true);
    expect(result.assessment.paper.questions.some((question) => question.materials?.some((material) => material.type === 'bar_chart'))).toBe(true);
    expect(result.assessment.paper.questions.some((question) => question.materials?.some((material) => material.type === 'image'))).toBe(true);
    expect(JSON.stringify(result.assessment.paper)).not.toMatch(/correctOptionIds|explanation/);
  });

  test('always creates 50-question drafts for new requests', async () => {
    const client = createReleaseFixtureCloudClient({ now: () => '2026-08-10T08:00:00.000Z' });
    const created = await client.createGenerationJob({
      topic: 'Release Candidate English Skill Check',
    });
    const job = await client.getGenerationJob({ jobId: created.jobId });
    const draft = await client.getAssessment({ assessmentId: job.assessmentId ?? '' });
    if (draft.type !== 'found') throw new Error('fixture assessment missing');

    const answers = Object.fromEntries(draft.assessment.paper.questions.map((question, index) => {
      const selected = question.options[index < 12 ? 1 : 0] ?? question.options[0];
      if (selected === undefined) throw new Error('fixture option missing');
      return [question.id, [selected.id]];
    }));
    const completed = await client.completeAssessment({
      assessmentId: draft.assessment.id,
      answers,
      expectedRevision: draft.assessment.revision,
    });

    expect(draft.assessment.paper.questions).toHaveLength(50);
    expect(completed.type).toBe('completed');
    if (completed.type !== 'completed') return;
    expect(completed.assessment.result.wrongQuestionIds.length).toBeGreaterThan(10);
    expect(buildResultViewModel(completed.assessment, 1).wrongQuestions).toHaveLength(10);
  });

  test('lists fixture drafts immediately for history and preserves local-only report/settings calls', async () => {
    const client = createReleaseFixtureCloudClient({ now: () => '2026-08-10T08:00:00.000Z' });
    await client.createGenerationJob({ topic: '历史记录烟测' });

    const history = await client.listAssessments({});
    const settings = await client.acceptPrivacyPolicy({ privacyPolicyVersion: '2026-08-10' });
    const report = await client.createReport({
      assessmentId: history.assessments[0]?.id ?? '',
      reason: 'other',
      policyVersion: '2026-08-10',
      detail: 'fixture smoke',
    });

    expect(history.summaries).toHaveLength(1);
    expect(history.summaries[0]).toMatchObject({ topic: '历史记录烟测', status: 'draft', questionCount: 50 });
    expect(settings.hasCurrentPrivacyConsent).toBe(true);
    expect(report.reportId).toMatch(/^fixture-report-/);
  });
});
