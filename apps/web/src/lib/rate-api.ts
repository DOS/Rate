import { createClient } from '@supabase/supabase-js';
import type { Database, MasterProduct } from '@repo/shared-data';
import { createLogger } from '@/lib/logger';
import { isPendingReview } from '@/lib/review-display';
import { listingReviewSummary } from '@/lib/analyzer-copy';
import { countBrandsByItem } from '@/lib/item-directory';
import {
  implausiblyLowOfferIds,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  type ReviewFlagCategory,
  type ReviewItem,
  toSafeNonNegativeVoteCount,
  evaluateReviewTrustAssessment,
  computeJReviewsWeight,
  MAX_VALID_VND_PRICE,
  type MerchantRiskBreakdown,
  type MerchantSummary,
  type RawMerchantSafeRow,
  getCategoryRouteHref,
  KNOWN_LOCAL_DEVICE_IMAGES,
  type CanonicalCategorySlug,
  isCanonicalCategorySlug,
  getMasterProductCategorySlug,
  type MerchantListFilterParams,
  extractPersistedBreakdown,
  storedRiskSplit,
  filterAndSortMerchants,
  sanitizePostgrestFilterToken,
  type ParsedEcommerceUrl,
  parseEcommerceUrlOrQuery,
  extractProductKeywordFromUrl,
  firstImageUrl,
} from './rate-domain-core';
import {
  isOfferUnavailable,
  type OfferAvailability,
  toOfferAvailability,
} from './product-market-stats';
export {
  computeWilsonLowerBound,
  evaluateReviewTrustAssessment,
  computeCombinedDualScore,
  detectStarDistributionAnomaly,
  computeJReviewsWeight,
  BAYESIAN_PRIOR_K,
  BAYESIAN_PRIOR_MEAN,
  computeBayesianRatingSummary,
  MAX_VALID_VND_PRICE,
  getCategoryRouteHref,
  KNOWN_LOCAL_DEVICE_IMAGES,
  resolveProductImageUrl,
  isCanonicalCategorySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  extractPersistedBreakdown,
  storedRiskSplit,
  filterAndSortMerchants,
  sanitizePostgrestFilterToken,
  parseEcommerceUrlOrQuery,
  stripEcommerceNoiseTokens,
  extractProductKeywordFromUrl,
} from './rate-domain-core';
export type {
  ReviewFlagCategory,
  ReviewAuthenticityAxis,
  ReviewIndependenceAxis,
  ReviewDepthAxis,
  ReviewWeightBreakdown,
  ReviewWeightExplanationKind,
  ReviewTrustAssessment,
  ReviewItem,
  CombinedDualScoreBlendMode,
  CombinedDualScoreResult,
  StarDistributionAnomalySummary,
  BayesianConfidenceTier,
  BayesianRatingSummary,
  MerchantRiskBreakdown,
  MerchantSummary,
  CanonicalCategorySlug,
  MerchantListFilterParams,
  ParsedEcommerceUrl,
} from './rate-domain-core';

const log = createLogger('rate-api');
export type { MasterProduct };

const createRateSchemaClient = (url: string, anonKey: string) =>
  createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  }).schema('rate');
type RateSchemaClient = ReturnType<typeof createRateSchemaClient>;
let _client: RateSchemaClient | null = null;

export function getRateClient(): RateSchemaClient {
  if (_client) {
    return _client;
  }
  // Fail hard on missing env (plan v7 §5.4): a silent fallback to the PROD
  // project makes preview verification read prod and look healthy.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'rate-api: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured; refusing to fall back to a hardcoded project'
    );
  }
  _client = createRateSchemaClient(supabaseUrl, supabaseAnonKey);
  return _client;
}

/** Tests only: drop the cached client so the next call reads the env again. */
export function resetRateClientForTests(): void {
  _client = null;
}

/**
 * PostgREST caps every response at the project's max-rows (1000 by default) and
 * silently drops the rest, so unbounded table reads must be paged. Pages advance by
 * the number of rows actually returned, which also works if max-rows is lowered.
 * A failed page throws RateDataUnavailableError: a partial list would otherwise
 * be cached as if it were complete (DOS/Rate#333).
 */
// Non-empty pages one paged read may take: a server (or test mock) that
// ignores .range() would otherwise loop until memory runs out (DOS/Rate#485).
// 500 x 1000 rows is far above any table this app reads in full.
const FETCH_ALL_MAX_PAGES = 500;

async function fetchAllRows<T>(
  label: string,
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  /** False for a speculative read whose caller logs a failure if it uses it. */
  logFailure = true
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0, pages = 0; ;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) {
      if (logFailure) {
        log.error('paged read failed', {
          table: label,
          row: from,
          message: error.message,
        });
      }
      throw new RateDataUnavailableError(label, error);
    }
    const page = data ?? [];
    if (page.length === 0) return rows;
    // Up to FETCH_ALL_MAX_PAGES non-empty pages; one more means no end.
    if (++pages > FETCH_ALL_MAX_PAGES) {
      const message = `exceeded ${FETCH_ALL_MAX_PAGES} pages at row ${from}`;
      log.error('paged read did not end', { table: label, row: from });
      throw new RateDataUnavailableError(label, { message });
    }
    rows.push(...page);
    from += page.length;
  }
}

export interface MerchantOffer {
  id: string;
  platform: string;
  title: string;
  price_current: number;
  price_original: number | null;
  stock: number;
  rating_star: number;
  rating_count: number;
  url: string;
  /**
   * rate.products.availability: a sold-out or discontinued listing keeps its
   * last price but is not counted in the master's stats (DOS/Rate#1141).
   * `null` when it was not read.
   */
  availability?: OfferAvailability | null;
  merchant: {
    id: string;
    name: string;
    platform: string;
    is_official: boolean;
    rating_star: number | null;
    follower_count: number;
    location: string | null;
    risk_score: number;
    /** `null` when no DOSafe or combined score is stored (#1099). */
    dosafe_risk_score: number | null;
    /** `null` only for an offer with no seller; else stored or baseline (#685). */
    review_risk_score: number | null;
    review_risk_breakdown: Record<string, unknown> | null;
  };
}

export interface ReviewAnalysisSummary {
  total_analyzed: number;
  authentic_pct: number;
  suspicious_pct: number;
  fake_pct: number;
  pros: string[];
  cons: string[];
  ai_summary: string | null;
}

export interface RateCategoryItem {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  display_order: number;
}

export interface MasterProductFilterParams {
  categorySlug?: string;
  brand?: string;
  brands?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  ramGb?: number[];
  storageGb?: number[];
  minBatteryMah?: number;
  minRefreshRateHz?: number;
  minFastChargingW?: number;
  has5g?: boolean;
  hasNfc?: boolean;
  maxScreenSizeInch?: number;
  sort?:
    | 'default'
    | 'price_asc'
    | 'price_desc'
    | 'rating_desc'
    | 'merchants_desc'
    | 'newest';
  limit?: number;
  /** Rows to skip, for paged catalogue pages. */
  offset?: number;
}

export interface CategoryDirectoryFacets {
  currentCategory: RateCategoryItem | null;
  categories: RateCategoryItem[];
  brands: { name: string; count: number }[];
  totalUnfiltered: number;
}

/**
 * Fetch categories and available brand facets for a given category slug
 */
export async function getCategoryDirectoryFacets(
  categorySlug: string = 'smartphones'
): Promise<CategoryDirectoryFacets> {
  const cleanCategorySlug =
    typeof categorySlug === 'string'
      ? categorySlug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
          .slice(0, 64)
      : 'smartphones';
  const supabase = getRateClient();

  const { data: catRows, error: catErr } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug, icon, display_order')
    .order('display_order', { ascending: true });

  if (catErr) {
    log.error('category directory lookup failed', {
      categorySlug: cleanCategorySlug,
      message: catErr.message,
    });
    throw new RateDataUnavailableError('categories', catErr);
  }

  const categories = (catRows as RateCategoryItem[]) || [];
  const currentCategory =
    categories.find((c) => c.slug === cleanCategorySlug) || null;

  if (!currentCategory) {
    return {
      currentCategory: null,
      categories,
      brands: [],
      totalUnfiltered: 0,
    };
  }

  const aggregateBrandFacets = (
    rawItems: { brand: string; count?: number }[]
  ): { name: string; count: number }[] => {
    const byLower = new Map<string, { name: string; count: number }>();
    for (const r of rawItems) {
      const trimmed = typeof r.brand === 'string' ? r.brand.trim() : '';
      if (!trimmed) continue;
      const delta = typeof r.count === 'number' ? Number(r.count) || 0 : 1;
      if (delta <= 0) continue;
      const lower = trimmed.toLowerCase();
      const existing = byLower.get(lower);
      if (existing) {
        existing.count += delta;
        if (
          existing.name === existing.name.toLowerCase() &&
          trimmed !== lower
        ) {
          existing.name = trimmed;
        }
      } else {
        byLower.set(lower, { name: trimmed, count: delta });
      }
    }
    return Array.from(byLower.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  };

  // Audit C1: Prefer server-side GROUP BY brand RPC `get_category_brand_facets`
  {
    const { data: facetRows, error: facetErr } = await supabase.rpc(
      'get_category_brand_facets',
      { p_category_id: currentCategory.id }
    );
    if (!facetErr && Array.isArray(facetRows)) {
      const brands = aggregateBrandFacets(
        facetRows as { brand: string; count: number }[]
      );
      const totalUnfiltered = brands.reduce((acc, b) => acc + b.count, 0);
      return {
        currentCategory,
        categories,
        brands,
        totalUnfiltered,
      };
    }
  }

  const { data: prodRows, error: prodErr } = await supabase
    .from('master_products')
    .select('brand, category_id')
    .eq('status', 'published')
    .eq('category_id', currentCategory.id)
    .limit(500);

  if (prodErr) {
    log.error('category brand facets fallback failed', {
      categorySlug,
      message: prodErr.message,
    });
    throw new RateDataUnavailableError('category brand facets', prodErr);
  }

  const rows =
    (prodRows as { brand: string; category_id: string | null }[]) || [];
  const brands = aggregateBrandFacets(rows);

  return {
    currentCategory,
    categories,
    brands,
    totalUnfiltered: rows.length,
  };
}

/**
 * Fetch list of master products with 10-Field-Groups multi-criteria filtering & sorting
 */
export async function getMasterProducts(
  params?: MasterProductFilterParams
): Promise<MasterProduct[]> {
  const supabase = getRateClient();
  let resolvedCategoryId: string | null = null;
  const cleanCategorySlug =
    typeof params?.categorySlug === 'string'
      ? params.categorySlug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
          .slice(0, 64)
      : '';

  if (cleanCategorySlug && cleanCategorySlug !== 'all') {
    const { data: catRow, error: catErr } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', cleanCategorySlug)
      .maybeSingle();

    if (catErr) {
      log.error('category slug lookup failed', {
        categorySlug: cleanCategorySlug,
        message: catErr.message,
      });
      throw new RateDataUnavailableError('category lookup', catErr);
    }

    if (!catRow?.id) {
      return [];
    }
    resolvedCategoryId = catRow.id;
  }

  const sanitizeBrandToken = (raw: unknown): string =>
    typeof raw === 'string'
      ? raw
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 80)
      : '';
  const cleanedMultiBrands = Array.isArray(params?.brands)
    ? params.brands.map(sanitizeBrandToken).filter(Boolean).slice(0, 50)
    : [];
  const cleanedSingleBrand = sanitizeBrandToken(params?.brand);
  const brandList =
    cleanedMultiBrands.length > 0
      ? cleanedMultiBrands
      : cleanedSingleBrand
        ? [cleanedSingleBrand]
        : null;
  const cleanSearch =
    typeof params?.search === 'string'
      ? params.search
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 120)
      : '';
  const boundedLimit =
    typeof params?.limit === 'number' &&
    Number.isFinite(params.limit) &&
    params.limit >= 1
      ? Math.min(Math.floor(params.limit), 500)
      : 200;
  const boundedOffset =
    typeof params?.offset === 'number' &&
    Number.isFinite(params.offset) &&
    params.offset > 0
      ? Math.min(Math.floor(params.offset), 100_000)
      : 0;

  const categoryHint: CanonicalCategorySlug | null = isCanonicalCategorySlug(
    cleanCategorySlug
  )
    ? cleanCategorySlug
    : null;

  // Audit C1: Prefer server-side SQL RPC `search_master_products` when deployed.
  // Every filter defaults to NULL in SQL, so an omitted (undefined) filter is
  // the same as passing null.
  {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      'search_master_products',
      {
        p_category_id: resolvedCategoryId ?? undefined,
        p_brands: brandList && brandList.length > 0 ? brandList : undefined,
        p_search: cleanSearch || undefined,
        p_min_price: params?.minPrice,
        p_max_price: params?.maxPrice,
        p_min_rating: params?.minRating,
        p_ram_gb:
          params?.ramGb && params.ramGb.length > 0 ? params.ramGb : undefined,
        p_storage_gb:
          params?.storageGb && params.storageGb.length > 0
            ? params.storageGb
            : undefined,
        p_min_battery_mah: params?.minBatteryMah,
        p_min_refresh_rate_hz: params?.minRefreshRateHz,
        p_min_fast_charging_w: params?.minFastChargingW,
        p_has_5g: params?.has5g,
        p_has_nfc: params?.hasNfc,
        p_max_screen_size_inch: params?.maxScreenSizeInch,
        p_sort: params?.sort || 'default',
        p_limit: boundedLimit,
        p_offset: boundedOffset,
      }
    );
    if (!rpcErr && Array.isArray(rpcRows)) {
      return (rpcRows as MasterProduct[]).map((r) =>
        normalizeMasterProductRow(r, categoryHint)
      );
    }
  }

  // Search, multi-brand case-insensitive matching, rating, and the JSONB spec
  // filters run in JS below. Applied after .range() they would empty or
  // under-fill a page, so with any of them the fallback reads every row the SQL
  // filters allow, then pages in JS (DOS/Rate#482, #510).
  const hasMultiBrands = cleanedMultiBrands.length > 0;
  const needsJsFilter = Boolean(
    hasMultiBrands ||
    cleanSearch.length > 0 ||
    (typeof params?.minRating === 'number' && params.minRating > 0) ||
    (typeof params?.minBatteryMah === 'number' && params.minBatteryMah > 0) ||
    (typeof params?.minRefreshRateHz === 'number' &&
      params.minRefreshRateHz > 0) ||
    (typeof params?.minFastChargingW === 'number' &&
      params.minFastChargingW > 0) ||
    params?.hasNfc === true ||
    (typeof params?.maxScreenSizeInch === 'number' &&
      params.maxScreenSizeInch > 0) ||
    params?.sort === 'rating_desc'
  );

  const safeSingleBrandIlike = sanitizePostgrestFilterToken(cleanedSingleBrand);
  const buildFallbackQuery = () => {
    let query = supabase
      .from('master_products')
      .select('*')
      .eq('status', 'published');

    if (resolvedCategoryId) {
      query = query.eq('category_id', resolvedCategoryId);
    }

    if (!hasMultiBrands && safeSingleBrandIlike) {
      query = query.ilike('brand', `%${safeSingleBrandIlike}%`);
    }

    if (typeof params?.minPrice === 'number' && params.minPrice > 0) {
      query = query.gte('min_price', params.minPrice);
    }

    if (typeof params?.maxPrice === 'number' && params.maxPrice > 0) {
      query = query.lte('min_price', params.maxPrice);
    }

    if (params?.ramGb && params.ramGb.length > 0) {
      query = query.in('ram_gb', params.ramGb);
    }

    if (params?.storageGb && params.storageGb.length > 0) {
      query = query.in('storage_gb', params.storageGb);
    }

    if (params?.has5g === true) {
      query = query.eq('has_5g', true);
    }

    // Server-side sort where directly supported by top-level columns
    switch (params?.sort) {
      case 'price_asc':
        query = query.order('min_price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('min_price', { ascending: false });
        break;
      case 'merchants_desc':
        query = query.order('merchant_count', { ascending: false });
        break;
      case 'rating_desc':
        // Unrated (NULL) models last, like search_master_products.
        query = query.order('user_rating_weighted', {
          ascending: false,
          nullsFirst: false,
        });
        break;
      case 'newest':
      case 'default':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }
    // Tiebreak so offset pages never overlap or skip rows.
    return query.order('id', { ascending: true });
  };

  let items: MasterProduct[];
  if (needsJsFilter) {
    items = (await fetchAllRows('master_products', (from, to) =>
      buildFallbackQuery().range(from, to)
    )) as unknown as MasterProduct[];
  } else {
    const { data, error } = await buildFallbackQuery().range(
      boundedOffset,
      boundedOffset + boundedLimit - 1
    );
    if (error) {
      log.error('master products fallback query failed', {
        categorySlug: params?.categorySlug || 'all',
        message: error.message,
      });
      throw new RateDataUnavailableError('master_products', error);
    }
    items = ((data as MasterProduct[]) || []).slice();
  }

  // Multi-brand case-insensitive filter
  if (hasMultiBrands) {
    const allowedBrands = new Set(
      cleanedMultiBrands.map((b) => b.toLowerCase())
    );
    items = items.filter((item) =>
      allowedBrands.has(
        (item.brand || '')
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      )
    );
  }

  // Keyword search across combined brand + name + model + chipset + key_specs (supports multi-token queries like "Apple iPhone 16 Pro Max")
  if (cleanSearch.length > 0) {
    const q = cleanSearch.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    items = items.filter((item) => {
      const combined = [
        item.brand,
        item.name,
        item.model,
        item.model_key,
        item.variant_name || '',
        item.key_specs?.chip || '',
        item.specifications?.hardware?.chipset || '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (combined.includes(q)) return true;
      return tokens.length > 0 && tokens.every((tok) => combined.includes(tok));
    });
  }

  const getEffectiveRating = (item: MasterProduct): number =>
    item.user_rating_weighted && Number(item.user_rating_weighted) > 0
      ? Number(item.user_rating_weighted)
      : item.expert_rating && Number(item.expert_rating) > 0
        ? Number(item.expert_rating)
        : Number(item.average_rating || 0);

  // Minimum effective rating filter (prefers JReviews weighted user rating -> expert rating -> average_rating)
  if (typeof params?.minRating === 'number' && params.minRating > 0) {
    const minRating = params.minRating;
    items = items.filter((item) => getEffectiveRating(item) >= minRating);
  }

  // Battery: capacity_mah >= minBatteryMah (top-level -> specifications.battery.capacity_mah -> key_specs.battery "<N> mAh")
  if (typeof params?.minBatteryMah === 'number' && params.minBatteryMah > 0) {
    const minMah = params.minBatteryMah;
    items = items.filter((item) => {
      const topMah = Number(item.battery_mah || 0);
      if (topMah >= minMah) return true;
      const specMah = Number(item.specifications?.battery?.capacity_mah || 0);
      if (specMah >= minMah) return true;
      const batteryText = item.key_specs?.battery || '';
      const mahMatch = batteryText.match(/(\d{3,5})\s*mah\b/i);
      return mahMatch ? Number(mahMatch[1]) >= minMah : false;
    });
  }

  // 10 Field Groups JSONB filters:
  // Display: refresh_rate_hz >= minRefreshRateHz
  if (
    typeof params?.minRefreshRateHz === 'number' &&
    params.minRefreshRateHz > 0
  ) {
    const minHz = params.minRefreshRateHz;
    items = items.filter((item) => {
      const hz = Number(item.specifications?.display?.refresh_rate_hz || 0);
      if (hz >= minHz) return true;
      const screenText = item.key_specs?.screen || '';
      const hzMatch = screenText.match(/(\d{2,4})\s*hz/i);
      return hzMatch ? Number(hzMatch[1]) >= minHz : false;
    });
  }

  // Battery: fast_charging_w >= minFastChargingW
  if (
    typeof params?.minFastChargingW === 'number' &&
    params.minFastChargingW > 0
  ) {
    const minW = params.minFastChargingW;
    items = items.filter((item) => {
      const w = Number(item.specifications?.battery?.fast_charging_w || 0);
      if (w >= minW) return true;
      const batteryText = item.key_specs?.battery || '';
      const wMatch = batteryText.match(/(\d{1,3})\s*w\b/i);
      return wMatch ? Number(wMatch[1]) >= minW : false;
    });
  }

  // Connectivity: nfc === true
  if (params?.hasNfc === true) {
    items = items.filter(
      (item) => item.specifications?.connectivity?.nfc === true
    );
  }

  // Display: compact screen <= maxScreenSizeInch (top-level -> specifications.display.size_inch -> key_specs.screen)
  if (
    typeof params?.maxScreenSizeInch === 'number' &&
    params.maxScreenSizeInch > 0
  ) {
    const maxInch = params.maxScreenSizeInch;
    items = items.filter((item) => {
      const topSize = Number(item.screen_size_inch || 0);
      const specSize = Number(item.specifications?.display?.size_inch || 0);
      let size = topSize > 0 ? topSize : specSize > 0 ? specSize : 0;
      if (size <= 0) {
        const screenText = item.key_specs?.screen || '';
        const inchMatch = screenText.match(
          /\b(\d{1,2}(?:[.,]\d)?)\s*(?:inch|in\b|")/i
        );
        if (inchMatch?.[1]) {
          size = Number(inchMatch[1].replace(',', '.'));
        }
      }
      return Number.isFinite(size) && size > 0 && size <= maxInch;
    });
  }

  // Sort by effective rating if requested
  if (params?.sort === 'rating_desc') {
    items.sort((a, b) => {
      const ratingDiff = getEffectiveRating(b) - getEffectiveRating(a);
      if (ratingDiff !== 0) return ratingDiff;
      const reviewsDiff =
        Number(b.total_reviews || 0) - Number(a.total_reviews || 0);
      if (reviewsDiff !== 0) return reviewsDiff;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  // The SQL path already returned one page; the JS-filtered path pages here.
  items = needsJsFilter
    ? items.slice(boundedOffset, boundedOffset + boundedLimit)
    : items.slice(0, boundedLimit);

  return items.map((r) => normalizeMasterProductRow(r, categoryHint));
}

/**
 * The database could not answer, as opposed to answering "no such row".
 * Detail lookups throw it so pages render the error boundary (5xx) instead of
 * notFound(), and unstable_cache never stores the failure.
 */
export class RateDataUnavailableError extends Error {
  constructor(what: string, cause: { message?: string } | null) {
    // "rate-api: failed to" is masked by sanitizePublicApiError (audit T9), so
    // the PostgREST detail reaches the logs but never an API response.
    super(
      `rate-api: failed to look up ${what}: ${cause?.message ?? 'unknown error'}`
    );
    this.name = 'RateDataUnavailableError';
  }
}

// Same shape the public API accepts (CANONICAL_PRODUCT_SLUG_REGEX). Anything
// else cannot be a product, and sending it would let PostgREST reject the
// query (NUL bytes, quotes in in.()), which would now surface as a 5xx.
const PRODUCT_SLUG_REGEX = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9._-]{1,120}$/;

const SENTINEL_RATE_API_TOKENS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'false',
  'true',
]);

function sanitizeRateEntityId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, 120);
  if (
    !cleaned ||
    SENTINEL_RATE_API_TOKENS.has(cleaned.toLowerCase()) ||
    !/[\p{L}\p{N}]/u.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function isStrictOfferOfficialFlag(raw: unknown): boolean {
  return (
    raw === true ||
    raw === 1 ||
    (typeof raw === 'string' && raw.trim().toLowerCase() === 'true')
  );
}

/**
 * Fetch a single master product by its slug. Null means no published product
 * has that slug; a database failure throws RateDataUnavailableError.
 */
export async function getMasterProductBySlug(
  slug: string
): Promise<MasterProduct | null> {
  const cleanSlug =
    typeof slug === 'string' ? slug.replace(/\p{Cc}+/gu, '').trim() : '';
  if (
    !PRODUCT_SLUG_REGEX.test(cleanSlug) ||
    cleanSlug.includes('..') ||
    SENTINEL_RATE_API_TOKENS.has(cleanSlug.toLowerCase())
  ) {
    return null;
  }
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .eq('slug', cleanSlug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    log.error('master product lookup failed', { slug, message: error.message });
    throw new RateDataUnavailableError('master product', error);
  }
  if (!data) {
    return null;
  }
  return normalizeMasterProductRow(data as MasterProduct);
}

interface RawTrustViewRow {
  id: string;
  cluster_id?: string | null;
  merchant_id: string;
  platform: string;
  title: string;
  price_current: number | string;
  price_original: number | string | null;
  stock: number;
  rating_star: number | string;
  rating_count: number;
  url: string;
  merchant_name?: string | null;
  merchant_is_official?: boolean | null;
  merchant_location?: string | null;
  threat_risk_score?: number | string | null;
  threat_source?: string | null;
  dosafe_risk_score?: number | string | null;
  review_risk_score?: number | string | null;
  review_risk_breakdown?: Record<string, unknown> | null;
}

/**
 * Normalize an offer's strikethrough `price_original` against `priceCurrent` and
 * the 1B VND sanity ceiling. Inverted (`< priceCurrent`), non-positive, or
 * astronomical (`> 1,000,000,000`) original prices are treated as `null`.
 */
export function normalizeOfferOriginalPrice(
  priceCurrent: number,
  rawOriginal: unknown
): number | null {
  if (typeof rawOriginal !== 'number' && typeof rawOriginal !== 'string') {
    return null;
  }
  if (typeof rawOriginal === 'string' && rawOriginal.trim() === '') {
    return null;
  }
  const orig = Math.round(Number(rawOriginal));
  const safeCurrent =
    typeof priceCurrent === 'number' && Number.isFinite(priceCurrent)
      ? Math.round(priceCurrent)
      : 0;
  if (
    !Number.isFinite(orig) ||
    orig <= 0 ||
    orig > MAX_VALID_VND_PRICE ||
    (safeCurrent > 0 && orig < safeCurrent)
  ) {
    return null;
  }
  return orig;
}

export interface RawMerchantRow {
  id?: string;
  name?: string;
  platform?: string;
  is_official?: boolean;
  rating_star?: number | string | null;
  follower_count?: number | null;
  location?: string | null;
  risk_score?: number | string | null;
  dosafe_risk_score?: number | string | null;
  review_risk_score?: number | string | null;
  review_risk_breakdown?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface RawOfferRow {
  id: string;
  cluster_id?: string | null;
  platform: string;
  title: string;
  price_current: number | string;
  price_original: number | string | null;
  stock: number;
  rating_star: number | string;
  rating_count: number;
  url: string;
  merchants?: RawMerchantRow | RawMerchantRow[] | null;
}

function toSafeRiskScore100(raw: unknown, fallback = 0): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return fallback;
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

/** A clamped 0-100 score, or `null` when the value is missing or not a number. */
function toOptionalRiskScore100(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : null;
}

function toSafeOfferPrice(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) return 0;
  return Math.round(num);
}

function toSafeStarRating5(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(5, num);
}

function sanitizeOfferString(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\p{Cc}+/gu, '').trim() : '';
}

function sanitizeOfferUrl(raw: unknown): string {
  const cleaned = sanitizeOfferString(raw);
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (
      parsed.username ||
      parsed.password ||
      !parsed.hostname ||
      parsed.hostname.startsWith('[') ||
      parsed.hostname.endsWith('.') ||
      parsed.hostname.includes('..') ||
      Boolean(parsed.port)
    ) {
      return '';
    }
    return cleaned;
  } catch {
    return '';
  }
}

/** True when the view row's seller has no review risk from the importer. */
function isUnscoredTrustViewRow(row: RawTrustViewRow): boolean {
  return !hasPersistedReviewRisk(
    toSafeRiskScore100(row.review_risk_score, 0),
    row.review_risk_breakdown
  );
}

/**
 * The view's DOSafe score, or null when it has none. The view reads 0 for a
 * seller with no threat_intel row and no synced merchants.risk_score (column
 * default 0): that is a missing score (#1099). threat_intel.source is NOT
 * NULL, so any string, even a blank one, marks a joined row (#1108).
 */
function trustViewDosafeRisk(row: RawTrustViewRow): number | null {
  const viewDosafeRisk = toOptionalRiskScore100(row.dosafe_risk_score);
  return viewDosafeRisk === 0 && typeof row.threat_source !== 'string'
    ? null
    : viewDosafeRisk;
}

/** What the view lacks for its sellers, read from rate.merchants. */
interface TrustViewSellerExtras {
  /** Unscored sellers only: the baseline needs it (#685). */
  followerCounts: Map<string, number>;
  /** merchants.metadata.dosafe_risk_score for sellers the view has none for. */
  metadataDosafeRisks: Map<string, number>;
}

/**
 * Follower counts for the unscored sellers among view rows (#685) and the
 * metadata DOSafe score for sellers with no view score (#1108). The view's
 * metadata column is the product's, so both come from rate.merchants.
 * Missing data leaves an entry out.
 */
async function sellerExtrasForTrustViewRows(
  rows: readonly RawTrustViewRow[]
): Promise<TrustViewSellerExtras> {
  const unscored = new Set<string>();
  const noDosafe = new Set<string>();
  for (const row of rows) {
    if (!row.merchant_id) continue;
    if (isUnscoredTrustViewRow(row)) unscored.add(row.merchant_id);
    if (trustViewDosafeRisk(row) === null) noDosafe.add(row.merchant_id);
  }
  const extras: TrustViewSellerExtras = {
    followerCounts: new Map(),
    metadataDosafeRisks: new Map(),
  };
  const ids = Array.from(new Set([...unscored, ...noDosafe]));
  if (ids.length === 0) return extras;
  try {
    const supabase = getRateClient();
    const read = async (chunk: string[], select: string) => {
      if (chunk.length === 0) return [];
      const { data, error } = await supabase
        .from('merchants')
        .select(select)
        .in('id', chunk);
      return error
        ? null
        : ((data ?? []) as unknown as Array<{
            id: string;
            follower_count: number | string | null;
            metadata_dosafe_risk_score?: unknown;
          }>);
    };
    let withMetadata = true;
    for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE);
      let rows = withMetadata
        ? await read(
            chunk,
            'id, follower_count, metadata_dosafe_risk_score:metadata->dosafe_risk_score'
          )
        : null;
      // A rejected metadata path must not cost unscored sellers their
      // follower adjustment (#685): fall back to the columns #685 read.
      if (!rows) {
        withMetadata = false;
        rows = await read(
          chunk.filter((id) => unscored.has(id)),
          'id, follower_count'
        );
      }
      if (!rows) return extras;
      for (const m of rows) {
        if (unscored.has(m.id)) {
          extras.followerCounts.set(m.id, Number(m.follower_count) || 0);
        }
        // Numbers only, as mapOfferRowToMerchantOffer reads metadata.
        const metaRisk =
          typeof m.metadata_dosafe_risk_score === 'number'
            ? toOptionalRiskScore100(m.metadata_dosafe_risk_score)
            : null;
        if (noDosafe.has(m.id) && metaRisk !== null) {
          extras.metadataDosafeRisks.set(m.id, metaRisk);
        }
      }
    }
  } catch {
    // Without them the baseline and a missing DOSafe score still render.
  }
  return extras;
}

/** The breakdown of a seller with no analysed review (DOS/Rate#1258). */
const NO_ANALYSED_REVIEWS_BREAKDOWN: Readonly<Record<string, number>> = {
  total_reviews: 0,
  authentic_count: 0,
  coin_spam_count: 0,
  seeding_fake_count: 0,
  sabotage_or_bombing_count: 0,
  suspicious_ratio_pct: 0,
};

export function mapTrustViewRowToMerchantOffer(
  row: RawTrustViewRow,
  followerCount?: number,
  metadataDosafeRisk?: number | null
): MerchantOffer {
  const safeRow =
    row && typeof row === 'object' && !Array.isArray(row)
      ? row
      : ({} as RawTrustViewRow);
  const combinedRisk = toSafeRiskScore100(safeRow.threat_risk_score, 0);
  // merchants.metadata only fills a missing view score, as on the fallback
  // path where metadata is read when no column score exists (#1108).
  const dosafeRisk =
    trustViewDosafeRisk(safeRow) ??
    (typeof metadataDosafeRisk === 'number'
      ? toOptionalRiskScore100(metadataDosafeRisk)
      : null);
  const persistedReviewRisk = toSafeRiskScore100(safeRow.review_risk_score, 0);
  const isOfficial = isStrictOfferOfficialFlag(safeRow.merchant_is_official);
  const hasSeller = sanitizeOfferString(safeRow.merchant_id) !== '';
  // The view reads 0 for a seller the importer never scored; use the same
  // baseline as the merchant pages (#685).
  // RS#708: the column is the combined risk; the review-only part counts
  // only with analysed reviews (DOS/Rate#1268).
  const riskSplit = storedRiskSplit(
    safeRow.review_risk_breakdown,
    undefined,
    safeRow.review_risk_score
  );
  const reviewRisk = riskSplit
    ? (riskSplit.reviewOnly ?? 0)
    : !isUnscoredTrustViewRow(safeRow)
      ? persistedReviewRisk
      : hasSeller
        ? baselineReviewRisk({
            isOfficial,
            platform: safeRow.platform,
            followerCount,
          })
        : null;
  const priceCurrent = toSafeOfferPrice(safeRow.price_current);
  const cleanPlatform = sanitizeOfferString(safeRow.platform).toLowerCase();
  const cleanLocation = sanitizeOfferString(safeRow.merchant_location);
  // A baseline seller carries a breakdown counting no review, so every
  // surface reads its score as "not enough data" (DOS/Rate#1258).
  const safeBreakdown =
    isUnscoredTrustViewRow(safeRow) && hasSeller
      ? { ...NO_ANALYSED_REVIEWS_BREAKDOWN }
      : safeRow.review_risk_breakdown &&
          typeof safeRow.review_risk_breakdown === 'object' &&
          !Array.isArray(safeRow.review_risk_breakdown)
        ? safeRow.review_risk_breakdown
        : null;
  return {
    id: sanitizeOfferString(safeRow.id),
    platform: cleanPlatform,
    title: sanitizeOfferString(safeRow.title),
    price_current: priceCurrent,
    price_original: normalizeOfferOriginalPrice(
      priceCurrent,
      safeRow.price_original
    ),
    stock: toSafeNonNegativeVoteCount(safeRow.stock, 100_000_000),
    rating_star: toSafeStarRating5(safeRow.rating_star),
    rating_count: toSafeNonNegativeVoteCount(safeRow.rating_count, 100_000_000),
    url: sanitizeOfferUrl(safeRow.url),
    merchant: {
      id: sanitizeOfferString(safeRow.merchant_id),
      name: sanitizeOfferString(safeRow.merchant_name) || 'Gian hàng',
      platform: cleanPlatform,
      is_official: isOfficial,
      rating_star: null,
      follower_count: toSafeNonNegativeVoteCount(followerCount, 100_000_000),
      location: cleanLocation || null,
      risk_score: riskSplit
        ? Math.max(combinedRisk, dosafeRisk ?? 0, riskSplit.combined)
        : Math.max(
            combinedRisk,
            dosafeRisk ?? 0,
            reviewRisk ?? baselineReviewRisk({ platform: safeRow.platform })
          ),
      dosafe_risk_score: dosafeRisk,
      review_risk_score: reviewRisk,
      review_risk_breakdown: safeBreakdown,
    },
  };
}

export function mapOfferRowToMerchantOffer(item: RawOfferRow): MerchantOffer {
  const safeItem =
    item && typeof item === 'object' && !Array.isArray(item)
      ? item
      : ({} as RawOfferRow);
  const rawMerchant = Array.isArray(safeItem.merchants)
    ? safeItem.merchants[0]
    : safeItem.merchants;
  const merchantObj =
    rawMerchant &&
    typeof rawMerchant === 'object' &&
    !Array.isArray(rawMerchant)
      ? rawMerchant
      : undefined;
  const meta =
    merchantObj?.metadata &&
    typeof merchantObj.metadata === 'object' &&
    !Array.isArray(merchantObj.metadata)
      ? merchantObj.metadata
      : null;
  const isOfficial = isStrictOfferOfficialFlag(merchantObj?.is_official);
  const baseRisk = toSafeRiskScore100(merchantObj?.risk_score, 0);
  // Column, then metadata, then a synced merchants.risk_score; the column
  // defaults to 0, so a bare 0 there is a missing DOSafe risk (#1099).
  const dosafeRisk =
    toOptionalRiskScore100(merchantObj?.dosafe_risk_score) ??
    (typeof meta?.dosafe_risk_score === 'number'
      ? toOptionalRiskScore100(meta.dosafe_risk_score)
      : null) ??
    (baseRisk > 0 ? baseRisk : null);
  // Without a stored score (column, then metadata) the seller gets the merchant
  // pages' baseline (#685). A never-scored column (0 / {}) is not a score.
  const columnReviewRisk = toSafeRiskScore100(
    merchantObj?.review_risk_score,
    0
  );
  // RS#708: the column is the combined risk; the review-only part counts
  // only with analysed reviews (DOS/Rate#1268).
  const riskSplit = storedRiskSplit(
    merchantObj?.review_risk_breakdown,
    meta,
    merchantObj?.review_risk_score
  );
  // An offer with no merchant row has no seller to give a baseline (#1099).
  const hasStoredScore =
    riskSplit != null ||
    (merchantObj?.review_risk_score != null &&
      hasPersistedReviewRisk(
        columnReviewRisk,
        merchantObj.review_risk_breakdown
      )) ||
    typeof meta?.review_risk_score === 'number';
  const reviewRisk = riskSplit
    ? (riskSplit.reviewOnly ?? 0)
    : merchantObj?.review_risk_score != null &&
        hasPersistedReviewRisk(
          columnReviewRisk,
          merchantObj.review_risk_breakdown
        )
      ? columnReviewRisk
      : typeof meta?.review_risk_score === 'number'
        ? toSafeRiskScore100(meta.review_risk_score, 0)
        : merchantObj
          ? baselineReviewRisk({
              isOfficial,
              platform: merchantObj.platform ?? safeItem.platform,
              followerCount: Number(merchantObj.follower_count) || 0,
            })
          : null;
  // The split's combined score when there is one; older metadata otherwise.
  const metaCombined = riskSplit
    ? riskSplit.combined
    : typeof meta?.combined_risk_score === 'number'
      ? toSafeRiskScore100(meta.combined_risk_score, 0)
      : 0;
  // An unknown seller is never safer than the baseline in trust and sorting.
  const combinedRisk = Math.max(
    baseRisk,
    dosafeRisk ?? 0,
    reviewRisk ?? baselineReviewRisk({ platform: safeItem.platform }),
    metaCombined
  );
  const topLevelBreakdown =
    merchantObj?.review_risk_breakdown &&
    typeof merchantObj.review_risk_breakdown === 'object' &&
    !Array.isArray(merchantObj.review_risk_breakdown) &&
    Object.keys(merchantObj.review_risk_breakdown).length > 0
      ? merchantObj.review_risk_breakdown
      : null;
  // A baseline seller carries a breakdown counting no review (#1258).
  const breakdown =
    merchantObj && !hasStoredScore
      ? { ...NO_ANALYSED_REVIEWS_BREAKDOWN }
      : (topLevelBreakdown ??
        (meta?.review_risk_breakdown &&
        typeof meta.review_risk_breakdown === 'object' &&
        !Array.isArray(meta.review_risk_breakdown) &&
        Object.keys(meta.review_risk_breakdown as Record<string, unknown>)
          .length > 0
          ? (meta.review_risk_breakdown as Record<string, unknown>)
          : meta &&
              ('review_risk_score' in meta || 'seeding_spam_ratio_pct' in meta)
            ? meta
            : null));
  const priceCurrent = toSafeOfferPrice(safeItem.price_current);
  const rawMerchantRating =
    typeof merchantObj?.rating_star === 'number' ||
    (typeof merchantObj?.rating_star === 'string' &&
      merchantObj.rating_star.trim() !== '')
      ? Number(merchantObj.rating_star)
      : null;
  const cleanItemPlatform = sanitizeOfferString(
    safeItem.platform
  ).toLowerCase();
  const cleanMerchantPlatform =
    sanitizeOfferString(merchantObj?.platform).toLowerCase() ||
    cleanItemPlatform;
  const cleanMerchantLocation = sanitizeOfferString(merchantObj?.location);
  return {
    id: sanitizeOfferString(safeItem.id),
    platform: cleanItemPlatform,
    title: sanitizeOfferString(safeItem.title),
    price_current: priceCurrent,
    price_original: normalizeOfferOriginalPrice(
      priceCurrent,
      safeItem.price_original
    ),
    stock: toSafeNonNegativeVoteCount(safeItem.stock, 100_000_000),
    rating_star: toSafeStarRating5(safeItem.rating_star),
    rating_count: toSafeNonNegativeVoteCount(
      safeItem.rating_count,
      100_000_000
    ),
    url: sanitizeOfferUrl(safeItem.url),
    merchant: {
      id: sanitizeOfferString(merchantObj?.id),
      name: sanitizeOfferString(merchantObj?.name) || 'Gian hàng',
      platform: cleanMerchantPlatform,
      is_official: isOfficial,
      rating_star:
        rawMerchantRating !== null &&
        Number.isFinite(rawMerchantRating) &&
        rawMerchantRating > 0
          ? Math.min(5, rawMerchantRating)
          : null,
      follower_count: toSafeNonNegativeVoteCount(
        merchantObj?.follower_count,
        100_000_000
      ),
      location: cleanMerchantLocation || null,
      risk_score: combinedRisk,
      dosafe_risk_score: dosafeRisk,
      review_risk_score: reviewRisk,
      review_risk_breakdown: breakdown,
    },
  };
}

/**
 * Columns mapTrustViewRowToMerchantOffer reads (RawTrustViewRow). Not '*': the
 * view also carries descriptions, images and metadata, and offer reads are
 * uncapped now that they page.
 */
const TRUST_VIEW_SELECT =
  'id, cluster_id, merchant_id, platform, title, price_current, price_original, stock, rating_star, rating_count, url, merchant_name, merchant_is_official, merchant_location, threat_risk_score, threat_source, dosafe_risk_score, review_risk_score, review_risk_breakdown';

/** Offer columns readable through rate.merchants' column-level grants. */
const OFFER_FALLBACK_SELECT = `
  id, cluster_id, platform, title, price_current, price_original, stock,
  rating_star, rating_count, url,
  merchants (
    id, name, platform, is_official, rating_star, follower_count, location,
    risk_score, review_risk_score, review_risk_breakdown, metadata
  )
`;

/**
 * Fetch all merchant listing offers for a master product.
 * Queries `rate.v_products_with_merchant_trust` (granted to anon/authenticated)
 * and falls back to explicit non-PII column selection on `rate.merchants`.
 */
export async function getMasterProductOffers(
  masterId: string
): Promise<MerchantOffer[]> {
  const cleanMasterId = sanitizeRateEntityId(masterId);
  if (!cleanMasterId) return [];
  const supabase = getRateClient();
  // Paged: one request stops at PostgREST max-rows (1000), so a product with
  // more listings would silently lose offers. id breaks price ties.
  const viewRows = await fetchAllRows(
    'v_products_with_merchant_trust',
    (from, to) =>
      supabase
        .from('v_products_with_merchant_trust')
        .select(TRUST_VIEW_SELECT)
        .eq('cluster_id', cleanMasterId)
        .order('price_current', { ascending: true })
        .order('id')
        .range(from, to)
  ).catch(() => null);
  if (viewRows) {
    const rows = viewRows as unknown as RawTrustViewRow[];
    const [extras, availability] = await Promise.all([
      sellerExtrasForTrustViewRows(rows),
      getListingAvailability([cleanMasterId]),
    ]);
    return rows.map((row) =>
      withOfferAvailability(
        mapTrustViewRowToMerchantOffer(
          row,
          extras.followerCounts.get(row.merchant_id),
          extras.metadataDosafeRisks.get(row.merchant_id)
        ),
        availability
      )
    );
  }

  // Fallback with explicit column list matching column-level SELECT grants on rate.merchants
  const [rows, availability] = await Promise.all([
    fetchAllRows('product offers', (from, to) =>
      supabase
        .from('products')
        .select(OFFER_FALLBACK_SELECT)
        .eq('cluster_id', cleanMasterId)
        .order('price_current', { ascending: true })
        .order('id')
        .range(from, to)
    ),
    getListingAvailability([cleanMasterId]),
  ]);
  return (rows as unknown as RawOfferRow[]).map((row) =>
    withOfferAvailability(mapOfferRowToMerchantOffer(row), availability)
  );
}

/**
 * Availability of every listing under the given masters (at most
 * IN_FILTER_CHUNK_SIZE), by listing id. The trust view predates the column
 * (DOS-Me 20261020230000), so it is read from rate.products. A failed read
 * throws like the offer reads it completes (DOS/Rate#1174).
 */
async function getListingAvailability(
  masterIds: readonly string[]
): Promise<Map<string, OfferAvailability>> {
  const supabase = getRateClient();
  const rows = await fetchAllRows<{ id: unknown; availability: unknown }>(
    'listing availability',
    (from, to) =>
      supabase
        .from('products')
        .select('id, availability')
        .in('cluster_id', [...masterIds])
        .order('id')
        .range(from, to) as unknown as PromiseLike<{
        data: { id: unknown; availability: unknown }[] | null;
        error: { message: string } | null;
      }>
  );
  const byId = new Map<string, OfferAvailability>();
  for (const row of rows) {
    const availability = toOfferAvailability(row?.availability);
    if (availability && typeof row?.id === 'string') {
      byId.set(row.id, availability);
    }
  }
  return byId;
}

function withOfferAvailability(
  offer: MerchantOffer,
  availability: ReadonlyMap<string, OfferAvailability>
): MerchantOffer {
  return { ...offer, availability: availability.get(offer.id) ?? null };
}

/**
 * Batch-fetch merchant listing offers for multiple master products in chunked `.in('cluster_id', ...)` queries.
 * Eliminates N+1 query storms in Cross-Platform Deal Radar and multi-product aggregations.
 */
export async function getMasterProductOffersBatch(
  masterIds: readonly string[]
): Promise<Map<string, MerchantOffer[]>> {
  if (!Array.isArray(masterIds) || masterIds.length === 0) {
    return new Map();
  }
  const uniqueIds = Array.from(
    new Set(masterIds.map(sanitizeRateEntityId).filter(Boolean))
  );
  const offersByMaster = new Map<string, MerchantOffer[]>(
    uniqueIds.map((id) => [id, []])
  );
  if (uniqueIds.length === 0) {
    return offersByMaster;
  }

  const supabase = getRateClient();
  const chunkSize = IN_FILTER_CHUNK_SIZE;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const batchIds = uniqueIds.slice(i, i + chunkSize);

    // Paged per chunk: 150 masters can easily hold more than 1000 offers.
    const [viewData, availability] = await Promise.all([
      fetchAllRows('v_products_with_merchant_trust', (from, to) =>
        supabase
          .from('v_products_with_merchant_trust')
          .select(TRUST_VIEW_SELECT)
          .in('cluster_id', batchIds)
          .order('price_current', { ascending: true })
          .order('id')
          .range(from, to)
      ).catch(() => null),
      getListingAvailability(batchIds),
    ]);

    if (viewData) {
      const rows = viewData as unknown as RawTrustViewRow[];
      const extras = await sellerExtrasForTrustViewRows(rows);
      for (const row of rows) {
        const cid = row.cluster_id ? String(row.cluster_id) : '';
        if (!cid) continue;
        const list = offersByMaster.get(cid) ?? [];
        list.push(
          withOfferAvailability(
            mapTrustViewRowToMerchantOffer(
              row,
              extras.followerCounts.get(row.merchant_id),
              extras.metadataDosafeRisks.get(row.merchant_id)
            ),
            availability
          )
        );
        offersByMaster.set(cid, list);
      }
      continue;
    }

    const data = await fetchAllRows('batch product offers', (from, to) =>
      supabase
        .from('products')
        .select(OFFER_FALLBACK_SELECT)
        .in('cluster_id', batchIds)
        .order('price_current', { ascending: true })
        .order('id')
        .range(from, to)
    );

    for (const item of data as unknown as RawOfferRow[]) {
      const cid = item.cluster_id ? String(item.cluster_id) : '';
      if (!cid) continue;
      const list = offersByMaster.get(cid) ?? [];
      list.push(
        withOfferAvailability(mapOfferRowToMerchantOffer(item), availability)
      );
      offersByMaster.set(cid, list);
    }
  }

  return offersByMaster;
}

interface RawReviewFlagRow {
  verdict?: 'authentic' | 'suspicious' | 'fake' | 'unanalyzed' | null;
  fake_probability?: number | string | null;
  flag_category?: ReviewFlagCategory | null;
  include_in_rating?: boolean | null;
  reason?: string | null;
  signals?: Record<string, unknown> | null;
}

interface RawReviewRow {
  id: string;
  author_name?: string | null;
  rating_star?: number | string | null;
  comment?: string | null;
  variation?: string | null;
  created_at: string;
  reviewer_type?: string | null;
  upvotes?: number | string | null;
  downvotes?: number | string | null;
  report_count?: number | string | null;
  helpfulness_weight?: number | string | null;
  criteria_ratings?: Record<string, number> | null;
  review_flags?: RawReviewFlagRow | RawReviewFlagRow[] | null;
}

/**
 * Ids of every listing clustered under a master product. Paged: a popular
 * model can have more than the 1000 rows one PostgREST response returns, and
 * a truncated list silently drops those listings' reviews and analyses.
 */
async function getListingIdsForMaster(
  masterId: string,
  label: string
): Promise<string[]> {
  const cleanMasterId = sanitizeRateEntityId(masterId);
  if (!cleanMasterId) return [];
  const supabase = getRateClient();
  const rows = await fetchAllRows<{ id: string }>(label, (from, to) =>
    supabase
      .from('products')
      .select('id')
      .eq('cluster_id', cleanMasterId)
      .order('id')
      .range(from, to)
  );
  return rows.map((row) => row.id);
}

export function resolveIncludeInRating(
  rawInclude: unknown,
  flagCategory: ReviewFlagCategory,
  verdict: string | null
): boolean {
  if (typeof rawInclude === 'boolean') return rawInclude;
  if (typeof rawInclude === 'number') return rawInclude === 1;
  if (typeof rawInclude === 'string') {
    const lower = rawInclude.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return flagCategory === 'authentic' && verdict !== 'fake';
}

/**
 * Fetch reviews across listings grouped under a master product,
 * including JReviews vote metrics and AI transparency flags.
 */
export async function getMasterProductReviews(
  masterId: string
): Promise<ReviewItem[]> {
  const productIds = await getListingIdsForMaster(
    masterId,
    `listings for master ${masterId}`
  );
  if (productIds.length === 0) return [];
  const supabase = getRateClient();

  const reviewRows = await readInChunks(
    productIds,
    `reviews for master ${masterId}`,
    (chunk) =>
      supabase
        .from('reviews')
        .select('*, review_flags(*)')
        .in('product_id', chunk)
        .order('created_at', { ascending: false })
        .limit(50)
  );

  const reviews = (reviewRows as unknown as RawReviewRow[])
    .sort(
      (a, b) =>
        (Date.parse(b.created_at ?? '') || 0) -
        (Date.parse(a.created_at ?? '') || 0)
    )
    .slice(0, 50);

  return reviews.map((r) => {
    const rawVf = Array.isArray(r.review_flags)
      ? r.review_flags[0]
      : r.review_flags;
    const vf =
      rawVf && typeof rawVf === 'object' && !Array.isArray(rawVf)
        ? rawVf
        : null;
    const verdict = vf?.verdict ?? null;
    const flagCategory: ReviewFlagCategory =
      vf?.flag_category ||
      (verdict === 'fake'
        ? 'seeding_fake'
        : verdict === 'suspicious'
          ? 'low_value_coin_spam'
          : 'authentic');
    const includeInRating = resolveIncludeInRating(
      vf?.include_in_rating,
      flagCategory,
      verdict
    );
    const upvotes = Number(r.upvotes ?? 0);
    const downvotes = Number(r.downvotes ?? 0);
    const reports = Number(r.report_count ?? 0);
    const computedWeight =
      r.helpfulness_weight != null
        ? Number(r.helpfulness_weight)
        : computeJReviewsWeight({
            upvotes,
            downvotes,
            reports,
            flagCategory,
            verdict,
            includeInRating,
          });

    const item: ReviewItem = {
      id: r.id,
      author_name: r.author_name || 'Khách hàng',
      rating_star: Number(r.rating_star || 5),
      comment: r.comment || '',
      variation: r.variation || null,
      created_at: r.created_at,
      reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
      upvotes,
      downvotes,
      report_count: reports,
      helpfulness_weight: includeInRating ? computedWeight : 0,
      include_in_rating: includeInRating,
      criteria_ratings: r.criteria_ratings || {},
      verdict,
      fake_probability:
        vf?.fake_probability != null ? Number(vf.fake_probability) : null,
      flag_category: flagCategory,
      reason: vf?.reason || null,
      signals: vf?.signals || null,
    };
    item.trust_assessment = evaluateReviewTrustAssessment(item);
    return item;
  });
}

interface RawReviewAnalysisRow {
  total_reviews_analyzed?: number | string | null;
  authenticity_score?: number | string | null;
  sentiment_positive_ratio?: number | string | null;
  ai_summary?: string | null;
  pros?: unknown;
  cons?: unknown;
}

/**
 * Fetch aggregated AI Review Analysis (Pros, Cons, AI Summary, Authenticity %)
 * across listings belonging to a master product.
 */
export async function getMasterProductReviewSummary(
  masterId: string,
  reviewsFallback: ReviewItem[] = []
): Promise<ReviewAnalysisSummary> {
  // Unanalyzed community reviews are neither authentic nor suspicious yet, so
  // they stay out of every percentage.
  const safeFallback = Array.isArray(reviewsFallback)
    ? reviewsFallback.filter((r): r is ReviewItem =>
        Boolean(r && typeof r === 'object' && !Array.isArray(r))
      )
    : [];
  const analyzedReviews = safeFallback.filter((r) => !isPendingReview(r));
  const totalFromReviews = analyzedReviews.length;
  const authenticFromReviews = analyzedReviews.filter(
    (r) => r.include_in_rating
  ).length;
  const fakeFromReviews = analyzedReviews.filter(
    (r) =>
      r.flag_category === 'seeding_fake' ||
      r.flag_category === 'competitor_sabotage' ||
      r.flag_category === 'review_bombing' ||
      r.verdict === 'fake'
  ).length;
  const suspiciousFromReviews = Math.max(
    0,
    totalFromReviews - authenticFromReviews - fakeFromReviews
  );

  const fallbackAuthenticPct =
    totalFromReviews > 0
      ? Math.round((authenticFromReviews / totalFromReviews) * 1000) / 10
      : 100;
  const fallbackSuspiciousPct =
    totalFromReviews > 0
      ? Math.round((suspiciousFromReviews / totalFromReviews) * 1000) / 10
      : 0;
  const fallbackFakePct =
    totalFromReviews > 0
      ? Math.round((fakeFromReviews / totalFromReviews) * 1000) / 10
      : 0;

  const productIds = await getListingIdsForMaster(
    masterId,
    `review summary listings for master ${masterId}`
  );
  if (productIds.length > 0) {
    const supabase = getRateClient();
    const analysisRows = await readInChunks(
      productIds,
      `review analysis for master ${masterId}`,
      (chunk) =>
        supabase
          .from('review_analysis')
          .select('*')
          .in('product_id', chunk)
          .order('analyzed_at', { ascending: false })
    );

    const analyses = (
      analysisRows as unknown as Array<
        RawReviewAnalysisRow & { analyzed_at?: string | null }
      >
    ).sort(
      (a, b) =>
        (Date.parse(b.analyzed_at ?? '') || 0) -
        (Date.parse(a.analyzed_at ?? '') || 0)
    );

    if (analyses.length > 0) {
      const typedAnalyses = analyses as unknown as RawReviewAnalysisRow[];
      const prosSet = new Set<string>();
      const consSet = new Set<string>();
      let totalAnalyzed = 0;
      let weightedAuthenticity = 0;
      let latestSummary: string | null = null;
      let summaryTaken = false;

      for (const row of typedAnalyses) {
        const count = Number(row.total_reviews_analyzed || 0);
        totalAnalyzed += count;
        weightedAuthenticity +=
          Number(row.authenticity_score ?? fallbackAuthenticPct) *
          Math.max(1, count);
        if (!summaryTaken && row.ai_summary) {
          // Says it covers one listing, old rows too (DOS/Rate#1225). Only the
          // latest row: a hidden one does not fall back to an older batch
          // (DOS/Rate#1244).
          summaryTaken = true;
          latestSummary = listingReviewSummary(String(row.ai_summary));
        }
        if (Array.isArray(row.pros)) {
          for (const p of row.pros) {
            if (typeof p === 'string' && p.trim()) prosSet.add(p.trim());
          }
        }
        if (Array.isArray(row.cons)) {
          for (const c of row.cons) {
            if (typeof c === 'string' && c.trim()) consSet.add(c.trim());
          }
        }
      }

      const denom = typedAnalyses.reduce(
        (acc, r) => acc + Math.max(1, Number(r.total_reviews_analyzed || 0)),
        0
      );
      const avgAuthScore =
        denom > 0
          ? Math.round((weightedAuthenticity / denom) * 10) / 10
          : fallbackAuthenticPct;

      return {
        total_analyzed: totalAnalyzed || totalFromReviews,
        authentic_pct:
          totalFromReviews > 0 ? fallbackAuthenticPct : avgAuthScore,
        suspicious_pct: totalFromReviews > 0 ? fallbackSuspiciousPct : 0,
        fake_pct:
          totalFromReviews > 0
            ? fallbackFakePct
            : Math.max(0, Math.round((100 - avgAuthScore) * 10) / 10),
        pros: Array.from(prosSet).slice(0, 6),
        cons: Array.from(consSet).slice(0, 6),
        ai_summary: latestSummary,
      };
    }
  }

  return {
    total_analyzed: totalFromReviews,
    authentic_pct: fallbackAuthenticPct,
    suspicious_pct: fallbackSuspiciousPct,
    fake_pct: fallbackFakePct,
    pros: [],
    cons: [],
    ai_summary: null,
  };
}

/**
 * Fetch comparison data for multiple master products while preserving the requested slug order.
 */
export async function compareMasterProducts(
  slugs: string[]
): Promise<MasterProduct[]> {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const uniqueSlugs = Array.from(
    new Set(
      slugs
        .map((s) =>
          typeof s === 'string' ? s.replace(/\p{Cc}+/gu, '').trim() : ''
        )
        .filter(
          (s) =>
            PRODUCT_SLUG_REGEX.test(s) &&
            !s.includes('..') &&
            !SENTINEL_RATE_API_TOKENS.has(s.toLowerCase())
        )
    )
  ).slice(0, 4);
  if (uniqueSlugs.length === 0) return [];

  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .in('slug', uniqueSlugs)
    .eq('status', 'published');

  if (error) {
    log.error('compare lookup failed', { message: error.message });
    throw new RateDataUnavailableError('compare', error);
  }
  if (!data) {
    return [];
  }
  const rows = (data as MasterProduct[]).map((row) =>
    normalizeMasterProductRow(row)
  );
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const ordered = uniqueSlugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is MasterProduct => Boolean(item));

  if (ordered.length <= 1) {
    return ordered;
  }

  // Enforce strict same-category comparison: lock to the first product's category
  const primaryCat = getMasterProductCategorySlug(ordered[0]!);
  return ordered.filter((p) => getMasterProductCategorySlug(p) === primaryCat);
}

export type DiscountVerdictType =
  'fake_discount' | 'suspicious_discount' | 'genuine_deal' | 'normal_price';

export interface PriceHistoryPoint {
  id: number;
  product_id: string;
  merchant_name: string;
  platform: string;
  is_official: boolean;
  price: number;
  price_original: number | null;
  recorded_at: string;
  source: string | null;
}

export interface OfferDiscountAnalysis {
  product_id: string;
  merchant_name: string;
  platform: string;
  price_current: number;
  price_original: number | null;
  claimed_discount_pct: number;
  real_discount_vs_median_pct: number;
  historical_min_price: number;
  historical_max_price: number;
  historical_median_price: number;
  observation_count: number;
  verdict: DiscountVerdictType;
  badge_label: string;
  explanation: string;
}

export interface MasterProductPriceHistorySummary {
  points: PriceHistoryPoint[];
  byOffer: Record<string, OfferDiscountAnalysis>;
  lowestEverPrice: number | null;
  lowestEverDate: string | null;
  lowestEverMerchant: string | null;
  highestEverPrice: number | null;
  currentMinPrice: number | null;
  fakeDiscountCount: number;
  genuineDealCount: number;
}

interface RawPriceHistoryRow {
  id: number | string;
  product_id: string;
  price: number | string;
  price_original?: number | string | null;
  recorded_at: string;
  source?: string | null;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/** fetchAllRows over `ids` in chunks, so no in() overflows the request line. */
async function fetchAllRowsInChunks<T>(
  label: string,
  ids: readonly string[],
  buildPage: (
    chunk: string[],
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE);
    rows.push(
      ...(await fetchAllRows(label, (from, to) => buildPage(chunk, from, to)))
    );
  }
  return rows;
}

/**
 * Fetch time-series price history across all merchant offers for a master product
 * and run Fake Discount Detection (nâng khống giá gốc / giảm giá ảo).
 */
export async function getMasterProductPriceHistory(
  masterId: string,
  existingOffers?: MerchantOffer[],
  /** false skips the all-time low/high reads, for callers using only byOffer. */
  options: { allTime?: boolean } = {}
): Promise<MasterProductPriceHistorySummary> {
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : {};
  const allTime = safeOptions.allTime ?? true;
  const cleanMasterId = sanitizeRateEntityId(masterId);
  // Bait-price listings far below every other store take no part: no chart
  // points, no market median, no current or all-time low, and no discount
  // verdict (DOS/Rate#797). The highest offer is never flagged, so a
  // non-empty list stays non-empty.
  const rawOffers = Array.isArray(existingOffers)
    ? existingOffers
    : cleanMasterId
      ? await getMasterProductOffers(cleanMasterId)
      : [];
  // Bait prices are judged among the in-stock listings, as the stored
  // min_price is; a sold-out listing keeps its chart (DOS/Rate#1141).
  const baitIds = implausiblyLowOfferIds(
    rawOffers.filter((o) => !isOfferUnavailable(o))
  );
  const offers = rawOffers.filter((o) => !baitIds.has(o.id));
  if (offers.length === 0) {
    return {
      points: [],
      byOffer: {},
      lowestEverPrice: null,
      lowestEverDate: null,
      lowestEverMerchant: null,
      highestEverPrice: null,
      currentMinPrice: null,
      fakeDiscountCount: 0,
      genuineDealCount: 0,
    };
  }

  const offerMap = new Map<string, MerchantOffer>();
  for (const off of offers) {
    offerMap.set(off.id, off);
  }

  const productIds = offers.map((o) => o.id);
  const supabase = getRateClient();
  let rawRows: unknown[];
  let extremeRows: unknown[];
  // The chart and per-offer analysis use the newest 1000 observations; the
  // all-time low and high must look at the whole history, or a low recorded
  // before that window is lost (DOS/Rate#464). One cheapest and one dearest
  // valid row per chunk.
  const extremes = (ascending: boolean) =>
    readInChunks(productIds, 'price history extremes', (chunk) =>
      supabase
        .from('price_history')
        .select('id, product_id, price, price_original, recorded_at, source')
        .in('product_id', chunk)
        .gt('price', 0)
        .lte('price', MAX_VALID_VND_PRICE)
        .order('price', { ascending })
        .order('recorded_at', { ascending: true })
        .limit(1)
    );
  try {
    const [windowRows, lowRows, highRows] = await Promise.all([
      readInChunks(productIds, 'price history', (chunk) =>
        supabase
          .from('price_history')
          .select('id, product_id, price, price_original, recorded_at, source')
          .in('product_id', chunk)
          .order('recorded_at', { ascending: false })
          .limit(1000)
      ),
      allTime ? extremes(true) : Promise.resolve([]),
      allTime ? extremes(false) : Promise.resolve([]),
    ]);
    rawRows = windowRows;
    extremeRows = [...lowRows, ...highRows];
  } catch (err) {
    log.error('price_history fetch failed', {
      masterId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const cappedNewestRows = (rawRows as unknown as RawPriceHistoryRow[])
    .sort(
      (a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    )
    .slice(0, 1000);
  const chronologicalRows = [...cappedNewestRows].reverse();

  const points: PriceHistoryPoint[] = [];
  const pricesByOffer = new Map<string, number[]>();
  const origPricesByOffer = new Map<string, number[]>();

  for (const row of chronologicalRows) {
    const off = offerMap.get(row.product_id);
    if (!off) continue;
    const price = Number(row.price || 0);
    if (!Number.isFinite(price) || price <= 0 || price > MAX_VALID_VND_PRICE) {
      continue;
    }
    const priceOriginal = normalizeOfferOriginalPrice(
      price,
      row.price_original
    );

    points.push({
      id: Number(row.id),
      product_id: row.product_id,
      merchant_name: off.merchant.name,
      platform: off.platform,
      is_official: off.merchant.is_official,
      price,
      price_original: priceOriginal,
      recorded_at: row.recorded_at,
      source: row.source || null,
    });

    const list = pricesByOffer.get(row.product_id) ?? [];
    list.push(price);
    pricesByOffer.set(row.product_id, list);

    if (priceOriginal) {
      const origList = origPricesByOffer.get(row.product_id) ?? [];
      origList.push(priceOriginal);
      origPricesByOffer.set(row.product_id, origList);
    }
  }

  // Ensure every active offer with a valid VND price has at least its current price represented
  const nowIso = new Date().toISOString();
  for (const off of offers) {
    if (
      !Number.isFinite(off.price_current) ||
      off.price_current <= 0 ||
      off.price_current > MAX_VALID_VND_PRICE
    ) {
      continue;
    }
    const existingList = pricesByOffer.get(off.id);
    if (!existingList || existingList.length === 0) {
      const normalizedOrig = normalizeOfferOriginalPrice(
        off.price_current,
        off.price_original
      );
      pricesByOffer.set(off.id, [off.price_current]);
      points.push({
        id: -1 * (points.length + 1),
        product_id: off.id,
        merchant_name: off.merchant.name,
        platform: off.platform,
        is_official: off.merchant.is_official,
        price: off.price_current,
        price_original: normalizedOrig,
        recorded_at: nowIso,
        source: 'live_listing',
      });
    }
  }

  // Sort all points chronologically
  points.sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  // Market median across all current offers with valid VND prices
  const validOfferPrices = offers
    .map((o) => o.price_current)
    .filter((p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE);
  const marketMedianPrice = computeMedian(validOfferPrices);

  const byOffer: Record<string, OfferDiscountAnalysis> = {};
  let fakeDiscountCount = 0;
  let genuineDealCount = 0;

  for (const off of offers) {
    const validCurrentPrice =
      Number.isFinite(off.price_current) &&
      off.price_current > 0 &&
      off.price_current <= MAX_VALID_VND_PRICE;
    if (!validCurrentPrice) continue;

    const histPrices = pricesByOffer.get(off.id) ?? [off.price_current];
    const lastHistPrice = histPrices[histPrices.length - 1];
    const rawSamples =
      lastHistPrice === off.price_current
        ? histPrices
        : [...histPrices, off.price_current];
    const allSamples = rawSamples.filter(
      (p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE
    );
    if (allSamples.length === 0) continue;

    const histMin = Math.min(...allSamples);
    const histMax = Math.max(...allSamples);
    const histMedian = computeMedian(allSamples);
    const referenceBasePrice =
      histPrices.length >= 2
        ? histMedian
        : Math.max(histMedian, marketMedianPrice);

    const priceCurrent = off.price_current;
    const normalizedOrig = normalizeOfferOriginalPrice(
      priceCurrent,
      off.price_original
    );
    const priceOriginal =
      normalizedOrig && normalizedOrig > priceCurrent ? normalizedOrig : null;

    const claimedDiscountPct = priceOriginal
      ? Math.round(((priceOriginal - priceCurrent) / priceOriginal) * 1000) / 10
      : 0;

    const realDiscountVsMedianPct =
      referenceBasePrice > 0
        ? Math.round(
            ((referenceBasePrice - priceCurrent) / referenceBasePrice) * 1000
          ) / 10
        : 0;

    let verdict: DiscountVerdictType = 'normal_price';
    let badgeLabel = 'Giá ổn định';
    let explanation = `Giá bán hiện tại (${priceCurrent.toLocaleString('vi-VN')} ₫) khớp với mức trung vị lịch sử (${histMedian.toLocaleString('vi-VN')} ₫).`;

    if (priceOriginal && claimedDiscountPct >= 5) {
      // Case 1: Shop claims >= 8% discount, but current price is at or above historical median
      // AND original price was inflated above historical max actual selling price
      if (
        priceCurrent >= referenceBasePrice * 0.98 &&
        (priceOriginal > histMax * 1.05 ||
          claimedDiscountPct - realDiscountVsMedianPct >= 10)
      ) {
        verdict = 'fake_discount';
        badgeLabel = 'Cảnh báo giảm giá ảo';
        explanation = `Gian hàng niêm yết giá gạch ngang ${priceOriginal.toLocaleString('vi-VN')} ₫ (-${claimedDiscountPct}%), nhưng giá bán thực tế lịch sử chưa từng vượt ${histMax.toLocaleString('vi-VN')} ₫ (trung vị: ${histMedian.toLocaleString('vi-VN')} ₫).`;
        fakeDiscountCount += 1;
      } else if (claimedDiscountPct - realDiscountVsMedianPct >= 6) {
        verdict = 'suspicious_discount';
        badgeLabel = 'Nghi nâng giá gốc';
        explanation = `Mức giảm công bố (-${claimedDiscountPct}%) cao hơn đáng kể so với mức giảm thực tế (-${Math.max(0, realDiscountVsMedianPct)}%) khi đối chiếu lịch sử giá (${histMedian.toLocaleString('vi-VN')} ₫).`;
        fakeDiscountCount += 1;
      } else if (realDiscountVsMedianPct >= 3 || priceCurrent <= histMin) {
        verdict = 'genuine_deal';
        badgeLabel = 'Giảm giá thật';
        explanation = `Giá hiện tại thấp hơn ${Math.max(realDiscountVsMedianPct, claimedDiscountPct)}% so với mức trung vị lịch sử (${histMedian.toLocaleString('vi-VN')} ₫).`;
        genuineDealCount += 1;
      }
    } else if (
      realDiscountVsMedianPct >= 3 ||
      (histPrices.length >= 2 && priceCurrent <= histMin && histMin < histMax)
    ) {
      verdict = 'genuine_deal';
      badgeLabel = 'Đáy giá lịch sử';
      explanation = `Đang ở vùng giá thấp nhất ghi nhận được (${priceCurrent.toLocaleString('vi-VN')} ₫ so với đỉnh ${histMax.toLocaleString('vi-VN')} ₫).`;
      genuineDealCount += 1;
    }

    byOffer[off.id] = {
      product_id: off.id,
      merchant_name: off.merchant.name,
      platform: off.platform,
      price_current: priceCurrent,
      price_original: priceOriginal,
      claimed_discount_pct: claimedDiscountPct,
      real_discount_vs_median_pct: realDiscountVsMedianPct,
      historical_min_price: histMin,
      historical_max_price: histMax,
      historical_median_price: histMedian,
      observation_count: histPrices.length,
      verdict,
      badge_label: badgeLabel,
      explanation,
    };
  }

  let lowestPoint: Pick<
    PriceHistoryPoint,
    'price' | 'recorded_at' | 'merchant_name'
  > | null = null;
  let highestEverPrice: number | null = null;

  const allTimeCandidates = [
    ...points,
    ...(extremeRows as unknown as RawPriceHistoryRow[]).flatMap((row) => {
      const off = offerMap.get(row.product_id);
      const price = Number(row.price || 0);
      return off &&
        Number.isFinite(price) &&
        price > 0 &&
        price <= MAX_VALID_VND_PRICE
        ? [
            {
              price,
              recorded_at: row.recorded_at,
              merchant_name: off.merchant.name,
            },
          ]
        : [];
    }),
  ];
  for (const pt of allTimeCandidates) {
    // On equal prices keep the first time it was seen.
    if (
      !lowestPoint ||
      pt.price < lowestPoint.price ||
      (pt.price === lowestPoint.price &&
        Date.parse(pt.recorded_at) < Date.parse(lowestPoint.recorded_at))
    ) {
      lowestPoint = pt;
    }
    if (highestEverPrice === null || pt.price > highestEverPrice) {
      highestEverPrice = pt.price;
    }
  }

  // The lowest in-stock price, like the stored min_price: a sold-out listing
  // keeps its last price (DOS/Rate#1141). Unknown availability counts.
  const inStockOfferPrices = offers
    .filter((o) => !isOfferUnavailable(o))
    .map((o) => o.price_current)
    .filter((p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE);
  const currentMinPrice =
    inStockOfferPrices.length > 0 ? Math.min(...inStockOfferPrices) : null;

  return {
    points,
    byOffer,
    lowestEverPrice: lowestPoint ? lowestPoint.price : currentMinPrice,
    lowestEverDate: lowestPoint ? lowestPoint.recorded_at : null,
    lowestEverMerchant: lowestPoint ? lowestPoint.merchant_name : null,
    highestEverPrice,
    currentMinPrice,
    fakeDiscountCount,
    genuineDealCount,
  };
}

export interface MerchantProductListing {
  id: string;
  platform: string;
  platform_item_id: string;
  title: string;
  price_current: number;
  price_original: number | null;
  stock: number;
  historical_sold: number;
  /** Marketplace label (e.g. "20k+") when historical_sold is only its floor. */
  historical_sold_display: string | null;
  rating_star: number;
  rating_count: number;
  url: string;
  image: string | null;
  /** As the retailer last reported it; null when unknown (counts as in stock). */
  availability: OfferAvailability | null;
  master_product: {
    id: string;
    slug: string;
    name: string;
    brand: string;
    category_slug: string;
    market_min_price: number;
    market_max_price: number;
    merchant_count: number;
  } | null;
  discount_analysis: OfferDiscountAnalysis | null;
}

export interface MerchantProfileDetail extends MerchantSummary {
  listings: MerchantProductListing[];
  recent_reviews: Array<
    ReviewItem & {
      product_id: string;
      product_title: string;
      master_slug: string | null;
      master_category_slug: string | null;
    }
  >;
}

export interface RatePlatformStats {
  masterProductsCount: number;
  listingsCount: number;
  merchantsCount: number;
  priceObservationsCount: number;
  totalReviewsCount: number;
  authenticReviewsCount: number;
  filteredSeedingCount: number;
  authenticRatioPct: number;
  categoriesWithCounts: Array<
    RateCategoryItem & {
      productCount: number;
      routeHref: string;
    }
  >;
  recentReviewsSample: Array<
    ReviewItem & {
      productTitle: string;
      masterSlug: string | null;
      masterRouteHref?: string | null;
    }
  >;
}

interface RawProductRow {
  id: string;
  merchant_id: string;
  platform: string;
  platform_item_id: string;
  title: string;
  price_current: number | string;
  price_original?: number | string | null;
  stock?: number | null;
  historical_sold?: number | null;
  historical_sold_display?: string | null;
  rating_star?: number | string | null;
  rating_count?: number | null;
  images?: string[] | null;
  url: string;
  cluster_id?: string | null;
  availability?: string | null;
}

export function normalizeMasterProductRow(
  row: MasterProduct,
  categorySlugHint?: CanonicalCategorySlug | null
): MasterProduct {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const cleanSlug =
    typeof row.slug === 'string'
      ? row.slug.replace(/\p{Cc}+/gu, '').trim()
      : '';
  if (
    !cleanSlug ||
    !PRODUCT_SLUG_REGEX.test(cleanSlug) ||
    cleanSlug.includes('..') ||
    SENTINEL_RATE_API_TOKENS.has(cleanSlug.toLowerCase())
  ) {
    return row;
  }
  let normalized = cleanSlug === row.slug ? row : { ...row, slug: cleanSlug };
  if (KNOWN_LOCAL_DEVICE_IMAGES.has(cleanSlug)) {
    const localImg = `/img/devices/${cleanSlug}.jpg`;
    normalized = {
      ...normalized,
      thumbnail: localImg,
      images: [localImg],
    };
  }
  const specCatSlug =
    normalized.specifications &&
    typeof normalized.specifications === 'object' &&
    !Array.isArray(normalized.specifications)
      ? (normalized.specifications as { category_slug?: unknown }).category_slug
      : undefined;
  const validHint = isCanonicalCategorySlug(categorySlugHint)
    ? categorySlugHint
    : null;
  const effectiveCatHint: CanonicalCategorySlug | null =
    validHint ?? (isCanonicalCategorySlug(specCatSlug) ? specCatSlug : null);

  const existingMetaObj =
    normalized.metadata &&
    typeof normalized.metadata === 'object' &&
    !Array.isArray(normalized.metadata)
      ? normalized.metadata
      : null;

  if (effectiveCatHint && typeof existingMetaObj?.category_slug !== 'string') {
    normalized = {
      ...normalized,
      metadata: {
        ...(existingMetaObj ?? {}),
        category_slug: effectiveCatHint,
      },
    };
  }
  return normalized;
}

export interface SitemapRows {
  products: Array<{
    slug: string;
    name: string | null;
    model: string | null;
    category_id: string | null;
    metadata: Record<string, unknown> | null;
    specifications?: Record<string, unknown> | null;
    updated_at: string | null;
  }>;
  merchants: Array<{ id: string; updated_at: string | null }>;
  categorySlugById: Map<string, string>;
}

/**
 * Every published product and every merchant, with only the columns their
 * sitemap URLs need. Paged: the sitemap must list the whole catalogue, not the
 * first page of a ranked list (DOS/Rate#460).
 */
export async function getSitemapRows(): Promise<SitemapRows> {
  const supabase = getRateClient();
  const [productRows, merchants, catsRes] = await Promise.all([
    fetchAllRows('sitemap products', (from, to) =>
      supabase
        .from('master_products')
        .select(
          'slug, name, model, category_id, metadata, specifications, updated_at'
        )
        .eq('status', 'published')
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<SitemapRows['merchants'][number]>(
      'sitemap merchants',
      (from, to) =>
        supabase
          .from('merchants')
          .select('id, updated_at')
          .order('id')
          .range(from, to)
    ),
    supabase.from('categories').select('id, slug'),
  ]);
  if (catsRes.error) {
    throw new RateDataUnavailableError('sitemap categories', catsRes.error);
  }
  const categorySlugById = new Map<string, string>();
  for (const c of (catsRes.data || []) as Array<{ id: string; slug: string }>) {
    categorySlugById.set(c.id, c.slug);
  }
  const products = productRows.map((row) => ({
    ...row,
    metadata:
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    specifications:
      row.specifications &&
      typeof row.specifications === 'object' &&
      !Array.isArray(row.specifications)
        ? (row.specifications as Record<string, unknown>)
        : null,
  }));
  return { products, merchants, categorySlugById };
}

// Text a platform fills in from the star rating itself, as in the importer's
// isRatingOnlyComment (apps/importer/src/shopee/ai-review-analyzer.ts).
const RATING_ONLY_LABEL_RE =
  /^(?:(?:cực\s*k[ìỳ]|rất)\s+)?(?:không\s+)?hài\s+lòng$|^bình\s+thường$/i;

function isRatingOnlyText(comment: string | null | undefined): boolean {
  const text = (comment || '')
    .normalize('NFC')
    .replace(/[\s.!,]+$/u, '')
    .trim();
  return text.length === 0 || RATING_ONLY_LABEL_RE.test(text);
}

export interface DynamicReviewRiskMerchant {
  isOfficial?: boolean | null;
  platform?: string | null;
  followerCount?: number | null;
}

/** The importer's seller adjustments: official -15, free channels +10, 50k+ followers -5. */
function merchantRiskAdjustment(merchant: DynamicReviewRiskMerchant): number {
  if (!merchant || typeof merchant !== 'object' || Array.isArray(merchant))
    return 0;
  let delta = 0;
  const cleanPlatform =
    typeof merchant.platform === 'string'
      ? merchant.platform.trim().toLowerCase()
      : '';
  if (isStrictOfferOfficialFlag(merchant.isOfficial)) delta -= 15;
  else if (cleanPlatform === 'facebook' || cleanPlatform === 'website')
    delta += 10;
  const followers = toSafeNonNegativeVoteCount(
    merchant.followerCount,
    100_000_000
  );
  if (followers >= 50000) delta -= 5;
  return delta;
}

/**
 * The importer's review risk for a seller with no review signal: baseline 15
 * plus the seller adjustments. Offer cards use it for sellers without a
 * persisted score, so they match the merchant pages (DOS/Rate#685).
 */
export function baselineReviewRisk(
  merchant: DynamicReviewRiskMerchant
): number {
  return Math.max(0, Math.min(100, 15 + merchantRiskAdjustment(merchant)));
}

/** A persisted review risk exists once the importer wrote a score or breakdown. */
/**
 * The importer's stored review risk for a merchant row: the column when the
 * importer wrote it (score or breakdown), else the metadata fallback, else 0.
 * The column defaults to 0 / {}, so a bare 0 there is no score (#684).
 */
export function persistedReviewRiskOf(row: {
  review_risk_score?: number | string | null;
  review_risk_breakdown?: unknown;
  metadata?: unknown;
}): number {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 0;
  // RS#708: the column is the combined risk, not the review-only part.
  const split = storedRiskSplit(row.review_risk_breakdown, row.metadata);
  if (split) return split.reviewOnly ?? 0;
  const column = toSafeRiskScore100(row.review_risk_score, 0);
  if (
    row.review_risk_score != null &&
    hasPersistedReviewRisk(column, row.review_risk_breakdown)
  )
    return column;
  const meta =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return typeof meta.review_risk_score === 'number' &&
    Number.isFinite(meta.review_risk_score)
    ? toSafeRiskScore100(meta.review_risk_score, 0)
    : 0;
}

/**
 * True when the importer stored a review risk for the merchant row: a scored
 * column (score or breakdown) or the metadata fallback. Pages then show that
 * score instead of one computed from the reviews they read (#684).
 */
export function hasStoredReviewRisk(row: {
  review_risk_score?: number | string | null;
  review_risk_breakdown?: unknown;
  metadata?: unknown;
}): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (storedRiskSplit(row.review_risk_breakdown, row.metadata)) return true;
  if (
    row.review_risk_score != null &&
    hasPersistedReviewRisk(
      toSafeRiskScore100(row.review_risk_score, 0),
      row.review_risk_breakdown
    )
  )
    return true;
  const meta =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return (
    typeof meta.review_risk_score === 'number' &&
    Number.isFinite(meta.review_risk_score) &&
    meta.review_risk_score >= 0
  );
}

function hasPersistedReviewRisk(score: number, breakdown: unknown): boolean {
  return (
    score > 0 ||
    (!!breakdown &&
      typeof breakdown === 'object' &&
      !Array.isArray(breakdown) &&
      Object.keys(breakdown).length > 0)
  );
}

/**
 * Review risk from the reviews the page has, with the importer's formula
 * (`evaluateMerchantRisk` in apps/importer/src/shopee/ai-review-analyzer.ts)
 * so both agree (DOS/Rate#671): baseline 15, seeding up to +45, genuine 1-2
 * star complaints up to +25, official store -15, free channels +10, 50k+
 * followers -5. The price-anomaly term needs canonical prices and stays in the
 * importer; pages show max(dynamic, persisted).
 */
export function computeDynamicReviewRisk(
  allReviews: ReviewItem[],
  merchant: DynamicReviewRiskMerchant = {}
): {
  reviewRiskScore: number;
  breakdown: MerchantRiskBreakdown;
} {
  // Unanalyzed community reviews carry no risk signal yet.
  const safeReviews = Array.isArray(allReviews)
    ? allReviews.filter((r): r is ReviewItem =>
        Boolean(r && typeof r === 'object' && !Array.isArray(r))
      )
    : [];
  const reviews = safeReviews.filter((r) => !isPendingReview(r));
  const total = reviews.length;

  let authentic = 0;
  let coinSpam = 0;
  let seedingFake = 0;
  let sabotageOrBombing = 0;

  for (const r of reviews) {
    // The importer stores verdict 'fake' for sabotage and bombing too, so the
    // category decides first; verdict only fills in a missing category.
    if (
      r.flag_category === 'competitor_sabotage' ||
      r.flag_category === 'review_bombing'
    ) {
      sabotageOrBombing += 1;
    } else if (r.flag_category === 'seeding_fake' || r.verdict === 'fake') {
      seedingFake += 1;
    } else if (
      r.flag_category === 'low_value_coin_spam' ||
      !r.include_in_rating
    ) {
      coinSpam += 1;
    } else {
      authentic += 1;
    }
  }

  const flaggedTotal = coinSpam + seedingFake + sabotageOrBombing;
  const suspiciousRatioPct =
    total > 0 ? Math.round((flaggedTotal / total) * 1000) / 10 : 0;

  // Coin-farming comments, sabotage and review bombing are filtered out but
  // add no risk (DOS/Rate#645, #654).
  const divisor = Math.max(1, total);
  let risk = 15;
  const seedingRatio = Number((seedingFake / divisor).toFixed(3));
  // Same seeding term as the importer: seedingRiskPenalty in @repo/shared-data,
  // copied here so this client-bundled module does not pull in that package's
  // runtime; core-rate-architecture.test.ts checks the two agree (#671).
  if (seedingRatio > 0) risk += Math.min(45, Math.round(seedingRatio * 75));
  // Genuine complaints; a star-only low rating counts at a quarter.
  let lowStar = 0;
  for (const r of reviews) {
    const star =
      typeof r.rating_star === 'number' ||
      (typeof r.rating_star === 'string' && String(r.rating_star).trim() !== '')
        ? Number(r.rating_star)
        : NaN;
    if (
      Number.isFinite(star) &&
      star > 0 &&
      star <= 2 &&
      r.flag_category === 'authentic' &&
      // A 'fake' verdict already counted as seeding above (#691).
      r.verdict !== 'fake' &&
      r.include_in_rating
    ) {
      lowStar += isRatingOnlyText(r.comment) ? 0.25 : 1;
    }
  }
  const lowStarRatio = lowStar / divisor;
  if (lowStarRatio >= 0.2) risk += Math.min(25, Math.round(lowStarRatio * 45));
  risk += merchantRiskAdjustment(merchant);
  const reviewRiskScore = Math.max(0, Math.min(100, risk));

  return {
    reviewRiskScore,
    breakdown: {
      total_reviews: total,
      authentic_count: authentic,
      coin_spam_count: coinSpam,
      seeding_fake_count: seedingFake,
      sabotage_or_bombing_count: sabotageOrBombing,
      suspicious_ratio_pct: suspiciousRatioPct,
    },
  };
}

/**
 * Fetch all tracked merchants with computed Dual Risk Scores (DOSafe + AI Review Risk)
 * and active listing statistics. Uses explicit non-PII column selection.
 */
export async function getMerchantsList(
  params?: MerchantListFilterParams
): Promise<MerchantSummary[]> {
  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : undefined;

  const sanitizedIds = Array.isArray(safeParams?.ids)
    ? Array.from(
        new Set(
          safeParams.ids.map((id) => sanitizeRateEntityId(id)).filter(Boolean)
        )
      )
    : undefined;
  const sanitizedPlatformShopIds = Array.isArray(safeParams?.platformShopIds)
    ? Array.from(
        new Set(
          safeParams.platformShopIds
            .map((id) => sanitizeRateEntityId(id))
            .filter(Boolean)
        )
      )
    : undefined;
  if (
    (sanitizedIds !== undefined && sanitizedIds.length === 0) ||
    (sanitizedPlatformShopIds !== undefined &&
      sanitizedPlatformShopIds.length === 0)
  ) {
    return [];
  }
  const supabase = getRateClient();
  const cleanPlatform =
    typeof safeParams?.platform === 'string'
      ? safeParams.platform
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
          .slice(0, 64)
      : '';
  const cleanNameContains =
    typeof safeParams?.nameContains === 'string'
      ? safeParams.nameContains
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 200)
          .replace(/[\\%_]/g, (c) => `\\${c}`)
          .replace(/\*/g, '')
      : '';

  const merchantsQuery = () => {
    let q = supabase
      .from('merchants')
      .select(
        'id, platform, platform_shop_id, name, slug, url, is_official, rating_star, follower_count, location, risk_score, review_risk_score, review_risk_breakdown, metadata, updated_at'
      )
      .order('is_official', { ascending: false })
      .order('follower_count', { ascending: false })
      // Tiebreak so pages never overlap or skip rows.
      .order('id');
    if (cleanPlatform && cleanPlatform !== 'all') {
      q = q.eq('platform', cleanPlatform);
    }
    if (isStrictOfferOfficialFlag(safeParams?.officialOnly)) {
      q = q.eq('is_official', true);
    }
    if (sanitizedIds) q = q.in('id', sanitizedIds);
    if (sanitizedPlatformShopIds) {
      q = q.in('platform_shop_id', sanitizedPlatformShopIds);
    }
    if (cleanNameContains) {
      q = q.ilike('name', `%${cleanNameContains}%`);
    }
    return q;
  };
  const hasPostQueryFilterOrSort = Boolean(
    (typeof safeParams?.q === 'string' && safeParams.q.trim()) ||
    (typeof safeParams?.minTrust === 'number' &&
      !Number.isNaN(safeParams.minTrust)) ||
    safeParams?.sort
  );
  const directLimit =
    !hasPostQueryFilterOrSort &&
    typeof safeParams?.limit === 'number' &&
    Number.isFinite(safeParams.limit) &&
    safeParams.limit >= 1
      ? Math.min(Math.floor(safeParams.limit), 5000)
      : null;

  // Every merchant unless only the top `limit` is needed: one request is
  // silently capped at PostgREST max-rows (1000 on Supabase), so page it.
  let merchantRows: unknown[];
  if (directLimit) {
    const { data, error } = await merchantsQuery().range(0, directLimit - 1);
    if (error) throw new RateDataUnavailableError('merchants', error);
    merchantRows = data ?? [];
  } else {
    merchantRows = await fetchAllRows('merchants', (from, to) =>
      merchantsQuery().range(from, to)
    );
  }
  // Pages are not one snapshot: a row that moves between reads can repeat.
  const merchants = [
    ...new Map(
      (merchantRows as unknown as RawMerchantSafeRow[]).map((m) => [m.id, m])
    ).values(),
  ];
  if (merchants.length === 0) return [];

  const merchantIds = merchants.map((m) => m.id);
  const prodRows = await fetchAllRowsInChunks(
    'products',
    merchantIds,
    (chunk, from, to) =>
      supabase
        .from('products')
        .select('id, merchant_id, price_current, availability')
        .in('merchant_id', chunk)
        .order('id')
        .range(from, to)
  );

  const products =
    (prodRows as Array<{
      id: string;
      merchant_id: string;
      price_current: number | string;
      availability?: unknown;
    }>) || [];

  const prodToMerchant = new Map<string, string>();
  const prodsByMerchant = new Map<string, number[]>();
  // The price range is what the store sells now: sold-out listings keep
  // their last price but count only as listings (DOS/Rate#1248).
  const livePricesByMerchant = new Map<string, number[]>();
  const productIdsByMerchant = new Map<string, string[]>();

  for (const p of products) {
    prodToMerchant.set(p.id, p.merchant_id);
    const list = prodsByMerchant.get(p.merchant_id) ?? [];
    const price = Number(p.price_current || 0);
    if (Number.isFinite(price) && price > 0 && price <= MAX_VALID_VND_PRICE) {
      list.push(price);
      if (
        !isOfferUnavailable({
          availability: toOfferAvailability(p.availability),
        })
      ) {
        const live = livePricesByMerchant.get(p.merchant_id) ?? [];
        live.push(price);
        livePricesByMerchant.set(p.merchant_id, live);
      }
    }
    prodsByMerchant.set(p.merchant_id, list);

    const idList = productIdsByMerchant.get(p.merchant_id) ?? [];
    idList.push(p.id);
    productIdsByMerchant.set(p.merchant_id, idList);
  }

  // Reviews are read for every store without a persisted breakdown, also
  // one with a stored score: the breakdown says whether reviews were
  // analysed, as on the profile, which reads them too (DOS/Rate#1258).
  const unscoredProductIds: string[] = [];
  for (const m of merchants) {
    if (!extractPersistedBreakdown(m)) {
      const mProdIds = productIdsByMerchant.get(m.id);
      if (mProdIds && mProdIds.length > 0) {
        unscoredProductIds.push(...mProdIds);
      }
    }
  }

  const mappedReviewsByMerchant = new Map<string, ReviewItem[]>();
  if (unscoredProductIds.length > 0) {
    const reviewRows = await fetchAllRowsInChunks(
      'reviews',
      unscoredProductIds,
      (chunk, from, to) =>
        supabase
          .from('reviews')
          .select(
            // rating_star and comment feed the complaint term (#671).
            'id, product_id, rating_star, comment, review_flags(verdict, flag_category, include_in_rating)'
          )
          .in('product_id', chunk)
          .order('id')
          .range(from, to)
    );

    for (const r of (reviewRows as unknown as Array<
      RawReviewRow & { product_id: string }
    >) || []) {
      const mId = prodToMerchant.get(r.product_id);
      if (!mId) continue;
      const rawVf = Array.isArray(r.review_flags)
        ? r.review_flags[0]
        : r.review_flags;
      const vf =
        rawVf && typeof rawVf === 'object' && !Array.isArray(rawVf)
          ? rawVf
          : null;
      const verdict = vf?.verdict ?? null;
      const flagCategory: ReviewFlagCategory =
        vf?.flag_category ||
        (verdict === 'fake'
          ? 'seeding_fake'
          : verdict === 'suspicious'
            ? 'low_value_coin_spam'
            : 'authentic');
      const includeInRating = resolveIncludeInRating(
        vf?.include_in_rating,
        flagCategory,
        verdict
      );
      const upvotes = Number(r.upvotes ?? 0);
      const downvotes = Number(r.downvotes ?? 0);
      const reports = Number(r.report_count ?? 0);

      const item: ReviewItem = {
        id: r.id,
        author_name: r.author_name || 'Khách hàng',
        rating_star: Number(r.rating_star || 5),
        comment: r.comment || '',
        variation: r.variation || null,
        created_at: r.created_at,
        reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
        upvotes,
        downvotes,
        report_count: reports,
        helpfulness_weight: includeInRating
          ? Number(r.helpfulness_weight ?? 1)
          : 0,
        include_in_rating: includeInRating,
        criteria_ratings: r.criteria_ratings || {},
        verdict,
        fake_probability:
          vf?.fake_probability != null ? Number(vf.fake_probability) : null,
        flag_category: flagCategory,
        reason: vf?.reason || null,
        signals: vf?.signals || null,
      };

      const existing = mappedReviewsByMerchant.get(mId) ?? [];
      existing.push(item);
      mappedReviewsByMerchant.set(mId, existing);
    }
  }

  const results: MerchantSummary[] = merchants.map((m) => {
    const prices = prodsByMerchant.get(m.id) ?? [];
    const livePrices = livePricesByMerchant.get(m.id) ?? [];
    const persistedBreakdown = extractPersistedBreakdown(m);
    const mReviews = mappedReviewsByMerchant.get(m.id) ?? [];
    const dynamicRisk = persistedBreakdown
      ? null
      : computeDynamicReviewRisk(mReviews, {
          isOfficial: isStrictOfferOfficialFlag(m.is_official),
          platform: m.platform,
          followerCount: Number(m.follower_count) || 0,
        });
    const meta = (
      m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
        ? m.metadata
        : {}
    ) as Record<string, unknown>;
    const baseRisk = toSafeRiskScore100(m.risk_score, 0);
    const dosafeRisk =
      typeof meta.dosafe_risk_score === 'number' &&
      Number.isFinite(meta.dosafe_risk_score)
        ? toSafeRiskScore100(meta.dosafe_risk_score, 0)
        : baseRisk;
    const persistedReviewRisk = persistedReviewRiskOf(m);
    // A stored score covers all of the seller's reviews: it wins over the
    // one computed here, as on the profile (#684).
    const effectiveReviewRisk =
      persistedBreakdown || hasStoredReviewRisk(m)
        ? persistedReviewRisk
        : Math.max(dynamicRisk?.reviewRiskScore ?? 0, persistedReviewRisk);
    const breakdown = persistedBreakdown ??
      dynamicRisk?.breakdown ?? {
        total_reviews: 0,
        authentic_count: 0,
        coin_spam_count: 0,
        seeding_fake_count: 0,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 0,
      };
    // The split's combined score when there is one; older metadata otherwise.
    const metaCombined =
      storedRiskSplit(m.review_risk_breakdown, m.metadata, m.review_risk_score)
        ?.combined ??
      (typeof meta.combined_risk_score === 'number' &&
      Number.isFinite(meta.combined_risk_score)
        ? toSafeRiskScore100(meta.combined_risk_score, 0)
        : 0);
    const combinedRisk = Math.min(
      100,
      Math.max(baseRisk, dosafeRisk, effectiveReviewRisk, metaCombined)
    );
    const trustScore = Math.max(0, 100 - combinedRisk);

    return {
      id: m.id,
      platform: m.platform,
      platform_shop_id: m.platform_shop_id,
      name: m.name,
      slug: m.slug || null,
      url:
        sanitizeOfferUrl(m.url) ||
        (m.platform === 'shopee' && m.platform_shop_id
          ? `https://shopee.vn/shop/${m.platform_shop_id}`
          : null),
      is_official: isStrictOfferOfficialFlag(m.is_official),
      rating_star:
        m.rating_star != null ? toSafeStarRating5(m.rating_star) : null,
      follower_count: toSafeNonNegativeVoteCount(m.follower_count, 100_000_000),
      location: m.location || null,
      dosafe_risk_score: dosafeRisk,
      review_risk_score: effectiveReviewRisk,
      risk_score: combinedRisk,
      trust_score: trustScore,
      product_count: prices.length,
      min_price: livePrices.length > 0 ? Math.min(...livePrices) : null,
      max_price: livePrices.length > 0 ? Math.max(...livePrices) : null,
      review_risk_breakdown: breakdown,
      updated_at: m.updated_at || m.created_at || null,
    };
  });

  return filterAndSortMerchants(results, safeParams);
}

// Ids per in.() filter: a merchant can list hundreds of products, and one
// in.() with all of them overflows the gateway's request-line limit (#290).
const IN_FILTER_CHUNK_SIZE = 150;

// Parallel price-history reads per merchant profile. Each one is a paged
// offers read plus chunked price_history reads, so a large store listing
// hundreds of models must not open them all at once (DOS/Rate#462).
const PRICE_HISTORY_CONCURRENCY = 6;

/** Runs `task` over `items` with at most `limit` in flight; rejects on the first failure. */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0 || typeof task !== 'function')
    return;
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.min(50, Math.floor(limit))
      : 1;
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++] as T;
      try {
        await task(item);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, worker)
  );
}

/** Runs `read` per chunk of `ids` and concatenates the rows; any error throws. */
async function readInChunks(
  ids: readonly string[],
  what: string,
  read: (chunk: string[]) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const { data, error } = await read(ids.slice(i, i + IN_FILTER_CHUNK_SIZE));
    if (error) throw new RateDataUnavailableError(what, error);
    rows.push(...(data ?? []));
  }
  return rows;
}

/**
 * Per-master readers for a merchant profile's discount analysis. The server
 * layer passes the cached readers the product pages use (DOS/Rate#1217).
 */
export interface MerchantProfileMasterReaders {
  offers: (masterId: string) => Promise<MerchantOffer[]>;
  priceHistory: (
    masterId: string,
    offers: MerchantOffer[]
  ) => Promise<MasterProductPriceHistorySummary>;
}

const UNCACHED_MASTER_READERS: MerchantProfileMasterReaders = {
  offers: (masterId) => getMasterProductOffers(masterId),
  // Only byOffer is used here: skip the all-time low/high reads.
  priceHistory: (masterId, offers) =>
    getMasterProductPriceHistory(masterId, offers, { allTime: false }),
};

/**
 * A merchant profile without its listings' discount analysis, plus the master
 * each listing belongs to (published or not), so the analysis can be added
 * after the profile leaves the Data Cache.
 */
export interface MerchantProfileBase {
  profile: MerchantProfileDetail;
  listingMasterIds: Record<string, string>;
}

/**
 * Fetch detailed profile for a single Merchant by UUID id, slug, or platform_shop_id,
 * including all listings with Fake Discount verdicts and buyer reviews with AI flags.
 */
export async function getMerchantProfileById(
  idOrSlug: string
): Promise<MerchantProfileDetail | null> {
  const base = await getMerchantProfileBase(idOrSlug);
  return base
    ? attachMerchantDiscountAnalysis(base, UNCACHED_MASTER_READERS)
    : null;
}

/**
 * Adds each listing's discount analysis, read per master through `readers`.
 * Runs outside the profile's own cache entry: a nested unstable_cache skips
 * the cache read, so the product pages' warm entries are reachable only from
 * here (DOS/Rate#1217). A failed read throws, never a profile without its
 * analysis (DOS/Rate#329).
 */
export async function attachMerchantDiscountAnalysis(
  base: MerchantProfileBase,
  readers: MerchantProfileMasterReaders
): Promise<MerchantProfileDetail> {
  const masterIds = Array.from(new Set(Object.values(base.listingMasterIds)));
  const discountByOfferId = new Map<string, OfferDiscountAnalysis>();
  await forEachWithConcurrency(
    masterIds,
    PRICE_HISTORY_CONCURRENCY,
    async (masterId) => {
      const offers = await readers.offers(masterId);
      const ph = await readers.priceHistory(masterId, offers);
      for (const [offerId, analysis] of Object.entries(ph.byOffer)) {
        discountByOfferId.set(offerId, analysis);
      }
    }
  );
  // A listing with a verdict shows the price the verdict was computed on: the
  // profile entry and the price-history entry expire apart, and an old price
  // next to a verdict quoting the new one would contradict itself
  // (DOS/Rate#1240). A verdict's price is always a valid one. Stock, rating
  // and title stay as the profile read them.
  const listings = base.profile.listings
    .map((listing) => {
      // A sold-out listing's last price is no deal and no historical low
      // (DOS/Rate#1248): it gets no verdict.
      const analysis = isOfferUnavailable(listing)
        ? null
        : discountByOfferId.get(listing.id) || null;
      return {
        ...listing,
        ...(analysis
          ? {
              price_current: analysis.price_current,
              price_original: analysis.price_original,
            }
          : {}),
        discount_analysis: analysis,
      };
    })
    // Stable: equal prices keep the profile's id order. Sold-out last.
    .sort(
      (a, b) =>
        Number(isOfferUnavailable(a)) - Number(isOfferUnavailable(b)) ||
        a.price_current - b.price_current
    );
  const prices = listings
    .filter((l) => !isOfferUnavailable(l))
    .map((l) => l.price_current)
    .filter((p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE);
  return {
    ...base.profile,
    min_price: prices.length > 0 ? Math.min(...prices) : null,
    max_price: prices.length > 0 ? Math.max(...prices) : null,
    listings,
  };
}

/** The merchant profile without discount analysis; see MerchantProfileBase. */
export async function getMerchantProfileBase(
  idOrSlug: string
): Promise<MerchantProfileBase | null> {
  const cleaned = sanitizeRateEntityId(idOrSlug);
  if (!cleaned || cleaned.includes('..')) return null;

  const supabase = getRateClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleaned
    );

  const selectCols =
    'id, platform, platform_shop_id, name, slug, url, is_official, rating_star, follower_count, location, risk_score, review_risk_score, review_risk_breakdown, metadata, created_at, updated_at';

  // Secondary reads throw too: a profile with silently empty listings or
  // reviews would otherwise be cached as if it were true (DOS/Rate#329).
  // Paged: retailers can list more than PostgREST's 1000-row cap.
  const readListings = (merchantId: string, logFailure = true) =>
    fetchAllRows(
      'merchant listings',
      (from, to) =>
        supabase
          .from('products')
          .select(
            'id, merchant_id, platform, platform_item_id, title, price_current, price_original, stock, historical_sold, historical_sold_display, rating_star, rating_count, images, url, cluster_id, availability'
          )
          .eq('merchant_id', merchantId)
          .order('price_current', { ascending: true })
          .order('id')
          .range(from, to),
      undefined,
      logFailure
    );

  let merchantRow: RawMerchantSafeRow | null = null;
  // A UUID is almost always the merchant's own id: read its listings while
  // the merchant row loads instead of after it, one round trip fewer on a
  // cold render (DOS/Rate#1217). Used only when the id matches.
  let listingsByUuid: Promise<unknown[]> | null = null;

  if (isUuid) {
    // Unlogged: a UUID that is no merchant id discards this read, failed or
    // not (DOS/Rate#1240). A failure is logged below if the read is used.
    listingsByUuid = readListings(cleaned, false);
    // Settled here so a failure is never unhandled while the merchant loads;
    // it is rethrown below when these listings are used.
    listingsByUuid.catch(() => undefined);
    const { data, error } = await supabase
      .from('merchants')
      .select(selectCols)
      .eq('id', cleaned)
      .maybeSingle();
    if (error) throw new RateDataUnavailableError('merchant', error);
    merchantRow = (data as unknown as RawMerchantSafeRow) || null;
  }

  if (!merchantRow) {
    const safeToken = sanitizePostgrestFilterToken(cleaned);
    if (!safeToken) {
      return null;
    }
    const { data, error } = await supabase
      .from('merchants')
      .select(selectCols)
      .or(`slug.eq.${safeToken},platform_shop_id.eq.${safeToken}`)
      .limit(1)
      .maybeSingle();
    if (error) throw new RateDataUnavailableError('merchant', error);
    merchantRow = (data as unknown as RawMerchantSafeRow) || null;
  }

  if (!merchantRow) {
    return null;
  }

  const merchantId = merchantRow.id;
  const prodRows =
    listingsByUuid && merchantId.toLowerCase() === cleaned.toLowerCase()
      ? await listingsByUuid.catch((err: unknown) => {
          log.error('paged read failed', {
            table: 'merchant listings',
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        })
      : await readListings(merchantId);

  const rawProducts = prodRows as unknown as RawProductRow[];
  const clusterIds = Array.from(
    new Set(rawProducts.map((p) => p.cluster_id).filter(Boolean))
  ) as string[];
  const productIds = rawProducts.map((p) => p.id);

  const [masterRows, catsRes, reviewRows] = await Promise.all([
    // Published only: the product page serves no other status, so a draft
    // master would be linked to a 404 (DOS/Rate#769). Its listings show as
    // unclustered.
    readInChunks(clusterIds, 'merchant profile', (chunk) =>
      supabase
        .from('master_products')
        .select(
          'id, slug, name, model, brand, category_id, metadata, specifications, min_price, max_price, merchant_count'
        )
        .in('id', chunk)
        .eq('status', 'published')
    ),
    supabase.from('categories').select('id, slug'),
    readInChunks(productIds, 'merchant profile', (chunk) =>
      supabase
        .from('reviews')
        .select('*, review_flags(*)')
        .in('product_id', chunk)
        .order('created_at', { ascending: false })
        .limit(60)
    ),
  ]);
  if (catsRes.error) {
    throw new RateDataUnavailableError('merchant profile', catsRes.error);
  }
  const masterRes = { data: masterRows };
  // Each chunk returns its newest 60; keep the newest 60 overall.
  const reviewsRes = {
    data: (reviewRows as Array<{ created_at?: string | null }>)
      .sort(
        (a, b) =>
          (Date.parse(b.created_at ?? '') || 0) -
          (Date.parse(a.created_at ?? '') || 0)
      )
      .slice(0, 60),
  };

  const catSlugById = new Map<string, string>();
  for (const c of (catsRes.data || []) as Array<{ id: string; slug: string }>) {
    catSlugById.set(c.id, c.slug);
  }

  const masterById = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      brand: string;
      category_slug: string;
      market_min_price: number;
      market_max_price: number;
      merchant_count: number;
    }
  >();

  for (const m of (masterRes.data || []) as Array<{
    id: string;
    slug: string;
    name: string;
    model?: string | null;
    brand: string;
    category_id: string | null;
    metadata?: Record<string, unknown> | null;
    specifications?: Record<string, unknown> | null;
    min_price: number | string;
    max_price: number | string;
    merchant_count: number | null;
  }>) {
    masterById.set(m.id, {
      id: m.id,
      slug: m.slug,
      name: m.name,
      brand: m.brand,
      category_slug: getMasterProductCategorySlug(m, catSlugById),
      market_min_price: Number(m.min_price || 0),
      market_max_price: Number(m.max_price || 0),
      merchant_count: Number(m.merchant_count || 0),
    });
  }

  const listings: MerchantProductListing[] = rawProducts.map((p) => {
    const masterInfo = p.cluster_id
      ? masterById.get(p.cluster_id) || null
      : null;
    const priceCurrent = toSafeOfferPrice(p.price_current);
    return {
      id: p.id,
      platform: p.platform,
      platform_item_id: p.platform_item_id,
      title: p.title,
      price_current: priceCurrent,
      price_original: normalizeOfferOriginalPrice(
        priceCurrent,
        p.price_original
      ),
      stock: toSafeNonNegativeVoteCount(p.stock, 10_000_000),
      historical_sold: toSafeNonNegativeVoteCount(
        p.historical_sold,
        100_000_000
      ),
      historical_sold_display:
        typeof p.historical_sold_display === 'string' &&
        p.historical_sold_display.trim()
          ? p.historical_sold_display.trim()
          : null,
      rating_star: toSafeStarRating5(p.rating_star),
      rating_count: toSafeNonNegativeVoteCount(p.rating_count, 100_000_000),
      url: sanitizeOfferUrl(p.url),
      image: firstImageUrl(p.images),
      availability: toOfferAvailability(p.availability),
      master_product: masterInfo,
      discount_analysis: null,
    };
  });
  // Sold-out listings keep their last price: listed after the buyable ones,
  // as on the product page (DOS/Rate#1248). Stable, so price order stays.
  listings.sort(
    (a, b) => Number(isOfferUnavailable(a)) - Number(isOfferUnavailable(b))
  );

  const prodById = new Map(listings.map((l) => [l.id, l]));
  const recentReviews: MerchantProfileDetail['recent_reviews'] = (
    (reviewsRes.data || []) as unknown as Array<
      RawReviewRow & { product_id: string }
    >
  ).map((r) => {
    const rawVf = Array.isArray(r.review_flags)
      ? r.review_flags[0]
      : r.review_flags;
    const vf =
      rawVf && typeof rawVf === 'object' && !Array.isArray(rawVf)
        ? rawVf
        : null;
    const verdict = vf?.verdict ?? null;
    const flagCategory: ReviewFlagCategory =
      vf?.flag_category ||
      (verdict === 'fake'
        ? 'seeding_fake'
        : verdict === 'suspicious'
          ? 'low_value_coin_spam'
          : 'authentic');
    const includeInRating = resolveIncludeInRating(
      vf?.include_in_rating,
      flagCategory,
      verdict
    );
    const upvotes = Number(r.upvotes ?? 0);
    const downvotes = Number(r.downvotes ?? 0);
    const reports = Number(r.report_count ?? 0);
    const computedWeight =
      r.helpfulness_weight != null
        ? Number(r.helpfulness_weight)
        : computeJReviewsWeight({
            upvotes,
            downvotes,
            reports,
            flagCategory,
            verdict,
            includeInRating,
          });
    const prod = prodById.get(r.product_id);

    const item: MerchantProfileDetail['recent_reviews'][number] = {
      id: r.id,
      product_id: r.product_id,
      product_title: prod?.title || 'Sản phẩm niêm yết',
      master_slug: prod?.master_product?.slug || null,
      master_category_slug: prod?.master_product?.category_slug || null,
      author_name: r.author_name || 'Khách hàng',
      rating_star: Number(r.rating_star || 5),
      comment: r.comment || '',
      variation: r.variation || null,
      created_at: r.created_at,
      reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
      upvotes,
      downvotes,
      report_count: reports,
      helpfulness_weight: includeInRating ? computedWeight : 0,
      include_in_rating: includeInRating,
      criteria_ratings: r.criteria_ratings || {},
      verdict,
      fake_probability:
        vf?.fake_probability != null ? Number(vf.fake_probability) : null,
      flag_category: flagCategory,
      reason: vf?.reason || null,
      signals: vf?.signals || null,
    };
    item.trust_assessment = evaluateReviewTrustAssessment(item);
    return item;
  });

  const persistedBreakdown = extractPersistedBreakdown(merchantRow);
  const dynamicRisk = computeDynamicReviewRisk(recentReviews, {
    isOfficial: isStrictOfferOfficialFlag(merchantRow.is_official),
    platform: merchantRow.platform,
    followerCount: Number(merchantRow.follower_count) || 0,
  });
  const meta = (
    merchantRow.metadata &&
    typeof merchantRow.metadata === 'object' &&
    !Array.isArray(merchantRow.metadata)
      ? merchantRow.metadata
      : {}
  ) as Record<string, unknown>;
  const baseRisk = toSafeRiskScore100(merchantRow.risk_score, 0);
  const dosafeRisk =
    typeof meta.dosafe_risk_score === 'number' &&
    Number.isFinite(meta.dosafe_risk_score)
      ? toSafeRiskScore100(meta.dosafe_risk_score, 0)
      : baseRisk;
  const persistedReviewRisk = persistedReviewRiskOf(merchantRow);
  // A persisted importer score covers all of the seller's reviews; the dynamic
  // one only the newest page. Use the persisted score when there is one, as
  // the merchant list and offer cards do (#684).
  const effectiveReviewRisk =
    persistedBreakdown || hasStoredReviewRisk(merchantRow)
      ? persistedReviewRisk
      : Math.max(dynamicRisk.reviewRiskScore, persistedReviewRisk);
  const breakdown = persistedBreakdown ?? dynamicRisk.breakdown;
  // The split's combined score when there is one; older metadata otherwise.
  const metaCombined =
    storedRiskSplit(
      merchantRow.review_risk_breakdown,
      merchantRow.metadata,
      merchantRow.review_risk_score
    )?.combined ??
    (typeof meta.combined_risk_score === 'number' &&
    Number.isFinite(meta.combined_risk_score)
      ? toSafeRiskScore100(meta.combined_risk_score, 0)
      : 0);
  const combinedRisk = Math.min(
    100,
    Math.max(baseRisk, dosafeRisk, effectiveReviewRisk, metaCombined)
  );
  const trustScore = Math.max(0, 100 - combinedRisk);
  // The store's price range is what it sells now: sold-out listings are out.
  const prices = listings
    .filter((l) => !isOfferUnavailable(l))
    .map((l) => l.price_current)
    .filter((p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE);

  const profile: MerchantProfileDetail = {
    id: merchantRow.id,
    platform: merchantRow.platform,
    platform_shop_id: merchantRow.platform_shop_id,
    name: merchantRow.name,
    slug: merchantRow.slug || null,
    url:
      sanitizeOfferUrl(merchantRow.url) ||
      (merchantRow.platform === 'shopee' && merchantRow.platform_shop_id
        ? `https://shopee.vn/shop/${merchantRow.platform_shop_id}`
        : null),
    is_official: isStrictOfferOfficialFlag(merchantRow.is_official),
    rating_star:
      merchantRow.rating_star != null
        ? toSafeStarRating5(merchantRow.rating_star)
        : null,
    follower_count: toSafeNonNegativeVoteCount(
      merchantRow.follower_count,
      100_000_000
    ),
    location: merchantRow.location || null,
    dosafe_risk_score: dosafeRisk,
    review_risk_score: effectiveReviewRisk,
    risk_score: combinedRisk,
    trust_score: trustScore,
    product_count: listings.length,
    min_price: prices.length > 0 ? Math.min(...prices) : null,
    max_price: prices.length > 0 ? Math.max(...prices) : null,
    review_risk_breakdown: breakdown,
    updated_at: merchantRow.updated_at || merchantRow.created_at || null,
    listings,
    recent_reviews: recentReviews,
  };

  const listingMasterIds: Record<string, string> = {};
  for (const p of rawProducts) {
    if (p.cluster_id) listingMasterIds[p.id] = p.cluster_id;
  }
  return { profile, listingMasterIds };
}

/** Counters shown when platform stats cannot be read; never cached. */
export const EMPTY_RATE_PLATFORM_STATS: RatePlatformStats = {
  masterProductsCount: 0,
  listingsCount: 0,
  merchantsCount: 0,
  priceObservationsCount: 0,
  totalReviewsCount: 0,
  authenticReviewsCount: 0,
  filteredSeedingCount: 0,
  authenticRatioPct: 100,
  categoriesWithCounts: [],
  recentReviewsSample: [],
};

/**
 * Fetch live platform statistics, category product counts, and recent verified/flagged
 * reviews from the `rate` schema to power the Homepage with 100% real database data.
 */
/**
 * Stored reviews the analyser kept out of the rating, per master product id
 * (DOS/Rate#1139). Same rule as the platform's filteredSeedingCount below:
 * include_in_rating false, or NULL with a flagged category or a fake verdict,
 * and never a review still pending analysis. Masters with none are absent.
 * The leaderboard must not derive this from master_products.total_reviews,
 * which is the marketplaces' own rating count, not reviews Rate.vn read.
 */
export async function getFilteredReviewCountsByMaster(): Promise<
  Record<string, number>
> {
  const supabase = getRateClient();
  const [explicitRows, derivedRows] = await Promise.all([
    fetchAllRows<{ review_id: string }>('filtered review flags', (from, to) =>
      supabase
        .from('review_flags')
        .select('review_id')
        .eq('include_in_rating', false)
        .or('verdict.is.null,verdict.neq.unanalyzed')
        .order('review_id')
        .range(from, to)
    ),
    fetchAllRows<{ review_id: string }>('filtered review flags', (from, to) =>
      supabase
        .from('review_flags')
        .select('review_id')
        .is('include_in_rating', null)
        .or(
          'and(flag_category.neq.authentic,or(verdict.is.null,verdict.neq.unanalyzed)),verdict.eq.fake,and(flag_category.is.null,verdict.eq.suspicious)'
        )
        .order('review_id')
        .range(from, to)
    ),
  ]);
  const reviewIds = Array.from(
    new Set(
      [...explicitRows, ...derivedRows]
        .map((r) => String(r.review_id ?? ''))
        .filter(Boolean)
    )
  );
  if (reviewIds.length === 0) return {};

  const reviewRows = await fetchAllRowsInChunks<{
    id: string;
    product_id: string | null;
  }>('filtered reviews', reviewIds, (chunk, from, to) =>
    supabase
      .from('reviews')
      .select('id, product_id')
      .in('id', chunk)
      .order('id')
      .range(from, to)
  );
  const productIds = Array.from(
    new Set(reviewRows.map((r) => String(r.product_id ?? '')).filter(Boolean))
  );
  if (productIds.length === 0) return {};

  const productRows = await fetchAllRowsInChunks<{
    id: string;
    cluster_id: string | null;
  }>('filtered review products', productIds, (chunk, from, to) =>
    supabase
      .from('products')
      .select('id, cluster_id')
      .in('id', chunk)
      .order('id')
      .range(from, to)
  );
  const masterByProduct = new Map(
    productRows.map((p) => [String(p.id), String(p.cluster_id ?? '')])
  );

  const counts: Record<string, number> = {};
  for (const r of reviewRows) {
    const masterId = masterByProduct.get(String(r.product_id ?? ''));
    if (!masterId) continue;
    counts[masterId] = (counts[masterId] ?? 0) + 1;
  }
  return counts;
}

export async function getRatePlatformStats(): Promise<RatePlatformStats> {
  const supabase = getRateClient();

  const [
    catsRes,
    masterRes,
    prodsCountRes,
    merchantsRes,
    priceHistCountRes,
    reviewsCountRes,
    reviewsRes,
    unanalyzedCountRes,
    filteredExplicitCountRes,
    filteredDerivedCountRes,
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('id, parent_id, name, slug, icon, display_order')
      .order('display_order', { ascending: true }),
    fetchAllRows('master_products', (from, to) =>
      supabase
        .from('master_products')
        .select('id, slug, name, model, category_id, metadata, specifications')
        .eq('status', 'published')
        .order('id')
        .range(from, to)
    ).then((data) => ({ data })),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('merchants').select('id', { count: 'exact', head: true }),
    supabase
      .from('price_history')
      .select('id', { count: 'estimated', head: true }),
    supabase.from('reviews').select('id', { count: 'exact', head: true }),
    supabase
      .from('reviews')
      .select('*, review_flags(*)')
      .order('created_at', { ascending: false })
      .limit(60),
    // Platform-wide review verdict counts (DOS/Rate#455), with the same rules
    // as the per-review mapping below: a review without a flag row counts as
    // authentic, 'unanalyzed' counts as neither, and include_in_rating decides
    // the rest (a NULL include_in_rating falls back to the flag category,
    // derived from the verdict when the category is NULL). review_id is the
    // primary key, so one flag row per review.
    supabase
      .from('review_flags')
      .select('review_id', { count: 'exact', head: true })
      .eq('verdict', 'unanalyzed'),
    supabase
      .from('review_flags')
      .select('review_id', { count: 'exact', head: true })
      .eq('include_in_rating', false)
      .or('verdict.is.null,verdict.neq.unanalyzed'),
    supabase
      .from('review_flags')
      .select('review_id', { count: 'exact', head: true })
      .is('include_in_rating', null)
      .or(
        'and(flag_category.neq.authentic,or(verdict.is.null,verdict.neq.unanalyzed)),verdict.eq.fake,and(flag_category.is.null,verdict.eq.suspicious)'
      ),
  ]);
  // Zero counters would otherwise be cached as the platform's real totals.
  const statsError =
    catsRes.error ??
    prodsCountRes.error ??
    merchantsRes.error ??
    priceHistCountRes.error ??
    reviewsCountRes.error ??
    reviewsRes.error ??
    unanalyzedCountRes.error ??
    filteredExplicitCountRes.error ??
    filteredDerivedCountRes.error;
  if (statsError) {
    throw new RateDataUnavailableError('platform stats', statsError);
  }

  const categories = (catsRes.data as RateCategoryItem[]) || [];
  const masterRows =
    (masterRes.data as Array<{
      id: string;
      slug: string;
      name: string;
      model?: string | null;
      category_id: string | null;
      metadata?: Record<string, unknown> | null;
      specifications?: Record<string, unknown> | null;
    }>) || [];

  const rawReviews =
    (reviewsRes.data as unknown as Array<
      RawReviewRow & { product_id: string }
    >) || [];
  const sampleProductIds = Array.from(
    new Set(rawReviews.map((r) => r.product_id).filter(Boolean))
  );
  let prodRows: Array<{
    id: string;
    title: string;
    cluster_id: string | null;
  }> = [];
  if (sampleProductIds.length > 0) {
    const { data: sampleProds, error: sampleProdsErr } = await supabase
      .from('products')
      .select('id, title, cluster_id')
      .in('id', sampleProductIds);
    if (sampleProdsErr) {
      throw new RateDataUnavailableError('platform stats', sampleProdsErr);
    }
    prodRows =
      (sampleProds as Array<{
        id: string;
        title: string;
        cluster_id: string | null;
      }>) || [];
  }

  const catSlugById = new Map<string, string>();
  const catIdBySlug = new Map<string, string>();
  for (const c of categories) {
    catSlugById.set(c.id, c.slug);
    catIdBySlug.set(c.slug, c.id);
  }

  const countByCatId = new Map<string, number>();
  const masterSlugById = new Map<string, string>();
  const masterRouteById = new Map<string, string>();
  for (const m of masterRows) {
    const resolvedCatSlug = getMasterProductCategorySlug(m, catSlugById);
    masterSlugById.set(m.id, m.slug);
    masterRouteById.set(m.id, `/${resolvedCatSlug}/${m.slug}`);
    const resolvedCatId =
      (m.category_id && catSlugById.has(m.category_id)
        ? m.category_id
        : null) || catIdBySlug.get(resolvedCatSlug);
    if (resolvedCatId) {
      countByCatId.set(
        resolvedCatId,
        (countByCatId.get(resolvedCatId) || 0) + 1
      );
    }
  }

  const prodInfoById = new Map<
    string,
    { title: string; masterSlug: string | null; masterRouteHref: string | null }
  >();
  for (const p of prodRows) {
    prodInfoById.set(p.id, {
      title: p.title,
      masterSlug: p.cluster_id
        ? masterSlugById.get(p.cluster_id) || null
        : null,
      masterRouteHref: p.cluster_id
        ? masterRouteById.get(p.cluster_id) || null
        : null,
    });
  }

  const mappedReviews: RatePlatformStats['recentReviewsSample'] =
    rawReviews.map((r) => {
      const rawVf = Array.isArray(r.review_flags)
        ? r.review_flags[0]
        : r.review_flags;
      const vf =
        rawVf && typeof rawVf === 'object' && !Array.isArray(rawVf)
          ? rawVf
          : null;
      const verdict = vf?.verdict ?? null;
      const flagCategory: ReviewFlagCategory =
        vf?.flag_category ||
        (verdict === 'fake'
          ? 'seeding_fake'
          : verdict === 'suspicious'
            ? 'low_value_coin_spam'
            : 'authentic');
      const includeInRating = resolveIncludeInRating(
        vf?.include_in_rating,
        flagCategory,
        verdict
      );
      const upvotes = Number(r.upvotes ?? 0);
      const downvotes = Number(r.downvotes ?? 0);
      const reports = Number(r.report_count ?? 0);
      const computedWeight =
        r.helpfulness_weight != null
          ? Number(r.helpfulness_weight)
          : computeJReviewsWeight({
              upvotes,
              downvotes,
              reports,
              flagCategory,
              verdict,
              includeInRating,
            });
      const pInfo = prodInfoById.get(r.product_id);
      const item: RatePlatformStats['recentReviewsSample'][number] = {
        id: r.id,
        author_name: r.author_name || 'Khách hàng',
        rating_star: Number(r.rating_star || 5),
        comment: r.comment || '',
        variation: r.variation || null,
        created_at: r.created_at,
        reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
        upvotes,
        downvotes,
        report_count: reports,
        helpfulness_weight: includeInRating ? computedWeight : 0,
        include_in_rating: includeInRating,
        criteria_ratings: r.criteria_ratings || {},
        verdict,
        fake_probability:
          vf?.fake_probability != null ? Number(vf.fake_probability) : null,
        flag_category: flagCategory,
        reason: vf?.reason || null,
        signals: vf?.signals || null,
        productTitle: pInfo?.title || 'Sản phẩm công nghệ',
        masterSlug: pInfo?.masterSlug || null,
        masterRouteHref: pInfo?.masterRouteHref || null,
      };
      item.trust_assessment = evaluateReviewTrustAssessment(item);
      return item;
    });

  const totalRev = reviewsCountRes.count ?? mappedReviews.length;
  const filteredCount =
    (filteredExplicitCountRes.count ?? 0) +
    (filteredDerivedCountRes.count ?? 0);
  // Pending community reviews are neither authentic nor filtered yet.
  const authenticCount = Math.max(
    0,
    totalRev - (unanalyzedCountRes.count ?? 0) - filteredCount
  );
  const analyzedRev = authenticCount + filteredCount;
  const authenticRatioPct =
    analyzedRev > 0
      ? Math.round((authenticCount / analyzedRev) * 1000) / 10
      : 100;

  return {
    masterProductsCount: masterRows.length,
    listingsCount: prodsCountRes.count ?? prodRows.length,
    merchantsCount: merchantsRes.count ?? 0,
    priceObservationsCount: priceHistCountRes.count ?? 0,
    totalReviewsCount: totalRev,
    authenticReviewsCount: authenticCount,
    filteredSeedingCount: filteredCount,
    authenticRatioPct,
    categoriesWithCounts: categories.map((cat) => ({
      ...cat,
      productCount: countByCatId.get(cat.id) || 0,
      routeHref: getCategoryRouteHref(cat.slug),
    })),
    recentReviewsSample: mappedReviews.slice(0, 6),
  };
}

export interface UrlInspectionResult {
  query: string;
  matchedType:
    | 'product_listing'
    | 'master_product'
    | 'merchant'
    | 'search_suggestions'
    | 'not_found';
  parsedUrl: ParsedEcommerceUrl;
  masterProduct: MasterProduct | null;
  matchedOffer: MerchantOffer | null;
  allOffers: MerchantOffer[];
  discountAnalysis: OfferDiscountAnalysis | null;
  priceHistory: MasterProductPriceHistorySummary | null;
  reviewSummary: ReviewAnalysisSummary | null;
  merchantProfile: MerchantSummary | null;
  suggestions: MasterProduct[];
  radarSignal?: import('./deal-radar').RadarSignal | null;
}

const PLATFORM_ITEM_ID_PREFIX: Partial<
  Record<NonNullable<ParsedEcommerceUrl['platform']>, string>
> = {
  tiktok: 'tts-',
  cellphones: 'cps-',
  tgdd: 'tgdd-',
  fptshop: 'fpt-',
  hoangha: 'hhm-',
  didongviet: 'ddv-',
  phongvu: 'pv-',
};

/**
 * Inspect an e-commerce product/shop URL (all 10 platforms) or keyword:
 * - Resolves exact `platform_item_id` or `url` against `rate.products`
 * - Or resolves `platform_shop_id` / merchant name against `rate.merchants`
 * - Or resolves product slug / keyword against `rate.master_products`
 * Returns complete price comparison, Fake Discount analysis, JReviews summary, and Merchant Dual Risk Score.
 */
export async function inspectProductOrShopUrl(
  rawQuery: string
): Promise<UrlInspectionResult> {
  const query =
    typeof rawQuery === 'string'
      ? rawQuery
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 2048)
      : '';
  const parsedUrl = parseEcommerceUrlOrQuery(query);

  if (!query) {
    return {
      query: '',
      matchedType: 'not_found',
      parsedUrl,
      masterProduct: null,
      matchedOffer: null,
      allOffers: [],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [],
    };
  }

  const supabase = getRateClient();

  // The listing is known but its model is not published (DOS/Rate#769):
  // the merchant id of that listing, else null.
  let unpublishedListingMerchantId: string | null = null;

  // 1. Direct lookup by platform_item_id if parsed from URL
  if (parsedUrl.platformItemId) {
    const candidateIds = new Set<string>([parsedUrl.platformItemId]);
    if (parsedUrl.platformShopId) {
      candidateIds.add(
        `${parsedUrl.platformShopId}_${parsedUrl.platformItemId}`
      );
    }
    const prefix = parsedUrl.platform
      ? PLATFORM_ITEM_ID_PREFIX[parsedUrl.platform]
      : undefined;
    if (prefix && !parsedUrl.platformItemId.startsWith(prefix)) {
      candidateIds.add(`${prefix}${parsedUrl.platformItemId}`);
    }

    const { data: prodRow, error: prodErr } = await supabase
      .from('products')
      .select('id, cluster_id, merchant_id, platform_item_id')
      .in('platform_item_id', Array.from(candidateIds))
      .limit(1)
      .maybeSingle();

    if (prodErr) {
      throw new RateDataUnavailableError('URL product listing lookup', prodErr);
    }

    const matchedProd = prodRow as {
      id: string;
      cluster_id: string | null;
      merchant_id: string;
      platform_item_id: string;
    } | null;

    if (matchedProd?.cluster_id) {
      // A draft master has no product page (DOS/Rate#769). The listing is
      // then known to be that model, so only the shop lookup below applies.
      const { data: masterData, error: masterErr } = await supabase
        .from('master_products')
        .select('*')
        .eq('id', matchedProd.cluster_id)
        .eq('status', 'published')
        .maybeSingle();

      if (masterErr) {
        throw new RateDataUnavailableError(
          'URL master product lookup',
          masterErr
        );
      }

      const masterProduct = masterData
        ? normalizeMasterProductRow(masterData as MasterProduct)
        : null;
      if (masterProduct) {
        const [offers, reviews, merchantsList] = await Promise.all([
          getMasterProductOffers(masterProduct.id),
          getMasterProductReviews(masterProduct.id),
          getMerchantsList({ ids: [matchedProd.merchant_id], limit: 1 }),
        ]);
        const [priceHistory, reviewSummary] = await Promise.all([
          getMasterProductPriceHistory(masterProduct.id, offers),
          getMasterProductReviewSummary(masterProduct.id, reviews),
        ]);
        // No bait-price or sold-out listing as the fallback match
        // (DOS/Rate#797, #1177).
        const matchedOffer =
          offers.find((o) => o.id === matchedProd.id) ||
          plausibleOffers(offers.filter((o) => !isOfferUnavailable(o)))[0] ||
          null;
        const discountAnalysis = matchedOffer
          ? priceHistory.byOffer[matchedOffer.id] || null
          : null;
        const merchantProfile =
          merchantsList.find((m) => m.id === matchedProd.merchant_id) || null;

        return {
          query,
          matchedType: 'product_listing',
          parsedUrl,
          masterProduct,
          matchedOffer,
          allOffers: offers,
          discountAnalysis,
          priceHistory,
          reviewSummary,
          merchantProfile,
          suggestions: [],
        };
      }
      unpublishedListingMerchantId = matchedProd.merchant_id;
    }
  }

  // 2. Direct lookup by Shopee/platform shop ID if present on the URL.
  // For Lazada product URLs (`-i<itemId>-s<skuId>.html`), `platformShopId` holds
  // the `-s<sku>` number rather than a shop ID, so skip shop lookup there and
  // always filter by platform to prevent cross-platform numeric ID collisions (#532).
  let matchedMerchantByShopId: MerchantSummary | null = null;
  const shouldLookupShopByUrlId =
    Boolean(parsedUrl.platformShopId) &&
    !(parsedUrl.platform === 'lazada' && parsedUrl.platformItemId);
  if (shouldLookupShopByUrlId && parsedUrl.platformShopId) {
    const merchants = await getMerchantsList({
      platform: parsedUrl.platform || undefined,
      platformShopIds: [parsedUrl.platformShopId],
      limit: 1,
    });
    matchedMerchantByShopId =
      merchants.find(
        (m) =>
          m.platform_shop_id === parsedUrl.platformShopId &&
          (!parsedUrl.platform || m.platform === parsedUrl.platform)
      ) || null;
    if (matchedMerchantByShopId && !parsedUrl.platformItemId) {
      const suggestions = await getMasterProducts({ limit: 3 });
      return {
        query,
        matchedType: 'merchant',
        parsedUrl,
        masterProduct: null,
        matchedOffer: null,
        allOffers: [],
        discountAnalysis: null,
        priceHistory: null,
        reviewSummary: null,
        merchantProfile: matchedMerchantByShopId,
        suggestions,
      };
    }
  }

  // A keyword guess could only find a different model than the listing's,
  // so answer with the listing's store, if tracked.
  if (unpublishedListingMerchantId) {
    const [suggestions, listingMerchants] = await Promise.all([
      getMasterProducts({ limit: 3 }),
      matchedMerchantByShopId
        ? Promise.resolve([matchedMerchantByShopId])
        : getMerchantsList({ ids: [unpublishedListingMerchantId], limit: 1 }),
    ]);
    const merchantProfile =
      listingMerchants.find(
        (m) =>
          m.id === unpublishedListingMerchantId ||
          m.id === matchedMerchantByShopId?.id
      ) || null;
    return {
      query,
      matchedType: merchantProfile ? 'merchant' : 'not_found',
      parsedUrl,
      masterProduct: null,
      matchedOffer: null,
      allOffers: [],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile,
      suggestions,
    };
  }

  const pickOfferForUrlInspection = (
    offers: MerchantOffer[]
  ): MerchantOffer | null => {
    if (matchedMerchantByShopId) {
      const byShopMerchant = offers.find(
        (o) =>
          o.merchant.id === matchedMerchantByShopId.id ||
          (matchedMerchantByShopId.platform_shop_id &&
            o.merchant.id === matchedMerchantByShopId.platform_shop_id)
      );
      if (byShopMerchant) return byShopMerchant;
    }
    // The cheapest plausible in-stock offer, never a bait-price or sold-out
    // listing (DOS/Rate#797, #1177).
    return (
      plausibleOffers(offers.filter((o) => !isOfferUnavailable(o)))[0] || null
    );
  };

  // 3. Internal slug or exact master product slug match (including slugified URL keyword)
  const urlProductKeyword = parsedUrl.isUrl
    ? extractProductKeywordFromUrl(query)
    : '';
  const slugifiedUrlKeyword = urlProductKeyword
    ? urlProductKeyword
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';
  const candidateSlug =
    parsedUrl.internalSlug ||
    (parsedUrl.isUrl ? slugifiedUrlKeyword : query.toLowerCase());
  const exactMaster = candidateSlug
    ? await getMasterProductBySlug(candidateSlug)
    : null;
  if (exactMaster) {
    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(exactMaster.id),
      getMasterProductReviews(exactMaster.id),
    ]);
    const matchedOffer = pickOfferForUrlInspection(offers);
    const hasShopOfferMatch = Boolean(
      matchedMerchantByShopId &&
      matchedOffer &&
      (matchedOffer.merchant.id === matchedMerchantByShopId.id ||
        (matchedMerchantByShopId.platform_shop_id &&
          matchedOffer.merchant.id ===
            matchedMerchantByShopId.platform_shop_id))
    );
    const shouldFetchOfferMerchant = Boolean(
      matchedOffer && (!matchedMerchantByShopId || !hasShopOfferMatch)
    );
    const [priceHistory, reviewSummary, merchantsList] = await Promise.all([
      getMasterProductPriceHistory(exactMaster.id, offers),
      getMasterProductReviewSummary(exactMaster.id, reviews),
      shouldFetchOfferMerchant && matchedOffer
        ? getMerchantsList({
            ids: [matchedOffer.merchant.id],
            limit: 1,
          })
        : Promise.resolve(
            matchedMerchantByShopId ? [matchedMerchantByShopId] : []
          ),
    ]);
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;
    const merchantProfile = hasShopOfferMatch
      ? matchedMerchantByShopId
      : matchedOffer
        ? merchantsList.find((m) => m.id === matchedOffer.merchant.id) || null
        : matchedMerchantByShopId;

    return {
      query,
      matchedType: 'master_product',
      parsedUrl,
      masterProduct: exactMaster,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile,
      suggestions: [],
    };
  }

  // 4. Search across merchants and master products by keyword. Merchant
  // lookups are filtered in the database: this public endpoint must not read
  // the whole directory on every request.
  const effectiveSearchQuery = parsedUrl.isUrl ? urlProductKeyword : query;
  const [nameMatches, shopMatches, matchedProducts] = effectiveSearchQuery
    ? await Promise.all([
        // No merchant name is this long; skipping also keeps a 1024-char query out
        // of the request URL.
        !parsedUrl.isUrl && effectiveSearchQuery.length <= 200
          ? getMerchantsList({ nameContains: effectiveSearchQuery, limit: 1 })
          : Promise.resolve([]),
        // Only shop-id-shaped input reaches the in() filter syntax.
        !parsedUrl.isUrl && /^[A-Za-z0-9_.-]{1,64}$/.test(effectiveSearchQuery)
          ? getMerchantsList({
              platformShopIds: [effectiveSearchQuery],
              limit: 1,
            })
          : Promise.resolve([]),
        getMasterProducts({ search: effectiveSearchQuery, limit: 6 }),
      ])
    : [[], [], []];
  const matchedMerchantByName =
    matchedMerchantByShopId ?? nameMatches[0] ?? shopMatches[0] ?? null;
  const merchantById = async (id: string) =>
    (await getMerchantsList({ ids: [id], limit: 1 }))[0] ?? null;

  if (matchedProducts.length === 1) {
    const single = matchedProducts[0]!;
    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(single.id),
      getMasterProductReviews(single.id),
    ]);
    const [priceHistory, reviewSummary] = await Promise.all([
      getMasterProductPriceHistory(single.id, offers),
      getMasterProductReviewSummary(single.id, reviews),
    ]);
    const matchedOffer = pickOfferForUrlInspection(offers);
    const hasShopOfferMatch = Boolean(
      matchedMerchantByShopId &&
      matchedOffer &&
      (matchedOffer.merchant.id === matchedMerchantByShopId.id ||
        (matchedMerchantByShopId.platform_shop_id &&
          matchedOffer.merchant.id ===
            matchedMerchantByShopId.platform_shop_id))
    );
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;
    const merchantProfile = hasShopOfferMatch
      ? matchedMerchantByShopId
      : matchedOffer
        ? await merchantById(matchedOffer.merchant.id)
        : matchedMerchantByName;

    return {
      query,
      matchedType: 'master_product',
      parsedUrl,
      masterProduct: single,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile,
      suggestions: matchedProducts,
    };
  }

  if (matchedProducts.length > 1) {
    const top = matchedProducts[0]!;
    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(top.id),
      getMasterProductReviews(top.id),
    ]);
    const [priceHistory, reviewSummary] = await Promise.all([
      getMasterProductPriceHistory(top.id, offers),
      getMasterProductReviewSummary(top.id, reviews),
    ]);
    const matchedOffer = pickOfferForUrlInspection(offers);
    const hasShopOfferMatch = Boolean(
      matchedMerchantByShopId &&
      matchedOffer &&
      (matchedOffer.merchant.id === matchedMerchantByShopId.id ||
        (matchedMerchantByShopId.platform_shop_id &&
          matchedOffer.merchant.id ===
            matchedMerchantByShopId.platform_shop_id))
    );
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;
    const merchantProfile = hasShopOfferMatch
      ? matchedMerchantByShopId
      : matchedOffer
        ? await merchantById(matchedOffer.merchant.id)
        : matchedMerchantByName;

    return {
      query,
      matchedType: 'search_suggestions',
      parsedUrl,
      masterProduct: top,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile,
      suggestions: matchedProducts,
    };
  }

  if (matchedMerchantByName) {
    const fallbackProducts = await getMasterProducts({ limit: 3 });
    return {
      query,
      matchedType: 'merchant',
      parsedUrl,
      masterProduct: null,
      matchedOffer: null,
      allOffers: [],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: matchedMerchantByName,
      suggestions: fallbackProducts,
    };
  }

  const fallbackSuggestions = await getMasterProducts({ limit: 3 });
  return {
    query,
    matchedType: 'not_found',
    parsedUrl,
    masterProduct: null,
    matchedOffer: null,
    allOffers: [],
    discountAnalysis: null,
    priceHistory: null,
    reviewSummary: null,
    merchantProfile: null,
    suggestions: fallbackSuggestions,
  };
}

// ---------------------------------------------------------------------------
// Item / variant / listing model (DOS/Rate#1153; design doc
// `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, sections 4, 5.1).
// These read `rate.items`, `master_products.item_id` and `products.item_id`,
// which exist only after the DOS-Me M1+M2 migration (#1150). Callers reach
// them only through `server/rate/item-model.ts` while `RATE_ITEM_MODEL` is on;
// with the flag off nothing here runs.
// ---------------------------------------------------------------------------

/** A published `rate.items` row, as the web reads it. */
export interface RateItem {
  id: string;
  item_key: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category_id: string | null;
  default_variant_id: string | null;
  min_price: number;
  max_price: number;
  price_variant_count: number;
  merchant_count: number;
  listing_count: number;
  unknown_variant_listing_count: number;
  updated_at: string | null;
}

/** A published variant (`rate.master_products` row) of an Item. */
export interface RateItemVariant {
  id: string;
  item_id: string;
  slug: string;
  name: string;
  variant_key: string;
  variant_name: string | null;
  sort_order: number | null;
  storage_gb: number | null;
  min_price: number;
  max_price: number;
  merchant_count: number;
}

/** An Item's offers: per variant, and the listings with no stated size. */
export interface RateItemOffers {
  byVariant: Map<string, MerchantOffer[]>;
  unknownVariant: MerchantOffer[];
}

/**
 * `resolveCatalogSlug`: a catalogue slug is either an Item's own slug or an
 * old variant slug (the URL every page used before Items, design doc 5.1).
 */
export type CatalogSlugResolution =
  | { kind: 'item'; item: RateItem; variant: null }
  | {
      kind: 'variant';
      item: RateItem;
      variant: RateItemVariant;
      /** An archived variant, e.g. a retired `unknown` (design doc 7.2). */
      retired: boolean;
    }
  /**
   * A master with no Item yet (`item_id` NULL before the backfill): its page
   * stays today's variant page.
   */
  | { kind: 'unlinked'; item: null; variant: null };

/**
 * The Item tables or columns are missing (M1+M2 not applied where the flag
 * is on). Callers treat it as "flag off" instead of failing every page.
 */
export class ItemModelUnavailableError extends Error {
  constructor(what: string, cause: { message?: string; code?: string }) {
    super(
      `rate-api: item model unavailable (${what}): ${cause.code ?? ''} ${cause.message ?? ''}`.trim()
    );
    this.name = 'ItemModelUnavailableError';
  }
}

// undefined_table, undefined_column, and PostgREST's schema-cache misses.
const MISSING_SCHEMA_CODES = new Set([
  '42P01',
  '42703',
  'PGRST204',
  'PGRST205',
]);

/** Rethrows a missing-schema read error as ItemModelUnavailableError. */
function throwIfItemSchemaMissing<R extends { error: unknown }>(
  what: string
): (result: R) => R {
  return (result) => {
    const error = result.error as { message: string; code?: string } | null;
    if (error?.code && MISSING_SCHEMA_CODES.has(error.code)) {
      throw new ItemModelUnavailableError(what, error);
    }
    return result;
  };
}

function itemReadError(
  what: string,
  error: { message: string; code?: string }
): Error {
  return error.code && MISSING_SCHEMA_CODES.has(error.code)
    ? new ItemModelUnavailableError(what, error)
    : new RateDataUnavailableError(what, error);
}

const ITEM_SELECT =
  'id, item_key, slug, name, brand, model, category_id, default_variant_id, min_price, max_price, price_variant_count, merchant_count, listing_count, unknown_variant_listing_count, updated_at';
const ITEM_VARIANT_SELECT =
  'id, item_id, slug, name, variant_key, variant_name, sort_order, storage_gb, min_price, max_price, merchant_count';

// rate.items and the item columns are not in the generated Database types
// until #1150 lands, so these reads go through an untyped view of the client.
type UntypedRateQuery = {
  select: (cols: string) => UntypedRateQuery;
  eq: (col: string, val: unknown) => UntypedRateQuery;
  is: (col: string, val: null) => UntypedRateQuery;
  in: (col: string, vals: readonly unknown[]) => UntypedRateQuery;
  order: (
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean }
  ) => UntypedRateQuery;
  range: (from: number, to: number) => UntypedRateQuery;
  maybeSingle: () => PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
} & PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
const untypedRate = (): { from: (table: string) => UntypedRateQuery } =>
  getRateClient() as unknown as { from: (table: string) => UntypedRateQuery };

const toNonNegative = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function mapItemRow(raw: unknown): RateItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = sanitizeRateEntityId(r.id);
  const slug = typeof r.slug === 'string' ? r.slug : '';
  if (!id || !slug) return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    id,
    item_key: str(r.item_key),
    slug,
    name: str(r.name),
    brand: str(r.brand),
    model: str(r.model),
    category_id: sanitizeRateEntityId(r.category_id) || null,
    default_variant_id: sanitizeRateEntityId(r.default_variant_id) || null,
    min_price: toNonNegative(r.min_price),
    max_price: toNonNegative(r.max_price),
    price_variant_count: toNonNegative(r.price_variant_count),
    merchant_count: toNonNegative(r.merchant_count),
    listing_count: toNonNegative(r.listing_count),
    unknown_variant_listing_count: toNonNegative(
      r.unknown_variant_listing_count
    ),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}

function mapItemVariantRow(raw: unknown): RateItemVariant | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = sanitizeRateEntityId(r.id);
  const itemId = sanitizeRateEntityId(r.item_id);
  const slug = typeof r.slug === 'string' ? r.slug : '';
  const variantKey = typeof r.variant_key === 'string' ? r.variant_key : '';
  if (!id || !itemId || !slug || !variantKey) return null;
  const sortOrder = Number(r.sort_order);
  const storage = Number(r.storage_gb);
  return {
    id,
    item_id: itemId,
    slug,
    name: typeof r.name === 'string' ? r.name : '',
    variant_key: variantKey,
    variant_name: typeof r.variant_name === 'string' ? r.variant_name : null,
    sort_order:
      r.sort_order != null && Number.isFinite(sortOrder) ? sortOrder : null,
    storage_gb: Number.isFinite(storage) && storage > 0 ? storage : null,
    min_price: toNonNegative(r.min_price),
    max_price: toNonNegative(r.max_price),
    merchant_count: toNonNegative(r.merchant_count),
  };
}

const isSafeCatalogSlug = (slug: string): boolean =>
  PRODUCT_SLUG_REGEX.test(slug) &&
  !slug.includes('..') &&
  !SENTINEL_RATE_API_TOKENS.has(slug.toLowerCase());

async function readItem(
  column: 'slug' | 'id',
  value: string
): Promise<RateItem | null> {
  const { data, error } = await untypedRate()
    .from('items')
    .select(ITEM_SELECT)
    .eq(column, value)
    .eq('status', 'published')
    .maybeSingle();
  if (error) {
    log.error('item lookup failed', { column, value, message: error.message });
    throw itemReadError('item', error);
  }
  return mapItemRow(data);
}

/** A published Item by its own slug. Needs M1+M2 (#1150). */
export async function getItemBySlug(slug: string): Promise<RateItem | null> {
  const clean =
    typeof slug === 'string' ? slug.replace(/\p{Cc}+/gu, '').trim() : '';
  if (!isSafeCatalogSlug(clean)) return null;
  return readItem('slug', clean);
}

/** A published Item by id. Needs M1+M2 (#1150). */
export async function getItemById(itemId: string): Promise<RateItem | null> {
  const clean = sanitizeRateEntityId(itemId);
  if (!clean) return null;
  return readItem('id', clean);
}

/**
 * An Item's published variants: sized ones by storage, then the rest. A
 * retired (archived) `unknown` variant is not one of them (design doc 4.4).
 */
export async function getItemVariants(
  itemId: string
): Promise<RateItemVariant[]> {
  const clean = sanitizeRateEntityId(itemId);
  if (!clean) return [];
  const rows = await fetchAllRows(
    'item variants',
    (from, to) =>
      untypedRate()
        .from('master_products')
        .select(ITEM_VARIANT_SELECT)
        .eq('item_id', clean)
        .eq('status', 'published')
        .order('id')
        .range(from, to)
        .then(
          throwIfItemSchemaMissing('item variants')
        ) as unknown as PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>
  );
  return sortItemVariants(
    rows.map(mapItemVariantRow).filter((v): v is RateItemVariant => v !== null)
  );
}

/** sort_order first, then storage ascending, then the key, so the order is stable. */
export function sortItemVariants(
  variants: readonly RateItemVariant[]
): RateItemVariant[] {
  return [...variants].sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const as = a.storage_gb ?? Number.MAX_SAFE_INTEGER;
    const bs = b.storage_gb ?? Number.MAX_SAFE_INTEGER;
    if (as !== bs) return as - bs;
    return a.variant_key.localeCompare(b.variant_key);
  });
}

/**
 * The listings of an Item with no stated size (`item_id` set, `cluster_id`
 * NULL). The trust view has no `item_id` (#1242 leaves it unchanged), so the
 * listing ids come from rate.products and their offers from the view.
 */
async function getItemUnknownVariantOffers(
  itemId: string
): Promise<MerchantOffer[]> {
  const idRows = await fetchAllRows(
    'item unknown-variant listings',
    (from, to) =>
      untypedRate()
        .from('products')
        .select('id, availability')
        .eq('item_id', itemId)
        .is('cluster_id', null)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>
  );
  const availability = new Map<string, OfferAvailability>();
  const ids: string[] = [];
  for (const raw of idRows as Array<{ id?: unknown; availability?: unknown }>) {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    if (!id) continue;
    ids.push(id);
    const a = toOfferAvailability(raw.availability);
    if (a) availability.set(id, a);
  }
  if (ids.length === 0) return [];
  const supabase = getRateClient();
  const viewRows: RawTrustViewRow[] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE);
    const rows = await fetchAllRows(
      'v_products_with_merchant_trust',
      (from, to) =>
        supabase
          .from('v_products_with_merchant_trust')
          .select(TRUST_VIEW_SELECT)
          .in('id', chunk)
          .order('price_current', { ascending: true })
          .order('id')
          .range(from, to)
    );
    viewRows.push(...(rows as unknown as RawTrustViewRow[]));
  }
  const extras = await sellerExtrasForTrustViewRows(viewRows);
  return viewRows
    .map((row) =>
      withOfferAvailability(
        mapTrustViewRowToMerchantOffer(
          row,
          extras.followerCounts.get(row.merchant_id),
          extras.metadataDosafeRisks.get(row.merchant_id)
        ),
        availability
      )
    )
    .sort((a, b) => a.price_current - b.price_current);
}

/**
 * An Item's offers grouped by variant, plus the "size not stated" group,
 * which never feeds a variant's prices (design doc 4.4, Q2).
 */
export async function getItemOffers(
  itemId: string,
  variants: readonly RateItemVariant[]
): Promise<RateItemOffers> {
  const clean = sanitizeRateEntityId(itemId);
  if (!clean) return { byVariant: new Map(), unknownVariant: [] };
  const [byVariant, unknownVariant] = await Promise.all([
    getMasterProductOffersBatch(variants.map((v) => v.id)),
    getItemUnknownVariantOffers(clean),
  ]);
  return { byVariant, unknownVariant };
}

/**
 * A catalogue slug as an Item: its own slug first, then an old variant slug
 * (design doc 5.1, Q1). Null when neither is published. Needs M1+M2 (#1150).
 */
export async function resolveCatalogSlug(
  slug: string
): Promise<CatalogSlugResolution | null> {
  const clean =
    typeof slug === 'string' ? slug.replace(/\p{Cc}+/gu, '').trim() : '';
  if (!isSafeCatalogSlug(clean)) return null;
  const item = await readItem('slug', clean);
  if (item) return { kind: 'item', item, variant: null };
  // An archived variant (a retired `unknown`, an archived duplicate) still
  // redirects its old URL to its Item; it is never offered as a size.
  const { data, error } = await untypedRate()
    .from('master_products')
    .select(`${ITEM_VARIANT_SELECT}, status`)
    .eq('slug', clean)
    .in('status', ['published', 'archived'])
    .maybeSingle();
  if (error) {
    log.error('variant slug lookup failed', {
      slug: clean,
      message: error.message,
    });
    throw itemReadError('variant', error);
  }
  const variant = mapItemVariantRow(data);
  if (!variant) {
    // A master not yet linked to an Item keeps its page; only a slug that is
    // no master at all (or a malformed row) is unknown here.
    const row = data as { id?: unknown; item_id?: unknown } | null;
    return row && sanitizeRateEntityId(row.id) && row.item_id == null
      ? { kind: 'unlinked', item: null, variant: null }
      : null;
  }
  const owner = await readItem('id', variant.item_id);
  if (!owner) return null;
  const retired = (data as { status?: unknown }).status === 'archived';
  return { kind: 'variant', item: owner, variant, retired };
}

/** A catalogue master's Item, with every published variant of that Item. */
export interface MasterItemLink {
  item: RateItem;
  variants: RateItemVariant[];
}

/**
 * The published Item of each master, by master id, with the Item's
 * published variants (DOS/Rate#1155). A master with no Item yet, or whose
 * Item is not published, is absent: it stays its own catalogue entry.
 * Needs M1+M2 (#1150); a missing table or column throws
 * ItemModelUnavailableError.
 */
export async function getItemLinksForMasters(
  masterIds: readonly string[]
): Promise<Map<string, MasterItemLink>> {
  const ids = Array.from(
    new Set(masterIds.map((id) => sanitizeRateEntityId(id)).filter(Boolean))
  );
  const links = new Map<string, MasterItemLink>();
  if (ids.length === 0) return links;
  const db = untypedRate();
  const read = async (
    what: string,
    keys: readonly string[],
    query: (chunk: string[]) => UntypedRateQuery
  ): Promise<unknown[]> =>
    readInChunks(
      keys,
      what,
      (chunk) =>
        query(chunk).then(throwIfItemSchemaMissing(what)) as PromiseLike<{
          data: unknown[] | null;
          error: { message?: string } | null;
        }>
    );

  const masterRows = (await read('item links', ids, (chunk) =>
    db.from('master_products').select('id, item_id').in('id', chunk)
  )) as Array<{ id?: unknown; item_id?: unknown }>;
  const itemIdByMaster = new Map<string, string>();
  for (const row of masterRows) {
    const id = sanitizeRateEntityId(row.id);
    const itemId = sanitizeRateEntityId(row.item_id);
    if (id && itemId) itemIdByMaster.set(id, itemId);
  }
  const itemIds = Array.from(new Set(itemIdByMaster.values()));
  if (itemIds.length === 0) return links;

  const [itemRows, variantRows] = await Promise.all([
    read('items', itemIds, (chunk) =>
      db
        .from('items')
        .select(ITEM_SELECT)
        .in('id', chunk)
        .eq('status', 'published')
    ),
    read('item variants', itemIds, (chunk) =>
      db
        .from('master_products')
        .select(ITEM_VARIANT_SELECT)
        .in('item_id', chunk)
        .eq('status', 'published')
    ),
  ]);
  const itemsById = new Map<string, RateItem>();
  for (const raw of itemRows) {
    const item = mapItemRow(raw);
    if (item) itemsById.set(item.id, item);
  }
  const variantsByItem = new Map<string, RateItemVariant[]>();
  for (const raw of variantRows) {
    const variant = mapItemVariantRow(raw);
    if (!variant) continue;
    const list = variantsByItem.get(variant.item_id) ?? [];
    list.push(variant);
    variantsByItem.set(variant.item_id, list);
  }
  for (const [masterId, itemId] of itemIdByMaster) {
    const item = itemsById.get(itemId);
    if (!item) continue;
    links.set(masterId, {
      item,
      variants: sortItemVariants(variantsByItem.get(itemId) ?? []),
    });
  }
  return links;
}

/**
 * Brand facets counted in Items, not variants (DOS/Rate#1155): one count per
 * published Item of the category, and one per published master not linked
 * to an Item yet. Needs M1+M2 (#1150).
 */
export async function getCategoryItemBrandFacets(
  categoryId: string
): Promise<{ name: string; count: number }[]> {
  const cleanId = sanitizeRateEntityId(categoryId);
  if (!cleanId) return [];
  const rows = (await fetchAllRows(
    'item brand facets',
    (from, to) =>
      untypedRate()
        .from('master_products')
        .select('id, brand, item_id')
        .eq('category_id', cleanId)
        .eq('status', 'published')
        .order('id')
        .range(from, to)
        .then(
          throwIfItemSchemaMissing('item brand facets')
        ) as unknown as PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>
  )) as Array<{ id?: unknown; brand?: unknown; item_id?: unknown }>;
  const linkedIds = Array.from(
    new Set(rows.map((r) => sanitizeRateEntityId(r.item_id)).filter(Boolean))
  );
  const publishedItems = new Set<string>();
  if (linkedIds.length > 0) {
    const itemRows = (await readInChunks(
      linkedIds,
      'item brand facets',
      (chunk) =>
        untypedRate()
          .from('items')
          .select('id')
          .in('id', chunk)
          .eq('status', 'published')
          .then(throwIfItemSchemaMissing('item brand facets')) as PromiseLike<{
          data: unknown[] | null;
          error: { message?: string } | null;
        }>
    )) as Array<{ id?: unknown }>;
    for (const r of itemRows) {
      const id = sanitizeRateEntityId(r.id);
      if (id) publishedItems.add(id);
    }
  }
  return countBrandsByItem(
    rows.map((r) => {
      const itemId = sanitizeRateEntityId(r.item_id);
      return {
        brand: typeof r.brand === 'string' ? r.brand : '',
        // A master whose Item is not published counts as itself.
        key:
          itemId && publishedItems.has(itemId)
            ? `item:${itemId}`
            : `master:${String(r.id ?? '')}`,
      };
    })
  );
}

/** Published Items, for "products tracked" (DOS/Rate#1155). Needs M1+M2. */
export async function countPublishedItems(): Promise<number> {
  const { count, error } = await (
    getRateClient() as unknown as {
      from: (table: string) => {
        select: (
          cols: string,
          opts: { count: 'exact'; head: true }
        ) => {
          eq: (
            col: string,
            val: unknown
          ) => PromiseLike<{
            count: number | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    }
  )
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');
  if (error) throw itemReadError('item count', error);
  return typeof count === 'number' && count > 0 ? count : 0;
}

/**
 * Variant slug to published Item slug, over every published master linked
 * to a published Item (DOS/Rate#1155: the sitemap lists Item URLs). Needs
 * M1+M2 (#1150).
 */
export async function getItemSlugByVariantSlug(): Promise<Map<string, string>> {
  const db = untypedRate();
  const page =
    (what: string, table: string, cols: string) => (from: number, to: number) =>
      db
        .from(table)
        .select(cols)
        .eq('status', 'published')
        .order('id')
        .range(from, to)
        .then(throwIfItemSchemaMissing(what)) as unknown as PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
  const [masterRows, itemRows] = await Promise.all([
    fetchAllRows(
      'sitemap item links',
      page('sitemap item links', 'master_products', 'slug, item_id')
    ),
    fetchAllRows('sitemap items', page('sitemap items', 'items', 'id, slug')),
  ]);
  const itemSlugById = new Map<string, string>();
  for (const raw of itemRows as Array<{ id?: unknown; slug?: unknown }>) {
    const id = sanitizeRateEntityId(raw.id);
    if (id && typeof raw.slug === 'string' && raw.slug) {
      itemSlugById.set(id, raw.slug);
    }
  }
  const out = new Map<string, string>();
  for (const raw of masterRows as Array<{
    slug?: unknown;
    item_id?: unknown;
  }>) {
    const itemSlug = itemSlugById.get(sanitizeRateEntityId(raw.item_id));
    if (itemSlug && typeof raw.slug === 'string' && raw.slug) {
      out.set(raw.slug, itemSlug);
    }
  }
  return out;
}
