import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  computeCrossPlatformDealRadarFromData,
  computeProductRadarSignal,
} from '../../server/rate/deals';
import { merchantRiskTone } from '../merchant-risk-tone';
import { radarExplanation } from '../product-detail-copy';
import {
  buildRadarIndex,
  isMultiPlatformFloor,
  radarLabel,
  selectMerchantRadar,
} from '../deal-radar';
import { computeJReviewsUserScores } from '../jreviews-user-score';
import { pickClientMessages } from '../client-messages';
import {
  computeBayesianRatingSummary,
  computeCombinedDualScore,
} from '../rate-domain-core';
import { merchantDirectoryDosafeDisplay } from '../../components/merchants/MerchantDirectoryExplorer';
import { formatPercent, formatPriceVnd } from '../locale-format';
import { parseEcommerceUrlOrQuery } from '../rate-domain';
import type { VerdictTranslator } from '../discount-verdict-copy';
import type { OfferDiscountAnalysis, UrlInspectionResult } from '../rate-api';
import DeepInspectWorkspace, {
  buildInspectMarkdownPriceLines,
  filterInspectOfferDiscount,
  formatInspectPriceVndOrDash,
  formatInspectSuggestionLabel,
  hasAnalyzedInspectReviews,
  inspectDosafeDisplay,
  inspectMarkdownPriceVerdict,
  inspectReviewRiskDisplay,
  isInspectOfferBait,
  orderInspectOffers,
  resolveInspectOfferPlatform,
  resolveInspectPriceVerdictPrices,
  resolveInspectReviewTaxonomyDisplay,
  sanitizeInspectPriceVnd,
} from '../../components/inspect/DeepInspectWorkspace';

// Display defects from the live audit #1131: numbers and warnings the site
// showed that were not true.

type Messages = Record<string, Record<string, string>>;
const readLocale = (locale: string): Messages =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'locales', `${locale}.json`),
      'utf8'
    )
  );
const LOCALES = ['vi', 'en', 'cs'] as const;

// DOS/Rate#1140: one risk cut-off for the home cards and the merchant page.
// Every merchant scored 4, 11 or 14 and the detail page called them all scams.
for (const score of [0, 4, 11, 14, 19]) {
  assert.equal(merchantRiskTone(score), 'good', `DOSafe ${score} is clean`);
}
for (const score of [20, 35, 49]) {
  assert.equal(merchantRiskTone(score), 'warn', `DOSafe ${score} is caution`);
}
for (const score of [50, 60, 100]) {
  assert.equal(merchantRiskTone(score), 'bad', `DOSafe ${score} is an alert`);
}
for (const unknown of [null, undefined, Number.NaN, 'abc']) {
  assert.equal(
    merchantRiskTone(unknown),
    'warn',
    'an unknown score is neither clean nor an alert'
  );
}
for (const locale of LOCALES) {
  const merchants = readLocale(locale).merchants!;
  for (const key of [
    'scamStatusClean',
    'scamStatusCaution',
    'scamStatusAlert',
    'layer2NoReviews',
  ]) {
    assert.ok(merchants[key], `${locale}: missing merchants.${key}`);
  }
  assert.ok(
    !/\d+\s*%/.test(merchants.layer2NoReviews!),
    `${locale}: the no-reviews text must not show a percentage`
  );
}
const merchantPage = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'app',
    '[locale]',
    'merchants',
    '[id]',
    'page.tsx'
  ),
  'utf8'
);
assert.ok(
  // A known DOSafe score only: an unknown one has no tone (DOS/Rate#1479).
  merchantPage.includes('merchantRiskTone(dosafeScore)') &&
    merchantPage.includes('knownDosafeRiskScore(merchant)') &&
    !merchantPage.includes('dosafe_risk_score === 0'),
  'the merchant page must use the shared risk cut-off, not "any non-zero score"'
);

// DOS/Rate#1145: the median sentence names the real number of offers, and the
// home radar calls offers listings and merchants merchants.
const master = {
  id: 'mp-aw-ultra-2',
  slug: 'apple-watch-ultra-2-64gb',
  name: 'Apple Watch Ultra 2 64GB',
  brand: 'Apple',
  category_id: 'smartwatches',
  metadata: { category_slug: 'smartwatches' },
};
const offer = (i: number, merchantId: string, price: number) => ({
  id: `offer-${i}`,
  platform: i === 0 ? 'cellphones' : 'shopee',
  price_current: price,
  price_original: null,
  url: `https://example.com/${i}`,
  merchant: {
    id: merchantId,
    name: `Store ${merchantId}`,
    platform: i === 0 ? 'cellphones' : 'shopee',
    risk_score: 4,
    is_official: true,
  },
});
const radar = computeCrossPlatformDealRadarFromData(
  [
    {
      master: master as never,
      offers: [
        offer(0, 'm-a', 16_490_000),
        offer(1, 'm-b', 23_490_000),
      ] as never,
    },
  ],
  { categorySlug: 'all', limit: 10 }
);
assert.equal(radar.totalOffersAnalyzed, 2);
assert.equal(radar.totalMerchantsAnalyzed, 2);
const deal = radar.genuineDeals[0];
assert.ok(deal, 'the cheaper of two offers is still below their median');
assert.equal(deal.marketOfferCount, 2);
assert.ok(
  !/10 sàn/i.test(deal.explanationVi) && !/10 Sàn/.test(deal.verdictBadgeVi),
  `no "10 sàn" claim from 2 offers: ${deal.explanationVi} / ${deal.verdictBadgeVi}`
);
assert.match(deal.explanationVi, /trung vị của 2 tin bán/);
assert.equal(
  deal.verdict,
  'best_market_deal',
  'two offers are no multi-platform floor (no "Đáy giá đa sàn" badge)'
);

const signal = buildRadarIndex(radar).get(master.slug)!;
// Two offers are a below-median price, never the "multi-platform floor" badge.
assert.equal(isMultiPlatformFloor(signal.genuineDeal), false);
for (const locale of LOCALES) {
  const label = radarLabel(signal, 0, locale);
  assert.ok(
    !/Đáy giá đa sàn|Cross-platform low|Minimum napříč/.test(label),
    `${locale}: 2 offers must not read as a multi-platform floor: ${label}`
  );
  const messages = readLocale(locale);
  assert.ok(messages.deals!.radarBadgeBelowMedian);
  assert.ok(messages.compare!.radarBelowMedian);
  assert.ok(messages.watchlist!.radarBelowMedianBadge);
  // The /deals section lists every genuine deal, 2-offer ones included, so
  // its header and export title must not claim a floor (#1145).
  for (const [ns, key] of [
    ['deals', 'genuineDealsHeader'],
    ['deals', 'radarMdGenuineTitle'],
    ['deals', 'radarMdHeader'],
    ['deals', 'radarBannerBadge'],
    ['homePage', 'radarGenuineTitle'],
    ['merchants', 'mdRadarLine'],
    ['homePage', 'radarHomeBadge'],
    ['inspect', 'radarSectionBadge'],
    ['merchants', 'profileRadarBadge'],
    ['compare', 'radarRowTitle'],
    ['compare', 'radarRowMatrixTitle'],
  ] as const) {
    const text = String(messages[ns]![key]);
    assert.ok(
      !/đáy|thấp nhất|\blow(?:s|est)?\b|nejniž|minim/i.test(text),
      `${locale}: ${ns}.${key} must not claim a floor: ${text}`
    );
  }
  // The merchant profile badge and the compare radar rows sit over mixed
  // genuine deals and fake sales, so they name the median instead (#1632).
  for (const [ns, key] of [
    ['merchants', 'profileRadarBadge'],
    ['compare', 'radarRowTitle'],
    ['compare', 'radarRowMatrixTitle'],
  ] as const) {
    assert.match(
      String(messages[ns]![key]),
      /trung vị|median|medián/i,
      `${locale}: ${ns}.${key} names the median`
    );
  }
  // Deep inspect shows the floor pill only for a real floor; any other
  // genuine deal gets the below-median pill with the same values (#1661).
  const belowPill = String(messages.inspect!.radarBelowMedianPill);
  assert.ok(
    !/đáy|thấp nhất|\blow(?:s|est)?\b|nejniž|minim/i.test(belowPill),
    `${locale}: inspect.radarBelowMedianPill must not claim a floor: ${belowPill}`
  );
  assert.match(
    belowPill,
    /trung vị|median|medián/i,
    `${locale}: inspect.radarBelowMedianPill names the median`
  );
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    placeholders(belowPill),
    placeholders(String(messages.inspect!.radarGenuinePill)),
    `${locale}: inspect.radarBelowMedianPill has the placeholders of radarGenuinePill`
  );
}
for (const file of [
  ['components', 'radar', 'RadarBadge.tsx'],
  ['components', 'compare', 'CompareWorkspace.tsx'],
  ['components', 'watchlist', 'WatchlistWorkspace.tsx'],
  ['components', 'inspect', 'DeepInspectWorkspace.tsx'],
]) {
  assert.ok(
    readFileSync(join(__dirname, '..', '..', ...file), 'utf8').includes(
      'isMultiPlatformFloor('
    ),
    `${file.join('/')} must label only real floors as the multi-platform floor`
  );
}
// The deep inspect floor pill is picked only through the floor check (#1661).
assert.ok(
  !readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'components',
      'inspect',
      'DeepInspectWorkspace.tsx'
    ),
    'utf8'
  ).includes("t('radarGenuinePill'"),
  'DeepInspectWorkspace.tsx must not hard-code the floor pill'
);
const note = radarExplanation(signal);
assert.equal(note?.key, 'radarExplanationGenuineDeal');
assert.equal(note!.values.count, '2');
// Without a known offer count there is no median sentence at all.
assert.equal(
  radarExplanation({
    ...signal,
    genuineDeal: {
      ...signal.genuineDeal!,
      marketOfferCount: undefined as never,
    },
  }),
  null
);
for (const locale of LOCALES) {
  const merchants = readLocale(locale).merchants!;
  for (const key of ['radarGenuineBadge', 'profileRadarGenuineCount']) {
    assert.ok(
      !/giá đáy|cross-store low|minim napříč/i.test(merchants[key]!),
      `${locale}: merchants.${key} counts every genuine deal, not floors`
    );
  }
}
for (const locale of LOCALES) {
  const messages = readLocale(locale);
  const sentence = messages.productDetail!.radarExplanationGenuineDeal!;
  assert.ok(
    sentence.includes('{count}'),
    `${locale}: median sentence needs {count}`
  );
  assert.ok(
    !/10[ -](sàn|platform|platforem)/i.test(sentence),
    `${locale}: median sentence must not claim 10 platforms`
  );
  const home = messages.homePage!.radarHomeAnalyzed!;
  assert.ok(
    // A plain or a plural argument (DOS/Rate#1398).
    /\{offers[},]/.test(home) && /\{merchants[},]/.test(home),
    `${locale}: the home radar line needs both offers and merchants`
  );
}
assert.match(
  readLocale('vi').homePage!.radarHomeAnalyzed!,
  /\{offers\} tin bán của \{merchants\} gian hàng/
);

// One merchant listing twice counts once.
const sameMerchant = computeCrossPlatformDealRadarFromData(
  [
    {
      master: master as never,
      offers: [
        offer(0, 'm-a', 16_490_000),
        offer(1, 'm-a', 23_490_000),
        offer(2, 'm-b', 20_000_000),
      ] as never,
    },
  ],
  { categorySlug: 'all', limit: 10 }
);
assert.equal(sameMerchant.totalOffersAnalyzed, 3);
assert.equal(sameMerchant.totalMerchantsAnalyzed, 2);
// With 3 offers the cheapest one, 2% or more below the median, is the floor.
assert.equal(sameMerchant.genuineDeals[0]?.verdict, 'genuine_all_time_low');
assert.equal(sameMerchant.genuineDeals[0]?.marketOfferCount, 3);
assert.match(
  radarLabel(buildRadarIndex(sameMerchant).get(master.slug)!, 0, 'vi'),
  /Đáy giá đa sàn/
);
// 3 offers, the cheapest less than 2% below the median: below the median,
// not the floor.
const shallow = computeCrossPlatformDealRadarFromData(
  [
    {
      master: master as never,
      offers: [
        offer(0, 'm-a', 19_800_000),
        offer(1, 'm-b', 20_000_000),
        offer(2, 'm-c', 20_100_000),
      ] as never,
    },
  ],
  { categorySlug: 'all', limit: 10 }
);
assert.equal(shallow.genuineDeals[0]?.verdict, 'best_market_deal');
// The product and extension radar signal keeps the verdict the extension
// branches on (DOS/Rate#1145).
assert.equal(
  computeProductRadarSignal(
    master as never,
    [
      offer(0, 'm-a', 16_490_000),
      offer(1, 'm-a', 23_490_000),
      offer(2, 'm-b', 20_000_000),
    ] as never
  ).genuineDeal?.verdict,
  'genuine_all_time_low'
);
assert.equal(
  computeProductRadarSignal(
    master as never,
    [offer(0, 'm-a', 16_490_000), offer(1, 'm-b', 23_490_000)] as never
  ).genuineDeal?.verdict,
  'best_market_deal'
);
for (const locale of LOCALES) {
  // The catalog radar box sits over every genuine deal (DOS/Rate#1145).
  const page = (
    readLocale(locale).catalog as unknown as Record<string, Messages[string]>
  ).page!;
  for (const key of ['radarDealsTitle', 'radarBannerBadge']) {
    const title = String(page[key]);
    assert.ok(
      !/đáy|thấp nhất|\blow(?:s|est)?\b|nejniž|minim/i.test(title),
      `${locale}: catalog.page.${key} must not claim a floor: ${title}`
    );
  }
}

// DOS/Rate#1144: with no expert score, the composite equals the buyer score
// the header shows. 9 rating-only 5-star reviews (weight 0.25 each) are 4.54
// in the header and were 5.0 in the composite.
const ratingOnly = Array.from({ length: 9 }, () => ({
  reviewer_type: 'user',
  include_in_rating: true,
  helpfulness_weight: 0.25,
  rating_star: 5,
}));
const header = computeBayesianRatingSummary(ratingOnly, 5).bayesianRating;
const live = computeJReviewsUserScores(ratingOnly, 5, 5);
assert.equal(header, 4.54);
assert.equal(live.bayesianUser, header);
assert.equal(
  live.user,
  5,
  'the plain weighted mean stays shown as TB trọng số'
);
const composite = computeCombinedDualScore({
  userScore: live.bayesianUser,
  expertScore: null,
  userConfidence: live.bayesianConfidence,
  fallbackAverage: 5,
});
assert.equal(composite.blendMode, 'user_only');
assert.equal(composite.overall, header);
assert.equal(composite.overall.toFixed(1), header.toFixed(1));
const reviewsSection = readFileSync(
  join(__dirname, '..', '..', 'components', 'reviews', 'JReviewsSection.tsx'),
  'utf8'
);
// The buyer score is the stored rating the headline shows when there is
// one, else the Bayesian buyer score (DOS/Rate#1545, D3).
assert.match(
  reviewsSection,
  /computeCombinedDualScore\(\{\s*userScore: shownUserScore,/,
  'the reviews section composite must read the buyer score the page shows'
);
assert.match(
  reviewsSection,
  /shownUserScore =\s*ratingScore != null && ratingScore > 0 \? ratingScore : bayesianUserScore;/,
  'the buyer score is the stored rating, else the Bayesian one'
);

// DOS/Rate#1692: /merchants and /inspect use merchantRiskTone(dosafeScore)
// (< 20 clean, 20-49 caution, >= 50 alert), /inspect hides the DOSafe bar when
// DOSafe is unknown, and /inspect scopes offer plausibility to in-stock
// listings, sorts unavailable listings last, and keeps offer.platform.
assert.equal(
  merchantDirectoryDosafeDisplay({
    dosafe_risk_score: 0,
    dosafe_risk_known: false,
  }),
  null
);
assert.equal(merchantDirectoryDosafeDisplay({ dosafe_risk_score: null }), null);
for (const score of [0, 4, 11, 14, 19]) {
  assert.deepEqual(
    merchantDirectoryDosafeDisplay({
      dosafe_risk_score: score,
      dosafe_risk_known: true,
    }),
    {
      score,
      tone: 'good',
      badgeClass: 'bg-success-subtle text-success',
      statusKey: 'scamStatusClean',
    },
    `/merchants DOSafe ${score} must render clean`
  );
}
for (const score of [20, 35, 49]) {
  assert.deepEqual(
    merchantDirectoryDosafeDisplay({
      dosafe_risk_score: score,
      dosafe_risk_known: true,
    }),
    {
      score,
      tone: 'warn',
      badgeClass: 'bg-warning-subtle text-warning-emphasis',
      statusKey: 'scamStatusCaution',
    },
    `/merchants DOSafe ${score} must render caution`
  );
}
for (const score of [50, 60, 100]) {
  assert.deepEqual(
    merchantDirectoryDosafeDisplay({
      dosafe_risk_score: score,
      dosafe_risk_known: true,
    }),
    {
      score,
      tone: 'bad',
      badgeClass: 'bg-danger-subtle text-danger',
      statusKey: 'scamStatusAlert',
    },
    `/merchants DOSafe ${score} must render alert`
  );
}
for (const locale of LOCALES) {
  const scoped = pickClientMessages(
    readLocale(locale) as unknown as Record<string, unknown>,
    'merchants'
  ).merchants as Record<string, string>;
  for (const key of [
    'scamStatusClean',
    'scamStatusCaution',
    'scamStatusAlert',
  ]) {
    assert.ok(scoped[key], `${locale}: client merchants scope missing ${key}`);
  }
}
const merchantDirectoryExplorer = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'components',
    'merchants',
    'MerchantDirectoryExplorer.tsx'
  ),
  'utf8'
);
assert.ok(
  merchantDirectoryExplorer.includes('merchantRiskTone(dosafeScore)') &&
    merchantDirectoryExplorer.includes('scamStatusClean') &&
    merchantDirectoryExplorer.includes('scamStatusCaution') &&
    merchantDirectoryExplorer.includes('scamStatusAlert') &&
    !merchantDirectoryExplorer.includes('dosafeScore === 0') &&
    !merchantDirectoryExplorer.includes('dosafeZero') &&
    !merchantDirectoryExplorer.includes('dosafeAlert'),
  'MerchantDirectoryExplorer.tsx must use merchantRiskTone(dosafeScore) and scamStatus* keys instead of dosafeScore === 0'
);

assert.equal(inspectDosafeDisplay(null), null);
assert.equal(
  inspectDosafeDisplay({ dosafe_risk_score: 0, dosafe_risk_known: false }),
  null
);
assert.deepEqual(
  inspectDosafeDisplay({
    dosafe_risk_score: 0,
    dosafe_risk_known: true,
  }),
  {
    score: 0,
    tone: 'good',
    textClass: 'text-success',
    barClass: 'bg-success',
    widthPct: 4,
  }
);
assert.deepEqual(
  inspectDosafeDisplay({
    dosafe_risk_score: 14,
    dosafe_risk_known: true,
  }),
  {
    score: 14,
    tone: 'good',
    textClass: 'text-success',
    barClass: 'bg-success',
    widthPct: 14,
  }
);
assert.deepEqual(
  inspectDosafeDisplay({
    dosafe_risk_score: 35,
    dosafe_risk_known: true,
  }),
  {
    score: 35,
    tone: 'warn',
    textClass: 'text-warning-emphasis',
    barClass: 'bg-warning',
    widthPct: 35,
  }
);
assert.deepEqual(
  inspectDosafeDisplay({
    dosafe_risk_score: 65,
    dosafe_risk_known: true,
  }),
  {
    score: 65,
    tone: 'bad',
    textClass: 'text-danger',
    barClass: 'bg-danger',
    widthPct: 65,
  }
);

// Sold-out outliers do not skew bait-price detection among in-stock offers,
// and unavailable offers sort after both plausible and bait in-stock offers.
const mixedInspectOffers = orderInspectOffers([
  {
    id: 'sold-out-cheap-1',
    price_current: 500_000,
    availability: 'out_of_stock' as const,
  },
  {
    id: 'discontinued-cheap-2',
    price_current: 600_000,
    availability: 'discontinued' as const,
  },
  {
    id: 'in-stock-bait',
    price_current: 1_250_000,
    availability: 'in_stock' as const,
  },
  {
    id: 'in-stock-a',
    price_current: 3_030_000,
    availability: 'in_stock' as const,
  },
  { id: 'in-stock-b', price_current: 3_140_000 },
  {
    id: 'in-stock-c',
    price_current: 3_690_000,
    availability: 'in_stock' as const,
  },
]);
assert.deepEqual(
  [...mixedInspectOffers.implausibleOfferIds],
  ['in-stock-bait']
);
assert.deepEqual(
  mixedInspectOffers.listedOffers.map((o) => o.id),
  [
    'in-stock-a',
    'in-stock-b',
    'in-stock-c',
    'in-stock-bait',
    'sold-out-cheap-1',
    'discontinued-cheap-2',
  ]
);
assert.equal(
  isInspectOfferBait(
    {
      id: 'sold-out-cheap-1',
      price_current: 500_000,
      availability: 'out_of_stock',
    },
    mixedInspectOffers.implausibleOfferIds,
    mixedInspectOffers.inStockOffers
  ),
  true
);
assert.equal(
  isInspectOfferBait(
    {
      id: 'sold-out-normal',
      price_current: 2_900_000,
      availability: 'out_of_stock',
    },
    mixedInspectOffers.implausibleOfferIds,
    mixedInspectOffers.inStockOffers
  ),
  false
);

// High discontinued prices do not turn real current prices into bait warnings.
const inflatedDiscontinued = orderInspectOffers([
  {
    id: 'old-msrp-1',
    price_current: 50_000_000,
    availability: 'out_of_stock' as const,
  },
  {
    id: 'old-msrp-2',
    price_current: 52_000_000,
    availability: 'discontinued' as const,
  },
  {
    id: 'current-1',
    price_current: 15_000_000,
    availability: 'in_stock' as const,
  },
  {
    id: 'current-2',
    price_current: 15_500_000,
    availability: 'in_stock' as const,
  },
]);
assert.deepEqual([...inflatedDiscontinued.implausibleOfferIds], []);
assert.deepEqual(
  inflatedDiscontinued.listedOffers.map((o) => o.id),
  ['current-1', 'current-2', 'old-msrp-1', 'old-msrp-2']
);

assert.equal(
  resolveInspectOfferPlatform({
    platform: 'lazada',
    merchant: { platform: 'shopee' },
  }),
  'lazada'
);
assert.equal(
  resolveInspectOfferPlatform({
    platform: '',
    merchant: { platform: 'tiki' },
  }),
  'tiki'
);
assert.equal(resolveInspectOfferPlatform({}), 'shopee');

// DOS/Rate#1697: padded/control-char IDs match implausibleOfferIds in both
// orderInspectOffers and isInspectOfferBait, and /inspect carries localized
// unavailable badges for the HTML offers table cell.
const paddedInspectOffers = orderInspectOffers([
  {
    id: '  in-stock-bait\u0000  ',
    price_current: 500_000,
    availability: 'in_stock' as const,
  },
  {
    id: 'in-stock-1',
    price_current: 3_032_000,
    availability: 'in_stock' as const,
  },
  {
    id: 'in-stock-2',
    price_current: 3_140_000,
    availability: 'in_stock' as const,
  },
  {
    id: 'sold-out-normal',
    price_current: 2_950_000,
    availability: 'out_of_stock' as const,
  },
  {
    id: 'sold-out-bait',
    price_current: 500_000,
    availability: 'out_of_stock' as const,
  },
]);
assert.deepEqual(
  paddedInspectOffers.listedOffers.map((o) => o.id),
  [
    'in-stock-1',
    'in-stock-2',
    '  in-stock-bait\u0000  ',
    'sold-out-normal',
    'sold-out-bait',
  ]
);
assert.equal(
  isInspectOfferBait(
    paddedInspectOffers.listedOffers[2],
    paddedInspectOffers.implausibleOfferIds,
    paddedInspectOffers.plausibilityOffers
  ),
  true
);
assert.equal(
  filterInspectOfferDiscount({ verdict: 'normal_price' }, true),
  null
);
assert.equal(
  filterInspectOfferDiscount({ verdict: 'genuine_deal' }, true),
  null
);
assert.deepEqual(
  filterInspectOfferDiscount({ verdict: 'fake_discount' }, true),
  { verdict: 'fake_discount' }
);
const allUnavailableInspect = orderInspectOffers([
  {
    id: 'so-bait',
    price_current: 500_000,
    availability: 'out_of_stock' as const,
  },
  {
    id: 'so-1',
    price_current: 3_032_000,
    availability: 'out_of_stock' as const,
  },
  {
    id: 'so-2',
    price_current: 3_140_000,
    availability: 'out_of_stock' as const,
  },
]);
assert.deepEqual([...allUnavailableInspect.implausibleOfferIds], ['so-bait']);
assert.deepEqual(
  allUnavailableInspect.listedOffers.map((o) => o.id),
  ['so-1', 'so-2', 'so-bait']
);
const roundTripSoldOut = [
  1_000_000, 1_000_000, 3_500_000, 8_000_000, 10_000_000, 20_000_000,
  30_000_000,
].map((price_current, i) => ({
  id: `id-${i}`,
  price_current,
  availability: 'out_of_stock' as const,
}));
const roundTripParsed = JSON.parse(
  JSON.stringify({
    allOffers: roundTripSoldOut,
    matchedOffer: roundTripSoldOut[2],
  })
) as {
  allOffers: typeof roundTripSoldOut;
  matchedOffer: (typeof roundTripSoldOut)[number];
};
const roundTripOrdered = orderInspectOffers(roundTripParsed.allOffers);
assert.equal(
  isInspectOfferBait(
    roundTripParsed.matchedOffer,
    roundTripOrdered.implausibleOfferIds,
    roundTripOrdered.plausibilityOffers
  ),
  isInspectOfferBait(
    roundTripParsed.allOffers[2],
    roundTripOrdered.implausibleOfferIds,
    roundTripOrdered.plausibilityOffers
  )
);
const largeAlternatingOffers = Array.from({ length: 3000 }, (_, i) => ({
  id: `offer-${i}`,
  price_current: 3_000_000 + i * 1_000,
  availability: (i % 2 === 0 ? 'in_stock' : 'out_of_stock') as
    'in_stock' | 'out_of_stock',
}));
const sortStartedAt = Date.now();
const orderedLarge = orderInspectOffers(largeAlternatingOffers);
assert.equal(orderedLarge.listedOffers.length, 3000);
assert.ok(Date.now() - sortStartedAt < 100, 'orderInspectOffers is O(n log n)');
for (const locale of LOCALES) {
  const inspectClientMsgs = pickClientMessages(readLocale(locale), 'inspect');
  const detailSubset = inspectClientMsgs.productDetail as
    Record<string, string> | undefined;
  assert.ok(
    detailSubset?.offersUnavailableBadge &&
      detailSubset?.offersUnavailableTitle &&
      detailSubset?.offersDiscontinuedBadge,
    `${locale}: inspect client message scope must ship unavailable offer badge keys`
  );
}

const deepInspectWorkspace = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'components',
    'inspect',
    'DeepInspectWorkspace.tsx'
  ),
  'utf8'
);
assert.ok(
  deepInspectWorkspace.includes('merchantRiskTone(dosafeScore)') &&
    deepInspectWorkspace.includes('dosafeDisplay != null && (') &&
    deepInspectWorkspace.includes('!isOfferUnavailable(o)') &&
    deepInspectWorkspace.includes(
      "offer.platform || offer.merchant?.platform || 'shopee'"
    ) &&
    deepInspectWorkspace.includes('resolveInspectOfferPlatform(offer)') &&
    deepInspectWorkspace.includes('data-testid="inspect-offer-unavailable"') &&
    !deepInspectWorkspace.includes('implausibleOfferIds.has(') &&
    !deepInspectWorkspace.includes('<strong className="text-success">') &&
    !deepInspectWorkspace.includes('className="progress-bar bg-success"'),
  'DeepInspectWorkspace.tsx must apply merchantRiskTone, hide the DOSafe bar when unknown, scope plausibility to in-stock offers, use canonical bait helper, and prefer offer.platform'
);

// DOS/Rate#1702: suppress inflated strikethrough list prices on genuineDeals
// (>= 11% above marketMedianPrice) while preserving legitimate strikethroughs.
const master1702 = {
  id: 'mp-1702',
  slug: 'iphone-16-1702',
  name: 'iPhone 16 128GB',
  brand: 'Apple',
  category_id: 'smartphones',
  metadata: { category_slug: 'smartphones' },
};
const buildDealCluster1702 = (bestOrig: number | null) => [
  {
    id: '  shopee:88201.991\u0000 ',
    platform: 'shopee',
    price_current: 19_500_000,
    price_original: bestOrig,
    url: 'https://shopee.vn/product/99/88201',
    merchant: {
      id: '  shopee:shop_99\u0000 ',
      name: '',
      platform: 'shopee',
      risk_score: 5,
      is_official: true,
    },
  },
  {
    id: 'tiki:1002',
    platform: 'tiki',
    price_current: 20_000_000,
    price_original: 20_000_000,
    url: 'https://tiki.vn/product-p1002.html',
    merchant: {
      id: 'tiki:trading',
      name: 'Tiki Trading',
      platform: 'tiki',
      risk_score: 4,
      is_official: true,
    },
  },
  {
    id: 'lazada:77102.445',
    platform: 'lazada',
    price_current: 20_500_000,
    price_original: 29_900_000,
    url: 'https://www.lazada.vn/products/p-i77102.html',
    merchant: {
      id: 'lazada:mall_42',
      name: '',
      platform: 'lazada',
      risk_score: 8,
      is_official: true,
    },
  },
];

const inflatedGenuine1702 = computeCrossPlatformDealRadarFromData([
  {
    master: master1702 as never,
    offers: buildDealCluster1702(29_900_000) as never,
  },
]);
assert.equal(inflatedGenuine1702.genuineDeals[0]?.priceCurrent, 19_500_000);
assert.equal(inflatedGenuine1702.genuineDeals[0]?.priceOriginal, null);
assert.equal(inflatedGenuine1702.genuineDeals[0]?.claimedDiscountPct, 0);
assert.equal(inflatedGenuine1702.genuineDeals[0]?.fakeMarkupPct, 0);
const inflatedSignal1702 = computeProductRadarSignal(
  master1702 as never,
  buildDealCluster1702(29_900_000) as never
);
assert.equal(inflatedSignal1702.genuineDeal?.priceOriginal, null);
assert.equal(inflatedSignal1702.genuineDeal?.claimedDiscountPct, 0);

// Exact 1-decimal rounding boundary: +10.96% rounds to 11.0% (suppressed),
// +11.0% is suppressed, and +10.9% (< 11%) or below-median list prices stay.
for (const suppressedOrig of [22_192_000, 22_200_000]) {
  const res = computeCrossPlatformDealRadarFromData([
    {
      master: master1702 as never,
      offers: buildDealCluster1702(suppressedOrig) as never,
    },
  ]);
  assert.equal(res.genuineDeals[0]?.priceOriginal, null);
  assert.equal(res.genuineDeals[0]?.claimedDiscountPct, 0);
}
const legitimateOrig1702 = computeCrossPlatformDealRadarFromData([
  {
    master: master1702 as never,
    offers: buildDealCluster1702(22_180_000) as never,
  },
]);
assert.equal(legitimateOrig1702.genuineDeals[0]?.priceOriginal, 22_180_000);
assert.equal(legitimateOrig1702.genuineDeals[0]?.claimedDiscountPct, 12);
const belowMedianOrig1702 = computeCrossPlatformDealRadarFromData([
  {
    master: master1702 as never,
    offers: buildDealCluster1702(19_900_000) as never,
  },
]);
assert.equal(belowMedianOrig1702.genuineDeals[0]?.priceOriginal, 19_900_000);
assert.equal(belowMedianOrig1702.genuineDeals[0]?.claimedDiscountPct, 2);

// Colon-composite merchantId and offerId preservation + selectMerchantRadar lookup.
assert.equal(inflatedGenuine1702.genuineDeals[0]?.merchantId, 'shopee:shop_99');
assert.equal(
  inflatedGenuine1702.fakeSaleTraps[0]?.id,
  'trap-iphone-16-1702-lazada-lazada:77102.445'
);
assert.equal(
  inflatedGenuine1702.fakeSaleTraps[0]?.merchantId,
  'lazada:mall_42'
);
assert.equal(
  selectMerchantRadar(inflatedGenuine1702, {
    id: '  shopee:shop_99\u0000 ',
    name: '',
  }).genuineDealCount,
  1
);
assert.equal(
  selectMerchantRadar(inflatedGenuine1702, { id: 'lazada:mall_42', name: '' })
    .fakeTrapCount,
  1
);

// Unnamed composite merchant deduplication & namespace isolation vs malformed IDs.
const dedupRadar1702 = computeCrossPlatformDealRadarFromData([
  {
    master: master1702 as never,
    offers: [
      buildDealCluster1702(null)[0],
      {
        ...buildDealCluster1702(null)[0],
        id: 'shopee:88201.992',
        price_current: 19_700_000,
      },
      {
        id: '::invalid::',
        platform: 'shopee',
        price_current: 20_500_000,
        price_original: 29_900_000,
        url: 'https://shopee.vn/product/1/2',
        merchant: {
          id: ':bad',
          name: 'shop_99',
          platform: 'shopee',
          risk_score: 5,
          is_official: false,
        },
      },
    ] as never,
  },
]);
assert.equal(dedupRadar1702.totalMerchantsAnalyzed, 2);
assert.equal(dedupRadar1702.fakeSaleTraps[0]?.merchantId, '');
assert.equal(
  dedupRadar1702.fakeSaleTraps[0]?.id,
  'trap-iphone-16-1702-shopee-offer-3'
);
assert.equal(
  selectMerchantRadar(dedupRadar1702, { id: ':bad', name: '' }).fakeTrapCount,
  0
);

// DOS/Rate#1711: the copied inspect Markdown and the CSV verdict cell follow
// the UI locale, like the page badges, instead of Vietnamese formatting.
const verdictTranslator =
  (messages: Record<string, string>): VerdictTranslator =>
  (key, values = {}) => {
    const message = messages[key];
    assert.ok(message, `missing priceVerdict.${key}`);
    return message.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values[name])
    );
  };
const fakeDiscount1711: OfferDiscountAnalysis = {
  product_id: 'p-1711',
  merchant_name: 'Shop',
  platform: 'shopee',
  price_current: 9_000_000,
  price_original: 15_000_000,
  claimed_discount_pct: 40.5,
  real_discount_vs_median_pct: 0,
  historical_min_price: 8_500_000,
  historical_max_price: 10_000_000,
  historical_median_price: 9_000_000,
  observation_count: 4,
  verdict: 'fake_discount',
  badge_label: 'Cảnh báo giảm giá ảo',
  explanation: '',
};
const viVerdictKeys = Object.keys(readLocale('vi').priceVerdict!).sort();
for (const locale of LOCALES) {
  const messages = readLocale(locale).priceVerdict!;
  assert.deepEqual(
    Object.keys(messages).sort(),
    viVerdictKeys,
    `${locale}: priceVerdict keys match vi`
  );
  const markdown = inspectMarkdownPriceVerdict(
    verdictTranslator(messages),
    fakeDiscount1711,
    locale
  );
  assert.ok(
    markdown.startsWith(`**${messages.labelFake}** (`) &&
      markdown.endsWith(')'),
    `${locale}: Markdown verdict is **label** (explanation)`
  );
  for (const price of [15_000_000, 10_000_000, 9_000_000]) {
    assert.ok(
      markdown.includes(formatPriceVnd(price, locale)),
      `${locale}: Markdown verdict formats ${price} for the locale`
    );
  }
}
const csMarkdown1711 = inspectMarkdownPriceVerdict(
  verdictTranslator(readLocale('cs').priceVerdict!),
  fakeDiscount1711,
  'cs'
);
assert.ok(csMarkdown1711.includes('15\u00a0000\u00a0000\u00a0₫'));
assert.ok(csMarkdown1711.includes('(-40,5\u00a0%)'));
assert.ok(!csMarkdown1711.includes('15.000.000'));
assert.ok(!/Giá|giá|gạch ngang/.test(csMarkdown1711));
assert.ok(
  !/discountVerdictCopy\(tVerdict, (?:discount|a)\)/.test(
    deepInspectWorkspace
  ) &&
    deepInspectWorkspace.includes(
      'inspectMarkdownPriceVerdict(tVerdict, discount, locale)'
    ) &&
    deepInspectWorkspace.includes(
      'discountVerdictCopy(tVerdict, a, locale).label'
    ),
  'DeepInspectWorkspace.tsx must pass the UI locale to every verdict copy'
);

// DOS/Rate#1726: DeepInspectWorkspace suppresses 0-review 100% taxonomy,
// guards 0/NaN VND fallbacks across verdict tiles, Markdown and suggestions,
// and aligns merchant review_risk_score with merchantRiskTone.
assert.equal(resolveInspectReviewTaxonomyDisplay(null, 'en'), null);
for (const emptyTotal of [0, -1, 0.4, '0', '', null, undefined, Number.NaN]) {
  assert.equal(
    hasAnalyzedInspectReviews({ total_analyzed: emptyTotal }),
    false
  );
  assert.deepEqual(
    resolveInspectReviewTaxonomyDisplay(
      {
        total_analyzed: emptyTotal,
        authentic_pct: 100,
        suspicious_pct: 0,
        fake_pct: 0,
        ai_summary: 'stale summary',
      },
      'en'
    ),
    {
      hasAnalyzedReviews: false,
      totalAnalyzed: 0,
      aiSummary: null,
    }
  );
}
assert.equal(hasAnalyzedInspectReviews({ total_analyzed: 12 }), true);
assert.equal(hasAnalyzedInspectReviews({ total_analyzed: '7' }), true);
assert.deepEqual(
  resolveInspectReviewTaxonomyDisplay(
    {
      total_analyzed: 1250,
      authentic_pct: 82.5,
      suspicious_pct: 120,
      fake_pct: -5,
      ai_summary: 'Verified summary',
    },
    'cs'
  ),
  {
    hasAnalyzedReviews: true,
    totalAnalyzed: 1250,
    authenticPctText: formatPercent(82.5, 'cs'),
    suspiciousPctText: formatPercent(100, 'cs'),
    fakePctText: formatPercent(0, 'cs'),
    aiSummary: 'Verified summary',
  }
);

for (const invalidPrice of [
  0,
  -500,
  0.4,
  null,
  undefined,
  Number.NaN,
  'abc',
  true,
  9_000_000_000,
]) {
  assert.equal(sanitizeInspectPriceVnd(invalidPrice), 0);
  assert.equal(formatInspectPriceVndOrDash(invalidPrice, 'vi'), '-');
  assert.equal(
    formatInspectSuggestionLabel('iPhone 16', invalidPrice, 'en'),
    'iPhone 16'
  );
}
assert.equal(
  formatInspectSuggestionLabel('iPhone 16', 22_990_000, 'cs'),
  `iPhone 16 (${formatPriceVnd(22_990_000, 'cs')})`
);
assert.deepEqual(
  resolveInspectPriceVerdictPrices({
    matchedOffer: null,
    master: { min_price: 0, max_price: 0 },
    priceHistory: { lowestEverPrice: null, highestEverPrice: null },
  }),
  {
    currentPriceVnd: 0,
    claimedOriginalVnd: 0,
    historicalLowVnd: 0,
    historicalHighVnd: 0,
  }
);

assert.deepEqual(
  resolveInspectPriceVerdictPrices({
    matchedOffer: { price_current: 'bad', price_original: 29_990_000 },
    master: { min_price: 24_990_000, max_price: 28_990_000 },
    priceHistory: { lowestEverPrice: null, highestEverPrice: 0 },
  }),
  {
    currentPriceVnd: 24_990_000,
    claimedOriginalVnd: 29_990_000,
    historicalLowVnd: 24_990_000,
    historicalHighVnd: 28_990_000,
  }
);

const mdPriceLabels1726 = {
  currentPriceLabel: 'Current price',
  claimedOriginalLabel: 'Strikethrough',
  historicalLowLabel: 'Low',
  historicalHighLabel: 'High',
};
assert.deepEqual(
  buildInspectMarkdownPriceLines({
    currentListedPrice: 0,
    claimedOrigPrice: 0,
    histLow: 0,
    histHigh: 0,
    labels: mdPriceLabels1726,
  }),
  []
);
assert.deepEqual(
  buildInspectMarkdownPriceLines({
    currentListedPrice: 19_990_000,
    claimedOrigPrice: 0,
    histLow: 0,
    histHigh: 0,
    labels: mdPriceLabels1726,
  }),
  ['- **Current price:** 19.990.000 ₫']
);
assert.deepEqual(
  buildInspectMarkdownPriceLines({
    currentListedPrice: 19_990_000,
    claimedOrigPrice: 24_990_000,
    histLow: 18_500_000,
    histHigh: 0,
    labels: mdPriceLabels1726,
  }),
  [
    '- **Current price:** 19.990.000 ₫ | Strikethrough: 24.990.000 ₫',
    '- **Low / High:** 18.500.000 ₫ - -',
  ]
);
assert.deepEqual(
  buildInspectMarkdownPriceLines({
    currentListedPrice: 0,
    claimedOrigPrice: 24_990_000,
    histLow: 18_500_000,
    histHigh: 22_000_000,
    labels: mdPriceLabels1726,
  }),
  ['- **Low / High:** 18.500.000 ₫ - 22.000.000 ₫']
);

assert.equal(inspectReviewRiskDisplay(null), null);
assert.equal(
  inspectReviewRiskDisplay({
    review_risk_score: 8,
    review_risk_breakdown: { total_reviews: 0 },
  }),
  null
);
assert.equal(
  inspectReviewRiskDisplay({
    review_risk_score: null,
    review_risk_breakdown: null,
  }),
  null
);

for (const [raw, expected] of [
  [
    0,
    {
      score: 0,
      tone: 'good',
      textClass: 'text-success',
      barClass: 'bg-success',
      widthPct: 4,
    },
  ],
  [
    19.4,
    {
      score: 19,
      tone: 'good',
      textClass: 'text-success',
      barClass: 'bg-success',
      widthPct: 19,
    },
  ],
  [
    19.5,
    {
      score: 20,
      tone: 'warn',
      textClass: 'text-warning-emphasis',
      barClass: 'bg-warning',
      widthPct: 20,
    },
  ],
  [
    25,
    {
      score: 25,
      tone: 'warn',
      textClass: 'text-warning-emphasis',
      barClass: 'bg-warning',
      widthPct: 25,
    },
  ],
  [
    45,
    {
      score: 45,
      tone: 'warn',
      textClass: 'text-warning-emphasis',
      barClass: 'bg-warning',
      widthPct: 45,
    },
  ],
  [
    49.4,
    {
      score: 49,
      tone: 'warn',
      textClass: 'text-warning-emphasis',
      barClass: 'bg-warning',
      widthPct: 49,
    },
  ],
  [
    49.5,
    {
      score: 50,
      tone: 'bad',
      textClass: 'text-danger',
      barClass: 'bg-danger',
      widthPct: 50,
    },
  ],
  [
    140,
    {
      score: 100,
      tone: 'bad',
      textClass: 'text-danger',
      barClass: 'bg-danger',
      widthPct: 100,
    },
  ],
] as const) {
  assert.deepEqual(
    inspectReviewRiskDisplay({
      review_risk_score: raw,
      review_risk_breakdown: { total_reviews: 12 },
    }),
    expected,
    `inspectReviewRiskDisplay(${raw}) must match merchantRiskTone after integer rounding`
  );
}
assert.equal(
  inspectDosafeDisplay({ dosafe_risk_score: 19.6, dosafe_risk_known: true })
    ?.tone,
  'warn'
);
assert.equal(
  inspectDosafeDisplay({ dosafe_risk_score: 49.6, dosafe_risk_known: true })
    ?.tone,
  'bad'
);

const mockInspectRouter1726: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  bfcacheId: 'test',
};
const IntlProvider1726 = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
  children?: React.ReactNode;
}>;
const renderInspect1726 = (
  locale: (typeof LOCALES)[number],
  inspection: UrlInspectionResult
): string =>
  renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockInspectRouter1726 },
      React.createElement(
        IntlProvider1726,
        {
          locale,
          messages: pickClientMessages(
            readLocale(locale) as unknown as Record<string, unknown>,
            'inspect'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(DeepInspectWorkspace, {
          initialQuery: 'iphone-sold-out',
          initialInspection: inspection,
        })
      )
    )
  );

for (const locale of LOCALES) {
  const inspectMsgs = readLocale(locale).inspect!;
  const soldOutZeroReviewHtml = renderInspect1726(locale, {
    query: 'iphone-sold-out',
    matchedType: 'master_product',
    parsedUrl: parseEcommerceUrlOrQuery('iphone-sold-out'),
    masterProduct: {
      id: 'mp-1726',
      slug: 'iphone-15-sold-out',
      name: 'iPhone 15 Sold Out',
      brand: 'Apple',
      model: 'iPhone 15',
      model_key: 'apple_iphone_15_sold_out',
      min_price: 0,
      max_price: 0,
      merchant_count: 1,
      status: 'published',
      metadata: { category_slug: 'smartphones' },
    } as never,
    matchedOffer: null,
    allOffers: [
      {
        id: 'offer-sold-out-0',
        platform: 'shopee',
        title: 'Sold Out Listing',
        price_current: 0,
        price_original: 0,
        availability: 'out_of_stock',
        url: 'https://shopee.vn/sold-out',
        merchant: { id: 'm-1726', name: 'Caution Shop', platform: 'shopee' },
      },
    ] as never,
    discountAnalysis: null,
    priceHistory: {
      points: [],
      byOffer: {},
      lowestEverPrice: null,
      lowestEverDate: null,
      lowestEverMerchant: null,
      highestEverPrice: null,
      currentMinPrice: null,
      fakeDiscountCount: 0,
      genuineDealCount: 0,
    },
    reviewSummary: {
      total_analyzed: 0,
      authentic_pct: 100,
      suspicious_pct: 0,
      fake_pct: 0,
      pros: [],
      cons: [],
      ai_summary: 'Stale summary',
    },
    merchantProfile: {
      id: 'm-1726',
      name: 'Caution Shop',
      platform: 'shopee',
      platform_shop_id: 'shop_1726',
      is_official: false,
      dosafe_risk_score: 8,
      dosafe_risk_known: true,
      review_risk_score: 42,
      review_risk_breakdown: { total_reviews: 15 },
    } as never,
    suggestions: [],
  });
  assert.ok(
    !soldOutZeroReviewHtml.includes('0 ₫') &&
      !soldOutZeroReviewHtml.includes('0\u00a0₫') &&
      !soldOutZeroReviewHtml.includes('NaN') &&
      !soldOutZeroReviewHtml.includes('100%') &&
      !soldOutZeroReviewHtml.includes('100\u00a0%') &&
      !soldOutZeroReviewHtml.includes('Stale summary') &&
      !soldOutZeroReviewHtml.includes('text-primary') &&
      !soldOutZeroReviewHtml.includes('bg-primary'),
    `${locale}: zero-review sold-out inspect view must suppress 0 VND, 100% taxonomy, and legacy primary review-risk colors`
  );
  assert.ok(
    soldOutZeroReviewHtml.includes(inspectMsgs.reviewRiskNoData!) &&
      soldOutZeroReviewHtml.includes('text-warning-emphasis') &&
      soldOutZeroReviewHtml.includes('bg-warning') &&
      soldOutZeroReviewHtml.includes('42/100'),
    `${locale}: inspect view must show reviewRiskNoData and warning tone for review_risk_score 42`
  );
}

for (const locale of LOCALES) {
  const notFoundHtml = renderInspect1726(locale, {
    query: 'unknown-device',
    matchedType: 'search_suggestions',
    parsedUrl: parseEcommerceUrlOrQuery('unknown-device'),
    masterProduct: null,
    matchedOffer: null,
    allOffers: [],
    discountAnalysis: null,
    priceHistory: null,
    reviewSummary: null,
    merchantProfile: null,
    suggestions: [
      {
        id: 'sug-zero',
        slug: 'unpriced-phone',
        name: 'Unpriced Phone',
        min_price: 0,
        metadata: { category_slug: 'smartphones' },
      },
      {
        id: 'sug-nan',
        slug: 'nan-phone',
        name: 'NaN Phone',
        min_price: Number.NaN,
        metadata: { category_slug: 'smartphones' },
      },
      {
        id: 'sug-priced',
        slug: 'priced-phone',
        name: 'Priced Phone',
        min_price: 22_990_000,
        metadata: { category_slug: 'smartphones' },
      },
    ] as never,
  });
  assert.ok(
    notFoundHtml.includes('>Unpriced Phone<') &&
      notFoundHtml.includes('>NaN Phone<') &&
      !notFoundHtml.includes('(0 ₫)') &&
      !notFoundHtml.includes('(0\u00a0₫)') &&
      !notFoundHtml.includes('(NaN') &&
      notFoundHtml.includes(
        `>Priced Phone (${formatPriceVnd(22_990_000, locale)})<`
      ),
    `${locale}: not-found suggestions must omit (0 VND)/(NaN VND) while formatting positive prices`
  );
}

console.log('display-truth: ok');
