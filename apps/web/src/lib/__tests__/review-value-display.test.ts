import assert from 'node:assert/strict';
import {
  compareByQuality,
  hasSessionCookie,
  isReviewId,
  parseMyReviewValue,
  parseReviewIds,
  parseReviewValueTier,
  reviewTierBadgeKey,
  reviewTierRank,
  reviewValueGapKey,
  shownReviewTier,
  shownReviewValueGaps,
} from '../review-value-display';

const ID = 'aaaaaaaa-1111-4222-8333-444444444444';

// The public tier: only the three stored values.
assert.equal(parseReviewValueTier('excellent'), 'excellent');
assert.equal(parseReviewValueTier('complete'), 'complete');
assert.equal(parseReviewValueTier('basic'), 'basic');
for (const raw of ['Excellent', '', null, undefined, 3, '__proto__']) {
  assert.equal(parseReviewValueTier(raw), null);
}

// Excellent before complete; basic and unscored rank together, last.
assert.ok(reviewTierRank('excellent') > reviewTierRank('complete'));
assert.ok(reviewTierRank('complete') > reviewTierRank('basic'));
assert.equal(reviewTierRank(null), reviewTierRank('basic'));
const sorted = [null, 'excellent', 'basic', 'complete']
  .map((tier) => parseReviewValueTier(tier))
  .sort((a, b) => reviewTierRank(b) - reviewTierRank(a));
assert.deepEqual(sorted.slice(0, 2), ['excellent', 'complete']);

// A review the rating leaves out keeps no tier, so it cannot be lifted.
const kept = { value_tier: 'excellent' as const, include_in_rating: true };
assert.equal(shownReviewTier({ ...kept, helpfulness_weight: 1 }), 'excellent');
assert.equal(shownReviewTier({ ...kept, helpfulness_weight: 0 }), null);
assert.equal(
  shownReviewTier({ ...kept, include_in_rating: false, helpfulness_weight: 1 }),
  null
);
assert.equal(
  shownReviewTier({ include_in_rating: true, helpfulness_weight: 1 }),
  null
);

// The "most helpful" order: tier first, unless buyers voted it down; then
// votes, weight and the newest.
const wilson = (up: number, down: number) =>
  up + down === 0 ? 0 : up / (up + down + 2);
const review = (
  id: string,
  extra: Partial<{
    value_tier: 'basic' | 'complete' | 'excellent' | null;
    include_in_rating: boolean;
    helpfulness_weight: number;
    upvotes: number;
    downvotes: number;
    created_at: string;
  }> = {}
) => ({
  id,
  value_tier: null,
  include_in_rating: true,
  helpfulness_weight: 1,
  upvotes: 0,
  downvotes: 0,
  created_at: '2026-11-01T00:00:00Z',
  ...extra,
});
const order = (list: ReturnType<typeof review>[]) =>
  [...list].sort((a, b) => compareByQuality(a, b, wilson)).map((r) => r.id);
assert.deepEqual(
  order([
    review('marketplace', { upvotes: 300 }),
    review('complete', { value_tier: 'complete' }),
    review('excellent', { value_tier: 'excellent' }),
    review('voted-down', { value_tier: 'excellent', downvotes: 40 }),
    review('flagged', { value_tier: 'excellent', include_in_rating: false }),
  ]),
  ['excellent', 'complete', 'marketplace', 'voted-down', 'flagged']
);
assert.deepEqual(
  order([
    review('older', { value_tier: 'complete' }),
    review('newer', {
      value_tier: 'complete',
      created_at: '2026-11-02T00:00:00Z',
    }),
  ]),
  ['newer', 'older']
);

// The writer sees at most three gaps they can act on.
assert.deepEqual(
  shownReviewValueGaps(
    ['detail', 'criteria', 'verdict', 'pros_cons', 'photo', 'verified'],
    true
  ),
  ['detail', 'criteria', 'verdict']
);
assert.deepEqual(
  shownReviewValueGaps(
    ['criteria', 'criterion_points', 'photo', 'verified'],
    false
  ),
  ['photo']
);

// Less text: basic and unscored reviews carry no badge.
assert.equal(reviewTierBadgeKey('excellent'), 'valueTierExcellent');
assert.equal(reviewTierBadgeKey('complete'), 'valueTierComplete');
assert.equal(reviewTierBadgeKey('basic'), null);
assert.equal(reviewTierBadgeKey(null), null);

assert.equal(reviewValueGapKey('pros_cons'), 'valueGapProsCons');
assert.equal(reviewValueGapKey('toString'), null);
assert.equal(reviewValueGapKey(1), null);

// Review ids: uuids only, at most 100, deduplicated case-insensitively.
assert.ok(isReviewId(ID));
assert.ok(!isReviewId('stored'));
assert.deepEqual(parseReviewIds([ID, ID.toUpperCase()]), [ID]);
assert.deepEqual(parseReviewIds([]), []);
assert.equal(parseReviewIds([ID, 'x']), null);
assert.equal(parseReviewIds(ID), null);
assert.equal(parseReviewIds(new Array(101).fill(ID)), null);

// The writer's value: a 0-100 score, rounded, and the known gaps once each.
assert.deepEqual(
  parseMyReviewValue('61.5', { gaps: ['photo', 'x', 'photo', 'verified'] }),
  { score: 62, gaps: ['photo', 'verified'] }
);
assert.deepEqual(parseMyReviewValue(0, null), { score: 0, gaps: [] });
for (const score of [-1, 101, Number.NaN, 'abc', null, undefined]) {
  assert.equal(parseMyReviewValue(score, { gaps: [] }), null);
}

// Only a non-empty Supabase auth cookie counts as a session.
assert.ok(hasSessionCookie('a=1; sb-abc-auth-token=xyz'));
assert.ok(hasSessionCookie('sb-abc-auth-token.0=base64-xyz'));
assert.ok(!hasSessionCookie('sb-abc-auth-token='));
assert.ok(!hasSessionCookie('x-sb-abc-auth-token=1'));
assert.ok(!hasSessionCookie(''));

console.log('✅ review value display (tier, ids, writer value) passed');
