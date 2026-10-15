import { NextResponse } from 'next/server';
import { getCachedRatePlatformStats } from '@/server/rate';

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
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
