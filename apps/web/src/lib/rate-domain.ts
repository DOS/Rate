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
  type BayesianConfidenceTier,
  type BayesianRatingSummary,
  type CanonicalCategorySlug,
  type CategoryDirectoryFacets,
  type CombinedDualScoreResult,
  type DiscountVerdictType,
  type MasterProduct,
  type MasterProductFilterParams,
  type MasterProductPriceHistorySummary,
  type MerchantListFilterParams,
  type MerchantOffer,
  type MerchantProfileDetail,
  type MerchantRiskBreakdown,
  type MerchantSummary,
  type OfferDiscountAnalysis,
  type ParsedEcommerceUrl,
  type PriceHistoryPoint,
  type RateCategoryItem,
  type RatePlatformStats,
  type ReviewAnalysisSummary,
  type ReviewAuthenticityAxis,
  type ReviewDepthAxis,
  type ReviewFlagCategory,
  type ReviewIndependenceAxis,
  type ReviewItem,
  type ReviewTrustAssessment,
  type ReviewWeightBreakdown,
  type StarDistributionAnomalySummary,
  type UrlInspectionResult,
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
  const weighted = normalizeCompareFiveStarRating(p.user_rating_weighted);
  if (weighted > 0) return weighted;
  return normalizeCompareFiveStarRating(p.average_rating);
}

export function resolveCompareExpertRating5(
  p: Pick<SharedMasterProduct, 'expert_rating'>
): number | null {
  const norm = normalizeCompareFiveStarRating(p.expert_rating);
  return norm > 0 ? norm : null;
}

export function resolveCompareExpertRating10(
  p: Pick<SharedMasterProduct, 'expert_rating'>
): number | null {
  const norm5 = resolveCompareExpertRating5(p);
  return norm5 != null ? Number((norm5 * 2).toFixed(1)) : null;
}

export function resolveCompareDisplaySizeInch(
  p: Pick<
    SharedMasterProduct,
    'screen_size_inch' | 'specifications' | 'key_specs'
  >
): number | null {
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = Number(specs.display?.size_inch || 0);
  if (Number.isFinite(fromSpecs) && fromSpecs > 0) return fromSpecs;
  const fromTop = Number(p.screen_size_inch || 0);
  if (Number.isFinite(fromTop) && fromTop > 0) return fromTop;
  const ks = (p.key_specs || {}) as KeySpecs;
  // Up to two decimals ("6.78 inch"), never starting mid-number: with one
  // decimal only, "6.78" matched as 78 (DOS/Rate#546 release-gate review).
  const m = String(ks.screen || '').match(
    /(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:inch|in\b|")/i
  );
  if (m?.[1]) {
    const parsed = Number(m[1].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function resolveCompareRamGb(
  p: Pick<SharedMasterProduct, 'ram_gb' | 'specifications' | 'key_specs'>
): number | null {
  const fromTop = Number(p.ram_gb || 0);
  if (Number.isFinite(fromTop) && fromTop > 0) return fromTop;
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = Number(specs.hardware?.ram_gb || 0);
  if (Number.isFinite(fromSpecs) && fromSpecs > 0) return fromSpecs;
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.ram || '').match(/(\d+)\s*GB/i);
  if (m?.[1]) {
    const parsed = Number(m[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function resolveCompareStorageGb(
  p: Pick<SharedMasterProduct, 'storage_gb' | 'specifications' | 'key_specs'>
): number | null {
  const fromTop = Number(p.storage_gb || 0);
  if (Number.isFinite(fromTop) && fromTop > 0) return fromTop;
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = Number(specs.hardware?.storage_gb || 0);
  if (Number.isFinite(fromSpecs) && fromSpecs > 0) return fromSpecs;
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.storage || '').match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
  if (m?.[1] && m?.[2]) {
    const val = Number(m[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) {
      return m[2].toUpperCase() === 'TB' ? Math.round(val * 1024) : val;
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
  const specs = (p.specifications || {}) as ProductSpecifications;
  const fromSpecs = Number(specs.battery?.capacity_mah || 0);
  if (Number.isFinite(fromSpecs) && fromSpecs > 0) return fromSpecs;
  const fromTop = Number(p.battery_mah || 0);
  if (Number.isFinite(fromTop) && fromTop > 0) return fromTop;
  const ks = (p.key_specs || {}) as KeySpecs;
  const m = String(ks.battery || '').match(/(\d{2,5})\s*mAh/i);
  if (m?.[1]) {
    const parsed = Number(m[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}
