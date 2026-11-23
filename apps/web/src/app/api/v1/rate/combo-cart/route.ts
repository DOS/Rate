import { NextRequest, NextResponse } from 'next/server';
import {
  implausiblyLowOfferIds,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  MAX_VALID_VND_PRICE,
  normalizeOfferOriginalPrice,
  type MasterProduct,
  type MerchantOffer,
} from '@/lib/rate-api';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import {
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
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
  getMasterProductOffersBatch,
  getRateClient,
} from '@/server/rate';
import {
  BoundedSlidingWindowRateLimiter,
  PUBLIC_API_CORS_HEADERS,
  PublicApiError,
  extractClientRateLimitKey,
  jsonApiError,
  parseFiniteDecimalInput,
  rateLimitExceededResponse,
  trimEdgeControlAndWhitespace,
  withPublicOfferReviewRisk,
} from '@/server/rate/api-handler';
import { FAKE_MARKUP_THRESHOLD_PCT } from '@/server/rate/deals';
import { resolveWatchlistSlug } from '@/server/rate/item-compare';
import { getCachedCategorySlugById } from '@/server/rate/item-route';

const comboCartRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxBuckets: 5_000,
});

const NO_STORE_CORS_HEADERS: Record<string, string> = {
  ...PUBLIC_API_CORS_HEADERS,
  'Cache-Control': 'no-store',
};

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

function isSafeComboSlugToken(token: string): boolean {
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

interface ParsedComboCartQuery {
  items: string[];
  officialOnly: boolean;
  minTrust: number;
  maxStores: number;
  shippingVnd: number;
}

function parseComboCartQuery(
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
      minTrust = parsed;
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
      shippingVnd = parsed;
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

async function resolveItemCategorySlugs(
  categoryIds: readonly string[]
): Promise<Map<string, CanonicalCategorySlug | false>> {
  const out = new Map<string, CanonicalCategorySlug | false>();
  if (categoryIds.length === 0) return out;
  let cachedById: ReadonlyMap<string, string>;
  try {
    cachedById = await getCachedCategorySlugById();
  } catch {
    for (const id of categoryIds) out.set(id, false);
    return out;
  }
  await Promise.all(
    categoryIds.map(async (id) => {
      let rawSlug = cachedById.get(id);
      if (rawSlug === undefined) {
        try {
          const { data, error } = await getRateClient()
            .from('categories')
            .select('slug')
            .eq('id', id)
            .maybeSingle();
          if (error) {
            out.set(id, false);
            return;
          }
          rawSlug =
            typeof (data as { slug?: unknown } | null)?.slug === 'string'
              ? (data as { slug: string }).slug
              : undefined;
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

function cleanStoreKey(offer: MerchantOffer): string {
  const merchantId =
    typeof offer.merchant?.id === 'string'
      ? offer.merchant.id
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 128)
      : '';
  const platform =
    typeof (offer.merchant?.platform ?? offer.platform) === 'string'
      ? String(offer.merchant?.platform ?? offer.platform)
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
          .slice(0, 40)
      : '';
  return merchantId || platform || 'shopee';
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
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  platform: string;
  isOfficial: boolean;
  dosafeRiskScore: number | null;
  reviewRiskScore: number | null;
  reviewRiskBreakdown: { total_reviews?: unknown } | null;
  riskScore: number | null;
  offerCount: number;
  activeFakeDiscountCount: number;
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

  for (const offer of plausible) {
    const storeKey = cleanStoreKey(offer);
    const platform =
      (offer.merchant?.platform || offer.platform || 'shopee')
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .toLowerCase()
        .slice(0, 40) || 'shopee';
    const merchantId =
      typeof offer.merchant?.id === 'string' && offer.merchant.id.trim()
        ? offer.merchant.id
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 128)
        : null;
    const merchantName =
      typeof offer.merchant?.name === 'string' && offer.merchant.name.trim()
        ? offer.merchant.name
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 160)
        : platform.toUpperCase();
    const isOfficial = offer.merchant?.is_official === true;
    const dosafe =
      typeof offer.merchant?.dosafe_risk_score === 'number' &&
      Number.isFinite(offer.merchant.dosafe_risk_score)
        ? offer.merchant.dosafe_risk_score
        : null;
    const review =
      typeof offer.merchant?.review_risk_score === 'number' &&
      Number.isFinite(offer.merchant.review_risk_score)
        ? offer.merchant.review_risk_score
        : null;
    const risk =
      typeof offer.merchant?.risk_score === 'number' &&
      Number.isFinite(offer.merchant.risk_score)
        ? offer.merchant.risk_score
        : null;
    const breakdown =
      offer.merchant?.review_risk_breakdown &&
      typeof offer.merchant.review_risk_breakdown === 'object' &&
      !Array.isArray(offer.merchant.review_risk_breakdown)
        ? (offer.merchant.review_risk_breakdown as { total_reviews?: unknown })
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
      radarFakeTrap &&
      ((merchantId && radarFakeTrap.merchantId === merchantId) ||
        (!merchantId &&
          radarFakeTrap.platform.toLowerCase() === platform &&
          radarFakeTrap.merchantName.toLowerCase() ===
            merchantName.toLowerCase()))
    ) {
      isFakeSale = true;
    }

    if (isFakeSale) trapCountedForProduct = true;

    const prev = acc.get(storeKey);
    if (prev) {
      prev.offerCount += 1;
      if (isFakeSale) prev.activeFakeDiscountCount += 1;
      prev.isOfficial = prev.isOfficial && isOfficial;
      if (dosafe !== null) {
        prev.dosafeRiskScore =
          prev.dosafeRiskScore === null
            ? dosafe
            : Math.max(prev.dosafeRiskScore, dosafe);
      }
      if (review !== null) {
        prev.reviewRiskScore =
          prev.reviewRiskScore === null
            ? review
            : Math.max(prev.reviewRiskScore, review);
      }
      if (risk !== null) {
        prev.riskScore =
          prev.riskScore === null ? risk : Math.max(prev.riskScore, risk);
      }
      if (!prev.reviewRiskBreakdown && breakdown) {
        prev.reviewRiskBreakdown = breakdown;
      }
    } else {
      acc.set(storeKey, {
        storeKey,
        merchantId,
        merchantName,
        platform,
        isOfficial,
        dosafeRiskScore: dosafe,
        reviewRiskScore: review,
        reviewRiskBreakdown: breakdown,
        riskScore: risk,
        offerCount: 1,
        activeFakeDiscountCount: isFakeSale ? 1 : 0,
      });
    }
  }

  if (radarFakeTrap && !trapCountedForProduct) {
    const trapStoreKey =
      radarFakeTrap.merchantId.trim() ||
      radarFakeTrap.platform.trim().toLowerCase();
    const existing = trapStoreKey ? acc.get(trapStoreKey) : undefined;
    if (existing) {
      existing.activeFakeDiscountCount += 1;
    }
  }
}

export interface ComboCartApiStoreGroup extends ComboCartStoreGroup {
  trustBadge: MerchantTrustBadgeResult;
}

export interface ComboCartApiPlan extends Omit<ComboCartPlan, 'storeGroups'> {
  storeGroups: ComboCartApiStoreGroup[];
}

function attachTrustBadgesToPlan(
  plan: ComboCartPlan | null,
  badgesByStoreKey: ReadonlyMap<string, MerchantTrustBadgeResult>
): ComboCartApiPlan | null {
  if (!plan) return null;
  return {
    ...plan,
    storeGroups: plan.storeGroups.map((group) => ({
      ...group,
      trustBadge:
        badgesByStoreKey.get(group.storeKey) ??
        evaluateMerchantTrustBadge({
          risk_score: group.riskScore,
          is_official: group.isOfficial,
          offerCount: group.itemCount,
          activeFakeDiscountCount: null,
        }),
    })),
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/combo-cart?items=slug1,slug2,...&officialOnly=0|1&minTrust=80&maxStores=3&shippingVnd=0
 * Resolves 2 to 5 master product or Item slugs, runs exact single-store and bounded
 * multi-store combo cart optimization, and evaluates verified safe merchant badges.
 */
export async function GET(request: NextRequest) {
  try {
    const clientIp = extractClientRateLimitKey(request.headers);
    if (!comboCartRateLimiter.allow(clientIp)) {
      return rateLimitExceededResponse(
        'Rate limit exceeded. Maximum 60 combo-cart requests per minute.',
        NO_STORE_CORS_HEADERS
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const parsedQuery = parseComboCartQuery(searchParams);
    if (!parsedQuery.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: parsedQuery.error,
          code: 'INVALID_QUERY',
        },
        { status: 400, headers: NO_STORE_CORS_HEADERS }
      );
    }

    const {
      items: requestedSlugs,
      officialOnly,
      minTrust,
      maxStores,
      shippingVnd,
    } = parsedQuery.value;

    const resolvedTargets = await Promise.all(
      requestedSlugs.map(async (requestedSlug) => {
        const target = await resolveWatchlistSlug(requestedSlug);
        const master = await getCachedMasterProductBySlug(
          target?.variantSlug ?? requestedSlug
        );
        return { requestedSlug, target, master };
      })
    );

    const seenMasterIds = new Set<string>();
    for (const entry of resolvedTargets) {
      if (!entry.master) continue;
      if (seenMasterIds.has(entry.master.id)) {
        return jsonApiError(
          400,
          'Requested slugs resolve to duplicate products.',
          new PublicApiError('Requested slugs resolve to duplicate products.'),
          { 'Cache-Control': 'no-store' }
        );
      }
      seenMasterIds.add(entry.master.id);
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
      getMasterProductOffersBatch(validMasters.map((m) => m.id)),
      resolveItemCategorySlugs(itemCategoryIds),
    ]);

    const missingSlugs: string[] = [];
    const merchantAuditByStore = new Map<string, AggregatedMerchantAudit>();
    const optimizerItems: ComboCartItemInput[] = [];
    const itemSummaries: Array<{
      requestedSlug: string;
      resolvedSlug: string | null;
      itemSlug: string | null;
      masterProductId: string | null;
      name: string;
      brand: string | null;
      categorySlug: CanonicalCategorySlug | null;
      productHref: string | null;
      sizeRequired: boolean;
      found: boolean;
      offerCount: number;
      dealRadar: ReturnType<typeof radarExportFields> | null;
    }> = [];

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
          itemSlug: null,
          masterProductId: null,
          name: entry.requestedSlug,
          brand: null,
          categorySlug: null,
          productHref: null,
          sizeRequired: false,
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
        merchantAuditByStore
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

    const badgesByStoreKey = new Map<string, MerchantTrustBadgeResult>();
    const merchantBadges: Array<
      MerchantTrustBadgeResult & {
        storeKey: string;
        merchantId: string | null;
        merchantName: string;
        platform: string;
      }
    > = [];

    const referencedStoreKeys = new Set<string>();
    for (const plan of [
      optimization.singleStoreBest,
      optimization.multiStoreOptimal,
    ]) {
      if (!plan) continue;
      for (const group of plan.storeGroups) {
        referencedStoreKeys.add(group.storeKey);
      }
    }

    for (const storeKey of referencedStoreKeys) {
      const agg = merchantAuditByStore.get(storeKey);
      if (!agg) continue;
      const badge = evaluateMerchantTrustBadge({
        dosafe_risk_score: agg.dosafeRiskScore,
        review_risk_score: agg.reviewRiskScore,
        review_risk_breakdown: agg.reviewRiskBreakdown,
        risk_score: agg.riskScore,
        is_official: agg.isOfficial,
        offerCount: agg.offerCount,
        activeFakeDiscountCount: agg.activeFakeDiscountCount,
      });
      badgesByStoreKey.set(storeKey, badge);
      merchantBadges.push({
        storeKey: agg.storeKey,
        merchantId: agg.merchantId,
        merchantName: agg.merchantName,
        platform: agg.platform,
        ...badge,
      });
    }

    const singleStoreBest = attachTrustBadgesToPlan(
      optimization.singleStoreBest,
      badgesByStoreKey
    );
    const multiStoreOptimal = attachTrustBadgesToPlan(
      optimization.multiStoreOptimal,
      badgesByStoreKey
    );

    return NextResponse.json(
      {
        ok: true,
        data: {
          query: {
            items: requestedSlugs,
            officialOnly,
            minTrust,
            maxStores,
            shippingVnd,
          },
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
      },
      {
        status: 200,
        headers: {
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return jsonApiError(500, 'Failed to optimize combo cart', error, {
      'Cache-Control': 'no-store',
    });
  }
}
