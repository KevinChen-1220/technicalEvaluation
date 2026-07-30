# Rich Questions and Inline Review Design

## Goal

Extend SkillScope so generated and persisted assessments can contain structured study materials, long questions remain usable on mobile, draft sessions resume at the first unanswered question, and completed results show each wrong question with its explanation inline.

## Scope

This change covers four connected parts of the assessment experience:

1. Structured question materials: text passages, remote images, tables, and simple bar charts.
2. Mobile scrolling for long questions and oversized tables.
3. Draft resume positioning.
4. Inline wrong-answer review on the result screen.

It does not add image upload, OCR, HTML rendering, Markdown rendering, a general charting engine, or binary image storage.

## Data Model

`AssessmentQuestion.prompt` remains the required primary question text so all existing papers and database rows stay compatible. A question may additionally contain:

```ts
type QuestionMaterial =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      uri: string;
      alt: string;
      caption?: string;
      aspectRatio?: number;
    }
  | {
      type: 'table';
      caption?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      type: 'bar_chart';
      title?: string;
      unit?: string;
      items: Array<{
        label: string;
        value: number;
        displayValue?: string;
      }>;
    };

type AssessmentQuestion = {
  // existing fields
  materials?: QuestionMaterial[];
};
```

The existing SQLite schema stores the complete paper as JSON, so no schema migration is needed. Old papers without `materials` render exactly as before.

## Generation Contract

The generation prompt will describe all four material block shapes and include them in its JSON example. The model should:

- use text blocks for shared passages or supporting data;
- use table blocks for structured rows and columns;
- use bar chart blocks when data is naturally represented as non-negative bars;
- use image blocks only when a real HTTPS image URL was explicitly supplied in the topic or notes;
- never invent an image URL;
- omit `materials` for ordinary text-only questions.

Validation will reject malformed blocks before a paper is accepted:

- text must be non-empty;
- image URI must use HTTPS, alt text must be non-empty, and optional aspect ratio must be finite and between `0.25` and `4`;
- tables must contain at least one column and one row, every cell must be a string, and every row must match the column count;
- bar charts must contain at least two items, labels must be non-empty, and values must be finite and non-negative.

Malformed generated materials are treated like other assessment validation failures and receive the existing one-time complete-generation retry.

## Rendering

A focused `QuestionMaterials` component renders the optional blocks between the question prompt and the answer options.

- Text blocks use readable body typography.
- Images use the declared aspect ratio or `16 / 9`, `contain` resizing, alt-based accessibility text, and a visible fallback message if loading fails.
- Tables use a horizontal `ScrollView` inside the screen's vertical scroll container. Header and body cells have stable minimum widths.
- Bar charts render locally with native views, labels, values, and proportional bars. They do not require a charting dependency.

The answer screen remains a vertically scrolling screen. It receives a reset key based on the current question ID so moving between questions returns the scroll position to the top. This prevents a long previous question from leaving the next question partially off-screen.

## Draft Resume

Opening a draft computes the first question whose answer is absent or an empty array. The answer screen opens at that index.

If every question has an answer but the record is still a draft, the screen opens at the first question so the user can review the paper and submit it. Completed history records continue opening on the result screen.

## Inline Wrong-Answer Review

The separate `review` screen and `reviewQuestionId` navigation state are removed.

The result screen keeps the score summary and knowledge-point metrics. Its wrong-answer section directly renders every wrong question in paper order. Each entry includes:

- the original numbered prompt and all structured materials;
- all original options;
- the user's selected options;
- clear option states for selected-wrong and correct;
- a compact line for unanswered questions;
- an explanation panel directly below the options containing the correct answer and the original explanation.

The wrong-question list is read-only. It does not modify saved answers or scoring. A completed history record uses the same result layout and saved answers as a newly completed assessment.

## Error Handling

- An image load failure affects only that image block; the rest of the question remains usable.
- Invalid generated material blocks prevent persistence and trigger the existing classified retry.
- Missing optional materials never prevent old records from opening.
- Draft resume falls back to index `0` if paper or answer data is inconsistent.

## Testing

Automated tests will cover:

- validation acceptance and rejection for every material block type;
- generation prompt instructions and rich-material parsing;
- first-unanswered draft index, including empty and fully answered drafts;
- question scroll reset key behavior;
- result review model construction in paper order, including unanswered and selected-wrong answers;
- existing scoring, persistence, language, and generation regressions.

Visual verification will use mobile-sized browser screenshots for:

- a long rich question with a table, image fallback, and bar chart;
- scrollable question content and top reset after navigation;
- a completed result with wrong questions and explanations expanded inline;
- a resumed draft opening at its first unanswered question.

