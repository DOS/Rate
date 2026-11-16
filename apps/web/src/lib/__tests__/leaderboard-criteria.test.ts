import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import DealFinderWorkspace from '../../components/deals/DealFinderWorkspace';
import LeaderboardExplorer from '../../components/leaderboard/LeaderboardExplorer';
import ProductOffersExplorer from '../../components/leaderboard/ProductOffersExplorer';
import { radarLabel, radarMarkdownCell, type RadarSignal } from '../deal-radar';
import { discountVerdictCopy } from '../discount-verdict-copy';
import {
  computeJReviewsCriteriaScores,
  computeProductStandingInCategory,
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
  sharedScoredCriteria,
  weightedCriteriaScore5,
} from '../leaderboard-engine';
import type {
  MasterProduct,
  MerchantOffer,
  OfferDiscountAnalysis,
} from '../rate-api';

// Per-criterion scores are real or null, never derived from the star rating
// (DOS/Rate#1143): a well-rated product used to score 5.00 on every
// criterion, so rankings tied and "#1 Màn hình" chips were invented.

const phone = (
  slug: string,
  rating: number,
  criteria?: Record<string, number>
): MasterProduct =>
  ({
    id: `id-${slug}`,
    slug,
    name: slug,
    brand: 'Brand',
    model: slug,
    user_rating_weighted: rating,
    min_price: 20_000_000,
    specifications: {
      display: { refresh_rate_hz: 120 },
      hardware: { ram_gb: 16 },
      battery: { capacity_mah: 6000 },
      camera: { second_camera: '50 MP' },
    },
    metadata: { category_slug: 'smartphones' },
    ...(criteria ? { expert_criteria_scores: criteria } : {}),
  }) as unknown as MasterProduct;

const NONE = {
  screen: null,
  performance: null,
  camera: null,
  battery: null,
  value: null,
};

// A 4.9-star phone with strong specs and no criterion scores has none.
const rated = scoreMasterProductForLeaderboard(phone('rated-a', 4.9));
assert.deepEqual(rated.criteria, NONE);
// Its combined score is its user score alone, not lifted by invented
// criteria.
assert.equal(rated.combinedScore5, 4.9);

// Stored criterion scores are real: they show (a 10-point one is halved), and
// they join the combined score.
const scored = scoreMasterProductForLeaderboard(
  phone('scored-b', 4.5, { screen: 9, battery: 4 })
);
assert.equal(scored.criteria.screen, 4.5);
assert.equal(scored.criteria.battery, 4);
assert.equal(scored.criteria.camera, null);
assert.equal(
  scored.combinedScore5,
  Number((4.5 * 0.8 + 4.25 * 0.2).toFixed(2))
);

// Earbuds have no screen criterion, even with a stored score for it.
const buds = computeJReviewsCriteriaScores({
  ...phone('buds', 4.8, { screen: 4.9, sound: 4.7 }),
  metadata: { category_slug: 'earbuds' },
} as unknown as MasterProduct);
assert.equal(buds.screen, null);
assert.equal(buds.camera, 4.7);

// A criterion ranking lists only products with a real score on it.
const peers = [
  phone('rated-a', 4.9),
  phone('rated-c', 4.95),
  phone('scored-b', 4.5, { screen: 9, battery: 4 }),
];
assert.deepEqual(
  rankMasterProductsForLeaderboard(peers, {
    category: 'smartphones',
    criterion: 'screen',
  }).map((r) => r.slug),
  ['scored-b']
);
assert.deepEqual(
  rankMasterProductsForLeaderboard(peers, {
    category: 'smartphones',
    criterion: 'camera',
  }),
  []
);

// Rank chips: a product without criterion data gets only its overall rank,
// and a criterion with one scored product ranks nothing ("#1 of 1").
const badgesFor = (slug: string, list: MasterProduct[]) =>
  computeProductStandingInCategory(
    list.find((p) => p.slug === slug)!,
    list
  ).map((b) => `${b.criterion}#${b.rank}/${b.totalInCategory}`);
assert.deepEqual(badgesFor('rated-a', peers), ['combined#2/3']);
assert.deepEqual(badgesFor('scored-b', peers), ['combined#3/3']);
// With two scored products, the criterion ranks among those two only.
const twoScored = [...peers, phone('scored-d', 4.4, { screen: 8 })];
assert.deepEqual(badgesFor('scored-b', twoScored), [
  'combined#3/4',
  'screen#1/2',
]);

// Weighted criteria: only scored, weighted criteria count; none gives null.
const w = { screen: 20, performance: 20, camera: 20, battery: 20, value: 20 };
assert.equal(weightedCriteriaScore5(NONE, w), null);
assert.equal(
  weightedCriteriaScore5({ ...NONE, screen: 4, battery: 5 }, w),
  4.5
);
assert.equal(
  weightedCriteriaScore5({ ...NONE, screen: 4, battery: 5 }, w, ['battery']),
  5
);
assert.deepEqual(
  sharedScoredCriteria(
    { ...NONE, screen: 4, battery: 5 },
    { ...NONE, battery: 3, value: 4 }
  ),
  ['battery']
);

// The user score is the rating the pages show (resolveCompareEffectiveUserRating,
// DOS/Rate#1545): the stored score first, else the weighted rating, else the
// average, each brought to 0-5 the same way.
const withRatings = (ratings: Record<string, number | null>) =>
  scoreMasterProductForLeaderboard({
    ...phone('ratings', 0),
    ...ratings,
  } as unknown as MasterProduct).userScore5;
assert.equal(
  withRatings({ rating_score: 4.814, user_rating_weighted: 4.2 }),
  4.814
);
assert.equal(withRatings({ rating_score: 0, user_rating_weighted: 4.3 }), 4.3);
// A zero weighted rating falls back to the average, then scaled: 9/10 is 4.5.
assert.equal(withRatings({ user_rating_weighted: 0, average_rating: 9 }), 4.5);
// A 0-100 average is 4.5 too; the engine used to read anything above 10 as 0.
assert.equal(
  withRatings({ user_rating_weighted: null, average_rating: 90 }),
  4.5
);
assert.equal(
  withRatings({ user_rating_weighted: null, average_rating: null }),
  0
);

// DOS/Rate#1694: ProductOffersExplorer filter a11y, LeaderboardExplorer active
// persona labels, localized Deal Radar / verdict Markdown helpers, and
// zero-row ranked-deals export disabling.
{
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const webSrcDir = path.resolve(testDir, '../..');

  const Provider = NextIntlClientProvider as React.ComponentType<{
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

  const sampleOffers: MerchantOffer[] = [
    {
      id: 'offer-shopee-1',
      platform: 'shopee',
      title: 'Galaxy S25 256GB Official',
      price_current: 19_990_000,
      price_original: 22_990_000,
      url: '',
      availability: 'in_stock',
      merchant: {
        id: '',
        name: 'Samsung Official Store',
        platform: 'shopee',
        is_official: true,
        risk_score: 10,
        dosafe_risk_score: 10,
      },
    } as unknown as MerchantOffer,
    {
      id: 'offer-lazada-1',
      platform: 'lazada',
      title: 'Galaxy S25 256GB LazMall',
      price_current: 20_490_000,
      price_original: null,
      url: '',
      availability: 'in_stock',
      merchant: {
        id: '',
        name: 'LazMall Flagship',
        platform: 'lazada',
        is_official: false,
        risk_score: 35,
        dosafe_risk_score: 35,
      },
    } as unknown as MerchantOffer,
  ];

  const genuineRadarSignal: RadarSignal = {
    verdict: 'genuine_deal',
    savingsPct: 12.5,
    fakeMarkupPct: 0,
    spreadPct: 8.4,
    genuineDeal: {
      id: 'deal-1',
      verdict: 'genuine_all_time_low',
      verdictBadgeVi: 'Đáy giá đa sàn',
      productSlug: 'scored-b',
      productName: 'scored-b',
      brand: 'Brand',
      categorySlug: 'smartphones',
      productHref: '/smartphones/scored-b',
      imageUrl: null,
      platform: 'shopee',
      merchantId: 'm1',
      merchantName: 'Store A',
      isOfficialMall: true,
      merchantRiskScore: 10,
      offerUrl: 'https://shopee.vn/item',
      priceCurrent: 19_990_000,
      priceOriginal: 22_990_000,
      marketMedianPrice: 22_850_000,
      marketMinPrice: 19_990_000,
      marketMaxPrice: 23_990_000,
      savingsVsMedianVnd: 2_860_000,
      savingsVsMedianPct: 12.5,
      marketOfferCount: 3,
      claimedDiscountPct: 13,
      fakeMarkupPct: 0,
      jreviewsScore10: 9.0,
      explanationVi: 'Giá thấp nhất 3 gian hàng.',
    },
    fakeSaleTrap: null,
    priceSpread: null,
  };

  const fakeDiscountAnalysis = {
    verdict: 'fake_discount',
    price_current: 20_000_000,
    price_original: 28_000_000,
    historical_median_price: 20_000_000,
    historical_max_price: 21_000_000,
    claimed_discount_pct: 28.6,
    real_discount_vs_median_pct: 0,
  } as unknown as OfferDiscountAnalysis;

  const dealProduct = {
    ...phone('deal-phone', 4.6, { value: 4.5, camera: 4.4 }),
    min_price: 18_500_000,
    max_price: 20_500_000,
  } as unknown as MasterProduct;

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const fullMessages = localeCatalogs[locale];
    const providerMessages = fullMessages as unknown as Record<string, unknown>;

    // 1. ProductOffersExplorer SSR a11y: role="group" + aria-pressed without breaking WCAG 2.5.3.
    const offersHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: providerMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(ProductOffersExplorer, {
          productName: 'Galaxy S25',
          productSlug: 'galaxy-s25',
          offers: sampleOffers,
          byOffer: {},
          radarSignal: genuineRadarSignal,
        })
      )
    );

    const expectedGroupLabel =
      fullMessages.productDetail.offersColPlatformMerchant;
    const groupMatch = offersHtml.match(
      /<div[^>]*\brole="group"[^>]*\baria-label="([^"]+)"[^>]*>([\s\S]*?)<\/div>/
    );
    assert.ok(
      groupMatch,
      `${locale}: platform filter pills must use role=group`
    );
    assert.equal(groupMatch[1], expectedGroupLabel);

    const groupButtons = [
      ...groupMatch[2]!.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
    ];
    assert.equal(
      groupButtons.length,
      3,
      `${locale}: All + 2 platform filter buttons`
    );
    assert.match(groupButtons[0]![1]!, /\baria-pressed="true"/);
    assert.doesNotMatch(groupButtons[0]![1]!, /\baria-label(?:ledby)?=/);
    assert.equal(
      groupButtons[0]![2],
      fullMessages.productDetail.offersFilterAll.replace('{count}', '2')
    );
    assert.match(groupButtons[1]![1]!, /\baria-pressed="false"/);
    assert.doesNotMatch(groupButtons[1]![1]!, /\baria-label(?:ledby)?=/);
    assert.equal(groupButtons[1]![2], 'shopee (1)');
    assert.match(groupButtons[2]![1]!, /\baria-pressed="false"/);
    assert.doesNotMatch(groupButtons[2]![1]!, /\baria-label(?:ledby)?=/);
    assert.equal(groupButtons[2]![2], 'lazada (1)');

    const officialText = fullMessages.productDetail.offersOfficialOnlyBtn;
    const highTrustText = fullMessages.productDetail.offersHighTrustOnlyBtn;
    const allButtons = [
      ...offersHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
    ];
    const officialBtn = allButtons.find(([, , text]) => text === officialText);
    const highTrustBtn = allButtons.find(([, , text]) =>
      text?.replace(/&gt;/g, '>').includes(highTrustText)
    );
    assert.ok(officialBtn, `${locale}: officialOnly button rendered`);
    assert.match(officialBtn[1]!, /\baria-pressed="false"/);
    assert.doesNotMatch(officialBtn[1]!, /\baria-label(?:ledby)?=/);
    assert.ok(highTrustBtn, `${locale}: highTrustOnly button rendered`);
    assert.match(highTrustBtn[1]!, /\baria-pressed="false"/);
    assert.doesNotMatch(highTrustBtn[1]!, /\baria-label(?:ledby)?=/);

    // 2. DealFinderWorkspace SSR: 3 ranked-deals export buttons disable iff rankedDeals.length === 0.
    const emptyDealsHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: providerMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(DealFinderWorkspace, {
          products: [],
        })
      )
    );
    for (const testId of [
      'deals-copy-md-btn',
      'deals-export-csv-btn',
      'deals-export-json-btn',
    ]) {
      const btnMatch = emptyDealsHtml.match(
        new RegExp(`<button\\b([^>]*data-testid="${testId}"[^>]*)>`)
      );
      assert.ok(btnMatch, `${locale}: ${testId} present when empty`);
      assert.match(
        btnMatch[1]!,
        /\bdisabled(?:="")?(?:\s|$)/,
        `${locale}: ${testId} must be disabled when rankedDeals is empty`
      );
    }

    const populatedDealsHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: providerMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(DealFinderWorkspace, {
          products: [dealProduct],
        })
      )
    );
    for (const testId of [
      'deals-copy-md-btn',
      'deals-export-csv-btn',
      'deals-export-json-btn',
    ]) {
      const btnMatch = populatedDealsHtml.match(
        new RegExp(`<button\\b([^>]*data-testid="${testId}"[^>]*)>`)
      );
      assert.ok(btnMatch, `${locale}: ${testId} present when populated`);
      assert.doesNotMatch(
        btnMatch[1]!,
        /\bdisabled\b/,
        `${locale}: ${testId} must stay enabled when rankedDeals has rows`
      );
    }

    // 3. LeaderboardExplorer SSR default view renders criterion label when activePersona === 'none'.
    const leaderboardHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: providerMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(LeaderboardExplorer, {
          products: [dealProduct],
          locale,
        })
      )
    );
    assert.ok(
      leaderboardHtml.includes(fullMessages.leaderboard.critCombined),
      `${locale}: default leaderboard renders critCombined when activePersona is none`
    );

    // 4. Radar & verdict helper outputs follow active locale instead of defaulting to Vietnamese.
    const mdCell = radarMarkdownCell(genuineRadarSignal, locale);
    const labelStr = radarLabel(genuineRadarSignal, 0, locale);
    assert.equal(mdCell, labelStr);
    if (locale !== 'vi') {
      assert.doesNotMatch(
        mdCell,
        /Đáy giá đa sàn|Dưới giá trung vị/,
        `${locale}: radarMarkdownCell must not emit Vietnamese`
      );
    }
    const tVerdict = createTranslator({
      locale,
      messages: fullMessages,
      namespace: 'priceVerdict',
    });
    const verdictCopy = discountVerdictCopy(
      tVerdict,
      fakeDiscountAnalysis,
      locale
    );
    assert.equal(verdictCopy.label, fullMessages.priceVerdict.labelFake);
    if (locale === 'cs') {
      assert.match(verdictCopy.explanation, /28,6/);
    }
  }

  // 5. Source-level guards for activePersona label ternary and locale forwarding across all 6 files.
  const leaderboardSrc = fs.readFileSync(
    path.join(webSrcDir, 'components/leaderboard/LeaderboardExplorer.tsx'),
    'utf8'
  );
  const personaTernaryRe =
    /activePersona\s*!==\s*'none'\s*\?\s*copy\.personaLabels\[activePersona\]\s*:\s*copy\.critLabels\[activeCriterion\]/g;
  assert.equal(
    [...leaderboardSrc.matchAll(personaTernaryRe)].length,
    3,
    'LeaderboardExplorer must render personaLabels[activePersona] ternary in Markdown heading, podium badge, and ranked row caption'
  );
  assert.equal(
    [
      ...leaderboardSrc
        .replace(personaTernaryRe, '')
        .matchAll(/copy\.critLabels\[activeCriterion\]/g),
    ].length,
    0,
    'LeaderboardExplorer must have no unconditional copy.critLabels[activeCriterion] left'
  );

  const radarLocaleFiles = [
    'components/leaderboard/ProductOffersExplorer.tsx',
    'components/leaderboard/LeaderboardExplorer.tsx',
    'components/leaderboard/CategoryCatalogToolbar.tsx',
    'components/leaderboard/ProductSpecsExportToolbar.tsx',
    'components/leaderboard/ProductShareAuditButton.tsx',
    'components/deals/DealFinderWorkspace.tsx',
  ] as const;

  for (const relPath of radarLocaleFiles) {
    const src = fs.readFileSync(path.join(webSrcDir, relPath), 'utf8');
    assert.match(src, /\buseLocale\b/, `${relPath} must read useLocale()`);
    for (const match of src.matchAll(
      /\bradarMarkdownCell\(((?:[^()]+|\([^()]*\))*)\)/g
    )) {
      assert.match(
        match[1]!,
        /,\s*locale\s*$/,
        `${relPath}: radarMarkdownCell(${match[1]}) must pass locale`
      );
    }
    for (const match of src.matchAll(
      /\bradarLabel\(((?:[^()]+|\([^()]*\))*)\)/g
    )) {
      assert.match(
        match[1]!,
        /,\s*0\s*,\s*locale\s*$/,
        `${relPath}: radarLabel(${match[1]}) must pass (signal, 0, locale)`
      );
    }
    for (const match of src.matchAll(
      /\bdiscountVerdictCopy\(((?:[^()]+|\([^()]*\))*)\)/g
    )) {
      assert.match(
        match[1]!,
        /,\s*locale\s*$/,
        `${relPath}: discountVerdictCopy(${match[1]}) must pass locale`
      );
    }
  }
}

console.log('leaderboard-criteria: criterion scores are real or null');
