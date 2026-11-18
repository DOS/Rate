import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import type { HeroMerchantSuggestion } from '../hero-merchants';
import {
  type HeroProductSuggestion,
  withScoringSpecs,
  withoutSpecSheet,
} from '../hero-products';
import {
  MAX_VALID_VND_PRICE,
  parseEcommerceUrlOrQuery,
  type UrlInspectionResult,
} from '../rate-domain';
import {
  buildPopular1v1BattlesForCategory,
  LEADERBOARD_SPEC_FIELDS,
  scoreMasterProductForLeaderboard,
  VALID_LEADERBOARD_CRITERIA,
} from '../leaderboard-engine';

// A catalog row for a client list keeps what cards and links read and drops
// the spec sheet and long texts (DOS/Rate#1353).
const fullRow = {
  id: 'p-1353',
  slug: 'apple-iphone-16-128gb',
  name: 'Apple iPhone 16 128GB',
  min_price: 19_990_000,
  user_rating_weighted: 4.8,
  expert_rating: 9.1,
  metadata: { category_slug: 'smartphones' },
  specifications: {
    category_slug: 'smartphones',
    display: { refresh_rate_hz: 60 },
  },
  spec_provenance: { display: 'registry' },
  expert_review_summary: 'A long expert text',
  description: 'A long description',
} as unknown as MasterProduct;
const slimRow = withoutSpecSheet(fullRow) as MasterProduct &
  Record<string, unknown>;
// The type says what the value is: the dropped texts are null, and a slim row
// is still a catalog row the client components take.
const typedSlim = withoutSpecSheet(fullRow);
const nullDescription: null = typedSlim.description;
const nullSummary: null = typedSlim.expert_review_summary;
const asRow: MasterProduct = typedSlim;
assert.equal(nullDescription, null);
assert.equal(nullSummary, null);
assert.equal(asRow.slug, fullRow.slug);
assert.deepEqual(slimRow.specifications, { category_slug: 'smartphones' });
assert.deepEqual(slimRow.spec_provenance, {});
assert.equal(slimRow.expert_review_summary, null);
assert.equal(slimRow.description, null);
assert.equal(slimRow.min_price, 19_990_000);
assert.equal(slimRow.user_rating_weighted, 4.8);
assert.equal(slimRow.expert_rating, 9.1);
assert.deepEqual(slimRow.metadata, { category_slug: 'smartphones' });
assert.notEqual(slimRow, fullRow, 'the input row is not changed');
assert.equal(
  (fullRow.specifications as { display?: unknown }).display !== undefined,
  true
);

// The category and watchlist pages hand their client lists slim rows.
const page = (route: string) =>
  readFileSync(
    new URL(`../../app/[locale]/${route}/page.tsx`, import.meta.url),
    'utf8'
  );
assert.ok(page('watchlist').includes('catalogProducts.map(withoutSpecSheet)'));
assert.ok(page('smartphones').includes('products.map(withoutSpecSheet)'));

// A row for a client that ranks or pairs products keeps the spec fields the
// scores read: every criterion scores the same as on the full row
// (DOS/Rate#1515).
const fullSheet = (
  category: string,
  overrides: Record<string, unknown>
): Record<string, unknown> => ({
  category_slug: category,
  battery: {
    capacity_mah: 5000,
    charging: '45W wired, 15W wireless',
    fast_charging_w: 45,
    type: 'Li-Ion',
  },
  camera: {
    main_camera: '200 MP, f/1.7, OIS',
    second_camera: '50 MP periscope',
    front_camera: '12 MP',
    video: '8K@30fps',
  },
  connectivity: {
    bluetooth: '5.3',
    location: 'GPS, GLONASS',
    sensors: 'Fingerprint, accelerometer',
    usb: 'USB Type-C 3.2',
  },
  design: { resistance: 'IP68', weight_g: 218, materials: 'Titanium' },
  display: {
    type: 'Dynamic AMOLED 2X, 120Hz',
    refresh_rate_hz: 120,
    protection: 'Gorilla Armor',
    size_inch: 6.8,
  },
  hardware: { chipset: 'Snapdragon 8 Elite', ram_gb: 12, cpu: 'Octa-core' },
  multimedia: { audio_features: 'Stereo speakers', loudspeaker: 'Yes' },
  availability: { status: 'Available', announced: '2025' },
  ...overrides,
});
const scoringCases: Array<[string, Record<string, unknown>]> = [
  ['smartphones', {}],
  ['smartphones', { display: { refresh_rate_hz: 60, type: 'LCD' } }],
  ['smartphones', { camera: {}, multimedia: {} }],
  ['tablets', { battery: { capacity_mah: 10090 } }],
  ['tablets', {}],
  ['laptops', { hardware: { ram_gb: 32, chipset: 'Apple M4' } }],
  ['smartwatches', { battery: { capacity_mah: 400, charging: 'Fast' } }],
  ['earbuds', { battery: { capacity_mah: 300 }, camera: {} }],
];
const scoringRows = scoringCases.map(
  ([category, overrides], idx) =>
    ({
      id: `p-1515-${idx}`,
      slug: `p-1515-${idx}`,
      name: `Product ${idx}`,
      brand: idx % 2 ? 'Samsung' : 'Apple',
      model: `Model ${idx}`,
      min_price: 10_000_000 + idx * 1_000_000,
      max_price: 12_000_000 + idx * 1_000_000,
      merchant_count: 2 + idx,
      user_rating_weighted: 4 + idx / 10,
      expert_rating: 8 + idx / 10,
      ram_gb: 8,
      storage_gb: 256,
      battery_mah: 5000,
      metadata: { category_slug: category },
      specifications: fullSheet(category, overrides),
    }) as unknown as MasterProduct
);
const scoreFields = (
  row: MasterProduct,
  criterion: (typeof VALID_LEADERBOARD_CRITERIA)[number]
) => {
  const { product: _product, ...scores } = scoreMasterProductForLeaderboard(
    row,
    criterion
  );
  return scores;
};
for (const row of scoringRows) {
  const slim = withScoringSpecs(row) as MasterProduct;
  const slimSpecs = slim.specifications as Record<string, unknown>;
  assert.equal(slimSpecs.availability, undefined, 'no unscored spec group');
  assert.equal(
    (slimSpecs.camera as Record<string, unknown> | undefined)?.main_camera,
    undefined,
    'no unscored spec field'
  );
  for (const criterion of VALID_LEADERBOARD_CRITERIA) {
    assert.deepEqual(
      scoreFields(slim, criterion),
      scoreFields(row, criterion),
      `${row.slug} ${criterion}`
    );
  }
}
const pairSlugs = (
  rows: MasterProduct[],
  category: 'smartphones' | 'tablets'
) =>
  buildPopular1v1BattlesForCategory(rows, category).map((b) => [
    b.productA.slug,
    b.productB.slug,
    b.winnerSlug,
  ]);
for (const category of ['smartphones', 'tablets'] as const) {
  assert.deepEqual(
    pairSlugs(
      scoringRows.map((r) => withScoringSpecs(r) as MasterProduct),
      category
    ),
    pairSlugs(scoringRows, category),
    `popular pairs in ${category}`
  );
}
// The scores read no spec field: a criterion score is never derived from
// the specs (DOS/Rate#1143). Any spec a later change reads must be kept.
const engineSrc = readFileSync(
  new URL('../leaderboard-engine.ts', import.meta.url),
  'utf8'
);
const readSpecs = [
  ...engineSrc.matchAll(/\bspecs\??\.([a-z_]+)\??\.([a-z_]+)/g),
];
assert.equal(readSpecs.length, 0, 'the scoring file reads no spec field');
for (const [, group, field] of readSpecs) {
  const kept = (LEADERBOARD_SPEC_FIELDS as Record<string, readonly string[]>)[
    group!
  ];
  assert.ok(kept?.includes(field!), `specs.${group}.${field} is kept`);
}
// The leaderboard and the compare pickers hand their clients scoring rows.
assert.ok(page('leaderboard').includes('products.map(withScoringSpecs)'));
assert.ok(page('compare').includes('catalogCandidates.map(withScoringSpecs)'));
assert.ok(page('compare/[versus]').includes('directory.map(withScoringSpecs)'));

// DOS/Rate#1719: HeroSearchInspector trust badge tones, 0-review suppression,
// 0 VND / unpriced suppression, CompareQuickToggle categoryPath, and tab a11y.
async function testHeroSearchInspector() {
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
    buildHeroCompareItem,
    formatHeroInspectorPriceVnd,
    resolveHeroMerchantTrustBadge,
    resolveHeroReviewAuthenticityDisplay,
    sanitizeHeroInspectorPriceVnd,
  } = await import('../../components/home/HeroSearchInspector');
  const { normalizeTrayItem } =
    await import('../../components/compare/compare-tray');

  assert.equal(resolveHeroMerchantTrustBadge(null), null);
  assert.equal(resolveHeroMerchantTrustBadge({ trust_score: null }), null);
  assert.equal(resolveHeroMerchantTrustBadge({ trust_score: '' }), null);
  assert.equal(resolveHeroMerchantTrustBadge({ trust_score: '0x50' }), null);
  assert.equal(resolveHeroMerchantTrustBadge({ trust_score: '0b1010' }), null);
  assert.equal(resolveHeroMerchantTrustBadge({ trust_score: '0o77' }), null);
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: '\u000085' })?.score,
    85
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: Number.NaN }),
    null
  );

  // Fallback riskScore = 100 - trustScore thresholds (< 20 good, 20..49 warn, >= 50 bad).
  assert.deepEqual(
    resolveHeroMerchantTrustBadge({ trust_score: 81 }, 'subtle'),
    {
      score: 81,
      tone: 'good',
      badgeClass: 'bg-success-subtle text-success',
    }
  );
  assert.deepEqual(
    resolveHeroMerchantTrustBadge({ trust_score: 80 }, 'subtle'),
    {
      score: 80,
      tone: 'warn',
      badgeClass: 'bg-warning-subtle text-warning-emphasis',
    }
  );
  assert.deepEqual(
    resolveHeroMerchantTrustBadge({ trust_score: 51 }, 'solid'),
    {
      score: 51,
      tone: 'warn',
      badgeClass: 'bg-warning text-dark',
    }
  );
  assert.deepEqual(
    resolveHeroMerchantTrustBadge({ trust_score: 50 }, 'solid'),
    {
      score: 50,
      tone: 'bad',
      badgeClass: 'bg-danger text-white',
    }
  );
  assert.deepEqual(
    resolveHeroMerchantTrustBadge({ trust_score: 32 }, 'subtle'),
    {
      score: 32,
      tone: 'bad',
      badgeClass: 'bg-danger-subtle text-danger',
    }
  );

  // Explicit risk_score takes precedence over 100 - trust_score.
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 90, risk_score: 55 })?.tone,
    'bad'
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 90, risk_score: 25 })?.tone,
    'warn'
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 40, risk_score: 10 })?.tone,
    'good'
  );

  // Fractional trust/risk scores near thresholds classify identically in Mode 1 and Mode 2.
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 80.4 }, 'subtle')?.tone,
    resolveHeroMerchantTrustBadge({ trust_score: 80.4, risk_score: 19.6 })?.tone
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 80.4 }, 'subtle')?.tone,
    'good'
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 50.4 }, 'subtle')?.tone,
    resolveHeroMerchantTrustBadge({ trust_score: 50.4, risk_score: 49.6 })?.tone
  );
  assert.equal(
    resolveHeroMerchantTrustBadge({ trust_score: 50.4 }, 'subtle')?.tone,
    'warn'
  );

  // Price bounds and unpriced "-" suppression without trailing "₫".
  for (const invalid of [
    0,
    -500,
    null,
    undefined,
    '',
    '0x100000',
    '0b1010',
    '0o777',
    Number.NaN,
    true,
    MAX_VALID_VND_PRICE + 1,
  ]) {
    assert.equal(sanitizeHeroInspectorPriceVnd(invalid), 0);
    assert.equal(formatHeroInspectorPriceVnd(invalid, 'vi'), '-');
    assert.equal(formatHeroInspectorPriceVnd(invalid, 'cs'), '-');
  }
  assert.equal(formatHeroInspectorPriceVnd(19_990_000, 'vi'), '19.990.000 ₫');
  assert.equal(
    formatHeroInspectorPriceVnd(19_990_000, 'cs'),
    '19\u00a0990\u00a0000\u00a0₫'
  );

  // CompareQuickToggle preserves non-smartphone categorySlug & categoryPath.
  const earbudsItem = buildHeroCompareItem({
    id: 'ear-1',
    slug: 'marshall-motif-ii-anc',
    name: 'Marshall Motif II A.N.C.',
    brand: 'Marshall',
    min_price: 0,
    metadata: { category_slug: 'earbuds' },
    specifications: { category_slug: 'earbuds' },
  } as unknown as HeroProductSuggestion);
  assert.equal(earbudsItem.categorySlug, 'earbuds');
  assert.equal(earbudsItem.categoryPath, '/earbuds');
  assert.equal(earbudsItem.min_price, 0);
  assert.equal(normalizeTrayItem(earbudsItem).categorySlug, 'earbuds');

  const mockRouter: AppRouterInstance = {
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    bfcacheId: 'test',
  };
  const Provider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;
  const renderHero = (
    locale: 'vi' | 'en' | 'cs',
    scope: 'home' | 'contact',
    props: React.ComponentProps<typeof HeroSearchInspector>
  ): string => {
    const fullMessages =
      locale === 'vi' ? viMessages : locale === 'en' ? enMessages : csMessages;
    return renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          Provider,
          {
            locale,
            messages: pickClientMessages(
              fullMessages as unknown as Record<string, unknown>,
              scope
            ),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(HeroSearchInspector, props)
        )
      )
    );
  };

  const heroProducts: HeroProductSuggestion[] = [
    {
      id: 'p-lap',
      slug: 'macbook-air-m3',
      name: 'MacBook Air M3',
      brand: 'Apple',
      model: 'MacBook Air M3',
      model_key: 'apple-macbook-air-m3',
      min_price: 25_990_000,
      merchant_count: 4,
      user_rating_weighted: 4.8,
      metadata: { category_slug: 'laptops' },
      specifications: { category_slug: 'laptops' },
      key_specs: { chip: 'Apple M3' },
    } as unknown as HeroProductSuggestion,
    {
      id: 'p-sold-out',
      slug: 'ipad-mini-sold-out',
      name: 'iPad Mini Sold Out',
      brand: 'Apple',
      model: 'iPad Mini',
      model_key: 'apple-ipad-mini',
      min_price: 0,
      merchant_count: 0,
      user_rating_weighted: 0,
      metadata: { category_slug: 'tablets' },
      specifications: { category_slug: 'tablets' },
      key_specs: {},
    } as unknown as HeroProductSuggestion,
  ];
  const heroMerchants: HeroMerchantSuggestion[] = [
    {
      id: 'm-good',
      name: 'Clean Mall',
      platform: 'shopee',
      platform_shop_id: '101',
      is_official: true,
      trust_score: 92,
      dosafe_risk_score: 8,
    },
    {
      id: 'm-bad',
      name: 'Risky Seller',
      platform: 'lazada',
      platform_shop_id: '102',
      is_official: false,
      trust_score: 35,
      dosafe_risk_score: 65,
    },
  ];
  const warnAndUnknownMerchants: HeroMerchantSuggestion[] = [
    {
      id: 'm-warn',
      name: 'Caution Shop',
      platform: 'tiki',
      platform_shop_id: '103',
      is_official: false,
      trust_score: 65,
      dosafe_risk_score: 35,
    },
    {
      id: 'm-null',
      name: 'Unscored Shop',
      platform: 'shopee',
      platform_shop_id: '104',
      is_official: false,
      trust_score: null,
      dosafe_risk_score: null,
    },
  ];

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const fullMessages =
      locale === 'vi' ? viMessages : locale === 'en' ? enMessages : csMessages;
    for (const scope of ['home', 'contact'] as const) {
      const scopedMessages = pickClientMessages(
        fullMessages as unknown as Record<string, unknown>,
        scope
      );
      const tHero = createTranslator({
        locale,
        messages: scopedMessages as unknown as typeof fullMessages,
        namespace: 'heroSearch',
      });
      const tStar = createTranslator({
        locale,
        messages: scopedMessages as unknown as typeof fullMessages,
        namespace: 'starRating',
      });

      assert.equal(
        resolveHeroReviewAuthenticityDisplay(null, locale, {
          formatAuthentic: (v) => tHero('aiReviewAuthValue', v),
          emptyLabel: tStar('empty'),
        }),
        null
      );
      const zeroReviews = resolveHeroReviewAuthenticityDisplay(
        { total_analyzed: 0, authentic_pct: 100 },
        locale,
        {
          formatAuthentic: (v) => tHero('aiReviewAuthValue', v),
          emptyLabel: tStar('empty'),
        }
      );
      assert.deepEqual(zeroReviews, {
        hasAnalyzedReviews: false,
        text: fullMessages.starRating.empty,
        className: 'text-muted',
      });
      const withReviews = resolveHeroReviewAuthenticityDisplay(
        { total_analyzed: 12, authentic_pct: 91.5 },
        locale,
        {
          formatAuthentic: (v) => tHero('aiReviewAuthValue', v),
          emptyLabel: tStar('empty'),
        }
      );
      assert.equal(withReviews?.hasAnalyzedReviews, true);
      assert.equal(withReviews?.className, 'fw-bold text-success');
      assert.ok(
        withReviews?.text.includes(locale === 'cs' ? '91,5' : '91.5'),
        `${locale}: authentic pct localized`
      );

      const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const switcherBtnPattern = (pressed: boolean, label: string) =>
        new RegExp(
          `<button[^>]*aria-pressed="${pressed}"[^>]*>(?:(?!</button>).)*<svg[^>]*aria-hidden="true"(?:(?!</button>).)*${escRe(label)}</button>`
        );

      // Mode 1 open dropdown: aria-pressed, aria-hidden icons, no 0 VND, subtle trust tones.
      const mode1Html = renderHero(locale, scope, {
        initialProducts: heroProducts,
        initialMerchants: heroMerchants,
        initialMode: 'search',
        initialDropdownOpen: true,
      });
      assert.match(
        mode1Html,
        switcherBtnPattern(true, fullMessages.heroSearch.modeSearchBtn)
      );
      assert.match(
        mode1Html,
        switcherBtnPattern(false, fullMessages.heroSearch.modeInspectBtn)
      );
      assert.doesNotMatch(mode1Html, /\b0[\s\u00a0]₫/);
      assert.doesNotMatch(mode1Html, /NaN[\s\u00a0]*₫/);
      assert.ok(
        mode1Html.includes('>-</div>'),
        `${locale}/${scope}: Mode 1 renders "-" for 0 VND`
      );
      assert.ok(
        mode1Html.includes('bg-success-subtle text-success rounded-pill')
      );
      assert.ok(
        mode1Html.includes('bg-danger-subtle text-danger rounded-pill')
      );

      const mode1WarnHtml = renderHero(locale, scope, {
        initialProducts: heroProducts,
        initialMerchants: warnAndUnknownMerchants,
        initialMode: 'search',
        initialDropdownOpen: true,
      });
      assert.ok(
        mode1WarnHtml.includes(
          'bg-warning-subtle text-warning-emphasis rounded-pill'
        )
      );
      assert.ok(
        mode1WarnHtml.includes(fullMessages.heroSearch.trustBadgeNoData)
      );

      // Mode 2 product + high-risk merchant + 0 reviews + 0 VND:
      const mode2ZeroHtml = renderHero(locale, scope, {
        initialProducts: heroProducts,
        initialMerchants: heroMerchants,
        initialMode: 'inspect',
        initialInspectResult: {
          query: 'https://shopee.vn/item-i.102.999',
          matchedType: 'product_listing',
          parsedUrl: parseEcommerceUrlOrQuery(
            'https://shopee.vn/item-i.102.999'
          ),
          masterProduct: {
            id: 'p-sold-out',
            slug: 'ipad-mini-sold-out',
            name: 'iPad Mini Sold Out',
            brand: 'Apple',
            model: 'iPad Mini',
            min_price: 0,
            images: [],
            metadata: { category_slug: 'tablets' },
          } as unknown as UrlInspectionResult['masterProduct'],
          matchedOffer: null,
          allOffers: [],
          discountAnalysis: null,
          priceHistory: {
            lowestEverPrice: 0,
            highestEverPrice: 0,
            averagePrice: 0,
            observationCount: 0,
            points: [],
          } as unknown as UrlInspectionResult['priceHistory'],
          reviewSummary: {
            total_analyzed: 0,
            authentic_count: 0,
            suspicious_count: 0,
            authentic_pct: 100,
          } as unknown as UrlInspectionResult['reviewSummary'],
          merchantProfile: {
            id: 'm-bad',
            name: 'Risky Seller',
            platform: 'shopee',
            is_official: true,
            risk_score: 68,
            trust_score: 32,
            dosafe_risk_score: 68,
            review_risk_score: 0,
            product_count: 2,
          } as unknown as UrlInspectionResult['merchantProfile'],
          suggestions: [],
        },
      });
      assert.match(
        mode2ZeroHtml,
        switcherBtnPattern(false, fullMessages.heroSearch.modeSearchBtn)
      );
      assert.match(
        mode2ZeroHtml,
        switcherBtnPattern(true, fullMessages.heroSearch.modeInspectBtn)
      );
      assert.doesNotMatch(mode2ZeroHtml, /\b0[\s\u00a0]₫/);
      assert.doesNotMatch(mode2ZeroHtml, /100\s*%/);
      assert.ok(mode2ZeroHtml.includes(fullMessages.starRating.empty));
      assert.ok(
        mode2ZeroHtml.includes(
          `aria-label="${fullMessages.heroSearch.officialMallBadge}"`
        )
      );
      assert.ok(
        mode2ZeroHtml.includes('badge bg-danger text-white rounded-pill')
      );
      assert.ok(
        !mode2ZeroHtml.includes('badge bg-success rounded-pill text-white')
      );

      // Mode 2 shop-only card caution tone (risk_score: 30, trust_score: 70):
      const mode2ShopWarnHtml = renderHero(locale, scope, {
        initialProducts: heroProducts,
        initialMerchants: heroMerchants,
        initialMode: 'inspect',
        initialInspectResult: {
          query: 'https://shopee.vn/shop/103',
          matchedType: 'merchant',
          parsedUrl: parseEcommerceUrlOrQuery('https://shopee.vn/shop/103'),
          masterProduct: null,
          matchedOffer: null,
          allOffers: [],
          discountAnalysis: null,
          priceHistory: null,
          reviewSummary: null,
          merchantProfile: {
            id: 'm-warn',
            name: 'Caution Shop',
            platform: 'shopee',
            is_official: false,
            risk_score: 30,
            trust_score: 70,
            dosafe_risk_score: 30,
            review_risk_score: 0,
            review_risk_breakdown: null,
            product_count: 5,
          } as unknown as UrlInspectionResult['merchantProfile'],
          suggestions: [],
        },
      });
      assert.ok(
        mode2ShopWarnHtml.includes('badge bg-warning text-dark rounded-pill')
      );
    }
  }

  console.log(
    'hero-products: withoutSpecSheet, withScoringSpecs, and #1719 HeroSearchInspector passed'
  );
}

testHeroSearchInspector().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
