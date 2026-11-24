import 'server-only';
import {
  implausiblyLowOfferIds,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  MAX_VALID_VND_PRICE,
  normalizeOfferOriginalPrice,
  type MasterProduct,
  type MerchantOffer,
  type MerchantProfileDetail,
} from '@/lib/rate-api';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import {
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  reviewRiskScoreOrNull,
  type CanonicalCategorySlug,
} from '@/lib/rate-domain-core';
import { radarExportFields } from '@/lib/deal-radar';
import {
  COMBO_CART_DEFAULT_MAX_STORES,
  COMBO_CART_DEFAULT_MIN_TRUST,
  COMBO_CART_DEFAULT_SHIPPING_VND,
  COMBO_CART_MAX_ITEMS,
  COMBO_CART_MAX_MAX_STORES,
  COMBO_CART_MAX_SHIPPING_VND,
  COMBO_CART_MIN_ITEMS,
  COMBO_CART_MIN_MAX_STORES,
  optimizeComboCart,
  resolveComboStoreIdentity,
  type ComboCartDiagnostics,
  type ComboCartItemInput,
  type ComboCartPlan,
  type ComboCartStoreGroup,
} from '@/lib/combo-cart-optimizer';
import {
  evaluateMerchantTrustBadge,
  type MerchantTrustBadgeResult,
} from '@/lib/merchant-trust-badge';
import {
  computeProductRadarSignal,
  getCachedMasterProductBySlug,
  getCachedMerchantProfileById,
  getMasterProductOffersBatch,
  getRateClient,
} from '@/server/rate';
import {
  parseFiniteDecimalInput,
  trimEdgeControlAndWhitespace,
  withPublicOfferReviewRisk,
} from '@/server/rate/api-handler';
import { FAKE_MARKUP_THRESHOLD_PCT } from '@/server/rate/deals';
import { resolveWatchlistSlug } from '@/server/rate/item-compare';
import { getCachedCategorySlugById } from '@/server/rate/item-route';

const VALID_ITEM_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UNSAFE_SLUG_TOKENS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  'infinity',
  '-infinity',
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

export function isSafeComboSlugToken(token: string): boolean {
  if (typeof token !== 'string' || !VALID_ITEM_SLUG_REGEX.test(token)) {
    return false;
  }
  const lower = token.toLowerCase();
  if (
    /^0+$/.test(token) ||
    token.endsWith('.') ||
    token.includes('..') ||
    Object.prototype.hasOwnProperty.call(Object.prototype, token) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, lower) ||
    UNSAFE_SLUG_TOKENS.has(lower)
  ) {
    return false;
  }
  return true;
}

export function deduplicateComboSlugs(rawSlugs: readonly string[]): string[] {
  const uniqueSlugs: string[] = [];
  const seenLower = new Set<string>();
  for (const raw of rawSlugs) {
    const token = trimEdgeControlAndWhitespace(raw);
    if (!isSafeComboSlugToken(token)) continue;
    const lower = token.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    uniqueSlugs.push(token);
  }
  return uniqueSlugs;
}

export interface ParsedComboCartQuery {
  items: string[];
  officialOnly: boolean;
  minTrust: number;
  maxStores: number;
  shippingVnd: number;
}

export function parseComboCartQuery(
  searchParams: Pick<URLSearchParams, 'get'>
): { ok: true; value: ParsedComboCartQuery } | { ok: false; error: string } {
  const rawItems = searchParams.get('items');
  if (typeof rawItems !== 'string') {
    return {
      ok: false,
      error:
        'Missing ?items= parameter (provide 2 to 5 comma-separated product slugs).',
    };
  }
  if (/[\p{Cc}]/u.test(rawItems)) {
    return {
      ok: false,
      error: 'Invalid characters in ?items= parameter.',
    };
  }
  const trimmedItems = trimEdgeControlAndWhitespace(rawItems);
  if (!trimmedItems || trimmedItems.length > 1000) {
    return {
      ok: false,
      error:
        'Invalid ?items= parameter (provide 2 to 5 comma-separated product slugs).',
    };
  }

  const rawTokens = trimmedItems.split(',');
  const uniqueSlugs: string[] = [];
  const seenLower = new Set<string>();

  for (const part of rawTokens) {
    const token = trimEdgeControlAndWhitespace(part);
    if (!isSafeComboSlugToken(token)) {
      return {
        ok: false,
        error: 'Invalid product slug in ?items= parameter.',
      };
    }
    const lower = token.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    uniqueSlugs.push(token);
  }

  if (
    uniqueSlugs.length < COMBO_CART_MIN_ITEMS ||
    uniqueSlugs.length > COMBO_CART_MAX_ITEMS
  ) {
    return {
      ok: false,
      error: `Provide between ${COMBO_CART_MIN_ITEMS} and ${COMBO_CART_MAX_ITEMS} unique product slugs in ?items=.`,
    };
  }

  const rawOfficial = searchParams.get('officialOnly');
  let officialOnly = false;
  if (rawOfficial !== null) {
    const cleaned = trimEdgeControlAndWhitespace(rawOfficial);
    if (cleaned === '1') {
      officialOnly = true;
    } else if (cleaned === '0' || cleaned === '') {
      officialOnly = false;
    } else {
      return {
        ok: false,
        error: 'Invalid ?officialOnly= parameter (expected 0 or 1).',
      };
    }
  }

  const rawMinTrust = searchParams.get('minTrust');
  let minTrust = COMBO_CART_DEFAULT_MIN_TRUST;
  if (rawMinTrust !== null) {
    const cleaned = trimEdgeControlAndWhitespace(rawMinTrust);
    if (cleaned !== '') {
      const parsed = parseFiniteDecimalInput(cleaned);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return {
          ok: false,
          error: 'Invalid ?minTrust= parameter (expected 0 to 100).',
        };
      }
      minTrust = parsed === 0 ? 0 : parsed;
    }
  }

  const rawMaxStores = searchParams.get('maxStores');
  let maxStores = COMBO_CART_DEFAULT_MAX_STORES;
  if (rawMaxStores !== null) {
    const cleaned = trimEdgeControlAndWhitespace(rawMaxStores);
    if (cleaned !== '') {
      const parsed = parseFiniteDecimalInput(cleaned);
      if (
        !Number.isSafeInteger(parsed) ||
        parsed < COMBO_CART_MIN_MAX_STORES ||
        parsed > COMBO_CART_MAX_MAX_STORES
      ) {
        return {
          ok: false,
          error: `Invalid ?maxStores= parameter (expected integer ${COMBO_CART_MIN_MAX_STORES} to ${COMBO_CART_MAX_MAX_STORES}).`,
        };
      }
      maxStores = parsed;
    }
  }

  const rawShippingVnd = searchParams.get('shippingVnd');
  let shippingVnd = COMBO_CART_DEFAULT_SHIPPING_VND;
  if (rawShippingVnd !== null) {
    const cleaned = trimEdgeControlAndWhitespace(rawShippingVnd);
    if (cleaned !== '') {
      const parsed = parseFiniteDecimalInput(cleaned);
      if (
        !Number.isSafeInteger(parsed) ||
        parsed < 0 ||
        parsed > COMBO_CART_MAX_SHIPPING_VND
      ) {
        return {
          ok: false,
          error: `Invalid ?shippingVnd= parameter (expected integer 0 to ${COMBO_CART_MAX_SHIPPING_VND}).`,
        };
      }
      shippingVnd = parsed === 0 ? 0 : parsed;
    }
  }

  return {
    ok: true,
    value: {
      items: uniqueSlugs,
      officialOnly,
      minTrust,
      maxStores,
      shippingVnd,
    },
  };
}

export interface WatchlistSlugTarget {
  variantSlug: string;
  itemSlug: string;
  itemCategoryId: string | null;
  sizeRequired: boolean;
}

export interface ComboCartDataReaders {
  resolveWatchlistSlug?: (slug: string) => Promise<WatchlistSlugTarget | null>;
  getCachedMasterProductBySlug?: (
    slug: string
  ) => Promise<MasterProduct | null>;
  getMasterProductOffersBatch?: (
    masterProductIds: string[]
  ) => Promise<Map<string, MerchantOffer[]>>;
  getCachedMerchantProfileById?: (
    merchantId: string
  ) => Promise<Pick<MerchantProfileDetail, 'listings'> | null>;
  getCachedCategorySlugById?: () => Promise<ReadonlyMap<string, string>>;
  getCategorySlugByIdUncached?: (
    categoryId: string
  ) => Promise<string | undefined>;
}

async function defaultGetCategorySlugByIdUncached(
  categoryId: string
): Promise<string | undefined> {
  const { data, error } = await getRateClient()
    .from('categories')
    .select('slug')
    .eq('id', categoryId)
    .maybeSingle();
  if (error) {
    return undefined;
  }
  return typeof (data as { slug?: unknown } | null)?.slug === 'string'
    ? (data as { slug: string }).slug
    : undefined;
}

async function resolveItemCategorySlugs(
  categoryIds: readonly string[],
  readers: Pick<
    ComboCartDataReaders,
    'getCachedCategorySlugById' | 'getCategorySlugByIdUncached'
  >
): Promise<Map<string, CanonicalCategorySlug | false>> {
  const out = new Map<string, CanonicalCategorySlug | false>();
  if (categoryIds.length === 0) return out;
  const getCached =
    readers.getCachedCategorySlugById ?? getCachedCategorySlugById;
  const getUncached =
    readers.getCategorySlugByIdUncached ?? defaultGetCategorySlugByIdUncached;
  let cachedById: ReadonlyMap<string, string>;
  try {
    cachedById = await getCached();
  } catch {
    for (const id of categoryIds) out.set(id, false);
    return out;
  }
  await Promise.all(
    categoryIds.map(async (id) => {
      let rawSlug = cachedById.get(id);
      if (rawSlug === undefined) {
        try {
          rawSlug = await getUncached(id);
        } catch {
          out.set(id, false);
          return;
        }
      }
      const norm =
        typeof rawSlug === 'string'
          ? rawSlug
              .replace(/\p{Cc}+/gu, '')
              .trim()
              .toLowerCase()
          : '';
      out.set(id, isCanonicalCategorySlug(norm) ? norm : false);
    })
  );
  return out;
}

function resolveComboItemHref(
  master: MasterProduct,
  target: {
    variantSlug: string;
    itemSlug: string;
    itemCategoryId: string | null;
    sizeRequired: boolean;
  } | null,
  itemCategorySlugs: ReadonlyMap<string, CanonicalCategorySlug | false>
): string {
  const resolvedItemCategory: CanonicalCategorySlug | null = target
    ? target.itemCategoryId === null
      ? getMasterProductCategorySlug(master)
      : (() => {
          const mapped = itemCategorySlugs.get(target.itemCategoryId);
          return typeof mapped === 'string' && isCanonicalCategorySlug(mapped)
            ? mapped
            : null;
        })()
    : null;
  const candidateItemHref =
    target && resolvedItemCategory && isSafeComboSlugToken(target.itemSlug)
      ? getMasterProductHref({
          ...master,
          slug: target.itemSlug,
          category_id: null,
          metadata: {
            ...(master.metadata &&
            typeof master.metadata === 'object' &&
            !Array.isArray(master.metadata)
              ? master.metadata
              : {}),
            category_slug: resolvedItemCategory,
          },
        })
      : null;
  return candidateItemHref && /^\/[a-z]+\/[^/?#\s]+$/.test(candidateItemHref)
    ? candidateItemHref
    : getMasterProductHref(master);
}

function resolveRetiredItemHref(
  target: {
    itemSlug: string;
    itemCategoryId: string | null;
  },
  itemCategorySlugs: ReadonlyMap<string, CanonicalCategorySlug | false>
): string | null {
  if (!target.itemCategoryId || !isSafeComboSlugToken(target.itemSlug)) {
    return null;
  }
  const cat = itemCategorySlugs.get(target.itemCategoryId);
  if (typeof cat !== 'string' || !isCanonicalCategorySlug(cat)) return null;
  const href = `/${cat}/${target.itemSlug}`;
  return /^\/[a-z]+\/[^/?#\s]+$/.test(href) ? href : null;
}

function computeMedianPrice(values: readonly number[]): number {
  const valid = values
    .filter((v) => Number.isFinite(v) && v > 0 && v <= MAX_VALID_VND_PRICE)
    .sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid]!;
  return Math.round((valid[mid - 1]! + valid[mid]!) / 2);
}

interface AggregatedMerchantAudit {
  internalKey: string;
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  platform: string;
  isOfficial: boolean;
  dosafeRiskScore: number | null;
  reviewRiskScore: number | null;
  reviewRiskBreakdown: { total_reviews?: unknown } | null;
  riskScore: number | null;
  cartOfferCount: number;
  cartFakeDiscountCount: number;
}

function accumulateMerchantSignals(
  offers: readonly MerchantOffer[],
  radarFakeTrap: {
    merchantId: string;
    merchantName: string;
    platform: string;
  } | null,
  acc: Map<string, AggregatedMerchantAudit>
): void {
  const inStockValid = offers.filter(
    (o) =>
      !isOfferUnavailable(o) &&
      typeof o.price_current === 'number' &&
      Number.isSafeInteger(o.price_current) &&
      o.price_current >= 1 &&
      o.price_current <= MAX_VALID_VND_PRICE
  );
  const plausible = plausibleOffers(inStockValid);
  const median =
    plausible.length >= 2
      ? computeMedianPrice(plausible.map((o) => o.price_current))
      : 0;

  let trapCountedForProduct = false;

  for (let idx = 0; idx < plausible.length; idx++) {
    const offer = plausible[idx]!;
    const identity = resolveComboStoreIdentity(offer, `agg-${idx + 1}`);
    const isOfficial = offer.merchant?.is_official === true;
    const dosafe =
      typeof offer.merchant?.dosafe_risk_score === 'number' &&
      Number.isFinite(offer.merchant.dosafe_risk_score)
        ? offer.merchant.dosafe_risk_score
        : null;
    const breakdown =
      offer.merchant?.review_risk_breakdown &&
      typeof offer.merchant.review_risk_breakdown === 'object' &&
      !Array.isArray(offer.merchant.review_risk_breakdown)
        ? (offer.merchant.review_risk_breakdown as { total_reviews?: unknown })
        : null;
    // Normalize each review score against its own breakdown so measured evidence
    // and its score stay paired regardless of cart item order.
    const normalizedReview = reviewRiskScoreOrNull({
      review_risk_score: offer.merchant?.review_risk_score,
      review_risk_breakdown: breakdown,
    });
    const risk =
      typeof offer.merchant?.risk_score === 'number' &&
      Number.isFinite(offer.merchant.risk_score)
        ? offer.merchant.risk_score
        : null;

    let isFakeSale = false;
    if (median > 0) {
      const validOrig = normalizeOfferOriginalPrice(
        offer.price_current,
        offer.price_original
      );
      if (validOrig && validOrig > offer.price_current) {
        const fakeMarkupPct = Number(
          (((validOrig - median) / median) * 100).toFixed(1)
        );
        if (
          fakeMarkupPct >= FAKE_MARKUP_THRESHOLD_PCT &&
          offer.price_current >= median
        ) {
          isFakeSale = true;
        }
      }
    }

    if (
      !isFakeSale &&
      !trapCountedForProduct &&
      radarFakeTrap &&
      ((identity.merchantId &&
        radarFakeTrap.merchantId === identity.merchantId) ||
        (!identity.merchantId &&
          radarFakeTrap.platform.toLowerCase() === identity.platform &&
          radarFakeTrap.merchantName.toLowerCase() ===
            identity.merchantName.toLowerCase()))
    ) {
      isFakeSale = true;
      trapCountedForProduct = true;
    }

    const prev = acc.get(identity.internalKey);
    if (prev) {
      prev.cartOfferCount += 1;
      if (isFakeSale) prev.cartFakeDiscountCount += 1;
      prev.isOfficial = prev.isOfficial && isOfficial;
      if (dosafe !== null) {
        prev.dosafeRiskScore =
          prev.dosafeRiskScore === null
            ? dosafe
            : Math.max(prev.dosafeRiskScore, dosafe);
      }
      if (
        normalizedReview !== null &&
        (prev.reviewRiskScore === null ||
          normalizedReview > prev.reviewRiskScore)
      ) {
        prev.reviewRiskScore = normalizedReview;
        prev.reviewRiskBreakdown = breakdown;
      }
      if (risk !== null) {
        prev.riskScore =
          prev.riskScore === null ? risk : Math.max(prev.riskScore, risk);
      }
    } else {
      acc.set(identity.internalKey, {
        internalKey: identity.internalKey,
        storeKey: identity.storeKey,
        merchantId: identity.merchantId,
        merchantName: identity.merchantName,
        platform: identity.platform,
        isOfficial,
        dosafeRiskScore: dosafe,
        reviewRiskScore: normalizedReview,
        reviewRiskBreakdown: normalizedReview !== null ? breakdown : null,
        riskScore: risk,
        cartOfferCount: 1,
        cartFakeDiscountCount: isFakeSale ? 1 : 0,
      });
    }
  }
}

export type MerchantBadgeAuditScope = 'merchant_wide' | 'cart_only_unverified';

export interface ComboCartApiMerchantBadge extends MerchantTrustBadgeResult {
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  platform: string;
  auditScope: MerchantBadgeAuditScope;
  cartOfferCount: number;
  cartFakeDiscountCount: number;
}

export interface ComboCartApiStoreGroup extends ComboCartStoreGroup {
  trustBadge: ComboCartApiMerchantBadge;
}

export interface ComboCartApiPlan extends Omit<ComboCartPlan, 'storeGroups'> {
  storeGroups: ComboCartApiStoreGroup[];
}

export interface ComboCartItemSummary {
  requestedSlug: string;
  resolvedSlug: string | null;
  itemSlug: string | null;
  masterProductId: string | null;
  name: string;
  brand: string | null;
  categorySlug: CanonicalCategorySlug | null;
  productHref: string | null;
  sizeRequired: boolean;
  retiredVariant: boolean;
  found: boolean;
  offerCount: number;
  dealRadar: ReturnType<typeof radarExportFields> | null;
}

export interface ComboCartOrchestrationData {
  query: ParsedComboCartQuery;
  items: ComboCartItemSummary[];
  missingSlugs: string[];
  singleStoreBest: ComboCartApiPlan | null;
  multiStoreOptimal: ComboCartApiPlan | null;
  savingsVsSingleStoreVnd: number;
  savingsVsSingleStorePct: number;
  cheapestPerItemSubtotalVnd: number | null;
  uncoveredSlugs: string[];
  merchantBadges: ComboCartApiMerchantBadge[];
  diagnostics: ComboCartDiagnostics;
}

export type ComboCartOrchestrationResult =
  | {
      ok: true;
      data: ComboCartOrchestrationData;
      masterUpdatedAtById: Record<string, string | null>;
    }
  | {
      ok: false;
      code: 'INVALID_QUERY';
      error: string;
    };

function groupLookupKey(
  group: Pick<ComboCartStoreGroup, 'merchantId' | 'storeKey'>
): string {
  return group.merchantId ? `id:${group.merchantId}` : group.storeKey;
}

function attachTrustBadgesToPlan(
  plan: ComboCartPlan | null,
  badgesByInternalKey: ReadonlyMap<string, ComboCartApiMerchantBadge>
): ComboCartApiPlan | null {
  if (!plan) return null;
  return {
    ...plan,
    storeGroups: plan.storeGroups.map((group) => {
      const found = badgesByInternalKey.get(groupLookupKey(group));
      if (found) {
        return { ...group, trustBadge: found };
      }
      const fallbackBadge = evaluateMerchantTrustBadge({
        risk_score: group.riskScore,
        is_official: group.isOfficial,
        offerCount: group.itemCount,
        activeFakeDiscountCount: null,
      });
      return {
        ...group,
        trustBadge: {
          ...fallbackBadge,
          storeKey: group.storeKey,
          merchantId: group.merchantId,
          merchantName: group.merchantName,
          platform: group.platform,
          auditScope: 'cart_only_unverified',
          cartOfferCount: group.itemCount,
          cartFakeDiscountCount: 0,
        },
      };
    }),
  };
}

function normalizeQueryOptions(
  input: ParsedComboCartQuery
): { ok: true; value: ParsedComboCartQuery } | { ok: false; error: string } {
  if (!Array.isArray(input.items)) {
    return {
      ok: false,
      error: `Provide between ${COMBO_CART_MIN_ITEMS} and ${COMBO_CART_MAX_ITEMS} unique product slugs.`,
    };
  }
  const uniqueSlugs: string[] = [];
  const seenLower = new Set<string>();
  for (const part of input.items) {
    const token = trimEdgeControlAndWhitespace(String(part ?? ''));
    if (!isSafeComboSlugToken(token)) {
      return {
        ok: false,
        error: 'Invalid product slug in items.',
      };
    }
    const lower = token.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    uniqueSlugs.push(token);
  }

  if (
    uniqueSlugs.length < COMBO_CART_MIN_ITEMS ||
    uniqueSlugs.length > COMBO_CART_MAX_ITEMS
  ) {
    return {
      ok: false,
      error: `Provide between ${COMBO_CART_MIN_ITEMS} and ${COMBO_CART_MAX_ITEMS} unique product slugs.`,
    };
  }

  const minTrust = Number.isFinite(input.minTrust)
    ? Math.max(0, Math.min(100, input.minTrust))
    : COMBO_CART_DEFAULT_MIN_TRUST;
  const maxStores = Number.isSafeInteger(input.maxStores)
    ? Math.max(
        COMBO_CART_MIN_MAX_STORES,
        Math.min(COMBO_CART_MAX_MAX_STORES, input.maxStores)
      )
    : COMBO_CART_DEFAULT_MAX_STORES;
  const shippingVnd = Number.isSafeInteger(input.shippingVnd)
    ? Math.max(0, Math.min(COMBO_CART_MAX_SHIPPING_VND, input.shippingVnd))
    : COMBO_CART_DEFAULT_SHIPPING_VND;

  return {
    ok: true,
    value: {
      items: uniqueSlugs,
      officialOnly: Boolean(input.officialOnly),
      minTrust: minTrust === 0 ? 0 : minTrust,
      maxStores,
      shippingVnd: shippingVnd === 0 ? 0 : shippingVnd,
    },
  };
}

/**
 * Shared server-only orchestration for combo cart optimization and live
 * merchant-wide `verified_safe` audit badges. Used by both
 * `GET /api/v1/rate/combo-cart` and MCP `optimize_combo_cart`.
 */
export async function executeComboCartOptimization(
  input: {
    items: readonly string[];
    officialOnly?: boolean;
    minTrust?: number;
    maxStores?: number;
    shippingVnd?: number;
  },
  readers?: ComboCartDataReaders
): Promise<ComboCartOrchestrationResult> {
  const normalized = normalizeQueryOptions({
    items: [...(input.items ?? [])],
    officialOnly: input.officialOnly ?? false,
    minTrust: input.minTrust ?? COMBO_CART_DEFAULT_MIN_TRUST,
    maxStores: input.maxStores ?? COMBO_CART_DEFAULT_MAX_STORES,
    shippingVnd: input.shippingVnd ?? COMBO_CART_DEFAULT_SHIPPING_VND,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      code: 'INVALID_QUERY',
      error: normalized.error,
    };
  }

  const {
    items: requestedSlugs,
    officialOnly,
    minTrust,
    maxStores,
    shippingVnd,
  } = normalized.value;

  const resolveWatchlistSlugFn =
    readers?.resolveWatchlistSlug ?? resolveWatchlistSlug;
  const getMasterBySlugFn =
    readers?.getCachedMasterProductBySlug ?? getCachedMasterProductBySlug;
  const getOffersBatchFn =
    readers?.getMasterProductOffersBatch ?? getMasterProductOffersBatch;
  const getMerchantProfileFn =
    readers?.getCachedMerchantProfileById ?? getCachedMerchantProfileById;

  const resolvedTargets = await Promise.all(
    requestedSlugs.map(async (requestedSlug) => {
      const target = await resolveWatchlistSlugFn(requestedSlug);
      // Never substitute another live variant's offers for a retired variant
      // slug; require explicit size selection instead while preserving Item
      // slug default-variant resolution.
      const isRetiredVariantSubstitution =
        target !== null &&
        target.sizeRequired &&
        target.itemSlug.toLowerCase() !== requestedSlug.toLowerCase() &&
        target.variantSlug.toLowerCase() !== requestedSlug.toLowerCase();
      const master = isRetiredVariantSubstitution
        ? null
        : await getMasterBySlugFn(target?.variantSlug ?? requestedSlug);
      return {
        requestedSlug,
        target,
        isRetiredVariantSubstitution,
        master,
      };
    })
  );

  const seenMasterIds = new Set<string>();
  const masterUpdatedAtById: Record<string, string | null> = Object.create(
    null
  ) as Record<string, string | null>;
  for (const entry of resolvedTargets) {
    if (!entry.master) continue;
    if (seenMasterIds.has(entry.master.id)) {
      return {
        ok: false,
        code: 'INVALID_QUERY',
        error: 'Requested slugs resolve to duplicate products.',
      };
    }
    seenMasterIds.add(entry.master.id);
    masterUpdatedAtById[entry.master.id] =
      typeof entry.master.updated_at === 'string'
        ? entry.master.updated_at
        : null;
  }

  const validMasters = resolvedTargets
    .map((r) => r.master)
    .filter((m): m is MasterProduct => m !== null);
  const itemCategoryIds = Array.from(
    new Set(
      resolvedTargets
        .map((r) => r.target?.itemCategoryId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const [offersByMaster, itemCategorySlugs] = await Promise.all([
    validMasters.length > 0
      ? getOffersBatchFn(validMasters.map((m) => m.id))
      : Promise.resolve(new Map<string, MerchantOffer[]>()),
    resolveItemCategorySlugs(itemCategoryIds, {
      getCachedCategorySlugById: readers?.getCachedCategorySlugById,
      getCategorySlugByIdUncached: readers?.getCategorySlugByIdUncached,
    }),
  ]);

  const missingSlugs: string[] = [];
  const merchantAuditByInternalKey = new Map<string, AggregatedMerchantAudit>();
  const optimizerItems: ComboCartItemInput[] = [];
  const itemSummaries: ComboCartItemSummary[] = [];

  for (const entry of resolvedTargets) {
    if (!entry.master) {
      missingSlugs.push(entry.requestedSlug);
      optimizerItems.push({
        slug: entry.requestedSlug,
        name: entry.requestedSlug,
        offers: [],
      });
      itemSummaries.push({
        requestedSlug: entry.requestedSlug,
        resolvedSlug: null,
        itemSlug: entry.target?.itemSlug ?? null,
        masterProductId: null,
        name: entry.requestedSlug,
        brand: null,
        categorySlug: null,
        productHref:
          entry.isRetiredVariantSubstitution && entry.target
            ? resolveRetiredItemHref(entry.target, itemCategorySlugs)
            : null,
        sizeRequired: entry.isRetiredVariantSubstitution,
        retiredVariant: entry.isRetiredVariantSubstitution,
        found: false,
        offerCount: 0,
        dealRadar: null,
      });
      continue;
    }

    const master = entry.master;
    const rawOffers = offersByMaster.get(master.id) ?? [];
    const publicOffers = rawOffers.map(withPublicOfferReviewRisk);
    const radarSignal = computeProductRadarSignal(master, publicOffers);

    const inStockValid = publicOffers.filter(
      (o) =>
        !isOfferUnavailable(o) &&
        typeof o.price_current === 'number' &&
        Number.isSafeInteger(o.price_current) &&
        o.price_current >= 1 &&
        o.price_current <= MAX_VALID_VND_PRICE
    );
    const baitIds = implausiblyLowOfferIds(inStockValid);

    accumulateMerchantSignals(
      publicOffers,
      radarSignal.fakeSaleTrap
        ? {
            merchantId: radarSignal.fakeSaleTrap.merchantId,
            merchantName: radarSignal.fakeSaleTrap.merchantName,
            platform: radarSignal.fakeSaleTrap.platform,
          }
        : null,
      merchantAuditByInternalKey
    );

    optimizerItems.push({
      slug: entry.requestedSlug,
      name: master.name,
      offers: publicOffers,
      implausiblyLowOfferIds: baitIds,
    });

    itemSummaries.push({
      requestedSlug: entry.requestedSlug,
      resolvedSlug: master.slug,
      itemSlug: entry.target?.itemSlug ?? null,
      masterProductId: master.id,
      name: master.name,
      brand: master.brand ?? null,
      categorySlug: getMasterProductCategorySlug(master),
      productHref: resolveComboItemHref(
        master,
        entry.target,
        itemCategorySlugs
      ),
      sizeRequired: Boolean(entry.target?.sizeRequired),
      retiredVariant: false,
      found: true,
      offerCount: inStockValid.length,
      dealRadar: radarExportFields(radarSignal),
    });
  }

  const optimization = optimizeComboCart(optimizerItems, {
    officialOnly,
    minTrust,
    maxStores,
    shippingVndPerOrder: shippingVnd,
  });

  // Bounded fan-out: only read merchant profiles for stores appearing in Plan A
  // or Plan B (never scan the entire merchant directory).
  const referencedInternalKeys = new Set<string>();
  for (const plan of [
    optimization.singleStoreBest,
    optimization.multiStoreOptimal,
  ]) {
    if (!plan) continue;
    for (const group of plan.storeGroups) {
      referencedInternalKeys.add(groupLookupKey(group));
    }
  }

  const referencedAudits = Array.from(referencedInternalKeys)
    .map((key) => merchantAuditByInternalKey.get(key))
    .filter((agg): agg is AggregatedMerchantAudit => Boolean(agg));

  const merchantProfiles = await Promise.all(
    referencedAudits.map((agg) =>
      agg.merchantId
        ? getMerchantProfileFn(agg.merchantId).catch(() => null)
        : Promise.resolve(null)
    )
  );

  const badgesByInternalKey = new Map<string, ComboCartApiMerchantBadge>();
  const merchantBadges: ComboCartApiMerchantBadge[] = [];

  for (let i = 0; i < referencedAudits.length; i++) {
    const agg = referencedAudits[i]!;
    const profile = merchantProfiles[i] ?? null;

    let merchantOfferCount: number;
    let activeFakeDiscountCount: number | null;
    let auditScope: MerchantBadgeAuditScope;

    if (profile) {
      const activeListings = profile.listings.filter(
        (l) => !isOfferUnavailable(l)
      );
      merchantOfferCount = activeListings.length;
      const profileFakeCount = activeListings.filter(
        (l) =>
          l.discount_analysis?.verdict === 'fake_discount' ||
          l.discount_analysis?.verdict === 'suspicious_discount'
      ).length;
      // An active listing advertising a strikethrough discount without a
      // resolved verdict (e.g. unclustered cluster_id = null) cannot earn
      // clean merchant-wide discount clearance.
      const hasUnauditedActiveDiscount = activeListings.some((l) => {
        const validOrig = normalizeOfferOriginalPrice(
          l.price_current,
          l.price_original
        );
        const advertisesDiscount =
          (validOrig !== null && validOrig > l.price_current) ||
          (typeof l.price_original === 'number' &&
            Number.isFinite(l.price_original) &&
            l.price_original > Math.max(0, l.price_current));
        const hasVerdict = Boolean(l.discount_analysis?.verdict);
        return advertisesDiscount && !hasVerdict;
      });
      const knownFakeCount = Math.max(
        profileFakeCount,
        agg.cartFakeDiscountCount
      );
      if (knownFakeCount > 0) {
        activeFakeDiscountCount = knownFakeCount;
      } else if (hasUnauditedActiveDiscount) {
        activeFakeDiscountCount = null;
      } else {
        activeFakeDiscountCount = 0;
      }
      auditScope = 'merchant_wide';
    } else {
      merchantOfferCount = agg.cartOfferCount;
      activeFakeDiscountCount =
        agg.cartFakeDiscountCount > 0 ? agg.cartFakeDiscountCount : null;
      auditScope = 'cart_only_unverified';
    }

    const badge = evaluateMerchantTrustBadge({
      dosafe_risk_score: agg.dosafeRiskScore,
      review_risk_score: agg.reviewRiskScore,
      review_risk_breakdown: agg.reviewRiskBreakdown,
      risk_score: agg.riskScore,
      is_official: agg.isOfficial,
      offerCount: merchantOfferCount,
      activeFakeDiscountCount,
    });

    const fullBadge: ComboCartApiMerchantBadge = {
      storeKey: agg.storeKey,
      merchantId: agg.merchantId,
      merchantName: agg.merchantName,
      platform: agg.platform,
      auditScope,
      cartOfferCount: agg.cartOfferCount,
      cartFakeDiscountCount: agg.cartFakeDiscountCount,
      ...badge,
    };
    badgesByInternalKey.set(agg.internalKey, fullBadge);
    merchantBadges.push(fullBadge);
  }

  const singleStoreBest = attachTrustBadgesToPlan(
    optimization.singleStoreBest,
    badgesByInternalKey
  );
  const multiStoreOptimal = attachTrustBadgesToPlan(
    optimization.multiStoreOptimal,
    badgesByInternalKey
  );

  return {
    ok: true,
    masterUpdatedAtById,
    data: {
      query: normalized.value,
      items: itemSummaries,
      missingSlugs,
      singleStoreBest,
      multiStoreOptimal,
      savingsVsSingleStoreVnd: optimization.savingsVsSingleStoreVnd,
      savingsVsSingleStorePct: optimization.savingsVsSingleStorePct,
      cheapestPerItemSubtotalVnd: optimization.cheapestPerItemSubtotalVnd,
      uncoveredSlugs: optimization.uncoveredSlugs,
      merchantBadges,
      diagnostics: optimization.diagnostics,
    },
  };
}
