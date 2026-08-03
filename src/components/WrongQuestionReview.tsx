import { StyleSheet, Text, View } from 'react-native';
import type { WrongQuestionReviewItem, WrongQuestionReviewOption } from '../features/assessment/wrongQuestionReview';
import { formatDifficulty, zhCN } from '../i18n/zhCN';
import { theme } from '../theme';
import { QuestionMaterials } from './QuestionMaterials';

export function WrongQuestionReview({ item }: { item: WrongQuestionReviewItem }) {
  const correctAnswer = item.options
    .filter((option) => option.isCorrect)
    .map((option) => `${option.id}. ${option.text}`)
    .join('、');

  return (
    <View style={styles.review}>
      <Text style={styles.question}>{item.questionNumber}. {item.question.prompt}</Text>
      <Text style={styles.meta}>
        {formatDifficulty(item.question.difficulty)} · {item.question.knowledgePoint}
      </Text>
      <QuestionMaterials materials={item.question.materials} />
      <View style={styles.options}>
        {item.options.map((option) => <ReviewedOption key={option.id} option={option} />)}
      </View>
      {item.wasUnanswered ? <Text style={styles.unanswered}>{zhCN.result.unanswered}</Text> : null}
      <View style={styles.explanation}>
        <Text style={styles.explanationLabel}>{zhCN.result.correctAnswer}</Text>
        <Text style={styles.explanationText}>{correctAnswer}</Text>
        <Text style={styles.explanationLabel}>{zhCN.result.explanation}</Text>
        <Text style={styles.explanationText}>{item.question.explanation}</Text>
      </View>
    </View>
  );
}

function ReviewedOption({ option }: { option: WrongQuestionReviewOption }) {
  return (
    <View
      style={[
        styles.option,
        option.state === 'correct' ? styles.correctOption : null,
        option.state === 'selected_wrong' ? styles.wrongOption : null,
      ]}
    >
      <Text style={styles.optionText}>{option.id}. {option.text}</Text>
      <View style={styles.badges}>
        {option.isCorrect ? <Text style={[styles.badge, styles.correctBadge]}>{zhCN.result.correctOption}</Text> : null}
        {option.isSelected ? <Text style={[styles.badge, option.isCorrect ? styles.correctBadge : styles.wrongBadge]}>{zhCN.result.yourSelection}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  review: { borderBottomColor: theme.colors.border, borderBottomWidth: 1, gap: theme.spacing.md, paddingBottom: theme.spacing.lg },
  question: { color: theme.colors.ink, fontSize: 19, fontWeight: '800', lineHeight: 27 },
  meta: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  options: { gap: theme.spacing.sm },
  option: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  correctOption: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  wrongOption: { backgroundColor: '#FEE4E2', borderColor: theme.colors.danger },
  optionText: { color: theme.colors.ink, fontSize: 15, lineHeight: 22 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  badge: { borderRadius: theme.radius.pill, fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: theme.spacing.sm, paddingVertical: 3 },
  correctBadge: { backgroundColor: theme.colors.accent, color: theme.colors.surface },
  wrongBadge: { backgroundColor: theme.colors.danger, color: theme.colors.surface },
  unanswered: { color: theme.colors.danger, fontSize: 14, fontWeight: '800' },
  explanation: {
    backgroundColor: theme.colors.canvas,
    borderLeftColor: theme.colors.accent,
    borderLeftWidth: 4,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  explanationLabel: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
  explanationText: { color: theme.colors.ink, fontSize: 15, lineHeight: 22 },
});
