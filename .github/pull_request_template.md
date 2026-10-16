# PR Title

<!-- Use Conventional Commits: feat(scope): short description -->

## Summary
- What changed?
- Why?

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