import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCompareMasterProducts,
  getCrossPlatformDealRadar,
  getMasterProductCategorySlug,
  getMasterProductHref,
} from '@/server/rate';
import {
  buildRadarIndex,
  getRadarSignal,
  radarExportFields,
} from '@/lib/deal-radar';
import { jsonApiError } from '@/server/rate/api-handler';

/**
 * GET /api/v1/rate/compare?slugs=slug1,slug2
 * Returns side-by-side 10-Field-Groups comparison data for 2 to 4 Master Products
 * strictly locked to the same canonical category (Same-Category Comparison Lock).
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
    const returnedSlugSet = new Set(products.map((p) => p.slug));
    const lockedCategory = products[0]
      ? getMasterProductCategorySlug(products[0])
      : null;
    const excludedCrossCategorySlugs = slugs.filter(
      (s) => !returnedSlugSet.has(s)
    );
    const dealRadar = await getCrossPlatformDealRadar({
      categorySlug: lockedCategory || 'all',
      limit: 50,
    });
    const radarIndex = buildRadarIndex(dealRadar);

    return NextResponse.json(
      {
        ok: true,
        count: products.length,
        locked_category: lockedCategory,
        requested_slugs: slugs,
        excluded_cross_category_slugs: excludedCrossCategorySlugs,
        data: products.map((p) => ({
          ...p,
          canonical_href: getMasterProductHref(p),
          deal_radar: radarExportFields(getRadarSignal(radarIndex, p.slug)),
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
    return jsonApiError(500, 'Failed to compare products', error);
  }
}
