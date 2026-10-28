import assert from 'node:assert/strict';
import { filterMerchantDirectory } from '../merchant-directory';
import {
  hasReviewRiskEvidence,
  reviewRiskScoreOrNull,
} from '../merchant-risk-tone';
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

async function main() {
  console.warn('🧪 merchant review risk suite (DOS/Rate#1249)');

  assert.equal(hasReviewRiskEvidence({ total_reviews: 3 }), true);
  assert.equal(hasReviewRiskEvidence({ total_reviews: 0 }), false);
  assert.equal(hasReviewRiskEvidence({ total_reviews: Number.NaN }), false);
  assert.equal(hasReviewRiskEvidence({ total_reviews: '0' }), false);
  // No breakdown or no count says nothing: a stored score stays (#1258).
  assert.equal(hasReviewRiskEvidence(null), true);
  assert.equal(hasReviewRiskEvidence(undefined), true);
  assert.equal(hasReviewRiskEvidence({}), true);

  // Public payloads carry null instead of a baseline (DOS/Rate#1258).
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 4,
      review_risk_breakdown: { total_reviews: 0 },
    }),
    null
  );
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 30.4,
      review_risk_breakdown: { total_reviews: 12 },
    }),
    30
  );
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 68,
      review_risk_breakdown: null,
    }),
    68
  );
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: null,
      review_risk_breakdown: null,
    }),
    null
  );
  assert.equal(
    reviewRiskScoreOrNull({
      review_risk_score: 140,
      review_risk_breakdown: { total_reviews: 3 },
    }),
    100
  );

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

  await directoryReadsReviewsForStoredScores();
  await offerSellersWithoutReviewsReadAsNoData();

  console.warn('  ✅ merchant review risk suite passed');
}

// A store with a stored review score but no persisted breakdown: the
// directory reads its reviews for the breakdown, as the profile does, and
// keeps the stored score (DOS/Rate#1258).
async function directoryReadsReviewsForStoredScores() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';
  const { getMerchantsList } = await import('../rate-api');
  const STORED = '00000000-0000-4000-8000-000000001258';
  const NONE = '00000000-0000-4000-8000-000000001259';
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (Number(url.searchParams.get('offset') ?? 0) > 0) return json([]);
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'merchants') {
      return json([
        {
          id: STORED,
          platform: 'shopee',
          platform_shop_id: 's',
          name: 'Stored',
          is_official: false,
          risk_score: 0,
          review_risk_score: null,
          review_risk_breakdown: {},
          metadata: { review_risk_score: 30 },
        },
        {
          id: NONE,
          platform: 'fptshop',
          platform_shop_id: 'n',
          name: 'None',
          is_official: false,
          risk_score: 0,
          review_risk_score: 4,
          review_risk_breakdown: {},
          metadata: {},
        },
      ]);
    }
    if (table === 'products') {
      return json([
        { id: 'p-stored', merchant_id: STORED, price_current: 1_000_000 },
        { id: 'p-none', merchant_id: NONE, price_current: 2_000_000 },
      ]);
    }
    if (table === 'reviews') {
      return json(
        decodeURIComponent(url.search).includes('p-stored')
          ? [
              {
                id: 'r1',
                product_id: 'p-stored',
                rating_star: 5,
                comment: 'ok',
                review_flags: { verdict: 'authentic' },
              },
              {
                id: 'r2',
                product_id: 'p-stored',
                rating_star: 4,
                comment: 'ok',
                review_flags: { verdict: 'authentic' },
              },
            ]
          : []
      );
    }
    return json([]);
  }) as typeof fetch;

  const list = await getMerchantsList({});
  const stored = list.find((m) => m.id === STORED);
  const none = list.find((m) => m.id === NONE);
  assert.ok(stored && none);
  assert.equal(stored.review_risk_breakdown.total_reviews, 2);
  assert.equal(stored.review_risk_score, 30, 'the stored score is kept');
  assert.equal(hasReviewRiskEvidence(stored.review_risk_breakdown), true);
  assert.equal(hasReviewRiskEvidence(none.review_risk_breakdown), false);
}

// A seller the importer never scored gets the baseline score on offer lines,
// with a breakdown counting no review, so the product page says "not enough
// data" as the merchant page does (DOS/Rate#1258).
async function offerSellersWithoutReviewsReadAsNoData() {
  const { mapTrustViewRowToMerchantOffer, mapOfferRowToMerchantOffer } =
    await import('../rate-api');
  const row = {
    id: 'o1',
    merchant_id: 'm1',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchant_name: 'Shop',
    merchant_is_official: false,
    price_original: null,
    stock: 1,
    rating_star: 5,
    rating_count: 1,
  };
  const unscored = mapTrustViewRowToMerchantOffer(
    { ...row, review_risk_score: 0, review_risk_breakdown: {} },
    0
  );
  assert.equal(
    hasReviewRiskEvidence(unscored.merchant.review_risk_breakdown),
    false
  );
  const scored = mapTrustViewRowToMerchantOffer(
    {
      ...row,
      review_risk_score: 30,
      review_risk_breakdown: { total_reviews: 12 },
    },
    0
  );
  assert.equal(scored.merchant.review_risk_score, 30);
  assert.equal(
    hasReviewRiskEvidence(scored.merchant.review_risk_breakdown),
    true
  );

  const fallbackBaseline = mapOfferRowToMerchantOffer({
    id: 'o2',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm2',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: 0,
      review_risk_breakdown: {},
      metadata: {},
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(
    hasReviewRiskEvidence(fallbackBaseline.merchant.review_risk_breakdown),
    false
  );
  const fallbackStored = mapOfferRowToMerchantOffer({
    id: 'o3',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm3',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: null,
      review_risk_breakdown: null,
      metadata: { review_risk_score: 25 },
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(fallbackStored.merchant.review_risk_score, 25);
  assert.equal(
    hasReviewRiskEvidence(fallbackStored.merchant.review_risk_breakdown),
    true,
    'a stored score without a breakdown stays'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
