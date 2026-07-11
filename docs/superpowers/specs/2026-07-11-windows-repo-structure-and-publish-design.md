# Windows Repo Structure and Publish Design

## Context

The project was moved from macOS to Windows mid-development. The real Git repository currently lives one directory too deep at `E:\Project\technicalEvaluation\technicalEvaluation`, while the workspace root is `E:\Project\technicalEvaluation`. The extracted zip also includes a `__MACOSX` metadata directory.

The repository contains a previous superpowers design and implementation plan for the SkillScope Expo assessment app, but no application code yet. It also contains a linked worktree whose `.git` pointer still references `/Users/kevinchen/Documents/Codex/technicalEvaluation`, so the worktree is unusable on Windows.

## Goal

Normalize the project so `E:\Project\technicalEvaluation` is the repository root, remove macOS extraction artifacts, recreate a usable Windows implementation worktree, continue the existing implementation plan, and publish the completed project to GitHub.

## Design

Use the current inner repository as the source of truth. Move its contents, including `.git`, `docs`, and `.gitignore`, up one level into the workspace root. Remove the empty nested `technicalEvaluation` directory and the `__MACOSX` metadata directory after verifying their resolved paths are inside the workspace root.

After the move, repair Git metadata with `git worktree prune` so the stale macOS worktree record no longer blocks branch usage. Recreate a project-local `.worktrees/dynamic-assessment-app` linked worktree on the existing `dynamic-assessment-app-implementation` branch, keeping `.worktrees/` ignored.

Continue implementation from the existing plan in `docs/superpowers/plans/2026-07-09-dynamic-assessment-app.md`. The app remains an Expo + React Native + TypeScript project with local scoring, OpenAI-compatible model configuration, SecureStore for API keys, and deterministic tests.

## GitHub Publishing

After implementation and verification pass, create a GitHub repository using the connected local GitHub tooling. Add the new repository as `origin`, push the main branch and implementation branch, then open a draft pull request or publish the completed default branch depending on the final branch state.

## Acceptance Criteria

- `E:\Project\technicalEvaluation` is a Git repository root.
- There is no extra nested project wrapper directory.
- `__MACOSX` artifacts are removed from the workspace.
- `git worktree list` shows only valid Windows paths.
- The implementation branch can be checked out or used through a linked worktree.
- The SkillScope implementation plan can resume without path errors.
- The project is pushed to GitHub after verification succeeds.
