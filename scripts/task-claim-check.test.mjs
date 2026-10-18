import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateClaim, renderSummary } from './task-claim-check.mjs';

const pr = (overrides = {}) => ({
  baseRefName: 'dev',
  headRefName: 'fix/something',
  author: 'JOY',
  closingIssues: [],
  ...overrides,
});
const issue = (labels, number = 7) => ({
  number,
  repository: 'DOS/Rate',
  labels,
});

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
    /DOS\/Rate#9 \| agent:web \| - \| neither status:in-progress nor status:in-review/
  );
  assert.match(s, /Project #9/);
});
