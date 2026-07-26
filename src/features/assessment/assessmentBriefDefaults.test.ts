import { defaultAssessmentBrief } from './assessmentBriefDefaults';

describe('defaultAssessmentBrief', () => {
  it('starts new assessments with a Chinese topic and Chinese notes', () => {
    expect(defaultAssessmentBrief).toEqual({
      topic: 'iOS 开发能力',
      notes: '兼顾基础知识、调试、架构和边界情况。',
    });
  });
});
