import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOCKED_POLLS,
  decide,
  evaluateChecks,
  ignoredRequired,
  latestRuns,
  mergeMethodFor,
  requiredChecksFromRules,
  shouldDeleteBranch,
} from './merge-when-green.mjs';
import { encodeRef } from './lib.mjs';

const run = (name, status, conclusion = null, id = 1) => ({
  id,
  name,
  status,
  conclusion,
});
const status = (context, state) => ({ context, state });
const pr = (overrides = {}) => ({
  number: 12,
  merged: false,
  state: 'open',
  mergeable_state: 'clean',
  head: { sha: 'abcdef1234567890' },
  ...overrides,
});
const green = [run('CI', 'completed', 'success')];

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
  const r = evaluateChecks([run('Lint', 'completed', 'success')], [], {
    required: ['Typecheck & Build Monorepo'],
  });
  assert.equal(r.state, 'pending');
  assert.deepEqual(r.pending, ['Typecheck & Build Monorepo']);
});

test('a commit status counts like a check: Vercel failing fails, pending waits', () => {
  const failing = evaluateChecks(green, [status('Vercel', 'failure')]);
  assert.equal(failing.state, 'failed');
  assert.deepEqual(failing.failed, ['Vercel']);
  assert.equal(
    evaluateChecks(green, [status('Vercel', 'error')]).state,
    'failed'
  );
  assert.equal(
    evaluateChecks(green, [status('Vercel', 'pending')]).state,
    'pending'
  );
  assert.equal(
    evaluateChecks(green, [status('Vercel', 'success')]).state,
    'passed'
  );
});

test('a required check may report as a commit status', () => {
  assert.equal(
    evaluateChecks(green, [status('Vercel', 'success')], {
      required: ['Vercel'],
    }).state,
    'passed'
  );
});

test('ignores bot reviews that never finish, as checks or statuses', () => {
  assert.equal(
    evaluateChecks(
      [...green, run('DOS Code Review', 'in_progress')],
      [status('CodeRabbit', 'pending')]
    ).state,
    'passed'
  );
});

test('--ignore lets a named broken check through, nothing else', () => {
  const runs = [...green, run('E2E (Playwright)', 'completed', 'failure')];
  assert.equal(evaluateChecks(runs).state, 'failed');
  assert.equal(
    evaluateChecks(runs, [], { ignore: ['E2E (Playwright)'] }).state,
    'passed'
  );
});

test('an --ignore that hides a required check is refused', () => {
  assert.deepEqual(
    ignoredRequired(
      ['Typecheck & Build Monorepo', 'task-claim'],
      ['E2E (Playwright)', 'task-claim']
    ),
    ['task-claim']
  );
  assert.deepEqual(ignoredRequired(['task-claim'], ['E2E (Playwright)']), []);
});

test('reads the required check names from the branch rules', () => {
  assert.deepEqual(
    requiredChecksFromRules([
      { type: 'deletion' },
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: [
            { context: 'Typecheck & Build Monorepo' },
            { context: 'task-claim' },
          ],
        },
      },
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'task-claim' }] },
      },
    ]),
    ['Typecheck & Build Monorepo', 'task-claim']
  );
  assert.deepEqual(requiredChecksFromRules(null), []);
});

test('PRs into main always merge with a merge commit', () => {
  assert.equal(mergeMethodFor('main'), 'merge');
  assert.equal(mergeMethodFor('main', 'merge'), 'merge');
  assert.throws(() => mergeMethodFor('main', 'squash'), /merge commit/);
  assert.equal(mergeMethodFor('dev'), 'squash');
  assert.equal(mergeMethodFor('dev', 'merge'), 'merge');
  assert.throws(() => mergeMethodFor('dev', 'rebase'), /unknown merge method/);
});

test('a repository without the dev to main release flow squashes into main', () => {
  assert.equal(
    mergeMethodFor('main', undefined, 'DOS/Rate-Services'),
    'squash'
  );
  assert.equal(mergeMethodFor('main', 'merge', 'DOS/status'), 'merge');
  assert.equal(mergeMethodFor('main', undefined, 'DOS/Rate'), 'merge');
  assert.throws(
    () => mergeMethodFor('main', 'squash', 'dos/rate'),
    /merge commit/
  );
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
  assert.equal(shouldDeleteBranch({ ...base, headRepo: undefined }), false);
});

test('branch names are encoded per path segment', () => {
  assert.equal(encodeRef('fix#12'), 'fix%2312');
  assert.equal(encodeRef('feat/a b'), 'feat/a%20b');
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

test('a green PR behind a strict base is brought up to date, not merged', () => {
  assert.deepEqual(
    decide(pr({ mergeable_state: 'behind' }), { state: 'passed' }, 0),
    { action: 'update' }
  );
  // While its checks still run, it just waits.
  assert.equal(
    decide(
      pr({ mergeable_state: 'behind' }),
      { state: 'pending', pending: ['CI'] },
      0
    ).action,
    'wait'
  );
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
