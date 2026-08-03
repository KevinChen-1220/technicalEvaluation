export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type AssessmentOption = {
  id: string;
  text: string;
};

export type QuestionTextMaterial = {
  type: 'text';
  text: string;
};

export type QuestionImageMaterial = {
  type: 'image';
  uri: string;
  alt: string;
  caption?: string;
  aspectRatio?: number;
};

export type QuestionTableMaterial = {
  type: 'table';
  caption?: string;
  columns: string[];
  rows: string[][];
};

export type QuestionBarChartMaterial = {
  type: 'bar_chart';
  title?: string;
  unit?: string;
  items: Array<{
    label: string;
    value: number;
    displayValue?: string;
  }>;
};

export type QuestionMaterial =
  | QuestionTextMaterial
  | QuestionImageMaterial
  | QuestionTableMaterial
  | QuestionBarChartMaterial;

export type AssessmentQuestion = {
  id: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  knowledgePoint: string;
  prompt: string;
  options: AssessmentOption[];
  correctOptionIds: string[];
  explanation: string;
  materials?: QuestionMaterial[];
};

export type ScoringLevel = {
  minPercent: number;
  maxPercent: number;
  title: string;
  summary: string;
};

export type AssessmentPaper = {
  id: string;
  topic: string;
  questionCount: 50 | 100;
  generatedAt: string;
  scoring: {
    maxScore: number;
    levels: ScoringLevel[];
  };
  questions: AssessmentQuestion[];
};

export type AssessmentSession = {
  paperId: string;
  answers: Record<string, string[]>;
  submittedAt?: string;
};

export type KnowledgePointResult = {
  knowledgePoint: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type QuestionResult = {
  questionId: string;
  isCorrect: boolean;
  userOptionIds: string[];
  correctOptionIds: string[];
};

export type AssessmentResult = {
  totalQuestions: number;
  correctCount: number;
  score: number;
  accuracy: number;
  level: ScoringLevel;
  questionResults: QuestionResult[];
  knowledgePointResults: KnowledgePointResult[];
  wrongQuestionIds: string[];
};

export type AssessmentRecordStatus = 'draft' | 'completed';

export type PersistedAssessmentRecord = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult | null;
  status: AssessmentRecordStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};
