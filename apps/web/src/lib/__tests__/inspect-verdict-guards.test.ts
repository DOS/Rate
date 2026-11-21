import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import { pickClientMessages } from '../client-messages';
import { discountVerdictCopy } from '../discount-verdict-copy';
import { formatPriceVnd } from '../locale-format';
import {
  MAX_VALID_VND_PRICE,
  parseEcommerceUrlOrQuery,
  type MerchantOffer,
  type OfferDiscountAnalysis,
  type UrlInspectionResult,
} from '../rate-domain';

const LOCALES = ['vi', 'en', 'cs'] as const;

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

function messagesForLocale(locale: (typeof LOCALES)[number]) {
  return locale === 'vi'
    ? viMessages
    : locale === 'en'
      ? enMessages
      : csMessages;
}

function makeOffer(
  id: string,
  priceCurrent: number,
  availability:
    'in_stock' | 'out_of_stock' | 'discontinued' | null = 'in_stock',
  priceOriginal: number | null = null
): MerchantOffer {
  return {
    id,
    platform: 'shopee',
    title: `Offer ${id}`,
    price_current: priceCurrent,
    price_original: priceOriginal,
    stock: availability === 'in_stock' ? 5 : 0,
    rating_star: 4.9,
    rating_count: 18,
    url: `https://shopee.vn/item-i.1810.${id.trim() || '0'}`,
    availability,
    merchant: {
      id: `merchant-${id.trim() || '0'}`,
      name: `Shop ${id.trim() || '0'}`,
      platform: 'shopee',
      is_official: true,
      rating_star: 4.9,
      follower_count: 1000,
      location: 'VN',
      risk_score: 6,
      dosafe_risk_score: 6,
      review_risk_score: 6,
      review_risk_breakdown: null,
    },
  } as unknown as MerchantOffer;
}

function makeDiscountAnalysis(
  verdict: OfferDiscountAnalysis['verdict'],
  priceCurrent = 19_990_000,
  priceOriginal: number | null = 24_990_000
): OfferDiscountAnalysis {
  return {
    product_id: 'offer-1810',
    merchant_name: 'Shop 1810',
    platform: 'shopee',
    price_current: priceCurrent,
    price_original: priceOriginal,
    claimed_discount_pct: 20,
    real_discount_vs_median_pct: verdict === 'genuine_deal' ? 12 : 0,
    historical_min_price: 19_500_000,
    historical_max_price: 22_000_000,
    historical_median_price: 21_000_000,
    observation_count: 6,
    verdict,
    badge_label: verdict,
    explanation: verdict,
  };
}

export async function runInspectVerdictGuardsSuite() {
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
    default: HeroSearchInspector,
    resolveHeroInspectBestPriceVnd,
    resolveHeroInspectDiscountAnalysis,
  } = await import('../../components/home/HeroSearchInspector');
  const {
    default: DeepInspectWorkspace,
    buildInspectMarkdownPriceLines,
    isInspectOfferBait,
    resolveInspectMasterMinPriceVnd,
    resolveInspectPriceVerdictPrices,
    resolveInspectVerdictPrices,
    sanitizeInspectOriginalPriceVnd,
  } = await import('../../components/inspect/DeepInspectWorkspace');

  assert.equal(
    resolveInspectVerdictPrices,
    resolveInspectPriceVerdictPrices,
    'resolveInspectVerdictPrices aliases resolveInspectPriceVerdictPrices'
  );

  const inStockPeerA = makeOffer('peer-a', 20_000_000, 'in_stock', 22_000_000);
  const inStockPeerB = makeOffer('peer-b', 21_500_000, 'in_stock', null);
  const bait1000Offer = makeOffer('bait-1k', 1_000, 'in_stock', 25_000_000);
  const paddedBaitOffer = makeOffer(
    '  bait-padded\u0000 ',
    1_000,
    'in_stock',
    25_000_000
  );
  const uncanonicalBaitOffer = makeOffer('000', 1_000, 'in_stock', 25_000_000);
  const soldOutOffer = makeOffer(
    'sold-out-1',
    15_000_000,
    'out_of_stock',
    25_000_000
  );
  const discontinuedOffer = makeOffer(
    'disc-1',
    16_000_000,
    'discontinued',
    26_000_000
  );

  // 1. HeroSearchInspector pure guard: suppresses genuine_deal, fake_discount,
  // suspicious_discount, and normal_price on unavailable or bait offers.
  for (const verdict of [
    'genuine_deal',
    'fake_discount',
    'suspicious_discount',
    'normal_price',
  ] as const) {
    const analysis = makeDiscountAnalysis(verdict);

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: soldOutOffer,
        allOffers: [soldOutOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: analysis,
      }),
      null,
      `sold-out offer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: discontinuedOffer,
        allOffers: [discontinuedOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: analysis,
      }),
      null,
      `discontinued offer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: bait1000Offer,
        allOffers: [bait1000Offer, inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `1,000 VND bait offer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: paddedBaitOffer,
        allOffers: [paddedBaitOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `padded-ID 1,000 VND bait offer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: uncanonicalBaitOffer,
        allOffers: [uncanonicalBaitOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `uncanonicalizable-ID 1,000 VND bait offer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: {
          id: 'explicit-bait',
          price_current: 1_000,
          availability: 'in_stock',
          implausiblyLow: true,
        },
        allOffers: [],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `explicit implausiblyLow matchedOffer must suppress ${verdict}`
    );

    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: null,
        allOffers: [soldOutOffer, discontinuedOffer],
        discountAnalysis: analysis,
      }),
      null,
      `all-unavailable cluster with null matchedOffer must suppress ${verdict}`
    );

    for (const badPrice of [
      0,
      -500,
      Number.NaN,
      MAX_VALID_VND_PRICE + 1,
    ] as const) {
      assert.equal(
        resolveHeroInspectDiscountAnalysis({
          matchedOffer: {
            id: 'unpriced',
            price_current: badPrice,
            availability: 'in_stock',
          },
          allOffers: [inStockPeerA, inStockPeerB],
          discountAnalysis: analysis,
        }),
        null,
        `invalid offer price ${String(badPrice)} must suppress ${verdict}`
      );
    }

    // Plausible in-stock offer keeps its verdict, even alongside high discontinued MSRPs.
    const inflatedDiscontinuedA = makeOffer(
      'old-50m',
      50_000_000,
      'discontinued'
    );
    const inflatedDiscontinuedB = makeOffer(
      'old-52m',
      52_000_000,
      'out_of_stock'
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: inStockPeerA,
        allOffers: [
          inflatedDiscontinuedA,
          inflatedDiscontinuedB,
          inStockPeerA,
          inStockPeerB,
        ],
        discountAnalysis: analysis,
      }),
      analysis,
      `plausible in-stock offer keeps ${verdict}`
    );

    // Round 1 coverage: 1-offer and 2-offer 1,000 VND bait clusters, malformed
    // analysis.price_current, null matchedOffer with bait/unavailable linked ID,
    // unpriced in-stock peers, and ID-collision overrides.
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: bait1000Offer,
        allOffers: [bait1000Offer],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `1-offer 1,000 VND bait cluster must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: bait1000Offer,
        allOffers: [bait1000Offer, inStockPeerA],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `2-offer 1,000 VND bait cluster must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: inStockPeerA,
        allOffers: [inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 0, 25_000_000),
      }),
      null,
      `zero analysis.price_current must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: inStockPeerA,
        allOffers: [inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 1_000, 25_000_000),
      }),
      null,
      `bait analysis.price_current must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: null,
        allOffers: [soldOutOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: {
          ...analysis,
          product_id: soldOutOffer.id,
        },
      }),
      null,
      `null matchedOffer linked to unavailable product_id must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: null,
        allOffers: [makeOffer('unpriced-in-stock', 0, 'in_stock')],
        discountAnalysis: analysis,
      }),
      null,
      `unpriced 0 VND in-stock cluster must suppress ${verdict}`
    );
    assert.equal(
      resolveHeroInspectDiscountAnalysis({
        matchedOffer: {
          id: 'peer-a',
          price_current: 500_000,
          availability: 'in_stock',
        },
        allOffers: [inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(verdict, 500_000, 25_000_000),
      }),
      null,
      `ID-colliding overridden bait offer must suppress ${verdict}`
    );
  }

  assert.equal(
    resolveHeroInspectBestPriceVnd({
      masterProduct: { min_price: 15_000_000, slug: 'iphone-16' },
      allOffers: [soldOutOffer, makeOffer('unpriced-0', 0, 'in_stock')],
    }),
    0,
    'HeroSearchInspector best price suppresses stale min_price when no priced in-stock offer exists'
  );
  assert.equal(
    resolveHeroInspectBestPriceVnd({
      masterProduct: { min_price: 1_000, slug: 'iphone-16' },
      allOffers: [bait1000Offer, inStockPeerA],
    }),
    20_000_000,
    'HeroSearchInspector best price excludes 1,000 VND bait in 2-offer cluster'
  );

  // 2. HeroSearchInspector SSR HTML across vi/en/cs & home/contact scopes.
  const baseMaster = {
    id: 'mp-1810',
    slug: 'iphone-16-1810',
    name: 'iPhone 16 128GB',
    brand: 'Apple',
    model: 'iPhone 16',
    model_key: 'apple_iphone_16_128gb',
    min_price: 20_000_000,
    max_price: 21_500_000,
    merchant_count: 2,
    status: 'published',
    images: [],
    metadata: { category_slug: 'smartphones' },
  } as unknown as NonNullable<UrlInspectionResult['masterProduct']>;

  const renderHeroInspect = (
    locale: (typeof LOCALES)[number],
    scope: 'home' | 'contact',
    inspectResult: UrlInspectionResult
  ): string =>
    renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(
              messagesForLocale(locale) as unknown as Record<string, unknown>,
              scope
            ),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(HeroSearchInspector, {
            initialProducts: [],
            initialMerchants: [],
            initialMode: 'inspect',
            initialInspectResult: inspectResult,
          })
        )
      )
    );

  for (const locale of LOCALES) {
    const fullMsgs = messagesForLocale(locale);
    const tVerdict = createTranslator({
      locale,
      messages: fullMsgs,
      namespace: 'priceVerdict',
    });

    for (const scope of ['home', 'contact'] as const) {
      for (const verdict of ['genuine_deal', 'fake_discount'] as const) {
        const analysis = makeDiscountAnalysis(verdict, 19_990_000, 24_990_000);
        const expectedCopy = discountVerdictCopy(tVerdict, analysis, locale);

        for (const suppressedOffer of [
          soldOutOffer,
          discontinuedOffer,
          bait1000Offer,
        ]) {
          const suppressedHtml = renderHeroInspect(locale, scope, {
            query: suppressedOffer.url,
            matchedType: 'product_listing',
            parsedUrl: parseEcommerceUrlOrQuery(suppressedOffer.url),
            masterProduct: baseMaster,
            matchedOffer: suppressedOffer,
            allOffers: [suppressedOffer, inStockPeerA, inStockPeerB],
            discountAnalysis: analysis,
            priceHistory: null,
            reviewSummary: null,
            merchantProfile: null,
            suggestions: [],
          });
          assert.equal(
            suppressedHtml.includes(expectedCopy.label),
            false,
            `${locale}/${scope}: ${suppressedOffer.id} must not render ${verdict} badge label`
          );
          assert.equal(
            suppressedHtml.includes(expectedCopy.explanation),
            false,
            `${locale}/${scope}: ${suppressedOffer.id} must not render ${verdict} explanation`
          );
        }

        const validHtml = renderHeroInspect(locale, scope, {
          query: inStockPeerA.url,
          matchedType: 'product_listing',
          parsedUrl: parseEcommerceUrlOrQuery(inStockPeerA.url),
          masterProduct: baseMaster,
          matchedOffer: inStockPeerA,
          allOffers: [bait1000Offer, inStockPeerA, inStockPeerB],
          discountAnalysis: analysis,
          priceHistory: null,
          reviewSummary: null,
          merchantProfile: null,
          suggestions: [],
        });
        assert.ok(
          validHtml.includes(expectedCopy.label) &&
            validHtml.includes(expectedCopy.explanation),
          `${locale}/${scope}: plausible in-stock offer renders ${verdict} badge and explanation`
        );
      }
    }
  }

  // 3. DeepInspectWorkspace resolveInspectVerdictPrices & buildInspectMarkdownPriceLines.
  const mdLabels = {
    currentPriceLabel: 'Current price',
    claimedOriginalLabel: 'Original price',
    historicalLowLabel: 'Historical low',
    historicalHighLabel: 'Historical high',
  };

  // Unavailable offers exclude matchedOffer.price_current & price_original.
  for (const unavailableOffer of [soldOutOffer, discontinuedOffer]) {
    assert.deepEqual(
      resolveInspectVerdictPrices({
        matchedOffer: unavailableOffer,
        allOffers: [unavailableOffer, inStockPeerA, inStockPeerB],
        master: { min_price: 20_000_000, max_price: 21_500_000 },
        priceHistory: {
          lowestEverPrice: 19_500_000,
          highestEverPrice: 22_000_000,
        },
      }),
      {
        currentPriceVnd: 20_000_000,
        claimedOriginalVnd: 0,
        historicalLowVnd: 19_500_000,
        historicalHighVnd: 22_000_000,
      },
      `${unavailableOffer.id} falls back to master min_price and drops claimedOriginalVnd`
    );

    // All offers unavailable -> currentPriceVnd is 0 even if master.min_price is stale.
    const allSoldOutVerdictPrices = resolveInspectVerdictPrices({
      matchedOffer: unavailableOffer,
      allOffers: [soldOutOffer, discontinuedOffer],
      master: { min_price: 15_000_000, max_price: 16_000_000 },
      priceHistory: {
        lowestEverPrice: 15_000_000,
        highestEverPrice: 16_000_000,
      },
    });
    assert.deepEqual(allSoldOutVerdictPrices, {
      currentPriceVnd: 0,
      claimedOriginalVnd: 0,
      historicalLowVnd: 15_000_000,
      historicalHighVnd: 16_000_000,
    });
    assert.deepEqual(
      buildInspectMarkdownPriceLines({
        currentListedPrice: allSoldOutVerdictPrices.currentPriceVnd,
        claimedOrigPrice: allSoldOutVerdictPrices.claimedOriginalVnd,
        histLow: allSoldOutVerdictPrices.historicalLowVnd,
        histHigh: allSoldOutVerdictPrices.historicalHighVnd,
        labels: mdLabels,
      }),
      ['- **Historical low / Historical high:** 15.000.000 ₫ - 16.000.000 ₫']
    );
  }

  // 1,000 VND bait offer never leaks into VerdictPrices or Markdown lines,
  // even when master.min_price also holds a stale 1,000 VND bait value.
  for (const staleMasterMin of [20_000_000, 1_000]) {
    const baitPrices = resolveInspectVerdictPrices({
      matchedOffer: bait1000Offer,
      allOffers: [bait1000Offer, inStockPeerA, inStockPeerB],
      master: { min_price: staleMasterMin, max_price: 21_500_000 },
      priceHistory: { lowestEverPrice: null, highestEverPrice: 22_000_000 },
    });
    assert.deepEqual(baitPrices, {
      currentPriceVnd: 20_000_000,
      claimedOriginalVnd: 0,
      historicalLowVnd: 20_000_000,
      historicalHighVnd: 22_000_000,
    });
    const baitMdLines = buildInspectMarkdownPriceLines({
      currentListedPrice: baitPrices.currentPriceVnd,
      claimedOrigPrice: baitPrices.claimedOriginalVnd,
      histLow: baitPrices.historicalLowVnd,
      histHigh: baitPrices.historicalHighVnd,
      labels: mdLabels,
    });
    assert.deepEqual(baitMdLines, [
      '- **Current price:** 20.000.000 ₫',
      '- **Historical low / Historical high:** 20.000.000 ₫ - 22.000.000 ₫',
    ]);
    assert.equal(
      baitMdLines.join('\n').includes('1.000'),
      false,
      '1,000 VND bait price must never leak into Markdown lines'
    );
    assert.equal(
      baitMdLines.join('\n').includes('25.000.000'),
      false,
      'bait offer claimed original price must never leak into Markdown lines'
    );
  }

  // Direct inStockOffers parameter (without allOffers) also detects 1,000 VND bait.
  assert.deepEqual(
    resolveInspectVerdictPrices({
      matchedOffer: {
        id: 'bait-direct',
        price_current: 1_000,
        price_original: 25_000_000,
      },
      inStockOffers: [inStockPeerA, inStockPeerB],
      master: { min_price: 20_000_000, max_price: 21_500_000 },
      priceHistory: null,
    }),
    {
      currentPriceVnd: 20_000_000,
      claimedOriginalVnd: 0,
      historicalLowVnd: 20_000_000,
      historicalHighVnd: 21_500_000,
    }
  );

  // orig <= current is omitted in both resolveInspectVerdictPrices and buildInspectMarkdownPriceLines.
  for (const nonHigherOrig of [0, 15_000_000, 19_990_000]) {
    assert.equal(
      resolveInspectVerdictPrices({
        matchedOffer: {
          id: 'plausible-1',
          price_current: 19_990_000,
          price_original: nonHigherOrig,
          availability: 'in_stock',
        },
        allOffers: [inStockPeerA, inStockPeerB],
        master: { min_price: 19_990_000, max_price: 21_500_000 },
        priceHistory: null,
      }).claimedOriginalVnd,
      0,
      `resolveInspectVerdictPrices omits claimedOriginalVnd when orig (${nonHigherOrig}) <= current`
    );

    assert.deepEqual(
      buildInspectMarkdownPriceLines({
        currentListedPrice: 19_990_000,
        claimedOrigPrice: nonHigherOrig,
        histLow: 0,
        histHigh: 0,
        labels: mdLabels,
      }),
      ['- **Current price:** 19.990.000 ₫'],
      `buildInspectMarkdownPriceLines omits claimedOriginalLabel when orig (${nonHigherOrig}) <= current`
    );
  }

  // Strictly higher orig > current is retained.
  assert.equal(
    resolveInspectVerdictPrices({
      matchedOffer: {
        id: 'plausible-disc',
        price_current: 19_990_000,
        price_original: 19_990_001,
        availability: 'in_stock',
      },
      master: { min_price: 19_990_000, max_price: 21_500_000 },
      priceHistory: null,
    }).claimedOriginalVnd,
    19_990_001
  );
  assert.deepEqual(
    buildInspectMarkdownPriceLines({
      currentListedPrice: 19_990_000,
      claimedOrigPrice: 24_990_000,
      histLow: 0,
      histHigh: 0,
      labels: mdLabels,
    }),
    ['- **Current price:** 19.990.000 ₫ | Original price: 24.990.000 ₫']
  );

  // 4. DeepInspectWorkspace SSR render across locales: Verdict Card never leaks
  // 1,000 VND bait price or bait/unavailable strikethroughs into summary tiles.
  for (const locale of LOCALES) {
    const inspectMsgs = messagesForLocale(locale).inspect;
    const renderInspect = (inspection: UrlInspectionResult) =>
      renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter },
          React.createElement(
            IntlProvider,
            {
              locale,
              messages: pickClientMessages(
                messagesForLocale(locale) as unknown as Record<string, unknown>,
                'inspect'
              ),
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(DeepInspectWorkspace, {
              initialQuery: inspection.query,
              initialInspection: inspection,
            })
          )
        )
      );

    const baitHtml = renderInspect({
      query: bait1000Offer.url,
      matchedType: 'product_listing',
      parsedUrl: parseEcommerceUrlOrQuery(bait1000Offer.url),
      masterProduct: baseMaster,
      matchedOffer: bait1000Offer,
      allOffers: [bait1000Offer, inStockPeerA, inStockPeerB],
      discountAnalysis: makeDiscountAnalysis('genuine_deal', 1_000, 25_000_000),
      priceHistory: {
        points: [],
        byOffer: {},
        lowestEverPrice: 19_500_000,
        lowestEverDate: null,
        lowestEverMerchant: null,
        highestEverPrice: 21_500_000,
        currentMinPrice: 20_000_000,
        fakeDiscountCount: 0,
        genuineDealCount: 0,
      },
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [],
    });

    const [verdictCardHtml] = baitHtml.split('<table');
    assert.ok(verdictCardHtml);
    assert.ok(
      verdictCardHtml.includes('data-testid="inspect-implausibly-low"')
    );
    assert.ok(
      verdictCardHtml.includes(formatPriceVnd(20_000_000, locale)),
      `${locale}: Verdict Card displays plausible master min_price`
    );
    assert.equal(
      verdictCardHtml.includes(formatPriceVnd(1_000, locale)),
      false,
      `${locale}: Verdict Card never leaks 1,000 VND bait price`
    );
    assert.equal(
      verdictCardHtml.includes(formatPriceVnd(25_000_000, locale)),
      false,
      `${locale}: Verdict Card never leaks bait offer strikethrough price`
    );
    assert.equal(
      verdictCardHtml.includes(inspectMsgs.genuineDiscountBadge),
      false,
      `${locale}: Verdict Card suppresses genuineDiscountBadge on bait offer`
    );
    assert.equal(
      verdictCardHtml.includes(inspectMsgs.fakeSaleWarning),
      false,
      `${locale}: Verdict Card suppresses fakeSaleWarning on bait offer`
    );

    // 2-offer 1,000 VND bait cluster + equal-orig table row in DeepInspectWorkspace SSR:
    const bait1000EqualOrig = makeOffer('bait-1k-eq', 1_000, 'in_stock', 1_000);
    const twoOfferBaitHtml = renderInspect({
      query: bait1000EqualOrig.url,
      matchedType: 'product_listing',
      parsedUrl: parseEcommerceUrlOrQuery(bait1000EqualOrig.url),
      masterProduct: { ...baseMaster, min_price: 1_000 },
      matchedOffer: bait1000EqualOrig,
      allOffers: [
        bait1000EqualOrig,
        makeOffer('equal-orig', 20_000_000, 'in_stock', 20_000_000),
      ],
      discountAnalysis: makeDiscountAnalysis('genuine_deal', 1_000, 25_000_000),
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [],
    });
    const [twoOfferVerdictHtml, twoOfferTableRest] =
      twoOfferBaitHtml.split('<table');
    assert.ok(twoOfferVerdictHtml && twoOfferTableRest);
    assert.ok(
      twoOfferVerdictHtml.includes('data-testid="inspect-implausibly-low"'),
      `${locale}: 2-offer 1,000 VND bait cluster shows inspect-implausibly-low`
    );
    assert.equal(
      twoOfferVerdictHtml.includes(formatPriceVnd(1_000, locale)),
      false,
      `${locale}: 2-offer Verdict Card never leaks 1,000 VND`
    );
    assert.equal(
      twoOfferTableRest.includes('text-decoration-line-through'),
      false,
      `${locale}: Offers Table omits strikethrough when price_original <= price_current`
    );

    // Sold-out / discontinued offers with fake_discount or suspicious_discount
    // render inspect-unavailable and never show fakeSaleWarning or sold-out prices in Verdict Card.
    for (const [unavailableOffer, staleVerdict] of [
      [soldOutOffer, 'fake_discount'],
      [discontinuedOffer, 'suspicious_discount'],
    ] as const) {
      const unavailableHtml = renderInspect({
        query: unavailableOffer.url,
        matchedType: 'product_listing',
        parsedUrl: parseEcommerceUrlOrQuery(unavailableOffer.url),
        masterProduct: { ...baseMaster, min_price: 15_000_000 },
        matchedOffer: unavailableOffer,
        allOffers: [unavailableOffer, inStockPeerA, inStockPeerB],
        discountAnalysis: makeDiscountAnalysis(
          staleVerdict,
          unavailableOffer.price_current,
          unavailableOffer.price_original
        ),
        priceHistory: {
          points: [],
          byOffer: {},
          lowestEverPrice: 19_500_000,
          lowestEverDate: null,
          lowestEverMerchant: null,
          highestEverPrice: 21_500_000,
          currentMinPrice: 20_000_000,
          fakeDiscountCount: 1,
          genuineDealCount: 0,
        },
        reviewSummary: null,
        merchantProfile: null,
        suggestions: [],
      });
      const [unavailVerdictCardHtml] = unavailableHtml.split('<table');
      assert.ok(unavailVerdictCardHtml);
      assert.ok(
        unavailVerdictCardHtml.includes('data-testid="inspect-unavailable"'),
        `${locale}: ${unavailableOffer.id} renders inspect-unavailable badge`
      );
      assert.ok(
        unavailVerdictCardHtml.includes(formatPriceVnd(20_000_000, locale)),
        `${locale}: ${unavailableOffer.id} Verdict Card replaces stale 15M master.min_price with 20M in-stock min_price`
      );
      assert.equal(
        unavailVerdictCardHtml.includes(
          formatPriceVnd(unavailableOffer.price_current, locale)
        ),
        false,
        `${locale}: ${unavailableOffer.id} Verdict Card excludes unavailable price`
      );
      assert.equal(
        unavailVerdictCardHtml.includes(
          formatPriceVnd(unavailableOffer.price_original ?? 0, locale)
        ),
        false,
        `${locale}: ${unavailableOffer.id} Verdict Card excludes unavailable strikethrough`
      );
      assert.equal(
        unavailVerdictCardHtml.includes(inspectMsgs.fakeSaleWarning),
        false,
        `${locale}: ${unavailableOffer.id} Verdict Card suppresses fakeSaleWarning`
      );
      assert.equal(
        unavailVerdictCardHtml.includes(inspectMsgs.genuineDiscountBadge),
        false,
        `${locale}: ${unavailableOffer.id} Verdict Card suppresses genuineDiscountBadge`
      );
    }

    // All-sold-out cluster with null matchedOffer and stale genuine_deal + stale master.min_price:
    // suppresses genuineDiscountBadge and hides PriceWatchButton.
    const watchlistMsgs = messagesForLocale(locale).watchlist;
    const allSoldOutNullMatchHtml = renderInspect({
      query: 'iphone-all-sold-out',
      matchedType: 'master_product',
      parsedUrl: parseEcommerceUrlOrQuery('iphone-all-sold-out'),
      masterProduct: { ...baseMaster, min_price: 15_000_000 },
      matchedOffer: null,
      allOffers: [soldOutOffer, makeOffer('unpriced-in-stock', 0, 'in_stock')],
      discountAnalysis: makeDiscountAnalysis(
        'genuine_deal',
        15_000_000,
        25_000_000
      ),
      priceHistory: {
        points: [],
        byOffer: {},
        lowestEverPrice: 15_000_000,
        lowestEverDate: null,
        lowestEverMerchant: null,
        highestEverPrice: 16_000_000,
        currentMinPrice: null,
        fakeDiscountCount: 0,
        genuineDealCount: 0,
      },
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [],
    });
    const [allSoldOutCardHtml] = allSoldOutNullMatchHtml.split('<table');
    assert.ok(allSoldOutCardHtml);
    assert.equal(
      allSoldOutCardHtml.includes(inspectMsgs.genuineDiscountBadge),
      false,
      `${locale}: all-sold-out null matchedOffer suppresses genuineDiscountBadge`
    );
    assert.equal(
      allSoldOutNullMatchHtml.includes(`>${watchlistMsgs.btnWatch}<`),
      false,
      `${locale}: all-sold-out product with stale master.min_price hides PriceWatchButton`
    );
  }

  // 5. Additional pure helper checks for Round 1 edge cases.
  assert.equal(sanitizeInspectOriginalPriceVnd(20_000_000, 20_000_000), 0);
  assert.equal(sanitizeInspectOriginalPriceVnd(18_000_000, 20_000_000), 0);
  assert.equal(sanitizeInspectOriginalPriceVnd(25_000_000, 0), 0);
  assert.equal(
    sanitizeInspectOriginalPriceVnd(25_000_000, 20_000_000),
    25_000_000
  );
  assert.equal(isInspectOfferBait(bait1000Offer, new Set(), []), true);
  assert.equal(
    resolveInspectMasterMinPriceVnd({
      matchedOffer: bait1000Offer,
      allOffers: [bait1000Offer, inStockPeerA],
      master: { min_price: 1_000 },
    }),
    20_000_000
  );
  assert.equal(
    resolveInspectMasterMinPriceVnd({
      matchedOffer: bait1000Offer,
      allOffers: [bait1000Offer],
      master: { min_price: 1_000 },
    }),
    0
  );
  assert.deepEqual(
    resolveInspectVerdictPrices({
      matchedOffer: {
        id: 'peer-a',
        price_current: 500_000,
        price_original: 25_000_000,
      },
      allOffers: [inStockPeerA, inStockPeerB],
      master: { min_price: 20_000_000, max_price: 21_500_000 },
      priceHistory: null,
    }),
    {
      currentPriceVnd: 20_000_000,
      claimedOriginalVnd: 0,
      historicalLowVnd: 20_000_000,
      historicalHighVnd: 21_500_000,
    }
  );
}

if (typeof require !== 'undefined' && require.main === module) {
  runInspectVerdictGuardsSuite()
    .then(() => {
      console.warn('✅ Inspect verdict guards suite passed');
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
