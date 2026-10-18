import { NextRequest, NextResponse } from 'next/server';
import { getCachedMerchantProfileById } from '@/server/rate';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
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
    const cleanId = (id ?? '').trim();
    if (
      !cleanId ||
      cleanId.length > 120 ||
      !/^[a-zA-Z0-9._-]+$/.test(cleanId)
    ) {
      return jsonApiError(
        400,
        'Invalid merchant identifier',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }

    const profile = await getCachedMerchantProfileById(cleanId);

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Merchant not found',
          code: 'NOT_FOUND',
        },
        { status: 404, headers: PUBLIC_API_CORS_HEADERS }
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
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to fetch merchant profile',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
