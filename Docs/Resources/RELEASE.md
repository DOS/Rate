# Release and Production Deploy Runbook

This is the release workflow for `rate.vn`. It follows the same model as DOS/DOS.AI and DOS/DOS.Me: work lands on `dev`, production is `main`, and production is built only by Vercel's Git integration from `main`.

## Branches

| Branch | Role                                                                              | How changes land                                                                                                         |
| :----- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `dev`  | Integration branch and GitHub default branch. Vercel builds it as a Preview.      | Feature PRs, **squash** merge. Back-merges from `main`, **merge commit**.                                                |
| `main` | Production. Every commit on `main` is what `rate.vn` serves or is about to serve. | Only the promotion PR `dev` -> `main`, **merge commit**. Hotfix PRs with the `emergency-hotfix` label, **merge commit**. |

## Normal release

1. Feature PRs go into `dev` as usual: review, green required checks (`Typecheck & Build Monorepo`, `E2E (Playwright)`, `Secret scan (gitleaks)`, `task-claim`), squash merge. `node scripts/ops/merge-when-green.mjs <pr>` writes the squash commit's message itself: the PR title with `(#<pr>)`, then each commit wrapped at 100 characters, with the co-author trailers in a footer. The promotion PR's `commitlint` check lints the head of `dev`, which is usually that squash commit, so it must pass `commitlint.config.ts` (DOS/Rate#1130).
2. Check `dev` on its Vercel Preview deployment.
3. Open the promotion PR from `dev` itself, not from a copy branch:
   `gh pr create --repo DOS/Rate --base main --head dev --title "chore(release): promote dev to main"`
   List the PRs being released in the body.
4. Wait for the required checks on the promotion PR: `Typecheck & Build Monorepo`, `E2E (Playwright)`, `Secret scan (gitleaks)`, `PR into main comes from dev`, `main must not lead dev`.
   `node scripts/ops/promote.mjs` does steps 3 to 5 in one command: it opens the promotion PR from `dev` (or reuses the open one) with the released PRs listed, then merges it with a merge commit once its checks pass. `--no-merge` leaves it open.
5. Promotions are batched and need no per-release question: the agent promotes at the first checkpoint reached: the backlog runs out, 10 or more PRs are waiting on `dev`, the oldest unpromoted change is more than 24 hours old, or the agent is ending a long working session. Promote only when `dev` head CI is green and no PR is mid-way through fixing a production bug. The agent merges it with a merge commit: `gh pr merge <number> --repo DOS/Rate --merge`. JOY does not merge PRs; never ask JOY to click Merge. **Never squash or rebase a promotion.** Squashing creates a commit on `main` that can never exist on `dev`, and the next promotion then diffs from a stale merge base.
6. Vercel builds `main` and assigns `rate.vn`. Verify the live revision (the deployment's Git SHA equals `main`), `/api/health`, the main routes and a browser check before calling the release done. `node scripts/ops/verify-live.mjs --wait 900` checks the first three: `/api/health` reports the deployment's `commit`, which must equal `main`, and `checks.database` must be `ok`. It re-reads `main` on every poll. Only when the live commit is behind `main` does it print `vercel promote <main's production deployment> --scope metados`; when live is ahead of or diverged from `main` it says to do nothing. Never redeploy or promote a deployment built from another commit: that rolls the release back. `promote` does not rebuild, and it turns production domain auto-assignment back on after a `vercel rollback`. To check a build before it takes traffic, create it from Git with `autoAssignCustomDomains: false` (Vercel API `POST /v13/deployments` with `gitSource` ref `main` and `target: "production"`), verify it with `vercel curl --deployment <id>`, then `vercel promote <id>`. Promoting an existing production deployment does not rebuild.

## Hotfix

1. Branch from `main`: `hotfix/<short-name>`.
2. Open the PR into `main`, add the `emergency-hotfix` label, and merge it with a merge commit once checks pass.
3. Immediately back-merge `main` into `dev` (below). `main must not lead dev` fails until this is done.

## Back-merge `main` into `dev`

1. Create `chore/sync-main-into-dev-<YYYYMMDD>` from `origin/dev`, run `git merge origin/main`, and resolve conflicts in favour of what `dev` already has.
2. If `main`'s commits are already on `dev` in another form (for example a direct copy), `git merge -s ours origin/main` keeps `dev`'s tree and only restores ancestry.
3. Open the PR into `dev` and merge it with **"Create a merge commit"**. A squash would drop the `main` parent and undo the back-merge.

## What is forbidden

- `vercel deploy --prod`, `vercel --prod`, `vercel build --prod` with `--prebuilt`, or any other production build that does not come from the Git integration on `main`. This includes "staged" production builds with `--skip-domain`.
- Promoting a `dev` Preview into production. Vercel rebuilds it with production settings, which bypasses `main`.
- Pushing directly to `main`, or merging a promotion with squash or rebase.

### How this is enforced

- **Build guard:** `vercel.json` runs `scripts/vercel-production-guard.mjs --vercel` before every Vercel build. A production build fails unless `VERCEL_GIT_PROVIDER=github`, the repository is `DOS/Rate` and `VERCEL_GIT_COMMIT_REF=main`. A CLI production upload fails at build time from any branch, `main` included, because Vercel reports no Git source for CLI builds (observed on a remote CLI build: `git=:/@`). So does any other build where Vercel does not report a GitHub source. Preview builds are not affected. Tests: `node --test scripts/vercel-production-guard.test.mjs` (runs in CI).
- **Validate PR Base** (`.github/workflows/validate-pr-base.yml`): a PR into `main` must have head `dev` from this repository, or carry `emergency-hotfix`.
- **Branch Divergence** (`.github/workflows/branch-divergence.yml`): fails when `main` has a non-merge commit that `dev` lacks. `.github/branch-divergence-baseline.txt` should stay empty.
- **GitHub rulesets:** `dev-main-light` blocks deletion and force push on `dev` and `main` and requires `Typecheck & Build Monorepo`, `E2E (Playwright)` and `Secret scan (gitleaks)`. `main-release` on `main` requires a PR, allows only merge commits, and requires the two checks above.

The build guard is a guardrail against mistakes, not a security boundary. Anyone with production deploy rights on the Vercel project can get past it, for example with `--build-env` values that imitate a Git build or by uploading an edited `vercel.json`. Doing that breaks the rule above. The only hard limit is Vercel RBAC: a Developer role without the "Full Production Deployment" permission can reach production only by merging to `main`. Whether the `metados` team's plan offers that control has not been verified yet.

The Vercel project `metados/rate` is connected to GitHub `DOS/Rate` with production branch `main`; every other branch builds as a Preview. The guard was verified on real Git builds: a `dev` Preview logged `git=github:DOS/Rate@dev -> preview build` and the `main` production build logged `git=github:DOS/Rate@main -> production build from DOS/Rate main`. If a future build logs empty Git variables, production builds of `main` fail and the live site keeps serving the previous deployment; fix the guard before the next promotion.

## Rollback

Rollback does not rebuild, so the build guard does not block it. Promote the last known-good **production** deployment back onto the domains:

`vercel rollback <deployment-url-or-id> --scope metados`

Then verify as in step 6 and fix forward through a hotfix PR. Never roll forward by deploying from a local checkout.
