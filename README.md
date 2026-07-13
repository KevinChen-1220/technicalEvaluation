# SkillScope

SkillScope is an Expo mobile app for generating ability assessments from any topic. Users configure their own OpenAI-compatible model provider, generate a complete 50-question or 100-question assessment, answer on device, and receive local scoring plus wrong-answer explanations.

## Features

- OpenAI-compatible configuration: Base URL, API Key, Model
- Dedicated Settings tab for model provider configuration
- SQLite-backed local history and in-progress assessment drafts
- No backend service
- 50-question and 100-question assessment generation
- Single-choice, multiple-choice, and true/false questions
- Local scoring after generation
- Knowledge-point breakdown
- Wrong-answer review with detailed explanations
- History replay with previous selections, correct answers, and explanations
- Draft recovery for generated assessments before submission

## Privacy Model

The app does not run a backend. Assessment drafts, answers, results, and non-secret model settings are stored in a local SQLite database. Your API key is stored with Expo SecureStore when available, with a local fallback for web preview environments. Assessment topics and generation prompts are sent directly from your device to the model provider you configure.

## Development

```bash
npm install
npm test
npm run typecheck
npm run start
```

Use **Use Sample Paper** in the app to test the full answering and scoring flow without calling a model provider.
