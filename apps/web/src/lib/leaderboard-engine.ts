import {
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
  type CanonicalCategorySlug,
  type MasterProduct,
} from './rate-api';
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
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(Math.min(5.0, value).toFixed(2));
}

export function computeJReviewsCriteriaScores(
  item: MasterProduct,
  userScore5: number,
  expertScore5: number | null
): LeaderboardCriteriaBreakdown {
  const rawCriteria = (item.expert_criteria_scores || {}) as Record<
    string,
    unknown
  >;
  const specs = (item.specifications || {}) as ProductSpecifications;
  const categorySlug = getMasterProductCategorySlug(item);
  const base5 =
    userScore5 > 0 && expertScore5 != null
      ? Number((userScore5 * 0.55 + expertScore5 * 0.45).toFixed(2))
      : userScore5 > 0
        ? userScore5
        : (expertScore5 ?? 0);

  const parseRaw = (keys: string[], fallbackDelta: number): number => {
    for (const k of keys) {
      const v = Number(rawCriteria[k]);
      if (Number.isFinite(v) && v > 0) {
        return clampScore5(v > 5 ? v / 2 : v);
      }
    }
    if (base5 <= 0) return 0;
    return clampScore5(base5 + fallbackDelta);
  };

  const refreshHz = Number(specs.display?.refresh_rate_hz || 0);
  const ramGb = Number(item.ram_gb || specs.hardware?.ram_gb || 0);
  const batteryMah = Number(
    item.battery_mah || specs.battery?.capacity_mah || 0
  );
  const fastChargingW = Number(specs.battery?.fast_charging_w || 0);
  const minPrice = Number(item.min_price || 0);
  const displayType = String(specs.display?.type || '').toLowerCase();
  const displayProtection = String(
    specs.display?.protection || ''
  ).toLowerCase();
  const resistance = String(specs.design?.resistance || '').toLowerCase();
  const audioFeatures = String(
    specs.multimedia?.audio_features || ''
  ).toLowerCase();
  const sensors = String(specs.connectivity?.sensors || '').toLowerCase();
  const location = String(specs.connectivity?.location || '').toLowerCase();

  let screenDelta: number;
  let perfDelta: number;
  let camDelta: number;
  let batDelta: number;
  let valDelta: number;

  if (categorySlug === 'earbuds') {
    screenDelta =
      resistance.includes('ip') || Number(specs.design?.weight_g || 0) > 0
        ? 0.12
        : 0.04;
    perfDelta =
      String(specs.connectivity?.bluetooth || '').includes('5.') ||
      Boolean(specs.hardware?.chipset)
        ? 0.14
        : 0.04;
    camDelta =
      audioFeatures.includes('anc') ||
      audioFeatures.includes('ldac') ||
      audioFeatures.includes('spatial') ||
      audioFeatures.includes('dolby') ||
      Boolean(specs.multimedia?.audio_features)
        ? 0.16
        : 0.06;
    batDelta =
      batteryMah >= 500
        ? 0.16
        : batteryMah >= 300 || Boolean(specs.battery?.charging)
          ? 0.09
          : 0.03;
    valDelta =
      minPrice > 0 && minPrice <= 3_500_000
        ? 0.22
        : minPrice > 0 && minPrice <= 6_500_000
          ? 0.1
          : minPrice > 0
            ? -0.03
            : 0;
  } else if (categorySlug === 'smartwatches') {
    screenDelta =
      refreshHz >= 60 ||
      displayType.includes('oled') ||
      displayType.includes('amoled') ||
      displayProtection.includes('sapphire')
        ? 0.12
        : 0.03;
    perfDelta = Boolean(specs.hardware?.chipset) || ramGb >= 2 ? 0.12 : 0.03;
    camDelta =
      sensors.includes('ecg') ||
      sensors.includes('spo2') ||
      location.includes('dual') ||
      location.includes('l1') ||
      Boolean(specs.connectivity?.sensors)
        ? 0.14
        : 0.04;
    batDelta = batteryMah >= 500 ? 0.18 : batteryMah >= 300 ? 0.09 : 0.02;
    valDelta =
      minPrice > 0 && minPrice <= 7_000_000
        ? 0.2
        : minPrice > 0 && minPrice <= 15_000_000
          ? 0.08
          : minPrice > 0
            ? -0.04
            : 0;
  } else if (categorySlug === 'laptops') {
    screenDelta =
      refreshHz >= 120
        ? 0.15
        : refreshHz >= 90 ||
            displayType.includes('oled') ||
            displayType.includes('mini-led')
          ? 0.09
          : 0.02;
    perfDelta = ramGb >= 32 ? 0.18 : ramGb >= 16 ? 0.12 : 0.02;
    camDelta =
      specs.camera?.front_camera || specs.multimedia?.loudspeaker ? 0.08 : 0.02;
    batDelta =
      batteryMah >= 7000 || fastChargingW >= 90
        ? 0.16
        : batteryMah >= 4500 || fastChargingW >= 65
          ? 0.09
          : 0.02;
    valDelta =
      minPrice > 0 && minPrice <= 25_000_000
        ? 0.2
        : minPrice > 0 && minPrice <= 42_000_000
          ? 0.08
          : minPrice > 0
            ? -0.04
            : 0;
  } else {
    screenDelta = refreshHz >= 120 ? 0.14 : refreshHz >= 90 ? 0.05 : -0.04;
    perfDelta = ramGb >= 16 ? 0.16 : ramGb >= 12 ? 0.08 : 0.02;
    camDelta = specs.camera?.second_camera ? 0.12 : 0.03;
    batDelta = batteryMah >= 5500 ? 0.18 : batteryMah >= 4800 ? 0.09 : 0.02;
    valDelta =
      minPrice > 0 && minPrice <= 18_000_000
        ? 0.22
        : minPrice > 0 && minPrice <= 27_000_000
          ? 0.08
          : minPrice > 0
            ? -0.05
            : 0;
  }

  return {
    screen: parseRaw(
      ['screen', 'display', 'man_hinh', 'design', 'comfort'],
      screenDelta
    ),
    performance: parseRaw(
      ['performance', 'hardware', 'hieu_nang', 'connectivity'],
      perfDelta
    ),
    camera: parseRaw(
      ['camera', 'audio', 'multimedia', 'sound', 'sensors'],
      camDelta
    ),
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

  const rawUser = Number(item.user_rating_weighted || item.average_rating || 0);
  const normalizedUser5 = rawUser > 5 ? rawUser / 2 : rawUser;
  const userScore5 = rawUser > 0 ? clampScore5(normalizedUser5) : 0;

  const rawExpert = Number(item.expert_rating || 0);
  const expertScore10: number | null =
    rawExpert > 0
      ? Number(
          Math.min(10, rawExpert > 5 ? rawExpert : rawExpert * 2).toFixed(1)
        )
      : null;
  const expertScore5: number | null =
    expertScore10 != null ? Number((expertScore10 / 2).toFixed(2)) : null;

  const criteria = computeJReviewsCriteriaScores(
    item,
    userScore5,
    expertScore5
  );
  const criteriaValues = [
    criteria.screen,
    criteria.performance,
    criteria.camera,
    criteria.battery,
    criteria.value,
  ].filter((v) => v > 0);
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
  if (criterion === 'user') activeScore5 = userScore5;
  else if (criterion === 'expert') activeScore5 = expertScore5 ?? 0;
  else if (criterion !== 'combined') activeScore5 = criteria[criterion];

  const authenticReviewCount = Number(
    item.authentic_review_count || item.total_reviews || 0
  );
  const filteredNoiseReviewCount = Math.max(
    0,
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
    merchantCount: Number(item.merchant_count || 0),
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
  const ranked = rankMasterProductsForLeaderboard(products, {
    category,
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
    if (pairs.length >= maxPairs) break;
    const itemA = ranked[idxA];
    const itemB = ranked[idxB];
    if (!itemA || !itemB || itemA.slug === itemB.slug) continue;

    const versusSlug = `${itemA.slug}-vs-${itemB.slug}`;
    const scoreDelta5 = Number(
      Math.abs(itemA.combinedScore5 - itemB.combinedScore5).toFixed(2)
    );
    const priceDeltaVnd = Math.abs(itemA.minPrice - itemB.minPrice);
    const winnerSlug =
      itemA.combinedScore5 > itemB.combinedScore5
        ? itemA.slug
        : itemB.combinedScore5 > itemA.combinedScore5
          ? itemB.slug
          : null;

    pairs.push({
      versusSlug,
      versusHref: `/compare/${versusSlug}`,
      categorySlug: category,
      productA: itemA,
      productB: itemB,
      winnerSlug,
      scoreDelta5,
      priceDeltaVnd,
    });
  }

  return pairs;
}
