import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateLive,
  onlyCommitMismatch,
  redeploySource,
  restoreAdvice,
} from './verify-live.mjs';

const MAIN = 'c20a9ef1b196e26b9a0d5498344ce6dc59f5cb31';
const SOURCE = 'https://rate-main-metados.vercel.app';
const healthy = (commit = MAIN) => ({
  status: 200,
  body: { status: 'ok', commit, checks: { database: 'ok' } },
});
const ok = [{ path: '/', status: 200 }];

test('a site that serves main with a readable database passes', () => {
  assert.deepEqual(
    evaluateLive({ mainSha: MAIN, health: healthy(), routes: ok }),
    []
  );
});

test('an older deployment is a commit mismatch worth waiting for', () => {
  const problems = evaluateLive({
    mainSha: MAIN,
    health: healthy('d24f3bf5a6bb'),
    routes: ok,
  });
  assert.equal(problems.length, 1);
  assert.match(
    problems[0].message,
    /live commit d24f3bf5 is not main c20a9ef1/
  );
  assert.equal(onlyCommitMismatch(problems), true);
});

test('a deployment that reports no commit fails and says why', () => {
  const problems = evaluateLive({
    mainSha: MAIN,
    health: healthy(null),
    routes: ok,
  });
  assert.match(problems[0].message, /reports no commit .*#865/);
});

test('a database outage or a failing route is not worth waiting for', () => {
  const outage = evaluateLive({
    mainSha: MAIN,
    health: {
      status: 503,
      body: { status: 'degraded', commit: MAIN, checks: { database: 'error' } },
    },
    routes: [{ path: '/laptops', status: 500 }],
  });
  assert.deepEqual(
    outage.map((p) => p.kind),
    ['health', 'database', 'route']
  );
  assert.equal(onlyCommitMismatch(outage), false);
});

test('an unreachable health endpoint fails every health check', () => {
  const problems = evaluateLive({
    mainSha: MAIN,
    health: { status: 'error (ETIMEDOUT)', body: null },
    routes: ok,
  });
  assert.deepEqual(
    problems.map((p) => p.kind),
    ['health', 'database', 'commit']
  );
});

test('the redeploy source is the newest successful deployment of main', () => {
  assert.equal(
    redeploySource([
      { state: 'success', environment_url: SOURCE },
      { state: 'pending', environment_url: '' },
    ]),
    SOURCE
  );
  assert.equal(
    redeploySource([{ state: 'failure', environment_url: 'https://x' }]),
    null
  );
  assert.equal(redeploySource([]), null);
});

test('only a live commit behind main gets main promoted', () => {
  const behind = restoreAdvice({ relation: 'ahead', source: SOURCE });
  assert.match(behind, /Live is behind main/);
  assert.match(
    behind,
    /vercel promote https:\/\/rate-main-metados\.vercel\.app --scope metados/
  );
  assert.doesNotMatch(behind, /vercel redeploy/);
});

test('a live commit ahead of or diverged from main is never rolled back', () => {
  for (const relation of ['behind', 'diverged']) {
    const advice = restoreAdvice({ relation, source: SOURCE });
    assert.match(advice, /Do not redeploy or promote anything/);
    assert.doesNotMatch(advice, /vercel promote/);
  }
});

test('without a built deployment of main, it says to wait', () => {
  assert.match(
    restoreAdvice({ relation: 'ahead', source: null }),
    /wait for the Vercel build of main/
  );
});

test('an unknown live commit names only main deployment', () => {
  assert.match(
    restoreAdvice({ relation: null, source: SOURCE }),
    /only deployment to promote is main's: vercel promote/
  );
});
