# Chinese Generation Language Design

## Goal

Make Chinese the default assessment input language and ensure generated
user-facing assessment content follows the language used in the topic. Notes
can refine content but do not change the output language.

## Root Cause

The assessment screen initializes the topic and notes in English. The generation
prompt is also written in English and does not tell the provider which language
to use for user-facing content. A provider can therefore reasonably return an
English assessment even when the topic is Chinese.

## Design

- Initialize the topic with `iOS 开发能力`.
- Initialize the notes with `兼顾基础知识、调试、架构和边界情况。`.
- Use Chinese placeholders for the topic and notes inputs.
- Add an explicit prompt requirement that all user-facing values follow the
  language used by the topic. The topic is the sole language source; notes do
  not change the output language when they use a different language.
- State that Chinese input must produce Simplified Chinese content.
- State that English input must produce English content, and other languages
  must likewise be preserved.
- Keep JSON property names and enum values such as `single_choice`, `easy`, and
  option IDs in their existing English machine-readable form.

The app will not add a language selector. This keeps the creation flow compact
and lets English or other-language topics continue to produce content in their
own language.

## Data Flow

`App.tsx` supplies the Chinese defaults to `generateAssessment`. The existing
`buildAssessmentPrompt` function embeds the topic and notes, then adds the
language contract before sending the prompt through the configured
OpenAI-compatible provider. Parsing and validation remain unchanged because the
JSON schema keys and enums remain stable.

## Testing

- Add a generator test using a Chinese topic and notes.
- Assert that the prompt requires Simplified Chinese user-facing content.
- Add an English-input test that confirms the rule follows the input language
  instead of globally forcing Chinese.
- Add another-language and mixed topic/notes test to confirm the topic has
  priority and other languages are preserved.
- Test the exported Chinese assessment defaults consumed by the creation page.
- Assert that machine-readable JSON fields and enums stay unchanged.
- Run the complete Jest suite, TypeScript check, and web build.
