import { NextRequest, NextResponse } from 'next/server';
import {
  computeProductRadarSignal,
  getCachedCompareMasterProducts,
  getCachedFilteredReviewCountsByMaster,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCrossPlatformDealRadar,
  getMasterProductHref,
} from '@/server/rate';
import {
  ItemModelUnavailableError,
  type RateItemVariant,
} from '@/lib/rate-api';
import { itemFromStats } from '@/lib/item-page';
import { parseOgVersusPair } from '@/lib/seo';
import {
  BoundedSlidingWindowRateLimiter,
  PUBLIC_API_CORS_HEADERS,
  extractClientRateLimitKey,
  jsonApiError,
  rateLimitExceededResponse,
} from '@/server/rate/api-handler';
import {
  getCachedCatalogSlugResolution,
  getCachedCategorySlugById,
  getCachedItemVariants,
} from '@/server/rate/item-route';
import { isItemModelOn } from '@/server/rate/item-model';
import { resolveVersusPlan } from '@/server/rate/item-compare';
import { canonicalVersusOrder, inPairOrder } from '@/lib/item-compare';
import { isMultiPlatformFloor } from '@/lib/deal-radar';
import {
  isOfferUnavailable,
  productMarketStats,
} from '@/lib/product-market-stats';
import {
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
} from '@/lib/rate-domain';
import { scoreMasterProductForLeaderboard } from '@/lib/leaderboard-engine';
import { withScoringSpecs } from '@/lib/hero-products';
import {
  PERSONA_WEIGHTS,
  computeVersusWeightedResult,
  versusCriteriaHeadToHead,
} from '@/lib/versus-score';
import {
  executeComboCartOptimization,
  type ComboCartApiPlan,
} from '@/server/rate/combo-cart';
import {
  parseOgTruthCardQuery,
  renderOgTruthCardHttpResponse,
  type ComboTruthCardData,
  type ComboTruthCardPlanSummary,
  type DealsTruthCardData,
  type OgTruthCardData,
  type ParsedOgTruthCardQuery,
  type ProductTruthCardData,
  type VersusTruthCardData,
} from '@/lib/og-truth-card';

export const runtime = 'nodejs';

export const ogTruthCardRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxBuckets: 5_000,
});

export interface OgTruthCardResolvers {
  readonly resolveProduct: (
    slug: string,
    variant?: string | null
  ) => Promise<ProductTruthCardData | null>;
  readonly resolveVersus: (
    pair: readonly [string, string]
  ) => Promise<VersusTruthCardData | null>;
  readonly resolveDeals: () => Promise<DealsTruthCardData>;
  readonly resolveCombo?: (
    query: Extract<ParsedOgTruthCardQuery, { type: 'combo' }>
  ) => Promise<ComboTruthCardData | null>;
  readonly rateLimiter?: BoundedSlidingWindowRateLimiter;
}

function pickDefaultItemVariant(
  variants: readonly RateItemVariant[],
  defaultId: string | null | undefined
): RateItemVariant | undefined {
  return (
    variants.find((v) => v.id === defaultId && v.min_price > 0) ??
    variants.find((v) => v.min_price > 0) ??
    variants.find((v) => v.id === defaultId) ??
    variants[0]
  );
}

async function defaultResolveProductTruthCard(
  slug: string,
  variantKey?: string | null
): Promise<ProductTruthCardData | null> {
  const lowerSlug = slug.toLowerCase();
  let displaySlug = lowerSlug;
  let displayNameOverride: string | null = null;
  let itemGroupStats: {
    minPrice: number;
    maxPrice: number;
    sellerCount: number;
  } | null = null;
  let product = null;
  let resolvedViaItemModel = false;

  if (isItemModelOn()) {
    try {
      const exactRes = await getCachedCatalogSlugResolution(slug);
      const resolution =
        exactRes ??
        (slug !== lowerSlug
          ? await getCachedCatalogSlugResolution(lowerSlug)
          : null);
      if (resolution?.kind === 'item') {
        resolvedViaItemModel = true;
        const variants = await getCachedItemVariants(resolution.item);
        if (variantKey) {
          const explicitVar = variants.find(
            (v) => v.variant_key === variantKey
          );
          if (!explicitVar) {
            return null;
          }
          product = await getCachedMasterProductBySlug(explicitVar.slug);
          if (product) {
            displaySlug = product.slug;
          }
        } else {
          const picked = pickDefaultItemVariant(
            variants,
            resolution.item.default_variant_id
          );
          if (picked) {
            product = await getCachedMasterProductBySlug(picked.slug);
            if (product) {
              displaySlug = resolution.item.slug;
              displayNameOverride = resolution.item.name || null;
              if (variants.length > 1) {
                itemGroupStats = itemFromStats(variants);
              }
            }
          }
        }
      } else if (resolution?.kind === 'variant') {
        resolvedViaItemModel = true;
        product = await getCachedMasterProductBySlug(resolution.variant.slug);
        if (product) {
          displaySlug = resolution.variant.slug;
        } else {
          const variants = await getCachedItemVariants(resolution.item);
          const fallbackVar = pickDefaultItemVariant(
            variants,
            resolution.item.default_variant_id
          );
          if (fallbackVar) {
            product = await getCachedMasterProductBySlug(fallbackVar.slug);
            if (product) {
              displaySlug = resolution.item.slug || product.slug;
              displayNameOverride = resolution.item.name || null;
              if (variants.length > 1) {
                itemGroupStats = itemFromStats(variants);
              }
            }
          }
        }
      }
    } catch (err) {
      if (!(err instanceof ItemModelUnavailableError)) {
        throw err;
      }
    }
  }

  if (!product && !resolvedViaItemModel) {
    if (variantKey) {
      return null;
    }
    product = await getCachedMasterProductBySlug(slug);
    if (product) {
      displaySlug = product.slug;
    }
  }

  if (!product) {
    return null;
  }

  const [offers, filteredCounts, categorySlugById] = await Promise.all([
    getCachedMasterProductOffers(product.id),
    getCachedFilteredReviewCountsByMaster().catch(
      (): Record<string, number> => ({})
    ),
    getCachedCategorySlugById().catch(() => new Map<string, string>()),
  ]);

  const inStockOffers = offers.filter((o) => !isOfferUnavailable(o));
  const radarSignal = computeProductRadarSignal(product, inStockOffers);
  const marketStats = itemGroupStats ?? productMarketStats(product);
  const href = getMasterProductHref(product, categorySlugById);
  const categoryPath = href.split('/').slice(0, 2).join('/') || '/smartphones';

  const userScore5 = resolveCompareEffectiveUserRating(product);
  const expertScore10 = resolveCompareExpertRating10(product);
  const authenticReviews = Math.max(
    0,
    Math.floor(
      Number(product.authentic_review_count ?? product.total_reviews ?? 0) || 0
    )
  );
  const rawFilteredCount =
    filteredCounts instanceof Map
      ? filteredCounts.get(product.id)
      : filteredCounts &&
          typeof filteredCounts === 'object' &&
          Object.hasOwn(filteredCounts, product.id)
        ? (filteredCounts as Record<string, number>)[product.id]
        : 0;
  const filteredReviews = Math.max(
    0,
    Math.floor(Number(rawFilteredCount ?? 0) || 0)
  );

  const radarKind =
    radarSignal.verdict === 'genuine_deal'
      ? isMultiPlatformFloor(radarSignal.genuineDeal)
        ? 'multi_platform_floor'
        : 'below_median'
      : radarSignal.verdict === 'fake_sale_trap'
        ? 'fake_sale_trap'
        : 'verified';

  return {
    type: 'product',
    slug: displaySlug,
    categoryPath,
    name: displayNameOverride || product.name,
    brand: product.brand,
    minPriceVnd: marketStats.minPrice,
    maxPriceVnd: marketStats.maxPrice,
    sellerCount: marketStats.sellerCount,
    userScore5,
    expertScore10,
    authenticReviews,
    filteredReviews,
    radarKind,
    savingsPct: radarSignal.savingsPct,
    fakeMarkupPct: radarSignal.fakeMarkupPct,
    hasFakeSaleTrap: radarSignal.fakeSaleTrap !== null,
  };
}

async function defaultResolveVersusTruthCard(
  pair: readonly [string, string]
): Promise<VersusTruthCardData | null> {
  let effectivePlan = await resolveVersusPlan(pair[0], pair[1]);
  if (effectivePlan?.kind === 'redirect') {
    const redirectedVersus = effectivePlan.to
      .split('?')[0]!
      .replace(/^\/compare\//, '');
    const redirectPair = parseOgVersusPair(redirectedVersus, 120, true);
    if (!redirectPair) {
      return null;
    }
    effectivePlan = await resolveVersusPlan(redirectPair[0], redirectPair[1]);
  }
  if (effectivePlan && effectivePlan.kind !== 'render') {
    return null;
  }

  let resolvedPair: [string, string];
  let canonicalVersusSlug: string;

  if (effectivePlan?.kind === 'render') {
    resolvedPair = [effectivePlan.slugA, effectivePlan.slugB];
    canonicalVersusSlug = effectivePlan.canonical.replace(/^\/compare\//, '');
  } else {
    resolvedPair = canonicalVersusOrder(
      pair[0].toLowerCase(),
      pair[1].toLowerCase()
    );
    canonicalVersusSlug = `${resolvedPair[0]}-vs-${resolvedPair[1]}`;
  }

  const compared = await getCachedCompareMasterProducts(resolvedPair.join(','));
  const [prodA, prodB] = inPairOrder(compared, resolvedPair);
  if (!prodA || !prodB) {
    return null;
  }

  const scoreA = scoreMasterProductForLeaderboard(
    withScoringSpecs(prodA),
    'combined'
  );
  const scoreB = scoreMasterProductForLeaderboard(
    withScoringSpecs(prodB),
    'combined'
  );
  const overall = computeVersusWeightedResult(
    scoreA,
    scoreB,
    PERSONA_WEIGHTS.default,
    'default'
  );
  const criteriaRows = versusCriteriaHeadToHead(scoreA, scoreB);
  const winsA = criteriaRows.filter((r) => r.winner === 'A').length;
  const winsB = criteriaRows.filter((r) => r.winner === 'B').length;
  const statsA = productMarketStats(prodA);
  const statsB = productMarketStats(prodB);

  return {
    type: 'versus',
    versusSlug: canonicalVersusSlug,
    itemA: {
      slug: prodA.slug,
      name: prodA.name,
      brand: prodA.brand,
      score5: overall.finalA,
      minPriceVnd: statsA.minPrice,
      sellerCount: statsA.sellerCount,
      criterionWins: winsA,
    },
    itemB: {
      slug: prodB.slug,
      name: prodB.name,
      brand: prodB.brand,
      score5: overall.finalB,
      minPriceVnd: statsB.minPrice,
      sellerCount: statsB.sellerCount,
      criterionWins: winsB,
    },
    winnerSide: overall.tie ? 'tie' : overall.winnerSide,
    scoreDelta: overall.delta,
  };
}

async function defaultResolveDealsTruthCard(): Promise<DealsTruthCardData> {
  const radar = await getCrossPlatformDealRadar({
    categorySlug: 'all',
    limit: 50,
  });

  return {
    type: 'deals',
    genuineDealCount: radar.genuineDeals.length,
    fakeSaleTrapCount: radar.fakeSaleTraps.length,
    totalOffersAnalyzed: radar.totalOffersAnalyzed,
    totalClustersAnalyzed: radar.totalClustersAnalyzed,
    topDeals: radar.genuineDeals.slice(0, 4).map((deal) => ({
      name: deal.productName,
      minPriceVnd: deal.priceCurrent,
      savingsPct: deal.savingsVsMedianPct,
      offerCount: deal.marketOfferCount,
    })),
  };
}

function toComboPlanSummary(
  plan: ComboCartApiPlan | null
): ComboTruthCardPlanSummary | null {
  if (!plan) return null;
  return {
    distinctStoreCount: plan.distinctStoreCount,
    itemsSubtotalVnd: plan.itemsSubtotalVnd,
    shippingVnd: plan.shippingVnd,
    totalVnd: plan.totalVnd,
    allOfficial: plan.allOfficial,
    avgTrustScore: plan.avgTrustScore,
    verifiedSafeStoreCount: plan.storeGroups.filter(
      (g) => g.trustBadge?.verifiedSafe === true
    ).length,
    storeNames: plan.storeGroups.map((g) => g.merchantName).filter(Boolean),
  };
}

async function defaultResolveComboTruthCard(
  query: Extract<ParsedOgTruthCardQuery, { type: 'combo' }>
): Promise<ComboTruthCardData | null> {
  const res = await executeComboCartOptimization({
    items: [...query.items],
    officialOnly: query.officialOnly,
    minTrust: query.minTrust,
    maxStores: query.maxStores,
    shippingVnd: query.shippingVnd,
  });
  if (!res.ok) {
    return null;
  }
  const foundItems = res.data.items.filter((item) => item.found);
  if (foundItems.length < 2 || res.data.missingSlugs.length > 0) {
    return null;
  }
  return {
    type: 'combo',
    items: foundItems.map((item) => ({
      slug: item.requestedSlug,
      name: item.name,
    })),
    query: {
      officialOnly: res.data.query.officialOnly,
      minTrust: res.data.query.minTrust,
      maxStores: res.data.query.maxStores,
      shippingVnd: res.data.query.shippingVnd,
    },
    singleStoreBest: toComboPlanSummary(res.data.singleStoreBest),
    multiStoreOptimal: toComboPlanSummary(res.data.multiStoreOptimal),
    savingsVsSingleStoreVnd: res.data.savingsVsSingleStoreVnd,
    savingsVsSingleStorePct: res.data.savingsVsSingleStorePct,
    snapshotTimestampIso: new Date().toISOString(),
  };
}

const DEFAULT_RESOLVERS: OgTruthCardResolvers = {
  resolveProduct: defaultResolveProductTruthCard,
  resolveVersus: defaultResolveVersusTruthCard,
  resolveDeals: defaultResolveDealsTruthCard,
  resolveCombo: defaultResolveComboTruthCard,
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

export async function handleOgTruthCardRequest(
  request: NextRequest,
  resolvers: OgTruthCardResolvers = DEFAULT_RESOLVERS
): Promise<Response> {
  const limiter = resolvers.rateLimiter ?? ogTruthCardRateLimiter;
  const clientKey = extractClientRateLimitKey(request.headers);
  if (!limiter.allow(clientKey)) {
    return rateLimitExceededResponse(
      'Rate limit exceeded. Maximum 60 OG card renders per minute.',
      {
        ...PUBLIC_API_CORS_HEADERS,
        'Cache-Control': 'no-store',
      },
      60
    );
  }

  const parsed = parseOgTruthCardQuery(
    request.nextUrl.searchParams,
    request.nextUrl.search
  );
  if (!parsed) {
    return jsonApiError(
      400,
      'Invalid or unsupported OG truth card query parameters.',
      undefined,
      { 'Cache-Control': 'no-store' }
    );
  }

  try {
    let cardData: OgTruthCardData | null = null;
    if (parsed.type === 'product') {
      cardData = await resolvers.resolveProduct(parsed.slug, parsed.variant);
    } else if (parsed.type === 'versus') {
      cardData = await resolvers.resolveVersus(parsed.pair);
    } else if (parsed.type === 'combo') {
      const resolveCombo =
        resolvers.resolveCombo ?? defaultResolveComboTruthCard;
      cardData = await resolveCombo(parsed);
    } else {
      cardData = await resolvers.resolveDeals();
    }

    if (!cardData) {
      return jsonApiError(
        404,
        'Catalog entity not found for OG truth card.',
        undefined,
        { 'Cache-Control': 'public, max-age=0, s-maxage=60' }
      );
    }

    return await renderOgTruthCardHttpResponse(cardData, {
      format: parsed.format,
      locale: parsed.locale,
      download: parsed.download,
      extraHeaders: PUBLIC_API_CORS_HEADERS,
    });
  } catch {
    return jsonApiError(500, 'Failed to generate OG truth card.', undefined, {
      'Cache-Control': 'no-store',
    });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleOgTruthCardRequest(request, DEFAULT_RESOLVERS);
}
