import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  computeProductRadarSignal,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
} from '@/server/rate';
import { radarExportFields } from '@/lib/deal-radar';
import { jsonApiError } from '@/server/rate/api-handler';
import {
  authenticateRateRequest,
  isMissingRpcError,
  mapRpcRejection,
  type RpcRejection,
} from '@/server/rate/request-auth';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.watchlist');

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

export interface WatchlistBestOffer {
  id: string;
  title: string;
  price: number;
  original_price: number;
  url: string;
  platform: string;
  merchant_name: string;
  is_official_mall: boolean;
}

function selectBestOfferFromListings(
  offers: Awaited<ReturnType<typeof getCachedMasterProductOffers>>
): { bestOffer: WatchlistBestOffer | null; offerPlatforms: string[] } {
  const valid = offers.filter(
    (o) => Number(o.stock ?? 1) > 0 && Number(o.price_current) > 0
  );
  const platforms = Array.from(
    new Set(
      valid
        .map((o) =>
          String(o.merchant?.platform || o.platform || 'shopee').toLowerCase()
        )
        .filter(Boolean)
    )
  );
  if (valid.length === 0) {
    return { bestOffer: null, offerPlatforms: platforms };
  }

  const sorted = [...valid].sort((a, b) => {
    const diff = Number(a.price_current) - Number(b.price_current);
    if (diff !== 0) return diff;
    const mallA = a.merchant?.is_official ? 1 : 0;
    const mallB = b.merchant?.is_official ? 1 : 0;
    return mallB - mallA;
  });

  const best = sorted[0]!;
  return {
    bestOffer: {
      id: best.id,
      title: best.title,
      price: Number(best.price_current),
      original_price: Number(best.price_original || best.price_current),
      url: best.url,
      platform: String(
        best.merchant?.platform || best.platform || 'shopee'
      ).toLowerCase(),
      merchant_name: String(best.merchant?.name || 'Official Store'),
      is_official_mall: Boolean(best.merchant?.is_official),
    },
    offerPlatforms: platforms,
  };
}

/**
 * GET /api/v1/rate/watchlist?slugs=apple-iphone-16-128gb,apple-iphone-16-pro-max-256gb
 * Evaluates live deal status across all 10 platforms for a list of watched product slugs,
 * returning the lowest-price platform offer, multi-platform coverage metadata, and Deal Radar signal.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSlugs = (searchParams.get('slugs') || '').trim();
    const slugs = Array.from(
      new Set(
        rawSlugs
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 20);

    if (slugs.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        items: {},
      });
    }

    const entries = await Promise.all(
      slugs.map(async (slug) => {
        const master = await getCachedMasterProductBySlug(slug);
        if (!master) return null;
        const offers = await getCachedMasterProductOffers(master.id);
        const { bestOffer, offerPlatforms } =
          selectBestOfferFromListings(offers);
        const radarSignal = computeProductRadarSignal(master, offers);
        const currentMinPrice = Number(
          master.min_price || bestOffer?.price || 0
        );
        const currentMaxPrice = Number(
          master.max_price || currentMinPrice || 0
        );

        return [
          slug,
          {
            master_product_id: master.id,
            slug: master.slug,
            name: master.name,
            brand: master.brand,
            current_min_price: currentMinPrice,
            current_max_price: currentMaxPrice,
            merchant_count: Number(master.merchant_count || offers.length || 0),
            platform_count: offerPlatforms.length,
            offer_platforms: offerPlatforms,
            best_offer: bestOffer,
            deal_radar: radarExportFields(radarSignal),
            radar_signal: radarSignal,
          },
        ] as const;
      })
    );

    const items: Record<string, NonNullable<(typeof entries)[number]>[1]> = {};
    for (const entry of entries) {
      if (entry) {
        items[entry[0]] = entry[1];
      }
    }

    return NextResponse.json({
      ok: true,
      count: Object.keys(items).length,
      items,
    });
  } catch (error) {
    return jsonApiError(500, 'Failed to fetch watchlist products', error);
  }
}

const PriceAlertBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid product slug'),
  targetPrice: z.coerce
    .number()
    .finite()
    .positive('targetPrice must be greater than 0')
    .max(10_000_000_000)
    .transform((v) => Math.round(v)),
  locale: z.enum(['vi', 'en', 'cs']).catch('vi'),
});

/**
 * POST /api/v1/rate/watchlist
 * Register or update the signed-in user's Target Price Alert for a canonical master product.
 * Requires a Supabase access token (Authorization: Bearer). The RPC runs as that user, so
 * the alert is keyed to auth.uid() and notifications go to the account's own email; the
 * request body cannot choose the recipient.
 * Returns persistedInCloud: false only when rate.upsert_price_alert is not deployed yet.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json().catch(() => null);

    const auth = await authenticateRateRequest(request, 'save a price alert');
    if (!auth.ok) return auth.response;

    const parsed = PriceAlertBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || 'Invalid request body',
          code: 'INVALID_BODY',
        },
        { status: 400 }
      );
    }
    const { slug, targetPrice, locale } = parsed.data;

    const masterProduct = await getCachedMasterProductBySlug(slug);
    if (!masterProduct) {
      return NextResponse.json(
        { ok: false, error: `Master product not found for slug: ${slug}` },
        { status: 404 }
      );
    }

    const offers = await getCachedMasterProductOffers(masterProduct.id);
    const { bestOffer, offerPlatforms } = selectBestOfferFromListings(offers);
    const radarSignal = computeProductRadarSignal(masterProduct, offers);
    const currentMinPrice = Number(
      masterProduct.min_price || bestOffer?.price || 0
    );
    const isReached = currentMinPrice > 0 && currentMinPrice <= targetPrice;

    const { data: rpcData, error: rpcError } = await auth.rateClient.rpc(
      'upsert_price_alert',
      {
        p_product_slug: slug,
        p_target_price: targetPrice,
        // The RPC keys signed-in callers by auth.uid(); the fingerprint is not used for them.
        p_client_fingerprint: `user:${auth.userId}`,
        p_subscriber_email: auth.email,
        p_locale: locale,
      }
    );

    const rejection = mapRpcRejection(rpcError, RPC_REJECTIONS);
    if (rejection) {
      return NextResponse.json(
        { ok: false, error: rejection.error, code: rejection.code },
        { status: rejection.status }
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
        { status: 502 }
      );
    }

    if (!rpcError && rpcData) {
      return NextResponse.json({
        ok: true,
        persistedInCloud: true,
        data: {
          ...(typeof rpcData === 'object' ? rpcData : {}),
          best_offer: bestOffer,
          offer_platforms: offerPlatforms,
          deal_radar: radarExportFields(radarSignal),
          radar_signal: radarSignal,
        },
      });
    }

    // rate.upsert_price_alert is not deployed in this environment yet: report the live
    // status and say plainly that nothing was stored.
    return NextResponse.json({
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
    });
  } catch (error) {
    log.error('POST failed', { error: serializeError(error) });
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
