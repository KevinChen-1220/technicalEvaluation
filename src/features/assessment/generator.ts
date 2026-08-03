import { createChatCompletion, type ChatMessage } from '../../services/aiClient';
import { jsonrepair } from 'jsonrepair';
import type { ModelConfig } from '../config/modelConfig';
import type { AssessmentPaper } from './types';
import { validateAssessmentPaper } from './validation';

export type AssessmentGenerationRequest = {
  topic: string;
  questionCount: 50 | 100;
  notes?: string;
};

export type CompletionFn = (config: ModelConfig, messages: ChatMessage[]) => Promise<string>;

const MARKUP_RESPONSE_ERROR = 'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.';

class RetryableGenerationError extends Error {}

export function buildAssessmentPrompt(request: AssessmentGenerationRequest): string {
  const notes = request.notes?.trim() ? `\nAdditional generation notes: ${request.notes.trim()}` : '';

  return `Create an ability assessment paper for this topic: ${request.topic.trim()}.

Return one JSON object only. Do not wrap it in Markdown.
The JSON must match this TypeScript shape:
{
  "id": "stable-paper-id",
  "topic": "${request.topic.trim()}",
  "questionCount": ${request.questionCount},
  "generatedAt": "ISO-8601 timestamp",
  "scoring": {
    "maxScore": ${request.questionCount},
    "levels": [
      { "minPercent": 0, "maxPercent": 59, "title": "Needs Practice", "summary": "..." },
      { "minPercent": 60, "maxPercent": 79, "title": "Proficient", "summary": "..." },
      { "minPercent": 80, "maxPercent": 100, "title": "Advanced", "summary": "..." }
    ]
  },
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "difficulty": "easy",
      "knowledgePoint": "Concise skill area",
      "prompt": "Full question text shown to the user",
      "options": [
        { "id": "A", "text": "First answer option" },
        { "id": "B", "text": "Second answer option" }
      ],
      "correctOptionIds": ["A"],
      "explanation": "Detailed explanation of the correct answer",
      "materials": [
        { "type": "text", "text": "Supporting material for the question" },
        {
          "type": "image",
          "uri": "<real HTTPS URL supplied in topic or notes; otherwise omit this image block>",
          "alt": "Accessible image description",
          "caption": "Image source or context",
          "aspectRatio": 1.5
        },
        {
          "type": "table",
          "caption": "Table title",
          "columns": ["Category", "Value"],
          "rows": [["A", "120"], ["B", "110"]]
        },
        {
          "type": "bar_chart",
          "title": "Chart title",
          "unit": "units",
          "items": [
            { "label": "A", "value": 120 },
            { "label": "B", "value": 110, "displayValue": "110 units" }
          ]
        }
      ]
    }
  ]
}

Requirements:
- Generate exactly ${request.questionCount} questions.
- Use the topic field as the sole source of truth for the output language of every user-facing value, including topic, scoring titles and summaries, knowledge points, question prompts, option text, and explanations.
- Additional notes must not change the output language, even when they are written in a different language.
- For Chinese input, use Simplified Chinese. For English input, use English. For any other language, preserve the topic language.
- Do not default to Chinese when the topic is not Chinese.
- Keep JSON property names, enum values, and option IDs in English. Do not translate machine-readable values such as single_choice, multiple_choice, true_false, easy, medium, hard, A, B, C, or D.
- Every question must include a non-empty prompt field containing the full question text.
- Use the exact field name "prompt" for the question text. Do not use "question", "title", or "text" for the question prompt.
- Every question must include non-empty option text for each answer option.
- Mix these question types: single_choice, multiple_choice, true_false.
- Use stable option IDs such as A, B, C, and D.
- Include correctOptionIds for every question.
- Include one detailed explanation for every question.
- Include one concise knowledgePoint for every question.
- Include difficulty as easy, medium, or hard.
- Scoring levels must cover 0 through 100 percent without gaps.
- Single choice and true/false questions must have exactly one correct answer.
- Multiple choice questions must have at least one correct answer.
- Materials are optional supporting blocks for a question. Omit materials for an ordinary text-only question.
- Use text blocks for supporting context, table blocks for tabular data, and bar_chart blocks for comparable non-negative values.
- Use image blocks only when a real HTTPS image URL was explicitly supplied in the topic or notes. Never invent an image URL.
- Use no more than 8 material blocks per question, 12 table columns, 100 table rows, or 40 bar-chart items.
- Keep material text, image alt text, captions, table captions and cells, chart titles, units, labels, and display values in the topic language.
${notes}`;
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();

  if (looksLikeMarkup(trimmed)) {
    throw new Error(MARKUP_RESPONSE_ERROR);
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1) {
    throw new Error('Model response did not contain a JSON object.');
  }

  const candidate = end < start ? trimmed.slice(start) : trimmed.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      throw new Error('Model response contained a JSON-looking block, but it was not valid JSON.');
    }
  }
}

function looksLikeMarkup(content: string): boolean {
  return /^<(?:!doctype\s+html|html|body|head|script|xml|\?xml|[a-z][\w:-]*\b)/i.test(content);
}

export async function generateAssessment(
  request: AssessmentGenerationRequest,
  config: ModelConfig,
  completionFn: CompletionFn = createChatCompletion,
): Promise<AssessmentPaper> {
  let retryReason: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = buildAssessmentPrompt(request);
    const content = await completionFn(config, [
      { role: 'system', content: 'You generate deterministic, valid JSON assessment papers for mobile apps.' },
      {
        role: 'user',
        content: retryReason
          ? `${prompt}\n\nThe previous response failed: ${retryReason}\nRegenerate the complete JSON object from scratch.`
          : prompt,
      },
    ]);

    try {
      const paper = parseAssessmentPaper(content);
      validateGeneratedImageSources(paper, request);
      return paper;
    } catch (error) {
      if (!(error instanceof RetryableGenerationError) || attempt === 1) {
        throw error;
      }

      retryReason = error.message;
    }
  }

  throw new Error('Assessment generation did not return a result.');
}

function validateGeneratedImageSources(
  paper: AssessmentPaper,
  request: AssessmentGenerationRequest,
): void {
  const sourceText = `${request.topic}\n${request.notes ?? ''}`;

  for (const question of paper.questions) {
    for (const material of question.materials ?? []) {
      if (material.type === 'image' && !wasImageUrlExplicitlySupplied(sourceText, material.uri)) {
        throw new RetryableGenerationError(
          `Question ${question.id} image URL was not supplied in the topic or notes.`,
        );
      }
    }
  }
}

function wasImageUrlExplicitlySupplied(input: string, uri: string): boolean {
  let index = input.indexOf(uri);

  while (index >= 0) {
    const trailingText = input.slice(index + uri.length);
    const nextCharacter = Array.from(trailingText)[0];
    if (
      nextCharacter === undefined
      || /[\s<>"'`)\]}，。；：！？、）】]/u.test(nextCharacter)
      || /\p{Script=Han}/u.test(nextCharacter)
    ) {
      return true;
    }
    index = input.indexOf(uri, index + 1);
  }

  return false;
}

function parseAssessmentPaper(content: string): AssessmentPaper {
  let parsed: unknown;

  try {
    parsed = extractJsonObject(content);
  } catch (error) {
    if (error instanceof Error && error.message === MARKUP_RESPONSE_ERROR) {
      throw error;
    }

    throw new RetryableGenerationError(error instanceof Error ? error.message : String(error));
  }

  try {
    const validation = validateAssessmentPaper(parsed);

    if (!validation.ok) {
      throw new RetryableGenerationError(`Generated assessment is invalid: ${validation.errors.join(' ')}`);
    }

    return validation.paper;
  } catch (error) {
    if (error instanceof RetryableGenerationError) {
      throw error;
    }

    throw new RetryableGenerationError(error instanceof Error ? error.message : String(error));
  }
}
