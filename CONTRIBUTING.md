# Contributing to SkillScope

Thanks for contributing to SkillScope. Please discuss substantial changes in
an issue before opening a pull request.

## Development Setup

1. Fork the repository and create a branch for your change.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Make a focused change and include tests when behavior changes.
4. Before opening a pull request, run:

   ```sh
   npm test -- --runInBand
   npm run typecheck
   npm run build:web
   ```

## Pull Requests

Describe the problem and the solution, keep the scope focused, and update
documentation when user-facing behavior changes. Do not include API keys,
tokens, private user data, or other secrets in source code, issues, pull
requests, screenshots, or logs.

## Community Standards

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
