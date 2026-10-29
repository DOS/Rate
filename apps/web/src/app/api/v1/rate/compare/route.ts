import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProductOffersBatch,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { radarExportFields } from '@/lib/deal-radar';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { saleStateOfMaster } from '@/lib/sale-state';
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
    // Slugs are looked up lowercased, so `IPhone-16` came back as `iphone-16`.
    const returnedSlugSet = new Set(products.map((p) => p.slug.toLowerCase()));
    const lockedCategory = products[0]
      ? getMasterProductCategorySlug(products[0])
      : null;
    // A requested slug that did not come back is either a published product
    // of another category, dropped by the lock, or no published product at
    // all (DOS/Rate#1364). The lookup only labels the slug: if it fails, the
    // slug stays where it was listed before, with the exclusions.
    const missingSlugs = slugs.filter(
      (s) => !returnedSlugSet.has(s.toLowerCase())
    );
    const [offersByMasterId, missingFound] = await Promise.all([
      getMasterProductOffersBatch(products.map((p) => p.id)),
      Promise.all(
        missingSlugs.map((s) =>
          getCachedMasterProductBySlug(s).then(
            (product) => product !== null,
            () => true
          )
        )
      ),
    ]);
    const excludedCrossCategorySlugs = missingSlugs.filter(
      (_, i) => missingFound[i]
    );
    const notFoundSlugs = missingSlugs.filter((_, i) => !missingFound[i]);

    return NextResponse.json(
      {
        ok: true,
        count: products.length,
        locked_category: lockedCategory,
        requested_slugs: slugs,
        excluded_cross_category_slugs: excludedCrossCategorySlugs,
        not_found_slugs: notFoundSlugs,
        data: products.map((p) => {
          const offers = offersByMasterId.get(p.id) ?? [];
          return {
            // The category's spec view, as /compare shows it (DOS/Rate#1166).
            ...applyCategorySpecTemplate(lockedCategory, p),
            canonical_href: getMasterProductHref(p),
            deal_radar: radarExportFields(computeProductRadarSignal(p, offers)),
            sale_state: saleStateOfMaster(p),
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
