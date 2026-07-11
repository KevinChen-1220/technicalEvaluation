import type {
  AssessmentPaper,
  AssessmentResult,
  AssessmentSession,
  KnowledgePointResult,
  QuestionResult,
  ScoringLevel,
} from './types';

export function scoreAssessment(paper: AssessmentPaper, session: AssessmentSession): AssessmentResult {
  const questionResults: QuestionResult[] = paper.questions.map((question) => {
    const userOptionIds = normalizeIds(session.answers[question.id] ?? []);
    const correctOptionIds = normalizeIds(question.correctOptionIds);

    return {
      questionId: question.id,
      isCorrect: optionSetsEqual(userOptionIds, correctOptionIds),
      userOptionIds,
      correctOptionIds,
    };
  });

  const correctCount = questionResults.filter((result) => result.isCorrect).length;
  const totalQuestions = paper.questions.length;
  const accuracy = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  return {
    totalQuestions,
    correctCount,
    score: correctCount,
    accuracy,
    level: findLevel(paper.scoring.levels, accuracy),
    questionResults,
    knowledgePointResults: buildKnowledgePointResults(paper, questionResults),
    wrongQuestionIds: questionResults.filter((result) => !result.isCorrect).map((result) => result.questionId),
  };
}

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function optionSetsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function findLevel(levels: ScoringLevel[], accuracy: number): ScoringLevel {
  return (
    levels.find((level) => accuracy >= level.minPercent && accuracy <= level.maxPercent) ??
    levels[levels.length - 1] ?? {
      minPercent: 0,
      maxPercent: 100,
      title: 'Result',
      summary: 'No scoring level was provided.',
    }
  );
}

function buildKnowledgePointResults(paper: AssessmentPaper, questionResults: QuestionResult[]): KnowledgePointResult[] {
  const resultsById = new Map(questionResults.map((result) => [result.questionId, result]));
  const aggregate = new Map<string, { total: number; correct: number }>();

  for (const question of paper.questions) {
    const current = aggregate.get(question.knowledgePoint) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (resultsById.get(question.id)?.isCorrect) {
      current.correct += 1;
    }
    aggregate.set(question.knowledgePoint, current);
  }

  return [...aggregate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([knowledgePoint, value]) => ({
      knowledgePoint,
      total: value.total,
      correct: value.correct,
      accuracy: Math.round((value.correct / value.total) * 100),
    }));
}
