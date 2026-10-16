import { NextRequest, NextResponse } from 'next/server';
import { getRateClient } from '@repo/shared-data';
import {
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
} from '@/server/rate';

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
 * GET /api/v1/rate/watchlist?slugs=samsung-galaxy-s24-ultra-256gb,apple-iphone-16-pro-max-256gb
 * Evaluates live deal status across all 10 platforms for a list of watched product slugs,
 * returning the lowest-price platform offer and multi-platform coverage metadata.
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
            merchant_count: Number(master.merchant_count || offers.length || 1),
            platform_count: offerPlatforms.length,
            offer_platforms: offerPlatforms,
            best_offer: bestOffer,
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
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/v1/rate/watchlist
 * Register or update a server-backed Target Price Alert for a canonical master product.
 * Falls back gracefully to live master_products status if rate.upsert_price_alert RPC
 * has not yet been deployed to the target environment via DOS-Me.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      slug?: string;
      targetPrice?: number;
      subscriberEmail?: string;
      clientFingerprint?: string;
      locale?: string;
    };

    const slug = (body.slug || '').trim();
    const targetPrice = Math.round(Number(body.targetPrice || 0));
    const subscriberEmail = (body.subscriberEmail || '').trim();
    const clientFingerprint =
      (body.clientFingerprint || '').trim() || `web-${crypto.randomUUID()}`;
    const locale =
      body.locale === 'en' || body.locale === 'cs' ? body.locale : 'vi';

    if (!slug) {
      return NextResponse.json(
        { ok: false, error: 'Missing product slug' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: 'targetPrice must be greater than 0' },
        { status: 400 }
      );
    }

    const masterProduct = await getCachedMasterProductBySlug(slug);
    if (!masterProduct) {
      return NextResponse.json(
        { ok: false, error: `Master product not found for slug: ${slug}` },
        { status: 404 }
      );
    }

    const offers = await getCachedMasterProductOffers(masterProduct.id);
    const { bestOffer, offerPlatforms } = selectBestOfferFromListings(offers);
    const currentMinPrice = Number(
      masterProduct.min_price || bestOffer?.price || 0
    );
    const isReached = currentMinPrice > 0 && currentMinPrice <= targetPrice;

    try {
      const supabase = getRateClient();
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'upsert_price_alert',
        {
          p_product_slug: slug,
          p_target_price: targetPrice,
          p_client_fingerprint: clientFingerprint,
          p_subscriber_email: subscriberEmail || null,
          p_locale: locale,
        }
      );

      if (!rpcError && rpcData) {
        return NextResponse.json({
          ok: true,
          persistedInCloud: true,
          data: {
            ...(typeof rpcData === 'object' ? rpcData : {}),
            best_offer: bestOffer,
            offer_platforms: offerPlatforms,
          },
        });
      }
    } catch {
      // Fallback to verified live snapshot when RPC is pending deployment
    }

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
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
