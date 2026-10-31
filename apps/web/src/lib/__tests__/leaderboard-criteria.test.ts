import assert from 'node:assert/strict';
import {
  computeJReviewsCriteriaScores,
  computeProductStandingInCategory,
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
  sharedScoredCriteria,
  weightedCriteriaScore5,
} from '../leaderboard-engine';
import type { MasterProduct } from '../rate-api';

// Per-criterion scores are real or null, never derived from the star rating
// (DOS/Rate#1143): a well-rated product used to score 5.00 on every
// criterion, so rankings tied and "#1 Màn hình" chips were invented.

const phone = (
  slug: string,
  rating: number,
  criteria?: Record<string, number>
): MasterProduct =>
  ({
    id: `id-${slug}`,
    slug,
    name: slug,
    brand: 'Brand',
    model: slug,
    user_rating_weighted: rating,
    min_price: 20_000_000,
    specifications: {
      display: { refresh_rate_hz: 120 },
      hardware: { ram_gb: 16 },
      battery: { capacity_mah: 6000 },
      camera: { second_camera: '50 MP' },
    },
    metadata: { category_slug: 'smartphones' },
    ...(criteria ? { expert_criteria_scores: criteria } : {}),
  }) as unknown as MasterProduct;

const NONE = {
  screen: null,
  performance: null,
  camera: null,
  battery: null,
  value: null,
};

// A 4.9-star phone with strong specs and no criterion scores has none.
const rated = scoreMasterProductForLeaderboard(phone('rated-a', 4.9));
assert.deepEqual(rated.criteria, NONE);
// Its combined score is its user score alone, not lifted by invented
// criteria.
assert.equal(rated.combinedScore5, 4.9);

// Stored criterion scores are real: they show (a 10-point one is halved), and
// they join the combined score.
const scored = scoreMasterProductForLeaderboard(
  phone('scored-b', 4.5, { screen: 9, battery: 4 })
);
assert.equal(scored.criteria.screen, 4.5);
assert.equal(scored.criteria.battery, 4);
assert.equal(scored.criteria.camera, null);
assert.equal(
  scored.combinedScore5,
  Number((4.5 * 0.8 + 4.25 * 0.2).toFixed(2))
);

// Earbuds have no screen criterion, even with a stored score for it.
const buds = computeJReviewsCriteriaScores({
  ...phone('buds', 4.8, { screen: 4.9, sound: 4.7 }),
  metadata: { category_slug: 'earbuds' },
} as unknown as MasterProduct);
assert.equal(buds.screen, null);
assert.equal(buds.camera, 4.7);

// A criterion ranking lists only products with a real score on it.
const peers = [
  phone('rated-a', 4.9),
  phone('rated-c', 4.95),
  phone('scored-b', 4.5, { screen: 9, battery: 4 }),
];
assert.deepEqual(
  rankMasterProductsForLeaderboard(peers, {
    category: 'smartphones',
    criterion: 'screen',
  }).map((r) => r.slug),
  ['scored-b']
);
assert.deepEqual(
  rankMasterProductsForLeaderboard(peers, {
    category: 'smartphones',
    criterion: 'camera',
  }),
  []
);

// Rank chips: a product without criterion data gets only its overall rank,
// and a criterion with one scored product ranks nothing ("#1 of 1").
const badgesFor = (slug: string, list: MasterProduct[]) =>
  computeProductStandingInCategory(
    list.find((p) => p.slug === slug)!,
    list
  ).map((b) => `${b.criterion}#${b.rank}/${b.totalInCategory}`);
assert.deepEqual(badgesFor('rated-a', peers), ['combined#2/3']);
assert.deepEqual(badgesFor('scored-b', peers), ['combined#3/3']);
// With two scored products, the criterion ranks among those two only.
const twoScored = [...peers, phone('scored-d', 4.4, { screen: 8 })];
assert.deepEqual(badgesFor('scored-b', twoScored), [
  'combined#3/4',
  'screen#1/2',
]);

// Weighted criteria: only scored, weighted criteria count; none gives null.
const w = { screen: 20, performance: 20, camera: 20, battery: 20, value: 20 };
assert.equal(weightedCriteriaScore5(NONE, w), null);
assert.equal(
  weightedCriteriaScore5({ ...NONE, screen: 4, battery: 5 }, w),
  4.5
);
assert.equal(
  weightedCriteriaScore5({ ...NONE, screen: 4, battery: 5 }, w, ['battery']),
  5
);
assert.deepEqual(
  sharedScoredCriteria(
    { ...NONE, screen: 4, battery: 5 },
    { ...NONE, battery: 3, value: 4 }
  ),
  ['battery']
);

console.log('leaderboard-criteria: criterion scores are real or null');
