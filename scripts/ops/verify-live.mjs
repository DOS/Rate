#!/usr/bin/env node
// Checks that rate.vn serves main: the live deployment's commit (reported by
// /api/health) equals main, the database is readable, and the main routes
// answer 200. Docs/Resources/RELEASE.md step 6.
//
//   node scripts/ops/verify-live.mjs [--wait <seconds>] [--base-url https://rate.vn]
//     [--repo DOS/Rate] [--route /path]...
//
// --wait keeps polling while the only problem is a commit mismatch (the build
// of main is still deploying). On failure it prints the production deployment
// built from main, the only correct redeploy source: on 2026-10-24 a redeploy
// of an older production deployment rolled back a release (DOS/Rate#814).

import { parseArgs } from 'node:util';
import { DEFAULT_REPO, fail, ghJson, isMain, sleep } from './lib.mjs';

export const DEFAULT_ROUTES = [
  '/',
  '/smartphones',
  '/earbuds',
  '/deals',
  '/api/v1/rate/stats',
];
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_MS = 20_000;

/** Problems with the live site; an empty list means it serves main. */
export function evaluateLive({ mainSha, health, routes }) {
  const problems = [];
  if (health.status !== 200) {
    problems.push({
      kind: 'health',
      message: `/api/health returned ${health.status}`,
    });
  }
  if (health.body?.checks?.database !== 'ok') {
    problems.push({
      kind: 'database',
      message: `database check is ${health.body?.checks?.database ?? 'missing'}`,
    });
  }
  const commit = health.body?.commit;
  if (!commit) {
    problems.push({ kind: 'commit', message: '/api/health reports no commit' });
  } else if (commit !== mainSha) {
    problems.push({
      kind: 'commit',
      message: `live commit ${commit.slice(0, 8)} is not main ${mainSha.slice(0, 8)}`,
    });
  }
  for (const r of routes) {
    if (r.status !== 200)
      problems.push({
        kind: 'route',
        message: `${r.path} returned ${r.status}`,
      });
  }
  return problems;
}

/** Still worth waiting: only the commit differs, so a build may be deploying. */
export const onlyCommitMismatch = (problems) =>
  problems.length > 0 && problems.every((p) => p.kind === 'commit');

/** The newest successful Production deployment status of main's commit. */
export function redeploySource(statuses) {
  const ok = statuses.find((s) => s.state === 'success' && s.environment_url);
  return ok?.environment_url ?? null;
}

// One retry after a network error: a single dropped connection is not an
// outage, while an HTTP error status is reported as it is.
async function request(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body = null;
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      await res.arrayBuffer();
    }
    return { status: res.status, body };
  } catch (err) {
    if (attempt < 2) {
      await sleep(2_000);
      return request(url, attempt + 1);
    }
    const cause =
      err instanceof Error ? (err.cause?.code ?? err.name) : 'unknown';
    return { status: `error (${cause})`, body: null };
  }
}

async function readLive(baseUrl, paths) {
  const health = await request(`${baseUrl}/api/health`);
  const routes = [];
  for (const path of paths) {
    routes.push({ path, status: (await request(`${baseUrl}${path}`)).status });
  }
  return { health, routes };
}

function findRedeploySource(repo, sha) {
  const deployments = ghJson([
    'api',
    `repos/${repo}/deployments?sha=${sha}&environment=Production&per_page=5`,
  ]);
  for (const d of deployments ?? []) {
    const url = redeploySource(
      ghJson([
        'api',
        `repos/${repo}/deployments/${d.id}/statuses?per_page=10`,
      ]) ?? []
    );
    if (url) return url;
  }
  return null;
}

export async function verifyLive({
  repo = DEFAULT_REPO,
  baseUrl = 'https://rate.vn',
  routes = DEFAULT_ROUTES,
  waitMs = 0,
} = {}) {
  const mainSha = ghJson(['api', `repos/${repo}/commits/main`]).sha;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const live = await readLive(baseUrl, routes);
    const problems = evaluateLive({ mainSha, ...live });
    if (problems.length === 0) {
      return {
        ok: true,
        message: `${baseUrl} serves main ${mainSha.slice(0, 8)}: database ok, ${routes.length} routes 200`,
      };
    }
    if (!onlyCommitMismatch(problems) || Date.now() >= deadline) {
      const lines = problems.map((p) => `- ${p.message}`);
      if (problems.some((p) => p.kind === 'commit')) {
        const source = findRedeploySource(repo, mainSha);
        lines.push(
          source
            ? `Redeploy source for main: ${source} (vercel redeploy ${source} --target production --scope metados). Never redeploy a deployment built from another commit.`
            : 'No successful Production deployment of main yet: wait for the Vercel build of main, do not redeploy an older one.'
        );
      }
      return {
        ok: false,
        message: [
          `${baseUrl} does not serve main ${mainSha.slice(0, 8)}:`,
          ...lines,
        ].join('\n'),
      };
    }
    await sleep(POLL_MS);
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: DEFAULT_REPO },
      'base-url': { type: 'string', default: 'https://rate.vn' },
      route: { type: 'string', multiple: true },
      wait: { type: 'string', default: '0' },
    },
  });
  const waitSeconds = Number(values.wait);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0)
    fail('--wait takes seconds');
  const result = await verifyLive({
    repo: values.repo,
    baseUrl: values['base-url'].replace(/\/$/, ''),
    routes: values.route ?? DEFAULT_ROUTES,
    waitMs: waitSeconds * 1000,
  });
  if (!result.ok) fail(result.message);
  console.log(result.message);
}
