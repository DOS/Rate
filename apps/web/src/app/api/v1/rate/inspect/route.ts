import { NextRequest, NextResponse } from 'next/server';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-api';
import {
  getCachedInspectProductOrShopUrl,
  getMasterProductCategorySlug,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
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
  parseFiniteDecimalInput,
  parseOptionalVndPriceParam,
  resolveInspectObservedPrices,
  withPublicOfferReviewRisk,
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
    const masterProduct = inspection.masterProduct
      ? applyCategorySpecTemplate(
          getMasterProductCategorySlug(inspection.masterProduct),
          inspection.masterProduct
        )
      : null;
    const suggestions = inspection.suggestions.map((p) =>
      applyCategorySpecTemplate(getMasterProductCategorySlug(p), p)
    );
    const canonicalUrl = canonicalizeProductUrl(rawQuery);
    const { observedPrice, observedOriginalPrice } =
      resolveInspectObservedPrices({
        queryPrice,
        queryOriginalPrice,
        matchedOfferPriceCurrent: inspection.matchedOffer?.price_current,
        matchedOfferPriceOriginal: inspection.matchedOffer?.price_original,
        masterMinPrice: masterProduct?.min_price,
        maxVnd: MAX_VALID_VND_PRICE,
      });

    const gatekeeper = detectAccessoryOrJunk({
      title: inspection.matchedOffer?.title || masterProduct?.name || rawQuery,
      url: canonicalUrl || rawQuery,
      price: observedPrice > 0 ? observedPrice : null,
    });

    const rawMatchedOfferPrice = parseFiniteDecimalInput(
      inspection.matchedOffer?.price_current
    );
    const matchedOfferHasPositivePrice =
      Number.isFinite(rawMatchedOfferPrice) &&
      rawMatchedOfferPrice > 0 &&
      rawMatchedOfferPrice <= MAX_VALID_VND_PRICE;

    const priceVerdict = evaluateExtensionPriceVerdict({
      isAccessory: gatekeeper.isAccessory,
      accessoryReason: gatekeeper.reason,
      accessoryMessage: gatekeeper.message,
      isAmbiguousVariant: false,
      observedPrice: observedPrice > 0 ? observedPrice : null,
      observedOriginalPrice:
        observedOriginalPrice > 0 ? observedOriginalPrice : null,
      offers: inspection.allOffers,
      // The observed price is the matched listing's: an exact product_listing
      // URL always identifies its matchedOffer (so an unpriced/sold-out listing
      // never inherits a genuine_deal verdict from masterMinPrice), whereas a
      // fallback offer for a slug or keyword only matches when unoverridden and priced.
      observedOfferId:
        inspection.matchedType === 'product_listing' ||
        (queryPrice === null && matchedOfferHasPositivePrice)
          ? (inspection.matchedOffer?.id ?? null)
          : null,
      hasLiveObservedPrice: typeof queryPrice === 'number' && queryPrice > 0,
      priceHistory: inspection.priceHistory,
    });
    const radarSignal = masterProduct
      ? computeProductRadarSignal(masterProduct, inspection.allOffers)
      : null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...inspection,
          masterProduct,
          suggestions,
          // A seller with no analysed review has no review risk (#1376).
          matchedOffer: inspection.matchedOffer
            ? withPublicOfferReviewRisk(inspection.matchedOffer)
            : null,
          allOffers: inspection.allOffers.map(withPublicOfferReviewRisk),
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
