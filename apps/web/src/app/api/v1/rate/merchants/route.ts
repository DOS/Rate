import { NextRequest, NextResponse } from 'next/server';
import { getMerchantsList } from '@/server/rate';
import {
  jsonApiError,
  parseBoundedIntParam,
  parseBoundedNumberParam,
} from '@/server/rate/api-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/v1/rate/merchants
 * Returns tracked merchants with Dual Risk Scores (DOSafe + AI Review Risk) and listing counts.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') || undefined;
    const platform = sp.get('platform') || undefined;
    const officialOnly =
      sp.get('official') === '1' || sp.get('official') === 'true';
    const minTrust = parseBoundedNumberParam(sp.get('min_trust'), 0, 100);
    const rawSort = sp.get('sort');
    const sort =
      rawSort === 'trust_desc' ||
      rawSort === 'products_desc' ||
      rawSort === 'seeding_asc' ||
      rawSort === 'followers_desc'
        ? rawSort
        : undefined;
    const limit = parseBoundedIntParam(sp.get('limit'), 50, 1, 100);

    const merchants = await getMerchantsList({
      q,
      platform,
      officialOnly,
      minTrust,
      sort,
      limit,
    });

    return NextResponse.json(
      {
        ok: true,
        count: merchants.length,
        data: merchants,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to fetch merchants list',
      error,
      CORS_HEADERS
    );
  }
}
