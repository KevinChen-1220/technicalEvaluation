# SkillScope Open Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish SkillScope as a secure, discoverable MIT-licensed project with a continuously deployed GitHub Pages demo.

**Architecture:** Keep the application local-first and backend-free. Add repository community files and GitHub automation at the root, place static web metadata in `public`, configure Expo's repository base path in `app.json`, and let GitHub Actions build and deploy the ignored `dist` artifact.

**Tech Stack:** Expo SDK 53, React Native 0.79, TypeScript 5.8, Jest 29, GitHub Actions, GitHub Pages

## Global Constraints

- Release under the MIT License with copyright holder `Kevin Chen`.
- Retain repository slug `technicalEvaluation` and public product name `SkillScope`.
- Use `https://kevinchen-1220.github.io/technicalEvaluation/` as the canonical public demo URL.
- Do not add a backend, analytics, cookies, remote fonts, paid services, or a custom domain.
- Never commit model credentials, local databases, generated assessments, `.env` files, Expo state, or `dist`.
- The hosted web demo must warn that browser-local API-key storage is suitable only on a trusted device.
- Keep application behavior unchanged except for public web metadata and branding assets.

---

### Task 1: Repository License And Community Health

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: project setup commands from `package.json`
- Produces: GitHub-detected license, contribution policy, security policy, issue forms, and pull-request checklist

- [ ] **Step 1: Add the MIT license and project policies**

Write the standard MIT text with `Copyright (c) 2026 Kevin Chen`.
Document `npm install`, `npm test -- --runInBand`, `npm run typecheck`, and
`npm run build:web` in `CONTRIBUTING.md`. Use Contributor Covenant 2.1 in
`CODE_OF_CONDUCT.md`. Direct vulnerability reports to the repository's private
Security Advisory flow in `SECURITY.md`.

- [ ] **Step 2: Add structured contribution templates**

Create YAML issue forms that request reproduction steps, platform, browser or
device, expected behavior, actual behavior, and confirmation that reports do
not contain API keys. Disable blank issues. Add a pull-request checklist for
tests, type checking, web export, privacy, and documentation.

- [ ] **Step 3: Harden ignored local files**

Add these patterns without removing existing ignores:

```gitignore
.env
.env.*
!.env.example
*.db
*.db-journal
*.sqlite
*.sqlite3
web-build/
```

- [ ] **Step 4: Verify community files**

Run:

```powershell
git diff --check
rg -n "API key|Security Advisories|npm run build:web" CONTRIBUTING.md SECURITY.md .github
```

Expected: no whitespace errors; privacy and validation guidance appears in the
relevant files.

- [ ] **Step 5: Commit**

```powershell
git add LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github .gitignore
git commit -m "docs: add open source community standards"
```

### Task 2: Public Web Metadata And Brand Assets

**Files:**
- Create: `public/index.html`
- Create: `public/manifest.json`
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`
- Create: `public/favicon.svg`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/social-preview.png`
- Create: `scripts/verify-web-metadata.mjs`
- Modify: `app.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: Expo's custom HTML template contract with `<div id="root"></div>`
- Produces: `npm run build:web`, an Expo export rooted at `/technicalEvaluation`, install metadata, search metadata, and link-preview metadata

- [ ] **Step 1: Add a web metadata verification test**

Create `scripts/verify-web-metadata.mjs` that reads `dist/index.html`,
`dist/manifest.json`, `dist/robots.txt`, and `dist/sitemap.xml`; asserts the
canonical URL, title, description, Open Graph image, Twitter card, manifest,
root element, and `/technicalEvaluation/` asset prefix; and exits non-zero with
an actionable message when any field is absent.

- [ ] **Step 2: Verify the metadata test fails before implementation**

Run:

```powershell
npm run build:web
node scripts/verify-web-metadata.mjs
```

Expected: failure because the custom public metadata does not exist yet.

- [ ] **Step 3: Configure Expo's static repository path**

Set these values in `app.json`:

```json
{
  "expo": {
    "description": "Generate local-first skill assessments with your own OpenAI-compatible model.",
    "experiments": {
      "baseUrl": "/technicalEvaluation"
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./public/icon-192.png"
    }
  }
}
```

Add scripts to `package.json`:

```json
{
  "build:web": "expo export --platform web",
  "verify:web": "node scripts/verify-web-metadata.mjs"
}
```

- [ ] **Step 4: Add metadata and crawl files**

Base `public/index.html` on Expo's Metro template. Keep its reset styles and
`<div id="root"></div>`, then add:

```html
<title>SkillScope - AI-Powered Skill Assessments</title>
<meta name="description" content="Generate 50- or 100-question skill assessments with your own OpenAI-compatible model, then score and review them locally." />
<link rel="canonical" href="https://kevinchen-1220.github.io/technicalEvaluation/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SkillScope" />
<meta property="og:title" content="SkillScope - AI-Powered Skill Assessments" />
<meta property="og:description" content="Generate, complete, and review local-first skill assessments with your own model provider." />
<meta property="og:url" content="https://kevinchen-1220.github.io/technicalEvaluation/" />
<meta property="og:image" content="https://kevinchen-1220.github.io/technicalEvaluation/social-preview.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="manifest" href="/technicalEvaluation/manifest.json" />
```

Create a matching manifest with `start_url` and `scope` set to
`/technicalEvaluation/`, `display` set to `standalone`, theme color `#1E7A68`,
and 192px and 512px icons. Allow indexing in `robots.txt` and reference the
canonical URL in `sitemap.xml`.

- [ ] **Step 5: Create restrained SkillScope assets**

Create a simple high-contrast scope/check brand mark using the existing
`#1E7A68`, white, `#1F2933`, and `#F5F7FA` palette. Export square 192px and
512px PNG icons, plus a 1280x640 social image containing the mark, SkillScope
name, one-line product description, and a real app-interface preview. Keep the
source mark in `public/favicon.svg`.

- [ ] **Step 6: Rebuild and verify metadata**

Run:

```powershell
npm run build:web
npm run verify:web
npx expo config --type public
```

Expected: all metadata checks pass; Expo reports the base URL and favicon with
no secrets in public config.

- [ ] **Step 7: Commit**

```powershell
git add public scripts/verify-web-metadata.mjs app.json package.json
git commit -m "feat: add web publishing metadata"
```

### Task 3: README And Project Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: canonical demo URL, repository community files, current app behavior, current storage implementation
- Produces: primary user and contributor entry point for GitHub and search engines

- [ ] **Step 1: Rewrite the README around the public project**

Add:

- project name, concise promise, screenshot/social preview, and live demo;
- status badges for CI, Pages, MIT, Expo, and TypeScript;
- feature, privacy, and browser-storage warnings;
- prerequisites and exact setup commands;
- sample-paper and provider-configuration instructions;
- local SQLite and SecureStore/browser fallback explanation;
- high-level source tree and data flow;
- testing, web export, contribution, security, and license links;
- project status noting that native store releases are not yet published.

Do not claim support or deployment that has not been verified.

- [ ] **Step 2: Check links and commands**

Run:

```powershell
rg -n "github.io/technicalEvaluation|npm run build:web|SECURITY.md|MIT" README.md
npm test -- --runInBand
npm run typecheck
```

Expected: public URL and policy links are present; tests and type checking pass.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: prepare SkillScope public README"
```

### Task 4: CI, Pages, And Dependency Automation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: `npm ci`, `npm test -- --runInBand`, `npm run typecheck`, `npm run build:web`, `npm run verify:web`
- Produces: pull-request quality checks, automatic `main` deployment, monthly dependency update proposals

- [ ] **Step 1: Add continuous integration**

Configure CI for pushes to `main` and pull requests. Use Node 22 with npm cache,
then run:

```yaml
- run: npm ci
- run: npm test -- --runInBand
- run: npm run typecheck
- run: npm run build:web
- run: npm run verify:web
```

Set minimal `contents: read` permissions and concurrency cancellation.

- [ ] **Step 2: Add GitHub Pages deployment**

Configure a workflow for pushes to `main` and manual dispatch. The build job
checks out source, uses Node 22, runs `npm ci`, tests, type checking, web build,
and metadata verification, then uses `actions/configure-pages@v6`,
`actions/upload-pages-artifact@v5` with `dist`, and
`actions/deploy-pages@v5`. Give the build job exactly `contents: read` and
`pages: read`; isolate `pages: write` and `id-token: write` to the deploy job;
use the `github-pages` environment.

- [ ] **Step 3: Add Dependabot**

Schedule monthly npm and GitHub Actions updates, limit each ecosystem to five
open pull requests, and group non-major npm development updates.

- [ ] **Step 4: Validate workflow syntax and local equivalents**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:web
npm run verify:web
git diff --check
```

Expected: all commands pass and workflow YAML contains the official Pages
actions with pinned major versions.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows .github/dependabot.yml
git commit -m "ci: add quality and Pages workflows"
```

### Task 5: Final Security Audit And GitHub Publication

**Files:**
- Modify: no source files expected

**Interfaces:**
- Consumes: verified commits on local `main`
- Produces: public repository, repository metadata, enabled Pages deployment, and publicly accessible demo

- [ ] **Step 1: Run final local verification**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:web
npm run verify:web
npx expo config --type public
git diff --check
git status --short --branch
```

Expected: all checks pass and the worktree is clean.

- [ ] **Step 2: Repeat secret scans**

Scan the current tree and all commits for common OpenAI, GitHub, Google, AWS,
Slack, Stripe, generic bearer token, and private-key formats. Print only commit
hashes and file paths for matches, never token values.

Expected: no real credential signatures. Test placeholders such as
`test-api-key` are acceptable only in test files.

- [ ] **Step 3: Push prepared `main`**

```powershell
git push origin main
```

Expected: remote `main` reaches the verified local commit.

- [ ] **Step 4: Make the repository public**

Run:

```powershell
gh repo edit KevinChen-1220/technicalEvaluation --visibility public --accept-visibility-change-consequences
```

Immediately verify:

```powershell
gh repo view KevinChen-1220/technicalEvaluation --json visibility,url
```

Expected: `visibility` is `PUBLIC`.

- [ ] **Step 5: Enable and verify private vulnerability reporting**

Enable the private reporting channel documented in `SECURITY.md`:

```powershell
gh api --method PUT repos/KevinChen-1220/technicalEvaluation/private-vulnerability-reporting
gh api repos/KevinChen-1220/technicalEvaluation/private-vulnerability-reporting --jq '.enabled'
```

Open the authenticated private report form at
`https://github.com/KevinChen-1220/technicalEvaluation/security/advisories/new`
and confirm that the vulnerability report form renders.

Expected: the API reports `true` and the private report form is reachable.

- [ ] **Step 6: Configure repository discovery metadata**

Set:

- description: `Local-first AI skill assessments powered by your own OpenAI-compatible model.`
- homepage: `https://kevinchen-1220.github.io/technicalEvaluation/`
- topics: `expo`, `react-native`, `typescript`, `assessment`, `quiz`, `llm`,
  `openai-compatible`, `sqlite`, `local-first`
- features: issues enabled, wiki disabled

- [ ] **Step 7: Enable Pages through GitHub Actions**

Use the GitHub Pages API to create or update the Pages site with
`build_type: workflow`. If the first Pages workflow has not started
automatically, dispatch `.github/workflows/pages.yml`.

- [ ] **Step 8: Observe remote checks**

Watch the CI and Pages runs to terminal status:

```powershell
gh run list --repo KevinChen-1220/technicalEvaluation --limit 10
```

For active runs, use `gh run watch <run-id> --repo
KevinChen-1220/technicalEvaluation --exit-status`.

Expected: CI and Pages finish successfully.

- [ ] **Step 9: Verify the public release**

Verify unauthenticated HTTP 200 access to:

- `https://github.com/KevinChen-1220/technicalEvaluation`
- `https://kevinchen-1220.github.io/technicalEvaluation/`
- `https://kevinchen-1220.github.io/technicalEvaluation/manifest.json`
- `https://kevinchen-1220.github.io/technicalEvaluation/robots.txt`
- `https://kevinchen-1220.github.io/technicalEvaluation/sitemap.xml`

Inspect the hosted HTML for canonical, Open Graph, Twitter card, manifest, and
repository-prefixed bundle URLs. Confirm GitHub detects MIT and displays the
description, homepage, topics, contributing guide, code of conduct, and security
policy.

- [ ] **Step 10: Record final state**

Report the public repository URL, live demo URL, final commit, workflow results,
local verification totals, and any residual limitations. Do not claim GitHub
Pages is live until the public URL returns the verified app.
