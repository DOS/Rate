import { NextRequest, NextResponse } from 'next/server';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-api';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import {
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
} from '@/server/rate/extension';
import {
  PUBLIC_API_CORS_HEADERS,
  extractClientRateLimitKey,
  inspectRateLimitResponse,
  inspectRateLimiter,
  jsonApiError,
  withPublicReviewRisk,
  parseBoundedStringParam,
  parseOptionalVndPriceParam,
  resolveInspectObservedPrices,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/inspect?q=<url_or_keyword>
 * Deep URL & Fake Discount Audit API v1 endpoint.
 * Combines getCachedInspectProductOrShopUrl with 5-level evidence-based price verdict
 * and accessory gatekeeper check.
 */
export async function GET(request: NextRequest) {
  try {
    if (!inspectRateLimiter.allow(extractClientRateLimitKey(request.headers))) {
      return inspectRateLimitResponse(PUBLIC_API_CORS_HEADERS);
    }
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
    const { observedPrice, observedOriginalPrice } =
      resolveInspectObservedPrices({
        queryPrice,
        queryOriginalPrice,
        matchedOfferPriceCurrent: inspection.matchedOffer?.price_current,
        matchedOfferPriceOriginal: inspection.matchedOffer?.price_original,
        masterMinPrice: inspection.masterProduct?.min_price,
        maxVnd: MAX_VALID_VND_PRICE,
      });

    const gatekeeper = detectAccessoryOrJunk({
      title:
        inspection.matchedOffer?.title ||
        inspection.masterProduct?.name ||
        rawQuery,
      url: canonicalUrl || rawQuery,
      price: observedPrice > 0 ? observedPrice : null,
    });

    const priceVerdict = evaluateExtensionPriceVerdict({
      isAccessory: gatekeeper.isAccessory,
      accessoryReason: gatekeeper.reason,
      accessoryMessage: gatekeeper.message,
      isAmbiguousVariant: false,
      observedPrice: observedPrice > 0 ? observedPrice : null,
      observedOriginalPrice:
        observedOriginalPrice > 0 ? observedOriginalPrice : null,
      offers: inspection.allOffers,
      // The observed price is the matched listing's: its stored price, or a
      // ?price= read from that listing (the offers table's "Inspect" link).
      // A fallback offer for a slug or keyword is not the priced listing.
      observedOfferId:
        queryPrice === null || inspection.matchedType === 'product_listing'
          ? (inspection.matchedOffer?.id ?? null)
          : null,
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
          merchantProfile: inspection.merchantProfile
            ? withPublicReviewRisk(inspection.merchantProfile)
            : null,
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
