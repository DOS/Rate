#!/usr/bin/env node
// Runs before the Vercel build (vercel.json buildCommand). A production build is
// allowed only when Vercel's Git integration built it from DOS/Rate `main`.
// Everything else, such as `vercel deploy --prod` from a laptop or an agent, or
// promoting a dev preview into production (which rebuilds), fails here.
// Rollback and `vercel promote` of an existing production deployment do not
// rebuild, so they still work. See Docs/Resources/RELEASE.md.

import { pathToFileURL } from 'node:url';

const PRODUCTION_REPO = { owner: 'dos', slug: 'rate', ref: 'main' };

// `onVercel` comes from the --vercel flag that vercel.json passes, because the
// VERCEL variable itself is missing when system env exposure is turned off.
export function checkProductionBuild(env, { onVercel = false } = {}) {
  // Outside Vercel (local dev, GitHub Actions CI) the guard does not apply.
  if (!onVercel && env.VERCEL !== '1')
    return { ok: true, reason: 'not a Vercel build' };

  const target = env.VERCEL_ENV;
  // Fail closed: a Vercel build that hides its environment could be production.
  if (!target) {
    return {
      ok: false,
      reason: 'VERCEL_ENV is not exposed, so the build target is unknown',
    };
  }
  if (target !== 'production') return { ok: true, reason: `${target} build` };

  const provider = env.VERCEL_GIT_PROVIDER ?? '';
  const owner = (env.VERCEL_GIT_REPO_OWNER ?? '').toLowerCase();
  const slug = (env.VERCEL_GIT_REPO_SLUG ?? '').toLowerCase();
  const ref = env.VERCEL_GIT_COMMIT_REF ?? '';
  if (
    provider === 'github' &&
    owner === PRODUCTION_REPO.owner &&
    slug === PRODUCTION_REPO.slug &&
    ref === PRODUCTION_REPO.ref
  ) {
    return { ok: true, reason: 'production build from DOS/Rate main' };
  }
  return {
    ok: false,
    reason:
      `production builds must come from the Git integration on DOS/Rate main ` +
      `(got provider='${provider}', repo='${owner}/${slug}', ref='${ref}')`,
  };
}

// `--vercel` forces the check even if entry detection misses (for example a
// symlinked build directory), so the guard never silently skips on Vercel.
if (
  process.argv.includes('--vercel') ||
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href
) {
  const env = process.env;
  const result = checkProductionBuild(env, {
    onVercel: process.argv.includes('--vercel'),
  });
  // Non-secret build metadata only.
  console.log(
    `[production-guard] VERCEL_ENV=${env.VERCEL_ENV ?? ''} ` +
      `git=${env.VERCEL_GIT_PROVIDER ?? ''}:${env.VERCEL_GIT_REPO_OWNER ?? ''}/` +
      `${env.VERCEL_GIT_REPO_SLUG ?? ''}@${env.VERCEL_GIT_COMMIT_REF ?? ''} -> ${result.reason}`
  );
  if (!result.ok) {
    console.error(
      '[production-guard] Refusing to build. Merge the dev to main promotion PR instead; ' +
        'see Docs/Resources/RELEASE.md.'
    );
    process.exit(1);
  }
}
