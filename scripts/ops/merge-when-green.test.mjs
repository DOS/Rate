import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOCKED_POLLS,
  decide,
  evaluateChecks,
  latestRuns,
  mergeMethodFor,
  shouldDeleteBranch,
} from './merge-when-green.mjs';

const run = (name, status, conclusion = null, id = 1) => ({
  id,
  name,
  status,
  conclusion,
});
const pr = (overrides = {}) => ({
  number: 12,
  merged: false,
  state: 'open',
  mergeable_state: 'clean',
  head: { sha: 'abcdef1234567890' },
  ...overrides,
});

test('keeps only the newest run of a re-run check', () => {
  const runs = latestRuns([
    run('CI', 'completed', 'failure', 1),
    run('CI', 'completed', 'success', 2),
  ]);
  assert.deepEqual(
    runs.map((r) => r.conclusion),
    ['success']
  );
});

test('passes when every check succeeded or was skipped', () => {
  assert.deepEqual(
    evaluateChecks([
      run('CI', 'completed', 'success'),
      run('Lint', 'completed', 'skipped'),
    ]),
    { state: 'passed' }
  );
});

test('fails on a failed or cancelled check, even while others run', () => {
  const r = evaluateChecks([
    run('CI', 'completed', 'cancelled'),
    run('E2E', 'in_progress'),
  ]);
  assert.equal(r.state, 'failed');
  assert.deepEqual(r.failed, ['CI']);
});

test('waits while a check runs, before any check exists, or while a required one is missing', () => {
  assert.equal(evaluateChecks([run('CI', 'queued')]).state, 'pending');
  assert.equal(evaluateChecks([]).state, 'pending');
  const r = evaluateChecks([run('Lint', 'completed', 'success')], {
    required: ['Typecheck & Build Monorepo'],
  });
  assert.equal(r.state, 'pending');
  assert.deepEqual(r.pending, ['Typecheck & Build Monorepo']);
});

test('ignores the bot review check that never finishes', () => {
  assert.equal(
    evaluateChecks([
      run('CI', 'completed', 'success'),
      run('DOS Code Review', 'in_progress'),
    ]).state,
    'passed'
  );
});

test('PRs into main always merge with a merge commit', () => {
  assert.equal(mergeMethodFor('main'), 'merge');
  assert.equal(mergeMethodFor('main', 'merge'), 'merge');
  assert.throws(() => mergeMethodFor('main', 'squash'), /merge commit/);
  assert.equal(mergeMethodFor('dev'), 'squash');
  assert.equal(mergeMethodFor('dev', 'merge'), 'merge');
  assert.throws(() => mergeMethodFor('dev', 'rebase'), /unknown merge method/);
});

test('deletes only a squashed branch of the same repository that is not dev or main', () => {
  const base = {
    method: 'squash',
    headRef: 'fix/x',
    headRepo: 'DOS/Rate',
    baseRepo: 'DOS/Rate',
  };
  assert.equal(shouldDeleteBranch(base), true);
  assert.equal(shouldDeleteBranch({ ...base, method: 'merge' }), false);
  assert.equal(shouldDeleteBranch({ ...base, headRef: 'dev' }), false);
  assert.equal(
    shouldDeleteBranch({ ...base, headRepo: 'someone/Rate' }),
    false
  );
});

test('decides from the PR state and its checks', () => {
  const passed = { state: 'passed' };
  assert.equal(decide(pr({ merged: true }), passed, 0).action, 'done');
  assert.equal(decide(pr({ state: 'closed' }), passed, 0).action, 'fail');
  assert.match(
    decide(pr({ mergeable_state: 'dirty' }), passed, 0).message,
    /conflicts/
  );
  assert.match(
    decide(pr(), { state: 'failed', failed: ['CI'] }, 0).message,
    /failing at abcdef12: CI/
  );
  assert.equal(
    decide(pr(), { state: 'pending', pending: ['CI'] }, 0).action,
    'wait'
  );
  assert.equal(decide(pr(), passed, 0).action, 'merge');
});

test('gives a green but blocked PR a few polls before reporting it', () => {
  const blocked = pr({ mergeable_state: 'blocked' });
  assert.deepEqual(decide(blocked, { state: 'passed' }, 0), {
    action: 'wait',
    blocked: true,
  });
  const last = decide(blocked, { state: 'passed' }, BLOCKED_POLLS - 1);
  assert.equal(last.action, 'fail');
  assert.match(last.message, /required review or check/);
});
