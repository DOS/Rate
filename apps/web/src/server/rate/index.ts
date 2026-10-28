import 'server-only';
import { createHash } from 'node:crypto';
import { cache } from 'react';
import { sitemapRowsByItem } from '@/lib/item-directory';
import {
  getItemBrandFacets,
  getItemCount,
  getItemSlugByVariantSlug,
} from './item-directory';
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
  attachMerchantDiscountAnalysis as _attachMerchantDiscountAnalysis,
  getMerchantProfileBase as _getMerchantProfileBase,
  getMerchantProfileById as _getMerchantProfileById,
  getMerchantsList as _getMerchantsList,
  getRatePlatformStats as _getRatePlatformStats,
  getFilteredReviewCountsByMaster as _getFilteredReviewCountsByMaster,
  getSitemapRows as _getSitemapRows,
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
  type SitemapRows,
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

const SAFE_PRODUCT_SLUG_REGEX = /^[a-z0-9._-]{1,120}$/;
const DISALLOWED_CACHED_IDENTIFIER_TOKEN_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

export function sanitizeCachedEntityId(value: unknown, maxLen = 128): string {
  if (typeof value !== 'string') return '';
  const safeMaxLen =
    typeof maxLen === 'number' && Number.isFinite(maxLen) && maxLen > 0
      ? Math.min(Math.trunc(maxLen), 128)
      : 128;
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, safeMaxLen);
  if (
    !cleaned ||
    !/[a-zA-Z0-9]/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    DISALLOWED_CACHED_IDENTIFIER_TOKEN_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

export function sanitizeCachedProductSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (
    !SAFE_PRODUCT_SLUG_REGEX.test(cleaned) ||
    !/[a-z0-9]/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    DISALLOWED_CACHED_IDENTIFIER_TOKEN_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

export function sanitizeCachedCompareSlugsCsv(slugsCsv: unknown): string {
  if (typeof slugsCsv !== 'string') return '';
  return Array.from(
    new Set(
      slugsCsv
        .split(',')
        .map((s) => sanitizeCachedProductSlug(s))
        .filter(Boolean)
    )
  )
    .slice(0, 4)
    .join(',');
}

export function sanitizeCachedInspectQuery(rawQuery: unknown): string {
  if (typeof rawQuery !== 'string') return '';
  return rawQuery
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2048);
}

export function normalizeCachedFacetCategory(
  categorySlug?: string | null
): import('../../lib/rate-api').CanonicalCategorySlug | 'all' {
  if (categorySlug === undefined || categorySlug === null) {
    return 'smartphones';
  }
  const cleaned =
    typeof categorySlug === 'string'
      ? categorySlug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  if (!cleaned) return 'smartphones';
  return isCanonicalCategorySlug(cleaned) ? cleaned : 'all';
}

export function getCachedMasterProducts(params?: MasterProductFilterParams) {
  const rawCat =
    typeof params?.categorySlug === 'string'
      ? params.categorySlug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  const cleanCat = rawCat && isCanonicalCategorySlug(rawCat) ? rawCat : 'all';
  return _getCachedMasterProductsByKey(
    canonicalizeCacheParams(params ?? {}),
    cleanCat
  );
}

const _getCachedMasterProductBySlugKey = cache((cleanSlug: string) =>
  withRateDataCache(
    _getMasterProductBySlug,
    ['rate-master-product-by-slug', cleanSlug],
    {
      revalidate: 300,
      tags: [RATE_CACHE_TAGS.PRODUCTS, productCacheTag(cleanSlug)],
    }
  )(cleanSlug)
);

export function getCachedMasterProductBySlug(slug: string) {
  const cleanSlug = sanitizeCachedProductSlug(slug);
  if (!cleanSlug) return Promise.resolve(null);
  return _getCachedMasterProductBySlugKey(cleanSlug);
}

const _getCachedCategoryDirectoryFacetsByKey = cache(
  (cleanCat: import('../../lib/rate-api').CanonicalCategorySlug | 'all') =>
    withRateDataCache(
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
    )(cleanCat)
);

/** Facets counted in variants whatever the Item flag (API v1, #1155). */
export function getCachedVariantCategoryDirectoryFacets(categorySlug?: string) {
  return _getCachedCategoryDirectoryFacetsByKey(
    normalizeCachedFacetCategory(categorySlug)
  );
}

export const getCachedCategoryDirectoryFacets = cache(
  async (categorySlug?: string) => {
    const facets = await _getCachedCategoryDirectoryFacetsByKey(
      normalizeCachedFacetCategory(categorySlug)
    );
    // RATE_ITEM_MODEL on: brand counts and the total are Items (#1155).
    const current = facets.currentCategory;
    const itemFacets = current
      ? await getItemBrandFacets(current.id, current.slug)
      : null;
    if (!itemFacets) return facets;
    return {
      ...facets,
      brands: itemFacets.brands,
      totalUnfiltered: itemFacets.brands.reduce((acc, b) => acc + b.count, 0),
    };
  }
);

const _getCachedMasterProductOffersByKey = cache((cleanId: string) =>
  withRateDataCache(
    _getMasterProductOffers,
    ['rate-master-product-offers', cleanId],
    {
      revalidate: 180,
      tags: [RATE_CACHE_TAGS.OFFERS, RATE_CACHE_TAGS.DEALS],
    }
  )(cleanId)
);

export function getCachedMasterProductOffers(masterProductId: string) {
  const cleanId = sanitizeCachedEntityId(masterProductId);
  if (!cleanId) return Promise.resolve([]);
  return _getCachedMasterProductOffersByKey(cleanId);
}

const _getCachedMasterProductReviewsByKey = cache((cleanId: string) =>
  withRateDataCache(
    _getMasterProductReviews,
    ['rate-master-product-reviews', cleanId],
    {
      revalidate: 300,
      tags: [RATE_CACHE_TAGS.REVIEWS],
    }
  )(cleanId)
);

export function getCachedMasterProductReviews(masterProductId: string) {
  const cleanId = sanitizeCachedEntityId(masterProductId);
  if (!cleanId) return Promise.resolve([]);
  return _getCachedMasterProductReviewsByKey(cleanId);
}

export const getCachedMasterProductReviewSummary = cache(
  (
    masterProductId: string,
    existingReviews?: import('../../lib/rate-api').ReviewItem[]
  ) => {
    const cleanId = sanitizeCachedEntityId(masterProductId);
    const safeReviews = Array.isArray(existingReviews)
      ? existingReviews.filter((r) => Boolean(r && typeof r === 'object'))
      : undefined;
    const reviewsKey = safeReviews
      ? `reviews:${safeReviews.length}:${safeReviews
          .slice(0, 20)
          .map(
            (r) =>
              `${sanitizeCachedEntityId(r.id)}:${sanitizeCachedEntityId(r.verdict ?? '', 32)}:${r.include_in_rating ? 1 : 0}`
          )
          .join('|')}`
      : 'reviews:auto';
    return withRateDataCache(
      async (id: string) => {
        const reviews =
          safeReviews ?? (await getCachedMasterProductReviews(id));
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
    const cleanId = sanitizeCachedEntityId(masterProductId);
    const safeOffers = Array.isArray(existingOffers)
      ? existingOffers.filter((o) => Boolean(o && typeof o === 'object'))
      : undefined;
    const offersKey = safeOffers
      ? `offers:${safeOffers.length}:${safeOffers
          .slice(0, 20)
          .map((o) => {
            const safeCur =
              typeof o.price_current === 'number' &&
              Number.isFinite(o.price_current) &&
              o.price_current > 0
                ? Math.round(o.price_current)
                : 0;
            const safeOrig =
              typeof o.price_original === 'number' &&
              Number.isFinite(o.price_original) &&
              o.price_original > 0
                ? Math.round(o.price_original)
                : '';
            return `${sanitizeCachedEntityId(o.id)}:${safeCur}:${safeOrig}`;
          })
          .join('|')}`
      : 'offers:auto';
    return withRateDataCache(
      async (id: string) => {
        const offers = safeOffers ?? (await getCachedMasterProductOffers(id));
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
  const canonicalSlugsCsv = sanitizeCachedCompareSlugsCsv(slugsCsv);
  return _getCachedCompareMasterProductsByKey(canonicalSlugsCsv);
}

async function inspectProductOrShopUrlWithRadar(rawQuery: string) {
  const safeQuery = sanitizeCachedInspectQuery(rawQuery);
  const res = await _inspectProductOrShopUrl(safeQuery);
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

// The profile entry holds no discount analysis: it is added per request from
// the product pages' cached offers and price history. Read inside the
// profile's unstable_cache those would skip their cache (nested entries do),
// so a cold profile would re-read every master (DOS/Rate#1217).
const _getCachedMerchantProfileBaseByKey = (cleanId: string) =>
  withRateDataCache(
    _getMerchantProfileBase,
    ['rate-merchant-profile-base', cleanId],
    {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.MERCHANTS, merchantCacheTag(cleanId)],
    }
  )(cleanId);

const CACHED_MASTER_READERS = {
  offers: getCachedMasterProductOffers,
  priceHistory: getCachedMasterProductPriceHistory,
};

const _getCachedMerchantProfileByIdKey = cache(async (cleanId: string) => {
  const base = await _getCachedMerchantProfileBaseByKey(cleanId);
  return base
    ? _attachMerchantDiscountAnalysis(base, CACHED_MASTER_READERS)
    : null;
});

export function getCachedMerchantProfileById(merchantId: string) {
  const cleanId = sanitizeCachedEntityId(merchantId);
  if (!cleanId) return Promise.resolve(null);
  return _getCachedMerchantProfileByIdKey(cleanId);
}

export const getCachedRatePlatformStats = cache(async () => {
  const stats = await withRateDataCache(
    _getRatePlatformStats,
    ['rate-platform-stats'],
    {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.STATS],
    }
  )();
  // RATE_ITEM_MODEL on: "products tracked" counts Items (#1155).
  const itemCount = await getItemCount();
  return itemCount == null
    ? stats
    : { ...stats, masterProductsCount: itemCount };
});

/** Stored reviews kept out of the rating, per master id (DOS/Rate#1139). */
export const getCachedFilteredReviewCountsByMaster = cache(() =>
  withRateDataCache(
    _getFilteredReviewCountsByMaster,
    ['rate-filtered-review-counts-by-master'],
    {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.REVIEWS],
    }
  )()
);

// One Data Cache entry per normalized query for 2 minutes, so repeating a
// query does not rerun its reads (DOS/Rate#1307). The key is a hash: the
// query is up to 2 KB of caller text. A result too large for an entry (Next
// skips entries over 2 MB) is cached as a marker and read uncached.
const INSPECT_CACHE_MAX_BYTES = 1_500_000;
const _getCachedInspectionByKey = cache(async (query: string) => {
  const cached = await withRateDataCache(
    async (q: string) => {
      const result = await inspectProductOrShopUrlWithRadar(q);
      return JSON.stringify(result).length > INSPECT_CACHE_MAX_BYTES
        ? { tooLarge: true as const }
        : result;
    },
    [
      'rate-inspect',
      createHash('sha256').update(query).digest('hex').slice(0, 32),
    ],
    {
      revalidate: 120,
      tags: [
        RATE_CACHE_TAGS.PRODUCTS,
        RATE_CACHE_TAGS.OFFERS,
        RATE_CACHE_TAGS.REVIEWS,
        RATE_CACHE_TAGS.MERCHANTS,
      ],
    }
  )(query);
  return 'tooLarge' in cached
    ? inspectProductOrShopUrlWithRadar(query)
    : cached;
});

export function getCachedInspectProductOrShopUrl(rawQuery: string) {
  return _getCachedInspectionByKey(sanitizeCachedInspectQuery(rawQuery));
}

// A product URL only needs its category, so only category_slug is kept from
// metadata and specifications: whole spec sheets would push the entry past
// the Data Cache's 2 MB limit as the catalogue grows. The Data Cache stores
// JSON, so the category map travels as entries.
const SITEMAP_CACHE_WARN_BYTES = 1_500_000;

export const categorySlugOnly = (
  value: Record<string, unknown> | null | undefined
): { category_slug: string } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.category_slug !== 'string') return null;
  const slug = value.category_slug
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
  return isCanonicalCategorySlug(slug) ? { category_slug: slug } : null;
};

const _getCachedSitemapRowsData = withRateDataCache(
  async () => {
    const rows = await _getSitemapRows();
    const data = {
      products: rows.products.map((product) => ({
        ...product,
        metadata: categorySlugOnly(product.metadata),
        specifications: categorySlugOnly(product.specifications),
      })),
      merchants: rows.merchants,
      categories: [...rows.categorySlugById],
    };
    const bytes = JSON.stringify(data).length;
    if (bytes > SITEMAP_CACHE_WARN_BYTES) {
      log.warn('sitemap rows near the Data Cache entry limit', { bytes });
    }
    return data;
  },
  ['rate-sitemap-rows'],
  {
    revalidate: 3600,
    tags: [
      RATE_CACHE_TAGS.PRODUCTS,
      RATE_CACHE_TAGS.MERCHANTS,
      RATE_CACHE_TAGS.CATEGORIES,
    ],
  }
);

/**
 * Sitemap rows behind the tags the worker revalidates, so a new or removed
 * product reaches /sitemap.xml without a deploy (DOS/Rate#742).
 */
export const getCachedSitemapRows = cache(async (): Promise<SitemapRows> => {
  const rows = await _getCachedSitemapRowsData();
  // RATE_ITEM_MODEL on: one URL per Item, dated by its newest variant (#1155).
  const itemSlugs = await getItemSlugByVariantSlug();
  return {
    products: itemSlugs
      ? sitemapRowsByItem(rows.products, itemSlugs)
      : rows.products,
    merchants: rows.merchants,
    categorySlugById: new Map(rows.categories),
    itemSlugByVariantSlug: itemSlugs,
  };
});

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
  MAX_DEAL_RADAR_CLUSTERS,
  computeCrossPlatformDealRadarFromData,
  computeProductRadarSignal,
  getCrossPlatformDealRadar,
  normalizeDealRadarOptions,
  type CrossPlatformDealRadarItem,
  type CrossPlatformDealRadarResponse,
  type CrossPlatformPriceSpreadItem,
  type DealRadarVerdict,
} from './deals';

export { getItemCatalogPage, groupCatalogRowsByItem } from './item-directory';
export type { ItemCatalogRow } from '@/lib/item-directory';
