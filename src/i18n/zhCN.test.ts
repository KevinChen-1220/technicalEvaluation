import {
  formatChineseDate,
  formatDifficulty,
  formatHistoryStatus,
  formatQuestionProgress,
  localizeErrorMessage,
  zhCN,
} from './zhCN';

describe('zhCN interface copy', () => {
  it('provides Chinese copy for the main navigation and assessment actions', () => {
    expect(zhCN.tabs).toEqual({ assess: '测评', history: '历史', settings: '设置' });
    expect(zhCN.assess.generate).toBe('生成测评');
    expect(zhCN.answer.submit).toBe('提交答案');
  });

  it('formats assessment metadata in Chinese', () => {
    expect(formatDifficulty('easy')).toBe('简单');
    expect(formatDifficulty('medium')).toBe('中等');
    expect(formatDifficulty('hard')).toBe('困难');
    expect(formatQuestionProgress(2, 50)).toBe('第 2 / 50 题');
    expect(formatHistoryStatus('completed', 42, 50)).toBe('答对 42/50 题');
    expect(formatHistoryStatus('draft')).toBe('进行中');
  });

  it('uses a Chinese date representation', () => {
    expect(formatChineseDate('2026-07-28T08:30:00.000Z')).toMatch(/7月28日/);
  });

  it('localizes known configuration, provider, and generation errors', () => {
    expect(localizeErrorMessage('Base URL must be a valid URL.')).toBe('请输入有效的接口地址（Base URL）。');
    expect(localizeErrorMessage('Model provider did not return message content.')).toBe('模型服务没有返回消息内容。');
    expect(localizeErrorMessage('Model provider returned 401: unauthorized')).toBe('模型服务返回 401：unauthorized');
    expect(
      localizeErrorMessage(
        'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.',
      ),
    ).toContain('HTML/XML');
  });

  it('keeps unknown provider details visible', () => {
    expect(localizeErrorMessage('custom provider failure')).toBe('custom provider failure');
  });
});
