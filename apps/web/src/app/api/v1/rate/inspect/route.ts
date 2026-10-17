import { NextRequest, NextResponse } from 'next/server';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import {
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
} from '@/server/rate/extension';
import { jsonApiError } from '@/server/rate/api-handler';

/**
 * GET /api/v1/rate/inspect?q=<url_or_keyword>
 * Deep URL & Fake Discount Audit API v1 endpoint.
 * Combines getCachedInspectProductOrShopUrl with 5-level evidence-based price verdict
 * and accessory gatekeeper check.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const rawQuery = (sp.get('q') || sp.get('url') || '').trim();

    if (!rawQuery) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing query parameter ?q= or ?url=',
        },
        { status: 400 }
      );
    }

    const inspection = await getCachedInspectProductOrShopUrl(rawQuery);
    const canonicalUrl = canonicalizeProductUrl(rawQuery);
    const observedPrice = Number(
      inspection.matchedOffer?.price_current ||
        inspection.masterProduct?.min_price ||
        0
    );
    const observedOriginalPrice = Number(
      inspection.matchedOffer?.price_original ||
        inspection.masterProduct?.max_price ||
        0
    );

    const gatekeeper = detectAccessoryOrJunk({
      title:
        inspection.matchedOffer?.title ||
        inspection.masterProduct?.name ||
        rawQuery,
      price: observedPrice > 0 ? observedPrice : null,
    });

    const priceVerdict = evaluateExtensionPriceVerdict({
      isAccessory: gatekeeper.isAccessory,
      accessoryReason: gatekeeper.reason,
      isAmbiguousVariant: false,
      observedPrice: observedPrice > 0 ? observedPrice : null,
      observedOriginalPrice:
        observedOriginalPrice > 0 ? observedOriginalPrice : null,
      offers: inspection.allOffers,
      priceHistory: inspection.priceHistory,
    });
    const radarSignal = inspection.masterProduct
      ? computeProductRadarSignal(
          inspection.masterProduct,
          inspection.allOffers
        )
      : null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...inspection,
          canonicalUrl,
          gatekeeper,
          priceVerdict,
          radarSignal,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return jsonApiError(500, 'Failed to inspect URL or query', error);
  }
}
