import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  getItemSlugsFor,
  whenItemModel,
} from '../../server/rate/item-directory';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import CompareWorkspace, {
  COMPARE_ITEM_LOOKUP_RETRY_MS,
  COMPARE_ITEM_LOOKUP_TIMEOUT_MS,
  COMPARE_REPLACE_FOCUS_DELAY_MS,
  MAX_COMPARE_ITEM_LOOKUP_ATTEMPTS,
  applyCompareItemLookupOutcomes,
  buildCompareMarkdownMinPriceRow,
  buildCompareVersusSlugMap,
  cancelPendingCompareReplaceFocus,
  computeCompareHeadToHeadSummary,
  formatComparePriceVnd,
  isSameCompareVersusItem,
  isValidCompareVersusPair,
  nextCompareReplaceState,
  parseCompareItemLookupAnswer,
  pickBestBattery,
  pickHighestMemory,
  pickLowestPrice,
  planCompareItemLookupBatch,
  resolveCompareAddSlotAriaLabel,
  resolveComparePopularBattles,
  resolveCompareReplaceButtonA11y,
  sanitizeComparePriceVnd,
  scheduleCompareReplaceFocus,
  shouldDismissCompareOnOutsidePointerDown,
  startCompareItemLookup,
  syncCompareReplaceFocusState,
  type CompareItemLookupFailure,
} from '../../components/compare/CompareWorkspace';
import VersusInteractiveScoreboard, {
  buildVersusMarkdownMinPriceRow,
  formatVersusPriceVnd,
  resolveVersusScoreMinPriceVnd,
  sanitizeVersusPriceVnd,
} from '../../components/compare/VersusInteractiveScoreboard';
import DealFinderWorkspace, {
  buildDealRadarCsvRows,
  buildDealRadarMarkdown,
  buildDealsMarkdown,
  filterValidRadarDeals,
  filterValidRadarSpreads,
  formatDealRadarPriceVnd,
  rankProductsForDealFinder,
  resolveClaimedOriginalPriceVnd,
  sanitizeDealFinderBudgetVnd,
  sanitizeDealRadarPriceVnd,
} from '../../components/deals/DealFinderWorkspace';
import CategoryCatalogToolbar, {
  buildCatalogCsvRow,
  buildCatalogItemSlugMap,
  sanitizeCatalogPriceVnd,
} from '../../components/leaderboard/CategoryCatalogToolbar';
import LeaderboardExplorer, {
  buildLeaderboardCsvRow,
  buildLeaderboardItemSlugMap,
  buildLeaderboardMarkdownRow,
  encodeLeaderboardCompareSlug,
  formatLeaderboardDisplayPriceVnd,
  formatLeaderboardPriceVnd,
  formatLeaderboardShowdownDelta,
  isSameLeaderboardVersusItem,
  leaderboardCompareHref,
  resolveLeaderboardActiveScoreLabel,
  resolveLeaderboardCompareEntries,
  resolveLeaderboardCompareSlugs,
  resolveLeaderboardEffectiveVersusSlugs,
  sanitizeLeaderboardPriceVnd,
} from '../../components/leaderboard/LeaderboardExplorer';
import ProductOffersExplorer from '../../components/leaderboard/ProductOffersExplorer';
import { pickClientMessages } from '../client-messages';
import {
  EMPTY_RADAR_SIGNAL,
  buildRadarIndex,
  radarLabel,
  radarMarkdownCell,
  type CrossPlatformDealRadarItem,
  type CrossPlatformDealRadarResponse,
  type CrossPlatformPriceSpreadItem,
  type RadarSignal,
} from '../deal-radar';
import { discountVerdictCopy } from '../discount-verdict-copy';
import { compareTarget, parseCompareToken, versusHref } from '../item-compare';
import type { ItemCatalogRow } from '../item-directory';
import { NBSP, formatNumber } from '../locale-format';
import { MAX_VALID_VND_PRICE } from '../rate-domain';
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

    const lbCopy = {
      personaLabels: {
        none: fullMessages.leaderboard.personaNone,
        photography: fullMessages.leaderboard.personaPhotography,
        gaming: fullMessages.leaderboard.personaGaming,
        endurance: fullMessages.leaderboard.personaEndurance,
        business: fullMessages.leaderboard.personaBusiness,
        value_hunter: fullMessages.leaderboard.personaValueHunter,
        custom: fullMessages.leaderboard.personaCustom,
      },
      critLabels: {
        combined: fullMessages.leaderboard.critCombined,
        user: fullMessages.leaderboard.critUser,
        expert: fullMessages.leaderboard.critExpert,
        screen: fullMessages.leaderboard.critScreen,
        performance: fullMessages.leaderboard.critPerformance,
        camera: fullMessages.leaderboard.critCamera,
        battery: fullMessages.leaderboard.critBattery,
        value: fullMessages.leaderboard.critValue,
      },
    } as const;

    assert.equal(
      resolveLeaderboardActiveScoreLabel('none', 'combined', lbCopy),
      lbCopy.critLabels.combined
    );
    assert.equal(
      resolveLeaderboardActiveScoreLabel('none', 'battery', lbCopy),
      lbCopy.critLabels.battery
    );
    for (const preset of [
      'photography',
      'gaming',
      'endurance',
      'business',
      'value_hunter',
      'custom',
    ] as const) {
      assert.equal(
        resolveLeaderboardActiveScoreLabel(preset, 'combined', lbCopy, 100),
        lbCopy.personaLabels[preset],
        `${locale}: active persona ${preset} resolves to personaLabels[${preset}]`
      );
    }
    assert.equal(
      resolveLeaderboardActiveScoreLabel('custom', 'combined', lbCopy, 0),
      lbCopy.critLabels.combined,
      `${locale}: zero-sum custom weights fall back to active criterion label`
    );

    // 4. Radar & verdict helper outputs follow active locale instead of defaulting to Vietnamese.
    const mdCell = radarMarkdownCell(genuineRadarSignal, locale);
    const labelStr = radarLabel(genuineRadarSignal, 0, locale);
    assert.equal(mdCell, labelStr);
    assert.equal(radarLabel(EMPTY_RADAR_SIGNAL, 0, locale), '');
    assert.equal(radarMarkdownCell(EMPTY_RADAR_SIGNAL, locale), '-');
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

  // 5. Source-level guards for activeScoreLabel wiring and locale forwarding across all 6 files.
  const leaderboardSrc = fs.readFileSync(
    path.join(webSrcDir, 'components/leaderboard/LeaderboardExplorer.tsx'),
    'utf8'
  );
  assert.equal(
    [
      ...leaderboardSrc.matchAll(
        /(?:\$\{activeScoreLabel\}|\{activeScoreLabel\})/g
      ),
    ].length,
    3,
    'LeaderboardExplorer must render activeScoreLabel in Markdown heading, podium badge, and ranked row caption'
  );
  assert.equal(
    [
      ...leaderboardSrc
        .replace(/copy\.critLabels\[activeCriterion\]/, '')
        .matchAll(/copy\.critLabels\[activeCriterion\]/g),
    ].length,
    0,
    'LeaderboardExplorer must reference copy.critLabels[activeCriterion] only inside resolveLeaderboardActiveScoreLabel'
  );

  const shareAuditSrc = fs.readFileSync(
    path.join(webSrcDir, 'components/leaderboard/ProductShareAuditButton.tsx'),
    'utf8'
  );
  assert.match(
    shareAuditSrc,
    /radarSignalLabel\s*\?\s*\[t\('shareAuditMdRadar'/,
    'ProductShareAuditButton must gate shareAuditMdRadar on non-empty radarSignalLabel'
  );

  const radarLocaleFiles = [
    'components/leaderboard/ProductOffersExplorer.tsx',
    'components/leaderboard/LeaderboardExplorer.tsx',
    'components/leaderboard/CategoryCatalogToolbar.tsx',
    'components/leaderboard/ProductSpecsExportToolbar.tsx',
    'components/leaderboard/ProductShareAuditButton.tsx',
    'components/deals/DealFinderWorkspace.tsx',
  ] as const;

  const findCallArgumentLists = (source: string, fnName: string): string[] => {
    const results: string[] = [];
    const token = `${fnName}(`;
    let searchFrom = 0;
    while (searchFrom < source.length) {
      const idx = source.indexOf(token, searchFrom);
      if (idx === -1) break;
      const prevChar = idx > 0 ? source[idx - 1]! : '';
      if (prevChar && /[A-Za-z0-9_]/.test(prevChar)) {
        searchFrom = idx + token.length;
        continue;
      }
      const argsStart = idx + token.length;
      let depth = 1;
      let cursor = argsStart;
      while (cursor < source.length && depth > 0) {
        const ch = source[cursor];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        cursor++;
      }
      assert.equal(
        depth,
        0,
        `${fnName}(...) call at offset ${idx} must have balanced parentheses`
      );
      results.push(source.slice(argsStart, cursor - 1));
      searchFrom = cursor;
    }
    return results;
  };

  const endsWithLocaleArg = (args: string): boolean => {
    const withoutTrailingWs = args.trimEnd();
    return (
      withoutTrailingWs.endsWith('locale') &&
      withoutTrailingWs.slice(0, -'locale'.length).trimEnd().endsWith(',')
    );
  };

  const endsWithZeroAndLocaleArgs = (args: string): boolean => {
    const withoutTrailingWs = args.trimEnd();
    const beforeLocale = withoutTrailingWs.endsWith('locale')
      ? withoutTrailingWs.slice(0, -'locale'.length).trimEnd()
      : '';
    const beforeSecondComma = beforeLocale.endsWith(',')
      ? beforeLocale.slice(0, -1).trimEnd()
      : '';
    const beforeZero = beforeSecondComma.endsWith('0')
      ? beforeSecondComma.slice(0, -1).trimEnd()
      : '';
    return beforeZero.endsWith(',');
  };

  for (const relPath of radarLocaleFiles) {
    const src = fs.readFileSync(path.join(webSrcDir, relPath), 'utf8');
    assert.match(src, /\buseLocale\b/, `${relPath} must read useLocale()`);
    let matchedCalls = 0;
    for (const args of findCallArgumentLists(src, 'radarMarkdownCell')) {
      matchedCalls++;
      assert.ok(
        endsWithLocaleArg(args),
        `${relPath}: radarMarkdownCell(${args}) must pass locale`
      );
    }
    for (const args of findCallArgumentLists(src, 'radarLabel')) {
      matchedCalls++;
      assert.ok(
        endsWithZeroAndLocaleArgs(args),
        `${relPath}: radarLabel(${args}) must pass (signal, 0, locale)`
      );
    }
    for (const args of findCallArgumentLists(src, 'discountVerdictCopy')) {
      matchedCalls++;
      assert.ok(
        endsWithLocaleArg(args),
        `${relPath}: discountVerdictCopy(${args}) must pass locale`
      );
    }
    assert.ok(
      matchedCalls > 0,
      `${relPath}: expected at least one localized radar/verdict helper call`
    );
  }
}

// DOS/Rate#1704: Compare headToHeadSummary tie & empty-shell suppression,
// 0 VND sold-out/unpriced suppression, Leaderboard 1v1 tie delta suppression,
// and Compare matrix slot WCAG 4.1.2 / 2.4.6 / 2.5.3 a11y.
{
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const webSrcDir = path.resolve(testDir, '../..');

  type SharedCompareProduct = Parameters<
    typeof computeCompareHeadToHeadSummary
  >[0][number];
  const makeCompareProduct = (
    slug: string,
    overrides: Partial<Record<string, unknown>> = {}
  ): SharedCompareProduct =>
    ({
      id: `id-${slug}`,
      slug,
      name: slug,
      brand: 'Brand',
      model: slug,
      category_id: 'smartphones',
      metadata: { category_slug: 'smartphones' },
      min_price: 0,
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
      rating_score: 0,
      user_rating_weighted: 0,
      average_rating: 0,
      authentic_review_count: 0,
      total_reviews: 0,
      key_specs: {},
      specifications: {},
      ...overrides,
    }) as unknown as SharedCompareProduct;

  const pA = makeCompareProduct('phone-a', {
    name: 'Phone A',
    rating_score: 4.84,
    ram_gb: 8,
    storage_gb: 256,
    battery_mah: 5000,
    min_price: 19_990_000,
  });
  const pB = makeCompareProduct('phone-b', {
    name: 'Phone B',
    rating_score: 4.76,
    ram_gb: 8,
    storage_gb: 256,
    battery_mah: 5000,
    min_price: 19_990_000,
  });
  const pC = makeCompareProduct('phone-c', {
    name: 'Phone C',
    rating_score: 4.9,
    ram_gb: 12,
    storage_gb: 512,
    battery_mah: 5500,
    min_price: 24_990_000,
  });
  const pUnpriced = makeCompareProduct('phone-unpriced', {
    name: 'Phone Unpriced',
    rating_score: 4.8,
    ram_gb: 8,
    storage_gb: 256,
    battery_mah: 5000,
    min_price: 0,
  });

  // 1. pickLowestPrice requires >= 2 positive prices and no tie at the bottom.
  assert.equal(pickLowestPrice([pUnpriced, makeCompareProduct('u2')]), null);
  assert.equal(pickLowestPrice([pA, pUnpriced]), null);
  assert.equal(
    pickLowestPrice([
      pUnpriced,
      pA,
      makeCompareProduct('u3', { min_price: null }),
    ]),
    null
  );
  assert.equal(pickLowestPrice([pA, pB]), null);
  assert.equal(pickLowestPrice([pA, pB, pC]), null);
  assert.equal(pickLowestPrice([pC, pA])?.slug, 'phone-a');
  assert.equal(pickLowestPrice([pC, pA, pUnpriced])?.slug, 'phone-a');

  // 2. pickHighestMemory & pickBestBattery suppress ties and return strict leaders.
  assert.equal(
    pickHighestMemory([makeCompareProduct('m1'), makeCompareProduct('m2')]),
    null
  );
  assert.equal(pickHighestMemory([pA, pB]), null);
  assert.equal(
    pickHighestMemory([
      pA,
      pB,
      makeCompareProduct('m-low', { ram_gb: 6, storage_gb: 128 }),
    ]),
    null
  );
  assert.equal(pickHighestMemory([pA, pC])?.slug, 'phone-c');
  assert.equal(
    pickBestBattery([makeCompareProduct('b1'), makeCompareProduct('b2')]),
    null
  );
  assert.equal(pickBestBattery([pA, pB]), null);
  assert.equal(
    pickBestBattery([
      pA,
      pB,
      makeCompareProduct('b-low', { battery_mah: 4500 }),
    ]),
    null
  );
  assert.equal(pickBestBattery([pA, pC])?.slug, 'phone-c');

  // 3. computeCompareHeadToHeadSummary returns null when < 2 items or all 4 winners are null.
  assert.equal(computeCompareHeadToHeadSummary([pC]), null);
  assert.equal(computeCompareHeadToHeadSummary([pA, pB]), null);
  assert.equal(computeCompareHeadToHeadSummary([pA, pUnpriced]), null);
  const mixedSummary = computeCompareHeadToHeadSummary([pA, pC]);
  assert.ok(mixedSummary);
  assert.equal(mixedSummary.bestRated?.slug, 'phone-c');
  assert.equal(mixedSummary.lowestPrice?.slug, 'phone-a');
  assert.equal(mixedSummary.highestMemory?.slug, 'phone-c');
  assert.equal(mixedSummary.bestBattery?.slug, 'phone-c');

  // 4. 0 VND / unpriced suppression & 1v1 tie delta suppression across vi, en, cs.
  assert.equal(formatLeaderboardPriceVnd(-100), '0 ₫');
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

  const removeParentheticals = (value: string): string => {
    let prev: string;
    let current = value;
    do {
      prev = current;
      current = current.replace(/\([^()]*\)/g, '');
    } while (current !== prev);
    return current;
  };
  const axeCurateTokens = (value: string): string[] => {
    const normalized = removeParentheticals(
      value.toLowerCase().normalize('NFKD')
    ).replace(/[^\p{L}\p{N}]+/gu, ' ');
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    const tokens: string[] = [];
    for (const part of segmenter.segment(normalized)) {
      const trimmed = part.segment.trim();
      if (trimmed) tokens.push(trimmed);
    }
    return tokens;
  };
  const isAxeLabelContainedInName = (
    visibleText: string,
    accessibleName: string
  ): boolean => {
    const needle = axeCurateTokens(visibleText);
    if (needle.length === 0) return true;
    const haystack = axeCurateTokens(accessibleName);
    if (haystack.length === 0) return false;
    for (let i = 0; i + needle.length <= haystack.length; i++) {
      if (needle.every((word, j) => word === haystack[i + j])) return true;
    }
    return false;
  };

  const lbProducts: MasterProduct[] = [
    {
      ...phone('tied-top-1', 4.64),
      min_price: 0,
      merchant_count: 0,
      expert_rating: 9.2,
    } as unknown as MasterProduct,
    {
      ...phone('tied-top-2', 4.56),
      min_price: null,
      merchant_count: 0,
      expert_rating: 8.8,
    } as unknown as MasterProduct,
    {
      ...phone('ranked-3', 4.2),
      min_price: 19_990_000,
      merchant_count: 3,
      expert_rating: 8.4,
    } as unknown as MasterProduct,
  ];

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const fullMessages = localeCatalogs[locale];
    assert.equal(formatComparePriceVnd(0, locale), '-');
    assert.equal(formatComparePriceVnd(null, locale), '-');
    assert.equal(formatComparePriceVnd(-500, locale), '-');
    assert.match(
      formatComparePriceVnd(19_990_000, locale),
      /19[\s.\u00a0]990[\s.\u00a0]000[\s\u00a0]₫/
    );

    assert.equal(formatLeaderboardDisplayPriceVnd(0, locale), '-');
    assert.equal(formatLeaderboardDisplayPriceVnd(null, locale), '-');
    assert.equal(formatLeaderboardDisplayPriceVnd(-500, locale), '-');
    assert.match(
      formatLeaderboardDisplayPriceVnd(19_990_000, locale),
      /19[\s.\u00a0]990[\s.\u00a0]000[\s\u00a0]₫/
    );

    assert.equal(formatLeaderboardShowdownDelta(4.64, 4.56, 1, locale), null);
    assert.equal(formatLeaderboardShowdownDelta(4.35, 4.4, 1, locale), null);
    assert.equal(formatLeaderboardShowdownDelta(4.854, 4.851, 2, locale), null);
    assert.equal(formatLeaderboardShowdownDelta(0, 0, 1, locale), null);
    assert.equal(formatLeaderboardShowdownDelta(4.8, 0, 1, locale), null);
    assert.equal(
      formatLeaderboardShowdownDelta(4.8, 4.5, 1, locale),
      locale === 'cs' ? 'Δ 0,3' : 'Δ 0.3'
    );
    assert.equal(
      formatLeaderboardShowdownDelta(4.85, 4.7, 2, locale),
      locale === 'cs' ? 'Δ 0,15' : 'Δ 0.15'
    );

    const lbHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: pickClientMessages(
            fullMessages as unknown as Record<string, unknown>,
            'leaderboard'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(LeaderboardExplorer, {
          products: lbProducts,
          locale,
        })
      )
    );
    assert.doesNotMatch(
      lbHtml,
      /\b0[\s\u00a0]₫/,
      `${locale}: no 0 VND on Podium or Ranked List`
    );
    assert.doesNotMatch(
      lbHtml,
      /Δ[\s\u00a0]*0[.,]0+\b/,
      `${locale}: no Δ 0.0 / 0.00 on tied showdown`
    );
    assert.ok(
      lbHtml.includes(locale === 'cs' ? 'Δ 0,4' : 'Δ 0.4'),
      `${locale}: non-tied showdown keeps positive delta badge`
    );

    const tCompare = createTranslator({
      locale,
      messages: pickClientMessages(
        fullMessages as unknown as Record<string, unknown>,
        'compare'
      ) as unknown as typeof fullMessages,
      namespace: 'compare',
    });
    const addLabel = resolveCompareAddSlotAriaLabel(
      tCompare,
      fullMessages.compare.catSmartphonesUnit
    );
    assert.equal(
      addLabel,
      tCompare('addSameCategoryTitle', {
        unit: fullMessages.compare.catSmartphonesUnit,
      })
    );
    assert.notEqual(addLabel, '+');

    const activeRep = resolveCompareReplaceButtonA11y(tCompare, {
      productName: 'Samsung Galaxy S25 Ultra (5G, 256GB)',
      isReplacing: true,
    });
    const idleRep = resolveCompareReplaceButtonA11y(tCompare, {
      productName: 'iPhone 16 Pro Max',
      isReplacing: false,
    });
    assert.equal(activeRep.visibleLabel, fullMessages.compare.replaceDeviceBtn);
    assert.equal(activeRep.ariaPressed, true);
    assert.equal(idleRep.ariaPressed, false);
    assert.notEqual(activeRep.ariaLabel, idleRep.ariaLabel);
    assert.equal(
      activeRep.ariaLabel,
      `${fullMessages.compare.replaceDeviceBtn}: Samsung Galaxy S25 Ultra (5G, 256GB)`
    );
    assert.equal(
      isAxeLabelContainedInName(activeRep.visibleLabel, activeRep.ariaLabel),
      true,
      `${locale}: Replace aria-label passes WCAG 2.5.3`
    );
  }

  // 5. Two-click Replace pointer sequence (mousedown + click), < 50 ms focus
  // timer cancellation, and source guards.
  const replaceBtnTarget = {
    closest: (sel: string) =>
      sel === '[data-compare-slot-trigger]' ? ({} as unknown) : null,
  };
  const outsidePageTarget = { closest: () => null };
  let simReplaceIndex: number | null = null;
  let simDropdownOpen = false;
  let focusCount = 0;
  const simTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const simActiveReplaceRef = { current: null as number | null };
  const simScheduledReplaceRef = { current: null as number | null };

  // Mirrors <input ref={searchInputRef} onFocus={() => setDropdownOpen(true)} />
  // when fewer than 4 products are compared (input is enabled in add mode).
  const focusSearchInput = () => {
    focusCount += 1;
    simDropdownOpen = true;
  };

  const simulatePointerClickOnReplace = (idx: number) => {
    if (shouldDismissCompareOnOutsidePointerDown(replaceBtnTarget, false)) {
      cancelPendingCompareReplaceFocus(simTimerRef, simScheduledReplaceRef);
      simActiveReplaceRef.current = null;
      simReplaceIndex = null;
      simDropdownOpen = false;
    }
    const next = nextCompareReplaceState(simReplaceIndex, idx);
    simReplaceIndex = next.replaceIndex;
    simDropdownOpen = next.dropdownOpen;
    scheduleCompareReplaceFocus({
      timerRef: simTimerRef,
      activeReplaceRef: simActiveReplaceRef,
      scheduledReplaceRef: simScheduledReplaceRef,
      expectedReplaceIndex: next.dropdownOpen ? next.replaceIndex : null,
      focusInput: focusSearchInput,
    });
    syncCompareReplaceFocusState({
      timerRef: simTimerRef,
      activeReplaceRef: simActiveReplaceRef,
      scheduledReplaceRef: simScheduledReplaceRef,
      activeReplaceIndex: simReplaceIndex,
    });
  };

  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    // Rapid two-click toggle-off on the same Replace button within < 50 ms:
    // advancing past 50 ms must not focus the input or reopen dropdownOpen.
    simulatePointerClickOnReplace(0);
    assert.equal(simReplaceIndex, 0);
    assert.equal(simDropdownOpen, true);
    assert.equal(focusCount, 0);
    assert.notEqual(simTimerRef.current, null);

    mock.timers.tick(15);
    assert.equal(focusCount, 0);

    simulatePointerClickOnReplace(0);
    assert.equal(
      simReplaceIndex,
      null,
      'second pointer click toggles Replace off'
    );
    assert.equal(simDropdownOpen, false);
    assert.equal(simTimerRef.current, null);

    mock.timers.tick(COMPARE_REPLACE_FOCUS_DELAY_MS);
    assert.equal(
      focusCount,
      0,
      'canceled replacement before 50 ms must never focus search input'
    );
    assert.equal(
      simDropdownOpen,
      false,
      'dropdownOpen stays false after 50 ms delay advances'
    );
    assert.equal(simReplaceIndex, null);

    // Rapid switch from slot 0 to slot 1 at 20 ms cancels the first timer and
    // focuses once at 20 + 50 = 70 ms.
    simulatePointerClickOnReplace(0);
    mock.timers.tick(20);
    simulatePointerClickOnReplace(1);
    assert.equal(simReplaceIndex, 1);
    assert.equal(simDropdownOpen, true);
    mock.timers.tick(30);
    assert.equal(focusCount, 0, 'slot 0 timer at 50 ms was canceled');
    mock.timers.tick(20);
    assert.equal(focusCount, 1, 'slot 1 timer focuses input at 70 ms');
    assert.equal(simTimerRef.current, null);

    // State-driven close (e.g. outside dismiss / cancel / unmount) before 50 ms
    // cancels pending focus and keeps dropdownOpen closed.
    focusCount = 0;
    simReplaceIndex = null;
    simDropdownOpen = false;
    simulatePointerClickOnReplace(0);
    mock.timers.tick(10);
    simReplaceIndex = null;
    simDropdownOpen = false;
    syncCompareReplaceFocusState({
      timerRef: simTimerRef,
      activeReplaceRef: simActiveReplaceRef,
      scheduledReplaceRef: simScheduledReplaceRef,
      activeReplaceIndex: null,
    });
    assert.equal(simTimerRef.current, null);
    mock.timers.tick(COMPARE_REPLACE_FOCUS_DELAY_MS);
    assert.equal(focusCount, 0);
    assert.equal(simDropdownOpen, false);

    // Callback state guard: even if activeReplaceRef changes without clearTimeout,
    // the callback refuses to focus or reopen dropdownOpen.
    scheduleCompareReplaceFocus({
      timerRef: simTimerRef,
      activeReplaceRef: simActiveReplaceRef,
      scheduledReplaceRef: simScheduledReplaceRef,
      expectedReplaceIndex: 0,
      focusInput: focusSearchInput,
    });
    simActiveReplaceRef.current = null;
    simDropdownOpen = false;
    mock.timers.tick(COMPARE_REPLACE_FOCUS_DELAY_MS);
    assert.equal(focusCount, 0);
    assert.equal(simDropdownOpen, false);
  } finally {
    mock.timers.reset();
  }

  assert.equal(
    shouldDismissCompareOnOutsidePointerDown(outsidePageTarget, false),
    true
  );
  assert.equal(
    shouldDismissCompareOnOutsidePointerDown(outsidePageTarget, true),
    false
  );

  const compareSrc = fs.readFileSync(
    path.join(webSrcDir, 'components/compare/CompareWorkspace.tsx'),
    'utf8'
  );
  assert.doesNotMatch(compareSrc, /\{priceFormatted\}\s*₫/);
  assert.doesNotMatch(compareSrc, /\{minPriceFormatted\}\s*₫/);
  assert.match(compareSrc, /computeCompareHeadToHeadSummary\(products\)/);
  assert.match(
    compareSrc,
    /min_price:\s*sanitizeComparePriceVnd\(p\.min_price(?:\s*,\s*pCurrency)?\)/
  );
  assert.match(
    compareSrc,
    /const minP\s*=\s*sanitizeComparePriceVnd\(p\.min_price(?:\s*,\s*pCur(?:rency)?)?\)/
  );
  assert.match(compareSrc, /data-compare-slot-trigger="replace"/);
  assert.match(compareSrc, /data-compare-slot-trigger="add"/);
  assert.match(compareSrc, /aria-pressed=\{replaceA11y\.ariaPressed\}/);
  assert.match(compareSrc, /aria-label=\{replaceA11y\.ariaLabel\}/);
  assert.match(compareSrc, /<span aria-hidden="true">\+<\/span>/);
  assert.match(
    compareSrc,
    /useRef<ReturnType<typeof setTimeout>\s*\|\s*null>\(\s*null\s*\)/
  );
  assert.match(compareSrc, /scheduleCompareReplaceFocus\(/);
  assert.match(compareSrc, /syncCompareReplaceFocusState\(/);
}

// DealFinder localized exports, unfabricated list prices, catalog CSV unpriced
// cells, canonical Item versus slugs, and smartphone catalog icon a11y (#1745).
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

  // 1. Strict VND bounds reject <= 0, > MAX_VALID_VND_PRICE, 0x/0b/0o prefixes,
  // and embedded \p{Cc} control chars across DealFinder and catalog helpers.
  for (const invalidVnd of [
    null,
    undefined,
    0,
    -500_000,
    MAX_VALID_VND_PRICE + 1,
    '0x1000000',
    '0b101000',
    '0o777000',
    '+0x10000',
    '\u000025000000',
    '25000\u0000000',
    '25000000\n',
    '\t19990000',
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.equal(sanitizeDealRadarPriceVnd(invalidVnd), null);
    assert.equal(formatDealRadarPriceVnd(invalidVnd, 'en'), '-');
  }
  assert.equal(sanitizeDealRadarPriceVnd(19_990_000), 19_990_000);
  assert.equal(
    sanitizeDealRadarPriceVnd(MAX_VALID_VND_PRICE),
    MAX_VALID_VND_PRICE
  );
  assert.equal(sanitizeDealFinderBudgetVnd('0x1000000'), MAX_VALID_VND_PRICE);
  assert.equal(
    sanitizeDealFinderBudgetVnd('\u000025000000'),
    MAX_VALID_VND_PRICE
  );

  // resolveClaimedOriginalPriceVnd never fabricates list prices from priceCurrent.
  assert.equal(resolveClaimedOriginalPriceVnd(null, 15_990_000), null);
  assert.equal(resolveClaimedOriginalPriceVnd(0, 15_990_000), null);
  assert.equal(resolveClaimedOriginalPriceVnd(15_990_000, 15_990_000), null);
  assert.equal(resolveClaimedOriginalPriceVnd(14_000_000, 15_990_000), null);
  assert.equal(
    resolveClaimedOriginalPriceVnd(MAX_VALID_VND_PRICE + 1, 15_990_000),
    null
  );
  assert.equal(resolveClaimedOriginalPriceVnd('0x2000000', 15_990_000), null);
  assert.equal(
    resolveClaimedOriginalPriceVnd('20000\u0000000', 15_990_000),
    null
  );
  assert.equal(resolveClaimedOriginalPriceVnd(21_990_000, 0), null);
  assert.equal(
    resolveClaimedOriginalPriceVnd(21_990_000, 15_990_000),
    21_990_000
  );

  // 2. DealFinder radar filtering, UI, Markdown, and CSV across vi/en/cs.
  const makeRadarOffer = (
    overrides: Partial<CrossPlatformDealRadarItem>
  ): CrossPlatformDealRadarItem => ({
    id: 'offer-1',
    verdict: 'genuine_all_time_low',
    verdictBadgeVi: 'Day gia',
    productSlug: 'iphone-16-256gb',
    productName: 'iPhone 16 256GB',
    brand: 'Apple',
    categorySlug: 'smartphones',
    productHref: '/smartphones/apple-iphone-16',
    imageUrl: null,
    platform: 'shopee',
    merchantId: 'm-1',
    merchantName: 'Apple Flagship',
    isOfficialMall: true,
    merchantRiskScore: 10,
    offerUrl: 'https://shopee.vn/item-1',
    priceCurrent: 18_990_000,
    priceOriginal: null,
    marketMedianPrice: 20_990_000,
    marketMinPrice: 18_990_000,
    marketMaxPrice: 22_990_000,
    savingsVsMedianVnd: 2_000_000,
    savingsVsMedianPct: 9.5,
    marketOfferCount: 4,
    claimedDiscountPct: 0,
    fakeMarkupPct: 0,
    jreviewsScore10: 9.1,
    explanationVi: 'Verified',
    ...overrides,
  });

  const makeSpreadItem = (
    overrides: Partial<CrossPlatformPriceSpreadItem>
  ): CrossPlatformPriceSpreadItem => ({
    id: 'spread-1',
    productSlug: 'iphone-16-256gb',
    productName: 'iPhone 16 256GB',
    brand: 'Apple',
    categorySlug: 'smartphones',
    productHref: '/smartphones/apple-iphone-16',
    imageUrl: null,
    platformCount: 3,
    offerCount: 5,
    minPrice: 18_990_000,
    maxPrice: 22_990_000,
    medianPrice: 20_990_000,
    spreadVnd: 4_000_000,
    spreadPct: 17.4,
    cheapestPlatform: 'shopee',
    cheapestMerchantName: 'Apple Flagship',
    cheapestOfferUrl: 'https://shopee.vn/item-1',
    priciestPlatform: 'lazada',
    priciestMerchantName: 'Overpriced Shop',
    explanationVi: 'Spread',
    ...overrides,
  });

  const radarPayload1745: CrossPlatformDealRadarResponse = {
    generatedAt: '2026-11-19T00:00:00.000Z',
    categoryFilter: 'all',
    totalClustersAnalyzed: 1250,
    totalOffersAnalyzed: 4320,
    totalMerchantsAnalyzed: 42,
    genuineDeals: [
      makeRadarOffer({
        id: 'gen-valid',
        priceCurrent: 18_990_000,
        priceOriginal: null,
      }),
      makeRadarOffer({
        id: 'gen-zero',
        productName: 'Zero Price Ghost',
        priceCurrent: 0,
      }),
      makeRadarOffer({
        id: 'gen-over-cap',
        productName: 'Billion Price Ghost',
        priceCurrent: MAX_VALID_VND_PRICE + 500,
      }),
      makeRadarOffer({
        id: 'gen-hex',
        productName: 'Hex Price Ghost',
        priceCurrent: '0x1000000' as unknown as number,
      }),
    ],
    fakeSaleTraps: [
      makeRadarOffer({
        id: 'trap-no-orig',
        verdict: 'inflated_fake_sale',
        productName: 'No Orig Trap Phone',
        platform: 'lazada',
        merchantName: 'Trap Seller A',
        priceCurrent: 24_990_000,
        priceOriginal: null,
        fakeMarkupPct: 19,
      }),
      makeRadarOffer({
        id: 'trap-equal-orig',
        verdict: 'inflated_fake_sale',
        productName: 'Equal Orig Trap Phone',
        platform: 'tiki',
        merchantName: 'Trap Seller B',
        priceCurrent: 23_500_000,
        priceOriginal: 23_500_000,
        fakeMarkupPct: 12,
      }),
      makeRadarOffer({
        id: 'trap-valid-orig',
        verdict: 'inflated_fake_sale',
        productName: 'Inflated Orig Trap Phone',
        platform: 'shopee',
        merchantName: 'Trap Seller C',
        priceCurrent: 22_490_000,
        priceOriginal: 29_990_000,
        fakeMarkupPct: 33.3,
      }),
      makeRadarOffer({
        id: 'trap-ctrl-price',
        verdict: 'inflated_fake_sale',
        productName: 'Control Char Trap Ghost',
        priceCurrent: '19990000\u0000' as unknown as number,
        priceOriginal: 25_000_000,
        fakeMarkupPct: 25,
      }),
    ],
    priceSpreadLeaders: [
      makeSpreadItem({ id: 'spread-valid' }),
      makeSpreadItem({
        id: 'spread-invalid',
        productName: 'Invalid Spread Ghost',
        spreadVnd: 0,
      }),
    ],
  };

  const validGen1745 = filterValidRadarDeals(
    radarPayload1745.genuineDeals,
    'all'
  );
  const validTraps1745 = filterValidRadarDeals(
    radarPayload1745.fakeSaleTraps,
    'all'
  );
  const validSpreads1745 = filterValidRadarSpreads(
    radarPayload1745.priceSpreadLeaders,
    'all'
  );
  assert.equal(validGen1745.length, 1);
  assert.equal(validTraps1745.length, 3);
  assert.equal(validTraps1745[0]?.priceOriginal, null);
  assert.equal(validTraps1745[1]?.priceOriginal, null);
  assert.equal(validTraps1745[2]?.priceOriginal, 29_990_000);
  assert.equal(validSpreads1745.length, 1);

  const csvRows1745 = buildDealRadarCsvRows(
    validGen1745,
    validTraps1745,
    validSpreads1745
  );
  // Genuine deal with null priceOriginal emits '' in Claimed Original Price (index 8)
  assert.equal(csvRows1745[0]?.[7], 18_990_000);
  assert.equal(csvRows1745[0]?.[8], '');
  // Traps with null / <= priceCurrent priceOriginal emit '' instead of fabricating priceCurrent
  assert.equal(csvRows1745[1]?.[7], 24_990_000);
  assert.equal(csvRows1745[1]?.[8], '');
  assert.equal(csvRows1745[2]?.[7], 23_500_000);
  assert.equal(csvRows1745[2]?.[8], '');
  // Trap with valid priceOriginal > priceCurrent preserves 29_990_000
  assert.equal(csvRows1745[3]?.[7], 22_490_000);
  assert.equal(csvRows1745[3]?.[8], 29_990_000);

  const dealProduct1745: MasterProduct = {
    ...phone('iphone-16-256gb', 4.6, { value: 9.2 }),
    name: 'iPhone 16 256GB',
    brand: 'Apple',
    min_price: 18_990_000,
    max_price: 22_990_000,
    expert_rating: 9.1,
    expert_criteria_scores: { value: 9.2 },
  } as unknown as MasterProduct;
  const ranked1745 = rankProductsForDealFinder([dealProduct1745], {
    categoryFilter: 'all',
    persona: 'value_hunter',
    maxBudgetVnd: 65_000_000,
    searchQuery: '',
  });
  const radarIndex1745 = buildRadarIndex(radarPayload1745);

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const fullMessages = localeCatalogs[locale];
    const tDeals = createTranslator({
      locale,
      messages: fullMessages,
      namespace: 'deals',
    });

    const radarMd = buildDealRadarMarkdown({
      t: tDeals,
      locale,
      categoryLabel: fullMessages.deals.catAll,
      totalClustersAnalyzed: radarPayload1745.totalClustersAnalyzed,
      totalOffersAnalyzed: radarPayload1745.totalOffersAnalyzed,
      genuineDeals: validGen1745,
      fakeSaleTraps: validTraps1745,
      priceSpreadLeaders: validSpreads1745,
    });
    assert.ok(
      radarMd.includes(fullMessages.deals.catAll),
      `${locale}: radar Markdown includes localized category label`
    );
    assert.doesNotMatch(
      radarMd,
      /\*\*Category:\*\* all\b|\*\*Ngành hàng:\*\* all\b|\*\*Kategorie:\*\* all\b/,
      `${locale}: radar Markdown must not emit raw categoryFilter slug`
    );
    assert.ok(
      radarMd.includes(formatNumber(18_990_000, locale)),
      `${locale}: radar Markdown formats numbers via formatNumber(..., locale)`
    );
    // Traps without valid > priceCurrent original price emit '-' in column 4
    assert.match(
      radarMd,
      new RegExp(
        `No Orig Trap Phone \\| LAZADA \\(Trap Seller A\\) \\| ${formatNumber(24_990_000, locale).replace(/\s/g, '\\s')} ₫ \\| - \\|`
      ),
      `${locale}: missing priceOriginal emits '-' instead of fabricating priceCurrent`
    );
    assert.match(
      radarMd,
      new RegExp(
        `Equal Orig Trap Phone \\| TIKI \\(Trap Seller B\\) \\| ${formatNumber(23_500_000, locale).replace(/\s/g, '\\s')} ₫ \\| - \\|`
      ),
      `${locale}: priceOriginal <= priceCurrent emits '-'`
    );
    assert.ok(
      radarMd.includes(`${formatNumber(29_990_000, locale)} ₫`),
      `${locale}: valid priceOriginal > priceCurrent renders formatted VND`
    );

    const dealsMd = buildDealsMarkdown({
      t: tDeals,
      locale,
      persona: 'value_hunter',
      personaLabel: fullMessages.deals.personaValueHunter,
      maxBudgetVnd: 65_000_000,
      url: 'https://rate.vn/deals',
      rankedDeals: ranked1745,
      radarIndex: radarIndex1745,
    });
    assert.ok(
      dealsMd.includes(fullMessages.deals.personaValueHunter),
      `${locale}: deals Markdown includes localized persona label`
    );
    assert.ok(
      !dealsMd.includes('value_hunter'),
      `${locale}: deals Markdown must not emit raw value_hunter key`
    );
    assert.ok(
      dealsMd.includes(formatNumber(65_000_000, locale)),
      `${locale}: deals Markdown formats budget via formatNumber(..., locale)`
    );
    assert.ok(
      dealsMd.includes(formatNumber(18_990_000, locale)),
      `${locale}: deals Markdown formats minPrice via formatNumber(..., locale)`
    );

    const dealFinderHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: pickClientMessages(
            fullMessages as unknown as Record<string, unknown>,
            'deals'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(DealFinderWorkspace, {
          products: [dealProduct1745],
          dealRadar: radarPayload1745,
        })
      )
    );
    // Exactly one <s> strikethrough (only for trap-valid-orig, never for trap-no-orig or trap-equal-orig)
    const strikeMatches = [...dealFinderHtml.matchAll(/<s>(.*?)<\/s>/g)];
    assert.equal(
      strikeMatches.length,
      1,
      `${locale}: UI renders <s> only when priceOriginal is finite, > priceCurrent, and <= MAX_VALID_VND_PRICE`
    );
    assert.ok(
      strikeMatches[0]?.[1]?.includes(
        locale === 'cs' ? '29\u00a0990\u00a0000' : '29.990.000'
      ),
      `${locale}: single <s> shows 29,990,000 VND`
    );
    assert.ok(!dealFinderHtml.includes('Zero Price Ghost'));
    assert.ok(!dealFinderHtml.includes('Billion Price Ghost'));
    assert.ok(!dealFinderHtml.includes('Hex Price Ghost'));
    assert.ok(!dealFinderHtml.includes('Control Char Trap Ghost'));
    assert.ok(!dealFinderHtml.includes('Invalid Spread Ghost'));
  }

  // 3. CategoryCatalogToolbar CSV unpriced cells & sanitizeCatalogPriceVnd compatibility.
  assert.equal(sanitizeCatalogPriceVnd(-500_000), 0);
  assert.equal(sanitizeCatalogPriceVnd(0), 0);
  assert.equal(sanitizeCatalogPriceVnd(MAX_VALID_VND_PRICE + 1), 0);
  assert.equal(sanitizeCatalogPriceVnd('0x100000'), 0);
  assert.equal(sanitizeCatalogPriceVnd('\u0000100000'), 0);
  assert.equal(sanitizeCatalogPriceVnd(19_990_000.6), 19_990_001);

  const soldOutCatalogRow: ItemCatalogRow = {
    ...phone('sold-out-phone-256gb', 4.4),
    min_price: 0,
    max_price: null,
    merchant_count: 0,
    item_slug: 'sold-out-phone',
  } as unknown as ItemCatalogRow;
  const pricedCatalogRow: ItemCatalogRow = {
    ...phone('samsung-galaxy-s24-256gb', 4.7),
    min_price: 18_990_000,
    max_price: 21_490_000,
    merchant_count: 4,
    item_slug: 'samsung-galaxy-s24',
  } as unknown as ItemCatalogRow;
  const secondItemRow: ItemCatalogRow = {
    ...phone('apple-iphone-16-256gb', 4.8),
    min_price: 21_990_000,
    max_price: 24_990_000,
    merchant_count: 5,
    item_slug: 'apple-iphone-16',
  } as unknown as ItemCatalogRow;

  const soldOutCsvCells = buildCatalogCsvRow(
    soldOutCatalogRow,
    1,
    'smartphones',
    EMPTY_RADAR_SIGNAL
  );
  assert.equal(
    soldOutCsvCells[9],
    '',
    'unpriced MinPriceVND CSV cell must be empty string instead of "0"'
  );
  assert.equal(
    soldOutCsvCells[10],
    '',
    'unpriced MaxPriceVND CSV cell must be empty string instead of "0"'
  );

  const pricedCsvCells = buildCatalogCsvRow(
    pricedCatalogRow,
    2,
    'smartphones',
    EMPTY_RADAR_SIGNAL
  );
  assert.equal(pricedCsvCells[9], '18990000');
  assert.equal(pricedCsvCells[10], '21490000');

  // 4. Canonical Item slugs in CategoryCatalogToolbar versusHref and smartphones/page.tsx.
  const toolbarItemMap = buildCatalogItemSlugMap([
    pricedCatalogRow,
    secondItemRow,
  ]);
  assert.deepEqual(toolbarItemMap, {
    'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
    'apple-iphone-16-256gb': 'apple-iphone-16',
  });
  assert.equal(
    versusHref(pricedCatalogRow.slug, secondItemRow.slug, toolbarItemMap),
    '/compare/apple-iphone-16-vs-samsung-galaxy-s24'
  );
  // Item slug containing '-vs-' falls back to variant slug in versusHref
  assert.equal(
    versusHref('weird-a-256gb', 'apple-iphone-16-256gb', {
      'weird-a-256gb': 'weird-a-vs-b',
      'apple-iphone-16-256gb': 'apple-iphone-16',
    }),
    '/compare/apple-iphone-16-vs-weird-a-256gb'
  );

  test('smartphones/page.tsx Item slug and radar VND helpers (#1745)', async () => {
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
    const {
      buildCatalogPageItemSlugMap,
      buildCatalogQuickCompareHref,
      buildCatalogQuickCompareSlugs,
      formatCatalogRadarPriceVnd,
      sanitizeCatalogRadarPriceVnd,
    } = await import('../../app/[locale]/smartphones/page');

    for (const invalidVnd of [
      null,
      undefined,
      0,
      -500_000,
      MAX_VALID_VND_PRICE + 1,
      '0x1000000',
      '0b101000',
      '0o777000',
      '\u000025000000',
      '25000\u0000000',
      '25000000\n',
    ]) {
      assert.equal(sanitizeCatalogRadarPriceVnd(invalidVnd), null);
      assert.equal(formatCatalogRadarPriceVnd(invalidVnd, 'en'), '-');
    }
    assert.equal(sanitizeCatalogRadarPriceVnd(' 24990000 '), 24_990_000);

    const pageItemMap = buildCatalogPageItemSlugMap([
      pricedCatalogRow,
      secondItemRow,
      { slug: 'plain-variant-only' },
    ]);
    assert.deepEqual(pageItemMap, {
      'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
      'apple-iphone-16-256gb': 'apple-iphone-16',
    });
    assert.deepEqual(
      buildCatalogQuickCompareSlugs([
        secondItemRow,
        { slug: 'apple-iphone-16-512gb', item_slug: 'apple-iphone-16' },
        pricedCatalogRow,
        soldOutCatalogRow,
      ]),
      ['apple-iphone-16', 'samsung-galaxy-s24', 'sold-out-phone']
    );
    assert.equal(
      buildCatalogQuickCompareHref('smartphones', [
        secondItemRow,
        pricedCatalogRow,
        soldOutCatalogRow,
      ]),
      '/compare?cat=smartphones&slugs=apple-iphone-16,samsung-galaxy-s24,sold-out-phone'
    );

    // Multi-variant Item cards (e.g. ?storage=512) pin item_slug@variant_key
    // so /compare keeps the displayed 512GB variant instead of default 128GB.
    const iphone512Row = {
      id: 'v512',
      slug: 'apple-iphone-16-512gb',
      item_slug: 'apple-iphone-16',
      item_variants: [
        {
          id: 'v128',
          variant_key: '128gb',
          storage_gb: 128,
          min_price: 19_990_000,
        },
        {
          id: 'v512',
          variant_key: '512gb',
          storage_gb: 512,
          min_price: 25_990_000,
        },
      ],
    };
    const galaxy512Row = {
      id: 's512',
      slug: 'samsung-galaxy-s24-512gb',
      item_slug: 'samsung-galaxy-s24',
      item_variants: [
        {
          id: 's256',
          variant_key: '256gb',
          storage_gb: 256,
          min_price: 18_990_000,
        },
        {
          id: 's512',
          variant_key: '512gb',
          storage_gb: 512,
          min_price: 22_490_000,
        },
      ],
    };
    const pinnedHref = buildCatalogQuickCompareHref('smartphones', [
      iphone512Row,
      { ...iphone512Row, id: 'v128', slug: 'apple-iphone-16-128gb' },
      galaxy512Row,
    ]);
    assert.equal(
      pinnedHref,
      '/compare?cat=smartphones&slugs=apple-iphone-16@512gb,samsung-galaxy-s24@512gb'
    );
    const firstToken =
      new URL(pinnedHref, 'https://rate.vn').searchParams
        .get('slugs')
        ?.split(',')[0] ?? '';
    assert.equal(
      compareTarget(
        {
          kind: 'item',
          item: {
            id: 'item-iphone-16',
            slug: 'apple-iphone-16',
            default_variant_id: 'v128',
          },
          variants: [
            { id: 'v128', slug: 'apple-iphone-16-128gb', variant_key: '128gb' },
            { id: 'v512', slug: 'apple-iphone-16-512gb', variant_key: '512gb' },
          ],
        },
        parseCompareToken(firstToken)
      )?.variantSlug,
      'apple-iphone-16-512gb'
    );
  });

  const toolbarHtml = renderToStaticMarkup(
    React.createElement(
      Provider,
      {
        locale: 'en',
        messages: pickClientMessages(
          enMessages as unknown as Record<string, unknown>,
          'catalog'
        ),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      React.createElement(CategoryCatalogToolbar, {
        categorySlug: 'smartphones',
        categoryTitle: 'Smartphones',
        products: [pricedCatalogRow, secondItemRow],
      })
    )
  );
  assert.match(
    toolbarHtml,
    /href="\/en\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"|href="\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"/,
    'CategoryCatalogToolbar 1v1 Go button links directly to canonical Item slugs'
  );

  const sameItemToolbarHtml = renderToStaticMarkup(
    React.createElement(
      Provider,
      {
        locale: 'en',
        messages: pickClientMessages(
          enMessages as unknown as Record<string, unknown>,
          'catalog'
        ),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      React.createElement(CategoryCatalogToolbar, {
        categorySlug: 'smartphones',
        categoryTitle: 'Smartphones',
        products: [
          secondItemRow,
          { ...secondItemRow, slug: 'apple-iphone-16-512gb' },
        ],
      })
    )
  );
  assert.doesNotMatch(
    sameItemToolbarHtml,
    /<select\b/,
    'CategoryCatalogToolbar hides 1v1 picker instead of rendering an empty <select> when all rows share one Item'
  );
  assert.match(
    sameItemToolbarHtml,
    /data-testid="download-catalog-csv-btn"/,
    'CategoryCatalogToolbar still renders export menu when all rows share one Item'
  );

  // 5. Source-level guards for DealFinderWorkspace.tsx and smartphones/page.tsx (#1745).
  const dealFinderSrc1745 = fs.readFileSync(
    path.join(webSrcDir, 'components/deals/DealFinderWorkspace.tsx'),
    'utf8'
  );
  assert.doesNotMatch(
    dealFinderSrc1745,
    /toLocaleString\('vi-VN'\)/,
    'DealFinderWorkspace must use formatNumber(..., locale) instead of hardcoded vi-VN toLocaleString'
  );
  assert.doesNotMatch(
    dealFinderSrc1745,
    /priceOriginal\s*\|\|\s*\w+\.priceCurrent|priceOriginal\s*\?\?\s*\w+\.priceCurrent/,
    'DealFinderWorkspace must never fabricate claimed list prices from priceCurrent'
  );

  const smartphonesPageSrc = fs.readFileSync(
    path.join(webSrcDir, 'app/[locale]/smartphones/page.tsx'),
    'utf8'
  );
  const bsIconTags = [...smartphonesPageSrc.matchAll(/<Bs[A-Z]\w*[^>]*>/g)].map(
    (m) => m[0]
  );
  assert.ok(
    bsIconTags.length >= 11,
    'smartphones/page.tsx decorative Bs* icons matched'
  );
  for (const tag of bsIconTags) {
    assert.match(
      tag,
      /\baria-hidden="true"/,
      `Decorative icon ${tag} in smartphones/page.tsx must carry aria-hidden="true"`
    );
  }

  // DOS/Rate#1764: canonical Item slugs across /leaderboard and /compare/[versus],
  // same-Item 404 guards in VersusMatchupSwitcher & CompareWorkspace, localized
  // Markdown VND exports, empty unpriced CSV cells, strict price sanitizers,
  // and decorative Bs* icon a11y in LeaderboardExplorer.tsx.
  {
    const thirdItemRow: ItemCatalogRow = {
      ...phone('xiaomi-14-ultra-512gb', 4.6),
      min_price: 23_990_000,
      max_price: 26_990_000,
      merchant_count: 3,
      item_slug: 'xiaomi-14-ultra',
    } as unknown as ItemCatalogRow;

    const leaderboardItemMap = buildLeaderboardItemSlugMap([
      secondItemRow,
      pricedCatalogRow,
      soldOutCatalogRow,
    ]);
    assert.deepEqual(
      { ...leaderboardItemMap },
      {
        'apple-iphone-16-256gb': 'apple-iphone-16',
        'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
        'sold-out-phone-256gb': 'sold-out-phone',
      }
    );

    assert.deepEqual(
      resolveLeaderboardCompareSlugs(
        [
          { product: secondItemRow },
          {
            product: {
              slug: 'apple-iphone-16-512gb',
              item_slug: 'apple-iphone-16',
            },
          },
          { product: pricedCatalogRow },
          { product: soldOutCatalogRow },
        ],
        leaderboardItemMap,
        3
      ),
      ['apple-iphone-16', 'samsung-galaxy-s24', 'sold-out-phone']
    );

    // Multi-variant leaderboard Item rows preserve the represented variant via
    // item_slug@variant_key while deduplicating by canonical Item slug.
    const multiVariantIphone256: ItemCatalogRow = {
      ...secondItemRow,
      id: 'v256',
      slug: 'apple-iphone-16-256gb',
      item_slug: 'apple-iphone-16',
      item_variants: [
        {
          id: 'v256',
          variant_key: '256gb',
          storage_gb: 256,
          min_price: 21_990_000,
        },
        {
          id: 'v512',
          variant_key: '512gb',
          storage_gb: 512,
          min_price: 25_990_000,
        },
      ],
    };
    const multiVariantGalaxy512: ItemCatalogRow = {
      ...pricedCatalogRow,
      id: 's512',
      slug: 'samsung-galaxy-s24-512gb',
      item_slug: 'samsung-galaxy-s24',
      item_variants: [
        {
          id: 's256',
          variant_key: '256gb',
          storage_gb: 256,
          min_price: 18_990_000,
        },
        {
          id: 's512',
          variant_key: '512gb',
          storage_gb: 512,
          min_price: 22_490_000,
        },
      ],
    };
    const pinnedLeaderboardTokens = resolveLeaderboardCompareSlugs(
      [
        { product: multiVariantIphone256 },
        {
          product: {
            ...multiVariantIphone256,
            id: 'v512',
            slug: 'apple-iphone-16-512gb',
          },
        },
        { product: multiVariantGalaxy512 },
        {
          product: {
            id: 'x256',
            slug: 'xiaomi-14-ultra-256gb',
            item_slug: 'xiaomi-14-ultra',
            variant_key: '256gb',
            variant_count: 2,
            default_variant_id: 'x512',
          },
        },
      ],
      undefined,
      3
    );
    assert.deepEqual(pinnedLeaderboardTokens, [
      'apple-iphone-16@256gb',
      'samsung-galaxy-s24@512gb',
      'xiaomi-14-ultra@256gb',
    ]);
    assert.equal(
      encodeLeaderboardCompareSlug('apple-iphone-16@256gb'),
      'apple-iphone-16@256gb'
    );
    assert.equal(
      compareTarget(
        {
          kind: 'item',
          item: {
            id: 'item-iphone-16',
            slug: 'apple-iphone-16',
            default_variant_id: 'v512',
          },
          variants: [
            { id: 'v256', slug: 'apple-iphone-16-256gb', variant_key: '256gb' },
            { id: 'v512', slug: 'apple-iphone-16-512gb', variant_key: '512gb' },
          ],
        },
        parseCompareToken(pinnedLeaderboardTokens[0]!)
      )?.variantSlug,
      'apple-iphone-16-256gb'
    );
    assert.deepEqual(
      resolveLeaderboardCompareSlugs([
        {
          product: {
            id: 'x512',
            slug: 'xiaomi-14-ultra-512gb',
            item_slug: 'xiaomi-14-ultra',
            variant_key: '512gb',
            variant_count: 2,
            default_variant_id: 'x512',
          },
        },
      ]),
      ['xiaomi-14-ultra']
    );

    // Guard effectiveVersusB against matching effectiveVersusA's resolved Item side slug.
    const samePhoneVariantEntries = [
      {
        product: {
          slug: 'apple-iphone-16-128gb',
          item_slug: 'apple-iphone-16',
        },
      },
      {
        product: {
          slug: 'apple-iphone-16-256gb',
          item_slug: 'apple-iphone-16',
        },
      },
      {
        product: {
          slug: 'samsung-galaxy-s24-256gb',
          item_slug: 'samsung-galaxy-s24',
        },
      },
    ];
    const variantLeaderboardMap = buildLeaderboardItemSlugMap(
      samePhoneVariantEntries.map((e) => e.product as ItemCatalogRow)
    );
    assert.equal(
      isSameLeaderboardVersusItem(
        'apple-iphone-16-128gb',
        'apple-iphone-16-256gb',
        variantLeaderboardMap
      ),
      true
    );
    assert.deepEqual(
      resolveLeaderboardEffectiveVersusSlugs(
        samePhoneVariantEntries,
        'apple-iphone-16-128gb',
        'apple-iphone-16-256gb',
        variantLeaderboardMap
      ),
      {
        effectiveVersusA: 'apple-iphone-16-128gb',
        effectiveVersusB: 'samsung-galaxy-s24-256gb',
      }
    );
    assert.deepEqual(
      resolveLeaderboardEffectiveVersusSlugs(
        samePhoneVariantEntries.slice(0, 2),
        'apple-iphone-16-128gb',
        'apple-iphone-16-256gb',
        variantLeaderboardMap
      ),
      {
        effectiveVersusA: 'apple-iphone-16-128gb',
        effectiveVersusB: '',
      }
    );

    const leaderboardHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale: 'en',
          messages: pickClientMessages(
            enMessages as unknown as Record<string, unknown>,
            'leaderboard'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(LeaderboardExplorer, {
          products: [secondItemRow, pricedCatalogRow, soldOutCatalogRow],
          locale: 'en',
        })
      )
    );
    assert.match(
      leaderboardHtml,
      /href="(?:\/en)?\/compare\?cat=smartphones&amp;slugs=apple-iphone-16,samsung-galaxy-s24,sold-out-phone&amp;variant\.apple-iphone-16=apple-iphone-16-256gb/,
      'LeaderboardExplorer Compare Top 3 CTA must use canonical Item slugs'
    );

    const pinnedLeaderboardHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale: 'en',
          messages: pickClientMessages(
            enMessages as unknown as Record<string, unknown>,
            'leaderboard'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(LeaderboardExplorer, {
          products: [
            multiVariantIphone256,
            multiVariantGalaxy512,
            soldOutCatalogRow,
          ],
          locale: 'en',
        })
      )
    );
    const top3Href = pinnedLeaderboardHtml.match(
      /href="((?:\/en)?\/compare\?cat=smartphones&amp;slugs=[^"]+)"/
    )?.[1];
    assert.ok(top3Href);
    const top3Query = new URL(
      top3Href.replaceAll('&amp;', '&'),
      'https://rate.test'
    ).searchParams;
    assert.equal(
      top3Query.get('slugs'),
      'apple-iphone-16@256gb,samsung-galaxy-s24@512gb,sold-out-phone'
    );
    assert.equal(
      top3Query.get('variant.sold-out-phone'),
      'sold-out-phone-256gb'
    );
    assert.match(
      pinnedLeaderboardHtml,
      /href="(?:\/en)?\/compare\?category=smartphones&amp;slugs=apple-iphone-16@256gb,samsung-galaxy-s24@512gb"/,
      'LeaderboardExplorer Open Compare Matrix CTA preserves non-default multi-variant pins'
    );
    assert.match(
      leaderboardHtml,
      /href="(?:\/en)?\/compare\?category=smartphones&amp;slugs=apple-iphone-16,samsung-galaxy-s24&amp;variant\.apple-iphone-16=apple-iphone-16-256gb/,
      'LeaderboardExplorer Showdowns Compare Matrix CTA must use canonical Item slugs'
    );
    assert.match(
      leaderboardHtml,
      /href="(?:\/en)?\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"[^>]*data-testid="leaderboard-1v1-go-btn"|data-testid="leaderboard-1v1-go-btn"[^>]*href="(?:\/en)?\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"/,
      'LeaderboardExplorer 1v1 Go button must link to canonical Item slugs'
    );
    assert.match(
      leaderboardHtml,
      /href="(?:\/en)?\/compare\/apple-iphone-16-vs-sold-out-phone"/,
      'LeaderboardExplorer Top 1v1 Showdown cards must link to canonical Item slugs'
    );
    assert.match(
      leaderboardHtml,
      /href="(?:\/en)?\/compare\/samsung-galaxy-s24-vs-sold-out-phone"/,
      'LeaderboardExplorer #2 vs #3 Showdown card must link to canonical Item slugs'
    );
    assert.doesNotMatch(
      leaderboardHtml,
      /\/compare\/[^"]*256gb/,
      'LeaderboardExplorer versus links must never emit variant slugs when item_slug is present'
    );

    // Same-Item only rows hide the 1v1 picker and Showdowns section instead of rendering a 404 link.
    const sameItemLeaderboardHtml = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale: 'en',
          messages: pickClientMessages(
            enMessages as unknown as Record<string, unknown>,
            'leaderboard'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(LeaderboardExplorer, {
          products: [
            secondItemRow,
            {
              ...secondItemRow,
              id: 'id-iphone-16-512',
              slug: 'apple-iphone-16-512gb',
            },
          ],
          locale: 'en',
        })
      )
    );
    assert.doesNotMatch(
      sameItemLeaderboardHtml,
      /data-testid="leaderboard-1v1-go-btn"/,
      'LeaderboardExplorer hides 1v1 Go button when all entries belong to the same Item'
    );
    assert.doesNotMatch(
      sameItemLeaderboardHtml,
      /apple-iphone-16-vs-apple-iphone-16/,
      'LeaderboardExplorer never renders a same-Item 404 versus link'
    );

    // Leaderboard CSV MinPriceVND emits "" on unpriced rows and integer string on priced rows.
    const unpricedLeaderboardCsv = buildLeaderboardCsvRow(
      {
        product: soldOutCatalogRow,
        categorySlug: 'smartphones',
        activeScore5: 4.4,
        userScore5: 4.4,
        expertScore10: null,
        criteria: NONE,
      },
      1,
      1,
      EMPTY_RADAR_SIGNAL
    );
    assert.equal(
      unpricedLeaderboardCsv[13],
      '',
      'LeaderboardExplorer unpriced MinPriceVND CSV cell must be "" instead of "0"'
    );
    const pricedLeaderboardCsv = buildLeaderboardCsvRow(
      {
        product: pricedCatalogRow,
        categorySlug: 'smartphones',
        activeScore5: 4.7,
        userScore5: 4.7,
        expertScore10: 8.6,
        criteria: NONE,
      },
      2,
      1,
      EMPTY_RADAR_SIGNAL
    );
    assert.equal(pricedLeaderboardCsv[13], '18990000');

    // Localized VND in Markdown exports across LeaderboardExplorer, VersusInteractiveScoreboard, and CompareWorkspace.
    const csLeaderboardMdRow = buildLeaderboardMarkdownRow(
      {
        product: pricedCatalogRow,
        activeScore5: 4.7,
        userScore5: 4.7,
        expertScore10: 8.6,
      },
      1,
      1,
      'N/A',
      EMPTY_RADAR_SIGNAL,
      'cs'
    );
    assert.equal(
      csLeaderboardMdRow[6],
      `18${NBSP}990${NBSP}000${NBSP}₫`,
      'LeaderboardExplorer Czech Markdown export must format VND with non-breaking spaces'
    );
    const unpricedCsLeaderboardMdRow = buildLeaderboardMarkdownRow(
      {
        product: soldOutCatalogRow,
        activeScore5: 4.4,
        userScore5: 4.4,
        expertScore10: null,
      },
      2,
      1,
      'N/A',
      EMPTY_RADAR_SIGNAL,
      'cs'
    );
    assert.equal(unpricedCsLeaderboardMdRow[6], '-');

    assert.equal(
      buildVersusMarkdownMinPriceRow(
        'Nejnižší cena',
        18_990_000,
        0,
        'Samsung Galaxy S24',
        'cs'
      ),
      `| **Nejnižší cena** | 18${NBSP}990${NBSP}000${NBSP}₫ | - | Samsung Galaxy S24 |`
    );
    assert.equal(
      formatVersusPriceVnd(21_990_000, 'cs'),
      `21${NBSP}990${NBSP}000${NBSP}₫`
    );
    assert.equal(formatVersusPriceVnd(0, 'cs'), '-');

    assert.equal(
      buildCompareMarkdownMinPriceRow(
        'Nejnižší cena',
        [pricedCatalogRow, soldOutCatalogRow],
        'cs'
      ),
      `| **Nejnižší cena** | 18${NBSP}990${NBSP}000${NBSP}₫ | - |`
    );

    // Strict price sanitizers reject booleans, radix prefixes, and embedded \p{Cc} control chars.
    for (const invalidPrice of [
      true,
      false,
      null,
      undefined,
      0,
      -0,
      0.4,
      '0.49',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -500_000,
      MAX_VALID_VND_PRICE + 0.4,
      MAX_VALID_VND_PRICE + 1,
      '0x1000000',
      '+0x1000000',
      '-0x1000000',
      '0b101000',
      '0o777000',
      '\u000025000000',
      '25000\u0000000',
      '25000000\n',
      '25000000\t',
      [25_000_000],
      { valueOf: () => 25_000_000 },
    ]) {
      assert.equal(sanitizeLeaderboardPriceVnd(invalidPrice), 0);
      assert.equal(sanitizeComparePriceVnd(invalidPrice), 0);
      assert.equal(sanitizeVersusPriceVnd(invalidPrice), 0);
    }
    assert.equal(sanitizeLeaderboardPriceVnd(' 24990000 '), 24_990_000);
    assert.equal(sanitizeComparePriceVnd(' 24990000 '), 24_990_000);
    assert.equal(sanitizeVersusPriceVnd(' 24990000 '), 24_990_000);
    assert.equal(
      sanitizeLeaderboardPriceVnd(MAX_VALID_VND_PRICE - 0.4),
      MAX_VALID_VND_PRICE
    );
    assert.equal(
      sanitizeComparePriceVnd(MAX_VALID_VND_PRICE - 0.4),
      MAX_VALID_VND_PRICE
    );
    assert.equal(
      sanitizeVersusPriceVnd(MAX_VALID_VND_PRICE - 0.4),
      MAX_VALID_VND_PRICE
    );

    // CompareWorkspace popularBattles maps through versusHref(..., versusSlugMap) and skips same-Item pairs,
    // including partial itemSlugBySlug maps (/compare SSR) via model_key sibling prefix propagation.
    const rawCandidateVariants: MasterProduct[] = [
      {
        ...phone('apple-iphone-16-512gb', 4.95),
        model_key: 'apple:iphone-16:512gb',
        min_price: 25_990_000,
      } as unknown as MasterProduct,
      {
        ...phone('apple-iphone-16-256gb', 4.9),
        model_key: 'apple:iphone-16:256gb',
        min_price: 21_990_000,
      } as unknown as MasterProduct,
      {
        ...phone('samsung-galaxy-s24-256gb', 4.7),
        model_key: 'samsung:galaxy-s24:256gb',
        min_price: 18_990_000,
      } as unknown as MasterProduct,
      {
        ...phone('xiaomi-14-ultra-512gb', 4.6),
        model_key: 'xiaomi:14-ultra:512gb',
        min_price: 23_990_000,
      } as unknown as MasterProduct,
      {
        ...phone('weird-vs-phone-256gb', 4.99),
        model_key: 'brand:weird-vs-phone:256gb',
        min_price: 15_990_000,
      } as unknown as MasterProduct,
    ];
    const partialCandidateSlugMap = {
      // Simulates /compare where only initialProducts were looked up on SSR:
      // 512gb sibling is unmapped, and weird-vs-phone has an unparseable -vs- Item slug.
      'apple-iphone-16-256gb': 'apple-iphone-16',
      'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
      'xiaomi-14-ultra-512gb': 'xiaomi-14-ultra',
      'weird-vs-phone-256gb': 'weird-vs-phone',
    };
    assert.equal(
      isSameCompareVersusItem(
        'apple-iphone-16-512gb',
        'apple-iphone-16-256gb',
        {
          ...partialCandidateSlugMap,
          'apple-iphone-16-512gb': 'apple-iphone-16',
        }
      ),
      true
    );
    // Scoreboard validates raw product.min_price before scoreMasterProductForLeaderboard strips \p{Cc}.
    const pollutedScored = scoreMasterProductForLeaderboard(
      {
        ...phone('polluted-price-phone', 4.6),
        min_price: '25000\n000' as unknown as number,
      },
      'combined'
    );
    assert.equal(
      resolveVersusScoreMinPriceVnd(pollutedScored),
      0,
      'resolveVersusScoreMinPriceVnd rejects embedded control chars in product.min_price even after scoring normalization'
    );
    assert.equal(
      resolveVersusScoreMinPriceVnd(
        scoreMasterProductForLeaderboard(pricedCatalogRow, 'combined')
      ),
      18_990_000
    );

    // Unlinked masters (slug -> slug in getItemSlugsFor) must NOT propagate their variant slug
    // onto sibling variants, and confirmed identity mappings override sibling heuristics.
    const unlinkedVariants: MasterProduct[] = [
      {
        ...phone('unlinked-phone-256gb', 4.8),
        model_key: 'brand:unlinked-phone:256gb',
      } as unknown as MasterProduct,
      {
        ...phone('unlinked-phone-512gb', 4.75),
        model_key: 'brand:unlinked-phone:512gb',
      } as unknown as MasterProduct,
    ];
    const unlinkedMap = buildCompareVersusSlugMap(unlinkedVariants, {
      'unlinked-phone-256gb': 'unlinked-phone-256gb',
    });
    assert.equal(
      unlinkedMap?.['unlinked-phone-512gb'],
      undefined,
      'Unlinked master identity mapping is never propagated to sibling variants'
    );
    const confirmedUnlinkedOverride = buildCompareVersusSlugMap(
      rawCandidateVariants,
      partialCandidateSlugMap,
      { 'apple-iphone-16-512gb': 'apple-iphone-16-512gb' }
    );
    assert.equal(
      confirmedUnlinkedOverride?.['apple-iphone-16-512gb'],
      'apple-iphone-16-512gb',
      'Confirmed client identity mapping takes precedence over sibling Item inference'
    );

    // Object.prototype keys like "constructor" or "toString" never collide on empty/plain maps.
    const protoCandidates: MasterProduct[] = [
      phone('constructor', 4.9),
      phone('tostring', 4.8),
    ];
    assert.deepEqual(
      resolveComparePopularBattles(protoCandidates, 'smartphones', null, 3).map(
        (b) => b.versusHref
      ),
      ['/compare/constructor-vs-tostring']
    );
    assert.equal(
      isSameLeaderboardVersusItem('constructor', 'tostring', {}),
      false
    );

    const propagatedCompareMap = buildCompareVersusSlugMap(
      rawCandidateVariants,
      partialCandidateSlugMap,
      { 'apple-iphone-16-512gb': '' }
    );
    assert.equal(
      propagatedCompareMap?.['apple-iphone-16-512gb'],
      'apple-iphone-16',
      'buildCompareVersusSlugMap propagates Item slug to unmapped sibling even if client fetch failed'
    );
    assert.equal(
      isValidCompareVersusPair(
        'apple-iphone-16-512gb',
        'apple-iphone-16-256gb',
        propagatedCompareMap
      ),
      false,
      'Same-Item storage siblings are rejected by isValidCompareVersusPair'
    );
    const resolvedBattles = resolveComparePopularBattles(
      rawCandidateVariants,
      'smartphones',
      partialCandidateSlugMap,
      3
    );
    assert.deepEqual(
      resolvedBattles.map((b) => b.versusHref),
      [
        '/compare/apple-iphone-16-vs-samsung-galaxy-s24',
        '/compare/apple-iphone-16-vs-xiaomi-14-ultra',
        '/compare/samsung-galaxy-s24-vs-xiaomi-14-ultra',
      ]
    );

    // Failed Item lookups stay out of clientItemSlugs and retry with bounded backoff,
    // while confirmed HTTP 200 unlinked responses are stored and never retried.
    assert.equal(
      parseCompareItemLookupAnswer(
        false,
        { ok: true },
        'apple-iphone-16-512gb'
      ),
      null,
      'HTTP 500 response is never treated as confirmed'
    );
    assert.equal(
      parseCompareItemLookupAnswer(
        true,
        { ok: false },
        'apple-iphone-16-512gb'
      ),
      null,
      'Error payload without ok:true is never treated as confirmed'
    );
    assert.equal(
      parseCompareItemLookupAnswer(
        true,
        { ok: true, data: { product: { slug: 'unlinked-phone-256gb' } } },
        'unlinked-phone-256gb'
      ),
      'unlinked-phone-256gb',
      'HTTP 200 unlinked variant response resolves to confirmed variant slug'
    );
    assert.equal(
      parseCompareItemLookupAnswer(
        true,
        {
          ok: true,
          data: {
            product: { slug: 'apple-iphone-16-512gb' },
            item: { slug: 'apple-iphone-16' },
          },
        },
        'apple-iphone-16-512gb'
      ),
      'apple-iphone-16',
      'HTTP 200 linked variant response resolves to canonical Item slug'
    );

    const lookupFailures = new Map<string, CompareItemLookupFailure>();
    const confirmedClientSlugs: Record<string, string> = {};
    const t0 = 1_000_000;
    const batch1 = planCompareItemLookupBatch(
      ['apple-iphone-16-512gb', 'unlinked-phone-256gb'],
      partialCandidateSlugMap,
      confirmedClientSlugs,
      lookupFailures,
      t0
    );
    assert.deepEqual(batch1.readyToFetch, [
      'apple-iphone-16-512gb',
      'unlinked-phone-256gb',
    ]);
    const outcome1 = applyCompareItemLookupOutcomes(
      [
        ['apple-iphone-16-512gb', null],
        ['unlinked-phone-256gb', 'unlinked-phone-256gb'],
      ],
      lookupFailures,
      t0
    );
    assert.deepEqual(outcome1.confirmed, [
      ['unlinked-phone-256gb', 'unlinked-phone-256gb'],
    ]);
    for (const [s, itemSlug] of outcome1.confirmed) {
      confirmedClientSlugs[s] = itemSlug;
    }
    assert.equal(
      Object.hasOwn(confirmedClientSlugs, 'apple-iphone-16-512gb'),
      false,
      'Failed HTTP 500 lookup is kept out of clientItemSlugs'
    );
    assert.equal(outcome1.nextRetryAt, t0 + COMPARE_ITEM_LOOKUP_RETRY_MS);

    const duringBackoff = planCompareItemLookupBatch(
      ['apple-iphone-16-512gb', 'unlinked-phone-256gb'],
      partialCandidateSlugMap,
      confirmedClientSlugs,
      lookupFailures,
      t0 + COMPARE_ITEM_LOOKUP_RETRY_MS - 1
    );
    assert.deepEqual(duringBackoff.readyToFetch, []);
    assert.equal(
      duringBackoff.earliestRetryAt,
      t0 + COMPARE_ITEM_LOOKUP_RETRY_MS
    );

    const afterBackoff = planCompareItemLookupBatch(
      ['apple-iphone-16-512gb', 'unlinked-phone-256gb'],
      partialCandidateSlugMap,
      confirmedClientSlugs,
      lookupFailures,
      t0 + COMPARE_ITEM_LOOKUP_RETRY_MS
    );
    assert.deepEqual(
      afterBackoff.readyToFetch,
      ['apple-iphone-16-512gb'],
      'Failed slug becomes eligible after backoff while confirmed unlinked slug is not retried'
    );

    const outcome2Fail = applyCompareItemLookupOutcomes(
      [['apple-iphone-16-512gb', null]],
      lookupFailures,
      t0 + COMPARE_ITEM_LOOKUP_RETRY_MS
    );
    assert.equal(
      lookupFailures.get('apple-iphone-16-512gb')?.attempts,
      MAX_COMPARE_ITEM_LOOKUP_ATTEMPTS
    );
    assert.equal(outcome2Fail.nextRetryAt, Number.POSITIVE_INFINITY);
    const exhaustedBatch = planCompareItemLookupBatch(
      ['apple-iphone-16-512gb', 'unlinked-phone-256gb'],
      partialCandidateSlugMap,
      confirmedClientSlugs,
      lookupFailures,
      t0 + COMPARE_ITEM_LOOKUP_RETRY_MS * 10
    );
    assert.deepEqual(exhaustedBatch.readyToFetch, []);
    assert.equal(exhaustedBatch.earliestRetryAt, Number.POSITIVE_INFINITY);

    // Source-level guards for hardcoded vi-VN and decorative Bs* icons in LeaderboardExplorer.tsx.
    for (const relPath of [
      'components/leaderboard/LeaderboardExplorer.tsx',
      'components/compare/VersusInteractiveScoreboard.tsx',
      'components/compare/CompareWorkspace.tsx',
    ]) {
      const fileSrc = fs.readFileSync(path.join(webSrcDir, relPath), 'utf8');
      assert.doesNotMatch(
        fileSrc,
        /toLocaleString\('vi-VN'\)/,
        `${relPath} must format VND with locale instead of hardcoded toLocaleString('vi-VN')`
      );
    }

    const leaderboardSrc1764 = fs.readFileSync(
      path.join(webSrcDir, 'components/leaderboard/LeaderboardExplorer.tsx'),
      'utf8'
    );
    const leaderboardBsTags = [
      ...leaderboardSrc1764.matchAll(/<Bs[A-Z]\w*[^>]*>/g),
    ].map((m) => m[0]);
    assert.ok(
      leaderboardBsTags.length >= 14,
      'Decorative Bs* icon tags in LeaderboardExplorer.tsx matched'
    );
    for (const tag of leaderboardBsTags) {
      assert.match(
        tag,
        /\baria-hidden="true"/,
        `Decorative icon ${tag} in LeaderboardExplorer.tsx must carry aria-hidden="true"`
      );
    }

    test('compare/[versus]/page.tsx and VersusMatchupSwitcher canonical Item slugs & same-Item guards (#1764)', async () => {
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
      const { attachVersusItemSlug, buildVersusItemListSchema } =
        await import('../../app/[locale]/compare/[versus]/page');
      const {
        default: VersusMatchupSwitcher,
        buildVersusPeerItemSlugMap,
        formatVersusPeerPriceBadge,
        isSameVersusPeerItem,
        resolveEffectivePeerSlugs,
        resolveVersusPeerSideSlug,
        sanitizeVersusPeerPriceVnd,
      } = await import('../../components/compare/VersusMatchupSwitcher');

      for (const invalidPrice of [
        true,
        false,
        null,
        undefined,
        0,
        -0,
        0.4,
        '0.49',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        -500_000,
        MAX_VALID_VND_PRICE + 0.4,
        MAX_VALID_VND_PRICE + 1,
        '0x1000000',
        '+0x1000000',
        '-0x1000000',
        '0b101000',
        '0o777000',
        '\u000025000000',
        '25000\u0000000',
        '25000000\n',
        '25000000\t',
        [25_000_000],
        { valueOf: () => 25_000_000 },
      ]) {
        assert.equal(sanitizeVersusPeerPriceVnd(invalidPrice), 0);
        assert.equal(formatVersusPeerPriceBadge(invalidPrice), 'N/A');
      }
      assert.equal(sanitizeVersusPeerPriceVnd(' 24990000 '), 24_990_000);
      assert.equal(formatVersusPeerPriceBadge(' 24990000 '), '25M');

      const switcherPeers: ItemCatalogRow[] = [
        { ...secondItemRow, slug: 'apple-iphone-16-128gb' },
        { ...secondItemRow, slug: 'apple-iphone-16-256gb' },
        pricedCatalogRow,
        thirdItemRow,
      ];
      const switcherMap = {
        ...buildVersusPeerItemSlugMap(switcherPeers),
        // Out-of-top-60 default variant mapped to the same Item:
        'apple-iphone-16-64gb': 'apple-iphone-16',
      };
      assert.equal(
        resolveVersusPeerSideSlug('apple-iphone-16-128gb', switcherMap),
        'apple-iphone-16'
      );
      assert.equal(
        isSameVersusPeerItem(
          'apple-iphone-16-128gb',
          'apple-iphone-16-256gb',
          switcherMap
        ),
        true
      );
      assert.deepEqual(
        resolveEffectivePeerSlugs(
          switcherPeers,
          'apple-iphone-16-64gb',
          'apple-iphone-16-256gb',
          switcherMap
        ),
        {
          effectiveSlugA: 'apple-iphone-16-128gb',
          effectiveSlugB: 'samsung-galaxy-s24-256gb',
        }
      );
      assert.deepEqual(
        resolveEffectivePeerSlugs(
          switcherPeers.slice(0, 2),
          'apple-iphone-16-128gb',
          'apple-iphone-16-256gb',
          switcherMap
        ),
        {
          effectiveSlugA: 'apple-iphone-16-128gb',
          effectiveSlugB: '',
        }
      );

      const stubRouter: AppRouterInstance = {
        bfcacheId: '',
        back: () => {},
        forward: () => {},
        refresh: () => {},
        push: () => {},
        replace: () => {},
        prefetch: () => {},
      };
      const switcherHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: stubRouter },
          React.createElement(
            Provider,
            {
              locale: 'en',
              messages: pickClientMessages(
                enMessages as unknown as Record<string, unknown>,
                'compare'
              ),
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(VersusMatchupSwitcher, {
              currentSlugA: 'apple-iphone-16-64gb',
              currentSlugB: 'samsung-galaxy-s24-256gb',
              categorySlug: 'smartphones',
              catalogCandidates: switcherPeers,
              locale: 'en',
              itemSlugBySlug: switcherMap,
            })
          )
        )
      );
      const selectMatches = [
        ...switcherHtml.matchAll(/<select\b[\s\S]*?<\/select>/g),
      ].map((m) => m[0]);
      assert.equal(selectMatches.length, 2);
      assert.match(
        selectMatches[1]!,
        /<option value="apple-iphone-16-128gb" disabled=""/,
        'Device B select disables primary variant of Device A Item'
      );
      assert.match(
        selectMatches[1]!,
        /<option value="apple-iphone-16-256gb" disabled=""/,
        'Device B select disables sibling storage variant of Device A Item'
      );
      assert.match(
        switcherHtml,
        /<button type="submit" disabled=""/,
        'Submit button stays disabled when resolved canonical versusHref matches current page'
      );

      const sameItemOnlySwitcherHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: stubRouter },
          React.createElement(
            Provider,
            {
              locale: 'en',
              messages: pickClientMessages(
                enMessages as unknown as Record<string, unknown>,
                'compare'
              ),
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(VersusMatchupSwitcher, {
              currentSlugA: 'apple-iphone-16-128gb',
              currentSlugB: 'apple-iphone-16-256gb',
              categorySlug: 'smartphones',
              catalogCandidates: switcherPeers.slice(0, 2),
              locale: 'en',
              itemSlugBySlug: switcherMap,
            })
          )
        )
      );
      assert.equal(
        sameItemOnlySwitcherHtml,
        '',
        'VersusMatchupSwitcher renders nothing when all peers belong to one Item'
      );

      const compareWorkspaceHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: stubRouter },
          React.createElement(
            Provider,
            {
              locale: 'en',
              messages: pickClientMessages(
                enMessages as unknown as Record<string, unknown>,
                'compare'
              ),
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(CompareWorkspace, {
              initialProducts: [
                rawCandidateVariants[1]!,
                rawCandidateVariants[2]!,
              ],
              catalogCandidates: rawCandidateVariants,
              initialCategory: 'smartphones',
              hasExplicitSlugs: true,
              locale: 'en',
              itemSlugBySlug: partialCandidateSlugMap,
            })
          )
        )
      );
      const popularBattleLinks = [
        ...compareWorkspaceHtml.matchAll(
          /<a\b[^>]*data-testid="popular-battle-1v1-link"[^>]*>/g
        ),
      ].map((m) => m[0]);
      assert.equal(
        popularBattleLinks.length,
        3,
        'CompareWorkspace SSR popularBattles renders action links on all 3 battle cards'
      );
      assert.match(
        popularBattleLinks[0]!,
        /href="(?:\/en)?\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"/,
        'CompareWorkspace SSR popular-battle card link uses propagated canonical Item versusHref when higher-ranked sibling was omitted from itemSlugBySlug'
      );
      assert.match(
        popularBattleLinks[1]!,
        /href="(?:\/en)?\/compare\/apple-iphone-16-vs-xiaomi-14-ultra"/,
        'Second popular-battle card link also uses propagated canonical Item versusHref'
      );
      for (const battleLinkTag of popularBattleLinks) {
        assert.doesNotMatch(
          battleLinkTag,
          /\/compare\/apple-iphone-16-512gb-vs-/,
          'Popular-battle card link never leaks redirecting variant slug'
        );
      }

      // Variant rows without category_id/category_slug keep their variant-inferred
      // category when Item slug is substituted in JSON-LD and CompareWorkspace links.
      const unhintedTabletVariant: MasterProduct = {
        ...phone('acme-tablet-x1-256gb', 4.8),
        name: 'Acme X1',
        model: 'X1',
        category_id: null,
        metadata: { custom_flag: true },
        specifications: {},
      } as unknown as MasterProduct;
      const tabletMap = {
        'acme-tablet-x1-256gb': 'acme-x1',
        'ipad-pro-m4-256gb': 'ipad-pro-m4',
      };
      const tabletPeer: MasterProduct = {
        ...phone('ipad-pro-m4-256gb', 4.9),
        name: 'iPad Pro M4',
        model: 'iPad Pro',
        category_id: null,
        metadata: undefined,
        specifications: {},
      } as unknown as MasterProduct;
      const tabletSchema = buildVersusItemListSchema('Acme X1', 'iPad Pro M4', [
        {
          name: 'Acme X1',
          product: attachVersusItemSlug(unhintedTabletVariant, tabletMap),
        },
        {
          name: 'iPad Pro M4',
          product: attachVersusItemSlug(tabletPeer, tabletMap),
        },
      ]);
      assert.deepEqual(
        tabletSchema.itemListElement.map((el) => el.url),
        [
          'https://rate.vn/tablets/acme-x1',
          'https://rate.vn/tablets/ipad-pro-m4',
        ]
      );

      const tabletCompareHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: stubRouter },
          React.createElement(
            Provider,
            {
              locale: 'en',
              messages: pickClientMessages(
                enMessages as unknown as Record<string, unknown>,
                'compare'
              ),
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(CompareWorkspace, {
              initialProducts: [unhintedTabletVariant, tabletPeer],
              catalogCandidates: [unhintedTabletVariant, tabletPeer],
              initialCategory: 'tablets',
              hasExplicitSlugs: true,
              locale: 'en',
              itemSlugBySlug: tabletMap,
            })
          )
        )
      );
      assert.match(
        tabletCompareHtml,
        /href="(?:\/en)?\/tablets\/acme-x1"/,
        'CompareWorkspace matrix header product link preserves variant-inferred tablets category'
      );
      assert.match(
        tabletCompareHtml,
        /href="(?:\/en)?\/tablets\/acme-x1#jreviews-section"/,
        'CompareWorkspace matrix reviews CTA preserves variant-inferred tablets category'
      );
      assert.doesNotMatch(
        tabletCompareHtml,
        /\/smartphones\/acme-x1/,
        'CompareWorkspace never misclassifies tablet Item slug as smartphones'
      );

      const rawA = phone('apple-iphone-16-256gb', 4.8);
      const rawB = phone('samsung-galaxy-s24-256gb', 4.7);
      const map = {
        'apple-iphone-16-256gb': 'apple-iphone-16',
        'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
      };
      const itemA = attachVersusItemSlug(rawA, map);
      const itemB = attachVersusItemSlug(rawB, map);
      const scoredA = scoreMasterProductForLeaderboard(itemA, 'combined');
      const scoredB = scoreMasterProductForLeaderboard(itemB, 'combined');

      assert.equal(scoredA.productHref, '/smartphones/apple-iphone-16');
      assert.equal(scoredB.productHref, '/smartphones/samsung-galaxy-s24');

      const schema = buildVersusItemListSchema(itemA.name, itemB.name, [
        scoredA,
        scoredB,
      ]);
      assert.deepEqual(
        schema.itemListElement.map((el) => el.url),
        [
          'https://rate.vn/smartphones/apple-iphone-16',
          'https://rate.vn/smartphones/samsung-galaxy-s24',
        ]
      );

      const scoreboardHtml = renderToStaticMarkup(
        React.createElement(
          Provider,
          {
            locale: 'cs',
            messages: pickClientMessages(
              csMessages as unknown as Record<string, unknown>,
              'compare'
            ),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(VersusInteractiveScoreboard, {
            scoreA: scoredA,
            scoreB: scoredB,
            locale: 'cs',
          })
        )
      );
      assert.match(
        scoreboardHtml,
        /href="(?:\/cs)?\/smartphones\/apple-iphone-16"/,
        'VersusInteractiveScoreboard product A link points to canonical Item URL'
      );
      assert.match(
        scoreboardHtml,
        /href="(?:\/cs)?\/smartphones\/samsung-galaxy-s24"/,
        'VersusInteractiveScoreboard product B link points to canonical Item URL'
      );
    });
  }
}

console.log('leaderboard-criteria: criterion scores are real or null');

test('a retry settles independently while a sibling body is still pending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  const pending = new Map<string, AbortController>();
  const failures = new Map<string, CompareItemLookupFailure>();
  const confirmed: Record<string, string> = {};
  const settled: string[] = [];
  const calls: string[] = [];
  const body = new ReadableStream<Uint8Array>();
  const fetchProduct: typeof fetch = async (url) => {
    const slug = String(url).split('/').pop()!;
    calls.push(slug);
    if (slug === 'slow') return new Response(body);
    if (slug === 'flaky' && !failures.has(slug)) {
      return new Response(null, { status: 503 });
    }
    return Response.json({
      ok: true,
      data: { item: { slug: `${slug}-item` } },
    });
  };
  const plan = () => {
    const batch = planCompareItemLookupBatch(
      ['slow', 'flaky', 'fast'],
      {},
      confirmed,
      failures,
      Date.now()
    );
    for (const slug of batch.readyToFetch) {
      startCompareItemLookup(
        slug,
        pending,
        (key, itemSlug) => {
          settled.push(key);
          applyCompareItemLookupOutcomes(
            [[key, itemSlug]],
            failures,
            Date.now()
          );
          if (itemSlug) confirmed[key] = itemSlug;
        },
        fetchProduct
      );
    }
    return batch;
  };
  plan();
  const slow = pending.get('slow')!;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual({ ...confirmed }, { fast: 'fast-item' });
  assert.equal(plan().earliestRetryAt, 1_000 + COMPARE_ITEM_LOOKUP_RETRY_MS);
  t.mock.timers.tick(COMPARE_ITEM_LOOKUP_RETRY_MS);
  plan();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['slow', 'flaky', 'fast', 'flaky']);
  assert.equal(pending.get('slow'), slow);
  assert.equal(slow.signal.aborted, false);
  assert.equal(confirmed.flaky, 'flaky-item');

  t.mock.timers.tick(
    COMPARE_ITEM_LOOKUP_TIMEOUT_MS - COMPARE_ITEM_LOOKUP_RETRY_MS
  );
  assert.equal(slow.signal.aborted, true);
  assert.equal(pending.size, 0);
  assert.equal(settled.filter((slug) => slug === 'slow').length, 1);
  assert.equal(
    failures.get('slow')?.retryAt,
    Date.now() + COMPARE_ITEM_LOOKUP_RETRY_MS
  );
});

test('an aborted lookup cannot publish or release its replacement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = new Map<string, AbortController>();
  const answers: Array<string | null> = [];
  const responses: Array<(value: Response) => void> = [];
  const start = () =>
    startCompareItemLookup(
      'phone',
      pending,
      (_, item) => answers.push(item),
      () => new Promise<Response>((resolve) => responses.push(resolve))
    );
  start();
  pending.get('phone')!.abort();
  assert.equal(pending.size, 0);
  start();
  const replacement = pending.get('phone');
  responses[0]!(Response.json({ ok: true, data: { item: { slug: 'old' } } }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(answers, []);
  assert.equal(pending.get('phone'), replacement);
  responses[1]!(Response.json({ ok: true, data: { item: { slug: 'new' } } }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(COMPARE_ITEM_LOOKUP_TIMEOUT_MS);
  assert.deepEqual(answers, ['new']);
  assert.equal(pending.size, 0);
});

test('a shared leaderboard link includes its irregular pinned master and bare peer', () => {
  const entries = resolveLeaderboardCompareEntries([
    {
      product: {
        id: 'big',
        item_slug: 'acme',
        slug: 'acme-retail-1tb',
        variant_key: '1024gb',
        variant_count: 2,
      },
    },
    { product: { item_slug: 'peer', slug: 'peer-retail' } },
  ]);
  const query = new URL(
    leaderboardCompareHref(entries, 'tablets', 'cat'),
    'https://rate.test'
  ).searchParams;
  assert.equal(query.get('slugs'), 'acme@1024gb,peer');
  assert.equal(query.get('variant.acme@1024gb'), 'acme-retail-1tb');
  assert.equal(query.get('variant.peer'), 'peer-retail');
});

test('a directory outage distinguishes an empty Item selection from no selection', async (t) => {
  const previous = process.env.RATE_ITEM_MODEL;
  t.after(() => {
    if (previous === undefined) delete process.env.RATE_ITEM_MODEL;
    else process.env.RATE_ITEM_MODEL = previous;
  });
  process.env.RATE_ITEM_MODEL = 'off';
  const slugs = ['acme-retail-1tb'];
  assert.deepEqual(await getItemSlugsFor(slugs, []), {});
  assert.equal(await getItemSlugsFor(slugs), null);
});

test('a later failed compare read preserves the selection that already resolved', async (t) => {
  const previous = process.env.RATE_ITEM_MODEL;
  t.after(() => {
    if (previous === undefined) delete process.env.RATE_ITEM_MODEL;
    else process.env.RATE_ITEM_MODEL = previous;
  });
  process.env.RATE_ITEM_MODEL = 'item';
  const slugs = ['acme-256gb'];
  const selected = await whenItemModel('compare slugs', async () => slugs);
  const failed = await whenItemModel('compare slugs', async () => {
    throw new Error('simulated metadata lookup failure');
  });
  assert.deepEqual(selected, slugs);
  assert.equal(failed, null);
  assert.equal(await getItemSlugsFor(slugs, failed), null);
  process.env.RATE_ITEM_MODEL = 'off';
  assert.deepEqual(await getItemSlugsFor(slugs, selected), {});
});

test('an all-bare leaderboard link records the published masters it represents', () => {
  const entries = resolveLeaderboardCompareEntries([
    { product: { item_slug: 'acme', slug: 'acme-retail-1tb' } },
    { product: { item_slug: 'peer', slug: 'peer-512gb' } },
  ]);
  const query = new URL(
    leaderboardCompareHref(entries, 'smartphones', 'category'),
    'https://rate.test'
  ).searchParams;
  assert.equal(query.get('slugs'), 'acme,peer');
  assert.equal(query.get('variant.acme'), 'acme-retail-1tb');
  assert.equal(query.get('variant.peer'), 'peer-512gb');
});

test('RTINGS-style UseCaseWeightBar SSR, Official vs Custom Score parity & WCAG 2.1 AA a11y across vi/en/cs (#1864)', () => {
  const IntlProvider =
    NextIntlClientProvider as unknown as React.ComponentType<{
      locale: string;
      messages: Record<string, unknown>;
      timeZone: string;
      children?: React.ReactNode;
    }>;
  const stubRouter: AppRouterInstance = {
    bfcacheId: '',
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
  };

  const HTML_ENTITY_MAP: Readonly<Record<string, string>> = {
    amp: '&',
    quot: '"',
    '#x27': "'",
    '#39': "'",
    lt: '<',
    gt: '>',
  };

  const extractMarkupText = (
    fragment: string,
    skipAriaHidden = false
  ): string => {
    const out: string[] = [];
    let hiddenDepth = 0;
    let i = 0;
    while (i < fragment.length) {
      if (fragment[i] === '<') {
        let end = i + 1;
        let quote: string | null = null;
        while (end < fragment.length) {
          const ch = fragment[end]!;
          if (quote) {
            if (ch === quote) quote = null;
          } else if (ch === '"' || ch === "'") {
            quote = ch;
          } else if (ch === '>') {
            break;
          }
          end += 1;
        }
        const tagInner = fragment.slice(i + 1, end).trim();
        const isClosing = tagInner.startsWith('/');
        const isSelfClosing = tagInner.endsWith('/');
        if (isClosing) {
          if (hiddenDepth > 0) hiddenDepth -= 1;
        } else if (hiddenDepth > 0) {
          if (!isSelfClosing) hiddenDepth += 1;
        } else if (
          skipAriaHidden &&
          /\baria-hidden\s*=\s*(?:"true"|'true')/i.test(tagInner)
        ) {
          if (!isSelfClosing) hiddenDepth = 1;
        }
        if (hiddenDepth === 0) out.push(' ');
        i = end + 1;
        continue;
      }
      if (hiddenDepth === 0) {
        out.push(fragment[i]!);
      }
      i += 1;
    }
    return out
      .join('')
      .replace(
        /&(amp|quot|#x27|#39|lt|gt);/g,
        (full, key: string) => HTML_ENTITY_MAP[key] ?? full
      )
      .replace(/\s+/g, ' ')
      .trim();
  };

  const assertAccessibleControls = (html: string, context: string) => {
    assert.doesNotMatch(
      html,
      /[\u2013\u2014]|&mdash;|&ndash;/,
      `${context}: zero em-dashes or en-dashes`
    );

    const rangeInputs = [
      ...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g),
    ].map((m) => m[0]);
    assert.ok(
      rangeInputs.length >= 5,
      `${context}: renders category criterion range sliders`
    );
    for (const inputTag of rangeInputs) {
      const idMatch = /\bid="([^"]+)"/.exec(inputTag);
      assert.ok(idMatch?.[1], `${context}: range input must carry an id`);
      const escapedId = idMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const labelRe = new RegExp(
        `<label\\b[^>]*\\bfor="${escapedId}"[^>]*>([\\s\\S]*?)<\\/label>`
      );
      const labelMatch = labelRe.exec(html);
      assert.ok(
        labelMatch && extractMarkupText(labelMatch[1] ?? '').length > 0,
        `${context}: range input #${idMatch[1]} must have a non-empty <label htmlFor>`
      );
    }

    // WCAG 2.5.3 / axe label-content-name-mismatch: any button carrying BOTH
    // visible text (excluding aria-hidden icons) and aria-label must include
    // its visible text inside aria-label.
    const buttons = [
      ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
    ];
    for (const [, attrs = '', inner = ''] of buttons) {
      const ariaMatch = /\baria-label="([^"]+)"/.exec(attrs);
      if (!ariaMatch) continue;
      const visible = extractMarkupText(inner, true);
      if (!visible) continue;
      assert.ok(
        ariaMatch[1]!.toLowerCase().includes(visible.toLowerCase()),
        `${context}: button aria-label "${ariaMatch[1]}" must contain visible text "${visible}"`
      );
    }
  };

  const cameraPhone: ItemCatalogRow = {
    id: 'prod-cam-pro',
    slug: 'camera-pro-max',
    name: 'Camera Pro Max',
    brand: 'Acme',
    model: 'Camera Pro Max',
    rating_score: 4.5,
    user_rating_weighted: 4.5,
    expert_rating: 8.8,
    authentic_review_count: 24,
    total_reviews: 28,
    min_price: 24_990_000,
    max_price: 26_990_000,
    merchant_count: 5,
    metadata: { category_slug: 'smartphones' },
    specifications: {
      display: { size_inch: 6.7, refresh_rate_hz: 120 },
      hardware: { ram_gb: 12, storage_gb: 256 },
      battery: { capacity_mah: 5000, fast_charging_w: 45 },
      camera: { main_camera: '50 MP OIS', second_camera: '48 MP' },
    },
    criteria_scores: {
      camera: { score: 4.9, writers: 14 },
      display: { score: 4.7, writers: 14 },
      performance: { score: 3.6, writers: 14 },
      battery: { score: 3.8, writers: 14 },
      design: { score: 4.5, writers: 14 },
      value: { score: 3.9, writers: 14 },
    },
    expert_criteria_scores: {
      screen: 4.7,
      performance: 3.6,
      camera: 4.9,
      battery: 3.8,
      value: 3.9,
    },
  } as unknown as ItemCatalogRow;

  const gamingPhone: ItemCatalogRow = {
    id: 'prod-game-beast',
    slug: 'gaming-beast-ultra',
    name: 'Gaming Beast Ultra',
    brand: 'Zenith',
    model: 'Gaming Beast Ultra',
    rating_score: 4.2,
    user_rating_weighted: 4.2,
    expert_rating: 8.4,
    authentic_review_count: 19,
    total_reviews: 21,
    min_price: 18_990_000,
    max_price: 20_490_000,
    merchant_count: 4,
    metadata: { category_slug: 'smartphones' },
    specifications: {
      display: { size_inch: 6.8, refresh_rate_hz: 144 },
      hardware: { ram_gb: 16, storage_gb: 512 },
      battery: { capacity_mah: 6000, fast_charging_w: 80 },
      camera: { main_camera: '50 MP', second_camera: '8 MP' },
    },
    criteria_scores: {
      camera: { score: 3.5, writers: 12 },
      display: { score: 4.5, writers: 12 },
      performance: { score: 4.95, writers: 12 },
      battery: { score: 4.85, writers: 12 },
      design: { score: 4.0, writers: 12 },
      value: { score: 4.7, writers: 12 },
    },
    expert_criteria_scores: {
      screen: 4.5,
      performance: 4.95,
      camera: 3.5,
      battery: 4.85,
      value: 4.7,
    },
  } as unknown as ItemCatalogRow;

  const unratedPhone: ItemCatalogRow = {
    id: 'prod-unrated-lite',
    slug: 'unrated-phone-lite',
    name: 'Unrated Phone Lite',
    brand: 'Nova',
    model: 'Unrated Phone Lite',
    rating_score: 4.1,
    user_rating_weighted: 4.1,
    authentic_review_count: 6,
    total_reviews: 6,
    min_price: 9_990_000,
    merchant_count: 2,
    metadata: { category_slug: 'smartphones' },
    specifications: {
      display: { size_inch: 6.5, refresh_rate_hz: 90 },
      hardware: { ram_gb: 8, storage_gb: 128 },
      battery: { capacity_mah: 5000 },
    },
  } as unknown as ItemCatalogRow;

  const localeBundles = [
    {
      locale: 'vi',
      messages: viMessages as unknown as Record<string, unknown>,
    },
    {
      locale: 'en',
      messages: enMessages as unknown as Record<string, unknown>,
    },
    {
      locale: 'cs',
      messages: csMessages as unknown as Record<string, unknown>,
    },
  ] as const;

  for (const { locale, messages } of localeBundles) {
    const compareCopy = messages.compare as Record<string, string>;
    const leaderboardCopy = messages.leaderboard as Record<string, string>;

    // 1. LeaderboardExplorer SSR: Gaming preset flips leader to Gaming Beast Ultra
    // while keeping Official Rate.vn Score alongside Your Custom Score
    const lbGamingHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'leaderboard'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(LeaderboardExplorer, {
            products: [cameraPhone, gamingPhone],
            locale,
            initialCategory: 'smartphones',
            initialWeightMode: 'gaming',
            initialShowWeightSliders: true,
          })
        )
      )
    );
    assertAccessibleControls(lbGamingHtml, `Leaderboard(${locale})`);
    assert.match(lbGamingHtml, /data-testid="leaderboard-weights-bar"/);
    assert.match(
      lbGamingHtml,
      /data-testid="leaderboard-weights-preset-gaming"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="leaderboard-weights-preset-gaming"/
    );
    assert.ok(
      lbGamingHtml.includes(leaderboardCopy.officialRateScoreLabel!),
      `Leaderboard(${locale}) keeps official Rate.vn score label visible`
    );
    assert.ok(
      lbGamingHtml.includes(leaderboardCopy.yourCustomScoreLabel!),
      `Leaderboard(${locale}) renders Your Custom Score label`
    );
    const weightBarSlice =
      /data-testid="leaderboard-weights-bar"[\s\S]*?data-testid="leaderboard-weights-sliders-panel"/.exec(
        lbGamingHtml
      )?.[0] ?? '';
    assert.doesNotMatch(
      weightBarSlice,
      /\bbtn-dark\b/,
      'UseCaseWeightBar must never use btn-dark so leaderboard.spec.ts active criterion selector stays unique'
    );
    assert.ok(
      lbGamingHtml.indexOf('Gaming Beast Ultra') <
        lbGamingHtml.indexOf('Camera Pro Max'),
      `Leaderboard(${locale}) ranks Gaming Beast Ultra #1 under gaming preset`
    );

    const lbCameraHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'leaderboard'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(LeaderboardExplorer, {
            products: [cameraPhone, gamingPhone],
            locale,
            initialCategory: 'smartphones',
            initialWeightMode: 'camera',
          })
        )
      )
    );
    assert.ok(
      lbCameraHtml.indexOf('Camera Pro Max') <
        lbCameraHtml.indexOf('Gaming Beast Ultra'),
      `Leaderboard(${locale}) ranks Camera Pro Max #1 under camera preset`
    );

    // Unscored seed products render zero preset controls (#1553)
    const lbUnscoredHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'leaderboard'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(LeaderboardExplorer, {
            products: [unratedPhone],
            locale,
          })
        )
      )
    );
    assert.doesNotMatch(
      lbUnscoredHtml,
      /data-testid="leaderboard-weights-bar"/
    );

    // 2. CompareWorkspace SSR: Camera preset + unrated product graceful handling
    const compareHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'compare'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(CompareWorkspace, {
            initialProducts: [
              cameraPhone as unknown as MasterProduct,
              gamingPhone as unknown as MasterProduct,
              unratedPhone as unknown as MasterProduct,
            ],
            catalogCandidates: [
              cameraPhone as unknown as MasterProduct,
              gamingPhone as unknown as MasterProduct,
              unratedPhone as unknown as MasterProduct,
            ],
            initialCategory: 'smartphones',
            hasExplicitSlugs: true,
            locale,
            initialWeightMode: 'camera',
            initialShowWeightSliders: true,
          })
        )
      )
    );
    assertAccessibleControls(compareHtml, `CompareWorkspace(${locale})`);
    assert.match(compareHtml, /data-testid="compare-use-case-card"/);
    assert.match(compareHtml, /data-testid="compare-custom-winner-banner"/);
    assert.match(compareHtml, /data-testid="compare-custom-score-row"/);
    assert.equal(
      [...compareHtml.matchAll(/data-testid="compare-col-custom-score"/g)]
        .length,
      3,
      `CompareWorkspace(${locale}) renders custom score badge in all 3 product columns`
    );
    assert.ok(
      compareHtml.includes(compareCopy.officialRateScoreLabel!),
      `CompareWorkspace(${locale}) keeps official Rate.vn score label visible`
    );
    assert.ok(
      compareHtml.includes(compareCopy.criterionNoData!),
      `CompareWorkspace(${locale}) shows criterionNoData for unrated product instead of inventing a score`
    );
    assert.match(
      compareHtml,
      /data-testid="compare-combo-cart-link"[^>]*href="\/watchlist\?items=[^"]+"|href="\/watchlist\?items=[^"]+"[^>]*data-testid="compare-combo-cart-link"/,
      `CompareWorkspace(${locale}) renders combo cart CTA link`
    );

    // CompareWorkspace with layout="versus" does NOT duplicate UseCaseWeightBar
    const compareInVersusLayoutHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'compare'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(CompareWorkspace, {
            initialProducts: [
              cameraPhone as unknown as MasterProduct,
              gamingPhone as unknown as MasterProduct,
            ],
            catalogCandidates: [
              cameraPhone as unknown as MasterProduct,
              gamingPhone as unknown as MasterProduct,
            ],
            initialCategory: 'smartphones',
            hasExplicitSlugs: true,
            locale,
            layout: 'versus',
          })
        )
      )
    );
    assert.doesNotMatch(
      compareInVersusLayoutHtml,
      /data-testid="compare-use-case-card"/
    );

    // 3. VersusInteractiveScoreboard SSR: dark variant custom weights + sliders
    const scoredA = scoreMasterProductForLeaderboard(
      cameraPhone as unknown as MasterProduct,
      'combined'
    );
    const scoredB = scoreMasterProductForLeaderboard(
      gamingPhone as unknown as MasterProduct,
      'combined'
    );
    const versusHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'compare'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(VersusInteractiveScoreboard, {
            scoreA: scoredA,
            scoreB: scoredB,
            locale,
            initialWeightMode: 'custom',
            initialCategoryWeights: {
              performance: 60,
              battery: 40,
              camera: 0,
              display: 0,
              design: 0,
              value: 0,
            },
            initialShowSliders: true,
          })
        )
      )
    );
    assertAccessibleControls(versusHtml, `VersusScoreboard(${locale})`);
    assert.match(versusHtml, /data-testid="versus-weights-bar"/);
    assert.match(versusHtml, /data-testid="versus-custom-score-banner"/);
    assert.doesNotMatch(
      versusHtml,
      /data-testid="versus-persona-lead"/,
      'VersusScoreboard suppresses duplicate legacy persona-lead line when custom-score banner is active'
    );
    assert.match(
      versusHtml,
      /data-testid="versus-combo-cart-link"[^>]*href="\/watchlist\?items=[^"]+"|href="\/watchlist\?items=[^"]+"[^>]*data-testid="versus-combo-cart-link"/,
      `VersusInteractiveScoreboard(${locale}) renders combo cart CTA link`
    );
    assert.doesNotMatch(
      versusHtml,
      /font-size:0\.75rem/i,
      'Zero 12px (0.75rem) inline text below DESIGN.md 13px floor'
    );
    assert.ok(
      versusHtml.includes(compareCopy.officialRateScoreLabel!),
      `VersusScoreboard(${locale}) keeps official Rate.vn score label visible`
    );
    assert.ok(
      versusHtml.includes(compareCopy.yourCustomScoreLabel!),
      `VersusScoreboard(${locale}) renders Your Custom Score label`
    );

    // 4. Category-specific preset label check on Laptops ("Gaming & thermals", not phone "Gaming & battery")
    // and IEEE-754 4.31 vs 4.30 non-tie check (#1864 Round-1 review)
    const laptopA: ItemCatalogRow = {
      id: 'lap-a',
      slug: 'acme-probook-14',
      name: 'Acme ProBook 14',
      brand: 'Acme',
      model: 'ProBook 14',
      rating_score: 4.4,
      user_rating_weighted: 4.4,
      authentic_review_count: 14,
      total_reviews: 14,
      min_price: 29_990_000,
      merchant_count: 3,
      metadata: { category_slug: 'laptops' },
      specifications: {
        display: { size_inch: 14, refresh_rate_hz: 120 },
        hardware: { ram_gb: 16, storage_gb: 512 },
        battery: { capacity_mah: 5000 },
      },
      criteria_scores: {
        performance: { score: 4.31, writers: 12 },
        thermals: { score: 4.31, writers: 12 },
        display: { score: 4.31, writers: 12 },
        battery: { score: 4.31, writers: 12 },
        keyboard: { score: 4.31, writers: 12 },
        design: { score: 4.31, writers: 12 },
        value: { score: 4.31, writers: 12 },
      },
    } as unknown as ItemCatalogRow;
    const laptopB: ItemCatalogRow = {
      ...laptopA,
      id: 'lap-b',
      slug: 'zenith-thinkbook-16',
      name: 'Zenith ThinkBook 16',
      brand: 'Zenith',
      model: 'ThinkBook 16',
      criteria_scores: {
        performance: { score: 4.3, writers: 12 },
        thermals: { score: 4.3, writers: 12 },
        display: { score: 4.3, writers: 12 },
        battery: { score: 4.3, writers: 12 },
        keyboard: { score: 4.3, writers: 12 },
        design: { score: 4.3, writers: 12 },
        value: { score: 4.3, writers: 12 },
      },
    } as unknown as ItemCatalogRow;

    const compareLaptopsHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pickClientMessages(messages, 'compare'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(CompareWorkspace, {
            initialProducts: [
              laptopA as unknown as MasterProduct,
              laptopB as unknown as MasterProduct,
            ],
            catalogCandidates: [
              laptopA as unknown as MasterProduct,
              laptopB as unknown as MasterProduct,
            ],
            initialCategory: 'laptops',
            hasExplicitSlugs: true,
            locale,
            initialWeightMode: 'gaming',
          })
        )
      )
    );
    const expectedLaptopGamingLabel =
      locale === 'vi'
        ? 'Gaming &amp; tản nhiệt'
        : locale === 'cs'
          ? 'Hraní her a chlazení'
          : 'Gaming &amp; thermals';
    assert.ok(
      compareLaptopsHtml.includes(expectedLaptopGamingLabel),
      `CompareWorkspace(${locale}) renders laptop-specific gaming preset label`
    );
    const laptopBannerMatch =
      /data-testid="compare-custom-winner-banner"[\s\S]*?<\/div>\s*<\/div>/.exec(
        compareLaptopsHtml
      );
    assert.ok(
      laptopBannerMatch &&
        laptopBannerMatch[0].includes('Acme ProBook 14') &&
        /\+0[.,]01/.test(laptopBannerMatch[0]),
      `CompareWorkspace(${locale}) treats 4.31 vs 4.30 as a +0.01 lead, never an IEEE-754 tie`
    );
    assert.doesNotMatch(
      compareLaptopsHtml,
      /font-size:0\.75rem/i,
      'Zero 12px (0.75rem) inline text in CompareWorkspace'
    );
  }
});
