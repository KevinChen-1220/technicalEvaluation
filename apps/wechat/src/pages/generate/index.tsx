import { useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { createMiniProgramShellState, normalizeQuestionCount } from '../../shell/viewModel';

export default function GeneratePage() {
  const shell = createMiniProgramShellState();
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);

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

      <Button className='primary-action' type='primary'>
        {shell.generate.submitLabel}
      </Button>
      <FixedBottomNavigation activeTab='generate' />
    </View>
  );
}
