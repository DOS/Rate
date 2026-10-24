import assert from 'node:assert/strict';
import test from 'node:test';

import { ownPromotionPr, promotionBody, releasedPrs } from './promote.mjs';

const commit = (message, parents = 1) => ({
  commit: { message },
  parents: Array.from({ length: parents }, (_, i) => ({ sha: String(i) })),
});

test('lists the squashed PRs on dev, oldest first and once each', () => {
  const released = releasedPrs([
    commit('fix(web): bait prices (#800)\n\nbody'),
    commit('Merge pull request #806 from DOS/dev', 2),
    commit('feat(web): health (#830)'),
    commit('fix(web): bait prices (#800)'),
    commit('chore: tidy without a number'),
  ]);
  assert.deepEqual(released, {
    prs: [
      { number: 800, title: 'fix(web): bait prices' },
      { number: 830, title: 'feat(web): health' },
    ],
    unnumbered: 1,
  });
});

test('the PR number is the trailing one; an issue number stays in the title', () => {
  assert.deepEqual(releasedPrs([commit('fix(x): y (#834) (#835)')]).prs, [
    { number: 835, title: 'fix(x): y (#834)' },
  ]);
  assert.deepEqual(releasedPrs([commit('docs: mention (#12) in the text')]), {
    prs: [],
    unnumbered: 1,
  });
});

test('the body lists the PRs, the rest and the merge rule', () => {
  const body = promotionBody(
    { prs: [{ number: 830, title: 'feat(web): health' }], unnumbered: 2 },
    { truncated: true }
  );
  assert.match(body, /^Promote dev to main\./);
  assert.match(body, /- #830 feat\(web\): health/);
  assert.match(body, /2 other commit\(s\) without a PR number/);
  assert.match(body, /more than 250 commits/);
  assert.match(body, /never squash/);
});

test('a fork PR from its own dev is never taken as the promotion', () => {
  assert.equal(ownPromotionPr([{ number: 9, isCrossRepository: true }]), null);
  assert.deepEqual(
    ownPromotionPr([
      { number: 9, isCrossRepository: true },
      { number: 10, isCrossRepository: false },
    ]),
    { number: 10, isCrossRepository: false }
  );
  assert.equal(ownPromotionPr([]), null);
});
