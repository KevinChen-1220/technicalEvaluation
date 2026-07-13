# Question Layout Design

## Goal

Make assessment questions read like normal mobile quiz content by separating progress metadata from the question title.

## Approved Layout

- Answer screen progress line shows only `Question 1 of 50`.
- The question prompt is rendered as an independent title prefixed with the current question number, such as `1. Which Swift keyword...`.
- Difficulty and knowledge point move below the question title as quiet metadata, such as `easy · Memory`.
- Review screen uses the same hierarchy: `Review`, standalone question title, then `difficulty · knowledge point`, followed by answer comparison and explanation.

## Scope

Only `App.tsx` presentation markup and styles change. Scoring, answer capture, generation, settings, and history persistence stay unchanged.

## Verification

- TypeScript check passes.
- Jest suite passes.
- Web smoke confirms the answer page no longer renders `Question 1 of N / easy / KnowledgePoint` and does render `1. <prompt>` plus `easy · KnowledgePoint`.
