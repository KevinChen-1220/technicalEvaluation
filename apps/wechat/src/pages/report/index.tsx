import { useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, Textarea, View } from '@tarojs/components';
import { CURRENT_PRIVACY_POLICY_VERSION } from '../../privacy/consent';
import { cloudClient, type CreateReportInput } from '../../services/cloud';

const reasons: Array<{ value: CreateReportInput['reason']; label: string }> = [
  { value: 'question_error', label: '题目有误' },
  { value: 'content_safety', label: '内容不适' },
  { value: 'privacy', label: '隐私问题' },
  { value: 'other', label: '其他' },
];

export default function ReportPage() {
  const assessmentId = useRouter().params.assessmentId ?? '';
  const [reason, setReason] = useState<CreateReportInput['reason']>('question_error');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    if (!assessmentId) {
      await Taro.showToast({ title: '请从测评结果页提交', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await cloudClient.createReport({
        assessmentId,
        reason,
        ...(detail.trim().length === 0 ? {} : { detail }),
        policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
      });
      await Taro.showToast({ title: '已提交', icon: 'success' });
      await Taro.navigateBack();
    } catch {
      await Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>投诉与反馈</Text>
        <Text className='page-subtitle'>{assessmentId ? '提交这份测评的反馈。' : '请从测评结果页进入，以便定位具体记录。'}</Text>
      </View>
      <View className='reason-control'>
        {reasons.map((item) => (
          <View
            key={item.value}
            className={`reason-control__option ${reason === item.value ? 'reason-control__option--active' : ''}`}
            onClick={() => setReason(item.value)}
          >
            <Text>{item.label}</Text>
          </View>
        ))}
      </View>
      <View className='form-section'>
        <Text className='field-label'>补充说明</Text>
        <Textarea
          className='text-area'
          value={detail}
          maxlength={500}
          adjustPosition
          cursorSpacing={28}
          placeholder='可选：描述你遇到的问题'
          onInput={(event) => setDetail(event.detail.value)}
        />
      </View>
      <Button className='primary-action' disabled={submitting || !assessmentId} onClick={() => { void submit(); }}>
        {submitting ? '提交中...' : '提交反馈'}
      </Button>
    </View>
  );
}
