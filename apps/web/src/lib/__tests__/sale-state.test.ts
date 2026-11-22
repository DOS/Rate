import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import {
  SALE_STATES,
  listingCountForSaleState,
  masterSaleState,
  saleStateLabelKey,
  saleStateOfMaster,
} from '../sale-state';
import {
  countSeasonalSaleCampaignDeals,
  evaluateOmnibusPriceAudit,
  matchesSeasonalSaleFilter,
} from '../omnibus-price-audit';
import { pickClientMessages } from '../client-messages';
import { parseEcommerceUrlOrQuery } from '../rate-domain';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import PriceHistorySection from '../../components/price-history/PriceHistorySection';
import DealFinderWorkspace from '../../components/deals/DealFinderWorkspace';
import DeepInspectWorkspace from '../../components/inspect/DeepInspectWorkspace';

function main() {
  console.warn('🧪 Sale state suite (DOS/Rate#1188)');

  // An in-stock price wins over everything else.
  assert.equal(
    masterSaleState({
      minPrice: 20_990_000,
      listingCount: 3,
      metadata: { vn_sale_state: 'discontinued' },
      availabilityStatus: 'Discontinued',
    }),
    'on_sale'
  );

  // No in-stock price: the curated state, then sold out, then the launch
  // status, then not listed (known) or no stock (unknown).
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 2,
      metadata: { vn_sale_state: 'discontinued' },
    }),
    'discontinued'
  );
  assert.equal(
    masterSaleState({
      minPrice: null,
      listingCount: 0,
      metadata: { vn_sale_state: 'coming_soon' },
      availabilityStatus: 'Available. Released 2026, September 23',
    }),
    'coming_soon'
  );
  // An unknown curated value is ignored.
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 2,
      metadata: { vn_sale_state: 'on_sale' },
    }),
    'sold_out'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Discontinued',
    }),
    'discontinued'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Coming soon. Exp. release 2026, Q4',
    }),
    'coming_soon'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Available. Released 2025, October',
    }),
    'not_listed'
  );
  assert.equal(masterSaleState({ minPrice: 0 }), 'no_stock');

  // Free-text "Announced" is not a launch to come.
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Announced 2024, available',
    }),
    'not_listed'
  );
  // An in-stock listing outside the stored price leaves the count unknown,
  // so the page never says "sold out" above an in-stock offer.
  assert.equal(listingCountForSaleState(2, 1), undefined);
  assert.equal(listingCountForSaleState(2, 0), 2);
  assert.equal(
    saleStateOfMaster({ min_price: null }, listingCountForSaleState(2, 1)),
    'no_stock'
  );
  assert.equal(
    saleStateOfMaster({ min_price: null }, listingCountForSaleState(2, 0)),
    'sold_out'
  );
  // A master row has no count of sold-out listings.
  assert.equal(saleStateOfMaster({ min_price: 0 }), 'no_stock');
  assert.equal(saleStateOfMaster({ min_price: 9_990_000 }), 'on_sale');
  assert.equal(
    saleStateOfMaster({
      min_price: null,
      specifications: { availability: { status: 'Discontinued' } },
    }),
    'discontinued'
  );

  // Every state but on_sale has a label and a hint in every locale.
  for (const locale of ['vi', 'en', 'cs']) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../../locales/${locale}.json`, import.meta.url),
        'utf8'
      )
    ) as { saleState: Record<string, string> };
    for (const state of SALE_STATES) {
      if (state === 'on_sale') continue;
      const key = saleStateLabelKey(state);
      assert.ok(messages.saleState[key], `${locale} ${key}`);
      assert.ok(messages.saleState[`${key}Hint`], `${locale} ${key}Hint`);
    }
  }

  // =========================================================================
  // 90-Day Buy-vs-Wait Percentile, Plausibility/Availability & SSR (#1863)
  // =========================================================================
  const DAY_MS = 86_400_000;
  const ANCHOR_MS = Date.UTC(2026, 10, 22, 12, 0, 0);
  const isoDaysAgo = (days: number) =>
    new Date(ANCHOR_MS - days * DAY_MS).toISOString();

  // 1. <= P15 buy_now_floor: 1 dip day at 23.99M vs 9 days at 27.99M..28.99M
  const buyNowAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 28_990_000, recorded_at: isoDaysAgo(80) },
      { product_id: 'o1', price: 28_490_000, recorded_at: isoDaysAgo(70) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(60) },
      { product_id: 'o1', price: 28_290_000, recorded_at: isoDaysAgo(50) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(40) },
      { product_id: 'o1', price: 28_190_000, recorded_at: isoDaysAgo(30) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(20) },
      { product_id: 'o1', price: 27_890_000, recorded_at: isoDaysAgo(12) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(5) },
      { product_id: 'o1', price: 23_990_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 23_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(buyNowAudit.cycle90d.signal, 'buy_now_floor');
  assert.equal(buyNowAudit.cycle90d.percentile, 5);
  assert.equal(buyNowAudit.cycle90d.low90dVnd, 23_990_000);

  // 2. Flat 90d price -> P50 fair_market (never falsely buy_now_floor or wait)
  const flat90dAudit = evaluateOmnibusPriceAudit({
    points: [0, 7, 14, 21, 28, 35].map((d) => ({
      product_id: 'o1',
      price: 25_000_000,
      recorded_at: isoDaysAgo(d),
    })),
    currentPriceVnd: 25_000_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(flat90dAudit.cycle90d.signal, 'fair_market');
  assert.equal(flat90dAudit.cycle90d.percentile, 50);

  // 3. > P70 above_recent_floor: exact VND gap above 90d low
  const waitAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 24_000_000, recorded_at: isoDaysAgo(45) },
      { product_id: 'o1', price: 24_500_000, recorded_at: isoDaysAgo(36) },
      { product_id: 'o1', price: 25_000_000, recorded_at: isoDaysAgo(27) },
      { product_id: 'o1', price: 25_500_000, recorded_at: isoDaysAgo(18) },
      { product_id: 'o1', price: 26_000_000, recorded_at: isoDaysAgo(9) },
      { product_id: 'o1', price: 27_500_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 27_500_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(waitAudit.cycle90d.signal, 'above_recent_floor');
  assert.ok((waitAudit.cycle90d.percentile ?? 0) > 70);
  assert.equal(waitAudit.cycle90d.aboveFloorVnd, 3_500_000);

  // 4. Sufficiency guards: < 5 days, < 14d span, and same-day burst crawls
  const fourDaysOnly = evaluateOmnibusPriceAudit({
    points: [0, 7, 14, 30].map((d) => ({
      product_id: 'o1',
      price: 25_000_000 + d * 100_000,
      recorded_at: isoDaysAgo(d),
    })),
    currentPriceVnd: 25_000_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(fourDaysOnly.cycle90d.signal, 'insufficient_data');
  assert.equal(fourDaysOnly.cycle90d.observedPointDays, 4);

  const burstSameDay = evaluateOmnibusPriceAudit({
    points: [
      ...Array.from({ length: 15 }, (_, idx) => ({
        product_id: 'o1',
        price: 25_000_000,
        recorded_at: new Date(ANCHOR_MS - idx * 60_000).toISOString(),
      })),
      { product_id: 'o1', price: 26_000_000, recorded_at: isoDaysAgo(10) },
      { product_id: 'o1', price: 26_500_000, recorded_at: isoDaysAgo(20) },
    ],
    currentPriceVnd: 25_000_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(burstSameDay.cycle90d.signal, 'insufficient_data');
  assert.equal(burstSameDay.cycle90d.observedPointDays, 3);

  // 5. Bait-price, unavailable (out_of_stock / discontinued), and live_listing exclusions
  const baitAndSoldOutAudit = evaluateOmnibusPriceAudit({
    points: [
      // Bait offer at 1.25M (< 40% of 26M..27M median)
      ...[0, 7, 14, 21, 28, 35].map((d) => ({
        product_id: 'offer-bait',
        price: 1_250_000,
        recorded_at: isoDaysAgo(d),
      })),
      // Out-of-stock offer at 18M
      ...[0, 7, 14, 21, 28, 35].map((d) => ({
        product_id: 'offer-soldout',
        price: 18_000_000,
        recorded_at: isoDaysAgo(d),
      })),
      // Valid in-stock peers at 26M..27M
      ...[0, 7, 14, 21, 28, 35].map((d) => ({
        product_id: 'offer-good-a',
        price: 26_000_000 + (d > 0 ? 500_000 : 0),
        recorded_at: isoDaysAgo(d),
      })),
      ...[0, 7, 14, 21, 28, 35].map((d) => ({
        product_id: 'offer-good-b',
        price: 27_000_000,
        recorded_at: isoDaysAgo(d),
      })),
      // Synthetic fallback row must be ignored
      {
        product_id: 'offer-good-a',
        price: 19_000_000,
        recorded_at: isoDaysAgo(15),
        source: 'live_listing',
      },
    ],
    currentPriceVnd: 26_000_000,
    mode: 'market',
    referenceOffers: [
      { id: 'offer-bait', price_current: 1_250_000, availability: 'in_stock' },
      {
        id: 'offer-soldout',
        price_current: 18_000_000,
        availability: 'out_of_stock',
      },
      {
        id: 'offer-good-a',
        price_current: 26_000_000,
        availability: 'in_stock',
      },
      {
        id: 'offer-good-b',
        price_current: 27_000_000,
        availability: 'in_stock',
      },
    ],
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(baitAndSoldOutAudit.priorFloorPriceVnd, 26_500_000);
  assert.equal(baitAndSoldOutAudit.cycle90d.low90dVnd, 26_000_000);
  assert.equal(baitAndSoldOutAudit.cycle90d.signal, 'buy_now_floor');

  // Out-of-stock current product suppresses Buy-Now signal
  const soldOutProductCycle = evaluateOmnibusPriceAudit({
    points: [0, 7, 14, 21, 28, 35].map((d) => ({
      product_id: 'offer-good-a',
      price: 26_000_000,
      recorded_at: isoDaysAgo(d),
    })),
    currentPriceVnd: 26_000_000,
    currentInStockPriceVnd: null,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(soldOutProductCycle.cycle90d.signal, 'insufficient_data');

  // Micro-spread (< 1%) stays fair_market rather than Wait/Buy-Now on +1,000 VND
  const microSpread90d = evaluateOmnibusPriceAudit({
    points: [7, 14, 21, 28, 35].map((d) => ({
      product_id: 'offer-good-a',
      price: 25_000_000,
      recorded_at: isoDaysAgo(d),
    })),
    currentPriceVnd: 25_001_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(microSpread90d.cycle90d.signal, 'fair_market');

  // Live price drop below historical low clamps low90dVnd to live price
  const liveDropBelowHist = evaluateOmnibusPriceAudit({
    points: [2, 9, 16, 23, 30].map((d) => ({
      product_id: 'offer-good-a',
      price: 26_000_000 + d * 50_000,
      recorded_at: isoDaysAgo(d),
    })),
    currentPriceVnd: 24_500_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(liveDropBelowHist.cycle90d.low90dVnd, 24_500_000);
  assert.equal(liveDropBelowHist.cycle90d.signal, 'buy_now_floor');

  // 6. Seasonal campaign filter helper & SSR rendering across vi, en, cs
  const mockGenuineSig = {
    verdict: 'genuine_deal' as const,
    savingsPct: 12.5,
    fakeMarkupPct: 0,
    spreadPct: 14,
    genuineDeal: {
      id: 'g1',
      verdict: 'genuine_all_time_low' as const,
      verdictBadgeVi: 'Đáy giá',
      productSlug: 'phone-a',
      productName: 'Phone A',
      brand: 'Apple',
      categorySlug: 'smartphones' as const,
      productHref: '/smartphones/phone-a',
      imageUrl: null,
      platform: 'shopee',
      merchantId: 'm1',
      merchantName: 'Shop A',
      isOfficialMall: true,
      merchantRiskScore: 4,
      offerUrl: 'https://shopee.vn/a',
      priceCurrent: 24_000_000,
      priceOriginal: null,
      marketMedianPrice: 27_400_000,
      marketMinPrice: 24_000_000,
      marketMaxPrice: 28_000_000,
      savingsVsMedianVnd: 3_400_000,
      savingsVsMedianPct: 12.5,
      marketOfferCount: 3,
      claimedDiscountPct: 0,
      fakeMarkupPct: 0,
      jreviewsScore10: 8.8,
      explanationVi: 'Tốt',
    },
    fakeSaleTrap: null,
    priceSpread: null,
  };
  const mockTrapSig = {
    verdict: 'fake_sale_trap' as const,
    savingsPct: 0,
    fakeMarkupPct: 26.4,
    spreadPct: 0,
    genuineDeal: null,
    fakeSaleTrap: {
      ...mockGenuineSig.genuineDeal,
      id: 't1',
      verdict: 'inflated_fake_sale' as const,
      productSlug: 'phone-b',
      productName: 'Phone B',
      priceCurrent: 27_400_000,
      priceOriginal: 34_630_000,
      savingsVsMedianVnd: 0,
      savingsVsMedianPct: 0,
      claimedDiscountPct: 20.9,
      fakeMarkupPct: 26.4,
    },
    priceSpread: null,
  };
  assert.equal(
    matchesSeasonalSaleFilter(mockGenuineSig, 'genuine_sale_drops'),
    true
  );
  assert.equal(
    matchesSeasonalSaleFilter(mockGenuineSig, 'inflated_presale_warnings'),
    false
  );
  assert.equal(
    matchesSeasonalSaleFilter(mockTrapSig, 'inflated_presale_warnings'),
    true
  );
  assert.equal(
    matchesSeasonalSaleFilter(
      {
        ...mockTrapSig,
        fakeSaleTrap: {
          ...mockTrapSig.fakeSaleTrap,
          priceOriginal: 20_000_000,
        },
      },
      'inflated_presale_warnings'
    ),
    false
  );
  assert.equal(
    matchesSeasonalSaleFilter(
      {
        ...mockGenuineSig,
        genuineDeal: {
          ...mockGenuineSig.genuineDeal,
          savingsVsMedianVnd: 0,
        },
      },
      'genuine_sale_drops'
    ),
    false
  );
  assert.deepEqual(
    countSeasonalSaleCampaignDeals(
      [{ slug: 'phone-a' }, { slug: 'phone-b' }, { slug: 'phone-c' }],
      (slug) =>
        slug === 'phone-a'
          ? mockGenuineSig
          : slug === 'phone-b'
            ? mockTrapSig
            : null
    ),
    { genuineSaleCount: 1, inflatedWarningCount: 1 }
  );

  const IntlProvider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const rawCatalog = JSON.parse(
      readFileSync(
        new URL(`../../../locales/${locale}.json`, import.meta.url),
        'utf8'
      )
    ) as Record<string, unknown>;

    const historyHtml = renderToStaticMarkup(
      React.createElement(
        IntlProvider,
        {
          locale,
          messages: pickClientMessages(rawCatalog, 'productDetail'),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(PriceHistorySection, {
          productName: 'iPhone 16 Pro Max',
          history: {
            points: [0, 7, 14, 21, 28, 35].map((d, idx) => ({
              id: idx + 1,
              product_id: 'offer-1',
              merchant_name: 'Apple Flagship Store',
              platform: 'shopee',
              is_official: true,
              price: d === 0 ? 27_190_000 : 27_490_000,
              price_original: 34_990_000,
              recorded_at: isoDaysAgo(d),
              source: 'crawler',
            })),
            byOffer: {
              'offer-1': {
                product_id: 'offer-1',
                merchant_name: 'Apple Flagship Store',
                platform: 'shopee',
                price_current: 27_190_000,
                price_original: 34_990_000,
                claimed_discount_pct: 22.3,
                real_discount_vs_median_pct: 1.1,
                historical_min_price: 27_190_000,
                historical_max_price: 27_490_000,
                historical_median_price: 27_490_000,
                observation_count: 6,
                verdict: 'genuine_deal',
                badge_label: 'Deal',
                explanation: 'Deal',
              },
            },
            lowestEverPrice: 27_190_000,
            lowestEverDate: isoDaysAgo(0),
            lowestEverMerchant: 'Apple Flagship Store',
            highestEverPrice: 27_490_000,
            currentMinPrice: 27_190_000,
            fakeDiscountCount: 0,
            genuineDealCount: 1,
          },
        })
      )
    );
    assert.ok(
      historyHtml.includes('data-testid="omnibus-price-audit-card"'),
      `${locale}: PriceHistorySection renders omnibus card`
    );
    assert.ok(
      historyHtml.includes('data-testid="omnibus-cycle-signal"'),
      `${locale}: PriceHistorySection renders 90d cycle signal`
    );

    const dealsHtml = renderToStaticMarkup(
      React.createElement(
        IntlProvider,
        {
          locale,
          messages: pickClientMessages(rawCatalog, 'deals'),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(DealFinderWorkspace, {
          products: [
            {
              id: 'p1',
              slug: 'phone-a',
              name: 'Phone A',
              brand: 'Apple',
              model: 'Phone A',
              model_key: 'apple_phone_a',
              min_price: 24_000_000,
              max_price: 28_000_000,
              merchant_count: 3,
              user_rating_weighted: 4.7,
              authentic_review_count: 10,
              total_reviews: 10,
              status: 'published',
              metadata: { category_slug: 'smartphones' },
            } as never,
          ],
          dealRadar: {
            generatedAt: isoDaysAgo(0),
            categoryFilter: 'all',
            totalClustersAnalyzed: 1,
            totalOffersAnalyzed: 3,
            totalMerchantsAnalyzed: 3,
            genuineDeals: [mockGenuineSig.genuineDeal],
            fakeSaleTraps: [mockTrapSig.fakeSaleTrap],
            priceSpreadLeaders: [],
          },
        })
      )
    );
    assert.ok(
      dealsHtml.includes('data-testid="deals-seasonal-campaign-filter"'),
      `${locale}: DealFinderWorkspace renders seasonal campaign filter`
    );

    const mockRouter: AppRouterInstance = {
      back: () => {},
      forward: () => {},
      refresh: () => {},
      push: () => {},
      replace: () => {},
      prefetch: () => {},
      bfcacheId: 'test',
    };

    const inspectValidHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(rawCatalog, 'inspect'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(DeepInspectWorkspace, {
            initialQuery: 'https://shopee.vn/item-1',
            initialInspection: {
              query: 'https://shopee.vn/item-1',
              matchedType: 'product_listing',
              parsedUrl: parseEcommerceUrlOrQuery('https://shopee.vn/item-1'),
              masterProduct: {
                id: 'mp-1',
                slug: 'iphone-16-pro-max-256gb',
                name: 'iPhone 16 Pro Max 256GB',
                brand: 'Apple',
                model: 'iPhone 16 Pro Max',
                model_key: 'apple_iphone_16_pro_max_256gb',
                min_price: 27_190_000,
                max_price: 28_990_000,
                merchant_count: 2,
                status: 'published',
              } as never,
              matchedOffer: {
                id: 'offer-1',
                platform: 'shopee',
                title: 'iPhone 16 Pro Max 256GB VN/A',
                price_current: 27_190_000,
                price_original: 34_990_000,
                stock: 5,
                rating_star: 4.9,
                rating_count: 20,
                url: 'https://shopee.vn/item-1',
                availability: 'in_stock',
                merchant: {
                  id: 'm-1',
                  name: 'Apple Flagship Store',
                  platform: 'shopee',
                  is_official: true,
                  rating_star: 4.9,
                  follower_count: 1000,
                  location: 'VN',
                  risk_score: 4,
                  dosafe_risk_score: 4,
                  review_risk_score: 4,
                  review_risk_breakdown: null,
                },
              },
              allOffers: [],
              discountAnalysis: null,
              priceHistory: {
                points: [0, 7, 14, 21, 28, 35].map((d, idx) => ({
                  id: idx + 1,
                  product_id: 'offer-1',
                  merchant_name: 'Apple Flagship Store',
                  platform: 'shopee',
                  is_official: true,
                  price: d === 0 ? 27_190_000 : 27_490_000,
                  price_original: 34_990_000,
                  recorded_at: isoDaysAgo(d),
                  source: 'crawler',
                })),
                byOffer: {},
                lowestEverPrice: 27_190_000,
                lowestEverDate: isoDaysAgo(0),
                lowestEverMerchant: 'Apple Flagship Store',
                highestEverPrice: 27_490_000,
                currentMinPrice: 27_190_000,
                fakeDiscountCount: 0,
                genuineDealCount: 1,
              },
              reviewSummary: null,
              merchantProfile: null,
              suggestions: [],
            },
          })
        )
      )
    );
    assert.ok(
      inspectValidHtml.includes('data-testid="inspect-omnibus-audit-card"'),
      `${locale}: DeepInspectWorkspace renders Omnibus audit card on valid in-stock listing`
    );

    const inspectBaitHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(rawCatalog, 'inspect'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(DeepInspectWorkspace, {
            initialQuery: 'https://shopee.vn/bait',
            initialInspection: {
              query: 'https://shopee.vn/bait',
              matchedType: 'product_listing',
              parsedUrl: parseEcommerceUrlOrQuery('https://shopee.vn/bait'),
              masterProduct: {
                id: 'mp-1',
                slug: 'iphone-16-pro-max-256gb',
                name: 'iPhone 16 Pro Max 256GB',
                brand: 'Apple',
                model: 'iPhone 16 Pro Max',
                model_key: 'apple_iphone_16_pro_max_256gb',
                min_price: 27_190_000,
                max_price: 28_990_000,
                merchant_count: 2,
                status: 'published',
              } as never,
              matchedOffer: {
                id: 'offer-bait',
                platform: 'shopee',
                title: 'Ốp lưng iPhone 16',
                price_current: 50_000,
                price_original: 25_000_000,
                stock: 5,
                rating_star: 4.9,
                rating_count: 20,
                url: 'https://shopee.vn/bait',
                availability: 'in_stock',
                merchant: {
                  id: 'm-bait',
                  name: 'Bait Shop',
                  platform: 'shopee',
                  is_official: false,
                  rating_star: 4.0,
                  follower_count: 10,
                  location: 'VN',
                  risk_score: 60,
                  dosafe_risk_score: 60,
                  review_risk_score: 60,
                  review_risk_breakdown: null,
                },
              },
              allOffers: [],
              discountAnalysis: null,
              priceHistory: {
                points: [0, 10, 20, 32].map((d, idx) => ({
                  id: idx + 1,
                  product_id: 'offer-1',
                  merchant_name: 'Shop',
                  platform: 'shopee',
                  is_official: true,
                  price: 27_190_000,
                  price_original: null,
                  recorded_at: isoDaysAgo(d),
                  source: 'crawler',
                })),
                byOffer: {},
                lowestEverPrice: 27_190_000,
                lowestEverDate: isoDaysAgo(0),
                lowestEverMerchant: 'Shop',
                highestEverPrice: 27_190_000,
                currentMinPrice: 27_190_000,
                fakeDiscountCount: 0,
                genuineDealCount: 0,
              },
              reviewSummary: null,
              merchantProfile: null,
              suggestions: [],
            },
          })
        )
      )
    );
    assert.equal(
      inspectBaitHtml.includes('data-testid="inspect-omnibus-audit-card"'),
      false,
      `${locale}: DeepInspectWorkspace suppresses Omnibus audit card on bait listing`
    );

    // Overpriced listing with 0 own history points naast cheaper peer:
    // - Never falsely gets green "buy now" (gets Wait signal for 31.99M vs 26.99M)
    // - Never falsely accuses 0-day shop of 30d EU Omnibus violation
    // - Marks Vietnamese shop name with lang="vi" on en/cs pages (WCAG 3.1.2)
    const inspectOverpricedNewShopHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(rawCatalog, 'inspect'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(DeepInspectWorkspace, {
            initialQuery: 'https://shopee.vn/new-shop',
            initialInspection: {
              query: 'https://shopee.vn/new-shop',
              matchedType: 'product_listing',
              parsedUrl: parseEcommerceUrlOrQuery('https://shopee.vn/new-shop'),
              masterProduct: {
                id: 'mp-1',
                slug: 'iphone-16-pro-max-256gb',
                name: 'iPhone 16 Pro Max 256GB',
                brand: 'Apple',
                model: 'iPhone 16 Pro Max',
                model_key: 'apple_iphone_16_pro_max_256gb',
                min_price: 26_990_000,
                max_price: 31_990_000,
                merchant_count: 2,
                status: 'published',
              } as never,
              matchedOffer: {
                id: 'offer-new-expensive',
                platform: 'shopee',
                title: 'iPhone 16 Pro Max 256GB VN/A',
                price_current: 31_990_000,
                price_original: 34_990_000,
                stock: 3,
                rating_star: 4.8,
                rating_count: 5,
                url: 'https://shopee.vn/new-shop',
                availability: 'in_stock',
                merchant: {
                  id: 'm-vn',
                  name: 'Cửa Hàng Điện Thoại Hà Nội',
                  platform: 'shopee',
                  is_official: false,
                  rating_star: 4.8,
                  follower_count: 500,
                  location: 'VN',
                  risk_score: 12,
                  dosafe_risk_score: 12,
                  review_risk_score: 12,
                  review_risk_breakdown: null,
                },
              },
              allOffers: [
                {
                  id: 'offer-cheap-peer',
                  platform: 'tiki',
                  title: 'iPhone 16 Pro Max 256GB',
                  price_current: 26_990_000,
                  price_original: null,
                  stock: 10,
                  rating_star: 4.9,
                  rating_count: 40,
                  url: 'https://tiki.vn/peer',
                  availability: 'in_stock',
                  merchant: {
                    id: 'm-peer',
                    name: 'Tiki Trading',
                    platform: 'tiki',
                    is_official: true,
                    rating_star: 4.9,
                    follower_count: 50000,
                    location: 'VN',
                    risk_score: 2,
                    dosafe_risk_score: 2,
                    review_risk_score: 2,
                    review_risk_breakdown: null,
                  },
                },
                {
                  id: 'offer-new-expensive',
                  platform: 'shopee',
                  title: 'iPhone 16 Pro Max 256GB VN/A',
                  price_current: 31_990_000,
                  price_original: 34_990_000,
                  stock: 3,
                  rating_star: 4.8,
                  rating_count: 5,
                  url: 'https://shopee.vn/new-shop',
                  availability: 'in_stock',
                  merchant: {
                    id: 'm-vn',
                    name: 'Cửa Hàng Điện Thoại Hà Nội',
                    platform: 'shopee',
                    is_official: false,
                    rating_star: 4.8,
                    follower_count: 500,
                    location: 'VN',
                    risk_score: 12,
                    dosafe_risk_score: 12,
                    review_risk_score: 12,
                    review_risk_breakdown: null,
                  },
                },
              ],
              discountAnalysis: null,
              priceHistory: {
                points: [0, 7, 14, 21, 28, 35].map((d, idx) => ({
                  id: idx + 1,
                  product_id: 'offer-cheap-peer',
                  merchant_name: 'Tiki Trading',
                  platform: 'tiki',
                  is_official: true,
                  price: 26_990_000 + (d > 0 ? 500_000 : 0),
                  price_original: null,
                  recorded_at: isoDaysAgo(d),
                  source: 'crawler',
                })),
                byOffer: {},
                lowestEverPrice: 26_990_000,
                lowestEverDate: isoDaysAgo(0),
                lowestEverMerchant: 'Tiki Trading',
                highestEverPrice: 27_490_000,
                currentMinPrice: 26_990_000,
                fakeDiscountCount: 0,
                genuineDealCount: 1,
              },
              reviewSummary: null,
              merchantProfile: null,
              suggestions: [],
            },
          })
        )
      )
    );
    const pvDict = (rawCatalog as { priceVerdict: Record<string, string> })
      .priceVerdict;
    assert.ok(
      inspectOverpricedNewShopHtml.includes(pvDict.oPend!) &&
        inspectOverpricedNewShopHtml.includes(pvDict.oNeed!) &&
        !inspectOverpricedNewShopHtml.includes(pvDict.oOk!),
      `${locale}: 0-history matchedOffer shows insufficient history, not competitor 30d floor`
    );
    assert.ok(
      inspectOverpricedNewShopHtml.includes(
        'data-testid="inspect-omnibus-cycle-signal" class="fw-bold mb-1 text-danger"'
      ),
      `${locale}: overpriced 31.99M listing renders danger Wait signal, never green Buy-Now`
    );
    if (locale !== 'vi') {
      assert.ok(
        inspectOverpricedNewShopHtml.includes(
          '<span lang="vi">Cửa Hàng Điện Thoại Hà Nội</span>'
        ),
        `${locale}: Vietnamese seller name in omnibusScopeListing carries lang="vi"`
      );
    }
  }

  console.warn('✅ Sale state suite passed');
}

main();
