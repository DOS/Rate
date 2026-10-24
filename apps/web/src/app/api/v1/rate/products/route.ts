import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCategoryDirectoryFacets,
  getMasterProductOffersBatch,
  getMasterProducts,
  type MasterProductFilterParams,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { radarExportFields } from '@/lib/deal-radar';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedIntParam,
  parseBoundedNumberParam,
  parseBoundedPositiveIntArrayParam,
  parseBoundedStringParam,
  parseProductsFilterBounds,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

export function parseBooleanFlag(raw: string | null): boolean | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  return cleaned === '1' || cleaned === 'true' ? true : undefined;
}

const VALID_PRODUCT_SORTS = new Set<
  NonNullable<MasterProductFilterParams['sort']>
>([
  'default',
  'price_asc',
  'price_desc',
  'rating_desc',
  'merchants_desc',
  'newest',
]);

/**
 * GET /api/v1/rate/products
 * Structured JSON Backend API for Web Client, Browser Extension MV3, and Partners.
 * Supports 10-Field-Groups multi-criteria filtering, sorting, and optional directory facets.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const filterBounds = parseProductsFilterBounds(sp);
    if (!filterBounds) {
      return jsonApiError(
        400,
        'Invalid category slug or price filter range (minPrice must not exceed maxPrice)',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }
    const { categorySlug, brands, minPrice, maxPrice } = filterBounds;
    const includeFacets = Boolean(parseBooleanFlag(sp.get('facets')));

    const rawSort = (sp.get('sort') ?? '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase() as MasterProductFilterParams['sort'];
    const sort: NonNullable<MasterProductFilterParams['sort']> =
      rawSort && VALID_PRODUCT_SORTS.has(rawSort) ? rawSort : 'default';
    const limit = parseBoundedIntParam(sp.get('limit'), 24, 1, 100);
    const offset = parseBoundedIntParam(sp.get('offset'), 0, 0, 100_000);

    const compactRaw = sp.get('compactScreen') || sp.get('compact');
    const maxScreenSizeInch = parseBooleanFlag(compactRaw)
      ? 6.2
      : parseBoundedNumberParam(compactRaw, 1, 30);

    const filterParams: MasterProductFilterParams = {
      categorySlug,
      brands,
      search: parseBoundedStringParam(sp.get('q'), 160) || undefined,
      minPrice,
      maxPrice,
      minRating: parseBoundedNumberParam(
        sp.get('minRating') || sp.get('rating'),
        0,
        5
      ),
      ramGb: parseBoundedPositiveIntArrayParam(
        sp.get('ramGb') || sp.get('ram'),
        2048
      ),
      storageGb: parseBoundedPositiveIntArrayParam(
        sp.get('storageGb') || sp.get('storage') || sp.get('rom'),
        65536
      ),
      minBatteryMah: parseBooleanFlag(sp.get('bigBattery'))
        ? 5000
        : parseBoundedNumberParam(
            sp.get('minBatteryMah') || sp.get('battery'),
            100,
            100000
          ),
      minRefreshRateHz: parseBooleanFlag(sp.get('highRefresh'))
        ? 120
        : parseBoundedNumberParam(
            sp.get('minRefreshHz') || sp.get('hz'),
            30,
            1000
          ),
      minFastChargingW: parseBooleanFlag(sp.get('fastCharge'))
        ? 45
        : parseBoundedNumberParam(
            sp.get('minFastChargeW') || sp.get('charge'),
            1,
            500
          ),
      has5g: parseBooleanFlag(sp.get('has5g') || sp.get('5g')),
      hasNfc: parseBooleanFlag(sp.get('hasNfc') || sp.get('nfc')),
      maxScreenSizeInch,
      sort,
      limit,
      offset,
    };

    const [products, facets] = await Promise.all([
      getMasterProducts(filterParams),
      includeFacets
        ? getCachedCategoryDirectoryFacets(categorySlug)
        : Promise.resolve(null),
    ]);
    const offersByMasterId = await getMasterProductOffersBatch(
      products.map((p) => p.id)
    );

    return NextResponse.json(
      {
        ok: true,
        category: categorySlug,
        count: products.length,
        offset,
        data: products.map((p) => {
          const offers = offersByMasterId.get(p.id) ?? [];
          return {
            ...p,
            deal_radar: radarExportFields(computeProductRadarSignal(p, offers)),
          };
        }),
        ...(facets ? { facets } : {}),
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
      'Failed to fetch products catalog',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
