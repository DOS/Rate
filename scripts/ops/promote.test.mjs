import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROMOTER_TOOL,
  PROMOTER_TOOLS,
  ownPromotionPr,
  promoterClaimant,
  promotionBody,
  releasedPrs,
} from './promote.mjs';

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

test('only Claude Code or Antigravity PO sessions may promote (DOS/Rate#1675, DOS/Rate#1805, DOS/Rate#1849)', () => {
  assert.equal(PROMOTER_TOOL, 'claude');
  assert.deepEqual([...PROMOTER_TOOLS], ['claude', 'antigravity']);
  assert.equal(
    promoterClaimant({
      env: { CLAUDE_CODE_HOST_SESSION_ID: 'local_abcd1234' },
    }),
    'claude:local_abcd1234'
  );
  assert.equal(
    promoterClaimant({ flag: 'claude:local_abcd1234', env: {} }),
    'claude:local_abcd1234'
  );
  assert.equal(
    promoterClaimant({
      flag: 'antigravity:d0dc3655-856b-4c89-b2bd-3283a4e5e3da',
      env: {},
    }),
    'antigravity:d0dc3655-856b-4c89-b2bd-3283a4e5e3da'
  );
  assert.equal(
    promoterClaimant({
      env: {
        RATE_CLAIMANT: 'antigravity:d0dc3655-856b-4c89-b2bd-3283a4e5e3da',
      },
    }),
    'antigravity:d0dc3655-856b-4c89-b2bd-3283a4e5e3da'
  );
  assert.throws(
    () => promoterClaimant({ flag: 'qwen:abcd1234', env: {} }),
    /only the Claude Code or Antigravity PO promotes.*qwen: one/
  );
  assert.throws(
    () => promoterClaimant({ env: { RATE_CLAIMANT: 'qwen:abcd1234' } }),
    /only the Claude Code or Antigravity PO promotes.*qwen: one/
  );
  assert.throws(
    () => promoterClaimant({ flag: 'codex:abcd1234', env: {} }),
    /only the Claude Code or Antigravity PO promotes.*codex: one/
  );
  assert.throws(
    () => promoterClaimant({ flag: 'cursor:abcd1234', env: {} }),
    /only the Claude Code or Antigravity PO promotes.*cursor: one/
  );
  assert.throws(
    () => promoterClaimant({ flag: 'antigravity:', env: {} }),
    /invalid claimant/
  );
  assert.throws(
    () => promoterClaimant({ flag: 'CLAUDE:local_abcd1234', env: {} }),
    /invalid claimant/
  );
  // Explicit blank --claimant fails closed even if env carries a valid claimant.
  assert.throws(
    () =>
      promoterClaimant({
        flag: '',
        env: { CLAUDE_CODE_HOST_SESSION_ID: 'local_abcd1234' },
      }),
    /no claimant/
  );
  assert.throws(
    () =>
      promoterClaimant({
        flag: '   ',
        env: {
          RATE_CLAIMANT: 'antigravity:d0dc3655-856b-4c89-b2bd-3283a4e5e3da',
        },
      }),
    /no claimant/
  );
  // No claimant at all: refused, not assumed to be an authorized PO.
  assert.throws(() => promoterClaimant({ env: {} }), /no claimant/);

  // External mutation of exported PROMOTER_TOOLS cannot widen the guard.
  PROMOTER_TOOLS.add('qwen');
  try {
    assert.throws(
      () => promoterClaimant({ flag: 'qwen:abcd1234', env: {} }),
      /only the Claude Code or Antigravity PO promotes.*qwen: one/
    );
  } finally {
    PROMOTER_TOOLS.delete('qwen');
  }
});
