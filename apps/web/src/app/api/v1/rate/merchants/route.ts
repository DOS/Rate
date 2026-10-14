import { NextRequest, NextResponse } from 'next/server';
import { getMerchantsList } from '@/server/rate';

/**
 * GET /api/v1/rate/merchants
 * Returns tracked merchants with Dual Risk Scores (DOSafe + AI Review Risk) and listing counts.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const platform = sp.get('platform') || undefined;
    const officialOnly =
      sp.get('official') === '1' || sp.get('official') === 'true';
    const rawLimit = Number(sp.get('limit') || 50);
    const limit =
      !Number.isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const merchants = await getMerchantsList({
      platform,
      officialOnly,
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
