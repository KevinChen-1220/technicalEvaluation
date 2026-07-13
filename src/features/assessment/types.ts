export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type AssessmentOption = {
  id: string;
  text: string;
};

export type AssessmentQuestion = {
  id: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  knowledgePoint: string;
  prompt: string;
  options: AssessmentOption[];
  correctOptionIds: string[];
  explanation: string;
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

export type AssessmentHistoryRecord = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult;
  submittedAt: string;
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
