import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyCategorySpecTemplate,
  normalizeOfferId,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  getMasterProductHref,
  normalizeOfferOriginalPrice,
  parseEcommerceUrlOrQuery,
  type CanonicalCategorySlug,
  type MasterProduct,
  type MasterProductFilterParams,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
  type ReviewAnalysisSummary,
  type ReviewItem,
  type UrlInspectionResult,
} from '@/lib/rate-api';
import { radarExportFields } from '@/lib/deal-radar';
import { compareTarget, lookupSlugAnyCase } from '@/lib/item-compare';
import {
  LEADERBOARD_SCORE_CRITERIA,
  displayedScore5,
  leaderboardCriteriaForCategory,
  scoreMasterProductForLeaderboard,
  sharedScoredCriteria,
  weightedCriteriaScore5,
  type FilteredReviewCountsByMaster,
  type LeaderboardCriteriaWeights,
  type LeaderboardScoreCriterion,
} from '@/lib/leaderboard-engine';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import { productRatingScore5 } from '@/lib/rate-domain';
import { roundScore } from '@/lib/rating-display';
import { listingCountForSaleState, saleStateOfMaster } from '@/lib/sale-state';
import {
  getCachedCompareMasterProducts,
  getCachedFilteredReviewCountsByMaster,
  getCachedInspectProductOrShopUrl,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
  getCachedMasterProductReviewSummary,
  getCachedMasterProductReviews,
  getCachedMasterProducts,
  sanitizeCachedEntityId,
} from './index';
import {
  BoundedSlidingWindowRateLimiter,
  SUPPORTED_PLATFORM_SLUGS,
  extractClientRateLimitKey,
  inspectRateLimiter,
  isSafeCrowdIngestHttpUrl,
  parseFiniteDecimalInput,
  resolveInspectObservedPrices,
  splitComparePinToken,
  withPublicOfferReviewRisk,
  withPublicReviewRisk,
} from './api-handler';
import {
  computeProductRadarSignal,
  getCrossPlatformDealRadar,
  type CrossPlatformDealRadarResponse,
} from './deals';
import {
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  detectPlatformFromInput,
  evaluateExtensionPriceVerdict,
} from './extension';
import { isItemModelOn } from './item-model';
import {
  getCachedCatalogSlugResolution,
  getCachedItemVariants,
} from './item-route';

export const CANONICAL_RATE_ORIGIN = 'https://rate.vn';
export const MCP_LATEST_PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export const MAX_MCP_BODY_BYTES = 16_384;
export const MAX_MCP_RESULT_ITEMS = 10;
export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
export const MCP_RATE_LIMIT_MAX_REQUESTS = 60;
export const MCP_RETRY_AFTER_SECONDS = 60;

const MAX_JSON_NESTING_DEPTH = 24;
const MAX_JSON_OBJECT_KEYS = 64;
const MAX_JSON_ARRAY_ITEMS = 64;
const MAX_RPC_ID_LENGTH = 256;
const MAX_SAFE_PUBLIC_ERROR_LENGTH = 512;
const MAX_SEARCH_PRICE_FILTER_CANDIDATES = 40;

const FORBIDDEN_OBJECT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
const DISALLOWED_IDENTIFIER_TOKENS = new Set([
  'null',
  'undefined',
  'nan',
  'none',
  'infinity',
  '-infinity',
  'true',
  'false',
  '__proto__',
  'constructor',
  'prototype',
]);
const DB_INTERNAL_ERROR_REGEX =
  /PGRST\d+|relation\s+"[^"]+"|column\s+"[^"]+"|permission denied|syntax error at|duplicate key value|violates foreign key|violates check constraint|schema\s+"rate"|rate-api:\s*failed to|supabase/i;

export const MCP_SERVER_INFO = {
  name: 'rate-vn-shopping-mcp',
  title: 'Rate.vn Verified Shopping & Price Truth MCP Server',
  version: '1.0.0',
} as const;

export const MCP_SERVER_INSTRUCTIONS =
  'Read-only Vietnamese tech shopping intelligence across 22 retail platforms and 5 device categories (smartphones, tablets, laptops, smartwatches, earbuds). Always cite canonical_citation_url (https://rate.vn/...) and freshness timestamps (observed_at / price_observed_at) when presenting prices, specifications, or 6-axis review trust verdicts to users. Sold-out and implausibly low bait-price listings are excluded from market floor calculations.';

export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Retry-After, MCP-Protocol-Version',
};

export const MCP_DISCOVERY_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, MCP-Protocol-Version, Authorization, X-Rate-Extension-Version',
};

export const mcpRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: MCP_RATE_LIMIT_WINDOW_MS,
  maxRequests: MCP_RATE_LIMIT_MAX_REQUESTS,
  maxBuckets: 5_000,
});

const SUPPORTED_PLATFORM_LIST = Array.from(SUPPORTED_PLATFORM_SLUGS) as [
  string,
  ...string[],
];

const SUPPORTED_CATEGORY_ENUM = z.enum([
  'all',
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const SUPPORTED_PLATFORM_OR_ALL_ENUM = z.enum([
  'all',
  ...SUPPORTED_PLATFORM_LIST,
]);

function isValidSlugToken(raw: string, maxLength = 120): boolean {
  if (typeof raw !== 'string') return false;
  const lower = raw.toLowerCase();
  return (
    raw.length >= 1 &&
    raw.length <= maxLength &&
    /^[a-zA-Z0-9._-]+$/.test(raw) &&
    /[a-zA-Z0-9]/.test(raw) &&
    !/^0+$/.test(raw) &&
    !DISALLOWED_IDENTIFIER_TOKENS.has(lower) &&
    !raw.startsWith('.') &&
    !raw.endsWith('.') &&
    !raw.includes('..')
  );
}

function isValidCompareSlugOrPin(token: string): boolean {
  const atIdx = token.indexOf('@');
  if (atIdx === -1) {
    return isValidSlugToken(token, 120);
  }
  if (token.indexOf('@', atIdx + 1) !== -1) return false;
  const slugPart = token.slice(0, atIdx);
  const variantPart = token.slice(atIdx + 1);
  return (
    isValidSlugToken(slugPart, 120) &&
    variantPart.length >= 1 &&
    variantPart.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(variantPart) &&
    /[a-zA-Z0-9]/.test(variantPart) &&
    !DISALLOWED_IDENTIFIER_TOKENS.has(variantPart.toLowerCase())
  );
}

function isValidBrandFilter(raw: string): boolean {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed.length >= 1 &&
    trimmed.length <= 40 &&
    /^[\p{L}\p{N}\s.+-]+$/u.test(trimmed) &&
    /[\p{L}\p{N}]/u.test(trimmed) &&
    !/^0+$/.test(trimmed) &&
    !DISALLOWED_IDENTIFIER_TOKENS.has(lower) &&
    !trimmed.includes('..')
  );
}

function isSupportedRetailOrRateInspectionUrl(rawUrl: string): boolean {
  if (!isSafeCrowdIngestHttpUrl(rawUrl)) return false;
  const detected = detectPlatformFromInput(null, rawUrl);
  if (detected && SUPPORTED_PLATFORM_SLUGS.has(detected)) return true;
  const parsed = parseEcommerceUrlOrQuery(rawUrl);
  if (
    typeof parsed.platform === 'string' &&
    SUPPORTED_PLATFORM_SLUGS.has(parsed.platform)
  ) {
    return true;
  }
  try {
    const urlObj = new URL(rawUrl.trim());
    const host = urlObj.hostname.toLowerCase();
    if (host === 'rate.vn' || host === 'www.rate.vn') {
      const cleanPath = urlObj.pathname.replace(/\/+$/, '');
      const segments = cleanPath.split('/').filter(Boolean);
      if (segments.length === 2) {
        const [section, identifier] = segments;
        const lowerSection = section!.toLowerCase();
        if (
          (lowerSection === 'smartphones' ||
            lowerSection === 'tablets' ||
            lowerSection === 'laptops' ||
            lowerSection === 'smartwatches' ||
            lowerSection === 'earbuds' ||
            lowerSection === 'merchants') &&
          isValidSlugToken(identifier!, 128)
        ) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

export const SearchVerifiedCatalogInputSchema = z
  .strictObject({
    query: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe(
        'Model name, series, or chipset keyword (for example "iPhone 16 Pro", "Snapdragon 8 Elite", "Sony WF-1000XM5").'
      ),
    category: SUPPORTED_CATEGORY_ENUM.default('all').describe(
      'Canonical device category filter across the 5 supported categories, or "all".'
    ),
    brand: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .refine(isValidBrandFilter, 'Invalid brand filter')
      .optional()
      .describe('Manufacturer name filter (for example "Apple", "Samsung").'),
    minPriceVnd: z
      .number()
      .int()
      .min(1)
      .max(MAX_VALID_VND_PRICE)
      .optional()
      .describe('Minimum verified VND price floor.'),
    maxPriceVnd: z
      .number()
      .int()
      .min(1)
      .max(MAX_VALID_VND_PRICE)
      .optional()
      .describe('Maximum verified VND price ceiling.'),
    sort: z
      .enum([
        'default',
        'price_asc',
        'price_desc',
        'rating_desc',
        'merchants_desc',
        'newest',
      ])
      .default('rating_desc')
      .describe('Sort order for matched catalog devices.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_MCP_RESULT_ITEMS)
      .default(5)
      .describe('Maximum results to return (1 to 10, default 5).'),
  })
  .refine(
    (v) =>
      v.minPriceVnd === undefined ||
      v.maxPriceVnd === undefined ||
      v.minPriceVnd <= v.maxPriceVnd,
    { message: 'minPriceVnd must not exceed maxPriceVnd' }
  );

export const GetStoreOffersAndPriceTruthInputSchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((v) => isValidSlugToken(v, 120), 'Invalid product slug')
    .describe(
      'Canonical product or item slug on Rate.vn (for example "apple-iphone-16-pro-max-256gb").'
    ),
  officialOnly: z
    .boolean()
    .default(false)
    .describe(
      'When true, keep only verified Official Mall / authorized chain listings.'
    ),
  platform: SUPPORTED_PLATFORM_OR_ALL_ENUM.default('all').describe(
    'Optional filter for one of the 22 tracked Vietnamese retail platforms, or "all".'
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_MCP_RESULT_ITEMS)
    .default(MAX_MCP_RESULT_ITEMS)
    .describe('Maximum verified in-stock offers to return (1 to 10).'),
});

export const CompareDevicesByUseCaseInputSchema = z
  .strictObject({
    slugs: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(185)
          .refine(isValidCompareSlugOrPin, 'Invalid compare product slug')
      )
      .min(2)
      .max(4)
      .describe(
        '2 to 4 canonical product slugs in the same device category to compare side-by-side.'
      ),
    persona: z
      .enum([
        'balanced',
        'photography',
        'gaming',
        'endurance',
        'business',
        'value_hunter',
      ])
      .default('balanced')
      .describe('Preset use-case scoring profile across 5 JReviews criteria.'),
    weights: z
      .strictObject({
        screen: z.number().min(0).max(100).optional(),
        performance: z.number().min(0).max(100).optional(),
        camera: z.number().min(0).max(100).optional(),
        battery: z.number().min(0).max(100).optional(),
        value: z.number().min(0).max(100).optional(),
      })
      .optional()
      .describe(
        'Optional custom weight overrides (0 to 100) for screen, performance, camera (or ANC on earbuds), battery, and value.'
      ),
  })
  .refine(
    (v) => new Set(v.slugs.map((s) => s.toLowerCase())).size >= 2,
    'Provide at least 2 distinct product slugs'
  );

export const AuditListingUrlInputSchema = z.strictObject({
  url: z
    .string()
    .trim()
    .min(8)
    .max(1024)
    .refine(
      (v) => isSafeCrowdIngestHttpUrl(v),
      'Provide a valid public HTTP/HTTPS listing URL'
    )
    .refine(
      isSupportedRetailOrRateInspectionUrl,
      'URL must belong to one of the 22 supported Vietnamese retail platforms or rate.vn'
    )
    .describe(
      'Public listing URL from one of the 22 supported Vietnamese e-commerce platforms (Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, TGDD, FPT Shop, Hoang Ha, Di Dong Viet, Phong Vu, Dien May Xanh, TopZone, GearVN, Nguyen Kim, ShopDunk, HACOM, Clickbuy, Viettel Store, Pico, MediaMart, MemoryZone, An Phat).'
    ),
  observedPriceVnd: z
    .number()
    .int()
    .min(1)
    .max(MAX_VALID_VND_PRICE)
    .optional()
    .describe('Optional live selling price in VND observed on the page.'),
  observedOriginalPriceVnd: z
    .number()
    .int()
    .min(1)
    .max(MAX_VALID_VND_PRICE)
    .optional()
    .describe(
      'Optional strikethrough original price in VND declared by the seller.'
    ),
});

export const GetGenuineDealsInputSchema = z.strictObject({
  category: SUPPORTED_CATEGORY_ENUM.default('all').describe(
    'Canonical device category filter across the 5 tech categories, or "all".'
  ),
  platform: SUPPORTED_PLATFORM_OR_ALL_ENUM.default('all').describe(
    'Optional filter for one of the 22 tracked retail platforms, or "all".'
  ),
  maxBudgetVnd: z
    .number()
    .int()
    .min(1)
    .max(MAX_VALID_VND_PRICE)
    .optional()
    .describe('Optional maximum VND budget ceiling for returned deals.'),
  officialOnly: z
    .boolean()
    .default(false)
    .describe(
      'When true, return deals from Official Mall / authorized stores only.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_MCP_RESULT_ITEMS)
    .default(MAX_MCP_RESULT_ITEMS)
    .describe('Maximum genuine deals to return (1 to 10, default 10).'),
});

export type McpToolName =
  | 'search_verified_catalog'
  | 'get_22_store_offers_and_price_truth'
  | 'compare_devices_by_use_case'
  | 'audit_listing_url'
  | 'get_genuine_deals';

export interface McpToolAnnotations {
  title: string;
  readOnlyHint: true;
  destructiveHint: false;
  idempotentHint: true;
  openWorldHint: false;
}

export interface McpToolDefinition {
  name: McpToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

function exportToolInputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return {
    ...raw,
    type: 'object',
    additionalProperties: false,
  };
}

const READ_ONLY_ANNOTATIONS = (title: string): McpToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'search_verified_catalog',
    title: 'Search Verified Tech Catalog',
    description:
      'Search normalized tech products across 5 categories (smartphones, tablets, laptops, smartwatches, earbuds) with brand and VND price filters. Excludes sold-out and bait-price traps from floor prices and returns canonical_citation_url plus freshness timestamps (max 10 items).',
    inputSchema: exportToolInputJsonSchema(SearchVerifiedCatalogInputSchema),
    annotations: READ_ONLY_ANNOTATIONS('Search Verified Tech Catalog'),
  },
  {
    name: 'get_22_store_offers_and_price_truth',
    title: 'Get 22-Store Offers & Price Truth',
    description:
      'Return verified in-stock offers across 22 Vietnamese retail platforms, historical floor/median price truth, Deal Radar fake-sale flags, Bayesian rating, and 6-axis Review Trust Model v2 summary for a product slug (max 10 offers).',
    inputSchema: exportToolInputJsonSchema(
      GetStoreOffersAndPriceTruthInputSchema
    ),
    annotations: READ_ONLY_ANNOTATIONS('Get 22-Store Offers & Price Truth'),
  },
  {
    name: 'compare_devices_by_use_case',
    title: 'Compare Devices by Use Case',
    description:
      'Compare 2 to 4 same-category product slugs side-by-side across standardized 10-group specs, verified multi-store floor prices, and 5-criterion JReviews scores with optional persona or custom criterion weight overrides.',
    inputSchema: exportToolInputJsonSchema(CompareDevicesByUseCaseInputSchema),
    annotations: READ_ONLY_ANNOTATIONS('Compare Devices by Use Case'),
  },
  {
    name: 'audit_listing_url',
    title: 'Audit Marketplace Listing URL',
    description:
      'Inspect a product listing URL from any of the 22 supported Vietnamese marketplaces and retail chains, returning catalog match, 5-level fake-discount price verdict, accessory gatekeeper check, and DOSafe + AI review seller risk scores.',
    inputSchema: exportToolInputJsonSchema(AuditListingUrlInputSchema),
    annotations: READ_ONLY_ANNOTATIONS('Audit Marketplace Listing URL'),
  },
  {
    name: 'get_genuine_deals',
    title: 'Get Genuine Multi-Store Floor Deals',
    description:
      'List verified below-median and cross-platform floor deals across 22 Vietnamese retail platforms (limit <= 10), filtering out sold-out listings, implausibly low bait traps, high-risk sellers, and inflated strikethrough fake sales.',
    inputSchema: exportToolInputJsonSchema(GetGenuineDealsInputSchema),
    annotations: READ_ONLY_ANNOTATIONS('Get Genuine Multi-Store Floor Deals'),
  },
] as const;

export interface McpResolvedCompareTarget {
  variantSlug: string | null;
  itemId: string | null;
}

export interface McpDataReaders {
  getCachedMasterProducts: (
    params?: MasterProductFilterParams
  ) => Promise<MasterProduct[]>;
  getCachedMasterProductBySlug: (slug: string) => Promise<MasterProduct | null>;
  getCachedMasterProductOffers: (
    masterProductId: string
  ) => Promise<MerchantOffer[]>;
  getCachedMasterProductReviews: (
    masterProductId: string
  ) => Promise<ReviewItem[]>;
  getCachedMasterProductReviewSummary: (
    masterProductId: string,
    existingReviews?: ReviewItem[]
  ) => Promise<ReviewAnalysisSummary>;
  getCachedMasterProductPriceHistory: (
    masterProductId: string,
    existingOffers?: MerchantOffer[]
  ) => Promise<MasterProductPriceHistorySummary>;
  getCachedCompareMasterProducts: (
    slugsCsv: string
  ) => Promise<MasterProduct[]>;
  getCachedFilteredReviewCountsByMaster: () => Promise<FilteredReviewCountsByMaster>;
  getCachedInspectProductOrShopUrl: (
    rawQuery: string
  ) => Promise<UrlInspectionResult>;
  getCrossPlatformDealRadar: (options?: {
    categorySlug?: CanonicalCategorySlug | 'all';
    platform?: string;
    limit?: number;
  }) => Promise<CrossPlatformDealRadarResponse>;
  resolveCompareTokenTarget?: (
    rawToken: string
  ) => Promise<McpResolvedCompareTarget>;
  nowIso?: () => string;
}

const ITEM_RESOLVER_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;

async function defaultResolveCompareTokenTarget(
  rawToken: string
): Promise<McpResolvedCompareTarget> {
  const typed = splitComparePinToken(rawToken, true);
  const lower = splitComparePinToken(rawToken, false);
  if (!isItemModelOn()) {
    // Without the Item model, explicit @variant pins have no variant table to resolve against.
    return typed.variantKey === null
      ? { variantSlug: lower.slug, itemId: null }
      : { variantSlug: null, itemId: null };
  }
  if (!ITEM_RESOLVER_SLUG_REGEX.test(typed.slug)) {
    return typed.variantKey === null
      ? { variantSlug: lower.slug, itemId: null }
      : { variantSlug: null, itemId: null };
  }
  try {
    const found = await lookupSlugAnyCase(
      typed.slug,
      getCachedCatalogSlugResolution
    );
    const catalogRes = found.found;
    const cmpRes =
      !catalogRes || catalogRes.kind === 'unlinked'
        ? { kind: 'unlinked' as const }
        : catalogRes.kind === 'item'
          ? {
              kind: 'item' as const,
              item: catalogRes.item,
              variants: await getCachedItemVariants(catalogRes.item),
            }
          : {
              kind: 'variant' as const,
              item: catalogRes.item,
              variant: catalogRes.variant,
              variants: await getCachedItemVariants(catalogRes.item),
              retired: catalogRes.retired,
            };
    const target = compareTarget(cmpRes, lower);
    if (!target) {
      return { variantSlug: null, itemId: null };
    }
    return { variantSlug: target.variantSlug, itemId: target.itemId };
  } catch {
    return typed.variantKey === null
      ? { variantSlug: lower.slug, itemId: null }
      : { variantSlug: null, itemId: null };
  }
}

const DEFAULT_MCP_READERS: McpDataReaders = {
  getCachedMasterProducts,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductReviews,
  getCachedMasterProductReviewSummary,
  getCachedMasterProductPriceHistory,
  getCachedCompareMasterProducts,
  getCachedFilteredReviewCountsByMaster,
  getCachedInspectProductOrShopUrl,
  getCrossPlatformDealRadar,
  resolveCompareTokenTarget: defaultResolveCompareTokenTarget,
  nowIso: () => new Date().toISOString(),
};

const PERSONA_WEIGHT_PRESETS: Record<
  | 'balanced'
  | 'photography'
  | 'gaming'
  | 'endurance'
  | 'business'
  | 'value_hunter',
  LeaderboardCriteriaWeights
> = {
  balanced: {
    screen: 20,
    performance: 20,
    camera: 20,
    battery: 20,
    value: 20,
  },
  photography: {
    screen: 20,
    performance: 15,
    camera: 45,
    battery: 10,
    value: 10,
  },
  gaming: {
    screen: 25,
    performance: 45,
    camera: 5,
    battery: 15,
    value: 10,
  },
  endurance: {
    screen: 15,
    performance: 15,
    camera: 10,
    battery: 45,
    value: 15,
  },
  business: {
    screen: 35,
    performance: 25,
    camera: 10,
    battery: 20,
    value: 10,
  },
  value_hunter: {
    screen: 15,
    performance: 20,
    camera: 10,
    battery: 15,
    value: 40,
  },
};

function toWellFormedString(raw: string): string {
  const maybeWellFormed = (raw as string & { toWellFormed?: () => string })
    .toWellFormed;
  if (typeof maybeWellFormed === 'function') {
    return maybeWellFormed.call(raw);
  }
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < raw.length ? raw.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += raw[i]! + raw[i + 1]!;
        i++;
      } else {
        out += '\ufffd';
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += '\ufffd';
    } else {
      out += raw[i]!;
    }
  }
  return out;
}

export function deepSanitizeWellFormed<T>(value: T): T {
  if (typeof value === 'string') {
    return toWellFormedString(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepSanitizeWellFormed(entry)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) continue;
      if (!Object.hasOwn(value, key)) continue;
      const safeKey = toWellFormedString(key);
      if (FORBIDDEN_OBJECT_KEYS.has(safeKey)) continue;
      out[safeKey] = deepSanitizeWellFormed(
        (value as Record<string, unknown>)[key]
      );
    }
    return out as T;
  }
  return value;
}

function sanitizeMcpPublicText(raw: unknown, maxLength = 320): string {
  if (typeof raw !== 'string') return '';
  const cleaned = toWellFormedString(raw)
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength).trim()
    : cleaned;
}

function isSafeExternalHttpUrlWithMax(
  rawUrl: string,
  maxLength = 2048
): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > maxLength ||
    /\s/.test(trimmed) ||
    /\p{Cc}/u.test(trimmed)
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^\d+(?:\.\d+){3}$/.test(host)
    ) {
      return false;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sanitizeExternalOfferUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = toWellFormedString(raw).trim();
  if (!isSafeExternalHttpUrlWithMax(trimmed, 2048)) return null;
  return trimmed;
}

export function buildCanonicalRateUrl(pathOrHref: string): string {
  const cleaned =
    typeof pathOrHref === 'string' ? toWellFormedString(pathOrHref).trim() : '';
  if (
    !cleaned ||
    !cleaned.startsWith('/') ||
    cleaned.startsWith('//') ||
    cleaned.includes('\\') ||
    /[\s\p{Cc}]/u.test(cleaned)
  ) {
    return CANONICAL_RATE_ORIGIN;
  }
  const pathPart = cleaned.split(/[?#]/)[0] ?? '';
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    return CANONICAL_RATE_ORIGIN;
  }
  return `${CANONICAL_RATE_ORIGIN}${cleaned}`;
}

function buildSafeMerchantCitationUrl(
  rawMerchantId: unknown,
  fallbackUrl: string
): string {
  const safeId = sanitizeCachedEntityId(rawMerchantId);
  return safeId
    ? buildCanonicalRateUrl(`/merchants/${encodeURIComponent(safeId)}`)
    : fallbackUrl;
}

function resolveValidIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function resolveProductObservedAt(
  product: { updated_at?: unknown } | null | undefined,
  fallbackIso: string
): {
  observedAt: string;
  freshnessSource: 'product_updated_at' | 'cache_snapshot';
} {
  const fromProduct = resolveValidIsoTimestamp(product?.updated_at);
  if (fromProduct) {
    return { observedAt: fromProduct, freshnessSource: 'product_updated_at' };
  }
  return { observedAt: fallbackIso, freshnessSource: 'cache_snapshot' };
}

function computeMedianPrice(prices: readonly number[]): number | null {
  const valid = prices
    .filter((v) => Number.isFinite(v) && v > 0 && v <= MAX_VALID_VND_PRICE)
    .sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid]!;
  return Math.round((valid[mid - 1]! + valid[mid]!) / 2);
}

function getPlausibleInStockMerchantOffers(offers: readonly MerchantOffer[]): {
  inStockOffers: MerchantOffer[];
  plausibleInStockOffers: MerchantOffer[];
  excludedUnavailableCount: number;
  excludedBaitCount: number;
} {
  const safeAll = Array.isArray(offers)
    ? offers.filter((o): o is MerchantOffer =>
        Boolean(o && typeof o === 'object' && !Array.isArray(o))
      )
    : [];
  const inStockOffers = safeAll.filter((o) => {
    if (isOfferUnavailable(o)) return false;
    const price = parseFiniteDecimalInput(o.price_current);
    return Number.isFinite(price) && price > 0 && price <= MAX_VALID_VND_PRICE;
  });
  const plausibleInStockOffers = plausibleOffers(inStockOffers);
  return {
    inStockOffers,
    plausibleInStockOffers,
    excludedUnavailableCount: Math.max(
      0,
      safeAll.length - inStockOffers.length
    ),
    excludedBaitCount: Math.max(
      0,
      inStockOffers.length - plausibleInStockOffers.length
    ),
  };
}

function resolveExpertRating10(product: MasterProduct): number | null {
  const raw = parseFiniteDecimalInput(product.expert_rating);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100) return null;
  const normalized10 = raw > 10 ? raw / 10 : raw <= 5 ? raw * 2 : raw;
  return roundScore(Math.min(10, normalized10), 1);
}

function toBoundedPositiveVndOrNull(raw: unknown): number | null {
  const parsed = parseFiniteDecimalInput(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_VALID_VND_PRICE) {
    return null;
  }
  return Math.round(parsed);
}

export function sanitizeMcpErrorMessage(
  rawMessage: unknown,
  fallbackMessage: string
): string {
  if (typeof rawMessage !== 'string') return fallbackMessage;
  const cleaned = toWellFormedString(rawMessage)
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || DB_INTERNAL_ERROR_REGEX.test(cleaned)) {
    return fallbackMessage;
  }
  return cleaned.length > MAX_SAFE_PUBLIC_ERROR_LENGTH
    ? `${cleaned.slice(0, MAX_SAFE_PUBLIC_ERROR_LENGTH - 3).trim()}...`
    : cleaned;
}

function formatZodIssuesForMcp(issues: readonly z.core.$ZodIssue[]): string {
  const parts: string[] = [];
  for (const issue of issues.slice(0, 4)) {
    const rawPath =
      issue.path.length > 0
        ? issue.path.map((seg) => String(seg)).join('.')
        : 'arguments';
    const pathLabel = sanitizeMcpPublicText(rawPath, 64) || 'arguments';
    const msg = sanitizeMcpErrorMessage(issue.message, 'invalid value');
    parts.push(`${pathLabel}: ${msg}`);
  }
  const combined =
    parts.length > 0
      ? `Invalid tool arguments (${parts.join('; ')})`
      : 'Invalid tool arguments';
  return sanitizeMcpErrorMessage(combined, 'Invalid tool arguments');
}

interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

function buildToolCallResult(
  payload: Record<string, unknown>,
  isError = false
): McpToolCallResult {
  const sanitized = deepSanitizeWellFormed(payload);
  return {
    content: [{ type: 'text', text: JSON.stringify(sanitized) }],
    structuredContent: sanitized,
    ...(isError ? { isError: true } : {}),
  };
}

async function executeSearchVerifiedCatalog(
  rawArgs: z.infer<typeof SearchVerifiedCatalogInputSchema>,
  readers: McpDataReaders
): Promise<McpToolCallResult> {
  const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
  const limit = Math.min(rawArgs.limit, MAX_MCP_RESULT_ITEMS);
  const needsVerifiedPriceFilteringOrSorting =
    rawArgs.minPriceVnd !== undefined ||
    rawArgs.maxPriceVnd !== undefined ||
    rawArgs.sort === 'price_asc' ||
    rawArgs.sort === 'price_desc';
  const candidateLimit = needsVerifiedPriceFilteringOrSorting
    ? Math.min(MAX_SEARCH_PRICE_FILTER_CANDIDATES, Math.max(limit * 3, 24))
    : limit;

  const products = await readers.getCachedMasterProducts({
    categorySlug: rawArgs.category,
    brands: rawArgs.brand ? [rawArgs.brand] : undefined,
    search: rawArgs.query,
    minPrice: rawArgs.minPriceVnd,
    maxPrice: rawArgs.maxPriceVnd,
    sort: rawArgs.sort,
    limit: candidateLimit,
  });

  const boundedCandidates = products.slice(0, candidateLimit);
  const offersList = await Promise.all(
    boundedCandidates.map((p) => readers.getCachedMasterProductOffers(p.id))
  );

  const computedItems = boundedCandidates.map((stored, idx) => {
    const category = getMasterProductCategorySlug(stored);
    const scoped = applyCategorySpecTemplate(category, stored);
    const rawOffers = offersList[idx] ?? [];
    const {
      inStockOffers,
      plausibleInStockOffers,
      excludedUnavailableCount,
      excludedBaitCount,
    } = getPlausibleInStockMerchantOffers(rawOffers);
    const plausiblePrices = plausibleInStockOffers.map((o) =>
      Math.round(parseFiniteDecimalInput(o.price_current))
    );
    const verifiedMinPrice =
      plausiblePrices.length > 0 ? Math.min(...plausiblePrices) : null;
    const verifiedMaxPrice =
      plausiblePrices.length > 0 ? Math.max(...plausiblePrices) : null;
    const verifiedMedianPrice = computeMedianPrice(plausiblePrices);
    const href = getMasterProductHref(scoped);
    const { observedAt, freshnessSource } = resolveProductObservedAt(
      scoped,
      snapshotAt
    );

    return {
      slug: sanitizeMcpPublicText(scoped.slug, 120),
      name: sanitizeMcpPublicText(scoped.name, 240),
      brand: sanitizeMcpPublicText(scoped.brand, 80),
      category,
      verified_min_price_vnd: verifiedMinPrice,
      verified_median_price_vnd: verifiedMedianPrice,
      verified_max_price_vnd: verifiedMaxPrice,
      in_stock_offer_count: plausibleInStockOffers.length,
      excluded_unavailable_offer_count: excludedUnavailableCount,
      excluded_bait_offer_count: excludedBaitCount,
      sale_state: saleStateOfMaster(
        scoped,
        listingCountForSaleState(rawOffers.length, inStockOffers.length)
      ),
      bayesian_rating_5: productRatingScore5(scoped),
      expert_rating_10: resolveExpertRating10(scoped),
      authentic_review_count:
        typeof scoped.authentic_review_count === 'number' &&
        Number.isFinite(scoped.authentic_review_count) &&
        scoped.authentic_review_count >= 0
          ? Math.trunc(scoped.authentic_review_count)
          : 0,
      key_specs: scoped.key_specs ?? {},
      deal_radar: radarExportFields(
        computeProductRadarSignal(scoped, plausibleInStockOffers)
      ),
      canonical_citation_url: buildCanonicalRateUrl(href),
      observed_at: observedAt,
      price_observed_at: observedAt,
      freshness_source: freshnessSource,
    };
  });

  const priceFiltered = computedItems.filter((item) => {
    if (
      rawArgs.minPriceVnd === undefined &&
      rawArgs.maxPriceVnd === undefined
    ) {
      return true;
    }
    if (item.verified_min_price_vnd === null) return false;
    if (
      rawArgs.minPriceVnd !== undefined &&
      item.verified_min_price_vnd < rawArgs.minPriceVnd
    ) {
      return false;
    }
    if (
      rawArgs.maxPriceVnd !== undefined &&
      item.verified_min_price_vnd > rawArgs.maxPriceVnd
    ) {
      return false;
    }
    return true;
  });

  if (rawArgs.sort === 'price_asc' || rawArgs.sort === 'price_desc') {
    priceFiltered.sort((a, b) => {
      if (
        a.verified_min_price_vnd === null &&
        b.verified_min_price_vnd === null
      ) {
        return 0;
      }
      if (a.verified_min_price_vnd === null) return 1;
      if (b.verified_min_price_vnd === null) return -1;
      return rawArgs.sort === 'price_asc'
        ? a.verified_min_price_vnd - b.verified_min_price_vnd
        : b.verified_min_price_vnd - a.verified_min_price_vnd;
    });
  }

  const items = priceFiltered.slice(0, limit);
  const categoryUrl =
    rawArgs.category === 'all'
      ? CANONICAL_RATE_ORIGIN
      : buildCanonicalRateUrl(`/${rawArgs.category}`);

  return buildToolCallResult({
    ok: true,
    tool: 'search_verified_catalog',
    category_filter: rawArgs.category,
    returned_count: items.length,
    max_limit: MAX_MCP_RESULT_ITEMS,
    canonical_citation_url: categoryUrl,
    observed_at: snapshotAt,
    items,
  });
}

async function executeGetStoreOffersAndPriceTruth(
  rawArgs: z.infer<typeof GetStoreOffersAndPriceTruthInputSchema>,
  readers: McpDataReaders
): Promise<McpToolCallResult> {
  const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
  const limit = Math.min(rawArgs.limit, MAX_MCP_RESULT_ITEMS);

  let resolvedSlug = rawArgs.slug;
  if (readers.resolveCompareTokenTarget) {
    const resolved = await readers.resolveCompareTokenTarget(rawArgs.slug);
    if (resolved.variantSlug) resolvedSlug = resolved.variantSlug;
  }

  const storedProduct =
    await readers.getCachedMasterProductBySlug(resolvedSlug);
  if (!storedProduct) {
    return buildToolCallResult(
      {
        ok: false,
        error: 'Product not found in Rate.vn verified catalog',
        requested_slug: rawArgs.slug,
        canonical_citation_url: CANONICAL_RATE_ORIGIN,
        observed_at: snapshotAt,
      },
      true
    );
  }

  const category = getMasterProductCategorySlug(storedProduct);
  const product = applyCategorySpecTemplate(category, storedProduct);
  const [rawOffers, rawReviews] = await Promise.all([
    readers.getCachedMasterProductOffers(product.id),
    readers.getCachedMasterProductReviews(product.id),
  ]);
  const [reviewSummary, priceHistory] = await Promise.all([
    readers.getCachedMasterProductReviewSummary(product.id, rawReviews),
    readers.getCachedMasterProductPriceHistory(product.id, rawOffers),
  ]);

  const {
    inStockOffers,
    plausibleInStockOffers,
    excludedUnavailableCount,
    excludedBaitCount,
  } = getPlausibleInStockMerchantOffers(rawOffers);

  const plausibleOfferIdSet = new Set<string>();
  for (const offer of plausibleInStockOffers) {
    if (offer.id) {
      plausibleOfferIdSet.add(offer.id);
      const normalized = normalizeOfferId(offer.id);
      if (normalized) plausibleOfferIdSet.add(normalized);
    }
  }

  const latestPointIsoByOfferId = new Map<string, string>();
  let latestGlobalPriceIso: string | null = null;
  for (const pt of priceHistory?.points ?? []) {
    // Ignore synthetic live_listing fallback points (`id < 0`) so unrecorded offers
    // never overwrite real crawl timestamps with `new Date()`.
    if (
      pt.source === 'live_listing' ||
      (typeof pt.id === 'number' && pt.id < 0)
    ) {
      continue;
    }
    const iso = resolveValidIsoTimestamp(pt.recorded_at);
    if (!iso) continue;
    const rawPtOfferId = typeof pt.product_id === 'string' ? pt.product_id : '';
    const normPtOfferId = normalizeOfferId(rawPtOfferId);
    if (rawPtOfferId) {
      const existing = latestPointIsoByOfferId.get(rawPtOfferId);
      if (!existing || iso > existing) {
        latestPointIsoByOfferId.set(rawPtOfferId, iso);
      }
    }
    if (normPtOfferId && normPtOfferId !== rawPtOfferId) {
      const existingNorm = latestPointIsoByOfferId.get(normPtOfferId);
      if (!existingNorm || iso > existingNorm) {
        latestPointIsoByOfferId.set(normPtOfferId, iso);
      }
    }
    if (
      (rawPtOfferId && plausibleOfferIdSet.has(rawPtOfferId)) ||
      (normPtOfferId && plausibleOfferIdSet.has(normPtOfferId))
    ) {
      if (!latestGlobalPriceIso || iso > latestGlobalPriceIso) {
        latestGlobalPriceIso = iso;
      }
    }
  }

  const { observedAt: productObservedAt, freshnessSource } =
    resolveProductObservedAt(product, snapshotAt);
  const productPriceObservedAt = latestGlobalPriceIso ?? productObservedAt;

  const allPlausiblePrices = plausibleInStockOffers.map((o) =>
    Math.round(parseFiniteDecimalInput(o.price_current))
  );
  const verifiedMinPrice =
    allPlausiblePrices.length > 0 ? Math.min(...allPlausiblePrices) : null;
  const verifiedMaxPrice =
    allPlausiblePrices.length > 0 ? Math.max(...allPlausiblePrices) : null;
  const verifiedMedianPrice = computeMedianPrice(allPlausiblePrices);

  const filteredOffers = plausibleInStockOffers
    .filter((o) => {
      if (rawArgs.officialOnly && !o.merchant?.is_official) return false;
      if (
        rawArgs.platform !== 'all' &&
        String(o.merchant?.platform || o.platform || '').toLowerCase() !==
          rawArgs.platform
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const priceDiff =
        parseFiniteDecimalInput(a.price_current) -
        parseFiniteDecimalInput(b.price_current);
      if (priceDiff !== 0) return priceDiff;
      return (
        (b.merchant?.is_official ? 1 : 0) - (a.merchant?.is_official ? 1 : 0)
      );
    })
    .slice(0, limit);

  const productHref = getMasterProductHref(product);
  const productCitationUrl = buildCanonicalRateUrl(productHref);

  const offers = filteredOffers.map((rawOffer) => {
    const publicOffer = withPublicOfferReviewRisk(rawOffer);
    const currentPrice = Math.round(
      parseFiniteDecimalInput(publicOffer.price_current)
    );
    const rawOrig = parseFiniteDecimalInput(publicOffer.price_original);
    const normalizedOrig = normalizeOfferOriginalPrice(
      currentPrice,
      Number.isFinite(rawOrig) ? rawOrig : 0
    );
    const normOfferId = normalizeOfferId(publicOffer.id);
    const offerAnalysis =
      priceHistory?.byOffer &&
      Object.hasOwn(priceHistory.byOffer, publicOffer.id)
        ? priceHistory.byOffer[publicOffer.id]
        : normOfferId &&
            priceHistory?.byOffer &&
            Object.hasOwn(priceHistory.byOffer, normOfferId)
          ? priceHistory.byOffer[normOfferId]
          : null;
    const offerObservedAt =
      latestPointIsoByOfferId.get(publicOffer.id) ??
      (normOfferId ? latestPointIsoByOfferId.get(normOfferId) : undefined) ??
      productPriceObservedAt;
    const platformSlug = sanitizeMcpPublicText(
      publicOffer.merchant?.platform || publicOffer.platform || 'shopee',
      32
    ).toLowerCase();

    return {
      id: sanitizeMcpPublicText(publicOffer.id, 128),
      platform: platformSlug,
      title: sanitizeMcpPublicText(publicOffer.title, 280),
      price_current_vnd: currentPrice,
      price_original_vnd: normalizedOrig,
      discount_verdict: offerAnalysis?.verdict ?? null,
      historical_median_price_vnd:
        offerAnalysis?.historical_median_price ?? verifiedMedianPrice,
      merchant: {
        id: sanitizeMcpPublicText(publicOffer.merchant?.id, 128),
        name: sanitizeMcpPublicText(publicOffer.merchant?.name, 160),
        is_official_mall: Boolean(publicOffer.merchant?.is_official),
        risk_score: publicOffer.merchant?.risk_score ?? null,
        dosafe_risk_score: publicOffer.merchant?.dosafe_risk_score ?? null,
        review_risk_score: publicOffer.merchant?.review_risk_score ?? null,
      },
      offer_url: sanitizeExternalOfferUrl(publicOffer.url),
      canonical_citation_url: `${productCitationUrl}#offers-table`,
      price_observed_at: offerObservedAt,
      observed_at: offerObservedAt,
    };
  });

  return buildToolCallResult({
    ok: true,
    tool: 'get_22_store_offers_and_price_truth',
    canonical_citation_url: productCitationUrl,
    observed_at: productObservedAt,
    price_observed_at: productPriceObservedAt,
    freshness_source: latestGlobalPriceIso ? 'price_history' : freshnessSource,
    product: {
      slug: sanitizeMcpPublicText(product.slug, 120),
      name: sanitizeMcpPublicText(product.name, 240),
      brand: sanitizeMcpPublicText(product.brand, 80),
      category,
      sale_state: saleStateOfMaster(
        product,
        listingCountForSaleState(rawOffers.length, inStockOffers.length)
      ),
      bayesian_rating_5: productRatingScore5(product),
      expert_rating_10: resolveExpertRating10(product),
      authentic_review_count:
        typeof product.authentic_review_count === 'number' &&
        Number.isFinite(product.authentic_review_count) &&
        product.authentic_review_count >= 0
          ? Math.trunc(product.authentic_review_count)
          : 0,
      key_specs: product.key_specs ?? {},
      canonical_citation_url: productCitationUrl,
      observed_at: productObservedAt,
    },
    price_truth: {
      verified_min_price_vnd: verifiedMinPrice,
      verified_median_price_vnd: verifiedMedianPrice,
      verified_max_price_vnd: verifiedMaxPrice,
      lowest_ever_price_vnd: priceHistory?.lowestEverPrice ?? null,
      lowest_ever_date: priceHistory?.lowestEverDate ?? null,
      highest_ever_price_vnd: priceHistory?.highestEverPrice ?? null,
      fake_discount_offer_count: priceHistory?.fakeDiscountCount ?? 0,
      genuine_deal_offer_count: priceHistory?.genuineDealCount ?? 0,
      total_plausible_in_stock_offers: plausibleInStockOffers.length,
      excluded_unavailable_offer_count: excludedUnavailableCount,
      excluded_bait_offer_count: excludedBaitCount,
      deal_radar: radarExportFields(
        computeProductRadarSignal(product, plausibleInStockOffers)
      ),
    },
    review_trust_summary: {
      trust_model: 'review_trust_v2_6_axis',
      total_analyzed: reviewSummary?.total_analyzed ?? 0,
      authentic_pct: reviewSummary?.authentic_pct ?? 0,
      suspicious_pct: reviewSummary?.suspicious_pct ?? 0,
      fake_pct: reviewSummary?.fake_pct ?? 0,
      pros: (reviewSummary?.pros ?? [])
        .slice(0, 6)
        .map((s) => sanitizeMcpPublicText(s, 200)),
      cons: (reviewSummary?.cons ?? [])
        .slice(0, 6)
        .map((s) => sanitizeMcpPublicText(s, 200)),
      ai_summary: reviewSummary?.ai_summary
        ? sanitizeMcpPublicText(reviewSummary.ai_summary, 500)
        : null,
    },
    returned_offer_count: offers.length,
    offers,
  });
}

async function executeCompareDevicesByUseCase(
  rawArgs: z.infer<typeof CompareDevicesByUseCaseInputSchema>,
  readers: McpDataReaders
): Promise<McpToolCallResult> {
  const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
  const resolveToken =
    readers.resolveCompareTokenTarget ?? defaultResolveCompareTokenTarget;

  const rawResolved = await Promise.all(
    rawArgs.slugs.map(async (requested) => {
      const target = await resolveToken(requested);
      return { requested, target };
    })
  );

  const seenItems = new Set<string>();
  const seenVariantSlugs = new Set<string>();
  const resolvedEntries = rawResolved.map(({ requested, target }) => {
    if (!target.variantSlug) {
      return {
        requested,
        variantSlug: null as string | null,
        deduplicated: false,
      };
    }
    const lowerVariantSlug = target.variantSlug.toLowerCase();
    if (
      seenVariantSlugs.has(lowerVariantSlug) ||
      (target.itemId !== null && seenItems.has(target.itemId))
    ) {
      return {
        requested,
        variantSlug: target.variantSlug,
        deduplicated: true,
      };
    }
    seenVariantSlugs.add(lowerVariantSlug);
    if (target.itemId !== null) seenItems.add(target.itemId);
    return {
      requested,
      variantSlug: target.variantSlug,
      deduplicated: false,
    };
  });

  const deduplicatedSlugs = resolvedEntries
    .filter((entry) => entry.deduplicated)
    .map((entry) => entry.requested);
  const comparedSlugs = resolvedEntries
    .filter(
      (
        entry
      ): entry is {
        requested: string;
        variantSlug: string;
        deduplicated: false;
      } => !entry.deduplicated && entry.variantSlug !== null
    )
    .map((entry) => entry.variantSlug);

  const [comparedProducts, filteredReviewCounts] = await Promise.all([
    comparedSlugs.length >= 2
      ? readers.getCachedCompareMasterProducts(comparedSlugs.join(','))
      : comparedSlugs.length === 1
        ? readers
            .getCachedMasterProductBySlug(comparedSlugs[0]!)
            .then((p) => (p ? [p] : []))
        : Promise.resolve([]),
    readers
      .getCachedFilteredReviewCountsByMaster()
      .catch(() => ({}) as FilteredReviewCountsByMaster),
  ]);

  const returnedSlugSet = new Set(
    comparedProducts.map((p) => p.slug.toLowerCase())
  );
  const missingEntries = resolvedEntries.filter(
    (entry) =>
      !entry.deduplicated &&
      (entry.variantSlug === null ||
        !returnedSlugSet.has(entry.variantSlug.toLowerCase()))
  );
  const missingLookup = await Promise.all(
    missingEntries.map((entry) =>
      entry.variantSlug === null
        ? Promise.resolve(false)
        : readers.getCachedMasterProductBySlug(entry.variantSlug).then(
            (p) => p !== null,
            () => false
          )
    )
  );
  const excludedCrossCategorySlugs = missingEntries
    .filter((_, idx) => missingLookup[idx])
    .map((entry) => entry.requested);
  const notFoundSlugs = missingEntries
    .filter((_, idx) => !missingLookup[idx])
    .map((entry) => entry.requested);

  if (comparedProducts.length < 2) {
    return buildToolCallResult(
      {
        ok: false,
        error:
          'At least 2 distinct published products in the same device category are required for side-by-side comparison.',
        requested_slugs: rawArgs.slugs,
        deduplicated_slugs: deduplicatedSlugs,
        excluded_cross_category_slugs: excludedCrossCategorySlugs,
        not_found_slugs: notFoundSlugs,
        canonical_citation_url: buildCanonicalRateUrl('/compare'),
        observed_at: snapshotAt,
      },
      true
    );
  }

  const lockedCategory = getMasterProductCategorySlug(comparedProducts[0]!);
  const presetWeights = PERSONA_WEIGHT_PRESETS[rawArgs.persona];
  const rawMergedWeights: LeaderboardCriteriaWeights = {
    screen: rawArgs.weights?.screen ?? presetWeights.screen,
    performance: rawArgs.weights?.performance ?? presetWeights.performance,
    camera: rawArgs.weights?.camera ?? presetWeights.camera,
    battery: rawArgs.weights?.battery ?? presetWeights.battery,
    value: rawArgs.weights?.value ?? presetWeights.value,
  };
  const applicableCriteria = leaderboardCriteriaForCategory(lockedCategory);

  const offersList = await Promise.all(
    comparedProducts.map((p) => readers.getCachedMasterProductOffers(p.id))
  );

  const scoredEntries = comparedProducts.map((stored, idx) => {
    const scoped = applyCategorySpecTemplate(lockedCategory, stored);
    const scored = scoreMasterProductForLeaderboard(
      scoped,
      'combined',
      filteredReviewCounts
    );
    return {
      scoped,
      scored,
      rawOffers: offersList[idx] ?? [],
    };
  });

  // Only criteria where every compared model meets CRITERION_RANK_WRITERS (>= 5) participate.
  let sharedCriteria: LeaderboardScoreCriterion[] = [...applicableCriteria];
  for (let i = 1; i < scoredEntries.length; i++) {
    const pairShared = new Set(
      sharedScoredCriteria(
        scoredEntries[0]!.scored.rankCriteria,
        scoredEntries[i]!.scored.rankCriteria
      )
    );
    sharedCriteria = sharedCriteria.filter((c) => pairShared.has(c));
  }

  const totalSharedWeight = sharedCriteria.reduce(
    (acc, key) => acc + rawMergedWeights[key],
    0
  );
  const weightsFallbackApplied =
    sharedCriteria.length === 0 || totalSharedWeight <= 0;
  const appliedWeightsPct = Object.fromEntries(
    LEADERBOARD_SCORE_CRITERIA.map((key) => {
      if (!sharedCriteria.includes(key)) return [key, 0];
      if (totalSharedWeight <= 0) {
        return [key, roundScore(100 / sharedCriteria.length, 1)];
      }
      return [
        key,
        roundScore((rawMergedWeights[key] / totalSharedWeight) * 100, 1),
      ];
    })
  ) as LeaderboardCriteriaWeights;

  const devices = scoredEntries.map(({ scoped, scored, rawOffers }) => {
    const {
      inStockOffers,
      plausibleInStockOffers,
      excludedUnavailableCount,
      excludedBaitCount,
    } = getPlausibleInStockMerchantOffers(rawOffers);
    const plausiblePrices = plausibleInStockOffers.map((o) =>
      Math.round(parseFiniteDecimalInput(o.price_current))
    );
    const verifiedMinPrice =
      plausiblePrices.length > 0 ? Math.min(...plausiblePrices) : null;
    const verifiedMaxPrice =
      plausiblePrices.length > 0 ? Math.max(...plausiblePrices) : null;

    // Blend unrounded userScore5 (or combinedScore5 when unrated by buyers) so rounding happens once (#1531 D3).
    const unroundedBaseOverall5 =
      scored.userScore5 > 0
        ? scored.userScore5
        : scored.combinedScore5 > 0
          ? scored.combinedScore5
          : null;
    const weightedCriteria5 =
      sharedCriteria.length > 0
        ? weightedCriteriaScore5(
            scored.rankCriteria,
            appliedWeightsPct,
            sharedCriteria
          )
        : null;
    const useCaseScore5 =
      unroundedBaseOverall5 != null && weightedCriteria5 != null
        ? roundScore(unroundedBaseOverall5 * 0.35 + weightedCriteria5 * 0.65, 2)
        : unroundedBaseOverall5 != null
          ? roundScore(unroundedBaseOverall5, 2)
          : weightedCriteria5;
    const href = getMasterProductHref(scoped);
    const { observedAt, freshnessSource } = resolveProductObservedAt(
      scoped,
      snapshotAt
    );

    return {
      slug: sanitizeMcpPublicText(scoped.slug, 120),
      name: sanitizeMcpPublicText(scoped.name, 240),
      brand: sanitizeMcpPublicText(scoped.brand, 80),
      category: lockedCategory,
      verified_min_price_vnd: verifiedMinPrice,
      verified_max_price_vnd: verifiedMaxPrice,
      in_stock_offer_count: plausibleInStockOffers.length,
      excluded_unavailable_offer_count: excludedUnavailableCount,
      excluded_bait_offer_count: excludedBaitCount,
      sale_state: saleStateOfMaster(
        scoped,
        listingCountForSaleState(rawOffers.length, inStockOffers.length)
      ),
      bayesian_rating_5: productRatingScore5(scoped),
      expert_rating_10: scored.expertScore10,
      criteria_scores_5: scored.criteria,
      use_case_score_5: useCaseScore5,
      use_case_score_10:
        useCaseScore5 != null
          ? roundScore(displayedScore5(useCaseScore5) * 2, 1)
          : null,
      authentic_review_count: scored.authenticReviewCount,
      filtered_noise_review_count: scored.filteredNoiseReviewCount,
      key_specs: scoped.key_specs ?? {},
      specifications: scoped.specifications ?? {},
      deal_radar: radarExportFields(
        computeProductRadarSignal(scoped, plausibleInStockOffers)
      ),
      canonical_citation_url: buildCanonicalRateUrl(href),
      observed_at: observedAt,
      price_observed_at: observedAt,
      freshness_source: freshnessSource,
    };
  });

  const scoredDevicesOnly = devices.filter((d) => d.use_case_score_5 !== null);
  const rankedByUseCase = [...scoredDevicesOnly].sort((a, b) => {
    const scoreA = a.use_case_score_5 ?? -1;
    const scoreB = b.use_case_score_5 ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const priceA = a.verified_min_price_vnd ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.verified_min_price_vnd ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });

  const compareSlugsParam = devices
    .map((d) => encodeURIComponent(d.slug))
    .join(',');
  const compareCitationUrl = buildCanonicalRateUrl(
    `/compare?cat=${lockedCategory}&slugs=${compareSlugsParam}`
  );

  return buildToolCallResult({
    ok: true,
    tool: 'compare_devices_by_use_case',
    locked_category: lockedCategory,
    persona: rawArgs.persona,
    applied_weights_pct: appliedWeightsPct,
    weights_fallback_applied: weightsFallbackApplied,
    compared_criteria: sharedCriteria,
    recommended_slug_for_use_case: rankedByUseCase[0]?.slug ?? null,
    deduplicated_slugs: deduplicatedSlugs,
    excluded_cross_category_slugs: excludedCrossCategorySlugs,
    not_found_slugs: notFoundSlugs,
    canonical_citation_url: compareCitationUrl,
    observed_at: snapshotAt,
    devices,
  });
}

async function executeAuditListingUrl(
  rawArgs: z.infer<typeof AuditListingUrlInputSchema>,
  readers: McpDataReaders
): Promise<McpToolCallResult> {
  const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
  // Canonicalize tracking query params / fragments BEFORE cache lookup so
  // affiliate parameters (?sp_atk=, ?utm_*, ?fbclid=) never bypass withRateDataCache.
  const canonicalListingUrl = canonicalizeProductUrl(rawArgs.url);
  const lookupTarget = canonicalListingUrl || rawArgs.url;
  const inspection =
    await readers.getCachedInspectProductOrShopUrl(lookupTarget);

  const masterProduct = inspection.masterProduct
    ? applyCategorySpecTemplate(
        getMasterProductCategorySlug(inspection.masterProduct),
        inspection.masterProduct
      )
    : null;
  const queryPrice = rawArgs.observedPriceVnd ?? null;
  const queryOriginalPrice = rawArgs.observedOriginalPriceVnd ?? null;

  const { observedPrice, observedOriginalPrice } = resolveInspectObservedPrices(
    {
      queryPrice,
      queryOriginalPrice,
      matchedOfferPriceCurrent: inspection.matchedOffer?.price_current,
      matchedOfferPriceOriginal: inspection.matchedOffer?.price_original,
      masterMinPrice: masterProduct?.min_price,
      maxVnd: MAX_VALID_VND_PRICE,
    }
  );

  const gatekeeper = detectAccessoryOrJunk({
    title:
      inspection.matchedOffer?.title || masterProduct?.name || lookupTarget,
    url: lookupTarget,
    price: observedPrice > 0 ? observedPrice : null,
  });

  const rawMatchedPrice = parseFiniteDecimalInput(
    inspection.matchedOffer?.price_current
  );
  const matchedOfferHasPositivePrice =
    Number.isFinite(rawMatchedPrice) &&
    rawMatchedPrice > 0 &&
    rawMatchedPrice <= MAX_VALID_VND_PRICE;

  const priceVerdict = evaluateExtensionPriceVerdict({
    isAccessory: gatekeeper.isAccessory,
    accessoryReason: gatekeeper.reason,
    accessoryMessage: gatekeeper.message,
    isAmbiguousVariant: false,
    observedPrice: observedPrice > 0 ? observedPrice : null,
    observedOriginalPrice:
      observedOriginalPrice > 0 ? observedOriginalPrice : null,
    offers: inspection.allOffers,
    observedOfferId:
      inspection.matchedType === 'product_listing' ||
      (queryPrice === null && matchedOfferHasPositivePrice)
        ? (inspection.matchedOffer?.id ?? null)
        : null,
    hasLiveObservedPrice: typeof queryPrice === 'number' && queryPrice > 0,
    priceHistory: inspection.priceHistory,
  });

  const {
    plausibleInStockOffers,
    excludedUnavailableCount,
    excludedBaitCount,
  } = getPlausibleInStockMerchantOffers(inspection.allOffers ?? []);
  const radarSignal = masterProduct
    ? radarExportFields(
        computeProductRadarSignal(masterProduct, plausibleInStockOffers)
      )
    : null;

  const inspectCitationUrl = buildCanonicalRateUrl(
    `/inspect?q=${encodeURIComponent(lookupTarget)}`
  );
  const primaryCitationUrl = masterProduct
    ? buildCanonicalRateUrl(getMasterProductHref(masterProduct))
    : buildSafeMerchantCitationUrl(
        inspection.merchantProfile?.id,
        inspectCitationUrl
      );

  const { observedAt: productObservedAt } = resolveProductObservedAt(
    masterProduct,
    snapshotAt
  );

  const matchedOfferPublic = inspection.matchedOffer
    ? withPublicOfferReviewRisk(inspection.matchedOffer)
    : null;
  const merchantProfilePublic = inspection.merchantProfile
    ? withPublicReviewRisk(inspection.merchantProfile)
    : null;

  const matchedOfferPriceCurrent = matchedOfferPublic
    ? toBoundedPositiveVndOrNull(matchedOfferPublic.price_current)
    : null;
  const rawMatchedOfferOrig = matchedOfferPublic
    ? parseFiniteDecimalInput(matchedOfferPublic.price_original)
    : Number.NaN;
  const matchedOfferPriceOriginal =
    matchedOfferPriceCurrent !== null
      ? normalizeOfferOriginalPrice(
          matchedOfferPriceCurrent,
          Number.isFinite(rawMatchedOfferOrig) ? rawMatchedOfferOrig : 0
        )
      : null;

  const topCompetingOffers = [...plausibleInStockOffers]
    .sort(
      (a, b) =>
        parseFiniteDecimalInput(a.price_current) -
        parseFiniteDecimalInput(b.price_current)
    )
    .slice(0, 5)
    .map((offer) => {
      const pub = withPublicOfferReviewRisk(offer);
      return {
        id: sanitizeMcpPublicText(pub.id, 128),
        platform: sanitizeMcpPublicText(
          pub.merchant?.platform || pub.platform || 'shopee',
          32
        ).toLowerCase(),
        title: sanitizeMcpPublicText(pub.title, 240),
        price_current_vnd: Math.round(
          parseFiniteDecimalInput(pub.price_current)
        ),
        merchant_name: sanitizeMcpPublicText(pub.merchant?.name, 160),
        is_official_mall: Boolean(pub.merchant?.is_official),
        merchant_risk_score: pub.merchant?.risk_score ?? null,
        dosafe_risk_score: pub.merchant?.dosafe_risk_score ?? null,
        review_risk_score: pub.merchant?.review_risk_score ?? null,
        offer_url: sanitizeExternalOfferUrl(pub.url),
        canonical_citation_url: primaryCitationUrl,
        observed_at: productObservedAt,
        price_observed_at: productObservedAt,
      };
    });

  const suggestions = (inspection.suggestions ?? []).slice(0, 5).map((s) => {
    const cat = getMasterProductCategorySlug(s);
    const scoped = applyCategorySpecTemplate(cat, s);
    const { observedAt } = resolveProductObservedAt(scoped, snapshotAt);
    return {
      slug: sanitizeMcpPublicText(scoped.slug, 120),
      name: sanitizeMcpPublicText(scoped.name, 240),
      brand: sanitizeMcpPublicText(scoped.brand, 80),
      category: cat,
      canonical_citation_url: buildCanonicalRateUrl(
        getMasterProductHref(scoped)
      ),
      observed_at: observedAt,
    };
  });

  return buildToolCallResult({
    ok: true,
    tool: 'audit_listing_url',
    matched_type: inspection.matchedType,
    detected_platform: inspection.parsedUrl?.platform ?? null,
    canonical_listing_url: canonicalListingUrl,
    canonical_citation_url: primaryCitationUrl,
    inspect_citation_url: inspectCitationUrl,
    observed_at: productObservedAt,
    price_observed_at: productObservedAt,
    gatekeeper: {
      is_accessory_or_part: gatekeeper.isAccessory,
      reason: gatekeeper.reason ?? null,
    },
    price_verdict: priceVerdict,
    deal_radar: radarSignal,
    matched_product: masterProduct
      ? {
          slug: sanitizeMcpPublicText(masterProduct.slug, 120),
          name: sanitizeMcpPublicText(masterProduct.name, 240),
          brand: sanitizeMcpPublicText(masterProduct.brand, 80),
          category: getMasterProductCategorySlug(masterProduct),
          bayesian_rating_5: productRatingScore5(masterProduct),
          expert_rating_10: resolveExpertRating10(masterProduct),
          canonical_citation_url: buildCanonicalRateUrl(
            getMasterProductHref(masterProduct)
          ),
          observed_at: productObservedAt,
        }
      : null,
    matched_offer: matchedOfferPublic
      ? {
          id: sanitizeMcpPublicText(matchedOfferPublic.id, 128),
          platform: sanitizeMcpPublicText(
            matchedOfferPublic.platform,
            32
          ).toLowerCase(),
          title: sanitizeMcpPublicText(matchedOfferPublic.title, 280),
          price_current_vnd: matchedOfferPriceCurrent,
          price_original_vnd: matchedOfferPriceOriginal,
          availability: matchedOfferPublic.availability ?? null,
          is_unavailable: isOfferUnavailable(matchedOfferPublic),
          canonical_citation_url: primaryCitationUrl,
          price_observed_at: productObservedAt,
          observed_at: productObservedAt,
        }
      : null,
    merchant_risk_summary: merchantProfilePublic
      ? {
          id: sanitizeMcpPublicText(merchantProfilePublic.id, 128),
          name: sanitizeMcpPublicText(merchantProfilePublic.name, 160),
          platform: sanitizeMcpPublicText(
            merchantProfilePublic.platform,
            32
          ).toLowerCase(),
          is_official_mall: Boolean(merchantProfilePublic.is_official),
          risk_score: merchantProfilePublic.risk_score ?? null,
          dosafe_risk_score: merchantProfilePublic.dosafe_risk_score ?? null,
          review_risk_score: merchantProfilePublic.review_risk_score ?? null,
          canonical_citation_url: buildSafeMerchantCitationUrl(
            merchantProfilePublic.id,
            inspectCitationUrl
          ),
          observed_at: snapshotAt,
        }
      : matchedOfferPublic?.merchant
        ? {
            id: sanitizeMcpPublicText(matchedOfferPublic.merchant.id, 128),
            name: sanitizeMcpPublicText(matchedOfferPublic.merchant.name, 160),
            platform: sanitizeMcpPublicText(
              matchedOfferPublic.merchant.platform,
              32
            ).toLowerCase(),
            is_official_mall: Boolean(matchedOfferPublic.merchant.is_official),
            risk_score: matchedOfferPublic.merchant.risk_score ?? null,
            dosafe_risk_score:
              matchedOfferPublic.merchant.dosafe_risk_score ?? null,
            review_risk_score:
              matchedOfferPublic.merchant.review_risk_score ?? null,
            canonical_citation_url: buildSafeMerchantCitationUrl(
              matchedOfferPublic.merchant.id,
              inspectCitationUrl
            ),
            observed_at: snapshotAt,
          }
        : null,
    excluded_unavailable_offer_count: excludedUnavailableCount,
    excluded_bait_offer_count: excludedBaitCount,
    top_competing_offers: topCompetingOffers,
    suggestions,
  });
}

async function executeGetGenuineDeals(
  rawArgs: z.infer<typeof GetGenuineDealsInputSchema>,
  readers: McpDataReaders
): Promise<McpToolCallResult> {
  const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
  const limit = Math.min(rawArgs.limit, MAX_MCP_RESULT_ITEMS);

  const radar = await readers.getCrossPlatformDealRadar({
    categorySlug: rawArgs.category,
    platform: rawArgs.platform,
    limit: 30,
  });

  const radarObservedAt =
    resolveValidIsoTimestamp(radar.generatedAt) ?? snapshotAt;

  const filteredDeals = (radar.genuineDeals ?? [])
    .filter((deal) => {
      if (rawArgs.officialOnly && !deal.isOfficialMall) return false;
      if (
        rawArgs.maxBudgetVnd !== undefined &&
        deal.priceCurrent > rawArgs.maxBudgetVnd
      ) {
        return false;
      }
      return true;
    })
    .slice(0, limit)
    .map((deal) => ({
      id: sanitizeMcpPublicText(deal.id, 128),
      verdict: deal.verdict,
      product_slug: sanitizeMcpPublicText(deal.productSlug, 120),
      product_name: sanitizeMcpPublicText(deal.productName, 240),
      brand: sanitizeMcpPublicText(deal.brand, 80),
      category: deal.categorySlug,
      platform: sanitizeMcpPublicText(deal.platform, 32).toLowerCase(),
      merchant_id: sanitizeMcpPublicText(deal.merchantId, 128),
      merchant_name: sanitizeMcpPublicText(deal.merchantName, 160),
      is_official_mall: Boolean(deal.isOfficialMall),
      merchant_risk_score: deal.merchantRiskScore,
      price_current_vnd: deal.priceCurrent,
      price_original_vnd: deal.priceOriginal,
      market_median_price_vnd: deal.marketMedianPrice,
      market_min_price_vnd: deal.marketMinPrice,
      market_max_price_vnd: deal.marketMaxPrice,
      savings_vs_median_vnd: deal.savingsVsMedianVnd,
      savings_vs_median_pct: deal.savingsVsMedianPct,
      market_offer_count: deal.marketOfferCount,
      jreviews_score_10: deal.jreviewsScore10,
      offer_url: sanitizeExternalOfferUrl(deal.offerUrl),
      canonical_citation_url: buildCanonicalRateUrl(deal.productHref),
      price_observed_at: radarObservedAt,
      observed_at: radarObservedAt,
    }));

  return buildToolCallResult({
    ok: true,
    tool: 'get_genuine_deals',
    category_filter: rawArgs.category,
    platform_filter: rawArgs.platform,
    total_clusters_analyzed: radar.totalClustersAnalyzed,
    total_offers_analyzed: radar.totalOffersAnalyzed,
    total_merchants_analyzed: radar.totalMerchantsAnalyzed,
    returned_count: filteredDeals.length,
    max_limit: MAX_MCP_RESULT_ITEMS,
    canonical_citation_url: buildCanonicalRateUrl('/deals'),
    observed_at: radarObservedAt,
    price_observed_at: radarObservedAt,
    deals: filteredDeals,
  });
}

class JsonPayloadGuardError extends Error {
  public readonly rpcCode: number;
  constructor(rpcCode: number, message: string) {
    super(message);
    this.name = 'JsonPayloadGuardError';
    this.rpcCode = rpcCode;
  }
}

function hasUnsafeNumericRpcIdToken(rawJsonText: string): boolean {
  // Detect unquoted top-level numeric `"id": <number>` tokens that are fractional,
  // exponential, or outside IEEE-754 safe integer precision BEFORE JSON.parse rounds them.
  const idMatch = rawJsonText.match(
    /"id"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/
  );
  if (!idMatch) return false;
  const literal = idMatch[1]!;
  if (/[.eE]/.test(literal)) return true;
  try {
    const asBigInt = BigInt(literal);
    return (
      asBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
      asBigInt < BigInt(Number.MIN_SAFE_INTEGER)
    );
  } catch {
    return true;
  }
}

function sanitizeJsonValueOrThrow(value: unknown, depth = 0): unknown {
  if (depth > MAX_JSON_NESTING_DEPTH) {
    throw new JsonPayloadGuardError(
      -32600,
      `Invalid Request: JSON nesting depth exceeds ${MAX_JSON_NESTING_DEPTH}`
    );
  }
  if (typeof value === 'string') {
    return toWellFormedString(value);
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_ITEMS) {
      throw new JsonPayloadGuardError(
        -32600,
        `Invalid Request: JSON array exceeds ${MAX_JSON_ARRAY_ITEMS} elements`
      );
    }
    return value.map((item) => sanitizeJsonValueOrThrow(item, depth + 1));
  }
  if (typeof value === 'object') {
    const ownKeys = Object.getOwnPropertyNames(value);
    if (ownKeys.length > MAX_JSON_OBJECT_KEYS) {
      throw new JsonPayloadGuardError(
        -32600,
        `Invalid Request: JSON object exceeds ${MAX_JSON_OBJECT_KEYS} keys`
      );
    }
    const out: Record<string, unknown> = {};
    for (const rawKey of ownKeys) {
      if (FORBIDDEN_OBJECT_KEYS.has(rawKey)) {
        throw new JsonPayloadGuardError(
          -32600,
          `Invalid Request: forbidden prototype key "${rawKey}"`
        );
      }
      const cleanKey = toWellFormedString(rawKey);
      if (FORBIDDEN_OBJECT_KEYS.has(cleanKey)) {
        throw new JsonPayloadGuardError(
          -32600,
          `Invalid Request: forbidden prototype key "${cleanKey}"`
        );
      }
      const rawVal = (value as Record<string, unknown>)[rawKey];
      out[cleanKey] = sanitizeJsonValueOrThrow(rawVal, depth + 1);
    }
    return out;
  }
  return null;
}

type ReadMcpBodyOutcome =
  | { kind: 'too_large' }
  | { kind: 'invalid_content_length' }
  | { kind: 'parse_error'; message: string }
  | { kind: 'guard_error'; rpcCode: number; message: string }
  | { kind: 'ok'; value: unknown; unsafeNumericId: boolean };

async function readBoundedMcpJsonBody(
  request: Request,
  maxBytes = MAX_MCP_BODY_BYTES
): Promise<ReadMcpBodyOutcome> {
  const rawContentLength = request.headers.get('content-length');
  if (rawContentLength !== null) {
    const trimmed = rawContentLength.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { kind: 'invalid_content_length' };
    }
    const declared = Number(trimmed);
    if (!Number.isSafeInteger(declared)) {
      return { kind: 'invalid_content_length' };
    }
    if (declared > maxBytes) {
      return { kind: 'too_large' };
    }
  }

  if (!request.body) {
    return { kind: 'parse_error', message: 'Parse error: empty request body' };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return {
      kind: 'parse_error',
      message: 'Parse error: unreadable request body stream',
    };
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return {
      kind: 'parse_error',
      message: 'Parse error: unreadable or aborted request body',
    };
  }

  if (size === 0) {
    return { kind: 'parse_error', message: 'Parse error: empty request body' };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decodedText: string;
  try {
    decodedText = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    return {
      kind: 'parse_error',
      message: 'Parse error: request body must be valid UTF-8 JSON',
    };
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(decodedText);
  } catch {
    return { kind: 'parse_error', message: 'Parse error: malformed JSON body' };
  }

  if (Array.isArray(rawParsed)) {
    return {
      kind: 'guard_error',
      rpcCode: -32600,
      message:
        'Invalid Request: JSON-RPC batch arrays are not supported on this stateless MCP endpoint; send one JSON-RPC 2.0 object per POST.',
    };
  }

  try {
    const cleanValue = sanitizeJsonValueOrThrow(rawParsed, 0);
    return {
      kind: 'ok',
      value: cleanValue,
      unsafeNumericId: hasUnsafeNumericRpcIdToken(decodedText),
    };
  } catch (err) {
    if (err instanceof JsonPayloadGuardError) {
      return {
        kind: 'guard_error',
        rpcCode: err.rpcCode,
        message: err.message,
      };
    }
    return {
      kind: 'parse_error',
      message: 'Parse error: invalid JSON payload',
    };
  }
}

function mcpResponseHeaders(
  protocolVersion: string = MCP_LATEST_PROTOCOL_VERSION,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    ...MCP_CORS_HEADERS,
    'Cache-Control': 'no-store',
    'MCP-Protocol-Version': protocolVersion,
    ...extra,
  };
}

function jsonRpcErrorResponse(
  httpStatus: number,
  id: string | number | null,
  code: number,
  message: string,
  data?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
  protocolVersion: string = MCP_LATEST_PROTOCOL_VERSION
): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message: sanitizeMcpErrorMessage(message, 'MCP request error'),
        ...(data ? { data: deepSanitizeWellFormed(data) } : {}),
      },
    },
    {
      status: httpStatus,
      headers: mcpResponseHeaders(protocolVersion, extraHeaders),
    }
  );
}

function jsonRpcResultResponse(
  id: string | number,
  result: Record<string, unknown>,
  protocolVersion: string = MCP_LATEST_PROTOCOL_VERSION
): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id,
      result: deepSanitizeWellFormed(result),
    },
    {
      status: 200,
      headers: mcpResponseHeaders(protocolVersion),
    }
  );
}

function isValidJsonContentType(rawHeader: string | null): boolean {
  if (typeof rawHeader !== 'string') return false;
  const parts = rawHeader.split(';').map((s) => s.trim());
  const mediaType = (parts[0] ?? '').toLowerCase();
  if (mediaType !== 'application/json') return false;
  for (const param of parts.slice(1)) {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) continue;
    const k = param.slice(0, eqIdx).trim().toLowerCase();
    const v = param
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, '')
      .toLowerCase();
    if (k === 'charset' && v !== 'utf-8' && v !== 'utf8') {
      return false;
    }
  }
  return true;
}

function acceptsJsonResponse(acceptHeader: string | null): boolean {
  if (acceptHeader === null || !acceptHeader.trim()) return true;
  for (const entry of acceptHeader.split(',')) {
    const segments = entry.split(';').map((s) => s.trim());
    const mediaRange = (segments[0] ?? '').toLowerCase();
    if (
      mediaRange !== 'application/json' &&
      mediaRange !== 'application/*' &&
      mediaRange !== '*/*'
    ) {
      continue;
    }
    let qZero = false;
    for (const param of segments.slice(1)) {
      const eqIdx = param.indexOf('=');
      if (eqIdx === -1) continue;
      const k = param.slice(0, eqIdx).trim().toLowerCase();
      const v = param.slice(eqIdx + 1).trim();
      if (k === 'q' && /^0(?:\.0{1,3})?$/.test(v)) {
        qZero = true;
        break;
      }
    }
    if (!qZero) return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractValidRpcId(
  rawId: unknown,
  unsafeNumericId = false
): {
  valid: boolean;
  id: string | number | null;
} {
  if (typeof rawId === 'string') {
    if (
      rawId.length >= 1 &&
      rawId.length <= MAX_RPC_ID_LENGTH &&
      !/\p{Cc}/u.test(rawId)
    ) {
      return { valid: true, id: rawId };
    }
    return { valid: false, id: null };
  }
  if (typeof rawId === 'number') {
    if (!unsafeNumericId && Number.isSafeInteger(rawId)) {
      return { valid: true, id: Object.is(rawId, -0) ? 0 : rawId };
    }
    return { valid: false, id: null };
  }
  return { valid: false, id: null };
}

const InitializeParamsSchema = z
  .object({
    protocolVersion: z.string().trim().min(1).max(64).optional(),
    capabilities: z.record(z.string(), z.unknown()).optional(),
    clientInfo: z
      .object({
        name: z.string().max(128).optional(),
        version: z.string().max(64).optional(),
      })
      .optional(),
  })
  .passthrough();

export interface HandleMcpRequestOptions {
  readers?: Partial<McpDataReaders>;
  rateLimiter?: BoundedSlidingWindowRateLimiter;
  auditUrlRateLimiter?: BoundedSlidingWindowRateLimiter;
}

export function buildMcpMethodNotAllowedResponse(): NextResponse {
  return jsonRpcErrorResponse(
    405,
    null,
    -32600,
    'Method Not Allowed: /api/mcp is a stateless Streamable HTTP MCP endpoint. Send JSON-RPC 2.0 requests via POST.',
    undefined,
    { Allow: 'POST, OPTIONS' }
  );
}

export function buildMcpCorsPreflightResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: mcpResponseHeaders(MCP_LATEST_PROTOCOL_VERSION, {
      Allow: 'POST, OPTIONS',
    }),
  });
}

export async function handleMcpHttpPost(
  request: Request,
  options?: HandleMcpRequestOptions
): Promise<NextResponse> {
  try {
    const limiter = options?.rateLimiter ?? mcpRateLimiter;
    const auditLimiter = options?.auditUrlRateLimiter ?? inspectRateLimiter;
    const clientKey = extractClientRateLimitKey(request.headers);

    const rawHeaderVersion = request.headers
      .get('mcp-protocol-version')
      ?.trim();
    if (
      rawHeaderVersion &&
      (rawHeaderVersion.length > 64 || /[\s\p{Cc}]/u.test(rawHeaderVersion))
    ) {
      return jsonRpcErrorResponse(
        400,
        null,
        -32600,
        'Invalid Request: malformed MCP-Protocol-Version header'
      );
    }
    const headerVersionSupported = Boolean(
      rawHeaderVersion &&
      (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(
        rawHeaderVersion
      )
    );
    const activeProtocolVersion = headerVersionSupported
      ? rawHeaderVersion!
      : MCP_LATEST_PROTOCOL_VERSION;

    if (!limiter.allow(clientKey)) {
      return jsonRpcErrorResponse(
        429,
        null,
        -32029,
        `Rate limit exceeded. Maximum ${MCP_RATE_LIMIT_MAX_REQUESTS} MCP requests per minute.`,
        {
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: MCP_RETRY_AFTER_SECONDS,
        },
        { 'Retry-After': String(MCP_RETRY_AFTER_SECONDS) },
        activeProtocolVersion
      );
    }

    if (!isValidJsonContentType(request.headers.get('content-type'))) {
      return jsonRpcErrorResponse(
        415,
        null,
        -32600,
        'Unsupported Media Type: Content-Type must be application/json (UTF-8)',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    if (!acceptsJsonResponse(request.headers.get('accept'))) {
      return jsonRpcErrorResponse(
        406,
        null,
        -32600,
        'Not Acceptable: client must accept application/json',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const bodyOutcome = await readBoundedMcpJsonBody(
      request,
      MAX_MCP_BODY_BYTES
    );
    if (bodyOutcome.kind === 'too_large') {
      return jsonRpcErrorResponse(
        413,
        null,
        -32600,
        `Request body exceeds ${MAX_MCP_BODY_BYTES} bytes limit`,
        { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_MCP_BODY_BYTES },
        undefined,
        activeProtocolVersion
      );
    }
    if (bodyOutcome.kind === 'invalid_content_length') {
      return jsonRpcErrorResponse(
        400,
        null,
        -32600,
        'Invalid Request: malformed Content-Length header',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }
    if (bodyOutcome.kind === 'parse_error') {
      return jsonRpcErrorResponse(
        400,
        null,
        -32700,
        bodyOutcome.message,
        undefined,
        undefined,
        activeProtocolVersion
      );
    }
    if (bodyOutcome.kind === 'guard_error') {
      return jsonRpcErrorResponse(
        400,
        null,
        bodyOutcome.rpcCode,
        bodyOutcome.message,
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const envelope = bodyOutcome.value;
    if (!isPlainRecord(envelope)) {
      return jsonRpcErrorResponse(
        400,
        null,
        -32600,
        'Invalid Request: JSON-RPC 2.0 message must be a JSON object',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const jsonrpcVersion = Object.hasOwn(envelope, 'jsonrpc')
      ? envelope.jsonrpc
      : undefined;
    const rawMethod = Object.hasOwn(envelope, 'method')
      ? envelope.method
      : undefined;
    const hasId = Object.hasOwn(envelope, 'id');
    const rawId = hasId ? envelope.id : undefined;
    const parsedId = hasId
      ? extractValidRpcId(rawId, bodyOutcome.unsafeNumericId)
      : { valid: false, id: null };

    if (
      jsonrpcVersion !== '2.0' ||
      typeof rawMethod !== 'string' ||
      !rawMethod.trim() ||
      rawMethod.length > 128 ||
      /\p{Cc}/u.test(rawMethod)
    ) {
      return jsonRpcErrorResponse(
        400,
        parsedId.valid ? parsedId.id : null,
        -32600,
        'Invalid Request: expected jsonrpc "2.0" and a valid method name',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const method = rawMethod.trim();

    // Enforce supported MCP-Protocol-Version header only on post-initialize calls,
    // allowing newer clients sending MCP-Protocol-Version on initialize to negotiate down.
    if (
      method !== 'initialize' &&
      rawHeaderVersion &&
      !headerVersionSupported
    ) {
      return jsonRpcErrorResponse(
        400,
        parsedId.valid ? parsedId.id : null,
        -32600,
        `Unsupported MCP-Protocol-Version header. Supported versions: ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(', ')}`
      );
    }

    const hasParams = Object.hasOwn(envelope, 'params');
    const rawParams = hasParams ? envelope.params : undefined;

    // JSON-RPC 2.0 notifications omit `id`.
    if (!hasId) {
      if (
        method === 'notifications/initialized' ||
        method.startsWith('notifications/')
      ) {
        if (rawParams !== undefined && !isPlainRecord(rawParams)) {
          return jsonRpcErrorResponse(
            400,
            null,
            -32602,
            'Invalid params: notification params must be an object when provided',
            undefined,
            undefined,
            activeProtocolVersion
          );
        }
        return new NextResponse(null, {
          status: 202,
          headers: mcpResponseHeaders(activeProtocolVersion),
        });
      }
      return jsonRpcErrorResponse(
        400,
        null,
        -32600,
        'Invalid Request: id is required for JSON-RPC request methods',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    if (!parsedId.valid || parsedId.id === null) {
      return jsonRpcErrorResponse(
        400,
        null,
        -32600,
        'Invalid Request: id must be a non-empty string (<= 256 chars) or safe integer',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const requestId = parsedId.id;
    if (rawParams !== undefined && !isPlainRecord(rawParams)) {
      return jsonRpcErrorResponse(
        200,
        requestId,
        -32602,
        'Invalid params: params must be a JSON object when provided',
        undefined,
        undefined,
        activeProtocolVersion
      );
    }

    const readers: McpDataReaders = {
      ...DEFAULT_MCP_READERS,
      ...(options?.readers ?? {}),
    };

    if (method === 'initialize') {
      const parsedInit = InitializeParamsSchema.safeParse(rawParams ?? {});
      if (!parsedInit.success) {
        return jsonRpcErrorResponse(
          200,
          requestId,
          -32602,
          'Invalid params for initialize'
        );
      }
      const requestedVersion = parsedInit.data.protocolVersion;
      const negotiatedVersion =
        requestedVersion &&
        (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(
          requestedVersion
        )
          ? requestedVersion
          : MCP_LATEST_PROTOCOL_VERSION;

      return jsonRpcResultResponse(
        requestId,
        {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: MCP_SERVER_INFO,
          instructions: MCP_SERVER_INSTRUCTIONS,
        },
        negotiatedVersion
      );
    }

    if (method === 'notifications/initialized') {
      return jsonRpcResultResponse(requestId, {}, activeProtocolVersion);
    }

    if (method === 'ping') {
      return jsonRpcResultResponse(requestId, {}, activeProtocolVersion);
    }

    if (method === 'tools/list') {
      if (
        rawParams &&
        Object.hasOwn(rawParams, 'cursor') &&
        rawParams.cursor != null
      ) {
        return jsonRpcErrorResponse(
          200,
          requestId,
          -32602,
          'Invalid params: unknown pagination cursor',
          undefined,
          undefined,
          activeProtocolVersion
        );
      }
      return jsonRpcResultResponse(
        requestId,
        {
          tools: MCP_TOOL_DEFINITIONS,
        },
        activeProtocolVersion
      );
    }

    if (method === 'tools/call') {
      if (!rawParams) {
        return jsonRpcErrorResponse(
          200,
          requestId,
          -32602,
          'Invalid params: tools/call requires params object with tool name',
          undefined,
          undefined,
          activeProtocolVersion
        );
      }
      const toolName = Object.hasOwn(rawParams, 'name')
        ? rawParams.name
        : undefined;
      const rawToolArgs = Object.hasOwn(rawParams, 'arguments')
        ? rawParams.arguments
        : {};
      if (typeof toolName !== 'string' || !toolName.trim()) {
        return jsonRpcErrorResponse(
          200,
          requestId,
          -32602,
          'Invalid params: tool name must be a non-empty string',
          undefined,
          undefined,
          activeProtocolVersion
        );
      }
      if (rawToolArgs !== undefined && !isPlainRecord(rawToolArgs)) {
        return jsonRpcErrorResponse(
          200,
          requestId,
          -32602,
          'Invalid params: tool arguments must be a JSON object',
          undefined,
          undefined,
          activeProtocolVersion
        );
      }
      const safeToolArgs = rawToolArgs ?? {};

      try {
        switch (toolName) {
          case 'search_verified_catalog': {
            const parsed =
              SearchVerifiedCatalogInputSchema.safeParse(safeToolArgs);
            if (!parsed.success) {
              return jsonRpcErrorResponse(
                200,
                requestId,
                -32602,
                formatZodIssuesForMcp(parsed.error.issues),
                undefined,
                undefined,
                activeProtocolVersion
              );
            }
            const result = await executeSearchVerifiedCatalog(
              parsed.data,
              readers
            );
            return jsonRpcResultResponse(
              requestId,
              result as unknown as Record<string, unknown>,
              activeProtocolVersion
            );
          }

          case 'get_22_store_offers_and_price_truth': {
            const parsed =
              GetStoreOffersAndPriceTruthInputSchema.safeParse(safeToolArgs);
            if (!parsed.success) {
              return jsonRpcErrorResponse(
                200,
                requestId,
                -32602,
                formatZodIssuesForMcp(parsed.error.issues),
                undefined,
                undefined,
                activeProtocolVersion
              );
            }
            const result = await executeGetStoreOffersAndPriceTruth(
              parsed.data,
              readers
            );
            return jsonRpcResultResponse(
              requestId,
              result as unknown as Record<string, unknown>,
              activeProtocolVersion
            );
          }

          case 'compare_devices_by_use_case': {
            const parsed =
              CompareDevicesByUseCaseInputSchema.safeParse(safeToolArgs);
            if (!parsed.success) {
              return jsonRpcErrorResponse(
                200,
                requestId,
                -32602,
                formatZodIssuesForMcp(parsed.error.issues),
                undefined,
                undefined,
                activeProtocolVersion
              );
            }
            const result = await executeCompareDevicesByUseCase(
              parsed.data,
              readers
            );
            return jsonRpcResultResponse(
              requestId,
              result as unknown as Record<string, unknown>,
              activeProtocolVersion
            );
          }

          case 'audit_listing_url': {
            const parsed = AuditListingUrlInputSchema.safeParse(safeToolArgs);
            if (!parsed.success) {
              return jsonRpcErrorResponse(
                200,
                requestId,
                -32602,
                formatZodIssuesForMcp(parsed.error.issues),
                undefined,
                undefined,
                activeProtocolVersion
              );
            }
            if (!auditLimiter.allow(clientKey)) {
              return jsonRpcErrorResponse(
                429,
                requestId,
                -32029,
                'Rate limit exceeded. Maximum 30 listing URL audits per minute.',
                {
                  code: 'RATE_LIMIT_EXCEEDED',
                  retryAfterSeconds: MCP_RETRY_AFTER_SECONDS,
                },
                { 'Retry-After': String(MCP_RETRY_AFTER_SECONDS) },
                activeProtocolVersion
              );
            }
            const result = await executeAuditListingUrl(parsed.data, readers);
            return jsonRpcResultResponse(
              requestId,
              result as unknown as Record<string, unknown>,
              activeProtocolVersion
            );
          }

          case 'get_genuine_deals': {
            const parsed = GetGenuineDealsInputSchema.safeParse(safeToolArgs);
            if (!parsed.success) {
              return jsonRpcErrorResponse(
                200,
                requestId,
                -32602,
                formatZodIssuesForMcp(parsed.error.issues),
                undefined,
                undefined,
                activeProtocolVersion
              );
            }
            const result = await executeGetGenuineDeals(parsed.data, readers);
            return jsonRpcResultResponse(
              requestId,
              result as unknown as Record<string, unknown>,
              activeProtocolVersion
            );
          }

          default:
            return jsonRpcErrorResponse(
              200,
              requestId,
              -32602,
              `Unknown MCP tool: ${sanitizeMcpPublicText(toolName, 80)}`,
              undefined,
              undefined,
              activeProtocolVersion
            );
        }
      } catch {
        const snapshotAt = (readers.nowIso ?? DEFAULT_MCP_READERS.nowIso!)();
        const safeErrorResult = buildToolCallResult(
          {
            ok: false,
            error:
              'Temporary service error while reading verified catalog data. Please retry shortly.',
            canonical_citation_url: CANONICAL_RATE_ORIGIN,
            observed_at: snapshotAt,
          },
          true
        );
        return jsonRpcResultResponse(
          requestId,
          safeErrorResult as unknown as Record<string, unknown>,
          activeProtocolVersion
        );
      }
    }

    return jsonRpcErrorResponse(
      200,
      requestId,
      -32601,
      `Method not found: ${sanitizeMcpPublicText(method, 80)}`,
      undefined,
      undefined,
      activeProtocolVersion
    );
  } catch {
    return jsonRpcErrorResponse(500, null, -32603, 'Internal MCP server error');
  }
}

export function buildRateWellKnownMcpDescriptor(): Record<string, unknown> {
  return {
    mcpVersion: MCP_LATEST_PROTOCOL_VERSION,
    supportedProtocolVersions: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
    name: 'io.github.dos/rate-vn',
    serverInfo: MCP_SERVER_INFO,
    description:
      'Stateless read-only Streamable HTTP Model Context Protocol (MCP) server for Rate.vn: verified tech prices across 22 Vietnamese retail platforms, 10-group standardized hardware specs, historical fake-discount audits, DOSafe scam risk, and 6-axis Review Trust Model v2 scores.',
    transport: 'streamable-http',
    url: `${CANONICAL_RATE_ORIGIN}/api/mcp`,
    endpoints: {
      mcp: `${CANONICAL_RATE_ORIGIN}/api/mcp`,
      transport: 'streamable-http',
    },
    remotes: [
      {
        type: 'streamable-http',
        transport: 'streamable-http',
        url: `${CANONICAL_RATE_ORIGIN}/api/mcp`,
      },
    ],
    documentationUrl: `${CANONICAL_RATE_ORIGIN}/developers#mcp`,
    llmsTxtUrl: `${CANONICAL_RATE_ORIGIN}/llms.txt`,
    openApiUrl: `${CANONICAL_RATE_ORIGIN}/api/v1/rate/openapi.json`,
    repositoryUrl: 'https://github.com/DOS/Rate',
    authentication: {
      type: 'none',
      readOnly: true,
      rateLimit: {
        requestsPerMinute: MCP_RATE_LIMIT_MAX_REQUESTS,
        inspectRequestsPerMinute: 30,
        maxBodyBytes: MAX_MCP_BODY_BYTES,
        maxItemsPerCall: MAX_MCP_RESULT_ITEMS,
      },
    },
    citationPolicy: {
      requireCanonicalCitationUrl: true,
      requireFreshnessTimestamp: true,
      canonicalOrigin: CANONICAL_RATE_ORIGIN,
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      readOnly: true,
    })),
  };
}

export function buildRateLlmsTxt(): string {
  return [
    '# Rate.vn - Verified Tech Price Truth & 6-Axis Review Trust Platform',
    '',
    '> Rate.vn is an open-core Vietnamese consumer tech comparison and anti-fake-discount platform covering 22 retail platforms across 5 hardware categories (smartphones, tablets, laptops, smartwatches, earbuds), backed by standardized 10-group specifications, historical price medians, DOSafe scam risk intelligence, and the 6-axis Review Trust Model v2.',
    '',
    '## Model Context Protocol (MCP) Server',
    '',
    '- Endpoint (`POST` JSON-RPC 2.0, stateless Streamable HTTP): https://rate.vn/api/mcp',
    '- Discovery Descriptor: https://rate.vn/.well-known/mcp.json',
    '- Supported MCP Protocol Versions: `2025-06-18`, `2025-03-26`, `2024-11-05`',
    '- Access & Limits: Public read-only, no API key required, `Content-Type: application/json`, body `<= 16384` bytes, up to `10` items per tool call, per-IP sliding-window rate limiting (`429` with `Retry-After`).',
    '- Mandatory Citation Rule: Every tool item includes `canonical_citation_url` (`https://rate.vn/...`) and freshness timestamps (`observed_at` / `price_observed_at`). AI agents MUST link `canonical_citation_url` and state when the price was observed.',
    '',
    '### Read-Only MCP Tools (`POST /api/mcp`)',
    '',
    '1. `search_verified_catalog`: Search normalized devices across `smartphones`, `tablets`, `laptops`, `smartwatches`, and `earbuds` with brand, VND price floor/ceiling, and rating sort (`limit <= 10`). Excludes sold-out and implausibly low bait-price listings.',
    '2. `get_22_store_offers_and_price_truth`: Fetch verified in-stock offers across all 22 Vietnamese retail platforms, historical floor/median price truth, Deal Radar fake-sale flags, Bayesian rating (`k = 3`, prior `4.2`), and 6-axis Review Trust Model v2 summary for a product slug (`limit <= 10`).',
    '3. `compare_devices_by_use_case`: Compare 2 to 4 same-category product slugs side-by-side across 10-group hardware specs, verified floor prices, and 5-criterion JReviews scores (`screen`, `performance`, `camera`, `battery`, `value`) with optional persona or custom weight overrides.',
    '4. `audit_listing_url`: Inspect a marketplace product URL across the 22 supported Vietnamese stores and return catalog match, 5-level fake-discount verdict, accessory gatekeeper status, and DOSafe + AI review seller risk scores.',
    '5. `get_genuine_deals`: List verified below-median and cross-platform floor deals (`limit <= 10`, optional category/platform/budget filter) with fake strikethrough markups and high-risk sellers filtered out.',
    '',
    '## 22 Tracked Vietnamese Retail Platforms',
    '',
    '- Marketplaces: `shopee`, `lazada`, `tiki`, `tiktok`',
    '- Authorized Tech & Electronics Chains: `cellphones`, `tgdd`, `dienmayxanh`, `topzone`, `fptshop`, `hoangha`, `didongviet`, `phongvu`, `gearvn`, `nguyenkim`, `shopdunk`, `hacom`, `clickbuy`, `viettelstore`, `pico`, `mediamart`, `memoryzone`, `anphatpc`',
    '',
    '## Methodology & Data Integrity',
    '',
    '- **5 Canonical Categories**: [Smartphones](https://rate.vn/smartphones), [Tablets](https://rate.vn/tablets), [Laptops](https://rate.vn/laptops), [Smartwatches](https://rate.vn/smartwatches), [Earbuds](https://rate.vn/earbuds)',
    '- **10-Group Specification Schema (`specifications` JSON keys)**: `availability`, `design`, `display`, `hardware`, `battery`, `camera` (PhoneArena per-lens split), `connectivity`, `cellular`, `multimedia`, `regulatory`.',
    '- **Price Truth & Anti-Fake-Sale Engine**: Compares live selling prices against recorded historical medians rather than seller-declared strikethrough prices; excludes sold-out/discontinued offers and implausibly low bait/accessory listings from market floors.',
    '- **6-Axis Review Trust Model v2 & Bayesian Rating**: Evaluates `authenticity`, `independence`, `depth`, `reviewer`, `context`, and `community` axes to filter coin-farming spam, duplicate paid seeding, competitor sabotage, and review bombing (`weight = 0`), then computes helpfulness-weighted Bayesian ratings (`k = 3`, prior `4.2`) alongside DOSafe seller scam risk.',
    '',
    '## REST API v1 & Developer Documentation',
    '',
    '- [Developer Portal & Interactive Playground](https://rate.vn/developers): Live REST API v1 playground, 10-group schema docs, and MCP quick-connect snippets.',
    '- [OpenAPI 3.1.0 Specification](https://rate.vn/api/v1/rate/openapi.json): Full machine-readable specification for `/api/v1/rate/*` endpoints (`/products`, `/products/{slug}`, `/compare`, `/versus`, `/deals`, `/inspect`, `/lookup`, `/leaderboard`, `/merchants`, `/stats`).',
    '- [Deal Hub](https://rate.vn/deals): Cross-platform genuine deals and inflated list-price warnings.',
    '- [URL & Fake-Discount Inspector](https://rate.vn/inspect): Verify any listing URL across the 22 supported Vietnamese stores.',
    '- [Category Leaderboard](https://rate.vn/leaderboard): JReviews dual-rating rankings across all 5 tech categories.',
    '- [Open-Core Source Repository](https://github.com/DOS/Rate): Public normalization, scoring, and API verification code.',
    '',
  ].join('\n');
}
