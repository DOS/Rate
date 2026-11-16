import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
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
    assert.equal(history.byOffer['in-stock-3']?.verdict, 'normal_price');
    assert.equal(history.byOffer['in-stock-1']?.verdict, 'genuine_deal');
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

  console.warn('✅ Offer plausibility suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
