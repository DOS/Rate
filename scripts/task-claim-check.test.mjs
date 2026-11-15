import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCK_REQUIRED_SINCE,
  evaluateClaim,
  renderSummary,
} from './task-claim-check.mjs';

const ME = 'claude:local_1111aaaa';
const OTHER = 'qwen:2222bbbb';
const AFTER = '2026-11-20T10:00:00Z';
const BEFORE = '2026-11-10T10:00:00Z';

// By default a PR opened after the lock arrived, declaring ME, whose issues
// ME has locked.
const pr = (overrides = {}) => ({
  baseRefName: 'dev',
  headRefName: 'fix/something',
  author: 'JOY',
  createdAt: AFTER,
  body: `Closes #7\n\nClaimant: ${ME}\n`,
  closingIssues: [],
  ...overrides,
});
const issue = (labels, number = 7, lock = { claimant: ME, agent: 'Web' }) => ({
  number,
  repository: 'DOS/Rate',
  labels,
  lock,
});
const claimed = ['agent:web', 'status:in-review'];

test('passes an issue claimed in progress', () => {
  const r = evaluateClaim(
    pr({ closingIssues: [issue(['agent:web', 'status:in-progress'])] })
  );
  assert.equal(r.ok, true);
  assert.equal(r.exempt, false);
});

test('passes an issue claimed in review', () => {
  assert.equal(
    evaluateClaim(
      pr({ closingIssues: [issue(['status:in-review', 'agent:ops', 'bug'])] })
    ).ok,
    true
  );
});

test('fails an issue without an agent label', () => {
  const r = evaluateClaim(
    pr({ closingIssues: [issue(['status:in-progress'])] })
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues[0].problems, ['no agent:* label']);
});

test('fails an issue that is only ready or done', () => {
  assert.equal(
    evaluateClaim(pr({ closingIssues: [issue(['agent:web', 'status:ready'])] }))
      .ok,
    false
  );
  assert.equal(
    evaluateClaim(pr({ closingIssues: [issue(['agent:web', 'status:done'])] }))
      .ok,
    false
  );
});

test('fails when any one of several closing issues is unclaimed', () => {
  const r = evaluateClaim(
    pr({
      closingIssues: [
        issue(['agent:web', 'status:in-progress'], 1),
        issue([], 2),
      ],
    })
  );
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.issues.map((i) => i.ok),
    [true, false]
  );
});

test('passes a PR that closes no issue', () => {
  const r = evaluateClaim(pr());
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'closes no issue');
});

test('exempts Dependabot PRs', () => {
  const r = evaluateClaim(
    pr({ author: 'dependabot[bot]', closingIssues: [issue([])] })
  );
  assert.equal(r.ok, true);
  assert.equal(r.exempt, true);
});

test('exempts the dev to main promotion', () => {
  const r = evaluateClaim(
    pr({ baseRefName: 'main', headRefName: 'dev', closingIssues: [issue([])] })
  );
  assert.equal(r.ok, true);
  assert.equal(r.exempt, true);
});

test('fails closed when the closing issue list is truncated', () => {
  const r = evaluateClaim(
    pr({
      truncated: true,
      closingIssues: [issue(['agent:web', 'status:in-progress'])],
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /more than 25/);
});

test('fails closed when a closing issue is not readable', () => {
  const r = evaluateClaim(
    pr({
      unreadable: 1,
      closingIssues: [issue(['agent:web', 'status:in-progress'])],
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /not readable/);
});

test('summary names the unclaimed issue and how to fix it', () => {
  const s = renderSummary(
    42,
    evaluateClaim(pr({ closingIssues: [issue(['agent:web'], 9)] }))
  );
  assert.match(s, /PR #42/);
  assert.match(
    s,
    /DOS\/Rate#9 \| agent:web \| - \| `claude:local_1111aaaa` \| neither status:in-progress nor status:in-review/
  );
  assert.match(s, /Project #9/);
});

test('the cutover lies between the two test dates', () => {
  assert.ok(Date.parse(BEFORE) < Date.parse(LOCK_REQUIRED_SINCE));
  assert.ok(Date.parse(AFTER) > Date.parse(LOCK_REQUIRED_SINCE));
});

test('passes an issue locked by the claimant the PR declares', () => {
  const r = evaluateClaim(pr({ closingIssues: [issue(claimed)] }));
  assert.equal(r.ok, true);
  assert.equal(r.claimant, ME);
  assert.match(r.reason, /locked by the declared claimant/);
});

test('accepts the declared claimant in backticks', () => {
  const r = evaluateClaim(
    pr({ body: `Claimant: \`${ME}\``, closingIssues: [issue(claimed)] })
  );
  assert.equal(r.ok, true);
});

test('fails an issue without a claim lock', () => {
  const r = evaluateClaim(pr({ closingIssues: [issue(claimed, 7, null)] }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues[0].problems, ['no claim lock refs/claims/7']);
});

test('fails an issue whose lock another session holds', () => {
  const r = evaluateClaim(
    pr({
      closingIssues: [issue(claimed, 7, { claimant: OTHER, agent: 'Core' })],
    })
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues[0].problems, [
    `refs/claims/7 is held by ${OTHER}, not the declared ${ME}`,
  ]);
});

test('fails a lock that names no recognisable claimant', () => {
  const r = evaluateClaim(
    pr({ closingIssues: [issue(claimed, 7, { claimant: null, agent: null })] })
  );
  assert.equal(r.ok, false);
  assert.match(r.issues[0].problems[0], /held by an unrecognised claimant/);
});

test('fails a PR that declares no claimant', () => {
  const r = evaluateClaim(
    pr({ body: 'Closes #7', closingIssues: [issue(claimed)] })
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues[0].problems, ['the PR declares no Claimant']);
});

test('fails a PR that declares two claimants', () => {
  const r = evaluateClaim(
    pr({
      body: `Claimant: ${ME}\nClaimant: ${OTHER}`,
      closingIssues: [issue(claimed)],
    })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /more than one claimant/);
});

test('fails a malformed claimant', () => {
  const r = evaluateClaim(
    pr({ body: 'Claimant: Web', closingIssues: [issue(claimed)] })
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /not <tool>:<session id>/);
});

test('is strict when the PR creation time is unknown', () => {
  const r = evaluateClaim(
    pr({ createdAt: null, closingIssues: [issue(claimed, 7, null)] })
  );
  assert.equal(r.ok, false);
});

test('grace: a PR opened before the lock keeps the label-only rule', () => {
  const r = evaluateClaim(
    pr({
      createdAt: BEFORE,
      body: 'Closes #7',
      closingIssues: [issue(claimed, 7, null)],
    })
  );
  assert.equal(r.ok, true);
  assert.equal(r.legacy, true);
  assert.match(r.reason, /labels only/);
});

test('grace still needs the labels', () => {
  const r = evaluateClaim(
    pr({ createdAt: BEFORE, closingIssues: [issue(['agent:web'], 7, null)] })
  );
  assert.equal(r.ok, false);
});

test('grace: a declared claimant must still match an existing lock', () => {
  const r = evaluateClaim(
    pr({
      createdAt: BEFORE,
      closingIssues: [issue(claimed, 7, { claimant: OTHER, agent: 'Core' })],
    })
  );
  assert.equal(r.ok, false);
});

test('summary shows the declared claimant, the lock and the fix', () => {
  const s = renderSummary(
    5,
    evaluateClaim(pr({ closingIssues: [issue(claimed, 7, null)] }))
  );
  assert.match(s, /Declared claimant: `claude:local_1111aaaa`/);
  assert.match(s, /\| - \| no claim lock refs\/claims\/7 \|/);
  assert.match(s, /Claimant: <tool>:<session id>/);
});
