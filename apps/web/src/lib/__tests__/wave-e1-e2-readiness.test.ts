import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import {
  RATING_CRITERIA_V2_VERSION,
  RATING_CRITERIA_VERSION,
  getCategorySpecTemplate,
  getRatingCriteria,
  getRatingCriteriaVersion,
  minimumListingPriceVnd,
} from '@repo/shared-data/rules';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  CORE_TECH_CATEGORY_SLUGS,
  WAVE_E1_CATEGORY_SLUGS,
  WAVE_E2_SERVICE_CATEGORY_SLUGS,
  getMasterProductCategorySlug,
  isCanonicalCategorySlug,
  isCategoryVisibleInDirectory,
  isWaveE1CategorySlug,
  isWaveE2ServiceCategorySlug,
  resolveListingPriceCurrency,
} from '../rate-domain-core';
import {
  formatListingPrice,
  NBSP,
  normalizePriceCurrency,
  resolveListingUnitSuffix,
  sanitizeCurrencyPriceValue,
} from '../locale-format';
import {
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
} from '../category-filters';
import {
  mapTrustViewRowToMerchantOffer,
  normalizeOfferOriginalPrice,
} from '../rate-api';
import { pointCriterionMessageKey } from '../product-points-display';
import {
  evaluateOmnibusPriceAudit,
  formatOmnibusAuditCopy,
  matchesSeasonalSaleFilter,
  sanitizeOmnibusPriceVnd,
  type OmnibusVerdictTranslator,
} from '../omnibus-price-audit';
import { discountVerdictCopy } from '../discount-verdict-copy';
import { leaderboardCriteriaForCategory } from '../leaderboard-engine';
import { parseEcommerceUrlOrQuery } from '../rate-domain-core';
import {
  buildCatalogJsonProductEntry,
  sanitizeCatalogPriceVnd,
} from '../../components/leaderboard/CategoryCatalogToolbar';
import { resolveShareAuditOgDownloadUrl } from '../../components/leaderboard/ProductShareAuditButton';
import {
  buildCompareJsonProductEntry,
  sanitizeComparePriceVnd,
} from '../../components/compare/CompareWorkspace';
import {
  formatVersusPriceVnd,
  sanitizeVersusPriceVnd,
} from '../../components/compare/VersusInteractiveScoreboard';
import {
  buildPriceHistoryMarkdown,
  computePriceHistoryChartYBounds,
  formatCompactPriceHistoryVnd,
} from '../../components/price-history/PriceHistorySection';
import { formatOgListingPrice, renderOgTruthCardPng } from '../og-truth-card';
import {
  buildInspectAuditMarkdown,
  isInspectOfferBait,
  orderInspectOffers,
  resolveInspectMasterMinPriceVnd,
  resolveInspectPriceVerdictPrices,
  sanitizeInspectPriceVnd,
  type InspectMarkdownTranslator,
} from '../../components/inspect/DeepInspectWorkspace';
import { EMPTY_RADAR_SIGNAL } from '../deal-radar';
import {
  computeWatchlistTargetPrice,
  formatWatchlistPrice,
  normalizeWatchlistItem,
} from '../../components/watchlist/watchlist-store';
import {
  buildWatchlistPortfolioMarkdown,
  resolveBoundedWatchlistTargetInput,
  resolveWatchlistDetailHref,
  type WatchlistPortfolioMarkdownTranslator,
} from '../../components/watchlist/WatchlistWorkspace';
import {
  ingestExtensionCrowdSignal,
  lookupExtensionProduct,
  detectAccessoryOrJunk,
} from '../../server/rate/extension';
import {
  parseOptionalVndPriceParam,
  resolveInspectObservedPrices,
} from '../../server/rate/api-handler';
import { buildRateOpenApiSpec } from '../../server/rate/openapi';
import type { MasterProduct } from '@repo/shared-data';
import { createTranslator } from 'next-intl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../../..');

console.warn('🧪 Wave E1/E2 web readiness suite (DOS/Rate#1901)');

// 1. Canonical slugs, routes, and next.config.mjs negative lookahead parity
assert.equal(CORE_TECH_CATEGORY_SLUGS.length, 5);
assert.equal(WAVE_E1_CATEGORY_SLUGS.length, 5);
assert.equal(WAVE_E2_SERVICE_CATEGORY_SLUGS.length, 2);
assert.equal(ALL_CANONICAL_CATEGORY_SLUGS.length, 19);

const nextConfigSrc = readFileSync(join(webRoot, 'next.config.mjs'), 'utf8');
for (const slug of [
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
]) {
  assert.equal(isCanonicalCategorySlug(slug), true, slug);
  assert.equal(
    existsSync(join(webRoot, 'src/app/[locale]', slug, 'page.tsx')),
    true,
    `missing catalog page for ${slug}`
  );
  assert.equal(
    existsSync(join(webRoot, 'src/app/[locale]', slug, '[slug]/page.tsx')),
    true,
    `missing detail page for ${slug}`
  );
  const escapedSlug = slug.split('-').join('\\-');
  const matchCount = nextConfigSrc
    .split('\n')
    .filter(
      (line) =>
        line.includes('/:path(') &&
        (line.includes(`|${slug}|`) ||
          line.includes(`|${slug})`) ||
          line.includes(`|${escapedSlug}|`) ||
          line.includes(`|${escapedSlug})`))
    ).length;
  assert.ok(
    matchCount >= 2,
    `next.config.mjs must exclude ${slug} in both middleware/rewrite lookaheads`
  );
}

// 2. Empty-category directory visibility protects homepage/tabs pre-seed
for (const coreSlug of CORE_TECH_CATEGORY_SLUGS) {
  assert.equal(
    isCategoryVisibleInDirectory(coreSlug, 0),
    true,
    `core category ${coreSlug} remains visible at 0 products for E2E`
  );
}
for (const extraSlug of [
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
]) {
  assert.equal(
    isCategoryVisibleInDirectory(extraSlug, 0),
    false,
    `unseeded Wave E1/E2 category ${extraSlug} must stay hidden at 0 products`
  );
  assert.equal(
    isCategoryVisibleInDirectory(extraSlug, 0, extraSlug),
    true,
    `explicitly opened ${extraSlug} stays visible`
  );
  assert.equal(
    isCategoryVisibleInDirectory(extraSlug, 1),
    true,
    `populated ${extraSlug} becomes visible automatically`
  );
  assert.equal(
    isWaveE1CategorySlug(extraSlug) || isWaveE2ServiceCategorySlug(extraSlug),
    true
  );
}

// 3. OpenAPI strictly preserves 22 SupportedEcommercePlatform options
const openApiSpec = buildRateOpenApiSpec();
const platformEnum = (
  openApiSpec.components.schemas.SupportedEcommercePlatform as {
    enum: readonly string[];
  }
).enum;
assert.equal(platformEnum.length, 22);
assert.equal(platformEnum.includes('vietcombank'), false);

// 4. PCT currency preservation across rate-api and locale-format
assert.equal(normalizePriceCurrency('pct'), 'PCT');
assert.equal(sanitizeCurrencyPriceValue(5.45, 'PCT'), 5.45);
assert.equal(sanitizeCurrencyPriceValue(5.45, 'VND'), 5);
assert.equal(formatListingPrice(5.4, 'PCT', 'en'), '5.4%/yr');
assert.equal(formatListingPrice(5.4, 'PCT', 'vi'), '5.4%/năm');
assert.equal(formatListingPrice(5.4, 'PCT', 'cs'), `5,4${NBSP}%/rok`);
assert.equal(
  formatListingPrice(5.4, 'PCT', 'en', { includeUnitSuffix: false }),
  '5.4%'
);
assert.equal(
  formatListingPrice(195_000, 'VND', 'vi', {
    categorySlug: 'internet-telecom',
  }),
  '195.000 ₫/tháng'
);
assert.equal(
  formatListingPrice(195_000, 'VND', 'en', {
    categorySlug: 'internet-telecom',
  }),
  '195.000 ₫/mo'
);
assert.equal(
  formatListingPrice(195_000, 'VND', 'cs', {
    categorySlug: 'internet-telecom',
  }),
  `195${NBSP}000${NBSP}₫/měs.`
);
assert.equal(
  resolveListingUnitSuffix('VND', 'internet-telecom', 'vi'),
  '/tháng'
);
assert.equal(resolveListingUnitSuffix('VND', 'smartphones', 'vi'), '');
assert.equal(
  resolveListingPriceCurrency({ categorySlug: 'bank-savings' }),
  'PCT'
);
assert.equal(
  resolveListingPriceCurrency({ categorySlug: 'internet-telecom' }),
  'VND'
);
assert.equal(
  normalizeOfferOriginalPrice(5.4, 5.8, 'PCT'),
  5.8,
  'PCT original price preserves decimals'
);
const pctOffer = mapTrustViewRowToMerchantOffer({
  id: 'offer-vcb-1',
  merchant_id: 'm-vcb',
  platform: 'vietcombank',
  title: 'Tiet kiem online 12 thang',
  price_current: 4.85,
  price_original: 5.1,
  currency: 'PCT',
  stock: 1,
  rating_star: 4.7,
  rating_count: 100,
  url: 'https://www.vietcombank.com.vn/lai-suat',
});
assert.equal(pctOffer.currency, 'PCT');
assert.equal(pctOffer.price_current, 4.85);
assert.equal(pctOffer.price_original, 5.1);

// 5. Criteria v2 version & labels & product-points parity
assert.equal(RATING_CRITERIA_VERSION, 1);
assert.equal(RATING_CRITERIA_V2_VERSION, 2);
assert.equal(getRatingCriteriaVersion('smartphones'), 1);
for (const slug of [
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
]) {
  assert.equal(getRatingCriteriaVersion(slug), 2, `${slug} uses criteria v2`);
  const criteria = getRatingCriteria(slug);
  assert.ok(criteria && criteria.length >= 4, `${slug} criteria defined`);
  assert.equal(
    criteria.reduce((sum, c) => sum + c.weight, 0),
    100,
    `${slug} criteria weights sum to 100`
  );
  assert.equal(
    criteria.filter((c) => c.required).length,
    1,
    `${slug} has 1 required criterion`
  );
  for (const crit of criteria) {
    const pointKey = pointCriterionMessageKey(crit.key);
    assert.ok(pointKey, `missing pointCrit key for ${crit.key}`);
    for (const [localeName, bundle] of [
      ['vi', viMessages],
      ['en', enMessages],
      ['cs', csMessages],
    ] as const) {
      assert.ok(
        (bundle.reviews as Record<string, unknown>)[pointKey!],
        `${localeName}.reviews.${pointKey} must exist`
      );
    }
  }
}

// 6. Spec templates, category filter schemas, and price floor for E1/E2
for (const slug of [
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
]) {
  const tmpl = getCategorySpecTemplate(slug);
  assert.equal(tmpl.ram, false, `${slug} template hides phone RAM`);
  assert.equal(tmpl.storage, false, `${slug} template hides phone storage`);
  assert.equal(tmpl.has5g, false, `${slug} template hides phone 5G`);
  const schema = getCategoryFilterSchema(slug);
  assert.equal(schema.categorySlug, slug);
  assert.deepEqual(schema.ramOptionsGb, []);
  assert.deepEqual(schema.storageOptionsGb, []);
  assert.equal(
    schema.directorySlug,
    isWaveE2ServiceCategorySlug(slug) ? 'services' : 'tech_electronics'
  );
  for (const [localeName, bundle] of [
    ['vi', viMessages],
    ['en', enMessages],
    ['cs', csMessages],
  ] as const) {
    const tCatalog = createTranslator({
      locale: localeName,
      messages: bundle,
      namespace: 'catalog',
    });
    const localized = localizeCategoryFilterSchema(schema, (key) =>
      tCatalog(key as never)
    );
    assert.ok(localized.categoryTitle.length > 0);
    assert.ok(localized.directoryName.length > 0);
  }
}

assert.equal(
  minimumListingPriceVnd(['Vietcombank Tiet Kiem 12 thang'], {
    categorySlug: 'bank-savings',
    currency: 'PCT',
  }),
  0
);
assert.equal(
  detectAccessoryOrJunk({
    title: 'Vietcombank Savings 12M',
    price: 5.4,
    categorySlug: 'bank-savings',
    currency: 'PCT',
  }).isAccessory,
  false
);
assert.equal(
  getMasterProductCategorySlug({
    slug: 'daikin-ftkb25yvmv-inverter-9000btu',
    name: 'Dieu hoa Daikin Inverter 9000 BTU',
    metadata: { category_slug: 'air-conditioners' },
  }),
  'air-conditioners'
);

// 7. P0 #1: Omnibus & DeepInspect 0-floor services and decimal PCT precision
assert.equal(sanitizeOmnibusPriceVnd(5.4, 0, 'PCT'), 5.4);
assert.equal(sanitizeOmnibusPriceVnd(180_000, 0, 'VND'), 180_000);
assert.equal(sanitizeOmnibusPriceVnd(0.85, 0, 'PCT'), 0.85);
assert.equal(
  matchesSeasonalSaleFilter(
    {
      ...EMPTY_RADAR_SIGNAL,
      verdict: 'genuine_deal',
      currency: 'PCT',
      savingsPct: 12.5,
      fakeMarkupPct: 0,
      spreadPct: 0,
      genuineDeal: {
        id: 'offer-vcb-12m',
        verdict: 'genuine_all_time_low',
        verdictBadgeVi: 'Giá thấp nhất',
        productSlug: 'vcb-12m',
        productName: 'VCB 12M',
        brand: 'Vietcombank',
        categorySlug: 'bank-savings',
        productHref: '/bank-savings/vcb-12m',
        imageUrl: null,
        platform: 'vietcombank',
        merchantId: 'm-vcb',
        merchantName: 'Vietcombank',
        isOfficialMall: true,
        merchantRiskScore: 5,
        offerUrl: 'https://www.vietcombank.com.vn/lai-suat',
        currency: 'PCT',
        priceCurrent: 0.85,
        priceOriginal: 1.2,
        marketMedianPrice: 0.97,
        marketMinPrice: 0.85,
        marketMaxPrice: 1.2,
        savingsVsMedianVnd: 0.12,
        savingsVsMedianPct: 12.5,
        marketOfferCount: 3,
        claimedDiscountPct: 29.2,
        fakeMarkupPct: 0,
        jreviewsScore10: 8.6,
        explanationVi: '',
      },
    },
    'genuine_sale_drops'
  ),
  true,
  'sub-1% PCT listing must not be treated as zero/unpriced in seasonal sale filter'
);

const pctAudit = evaluateOmnibusPriceAudit({
  points: [
    {
      recorded_at: '2026-10-01T00:00:00Z',
      price: 5.4,
      product_id: 'vcb-12m',
      source: 'crawl',
    },
    {
      recorded_at: '2026-10-15T00:00:00Z',
      price: 5.8,
      product_id: 'vcb-12m',
      source: 'crawl',
    },
    {
      recorded_at: '2026-10-28T00:00:00Z',
      price: 5.9,
      product_id: 'vcb-12m',
      source: 'crawl',
    },
    {
      recorded_at: '2026-11-08T00:00:00Z',
      price: 5.85,
      product_id: 'vcb-12m',
      source: 'crawl',
    },
  ],
  currentPriceVnd: 5.4,
  claimedOriginalPriceVnd: 5.9,
  currentInStockPriceVnd: 5.4,
  minValidPriceVnd: 0,
  currency: 'PCT',
  referenceTimestampMs: Date.parse('2026-11-10T00:00:00Z'),
});
assert.equal(pctAudit.currentPriceVnd, 5.4);
assert.equal(pctAudit.priorFloorPriceVnd, 5.4);

const tVerdictEn = createTranslator({
  locale: 'en',
  messages: enMessages,
  namespace: 'priceVerdict',
});
const omnibusCopyEn = formatOmnibusAuditCopy(
  pctAudit,
  ((key, values) =>
    tVerdictEn(key as never, values as never)) as OmnibusVerdictTranslator,
  'en',
  'PCT'
);
assert.ok(
  omnibusCopyEn.currentPriceText.includes('5.4%') &&
    omnibusCopyEn.floorPriceText.includes('5.4%'),
  `PCT omnibus prices must format %, got: ${omnibusCopyEn.currentPriceText} / ${omnibusCopyEn.floorPriceText}`
);
assert.equal(
  omnibusCopyEn.currentPriceText.includes('₫') ||
    omnibusCopyEn.floorPriceText.includes('₫'),
  false,
  'PCT omnibus copy must not leak VND symbol'
);

assert.equal(sanitizeInspectPriceVnd(5.45, 'PCT'), 5.45);
const pctInspectOffers = [
  { id: 'vcb-12m', price_current: 5.4, price_original: 5.8, stock: 1 },
  { id: 'acb-12m', price_current: 5.6, price_original: null, stock: 1 },
];
const orderedPctInspect = orderInspectOffers(pctInspectOffers, 0, 'PCT');
assert.equal(orderedPctInspect.inStockOffers.length, 2);
assert.equal(orderedPctInspect.implausibleOfferIds.size, 0);
assert.equal(
  isInspectOfferBait(
    pctInspectOffers[0],
    new Set(),
    pctInspectOffers,
    0,
    'PCT'
  ),
  false
);

const pctMasterMock = {
  id: '00000000-0000-4000-8000-000000000901',
  brand: 'Vietcombank',
  model: 'Tiet Kiem 12M',
  model_key: 'vcb-12m',
  name: 'Vietcombank Online Savings 12M',
  slug: 'vietcombank-online-savings-12m',
  min_price: 5.4,
  max_price: 5.6,
  entity_type: 'service',
  metadata: { category_slug: 'bank-savings', currency: 'PCT' },
} as unknown as MasterProduct;

const pctInspectVerdict = resolveInspectPriceVerdictPrices({
  matchedOffer: pctInspectOffers[0],
  allOffers: pctInspectOffers,
  inStockOffers: orderedPctInspect.inStockOffers,
  offerUnavailable: false,
  offerImplausiblyLow: false,
  master: pctMasterMock,
  priceHistory: null,
  minFloorVnd: 0,
  currency: 'PCT',
});
assert.equal(pctInspectVerdict.currentPriceVnd, 5.4);
assert.equal(pctInspectVerdict.claimedOriginalVnd, 5.8);
assert.equal(
  resolveInspectMasterMinPriceVnd({
    matchedOffer: pctInspectOffers[0],
    allOffers: pctInspectOffers,
    inStockOffers: orderedPctInspect.inStockOffers,
    offerImplausiblyLow: false,
    master: pctMasterMock,
    minFloorVnd: 0,
    currency: 'PCT',
  }),
  5.4
);

const tInspectEn = createTranslator({
  locale: 'en',
  messages: enMessages,
  namespace: 'inspect',
});
const tOffersEn = createTranslator({
  locale: 'en',
  messages: enMessages,
  namespace: 'productDetail',
});
const pctInspectMd = buildInspectAuditMarkdown({
  queryInput: 'https://rate.vn/bank-savings/vietcombank-online-savings-12m',
  origin: 'https://rate.vn',
  locale: 'en',
  t: ((key, values) =>
    tInspectEn(key as never, values as never)) as InspectMarkdownTranslator,
  tVerdict: ((key, values) =>
    tVerdictEn(key as never, values as never)) as VerdictTranslatorLike,
  tOffers: (key) => tOffersEn(key as never),
  master: pctMasterMock,
  masterUserRating: 4.5,
  masterExpertRating10: 8.6,
  radarSignal: EMPTY_RADAR_SIGNAL,
  offerImplausiblyLow: false,
  matchedOfferUnavailable: false,
  discount: null,
  verdictPrices: pctInspectVerdict,
  merchant: null,
  safeMerchantTrust: null,
  dosafeDisplay: null,
  reviewRiskDisplay: null,
  currency: 'PCT',
});
assert.ok(pctInspectMd.includes('5.4%'));
assert.equal(pctInspectMd.includes('5 ₫'), false);

// 8. P1 #4: Sub-million internet-telecom filters & chips
async function runAsyncReadinessChecks() {
  const extMap = (
    Module as unknown as {
      _extensions?: Record<string, (mod: { exports: unknown }) => void>;
    }
  )._extensions;
  if (extMap && !extMap['.css']) {
    extMap['.css'] = (mod) => {
      mod.exports = { bar: 'bar' };
    };
  }
  const { sanitizeSidebarPriceMillion } =
    await import('../../app/[locale]/components/list-sidebar-one');
  const { formatCatalogPriceChip } =
    await import('../../app/[locale]/smartphones/page');
  assert.equal(sanitizeSidebarPriceMillion(150_000, 0, 5, 0, 0.05), 0.15);
  assert.equal(sanitizeSidebarPriceMillion(350_000, 0, 5, 5, 0.05), 0.35);
  const tCatalogEn = createTranslator({
    locale: 'en',
    messages: enMessages,
    namespace: 'catalog',
  });
  const subMillionChip = formatCatalogPriceChip(
    150_000,
    350_000,
    5,
    (key, values) => tCatalogEn(key as never, values as never)
  );
  assert.ok(
    subMillionChip.includes('150K') && subMillionChip.includes('350K'),
    `expected sub-million K chip, got: ${subMillionChip}`
  );

  // 15b. Real Satori OG PNG rendering for Wave E2 PCT & monthly telecom cards
  for (const locale of ['vi', 'en', 'cs'] as const) {
    const pctProductPng = Buffer.from(
      await renderOgTruthCardPng(
        {
          type: 'product',
          slug: 'vcb-12m',
          categoryPath: '/bank-savings',
          currency: 'PCT',
          name: 'Vietcombank Online 12M',
          brand: 'Vietcombank',
          minPriceVnd: 4.85,
          maxPriceVnd: 5.45,
          sellerCount: 3,
          userScore5: 4.6,
          expertScore10: 8.8,
          authenticReviews: 24,
          filteredReviews: 2,
          radarKind: 'verified',
          savingsPct: 0,
          fakeMarkupPct: 0,
          hasFakeSaleTrap: false,
        },
        'og',
        locale
      )
    );
    assert.ok(
      pctProductPng.length > 5_000,
      `PCT product OG PNG must render for ${locale}`
    );

    const telecomDealsPng = Buffer.from(
      await renderOgTruthCardPng(
        {
          type: 'deals',
          genuineDealCount: 2,
          fakeSaleTrapCount: 0,
          totalOffersAnalyzed: 12,
          totalClustersAnalyzed: 4,
          topDeals: [
            {
              name: 'VNPT Home Net 1',
              categorySlug: 'internet-telecom',
              categoryPath: '/internet-telecom',
              currency: 'VND',
              minPriceVnd: 195_000,
              savingsPct: 12.5,
              offerCount: 3,
            },
            {
              name: 'Vietcombank Online 12M',
              categorySlug: 'bank-savings',
              categoryPath: '/bank-savings',
              currency: 'PCT',
              minPriceVnd: 5.45,
              savingsPct: 6.2,
              offerCount: 4,
            },
          ],
        },
        'og',
        locale
      )
    );
    assert.ok(
      telecomDealsPng.length > 5_000,
      `Wave E2 deals OG PNG must render for ${locale}`
    );
  }

  // 16b. Extension crowd ingest preserves 2-decimal PCT rates when service currency='PCT'
  const ingestedPayloads: Array<Record<string, unknown>> = [];
  const ingestPctRes = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: 'vcb-12m',
    url: 'https://shopee.vn/tiet-kiem-online-i.101.202',
    title: 'Vietcombank Online Savings 12M',
    categorySlug: 'bank-savings',
    entityType: 'service',
    currency: 'PCT',
    price: 5.45,
    originalPrice: 5.85,
    userConsentOptIn: true,
    rateClient: {
      rpc: async (_fn, args) => {
        if (
          args.p_payload &&
          typeof args.p_payload === 'object' &&
          !Array.isArray(args.p_payload)
        ) {
          ingestedPayloads.push(args.p_payload as Record<string, unknown>);
        }
        return {
          data: [{ job_id: 'job-pct-1', state: 'enqueued' }],
          error: null,
        };
      },
    },
  });
  assert.equal(ingestPctRes.accepted, true);
  assert.equal(ingestedPayloads[0]?.observed_price, 5.45);
  assert.equal(ingestedPayloads[0]?.observed_original_price, 5.85);

  const { formatVersusPeerPriceBadge, sanitizeVersusPeerPriceVnd } =
    await import('../../components/compare/VersusMatchupSwitcher');
  assert.equal(sanitizeVersusPeerPriceVnd(5.45, 'PCT'), 5.45);
  assert.equal(
    formatVersusPeerPriceBadge(5.4, {
      currency: 'PCT',
      categorySlug: 'bank-savings',
      locale: 'en',
    }),
    '5.4%'
  );
  assert.equal(
    formatVersusPeerPriceBadge(195_000, {
      currency: 'VND',
      categorySlug: 'internet-telecom',
      locale: 'vi',
    }),
    '195K/tháng'
  );
  assert.equal(
    formatVersusPeerPriceBadge(195_000, {
      currency: 'VND',
      categorySlug: 'internet-telecom',
      locale: 'en',
    }),
    '195K/mo'
  );
}

// 9. P1 #5: Hyphenated Wave E1/E2 paths across parser, share OG URL, and watchlist
const parsedE1Url = parseEcommerceUrlOrQuery(
  'https://rate.vn/vi/air-conditioners/daikin-ftkb25yvmv'
);
assert.equal(parsedE1Url.platform, 'rate');
assert.equal(parsedE1Url.internalSlug, 'daikin-ftkb25yvmv');

const parsedE2Url = parseEcommerceUrlOrQuery(
  'https://rate.vn/bank-savings/vietcombank-online-savings-12m'
);
assert.equal(parsedE2Url.platform, 'rate');
assert.equal(parsedE2Url.internalSlug, 'vietcombank-online-savings-12m');

assert.equal(
  resolveShareAuditOgDownloadUrl({
    pathname: '/vi/internet-telecom/vnpt-home-net-1',
    locale: 'vi',
  }),
  '/api/v1/rate/og?type=product&slug=vnpt-home-net-1&locale=vi&format=social&download=1'
);

const normalizedE1Watch = normalizeWatchlistItem({
  slug: 'lg-fv1410s4p',
  name: 'LG AI DD FV1410S4P',
  brand: 'LG',
  categoryPath: '/washing-machines/lg-fv1410s4p',
  thumbnail: null,
  priceWhenAdded: 9_000_000,
  targetPrice: 8_500_000,
  addedAt: '2026-11-24T00:00:00.000Z',
});
assert.equal(normalizedE1Watch.categoryPath, '/washing-machines');
assert.equal(
  resolveWatchlistDetailHref(
    { slug: 'daikin-ftkb25yvmv', categoryPath: '/air-conditioners' },
    null,
    null
  ),
  '/air-conditioners/daikin-ftkb25yvmv'
);

// 10. P1 #6 & P2 #8: Earbuds sound->screen fallback and Wave E1/E2 leaderboard criteria
const pdvSrc = readFileSync(
  join(webRoot, 'src/app/[locale]/smartphones/[slug]/page.tsx'),
  'utf8'
);
assert.match(
  pdvSrc,
  /effectiveCriteriaSlug\s*===\s*'earbuds'\s*&&\s*key\s*===\s*'sound'/,
  'ProductDetailView must keep earbuds sound -> screen legacy fallback'
);
assert.deepEqual(leaderboardCriteriaForCategory('tvs'), ['screen', 'value']);
assert.deepEqual(leaderboardCriteriaForCategory('air-purifiers'), ['value']);
assert.deepEqual(leaderboardCriteriaForCategory('bank-savings'), ['value']);

// 11. P1 #3: PCT formatting across verdict copy, compare, versus, catalog, watchlist
const pctVerdictCopy = discountVerdictCopy(
  ((key, values) =>
    tVerdictEn(key as never, values as never)) as VerdictTranslatorLike,
  {
    product_id: 'vcb-12m',
    merchant_name: 'Vietcombank',
    platform: 'vietcombank',
    price_current: 5.4,
    price_original: 5.8,
    currency: 'PCT',
    claimed_discount_pct: 6.9,
    real_discount_vs_median_pct: 3.6,
    historical_min_price: 5.1,
    historical_max_price: 5.9,
    historical_median_price: 5.6,
    observation_count: 10,
    verdict: 'genuine_deal',
    badge_label: 'Genuine',
    explanation: '',
  },
  'en'
);
assert.ok(pctVerdictCopy.explanation.includes('5.6%/yr'));

assert.equal(sanitizeVersusPriceVnd(5.45, 'PCT'), 5.45);
assert.equal(formatVersusPriceVnd(5.45, 'en', 'PCT'), '5.45%/yr');
assert.equal(sanitizeCatalogPriceVnd(5.45, 'PCT'), 5.45);
assert.equal(sanitizeComparePriceVnd(5.45, 'PCT'), 5.45);

const pctRatedMaster = {
  ...pctMasterMock,
  min_price: 5.45,
  max_price: 5.85,
  rating_score: 4.6,
  total_reviews: 20,
  merchant_count: 3,
} as unknown as MasterProduct;
const catalogPctEntry = buildCatalogJsonProductEntry(pctRatedMaster, 1, null);
assert.equal(catalogPctEntry.currency, 'PCT');
assert.equal(catalogPctEntry.minPrice, 5.45);
assert.equal(catalogPctEntry.minPriceVnd, 5.45);
const comparePctEntry = buildCompareJsonProductEntry(pctRatedMaster, null);
assert.equal(comparePctEntry.currency, 'PCT');
assert.equal(comparePctEntry.minPrice, 5.45);
assert.equal(comparePctEntry.minPriceVnd, 5.45);

assert.equal(computeWatchlistTargetPrice(5.4, 5, 'PCT'), 5.13);
assert.equal(formatWatchlistPrice(5.4, 'PCT', 'en'), '5.4%/yr');
assert.equal(
  formatWatchlistPrice(195_000, 'VND', 'vi', '/internet-telecom'),
  '195.000 ₫/tháng'
);
assert.equal(resolveBoundedWatchlistTargetInput(5.15, 5.4, 'PCT'), 5.15);
const normalizedPctWatch = normalizeWatchlistItem({
  slug: 'vietcombank-online-savings-12m',
  name: 'Vietcombank Online Savings 12M',
  brand: 'Vietcombank',
  categoryPath: '/bank-savings',
  currency: 'PCT',
  thumbnail: null,
  priceWhenAdded: 5.4,
  targetPrice: 5.13,
  addedAt: '2026-11-24T00:00:00.000Z',
});
assert.equal(normalizedPctWatch.currency, 'PCT');
assert.equal(normalizedPctWatch.targetPrice, 5.13);
const tWatchEn = createTranslator({
  locale: 'en',
  messages: enMessages,
  namespace: 'watchlist',
});
const watchlistMd = buildWatchlistPortfolioMarkdown({
  items: [normalizedPctWatch],
  productBySlug: new Map([[pctRatedMaster.slug, pctRatedMaster]]),
  liveDeals: {},
  portfolioStats: {
    totalMinVnd: 0,
    totalTargetVnd: 0,
    totalSpreadSavingsVnd: 0,
  },
  avgPortfolioRating2d: '4.60',
  t: ((key, values) =>
    tWatchEn(
      key as never,
      values as never
    )) as WatchlistPortfolioMarkdownTranslator,
  locale: 'en',
});
assert.ok(watchlistMd.includes('5.45%/yr'));
assert.ok(watchlistMd.includes('5.13%/yr'));

// 12. P2 #7: DB-backed SSR routes wire populatedCategorySlugs to PageShell, static pages do not hit Supabase
for (const relPath of [
  'src/app/[locale]/deals/page.tsx',
  'src/app/[locale]/compare/page.tsx',
  'src/app/[locale]/compare/[versus]/page.tsx',
  'src/app/[locale]/merchants/page.tsx',
  'src/app/[locale]/merchants/[id]/page.tsx',
  'src/app/[locale]/inspect/page.tsx',
  'src/app/[locale]/watchlist/page.tsx',
  'src/app/[locale]/smartphones/[slug]/page.tsx',
  'src/app/[locale]/about-us/page.tsx',
  'src/app/[locale]/developers/page.tsx',
]) {
  const src = readFileSync(join(webRoot, relPath), 'utf8');
  assert.ok(
    src.includes('populatedCategorySlugs={populatedCategorySlugs}'),
    `${relPath} must pass populatedCategorySlugs to PageShell`
  );
}

// 13. Locale parity for newly introduced Wave E1/E2 currency & chip keys
for (const [ns, key] of [
  ['catalog', 'page.chipPriceThousand'],
  ['catalog', 'page.spreadDiffBadgeCurrency'],
  ['watchlist', 'quickWatch5PctBtnCurrency'],
  ['watchlist', 'badgeWaitingDropCurrency'],
  ['watchlist', 'radarSpreadBadgeCurrency'],
  ['watchlist', 'highestPriceSubCurrency'],
  ['watchlist', 'diffDroppedCurrency'],
  ['watchlist', 'diffIncreasedCurrency'],
  ['watchlist', 'openDealLinkCurrency'],
  ['watchlist', 'btnWatchingCurrency'],
  ['inspect', 'radarGenuinePillCurrency'],
  ['inspect', 'radarBelowMedianPillCurrency'],
  ['inspect', 'radarSpreadPillCurrency'],
  ['productDetail', 'allTimeLowBadgeCurrency'],
  ['productDetail', 'heroPriceLineCurrency'],
  ['productDetail', 'itemVariantPriceCurrency'],
  ['productDetail', 'shareAuditPriceSourcesCurrency'],
  ['productDetail', 'metaTitleCurrency'],
  ['productDetail', 'metaTitleShortCurrency'],
  ['productDetail', 'ogDescCurrency'],
  ['homePage', 'medianPriceInlineCurrency'],
  ['deals', 'spreadSavingsBadgeCurrency'],
  ['deals', 'medianPriceLabelCurrency'],
] as const) {
  for (const [localeName, bundle] of [
    ['vi', viMessages],
    ['en', enMessages],
    ['cs', csMessages],
  ] as const) {
    const root = (bundle as Record<string, unknown>)[ns] as Record<
      string,
      unknown
    >;
    const resolved = key
      .split('.')
      .reduce<unknown>(
        (acc, seg) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[seg]
            : undefined,
        root
      );
    assert.ok(
      typeof resolved === 'string' && resolved.length > 0,
      `Missing ${localeName}.${ns}.${key}`
    );
  }
}

type VerdictTranslatorLike = Parameters<typeof discountVerdictCopy>[0];

// 14. P1 #1: PriceHistorySection SVG PCT scaling, compact ticks, Markdown export, and ItemLazySizePanel wiring
const pctBounds = computePriceHistoryChartYBounds([4.85, 5.4], 'PCT');
assert.ok(
  pctBounds.minY >= 4 && pctBounds.minY < 4.85,
  `PCT minY must tightly bound low value, got: ${pctBounds.minY}`
);
assert.ok(
  pctBounds.maxY > 5.4 && pctBounds.maxY <= 6,
  `PCT maxY must tightly bound high value instead of VND 100k step, got: ${pctBounds.maxY}`
);
const subOnePctBounds = computePriceHistoryChartYBounds([0.1, 0.2], 'PCT');
assert.equal(subOnePctBounds.minY, 0.05);
assert.equal(subOnePctBounds.maxY, 0.25);
assert.equal(formatCompactPriceHistoryVnd(4.7, 'en', 'PCT'), '4.7%');
assert.equal(formatCompactPriceHistoryVnd(0, 'en', 'PCT'), '0%');
assert.equal(formatCompactPriceHistoryVnd(0, 'cs', 'PCT'), `0${NBSP}%`);

const pctHistoryMd = buildPriceHistoryMarkdown({
  productName: 'Vietcombank Online 12M',
  currency: 'PCT',
  categorySlug: 'bank-savings',
  history: {
    points: [
      {
        id: 1,
        product_id: 'vcb-12m',
        merchant_name: 'Vietcombank',
        platform: 'vietcombank',
        is_official: true,
        price: 5.4,
        price_original: 5.8,
        currency: 'PCT',
        recorded_at: '2026-11-24T00:00:00.000Z',
        source: 'crawler',
      },
    ],
    lowestEverPrice: 4.85,
    lowestEverDate: '2026-11-15T00:00:00.000Z',
    lowestEverMerchant: 'Vietcombank',
    highestEverPrice: 5.8,
    currentMinPrice: 5.4,
    byOffer: {},
    fakeDiscountCount: 0,
    genuineDealCount: 1,
  },
  offerAnalyses: [
    {
      product_id: 'vcb-12m',
      merchant_name: 'Vietcombank',
      platform: 'vietcombank',
      price_current: 5.4,
      price_original: 5.8,
      currency: 'PCT',
      claimed_discount_pct: 6.9,
      real_discount_vs_median_pct: 3.6,
      historical_min_price: 4.85,
      historical_max_price: 5.8,
      historical_median_price: 5.6,
      observation_count: 10,
      verdict: 'genuine_deal',
      badge_label: 'Genuine',
      explanation: '',
    },
  ],
  tVerdict: ((key, values) =>
    tVerdictEn(key as never, values as never)) as VerdictTranslatorLike,
  locale: 'en',
});
assert.ok(pctHistoryMd.includes('5.4%/yr'));
assert.ok(pctHistoryMd.includes('4.85%/yr'));
assert.ok(pctHistoryMd.includes('Current price (%)'));
assert.equal(pctHistoryMd.includes('₫'), false);

const lazySizePanelSrc = readFileSync(
  join(webRoot, 'src/components/product/item/ItemLazySizePanel.tsx'),
  'utf8'
);
assert.match(
  lazySizePanelSrc,
  /<PriceHistorySection[\s\S]*?categorySlug=\{categorySlug\}[\s\S]*?currency=\{effectiveCurrency\}/
);

// 15. P1 #2: OG truth card PCT & internet-telecom formatting
assert.equal(
  formatOgListingPrice(5.45, 'vi', {
    currency: 'PCT',
    categorySlug: 'bank-savings',
  }),
  '5.45%/năm'
);
assert.equal(
  formatOgListingPrice(5.45, 'en', {
    currency: 'PCT',
    categorySlug: 'bank-savings',
  }),
  '5.45%/yr'
);
assert.equal(
  formatOgListingPrice(5.45, 'cs', {
    currency: 'PCT',
    categorySlug: 'bank-savings',
  }),
  '5,45 %/rok'
);
assert.equal(
  formatOgListingPrice(195_000, 'vi', {
    currency: 'VND',
    categorySlug: 'internet-telecom',
  }),
  '195.000 đ/tháng'
);
assert.equal(
  formatOgListingPrice(195_000, 'en', {
    currency: 'VND',
    categorySlug: 'internet-telecom',
  }),
  '195.000 VND/mo'
);
assert.equal(
  formatOgListingPrice(195_000, 'cs', {
    currency: 'VND',
    categorySlug: 'internet-telecom',
  }),
  '195 000 VND/měs.'
);
const ogRouteSrc = readFileSync(
  join(webRoot, 'src/app/api/v1/rate/og/route.ts'),
  'utf8'
);
assert.match(
  ogRouteSrc,
  /type:\s*'product'[\s\S]*?currency,[\s\S]*?type:\s*'versus'[\s\S]*?currency:\s*resolveListingPriceCurrency/
);

// 16. P1 #3 & P2 #3: API query/inspect PCT decimals & hyphenated category hrefs
assert.equal(parseOptionalVndPriceParam('0.1'), null);
assert.equal(parseOptionalVndPriceParam('5.45', undefined, 'PCT'), 5.45);
assert.equal(parseOptionalVndPriceParam('0.85', undefined, 'PCT'), 0.85);
assert.deepEqual(
  resolveInspectObservedPrices({
    queryPrice: 5.15,
    queryOriginalPrice: 5.65,
    currency: 'PCT',
    categorySlug: 'bank-savings',
  }),
  { observedPrice: 5.15, observedOriginalPrice: 5.65 }
);
assert.equal(
  detectAccessoryOrJunk({
    title: 'Vietcombank Online Savings 12M',
    url: 'https://www.vietcombank.com.vn/savings',
    price: 5.45,
    categorySlug: 'bank-savings',
    currency: 'PCT',
  }).isAccessory,
  false
);
void lookupExtensionProduct;

const watchlistRouteSrc = readFileSync(
  join(webRoot, 'src/app/api/v1/rate/watchlist/route.ts'),
  'utf8'
);
assert.match(
  watchlistRouteSrc,
  /\/\^\\\/\[a-z\]\[a-z0-9-\]\*\\\/\[\^\/\?#\\s\]\+\$\//
);
assert.equal(
  /^\/[a-z][a-z0-9-]*\/[^/?#\s]+$/.test('/air-conditioners/daikin-ftkb25yvmv'),
  true
);
assert.equal(
  /^\/[a-z][a-z0-9-]*\/[^/?#\s]+$/.test('/bank-savings/vcb-12m'),
  true
);
const comboCartSrc = readFileSync(
  join(webRoot, 'src/server/rate/combo-cart.ts'),
  'utf8'
);
assert.match(
  comboCartSrc,
  /\/\^\\\/\[a-z\]\[a-z0-9-\]\*\\\/\[\^\/\?#\\s\]\+\$\//
);

// 17. P3: Cross-surface category & currency wiring checks
const homePageSrc = readFileSync(
  join(webRoot, 'src/app/[locale]/page.tsx'),
  'utf8'
);
assert.match(
  homePageSrc,
  /getMasterProductCategorySlug\(\s*item,\s*catSlugById\s*\)/
);
const leaderboardSrc = readFileSync(
  join(webRoot, 'src/components/leaderboard/LeaderboardExplorer.tsx'),
  'utf8'
);
assert.match(
  leaderboardSrc,
  /<CompareQuickToggle[\s\S]*?currency:\s*entryCurrency/
);
const compareSrcCheck = readFileSync(
  join(webRoot, 'src/components/compare/CompareWorkspace.tsx'),
  'utf8'
);
assert.match(
  compareSrcCheck,
  /upsertWatchlistItem\(\{[\s\S]*?currency:\s*pCur/
);

runAsyncReadinessChecks()
  .then(() => {
    console.warn('✅ Wave E1/E2 web readiness suite passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
