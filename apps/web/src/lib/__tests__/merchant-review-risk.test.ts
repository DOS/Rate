import assert from 'node:assert/strict';
import {
  filterMerchantDirectory,
  summarizeMerchantDirectory,
} from '../merchant-directory';
import { merchantRiskFromSignals } from '../rate-domain-core';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
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
  await combinedColumnIsNotReviewRisk();
  await publicOffersSayNoneWithoutReviews();

  // A store with neither a DOSafe score nor analysed reviews has no trust
  // score, not "high trust 100/100"; with one signal, that one alone counts
  // (DOS/Rate#1484).
  {
    const none = {
      dosafeKnown: false,
      dosafeRisk: 0,
      baseRisk: 0,
      reviewKnown: false,
      reviewRisk: 12,
      storedCombined: 30,
    };
    assert.deepEqual(merchantRiskFromSignals(none), {
      risk_score: null,
      trust_score: null,
    });
    // DOSafe only: the review baseline and the stored split do not count.
    assert.deepEqual(
      merchantRiskFromSignals({ ...none, dosafeKnown: true, dosafeRisk: 5 }),
      { risk_score: 5, trust_score: 95 }
    );
    // Reviews only.
    assert.deepEqual(
      merchantRiskFromSignals({ ...none, reviewKnown: true, reviewRisk: 20 }),
      { risk_score: 20, trust_score: 80 }
    );
    // Both: the higher risk, raised by a stored combined score.
    assert.deepEqual(
      merchantRiskFromSignals({
        ...none,
        dosafeKnown: true,
        dosafeRisk: 5,
        reviewKnown: true,
        reviewRisk: 20,
      }),
      { risk_score: 30, trust_score: 70 }
    );
    // A known DOSafe 0 and a known clean review set are a real 100.
    assert.deepEqual(
      merchantRiskFromSignals({
        ...none,
        dosafeKnown: true,
        reviewKnown: true,
        reviewRisk: 0,
        storedCombined: null,
      }),
      { risk_score: 0, trust_score: 100 }
    );

    const unscored = {
      ...merchant('n', 0, 0),
      trust_score: null,
      risk_score: null,
    } as unknown as MerchantSummary;
    const high = merchant('h', 5, 10, 90);
    const low = merchant('l', 5, 10, 40);
    // Last in every trust order, in both sort paths.
    assert.deepEqual(
      filterMerchantDirectory([unscored, low, high], {
        query: '',
        platform: 'all',
        officialOnly: false,
        riskTier: 'all',
        seedingTier: 'all',
        sortBy: 'trust_desc',
      }).map((m) => m.id),
      ['h', 'l', 'n']
    );
    assert.deepEqual(
      filterAndSortMerchants([unscored, low, high], { sort: 'trust_desc' }).map(
        (m) => m.id
      ),
      ['h', 'l', 'n']
    );
    // In no risk tier, "warning" included.
    for (const riskTier of ['safe', 'moderate', 'warning'] as const) {
      assert.ok(
        !filterMerchantDirectory([unscored], {
          query: '',
          platform: 'all',
          officialOnly: false,
          riskTier,
          seedingTier: 'all',
          sortBy: 'trust_desc',
        }).some((m) => m.id === 'n'),
        riskTier
      );
    }
    // Neither "safe" nor part of the average; no average with no score at all.
    const stats = summarizeMerchantDirectory([unscored, high, low]);
    assert.equal(stats.total, 3);
    assert.equal(stats.safe, 1);
    assert.equal(stats.avgTrust, 65);
    assert.equal(summarizeMerchantDirectory([unscored]).avgTrust, null);
    assert.equal(summarizeMerchantDirectory([unscored]).safe, 0);
  }

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

// Rate Services' split (RS#708): the column is the combined risk, and the
// breakdown carries the review-only part over `total_reviews` (#1268).
async function combinedColumnIsNotReviewRisk() {
  const {
    mapTrustViewRowToMerchantOffer,
    mapOfferRowToMerchantOffer,
    persistedReviewRiskOf,
    hasStoredReviewRisk,
    storedRiskSplit,
  } = await import('../rate-api');
  const noReviews = {
    combined_risk_score: 42,
    review_risk_score: 15,
    total_reviews: 0,
    authentic_count: 0,
  };
  const measured = { ...noReviews, review_risk_score: 28, total_reviews: 40 };
  assert.deepEqual(storedRiskSplit(noReviews), {
    combined: 42,
    reviewOnly: null,
  });
  assert.deepEqual(storedRiskSplit(measured), {
    combined: 42,
    reviewOnly: 28,
  });
  assert.deepEqual(
    storedRiskSplit({}, { review_risk_breakdown: measured }),
    { combined: 42, reviewOnly: 28 },
    'the breakdown nested in metadata'
  );
  assert.equal(
    storedRiskSplit({ total_reviews: 12 }, { combined_risk_score: 80 }),
    null,
    'a legacy breakdown with an older combined score is no split'
  );
  assert.deepEqual(
    storedRiskSplit(
      {},
      { combined_risk_score: 7, review_risk_score: 3, total_reviews: 0 }
    ),
    { combined: 7, reviewOnly: null },
    'metadata mirrors the split'
  );
  // Older metadata carried a combined score next to a review score, with no
  // review count: it is no split and keeps today's reading.
  const legacyMeta = {
    dosafe_risk_score: 15,
    review_risk_score: 68,
    combined_risk_score: 48,
  };
  assert.equal(storedRiskSplit({}, legacyMeta), null);
  assert.equal(
    persistedReviewRiskOf({ review_risk_breakdown: {}, metadata: legacyMeta }),
    68
  );
  // The combined score never drops below the column.
  assert.equal(storedRiskSplit(measured, undefined, 60)?.combined, 60);
  assert.equal(
    storedRiskSplit({ total_reviews: 12 }),
    null,
    'an older breakdown keeps the current reading'
  );

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
  const viewNoReviews = mapTrustViewRowToMerchantOffer(
    { ...row, review_risk_score: 42, review_risk_breakdown: noReviews },
    0
  );
  assert.equal(
    hasReviewRiskEvidence(viewNoReviews.merchant.review_risk_breakdown),
    false,
    'no analysed review: no review risk number'
  );
  assert.notEqual(viewNoReviews.merchant.review_risk_score, 42);
  assert.equal(viewNoReviews.merchant.risk_score, 42, 'combined drives trust');
  const viewMeasured = mapTrustViewRowToMerchantOffer(
    { ...row, review_risk_score: 42, review_risk_breakdown: measured },
    0
  );
  assert.equal(viewMeasured.merchant.review_risk_score, 28);
  assert.equal(viewMeasured.merchant.risk_score, 42);

  const offer = mapOfferRowToMerchantOffer({
    id: 'o2',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm2',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: 42,
      review_risk_breakdown: measured,
      metadata: {},
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(offer.merchant.review_risk_score, 28);
  assert.equal(offer.merchant.risk_score, 42);
  // Older metadata's combined score does not override the split's.
  const staleMeta = mapOfferRowToMerchantOffer({
    id: 'o3',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm3',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: 42,
      review_risk_breakdown: measured,
      metadata: { combined_risk_score: 80 },
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(staleMeta.merchant.risk_score, 42);
  // A split only in metadata keeps its breakdown and review-only score.
  const metaOnly = mapOfferRowToMerchantOffer({
    id: 'o4',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm4',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: 0,
      review_risk_breakdown: {},
      metadata: { review_risk_breakdown: measured },
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(metaOnly.merchant.review_risk_score, 28);
  assert.equal(
    hasReviewRiskEvidence(metaOnly.merchant.review_risk_breakdown),
    true
  );

  // Merchant list and profile read the review-only part, and the combined
  // score still caps trust.
  const merchantRow = {
    review_risk_score: 42,
    review_risk_breakdown: noReviews,
    metadata: {},
  };
  assert.equal(persistedReviewRiskOf(merchantRow), 0);
  assert.equal(hasStoredReviewRisk(merchantRow), true);
  assert.equal(
    persistedReviewRiskOf({ ...merchantRow, review_risk_breakdown: measured }),
    28
  );
}

// Public offers carry the seller's review risk as every merchant surface does:
// null with no analysed review, the review-only score with some (#1376).
async function publicOffersSayNoneWithoutReviews() {
  const { mapTrustViewRowToMerchantOffer, mapOfferRowToMerchantOffer } =
    await import('../rate-api');
  const { withPublicOfferReviewRisk } =
    await import('../../server/rate/api-handler');
  // A seller with no known DOSafe score answers null in public payloads, never the
  // column's default 0; the internal flag never leaves (DOS/Rate#1465).
  {
    const { withPublicReviewRisk } =
      await import('../../server/rate/api-handler');
    const base = {
      review_risk_score: 12,
      review_risk_breakdown: { total_reviews: 5 },
    };
    const unknown = withPublicReviewRisk({
      ...base,
      dosafe_risk_score: 0,
      dosafe_risk_known: false,
    });
    assert.equal(unknown.dosafe_risk_score, null);
    assert.equal('dosafe_risk_known' in unknown, false);
    const known = withPublicReviewRisk({
      ...base,
      dosafe_risk_score: 0,
      dosafe_risk_known: true,
    });
    assert.equal(known.dosafe_risk_score, 0);
    assert.equal('dosafe_risk_known' in known, false);
    // A payload without the flag keeps its score.
    assert.equal(
      withPublicReviewRisk({ ...base, dosafe_risk_score: 7 }).dosafe_risk_score,
      7
    );
    // Cards read the server-side flag and the public null alike, so a seller
    // reads the same before and after a client fetch (DOS/Rate#1465).
    assert.equal(
      knownDosafeRiskScore({ dosafe_risk_score: 0, dosafe_risk_known: false }),
      null
    );
    assert.equal(knownDosafeRiskScore({ dosafe_risk_score: null }), null);
    assert.equal(knownDosafeRiskScore({}), null);
    assert.equal(
      knownDosafeRiskScore({ dosafe_risk_score: 0, dosafe_risk_known: true }),
      0
    );
    assert.equal(knownDosafeRiskScore({ dosafe_risk_score: 0 }), 0);
    assert.equal(knownDosafeRiskScore({ dosafe_risk_score: '35' }), 35);
    assert.equal(knownDosafeRiskScore({ dosafe_risk_score: 140 }), 100);
  }
  const noReviews = {
    combined_risk_score: 42,
    review_risk_score: 15,
    total_reviews: 0,
    authentic_count: 0,
  };
  const measured = { ...noReviews, review_risk_score: 28, total_reviews: 40 };
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
  // The trust view (the live read) and the merchants fallback alike.
  const viewOffer = mapTrustViewRowToMerchantOffer(
    { ...row, review_risk_score: 42, review_risk_breakdown: noReviews },
    0
  );
  assert.equal(
    withPublicOfferReviewRisk(viewOffer).merchant.review_risk_score,
    null,
    'a seller with total_reviews 0 has no review risk'
  );
  const fallbackOffer = mapOfferRowToMerchantOffer({
    id: 'o2',
    platform: 'shopee',
    title: 'Phone',
    price_current: 1_000_000,
    url: 'https://shopee.vn/p',
    merchants: {
      id: 'm2',
      name: 'Shop',
      platform: 'shopee',
      review_risk_score: 42,
      review_risk_breakdown: noReviews,
      metadata: {},
    },
  } as unknown as Parameters<typeof mapOfferRowToMerchantOffer>[0]);
  assert.equal(
    withPublicOfferReviewRisk(fallbackOffer).merchant.review_risk_score,
    null
  );
  // A never-scored seller gets a baseline that counts no review: null too.
  const unscored = mapTrustViewRowToMerchantOffer(
    { ...row, review_risk_score: 0, review_risk_breakdown: {} },
    0
  );
  assert.equal(
    withPublicOfferReviewRisk(unscored).merchant.review_risk_score,
    null,
    'a baseline is no measurement'
  );
  // Measured reviews keep the review-only score; the rest of the offer stays.
  const measuredOffer = withPublicOfferReviewRisk(
    mapTrustViewRowToMerchantOffer(
      { ...row, review_risk_score: 42, review_risk_breakdown: measured },
      0
    )
  );
  assert.equal(measuredOffer.merchant.review_risk_score, 28);
  assert.equal(measuredOffer.merchant.risk_score, 42);
  assert.equal(measuredOffer.price_current, 1_000_000);
  // An offer with no seller passes through.
  const sellerless = { id: 'o3', merchant: null };
  assert.equal(withPublicOfferReviewRisk(sellerless), sellerless);

  // Every public route that returns offers passes them through it.
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const apiDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../app/api/v1/rate'
  );
  for (const route of [
    'products/[slug]/route.ts',
    'item-size/[slug]/route.ts',
    'inspect/route.ts',
    'lookup/route.ts',
    'extension/lookup/route.ts',
  ]) {
    assert.match(
      readFileSync(join(apiDir, route), 'utf8'),
      /\.map\(withPublicOfferReviewRisk\)/,
      `${route} returns offers through withPublicOfferReviewRisk`
    );
  }
  assert.match(
    readFileSync(join(apiDir, 'extension/lookup/route.ts'), 'utf8'),
    /topCheaperOffers: result\.topCheaperOffers\.map\(\s*withPublicOfferReviewRisk/,
    'the extension lookup also passes its cheaper offers through it'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
