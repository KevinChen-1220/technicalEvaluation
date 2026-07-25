# SkillScope Open Source Release Design

## Context

SkillScope is an Expo and React Native assessment app that lets users bring an
OpenAI-compatible model configuration, generate 50- or 100-question assessments,
answer locally, and review persisted results. The source is already pushed to
`KevinChen-1220/technicalEvaluation`, but the repository is private and lacks the
files, automation, metadata, and public web entry point expected of an open
source project.

The current worktree is clean. A scan of tracked files and Git history found no
common real API key, GitHub token, Google API key, or private-key signatures.
Runtime model credentials are entered by users and are not committed.

## Goals

- Release the project under the MIT License.
- Make the repository understandable and welcoming to users and contributors.
- Prevent regressions with automated tests, type checking, and web export checks.
- Publish the Expo web build to GitHub Pages after each successful push to
  `main`.
- Improve repository discovery and public-page SEO without adding a backend,
  paid service, custom domain, or analytics.
- Preserve the existing local-first privacy model.

## Approaches Considered

### Source-only release

Add a license and basic README, then make the repository public. This has the
smallest implementation cost, but visitors cannot try the product and search
engines have little product content to index.

### Repository plus GitHub Pages

Use the repository as the project home and publish a static Expo web build with
GitHub Actions. This adds a live demo, stable project URL, social metadata, and
repeatable deployment while keeping all infrastructure inside GitHub.

This is the selected approach.

### Dedicated marketing site and custom domain

Build a separate SEO-focused site and host it on a dedicated platform. This can
provide better content SEO and routing, but it introduces another codebase,
account, deployment path, and possible cost before the project has demonstrated
that need.

## Repository Presentation

The repository will use the public name **SkillScope** while retaining the
existing repository slug to avoid breaking the current remote. GitHub metadata
will include a concise description, the GitHub Pages URL, and focused topics:
`expo`, `react-native`, `typescript`, `assessment`, `quiz`, `llm`,
`openai-compatible`, `sqlite`, and `local-first`.

The README will become the primary project page. It will include:

- a concise value proposition and hosted demo link;
- feature and privacy summaries;
- screenshots or a product preview generated from the real app;
- supported platforms and prerequisites;
- setup, test, build, and local run commands;
- model-provider configuration guidance without real credentials;
- architecture and local-storage behavior;
- contribution, security, license, and project-status links.

Repository community health files will define expected behavior and maintenance:

- `LICENSE` with the MIT terms and copyright holder `Kevin Chen`;
- `CONTRIBUTING.md` with setup, test, commit, and pull-request guidance;
- `CODE_OF_CONDUCT.md` using Contributor Covenant 2.1;
- `SECURITY.md` with private vulnerability-reporting instructions through
  GitHub Security Advisories and a warning not to open public credential issues;
- issue forms for bug reports and feature requests;
- a pull-request template with validation and privacy checks.

## Web Publishing And SEO

Expo will export a single-page web build to `dist`. The project repository is
hosted below `/technicalEvaluation`, so Expo's web base URL will use that exact
path to keep JavaScript and asset URLs valid on GitHub Pages.

A custom `public/index.html` will preserve Expo's required root element and add:

- a descriptive title and meta description;
- canonical URL;
- Open Graph and Twitter card metadata;
- theme color and viewport metadata;
- links to the web manifest, favicon, and robots file.

Static public assets will include:

- favicon and install icons derived from a simple SkillScope brand mark;
- `manifest.json` for installable app metadata;
- `robots.txt` allowing indexing and referencing `sitemap.xml`;
- `sitemap.xml` containing the GitHub Pages URL;
- a social preview image sized for link sharing.

The static HTML can describe the product before JavaScript loads, but the actual
assessment interface remains the first interactive screen. No tracking,
analytics, cookies, or remote fonts will be added.

## Automation

Two GitHub Actions workflows will be used:

1. **CI** runs on pushes and pull requests, installs dependencies with
   `npm ci`, runs Jest, runs TypeScript checking, and verifies that Expo can
   export the web build.
2. **Pages** runs on successful pushes to `main`, exports `dist`, uploads the
   Pages artifact, and deploys it with GitHub's official Pages actions.

Dependabot will propose monthly npm and GitHub Actions updates with conservative
grouping. Generated `dist` output remains ignored and is never committed.

## Privacy And Security

The repository will not include model API keys, provider credentials, generated
assessment history, local SQLite databases, `.env` files, Expo state, or build
artifacts. `.gitignore` will explicitly cover common environment and credential
files while allowing a future `.env.example`.

The README and security policy will state that browser storage is scoped to the
site origin and that the web fallback may store an API key in browser-local
storage when secure native storage is unavailable. The hosted demo therefore
should be used only on a trusted device with a user-controlled provider key.

Before public visibility is changed, the current tree and full Git history will
be scanned again for common credential formats.

## GitHub Release Sequence

1. Add and verify all documentation, assets, metadata, and workflows locally.
2. Commit and push the release preparation to `main`.
3. Change repository visibility from private to public.
4. Configure GitHub Pages to deploy through Actions.
5. Update repository description, homepage, and topics.
6. Observe CI and Pages runs through completion.
7. Verify the repository and hosted demo are publicly accessible without
   authentication.

The repository remains private until the release preparation is pushed and the
final secret scan passes.

## Verification

Local verification must include:

- `npm test -- --runInBand`;
- `npm run typecheck`;
- `npm run build:web`;
- inspection of generated HTML for title, description, canonical, Open Graph,
  manifest, robots, and sitemap references;
- inspection of generated asset URLs for the repository base path;
- a repeated current-tree and Git-history secret scan.

Remote verification must include:

- successful CI and Pages workflow runs;
- repository visibility reported as `PUBLIC`;
- unauthenticated HTTP access to the repository and Pages URL;
- correct GitHub description, homepage, topics, license detection, and community
  files.

## Out Of Scope

- a custom domain;
- EAS Hosting or native app-store releases;
- analytics, telemetry, advertising, or cookies;
- a separate marketing application;
- backend proxying or centrally managed model credentials;
- semantic versioning and packaged binary releases before the first stable
  native build.
