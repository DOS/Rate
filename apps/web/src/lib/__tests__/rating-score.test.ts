import assert from 'node:assert/strict';
import {
  buildPopular1v1BattlesForCategory,
  computeJReviewsCriteriaScores,
  displayedScore5,
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
} from '../leaderboard-engine';
import {
  productRatingScore5,
  resolveCompareEffectiveUserRating,
  resolveStoredRatingScore,
} from '../rate-domain';
import type { MasterProduct } from '../rate-api';

// One rating everywhere (DOS/Rate#1545, design #1531 D3): the stored
// Bayesian rating_score, rounded once to one decimal; the composite only
// breaks ties. Criterion scores come from criteria_scores past D9's
// thresholds: 3 writers to show, 5 to rank.

const phone = (
  slug: string,
  fields: Partial<Record<string, unknown>> = {}
): MasterProduct =>
  ({
    id: `id-${slug}`,
    slug,
    name: slug,
    brand: 'Brand',
    model: slug,
    min_price: 20_000_000,
    metadata: { category_slug: 'smartphones' },
    ...fields,
  }) as unknown as MasterProduct;

const crit = (score: number, writers: number) => ({
  score,
  weight_sum: writers,
  writers,
});

// The stored rating wins over the older ratings, unrounded.
assert.equal(
  resolveCompareEffectiveUserRating(
    phone('a', {
      rating_score: 4.249,
      user_rating_weighted: 4.8,
      average_rating: 4.9,
    })
  ),
  4.249
);
// Without one, the older chain stands.
assert.equal(
  resolveCompareEffectiveUserRating(
    phone('a', { rating_score: null, user_rating_weighted: 4.5 })
  ),
  4.5
);
assert.equal(
  resolveCompareEffectiveUserRating(phone('a', { average_rating: 4.1 })),
  4.1
);
assert.equal(resolveStoredRatingScore(phone('a', { rating_score: 7 })), 0);
assert.equal(resolveStoredRatingScore(null), 0);

// Rounded once: 4.249 shows 4.2, not 4.25 then 4.3 (#1545 follow-up 3).
assert.equal(productRatingScore5(phone('a', { rating_score: 4.249 })), 4.2);
assert.equal(productRatingScore5(phone('a', { rating_score: 4.25 })), 4.3);
assert.equal(productRatingScore5(phone('a')), null);
assert.equal(displayedScore5(4.249), 4.2);
assert.equal(displayedScore5(0), 0);

// The leaderboard reads the same number.
const scored = scoreMasterProductForLeaderboard(
  phone('a', { rating_score: 4.249, user_rating_weighted: 4.8 })
);
assert.equal(scored.userScore5, 4.249);
assert.equal(scored.activeScore5, 4.249);
assert.equal(scored.activeScore10, 8.4);

// Criterion scores: 3 writers show, 5 rank; fewer fall back to an expert
// score, or to null.
const criteria = computeJReviewsCriteriaScores(
  phone('a', {
    criteria_scores: {
      battery: crit(4.6, 5),
      camera: crit(4.1, 3),
      display: crit(3.9, 2),
    },
    expert_criteria_scores: { screen: 8, battery: 6 },
  })
);
assert.deepEqual(criteria, {
  screen: 4, // 2 writers on display: the expert's 8/10
  performance: null,
  camera: 4.1,
  battery: 4.6, // the reviewers' score wins over the expert's
  value: null,
});
assert.deepEqual(
  computeJReviewsCriteriaScores(
    phone('a', {
      criteria_scores: { battery: crit(4.6, 5), camera: crit(4.1, 3) },
    }),
    5
  ),
  { screen: null, performance: null, camera: null, battery: 4.6, value: null }
);
// A malformed or inherited entry is no score.
assert.deepEqual(
  computeJReviewsCriteriaScores(
    phone('a', {
      criteria_scores: {
        battery: { score: 9, writers: 10 },
        camera: 'x',
        toString: crit(4, 9),
      },
    })
  ),
  {
    screen: null,
    performance: null,
    camera: null,
    battery: null,
    value: null,
  }
);

// A criterion view ranks only scores from 5 writers.
const camera = rankMasterProductsForLeaderboard(
  [
    phone('three', {
      rating_score: 4.5,
      criteria_scores: { camera: crit(4.9, 3) },
    }),
    phone('five', {
      rating_score: 4.5,
      criteria_scores: { camera: crit(4.2, 5) },
    }),
  ],
  { category: 'smartphones', criterion: 'camera' }
);
assert.deepEqual(
  camera.map((e) => e.slug),
  ['five']
);
// The row still shows the 3-writer score.
assert.equal(
  scoreMasterProductForLeaderboard(
    phone('three', { criteria_scores: { camera: crit(4.9, 3) } })
  ).criteria.camera,
  4.9
);

// The overall view ranks by the rating as shown: 4.62 and 4.58 both show
// 4.6, so the composite (the expert score here) decides; an unrated
// product with an expert score comes last, not dropped.
const overall = rankMasterProductsForLeaderboard(
  [
    phone('expert-only', { expert_rating: 5 }),
    phone('higher-hidden', { rating_score: 4.62 }),
    phone('lower-with-expert', { rating_score: 4.58, expert_rating: 5 }),
    phone('lower', { rating_score: 4.4 }),
  ],
  { category: 'smartphones', criterion: 'combined' }
);
assert.deepEqual(
  overall.map((e) => e.slug),
  ['lower-with-expert', 'higher-hidden', 'lower', 'expert-only']
);
assert.equal(overall[3]!.activeScore5, 0);

// Battle cards: the rating as shown decides and gives the gap.
const battles = buildPopular1v1BattlesForCategory(
  [
    phone('a', { rating_score: 4.62 }),
    phone('b', { rating_score: 4.58, expert_rating: 5 }),
    phone('c', { rating_score: 4.21 }),
  ],
  'smartphones',
  3
);
const ab = battles.find(
  (b) => [b.productA.slug, b.productB.slug].sort().join() === ['a', 'b'].join()
)!;
assert.equal(ab.scoreDelta5, 0); // both show 4.6
assert.equal(ab.winnerSlug, 'b'); // the composite breaks the tie
const ac = battles.find(
  (b) => [b.productA.slug, b.productB.slug].sort().join() === ['a', 'c'].join()
)!;
assert.equal(ac.scoreDelta5, 0.4);
assert.equal(ac.winnerSlug, 'a');

console.log('rating-score: one rating, rounded once; D9 criterion thresholds');
