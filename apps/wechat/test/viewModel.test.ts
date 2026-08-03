import {
  createMiniProgramShellState,
  normalizeQuestionCount,
  validateGeneratedAssessment,
} from '../src/shell/viewModel';

describe('Mini Program shell view model', () => {
  it('provides Chinese Generate, History, and Settings navigation', () => {
    const state = createMiniProgramShellState();

    expect(state.tabs).toEqual([
      { id: 'generate', label: '生成' },
      { id: 'history', label: '历史' },
      { id: 'settings', label: '设置' },
    ]);
    expect(state.generate.title).toBe('生成测评');
    expect(state.history.emptyMessage).toBe('暂无历史测评记录');
    expect(state.settings.disclosure).toContain('隐私');
  });

  it('normalizes only the supported question counts', () => {
    expect(normalizeQuestionCount(50)).toBe(50);
    expect(normalizeQuestionCount(100)).toBe(100);
    expect(normalizeQuestionCount(75)).toBe(50);
    expect(normalizeQuestionCount(undefined)).toBe(50);
  });

  it('does not expose client provider configuration in public state', () => {
    const state = createMiniProgramShellState();

    expect(state).not.toHaveProperty('apiKey');
    expect(state).not.toHaveProperty('endpoint');
    expect(state).not.toHaveProperty('model');
    expect(state).not.toHaveProperty('provider');
  });

  it('uses the shared assessment core to validate generated payloads', () => {
    const result = validateGeneratedAssessment({ questionCount: 75 });

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining(['Question count must be 50 or 100.', 'Questions must be an array.']),
    });
  });
});
