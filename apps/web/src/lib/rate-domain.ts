/**
 * Audit T12: Client-safe pure domain functions and types for Rate.vn.
 * Client Components can import from `@/lib/rate-domain` for pure scoring,
 * routing, image resolution, and URL parsing helpers.
 */
export {
  BAYESIAN_PRIOR_K,
  BAYESIAN_PRIOR_MEAN,
  KNOWN_LOCAL_DEVICE_IMAGES,
  MAX_VALID_VND_PRICE,
  computeBayesianRatingSummary,
  computeCombinedDualScore,
  computeJReviewsWeight,
  computeWilsonLowerBound,
  detectStarDistributionAnomaly,
  evaluateReviewTrustAssessment,
  extractPersistedBreakdown,
  extractProductKeywordFromUrl,
  filterAndSortMerchants,
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  parseEcommerceUrlOrQuery,
  resolveProductImageUrl,
  sanitizePostgrestFilterToken,
  stripEcommerceNoiseTokens,
} from './rate-domain-core';
export type {
  BayesianConfidenceTier,
  BayesianRatingSummary,
  CanonicalCategorySlug,
  CategoryDirectoryFacets,
  CombinedDualScoreResult,
  DiscountVerdictType,
  MasterProduct,
  MasterProductFilterParams,
  MasterProductPriceHistorySummary,
  MerchantListFilterParams,
  MerchantOffer,
  MerchantProfileDetail,
  MerchantRiskBreakdown,
  MerchantSummary,
  OfferDiscountAnalysis,
  ParsedEcommerceUrl,
  PriceHistoryPoint,
  RateCategoryItem,
  RatePlatformStats,
  ReviewAnalysisSummary,
  ReviewAuthenticityAxis,
  ReviewDepthAxis,
  ReviewFlagCategory,
  ReviewIndependenceAxis,
  ReviewItem,
  ReviewTrustAssessment,
  ReviewWeightBreakdown,
  StarDistributionAnomalySummary,
  UrlInspectionResult,
} from './rate-api';

export {
  VALID_LEADERBOARD_CATEGORIES,
  VALID_LEADERBOARD_CRITERIA,
  buildPopular1v1BattlesForCategory,
  comparePositiveMinPrices,
  computeJReviewsCriteriaScores,
  computeProductStandingInCategory,
  normalizeLeaderboardCategory,
  normalizeLeaderboardCriterion,
  normalizeLeaderboardPriceSegment,
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
  type Flagship1v1BattlePair,
  type LeaderboardCriteriaBreakdown,
  type LeaderboardCriterionKey,
  type LeaderboardPriceSegment,
  type ProductCategoryStandingBadge,
  type ProductLeaderboardBadgeInfo,
  type ScoredLeaderboardItem,
} from './leaderboard-engine';

import type {
  KeySpecs,
  MasterProduct as SharedMasterProduct,
  ProductSpecifications,
} from '@repo/shared-data';

export function normalizeCompareFiveStarRating(
  raw: number | string | null | undefined
): number {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim().replace(',', '.'))
        : NaN;
  if (!Number.isFinite(num) || num <= 0 || num > 100) {
    return 0;
  }
  const scaled = num > 10 ? num / 20 : num > 5 ? num / 2 : num;
  if (scaled <= 0 || scaled > 5) return 0;
  return Number(scaled.toFixed(2));
}

export function resolveCompareEffectiveUserRating(
  p: Pick<SharedMasterProduct, 'user_rating_weighted' | 'average_rating'>
): number {
  if (!p || typeof p !== 'object') return 0;
  const weighted = normalizeCompareFiveStarRating(p.user_rating_weighted);
  if (weighted > 0) return weighted;
  return normalizeCompareFiveStarRating(p.average_rating);
}

export function resolveCompareExpertRating5(
  p: Pick<SharedMasterProduct, 'expert_rating'>
): number | null {
  if (!p || typeof p !== 'object') return null;
  const norm = normalizeCompareFiveStarRating(p.expert_rating);
  return norm > 0 ? norm : null;
}

export function resolveCompareExpertRating10(
  p: Pick<SharedMasterProduct, 'expert_rating'>
): number | null {
  const norm5 = resolveCompareExpertRating5(p);
  return norm5 != null ? Number((norm5 * 2).toFixed(1)) : null;
}

const MAX_COMPARE_DISPLAY_INCH = 100;
const MAX_COMPARE_RAM_GB = 2048;
const MAX_COMPARE_STORAGE_GB = 65536;
const MAX_COMPARE_BATTERY_MAH = 100_000;

function toPositiveFiniteSpec(
  value: unknown,
  minExclusive: number,
  maxInclusive: number
): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n =
    typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  return Number.isFinite(n) && n > minExclusive && n <= maxInclusive ? n : null;
}

export function resolveCompareDisplaySizeInch(
  p: Pick<
    SharedMasterProduct,
    'screen_size_inch' | 'specifications' | 'key_specs'
  >
): number | null {
  if (!p || typeof p !== 'object') return null;
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = toPositiveFiniteSpec(
    specs.display?.size_inch,
    0.5,
    MAX_COMPARE_DISPLAY_INCH
  );
  if (fromSpecs !== null) {
    return fromSpecs;
  }
  const fromTop = toPositiveFiniteSpec(
    p.screen_size_inch,
    0.5,
    MAX_COMPARE_DISPLAY_INCH
  );
  if (fromTop !== null) {
    return fromTop;
  }
  const ks = (p.key_specs || {}) as KeySpecs;
  // Up to two decimals ("6.78 inch"), never starting mid-number: with one
  // decimal only, "6.78" matched as 78 (DOS/Rate#546 release-gate review).
  const m = String(ks.screen || '').match(
    /(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:inch|in\b|")/i
  );
  if (m?.[1]) {
    const parsed = toPositiveFiniteSpec(m[1], 0.5, MAX_COMPARE_DISPLAY_INCH);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function resolveCompareRamGb(
  p: Pick<SharedMasterProduct, 'ram_gb' | 'specifications' | 'key_specs'>
): number | null {
  if (!p || typeof p !== 'object') return null;
  const fromTop = toPositiveFiniteSpec(p.ram_gb, 0, MAX_COMPARE_RAM_GB);
  if (fromTop !== null) {
    return fromTop;
  }
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = toPositiveFiniteSpec(
    specs.hardware?.ram_gb,
    0,
    MAX_COMPARE_RAM_GB
  );
  if (fromSpecs !== null) {
    return fromSpecs;
  }
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.ram || '').match(/(\d+)\s*GB/i);
  if (m?.[1]) {
    const parsed = toPositiveFiniteSpec(m[1], 0, MAX_COMPARE_RAM_GB);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function resolveCompareStorageGb(
  p: Pick<SharedMasterProduct, 'storage_gb' | 'specifications' | 'key_specs'>
): number | null {
  if (!p || typeof p !== 'object') return null;
  const fromTop = toPositiveFiniteSpec(p.storage_gb, 0, MAX_COMPARE_STORAGE_GB);
  if (fromTop !== null) {
    return fromTop;
  }
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = toPositiveFiniteSpec(
    specs.hardware?.storage_gb,
    0,
    MAX_COMPARE_STORAGE_GB
  );
  if (fromSpecs !== null) {
    return fromSpecs;
  }
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.storage || '').match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
  if (m?.[1] && m?.[2]) {
    const val = Number(m[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) {
      const gb = m[2].toUpperCase() === 'TB' ? Math.round(val * 1024) : val;
      if (gb > 0 && gb <= MAX_COMPARE_STORAGE_GB) {
        return gb;
      }
    }
  }
  return null;
}

export function resolveCompareMemoryScore(
  p: Pick<
    SharedMasterProduct,
    'ram_gb' | 'storage_gb' | 'specifications' | 'key_specs'
  >
): number {
  const ram = resolveCompareRamGb(p) ?? 0;
  const rom = resolveCompareStorageGb(p) ?? 0;
  return ram * 1000 + rom;
}

export function resolveCompareBatteryMah(
  p: Pick<SharedMasterProduct, 'battery_mah' | 'specifications' | 'key_specs'>
): number | null {
  if (!p || typeof p !== 'object') return null;
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = toPositiveFiniteSpec(
    specs.battery?.capacity_mah,
    0,
    MAX_COMPARE_BATTERY_MAH
  );
  if (fromSpecs !== null) {
    return fromSpecs;
  }
  const fromTop = toPositiveFiniteSpec(
    p.battery_mah,
    0,
    MAX_COMPARE_BATTERY_MAH
  );
  if (fromTop !== null) {
    return fromTop;
  }
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.battery || '').match(/(\d{2,5})\s*mAh/i);
  if (m?.[1]) {
    const parsed = toPositiveFiniteSpec(m[1], 0, MAX_COMPARE_BATTERY_MAH);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}
