# Contributing Guide

## Branching
- Use: `feat|fix|chore|docs|refactor/<area>-<short>`
  - Examples: `feat/frontend-profile-card`, `fix/backend-auth-timeout`

## Commits (Conventional Commits)
- `feat(scope): short summary`
- `fix(scope): short summary`
- Body: explain reasoning and impact
- Breaking changes: add `BREAKING CHANGE:` footer

## Pull Requests
- Keep PRs small, focused, and linked to issues/tasks
- Fill the PR template checklist
- Add labels: `area:frontend`, `area:backend`, `breaking:api`, `feature:<name>`

## Code Style
- Prettier + ESLint, TypeScript strict
- Prefer named exports for shared libs
- Avoid disabling lint rules unless justified in PR description

## Workflows
- Install deps: `yarn install`
- Dev: `yarn dev` (or `yarn dev:ui`, `yarn dev:strapi`)
- Build: `yarn build`
- Type-check: `yarn type-check`
- Lint: `yarn lint`
- Test: `yarn test`

## Shared Data Contracts
- Define schemas (Zod/OpenAPI) in `packages/shared-data`
- Backend publishes contract changes (semver); frontend bumps version
- Mark breaking API changes with label and in PR description

## Environment & Tools
- Node.js 22, Yarn 1.22, PowerShell 7
- PostgreSQL 17 via Docker Compose (`apps/strapi`)

Thanks for contributing!

