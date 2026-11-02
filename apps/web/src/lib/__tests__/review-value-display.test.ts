import assert from 'node:assert/strict';
import {
  hasSessionCookie,
  isReviewId,
  parseMyReviewValue,
  parseReviewIds,
  parseReviewValueTier,
  reviewTierBadgeKey,
  reviewTierRank,
  reviewValueGapKey,
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
