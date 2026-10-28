import assert from 'node:assert/strict';
import { reviewRiskScoreOrNull } from '../merchant-review-risk';
import {
  DEFAULT_MERCHANT_DIRECTORY_FILTERS,
  filterMerchantDirectory,
} from '../merchant-directory';
import type { MerchantSummary } from '../rate-api';

// A store with no analysed review has no review risk score (DOS/Rate#1249).

const breakdown = (total: number) => ({
  total_reviews: total,
  authentic_count: total,
  coin_spam_count: 0,
  seeding_fake_count: 0,
  sabotage_or_bombing_count: 0,
  suspicious_ratio_pct: 0,
});

const merchant = (
  id: string,
  reviewRisk: number,
  totalReviews: number
): MerchantSummary =>
  ({
    id,
    platform: 'shopee',
    platform_shop_id: id,
    name: `Shop ${id}`,
    slug: id,
    url: null,
    is_official: false,
    rating_star: null,
    follower_count: 0,
    location: null,
    dosafe_risk_score: 5,
    review_risk_score: reviewRisk,
    risk_score: 5,
    trust_score: 90,
    product_count: 1,
    min_price: null,
    max_price: null,
    review_risk_breakdown: breakdown(totalReviews),
    updated_at: null,
  }) as unknown as MerchantSummary;

function main() {
  console.warn('🧪 Merchant review risk suite (DOS/Rate#1249)');

  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 4,
      review_risk_breakdown: breakdown(0),
    }),
    null
  );
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 12,
      review_risk_breakdown: breakdown(30),
    }),
    12
  );
  // No breakdown: the stored score stands; no score at all is null.
  assert.equal(reviewRiskScoreOrNull({ review_risk_score: 7 }), 7);
  assert.equal(reviewRiskScoreOrNull({ review_risk_score: null }), null);
  assert.equal(reviewRiskScoreOrNull({ review_risk_score: 140 }), 100);

  const noReviews = merchant('fpt', 4, 0);
  const lowRisk = merchant('low', 10, 40);
  const highRisk = merchant('high', 60, 40);
  const sorted = filterMerchantDirectory([noReviews, highRisk, lowRisk], {
    ...DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    sortBy: 'seeding_asc',
  }).map((m) => m.id);
  assert.deepEqual(sorted, ['low', 'high', 'fpt'], 'no data sorts last');
  const lowTier = filterMerchantDirectory([noReviews, highRisk, lowRisk], {
    ...DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    seedingTier: 'low',
  }).map((m) => m.id);
  assert.deepEqual(lowTier, ['low'], 'no data is not a low-risk store');
  console.warn('✅ Merchant review risk suite passed');
}

main();
