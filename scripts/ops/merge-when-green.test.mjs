import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  BLOCKED_POLLS,
  decide,
  evaluateChecks,
  ignoredRequired,
  latestRuns,
  MAX_LINE,
  mergeMethodFor,
  requiredChecksFromRules,
  shouldDeleteBranch,
  squashBody,
  squashTitle,
  wrapLine,
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
  head: {
    sha: 'abcdef1234567890',
    ref: 'fix/x',
    repo: { full_name: 'DOS/Rate' },
  },
  base: { ref: 'dev', repo: { full_name: 'DOS/Rate' } },
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

test('a promotion or fork PR behind its base is never updated automatically', () => {
  const promotion = decide(
    pr({
      mergeable_state: 'behind',
      head: {
        sha: 'abcdef1234567890',
        ref: 'dev',
        repo: { full_name: 'DOS/Rate' },
      },
      base: { ref: 'main', repo: { full_name: 'DOS/Rate' } },
    }),
    { state: 'passed' },
    0
  );
  assert.equal(promotion.action, 'fail');
  assert.match(promotion.message, /shared branch.*back-merge main into dev/);
  const fork = decide(
    pr({
      mergeable_state: 'behind',
      head: {
        sha: 'abcdef1234567890',
        ref: 'fix/x',
        repo: { full_name: 'someone/Rate' },
      },
    }),
    { state: 'passed' },
    0
  );
  assert.equal(fork.action, 'fail');
  assert.match(fork.message, /fork branch/);
});

test('conflicts and failures win over being behind', () => {
  assert.match(
    decide(pr({ mergeable_state: 'dirty' }), { state: 'passed' }, 0).message,
    /conflicts/
  );
  assert.equal(
    decide(
      pr({ mergeable_state: 'behind' }),
      { state: 'failed', failed: ['CI'] },
      0
    ).action,
    'fail'
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

// The commits of DOS/Rate#1127, whose default squash failed commitlint on the
// promotion PR DOS/Rate#1128 (DOS/Rate#1130).
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
const LONG_COMMITS = [
  `fix(shared-data): earbuds regex reads glued brands and drops over-ear titles that say tai nghe (#1125)

Any brand glued to Buds, FreeBuds, AirPods or WF1000XM now reads as earbuds
(PixelBudsPro2, HuaweiFreeBudsPro4, SonyWF1000XM5), as do AirPodsPro2 and
two glued tiers (Buds3ProFE).

${CO_AUTHOR}`,
  `fix(shared-data): over-ear WH with a space or underscore, glued Redmi/Samsung/Enco/Tune Buds (#1125)

Review follow-up on PR #1127, with a reference line that is far longer than one hundred characters in total.
See https://github.com/DOS/Rate/pull/1127#issuecomment-1234567890 for the review thread and the whole discussion.
A path with no spaces: ${'packages/shared-data/src/'.repeat(6)}earbuds.ts

${CO_AUTHOR}`,
];
const LONG_TITLE =
  'fix(shared-data): earbuds regex reads glued brands, drops over-ear tai nghe titles (#1125)';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
/** Lints a message with the repository's commitlint.config.ts. */
function commitlint(message) {
  const r = spawnSync(
    process.execPath,
    ['node_modules/@commitlint/cli/cli.js'],
    { cwd: repoRoot, input: message, encoding: 'utf8' }
  );
  assert.equal(r.error, undefined);
  return { ok: r.status === 0, output: r.stdout + r.stderr };
}

test('wraps a long line under its list marker and splits a word longer than a line', () => {
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  const wrapped = wrapLine(`* ${words}`);
  assert.ok(wrapped.length > 1);
  assert.ok(wrapped.every((line) => line.length <= MAX_LINE));
  assert.ok(wrapped.slice(1).every((line) => line.startsWith('  w')));
  assert.equal(wrapped.join(' ').replace(/\s+/g, ' '), `* ${words}`);
  const word = 'x'.repeat(250);
  assert.equal(wrapLine(word).join(''), word);
  assert.ok(wrapLine(word).every((line) => line.length <= MAX_LINE));
  assert.deepEqual(wrapLine('short'), ['short']);
  const url = `see https://example.com/${'a'.repeat(120)}`;
  assert.deepEqual(wrapLine(url), [url]);
});

test('keeps the PR number in the squash title and cuts a long title at a word', () => {
  assert.equal(squashTitle('fix(web): a thing', 7), 'fix(web): a thing (#7)');
  const title = squashTitle(LONG_TITLE, 1127);
  assert.equal(title, `${LONG_TITLE} (#1127)`);
  const longer = squashTitle(`${LONG_TITLE} and more words here`, 1127);
  assert.ok(longer.length <= MAX_LINE);
  assert.equal(longer, `${LONG_TITLE} (#1127)`);
});

test('gathers the trailers once each into a footer after the commits', () => {
  const body = squashBody(LONG_COMMITS);
  assert.ok(body.startsWith('* fix(shared-data): earbuds regex'));
  assert.ok(body.endsWith(`\n\n${CO_AUTHOR}`));
  assert.equal(body.split(CO_AUTHOR).length, 2);
  assert.ok(body.includes('\n\n* fix(shared-data): over-ear WH'));
  assert.equal(squashBody(['fix: a\r\n\r\nbody\r\n']), '* fix: a\n\nbody');
});

test('the squash message of PR bodies with lines over 100 characters passes commitlint', () => {
  const header = squashTitle(LONG_TITLE, 1127);
  const message = `${header}\n\n${squashBody(LONG_COMMITS)}\n`;
  // GitHub's default squash of the same commits fails, so the test has teeth.
  const github = `${header}\n\n${LONG_COMMITS.map((m) => `* ${m}`).join('\n\n')}\n`;
  assert.equal(commitlint(github).ok, false);
  const result = commitlint(message);
  assert.ok(result.ok, result.output);
  assert.doesNotMatch(result.output, /warning/);
});
