import { NextRequest, NextResponse } from 'next/server';
import {
  BoundedSlidingWindowRateLimiter,
  PUBLIC_API_CORS_HEADERS,
  extractClientRateLimitKey,
  jsonApiError,
  rateLimitExceededResponse,
} from '@/server/rate/api-handler';
import {
  executeComboCartOptimization,
  parseComboCartQuery,
} from '@/server/rate/combo-cart';

const comboCartRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxBuckets: 5_000,
});

const NO_STORE_CORS_HEADERS: Record<string, string> = {
  ...PUBLIC_API_CORS_HEADERS,
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/combo-cart?items=slug1,slug2,...&officialOnly=0|1&minTrust=80&maxStores=3&shippingVnd=0
 * Resolves 2 to 5 master product or Item slugs, runs single-store and bounded
 * multi-store combo cart optimization, and evaluates live verified safe merchant badges.
 */
export async function GET(request: NextRequest) {
  try {
    const clientIp = extractClientRateLimitKey(request.headers);
    if (!comboCartRateLimiter.allow(clientIp)) {
      return rateLimitExceededResponse(
        'Rate limit exceeded. Maximum 60 combo-cart requests per minute.',
        NO_STORE_CORS_HEADERS
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const parsedQuery = parseComboCartQuery(searchParams);
    if (!parsedQuery.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: parsedQuery.error,
          code: 'INVALID_QUERY',
        },
        { status: 400, headers: NO_STORE_CORS_HEADERS }
      );
    }

    const result = await executeComboCartOptimization(parsedQuery.value);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
        },
        { status: 400, headers: NO_STORE_CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: result.data,
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
    return jsonApiError(500, 'Failed to optimize combo cart', error, {
      'Cache-Control': 'no-store',
    });
  }
}
