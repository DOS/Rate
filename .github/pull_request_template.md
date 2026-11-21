# PR Title

<!-- Use Conventional Commits: feat(scope): short description -->

## Summary
- What changed?
- Why?

Closes #<issue>

Claimant: <tool>:<session id>

<!-- task-claim (AGENTS.md section 1): replace the line above with the claimant
scripts/ops/board.mjs printed when this session claimed the issue, for example
claude:local_1234abcd, qwen:5678efgh or antigravity:<conversation id>. -->

## Checklist
- [ ] Build passes: `pnpm --filter <package> build`
- [ ] Type-check passes: `pnpm --filter @repo/web typecheck`
- [ ] Lint passes: `pnpm --filter <package> lint`
- [ ] Tests pass (if applicable): `pnpm --filter <package> test`
- [ ] Docs updated (README/Docs/*)
- [ ] No breaking API changes (or labeled `breaking:api`)

## Screenshots (optional)

## Notes
- Affected areas: `apps/web`, `apps/importer`, `apps/extension`, `packages/*`, `Docs/*`
- Reviewers: @agent-frontend @agent-backend