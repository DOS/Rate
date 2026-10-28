import assert from 'node:assert/strict';
import { filterMerchantDirectory } from '../merchant-directory';
import { hasReviewRiskEvidence } from '../merchant-risk-tone';
import { filterAndSortMerchants, type MerchantSummary } from '../rate-domain';

// A store with no analysed reviews has no measured review risk: no number,
// no low-risk filter match, and not sorted as the lowest risk (DOS/Rate#1249).

function merchant(
  id: string,
  reviewRisk: number,
  totalReviews: number,
  trust = 80
): MerchantSummary {
  return {
    id,
    platform: 'shopee',
    platform_shop_id: id,
    name: `Shop ${id}`,
    slug: id,
    is_official: false,
    trust_score: trust,
    risk_score: 100 - trust,
    dosafe_risk_score: 0,
    review_risk_score: reviewRisk,
    product_count: 1,
    follower_count: 0,
    review_risk_breakdown: {
      total_reviews: totalReviews,
      authentic_count: totalReviews,
      coin_spam_count: 0,
      seeding_fake_count: 0,
      sabotage_or_bombing_count: 0,
      suspicious_ratio_pct: 0,
    },
  } as unknown as MerchantSummary;
}

function main() {
  console.warn('🧪 merchant review risk suite (DOS/Rate#1249)');

  assert.equal(hasReviewRiskEvidence({ total_reviews: 3 }), true);
  assert.equal(hasReviewRiskEvidence({ total_reviews: 0 }), false);
  assert.equal(hasReviewRiskEvidence({ total_reviews: Number.NaN }), false);
  assert.equal(hasReviewRiskEvidence(null), false);
  assert.equal(hasReviewRiskEvidence(undefined), false);

  // FPT Shop case: a 4/100 baseline with no reviews against measured stores.
  const noReviews = merchant('none', 4, 0, 96);
  const measuredLow = merchant('low', 10, 20);
  const measuredHigh = merchant('high', 60, 20);
  const all = [noReviews, measuredHigh, measuredLow];

  const sorted = filterMerchantDirectory(all, {
    query: '',
    platform: 'all',
    officialOnly: false,
    riskTier: 'all',
    seedingTier: 'all',
    sortBy: 'seeding_asc',
  });
  assert.deepEqual(
    sorted.map((m) => m.id),
    ['low', 'high', 'none'],
    'stores with no reviews sort after every measured store'
  );

  const low = filterMerchantDirectory(all, {
    query: '',
    platform: 'all',
    officialOnly: false,
    riskTier: 'all',
    seedingTier: 'low',
    sortBy: 'trust_desc',
  });
  assert.deepEqual(
    low.map((m) => m.id),
    ['low'],
    'no reviews is not low review risk'
  );
  const elevated = filterMerchantDirectory(all, {
    query: '',
    platform: 'all',
    officialOnly: false,
    riskTier: 'all',
    seedingTier: 'elevated',
    sortBy: 'trust_desc',
  });
  assert.deepEqual(
    elevated.map((m) => m.id),
    ['high']
  );

  // The API list sort agrees with the directory.
  assert.deepEqual(
    filterAndSortMerchants(all, { sort: 'seeding_asc' }).map((m) => m.id),
    ['low', 'high', 'none']
  );

  console.warn('  ✅ merchant review risk suite passed');
}

main();
