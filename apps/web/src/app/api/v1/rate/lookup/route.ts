import { NextRequest, NextResponse } from 'next/server';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { jsonApiError } from '@/server/rate/api-handler';

/**
 * GET /api/v1/rate/lookup?q=<url_or_keyword>
 * Unified Lookup & URL Inspector API for Rate.vn Homepage, Web Client, and Browser Extension MV3.
 * Parses Shopee / Lazada / Tiki URLs or search keywords and returns matched Master Product,
 * Live Offers, Fake Discount Analysis, JReviews Authenticity Summary, and Merchant Dual Risk Score.
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

    const result = await getCachedInspectProductOrShopUrl(rawQuery);

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return jsonApiError(500, 'Failed to lookup product or shop URL', error);
  }
}
