import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCompareMasterProducts,
  getMasterProductHref,
} from '@/server/rate';

/**
 * GET /api/v1/rate/compare?slugs=slug1,slug2
 * Returns side-by-side 10-Field-Groups comparison data for 2 to 4 Master Products.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const rawSlugs = (sp.get('slugs') || '').trim();
    const slugs = Array.from(
      new Set(
        rawSlugs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ).slice(0, 4);

    if (slugs.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing ?slugs= parameter (provide 1 to 4 comma-separated master product slugs)',
        },
        { status: 400 }
      );
    }

    const products = await getCachedCompareMasterProducts(slugs.join(','));

    return NextResponse.json(
      {
        ok: true,
        count: products.length,
        requested_slugs: slugs,
        data: products.map((p) => ({
          ...p,
          canonical_href: getMasterProductHref(p),
        })),
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
