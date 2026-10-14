import { cache } from 'react';
import {
  compareMasterProducts as _compareMasterProducts,
  getCategoryDirectoryFacets as _getCategoryDirectoryFacets,
  getMasterProductBySlug as _getMasterProductBySlug,
  getMasterProductOffers as _getMasterProductOffers,
  getMasterProductPriceHistory as _getMasterProductPriceHistory,
  getMasterProductReviews as _getMasterProductReviews,
  getMasterProductReviewSummary as _getMasterProductReviewSummary,
  getMasterProducts as _getMasterProducts,
  getRateClient,
  computeJReviewsWeight,
} from '@/lib/rate-api';

export type {
  CategoryDirectoryFacets,
  DiscountVerdictType,
  MasterProductFilterParams,
  MasterProductPriceHistorySummary,
  MerchantOffer,
  OfferDiscountAnalysis,
  PriceHistoryPoint,
  RateCategoryItem,
  ReviewAnalysisSummary,
  ReviewFlagCategory,
  ReviewItem,
} from '@/lib/rate-api';

export { getRateClient, computeJReviewsWeight };

/**
 * Per-request memoized Server Data Layer (React.cache) for Next.js 16 App Router.
 * Prevents duplicate Supabase round-trips when both generateMetadata() and Page()
 * query the same product or category facets during a single SSR render pass.
 */
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

export {
  _getMasterProducts as getMasterProducts,
  _compareMasterProducts as compareMasterProducts,
};
