import {
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
  type CanonicalCategorySlug,
  type MasterProduct,
} from './rate-api';
import type { ProductSpecifications } from '@repo/shared-data';

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

export interface LeaderboardCriteriaBreakdown {
  screen: number;
  performance: number;
  camera: number;
  battery: number;
  value: number;
}

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
  expertScore10: number;
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
  const cleaned = String(raw || '')
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
  const cleaned = String(raw || '')
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
  const cleaned = String(raw || '')
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

function clampScore5(value: number): number {
  return Number(Math.min(5.0, Math.max(3.5, value)).toFixed(2));
}

export function computeJReviewsCriteriaScores(
  item: MasterProduct,
  userScore5: number,
  expertScore5: number
): LeaderboardCriteriaBreakdown {
  const rawCriteria = (item.expert_criteria_scores || {}) as Record<
    string,
    unknown
  >;
  const specs = (item.specifications || {}) as ProductSpecifications;
  const base5 = Number((userScore5 * 0.55 + expertScore5 * 0.45).toFixed(2));

  const parseRaw = (keys: string[], fallbackDelta: number): number => {
    for (const k of keys) {
      const v = Number(rawCriteria[k]);
      if (Number.isFinite(v) && v > 0) {
        return clampScore5(v > 5 ? v / 2 : v);
      }
    }
    return clampScore5(base5 + fallbackDelta);
  };

  const refreshHz = Number(specs.display?.refresh_rate_hz || 0);
  const ramGb = Number(item.ram_gb || specs.hardware?.ram_gb || 0);
  const batteryMah = Number(
    item.battery_mah || specs.battery?.capacity_mah || 0
  );
  const minPrice = Number(item.min_price || 0);

  const screenDelta = refreshHz >= 120 ? 0.14 : refreshHz >= 90 ? 0.05 : -0.04;
  const perfDelta = ramGb >= 16 ? 0.16 : ramGb >= 12 ? 0.08 : 0.02;
  const camDelta = specs.camera?.second_camera ? 0.12 : 0.03;
  const batDelta = batteryMah >= 5500 ? 0.18 : batteryMah >= 4800 ? 0.09 : 0.02;
  const valDelta =
    minPrice > 0 && minPrice <= 18_000_000
      ? 0.22
      : minPrice <= 27_000_000
        ? 0.08
        : -0.05;

  return {
    screen: parseRaw(['screen', 'display', 'man_hinh'], screenDelta),
    performance: parseRaw(['performance', 'hardware', 'hieu_nang'], perfDelta),
    camera: parseRaw(['camera', 'audio', 'multimedia'], camDelta),
    battery: parseRaw(['battery', 'pin', 'endurance'], batDelta),
    value: parseRaw(['value', 'price_value', 'dang_tien'], valDelta),
  };
}

export function scoreMasterProductForLeaderboard(
  item: MasterProduct,
  criterion: LeaderboardCriterionKey = 'combined'
): Omit<ScoredLeaderboardItem, 'rank'> {
  const categorySlug = getMasterProductCategorySlug(item);
  const categoryPath = getCategoryRouteHref(categorySlug);
  const productHref = getMasterProductHref(item);
  const thumbnail =
    resolveProductImageUrl({
      slug: item.slug,
      name: item.name,
      model: item.model,
      category_id: item.category_id,
      metadata: item.metadata,
      thumbnail: item.thumbnail,
      images: item.images,
    }) || '/img/devices/apple-iphone-16-pro-max-256gb.jpg';

  const userScore5 = clampScore5(
    Number(item.user_rating_weighted || item.average_rating || 4.7)
  );
  const rawExpert = Number(item.expert_rating || 0);
  const expertScore10 = Number(
    (rawExpert > 0
      ? rawExpert > 5
        ? rawExpert
        : rawExpert * 2
      : Math.min(9.8, userScore5 * 2 - 0.1)
    ).toFixed(1)
  );
  const expertScore5 = Number((expertScore10 / 2).toFixed(2));
  const criteria = computeJReviewsCriteriaScores(
    item,
    userScore5,
    expertScore5
  );
  const criteriaAvg =
    (criteria.screen +
      criteria.performance +
      criteria.camera +
      criteria.battery +
      criteria.value) /
    5;

  const combinedScore5 = clampScore5(
    userScore5 * 0.45 + expertScore5 * 0.35 + criteriaAvg * 0.2
  );

  let activeScore5 = combinedScore5;
  if (criterion === 'user') activeScore5 = userScore5;
  else if (criterion === 'expert') activeScore5 = expertScore5;
  else if (criterion !== 'combined') activeScore5 = criteria[criterion];

  const authenticReviewCount = Number(
    item.authentic_review_count || item.total_reviews || 14
  );
  const filteredNoiseReviewCount = Math.max(
    2,
    Number(item.total_reviews || 0) - Number(item.authentic_review_count || 0)
  );

  return {
    slug: item.slug,
    name: item.name,
    brand: item.brand,
    model: item.model,
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
    minPrice: Number(item.min_price || 0),
    maxPrice: Number(item.max_price || 0),
    merchantCount: Number(item.merchant_count || 5),
    criteria,
    product: item,
  };
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
  }
): ScoredLeaderboardItem[] {
  const category = options?.category ?? 'smartphones';
  const criterion = options?.criterion ?? 'combined';
  const priceSegment = options?.priceSegment ?? 'all';
  const brand = (options?.brand || 'all').trim();
  const q = (options?.query || '').trim().toLowerCase();

  const filtered = products
    .map((item) => scoreMasterProductForLeaderboard(item, criterion))
    .filter((entry) => {
      if (category !== 'all' && entry.categorySlug !== category) {
        return false;
      }
      if (
        brand !== 'all' &&
        entry.brand.toLowerCase() !== brand.toLowerCase()
      ) {
        return false;
      }
      if (priceSegment !== 'all') {
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
        const hay =
          `${entry.name} ${entry.brand} ${entry.model} ${entry.slug}`.toLowerCase();
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
      return a.minPrice - b.minPrice;
    })
    .map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));

  if (options?.limit && options.limit > 0) {
    return filtered.slice(0, options.limit);
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
  const categorySlug = getMasterProductCategorySlug(targetProduct);
  const peers = categoryProducts.filter(
    (p) => getMasterProductCategorySlug(p) === categorySlug
  );
  if (!peers.some((p) => p.slug === targetProduct.slug)) {
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
    const found = ranked.find((r) => r.slug === targetProduct.slug);
    if (!found) continue;

    // Always include overall combined rank; also include top-3 sub-criteria ranks
    if (crit === 'combined' || found.rank <= 3) {
      badges.push({
        criterion: crit,
        rank: found.rank,
        totalInCategory,
        score5: found.activeScore5,
        score10: found.activeScore10,
        categorySlug,
      });
    }
  }

  return badges.slice(0, 4);
}
