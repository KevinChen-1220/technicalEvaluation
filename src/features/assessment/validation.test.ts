import { samplePaper } from './samplePaper';
import type { AssessmentPaper } from './types';
import { validateAssessmentPaper } from './validation';

const validGeneratedPaper: AssessmentPaper = {
  ...samplePaper,
  questionCount: 50,
  scoring: {
    ...samplePaper.scoring,
    maxScore: 50,
  },
  questions: Array.from({ length: 50 }, (_, index) => ({
    ...samplePaper.questions[index % samplePaper.questions.length]!,
    id: `q${index + 1}`,
  })),
};

describe('validateAssessmentPaper', () => {
  it('rejects duplicate question and option IDs', () => {
    const duplicateQuestions = {
      ...validGeneratedPaper,
      questions: validGeneratedPaper.questions.map((question, index) => (
        index === 1 ? { ...question, id: validGeneratedPaper.questions[0]!.id } : question
      )),
    };
    const duplicateOptions = {
      ...validGeneratedPaper,
      questions: validGeneratedPaper.questions.map((question, index) => (
        index === 0
          ? { ...question, options: question.options.map((option, optionIndex) => (
            optionIndex === 3 ? { ...option, id: question.options[0]!.id } : option
          )) }
          : question
      )),
    };

    expect(validateAssessmentPaper(duplicateQuestions)).toEqual({
      ok: false,
      errors: ['Question ID q1 must be unique.'],
    });
    expect(validateAssessmentPaper(duplicateOptions)).toEqual({
      ok: false,
      errors: ['Question q1 option ID A must be unique.'],
    });
  });

  it('accepts a structurally valid generated paper', () => {
    expect(validateAssessmentPaper(validGeneratedPaper)).toEqual({ ok: true, errors: [], paper: validGeneratedPaper });
  });

  it('rejects unsupported types, missing explanations, bad answers, and question-count mismatches', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questionCount: 100,
      questions: [
        {
          ...validGeneratedPaper.questions[0],
          type: 'essay',
          explanation: '',
          correctOptionIds: ['Z'],
        },
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Expected 100 questions but received 1.',
        'Question q1 has unsupported type essay.',
        'Question q1 correct option Z does not exist in options.',
        'Question q1 explanation is required.',
      ],
    });
  });

  it('rejects single-choice questions with multiple correct answers and multiple-choice questions with no correct answers', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        { ...validGeneratedPaper.questions[0]!, correctOptionIds: ['A', 'B'] },
        { ...validGeneratedPaper.questions[3]!, id: 'q2', correctOptionIds: [] },
        ...validGeneratedPaper.questions.slice(2),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Question q1 single_choice questions must have exactly one correct option.',
        'Question q2 multiple_choice questions must have at least one correct option.',
      ],
    });
  });

  it('rejects questions without prompt text, knowledge point, and option text', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        {
          ...validGeneratedPaper.questions[0]!,
          prompt: '',
          knowledgePoint: '',
          options: [
            { id: 'A', text: '' },
            { id: 'B', text: 'Valid option' },
          ],
          correctOptionIds: ['B'],
        },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Question q1 prompt is required.',
        'Question q1 knowledgePoint is required.',
        'Question q1 option A text is required.',
      ],
    });
  });

  it('rejects scoring levels that do not cover 0 through 100 percent', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      scoring: {
        ...validGeneratedPaper.scoring,
        levels: [
          { minPercent: 10, maxPercent: 49, title: 'Low', summary: 'Low score.' },
          { minPercent: 50, maxPercent: 100, title: 'High', summary: 'High score.' },
        ],
      },
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: ['Scoring levels must cover 0 through 100 percent without gaps.'],
    });
  });

  it('accepts a question with text, image, table, and bar chart materials', () => {
    const paperWithRichMaterials = {
      ...validGeneratedPaper,
      questions: [
        {
          ...validGeneratedPaper.questions[0]!,
          materials: [
            { type: 'text', text: '根据以下资料回答问题。' },
            {
              type: 'image',
              uri: 'https://example.com/chart.png',
              alt: '2019 至 2023 年增长趋势图',
              caption: '数据来源：示例统计年鉴',
              aspectRatio: 1.5,
            },
            {
              type: 'table',
              caption: '各地区产值',
              columns: ['地区', '2022', '2023'],
              rows: [['甲', '120', '135'], ['乙', '98', '110']],
            },
            {
              type: 'bar_chart',
              title: '2023 年产值',
              unit: '亿元',
              items: [
                { label: '甲', value: 135 },
                { label: '乙', value: 110, displayValue: '110 亿元' },
              ],
            },
          ],
        },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(paperWithRichMaterials)).toEqual({
      ok: true,
      errors: [],
      paper: paperWithRichMaterials,
    });
  });

  it('accepts optional table and bar chart presentation metadata when omitted', () => {
    const paperWithMinimalMaterials = {
      ...validGeneratedPaper,
      questions: [
        {
          ...validGeneratedPaper.questions[0]!,
          materials: [
            { type: 'table', columns: ['地区', '2023'], rows: [['甲', '135']] },
            { type: 'bar_chart', items: [{ label: '甲', value: 135 }, { label: '乙', value: 110 }] },
          ],
        },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(paperWithMinimalMaterials)).toEqual({
      ok: true,
      errors: [],
      paper: paperWithMinimalMaterials,
    });
  });

  it.each([
    ['null material', [null], ['Question q1 material 1 must be a JSON object.']],
    ['unknown material type', [{ type: 'heatmap' }], ['Question q1 material 1 has unsupported type heatmap.']],
    ['non-array table row', [{ type: 'table', columns: ['地区'], rows: ['甲'] }], ['Question q1 material 1 table row 1 must be an array.']],
    [
      'non-object chart items',
      [{ type: 'bar_chart', items: [null, null] }],
      [
        'Question q1 material 1 bar_chart item 1 must be a JSON object.',
        'Question q1 material 1 bar_chart item 2 must be a JSON object.',
      ],
    ],
  ])('rejects %s without throwing', (_description, materials, errors) => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        { ...validGeneratedPaper.questions[0]!, materials },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({ ok: false, errors });
  });

  it.each([
    ['non-array materials', { type: 'text', text: '资料' }, 'Question q1 materials must be an array.'],
    ['empty text', [{ type: 'text', text: '' }], 'Question q1 material 1 text is required.'],
    ['non-HTTPS image URI', [{ type: 'image', uri: 'http://example.com/chart.png', alt: '趋势图' }], 'Question q1 material 1 image uri must be a valid HTTPS URL.'],
    ['missing image alt', [{ type: 'image', uri: 'https://example.com/chart.png', alt: '' }], 'Question q1 material 1 image alt is required.'],
    ['table row width mismatch', [{ type: 'table', caption: '各地区产值', columns: ['地区', '2023'], rows: [['甲']] }], 'Question q1 material 1 table row 1 must have 2 cells.'],
    ['one-item chart', [{ type: 'bar_chart', title: '2023 年产值', unit: '亿元', items: [{ label: '甲', value: 135 }] }], 'Question q1 material 1 bar_chart must have at least two items.'],
    ['negative chart value', [{ type: 'bar_chart', title: '2023 年产值', unit: '亿元', items: [{ label: '甲', value: -1 }, { label: '乙', value: 110 }] }], 'Question q1 material 1 bar_chart item 1 value must be greater than or equal to 0.'],
  ])('rejects material with %s', (_description, materials, error) => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        { ...validGeneratedPaper.questions[0]!, materials },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({ ok: false, errors: [error] });
  });

  it.each([
    ['too many material blocks', Array.from({ length: 9 }, () => ({ type: 'text', text: '资料' })), 'Question q1 materials must not contain more than 8 blocks.'],
    ['too many table columns', [{ type: 'table', columns: Array.from({ length: 13 }, (_, index) => `列${index}`), rows: [Array.from({ length: 13 }, () => '值')] }], 'Question q1 material 1 table must not contain more than 12 columns.'],
    ['too many table rows', [{ type: 'table', columns: ['列'], rows: Array.from({ length: 101 }, () => ['值']) }], 'Question q1 material 1 table must not contain more than 100 rows.'],
    ['too many chart items', [{ type: 'bar_chart', items: Array.from({ length: 41 }, (_, index) => ({ label: `项${index}`, value: index })) }], 'Question q1 material 1 bar_chart must not contain more than 40 items.'],
  ])('rejects material with %s', (_description, materials, error) => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        { ...validGeneratedPaper.questions[0]!, materials },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({ ok: false, errors: [error] });
  });
});
