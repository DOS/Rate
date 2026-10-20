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
  isCanonicalCategorySlug,
  extractPersistedBreakdown,
  extractProductKeywordFromUrl,
  parseEcommerceUrlOrQuery,
  resolveProductImageUrl,
  stripEcommerceNoiseTokens,
  getRateClient,
  computeJReviewsWeight,
  filterAndSortMerchants,
  type MasterProductFilterParams,
  type MerchantListFilterParams,
} from '../../lib/rate-api';

export type {
  CanonicalCategorySlug,
  CategoryDirectoryFacets,
  DiscountVerdictType,
  MasterProductFilterParams,
  MasterProductPriceHistorySummary,
  MerchantListFilterParams,
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
  extractPersistedBreakdown,
  extractProductKeywordFromUrl,
  filterAndSortMerchants,
  isCanonicalCategorySlug,
  parseEcommerceUrlOrQuery,
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
  stripEcommerceNoiseTokens,
};

import {
  RATE_CACHE_TAGS,
  canonicalizeCacheParams,
  categoryCacheTag,
  isSafeRevalidationPath,
  merchantCacheTag,
  productCacheTag,
  resolveRevalidationTargets,
  withRateDataCache,
  type RateCanonicalCacheTag,
  type RateDataCacheOptions,
  type RevalidationTargetsInput,
} from './cache-tags';
import { computeProductRadarSignal } from './deals';
import { createLogger } from '@/lib/logger';

const log = createLogger('server.rate');

// Next skips Data Cache entries over 2 MB (it warns on each such write and
// stores nothing; in dev it throws). JSON length is the unit Next measures,
// and the unfiltered merchant directory is one entry shared by /, /merchants
// and the APIs. Warn before it gets there, so the cutover to a split cache is
// planned, not discovered as a full directory scan on every request
// (DOS/Rate#488).
const MERCHANT_CACHE_WARN_BYTES = 1_500_000;

export {
  RATE_CACHE_TAGS,
  canonicalizeCacheParams,
  categoryCacheTag,
  isSafeRevalidationPath,
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
const _getCachedMasterProductsByKey = cache(
  (serializedParams: string, categorySlugKey: string) =>
    withRateDataCache(
      async (rawParams: string) => {
        const parsed = JSON.parse(rawParams) as MasterProductFilterParams;
        return _getMasterProducts(parsed);
      },
      ['rate-master-products', categorySlugKey],
      {
        revalidate: 300,
        tags: [
          RATE_CACHE_TAGS.PRODUCTS,
          ...(categorySlugKey !== 'all'
            ? [categoryCacheTag(categorySlugKey)]
            : []),
        ],
      }
    )(serializedParams)
);

export function getCachedMasterProducts(params?: MasterProductFilterParams) {
  const cleanCat = params?.categorySlug?.trim().toLowerCase() || 'all';
  return _getCachedMasterProductsByKey(
    canonicalizeCacheParams(params ?? {}),
    cleanCat
  );
}

export const getCachedMasterProductBySlug = cache((slug: string) => {
  const cleanSlug = slug.trim().toLowerCase();
  return withRateDataCache(
    _getMasterProductBySlug,
    ['rate-master-product-by-slug', cleanSlug],
    {
      revalidate: 300,
      tags: [RATE_CACHE_TAGS.PRODUCTS, productCacheTag(cleanSlug)],
    }
  )(cleanSlug);
});

export const getCachedCategoryDirectoryFacets = cache(
  (categorySlug?: string) => {
    const cleanCat = categorySlug?.trim().toLowerCase() || 'all';
    return withRateDataCache(
      _getCategoryDirectoryFacets,
      ['rate-category-facets', cleanCat],
      {
        revalidate: 600,
        tags: [
          RATE_CACHE_TAGS.CATEGORIES,
          RATE_CACHE_TAGS.PRODUCTS,
          ...(cleanCat !== 'all' ? [categoryCacheTag(cleanCat)] : []),
        ],
      }
    )(categorySlug);
  }
);

export const getCachedMasterProductOffers = cache((masterProductId: string) => {
  const cleanId = masterProductId.trim();
  return withRateDataCache(
    _getMasterProductOffers,
    ['rate-master-product-offers', cleanId],
    {
      revalidate: 180,
      tags: [RATE_CACHE_TAGS.OFFERS, RATE_CACHE_TAGS.DEALS],
    }
  )(cleanId);
});

export const getCachedMasterProductReviews = cache(
  (masterProductId: string) => {
    const cleanId = masterProductId.trim();
    return withRateDataCache(
      _getMasterProductReviews,
      ['rate-master-product-reviews', cleanId],
      {
        revalidate: 300,
        tags: [RATE_CACHE_TAGS.REVIEWS],
      }
    )(cleanId);
  }
);

export const getCachedMasterProductReviewSummary = cache(
  (
    masterProductId: string,
    existingReviews?: import('../../lib/rate-api').ReviewItem[]
  ) => {
    const cleanId = masterProductId.trim();
    const reviewsKey = existingReviews
      ? `reviews:${existingReviews.length}:${existingReviews
          .slice(0, 20)
          .map(
            (r) => `${r.id}:${r.verdict ?? ''}:${r.include_in_rating ? 1 : 0}`
          )
          .join('|')}`
      : 'reviews:auto';
    return withRateDataCache(
      async (id: string) => {
        const reviews =
          existingReviews ?? (await getCachedMasterProductReviews(id));
        return _getMasterProductReviewSummary(id, reviews);
      },
      ['rate-master-product-review-summary', cleanId, reviewsKey],
      {
        revalidate: 300,
        tags: [RATE_CACHE_TAGS.REVIEWS],
      }
    )(cleanId);
  }
);

export const getCachedMasterProductPriceHistory = cache(
  (
    masterProductId: string,
    existingOffers?: import('../../lib/rate-api').MerchantOffer[]
  ) => {
    const cleanId = masterProductId.trim();
    const offersKey = existingOffers
      ? `offers:${existingOffers.length}:${existingOffers
          .slice(0, 20)
          .map((o) => `${o.id}:${o.price_current}:${o.price_original ?? ''}`)
          .join('|')}`
      : 'offers:auto';
    return withRateDataCache(
      async (id: string) => {
        const offers =
          existingOffers ?? (await getCachedMasterProductOffers(id));
        return _getMasterProductPriceHistory(id, offers);
      },
      ['rate-master-product-price-history', cleanId, offersKey],
      {
        revalidate: 600,
        tags: [RATE_CACHE_TAGS.PRICE_HISTORY, RATE_CACHE_TAGS.OFFERS],
      }
    )(cleanId);
  }
);

const _getCachedCompareMasterProductsByKey = cache(
  (canonicalSlugsCsv: string) =>
    withRateDataCache(
      (csv: string) => _compareMasterProducts(csv ? csv.split(',') : []),
      ['rate-compare-master-products', canonicalSlugsCsv],
      {
        revalidate: 300,
        tags: [
          RATE_CACHE_TAGS.PRODUCTS,
          ...canonicalSlugsCsv
            .split(',')
            .filter(Boolean)
            .map((s) => productCacheTag(s)),
        ],
      }
    )(canonicalSlugsCsv)
);

export function getCachedCompareMasterProducts(slugsCsv: string) {
  const canonicalSlugsCsv = Array.from(
    new Set(
      (slugsCsv || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  )
    .slice(0, 4)
    .join(',');
  return _getCachedCompareMasterProductsByKey(canonicalSlugsCsv);
}

async function inspectProductOrShopUrlWithRadar(rawQuery: string) {
  const res = await _inspectProductOrShopUrl(rawQuery);
  return {
    ...res,
    radarSignal: res.masterProduct
      ? computeProductRadarSignal(res.masterProduct, res.allOffers)
      : null,
  };
}

const _fetchMerchantsListDataCache = withRateDataCache(
  async (serializedParams: string) => {
    const parsed = JSON.parse(serializedParams) as MerchantListFilterParams;
    const merchants = await _getMerchantsList(parsed);
    const bytes = JSON.stringify(merchants).length;
    if (bytes > MERCHANT_CACHE_WARN_BYTES) {
      log.warn('merchant directory cache entry near the 2 MB limit', {
        bytes,
        merchants: merchants.length,
        params: serializedParams,
      });
    }
    return merchants;
  },
  ['rate-merchants-list'],
  {
    revalidate: 600,
    tags: [RATE_CACHE_TAGS.MERCHANTS],
  }
);

const _getCachedMerchantsListByKey = cache((serializedParams: string) =>
  _fetchMerchantsListDataCache(serializedParams)
);

export async function getCachedMerchantsList(
  params?: MerchantListFilterParams
) {
  const { q, minTrust, sort, limit, ...databaseParams } = params ?? {};
  // No-op filters out of the key, so the API (which always sends
  // officialOnly) shares the pages' unfiltered directory entry.
  if (!databaseParams.officialOnly) delete databaseParams.officialOnly;
  if (!databaseParams.platform || databaseParams.platform === 'all') {
    delete databaseParams.platform;
  }
  const all = await _getCachedMerchantsListByKey(
    canonicalizeCacheParams(databaseParams)
  );
  // Search, trust floor, sort, and limit run in memory over the cached list
  // instead of caching per query or per limit parameter (DOS/Rate#457, #584).
  if (
    (q && q.trim()) ||
    (typeof minTrust === 'number' && !Number.isNaN(minTrust)) ||
    sort ||
    (typeof limit === 'number' && Number.isFinite(limit))
  ) {
    return filterAndSortMerchants(all, { q, minTrust, sort, limit });
  }
  return all;
}

export const getCachedMerchantProfileById = cache((merchantId: string) => {
  const cleanId = merchantId.trim();
  return withRateDataCache(
    _getMerchantProfileById,
    ['rate-merchant-profile', cleanId],
    {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.MERCHANTS, merchantCacheTag(cleanId)],
    }
  )(cleanId);
});

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
