import { useEffect, useMemo, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { QuestionMaterials } from '../../components/QuestionMaterials';
import { cloudClient } from '../../services/cloud';
import { assessmentCache, assessmentSyncQueue } from '../../storage/runtime';
import type { AssessmentSyncStatus } from '../../answer/syncQueue';
import type { CachedAssessment } from '../../storage/assessmentCache';

const difficultyLabels = { easy: '基础', medium: '进阶', hard: '挑战' } as const;

export default function AnswerPage() {
  const assessmentId = useRouter().params.assessmentId ?? '';
  const [assessment, setAssessment] = useState<CachedAssessment | undefined>(() => (
    assessmentId ? assessmentCache.getAssessment(assessmentId) : undefined
  ));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [syncStatus, setSyncStatus] = useState<AssessmentSyncStatus>('idle');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      if (!assessmentId) { setLoadError(true); return; }
      const local = assessmentCache.getAssessment(assessmentId);
      if (local !== undefined) {
        setAssessment(local);
        await assessmentSyncQueue.resume(assessmentId);
        if (mounted) setSyncStatus(assessmentSyncQueue.getStatus(assessmentId));
        return;
      }
      try {
        const result = await cloudClient.getAssessment({ assessmentId });
        if (result.type !== 'found') throw new Error('Assessment not found.');
        assessmentCache.saveAssessment(result.assessment);
        if (mounted) setAssessment(result.assessment);
      } catch {
        if (mounted) setLoadError(true);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [assessmentId]);

  const question = assessment?.paper.questions[currentIndex];
  const total = assessment?.paper.questions.length ?? 0;
  const selected = useMemo(() => (
    question === undefined ? [] : assessment?.answers[question.id] ?? []
  ), [assessment, question]);

  function choose(optionId: string): void {
    if (assessment === undefined || question === undefined) return;
    const operation = assessmentSyncQueue.recordSelection(assessment.id, question.id, optionId);
    setAssessment(operation.assessment);
    setSyncStatus('syncing');
    void operation.sync.then(() => setSyncStatus(assessmentSyncQueue.getStatus(assessment.id)));
  }

  function move(offset: number): void {
    const next = Math.max(0, Math.min(total - 1, currentIndex + offset));
    setCurrentIndex(next);
    void Taro.pageScrollTo({ scrollTop: 0, duration: 160 });
  }

  if (loadError) {
    return <View className='answer-feedback'><Text>试卷暂时无法打开</Text></View>;
  }
  if (assessment === undefined || question === undefined) {
    return <View className='answer-feedback'><Text>正在读取试卷...</Text></View>;
  }

  return (
    <View className='answer-page'>
      <View className='answer-header'>
        <Text className='answer-topic'>{assessment.paper.topic}</Text>
        <View className='answer-progress-row'>
          <Text>第 {currentIndex + 1} / {total} 题</Text>
          <Text className={`sync-status sync-status--${syncStatus}`}>
            {syncStatus === 'syncing' ? '同步中' : syncStatus === 'offline' ? '待同步' : syncStatus === 'synced' ? '已同步' : ''}
          </Text>
        </View>
      </View>

      <View className='question-content'>
        <Text className='question-prompt'>{currentIndex + 1}. {question.prompt}</Text>
        <View className='question-meta'>
          <Text>{difficultyLabels[question.difficulty]}</Text>
          <Text>{question.knowledgePoint}</Text>
        </View>
        <QuestionMaterials materials={question.materials} />
        <View className='question-options'>
          {question.options.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <View
                key={option.id}
                className={`question-option ${isSelected ? 'question-option--selected' : ''}`}
                hoverClass='question-option--pressed'
                onClick={() => choose(option.id)}
              >
                <View className='question-option__marker'><Text>{isSelected ? '✓' : ''}</Text></View>
                <Text className='question-option__text'>{option.text}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className='answer-navigation'>
        <View className='answer-navigation__inner'>
          <Button className='answer-nav-button' disabled={currentIndex === 0} onClick={() => move(-1)}>上一题</Button>
          {currentIndex === total - 1 ? (
            <Button className='answer-nav-button answer-nav-button--primary' onClick={() => Taro.showToast({ title: '请确认所有题目已作答', icon: 'none' })}>提交试卷</Button>
          ) : (
            <Button className='answer-nav-button answer-nav-button--primary' onClick={() => move(1)}>下一题</Button>
          )}
        </View>
      </View>
    </View>
  );
}
