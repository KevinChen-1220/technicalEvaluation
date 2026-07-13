import { createChatCompletion, type ChatMessage } from '../../services/aiClient';
import type { ModelConfig } from '../config/modelConfig';
import type { AssessmentPaper } from './types';
import { validateAssessmentPaper } from './validation';

export type AssessmentGenerationRequest = {
  topic: string;
  questionCount: 50 | 100;
  notes?: string;
};

export type CompletionFn = (config: ModelConfig, messages: ChatMessage[]) => Promise<string>;

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
  "questions": []
}

Requirements:
- Generate exactly ${request.questionCount} questions.
- Mix these question types: single_choice, multiple_choice, true_false.
- Use stable option IDs such as A, B, C, and D.
- Include correctOptionIds for every question.
- Include one detailed explanation for every question.
- Include one concise knowledgePoint for every question.
- Include difficulty as easy, medium, or hard.
- Scoring levels must cover 0 through 100 percent without gaps.
- Single choice and true/false questions must have exactly one correct answer.
- Multiple choice questions must have at least one correct answer.
${notes}`;
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();

  if (looksLikeMarkup(trimmed)) {
    throw new Error('Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.');
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Model response did not contain a JSON object.');
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new Error('Model response contained a JSON-looking block, but it was not valid JSON.');
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
  const content = await completionFn(config, [
    { role: 'system', content: 'You generate deterministic, valid JSON assessment papers for mobile apps.' },
    { role: 'user', content: buildAssessmentPrompt(request) },
  ]);
  const parsed = extractJsonObject(content);
  const validation = validateAssessmentPaper(parsed);

  if (!validation.ok) {
    throw new Error(`Generated assessment is invalid: ${validation.errors.join(' ')}`);
  }

  return validation.paper;
}
