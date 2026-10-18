import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCompareMasterProducts,
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProductOffersBatch,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { radarExportFields } from '@/lib/deal-radar';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseCompareSlugsParam,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/compare?slugs=slug1,slug2
 * Returns side-by-side 10-Field-Groups comparison data for 2 to 4 Master Products
 * strictly locked to the same canonical category (Same-Category Comparison Lock).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const slugs = parseCompareSlugsParam(sp.get('slugs'), 4);

    if (slugs.length === 0) {
      return jsonApiError(
        400,
        'Missing or invalid ?slugs= parameter (provide 1 to 4 comma-separated master product slugs)',
        undefined,
        PUBLIC_API_CORS_HEADERS
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
    const offersByMasterId = await getMasterProductOffersBatch(
      products.map((p) => p.id)
    );

    return NextResponse.json(
      {
        ok: true,
        count: products.length,
        locked_category: lockedCategory,
        requested_slugs: slugs,
        excluded_cross_category_slugs: excludedCrossCategorySlugs,
        data: products.map((p) => {
          const offers = offersByMasterId.get(p.id) ?? [];
          return {
            ...p,
            canonical_href: getMasterProductHref(p),
            deal_radar: radarExportFields(computeProductRadarSignal(p, offers)),
          };
        }),
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
      'Failed to compare products',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
