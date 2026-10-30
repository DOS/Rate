import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
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
  LINT_TIMEOUT_MS,
  lintHeader,
  mergeWhenGreen,
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

test('splits a long word between characters, never inside an emoji', () => {
  const wrapped = wrapLine(`a${'😀'.repeat(50)}`);
  assert.ok(wrapped.every((line) => line.length <= MAX_LINE));
  assert.ok(wrapped.every((line) => !/[\uD800-\uDBFF]$/.test(line)));
  assert.equal(wrapped.join(''), `a${'😀'.repeat(50)}`);
  assert.throws(() => wrapLine('x y', 0), RangeError);
});

test('keeps the PR number in the squash title, or refuses a title that cannot carry it', () => {
  assert.equal(
    squashTitle(' fix(web):  a thing ', 7),
    'fix(web): a thing (#7)'
  );
  assert.equal(squashTitle(LONG_TITLE, 1127), `${LONG_TITLE} (#1127)`);
  // Cutting these would leave an empty subject or a start-case one.
  assert.equal(squashTitle(`${LONG_TITLE} and more`, 1127), null);
  assert.equal(squashTitle(`fix: ${'a'.repeat(89)}`, 1133), null);
  // Not conventional: commitlint ignores `v1.2.3` alone, not with `(#n)`.
  assert.equal(squashTitle('v1.2.3', 1133), null);
  assert.equal(squashTitle('Update stuff', 1133), null);
  assert.equal(
    squashTitle('feat(web)!: drop old route', 3),
    'feat(web)!: drop old route (#3)'
  );
});

test('gathers the trailers once each into a footer after the commits', () => {
  const body = squashBody(LONG_COMMITS);
  assert.ok(body.startsWith('* fix(shared-data): earbuds regex'));
  assert.ok(body.endsWith(`\n\n${CO_AUTHOR}`));
  assert.equal(body.split(CO_AUTHOR).length, 2);
  assert.ok(body.includes('\n\n* fix(shared-data): over-ear WH'));
  assert.equal(squashBody(['fix: a\r\n\r\nbody\r\n']), '* fix: a\n\nbody');
  // A trailer is never wrapped: one too long for commitlint is left out.
  const long = `Co-authored-by: ${'a'.repeat(90)} <a@b.com>`;
  assert.equal(
    squashBody([`fix: a\n\n${long}\n${CO_AUTHOR}`]),
    `* fix: a\n\n${CO_AUTHOR}`
  );
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

test('lints the squash header with the repository commitlint, type-enum included', () => {
  // A valid header passes.
  assert.deepEqual(lintHeader('fix(web): a thing (#7)'), {
    ok: true,
    problems: [],
  });
  // "ux" fits the shape check but not commitlint's type-enum (DOS/Rate#1513).
  const ux = lintHeader('ux(web): the same product shows one rating (#1475)');
  assert.equal(
    squashTitle('ux(web): the same product shows one rating', 1475),
    'ux(web): the same product shows one rating (#1475)'
  );
  assert.equal(ux.ok, false);
  assert.ok(
    ux.problems.some(
      (p) => /type must be one of/.test(p) && /type-enum/.test(p)
    ),
    ux.problems.join('\n')
  );
  // A start-case subject is refused with commitlint's reason.
  const startCase = lintHeader('fix(web): Add a sentence-case subject (#8)');
  assert.equal(startCase.ok, false);
  assert.ok(
    startCase.problems.some((p) => /subject-case/.test(p)),
    startCase.problems.join('\n')
  );
});

test('a squash header is refused, not merged, when commitlint cannot run', () => {
  const missing = lintHeader('fix(web): a thing (#7)', { cwd: os.tmpdir() });
  assert.equal(missing.ok, false);
  assert.match(missing.problems[0], /commitlint is not installed/);
  const failed = lintHeader('fix(web): a thing (#7)', {
    spawnFn: () => ({ error: new Error('spawn failed'), status: null }),
  });
  assert.deepEqual(failed, {
    ok: false,
    problems: ['commitlint could not run or timed out'],
  });
  const silent = lintHeader('fix(web): a thing (#7)', {
    spawnFn: () => ({ status: 2, stdout: '', stderr: '' }),
  });
  assert.deepEqual(silent, { ok: false, problems: ['commitlint exited 2'] });
  // A broken config says why in its first lines, and the lint is bounded in time.
  const broken = lintHeader('fix(web): a thing (#7)', {
    spawnFn: (_cmd, _args, opts) => {
      assert.equal(opts.timeout, LINT_TIMEOUT_MS);
      return {
        status: 9,
        stdout: '',
        stderr: 'Error: cannot load config\n  at x',
      };
    },
  });
  assert.deepEqual(broken, {
    ok: false,
    problems: ['commitlint exited 9: Error: cannot load config | at x'],
  });
});

/**
 * A fake GitHub for mergeWhenGreen: a green squash PR into dev, a clock that
 * moves only when told, and a record of every write (DOS/Rate#1513).
 */
function fakeGitHub({ mergeableState = 'clean', onCommits, onRules } = {}) {
  let clock = 0;
  const writes = [];
  const pr = {
    number: 41,
    state: 'open',
    merged: false,
    mergeable_state: mergeableState,
    title: 'fix(web): a thing',
    commits: 1,
    head: { sha: 'abc1234567', ref: 'feat/x', repo: { full_name: 'DOS/Rate' } },
    base: { ref: 'dev', repo: { full_name: 'DOS/Rate' } },
  };
  const io = {
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    ghJson: (args) => {
      const url = args[1];
      if (url.endsWith('/status')) return { statuses: [] };
      if (url.includes('/rules/branches/')) {
        onRules?.(() => (clock += 1_000));
        return [];
      }
      return pr;
    },
    ghPaginated: (url) => {
      if (url.includes('/check-runs')) {
        return [
          { id: 1, name: 'build', status: 'completed', conclusion: 'success' },
        ];
      }
      onCommits?.(() => (clock += 1_000));
      return [{ message: 'fix(web): a thing' }];
    },
    gh: (args) => {
      writes.push(args[3]);
      return { status: 0, stdout: 'merged-sha\n', stderr: '' };
    },
  };
  return { io, writes };
}

const lintOk = () => ({ ok: true, problems: [] });

test('merges a green PR once, with the fake GitHub', async () => {
  const { io, writes } = fakeGitHub();
  const result = await mergeWhenGreen({
    number: 41,
    timeoutMs: 500,
    intervalMs: 10,
    lint: lintOk,
    io,
  });
  assert.deepEqual(result, { ok: true, message: 'PR 41 MERGED merged-sha' });
  assert.deepEqual(writes, [
    'repos/DOS/Rate/pulls/41/merge',
    'repos/DOS/Rate/git/refs/heads/feat/x',
  ]);
});

test('no merge goes out when the deadline passes while the commits are listed', async () => {
  // The listing takes 1 s against a 500 ms deadline.
  const { io, writes } = fakeGitHub({ onCommits: (tick) => tick() });
  const result = await mergeWhenGreen({
    number: 41,
    timeoutMs: 500,
    intervalMs: 10,
    lint: lintOk,
    io,
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /still not mergeable after/);
  assert.deepEqual(writes, [], 'nothing was written to GitHub');
});

test('no branch update goes out once the deadline has passed', async () => {
  // A behind branch; the read of the rules takes 1 s against a 500 ms deadline.
  const { io, writes } = fakeGitHub({
    mergeableState: 'behind',
    onRules: (tick) => tick(),
  });
  const result = await mergeWhenGreen({
    number: 41,
    timeoutMs: 500,
    intervalMs: 10,
    lint: lintOk,
    io,
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /still not mergeable after/);
  assert.deepEqual(writes, [], 'the branch was not updated');
});
