import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import {
  hasImplausiblyLowOfferId,
  implausiblyLowIndexes,
  implausiblyLowOfferIds,
  isImplausiblyLowPrice,
  isOfferImplausiblyLowAgainstInStock,
  normalizeOfferId,
  plausibleMinPrice,
  plausibleOffers,
} from '@repo/shared-data/rules';

async function main() {
  console.warn('🧪 Offer plausibility suite');

  // The live Galaxy Buds3 Pro case: 723,269 against 3.0-3.7 M (DOS/Rate#797).
  const buds = [
    { id: 'lazada', price_current: 723269 },
    { id: 'fpt', price_current: 3032000 },
    { id: 'tgdd', price_current: 3140000 },
    { id: 'cps', price_current: 3690000 },
  ];
  assert.deepEqual([...implausiblyLowOfferIds(buds)], ['lazada']);
  assert.deepEqual(
    plausibleOffers(buds).map((o) => o.id),
    ['fpt', 'tgdd', 'cps']
  );
  assert.equal(plausibleMinPrice(723269, buds), 3032000);

  // A real discount (60% of the others) is kept.
  assert.equal(implausiblyLowIndexes([600, 1000, 1000, 1000]).size, 0);
  // Exactly at the 40% line is kept; below it is flagged.
  assert.equal(implausiblyLowIndexes([400, 1000, 1000]).size, 0);
  assert.deepEqual([...implausiblyLowIndexes([399, 1000, 1000])], [0]);

  // Two offers are too few to call either an outlier.
  assert.equal(implausiblyLowIndexes([100, 1000]).size, 0);
  assert.equal(
    plausibleMinPrice(100, [{ price_current: 100 }, { price_current: 1000 }]),
    100
  );

  // Unpriced offers are ignored, never flagged, and do not count.
  assert.equal(implausiblyLowIndexes([0, NaN, 100, 1000]).size, 0);
  assert.equal(implausiblyLowIndexes([0, 100, 1000, 1000]).size, 1);

  // One overpriced listing does not hide a real deal (lower median of others).
  assert.equal(implausiblyLowIndexes([1500, 3000, 9000]).size, 0);
  assert.equal(implausiblyLowIndexes([1300, 3000, 3200, 9000, 9500]).size, 0);
  // Two bait listings among four are both flagged.
  assert.deepEqual(
    [...implausiblyLowIndexes([700, 750, 3000, 3100])].sort(),
    [0, 1]
  );
  // Order of the input does not matter.
  assert.deepEqual([...implausiblyLowIndexes([3100, 700, 3000])], [1]);
  // Large lists stay fast (sorted once).
  const many = Array.from({ length: 5000 }, (_, i) => 1_000_000 + i);
  many.push(100_000);
  const started = Date.now();
  assert.deepEqual([...implausiblyLowIndexes(many)], [5000]);
  assert.ok(Date.now() - started < 200, 'implausiblyLowIndexes is O(n log n)');

  // With three offers, two equal low prices are the market, not bait.
  assert.equal(implausiblyLowIndexes([700, 700, 3000]).size, 0);

  // A price seen outside the list (a shopper's page) against plausible offers.
  const market = [
    { price_current: 3032000 },
    { price_current: 3140000 },
    { price_current: 3690000 },
  ];
  assert.equal(isImplausiblyLowPrice(723269, market), true);
  assert.equal(isImplausiblyLowPrice(2900000, market), false);
  assert.equal(isImplausiblyLowPrice(0, market), false);
  assert.equal(isImplausiblyLowPrice(100, [{ price_current: 3000 }]), false);

  // A listing judged against the others, as the table judges its row, gets
  // the table's answer: the "from" price 1171 is plausible, 993 is not.
  const tiered = [623, 993, 1171, 2794, 3169, 3328, 3629].map((p) => ({
    id: String(p),
    price_current: p,
  }));
  const tieredFlagged = implausiblyLowOfferIds(tiered);
  for (const offer of tiered) {
    const others = tiered.filter((o) => o.id !== offer.id);
    assert.equal(
      isImplausiblyLowPrice(offer.price_current, others),
      tieredFlagged.has(offer.id),
      'listing ' + offer.id
    );
  }
  assert.equal(plausibleMinPrice(623, tiered), 1171);

  // No priced offers: the stored minimum stands.
  assert.equal(plausibleMinPrice(5000, []), 5000);
  assert.equal(plausibleMinPrice(5000, [{ price_current: 0 }]), 5000);

  // DOS/Rate#850: Overflowed >1B VND prices are ignored and invalid storedMinPrice falls back to 0.
  assert.equal(
    implausiblyLowIndexes([20_000_000, 22_000_000, 9_000_000_000]).size,
    0,
    'Overflowed >1B VND price must be ignored and not pull median up (#850)'
  );
  assert.equal(plausibleMinPrice(Number.NaN, []), 0);
  assert.equal(plausibleMinPrice(-5000, []), 0);
  assert.equal(plausibleMinPrice(5_000_000_000, []), 0);

  // DOS/Rate#1697: canonical offer IDs + sold-out 500,000 VND bait exclusion.
  assert.equal(normalizeOfferId('  bait-offer\u0000\n '), 'bait-offer');
  assert.equal(normalizeOfferId('shopee:88201.991'), 'shopee:88201.991');
  assert.equal(normalizeOfferId('000'), '');
  assert.equal(normalizeOfferId('..bad..'), '');
  const inStockCluster = [
    { id: '  padded-bait\u0000 ', price_current: 500_000 },
    { id: 'shopee:88201.991', price_current: 550_000 },
    { id: 'fpt', price_current: 3_032_000 },
    { id: 'tgdd', price_current: 3_140_000 },
    { id: 'cps', price_current: 3_690_000 },
  ];
  const clusterBaitIds = implausiblyLowOfferIds(inStockCluster);
  assert.equal(
    hasImplausiblyLowOfferId(clusterBaitIds, '  padded-bait\u0000 '),
    true
  );
  assert.equal(
    hasImplausiblyLowOfferId(clusterBaitIds, 'shopee:88201.991'),
    true
  );
  assert.equal(
    isOfferImplausiblyLowAgainstInStock(
      {
        id: 'sold-out-500k',
        price_current: 500_000,
        availability: 'out_of_stock',
      },
      inStockCluster,
      clusterBaitIds
    ),
    true
  );

  const supaUrlEnvKey = ['NEXT_PUBLIC_SUPABASE', 'URL'].join('_');
  const supaAnonEnvKey = ['NEXT_PUBLIC_SUPABASE', 'ANON', 'KEY'].join('_');
  process.env[supaUrlEnvKey] =
    process.env[supaUrlEnvKey] || 'https://stub.supabase.test';
  process.env[supaAnonEnvKey] =
    process.env[supaAnonEnvKey] || 'stub-public-token';

  const { getMasterProductPriceHistory, selectOfferForUrlInspection } =
    await import('../rate-api');
  const ProductOffersExplorerMod =
    await import('../../components/leaderboard/ProductOffersExplorer');
  const { evaluateExtensionPriceVerdict, lookupExtensionProduct } =
    await import('../../server/rate/extension');

  const mkOffer = (
    id: string,
    merchantId: string,
    price: number,
    availability:
      'in_stock' | 'out_of_stock' | 'discontinued' | null = 'in_stock'
  ) => ({
    id,
    platform: 'shopee',
    title: `Listing ${id}`,
    price_current: price,
    price_original: null,
    stock: availability === 'in_stock' ? 5 : 0,
    rating_star: 4.9,
    rating_count: 10,
    url: `https://shopee.vn/product-i.1697.${id.trim()}`,
    availability,
    merchant: {
      id: merchantId,
      name: `Shop ${merchantId}`,
      platform: 'shopee',
      is_official: true,
      rating_star: 4.9,
      follower_count: 100,
      location: 'VN',
      risk_score: 5,
      dosafe_risk_score: 5,
      review_risk_score: 5,
      review_risk_breakdown: null,
    },
  });

  const offersWithSoldOutBait = [
    mkOffer('sold-out-bait', 'shop-a', 500_000, 'out_of_stock'),
    mkOffer('discontinued-bait', 'shop-a', 450_000, 'discontinued'),
    mkOffer('  in-stock-bait\u0000 ', 'shop-a', 600_000, 'in_stock'),
    mkOffer('sold-out-high', 'shop-b', 50_000_000, 'discontinued'),
    mkOffer('sold-out-cheap-real', 'shop-b', 2_900_000, 'out_of_stock'),
    mkOffer('in-stock-1', 'shop-a', 3_032_000, 'in_stock'),
    mkOffer('in-stock-2', 'shop-c', 3_140_000, 'in_stock'),
    mkOffer('in-stock-3', 'shop-d', 3_690_000, 'in_stock'),
  ];

  // selectOfferForUrlInspection prefers shop-a's plausible in-stock offer over
  // its sold-out/in-stock bait rows.
  const pickedShopA = selectOfferForUrlInspection(offersWithSoldOutBait, {
    id: 'shop-a',
    platform_shop_id: 'shop-a',
  });
  assert.equal(pickedShopA?.id, 'in-stock-1');

  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const history = await getMasterProductPriceHistory(
      'master-1697',
      offersWithSoldOutBait
    );
    assert.equal(history.lowestEverPrice, 2_900_000);
    assert.equal(history.currentMinPrice, 3_032_000);
    assert.equal('sold-out-bait' in history.byOffer, false);
    assert.equal('discontinued-bait' in history.byOffer, false);
    assert.equal('  in-stock-bait\u0000 ' in history.byOffer, false);
    // Sold-out plausible row keeps its chart point (#1141) without receiving
    // genuine_deal, and inflated 50M discontinued MSRP does not skew marketMedianPrice
    // into turning 3,690,000 VND into a genuine_deal.
    assert.equal(
      history.byOffer['sold-out-cheap-real']?.verdict,
      'normal_price'
    );
    assert.equal(
      history.byOffer['sold-out-cheap-real']?.availability,
      'out_of_stock'
    );
    assert.equal(
      history.byOffer['sold-out-high']?.availability,
      'discontinued'
    );
    assert.equal(history.byOffer['in-stock-3']?.verdict, 'normal_price');
    assert.equal(history.byOffer['in-stock-3']?.availability, 'in_stock');
    assert.equal(history.byOffer['in-stock-1']?.verdict, 'genuine_deal');
    assert.equal(history.byOffer['in-stock-1']?.availability, 'in_stock');
    assert.equal(history.genuineDealCount, 1);

    // Zero in-stock offers: safe fallback drops sold-out 500k bait among sold-out peers.
    const allSoldOutHistory = await getMasterProductPriceHistory(
      'master-1697',
      [
        mkOffer('so-bait', 'shop-a', 500_000, 'out_of_stock'),
        mkOffer('so-1', 'shop-b', 3_032_000, 'out_of_stock'),
        mkOffer('so-2', 'shop-c', 3_140_000, 'out_of_stock'),
      ]
    );
    assert.equal(allSoldOutHistory.lowestEverPrice, 3_032_000);
    assert.equal('so-bait' in allSoldOutHistory.byOffer, false);
    assert.equal(allSoldOutHistory.genuineDealCount, 0);

    // Zero in-stock offers are filtered once, preserving fake_discount against single-pass median.
    const singlePassSoldOut = [1, 1, 3.5, 8, 10, 20, 30].map((m, idx) => ({
      ...mkOffer(`sp-${idx}`, `shop-${idx}`, m * 1_000_000, 'out_of_stock'),
      price_original: idx === 4 ? 12_000_000 : null,
    }));
    const singlePassHist = await getMasterProductPriceHistory(
      'master-1697',
      singlePassSoldOut
    );
    assert.equal(singlePassHist.byOffer['sp-4']?.verdict, 'fake_discount');

    // Extension mode === 'full' flags both sold-out bait and padded-ID in-stock bait.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      );
      const firstPage = Number(url.searchParams.get('offset') ?? 0) === 0;
      const select = url.searchParams.get('select') ?? '';
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (
        url.pathname.endsWith('/products') &&
        url.searchParams.has('platform_item_id')
      ) {
        return json([
          { cluster_id: 'master-1697', platform_item_id: '1697_1001' },
        ]);
      }
      if (
        url.pathname.endsWith('/master_products') &&
        url.searchParams.get('id') === 'eq.master-1697'
      ) {
        return json({
          id: 'master-1697',
          slug: 'buds3-pro',
          name: 'Galaxy Buds3 Pro',
          brand: 'Samsung',
          model: 'Galaxy Buds3 Pro',
          images: [],
          key_specs: {},
          specifications: {},
          min_price: 3_032_000,
          max_price: 3_690_000,
          category_id: 'cat-earbuds',
        });
      }
      if (url.pathname.endsWith('/v_products_with_merchant_trust')) {
        return json(
          firstPage
            ? [
                {
                  id: 'sold-out-bait',
                  cluster_id: 'master-1697',
                  merchant_id: 'm1',
                  platform: 'shopee',
                  title: 'Buds Case Bait',
                  price_current: 500_000,
                  stock: 0,
                  url: 'https://shopee.vn/product-i.1697.1000',
                  threat_risk_score: 5,
                },
                {
                  id: 'in-stock-1',
                  cluster_id: 'master-1697',
                  merchant_id: 'm2',
                  platform: 'shopee',
                  title: 'Galaxy Buds3 Pro',
                  price_current: 3_032_000,
                  stock: 5,
                  url: 'https://shopee.vn/product-i.1697.1001',
                  threat_risk_score: 5,
                },
                {
                  id: 'in-stock-2',
                  cluster_id: 'master-1697',
                  merchant_id: 'm3',
                  platform: 'shopee',
                  title: 'Galaxy Buds3 Pro',
                  price_current: 3_140_000,
                  stock: 5,
                  url: 'https://shopee.vn/product-i.1697.1002',
                  threat_risk_score: 5,
                },
              ]
            : []
        );
      }
      if (url.pathname.endsWith('/products') && select === 'id,availability') {
        return json(
          firstPage
            ? [
                { id: 'sold-out-bait', availability: 'out_of_stock' },
                { id: 'in-stock-1', availability: 'in_stock' },
                { id: 'in-stock-2', availability: 'in_stock' },
              ]
            : []
        );
      }
      return json([]);
    }) as typeof fetch;

    const fullExt = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '1697_1001',
      mode: 'full',
    });
    const soldOutExtRow = fullExt.allOffers.find(
      (o) => o.id === 'sold-out-bait'
    );
    assert.equal(soldOutExtRow?.implausiblyLow, true);
  } finally {
    globalThis.fetch = origFetch;
  }

  // evaluateExtensionPriceVerdict canonicalizes observedOfferId when excluding self.
  const paddedSelfVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: [
      mkOffer('  bait-self\u0000 ', 'shop-a', 500_000, 'in_stock') as never,
      mkOffer('s1', 'shop-b', 3_032_000, 'in_stock') as never,
      mkOffer('s2', 'shop-c', 3_140_000, 'in_stock') as never,
    ],
    observedOfferId: 'bait-self',
    priceHistory: null,
  });
  assert.equal(paddedSelfVerdict.implausiblyLow, true);

  // Sold-out 500k bait listing still gets implausiblyLow: true in extension
  // verdict even when 2+ in-stock bait rows exist alongside real offers.
  const soldOutMultiBaitVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: [
      mkOffer('in-bait-1', 'shop-a', 500_000, 'in_stock') as never,
      mkOffer('in-bait-2', 'shop-b', 550_000, 'in_stock') as never,
      mkOffer('real-1', 'shop-c', 3_032_000, 'in_stock') as never,
      mkOffer('real-2', 'shop-d', 3_140_000, 'in_stock') as never,
      mkOffer('sold-out-bait', 'shop-e', 500_000, 'out_of_stock') as never,
    ],
    observedOfferId: 'sold-out-bait',
    priceHistory: null,
  });
  assert.equal(soldOutMultiBaitVerdict.implausiblyLow, true);
  assert.equal(soldOutMultiBaitVerdict.verdict, 'insufficient_data');

  // getMasterProductPriceHistory sends sanitized product_id in .in() and maps
  // clean DB rows back to padded existingOffers.
  const seenHistoryQueries: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      seenHistoryQueries.push(urlStr);
      return new Response(
        JSON.stringify([
          {
            id: 1,
            product_id: 'clean-real-1',
            price: 3_032_000,
            price_original: null,
            recorded_at: '2026-10-01T00:00:00Z',
            source: 'crawler',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const paddedHist = await getMasterProductPriceHistory('master-1697', [
      mkOffer('  clean-real-1\u0000  ', 'shop-a', 3_032_000, 'in_stock'),
      mkOffer('clean-real-2', 'shop-b', 3_140_000, 'in_stock'),
    ]);
    assert.ok(seenHistoryQueries.some((q) => q.includes('clean-real-1')));
    assert.equal(
      seenHistoryQueries.some((q) => q.includes('%00')),
      false
    );
    assert.equal(
      paddedHist.byOffer['  clean-real-1\u0000  ']?.observation_count,
      1
    );
  } finally {
    globalThis.fetch = origFetch;
  }

  // ProductOffersExplorer suppresses genuine_deal on sold-out bait and renders
  // offer-implausibly-low + offer-unavailable badges even with stale byOffer.
  const staleByOffer = {
    'sold-out-bait': {
      product_id: 'sold-out-bait',
      merchant_name: 'Shop shop-a',
      platform: 'shopee',
      price_current: 500_000,
      price_original: null,
      claimed_discount_pct: 0,
      real_discount_vs_median_pct: 84,
      historical_min_price: 500_000,
      historical_max_price: 500_000,
      historical_median_price: 500_000,
      observation_count: 1,
      verdict: 'genuine_deal' as const,
      badge_label: 'Đáy giá lịch sử',
      explanation: 'Stale',
    },
  };
  const explorerInStock = offersWithSoldOutBait.filter(
    (o) => o.availability === 'in_stock'
  );
  const explorerBaitIds = implausiblyLowOfferIds(explorerInStock);
  assert.equal(
    ProductOffersExplorerMod.isExplorerOfferImplausiblyLow(
      offersWithSoldOutBait[0]!,
      explorerInStock,
      explorerBaitIds
    ),
    true
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerOfferDiscountAnalysis(
      offersWithSoldOutBait[0]!,
      staleByOffer,
      explorerInStock,
      explorerBaitIds
    ),
    null
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerOfferDiscountAnalysis(
      mkOffer('constructor', 'shop-a', 3_140_000, 'in_stock'),
      staleByOffer,
      explorerInStock,
      explorerBaitIds
    ),
    null
  );
  const explorerHtml = renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider as unknown as React.ComponentType<{
        locale: string;
        messages: unknown;
        timeZone: string;
        children?: React.ReactNode;
      }>,
      { locale: 'vi', messages: viMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductOffersExplorerMod.default, {
        productName: 'Galaxy Buds3 Pro',
        productSlug: 'buds3-pro',
        offers: [
          offersWithSoldOutBait[0]!,
          offersWithSoldOutBait[5]!,
          offersWithSoldOutBait[6]!,
        ],
        byOffer: staleByOffer,
      })
    )
  );
  assert.ok(explorerHtml.includes('data-testid="offer-implausibly-low"'));
  assert.ok(explorerHtml.includes('data-testid="offer-unavailable"'));
  assert.equal(explorerHtml.includes('bg-success text-white'), false);

  // DOS/Rate#1699: All-sold-out clusters still flag bait in evaluateExtensionPriceVerdict,
  // exclude unavailable offers from market stats, and interpolate positive fallback median.
  const allSoldOutCluster = [
    mkOffer('  so-bait\u0000 ', 'shop-a', 500_000, 'out_of_stock') as never,
    mkOffer('so-1', 'shop-b', 3_032_000, 'out_of_stock') as never,
    mkOffer('so-2', 'shop-c', 3_140_000, 'discontinued') as never,
  ];
  const allSoldOutSelfVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: allSoldOutCluster,
    observedOfferId: 'so-bait',
    priceHistory: null,
  });
  assert.equal(allSoldOutSelfVerdict.verdict, 'insufficient_data');
  assert.equal(allSoldOutSelfVerdict.implausiblyLow, true);
  assert.equal(allSoldOutSelfVerdict.messageKey, 'implausibly_low');
  assert.equal(allSoldOutSelfVerdict.marketMinPrice, null);
  assert.equal(allSoldOutSelfVerdict.marketMedianPrice, null);
  assert.equal(allSoldOutSelfVerdict.marketMaxPrice, null);
  assert.equal(allSoldOutSelfVerdict.cheaperOfferCount, 0);
  assert.equal(allSoldOutSelfVerdict.maxSavingsAmount, 0);
  assert.equal(
    allSoldOutSelfVerdict.messageParams?.marketMedianPrice,
    3_086_000
  );
  assert.equal(
    allSoldOutSelfVerdict.explanation.includes('trung vị 0 ₫'),
    false
  );
  assert.ok(allSoldOutSelfVerdict.explanation.includes('3.086.000 ₫'));

  const allSoldOutUncrawledMultiBait = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: [
      mkOffer('so-bait-1', 'shop-a', 500_000, 'out_of_stock') as never,
      mkOffer('so-bait-2', 'shop-b', 550_000, 'discontinued') as never,
      mkOffer('so-real-1', 'shop-c', 3_032_000, 'out_of_stock') as never,
      mkOffer('so-real-2', 'shop-d', 3_140_000, 'discontinued') as never,
    ],
    observedOfferId: null,
    priceHistory: null,
  });
  assert.equal(allSoldOutUncrawledMultiBait.implausiblyLow, true);
  assert.equal(allSoldOutUncrawledMultiBait.marketMedianPrice, null);
  assert.equal(
    allSoldOutUncrawledMultiBait.messageParams?.marketMedianPrice,
    3_086_000
  );

  // When removedObservedSelf is false, baitReferenceOffers is already plausible-filtered;
  // do not run a second plausibleOffers pass that would drop borderline 3.5M and skew median to 15M.
  const borderlinePrices = [
    500_000, 1_000_000, 1_000_000, 3_500_000, 8_000_000, 10_000_000, 20_000_000,
    30_000_000,
  ];
  const borderlineSoldOutVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: borderlinePrices.map((price, idx) =>
      mkOffer(`borderline-${idx}`, `shop-${idx}`, price, 'out_of_stock')
    ) as never[],
    observedOfferId: null,
    priceHistory: null,
  });
  assert.equal(borderlineSoldOutVerdict.implausiblyLow, true);
  assert.equal(borderlineSoldOutVerdict.marketMedianPrice, null);
  assert.equal(
    borderlineSoldOutVerdict.messageParams?.marketMedianPrice,
    10_000_000
  );
  assert.ok(borderlineSoldOutVerdict.explanation.includes('10.000.000 ₫'));

  const allSoldOutRealVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 3_032_000,
    observedOriginalPrice: null,
    offers: allSoldOutCluster,
    observedOfferId: 'so-1',
    priceHistory: null,
  });
  assert.equal(allSoldOutRealVerdict.implausiblyLow, undefined);
  assert.equal(allSoldOutRealVerdict.messageKey, 'insufficient_history');
  assert.equal(allSoldOutRealVerdict.marketMinPrice, null);

  // lookupExtensionProduct flags matchedOffer with implausiblyLow: true on URL-matched
  // bait listings (both in-stock and all-sold-out clusters) and leaves real offers unflagged.
  const { withPlausibleMinPrice } =
    await import('../../server/rate/api-handler');
  assert.equal(
    withPlausibleMinPrice({ min_price: 22_990_000 }, [
      { price_current: 15_000_000, availability: 'out_of_stock' },
      { price_current: 16_000_000, availability: 'discontinued' },
      { price_current: 21_990_000, availability: 'in_stock' },
    ]).min_price,
    21_990_000
  );
  assert.equal(
    withPlausibleMinPrice({ min_price: 0 }, [
      { price_current: 15_000_000, availability: 'out_of_stock' },
      { price_current: 16_000_000, availability: 'discontinued' },
    ]).min_price,
    0
  );

  try {
    let allSoldOutMode = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      );
      const firstPage = Number(url.searchParams.get('offset') ?? 0) === 0;
      const select = url.searchParams.get('select') ?? '';
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (
        url.pathname.endsWith('/products') &&
        url.searchParams.has('platform_item_id')
      ) {
        return json([
          { cluster_id: 'master-1699', platform_item_id: '1699_1000' },
          { cluster_id: 'master-1699', platform_item_id: '1699_1001' },
        ]);
      }
      if (
        url.pathname.endsWith('/master_products') &&
        url.searchParams.get('id') === 'eq.master-1699'
      ) {
        return json({
          id: 'master-1699',
          slug: 'buds3-pro-1699',
          name: 'Galaxy Buds3 Pro',
          brand: 'Samsung',
          model: 'Galaxy Buds3 Pro',
          images: [],
          key_specs: {},
          specifications: {},
          min_price: allSoldOutMode ? 0 : 3_032_000,
          max_price: allSoldOutMode ? 0 : 3_140_000,
          category_id: 'cat-earbuds',
        });
      }
      if (url.pathname.endsWith('/v_products_with_merchant_trust')) {
        return json(
          firstPage
            ? [
                {
                  id: 'bait-1000',
                  cluster_id: 'master-1699',
                  merchant_id: 'm1',
                  platform: 'shopee',
                  title: 'Buds Case Bait',
                  price_current: 500_000,
                  stock: 0,
                  url: 'https://shopee.vn/product-i.1699.1000',
                  threat_risk_score: 5,
                },
                {
                  id: 'real-1001',
                  cluster_id: 'master-1699',
                  merchant_id: 'm2',
                  platform: 'shopee',
                  title: 'Galaxy Buds3 Pro',
                  price_current: 3_032_000,
                  stock: allSoldOutMode ? 0 : 5,
                  url: 'https://shopee.vn/product-i.1699.1001',
                  threat_risk_score: 5,
                },
                {
                  id: 'real-1002',
                  cluster_id: 'master-1699',
                  merchant_id: 'm3',
                  platform: 'shopee',
                  title: 'Galaxy Buds3 Pro',
                  price_current: 3_140_000,
                  stock: allSoldOutMode ? 0 : 5,
                  url: 'https://shopee.vn/product-i.1699.1002',
                  threat_risk_score: 5,
                },
              ]
            : []
        );
      }
      if (url.pathname.endsWith('/products') && select === 'id,availability') {
        return json(
          firstPage
            ? [
                {
                  id: 'bait-1000',
                  availability: allSoldOutMode ? 'out_of_stock' : 'in_stock',
                },
                {
                  id: 'real-1001',
                  availability: allSoldOutMode ? 'out_of_stock' : 'in_stock',
                },
                {
                  id: 'real-1002',
                  availability: allSoldOutMode ? 'discontinued' : 'in_stock',
                },
              ]
            : []
        );
      }
      return json([]);
    }) as typeof fetch;

    const inStockBaitLookup = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '1699_1000',
      url: 'https://shopee.vn/product-i.1699.1000',
      mode: 'pill',
    });
    assert.equal(inStockBaitLookup.matchedOffer?.id, 'bait-1000');
    assert.equal(inStockBaitLookup.matchedOffer?.implausiblyLow, true);
    assert.equal(inStockBaitLookup.priceAssessment.implausiblyLow, true);

    const inStockRealLookup = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '1699_1001',
      url: 'https://shopee.vn/product-i.1699.1001',
      mode: 'pill',
    });
    assert.equal(inStockRealLookup.matchedOffer?.id, 'real-1001');
    assert.equal(inStockRealLookup.matchedOffer?.implausiblyLow, undefined);

    allSoldOutMode = true;
    const soldOutBaitLookup = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '1699_1000',
      url: 'https://shopee.vn/product-i.1699.1000',
      mode: 'full',
    });
    assert.equal(soldOutBaitLookup.matchedOffer?.id, 'bait-1000');
    assert.equal(soldOutBaitLookup.matchedOffer?.implausiblyLow, true);
    assert.equal(soldOutBaitLookup.priceAssessment.implausiblyLow, true);
    assert.equal(soldOutBaitLookup.priceAssessment.marketMedianPrice, null);
    assert.equal(
      soldOutBaitLookup.priceAssessment.messageParams?.marketMedianPrice,
      3_086_000
    );
  } finally {
    globalThis.fetch = origFetch;
  }

  // DOS/Rate#1721: ProductOffersExplorer trust cutoffs via merchantRiskTone,
  // unavailable verdict suppression across UI + exports, and zero-price guards.
  assert.equal(ProductOffersExplorerMod.offerRiskTone(null), null);
  assert.equal(ProductOffersExplorerMod.offerRiskTone(''), null);
  assert.equal(ProductOffersExplorerMod.offerRiskTone(Number.NaN), null);
  assert.equal(ProductOffersExplorerMod.offerRiskTone(19), 'good');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(19.4), 'good');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(19.6), 'warn');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(20), 'warn');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(49), 'warn');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(49.6), 'bad');
  assert.equal(ProductOffersExplorerMod.offerRiskTone(50), 'bad');
  assert.equal(
    ProductOffersExplorerMod.offerTrustBadgeClass(null),
    'bg-light text-muted border'
  );
  assert.equal(
    ProductOffersExplorerMod.offerTrustBadgeClass(19),
    'bg-success-subtle text-success'
  );
  assert.equal(
    ProductOffersExplorerMod.offerTrustBadgeClass(20),
    'bg-warning-subtle text-warning-emphasis'
  );
  assert.equal(
    ProductOffersExplorerMod.offerTrustBadgeClass(50),
    'bg-danger-subtle text-danger'
  );
  assert.equal(
    ProductOffersExplorerMod.buildExplorerInspectHref(
      'https://shopee.vn/item-i.1.2',
      0
    ),
    '/inspect?q=https%3A%2F%2Fshopee.vn%2Fitem-i.1.2'
  );
  assert.equal(
    ProductOffersExplorerMod.buildExplorerInspectHref(
      'https://shopee.vn/item-i.1.2',
      3_032_000
    ),
    '/inspect?q=https%3A%2F%2Fshopee.vn%2Fitem-i.1.2&price=3032000'
  );

  const mkAnalysis = (
    id: string,
    verdict:
      'normal_price' | 'genuine_deal' | 'fake_discount' | 'suspicious_discount'
  ) => ({
    product_id: id,
    merchant_name: 'Shop A',
    platform: 'shopee',
    price_current: 3_032_000,
    price_original: 4_500_000,
    claimed_discount_pct: 32,
    real_discount_vs_median_pct: 0,
    historical_min_price: 3_032_000,
    historical_max_price: 3_200_000,
    historical_median_price: 3_100_000,
    observation_count: 4,
    verdict,
    badge_label: verdict,
    explanation: verdict,
  });

  const soldOutNormalOffer = mkOffer(
    'so-norm',
    'shop-b',
    3_032_000,
    'out_of_stock'
  );
  const discontinuedOffer = mkOffer(
    'disc-1',
    'shop-c',
    3_140_000,
    'discontinued'
  );
  const zeroPriceOffer = mkOffer('zero-1', 'shop-d', 0, 'in_stock');
  const byOffer1721 = {
    'so-norm': mkAnalysis('so-norm', 'normal_price'),
    'disc-1': mkAnalysis('disc-1', 'fake_discount'),
    'zero-1': mkAnalysis('zero-1', 'normal_price'),
  };
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerOfferDiscountAnalysis(
      soldOutNormalOffer,
      byOffer1721,
      explorerInStock,
      explorerBaitIds
    ),
    null
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerOfferDiscountAnalysis(
      discontinuedOffer,
      byOffer1721,
      explorerInStock,
      explorerBaitIds
    )?.verdict,
    'fake_discount'
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerOfferDiscountAnalysis(
      zeroPriceOffer,
      byOffer1721,
      explorerInStock,
      explorerBaitIds
    ),
    null
  );

  const tDetailEn = (
    key:
      | 'offersImplausiblyLowBadge'
      | 'offersDiscontinuedBadge'
      | 'offersUnavailableBadge'
  ) => enMessages.productDetail[key];
  const tVerdictEn = (
    key: keyof typeof enMessages.priceVerdict,
    vals?: Record<string, string | number>
  ) => {
    let msg: string = enMessages.priceVerdict[key];
    for (const [k, v] of Object.entries(vals ?? {})) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
    return msg;
  };
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerMarkdownVerdictCell({
      offer: soldOutNormalOffer,
      isBait: false,
      analysis: null,
      t: tDetailEn,
      tVerdict: tVerdictEn,
      locale: 'en',
    }),
    enMessages.productDetail.offersUnavailableBadge
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerMarkdownVerdictCell({
      offer: discontinuedOffer,
      isBait: false,
      analysis: null,
      t: tDetailEn,
      tVerdict: tVerdictEn,
      locale: 'en',
    }),
    enMessages.productDetail.offersDiscontinuedBadge
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerExportVerdictCode(
      soldOutNormalOffer,
      false,
      null
    ),
    'out_of_stock'
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerExportVerdictCode(
      discontinuedOffer,
      false,
      null
    ),
    'discontinued'
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerExportVerdictCode(
      discontinuedOffer,
      false,
      mkAnalysis('disc-1', 'suspicious_discount')
    ),
    'suspicious_discount'
  );
  assert.equal(
    ProductOffersExplorerMod.resolveExplorerExportVerdictCode(
      zeroPriceOffer,
      false,
      null
    ),
    'insufficient_data'
  );

  const IntlProvider =
    NextIntlClientProvider as unknown as React.ComponentType<{
      locale: string;
      messages: unknown;
      timeZone: string;
      children?: React.ReactNode;
    }>;
  const withRisk = (
    base: ReturnType<typeof mkOffer>,
    name: string,
    riskScore: number | null
  ) => ({
    ...base,
    merchant: { ...base.merchant, name, risk_score: riskScore },
  });
  const highTrustHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductOffersExplorerMod.default, {
        productName: 'Galaxy Buds3 Pro',
        productSlug: 'buds3-pro',
        initialHighTrustOnly: true,
        offers: [
          withRisk(mkOffer('r19', 'm19', 3_100_000), 'ShopRisk19', 19),
          withRisk(mkOffer('r20', 'm20', 3_100_000), 'ShopRisk20', 20),
          withRisk(mkOffer('r50', 'm50', 3_100_000), 'ShopRisk50', 50),
          withRisk(mkOffer('rnull', 'mnull', 3_100_000), 'ShopRiskNull', null),
        ],
        byOffer: {},
      })
    )
  );
  assert.ok(highTrustHtml.includes('ShopRisk19'));
  assert.equal(highTrustHtml.includes('ShopRisk20'), false);
  assert.equal(highTrustHtml.includes('ShopRisk50'), false);
  assert.equal(highTrustHtml.includes('ShopRiskNull'), false);

  const zeroPriceOffer2 = withRisk(
    mkOffer('zero-2', 'shop-e', 0, 'in_stock'),
    'ShopZeroHighTrust',
    2
  );
  const explorerEdgeHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductOffersExplorerMod.default, {
        productName: 'Galaxy Buds3 Pro',
        productSlug: 'buds3-pro',
        offers: [soldOutNormalOffer, zeroPriceOffer, zeroPriceOffer2],
        byOffer: byOffer1721,
      })
    )
  );
  assert.ok(
    explorerEdgeHtml.indexOf('ShopZeroHighTrust') <
      explorerEdgeHtml.indexOf('Shop shop-d'),
    'Unpriced offers sort cleanly by trust tie-breaker without NaN'
  );
  assert.equal(
    explorerEdgeHtml.includes(enMessages.priceVerdict.labelNormal),
    false
  );
  assert.equal(explorerEdgeHtml.includes('>0 ₫<'), false);
  assert.equal(explorerEdgeHtml.includes('price=0'), false);
  assert.ok(explorerEdgeHtml.includes('>Out of stock<'));
  assert.ok(explorerEdgeHtml.includes('>-<'));

  // DOS/Rate#1721: ProductValueCalculator sets aria-pressed and avoids green '0 ₫' when resale is off.
  const ProductValueCalculatorMod =
    await import('../../components/leaderboard/ProductValueCalculator');
  const calcOnHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculatorMod.default, {
        productName: 'iPhone 16',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 20_000_000,
        maxPriceVnd: 22_000_000,
        userScore5: 4.5,
        expertScore10: 8.8,
        valueCriterionScore5: 4.4,
      })
    )
  );
  assert.match(
    calcOnHtml,
    /<button[^>]*aria-pressed="true"[^>]*>Include trade-in resale/
  );
  const calcOffHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculatorMod.default, {
        productName: 'iPhone 16',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 20_000_000,
        maxPriceVnd: 22_000_000,
        userScore5: 4.5,
        expertScore10: 8.8,
        valueCriterionScore5: 4.4,
        initialIncludeResale: false,
      })
    )
  );
  assert.match(
    calcOffHtml,
    /<button[^>]*aria-pressed="false"[^>]*>Exclude resale/
  );
  assert.equal(calcOffHtml.includes('>0 ₫<'), false);
  assert.equal(calcOffHtml.includes('text-success'), false);
  assert.ok(calcOffHtml.includes('text-muted">N/A<'));

  // DOS/Rate#1721: PriceHistorySection forwards locale to radarMarkdownCell and
  // hides clean/100%-transparent claims when validPoints and offerAnalyses are empty.
  const PriceHistorySectionMod =
    await import('../../components/price-history/PriceHistorySection');
  const emptyHistory = {
    points: [],
    lowestEverPrice: null,
    lowestEverDate: null,
    lowestEverMerchant: null,
    highestEverPrice: null,
    currentMinPrice: null,
    byOffer: {},
    fakeDiscountCount: 0,
    genuineDealCount: 0,
  };
  const radarFakeSignal = {
    verdict: 'fake_sale_trap' as const,
    savingsPct: 0,
    fakeMarkupPct: 35,
    spreadPct: 12,
    genuineDeal: null,
    fakeSaleTrap: null,
    priceSpread: null,
  };
  const enHistoryMd = PriceHistorySectionMod.buildPriceHistoryMarkdown({
    productName: 'Galaxy Buds3 Pro',
    history: emptyHistory,
    offerAnalyses: [mkAnalysis('o1', 'fake_discount')],
    radarSignal: radarFakeSignal,
    tVerdict: tVerdictEn,
    locale: 'en',
  });
  assert.ok(
    enHistoryMd.startsWith(
      '### 📈 Rate.vn price history and fake-sale check: Galaxy Buds3 Pro'
    )
  );
  assert.ok(
    enHistoryMd.includes(
      '| Merchant | Platform | Current price (VND) | Original price (VND) | 90d median (VND) | 90d low (VND) | Price verdict |'
    )
  );
  assert.ok(enHistoryMd.includes('Fake sale warning (+35.0%)'));
  assert.equal(enHistoryMd.includes('Cảnh báo giảm giá ảo'), false);

  const tVerdictCs = (
    key: keyof typeof csMessages.priceVerdict,
    vals?: Record<string, string | number>
  ) => {
    let msg: string = csMessages.priceVerdict[key];
    for (const [k, v] of Object.entries(vals ?? {})) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
    return msg;
  };
  const csHistoryMd = PriceHistorySectionMod.buildPriceHistoryMarkdown({
    productName: 'Galaxy Buds3 Pro',
    history: {
      ...emptyHistory,
      currentMinPrice: 20_000_000,
      lowestEverPrice: 18_500_000,
    },
    offerAnalyses: [mkAnalysis('o1', 'normal_price')],
    radarSignal: radarFakeSignal,
    tVerdict: tVerdictCs,
    locale: 'cs',
  });
  assert.ok(
    csHistoryMd.startsWith(
      '### 📈 Historie cen a kontrola falešných slev na Rate.vn: Galaxy Buds3 Pro'
    )
  );
  assert.ok(
    csHistoryMd.includes(
      '| Obchod | Platforma | Aktuální cena (VND) | Původní cena (VND) | 90d medián (VND) | 90d minimum (VND) | Verdikt ceny |'
    )
  );
  assert.ok(csHistoryMd.includes('20\u00a0000\u00a0000\u00a0₫'));
  assert.ok(csHistoryMd.includes('18\u00a0500\u00a0000\u00a0₫'));
  assert.equal(csHistoryMd.includes('20.000.000'), false);
  assert.equal(csHistoryMd.includes('Current Lowest Price'), false);
  assert.ok(csHistoryMd.includes('Upozornění na falešnou slevu'));
  assert.equal(csHistoryMd.includes('Cảnh báo giảm giá ảo'), false);

  const emptyHistoryHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(PriceHistorySectionMod.default, {
        productName: 'Galaxy Buds3 Pro',
        history: emptyHistory,
      })
    )
  );
  assert.equal(
    emptyHistoryHtml.includes(enMessages.productDetail.priceHistoryCleanBadge),
    false
  );
  assert.equal(
    emptyHistoryHtml.includes(
      enMessages.productDetail.priceHistoryKpiAiAuditTransparent
    ),
    false
  );
  assert.ok(emptyHistoryHtml.includes('text-muted">N/A<'));

  const populatedHistoryHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(PriceHistorySectionMod.default, {
        productName: 'Galaxy Buds3 Pro',
        history: {
          ...emptyHistory,
          byOffer: { o1: mkAnalysis('o1', 'normal_price') },
        },
      })
    )
  );
  assert.ok(
    populatedHistoryHtml.includes(
      enMessages.productDetail.priceHistoryCleanBadge
    )
  );
  assert.ok(
    populatedHistoryHtml.includes(
      enMessages.productDetail.priceHistoryKpiAiAuditTransparent
    )
  );

  const { runInspectVerdictGuardsSuite } =
    await import('./inspect-verdict-guards.test');
  await runInspectVerdictGuardsSuite();

  console.warn('✅ Offer plausibility suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
