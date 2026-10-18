import 'server-only';
import { cache } from 'react';
import {
  compareMasterProducts as _compareMasterProducts,
  getCategoryDirectoryFacets as _getCategoryDirectoryFacets,
  getCategoryRouteHref,
  getMasterProductBySlug as _getMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProductOffers as _getMasterProductOffers,
  getMasterProductOffersBatch as _getMasterProductOffersBatch,
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

import {
  RATE_CACHE_TAGS,
  categoryCacheTag,
  merchantCacheTag,
  productCacheTag,
  resolveRevalidationTargets,
  withRateDataCache,
  type RateCanonicalCacheTag,
  type RateDataCacheOptions,
  type RevalidationTargetsInput,
} from './cache-tags';
import { computeProductRadarSignal } from './deals';

export {
  RATE_CACHE_TAGS,
  categoryCacheTag,
  merchantCacheTag,
  productCacheTag,
  resolveRevalidationTargets,
  withRateDataCache,
  type RateCanonicalCacheTag,
  type RateDataCacheOptions,
  type RevalidationTargetsInput,
};

/**
 * Dual-Layer Server Data Cache (Audit C3 & Phase 7.3):
 * 1. `React.cache()` deduplicates identical queries within a single SSR render pass
 *    (e.g., `generateMetadata()` + `Page()`).
 * 2. `withRateDataCache()` (`unstable_cache`) persists results across requests with
 *    deterministic cache tags (`rate:products`, `rate:product:<slug>`, `rate:merchants`, etc.)
 *    so `POST /api/v1/rate/revalidate` can surgically invalidate updated entities.
 */
const _fetchMasterProductsDataCache = withRateDataCache(
  async (serializedParams: string) => {
    const parsed = JSON.parse(serializedParams) as MasterProductFilterParams;
    return _getMasterProducts(parsed);
  },
  ['rate-master-products'],
  {
    revalidate: 300,
    tags: [RATE_CACHE_TAGS.PRODUCTS],
  }
);

const _getCachedMasterProductsByKey = cache((serializedParams: string) =>
  _fetchMasterProductsDataCache(serializedParams)
);

export function getCachedMasterProducts(params?: MasterProductFilterParams) {
  return _getCachedMasterProductsByKey(JSON.stringify(params ?? {}));
}

export const getCachedMasterProductBySlug = cache((slug: string) =>
  withRateDataCache(
    _getMasterProductBySlug,
    ['rate-master-product-by-slug', slug],
    {
      revalidate: 300,
      tags: [RATE_CACHE_TAGS.PRODUCTS, productCacheTag(slug)],
    }
  )(slug)
);

export const getCachedCategoryDirectoryFacets = cache((categorySlug?: string) =>
  withRateDataCache(
    _getCategoryDirectoryFacets,
    ['rate-category-facets', categorySlug ?? 'all'],
    {
      revalidate: 600,
      tags: [
        RATE_CACHE_TAGS.CATEGORIES,
        RATE_CACHE_TAGS.PRODUCTS,
        ...(categorySlug ? [categoryCacheTag(categorySlug)] : []),
      ],
    }
  )(categorySlug)
);

export const getCachedMasterProductOffers = cache((masterProductId: string) =>
  withRateDataCache(
    _getMasterProductOffers,
    ['rate-master-product-offers', masterProductId],
    {
      revalidate: 180,
      tags: [RATE_CACHE_TAGS.OFFERS, RATE_CACHE_TAGS.DEALS],
    }
  )(masterProductId)
);

export const getCachedMasterProductReviews = cache((masterProductId: string) =>
  withRateDataCache(
    _getMasterProductReviews,
    ['rate-master-product-reviews', masterProductId],
    {
      revalidate: 300,
      tags: [RATE_CACHE_TAGS.REVIEWS],
    }
  )(masterProductId)
);

export const getCachedMasterProductReviewSummary = cache(
  (
    masterProductId: string,
    existingReviews?: import('../../lib/rate-api').ReviewItem[]
  ) =>
    withRateDataCache(
      (id: string) => _getMasterProductReviewSummary(id, existingReviews),
      ['rate-master-product-review-summary', masterProductId],
      {
        revalidate: 300,
        tags: [RATE_CACHE_TAGS.REVIEWS],
      }
    )(masterProductId)
);

export const getCachedMasterProductPriceHistory = cache(
  (
    masterProductId: string,
    existingOffers?: import('../../lib/rate-api').MerchantOffer[]
  ) =>
    withRateDataCache(
      (id: string) => _getMasterProductPriceHistory(id, existingOffers),
      ['rate-master-product-price-history', masterProductId],
      {
        revalidate: 600,
        tags: [RATE_CACHE_TAGS.PRICE_HISTORY],
      }
    )(masterProductId)
);

export const getCachedCompareMasterProducts = cache((slugsCsv: string) =>
  withRateDataCache(
    (csv: string) => _compareMasterProducts(csv.split(',')),
    ['rate-compare-master-products', slugsCsv],
    {
      revalidate: 300,
      tags: [
        RATE_CACHE_TAGS.PRODUCTS,
        ...slugsCsv
          .split(',')
          .filter(Boolean)
          .map((s) => productCacheTag(s)),
      ],
    }
  )(slugsCsv)
);

async function inspectProductOrShopUrlWithRadar(rawQuery: string) {
  const res = await _inspectProductOrShopUrl(rawQuery);
  return {
    ...res,
    radarSignal: res.masterProduct
      ? computeProductRadarSignal(res.masterProduct, res.allOffers)
      : null,
  };
}

export const getCachedMerchantsList = cache(() =>
  withRateDataCache(_getMerchantsList, ['rate-merchants-list'], {
    revalidate: 600,
    tags: [RATE_CACHE_TAGS.MERCHANTS],
  })()
);

export const getCachedMerchantProfileById = cache((merchantId: string) =>
  withRateDataCache(
    _getMerchantProfileById,
    ['rate-merchant-profile', merchantId],
    {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.MERCHANTS, merchantCacheTag(merchantId)],
    }
  )(merchantId)
);

export const getCachedRatePlatformStats = cache(() =>
  withRateDataCache(_getRatePlatformStats, ['rate-platform-stats'], {
    revalidate: 600,
    tags: [RATE_CACHE_TAGS.STATS],
  })()
);

export const getCachedInspectProductOrShopUrl = cache(
  inspectProductOrShopUrlWithRadar
);

export {
  _getMasterProducts as getMasterProducts,
  _getMasterProductOffersBatch as getMasterProductOffersBatch,
  _compareMasterProducts as compareMasterProducts,
  _getMerchantsList as getMerchantsList,
  _getMerchantProfileById as getMerchantProfileById,
  _getRatePlatformStats as getRatePlatformStats,
  inspectProductOrShopUrlWithRadar as inspectProductOrShopUrl,
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
  computeProductRadarSignal,
  getCrossPlatformDealRadar,
  type CrossPlatformDealRadarItem,
  type CrossPlatformDealRadarResponse,
  type CrossPlatformPriceSpreadItem,
  type DealRadarVerdict,
} from './deals';
