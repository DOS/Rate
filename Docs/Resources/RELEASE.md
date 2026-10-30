# Release and Production Deploy Runbook

This is the release workflow for `rate.vn`. It follows the same model as DOS/DOS.AI and DOS/DOS.Me: work lands on `dev`, production is `main`, and production is built only by Vercel's Git integration from `main`.

## Branches

| Branch | Role                                                                              | How changes land                                                                                                         |
| :----- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `dev`  | Integration branch and GitHub default branch. Vercel builds it as a Preview.      | Feature PRs, **squash** merge. Back-merges from `main`, **merge commit**.                                                |
| `main` | Production. Every commit on `main` is what `rate.vn` serves or is about to serve. | Only the promotion PR `dev` -> `main`, **merge commit**. Hotfix PRs with the `emergency-hotfix` label, **merge commit**. |

## Normal release

1. Feature PRs go into `dev` as usual: review, green required checks (`Typecheck & Build Monorepo`, `E2E (Playwright)`, `Secret scan (gitleaks)`, `task-claim`), squash merge. `node scripts/ops/merge-when-green.mjs <pr>` writes the squash commit's message itself: the PR title with `(#<pr>)`, then each commit wrapped at 100 characters, with the co-author trailers in a footer. It refuses a PR whose title is not a conventional header or does not fit `<title> (#<pr>)` in 100 characters: shorten the title. The promotion PR's `commitlint` check lints the head of `dev`, which is usually that squash commit, so it must pass `commitlint.config.ts` (DOS/Rate#1130).
2. Check `dev` on its Vercel Preview deployment.
3. Open the promotion PR from `dev` itself, not from a copy branch:
   `gh pr create --repo DOS/Rate --base main --head dev --title "chore(release): promote dev to main"`
   List the PRs being released in the body.
4. Wait for the required checks on the promotion PR: `Typecheck & Build Monorepo`, `E2E (Playwright)`, `Secret scan (gitleaks)`, `PR into main comes from dev`, `main must not lead dev`.
   `node scripts/ops/promote.mjs` does steps 3 to 5 in one command: it opens the promotion PR from `dev` (or reuses the open one) with the released PRs listed, then merges it with a merge commit once its checks pass. `--no-merge` leaves it open.
5. Promotions are batched and need no per-release question: the agent promotes at the first checkpoint reached: the backlog runs out, 10 or more PRs are waiting on `dev`, the oldest unpromoted change is more than 24 hours old, or the agent is ending a long working session. Promote only when `dev` head CI is green and no PR is mid-way through fixing a production bug. The agent merges it with a merge commit: `gh pr merge <number> --repo DOS/Rate --merge`. JOY does not merge PRs; never ask JOY to click Merge. **Never squash or rebase a promotion.** Squashing creates a commit on `main` that can never exist on `dev`, and the next promotion then diffs from a stale merge base.
6. Vercel builds `main` and assigns `rate.vn`. Verify the live revision (the deployment's Git SHA equals `main`), `/api/health`, the main routes and a browser check before calling the release done. `node scripts/ops/verify-live.mjs --wait 900` checks the first three: `/api/health` reports the deployment's `commit`, which must equal `main`, and `checks.database` must be `ok`. It re-reads `main` on every poll. Only when the live commit is behind `main` does it print `vercel promote <main's production deployment> --scope metados`; when live is ahead of or diverged from `main` it says to do nothing. Never redeploy or promote a deployment built from another commit: that rolls the release back. `promote` does not rebuild, and it turns production domain auto-assignment back on after a `vercel rollback`. To check a build before it takes traffic, create it from Git with `autoAssignCustomDomains: false` (Vercel API `POST /v13/deployments` with `gitSource` ref `main` and `target: "production"`), verify it with `vercel curl --deployment <id>`, then `vercel promote <id>`. Promoting an existing production deployment does not rebuild.
7. Optional, after verify-live passes: warm the sitemap pages so visitors do not pay the cold render (Vercel keeps ISR per deployment, so every page is cold after a promote; a product page MISS takes 5-6 s, DOS/Rate#1344). `node scripts/ops/warm-sitemap.mjs --base-url https://rate.vn --check` reads `/sitemap.xml` and sends one plain GET to each page on that origin (no query strings, no credentials, redirects not followed, at most 4 at a time, a 30 s timeout, one retry on a timeout, a network error or a 5xx; the sitemap read is retried the same way), then prints each URL's status, `X-Vercel-Cache` (and `x-vercel-mitigated` when Vercel challenged the request) and time to first byte and a summary; `--check` reads every URL once more and lists those not served from the cache yet (`X-Vercel-Cache` other than `HIT`, `STALE`, `PRERENDER` or `REVALIDATED`); a URL failing in that pass (an error or a 4xx/5xx) counts as an error. It exits 1 only when a URL still fails after its retry, answers a 4xx, or the sitemap cannot be read (or is a sitemap index); a 5xx or timeout on the first (cold) request that the retry answers is counted as `cold`, not an error. The host is never assumed: `--base-url` is required. Run by whoever promotes; not wired into CI (DOS/Rate#1352).

## Function region (`sin1`)

Functions run in `sin1` (Singapore), next to the shared Supabase project (`ap-southeast-1`), set by `"regions": ["sin1"]` in `vercel.json`. In `iad1` every database round trip crossed the Pacific, at about 220 ms each (DOS/Rate#1217). The region belongs to each deployment, so it changes with the first promotion that carries it, and a rollback to an older deployment brings `iad1` back.

The promotion that first carries `sin1` (or any later region change) needs these steps:

1. **Before the promote:** record the `iad1` baseline on `rate.vn`. Previews have no database env and cannot measure the switch.
   - The `X-Vercel-Id` header of a `MISS`, for example `/smartphones`: `hkg1::iad1::…`.
   - The `render reads` lines (`vercel logs --scope metados --project rate --since 20m --query 'render reads'`) for the first render of one product page and one merchant page.
   - The `Server-Timing` header of `/api/v1/rate/products?category=smartphones&limit=20&probe=<random>`. `probe` skips the CDN. The header lists only reads that reach the database, so it is empty when the data cache answers. On 2026-10-30 two such probes returned none, so check that it appears before relying on it.
   - TTFB for those pages, `MISS` and then `HIT`.
2. Promote, then run verify-live as in step 6. `/api/health` must report `checks.database` `ok` from the new region.
3. **Warm the sitemap: required this time.** The Vercel Data Cache belongs to its region, so after the switch both the ISR pages and the data reads start cold everywhere: `node scripts/ops/warm-sitemap.mjs --base-url https://rate.vn --check`.
4. **Check the switch:**
   - `X-Vercel-Id` of a `MISS` now reads `…::sin1::…`.
   - Repeat the step-1 measurements on the same pages, cold first. Expect the `render reads` totals and the `Server-Timing` steps to drop several-fold, and the cold product render to land near or under 2 s.
   - Post the before/after table on DOS/Rate#1217 and #1344.
5. **If something regresses** (database errors, slower renders): roll back to the last `iad1` production deployment, as in Rollback below, and revert `regions` in a PR to `dev`.

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
