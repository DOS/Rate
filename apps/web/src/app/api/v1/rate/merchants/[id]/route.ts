import { NextRequest, NextResponse } from 'next/server';
import { getCachedMerchantProfileById } from '@/server/rate';
import { jsonApiError } from '@/server/rate/api-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/rate/merchants/[id]
 * Returns detailed Merchant Trust Profile, Dual Risk Breakdown, Listings with Fake Discount verdicts,
 * and recent buyer reviews with AI flags.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const profile = await getCachedMerchantProfileById(id);

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: `Merchant not found for id/slug: ${id}`,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: profile,
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
      'Failed to fetch merchant profile',
      error,
      CORS_HEADERS
    );
  }
}
