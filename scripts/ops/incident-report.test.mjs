import assert from 'node:assert/strict';
import test from 'node:test';

import {
  codeSpan,
  decide,
  failureBody,
  isCurrentHead,
  readPending,
  unverifiedBody,
  writePending,
} from './incident-report.mjs';

const BUILD = 'Typecheck & Build Monorepo';
const E2E = 'E2E (Playwright)';
const job = (name, conclusion) => ({ name, conclusion });
const incident = (pending, number = 7) => ({
  number,
  body: writePending('**Verify** failure on `dev`.', pending),
});
const run = {
  workflow: 'Verify',
  branch: 'dev',
  conclusion: 'success',
  url: 'https://github.com/DOS/Rate/actions/runs/1',
  sha: 'abcdef1234567890',
  commitTitle: 'fix: thing @someone #12',
};

test('the marker round-trips through the issue body', () => {
  const body = writePending('Body text.', [BUILD, E2E]);
  assert.deepEqual(readPending(body), [BUILD, E2E]);
  assert.ok(body.startsWith('Body text.'));
  const again = writePending(body, [E2E]);
  assert.deepEqual(readPending(again), [E2E]);
  assert.equal(again.match(/incident-pending/g).length, 1);
});

test('a job name with dashes cannot end the HTML comment early', () => {
  const body = writePending('', ['a --> b']);
  assert.ok(!body.slice(0, -4).includes('-->'));
  assert.deepEqual(readPending(body), ['a --> b']);
});

test('a marker quoted from a commit title cannot replace the real one', () => {
  const fake = '<!-- incident-pending: [] -->';
  const body = writePending(`Commit ${fake} ${fake}`, [E2E]);
  assert.deepEqual(readPending(body), [E2E]);
  assert.equal(body.match(/incident-pending/g).length, 1);
  assert.equal(
    decide({
      conclusion: 'success',
      jobs: [job(BUILD, 'success'), job(E2E, 'skipped')],
      open: { number: 1, body: `Commit ${fake}

${writePending('', [E2E])}` },
    }).action,
    'unverified'
  );
});

test('a matrix name recovers only when every job of that name succeeded', () => {
  assert.equal(
    decide({
      conclusion: 'success',
      jobs: [job('Test', 'success'), job('Test', 'skipped')],
      open: incident(['Test']),
    }).action,
    'unverified'
  );
});

test('a missing or broken marker reads as unknown', () => {
  assert.equal(readPending('An incident opened before #1134.'), null);
  assert.equal(readPending('<!-- incident-pending: [oops -->'), null);
  assert.equal(readPending('<!-- incident-pending: {"a":1} -->'), null);
  assert.equal(readPending(undefined), null);
  assert.equal(writePending('x\n\n<!-- incident-pending: [] -->', null), 'x');
});

test('a failure with no open incident creates one pending its failing jobs', () => {
  assert.deepEqual(
    decide({
      conclusion: 'failure',
      jobs: [job(BUILD, 'success'), job(E2E, 'failure')],
      open: null,
    }),
    { action: 'create', pending: [E2E], failing: [E2E] }
  );
});

test('timed out and cancelled jobs count as failing', () => {
  const d = decide({
    conclusion: 'cancelled',
    jobs: [job(BUILD, 'timed_out'), job(E2E, 'cancelled')],
    open: null,
  });
  assert.deepEqual(d.pending, [BUILD, E2E]);
});

test('closes when every pending job concluded success', () => {
  assert.deepEqual(
    decide({
      conclusion: 'success',
      jobs: [job(BUILD, 'success'), job(E2E, 'success')],
      open: incident([E2E]),
    }),
    { action: 'close' }
  );
});

test('a pending job skipped on a passing push keeps the incident open', () => {
  const jobs = [job(BUILD, 'success'), job(E2E, 'skipped')];
  const d = decide({ conclusion: 'success', jobs, open: incident([E2E]) });
  assert.deepEqual(d, {
    action: 'unverified',
    pending: [E2E],
    unverified: [E2E],
  });
  assert.match(unverifiedBody(run, jobs, d), /E2E \(Playwright\) \(skipped\)/);
});

test('a skipped job that never failed does not block closing', () => {
  assert.equal(
    decide({
      conclusion: 'success',
      jobs: [job(BUILD, 'success'), job(E2E, 'skipped')],
      open: incident([BUILD]),
    }).action,
    'close'
  );
});

test('a pending job no longer in the workflow does not block closing', () => {
  const jobs = [job(BUILD, 'success'), job('E2E (Chromium)', 'success')];
  assert.equal(
    decide({ conclusion: 'success', jobs, open: incident([E2E]) }).action,
    'close'
  );
  assert.equal(
    decide({ conclusion: 'success', jobs: [], open: incident([E2E]) }).action,
    'unverified'
  );
});

test('recovery is tracked across runs: each job may pass in a different one', () => {
  const first = decide({
    conclusion: 'success',
    jobs: [job(BUILD, 'success'), job(E2E, 'skipped')],
    open: incident([BUILD, E2E]),
  });
  assert.deepEqual(first.pending, [E2E]);
  const second = decide({
    conclusion: 'success',
    jobs: [job(BUILD, 'skipped'), job(E2E, 'success')],
    open: incident(first.pending),
  });
  assert.equal(second.action, 'close');
});

test('a new failure adds to the pending jobs and drops the recovered ones', () => {
  assert.deepEqual(
    decide({
      conclusion: 'failure',
      jobs: [job(BUILD, 'failure'), job(E2E, 'success')],
      open: incident([E2E]),
    }),
    { action: 'update', pending: [BUILD], failing: [BUILD] }
  );
  assert.deepEqual(
    decide({
      conclusion: 'failure',
      jobs: [job(BUILD, 'failure'), job(E2E, 'skipped')],
      open: incident([E2E]),
    }).pending,
    [E2E, BUILD]
  );
});

test('an incident without a marker closes only when every job succeeded', () => {
  const legacy = { number: 3, body: 'Opened before #1134.' };
  assert.equal(
    decide({
      conclusion: 'success',
      jobs: [job(BUILD, 'success'), job(E2E, 'success')],
      open: legacy,
    }).action,
    'close'
  );
  const jobs = [job(BUILD, 'success'), job(E2E, 'skipped')];
  const d = decide({ conclusion: 'success', jobs, open: legacy });
  assert.deepEqual(d, {
    action: 'unverified',
    pending: null,
    unverified: [E2E],
  });
  assert.match(unverifiedBody(run, jobs, d), /every job succeeds/);
  assert.equal(
    decide({ conclusion: 'success', jobs: [], open: legacy }).action,
    'unverified'
  );
});

test('a failure without failing job names keeps the jobs already pending', () => {
  assert.deepEqual(
    decide({ conclusion: 'cancelled', jobs: [], open: incident([E2E]) }),
    { action: 'update', pending: [E2E], failing: [] }
  );
  assert.equal(
    decide({ conclusion: 'failure', jobs: [], open: null }).pending,
    null
  );
});

test('a passing run with no open incident does nothing', () => {
  assert.deepEqual(
    decide({ conclusion: 'success', jobs: [job(BUILD, 'success')], open: null }),
    { action: 'none' }
  );
});

test('a superseded run is not the branch head', () => {
  assert.equal(isCurrentHead('aaa', 'bbb'), false);
  assert.equal(isCurrentHead('aaa', 'aaa'), true);
});

test('the commit title is shown as one inert line of inline code', () => {
  assert.equal(codeSpan('fix: `x` @a #1\nsecond line'), '`fix: x @a #1`');
  assert.equal(codeSpan('a'.repeat(200)).length, 122);
  assert.equal(codeSpan(undefined), '``');
});

test('the failure body keeps its run, commit and failing jobs', () => {
  const body = failureBody({ ...run, conclusion: 'failure' }, [E2E]);
  assert.match(body, /\*\*Verify\*\* failure on `dev`\./);
  assert.match(body, /- Commit: `abcdef12` `fix: thing @someone #12`/);
  assert.match(body, /- Failing jobs: E2E \(Playwright\)/);
  assert.match(failureBody(run, []), /- Failing jobs: unknown/);
});
