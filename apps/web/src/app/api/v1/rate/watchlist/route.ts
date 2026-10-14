import { NextRequest, NextResponse } from 'next/server';
import { getRateClient } from '@repo/shared-data';
import { getCachedMasterProductBySlug } from '@/server/rate';

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
      (body.clientFingerprint || '').trim() ||
      request.headers.get('x-forwarded-for') ||
      'web-anon';
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

    const currentMinPrice = Number(masterProduct.min_price || 0);
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
          data: rpcData,
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
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
