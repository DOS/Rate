import { NextRequest, NextResponse } from 'next/server';
import {
  EXTENSION_CAPABILITY_MATRIX,
  lookupExtensionProduct,
} from '@/server/rate';
import { jsonApiError } from '@/server/rate/api-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rate-Extension-Version',
};

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
 * - platform: shopee | lazada | tiki | cellphones | tgdd | fptshop
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
    const sp = request.nextUrl.searchParams;
    const platform = sp.get('platform');
    const externalId = sp.get('externalId');
    const shopId = sp.get('shopId');
    const url = sp.get('url');
    const title = sp.get('title');
    const selectedVariant = sp.get('selectedVariant');
    const rawPrice = sp.get('price');
    const rawOriginalPrice = sp.get('originalPrice');
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

    const price = rawPrice ? Number(rawPrice) : null;
    const originalPrice = rawOriginalPrice ? Number(rawOriginalPrice) : null;

    const result = await lookupExtensionProduct({
      platform,
      externalId,
      shopId,
      url,
      title,
      selectedVariant,
      price: price && Number.isFinite(price) ? price : null,
      originalPrice:
        originalPrice && Number.isFinite(originalPrice) ? originalPrice : null,
      mode,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
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
