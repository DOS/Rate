import { NextResponse } from 'next/server';
import { getCrossPlatformDealRadar } from '../../../../../server/rate/deals';
import type { CanonicalCategorySlug } from '../../../../../lib/rate-api';

const VALID_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCat = (
      searchParams.get('category') ||
      searchParams.get('cat') ||
      'all'
    )
      .trim()
      .toLowerCase();
    const categorySlug: CanonicalCategorySlug | 'all' = VALID_CATEGORIES.has(
      rawCat as CanonicalCategorySlug
    )
      ? (rawCat as CanonicalCategorySlug)
      : 'all';

    const rawLimit = Number(searchParams.get('limit') || 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;

    const radar = await getCrossPlatformDealRadar({
      categorySlug,
      limit,
    });

    return NextResponse.json(
      {
        ok: true,
        data: radar,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load Cross-Platform Deal Radar',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
