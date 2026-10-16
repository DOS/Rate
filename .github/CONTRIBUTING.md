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
- Install deps: `pnpm install` (pnpm 10; `preinstall` rejects npm and yarn)
- Build the shared schemas first: `pnpm --filter @repo/shared-data build`
- Web dev server: `pnpm --filter @repo/web dev` (http://localhost:3000)
- Per package, as in CI (`.github/workflows/ci.yml`):
  - `pnpm --filter @repo/crawlers build|test|lint|test:dist`
  - `pnpm --filter @repo/extension build|test`
  - `pnpm --filter @repo/web typecheck|lint|test|build`
- Lint: errors fail CI, warnings do not

## Shared Data Contracts
- Define schemas (Zod/OpenAPI) in `packages/shared-data`
- Backend publishes contract changes (semver); frontend bumps version
- Mark breaking API changes with label and in PR description

## Environment & Tools
- Node.js 22+, pnpm 10.34.5, TypeScript 7 (`tsc`; ESLint runs on the TypeScript 6 API, see `.pnpmfile.cjs`)
- Database: Supabase Cloud PostgreSQL 17, `rate` schema. Migrations live only in DOS/DOS.Me; never run DDL from this repo
- Env examples: `apps/web/.env.example`, `apps/importer/.env.example`
- Anti-bot, captcha and proxy code belongs in the private DOS/Rate-Services repo, never here

Thanks for contributing!

