import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { GenerationController, type GenerationState } from '../../generation/controller';
import { cloudClient } from '../../services/cloud';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  createPrivacyConsentViewModel,
  type PrivacyConsentRecord,
} from '../../privacy/consent';
import { createMiniProgramShellState, normalizeQuestionCount } from '../../shell/viewModel';
import { assessmentCache, generationIntentStore, privacyConsentStore } from '../../storage/runtime';

export default function GeneratePage() {
  const shell = createMiniProgramShellState();
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle', progress: 0 });
  const [privacyConsent, setPrivacyConsent] = useState<PrivacyConsentRecord | undefined>(() => privacyConsentStore.get());
  const [acceptingPrivacy, setAcceptingPrivacy] = useState(false);
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
    }, { intentStore: generationIntentStore });
  }

  useEffect(() => {
    void controllerRef.current?.resumePending();
    return () => controllerRef.current?.cancel();
  }, []);
  useEffect(() => {
    let mounted = true;
    async function refreshConsent(): Promise<void> {
      try {
        const result = await cloudClient.getUserSettings({});
        if (result.type === 'found' && result.settings.hasCurrentPrivacyConsent) {
          const record = {
            privacyPolicyVersion: result.settings.privacyPolicyVersion,
            privacyConsentAt: result.settings.privacyConsentAt,
          };
          privacyConsentStore.save(record);
          if (mounted) setPrivacyConsent(record);
        }
      } catch {
        // Local gate remains in place when settings cannot be refreshed.
      }
    }
    void refreshConsent();
    return () => { mounted = false; };
  }, []);

  const active = generation.status === 'creating' || generation.status === 'polling';
  const privacyGate = createPrivacyConsentViewModel(privacyConsent);

  async function acceptPrivacy(): Promise<void> {
    setAcceptingPrivacy(true);
    try {
      const settings = await cloudClient.acceptPrivacyPolicy({
        privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      });
      const record = {
        privacyPolicyVersion: settings.privacyPolicyVersion,
        privacyConsentAt: settings.privacyConsentAt,
      };
      privacyConsentStore.save(record);
      setPrivacyConsent(record);
      await Taro.showToast({ title: '已记录隐私授权', icon: 'success' });
    } catch {
      await Taro.showToast({ title: '暂时无法记录授权', icon: 'none' });
    } finally {
      setAcceptingPrivacy(false);
    }
  }

  function submit(): void {
    if (privacyGate.requiresConsentForGeneration) {
      void Taro.showToast({ title: '请先同意隐私政策', icon: 'none' });
      return;
    }
    if (topic.trim().length === 0) {
      void Taro.showToast({ title: '请输入测评主题', icon: 'none' });
      return;
    }
    const input = {
      topic,
      ...(notes.trim().length === 0 ? {} : { notes }),
      questionCount,
    };
    void (generation.status === 'failed' && generation.retryable !== false
      ? controllerRef.current?.retry(input)
      : controllerRef.current?.start(input));
  }

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.generate.title}</Text>
        <Text className='page-subtitle'>填写主题与重点，生成一份技能测评。</Text>
      </View>

      {privacyGate.requiresConsentForGeneration ? (
        <View className='privacy-gate'>
          <Text className='privacy-gate__title'>{privacyGate.title}</Text>
          <Text className='privacy-gate__text'>生成测评前需要确认当前隐私政策版本。历史记录可继续本地查看。</Text>
          <View className='privacy-gate__actions'>
            <Button className='inline-action' onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}>{privacyGate.reviewLabel}</Button>
            <Button className='inline-action inline-action--primary' disabled={acceptingPrivacy} onClick={() => { void acceptPrivacy(); }}>
              {acceptingPrivacy ? '记录中...' : privacyGate.acceptLabel}
            </Button>
          </View>
        </View>
      ) : null}

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
          maxlength={2000}
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

      <Button className='primary-action' type='primary' disabled={active || privacyGate.requiresConsentForGeneration} onClick={submit}>
        {active ? (
          <View className='button-loading' aria-label='正在生成'>
            <Text>生成中 {generation.progress}%</Text>
            <View className='button-loading__dots'><Text /><Text /><Text /></View>
          </View>
        ) : generation.status === 'failed' && generation.retryable !== false ? '重试生成' : shell.generate.submitLabel}
      </Button>
      {active ? <Button className='cancel-action' onClick={() => controllerRef.current?.cancel()}>取消</Button> : null}
      {generation.status === 'failed' ? <Text className='generation-error'>{generation.error}</Text> : null}
      <FixedBottomNavigation activeTab='generate' />
    </View>
  );
}
