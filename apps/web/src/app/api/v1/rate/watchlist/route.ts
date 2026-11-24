import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-api';
import {
  computeProductRadarSignal,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getMasterProductOffersBatch,
  getRateClient,
} from '@/server/rate';
import { resolveWatchlistSlug } from '@/server/rate/item-compare';
import { getCachedCategorySlugById } from '@/server/rate/item-route';
import { radarExportFields } from '@/lib/deal-radar';
import {
  PUBLIC_API_CORS_HEADERS,
  countPlausibleInStockOffers,
  jsonApiError,
  parseFiniteDecimalInput,
  parseWatchlistSlugsParam,
  resolveWatchlistMasterPriceBounds,
  selectBestOfferFromListings,
  payloadTooLargeResponse,
  readBoundedJsonBody,
} from '@/server/rate/api-handler';
import {
  authenticateRateRequest,
  isMissingRpcError,
  mapRpcRejection,
  type RpcRejection,
} from '@/server/rate/request-auth';
import { createLogger, serializeError } from '@/lib/logger';
import {
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  resolveListingPriceCurrency,
  type CanonicalCategorySlug,
} from '@/lib/rate-domain-core';
import { sanitizeCurrencyPriceValue } from '@/lib/locale-format';

const log = createLogger('api.watchlist');

const RESOLVABLE_ITEM_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UNSAFE_ITEM_SLUG_TOKENS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

function isResolvableWatchlistItemSlug(slug: unknown): slug is string {
  return (
    typeof slug === 'string' &&
    RESOLVABLE_ITEM_SLUG_REGEX.test(slug) &&
    !/^0+$/.test(slug) &&
    !slug.endsWith('.') &&
    !slug.includes('..') &&
    !(slug in Object.prototype) &&
    !UNSAFE_ITEM_SLUG_TOKENS.has(slug.toLowerCase())
  );
}

async function resolveWatchlistItemCategorySlugs(
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

const WATCHLIST_CORS_HEADERS: Record<string, string> = {
  ...PUBLIC_API_CORS_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function resolveWatchlistMerchantCount(
  rawMerchantCount: unknown,
  plausibleInStockOffersCount: number,
  currentMinPrice?: number
): number {
  if (
    typeof currentMinPrice === 'number' &&
    (!Number.isFinite(currentMinPrice) || currentMinPrice <= 0)
  ) {
    return 0;
  }
  const safeOffersCount =
    typeof plausibleInStockOffersCount === 'number' &&
    Number.isFinite(plausibleInStockOffersCount) &&
    plausibleInStockOffersCount > 0
      ? Math.min(10_000, Math.floor(plausibleInStockOffersCount))
      : 0;
  if (
    typeof rawMerchantCount === 'number' ||
    typeof rawMerchantCount === 'string'
  ) {
    const n = parseFiniteDecimalInput(rawMerchantCount);
    if (Number.isFinite(n) && n >= 0) {
      const floored = Math.min(10_000, Math.floor(n));
      if (floored > 0 || safeOffersCount === 0) {
        return floored;
      }
    }
  }
  return safeOffersCount;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: WATCHLIST_CORS_HEADERS,
  });
}

// SQLSTATEs raised deliberately by rate.upsert_price_alert
// (DOS-Me 20261017130000_rate_price_alert_auth_gate.sql).
const RPC_REJECTIONS: Record<string, RpcRejection> = {
  // the body is validated above, so this is the missing confirmed email
  '22023': {
    status: 422,
    code: 'EMAIL_NOT_VERIFIED',
    error: 'Tài khoản cần có email đã xác minh để nhận cảnh báo giá.',
  },
  P0002: { status: 404, code: 'NOT_FOUND', error: 'Không tìm thấy sản phẩm.' },
  // not signed in, a Supabase anonymous sign-in, or another user's alert
  '42501': {
    status: 403,
    code: 'FORBIDDEN',
    error: 'Bạn cần đăng nhập bằng tài khoản thật để lưu cảnh báo giá.',
  },
  // more than 100 active alerts
  '54000': {
    status: 429,
    code: 'RATE_LIMITED',
    error: 'Bạn đã có quá 100 cảnh báo giá đang hoạt động.',
  },
};

/**
 * GET /api/v1/rate/watchlist?slugs=apple-iphone-16-128gb,apple-iphone-16-pro-max-256gb
 * Evaluates live deal status across all 10 platforms for a list of watched product slugs,
 * returning the lowest-price platform offer, multi-platform coverage metadata, and Deal Radar signal.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slugs = parseWatchlistSlugsParam(searchParams.get('slugs'), 20);

    if (slugs.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          count: 0,
          items: {},
        },
        {
          status: 200,
          headers: {
            ...WATCHLIST_CORS_HEADERS,
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          },
        }
      );
    }

    // RATE_ITEM_MODEL on: an Item slug watches its size, or its default
    // size until one is chosen (`size_required`, DOS/Rate#1156); off: null.
    const itemTargets = new Map<
      string,
      {
        variantSlug: string;
        itemSlug: string;
        itemCategoryId: string | null;
        sizeRequired: boolean;
      }
    >();
    const masterEntries = await Promise.all(
      slugs.map(async (slug) => {
        const target = await resolveWatchlistSlug(slug);
        if (target) itemTargets.set(slug, target);
        const master = await getCachedMasterProductBySlug(
          target?.variantSlug ?? slug
        );
        return master ? ([slug, master] as const) : null;
      })
    );
    const validMasterEntries = masterEntries.filter(
      (entry): entry is NonNullable<(typeof masterEntries)[number]> =>
        entry !== null
    );
    const itemCategoryIds = Array.from(
      new Set(
        Array.from(itemTargets.values())
          .map((t) => t.itemCategoryId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const [offersByMaster, itemCategorySlugs] = await Promise.all([
      getMasterProductOffersBatch(
        validMasterEntries.map(([, master]) => master.id)
      ),
      resolveWatchlistItemCategorySlugs(itemCategoryIds),
    ]);

    const entries = validMasterEntries.map(([slug, master]) => {
      const target = itemTargets.get(slug);
      const offers = offersByMaster.get(master.id) ?? [];
      const { bestOffer, offerPlatforms } = selectBestOfferFromListings(offers);
      const plausibleOfferCount = countPlausibleInStockOffers(offers);
      const radarSignal = computeProductRadarSignal(master, offers);
      const { currentMinPrice, currentMaxPrice } =
        // The stored stats every page shows: in stock, no bait prices
        // (DOS/Rate#802, #1141).
        resolveWatchlistMasterPriceBounds(
          master,
          bestOffer?.price,
          MAX_VALID_VND_PRICE
        );
      // RATE_ITEM_MODEL on: point straight to the canonical Item page
      // (`/<category>/<item-slug>`) in the Item's own category (#1281, #1829)
      // with no `?v=` query parameter and zero 308 redirect hops; off,
      // unlinked, non-catalogue Item category, or unresolvable Item slug (#1768):
      // fall back to the master's own href.
      const resolvedItemCategory: CanonicalCategorySlug | null = target
        ? target.itemCategoryId === null
          ? getMasterProductCategorySlug(master)
          : (() => {
              const mapped = itemCategorySlugs.get(target.itemCategoryId);
              return typeof mapped === 'string' &&
                isCanonicalCategorySlug(mapped)
                ? mapped
                : null;
            })()
        : null;
      const candidateItemHref =
        target &&
        resolvedItemCategory &&
        isResolvableWatchlistItemSlug(target.itemSlug)
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
      const productHref =
        candidateItemHref &&
        /^\/[a-z][a-z0-9-]*\/[^/?#\s]+$/.test(candidateItemHref)
          ? candidateItemHref
          : getMasterProductHref(master);

      return [
        slug,
        {
          master_product_id: master.id,
          slug: master.slug,
          // The product page in its own category, so a saved item whose
          // stored path names another category links straight there (#1380).
          product_href: productHref,
          name: master.name,
          brand: master.brand,
          current_min_price: currentMinPrice,
          current_max_price: currentMaxPrice,
          merchant_count: resolveWatchlistMerchantCount(
            master.merchant_count,
            plausibleOfferCount,
            currentMinPrice
          ),
          platform_count: offerPlatforms.length,
          offer_platforms: offerPlatforms,
          best_offer: bestOffer,
          deal_radar: radarExportFields(radarSignal),
          radar_signal: radarSignal,
          ...(target?.sizeRequired ? { size_required: true as const } : {}),
        },
      ] as const;
    });

    const items: Record<string, (typeof entries)[number][1]> = {};
    for (const [slug, item] of entries) {
      items[slug] = item;
    }

    return NextResponse.json(
      {
        ok: true,
        count: Object.keys(items).length,
        items,
      },
      {
        status: 200,
        headers: {
          ...WATCHLIST_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to fetch watchlist products',
      error,
      WATCHLIST_CORS_HEADERS
    );
  }
}

const PriceAlertBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid product slug'),
  targetPrice: z.preprocess(
    (val) =>
      typeof val === 'number' || typeof val === 'string'
        ? parseFiniteDecimalInput(val)
        : Number.NaN,
    z
      .number()
      .finite()
      .positive('targetPrice must be greater than 0')
      .max(MAX_VALID_VND_PRICE)
      .transform((v) => Math.round(v * 100) / 100)
  ),
  locale: z.enum(['vi', 'en', 'cs']).catch('vi'),
});

/**
 * POST /api/v1/rate/watchlist
 * Register or update the signed-in user's Target Price Alert for a canonical master product.
 * Requires a Supabase access token (Authorization: Bearer) or same-origin @supabase/ssr cookie session.
 * The RPC runs as that user, so the alert is keyed to auth.uid() and notifications go to the account's
 * own email; the request body cannot choose the recipient.
 * Returns persistedInCloud: false only when rate.upsert_price_alert is not deployed yet.
 */
export async function POST(request: NextRequest) {
  try {
    const bodyRead = await readBoundedJsonBody(request);
    if (bodyRead.tooLarge)
      return payloadTooLargeResponse(WATCHLIST_CORS_HEADERS);
    const rawBody: unknown = bodyRead.value;

    const auth = await authenticateRateRequest(
      request,
      'save a price alert',
      WATCHLIST_CORS_HEADERS
    );
    if (!auth.ok) return auth.response;

    const parsed = PriceAlertBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid request body',
          code: 'INVALID_BODY',
        },
        { status: 400, headers: WATCHLIST_CORS_HEADERS }
      );
    }
    const { slug: requestedSlug, targetPrice, locale } = parsed.data;

    // RATE_ITEM_MODEL on: alerts stay per size (Q5). An Item with several
    // sizes needs one chosen first (DOS/Rate#1156); off: the slug as sent.
    const itemTarget = await resolveWatchlistSlug(requestedSlug);
    if (itemTarget?.sizeRequired) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Choose a size before setting a price alert',
          code: 'SIZE_REQUIRED',
        },
        { status: 422, headers: WATCHLIST_CORS_HEADERS }
      );
    }
    const slug = itemTarget?.variantSlug ?? requestedSlug;

    const masterProduct = await getCachedMasterProductBySlug(slug);
    if (!masterProduct) {
      return NextResponse.json(
        { ok: false, error: `Master product not found for slug: ${slug}` },
        { status: 404, headers: WATCHLIST_CORS_HEADERS }
      );
    }

    const offers = await getCachedMasterProductOffers(masterProduct.id);
    const { bestOffer, offerPlatforms } = selectBestOfferFromListings(offers);
    const radarSignal = computeProductRadarSignal(masterProduct, offers);
    const itemCategorySlug = getMasterProductCategorySlug(masterProduct);
    const itemCurrency = resolveListingPriceCurrency({
      categorySlug: itemCategorySlug,
      master: masterProduct,
      offers,
    });
    const normalizedTargetPrice = sanitizeCurrencyPriceValue(
      targetPrice,
      itemCurrency
    );
    if (normalizedTargetPrice <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'targetPrice must be greater than 0',
          code: 'INVALID_BODY',
        },
        { status: 400, headers: WATCHLIST_CORS_HEADERS }
      );
    }
    const { currentMinPrice } = resolveWatchlistMasterPriceBounds(
      masterProduct,
      bestOffer?.price,
      MAX_VALID_VND_PRICE
    );
    const isReached =
      currentMinPrice > 0 && currentMinPrice <= normalizedTargetPrice;

    const { data: rpcData, error: rpcError } = await auth.rateClient.rpc(
      'upsert_price_alert',
      {
        p_product_slug: slug,
        p_target_price: normalizedTargetPrice,
        // The RPC keys signed-in callers by auth.uid(); the fingerprint is not used for them.
        p_client_fingerprint: `user:${auth.userId}`,
        p_subscriber_email: auth.email ?? undefined,
        p_locale: locale,
      }
    );

    const rejection = mapRpcRejection(rpcError, RPC_REJECTIONS);
    if (rejection) {
      return NextResponse.json(
        { ok: false, error: rejection.error, code: rejection.code },
        { status: rejection.status, headers: WATCHLIST_CORS_HEADERS }
      );
    }

    if (rpcError && !isMissingRpcError(rpcError)) {
      log.error('upsert_price_alert failed', {
        code: rpcError.code,
        message: rpcError.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'Could not save the price alert',
          code: 'PERSIST_FAILED',
        },
        { status: 502, headers: WATCHLIST_CORS_HEADERS }
      );
    }

    if (!rpcError && rpcData) {
      const safeRpcData =
        typeof rpcData === 'object' && !Array.isArray(rpcData) ? rpcData : {};
      return NextResponse.json(
        {
          ok: true,
          persistedInCloud: true,
          data: {
            ...safeRpcData,
            best_offer: bestOffer,
            offer_platforms: offerPlatforms,
            deal_radar: radarExportFields(radarSignal),
            radar_signal: radarSignal,
          },
        },
        { status: 200, headers: WATCHLIST_CORS_HEADERS }
      );
    }

    // rate.upsert_price_alert is not deployed in this environment yet: report the live
    // status and say plainly that nothing was stored.
    return NextResponse.json(
      {
        ok: true,
        persistedInCloud: false,
        data: {
          master_product_id: masterProduct.id,
          slug: masterProduct.slug,
          name: masterProduct.name,
          target_price: targetPrice,
          current_min_price: currentMinPrice,
          is_reached: isReached,
          best_offer: bestOffer,
          offer_platforms: offerPlatforms,
          deal_radar: radarExportFields(radarSignal),
          radar_signal: radarSignal,
          updated_at: new Date().toISOString(),
        },
      },
      { status: 200, headers: WATCHLIST_CORS_HEADERS }
    );
  } catch (error) {
    log.error('POST failed', { error: serializeError(error) });
    return jsonApiError(
      500,
      'Internal server error',
      error,
      WATCHLIST_CORS_HEADERS
    );
  }
}
