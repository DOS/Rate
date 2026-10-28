import { NextRequest, NextResponse } from 'next/server';
import { getCachedMerchantsList } from '@/server/rate';
import {
  PUBLIC_API_CORS_HEADERS,
  withPublicReviewRisk,
  jsonApiError,
  parseBoundedIntParam,
} from '@/server/rate/api-handler';
import {
  pageMerchantDirectory,
  parseMerchantDirectoryFilters,
} from '@/lib/merchant-directory';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/merchants/directory
 * One page of the merchant directory with the /merchants filters (q, platform,
 * official, risk, seeding, sort) plus the number of matching stores, so the
 * page no longer ships every store to the browser (DOS/Rate#452).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const filters = parseMerchantDirectoryFilters((key) => sp.get(key));
    const offset = parseBoundedIntParam(sp.get('offset'), 0, 0, 100_000);
    const limit = parseBoundedIntParam(sp.get('limit'), 48, 1, 500);
    const merchants = await getCachedMerchantsList();
    const page = pageMerchantDirectory(merchants, filters, offset, limit);
    return NextResponse.json(
      {
        ok: true,
        data: { ...page, items: page.items.map(withPublicReviewRisk) },
      },
      {
        status: 200,
        headers: {
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to fetch merchant directory',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
