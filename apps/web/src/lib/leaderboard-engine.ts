import {
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
} from './rate-domain-core';
import { catalogRowSlug, type ItemCatalogRow } from './item-directory';
import { canonicalVersusOrder } from './item-compare';
import type { CanonicalCategorySlug, MasterProduct } from './rate-api';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';

export type LeaderboardCriterionKey =
  | 'combined'
  | 'user'
  | 'expert'
  | 'screen'
  | 'performance'
  | 'camera'
  | 'battery'
  | 'value';

export type LeaderboardPriceSegment =
  'all' | 'under15m' | '15to25m' | 'over25m';

/** The criteria a product can be scored on, besides its overall scores. */
export const LEADERBOARD_SCORE_CRITERIA = [
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
] as const;

export type LeaderboardScoreCriterion =
  (typeof LEADERBOARD_SCORE_CRITERIA)[number];

/**
 * A product's score on each criterion, or null when there is no real score
 * for it (DOS/Rate#1143): pages show "Chưa đủ dữ liệu" and no rank.
 */
export type LeaderboardCriteriaBreakdown = Record<
  LeaderboardScoreCriterion,
  number | null
>;

/** A weight per criterion, as the persona and custom weights set them. */
export type LeaderboardCriteriaWeights = Record<
  LeaderboardScoreCriterion,
  number
>;

export interface ScoredLeaderboardItem {
  rank: number;
  slug: string;
  name: string;
  brand: string;
  model: string;
  categorySlug: CanonicalCategorySlug;
  categoryPath: string;
  productHref: string;
  thumbnail: string;
  userScore5: number;
  expertScore10: number | null;
  combinedScore5: number;
  activeScore5: number;
  activeScore10: number;
  authenticReviewCount: number;
  filteredNoiseReviewCount: number;
  minPrice: number;
  maxPrice: number;
  merchantCount: number;
  criteria: LeaderboardCriteriaBreakdown;
  product: MasterProduct;
}

export interface ProductLeaderboardBadgeInfo {
  criterion: LeaderboardCriterionKey;
  rank: number;
  totalInCategory: number;
  score5: number;
  score10: number;
  categorySlug: CanonicalCategorySlug;
}

export type ProductCategoryStandingBadge = ProductLeaderboardBadgeInfo;

export const VALID_LEADERBOARD_CRITERIA: readonly LeaderboardCriterionKey[] = [
  'combined',
  'user',
  'expert',
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
] as const;

export const VALID_LEADERBOARD_CATEGORIES: readonly CanonicalCategorySlug[] = [
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
] as const;

export function normalizeLeaderboardCategory(
  raw?: string | null
): CanonicalCategorySlug {
  if (typeof raw !== 'string') return 'smartphones';
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .toLowerCase()
    .trim() as CanonicalCategorySlug;
  if (VALID_LEADERBOARD_CATEGORIES.includes(cleaned)) {
    return cleaned;
  }
  return 'smartphones';
}

export function normalizeLeaderboardCriterion(
  raw?: string | null
): LeaderboardCriterionKey {
  if (typeof raw !== 'string') return 'combined';
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .toLowerCase()
    .trim() as LeaderboardCriterionKey;
  if (VALID_LEADERBOARD_CRITERIA.includes(cleaned)) {
    return cleaned;
  }
  return 'combined';
}

export function normalizeLeaderboardPriceSegment(
  raw?: string | null
): LeaderboardPriceSegment {
  if (typeof raw !== 'string') return 'all';
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .toLowerCase()
    .trim() as LeaderboardPriceSegment;
  if (
    cleaned === 'under15m' ||
    cleaned === '15to25m' ||
    cleaned === 'over25m'
  ) {
    return cleaned;
  }
  return 'all';
}

const MAX_LEADERBOARD_COUNT_CEILING = 10_000_000;
const MAX_LEADERBOARD_PRODUCTS_SCAN = 5_000;
const MAX_LEADERBOARD_LIMIT = 500;
const LEADERBOARD_CONTROL_CHAR_RE = /\p{Cc}/gu;

function sanitizeLeaderboardText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(LEADERBOARD_CONTROL_CHAR_RE, '').trim().slice(0, maxLen);
}

function sanitizeLeaderboardSlug(raw: unknown): string {
  const cleaned = sanitizeLeaderboardText(raw, 256);
  if (
    !cleaned ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(cleaned) ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function clampScore5(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(Math.min(5.0, value).toFixed(2));
}

function toSafePositiveNumber(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(LEADERBOARD_CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return 0;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function toSafeNonNegativeNumber(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return NaN;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(LEADERBOARD_CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return NaN;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  }
  return Number.isFinite(raw) && raw >= 0 ? raw : NaN;
}

/**
 * The spec fields a client that ranks or pairs products, such as the
 * leaderboard and the compare picker's popular pairs, keeps instead of the
 * whole spec sheet (DOS/Rate#1515). The scores no longer read specs
 * (DOS/Rate#1143); a test checks this file reads none.
 */
export const LEADERBOARD_SPEC_FIELDS = {
  battery: ['capacity_mah', 'charging', 'fast_charging_w'],
  camera: ['front_camera', 'second_camera'],
  connectivity: ['bluetooth', 'location', 'sensors'],
  design: ['resistance', 'weight_g'],
  display: ['protection', 'refresh_rate_hz', 'type'],
  hardware: ['chipset', 'ram_gb'],
  multimedia: ['audio_features', 'loudspeaker'],
} as const satisfies Partial<Record<keyof ProductSpecifications, string[]>>;

/** A spec sheet cut to what the scores read, plus the category slug. */
export function leaderboardSpecsOnly(specs: unknown): ProductSpecifications {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) {
    return {} as ProductSpecifications;
  }
  const source = specs as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof source.category_slug === 'string') {
    out.category_slug = source.category_slug;
  }
  for (const [group, fields] of Object.entries(LEADERBOARD_SPEC_FIELDS)) {
    const block = source[group];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const kept: Record<string, unknown> = {};
    for (const field of fields) {
      const value = (block as Record<string, unknown>)[field];
      if (value !== undefined) kept[field] = value;
    }
    if (Object.keys(kept).length > 0) out[group] = kept;
  }
  return out as ProductSpecifications;
}

/**
 * The criteria that apply to a category: earbuds have no screen
 * (DOS/Rate#1143), and score noise cancelling as their "camera" criterion
 * (DOS/Rate#1250).
 */
export function leaderboardCriteriaForCategory(
  categorySlug: CanonicalCategorySlug
): readonly LeaderboardScoreCriterion[] {
  return categorySlug === 'earbuds'
    ? LEADERBOARD_SCORE_CRITERIA.filter((c) => c !== 'screen')
    : LEADERBOARD_SCORE_CRITERIA;
}

// The stored keys each criterion reads from expert_criteria_scores.
const CRITERION_SCORE_KEYS: Record<LeaderboardScoreCriterion, string[]> = {
  screen: ['screen', 'display', 'man_hinh', 'design', 'comfort'],
  performance: ['performance', 'hardware', 'hieu_nang', 'connectivity'],
  camera: ['camera', 'audio', 'multimedia', 'sound', 'sensors'],
  battery: ['battery', 'pin', 'endurance'],
  value: ['value', 'price_value', 'dang_tien'],
};

/**
 * A product's per-criterion scores, out of 5, from the scores stored for each
 * criterion only. A criterion with no stored score, or one that does not
 * apply to the category, is null: it is never derived from the star rating,
 * the specs or the price, which made every well-rated product score 5.00
 * and tie (DOS/Rate#1143).
 */
export function computeJReviewsCriteriaScores(
  item: MasterProduct
): LeaderboardCriteriaBreakdown {
  const safeItem = (
    item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  ) as MasterProduct;
  const rawCriteria = (
    safeItem.expert_criteria_scores &&
    typeof safeItem.expert_criteria_scores === 'object' &&
    !Array.isArray(safeItem.expert_criteria_scores)
      ? safeItem.expert_criteria_scores
      : {}
  ) as Record<string, unknown>;
  const applies = leaderboardCriteriaForCategory(
    getMasterProductCategorySlug(safeItem)
  );

  const read = (criterion: LeaderboardScoreCriterion): number | null => {
    if (!applies.includes(criterion)) return null;
    for (const k of CRITERION_SCORE_KEYS[criterion]) {
      const v = toSafePositiveNumber(rawCriteria[k]);
      if (v > 0 && v <= 10) return clampScore5(v > 5 ? v / 2 : v);
    }
    return null;
  };

  return {
    screen: read('screen'),
    performance: read('performance'),
    camera: read('camera'),
    battery: read('battery'),
    value: read('value'),
  };
}

/**
 * The weighted average of the criteria that have a score, out of 5, or null
 * when none of the weighted ones has one. `only` limits it to the criteria
 * both sides of a 1v1 have, so neither wins on a criterion the other lacks.
 */
export function weightedCriteriaScore5(
  criteria: LeaderboardCriteriaBreakdown,
  weights: LeaderboardCriteriaWeights,
  only: readonly LeaderboardScoreCriterion[] = LEADERBOARD_SCORE_CRITERIA
): number | null {
  let sum = 0;
  let weightSum = 0;
  for (const c of only) {
    const score = criteria?.[c];
    const weight = weights?.[c];
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score <= 0 ||
      typeof weight !== 'number' ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      continue;
    }
    sum += score * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Number((sum / weightSum).toFixed(2)) : null;
}

/** The criteria both products have a score for. */
export function sharedScoredCriteria(
  a: LeaderboardCriteriaBreakdown,
  b: LeaderboardCriteriaBreakdown
): LeaderboardScoreCriterion[] {
  return LEADERBOARD_SCORE_CRITERIA.filter(
    (c) => (a?.[c] ?? 0) > 0 && (b?.[c] ?? 0) > 0
  );
}

/** Filtered-review counts per master id, as read from stored reviews. */
export type FilteredReviewCountsByMaster = Readonly<Record<string, number>>;

export function scoreMasterProductForLeaderboard(
  item: MasterProduct,
  criterion: LeaderboardCriterionKey = 'combined',
  filteredReviewCounts?: FilteredReviewCountsByMaster | null
): Omit<ScoredLeaderboardItem, 'rank'> {
  const safeItem = (
    item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  ) as MasterProduct;
  const safeCriterion = normalizeLeaderboardCriterion(criterion);
  const categorySlug = getMasterProductCategorySlug(safeItem);
  const categoryPath = getCategoryRouteHref(categorySlug);
  // An Item's row links to the Item (DOS/Rate#1155).
  const productHref = getMasterProductHref({
    ...safeItem,
    slug: catalogRowSlug(safeItem as ItemCatalogRow),
  });
  const thumbnail =
    resolveProductImageUrl({
      slug: safeItem.slug,
      name: safeItem.name,
      model: safeItem.model,
      category_id: safeItem.category_id,
      metadata: safeItem.metadata,
      thumbnail: safeItem.thumbnail,
      images: safeItem.images,
    }) || '/img/devices/apple-iphone-16-pro-max-256gb.jpg';

  const rawUser =
    toSafePositiveNumber(safeItem.user_rating_weighted) ||
    toSafePositiveNumber(safeItem.average_rating);
  const userScore5 =
    rawUser > 0 && rawUser <= 10
      ? clampScore5(rawUser > 5 ? rawUser / 2 : rawUser)
      : 0;

  const rawExpert = toSafePositiveNumber(safeItem.expert_rating);
  const expertScore10: number | null =
    Number.isFinite(rawExpert) && rawExpert > 0 && rawExpert <= 10
      ? Number(
          Math.min(10, rawExpert > 5 ? rawExpert : rawExpert * 2).toFixed(1)
        )
      : null;
  const expertScore5: number | null =
    expertScore10 != null ? Number((expertScore10 / 2).toFixed(2)) : null;

  // Only real criterion scores join the composite; a product without them
  // ranks on its user and expert scores alone (DOS/Rate#1143).
  const criteria = computeJReviewsCriteriaScores(safeItem);
  const criteriaValues = LEADERBOARD_SCORE_CRITERIA.map(
    (c) => criteria[c]
  ).filter((v): v is number => v != null && v > 0);
  const criteriaAvg =
    criteriaValues.length > 0
      ? criteriaValues.reduce((a, b) => a + b, 0) / criteriaValues.length
      : 0;

  let combinedScore5 = 0;
  if (userScore5 > 0 && expertScore5 != null) {
    combinedScore5 =
      criteriaAvg > 0
        ? clampScore5(
            userScore5 * 0.45 + expertScore5 * 0.35 + criteriaAvg * 0.2
          )
        : clampScore5(userScore5 * 0.6 + expertScore5 * 0.4);
  } else if (userScore5 > 0) {
    combinedScore5 =
      criteriaAvg > 0
        ? clampScore5(userScore5 * 0.8 + criteriaAvg * 0.2)
        : userScore5;
  } else if (expertScore5 != null) {
    combinedScore5 =
      criteriaAvg > 0
        ? clampScore5(expertScore5 * 0.8 + criteriaAvg * 0.2)
        : expertScore5;
  } else if (criteriaAvg > 0) {
    combinedScore5 = clampScore5(criteriaAvg);
  }

  let activeScore5 = combinedScore5;
  if (safeCriterion === 'user') activeScore5 = userScore5;
  else if (safeCriterion === 'expert') activeScore5 = expertScore5 ?? 0;
  else if (safeCriterion !== 'combined') {
    activeScore5 = criteria[safeCriterion] ?? 0;
  }

  const rawAuthentic = toSafeNonNegativeNumber(safeItem.authentic_review_count);
  const rawTotal = toSafePositiveNumber(safeItem.total_reviews);
  const safeTotal =
    rawTotal > 0
      ? Math.min(Math.floor(rawTotal), MAX_LEADERBOARD_COUNT_CEILING)
      : 0;
  const authenticReviewCount =
    Number.isFinite(rawAuthentic) && rawAuthentic >= 0
      ? Math.min(Math.floor(rawAuthentic), MAX_LEADERBOARD_COUNT_CEILING)
      : safeTotal;
  // Only reviews Rate.vn stored and the analyser excluded. total_reviews is
  // the marketplaces' own rating count, so total minus authentic is not a
  // number of blocked reviews (DOS/Rate#1139).
  const filteredNoiseReviewCount = readFilteredReviewCount(
    filteredReviewCounts,
    safeItem.id
  );

  const rawMinPrice = toSafePositiveNumber(safeItem.min_price);
  const minPrice =
    rawMinPrice > 0 && rawMinPrice <= 1_000_000_000
      ? Math.round(rawMinPrice)
      : 0;
  const rawMaxPrice = toSafePositiveNumber(safeItem.max_price);
  const maxPrice =
    rawMaxPrice > 0 && rawMaxPrice <= 1_000_000_000
      ? Math.max(minPrice, Math.round(rawMaxPrice))
      : minPrice;
  const rawMerchantCount = toSafePositiveNumber(safeItem.merchant_count);
  const merchantCount =
    rawMerchantCount > 0
      ? Math.min(Math.floor(rawMerchantCount), MAX_LEADERBOARD_COUNT_CEILING)
      : 0;

  return {
    slug: sanitizeLeaderboardSlug(safeItem.slug),
    name: sanitizeLeaderboardText(safeItem.name, 300),
    brand: sanitizeLeaderboardText(safeItem.brand, 128),
    model: sanitizeLeaderboardText(safeItem.model, 256),
    categorySlug,
    categoryPath,
    productHref,
    thumbnail,
    userScore5,
    expertScore10,
    combinedScore5,
    activeScore5,
    activeScore10: Number((activeScore5 * 2).toFixed(1)),
    authenticReviewCount,
    filteredNoiseReviewCount,
    minPrice,
    maxPrice,
    merchantCount,
    criteria,
    product: safeItem,
  };
}

function readFilteredReviewCount(
  counts: FilteredReviewCountsByMaster | null | undefined,
  masterId: unknown
): number {
  if (!counts || typeof counts !== 'object' || typeof masterId !== 'string') {
    return 0;
  }
  if (!Object.prototype.hasOwnProperty.call(counts, masterId)) return 0;
  const raw = Number(counts[masterId]);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(Math.floor(raw), MAX_LEADERBOARD_COUNT_CEILING)
    : 0;
}

export function rankMasterProductsForLeaderboard(
  products: MasterProduct[],
  options?: {
    category?: CanonicalCategorySlug | 'all';
    criterion?: LeaderboardCriterionKey;
    priceSegment?: LeaderboardPriceSegment;
    brand?: string;
    query?: string;
    limit?: number;
    filteredReviewCounts?: FilteredReviewCountsByMaster | null;
  }
): ScoredLeaderboardItem[] {
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : undefined;
  const rawCategory = safeOptions?.category;
  const category: CanonicalCategorySlug | 'all' =
    typeof rawCategory === 'string' &&
    rawCategory
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase() === 'all'
      ? 'all'
      : normalizeLeaderboardCategory(rawCategory);
  const criterion = normalizeLeaderboardCriterion(safeOptions?.criterion);
  const priceSegment = normalizeLeaderboardPriceSegment(
    safeOptions?.priceSegment
  );
  const brand =
    sanitizeLeaderboardText(safeOptions?.brand ?? 'all', 128) || 'all';
  const q = sanitizeLeaderboardText(
    safeOptions?.query ?? '',
    256
  ).toLowerCase();

  const safeProducts = Array.isArray(products)
    ? products
        .filter((p): p is MasterProduct =>
          Boolean(p && typeof p === 'object' && !Array.isArray(p))
        )
        .slice(0, MAX_LEADERBOARD_PRODUCTS_SCAN)
    : [];

  const filtered = safeProducts
    .map((item) =>
      scoreMasterProductForLeaderboard(
        item,
        criterion,
        safeOptions?.filteredReviewCounts
      )
    )
    .filter((entry) => {
      if (category !== 'all' && entry.categorySlug !== category) {
        return false;
      }
      if (criterion === 'expert' && entry.expertScore10 == null) {
        return false;
      }
      if (criterion === 'user' && entry.userScore5 <= 0) {
        return false;
      }
      if (entry.activeScore5 <= 0) {
        return false;
      }
      if (
        brand !== 'all' &&
        entry.brand.toLowerCase() !== brand.toLowerCase()
      ) {
        return false;
      }
      if (priceSegment !== 'all') {
        if (entry.minPrice <= 0) {
          return false;
        }
        if (priceSegment === 'under15m' && entry.minPrice >= 15_000_000) {
          return false;
        }
        if (
          priceSegment === '15to25m' &&
          (entry.minPrice < 15_000_000 || entry.minPrice > 25_000_000)
        ) {
          return false;
        }
        if (priceSegment === 'over25m' && entry.minPrice <= 25_000_000) {
          return false;
        }
      }
      if (q) {
        const keySpecs = (entry.product.key_specs || {}) as KeySpecs;
        const hay = [
          entry.name,
          entry.brand,
          entry.model,
          entry.slug,
          entry.product.model_key || '',
          keySpecs.chip || '',
          keySpecs.screen || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.activeScore5 !== a.activeScore5) {
        return b.activeScore5 - a.activeScore5;
      }
      if (b.combinedScore5 !== a.combinedScore5) {
        return b.combinedScore5 - a.combinedScore5;
      }
      if (b.authenticReviewCount !== a.authenticReviewCount) {
        return b.authenticReviewCount - a.authenticReviewCount;
      }
      if (a.minPrice > 0 && b.minPrice > 0 && a.minPrice !== b.minPrice) {
        return a.minPrice - b.minPrice;
      }
      if (a.minPrice > 0 && b.minPrice <= 0) {
        return -1;
      }
      if (a.minPrice <= 0 && b.minPrice > 0) {
        return 1;
      }
      return a.slug.localeCompare(b.slug);
    })
    .map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));

  const rawLimit =
    typeof safeOptions?.limit === 'number' ? safeOptions.limit : NaN;
  if (Number.isFinite(rawLimit) && rawLimit >= 1) {
    return filtered.slice(
      0,
      Math.min(Math.floor(rawLimit), MAX_LEADERBOARD_LIMIT)
    );
  }
  return filtered;
}

/**
 * Compute a specific MasterProduct's exact Leaderboard standing within its canonical category
 * across Combined + top performing sub-criteria so ProductDetailView can surface live rank badges.
 */
export function computeProductStandingInCategory(
  targetProduct: MasterProduct,
  categoryProducts: MasterProduct[]
): ProductLeaderboardBadgeInfo[] {
  if (
    !targetProduct ||
    typeof targetProduct !== 'object' ||
    Array.isArray(targetProduct)
  ) {
    return [];
  }
  const targetSlug = sanitizeLeaderboardSlug(targetProduct.slug);
  if (!targetSlug) return [];
  const categorySlug = getMasterProductCategorySlug(targetProduct);
  const safeCategoryProducts = Array.isArray(categoryProducts)
    ? categoryProducts.filter((p): p is MasterProduct =>
        Boolean(p && typeof p === 'object' && !Array.isArray(p))
      )
    : [];
  const peers = safeCategoryProducts.filter(
    (p) => getMasterProductCategorySlug(p) === categorySlug
  );
  if (!peers.some((p) => sanitizeLeaderboardSlug(p.slug) === targetSlug)) {
    peers.push(targetProduct);
  }

  const totalInCategory = peers.length;
  const criteriaToCheck: LeaderboardCriterionKey[] = [
    'combined',
    'screen',
    'performance',
    'camera',
    'battery',
    'value',
  ];

  const badges: ProductLeaderboardBadgeInfo[] = [];

  for (const crit of criteriaToCheck) {
    const ranked = rankMasterProductsForLeaderboard(peers, {
      category: categorySlug,
      criterion: crit,
    });
    const found = ranked.find((r) => r.slug === targetSlug);
    if (!found) continue;
    // A criterion ranks only the products with a real score on it, and needs
    // at least two of them: "#1 of 1" is not a ranking (DOS/Rate#1143).
    if (crit !== 'combined' && ranked.length < 2) continue;

    // Always include overall combined rank; also include top-3 sub-criteria ranks
    if (crit === 'combined' || found.rank <= 3) {
      badges.push({
        criterion: crit,
        rank: found.rank,
        totalInCategory: crit === 'combined' ? totalInCategory : ranked.length,
        score5: found.activeScore5,
        score10: found.activeScore10,
        categorySlug,
      });
    }
  }

  return badges.slice(0, 4);
}

export interface Flagship1v1BattlePair {
  versusSlug: string;
  versusHref: string;
  categorySlug: CanonicalCategorySlug;
  productA: ScoredLeaderboardItem;
  productB: ScoredLeaderboardItem;
  winnerSlug: string | null;
  scoreDelta5: number;
  priceDeltaVnd: number;
}

/**
 * Deterministically build curated 1v1 Head-to-Head Flagship Showdown pairs
 * strictly within the same canonical category (#1 vs #2, #1 vs #3, #2 vs #3, #3 vs #4)
 * for `/compare`, `/leaderboard`, and dynamic `sitemap.xml`.
 */
export function buildPopular1v1BattlesForCategory(
  products: MasterProduct[],
  category: CanonicalCategorySlug,
  maxPairs: number = 3
): Flagship1v1BattlePair[] {
  const safeCategory = normalizeLeaderboardCategory(category);
  const safeMaxPairs =
    typeof maxPairs === 'number' && Number.isFinite(maxPairs) && maxPairs >= 0
      ? Math.min(Math.floor(maxPairs), 20)
      : 3;
  if (safeMaxPairs === 0) return [];
  const ranked = rankMasterProductsForLeaderboard(products, {
    category: safeCategory,
    criterion: 'combined',
  });
  if (ranked.length < 2) return [];

  const candidateIndices: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 3],
    [0, 3],
  ];

  const pairs: Flagship1v1BattlePair[] = [];
  for (const [idxA, idxB] of candidateIndices) {
    if (pairs.length >= safeMaxPairs) break;
    const itemA = ranked[idxA];
    const itemB = ranked[idxB];
    if (
      !itemA ||
      !itemB ||
      !itemA.slug ||
      !itemB.slug ||
      itemA.slug === itemB.slug
    )
      continue;

    // The page each row links to names the versus side: its Item under the
    // Item model, so the link needs no 308 hop (DOS/Rate#1275).
    const sideSlug = (item: typeof itemA) =>
      item.productHref.split('/').pop() || item.slug;
    // One URL per pair, sides sorted (DOS/Rate#1367).
    const [firstSide, secondSide] = canonicalVersusOrder(
      sideSlug(itemA),
      sideSlug(itemB)
    );
    const versusSlug = `${firstSide}-vs-${secondSide}`;
    const scoreDelta5 = Number(
      Math.abs(itemA.combinedScore5 - itemB.combinedScore5).toFixed(2)
    );
    const priceDeltaVnd =
      itemA.minPrice > 0 && itemB.minPrice > 0
        ? Math.abs(itemA.minPrice - itemB.minPrice)
        : 0;
    const winnerSlug =
      itemA.combinedScore5 > itemB.combinedScore5
        ? itemA.slug
        : itemB.combinedScore5 > itemA.combinedScore5
          ? itemB.slug
          : null;

    pairs.push({
      versusSlug,
      versusHref: `/compare/${versusSlug}`,
      categorySlug: safeCategory,
      productA: itemA,
      productB: itemB,
      winnerSlug,
      scoreDelta5,
      priceDeltaVnd,
    });
  }

  return pairs;
}

/**
 * Compare two minimum VND prices (`minPriceA` vs `minPriceB`) while treating
 * non-positive (`<= 0`) values as unpriced.
 * Returns `'A'` when A is strictly cheaper (or A is priced and B is unpriced),
 * `'B'` when B is strictly cheaper (or B is priced and A is unpriced),
 * `'equal'` when both are priced and equal, and `'unknown'` when neither is priced.
 */
export function comparePositiveMinPrices(
  minPriceA: number,
  minPriceB: number
): 'A' | 'B' | 'equal' | 'unknown' {
  const validA =
    typeof minPriceA === 'number' &&
    Number.isFinite(minPriceA) &&
    minPriceA > 0 &&
    minPriceA <= 1_000_000_000;
  const validB =
    typeof minPriceB === 'number' &&
    Number.isFinite(minPriceB) &&
    minPriceB > 0 &&
    minPriceB <= 1_000_000_000;
  if (validA && validB) {
    if (minPriceA < minPriceB) return 'A';
    if (minPriceB < minPriceA) return 'B';
    return 'equal';
  }
  if (validA && !validB) return 'A';
  if (!validA && validB) return 'B';
  return 'unknown';
}
