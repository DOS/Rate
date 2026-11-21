import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { pickClientMessages } from '../client-messages';
import { getRadarSignal } from '../deal-radar';
import { formatPriceVnd } from '../locale-format';
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
import {
  MAX_VALID_VND_PRICE,
  filterAndSortMerchants,
  type MerchantSummary,
} from '../rate-domain';
import MerchantDirectoryExplorer, {
  formatMerchantDirectoryPriceRange,
  merchantDirectoryDosafeDisplay,
  merchantDirectoryReviewRiskDisplay,
  merchantDirectoryTrustDisplay,
  sanitizeMerchantDirectoryPriceVnd,
} from '../../components/merchants/MerchantDirectoryExplorer';
import {
  MerchantProfilePriceBlock,
  collectMerchantPageProductSlugs,
  formatMerchantPagePriceVnd,
  resolveCanonicalItemSlug,
  resolveMerchantProductHref,
  resolveMerchantReviewRiskScore,
  sanitizeMerchantPagePriceVnd,
} from '../../app/[locale]/merchants/[id]/page';
import { toPublicMerchantDirectoryPage } from '../../app/[locale]/merchants/page';
import MerchantShareAuditButton, {
  buildMerchantAuditCsv,
  buildMerchantAuditJson,
  buildMerchantAuditMarkdown,
  sanitizeNullableMerchantScore100,
  type MerchantAuditTranslateFn,
  type MerchantShareAuditButtonProps,
} from '../../components/merchants/MerchantShareAuditButton';
import { fitDescription, fitTitle } from '../seo';
import type { MasterProduct } from '@repo/shared-data';
import type { CrossPlatformDealRadarResponse } from '../../server/rate';

const testDir = dirname(fileURLToPath(import.meta.url));

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
  merchantPagesRiskPriceAndA11ySuite();
  await homePageMerchantRadarAndCompareSuite();
  await merchantAuditExportsItemLinksAndRscStrippingSuite();

  // A store with neither a DOSafe score nor analysed reviews has no trust
  // score, not "high trust 100/100"; with one signal, the score is as before
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
    assert.deepEqual(
      merchantRiskFromSignals({ ...none, storedCombined: null }),
      { risk_score: null, trust_score: null }
    );
    // A stored combined score alone is a signal: scored as before (the
    // review baseline stays a floor).
    assert.deepEqual(merchantRiskFromSignals(none), {
      risk_score: 30,
      trust_score: 70,
    });
    // DOSafe only: the review baseline and the stored split stay floors, so
    // no store's trust rises.
    assert.deepEqual(
      merchantRiskFromSignals({ ...none, dosafeKnown: true, dosafeRisk: 5 }),
      { risk_score: 30, trust_score: 70 }
    );
    assert.deepEqual(
      merchantRiskFromSignals({
        ...none,
        dosafeKnown: true,
        dosafeRisk: 50,
        storedCombined: null,
      }),
      { risk_score: 50, trust_score: 50 }
    );
    // Reviews only: the unknown DOSafe score adds nothing; the stored split
    // stays a floor.
    assert.deepEqual(
      merchantRiskFromSignals({
        ...none,
        reviewKnown: true,
        reviewRisk: 20,
        storedCombined: null,
      }),
      { risk_score: 20, trust_score: 80 }
    );
    assert.deepEqual(
      merchantRiskFromSignals({ ...none, reviewKnown: true, reviewRisk: 20 }),
      { risk_score: 30, trust_score: 70 }
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
    // Any trust threshold, 0 included, needs a real score; a real 0 passes 0.
    const zero = merchant('z', 5, 10, 0);
    assert.deepEqual(
      filterAndSortMerchants([unscored, zero], { minTrust: 0 }).map(
        (m) => m.id
      ),
      ['z']
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

  // The deal radar never calls a seller with no score "low risk": its
  // cheapest offer is no genuine deal, and a scored seller still is
  // (DOS/Rate#1484).
  {
    const { computeCrossPlatformDealRadarFromData } =
      await import('../../server/rate/deals');
    const master = {
      id: 'mp-1484',
      slug: 'phone-1484',
      name: 'Phone 1484',
      brand: 'X',
      model: 'Phone',
      model_key: 'x:phone:128gb',
      category_id: null,
      min_price: 9_000_000,
      max_price: 10_000_000,
      merchant_count: 3,
      images: [],
      metadata: { category_slug: 'smartphones' },
    };
    const offer = (
      id: string,
      price: number,
      merchant: Record<string, unknown> | null
    ) => ({
      id,
      platform: 'shopee',
      title: 'Phone 1484',
      price_current: price,
      price_original: null,
      stock: 5,
      rating_star: 5,
      rating_count: 1,
      url: `https://shopee.vn/product/1484/${id}`,
      merchant,
    });
    const scored = (id: string, risk: number | null) => ({
      id,
      name: id,
      platform: 'shopee',
      is_official: true,
      rating_star: null,
      follower_count: 0,
      location: null,
      risk_score: risk,
      dosafe_risk_score: null,
      review_risk_score: 0,
      review_risk_breakdown: null,
    });
    const radarOf = (cheapest: Record<string, unknown> | null) =>
      computeCrossPlatformDealRadarFromData(
        [
          {
            master,
            offers: [
              offer('cheap', 8_000_000, cheapest),
              offer('mid', 10_000_000, scored('m-mid', 60)),
              offer('high', 10_500_000, scored('m-high', 60)),
            ],
          },
        ] as never,
        { categorySlug: 'all', platform: 'all', limit: 10 }
      );
    for (const cheapest of [null, scored('m-none', null)]) {
      assert.ok(
        !radarOf(cheapest).genuineDeals.some((d) =>
          d.offerUrl.endsWith('cheap')
        ),
        'a seller with no score is no low-risk deal'
      );
    }
    const deal = radarOf(scored('m-low', 5)).genuineDeals.find((d) =>
      d.offerUrl.endsWith('cheap')
    );
    assert.equal(deal?.merchantRiskScore, 5);
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
  const apiDir = join(testDir, '../../app/api/v1/rate');
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

// DOS/Rate#1733: /merchants and /merchants/[id] route review_risk_score via
// merchantRiskTone after integer rounding, treat trustScore <= 50 (risk >= 50)
// as high-risk alert while keeping trustScore >= 80 for highTrustShops, guard
// 0 VND and > MAX_VALID_VND_PRICE prices, and hide decorative SVG icons.
function merchantPagesRiskPriceAndA11ySuite() {
  // 1. Review risk badge tones + integer rounding (< 20 good, 20-49 warn, >= 50 bad).
  assert.equal(merchantDirectoryReviewRiskDisplay(null), null);
  assert.equal(
    merchantDirectoryReviewRiskDisplay({
      review_risk_score: 8,
      review_risk_breakdown: { total_reviews: 0 },
    }),
    null
  );
  for (const invalidScore of [null, '0x10', '8\t0', '1\n0', '\u000016']) {
    assert.equal(
      merchantDirectoryReviewRiskDisplay({
        review_risk_score: invalidScore,
        review_risk_breakdown: { total_reviews: 5 },
      }),
      null,
      `review_risk_score ${JSON.stringify(invalidScore)} must return null`
    );
  }
  for (const [raw, expectedScore, expectedTone, expectedCls] of [
    [0, 0, 'good', 'bg-success-subtle text-success'],
    [16, 16, 'good', 'bg-success-subtle text-success'],
    [' 16 ', 16, 'good', 'bg-success-subtle text-success'],
    [19.4, 19, 'good', 'bg-success-subtle text-success'],
    [19.5, 20, 'warn', 'bg-warning-subtle text-warning-emphasis'],
    [41, 41, 'warn', 'bg-warning-subtle text-warning-emphasis'],
    [49.4, 49, 'warn', 'bg-warning-subtle text-warning-emphasis'],
    [49.5, 50, 'bad', 'bg-danger-subtle text-danger'],
    [140, 100, 'bad', 'bg-danger-subtle text-danger'],
  ] as const) {
    assert.deepEqual(
      merchantDirectoryReviewRiskDisplay({
        review_risk_score: raw,
        review_risk_breakdown: { total_reviews: 10 },
      }),
      { score: expectedScore, tone: expectedTone, badgeClass: expectedCls },
      `review_risk_score ${String(raw)} must round to ${expectedScore} (${expectedTone})`
    );
  }
  assert.equal(
    merchantDirectoryDosafeDisplay({
      dosafe_risk_score: 19.6,
      dosafe_risk_known: true,
    })?.tone,
    'warn'
  );
  assert.equal(
    merchantDirectoryDosafeDisplay({
      dosafe_risk_score: 49.6,
      dosafe_risk_known: true,
    })?.tone,
    'bad'
  );

  // 2. Trust score thresholds: >= 80 high, 51-79 moderate, <= 50 high-risk alert.
  for (const invalid of [
    null,
    undefined,
    '',
    '0x50',
    '8\t0',
    '5\n0',
    '\u000080',
    Number.NaN,
  ]) {
    assert.equal(
      merchantDirectoryTrustDisplay(invalid),
      null,
      `invalid trustScore ${JSON.stringify(invalid)} must return null`
    );
  }
  for (const [raw, score, tier, badgeClass] of [
    [100, 100, 'high', 'bg-success text-white'],
    [80, 80, 'high', 'bg-success text-white'],
    [' 80 ', 80, 'high', 'bg-success text-white'],
    [79.6, 80, 'high', 'bg-success text-white'],
    [79, 79, 'moderate', 'bg-warning text-dark'],
    [51, 51, 'moderate', 'bg-warning text-dark'],
    [50.5, 51, 'moderate', 'bg-warning text-dark'],
    [50.4, 50, 'risk', 'bg-danger text-white'],
    [50, 50, 'risk', 'bg-danger text-white'],
    [0, 0, 'risk', 'bg-danger text-white'],
  ] as const) {
    assert.deepEqual(
      merchantDirectoryTrustDisplay(raw),
      { score, tier, badgeClass },
      `trustScore ${String(raw)} must map to ${tier} (${score})`
    );
  }
  // Keep summarizeMerchantDirectory highTrustShops aligned at >= 80.
  assert.equal(
    summarizeMerchantDirectory([
      merchant('t80', 10, 5, 80),
      merchant('t79', 10, 5, 79),
      merchant('t50', 50, 5, 50),
    ]).safe,
    1
  );

  // 3. VND price guards (> 0 && <= MAX_VALID_VND_PRICE, never "0 ₫", reject embedded control chars).
  for (const bad of [
    null,
    undefined,
    0,
    '0',
    0.4,
    -1,
    -500_000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '0x1000',
    '1\n000',
    '8\t0',
    '1\u0000000',
    MAX_VALID_VND_PRICE + 1,
  ]) {
    assert.equal(
      sanitizeMerchantDirectoryPriceVnd(bad),
      null,
      `directory invalid price ${JSON.stringify(bad)} must return null`
    );
    assert.equal(
      sanitizeMerchantPagePriceVnd(bad),
      null,
      `profile invalid price ${JSON.stringify(bad)} must return null`
    );
    assert.equal(
      formatMerchantPagePriceVnd(bad, 'vi'),
      '-',
      `profile formatted invalid price ${JSON.stringify(bad)} must return '-'`
    );
  }
  assert.equal(sanitizeMerchantDirectoryPriceVnd(1), 1);
  assert.equal(sanitizeMerchantPagePriceVnd(1), 1);
  assert.equal(sanitizeMerchantDirectoryPriceVnd('  15990000  '), 15_990_000);
  assert.equal(sanitizeMerchantPagePriceVnd('  15990000  '), 15_990_000);
  assert.equal(
    sanitizeMerchantDirectoryPriceVnd(MAX_VALID_VND_PRICE),
    MAX_VALID_VND_PRICE
  );
  assert.equal(
    sanitizeMerchantPagePriceVnd(MAX_VALID_VND_PRICE),
    MAX_VALID_VND_PRICE
  );
  assert.equal(formatMerchantPagePriceVnd(15_990_000, 'vi'), '15.990.000 ₫');
  assert.equal(
    formatMerchantPagePriceVnd('  15990000  ', 'vi'),
    '15.990.000 ₫'
  );
  assert.equal(
    formatMerchantDirectoryPriceRange({ min_price: 0, max_price: 0 }, 'vi'),
    null
  );
  assert.equal(
    formatMerchantDirectoryPriceRange(
      { min_price: 15_000_000, max_price: MAX_VALID_VND_PRICE + 1 },
      'vi'
    ),
    formatPriceVnd(15_000_000, 'vi')
  );
  assert.equal(
    formatMerchantDirectoryPriceRange(
      { min_price: 25_000_000, max_price: 15_000_000 },
      'cs'
    ),
    `${formatPriceVnd(15_000_000, 'cs')} - ${formatPriceVnd(25_000_000, 'cs')}`
  );

  // Render MerchantProfilePriceBlock directly for invalid/zero vs valid prices.
  for (const invalidCurrent of [0, -1, Number.NaN, '1\n000', '8\t0']) {
    const invalidBlockHtml = renderToStaticMarkup(
      React.createElement(MerchantProfilePriceBlock, {
        priceCurrent: invalidCurrent,
        priceOriginal: 20_000_000,
        locale: 'vi',
      })
    );
    assert.match(
      invalidBlockHtml,
      /data-testid="merchant-profile-recorded-price"[^>]*>-<\/div>/,
      `MerchantProfilePriceBlock must render '-' for ${String(invalidCurrent)}`
    );
    assert.ok(
      !/(?<![\d.,\u00a0])0[\s\u00a0]*₫/.test(invalidBlockHtml) &&
        !invalidBlockHtml.includes('20.000.000 ₫'),
      `MerchantProfilePriceBlock must not render 0 VND or strike-through price for ${String(invalidCurrent)}`
    );
  }
  const validBlockHtml = renderToStaticMarkup(
    React.createElement(MerchantProfilePriceBlock, {
      priceCurrent: 15_990_000,
      priceOriginal: 18_990_000,
      locale: 'vi',
    })
  );
  assert.ok(
    validBlockHtml.includes('15.990.000 ₫') &&
      validBlockHtml.includes('18.990.000 ₫') &&
      !/(?<![\d.,\u00a0])0[\s\u00a0]*₫/.test(validBlockHtml),
    'MerchantProfilePriceBlock must render valid current and original VND prices'
  );

  // 4. SSR render across locales + per-card badge assertions + decorative icon a11y + source contracts.
  const readLocale = (loc: string) =>
    JSON.parse(
      readFileSync(join(testDir, '../../../locales', `${loc}.json`), 'utf8')
    ) as Record<string, unknown>;
  const mockRouter = {
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    bfcacheId: 'test',
  };
  const IntlProvider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;
  const items = [
    {
      ...merchant('m-good', 18, 10, 80),
      dosafe_risk_score: 35,
      is_official: true,
      follower_count: 1_200,
      min_price: 0,
      max_price: 0,
    },
    {
      ...merchant('m-warn', 42, 10, 51),
      min_price: MAX_VALID_VND_PRICE + 999,
      max_price: MAX_VALID_VND_PRICE + 1_999,
    },
    {
      ...merchant('m-bad', 50, 10, 50),
      min_price: 12_990_000,
      max_price: 18_990_000,
    },
    {
      ...merchant('m-norev', 4, 0, 85),
      min_price: null,
      max_price: null,
    },
  ] as MerchantSummary[];

  const cardSegmentFor = (docHtml: string, merchantId: string): string => {
    const marker = `data-merchant-id="${merchantId}"`;
    const start = docHtml.indexOf(marker);
    assert.notEqual(
      start,
      -1,
      `expected rendered card segment for ${merchantId}`
    );
    const nextCard = docHtml.indexOf(
      'data-merchant-id="',
      start + marker.length
    );
    return nextCard === -1
      ? docHtml.slice(start)
      : docHtml.slice(start, nextCard);
  };
  const badgeTagInCard = (cardHtml: string, testId: string): string => {
    const match = cardHtml.match(
      new RegExp(`<span\\b[^>]*data-testid="${testId}"[^>]*>`)
    );
    assert.ok(match, `expected ${testId} in card segment`);
    return match[0];
  };

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const messages = pickClientMessages(readLocale(loc), 'merchants');
    const renderDir = (matched: number, pageItems: MerchantSummary[]) =>
      renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter as never },
          React.createElement(
            IntlProvider,
            { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
            React.createElement(MerchantDirectoryExplorer, {
              initialPage: { items: pageItems, matched, offset: 0 },
              summary: {
                total: 4,
                official: 1,
                safe: 2,
                avgTrust: 67,
                platformCounts: { shopee: 4 },
              },
            })
          )
        )
      );
    const html = renderDir(4, items);
    const emptyHtml = renderDir(0, []);
    assert.ok(
      !/(?<![\d.,\u00a0])0[\s\u00a0]*₫/.test(html) &&
        !html.includes('NaN') &&
        !html.includes('1.000.000.999') &&
        !html.includes('1\u00a0000\u00a0000\u00a0999') &&
        html.includes(formatPriceVnd(12_990_000, loc)) &&
        html.includes(formatPriceVnd(18_990_000, loc)),
      `${loc}: /merchants must never render 0 VND or > MAX_VALID_VND_PRICE`
    );

    const goodCard = cardSegmentFor(html, 'm-good');
    const warnCard = cardSegmentFor(html, 'm-warn');
    const badCard = cardSegmentFor(html, 'm-bad');
    const noRevCard = cardSegmentFor(html, 'm-norev');

    assert.match(
      badgeTagInCard(goodCard, 'merchant-directory-review-badge'),
      /\bdata-tone="good"/,
      `${loc}: m-good review badge must render good tone`
    );
    assert.match(
      badgeTagInCard(goodCard, 'merchant-directory-trust-badge'),
      /\bbg-success text-white\b/,
      `${loc}: m-good trust badge (80) must render high-trust class`
    );
    assert.match(
      badgeTagInCard(warnCard, 'merchant-directory-review-badge'),
      /\bdata-tone="warn"/,
      `${loc}: m-warn review badge must render warn tone`
    );
    assert.match(
      badgeTagInCard(warnCard, 'merchant-directory-trust-badge'),
      /\bbg-warning text-dark\b/,
      `${loc}: m-warn trust badge (51) must render moderate-trust class`
    );
    assert.match(
      badgeTagInCard(badCard, 'merchant-directory-review-badge'),
      /\bdata-tone="bad"/,
      `${loc}: m-bad review badge must render bad tone`
    );
    assert.match(
      badgeTagInCard(badCard, 'merchant-directory-trust-badge'),
      /\bbg-danger text-white\b/,
      `${loc}: m-bad trust badge (50) must render high-risk alert class`
    );
    assert.match(
      badgeTagInCard(noRevCard, 'merchant-directory-review-badge'),
      /\bdata-tone="unknown"/,
      `${loc}: m-norev review badge must render unknown tone`
    );

    for (const rendered of [html, emptyHtml]) {
      const svgs = rendered.match(/<svg\b[^>]*>/g) ?? [];
      assert.ok(svgs.length > 0, `${loc}: expected decorative SVGs`);
      for (const svg of svgs) {
        assert.match(
          svg,
          /\baria-hidden="true"/,
          `${loc}: SVG missing aria-hidden: ${svg}`
        );
      }
    }
  }

  const profilePageSrc = readFileSync(
    join(testDir, '../../app/[locale]/merchants/[id]/page.tsx'),
    'utf8'
  );
  const directorySrc = readFileSync(
    join(testDir, '../../components/merchants/MerchantDirectoryExplorer.tsx'),
    'utf8'
  );
  for (const [label, src] of [
    ['merchants/[id]/page.tsx', profilePageSrc],
    ['MerchantDirectoryExplorer.tsx', directorySrc],
  ] as const) {
    assert.ok(
      !src.includes('review_risk_score <= 15') &&
        !src.includes('review_risk_score <= 40') &&
        !src.includes('trustScore >= 50') &&
        !src.includes('priceOriginal || 0'),
      `${label} must not retain legacy review-risk/trust thresholds or 0 VND fallback`
    );
    const iconTags = src.match(/<Bs[A-Z]\w*[\s\S]*?\/>/g) ?? [];
    assert.ok(iconTags.length > 0, `${label} must contain react-icons tags`);
    for (const tag of iconTags) {
      assert.match(
        tag,
        /\baria-hidden="true"/,
        `${label}: decorative icon missing aria-hidden="true": ${tag}`
      );
    }
  }
  assert.ok(
    profilePageSrc.includes('merchantRiskTone(reviewRiskScore)') &&
      profilePageSrc.includes('data-testid="merchant-review-risk-badge"') &&
      profilePageSrc.includes('data-tone={reviewTone}') &&
      profilePageSrc.includes('trustScore > 50') &&
      profilePageSrc.includes('<MerchantProfilePriceBlock') &&
      profilePageSrc.includes('formatMerchantPagePriceVnd('),
    'merchants/[id]/page.tsx must route review risk via merchantRiskTone, expose data-testid + data-tone, use trustScore > 50, and render prices via MerchantProfilePriceBlock / formatMerchantPagePriceVnd'
  );
}

// DOS/Rate#1746: homepage merchant cards round scores before classifying and
// guard null review_risk_score + null risk_score fallbacks; radar cards guard
// positive VND bounds and strikethrough prices; quickCompareSlugs uses
// Item-grouped gridProducts + catalogRowSlug; review stars round to 1..5.
async function homePageMerchantRadarAndCompareSuite() {
  const nodeModule = await import('node:module');
  const extMap = (
    nodeModule.default as unknown as {
      _extensions?: Record<string, (mod: { exports: unknown }) => void>;
    }
  )._extensions;
  if (extMap && !extMap['.css']) {
    extMap['.css'] = (mod) => {
      mod.exports = {};
    };
  }
  const {
    HomeDealRadarBlock,
    HomeMerchantCard,
    HomeReviewCard,
    buildHomeQuickCompareSlugs,
    buildHomeRadarIndex,
    homeMerchantDosafeDisplay,
    homeMerchantReviewRiskDisplay,
    homeMerchantTrustDisplay,
    resolveHomeRadarOriginalPriceVnd,
    roundHomeMerchantScore,
    sanitizeHomePriceVnd,
    sanitizeHomeReviewStars,
  } = await import('../../app/[locale]/page');

  // 1. Score rounding + strict control-char / radix-prefix rejection across
  // DOSafe, review risk, and overall trust.
  for (const invalid of [
    null,
    undefined,
    '',
    '   ',
    '0x10',
    '0b10',
    '0o10',
    '-0x10',
    '8\t0',
    '1\n0',
    '\t80',
    '\u000016',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(
      roundHomeMerchantScore(invalid),
      null,
      `roundHomeMerchantScore(${JSON.stringify(invalid)}) must return null`
    );
    assert.equal(
      homeMerchantDosafeDisplay({
        dosafe_risk_score: invalid as never,
        dosafe_risk_known: true,
      }),
      null
    );
    assert.equal(
      homeMerchantReviewRiskDisplay({
        review_risk_score: invalid,
        review_risk_breakdown: { total_reviews: 5 },
      }),
      null
    );
    assert.equal(
      homeMerchantTrustDisplay({
        trust_score: invalid,
        risk_score: null,
      }),
      null
    );
  }

  // Legacy breakdown rows (null / {}) where hasReviewRiskEvidence is true while
  // review_risk_score is null or non-finite must return null instead of "/100".
  for (const legacyBreakdown of [null, {}] as const) {
    assert.equal(hasReviewRiskEvidence(legacyBreakdown), true);
    assert.equal(
      homeMerchantReviewRiskDisplay({
        review_risk_score: null,
        review_risk_breakdown: legacyBreakdown,
      }),
      null
    );
    assert.equal(
      homeMerchantReviewRiskDisplay({
        review_risk_score: Number.NaN,
        review_risk_breakdown: legacyBreakdown,
      }),
      null
    );
  }
  assert.equal(
    homeMerchantReviewRiskDisplay({
      review_risk_score: 12,
      review_risk_breakdown: { total_reviews: 0 },
    }),
    null
  );
  assert.equal(
    homeMerchantDosafeDisplay({
      dosafe_risk_score: 0,
      dosafe_risk_known: false,
    }),
    null
  );

  // Fractional rounding parity with /merchants before tone classification.
  for (const [raw, expectedScore, expectedTone] of [
    [0, 0, 'good'],
    [' 16 ', 16, 'good'],
    [19.4, 19, 'good'],
    [19.5, 20, 'warn'],
    [19.6, 20, 'warn'],
    [49.4, 49, 'warn'],
    [49.5, 50, 'bad'],
    [49.6, 50, 'bad'],
    [140, 100, 'bad'],
  ] as const) {
    const dosafe = homeMerchantDosafeDisplay({
      dosafe_risk_score: raw as never,
      dosafe_risk_known: true,
    });
    const rev = homeMerchantReviewRiskDisplay({
      review_risk_score: raw,
      review_risk_breakdown: { total_reviews: 10 },
    });
    const dirRev = merchantDirectoryReviewRiskDisplay({
      review_risk_score: raw,
      review_risk_breakdown: { total_reviews: 10 },
    });
    assert.deepEqual(dosafe, {
      score: expectedScore,
      tone: expectedTone,
      toneClass: `is-${expectedTone}`,
    });
    assert.deepEqual(rev, {
      score: expectedScore,
      tone: expectedTone,
      toneClass: `is-${expectedTone}`,
    });
    assert.equal(rev?.score, dirRev?.score);
    assert.equal(rev?.tone, dirRev?.tone);
  }

  for (const [rawTrust, rawRisk, expectedScore, expectedTone, dirTier] of [
    [100, 0, 100, 'good', 'high'],
    [85, null, 85, 'good', 'high'],
    [80, null, 80, 'good', 'high'],
    [80, 20, 80, 'good', 'high'],
    [' 80 ', null, 80, 'good', 'high'],
    [79.6, 20.4, 80, 'good', 'high'],
    [79, null, 79, 'warn', 'moderate'],
    [65, null, 65, 'warn', 'moderate'],
    [51, 49, 51, 'warn', 'moderate'],
    [50.5, 49.5, 51, 'warn', 'moderate'],
    [50.4, 49.6, 50, 'bad', 'risk'],
    [50, null, 50, 'bad', 'risk'],
    [0, 100, 0, 'bad', 'risk'],
  ] as const) {
    const homeTrust = homeMerchantTrustDisplay({
      trust_score: rawTrust,
      risk_score: rawRisk,
    });
    const dirTrust = merchantDirectoryTrustDisplay(rawTrust);
    assert.deepEqual(homeTrust, {
      score: expectedScore,
      tone: expectedTone,
      toneClass: `is-${expectedTone}`,
    });
    assert.equal(homeTrust?.score, dirTrust?.score);
    assert.equal(dirTrust?.tier, dirTier);
  }

  // 2. Radar VND price bounds and strikethrough list-price guard.
  for (const badPrice of [
    null,
    undefined,
    0,
    '0',
    0.4,
    -1,
    -500_000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '0x1000',
    '1\n000',
    '8\t0',
    '1\u0000000',
    MAX_VALID_VND_PRICE + 1,
  ]) {
    assert.equal(sanitizeHomePriceVnd(badPrice), null);
    assert.equal(resolveHomeRadarOriginalPriceVnd(15_990_000, badPrice), null);
    assert.equal(resolveHomeRadarOriginalPriceVnd(badPrice, 20_000_000), null);
  }
  assert.equal(sanitizeHomePriceVnd(1), 1);
  assert.equal(sanitizeHomePriceVnd('  15990000  '), 15_990_000);
  assert.equal(sanitizeHomePriceVnd(MAX_VALID_VND_PRICE), MAX_VALID_VND_PRICE);
  assert.equal(resolveHomeRadarOriginalPriceVnd(15_990_000, 15_990_000), null);
  assert.equal(resolveHomeRadarOriginalPriceVnd(15_990_000, 14_000_000), null);
  assert.equal(resolveHomeRadarOriginalPriceVnd(100, 100.2), null);
  assert.equal(
    resolveHomeRadarOriginalPriceVnd(15_990_000, 18_990_000),
    18_990_000
  );
  assert.equal(
    resolveHomeRadarOriginalPriceVnd(15_990_000, MAX_VALID_VND_PRICE),
    MAX_VALID_VND_PRICE
  );
  assert.equal(buildHomeRadarIndex(null).size, 0);
  const homeRadarIdx = buildHomeRadarIndex({
    categorySlug: 'all',
    totalClustersAnalyzed: 2,
    totalOffersAnalyzed: 4,
    totalMerchantsAnalyzed: 3,
    genuineDeals: [
      {
        id: 'gd-zero',
        productSlug: 'zero-phone',
        productName: 'Zero Phone',
        productHref: '/smartphones/zero-phone',
        platform: 'shopee',
        merchantName: 'Zero Shop',
        priceCurrent: 0,
        marketMedianPrice: 12_000_000,
        savingsVsMedianPct: 25,
        offerUrl: 'https://shopee.vn/zero-phone',
      },
      {
        id: 'gd-valid',
        productSlug: 'valid-phone',
        productName: 'Valid Phone',
        productHref: '/smartphones/valid-phone',
        platform: 'shopee',
        merchantName: 'Good Shop',
        priceCurrent: 15_990_000,
        marketMedianPrice: 18_990_000,
        savingsVsMedianPct: 16,
        offerUrl: 'https://shopee.vn/valid-phone',
      },
    ],
    fakeSaleTraps: [],
    priceSpreadLeaders: [],
  } as unknown as CrossPlatformDealRadarResponse);
  assert.equal(getRadarSignal(homeRadarIdx, 'zero-phone').verdict, 'none');
  assert.equal(getRadarSignal(homeRadarIdx, 'zero-phone').savingsPct, 0);
  assert.equal(
    getRadarSignal(homeRadarIdx, 'valid-phone').verdict,
    'genuine_deal'
  );
  assert.equal(getRadarSignal(homeRadarIdx, 'valid-phone').savingsPct, 16);

  // 3. Item-grouped quickCompareSlugs + rounded/clamped review stars.
  const catSlugById = new Map<string, string>([
    ['cat-phone', 'smartphones'],
    ['cat-laptop', 'laptops'],
  ]);
  const makeMaster = (
    id: string,
    slug: string,
    categoryId: string,
    itemSlug?: string
  ) =>
    ({
      id,
      slug,
      name: id,
      brand: 'Test',
      model: id,
      model_key: `test:${id}`,
      category_id: categoryId,
      min_price: 10_000_000,
      max_price: 12_000_000,
      merchant_count: 2,
      images: [],
      ...(itemSlug ? { item_slug: itemSlug } : {}),
    }) as unknown as MasterProduct;

  const groupedProducts: MasterProduct[] = [
    makeMaster(
      'p1-256',
      'iphone-16-pro-max-256gb',
      'cat-phone',
      'iphone-16-pro-max'
    ),
    makeMaster(
      'p1-512',
      'iphone-16-pro-max-512gb',
      'cat-phone',
      'iphone-16-pro-max'
    ),
    makeMaster('lap-1', 'macbook-air-m4', 'cat-laptop', 'macbook-air-m4'),
    makeMaster(
      'p2-256',
      'galaxy-s25-ultra-256gb',
      'cat-phone',
      'galaxy-s25-ultra'
    ),
    makeMaster('p3', 'xiaomi-15-ultra', 'cat-phone'),
    makeMaster('p4', 'oppo-find-x8-pro', 'cat-phone'),
  ];
  const firstGroupedItem = groupedProducts[0];
  assert.ok(firstGroupedItem);
  assert.notEqual(
    (firstGroupedItem as { item_slug?: string }).item_slug,
    firstGroupedItem.slug,
    'grouped Item fixture must have item_slug !== slug'
  );
  assert.deepEqual(buildHomeQuickCompareSlugs(groupedProducts, catSlugById), [
    'iphone-16-pro-max',
    'galaxy-s25-ultra',
    'xiaomi-15-ultra',
  ]);
  const rawMasterProducts: MasterProduct[] = [
    makeMaster('p1-256', 'iphone-16-pro-max-256gb', 'cat-phone'),
    makeMaster('p1-512', 'iphone-16-pro-max-512gb', 'cat-phone'),
    makeMaster('p2-256', 'galaxy-s25-ultra-256gb', 'cat-phone'),
  ];
  assert.deepEqual(buildHomeQuickCompareSlugs(rawMasterProducts, catSlugById), [
    'iphone-16-pro-max-256gb',
    'iphone-16-pro-max-512gb',
    'galaxy-s25-ultra-256gb',
  ]);

  for (const badStars of [
    null,
    undefined,
    '',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '0x5',
    '4\t5',
    '5\n0',
  ]) {
    assert.equal(sanitizeHomeReviewStars(badStars), null);
  }
  assert.equal(sanitizeHomeReviewStars(0), 1);
  assert.equal(sanitizeHomeReviewStars(-2), 1);
  assert.equal(sanitizeHomeReviewStars(4.4), 4);
  assert.equal(sanitizeHomeReviewStars(4.6), 5);
  assert.equal(sanitizeHomeReviewStars(' 3.6 '), 4);
  assert.equal(sanitizeHomeReviewStars(8), 5);

  // 4. SSR render of HomeMerchantCard, HomeDealRadarBlock, and HomeReviewCard
  // across vi / en / cs.
  const readLocale = (loc: string) =>
    JSON.parse(
      readFileSync(join(testDir, '../../../locales', `${loc}.json`), 'utf8')
    ) as Record<string, unknown>;
  const mockRouter = {
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    bfcacheId: 'test',
  };
  const IntlProvider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;

  const homeMerchants: MerchantSummary[] = [
    {
      ...merchant('hm-trusted-null-risk', 19.4, 10, 85),
      risk_score: null,
      dosafe_risk_score: 19.4,
      is_official: true,
    },
    {
      ...merchant('hm-fractional', 49.6, 10, 50.4),
      risk_score: 49.6,
      dosafe_risk_score: 19.6,
    },
    {
      ...merchant('hm-legacy-null-rev', 0, 0, 79),
      risk_score: null,
      dosafe_risk_score: null as never,
      review_risk_score: null as never,
      review_risk_breakdown:
        null as unknown as MerchantSummary['review_risk_breakdown'],
    },
    {
      ...merchant('hm-legacy-scored-null-brk', 24.6, 0, 75),
      rating_star: 0,
      updated_at: 'not-a-date',
      review_risk_breakdown:
        null as unknown as MerchantSummary['review_risk_breakdown'],
    },
    {
      ...merchant('hm-null-score-with-reviews', 0, 10, 82),
      review_risk_score: null as never,
    },
    {
      ...merchant('hm-invalid-count-rev', 0, 0, 78),
      review_risk_score: null as never,
      review_risk_breakdown: {
        total_reviews: Number.NaN,
      } as unknown as MerchantSummary['review_risk_breakdown'],
    },
    {
      ...merchant('hm-unscored', 12, 0, 80),
      trust_score: null,
      risk_score: null,
      dosafe_risk_score: 0,
      dosafe_risk_known: false,
    } as MerchantSummary,
  ];

  const radarFixture: CrossPlatformDealRadarResponse = {
    categorySlug: 'all',
    totalClustersAnalyzed: 4,
    totalOffersAnalyzed: 12,
    totalMerchantsAnalyzed: 6,
    genuineDeals: [
      {
        id: 'gd-zero',
        productName: 'Invalid Zero Deal',
        productHref: '/smartphones/zero',
        platform: 'shopee',
        merchantName: 'Zero Shop',
        priceCurrent: 0,
        marketMedianPrice: 10_000_000,
        savingsVsMedianPct: 100,
        offerUrl: 'https://shopee.vn/zero',
        merchantRiskScore: 5,
      },
      {
        id: 'gd-valid',
        productName: 'Valid Genuine Deal',
        productHref: '/smartphones/valid',
        platform: 'shopee',
        merchantName: 'Good Shop',
        priceCurrent: 15_990_000,
        marketMedianPrice: 18_990_000,
        savingsVsMedianPct: 16,
        offerUrl: 'https://shopee.vn/valid',
        merchantRiskScore: 5,
      },
    ],
    fakeSaleTraps: [
      {
        id: 'trap-no-orig',
        productName: 'Trap Without Original',
        productHref: '/smartphones/trap-no-orig',
        platform: 'shopee',
        merchantName: 'Trap Shop A',
        priceCurrent: 17_490_000,
        priceOriginal: null,
        fakeMarkupPct: 18,
        offerUrl: 'https://shopee.vn/trap-a',
      },
      {
        id: 'trap-equal-orig',
        productName: 'Trap Equal Original',
        productHref: '/smartphones/trap-eq',
        platform: 'lazada',
        merchantName: 'Trap Shop B',
        priceCurrent: 16_490_000,
        priceOriginal: 16_490_000,
        fakeMarkupPct: Number.NaN,
        offerUrl: 'https://lazada.vn/trap-b',
      },
      {
        id: 'trap-valid-orig',
        productName: 'Trap Valid Original',
        productHref: '/smartphones/trap-valid',
        platform: 'tiktok',
        merchantName: 'Trap Shop C',
        priceCurrent: 18_990_000,
        priceOriginal: 22_990_000,
        fakeMarkupPct: 21,
        offerUrl: 'https://tiktok.com/trap-c',
      },
    ],
    priceSpreadLeaders: [
      {
        id: 'sp-overflow',
        productName: 'Overflow Spread',
        productHref: '/smartphones/sp-overflow',
        cheapestPlatform: 'shopee',
        priciestPlatform: 'lazada',
        spreadVnd: MAX_VALID_VND_PRICE + 999,
        spreadPct: 99,
      },
      {
        id: 'sp-valid',
        productName: 'Valid Spread',
        productHref: '/smartphones/sp-valid',
        cheapestPlatform: 'shopee',
        priciestPlatform: 'tiki',
        spreadVnd: 2_500_000,
        spreadPct: 14,
      },
    ],
  } as unknown as CrossPlatformDealRadarResponse;

  function HomeSnapshot({ loc }: { loc: string }) {
    const tHome = useTranslations('homePage');
    const tRate = useTranslations('rate');
    return React.createElement(
      'div',
      null,
      homeMerchants.map((m) =>
        React.createElement(HomeMerchantCard, {
          key: m.id,
          merchant: m,
          locale: loc,
          tHome: (k, v) => tHome(k, v),
          viewAuditLabel: tRate('home.viewMerchantAuditBtn'),
        })
      ),
      React.createElement(HomeDealRadarBlock, {
        dealRadar: radarFixture,
        locale: loc,
        tHome: (k, v) => tHome(k, v),
      }),
      React.createElement(HomeReviewCard, {
        rev: {
          id: 'rev-frac',
          author_name: 'Buyer One',
          rating_star: 4.6,
          comment: 'Solid battery life',
          flag_category: 'authentic',
          include_in_rating: true,
          fake_probability: 0.08,
          productTitle: 'Phone X',
          masterRouteHref: '/smartphones/phone-x',
        } as never,
        locale: loc,
        tHome: (k, v) => tHome(k, v),
      }),
      React.createElement(HomeReviewCard, {
        rev: {
          id: 'rev-nan',
          author_name: 'Buyer Two',
          rating_star: Number.NaN,
          comment: 'Missing stars',
          flag_category: 'authentic',
          include_in_rating: true,
          fake_probability: null,
          productTitle: 'Phone Y',
          masterRouteHref: null,
        } as never,
        locale: loc,
        tHome: (k, v) => tHome(k, v),
      })
    );
  }

  const cardSegment = (docHtml: string, merchantId: string): string => {
    const marker = `data-merchant-id="${merchantId}"`;
    const start = docHtml.indexOf(marker);
    assert.notEqual(start, -1, `expected homepage card for ${merchantId}`);
    const next = docHtml.indexOf('data-merchant-id="', start + marker.length);
    const radar = docHtml.indexOf('data-testid="homepage-deal-radar"', start);
    const end = next !== -1 ? next : radar !== -1 ? radar : docHtml.length;
    return docHtml.slice(start, end);
  };

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const localeMessages = readLocale(loc);
    const homeMsgs = localeMessages.homePage as Record<string, string>;
    const html = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          {
            locale: loc,
            messages: localeMessages,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(HomeSnapshot, { loc })
        )
      )
    );

    // Trusted store with risk_score = null must never fall through to high-risk.
    const highRiskLabel = String(homeMsgs.merchantHighRiskLabel);
    const noScamText = String(homeMsgs.noScamDetected);
    const reviewNoDataText = String(homeMsgs.reviewRiskNoData);
    const reviewNoReviewsText = String(homeMsgs.reviewRiskNoReviews);
    const merchantNoDataText = String(homeMsgs.merchantNoDataLabel);
    assert.ok(
      highRiskLabel.length > 0 &&
        noScamText.length > 0 &&
        reviewNoDataText.length > 0 &&
        reviewNoReviewsText.length > 0 &&
        merchantNoDataText.length > 0
    );

    const trustedCard = cardSegment(html, 'hm-trusted-null-risk');
    assert.match(
      trustedCard,
      /data-testid="home-merchant-trust-badge"[^>]*\bis-good\b[^>]*>[^<]*85\/100</,
      `${loc}: trust_score=85 with risk_score=null must render is-good 85/100`
    );
    assert.ok(
      !trustedCard.includes(highRiskLabel),
      `${loc}: trust_score=85 with risk_score=null must not render high-risk label`
    );
    assert.match(
      trustedCard,
      /data-testid="home-merchant-dosafe-score"[^>]*\bis-good\b[^>]*>19\/100</
    );
    assert.match(
      trustedCard,
      /data-testid="home-merchant-review-score"[^>]*\bis-good\b[^>]*>19\/100</
    );

    // Fractional 50.4 / 19.6 / 49.6 round before tone & text.
    const fracCard = cardSegment(html, 'hm-fractional');
    assert.match(
      fracCard,
      /data-testid="home-merchant-trust-badge"[^>]*\bis-bad\b[^>]*>[^<]*50\/100</
    );
    assert.match(
      fracCard,
      /data-testid="home-merchant-dosafe-score"[^>]*\bis-warn\b[^>]*>20\/100</
    );
    assert.match(
      fracCard,
      /data-testid="home-merchant-review-score"[^>]*\bis-bad\b[^>]*>50\/100</
    );
    assert.ok(
      !fracCard.includes('50.4') &&
        !fracCard.includes('19.6') &&
        !fracCard.includes('49.6') &&
        !fracCard.includes(noScamText),
      `${loc}: fractional scores must be rounded before display and tone`
    );

    // Legacy null breakdown + null review_risk_score renders reviewRiskNoData,
    // omits reviewRiskNoReviews (missing count !== 0), and never renders "/100".
    const legacyCard = cardSegment(html, 'hm-legacy-null-rev');
    assert.match(
      legacyCard,
      /data-testid="home-merchant-trust-badge"[^>]*\bis-warn\b[^>]*>[^<]*79\/100</
    );
    assert.ok(
      legacyCard.includes(
        `data-testid="home-merchant-review-score">${reviewNoDataText}</dd>`
      ) &&
        !legacyCard.includes(reviewNoReviewsText) &&
        !legacyCard.includes('>/100<'),
      `${loc}: null review_risk_score on legacy null breakdown must render reviewRiskNoData without reviewRiskNoReviews`
    );

    // Null review_risk_score with nonzero or invalid total_reviews also omits reviewRiskNoReviews.
    const nullScoreWithReviewsCard = cardSegment(
      html,
      'hm-null-score-with-reviews'
    );
    const invalidCountCard = cardSegment(html, 'hm-invalid-count-rev');
    assert.ok(
      nullScoreWithReviewsCard.includes(
        `data-testid="home-merchant-review-score">${reviewNoDataText}</dd>`
      ) && !nullScoreWithReviewsCard.includes(reviewNoReviewsText),
      `${loc}: null review_risk_score with total_reviews=10 must omit reviewRiskNoReviews`
    );
    assert.ok(
      invalidCountCard.includes(
        `data-testid="home-merchant-review-score">${reviewNoDataText}</dd>`
      ) && !invalidCountCard.includes(reviewNoReviewsText),
      `${loc}: null review_risk_score with NaN total_reviews must omit reviewRiskNoReviews`
    );

    // Legacy null breakdown + finite review_risk_score rounds score without fabricating 0/0,
    // omits empty StarRating when rating_star=0, and guards invalid updated_at.
    const legacyScoredCard = cardSegment(html, 'hm-legacy-scored-null-brk');
    assert.match(
      legacyScoredCard,
      /data-testid="home-merchant-review-score"[^>]*\bis-warn\b[^>]*>25\/100</
    );
    assert.ok(
      !legacyScoredCard.includes('0/0') &&
        !legacyScoredCard.includes('rate-stars') &&
        !legacyScoredCard.includes('Invalid Date'),
      `${loc}: legacy scored row with null breakdown and rating_star=0 must omit 0/0, empty StarRating, and Invalid Date`
    );

    // Unscored store (explicit total_reviews=0) renders neutral trust pill without /100
    // and keeps reviewRiskNoReviews.
    const unscoredCard = cardSegment(html, 'hm-unscored');
    assert.ok(
      unscoredCard.includes(
        `data-testid="home-merchant-trust-badge" class="rate-radar-tag">${merchantNoDataText}</span>`
      ) && unscoredCard.includes(reviewNoReviewsText),
      `${loc}: unscored merchant with total_reviews=0 must render neutral merchantNoDataLabel and reviewRiskNoReviews`
    );

    // Radar section: never fabricates strikethrough from priceCurrent, never renders 0 VND or > MAX_VALID_VND_PRICE.
    const radarStart = html.indexOf('data-testid="homepage-deal-radar"');
    assert.notEqual(radarStart, -1);
    const radarHtml = html.slice(radarStart);
    assert.ok(
      !/(?<![\d.,\u00a0])0[\s\u00a0]*₫/.test(html) &&
        !html.includes('NaN') &&
        !radarHtml.includes('Invalid Zero Deal') &&
        !radarHtml.includes('Overflow Spread') &&
        !radarHtml.includes(`<s>${formatPriceVnd(17_490_000, loc)}</s>`) &&
        !radarHtml.includes(`<s>${formatPriceVnd(16_490_000, loc)}</s>`) &&
        radarHtml.includes(`<s>${formatPriceVnd(22_990_000, loc)}</s>`),
      `${loc}: radar must guard 0/overflow VND and only strike through valid higher original prices`
    );

    // Spread-only radar stays visible when genuineDeals/fakeSaleTraps filter down to empty,
    // while an all-empty radar returns empty markup.
    function SpreadOnlyRadar({
      payload,
    }: {
      payload: CrossPlatformDealRadarResponse;
    }) {
      const tHome = useTranslations('homePage');
      return React.createElement(HomeDealRadarBlock, {
        dealRadar: payload,
        locale: loc,
        tHome: (k, v) => tHome(k, v),
      });
    }
    const spreadOnlyHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          {
            locale: loc,
            messages: localeMessages,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(SpreadOnlyRadar, {
            payload: {
              ...radarFixture,
              genuineDeals: radarFixture.genuineDeals.slice(0, 1),
              fakeSaleTraps: [],
              priceSpreadLeaders: radarFixture.priceSpreadLeaders.slice(1, 2),
            },
          })
        )
      )
    );
    assert.ok(
      spreadOnlyHtml.includes('data-testid="homepage-deal-radar"') &&
        spreadOnlyHtml.includes(
          'data-testid="homepage-price-spread-leaders"'
        ) &&
        spreadOnlyHtml.includes('Valid Spread'),
      `${loc}: valid priceSpreadLeaders must keep homepage radar visible when deals/traps filter empty`
    );
    const allEmptyRadarHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          {
            locale: loc,
            messages: localeMessages,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(SpreadOnlyRadar, {
            payload: {
              ...radarFixture,
              genuineDeals: radarFixture.genuineDeals.slice(0, 1),
              fakeSaleTraps: [],
              priceSpreadLeaders: radarFixture.priceSpreadLeaders.slice(0, 1),
            },
          })
        )
      )
    );
    assert.equal(
      allEmptyRadarHtml,
      '',
      `${loc}: homepage radar must hide when all three filtered collections are empty`
    );

    // Review stars: 4.6 rounds to 5 SVGs, NaN omits .rate-review-stars.
    const starBlocks =
      html.match(/class="rate-review-stars"[\s\S]*?<\/div>/g) ?? [];
    assert.equal(
      starBlocks.length,
      1,
      `${loc}: only finite review rating renders stars`
    );
    assert.equal(
      (starBlocks[0].match(/<svg\b/g) ?? []).length,
      5,
      `${loc}: rating_star=4.6 must render 5 star SVGs`
    );

    const svgs = html.match(/<svg\b[^>]*>/g) ?? [];
    assert.ok(svgs.length > 0);
    for (const svg of svgs) {
      assert.match(
        svg,
        /\baria-hidden="true"/,
        `${loc}: SVG missing aria-hidden: ${svg}`
      );
    }
  }

  // 5. Source contract on apps/web/src/app/[locale]/page.tsx.
  const homePageSrc = readFileSync(
    join(testDir, '../../app/[locale]/page.tsx'),
    'utf8'
  );
  const compactHomeCallSrc = homePageSrc.replace(
    /buildHomeQuickCompareSlugs\(\s*([^)]*?)\s*\)/g,
    (_, args: string) =>
      `buildHomeQuickCompareSlugs(${args.replace(/\s+/g, ' ')})`
  );
  const shieldTags = homePageSrc.match(/<BsShieldCheck[^>]*>/g) ?? [];
  const heroShieldTag =
    shieldTags.find((tag) => tag.includes('text-success')) ?? '';
  assert.match(heroShieldTag, /\btext-success\b/);
  assert.match(heroShieldTag, /\baria-hidden="true"/);
  assert.ok(
    homePageSrc.includes('const radarIndex = buildHomeRadarIndex(dealRadar)') &&
      compactHomeCallSrc.includes(
        'const quickCompareSlugs = buildHomeQuickCompareSlugs(gridProducts, catSlugById)'
      ) &&
      !/buildHomeQuickCompareSlugs\(\s*masterProducts\b/.test(homePageSrc) &&
      !homePageSrc.includes('t.priceOriginal || t.priceCurrent') &&
      homePageSrc.includes(
        'className="rate-card rate-card-interactive rate-category-card"'
      ) &&
      homePageSrc.includes(
        'applyCategorySpecTemplate(\n                    getMasterProductCategorySlug('
      ),
    'app/[locale]/page.tsx must pass gridProducts to buildHomeQuickCompareSlugs, build radarIndex via buildHomeRadarIndex, hide hero BsShieldCheck, drop fabricated strikethrough fallback, and preserve category card + spec-template contracts'
  );
}

// DOS/Rate#1821: preserve null review seeding risk in MD/CSV/JSON exports,
// resolve canonical Item links + locale-aware SEO titles on /merchants/[id],
// and strip internal dosafe_risk_known + baseline scores on /merchants RSC.
async function merchantAuditExportsItemLinksAndRscStrippingSuite() {
  // 1. Nullable score sanitizer never coerces null / non-finite / radix / control-char inputs to 0.
  for (const invalid of [
    null,
    undefined,
    '',
    '   ',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '0x10',
    '0b10',
    '0o10',
    '-0x10',
    '8\t0',
    '1\n0',
    '\u000016',
    false,
    true,
    [],
    {},
  ]) {
    assert.equal(
      sanitizeNullableMerchantScore100(invalid),
      null,
      `sanitizeNullableMerchantScore100(${JSON.stringify(invalid)}) must return null`
    );
  }
  assert.equal(Object.is(sanitizeNullableMerchantScore100(0), 0), true);
  assert.equal(Object.is(sanitizeNullableMerchantScore100(' 0 '), 0), true);
  assert.equal(Object.is(sanitizeNullableMerchantScore100(-0.2), 0), true);
  assert.equal(Object.is(sanitizeNullableMerchantScore100(-15), 0), true);
  assert.equal(sanitizeNullableMerchantScore100(24.6), 25);
  assert.equal(sanitizeNullableMerchantScore100(' 37.6 '), 38);
  assert.equal(sanitizeNullableMerchantScore100(140), 100);

  // resolveMerchantReviewRiskScore returns null when total_reviews === 0 or score is null/invalid.
  assert.equal(
    resolveMerchantReviewRiskScore({
      review_risk_score: 4,
      review_risk_breakdown: { total_reviews: 0 },
    }),
    null
  );
  assert.equal(
    resolveMerchantReviewRiskScore({
      review_risk_score: null,
      review_risk_breakdown: { total_reviews: 12 },
    }),
    null
  );
  assert.equal(
    resolveMerchantReviewRiskScore({
      review_risk_score: '0x10',
      review_risk_breakdown: { total_reviews: 12 },
    }),
    null
  );
  assert.equal(
    resolveMerchantReviewRiskScore({
      review_risk_score: 0,
      review_risk_breakdown: { total_reviews: 12 },
    }),
    0
  );
  assert.equal(
    resolveMerchantReviewRiskScore({
      review_risk_score: 28.4,
      review_risk_breakdown: { total_reviews: 12 },
    }),
    28
  );

  // 2. MD / CSV / JSON exports across vi / en / cs never coerce null review risk to 0.
  const readLocale = (loc: string) =>
    JSON.parse(
      readFileSync(join(testDir, '../../../locales', `${loc}.json`), 'utf8')
    ) as Record<string, unknown>;
  const IntlProvider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;

  const baseAuditProps: MerchantShareAuditButtonProps = {
    merchantName: 'FPT Shop Official',
    platform: 'fptshop',
    platformShopId: 'fpt-01',
    isOfficial: true,
    trustScore: 88,
    trustLevelLabel: 'Trusted',
    dosafeRiskScore: 12,
    reviewSeedingRiskScore: null,
    authenticReviews: 0,
    totalReviews: 0,
    flaggedReviews: 0,
    productCount: 14,
    genuineDealCount: 2,
    fakeSaleTrapCount: 0,
  };

  const parseCsvRow = (
    csv: string
  ): { headers: string[]; values: string[] } => {
    const clean = csv.replace(/^\uFEFF/, '');
    const [headerLine, valueLine] = clean.split(/\r?\n/);
    assert.ok(headerLine && valueLine);
    return {
      headers: headerLine.split(','),
      values: valueLine.split(','),
    };
  };

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const messages = pickClientMessages(readLocale(loc), 'merchantProfile');
    const merchantMsgs = messages.merchants as Record<string, string>;
    let capturedT: MerchantAuditTranslateFn | null = null;
    function CaptureTranslator() {
      const t = useTranslations('merchants');
      capturedT = (key, values) => t(key, values);
      return React.createElement(MerchantShareAuditButton, baseAuditProps);
    }
    const buttonMarkup = renderToStaticMarkup(
      React.createElement(
        IntlProvider,
        { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
        React.createElement(CaptureTranslator)
      )
    );
    assert.ok(
      buttonMarkup.includes('data-testid="merchant-export-csv-btn"') &&
        buttonMarkup.includes('data-testid="merchant-export-json-btn"') &&
        !buttonMarkup.includes('NaN'),
      `${loc}: MerchantShareAuditButton must render export controls cleanly when reviewSeedingRiskScore is null`
    );
    assert.ok(capturedT, `${loc}: translator captured`);
    const tAudit = capturedT as MerchantAuditTranslateFn;

    // Case A: reviewSeedingRiskScore === null with totalReviews === 0.
    const mdNoReviews = buildMerchantAuditMarkdown(
      baseAuditProps,
      tAudit,
      'https://rate.vn/merchants/fpt-01'
    );
    const csvNoReviews = parseCsvRow(buildMerchantAuditCsv(baseAuditProps));
    const jsonNoReviews = buildMerchantAuditJson(
      baseAuditProps,
      '2026-11-21T19:00:00.000Z'
    );
    const seedingColIdx = csvNoReviews.headers.indexOf('SeedingRisk(/100)');
    assert.notEqual(seedingColIdx, -1);
    assert.equal(
      csvNoReviews.values[seedingColIdx],
      '',
      `${loc}: CSV SeedingRisk(/100) must be empty when reviewSeedingRiskScore is null (totalReviews=0)`
    );
    assert.equal(
      jsonNoReviews.merchant.reviewSeedingRiskScore,
      null,
      `${loc}: JSON reviewSeedingRiskScore must be null when reviewSeedingRiskScore is null (totalReviews=0)`
    );
    assert.ok(
      mdNoReviews.includes(String(merchantMsgs.mdSeedingLineNoReviews)) &&
        !mdNoReviews.includes('0/100'),
      `${loc}: Markdown must render mdSeedingLineNoReviews and never 0/100 when reviewSeedingRiskScore is null`
    );

    // Case B: reviewSeedingRiskScore === null with totalReviews === 10 (e.g. pending/unscored reviews).
    const nullWithReviewsProps: MerchantShareAuditButtonProps = {
      ...baseAuditProps,
      reviewSeedingRiskScore: null,
      authenticReviews: 8,
      totalReviews: 10,
      flaggedReviews: 2,
    };
    const mdNullWithReviews = buildMerchantAuditMarkdown(
      nullWithReviewsProps,
      tAudit,
      'https://rate.vn/merchants/fpt-01'
    );
    const csvNullWithReviews = parseCsvRow(
      buildMerchantAuditCsv(nullWithReviewsProps)
    );
    const jsonNullWithReviews = buildMerchantAuditJson(
      nullWithReviewsProps,
      '2026-11-21T19:00:00.000Z'
    );
    assert.equal(
      csvNullWithReviews.values[seedingColIdx],
      '',
      `${loc}: CSV SeedingRisk(/100) must stay empty when reviewSeedingRiskScore is null even if totalReviews > 0`
    );
    assert.equal(
      jsonNullWithReviews.merchant.reviewSeedingRiskScore,
      null,
      `${loc}: JSON reviewSeedingRiskScore must stay null when reviewSeedingRiskScore is null even if totalReviews > 0`
    );
    const expectedNoDataLine = `- **${String(merchantMsgs.riskReviewLabel)}:** ${String(merchantMsgs.reviewRiskNoDataShort).toLowerCase()}`;
    assert.ok(
      mdNullWithReviews.includes(expectedNoDataLine) &&
        !mdNullWithReviews.includes(
          String(merchantMsgs.mdSeedingLineNoReviews)
        ) &&
        !mdNullWithReviews.includes('0/100'),
      `${loc}: Markdown must render localized no-data label (not 0/100 and not no-reviews) when reviewSeedingRiskScore is null and totalReviews > 0`
    );

    // Case C: genuinely measured 0/100 review seeding risk still exports 0 / "0" / "0/100".
    const measuredZeroProps: MerchantShareAuditButtonProps = {
      ...baseAuditProps,
      reviewSeedingRiskScore: 0,
      authenticReviews: 10,
      totalReviews: 10,
      flaggedReviews: 0,
    };
    const mdMeasuredZero = buildMerchantAuditMarkdown(
      measuredZeroProps,
      tAudit,
      'https://rate.vn/merchants/fpt-01'
    );
    const csvMeasuredZero = parseCsvRow(
      buildMerchantAuditCsv(measuredZeroProps)
    );
    const jsonMeasuredZero = buildMerchantAuditJson(
      measuredZeroProps,
      '2026-11-21T19:00:00.000Z'
    );
    assert.equal(csvMeasuredZero.values[seedingColIdx], '0');
    assert.equal(jsonMeasuredZero.merchant.reviewSeedingRiskScore, 0);
    assert.ok(
      mdMeasuredZero.includes('0/100'),
      `${loc}: measured 0/100 review risk must still export 0/100`
    );
  }

  // 3. Canonical Item link resolution + slug collection + prototype/traversal safety on /merchants/[id].
  const itemMap = {
    'iphone-16-pro-max-256gb': 'iphone-16-pro-max',
    'airpods-pro-2-usb-c': 'airpods-pro-2',
    'pixel-9a': 'pixel-9a',
  };
  assert.deepEqual(
    collectMerchantPageProductSlugs(
      {
        listings: [
          { master_product: { slug: 'iphone-16-pro-max-256gb' } },
          { master_product: { slug: '../bad-slug' } },
          { master_product: null },
        ],
        recent_reviews: [
          { master_slug: 'airpods-pro-2-usb-c' },
          { master_slug: '__proto__' },
          { master_slug: null },
        ],
      },
      [
        {
          productSlug: 'iphone-16-pro-max-256gb',
          productHref: '/smartphones/iphone-16-pro-max-256gb',
        },
        {
          productHref: '/laptops/macbook-air-m4-512gb',
        },
      ],
      [
        {
          productSlug: 'pixel-9a',
          productHref: '/smartphones/pixel-9a',
        },
      ]
    ),
    [
      'iphone-16-pro-max-256gb',
      'airpods-pro-2-usb-c',
      'macbook-air-m4-512gb',
      'pixel-9a',
    ]
  );

  assert.equal(
    resolveMerchantProductHref({
      categorySlug: 'smartphones',
      productSlug: 'iphone-16-pro-max-256gb',
      fallbackHref: '/smartphones/iphone-16-pro-max-256gb',
      itemSlugBySlug: itemMap,
    }),
    '/smartphones/iphone-16-pro-max'
  );
  assert.equal(
    resolveMerchantProductHref({
      categorySlug: 'earbuds',
      productSlug: 'airpods-pro-2-usb-c',
      hash: '#jreviews-section',
      itemSlugBySlug: itemMap,
    }),
    '/earbuds/airpods-pro-2#jreviews-section'
  );
  assert.equal(
    resolveMerchantProductHref({
      fallbackHref: '/smartphones/iphone-16-pro-max-256gb',
      itemSlugBySlug: itemMap,
    }),
    '/smartphones/iphone-16-pro-max'
  );
  assert.equal(
    resolveMerchantProductHref({
      categorySlug: 'smartphones',
      productSlug: 'iphone-16-pro-max-256gb',
      hash: '#jreviews-section',
      itemSlugBySlug: null,
    }),
    '/smartphones/iphone-16-pro-max-256gb#jreviews-section',
    'RATE_ITEM_MODEL off preserves variant URLs'
  );
  for (const unsafeSlug of [
    '__proto__',
    'constructor',
    'prototype',
    '../admin',
    'foo..bar',
    'bad.',
    '0',
    'null',
    'undefined',
    'a\u0000b',
  ]) {
    assert.equal(resolveCanonicalItemSlug(unsafeSlug, itemMap), null);
    assert.equal(
      resolveMerchantProductHref({
        categorySlug: 'smartphones',
        productSlug: unsafeSlug,
        fallbackHref: '//evil.example/hijack',
        itemSlugBySlug: itemMap,
      }),
      null
    );
  }

  // Czech non-breaking space preserved when passing locale to fitTitle / fitDescription.
  const csTitle = 'Obchod\u00a0Test (SHOPEE) - Skóre 88\u00a0% | Rate.vn';
  assert.equal(fitTitle([csTitle], undefined, 'cs'), csTitle);
  const csDesc =
    'Profil prodejce A: riziko recenzí (12\u00a0%) a historie cen 5\u00a0produktů na Rate.vn.';
  assert.equal(fitDescription(csDesc, 'cs'), csDesc);

  // 4. /merchants RSC initialPage strips dosafe_risk_known and baseline scores via withPublicReviewRisk.
  const rawPage = {
    matched: 2,
    offset: 0,
    items: [
      {
        ...merchant('rsc-unknown', 4, 0, 82),
        dosafe_risk_score: 0,
        dosafe_risk_known: false,
      } as MerchantSummary,
      {
        ...merchant('rsc-known-clean', 18, 12, 91),
        dosafe_risk_score: 0,
        dosafe_risk_known: true,
      } as MerchantSummary,
    ],
  };
  const publicPage = toPublicMerchantDirectoryPage(rawPage);
  const serializedRscPage = JSON.stringify(publicPage);
  assert.ok(
    !serializedRscPage.includes('dosafe_risk_known'),
    '/merchants RSC payload must never serialize internal dosafe_risk_known flag'
  );
  assert.equal('dosafe_risk_known' in publicPage.items[0]!, false);
  assert.equal('dosafe_risk_known' in publicPage.items[1]!, false);
  assert.equal(publicPage.items[0]!.dosafe_risk_score, null);
  assert.equal(
    publicPage.items[0]!.review_risk_score,
    null,
    'unmeasured baseline review_risk_score must strip to null in /merchants RSC payload'
  );
  assert.equal(publicPage.items[1]!.dosafe_risk_score, 0);
  assert.equal(publicPage.items[1]!.review_risk_score, 18);

  const mockRouter = {
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    bfcacheId: 'test',
  };
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const messages = pickClientMessages(readLocale(loc), 'merchants');
    const dirHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(MerchantDirectoryExplorer, {
            initialPage: publicPage,
            summary: {
              total: 2,
              official: 0,
              safe: 2,
              avgTrust: 87,
              platformCounts: { shopee: 2 },
            },
          })
        )
      )
    );
    const unknownStart = dirHtml.indexOf('data-merchant-id="rsc-unknown"');
    const knownStart = dirHtml.indexOf('data-merchant-id="rsc-known-clean"');
    assert.ok(unknownStart !== -1 && knownStart !== -1);
    const unknownHtml = dirHtml.slice(unknownStart, knownStart);
    const knownHtml = dirHtml.slice(knownStart);
    assert.match(
      unknownHtml,
      /data-testid="merchant-directory-scam-badge"[^>]*\bdata-tone="unknown"/
    );
    assert.match(
      unknownHtml,
      /data-testid="merchant-directory-review-badge"[^>]*\bdata-tone="unknown"/
    );
    assert.ok(
      !unknownHtml.includes('0/100') && !unknownHtml.includes('4/100'),
      `${loc}: stripped /merchants RSC card must not render 0/100 or baseline 4/100`
    );
    assert.match(
      knownHtml,
      /data-testid="merchant-directory-scam-badge"[^>]*\bdata-tone="good"[^>]*>0\/100</
    );
    assert.match(
      knownHtml,
      /data-testid="merchant-directory-review-badge"[^>]*\bdata-tone="good"[^>]*>18\/100</
    );
  }

  // 5. Source contracts on merchants/[id]/page.tsx and merchants/page.tsx.
  const merchantDetailPageSrc = readFileSync(
    join(testDir, '../../app/[locale]/merchants/[id]/page.tsx'),
    'utf8'
  );
  const merchantsDirectoryPageSrc = readFileSync(
    join(testDir, '../../app/[locale]/merchants/page.tsx'),
    'utf8'
  );
  assert.ok(
    merchantDetailPageSrc.includes(
      'reviewSeedingRiskScore={reviewRiskScore}'
    ) &&
      !merchantDetailPageSrc.includes(
        'reviewSeedingRiskScore={merchant.review_risk_score}'
      ) &&
      merchantDetailPageSrc.includes('getItemSlugsFor(productSlugs)') &&
      merchantDetailPageSrc.includes('undefined,\n      locale\n    ),') &&
      merchantDetailPageSrc.includes('}),\n    locale\n  );'),
    'merchants/[id]/page.tsx must pass reviewRiskScore to MerchantShareAuditButton, resolve getItemSlugsFor(productSlugs), and pass locale to fitTitle and fitDescription'
  );
  assert.ok(
    merchantsDirectoryPageSrc.includes('withPublicReviewRisk') &&
      merchantsDirectoryPageSrc.includes('toPublicMerchantDirectoryPage('),
    'merchants/page.tsx must strip initialPage.items through withPublicReviewRisk'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
