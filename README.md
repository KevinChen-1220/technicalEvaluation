# SkillScope

SkillScope is an Expo mobile app for generating ability assessments from any topic. Users configure their own OpenAI-compatible model provider, generate a complete 50-question or 100-question assessment, answer on device, and receive local scoring plus wrong-answer explanations.

## Features

- OpenAI-compatible configuration: Base URL, API Key, Model
- Dedicated Settings screen for model provider configuration
- No backend service
- 50-question and 100-question assessment generation
- Single-choice, multiple-choice, and true/false questions
- Local scoring after generation
- Knowledge-point breakdown
- Wrong-answer review with detailed explanations

## Privacy Model

The app does not run a backend. Your API key is stored on device with Expo SecureStore. Assessment topics and generation prompts are sent directly from your device to the model provider you configure.

## Development

```bash
npm install
npm test
npm run typecheck
npm run start
```

Use **Use Sample Paper** in the app to test the full answering and scoring flow without calling a model provider.
