import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { GenerationController, type GenerationState } from '../../generation/controller';
import { cloudClient } from '../../services/cloud';
import { createMiniProgramShellState, normalizeQuestionCount } from '../../shell/viewModel';
import { assessmentCache } from '../../storage/runtime';

export default function GeneratePage() {
  const shell = createMiniProgramShellState();
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle', progress: 0 });
  const controllerRef = useRef<GenerationController>();

  if (controllerRef.current === undefined) {
    controllerRef.current = new GenerationController({
      createJob: cloudClient.createGenerationJob,
      getJob: (jobId) => cloudClient.getGenerationJob({ jobId }),
      getAssessment: async (assessmentId) => {
        const result = await cloudClient.getAssessment({ assessmentId });
        if (result.type !== 'found') throw new Error('Persisted assessment is unavailable.');
        return result.assessment;
      },
      cacheAssessment: assessmentCache.saveAssessment,
      navigate: async (assessmentId) => {
        await Taro.navigateTo({ url: `/pages/answer/index?assessmentId=${encodeURIComponent(assessmentId)}` });
      },
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      onChange: setGeneration,
    });
  }

  useEffect(() => () => controllerRef.current?.cancel(), []);

  const active = generation.status === 'creating' || generation.status === 'polling';

  function submit(): void {
    if (topic.trim().length === 0) {
      void Taro.showToast({ title: '请输入测评主题', icon: 'none' });
      return;
    }
    void controllerRef.current?.start({
      topic,
      ...(notes.trim().length === 0 ? {} : { notes }),
      questionCount,
    });
  }

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.generate.title}</Text>
        <Text className='page-subtitle'>填写主题与重点，生成一份技能测评。</Text>
      </View>

      <View className='form-section'>
        <Text className='field-label'>{shell.generate.topicLabel}</Text>
        <Input
          className='text-input'
          value={topic}
          placeholder={shell.generate.topicPlaceholder}
          adjustPosition
          cursorSpacing={24}
          onInput={(event) => setTopic(event.detail.value)}
        />
      </View>

      <View className='form-section'>
        <Text className='field-label'>{shell.generate.notesLabel}</Text>
        <Textarea
          className='text-area'
          value={notes}
          placeholder={shell.generate.notesPlaceholder}
          maxlength={500}
          adjustPosition
          cursorSpacing={28}
          onInput={(event) => setNotes(event.detail.value)}
        />
      </View>

      <View className='form-section'>
        <Text className='field-label'>{shell.generate.questionCountLabel}</Text>
        <View className='count-control'>
          {[50, 100].map((count) => {
            const normalizedCount = normalizeQuestionCount(count);
            return (
              <View
                key={normalizedCount}
                className={`count-control__option ${questionCount === normalizedCount ? 'count-control__option--active' : ''}`}
                hoverClass='count-control__option--pressed'
                onClick={() => setQuestionCount(normalizedCount)}
              >
                <Text>{normalizedCount}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Button className='primary-action' type='primary' disabled={active} onClick={submit}>
        {active ? (
          <View className='button-loading' aria-label='正在生成'>
            <Text>生成中 {generation.progress}%</Text>
            <View className='button-loading__dots'><Text /><Text /><Text /></View>
          </View>
        ) : generation.status === 'failed' ? '重新生成' : shell.generate.submitLabel}
      </Button>
      {active ? <Button className='cancel-action' onClick={() => controllerRef.current?.cancel()}>取消</Button> : null}
      {generation.status === 'failed' ? <Text className='generation-error'>{generation.error}</Text> : null}
      <FixedBottomNavigation activeTab='generate' />
    </View>
  );
}
