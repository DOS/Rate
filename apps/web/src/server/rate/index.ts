import { cache } from 'react';
import {
  compareMasterProducts as _compareMasterProducts,
  getCategoryDirectoryFacets as _getCategoryDirectoryFacets,
  getCategoryRouteHref,
  getMasterProductBySlug as _getMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProductOffers as _getMasterProductOffers,
  getMasterProductPriceHistory as _getMasterProductPriceHistory,
  getMasterProductReviews as _getMasterProductReviews,
  getMasterProductReviewSummary as _getMasterProductReviewSummary,
  getMasterProducts as _getMasterProducts,
  getMerchantProfileById as _getMerchantProfileById,
  getMerchantsList as _getMerchantsList,
  getRatePlatformStats as _getRatePlatformStats,
  inspectProductOrShopUrl as _inspectProductOrShopUrl,
  parseEcommerceUrlOrQuery,
  resolveProductImageUrl,
  getRateClient,
  computeJReviewsWeight,
  type CanonicalCategorySlug,
  type MasterProductFilterParams,
} from '../../lib/rate-api';

export type {
  CanonicalCategorySlug,
  CategoryDirectoryFacets,
  DiscountVerdictType,
  MasterProductFilterParams,
  MasterProductPriceHistorySummary,
  MerchantOffer,
  MerchantProductListing,
  MerchantProfileDetail,
  MerchantRiskBreakdown,
  MerchantSummary,
  OfferDiscountAnalysis,
  ParsedEcommerceUrl,
  PriceHistoryPoint,
  RateCategoryItem,
  RatePlatformStats,
  ReviewAnalysisSummary,
  ReviewFlagCategory,
  ReviewItem,
  UrlInspectionResult,
} from '../../lib/rate-api';

export {
  getRateClient,
  computeJReviewsWeight,
  parseEcommerceUrlOrQuery,
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
};

/**
 * Per-request memoized Server Data Layer (React.cache) for Next.js 16 App Router.
 * Prevents duplicate Supabase round-trips when both generateMetadata() and Page()
 * query the same product, merchant, or category facets during a single SSR render pass.
 */
const _getCachedMasterProductsByKey = cache((serializedParams: string) => {
  const parsed = JSON.parse(serializedParams) as MasterProductFilterParams;
  return _getMasterProducts(parsed);
});

export function getCachedMasterProducts(params?: MasterProductFilterParams) {
  return _getCachedMasterProductsByKey(JSON.stringify(params ?? {}));
}

export const getCachedMasterProductBySlug = cache(_getMasterProductBySlug);
export const getCachedCategoryDirectoryFacets = cache(
  _getCategoryDirectoryFacets
);
export const getCachedMasterProductOffers = cache(_getMasterProductOffers);
export const getCachedMasterProductReviews = cache(_getMasterProductReviews);
export const getCachedMasterProductReviewSummary = cache(
  _getMasterProductReviewSummary
);
export const getCachedMasterProductPriceHistory = cache(
  _getMasterProductPriceHistory
);
export const getCachedCompareMasterProducts = cache((slugsCsv: string) =>
  _compareMasterProducts(slugsCsv.split(','))
);
export const getCachedMerchantsList = cache(() => _getMerchantsList());
export const getCachedMerchantProfileById = cache(_getMerchantProfileById);
export const getCachedRatePlatformStats = cache(_getRatePlatformStats);
export const getCachedInspectProductOrShopUrl = cache(_inspectProductOrShopUrl);

export {
  _getMasterProducts as getMasterProducts,
  _compareMasterProducts as compareMasterProducts,
  _getMerchantsList as getMerchantsList,
  _getMerchantProfileById as getMerchantProfileById,
  _getRatePlatformStats as getRatePlatformStats,
  _inspectProductOrShopUrl as inspectProductOrShopUrl,
};

export {
  EXTENSION_CAPABILITY_MATRIX,
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  detectPlatformFromInput,
  evaluateExtensionPriceVerdict,
  extractStorageAndAmbiguity,
  ingestExtensionCrowdSignal,
  lookupExtensionProduct,
  type ExtensionCrowdIngestInput,
  type ExtensionCrowdIngestResult,
  type ExtensionLookupParams,
  type ExtensionLookupResponse,
  type ExtensionMatchStatus,
  type ExtensionPriceAssessment,
  type ExtensionPriceVerdict,
  type ExtensionVariantCandidate,
  type PlatformCapability,
  type SupportedEcommercePlatform,
} from './extension';

export {
  buildRateOpenApiSpec,
  type OpenApiOperation,
  type OpenApiParameter,
  type RateOpenApiDocument,
} from './openapi';

export {
  computeCrossPlatformDealRadarFromData,
  getCrossPlatformDealRadar,
  type CrossPlatformDealRadarItem,
  type CrossPlatformDealRadarResponse,
  type CrossPlatformPriceSpreadItem,
  type DealRadarVerdict,
} from './deals';
