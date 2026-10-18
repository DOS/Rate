import { NextRequest, NextResponse } from 'next/server';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import {
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
} from '@/server/rate/extension';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedStringParam,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

function parseOptionalVndPriceParam(raw: string | null): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 500_000_000);
}

/**
 * GET /api/v1/rate/inspect?q=<url_or_keyword>
 * Deep URL & Fake Discount Audit API v1 endpoint.
 * Combines getCachedInspectProductOrShopUrl with 5-level evidence-based price verdict
 * and accessory gatekeeper check.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const rawQuery = parseBoundedStringParam(
      sp.get('q') || sp.get('url'),
      1024
    );

    if (!rawQuery) {
      return jsonApiError(
        400,
        'Missing query parameter ?q= or ?url=',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }

    const queryPrice = parseOptionalVndPriceParam(sp.get('price'));
    const queryOriginalPrice = parseOptionalVndPriceParam(
      sp.get('originalPrice')
    );

    const inspection = await getCachedInspectProductOrShopUrl(rawQuery);
    const canonicalUrl = canonicalizeProductUrl(rawQuery);
    const observedPrice = Number(
      queryPrice ??
        inspection.matchedOffer?.price_current ??
        inspection.masterProduct?.min_price ??
        0
    );
    const observedOriginalPrice = Number(
      queryOriginalPrice ??
        inspection.matchedOffer?.price_original ??
        inspection.masterProduct?.max_price ??
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
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to inspect URL or query',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
