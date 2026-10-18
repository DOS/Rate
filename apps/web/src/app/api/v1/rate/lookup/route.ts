import { NextRequest, NextResponse } from 'next/server';
import {
  computeProductRadarSignal,
  getCachedInspectProductOrShopUrl,
} from '@/server/rate';
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

/**
 * GET /api/v1/rate/lookup?q=<url_or_keyword>
 * Unified Lookup & URL Inspector API for Rate.vn Homepage, Web Client, and Browser Extension MV3.
 * Parses Shopee / Lazada / Tiki URLs or search keywords and returns matched Master Product,
 * Live Offers, Fake Discount Analysis, JReviews Authenticity Summary, and Merchant Dual Risk Score.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const rawQuery = parseBoundedStringParam(
      sp.get('q') || sp.get('url'),
      1024
    );

    if (!rawQuery) {
      return jsonApiError(400, 'Missing query parameter ?q= or ?url=');
    }

    const result = await getCachedInspectProductOrShopUrl(rawQuery);
    const radarSignal = result.masterProduct
      ? computeProductRadarSignal(result.masterProduct, result.allOffers)
      : null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...result,
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
      'Failed to lookup product or shop URL',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
