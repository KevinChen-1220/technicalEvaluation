# SQLite Persistence Design

## Goal

Make local data durable and database-backed. Generated assessments should be saved immediately, answer changes should update the saved draft, completed submissions should update the same record, and model configuration should survive app restarts across supported app surfaces.

## Current Root Cause

- Assessment history currently uses `localStorage` on web and an in-memory fallback when `localStorage` is unavailable. This is not a real database and is not durable on native Expo when no persistent storage adapter exists.
- Completed attempts are only saved inside `submitAnswers()`, so generated papers and in-progress answers are lost if the user exits before submitting.
- Model configuration stores the whole config object in Expo SecureStore. This is appropriate for native API-key storage, but web preview can fail or lose values depending on SecureStore support. Non-secret fields do not need SecureStore.

## Storage Architecture

- Add `expo-sqlite` and create a local SQLite database named `skill_scope.db`.
- Add a small database adapter around the async SQLite API so feature repositories can be tested with memory fakes.
- Store assessments in an `assessments` table:
  - `id TEXT PRIMARY KEY`
  - `paper_json TEXT NOT NULL`
  - `answers_json TEXT NOT NULL`
  - `result_json TEXT`
  - `status TEXT NOT NULL` with values `draft` or `completed`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
  - `submitted_at TEXT`
- Store non-secret model settings in `model_settings`:
  - `id TEXT PRIMARY KEY`
  - `base_url TEXT NOT NULL`
  - `model TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
- Store the API key in SecureStore when available. If SecureStore is unavailable or throws, fall back to a web/local storage key so web preview persists configuration.

## Assessment Data Flow

- On generated paper success or sample paper start, create a draft assessment record immediately.
- While answering, update the current draft record after every answer change with latest `answers` and `updatedAt`.
- On submit, compute `result`, update the same record to `completed`, set `submittedAt`, and keep it in History.
- History should load completed records first, newest by `submittedAt` then `updatedAt`.
- Drafts may appear in History as in-progress records so users can reopen unfinished work later.

## Configuration Data Flow

- Saving settings writes `baseUrl` and `model` to SQLite and writes `apiKey` through a secure-key adapter.
- Loading settings merges SQLite settings and stored API key into the existing `ModelConfig` shape.
- If SQLite has no model settings yet, the loader should still support the old SecureStore JSON object for backward compatibility and migrate it into the new storage on next save.

## Testing

- Repository tests use an in-memory fake database adapter, not SQLite native bindings.
- Tests cover draft creation, answer update, completion update, newest-first listing, config save/load, and secure-key fallback behavior.
- Runtime verification includes `npm test`, `npm run typecheck`, `npx expo config --type public`, and a web smoke that confirms sample paper start creates a History entry before submission.
