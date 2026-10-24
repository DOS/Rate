import assert from 'node:assert/strict';
import test from 'node:test';

import { promotionBody, releasedPrs } from './promote.mjs';

const commit = (message, parents = 1) => ({
  commit: { message },
  parents: Array.from({ length: parents }, (_, i) => ({ sha: String(i) })),
});

test('lists the squashed PRs on dev, oldest first and once each', () => {
  const prs = releasedPrs([
    commit('fix(web): bait prices (#800)\n\nbody'),
    commit('Merge pull request #806 from DOS/dev', 2),
    commit('feat(web): health (#830)'),
    commit('fix(web): bait prices (#800)'),
    commit('chore: tidy without a number'),
  ]);
  assert.deepEqual(prs, [
    { number: 800, title: 'fix(web): bait prices' },
    { number: 830, title: 'feat(web): health' },
  ]);
});

test('only a trailing PR number counts', () => {
  assert.deepEqual(
    releasedPrs([commit('docs: mention (#12) in the text')]),
    []
  );
});

test('the body lists the PRs and the merge rule', () => {
  const body = promotionBody([{ number: 830, title: 'feat(web): health' }], 2);
  assert.match(body, /^Promote dev to main\./);
  assert.match(body, /- #830 feat\(web\): health/);
  assert.match(body, /2 other commit\(s\) without a PR number/);
  assert.match(body, /never squash/);
});
