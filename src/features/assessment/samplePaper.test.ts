import { samplePaper } from './samplePaper';

const containsChinese = (value: string) => /[\u3400-\u9fff]/u.test(value);

describe('samplePaper', () => {
  it('uses Chinese for the built-in sample assessment', () => {
    expect(containsChinese(samplePaper.topic)).toBe(true);

    for (const level of samplePaper.scoring.levels) {
      expect(containsChinese(level.title)).toBe(true);
      expect(containsChinese(level.summary)).toBe(true);
    }

    for (const question of samplePaper.questions) {
      expect(containsChinese(question.knowledgePoint)).toBe(true);
      expect(containsChinese(question.prompt)).toBe(true);
      expect(containsChinese(question.explanation)).toBe(true);
      expect(question.options.some((option) => containsChinese(option.text))).toBe(true);
    }
  });
});
