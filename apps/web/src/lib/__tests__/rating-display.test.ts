import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  displayRating,
  formatRatingCount,
  formatRatingValue,
  formatScoreFixed,
  ratingFillPercent,
  ratingTone,
  roundScore,
} from '../rating-display';
import { CLIENT_MESSAGE_SCOPES } from '../client-messages';

// Ratings show as stars with the value and a short count (DOS/Rate#1528):
// green from 4.0, orange from 3.0, red below, judged on the printed value.
assert.equal(ratingTone(4.6), 'good');
assert.equal(ratingTone(4.0), 'good');
assert.equal(ratingTone(3.96), 'good', '3.96 prints as 4.0, so it is green');
assert.equal(ratingTone(3.94), 'fair');
assert.equal(ratingTone(3.0), 'fair');
assert.equal(ratingTone(2.96), 'fair', '2.96 prints as 3.0');
assert.equal(ratingTone(2.9), 'poor');
assert.equal(ratingTone(1), 'poor');
assert.equal(ratingTone(3.996, 2), 'good');
assert.equal(ratingTone(3.994, 2), 'fair');

// The fill follows the printed value.
assert.equal(ratingFillPercent(5), 100);
assert.equal(ratingFillPercent(4.6), 92);
assert.equal(ratingFillPercent(2.5), 50);
assert.equal(ratingFillPercent(4.96), 100);

// No rating is no rating, never "0.0" stars; values over 5 are capped.
for (const v of [0, -1, null, undefined, Number.NaN, Infinity, 'x']) {
  assert.equal(displayRating(v), null, String(v));
}
assert.equal(displayRating(4.62), 4.62);
assert.equal(displayRating(7), 5);
assert.equal(displayRating('4.5'), 4.5);

// One decimal by default, the locale's decimal mark; the value is unchanged.
assert.equal(formatRatingValue(4.62, 'vi'), '4.6');
assert.equal(formatRatingValue(4.62, 'en'), '4.6');
assert.equal(formatRatingValue(4.62, 'cs'), '4,6');
assert.equal(formatRatingValue(4.625, 'vi', 2), '4.63');
// Decimal-safe two-decimal half-up rounding (#1647): neither toFixed(2) nor
// Math.round(x * 100) / 100 rounds both 1.005 and 4.345 half up.
assert.equal(formatScoreFixed(1.005, 2), '1.01');
assert.equal(formatScoreFixed(4.345, 2), '4.35');
assert.equal(formatScoreFixed(2.675, 2), '2.68');
assert.equal(formatScoreFixed(0, 2), '0.00');
assert.equal(formatScoreFixed(-2, 1), '0.0');
assert.equal(formatScoreFixed(Number.NaN, 2), '0.00');
assert.equal(formatScoreFixed(5e-3, 2), '0.01');
assert.equal(formatScoreFixed(1e-9, 2), '0.00');
assert.equal(roundScore(1.005, 2), 1.01);
assert.equal(roundScore(4.345, 2), 4.35);
assert.equal(formatRatingValue(1.005, 'vi', 2), '1.01');
assert.equal(formatRatingValue(1.005, 'cs', 2), '1,01');
assert.equal(formatRatingValue(4.345, 'vi', 2), '4.35');
assert.equal(formatRatingValue(4.345, 'cs', 2), '4,35');
for (let thousandths = 1; thousandths <= 5000; thousandths++) {
  assert.equal(
    roundScore(thousandths / 1000, 2),
    Math.floor((thousandths + 5) / 10) / 100,
    `roundScore(${thousandths / 1000}, 2)`
  );
}
// x.x5 rounds half up on the decimal value, like the database and the
// minRating filter: a stored 4.350 prints 4.4, never 4.3 (#1631).
assert.equal(formatRatingValue(4.35, 'vi'), '4.4');
assert.equal(formatRatingValue(4.35, 'en'), '4.4');
assert.equal(formatRatingValue(4.35, 'cs'), '4,4');
assert.equal(formatRatingValue(4.05, 'vi'), '4.1');
assert.equal(formatRatingValue(4.55, 'vi'), '4.6');
assert.equal(formatRatingValue(4.349, 'vi'), '4.3');
// The stars fill and take their colour from that same printed value.
assert.equal(ratingFillPercent(4.35), ratingFillPercent(4.4));
assert.ok(ratingFillPercent(4.35) > ratingFillPercent(4.3));

// The count takes the locale's thousands separator.
assert.equal(formatRatingCount(11204, 'vi'), '11.204');
assert.equal(formatRatingCount(11204, 'en'), '11,204');
assert.equal(formatRatingCount(11204, 'cs'), '11 204');
assert.equal(formatRatingCount(6, 'vi'), '6');
assert.equal(formatRatingCount(-3, 'vi'), '0');

// The verbose words are gone from every on-screen rating message, and each
// locale has the component's messages.
const localesDir = join(__dirname, '..', '..', '..', 'locales');
for (const locale of ['vi', 'en', 'cs'] as const) {
  const raw = readFileSync(join(localesDir, `${locale}.json`), 'utf8');
  const messages = JSON.parse(raw);
  for (const key of ['aria', 'ariaWithCount', 'empty']) {
    assert.ok(messages.starRating?.[key], `${locale}: starRating.${key}`);
  }
  for (const key of [
    'userWeightedScoreLabel',
    'userScoreHint',
    'expertScoreHint',
  ]) {
    assert.ok(messages.productDetail[key], `${locale}: productDetail.${key}`);
  }
  assert.doesNotMatch(messages.productDetail.userWeightedScoreLabel, /\(/);
  // The versus verdict is on screen; the compare CSV/JSON cell keeps its form.
  for (const key of ['versusAutoVerdict', 'versusAutoVerdictTie']) {
    assert.doesNotMatch(
      messages.compare[key],
      /\/ ?5[.,]0/,
      `${locale} ${key}`
    );
  }
}
// Client trees get the component's messages (StarRating has no 'use client'
// of its own, so the client-messages scan does not see it).
assert.ok(CLIENT_MESSAGE_SCOPES.shared.includes('starRating'));
const vi = readFileSync(join(localesDir, 'vi.json'), 'utf8');
for (const phrase of ['bài kiểm chứng', 'chuẩn 10 nhóm']) {
  assert.ok(!vi.includes(phrase), `vi.json still has "${phrase}"`);
}

// Rendered ratings go through the one component: no screen code writes the
// "/5.0" scale next to a rating any more. Markdown, CSV and JSON exports keep
// their fixed machine-readable form, so they are skipped.
const srcDir = join(__dirname, '..', '..');
const screenFiles: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) screenFiles.push(p);
  }
};
walk(srcDir);
// A JSX child `{formatDecimal(5, …)}`; template strings (`${…}`) are export
// text such as the compare CSV cell, which keeps its form.
const SCALE_IN_JSX = /(?<!\$)\{formatDecimal\(5, \w+/;
for (const file of screenFiles) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, SCALE_IN_JSX, `${file} prints a "/5.0" scale`);
}
assert.ok(
  screenFiles.some((f) =>
    readFileSync(f, 'utf8').includes(
      "import StarRating from '@/components/elementary/StarRating'"
    )
  )
);

// The compare table: the screen shows the lab score on 10 and the "only
// differences" filter reads that same text, while the CSV/JSON export keeps
// "Lab x / 5.0" (Codex, PR #1534).
void (async () => {
  const { buildSpecGroups } =
    await import('../../components/compare/CompareWorkspace');
  const t = ((key: string) => key) as unknown as Parameters<
    typeof buildSpecGroups
  >[0];
  const row = buildSpecGroups(t, 'vi')
    .flatMap((g) => g.rows)
    .find((r) => r.id === 'expert_rating')!;
  const product = (expert: number) =>
    ({ expert_rating: expert }) as unknown as Parameters<
      typeof row.renderValue
    >[0];
  assert.equal(row.renderValue(product(4.51)), 'Lab 4.5 / 5.0');
  assert.equal(row.renderValue(product(4.35)), 'Lab 4.4 / 5.0');
  assert.equal(row.renderValue(product(4.345)), 'Lab 4.3 / 5.0');
  assert.equal(row.screenValue?.(product(4.51)), 'Lab 9.0/10');
  assert.equal(row.screenValue?.(product(4.54)), 'Lab 9.1/10');
  // The best mark compares what the screen shows (#1470): 4.51 and 4.52 both
  // read "Lab 9.0/10", so neither is best.
  assert.equal(row.numericValue?.(product(4.51)), 9);
  assert.equal(
    row.numericValue?.(product(4.51)),
    row.numericValue?.(product(4.52))
  );
  assert.equal(row.numericValue?.(product(4.54)), 9.1);

  // The buyer rating row: iPhone 15 at 4.892 and iPhone 16 at 4.87 both show
  // 4.9 on /compare, so neither gets the best mark (#1470).
  const ratingRow = buildSpecGroups(t, 'vi')
    .flatMap((g) => g.rows)
    .find((r) => r.id === 'rating_weighted')!;
  const rated = (rating: number) =>
    ({
      rating_score: rating,
      rating_score_5: rating,
      user_rating_weighted: rating,
      average_rating: rating,
    }) as unknown as Parameters<typeof ratingRow.renderValue>[0];
  assert.equal(ratingRow.numericValue?.(rated(4.892)), 4.9);
  assert.equal(
    ratingRow.numericValue?.(rated(4.892)),
    ratingRow.numericValue?.(rated(4.87))
  );
  assert.equal(ratingRow.numericValue?.(rated(4.84)), 4.8);
  assert.equal(ratingRow.numericValue?.(rated(0)), null);
  // x.x5: 4.35 shows 4.4 and 4.55 shows 4.6, so each ties the product that
  // shows the same number (#1631).
  assert.equal(ratingRow.numericValue?.(rated(4.35)), 4.4);
  assert.equal(ratingRow.numericValue?.(rated(4.55)), 4.6);

  // The "highest rated" verdict card follows the same rule: no winner when
  // the top two both show 4.9, the higher shown rating otherwise.
  const { pickHighestRated } =
    await import('../../components/compare/CompareWorkspace');
  const named = (name: string, rating: number) =>
    ({ ...(rated(rating) as object), name }) as unknown as Parameters<
      typeof pickHighestRated
    >[0][number];
  assert.equal(
    pickHighestRated([named('iPhone 15', 4.892), named('iPhone 16', 4.87)]),
    null
  );
  assert.equal(
    pickHighestRated([named('A', 4.84), named('B', 4.86)])?.name,
    'B'
  );
  assert.equal(pickHighestRated([named('A', 4.6), named('B', 0)])?.name, 'A');
  assert.equal(pickHighestRated([named('A', 4.35), named('B', 4.4)]), null);
  assert.equal(
    pickHighestRated([named('A', 4.35), named('B', 4.3)])?.name,
    'A'
  );
  assert.equal(pickHighestRated([named('A', 0), named('B', 0)]), null);

  // The 1v1 scoreboard reads the same shown scores (#1631): 4.35 shows 4.4,
  // so it ties 4.4 and leads 4.3 by 0.1.
  const { computeVersusWeightedResult, formatVersusWeightedMarkdown } =
    await import('../../components/compare/VersusInteractiveScoreboard');
  type VersusSide = Parameters<typeof computeVersusWeightedResult>[0];
  const side = (slug: string, userScore5: number) =>
    ({
      slug,
      name: slug,
      brand: 'Brand',
      userScore5,
      combinedScore5: userScore5,
      minPrice: 10_000_000,
      criteria: {},
      rankCriteria: {},
    }) as unknown as VersusSide;
  const noWeights = {
    screen: 0,
    performance: 0,
    camera: 0,
    battery: 0,
    value: 0,
  };
  const level = computeVersusWeightedResult(
    side('a', 4.35),
    side('b', 4.4),
    noWeights,
    'default'
  );
  assert.equal(level.tie, true);
  assert.equal(level.delta, '0.0');
  const lead = computeVersusWeightedResult(
    side('a', 4.35),
    side('b', 4.3),
    noWeights,
    'default'
  );
  assert.equal(lead.tie, false);
  assert.equal(lead.delta, '0.1');
  assert.equal(lead.winner.slug, 'a');

  // Versus with one unrated side (#1647 item 8): no fake "leads by 4.4" gap
  // against 0, and Markdown prints "N/A" instead of "0.0/5.0".
  const oneUnrated = computeVersusWeightedResult(
    side('a', 4.35),
    side('b', 0),
    noWeights,
    'default'
  );
  assert.equal(oneUnrated.tie, false);
  assert.equal(oneUnrated.bothScored, false);
  assert.equal(oneUnrated.delta, null);
  assert.equal(oneUnrated.winner.slug, 'a');
  const mdCopy = {
    tie1v1Badge: '1v1 Tie',
    mdTieLine: (score: string) => `Tie (${score}/5.0)`,
    valNoReviews: 'No reviews yet',
    mdLeadingDevice: 'Leading device',
    mdScoreDelta: (delta: string) => `Delta ${delta} pts`,
    mdRowWeightedScore: 'Weighted combined score',
    mdRowTie: 'Tie',
  };
  const mdOneUnrated = formatVersusWeightedMarkdown(oneUnrated, 'a', mdCopy);
  assert.equal(
    mdOneUnrated.summaryBullet,
    '- **Leading device:** **a** (4.4/5.0)'
  );
  assert.equal(
    mdOneUnrated.weightedScoreRow,
    '| **Weighted combined score** | **4.4/5.0** | N/A | **a** |'
  );
  const bothUnrated = computeVersusWeightedResult(
    side('a', 0),
    side('b', 0),
    noWeights,
    'default'
  );
  assert.equal(bothUnrated.tie, true);
  assert.equal(bothUnrated.bothScored, false);
  const mdBothUnrated = formatVersusWeightedMarkdown(bothUnrated, 'a', mdCopy);
  assert.equal(mdBothUnrated.summaryBullet, '- **1v1 Tie:** No reviews yet');
  assert.equal(
    mdBothUnrated.weightedScoreRow,
    '| **Weighted combined score** | N/A | N/A | - |'
  );

  // A model with no buyer rating keeps its composite as its overall score,
  // tagged in the copied Markdown (DOS/Rate#1663); a buyer rating is not.
  const expertOnly = {
    ...side('x', 0),
    combinedScore5: 4.5,
  } as unknown as VersusSide;
  const sourced = computeVersusWeightedResult(
    expertOnly,
    side('y', 3.9),
    noWeights,
    'default'
  );
  assert.equal(sourced.sourceA, 'expert_criteria');
  assert.equal(sourced.sourceB, 'buyers');
  assert.equal(sourced.finalA, 4.5);
  const mdSourced = formatVersusWeightedMarkdown(sourced, 'x', {
    ...mdCopy,
    expertSourceTag: 'From experts/criteria',
  });
  assert.equal(
    mdSourced.summaryBullet,
    '- **Leading device:** **x** (4.5/5.0 (From experts/criteria) - Delta 0.6 pts)'
  );
  assert.equal(
    mdSourced.weightedScoreRow,
    '| **Weighted combined score** | **4.5/5.0** (From experts/criteria) | **3.9/5.0** | **x** |'
  );
  assert.equal(bothUnrated.sourceA, null);

  // Items 3, 4, 6, 7, 9 (#1647): lab scores on 10, 2-decimal exports, JSON
  // ratingScore5, 1-decimal export columns in rating views, and JSON-LD order.
  const {
    resolveCompareExpertRating5,
    resolveCompareExpertRating5Shown,
    resolveCompareExpertRating10,
  } = await import('../rate-domain');
  assert.equal(resolveCompareExpertRating5({ expert_rating: 4.345 }), 4.35);
  assert.equal(resolveCompareExpertRating5({ expert_rating: 8.35 }), 4.18);
  assert.equal(resolveCompareExpertRating5Shown({ expert_rating: 4.345 }), 4.3);
  assert.equal(resolveCompareExpertRating5Shown({ expert_rating: 4.35 }), 4.4);
  assert.equal(resolveCompareExpertRating10({ expert_rating: 4.175 }), 8.4);
  assert.equal(resolveCompareExpertRating10({ expert_rating: 8.35 }), 8.4);
  assert.equal(resolveCompareExpertRating10({ expert_rating: 4.225 }), 8.5);
  assert.equal(resolveCompareExpertRating10({ expert_rating: 8.45 }), 8.5);
  for (let thousandths = 1; thousandths <= 5000; thousandths++) {
    assert.equal(
      resolveCompareExpertRating10({ expert_rating: thousandths / 1000 }),
      Math.floor((thousandths * 2 + 50) / 100) / 10,
      `resolveCompareExpertRating10(${thousandths / 1000})`
    );
  }

  const { computeCrossPlatformDealRadarFromData } =
    await import('../../server/rate/deals');
  const dealRadarCluster = {
    master: {
      id: 'm1',
      slug: 'phone-lab',
      name: 'Phone Lab',
      brand: 'Brand',
      expert_rating: 4.175,
      metadata: { category_slug: 'smartphones' },
    },
    offers: [
      {
        id: 'o1',
        platform: 'shopee',
        price_current: 18_000_000,
        price_original: 20_000_000,
        url: 'https://shopee.vn/p1',
        stock_status: 'in_stock',
        merchant: {
          id: 's1',
          name: 'Shop 1',
          is_official: true,
          risk_score: 5,
        },
      },
      {
        id: 'o2',
        platform: 'lazada',
        price_current: 20_000_000,
        price_original: 20_000_000,
        url: 'https://lazada.vn/p1',
        stock_status: 'in_stock',
        merchant: {
          id: 's2',
          name: 'Shop 2',
          is_official: true,
          risk_score: 5,
        },
      },
    ],
  };
  const radarOut = computeCrossPlatformDealRadarFromData(
    [dealRadarCluster as never],
    { categorySlug: 'smartphones', limit: 5 }
  );
  assert.equal(radarOut.genuineDeals[0]?.jreviewsScore10, 8.4);

  const { formatWatchlistPortfolioAverageRating } =
    await import('../../components/watchlist/WatchlistWorkspace');
  assert.equal(formatWatchlistPortfolioAverageRating(4.345, 1), '4.35');
  assert.equal(formatWatchlistPortfolioAverageRating(4.345, 1, 1), '4.3');
  assert.equal(formatWatchlistPortfolioAverageRating(8.9, 2, 1), '4.5');
  assert.equal(formatWatchlistPortfolioAverageRating(8.9, 2, 2), '4.45');
  assert.equal(formatWatchlistPortfolioAverageRating(8.13, 2), '4.07');
  assert.equal(formatWatchlistPortfolioAverageRating(13.065, 3), '4.36');
  assert.equal(formatWatchlistPortfolioAverageRating(22.025, 5), '4.41');
  assert.equal(formatWatchlistPortfolioAverageRating(2.01, 2), '1.01');
  assert.equal(formatWatchlistPortfolioAverageRating(0, 0), null);

  const { normalizeShareAuditFields } =
    await import('../../components/leaderboard/ProductShareAuditButton');
  const shareFields = normalizeShareAuditFields({
    modelKey: 'brand:model',
    userScore5: 4.345,
    expertScore10: 4.175,
    authenticReviews: 5,
    minPriceVnd: 10_000_000,
    offerCount: 2,
  });
  assert.equal(formatScoreFixed(shareFields.safeUserScore5, 2), '4.35');
  assert.equal(shareFields.safeExpertScore10, 8.4);

  const { EMPTY_RADAR_SIGNAL } = await import('../deal-radar');
  const emptyRadar = EMPTY_RADAR_SIGNAL;
  const { buildCompareJsonProductEntry } =
    await import('../../components/compare/CompareWorkspace');
  const { buildCatalogJsonProductEntry } =
    await import('../../components/leaderboard/CategoryCatalogToolbar');
  const { buildLeaderboardJsonItem, formatLeaderboardActiveScore } =
    await import('../../components/leaderboard/LeaderboardExplorer');
  const {
    buildDealJsonItem,
    formatDealPersonaScore,
    rankProductsForDealFinder,
  } = await import('../../components/deals/DealFinderWorkspace');
  const { buildLeaderboardItemListElements } =
    await import('../leaderboard-engine');

  const prod435 = {
    id: 'p-435',
    slug: 'phone-435',
    name: 'Phone 435',
    brand: 'Brand',
    min_price: 15_000_000,
    rating_score: 4.35,
    metadata: { category_slug: 'smartphones' },
  } as unknown as Parameters<typeof buildCompareJsonProductEntry>[0];
  const prodUnrated = {
    ...prod435,
    id: 'p-0',
    slug: 'phone-0',
    rating_score: null,
  } as unknown as Parameters<typeof buildCompareJsonProductEntry>[0];

  assert.equal(
    buildCompareJsonProductEntry(prod435, emptyRadar).userRating,
    4.35
  );
  assert.equal(
    buildCompareJsonProductEntry(prod435, emptyRadar).ratingScore5,
    4.4
  );
  assert.equal(
    buildCompareJsonProductEntry(prodUnrated, emptyRadar).ratingScore5,
    null
  );

  assert.equal(
    buildCatalogJsonProductEntry(prod435, 1, emptyRadar).userRating,
    4.35
  );
  assert.equal(
    buildCatalogJsonProductEntry(prod435, 1, emptyRadar).ratingScore5,
    4.4
  );
  assert.equal(
    buildCatalogJsonProductEntry(prodUnrated, 2, emptyRadar).ratingScore5,
    null
  );

  const lbJson = buildLeaderboardJsonItem(
    {
      product: prod435,
      activeScore5: 4.35,
      userScore5: 4.35,
      expertScore10: 8.4,
      criteria: {
        screen: null,
        performance: null,
        camera: null,
        battery: null,
        value: null,
      },
    },
    1,
    emptyRadar
  );
  assert.equal(lbJson.userScore5, 4.35);
  assert.equal(lbJson.ratingScore5, 4.4);
  assert.equal(formatLeaderboardActiveScore(4.35, 1, 'unrated'), '4.4');
  assert.equal(formatLeaderboardActiveScore(4.345, 2, 'unrated'), '4.35');
  assert.equal(formatLeaderboardActiveScore(1.005, 2, 'unrated'), '1.01');
  assert.equal(formatLeaderboardActiveScore(0, 1, 'unrated'), 'unrated');

  const rankedDeal = rankProductsForDealFinder([prod435], {
    categoryFilter: 'smartphones',
    persona: 'default',
    maxBudgetVnd: 30_000_000,
    searchQuery: '',
  })[0]!;
  const dealJson = buildDealJsonItem(rankedDeal, emptyRadar);
  assert.equal(dealJson.userScore5, 4.35);
  assert.equal(dealJson.ratingScore5, 4.4);
  assert.equal(formatDealPersonaScore(4.35, 'default'), '4.4');
  assert.equal(formatDealPersonaScore(4.345, 'photography'), '4.35');
  assert.equal(formatDealPersonaScore(1.005, 'gaming'), '1.01');
  assert.equal(formatDealPersonaScore(0, 'default'), null);

  const jsonLdPool = [
    {
      ...prod435,
      id: 'raw-higher',
      slug: 'raw-higher',
      name: 'Raw Higher',
      rating_score: 4.39,
    },
    {
      ...prod435,
      id: 'composite-higher',
      slug: 'composite-higher',
      name: 'Composite Higher',
      rating_score: 4.35,
      expert_rating: 5,
    },
  ] as unknown as Parameters<typeof buildLeaderboardItemListElements>[0];
  const { itemListElements } = buildLeaderboardItemListElements(
    jsonLdPool,
    'https://rate.vn'
  );
  assert.deepEqual(
    itemListElements.map((item) => item.name),
    ['Composite Higher', 'Raw Higher']
  );

  // Item 2 and the review panel (#1647): criterion scores printed as `x/5`,
  // the review average on 2 decimals and the lab score on 10 go through the
  // decimal-safe `formatRatingValue`, never `toFixed` or a bare
  // `formatDecimal` (4.35 prints 4.4, 4.345 prints 4.35).
  const scorePrintSources = {
    'smartphones/[slug]/page.tsx': readFileSync(
      join(__dirname, '../../app/[locale]/smartphones/[slug]/page.tsx'),
      'utf8'
    ),
    'JReviewsSection.tsx': readFileSync(
      join(__dirname, '../../components/reviews/JReviewsSection.tsx'),
      'utf8'
    ),
  };
  for (const [name, src] of Object.entries(scorePrintSources)) {
    assert.ok(
      !/formatDecimal\([^)]*\)\}\/5`/.test(src),
      `${name}: a criterion "x/5" print must use formatRatingValue`
    );
    assert.ok(
      !/\b(?:crit\.score|liveScores\.(?:user|expert))\b[^;\n]*toFixed/.test(
        src
      ),
      `${name}: no toFixed on a score print`
    );
  }
  assert.ok(
    scorePrintSources['JReviewsSection.tsx'].includes(
      'formatRatingValue(liveScores.user, locale, 2)'
    )
  );
  assert.ok(
    scorePrintSources['smartphones/[slug]/page.tsx'].includes(
      'formatRatingValue(val, locale, 1)}/5'
    )
  );
  console.warn('  ✅ Ratings show as stars with a short count (#1528)');
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
