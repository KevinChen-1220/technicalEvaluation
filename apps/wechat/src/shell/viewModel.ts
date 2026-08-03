import { validateAssessmentPaper } from '@dynamic-assessment/assessment-core';

export type MiniProgramTabId = 'generate' | 'history' | 'settings';

export type MiniProgramShellState = {
  tabs: Array<{ id: MiniProgramTabId; label: string }>;
  generate: {
    title: string;
    topicLabel: string;
    topicPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    questionCountLabel: string;
    submitLabel: string;
  };
  history: {
    title: string;
    emptyMessage: string;
  };
  settings: {
    title: string;
    disclosure: string;
  };
};

const shellState: MiniProgramShellState = {
  tabs: [
    { id: 'generate', label: '生成' },
    { id: 'history', label: '历史' },
    { id: 'settings', label: '设置' },
  ],
  generate: {
    title: '生成测评',
    topicLabel: '测评主题',
    topicPlaceholder: '例如：后端架构能力',
    notesLabel: '补充说明',
    notesPlaceholder: '可选：补充考察重点',
    questionCountLabel: '题目数量',
    submitLabel: '生成测评',
  },
  history: {
    title: '历史测评',
    emptyMessage: '暂无历史测评记录',
  },
  settings: {
    title: '设置',
    disclosure: '隐私说明：测评内容会在生成时由服务处理，本小程序不在客户端保存模型服务配置。',
  },
};

export function createMiniProgramShellState(): MiniProgramShellState {
  return shellState;
}

export function normalizeQuestionCount(value: unknown): 50 | 100 {
  return value === 100 ? 100 : 50;
}

export const validateGeneratedAssessment = validateAssessmentPaper;
