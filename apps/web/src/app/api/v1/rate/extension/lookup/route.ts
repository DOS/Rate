import { NextRequest, NextResponse } from 'next/server';
import {
  EXTENSION_CAPABILITY_MATRIX,
  lookupExtensionProduct,
} from '@/server/rate';
import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  jsonApiError,
  parseBoundedStringParam,
  parseOptionalVndPriceParam,
  withPublicReviewRisk,
  withPublicOfferReviewRisk,
} from '@/server/rate/api-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rate-Extension-Version',
};

const lookupRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxBuckets: 2_000,
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/extension/lookup
 * Fast-Path Read-Only Lookup for Rate Browser Extension MV3 (Two-Speed Hybrid Architecture v2).
 * Query parameters:
 * - platform: shopee | lazada | tiki | tiktok | cellphones | tgdd | fptshop | hoangha | didongviet | phongvu
 * - externalId: platform item ID or shopId_itemId
 * - shopId: platform shop ID
 * - url: product URL (automatically canonicalized, stripping tracking params)
 * - title: product title on page
 * - selectedVariant: selected SKU / storage tier label on DOM (e.g. "256GB")
 * - price: observed current price in VND
 * - originalPrice: observed strikethrough price in VND
 * - mode: 'pill' (lightweight summary for Shadow DOM badge) | 'full' (complete history & reviews for Side Panel)
 */
export async function GET(request: NextRequest) {
  try {
    const clientIp = extractClientRateLimitKey(request.headers);
    if (!lookupRateLimiter.allow(clientIp)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded. Maximum 60 lookup requests per minute.',
        },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const sp = request.nextUrl.searchParams;
    const platform = parseBoundedStringParam(sp.get('platform'), 32);
    const externalId = parseBoundedStringParam(sp.get('externalId'), 120);
    const shopId = parseBoundedStringParam(sp.get('shopId'), 120);
    const url = parseBoundedStringParam(sp.get('url'), 1024);
    const title = parseBoundedStringParam(sp.get('title'), 320);
    const selectedVariant = parseBoundedStringParam(
      sp.get('selectedVariant') ?? sp.get('skuText'),
      160
    );
    const mode = sp.get('mode') === 'pill' ? 'pill' : 'full';

    if (!url && !title && !externalId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'At least one of ?url=, ?title=, or ?externalId= must be provided.',
          capabilities: EXTENSION_CAPABILITY_MATRIX,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const price = parseOptionalVndPriceParam(sp.get('price'));
    const originalPrice = parseOptionalVndPriceParam(sp.get('originalPrice'));

    const result = await lookupExtensionProduct({
      platform,
      externalId,
      shopId,
      url,
      title,
      selectedVariant,
      price,
      originalPrice,
      mode,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...result,
          // A seller with no analysed review has no review risk (#1258,
          // #1376), on the store card and on every offer alike.
          matchedOffer: result.matchedOffer
            ? withPublicOfferReviewRisk(result.matchedOffer)
            : null,
          allOffers: result.allOffers.map(withPublicOfferReviewRisk),
          merchantProfile: result.merchantProfile
            ? withPublicReviewRisk(result.merchantProfile)
            : null,
        },
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to lookup extension product',
      error,
      CORS_HEADERS
    );
  }
}
