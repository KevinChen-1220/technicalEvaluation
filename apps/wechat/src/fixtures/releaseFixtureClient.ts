import { scoreAssessment, type AssessmentPaper, type AssessmentQuestion } from '@dynamic-assessment/assessment-core';
import type {
  AcceptPrivacyPolicyInput,
  AssessmentSummary,
  CompleteAssessmentResponse,
  CreateGenerationInput,
  CreateReportInput,
  GenerationJobStatus,
  ListAssessmentsInput,
  UpdateAssessmentInput,
  UpdateAssessmentResponse,
  UserSettingsResponse,
} from '../services/cloud';
import type { CachedAssessment, CachedCompletedAssessment, CachedDraftAssessment } from '../storage/assessmentCache';

type FixtureOptions = {
  now?: () => string;
};

type StoredFixture = {
  job: GenerationJobStatus;
  fullPaper: AssessmentPaper;
  assessment: CachedAssessment;
};

const fixtureMarker = 'SKILLSCOPE_RELEASE_FIXTURE_MODE';

export function createReleaseFixtureCloudClient(options: FixtureOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const records = new Map<string, StoredFixture>();
  let sequence = 0;

  return {
    async createGenerationJob(input: CreateGenerationInput): Promise<{ jobId: string; status: GenerationJobStatus['status'] }> {
      sequence += 1;
      const createdAt = now();
      const assessmentId = `fixture-assessment-${sequence}-${input.questionCount}`;
      const jobId = `fixture-job-${sequence}`;
      const fullPaper = buildFixturePaper({
        id: `fixture-paper-${sequence}-${input.questionCount}`,
        topic: input.topic,
        questionCount: input.questionCount,
        generatedAt: createdAt,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      });
      const assessment: CachedDraftAssessment = {
        id: assessmentId,
        paper: redactPaper(fullPaper),
        answers: {},
        revision: 1,
        status: 'draft',
        result: null,
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
      };
      const job: GenerationJobStatus = {
        jobId,
        status: 'completed',
        progress: 100,
        retryable: false,
        assessmentId,
      };
      records.set(assessmentId, { job, fullPaper, assessment });
      return { jobId, status: 'completed' };
    },
    async getGenerationJob(input: { jobId: string }): Promise<GenerationJobStatus> {
      const record = [...records.values()].find((candidate) => candidate.job.jobId === input.jobId);
      if (record === undefined) {
        return { jobId: input.jobId, status: 'failed', progress: 100, retryable: true, errorCode: 'INVALID_REQUEST' };
      }
      return record.job;
    },
    async getAssessment(input: { assessmentId: string }): Promise<
      | { type: 'found'; assessment: CachedAssessment }
      | { type: 'not_found'; errorCode: 'INVALID_REQUEST' }
    > {
      const record = records.get(input.assessmentId);
      if (record === undefined) return { type: 'not_found', errorCode: 'INVALID_REQUEST' };
      return { type: 'found', assessment: record.assessment };
    },
    async updateAssessment(input: UpdateAssessmentInput): Promise<UpdateAssessmentResponse> {
      const record = records.get(input.assessmentId);
      if (record === undefined) throw createFixtureError('INVALID_REQUEST');
      if (record.assessment.revision !== input.expectedRevision) {
        return { type: 'conflict', current: record.assessment };
      }
      record.assessment = {
        ...record.assessment,
        answers: input.answers,
        revision: input.expectedRevision + 1,
        updatedAt: now(),
      } as CachedAssessment;
      return { type: 'updated', revision: record.assessment.revision };
    },
    async listAssessments(_input: ListAssessmentsInput = {}): Promise<{
      type: 'listed';
      summaries: AssessmentSummary[];
      assessments: CachedAssessment[];
      nextCursor: string | null;
    }> {
      const assessments = [...records.values()]
        .map((record) => record.assessment)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return {
        type: 'listed',
        summaries: assessments.map(toSummary),
        assessments,
        nextCursor: null,
      };
    },
    async completeAssessment(input: UpdateAssessmentInput): Promise<CompleteAssessmentResponse> {
      const record = records.get(input.assessmentId);
      if (record === undefined) return { type: 'not_found', errorCode: 'INVALID_REQUEST' };
      if (record.assessment.revision !== input.expectedRevision) {
        return { type: 'conflict', current: record.assessment };
      }
      const completedAt = now();
      const completed: CachedCompletedAssessment = {
        id: record.assessment.id,
        paper: record.fullPaper,
        answers: input.answers,
        revision: input.expectedRevision + 1,
        status: 'completed',
        result: scoreAssessment(record.fullPaper, { paperId: record.fullPaper.id, answers: input.answers, submittedAt: completedAt }),
        createdAt: record.assessment.createdAt,
        updatedAt: completedAt,
        completedAt,
      };
      record.assessment = completed;
      return { type: 'completed', assessment: completed };
    },
    async getUserSettings(): Promise<UserSettingsResponse> {
      return {
        type: 'found',
        settings: {
          privacyPolicyVersion: '2026-08-10',
          privacyConsentAt: now(),
          hasCurrentPrivacyConsent: true,
        },
      };
    },
    async acceptPrivacyPolicy(input: AcceptPrivacyPolicyInput): Promise<Extract<UserSettingsResponse, { type: 'found' }>['settings']> {
      return {
        privacyPolicyVersion: input.privacyPolicyVersion,
        privacyConsentAt: now(),
        hasCurrentPrivacyConsent: true,
      };
    },
    async createReport(_input: CreateReportInput): Promise<{ type: 'created'; reportId: string }> {
      sequence += 1;
      return { type: 'created', reportId: `fixture-report-${sequence}` };
    },
    fixtureMarker,
  };
}

function buildFixturePaper(input: {
  id: string;
  topic: string;
  notes?: string;
  questionCount: 50 | 100;
  generatedAt: string;
}): AssessmentPaper {
  const english = /^[\x00-\x7F\s.,:;!?'"()/_-]+$/.test(input.topic);
  return {
    id: input.id,
    topic: input.topic,
    questionCount: input.questionCount,
    generatedAt: input.generatedAt,
    scoring: {
      maxScore: input.questionCount,
      levels: [
        { minPercent: 0, maxPercent: 59, title: english ? 'Needs practice' : '需要巩固', summary: english ? 'Focus on fundamentals.' : '建议先补齐基础概念。' },
        { minPercent: 60, maxPercent: 84, title: english ? 'Ready' : '基本胜任', summary: english ? 'Core knowledge is usable.' : '核心知识已经可以应用。' },
        { minPercent: 85, maxPercent: 100, title: english ? 'Strong' : '熟练掌握', summary: english ? 'You can handle release work confidently.' : '可以较稳定地处理发布级任务。' },
      ],
    },
    questions: Array.from({ length: input.questionCount }, (_, index) => buildFixtureQuestion(index, english, input.notes)),
  };
}

function buildFixtureQuestion(index: number, english: boolean, notes: string | undefined): AssessmentQuestion {
  const number = index + 1;
  const multiple = number % 5 === 0;
  const truthy = !multiple && number % 7 === 0;
  const options = truthy
    ? [{ id: 'a', text: english ? 'True' : '正确' }, { id: 'b', text: english ? 'False' : '错误' }]
    : [
        { id: 'a', text: english ? 'Use a server-side CloudBase function boundary.' : '使用服务端 CloudBase 函数边界。' },
        { id: 'b', text: english ? 'Store the model key in Mini Program settings.' : '把模型密钥放进小程序设置页。' },
        { id: 'c', text: english ? 'Persist drafts before opening the answer screen.' : '进入答题页前先保存草稿。' },
        { id: 'd', text: english ? 'Disable privacy disclosure for preview builds.' : '预览版关闭隐私披露。' },
      ];
  const basePrompt = english
    ? `Release fixture question ${number}: choose the behavior that keeps a Mini Program assessment safe during generation, answer caching, history replay, and compliance review.`
    : `发布候选烟测题 ${number}：请选择在生成、答题缓存、历史恢复和合规审核中保持技能测评小程序可靠的做法。`;
  const prompt = index === 0
    ? `${basePrompt} ${english ? 'This deliberately long prompt checks wrapping, keyboard-safe page scroll, and stable answer-card layout across narrow iPhone viewports.' : '这是一段特意加长的题干，用来检查窄屏 iPhone 视口里的换行、键盘避让和答题卡稳定排版。'} ${notes ?? ''}`.repeat(3)
    : basePrompt;
  const materials = buildMaterials(index, english);
  return {
    id: `fixture-q-${number}`,
    type: multiple ? 'multiple_choice' : truthy ? 'true_false' : 'single_choice',
    difficulty: number % 3 === 0 ? 'hard' : number % 2 === 0 ? 'medium' : 'easy',
    knowledgePoint: english ? `Release area ${((number - 1) % 6) + 1}` : `发布能力域 ${((number - 1) % 6) + 1}`,
    prompt,
    options,
    correctOptionIds: multiple ? ['a', 'c'] : ['a'],
    explanation: english
      ? `Question ${number} checks the release candidate path without using model secrets.`
      : `第 ${number} 题用于验证不依赖模型密钥的发布候选路径。`,
    ...(materials === undefined ? {} : { materials }),
  };
}

function buildMaterials(index: number, english: boolean): AssessmentQuestion['materials'] {
  if (index === 0) {
    return [{
      type: 'text',
      text: english
        ? 'Fixture text block: user consent, generation, draft sync, resume, submit, result review.'
        : 'Fixture 文本材料：隐私同意、生成、草稿同步、恢复、提交、结果复盘。',
    }];
  }
  if (index === 1) {
    return [{
      type: 'table',
      caption: english ? 'Wide release checklist' : '宽表格发布清单',
      columns: ['Step', 'Owner', 'Input', 'Output', 'Risk', 'Mitigation', 'Status', 'Evidence'],
      rows: [
        ['Build', 'Dev', 'Source', 'dist', 'Secret leak', 'Scan', 'Ready', 'hash'],
        ['Review', 'Ops', 'Disclosure', 'Approval', 'Placeholder', 'Gate', 'Blocked', 'filing'],
      ],
    }];
  }
  if (index === 2) {
    return [{
      type: 'bar_chart',
      title: english ? 'Smoke coverage' : '烟测覆盖',
      unit: '%',
      items: [
        { label: english ? 'Generate' : '生成', value: 100, displayValue: '100%' },
        { label: english ? 'History' : '历史', value: 90, displayValue: '90%' },
        { label: english ? 'Result' : '结果', value: 95, displayValue: '95%' },
      ],
    }];
  }
  if (index === 3) {
    return [{
      type: 'image',
      uri: 'https://example.invalid/skill-scope-release-fixture.png',
      alt: english ? 'Unavailable fixture image' : '不可用的 fixture 图片',
      caption: english ? 'This HTTPS image intentionally exercises fallback rendering.' : '这个 HTTPS 图片故意用于验证失败回退。',
      aspectRatio: 1.6,
    }];
  }
  return undefined;
}

function redactPaper(paper: AssessmentPaper): CachedDraftAssessment['paper'] {
  return {
    ...paper,
    questions: paper.questions.map(({ correctOptionIds: _correctOptionIds, explanation: _explanation, ...question }) => question),
  };
}

function toSummary(assessment: CachedAssessment): AssessmentSummary {
  const answeredCount = assessment.paper.questions
    .filter((question) => (assessment.answers[question.id]?.length ?? 0) > 0)
    .length;
  return {
    id: assessment.id,
    topic: assessment.paper.topic,
    status: assessment.status,
    questionCount: assessment.paper.questionCount,
    answeredCount,
    revision: assessment.revision,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    completedAt: assessment.completedAt,
    score: assessment.result?.score ?? null,
    correctCount: assessment.result?.correctCount ?? null,
    accuracy: assessment.result?.accuracy ?? null,
  };
}

function createFixtureError(errorCode: string): Error & { errorCode: string } {
  const error = new Error('Release fixture request failed.') as Error & { errorCode: string };
  error.errorCode = errorCode;
  return error;
}
