import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { MasterProduct } from '@repo/shared-data';

import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import { pickClientMessages } from '../client-messages';
import { NBSP } from '../locale-format';
import { evaluateMerchantTrustBadge } from '../merchant-trust-badge';
import type { CrossPlatformDealRadarResponse } from '../../server/rate/deals';
import WatchlistWorkspace from '../../components/watchlist/WatchlistWorkspace';
import {
  buildComboCartApiUrl,
  formatComboTrustScore,
  isSafeComboSlugToken,
  mergeComboCartSearchParams,
  parseComboCartItemsQueryParam,
  parseComboCartQueryState,
  sanitizeComboOfferHref,
  sanitizeComboProductHref,
  type ComboCartApiPayload,
} from '../../components/watchlist/WatchlistComboOptimizer';
import MerchantDirectoryExplorer, {
  evaluateMerchantDirectoryTrustBadge,
  filterVerifiedSafeDirectoryMerchants,
  resolveDirectoryMerchantFakeDiscountCount,
  type MerchantDirectoryExplorerItem,
} from '../../components/merchants/MerchantDirectoryExplorer';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, '../../..');

const mockRouter: AppRouterInstance = {
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

const localeCatalogs = {
  vi: viMessages,
  en: enMessages,
  cs: csMessages,
} as const;

function collectPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(/\{([a-zA-Z0-9_]+)(?:,|\})/g)) {
    names.add(match[1]!);
  }
  return Array.from(names).sort();
}

function makeCatalogProduct(
  id: string,
  slug: string,
  name: string,
  minPrice: number
): MasterProduct {
  return {
    id,
    slug,
    name,
    brand: 'Apple',
    model: name,
    category_id: 'cat-1',
    status: 'published',
    min_price: minPrice,
    max_price: minPrice + 2_000_000,
    merchant_count: 4,
    user_rating_weighted: 4.8,
    metadata: { category_slug: 'smartphones' },
  } as unknown as MasterProduct;
}

function makeDirMerchant(
  overrides: Partial<MerchantDirectoryExplorerItem> & {
    id: string;
    name: string;
  }
): MerchantDirectoryExplorerItem {
  return {
    platform: 'shopee',
    platform_shop_id: `shop-${overrides.id}`,
    slug: overrides.id,
    url: `https://shopee.vn/shop/${overrides.id}`,
    is_official: true,
    rating_star: 4.9,
    follower_count: 50_000,
    location: 'TP.HCM',
    dosafe_risk_score: 5,
    review_risk_score: 8,
    risk_score: 8,
    trust_score: 92,
    product_count: 12,
    min_price: 1_500_000,
    max_price: 29_990_000,
    review_risk_breakdown: {
      total_reviews: 40,
      authentic_count: 38,
      coin_spam_count: 2,
      seeding_fake_count: 0,
      sabotage_or_bombing_count: 0,
      suspicious_ratio_pct: 5,
    },
    updated_at: '2026-11-23T00:00:00Z',
    ...overrides,
  };
}

function makeRadarResponse(
  traps: CrossPlatformDealRadarResponse['fakeSaleTraps'] = []
): CrossPlatformDealRadarResponse {
  return {
    generatedAt: '2026-11-23T00:00:00Z',
    categoryFilter: 'all',
    platformFilter: 'all',
    totalClustersAnalyzed: 12,
    totalOffersAnalyzed: 40,
    totalMerchantsAnalyzed: 10,
    genuineDeals: [],
    fakeSaleTraps: traps,
    priceSpreadLeaders: [],
  };
}

function main() {
  console.warn(
    'Testing F8 combo cart UI & verified safe merchant badge (#1883)'
  );

  // =========================================================================
  // 1. URL ?items= parsing & serialization alongside ?add=/?target=/?unsubscribe=
  // =========================================================================
  assert.deepEqual(
    parseComboCartItemsQueryParam(
      'iphone-16, __proto__, airpods-pro-2, IPHONE-16, bad..slug, watch-10, s4, s5, s6'
    ),
    ['iphone-16', 'airpods-pro-2', 'watch-10', 's4', 's5']
  );
  assert.deepEqual(
    parseComboCartItemsQueryParam('constructor,prototype,0'),
    []
  );
  assert.deepEqual(parseComboCartItemsQueryParam('a\u0000b,c'), []);
  assert.equal(isSafeComboSlugToken('iphone-16.pro_1'), true);
  assert.equal(isSafeComboSlugToken('toString'), false);
  assert.equal(isSafeComboSlugToken('bad.'), false);

  const parsedQuery = parseComboCartQueryState(
    new URLSearchParams(
      'items=iphone-16,airpods-pro-2&officialOnly=1&minTrust=95&maxStores=2&shippingVnd=35000'
    )
  );
  assert.deepEqual(parsedQuery, {
    items: ['iphone-16', 'airpods-pro-2'],
    officialOnly: true,
    minTrust: 95,
    maxStores: 2,
    shippingVnd: 35000,
  });

  const clampedQuery = parseComboCartQueryState(
    new URLSearchParams(
      'items=a,b&officialOnly=false&minTrust=0x50&maxStores=99&shippingVnd=9999999'
    )
  );
  assert.deepEqual(clampedQuery, {
    items: ['a', 'b'],
    officialOnly: false,
    minTrust: 80,
    maxStores: 5,
    shippingVnd: 500_000,
  });

  // Live replaceState merge MUST preserve ?add=, ?target=, ?unsubscribe=
  const preservedParams = mergeComboCartSearchParams(
    '?add=iphone-16&target=19000000&unsubscribe=v1.abc.def&utm_source=ext',
    {
      items: ['iphone-16', 'airpods-pro-2'],
      officialOnly: false,
      minTrust: 80,
      maxStores: 3,
      shippingVnd: 0,
    },
    { stripTransient: false }
  );
  assert.equal(preservedParams.get('add'), 'iphone-16');
  assert.equal(preservedParams.get('target'), '19000000');
  assert.equal(preservedParams.get('unsubscribe'), 'v1.abc.def');
  assert.equal(preservedParams.get('utm_source'), 'ext');
  assert.equal(preservedParams.get('items'), 'iphone-16,airpods-pro-2');

  // Clearing combo items deletes ?items= while still preserving ?add=/?unsubscribe=
  const clearedParams = mergeComboCartSearchParams(
    '?add=iphone-16&items=iphone-16,airpods-pro-2&unsubscribe=v1.abc.def',
    {
      items: [],
      officialOnly: false,
      minTrust: 80,
      maxStores: 3,
      shippingVnd: 0,
    },
    { stripTransient: false }
  );
  assert.equal(clearedParams.has('items'), false);
  assert.equal(clearedParams.get('add'), 'iphone-16');
  assert.equal(clearedParams.get('unsubscribe'), 'v1.abc.def');

  // Share link builder strips transient watchlist action tokens
  const shareParams = mergeComboCartSearchParams(
    '?add=iphone-16&target=19000000&unsubscribe=v1.abc.def',
    {
      items: ['iphone-16', 'airpods-pro-2'],
      officialOnly: true,
      minTrust: 90,
      maxStores: 2,
      shippingVnd: 30_000,
    },
    { stripTransient: true }
  );
  assert.equal(shareParams.has('add'), false);
  assert.equal(shareParams.has('target'), false);
  assert.equal(shareParams.has('unsubscribe'), false);
  assert.equal(shareParams.get('items'), 'iphone-16,airpods-pro-2');
  assert.equal(shareParams.get('officialOnly'), '1');
  assert.equal(shareParams.get('minTrust'), '90');
  assert.equal(shareParams.get('maxStores'), '2');
  assert.equal(shareParams.get('shippingVnd'), '30000');

  assert.equal(
    buildComboCartApiUrl({
      items: ['iphone-16', 'airpods-pro-2'],
      officialOnly: true,
      minTrust: 85,
      maxStores: 2,
      shippingVnd: 30_000,
    }),
    '/api/v1/rate/combo-cart?items=iphone-16%2Cairpods-pro-2&officialOnly=1&minTrust=85&maxStores=2&shippingVnd=30000'
  );

  // Safe offer & product href validation
  assert.equal(
    sanitizeComboOfferHref('https://shopee.vn/product/123'),
    'https://shopee.vn/product/123'
  );
  assert.equal(sanitizeComboOfferHref('javascript:alert(1)'), null);
  assert.equal(sanitizeComboOfferHref('data:text/html,xss'), null);
  assert.equal(sanitizeComboOfferHref('https://user:pass@shopee.vn/x'), null);
  assert.equal(sanitizeComboOfferHref('http://localhost/admin'), null);
  assert.equal(sanitizeComboOfferHref('http://127.0.0.1/test'), null);

  assert.equal(
    sanitizeComboProductHref('/smartphones/iphone-16'),
    '/smartphones/iphone-16'
  );
  assert.equal(sanitizeComboProductHref('https://evil.com/phish'), null);
  assert.equal(sanitizeComboProductHref('//evil.com/phish'), null);
  assert.equal(sanitizeComboProductHref('/unknowncat/iphone-16'), null);
  assert.equal(sanitizeComboProductHref('/smartphones/__proto__'), null);

  // =========================================================================
  // 2. Regression: merchant-trust-badge review_risk_score hex/boolean fail-closed
  // =========================================================================
  for (const badReviewScore of [
    '0x10',
    '0b101',
    '0o10',
    false as unknown as number,
    true as unknown as number,
  ]) {
    const res = evaluateMerchantTrustBadge({
      dosafe_risk_score: 5,
      review_risk_score: badReviewScore,
      review_risk_breakdown: { total_reviews: 25 },
      is_official: true,
      offerCount: 4,
      activeFakeDiscountCount: 0,
    });
    assert.equal(
      res.verifiedSafe,
      false,
      `review_risk_score=${String(badReviewScore)} must fail closed`
    );
    assert.equal(res.signals.reviewRiskScore, null);
    assert.ok(res.failedReasons.includes('invalid_review_score'));
  }

  // Preserves null -> null (unmeasured) and 0 / '0' -> 0
  const nullReviewRes = evaluateMerchantTrustBadge({
    dosafe_risk_score: 5,
    review_risk_score: null,
    is_official: true,
    offerCount: 4,
    activeFakeDiscountCount: 0,
  });
  assert.equal(nullReviewRes.verifiedSafe, true);
  assert.equal(nullReviewRes.signals.reviewRiskScore, null);
  assert.ok(nullReviewRes.reasons.includes('review_risk_unmeasured'));

  for (const zeroVal of [0, '0'] as const) {
    const zeroReviewRes = evaluateMerchantTrustBadge({
      dosafe_risk_score: 5,
      review_risk_score: zeroVal,
      review_risk_breakdown: { total_reviews: 25 },
      is_official: true,
      offerCount: 4,
      activeFakeDiscountCount: 0,
    });
    assert.equal(zeroReviewRes.verifiedSafe, true);
    assert.equal(zeroReviewRes.signals.reviewRiskScore, 0);
    assert.ok(zeroReviewRes.reasons.includes('review_risk_clean'));
  }

  // P1 regression: negative or >100 runtime scores must fail closed instead of clamping
  for (const badScore of [-1, '-5', 101, 150] as const) {
    const badReviewRes = evaluateMerchantTrustBadge({
      dosafe_risk_score: 5,
      review_risk_score: badScore as never,
      review_risk_breakdown: { total_reviews: 25 },
      is_official: true,
      offerCount: 4,
      activeFakeDiscountCount: 0,
    });
    assert.equal(badReviewRes.verifiedSafe, false);
    assert.equal(badReviewRes.signals.reviewRiskScore, null);
    assert.ok(badReviewRes.failedReasons.includes('invalid_review_score'));

    const badDosafeRes = evaluateMerchantTrustBadge({
      dosafe_risk_score: badScore as never,
      review_risk_score: 5,
      is_official: true,
      offerCount: 4,
      activeFakeDiscountCount: 0,
    });
    assert.equal(badDosafeRes.verifiedSafe, false);
    assert.equal(badDosafeRes.signals.dosafeRiskScore, null);
    assert.ok(badDosafeRes.failedReasons.includes('missing_dosafe_score'));

    const badTrustRes = evaluateMerchantTrustBadge({
      dosafe_risk_score: 5,
      review_risk_score: 5,
      trust_score: badScore as never,
      is_official: false,
      offerCount: 4,
      activeFakeDiscountCount: 0,
    });
    assert.equal(badTrustRes.verifiedSafe, false);
    assert.ok(
      badTrustRes.failedReasons.includes('trust_score_below_threshold')
    );
  }

  // =========================================================================
  // 3. WatchlistWorkspace + WatchlistComboOptimizer SSR rendering (vi/en/cs)
  // =========================================================================
  const comboPayload: ComboCartApiPayload = {
    query: {
      items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c', 'missing-slug'],
      officialOnly: false,
      minTrust: 80,
      maxStores: 3,
      shippingVnd: 30_000,
    },
    items: [
      {
        requestedSlug: 'apple-iphone-16',
        resolvedSlug: 'apple-iphone-16-128gb',
        itemSlug: 'apple-iphone-16',
        masterProductId: 'm1',
        name: 'Apple iPhone 16 128GB',
        brand: 'Apple',
        categorySlug: 'smartphones',
        productHref: '/smartphones/apple-iphone-16',
        sizeRequired: true,
        retiredVariant: false,
        found: true,
        offerCount: 3,
      },
      {
        requestedSlug: 'apple-airpods-pro-2-usb-c',
        resolvedSlug: 'apple-airpods-pro-2-usb-c',
        itemSlug: null,
        masterProductId: 'm2',
        name: 'Apple AirPods Pro 2 USB-C',
        brand: 'Apple',
        categorySlug: 'earbuds',
        productHref: '/earbuds/apple-airpods-pro-2-usb-c',
        sizeRequired: false,
        retiredVariant: false,
        found: true,
        offerCount: 2,
      },
      {
        requestedSlug: 'apple-iphone-16-256gb',
        resolvedSlug: null,
        itemSlug: 'apple-iphone-16',
        masterProductId: null,
        name: 'apple-iphone-16-256gb',
        brand: null,
        categorySlug: null,
        productHref: '/smartphones/apple-iphone-16',
        sizeRequired: true,
        retiredVariant: true,
        found: false,
        offerCount: 0,
      },
    ],
    missingSlugs: ['apple-iphone-16-256gb'],
    singleStoreBest: {
      kind: 'single_store',
      distinctStoreCount: 1,
      itemsSubtotalVnd: 26_000_000,
      shippingVnd: 30_000,
      totalVnd: 26_030_000,
      allOfficial: true,
      avgTrustScore: 92,
      allocations: [],
      storeGroups: [
        {
          storeKey: 'store-cps',
          merchantId: 'store-cps',
          merchantName: 'CellphoneS',
          platform: 'cellphones',
          isOfficial: true,
          riskScore: 8,
          trustScore: 92,
          itemCount: 2,
          itemsSubtotalVnd: 26_000_000,
          shippingVnd: 30_000,
          storeTotalVnd: 26_030_000,
          items: [
            {
              itemSlug: 'apple-iphone-16',
              itemName: 'Apple iPhone 16 128GB',
              offerId: 'o1',
              offerTitle: 'iPhone 16 128GB VN/A',
              offerUrl: 'https://cellphones.com.vn/iphone-16.html',
              platform: 'cellphones',
              storeKey: 'store-cps',
              merchantId: 'store-cps',
              merchantName: 'CellphoneS',
              isOfficial: true,
              riskScore: 8,
              trustScore: 92,
              priceVnd: 20_000_000,
            },
            {
              itemSlug: 'apple-airpods-pro-2-usb-c',
              itemName: 'Apple AirPods Pro 2 USB-C',
              offerId: 'o2',
              offerTitle: 'AirPods Pro 2 USB-C',
              offerUrl: 'https://cellphones.com.vn/airpods-pro-2.html',
              platform: 'cellphones',
              storeKey: 'store-cps',
              merchantId: 'store-cps',
              merchantName: 'CellphoneS',
              isOfficial: true,
              riskScore: 8,
              trustScore: 92,
              priceVnd: 6_000_000,
            },
          ],
          trustBadge: {
            verifiedSafe: true,
            badgeCode: 'verified_safe',
            reasons: [
              'dosafe_low_risk',
              'official_store',
              'no_active_fake_discounts',
            ],
            failedReasons: [],
            signals: {
              dosafeRiskScore: 5,
              reviewRiskScore: 8,
              combinedTrustScore: 92,
              isOfficial: true,
              offerCount: 15,
              activeFakeDiscountCount: 0,
            },
            storeKey: 'store-cps',
            merchantId: 'store-cps',
            merchantName: 'CellphoneS',
            platform: 'cellphones',
            auditScope: 'merchant_wide',
            cartOfferCount: 2,
            cartFakeDiscountCount: 0,
          },
        },
      ],
    },
    multiStoreOptimal: {
      kind: 'multi_store',
      distinctStoreCount: 2,
      itemsSubtotalVnd: 23_500_000,
      shippingVnd: 60_000,
      totalVnd: 23_560_000,
      allOfficial: true,
      avgTrustScore: 93,
      allocations: [],
      storeGroups: [
        {
          storeKey: 'store-mall',
          merchantId: 'store-mall',
          merchantName: 'Apple Flagship Store',
          platform: 'shopee',
          isOfficial: true,
          riskScore: 6,
          trustScore: 94,
          itemCount: 1,
          itemsSubtotalVnd: 18_500_000,
          shippingVnd: 30_000,
          storeTotalVnd: 18_530_000,
          items: [
            {
              itemSlug: 'apple-iphone-16',
              itemName: 'Apple iPhone 16 128GB',
              offerId: 'o3',
              offerTitle: 'iPhone 16 128GB Mall',
              offerUrl: 'https://shopee.vn/product/1',
              platform: 'shopee',
              storeKey: 'store-mall',
              merchantId: 'store-mall',
              merchantName: 'Apple Flagship Store',
              isOfficial: true,
              riskScore: 6,
              trustScore: 94,
              priceVnd: 18_500_000,
            },
          ],
          trustBadge: {
            verifiedSafe: true,
            badgeCode: 'verified_safe',
            reasons: ['dosafe_low_risk', 'official_store'],
            failedReasons: [],
            signals: {
              dosafeRiskScore: 4,
              reviewRiskScore: 6,
              combinedTrustScore: 94,
              isOfficial: true,
              offerCount: 20,
              activeFakeDiscountCount: 0,
            },
            storeKey: 'store-mall',
            merchantId: 'store-mall',
            merchantName: 'Apple Flagship Store',
            platform: 'shopee',
            auditScope: 'merchant_wide',
            cartOfferCount: 1,
            cartFakeDiscountCount: 0,
          },
        },
        {
          storeKey: 'store-tiki',
          merchantId: 'store-tiki',
          merchantName: 'Tiki Trading',
          platform: 'tiki',
          isOfficial: true,
          riskScore: 8,
          trustScore: 92,
          itemCount: 1,
          itemsSubtotalVnd: 5_000_000,
          shippingVnd: 30_000,
          storeTotalVnd: 5_030_000,
          items: [
            {
              itemSlug: 'apple-airpods-pro-2-usb-c',
              itemName: 'Apple AirPods Pro 2 USB-C',
              offerId: 'o4',
              offerTitle: 'AirPods Pro 2 unsafe href test',
              offerUrl: 'javascript:alert(1)',
              platform: 'tiki',
              storeKey: 'store-tiki',
              merchantId: 'store-tiki',
              merchantName: 'Tiki Trading',
              isOfficial: true,
              riskScore: 8,
              trustScore: 92,
              priceVnd: 5_000_000,
            },
          ],
          trustBadge: {
            verifiedSafe: false,
            badgeCode: null,
            reasons: ['missing_fake_discount_audit'],
            failedReasons: ['missing_fake_discount_audit'],
            signals: {
              dosafeRiskScore: 5,
              reviewRiskScore: 8,
              combinedTrustScore: 92,
              isOfficial: true,
              offerCount: 10,
              activeFakeDiscountCount: null,
            },
            storeKey: 'store-tiki',
            merchantId: 'store-tiki',
            merchantName: 'Tiki Trading',
            platform: 'tiki',
            auditScope: 'cart_only_unverified',
            cartOfferCount: 1,
            cartFakeDiscountCount: 0,
          },
        },
      ],
    },
    savingsVsSingleStoreVnd: 2_470_000,
    savingsVsSingleStorePct: 9.5,
    cheapestPerItemSubtotalVnd: 23_500_000,
    uncoveredSlugs: ['apple-iphone-16-256gb'],
    merchantBadges: [],
    diagnostics: {
      itemCount: 3,
      maxStores: 3,
      minTrust: 80,
      officialOnly: false,
      shippingVndPerOrder: 30_000,
      searchNodesVisited: 8,
      maxSearchNodes: 50_000,
      nodeCapReached: false,
      candidateCapPerItem: 14,
      candidateTrimmed: false,
      searchComplete: true,
      itemDiagnostics: [],
    },
  };

  const catalogSample = [
    makeCatalogProduct('p1', 'apple-iphone-16', 'Apple iPhone 16', 18_500_000),
    makeCatalogProduct(
      'p2',
      'apple-airpods-pro-2-usb-c',
      'Apple AirPods Pro 2 USB-C',
      5_000_000
    ),
  ];

  assert.equal(formatComboTrustScore(92.4, 'cs'), '92,4');
  assert.equal(formatComboTrustScore(92, 'en'), '92');

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const messages = pickClientMessages(localeCatalogs[loc], 'watchlist');
    const html = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(WatchlistWorkspace, {
            catalogProducts: catalogSample,
            locale: loc,
            initialItems: [],
            initialComboSlugs: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'],
            initialComboOptions: { shippingVnd: 30_000 },
            initialComboResult: comboPayload,
          })
        )
      )
    );
    assert.ok(html.includes('data-testid="watchlist-combo-optimizer"'));
    assert.ok(html.includes('data-testid="combo-plan-single-store"'));
    assert.ok(html.includes('data-testid="combo-plan-multi-store"'));
    assert.ok(html.includes('data-testid="combo-diagnostics-alert"'));
    assert.ok(html.includes('href="/smartphones/apple-iphone-16"'));
    assert.ok(html.includes('rel="noopener noreferrer nofollow"'));
    assert.ok(html.includes('var(--rate-brand-bg)'));
    assert.equal(html.includes('rgba(216, 48, 48, 0.22)'), false);
    assert.equal(html.includes('javascript:alert(1)'), false);
    assert.equal(html.includes('\u2014'), false);
    assert.equal(html.includes('\u2013'), false);
    // Jargon guard matching catalog-watchlist-copy.spec.ts
    for (const banned of [
      'radar',
      'audit',
      'kiểm toán',
      'kiểm định',
      'seeding',
    ]) {
      assert.equal(
        html.toLowerCase().includes(banned),
        false,
        `${loc}: watchlist combo HTML must not include banned jargon "${banned}"`
      );
    }
    if (loc === 'cs') {
      assert.ok(html.includes(`2${NBSP}470${NBSP}000${NBSP}₫`));
      assert.ok(html.includes(`9,5${NBSP}%`));
      assert.ok(html.includes('2 obchody'));
    } else {
      assert.ok(html.includes('2.470.000 ₫'));
      assert.ok(html.includes('9.5%'));
    }
    const svgs = html.match(/<svg\b[^>]*>/g) ?? [];
    for (const svg of svgs) {
      assert.match(svg, /\baria-hidden="true"/);
    }
  }

  // =========================================================================
  // 4. MerchantDirectoryExplorer Verified Safe Merchant Badge & Filter
  // =========================================================================
  const partialCleanMerchant = makeDirMerchant({
    id: 'm-partial',
    name: 'Partial Audit Store',
    dosafe_risk_score: 4,
    review_risk_score: 10,
    trust_score: 90,
    is_official: true,
    product_count: 15,
  });
  const cleanMerchant = makeDirMerchant({
    id: 'm-clean',
    name: 'Verified Official Mall',
    dosafe_risk_score: 4,
    review_risk_score: 10,
    trust_score: 90,
    is_official: true,
    product_count: 15,
    activeFakeDiscountCount: 0,
  });
  const trapMerchant = makeDirMerchant({
    id: 'm-trap',
    name: 'Trap Merchant',
    dosafe_risk_score: 4,
    review_risk_score: 10,
    trust_score: 90,
    is_official: true,
    product_count: 15,
  });
  const unknownDosafeMerchant = makeDirMerchant({
    id: 'm-unknown-dosafe',
    name: 'Unknown DOSafe Mall',
    dosafe_risk_score: null,
    review_risk_score: 8,
    trust_score: 92,
    is_official: true,
    product_count: 15,
    activeFakeDiscountCount: 0,
  });

  // Fail closed when radarPayload is null and no explicit merchant-wide count
  const noRadarBadge = evaluateMerchantDirectoryTrustBadge(
    partialCleanMerchant,
    null
  );
  assert.equal(noRadarBadge.verifiedSafe, false);
  assert.ok(noRadarBadge.failedReasons.includes('missing_fake_discount_audit'));

  // Truthful pass & trap detection: partial radar (< 50 traps) NEVER infers 0
  // for merchants missing explicit activeFakeDiscountCount, while traps still fail.
  const truncatedRadar = makeRadarResponse(
    Array.from({ length: 50 }, (_, idx) => ({
      id: `trap-${idx}`,
      verdict: 'inflated_fake_sale',
      verdictBadgeVi: 'Fake',
      productSlug: `prod-${idx}`,
      productName: `Prod ${idx}`,
      brand: 'Apple',
      categorySlug: 'smartphones',
      productHref: `/smartphones/prod-${idx}`,
      imageUrl: null,
      platform: 'shopee',
      merchantId: 'other-merchant',
      merchantName: 'Other Merchant',
      isOfficialMall: false,
      merchantRiskScore: 30,
      offerUrl: 'https://shopee.vn/item',
      priceCurrent: 10_000_000,
      priceOriginal: 15_000_000,
      marketMedianPrice: 10_000_000,
      marketMinPrice: 9_000_000,
      marketMaxPrice: 11_000_000,
      savingsVsMedianVnd: 0,
      savingsVsMedianPct: 0,
      marketOfferCount: 3,
      claimedDiscountPct: 33,
      fakeMarkupPct: 50,
      jreviewsScore10: 8.5,
      explanationVi: 'Fake',
    }))
  );
  const liveRadar = makeRadarResponse([
    {
      ...truncatedRadar.fakeSaleTraps[0]!,
      merchantId: 'm-trap',
      merchantName: 'Trap Merchant',
    },
  ]);
  // Even with < 50 radar traps, merchant without explicit coverage stays unverified
  const partialLiveBadge = evaluateMerchantDirectoryTrustBadge(
    partialCleanMerchant,
    liveRadar
  );
  assert.equal(partialLiveBadge.verifiedSafe, false);
  assert.ok(
    partialLiveBadge.failedReasons.includes('missing_fake_discount_audit')
  );

  // Explicit verified merchant-wide count === 0 qualifies truthfully
  const cleanBadge = evaluateMerchantDirectoryTrustBadge(
    cleanMerchant,
    liveRadar
  );
  assert.equal(cleanBadge.verifiedSafe, true);
  assert.equal(cleanBadge.signals.activeFakeDiscountCount, 0);

  const trapBadge = evaluateMerchantDirectoryTrustBadge(
    trapMerchant,
    liveRadar
  );
  assert.equal(trapBadge.verifiedSafe, false);
  assert.ok(trapBadge.failedReasons.includes('active_fake_discounts_detected'));

  const unknownDosafeBadge = evaluateMerchantDirectoryTrustBadge(
    unknownDosafeMerchant,
    liveRadar
  );
  assert.equal(unknownDosafeBadge.verifiedSafe, false);
  assert.ok(unknownDosafeBadge.failedReasons.includes('missing_dosafe_score'));

  // Zero analyzed clusters or explicit null fake count must fail closed
  const zeroClusterRadar: CrossPlatformDealRadarResponse = {
    ...liveRadar,
    totalClustersAnalyzed: 0,
  };
  assert.equal(
    resolveDirectoryMerchantFakeDiscountCount(
      partialCleanMerchant,
      zeroClusterRadar
    ),
    null
  );
  assert.equal(
    resolveDirectoryMerchantFakeDiscountCount(
      { ...cleanMerchant, activeFakeDiscountCount: null },
      liveRadar
    ),
    null
  );
  assert.deepEqual(
    filterVerifiedSafeDirectoryMerchants(
      [
        cleanMerchant,
        partialCleanMerchant,
        trapMerchant,
        unknownDosafeMerchant,
      ],
      liveRadar
    ).map((m) => m.id),
    ['m-clean']
  );

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const messages = pickClientMessages(localeCatalogs[loc], 'merchants');
    const dirHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(MerchantDirectoryExplorer, {
            initialPage: {
              items: [cleanMerchant, trapMerchant, unknownDosafeMerchant],
              matched: 3,
              offset: 0,
            },
            summary: {
              total: 3,
              official: 3,
              safe: 3,
              avgTrust: 91,
              platformCounts: { shopee: 3 },
            },
            initialRadarPayload: liveRadar,
          })
        )
      )
    );
    assert.ok(dirHtml.includes('data-testid="merchant-verified-safe-filter"'));
    const badgeMatches =
      dirHtml.match(/data-testid="merchant-verified-safe-badge"/g) ?? [];
    assert.equal(
      badgeMatches.length,
      1,
      `${loc}: only the 1 verified-safe merchant should render Verified Safe badge`
    );
    assert.ok(
      dirHtml.includes('data-testid="merchant-verified-safe-breakdown"')
    );
    assert.equal(/180[-\s]*(?:day|ng[àa]y|dn[ií])/i.test(dirHtml), false);
    assert.equal(dirHtml.includes('\u2014'), false);
    assert.equal(dirHtml.includes('\u2013'), false);
    const dirVisibleText = dirHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    for (const banned of [
      'dosafe threat risk',
      'ai review risk',
      'dual risk',
      'jreviews',
      'kiểm toán',
      'audit profile',
      'seeding',
      'dosafe.threat_intel',
    ]) {
      assert.equal(
        dirVisibleText.includes(banned),
        false,
        `${loc}: visible text must not include "${banned}"`
      );
    }

    // Filtered view renders only verified-safe merchant
    const filteredHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(MerchantDirectoryExplorer, {
            initialPage: {
              items: [cleanMerchant, trapMerchant],
              matched: 2,
              offset: 0,
            },
            summary: {
              total: 2,
              official: 2,
              safe: 2,
              avgTrust: 91,
              platformCounts: { shopee: 2 },
            },
            initialRadarPayload: liveRadar,
            initialVerifiedSafeOnly: true,
          })
        )
      )
    );
    assert.equal(filteredHtml.includes('Verified Official Mall'), true);
    assert.equal(filteredHtml.includes('Trap Merchant'), false);

    // When page 1 has 0 verified-safe stores but more pages exist, render hint inside empty state
    const paginatedHintHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter as never },
        React.createElement(
          IntlProvider,
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(MerchantDirectoryExplorer, {
            initialPage: {
              items: [trapMerchant],
              matched: 5,
              offset: 0,
            },
            summary: {
              total: 5,
              official: 5,
              safe: 5,
              avgTrust: 90,
              platformCounts: { shopee: 5 },
            },
            initialRadarPayload: liveRadar,
            initialVerifiedSafeOnly: true,
          })
        )
      )
    );
    assert.ok(
      paginatedHintHtml.includes(
        (messages.merchants as Record<string, string>)
          .verifiedSafeMorePagesHint!.replace('{shown}', '1')
          .replace('{total}', '5')
      )
    );
  }

  // =========================================================================
  // 5. vi / en / cs key parity, placeholders, Czech plurals & zero em/en-dashes
  // =========================================================================
  for (const ns of ['watchlist', 'merchants'] as const) {
    const viNs = viMessages[ns] as Record<string, string>;
    const enNs = enMessages[ns] as Record<string, string>;
    const csNs = csMessages[ns] as Record<string, string>;
    const viKeys = Object.keys(viNs).sort();
    const enKeys = Object.keys(enNs).sort();
    const csKeys = Object.keys(csNs).sort();
    assert.deepEqual(viKeys, enKeys, `${ns}: vi/en keys must match`);
    assert.deepEqual(csKeys, enKeys, `${ns}: cs/en keys must match`);
    for (const key of enKeys) {
      const enPh = collectPlaceholders(enNs[key]!);
      assert.deepEqual(
        collectPlaceholders(viNs[key]!),
        enPh,
        `${ns}.${key}: vi placeholders must match en`
      );
      assert.deepEqual(
        collectPlaceholders(csNs[key]!),
        enPh,
        `${ns}.${key}: cs placeholders must match en`
      );
      for (const [locName, val] of [
        ['vi', viNs[key]!],
        ['en', enNs[key]!],
        ['cs', csNs[key]!],
      ] as const) {
        assert.equal(
          val.includes('\u2014') || val.includes('\u2013'),
          false,
          `${locName}.${ns}.${key} must not contain em/en-dash`
        );
      }
    }
  }

  // Czech pluralization check for comboStoresCount
  const csTranslator = createTranslator({ locale: 'cs', messages: csMessages });
  const enTranslator = createTranslator({ locale: 'en', messages: enMessages });
  assert.equal(
    csTranslator('watchlist.comboStoresCount' as never, { count: 1 } as never),
    '1 obchod'
  );
  assert.equal(
    csTranslator('watchlist.comboStoresCount' as never, { count: 3 } as never),
    '3 obchody'
  );
  assert.equal(
    csTranslator('watchlist.comboStoresCount' as never, { count: 5 } as never),
    '5 obchodů'
  );
  assert.equal(
    enTranslator('watchlist.comboStoresCount' as never, { count: 1 } as never),
    '1 store'
  );
  assert.equal(
    enTranslator('watchlist.comboStoresCount' as never, { count: 3 } as never),
    '3 stores'
  );

  // Client message scope check: shared bundle must NOT include combo* strings
  const sharedPicks = pickClientMessages(enMessages);
  const sharedWatchlistKeys = Object.keys(
    (sharedPicks.watchlist as Record<string, unknown>) ?? {}
  );
  assert.equal(
    sharedWatchlistKeys.some((k) => k.startsWith('combo')),
    false
  );

  // Source hygiene: zero em/en-dash across all changed files, and zero unbacked window claims in UI/lib & locales
  const runtimeFiles = [
    'src/components/watchlist/WatchlistComboOptimizer.tsx',
    'src/components/watchlist/WatchlistWorkspace.tsx',
    'src/components/merchants/MerchantDirectoryExplorer.tsx',
    'src/lib/merchant-trust-badge.ts',
  ];
  for (const rel of [
    ...runtimeFiles,
    'src/lib/__tests__/watchlist-combo-ui.test.ts',
  ]) {
    const content = readFileSync(path.join(webRoot, rel), 'utf8');
    assert.equal(
      content.includes('\u2014') || content.includes('\u2013'),
      false,
      `${rel} must not contain em-dash or en-dash`
    );
    if (runtimeFiles.includes(rel)) {
      assert.equal(
        /180[-\s]*(?:day|ng[àa]y|dn[ií])/i.test(content),
        false,
        `${rel} must not reference unbacked historical window claims`
      );
    }
  }
  for (const [locName, cat] of Object.entries(localeCatalogs)) {
    for (const ns of ['watchlist', 'merchants'] as const) {
      const serialized = JSON.stringify(cat[ns]);
      assert.equal(
        /180[-\s]*(?:day|ng[àa]y|dn[ií])/i.test(serialized),
        false,
        `${locName}.${ns} must not reference unbacked historical window claims`
      );
    }
  }

  console.warn('✅ All F8 combo cart UI & verified safe merchant tests passed');
}

main();
