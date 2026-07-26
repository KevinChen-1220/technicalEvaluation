# SkillScope

> Generate, take, and review local-first skill assessments with your own OpenAI-compatible model.

[![CI](https://github.com/KevinChen-1220/technicalEvaluation/actions/workflows/ci.yml/badge.svg)](https://github.com/KevinChen-1220/technicalEvaluation/actions/workflows/ci.yml)
[![Pages](https://github.com/KevinChen-1220/technicalEvaluation/actions/workflows/pages.yml/badge.svg)](https://github.com/KevinChen-1220/technicalEvaluation/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-1F7A68.svg)](LICENSE)
[![Expo SDK 53](https://img.shields.io/badge/Expo-SDK%2053-000020.svg?logo=expo)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

![SkillScope assessment interface](public/social-preview.png)

## Demo

Try the public web demo at [SkillScope on GitHub Pages](https://kevinchen-1220.github.io/technicalEvaluation/).

## What It Does

- Creates 50- or 100-question assessments from a topic and optional focus notes.
- Accepts single-choice, multiple-choice, and true/false questions.
- Scores attempts locally, with knowledge-point breakdowns and answer explanations.
- Saves in-progress drafts and completed assessments for later review.
- Connects directly to the OpenAI-compatible provider you choose; SkillScope has no backend.

## Privacy And Storage

SkillScope is local-first and bring-your-own-provider. Your topic, optional notes, and generation prompt are sent directly from your device to the configured model provider. The project does not proxy requests, run a backend, add analytics, or collect assessment data.

- Assessment papers, answers, scores, drafts, and non-secret provider settings (base URL and model) are stored locally in SQLite (`skill_scope.db`).
- On native platforms, the API key is stored with Expo SecureStore when it is available.
- When SecureStore is unavailable, including the web experience, the API key can fall back to browser-local storage for the site origin. Browser local storage is not equivalent to hardware-backed secure storage: anyone who can use that browser profile, and scripts running in that origin, may be able to read it.

Use the web experience only on a trusted personal device. Do not save a provider key in a shared or public browser; prefer a limited, revocable key and clear the site data when you are finished.

## Prerequisites

- Node.js 22 or later, including npm
- An OpenAI-compatible provider endpoint, API key, and model name to generate new assessments
- Expo Go or a local Android/iOS development environment when running on a device

## Get Started

```sh
git clone https://github.com/KevinChen-1220/technicalEvaluation.git
cd technicalEvaluation
npm install
npm run start
```

For a browser session, run:

```sh
npm run web
```

### Try The Built-In Sample

Open the **Assess** tab and choose **Use Sample Paper**. It exercises the answering, scoring, review, draft, and history flows without contacting a model provider or requiring an API key.

### Configure A Provider

1. Open the **Settings** tab.
2. Enter the provider's OpenAI-compatible base URL, such as `https://api.openai.com/v1`.
3. Enter your API key and the model name offered by that provider.
4. Choose **Save**, then **Test** to verify the connection.
5. Return to **Assess**, set a topic and optional notes, choose 50 or 100 questions, and select **Generate**.

Keep credentials out of source code, issues, screenshots, and logs. A provider must expose the OpenAI-compatible `POST /chat/completions` endpoint.

## Architecture

```text
App.tsx
  -> Settings: provider base URL, model, and API key
  -> Assessment: prompt -> configured provider -> validated assessment
  -> Local scoring, explanation review, drafts, and history
  -> SQLite database (assessment records and non-secret settings)
```

| Path | Purpose |
| --- | --- |
| `App.tsx` | React Native application screens and user flow |
| `src/features/assessment/` | Generation, validation, scoring, sample paper, drafts, and history |
| `src/features/config/` | Provider configuration, SecureStore handling, and browser fallback |
| `src/storage/database.ts` | Shared Expo SQLite connection |
| `src/services/aiClient.ts` | Direct OpenAI-compatible chat-completions client |
| `public/` | Web metadata, icons, and the social preview |

## Development And Verification

```sh
npm test -- --runInBand
npm run typecheck
npm run build:web
npm run verify:web
```

`npm run build:web` exports the static web application to the ignored `dist/` directory. `npm run verify:web` validates the generated web metadata and repository base path.

## Project Status

SkillScope is open source, with the GitHub Pages web demo as its current public release. Native App Store and Google Play releases have not been published.

## Contributing, Security, And License

- Read [Contributing](CONTRIBUTING.md) for setup and pull-request expectations.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) when participating.
- Report vulnerabilities privately through the guidance in [Security](SECURITY.md); never include API keys or tokens in public reports.
- SkillScope is available under the [MIT License](LICENSE).
