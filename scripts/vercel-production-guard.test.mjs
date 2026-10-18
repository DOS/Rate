import assert from 'node:assert/strict';
import test from 'node:test';

import { checkProductionBuild } from './vercel-production-guard.mjs';

const gitMain = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'DOS',
  VERCEL_GIT_REPO_SLUG: 'Rate',
  VERCEL_GIT_COMMIT_REF: 'main',
};

test('allows builds outside Vercel', () => {
  assert.equal(checkProductionBuild({}).ok, true);
});

test('allows preview builds from any source', () => {
  assert.equal(
    checkProductionBuild({ VERCEL: '1', VERCEL_ENV: 'preview' }).ok,
    true
  );
});

test('allows a Git integration production build from DOS/Rate main', () => {
  assert.equal(checkProductionBuild(gitMain).ok, true);
});

test('blocks a CLI production build with no Git metadata', () => {
  assert.equal(
    checkProductionBuild({ VERCEL: '1', VERCEL_ENV: 'production' }).ok,
    false
  );
});

test('blocks a production build from dev', () => {
  assert.equal(
    checkProductionBuild({ ...gitMain, VERCEL_GIT_COMMIT_REF: 'dev' }).ok,
    false
  );
});

test('blocks a production build from a fork', () => {
  assert.equal(
    checkProductionBuild({ ...gitMain, VERCEL_GIT_REPO_OWNER: 'someone' }).ok,
    false
  );
});

test('fails closed when Vercel hides VERCEL_ENV', () => {
  assert.equal(checkProductionBuild({ VERCEL: '1' }).ok, false);
});

test('fails closed on Vercel when no system variables are exposed', () => {
  assert.equal(checkProductionBuild({}, { onVercel: true }).ok, false);
});
