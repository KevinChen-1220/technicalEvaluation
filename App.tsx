import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { generateAssessment } from './src/features/assessment/generator';
import { samplePaper } from './src/features/assessment/samplePaper';
import { scoreAssessment } from './src/features/assessment/scoring';
import type { AssessmentPaper, AssessmentQuestion, AssessmentResult, AssessmentSession } from './src/features/assessment/types';
import { loadModelConfig, saveModelConfig } from './src/features/config/secureConfigStore';
import { type ModelConfig, validateModelConfig } from './src/features/config/modelConfig';
import { createChatCompletion } from './src/services/aiClient';
import { theme } from './src/theme';

type Screen = 'create' | 'settings' | 'answer' | 'result' | 'review';

const emptyConfig: ModelConfig = { baseUrl: '', apiKey: '', model: '' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('create');
  const [config, setConfig] = useState<ModelConfig>(emptyConfig);
  const [topic, setTopic] = useState('iOS development capability');
  const [notes, setNotes] = useState('Balance fundamentals, debugging, architecture, and edge cases.');
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);
  const [paper, setPaper] = useState<AssessmentPaper>(samplePaper);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [reviewQuestionId, setReviewQuestionId] = useState<string | null>(null);

  useEffect(() => {
    loadModelConfig().then((saved) => {
      if (saved) setConfig(saved);
    });
  }, []);

  const session: AssessmentSession = useMemo(() => ({ paperId: paper.id, answers }), [answers, paper.id]);
  const result: AssessmentResult = useMemo(() => scoreAssessment(paper, session), [paper, session]);
  const currentQuestion = paper.questions[questionIndex];
  const reviewQuestion = paper.questions.find((question) => question.id === reviewQuestionId) ?? paper.questions[0];
  const configIsReady = validateModelConfig(config).ok;

  async function handleSaveConfig() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert('Configuration needs attention', validation.errors.join('\n'));
      return;
    }
    await saveModelConfig(config);
    Alert.alert('Configuration saved', 'Your API key stays on this device and is sent only to your configured provider.');
    setScreen('create');
  }

  async function handleTestConnection() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert('Add model configuration first', validation.errors.join('\n'));
      return;
    }

    setIsTesting(true);
    try {
      await createChatCompletion(config, [
        { role: 'system', content: 'Reply with OK.' },
        { role: 'user', content: 'Connection test.' },
      ]);
      Alert.alert('Connection works', 'The configured provider returned a response.');
    } catch (error) {
      Alert.alert('Connection failed', error instanceof Error ? error.message : 'Unknown connection error.');
    } finally {
      setIsTesting(false);
    }
  }

  async function handleGenerate() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert('Add model configuration first', validation.errors.join('\n'));
      return;
    }
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Enter the capability you want to assess.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const generated = await generateAssessment({ topic, questionCount, notes }, config);
      setPaper(generated);
      setAnswers({});
      setQuestionIndex(0);
      setScreen('answer');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error.';
      setGenerationError(questionCount === 100 ? `${message} Try 50 questions if the provider truncated the output.` : message);
    } finally {
      setIsGenerating(false);
    }
  }

  function startSamplePaper() {
    setPaper(samplePaper);
    setAnswers({});
    setQuestionIndex(0);
    setReviewQuestionId(null);
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

      return { ...previous, [currentQuestion.id]: next };
    });
  }

  function submitAnswers() {
    const unanswered = paper.questions.filter((question) => !answers[question.id]?.length);
    if (unanswered.length > 0) {
      Alert.alert('Keep going', `${unanswered.length} questions still need an answer.`);
      return;
    }
    setScreen('result');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        {screen === 'create' && (
          <View style={styles.stack}>
            <View style={styles.header}>
              <Text style={styles.kicker}>SkillScope</Text>
              <Text style={styles.title}>Dynamic ability assessment</Text>
              <Text style={styles.notice}>
                Topics and generated prompts are sent directly to the provider you configure. No backend is used.
              </Text>
            </View>

            <Section title="Assessment Brief">
              <View style={styles.configStatus}>
                <View style={styles.configText}>
                  <Text style={styles.label}>Model Provider</Text>
                  <Text style={styles.notice}>
                    {configIsReady ? `Configured: ${config.model}` : 'Configure a provider once before generating assessments.'}
                  </Text>
                </View>
                <Button label="Settings" onPress={() => setScreen('settings')} tone="secondary" />
              </View>
              <Input label="Topic" value={topic} onChangeText={setTopic} placeholder="Backend architecture capability" />
              <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional focus areas" multiline />
              <View style={styles.segment}>
                <Chip label="50" active={questionCount === 50} onPress={() => setQuestionCount(50)} />
                <Chip label="100" active={questionCount === 100} onPress={() => setQuestionCount(100)} />
              </View>
              {generationError ? <Text style={styles.error}>{generationError}</Text> : null}
              <Button label={isGenerating ? 'Generating' : 'Generate'} onPress={handleGenerate} disabled={isGenerating} />
              {isGenerating ? <ActivityIndicator color={theme.colors.accent} /> : null}
              <Button label="Use Sample Paper" onPress={startSamplePaper} tone="secondary" />
            </Section>
          </View>
        )}

        {screen === 'settings' && (
          <View style={styles.stack}>
            <View style={styles.header}>
              <Text style={styles.kicker}>Settings</Text>
              <Text style={styles.title}>Model provider</Text>
              <Text style={styles.notice}>
                Enter an OpenAI-compatible endpoint once. The API key is saved locally with Expo SecureStore.
              </Text>
            </View>

            <Section title="Connection">
              <Input label="Base URL" value={config.baseUrl} onChangeText={(baseUrl) => setConfig((value) => ({ ...value, baseUrl }))} placeholder="https://api.openai.com/v1" />
              <Input label="API Key" value={config.apiKey} onChangeText={(apiKey) => setConfig((value) => ({ ...value, apiKey }))} placeholder="sk-..." secureTextEntry />
              <Input label="Model" value={config.model} onChangeText={(model) => setConfig((value) => ({ ...value, model }))} placeholder="gpt-4.1-mini" />
              <View style={styles.row}>
                <Button label="Save" onPress={handleSaveConfig} />
                <Button label={isTesting ? 'Testing' : 'Test'} onPress={handleTestConnection} tone="secondary" disabled={isTesting} />
                <Button label="Back" onPress={() => setScreen('create')} tone="secondary" />
              </View>
            </Section>
          </View>
        )}

        {screen === 'answer' && currentQuestion && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>{paper.topic}</Text>
            <Text style={styles.progress}>
              Question {questionIndex + 1} of {paper.questions.length} / {currentQuestion.difficulty} / {currentQuestion.knowledgePoint}
            </Text>
            <Text style={styles.question}>{currentQuestion.prompt}</Text>
            <View style={styles.stack}>
              {currentQuestion.options.map((option) => {
                const active = answers[currentQuestion.id]?.includes(option.id) ?? false;
                return <Option key={option.id} label={`${option.id}. ${option.text}`} active={active} onPress={() => toggleAnswer(option.id)} />;
              })}
            </View>
            <View style={styles.row}>
              <Button label="Previous" onPress={() => setQuestionIndex((index) => Math.max(0, index - 1))} tone="secondary" disabled={questionIndex === 0} />
              {questionIndex === paper.questions.length - 1 ? (
                <Button label="Submit" onPress={submitAnswers} />
              ) : (
                <Button label="Next" onPress={() => setQuestionIndex((index) => Math.min(paper.questions.length - 1, index + 1))} />
              )}
            </View>
          </View>
        )}

        {screen === 'result' && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>Result</Text>
            <Text style={styles.title}>{result.level.title}</Text>
            <Text style={styles.score}>
              {result.score}/{result.totalQuestions} / {result.accuracy}%
            </Text>
            <Text style={styles.notice}>{result.level.summary}</Text>
            <Section title="Knowledge Points">
              {result.knowledgePointResults.map((item) => (
                <Text key={item.knowledgePoint} style={styles.metric}>
                  {item.knowledgePoint}: {item.correct}/{item.total} ({item.accuracy}%)
                </Text>
              ))}
            </Section>
            <Section title={`Wrong Questions (${result.wrongQuestionIds.length})`}>
              {result.wrongQuestionIds.length === 0 ? <Text style={styles.notice}>No wrong answers.</Text> : null}
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
            <Button label="Create Another" onPress={() => setScreen('create')} tone="secondary" />
          </View>
        )}

        {screen === 'review' && reviewQuestion && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>{reviewQuestion.knowledgePoint}</Text>
            <Text style={styles.question}>{reviewQuestion.prompt}</Text>
            <Text style={styles.metric}>Your answer: {formatOptions(reviewQuestion, answers[reviewQuestion.id] ?? [])}</Text>
            <Text style={styles.metric}>Correct answer: {formatOptions(reviewQuestion, reviewQuestion.correctOptionIds)}</Text>
            <Text style={styles.notice}>{reviewQuestion.explanation}</Text>
            <Button label="Back to Results" onPress={() => setScreen('result')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, tone === 'secondary' ? styles.secondaryButton : null, disabled ? styles.disabled : null]}>
      <Text style={[styles.buttonText, tone === 'secondary' ? styles.secondaryButtonText : null]}>{label}</Text>
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

function formatOptions(question: AssessmentQuestion, ids: string[]): string {
  return ids.map((id) => question.options.find((option) => option.id === id)?.text ?? id).join(', ') || 'No answer';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.canvas },
  container: { gap: theme.spacing.lg, padding: theme.spacing.lg },
  stack: { gap: theme.spacing.md },
  header: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  configStatus: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, justifyContent: 'space-between' },
  configText: { flex: 1, minWidth: 220 },
  segment: { alignSelf: 'flex-start', backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.pill, flexDirection: 'row', gap: theme.spacing.xs, padding: 4 },
  kicker: { color: theme.colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: theme.colors.ink, fontSize: 34, fontWeight: '800', lineHeight: 40 },
  question: { color: theme.colors.ink, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  progress: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  notice: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: theme.colors.danger, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  section: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.spacing.md, padding: theme.spacing.lg },
  sectionTitle: { color: theme.colors.ink, fontSize: 21, fontWeight: '800' },
  label: { color: theme.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, color: theme.colors.ink, fontSize: 16, minHeight: 46, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  textArea: { minHeight: 86, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: theme.colors.ink, borderRadius: theme.radius.control, minHeight: 46, justifyContent: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: 12 },
  secondaryButton: { backgroundColor: theme.colors.accentSoft },
  disabled: { opacity: 0.45 },
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
});
