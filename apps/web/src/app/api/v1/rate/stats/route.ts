import { NextResponse } from 'next/server';
import { getCachedRatePlatformStats } from '@/server/rate';
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

/**
 * GET /api/v1/rate/stats
 * Returns live Rate.vn platform telemetry, category counts, and recent AI-audited buyer reviews.
 */
export async function GET() {
  try {
    const stats = await getCachedRatePlatformStats();

    return NextResponse.json(
      {
        ok: true,
        data: stats,
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
      'Failed to fetch platform stats',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
