import { useEffect, useMemo, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { QuestionMaterials } from '../../components/QuestionMaterials';
import { buildResultViewModel } from '../../services/result-view-model';
import { cloudClient } from '../../services/cloud';
import { assessmentCache } from '../../storage/runtime';
import type { CachedAssessment } from '../../storage/assessmentCache';

export default function ResultPage() {
  const assessmentId = useRouter().params.assessmentId ?? '';
  const [assessment, setAssessment] = useState<CachedAssessment | undefined>(() => (
    assessmentId ? assessmentCache.getAssessment(assessmentId) : undefined
  ));
  const [page, setPage] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      if (!assessmentId) { setLoadError(true); return; }
      const local = assessmentCache.getAssessment(assessmentId);
      if (local?.status === 'completed') {
        setAssessment(local);
        return;
      }
      try {
        const result = await cloudClient.getAssessment({ assessmentId });
        if (result.type !== 'found' || result.assessment.status !== 'completed') throw new Error('Result not found.');
        assessmentCache.saveAssessment(result.assessment);
        if (mounted) setAssessment(result.assessment);
      } catch {
        if (mounted) setLoadError(true);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [assessmentId]);

  const view = useMemo(() => (
    assessment?.status === 'completed' ? buildResultViewModel(assessment, page) : null
  ), [assessment, page]);

  function changePage(nextPage: number): void {
    setPage(nextPage);
    void Taro.pageScrollTo({ selector: '#wrong-question-section', duration: 160 });
  }

  if (loadError) return <View className='answer-feedback'><Text>结果暂时无法打开</Text></View>;
  if (view === null) return <View className='answer-feedback'><Text>正在读取结果...</Text></View>;

  return (
    <View className='result-page'>
      <View className='result-header'>
        <Text className='result-topic'>{view.topic}</Text>
        <Text className='result-level'>{view.summary.levelTitle}</Text>
        <Text className='result-summary'>{view.summary.levelSummary}</Text>
      </View>

      <View className='result-metrics'>
        <View className='result-metric'><Text className='result-metric__value'>{view.summary.score}</Text><Text>得分</Text></View>
        <View className='result-metric'><Text className='result-metric__value'>{view.summary.correctCount}/{view.summary.totalQuestions}</Text><Text>正确</Text></View>
        <View className='result-metric'><Text className='result-metric__value'>{view.summary.accuracy}%</Text><Text>正确率</Text></View>
      </View>

      <View className='knowledge-section'>
        <Text className='section-title'>知识点表现</Text>
        {view.knowledgePoints.map((item) => (
          <View key={item.knowledgePoint} className='knowledge-row'>
            <Text>{item.knowledgePoint}</Text>
            <Text>{item.correct}/{item.total} · {item.accuracy}%</Text>
          </View>
        ))}
      </View>

      <View id='wrong-question-section' className='wrong-section'>
        <View className='wrong-section__header'>
          <Text className='section-title'>错题解析</Text>
          <Text className='wrong-count'>{view.pagination.total} 题</Text>
        </View>
        {view.wrongQuestions.length === 0 ? (
          <View className='empty-state'><Text>本次没有错题</Text></View>
        ) : view.wrongQuestions.map((item) => (
          <View key={item.questionId} className='wrong-question'>
            <Text className='question-prompt'>{item.questionNumber}. {item.prompt}</Text>
            <QuestionMaterials materials={item.materials} />
            <View className='question-options'>
              {item.options.map((option) => (
                <View
                  key={option.id}
                  className={`review-option ${option.correct ? 'review-option--correct' : ''} ${option.selected && !option.correct ? 'review-option--wrong' : ''}`}
                >
                  <Text className='question-option__text'>{option.text}</Text>
                  {option.badge ? <Text className='review-badge'>{option.badge}</Text> : null}
                </View>
              ))}
            </View>
            <Text className='answer-line'>你的答案：{item.selectedAnswerText}</Text>
            <Text className='answer-line'>正确答案：{item.correctAnswerText}</Text>
            <Text className='explanation-text'>{item.explanation}</Text>
          </View>
        ))}
        {view.pagination.pageCount > 1 ? (
          <View className='wrong-pagination'>
            <Button className='answer-nav-button' disabled={!view.pagination.hasPrevious} onClick={() => changePage(page - 1)}>上一页</Button>
            <Text>{view.pagination.page + 1}/{view.pagination.pageCount}</Text>
            <Button className='answer-nav-button' disabled={!view.pagination.hasNext} onClick={() => changePage(page + 1)}>下一页</Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}
