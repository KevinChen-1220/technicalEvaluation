import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  completeAssessment,
  createAssessmentDraft,
  listAssessmentRecords,
  updateAssessmentAnswers,
} from './src/features/assessment/assessmentRepository';
import { defaultAssessmentBrief } from './src/features/assessment/assessmentBriefDefaults';
import { generateAssessment } from './src/features/assessment/generator';
import { migrateLegacyAssessmentHistory } from './src/features/assessment/legacyHistoryMigration';
import { scoreAssessment } from './src/features/assessment/scoring';
import type { AssessmentPaper, AssessmentQuestion, AssessmentResult, PersistedAssessmentRecord } from './src/features/assessment/types';
import { loadModelConfig, saveModelConfig } from './src/features/config/secureConfigStore';
import { type ModelConfig, validateModelConfig } from './src/features/config/modelConfig';
import {
  formatChineseDate,
  formatDifficulty,
  formatHistoryStatus,
  formatQuestionProgress,
  localizeErrorMessage,
  zhCN,
} from './src/i18n/zhCN';
import { createChatCompletion } from './src/services/aiClient';
import { LoadingDots } from './src/components/LoadingDots';
import { shouldDimButton } from './src/components/loadingAnimation';
import { ScreenScroll } from './src/components/ScreenScroll';
import { theme } from './src/theme';

type MainTab = 'assess' | 'history' | 'settings';
type Screen = 'main' | 'answer' | 'result' | 'review';
type ResultMode = 'current' | 'history';

const emptyConfig: ModelConfig = { baseUrl: '', apiKey: '', model: '' };

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('main');
  const [activeTab, setActiveTab] = useState<MainTab>('assess');
  const [config, setConfig] = useState<ModelConfig>(emptyConfig);
  const [topic, setTopic] = useState(defaultAssessmentBrief.topic);
  const [notes, setNotes] = useState(defaultAssessmentBrief.notes);
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);
  const [paper, setPaper] = useState<AssessmentPaper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>('current');
  const [history, setHistory] = useState<PersistedAssessmentRecord[]>([]);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [reviewQuestionId, setReviewQuestionId] = useState<string | null>(null);

  useEffect(() => {
    loadModelConfig().then((saved) => {
      if (saved) setConfig(saved);
    });
    refreshHistory();
  }, []);

  const currentQuestion = paper?.questions[questionIndex];
  const reviewQuestion = paper?.questions.find((question) => question.id === reviewQuestionId) ?? paper?.questions[0];
  const configIsReady = validateModelConfig(config).ok;

  async function handleSaveConfig() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert(zhCN.alerts.configAttention, validation.errors.map(localizeErrorMessage).join('\n'));
      return;
    }
    await saveModelConfig(config);
    Alert.alert(zhCN.alerts.configSaved, zhCN.alerts.configSavedDetail);
  }

  async function handleTestConnection() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert(zhCN.alerts.configRequired, validation.errors.map(localizeErrorMessage).join('\n'));
      return;
    }

    setIsTesting(true);
    try {
      await createChatCompletion(config, [
        { role: 'system', content: '只回复 OK。' },
        { role: 'user', content: '连接测试。' },
      ]);
      Alert.alert(zhCN.alerts.connectionWorks, zhCN.alerts.connectionWorksDetail);
    } catch (error) {
      Alert.alert(
        zhCN.alerts.connectionFailed,
        error instanceof Error ? localizeErrorMessage(error.message) : zhCN.alerts.unknownConnectionError,
      );
    } finally {
      setIsTesting(false);
    }
  }

  async function handleGenerate() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert(zhCN.alerts.configRequired, validation.errors.map(localizeErrorMessage).join('\n'));
      setActiveTab('settings');
      return;
    }
    if (!topic.trim()) {
      Alert.alert(zhCN.alerts.topicRequired, zhCN.alerts.topicRequiredDetail);
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const generated = await generateAssessment({ topic, questionCount, notes }, config);
      await beginAssessment(generated);
    } catch (error) {
      const message = error instanceof Error ? localizeErrorMessage(error.message) : zhCN.alerts.unknownGenerationError;
      setGenerationError(questionCount === 100 ? `${message} ${zhCN.alerts.truncatedHint}` : message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function beginAssessment(nextPaper: AssessmentPaper) {
    setPaper(nextPaper);
    setAnswers({});
    setResult(null);
    setResultMode('current');
    setQuestionIndex(0);
    setReviewQuestionId(null);

    try {
      const draft = await createAssessmentDraft({ paper: nextPaper });
      setCurrentRecordId(draft.id);
      setHistory(await listAssessmentRecords());
    } catch {
      setCurrentRecordId(null);
      Alert.alert(zhCN.alerts.draftNotSaved, zhCN.alerts.draftNotSavedDetail);
    }
    setScreen('answer');
  }

  function toggleAnswer(optionId: string) {
    if (!currentQuestion) return;

    setAnswers((previous) => {
      const current = previous[currentQuestion.id] ?? [];
      const next =
        currentQuestion.type === 'multiple_choice'
          ? current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId]
          : [optionId];
      const nextAnswers = { ...previous, [currentQuestion.id]: next };

      void persistCurrentAnswers(nextAnswers);

      return nextAnswers;
    });
  }

  async function submitAnswers() {
    if (!paper) return;

    const unanswered = paper.questions.filter((question) => !answers[question.id]?.length);
    if (unanswered.length > 0) {
      Alert.alert(zhCN.alerts.unanswered, zhCN.alerts.unansweredDetail(unanswered.length));
      return;
    }

    const submittedAt = new Date().toISOString();
    const nextResult = scoreAssessment(paper, { paperId: paper.id, answers, submittedAt });

    setResult(nextResult);
    setResultMode('current');
    setScreen('result');

    try {
      const recordId = currentRecordId ?? (await createAssessmentDraft({ paper })).id;
      setCurrentRecordId(recordId);
      await completeAssessment({ id: recordId, answers, result: nextResult, submittedAt });
      setHistory(await listAssessmentRecords());
    } catch {
      Alert.alert(zhCN.alerts.historyNotSaved, zhCN.alerts.historyNotSavedDetail);
    }
  }

  function openHistoryRecord(record: PersistedAssessmentRecord) {
    setPaper(record.paper);
    setAnswers(record.answers);
    setResult(record.result);
    setResultMode(record.status === 'completed' ? 'history' : 'current');
    setQuestionIndex(0);
    setReviewQuestionId(null);
    setCurrentRecordId(record.id);
    setActiveTab('history');
    setScreen(record.status === 'completed' && record.result ? 'result' : 'answer');
  }

  function closeResult() {
    setScreen('main');
    setActiveTab(resultMode === 'history' ? 'history' : 'assess');
  }

  async function refreshHistory() {
    await migrateLegacyAssessmentHistory();
    setHistory(await listAssessmentRecords());
  }

  async function persistCurrentAnswers(nextAnswers: Record<string, string[]>) {
    if (!currentRecordId) {
      return;
    }

    try {
      await updateAssessmentAnswers({ id: currentRecordId, answers: nextAnswers });
      setHistory(await listAssessmentRecords());
    } catch {
      Alert.alert(zhCN.alerts.answerNotSaved, zhCN.alerts.answerNotSavedDetail);
    }
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      {screen === 'main' ? (
        <View style={styles.appShell}>
          <ScreenScroll hasTabs>
            {activeTab === 'assess' ? (
              <View style={styles.stack}>
                <View style={styles.header}>
                  <Text style={styles.kicker}>SkillScope</Text>
                  <Text style={styles.title}>{zhCN.assess.title}</Text>
                  <Text style={styles.notice}>{zhCN.assess.notice}</Text>
                </View>

                <Section title={zhCN.assess.section}>
                  <View style={styles.configStatus}>
                    <View style={styles.configText}>
                      <Text style={styles.label}>{zhCN.assess.provider}</Text>
                      <Text style={styles.notice}>
                        {configIsReady ? zhCN.assess.configured(config.model) : zhCN.assess.configureProvider}
                      </Text>
                    </View>
                    <Button label={zhCN.assess.settings} onPress={() => setActiveTab('settings')} tone="secondary" />
                  </View>
                  <Input label={zhCN.assess.topic} value={topic} onChangeText={setTopic} placeholder={zhCN.assess.topicPlaceholder} />
                  <Input label={zhCN.assess.notes} value={notes} onChangeText={setNotes} placeholder={zhCN.assess.notesPlaceholder} multiline />
                  <View style={styles.segment}>
                    <Chip label="50" active={questionCount === 50} onPress={() => setQuestionCount(50)} />
                    <Chip label="100" active={questionCount === 100} onPress={() => setQuestionCount(100)} />
                  </View>
                  {generationError ? <Text style={styles.error}>{generationError}</Text> : null}
                  <Button
                    label={isGenerating ? zhCN.assess.generating : zhCN.assess.generate}
                    onPress={handleGenerate}
                    disabled={isGenerating}
                    loading={isGenerating}
                  />
                </Section>
              </View>
            ) : null}

            {activeTab === 'history' ? (
              <View style={styles.stack}>
                <View style={styles.header}>
                  <Text style={styles.kicker}>{zhCN.history.kicker}</Text>
                  <Text style={styles.title}>{zhCN.history.title}</Text>
                  <Text style={styles.notice}>{zhCN.history.notice}</Text>
                </View>

                <Section title={zhCN.history.section}>
                  {history.length === 0 ? <Text style={styles.notice}>{zhCN.history.empty}</Text> : null}
                  {history.map((record) => (
                    <HistoryRow key={record.id} record={record} onPress={() => openHistoryRecord(record)} />
                  ))}
                </Section>
              </View>
            ) : null}

            {activeTab === 'settings' ? (
              <View style={styles.stack}>
                <View style={styles.header}>
                  <Text style={styles.kicker}>{zhCN.settings.kicker}</Text>
                  <Text style={styles.title}>{zhCN.settings.title}</Text>
                  <Text style={styles.notice}>{zhCN.settings.notice}</Text>
                </View>

                <Section title={zhCN.settings.section}>
                  <Input
                    label={zhCN.settings.baseUrl}
                    value={config.baseUrl}
                    onChangeText={(baseUrl) => setConfig((value) => ({ ...value, baseUrl }))}
                    placeholder="https://api.openai.com/v1"
                  />
                  <Input
                    label={zhCN.settings.apiKey}
                    value={config.apiKey}
                    onChangeText={(apiKey) => setConfig((value) => ({ ...value, apiKey }))}
                    placeholder="sk-..."
                    secureTextEntry
                  />
                  <Input
                    label={zhCN.settings.model}
                    value={config.model}
                    onChangeText={(model) => setConfig((value) => ({ ...value, model }))}
                    placeholder="gpt-4.1-mini"
                  />
                  <View style={styles.row}>
                    <Button label={zhCN.settings.save} onPress={handleSaveConfig} />
                    <Button label={isTesting ? zhCN.settings.testing : zhCN.settings.test} onPress={handleTestConnection} tone="secondary" disabled={isTesting} />
                  </View>
                </Section>
              </View>
            ) : null}
          </ScreenScroll>
          <TabBar activeTab={activeTab} bottom={insets.bottom} onChange={setActiveTab} />
        </View>
      ) : null}

      {screen === 'answer' && paper && currentQuestion ? (
        <ScreenScroll>
          <View style={styles.stack}>
            <Text style={styles.kicker}>{paper.topic}</Text>
            <Text style={styles.progress}>
              {formatQuestionProgress(questionIndex + 1, paper.questions.length)}
            </Text>
            <Text style={styles.question}>
              {questionIndex + 1}. {currentQuestion.prompt}
            </Text>
            <Text style={styles.questionMeta}>
              {formatDifficulty(currentQuestion.difficulty)} · {currentQuestion.knowledgePoint}
            </Text>
            <View style={styles.stack}>
              {currentQuestion.options.map((option) => {
                const active = answers[currentQuestion.id]?.includes(option.id) ?? false;
                return <Option key={option.id} label={`${option.id}. ${option.text}`} active={active} onPress={() => toggleAnswer(option.id)} />;
              })}
            </View>
            <View style={styles.row}>
              <Button label={zhCN.answer.previous} onPress={() => setQuestionIndex((index) => Math.max(0, index - 1))} tone="secondary" disabled={questionIndex === 0} />
              {questionIndex === paper.questions.length - 1 ? (
                <Button label={zhCN.answer.submit} onPress={submitAnswers} />
              ) : (
                <Button label={zhCN.answer.next} onPress={() => setQuestionIndex((index) => Math.min(paper.questions.length - 1, index + 1))} />
              )}
            </View>
            <Button label={zhCN.answer.exit} onPress={() => setScreen('main')} tone="secondary" />
          </View>
        </ScreenScroll>
      ) : null}

      {screen === 'result' && paper && result ? (
        <ScreenScroll>
          <View style={styles.stack}>
            <Text style={styles.kicker}>{resultMode === 'history' ? zhCN.result.history : zhCN.result.current}</Text>
            <Text style={styles.title}>{result.level.title}</Text>
            <Text style={styles.score}>
              {result.score}/{result.totalQuestions} / {result.accuracy}%
            </Text>
            <Text style={styles.notice}>{result.level.summary}</Text>
            <Section title={zhCN.result.knowledgePoints}>
              {result.knowledgePointResults.map((item) => (
                <Text key={item.knowledgePoint} style={styles.metric}>
                  {item.knowledgePoint}: {item.correct}/{item.total} ({item.accuracy}%)
                </Text>
              ))}
            </Section>
            <Section title={zhCN.result.wrongQuestions(result.wrongQuestionIds.length)}>
              {result.wrongQuestionIds.length === 0 ? <Text style={styles.notice}>{zhCN.result.noWrongAnswers}</Text> : null}
              {result.wrongQuestionIds.map((id) => {
                const question = paper.questions.find((item) => item.id === id);
                return question ? (
                  <Button
                    key={id}
                    label={question.prompt}
                    onPress={() => {
                      setReviewQuestionId(id);
                      setScreen('review');
                    }}
                    tone="secondary"
                  />
                ) : null;
              })}
            </Section>
            <Button label={resultMode === 'history' ? zhCN.result.backToHistory : zhCN.result.createAnother} onPress={closeResult} tone="secondary" />
          </View>
        </ScreenScroll>
      ) : null}

      {screen === 'review' && paper && reviewQuestion ? (
        <ScreenScroll>
          <View style={styles.stack}>
            <Text style={styles.kicker}>{zhCN.review.kicker}</Text>
            <Text style={styles.question}>{reviewQuestion.prompt}</Text>
            <Text style={styles.questionMeta}>
              {formatDifficulty(reviewQuestion.difficulty)} · {reviewQuestion.knowledgePoint}
            </Text>
            <Text style={styles.metric}>{zhCN.review.yourAnswer}{formatOptions(reviewQuestion, answers[reviewQuestion.id] ?? [])}</Text>
            <Text style={styles.metric}>{zhCN.review.correctAnswer}{formatOptions(reviewQuestion, reviewQuestion.correctOptionIds)}</Text>
            <Text style={styles.notice}>{reviewQuestion.explanation}</Text>
            <Button label={zhCN.review.back} onPress={() => setScreen('result')} />
          </View>
        </ScreenScroll>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        secureTextEntry={props.secureTextEntry}
        multiline={props.multiline}
        style={[styles.input, props.multiline ? styles.textArea : null]}
        placeholderTextColor={theme.colors.muted}
      />
    </View>
  );
}

function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, tone === 'secondary' ? styles.secondaryButton : null, shouldDimButton(disabled, loading) ? styles.disabled : null]}>
      <View style={styles.buttonContent}>
        <Text style={[styles.buttonText, tone === 'secondary' ? styles.secondaryButtonText : null]}>{label}</Text>
        {loading ? <LoadingDots /> : null}
      </View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.activeChip : null]}>
      <Text style={[styles.chipText, active ? styles.activeChipText : null]}>{label}</Text>
    </Pressable>
  );
}

function Option({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, active ? styles.activeOption : null]}>
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

function TabBar({ activeTab, bottom, onChange }: { activeTab: MainTab; bottom: number; onChange: (tab: MainTab) => void }) {
  return (
    <View style={[styles.tabBar, { paddingBottom: theme.spacing.md + bottom }]}>
      <TabButton label={zhCN.tabs.assess} active={activeTab === 'assess'} onPress={() => onChange('assess')} />
      <TabButton label={zhCN.tabs.history} active={activeTab === 'history'} onPress={() => onChange('history')} />
      <TabButton label={zhCN.tabs.settings} active={activeTab === 'settings'} onPress={() => onChange('settings')} />
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active ? styles.activeTabButton : null]}>
      <Text style={[styles.tabButtonText, active ? styles.activeTabButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

function HistoryRow({ record, onPress }: { record: PersistedAssessmentRecord; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.historyRow}>
      <View style={styles.historyText}>
        <Text style={styles.historyTitle}>{record.paper.topic}</Text>
        <Text style={styles.notice}>
          {formatChineseDate(record.submittedAt ?? record.updatedAt)} / {formatHistoryStatus(record.status, record.result?.correctCount, record.result?.totalQuestions)}
        </Text>
      </View>
      <View style={styles.scorePill}>
        <Text style={styles.scorePillText}>{record.status === 'completed' && record.result ? `${record.result.accuracy}%` : zhCN.history.draft}</Text>
      </View>
    </Pressable>
  );
}

function formatOptions(question: AssessmentQuestion, ids: string[]): string {
  return ids.map((id) => question.options.find((option) => option.id === id)?.text ?? id).join('、') || zhCN.review.noAnswer;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.canvas },
  appShell: { flex: 1 },
  stack: { gap: theme.spacing.md },
  header: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  configStatus: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, justifyContent: 'space-between' },
  configText: { flex: 1, minWidth: 220 },
  segment: { alignSelf: 'flex-start', backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.pill, flexDirection: 'row', gap: theme.spacing.xs, padding: 4 },
  kicker: { color: theme.colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: theme.colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 38 },
  question: { color: theme.colors.ink, fontSize: 24, fontWeight: '800', lineHeight: 31 },
  questionMeta: { color: theme.colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  progress: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  notice: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: theme.colors.danger, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  section: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.spacing.md, padding: theme.spacing.lg },
  sectionTitle: { color: theme.colors.ink, fontSize: 20, fontWeight: '800' },
  label: { color: theme.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, color: theme.colors.ink, fontSize: 16, minHeight: 46, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  textArea: { minHeight: 86, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: theme.colors.ink, borderRadius: theme.radius.control, minHeight: 46, justifyContent: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: 12 },
  secondaryButton: { backgroundColor: theme.colors.accentSoft },
  disabled: { opacity: 0.45 },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm },
  buttonText: { color: theme.colors.surface, fontSize: 15, fontWeight: '800' },
  secondaryButtonText: { color: theme.colors.ink },
  chip: { alignItems: 'center', borderRadius: theme.radius.pill, minWidth: 58, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  activeChip: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.ink, fontWeight: '800' },
  activeChipText: { color: theme.colors.surface },
  option: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, padding: theme.spacing.md },
  activeOption: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  optionText: { color: theme.colors.ink, fontSize: 16, lineHeight: 22 },
  score: { color: theme.colors.gold, fontSize: 34, fontWeight: '800' },
  metric: { color: theme.colors.ink, fontSize: 16, lineHeight: 23 },
  tabBar: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-around',
    left: 0,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    position: 'absolute',
    right: 0,
  },
  tabButton: { alignItems: 'center', borderRadius: theme.radius.control, flex: 1, minHeight: 44, justifyContent: 'center' },
  activeTabButton: { backgroundColor: theme.colors.accentSoft },
  tabButtonText: { color: theme.colors.muted, fontSize: 13, fontWeight: '800' },
  activeTabButtonText: { color: theme.colors.ink },
  historyRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.canvas,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  historyText: { flex: 1, gap: 3 },
  historyTitle: { color: theme.colors.ink, fontSize: 16, fontWeight: '800', lineHeight: 22 },
  scorePill: { backgroundColor: theme.colors.gold, borderRadius: theme.radius.pill, minWidth: 58, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  scorePillText: { color: theme.colors.surface, fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
