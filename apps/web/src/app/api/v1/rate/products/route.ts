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
  parseBoundedStringParam,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

function parseNumArray(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const nums = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);
  return nums.length > 0 ? nums : undefined;
}

function parsePositiveNum(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

function parseBooleanFlag(raw: string | null): boolean | undefined {
  if (!raw) return undefined;
  return raw === '1' || raw.toLowerCase() === 'true' ? true : undefined;
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
    const categorySlug = sp.get('category') || 'smartphones';
    const includeFacets =
      sp.get('facets') === '1' || sp.get('facets') === 'true';

    const brandsParam = sp.get('brands') || sp.get('brand');
    const brands = brandsParam
      ? brandsParam
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean)
      : undefined;

    const rawSort = sp.get('sort') as MasterProductFilterParams['sort'] | null;
    const sort: NonNullable<MasterProductFilterParams['sort']> =
      rawSort && VALID_PRODUCT_SORTS.has(rawSort) ? rawSort : 'default';
    const limit = parseBoundedIntParam(sp.get('limit'), 24, 1, 100);

    const compactRaw = sp.get('compactScreen') || sp.get('compact');
    const maxScreenSizeInch =
      compactRaw === '1' || compactRaw?.toLowerCase() === 'true'
        ? 6.2
        : parsePositiveNum(compactRaw);

    const filterParams: MasterProductFilterParams = {
      categorySlug,
      brands,
      search: parseBoundedStringParam(sp.get('q'), 160) || undefined,
      minPrice: parsePositiveNum(sp.get('minPrice')),
      maxPrice: parsePositiveNum(sp.get('maxPrice')),
      minRating: parsePositiveNum(sp.get('minRating') || sp.get('rating')),
      ramGb: parseNumArray(sp.get('ramGb') || sp.get('ram')),
      storageGb: parseNumArray(
        sp.get('storageGb') || sp.get('storage') || sp.get('rom')
      ),
      minBatteryMah: parseBooleanFlag(sp.get('bigBattery'))
        ? 5000
        : parsePositiveNum(sp.get('battery')),
      minRefreshRateHz: parseBooleanFlag(sp.get('highRefresh'))
        ? 120
        : parsePositiveNum(sp.get('hz')),
      minFastChargingW: parseBooleanFlag(sp.get('fastCharge'))
        ? 45
        : parsePositiveNum(sp.get('charge')),
      has5g: parseBooleanFlag(sp.get('has5g') || sp.get('5g')),
      hasNfc: parseBooleanFlag(sp.get('hasNfc') || sp.get('nfc')),
      maxScreenSizeInch,
      sort,
      limit,
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
