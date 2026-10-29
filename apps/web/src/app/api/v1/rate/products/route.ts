import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedVariantCategoryDirectoryFacets,
  getMasterProductOffersBatch,
  getMasterProducts,
  type MasterProductFilterParams,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { radarExportFields } from '@/lib/deal-radar';
import { getMasterProductCategorySlug } from '@/lib/rate-domain';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { saleStateOfMaster } from '@/lib/sale-state';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedIntParam,
  parseBoundedNumberParam,
  parseBoundedPositiveIntArrayParam,
  parseBoundedStringParam,
  hasCategoryScopedSpecFilter,
  parseProductsFilterBounds,
  specFiltersOutsideCategory,
} from '@/server/rate/api-handler';
import type { MasterProduct } from '@/lib/rate-api';
import { listApiItems } from '@/server/rate/item-api';
import { isItemModelOn } from '@/server/rate/item-model';

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

const SCOPED_ALL_PAGE_SIZE = 500;
// 20k rows, well above the catalogue; bounds the cost of a deep offset.
const SCOPED_ALL_MAX_PAGES = 40;

/**
 * `category=all` with a spec filter some category lacks: only products whose
 * own category has every requested filter, paged after that cut so pages
 * stay exact (DOS/Rate#1184). Reads the catalogue in pages of 500.
 */
async function getAllCategoryProductsWithSpecFilters(
  filterParams: MasterProductFilterParams
): Promise<MasterProduct[]> {
  const offset = filterParams.offset ?? 0;
  const wanted = offset + (filterParams.limit ?? 24);
  const kept: MasterProduct[] = [];
  for (let page = 0; page < SCOPED_ALL_MAX_PAGES; page++) {
    const rows = await getMasterProducts({
      ...filterParams,
      offset: page * SCOPED_ALL_PAGE_SIZE,
      limit: SCOPED_ALL_PAGE_SIZE,
    });
    for (const p of rows) {
      const slug = getMasterProductCategorySlug(p);
      if (specFiltersOutsideCategory(slug, filterParams).length === 0) {
        kept.push(p);
      }
    }
    if (kept.length >= wanted || rows.length < SCOPED_ALL_PAGE_SIZE) break;
  }
  return kept.slice(offset, wanted);
}

const ITEM_GROUP_SORTS = new Set([
  'default',
  'price_asc',
  'price_desc',
  'merchants_desc',
  'newest',
] as const);

/**
 * `group=item`, or null to answer the variant list (flag off, or the Item
 * tables missing). Spec filters and rating sort are per variant until
 * `search_items_v1` (#1155), so they answer 400 here.
 */
async function answerItemGroup(
  categorySlug: string,
  filterParams: MasterProductFilterParams
): Promise<NextResponse | null> {
  if (!isItemModelOn()) return null;
  const specFilters = [
    filterParams.minRating !== undefined && 'minRating',
    filterParams.ramGb?.length && 'ramGb',
    filterParams.storageGb?.length && 'storageGb',
    filterParams.minBatteryMah !== undefined && 'minBatteryMah',
    filterParams.minRefreshRateHz !== undefined && 'minRefreshHz',
    filterParams.minFastChargingW !== undefined && 'minFastChargeW',
    filterParams.has5g && 'has5g',
    filterParams.hasNfc && 'hasNfc',
    filterParams.maxScreenSizeInch !== undefined && 'compactScreen',
    filterParams.sort === 'rating_desc' && 'sort=rating_desc',
  ].filter((f): f is string => typeof f === 'string');
  const sort = filterParams.sort ?? 'default';
  const rows = await listApiItems(categorySlug, {
    brands: filterParams.brands,
    search: filterParams.search,
    minPrice: filterParams.minPrice,
    maxPrice: filterParams.maxPrice,
    sort: ITEM_GROUP_SORTS.has(sort as never) ? (sort as 'default') : 'default',
    limit: filterParams.limit ?? 24,
    offset: filterParams.offset ?? 0,
  });
  // Only once the Item tables answered: without them the request is the
  // variant list as before, filters included (DOS/Rate#1158).
  if (rows === null) return null;
  if (specFilters.length > 0) {
    return jsonApiError(
      400,
      `Filters not available with group=item: ${specFilters.join(', ')}`,
      undefined,
      PUBLIC_API_CORS_HEADERS
    );
  }
  return NextResponse.json(
    {
      ok: true,
      category: categorySlug,
      group: 'item',
      count: rows.length,
      offset: filterParams.offset ?? 0,
      data: rows,
    },
    {
      status: 200,
      headers: {
        ...PUBLIC_API_CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  );
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
 * Each product carries its category's spec view, as rate.vn shows it
 * (DOS/Rate#1166). A spec filter the category's template does not have
 * (`has5g` on smartwatches, `ramGb` or `compactScreen` on earbuds) answers
 * 400, so a filter never returns a product whose body contradicts it
 * (DOS/Rate#1184). On `category=all` such a filter keeps only products whose
 * own category has it: `has5g=1` returns 5G phones, tablets and laptops,
 * never watches or earbuds.
 * With `RATE_ITEM_MODEL` on, `group=item` lists Items (one row per product
 * line, with its variants) instead of variants; it takes the category, brand,
 * search, price and sort filters, and answers 400 for spec filters, which
 * stay per variant. Without `group=item`, or with the flag off, the response
 * is the variant list as before (DOS/Rate#1158, Q7).
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

    if (
      (sp.get('group') ?? '')
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .toLowerCase() === 'item'
    ) {
      const itemResponse = await answerItemGroup(categorySlug, filterParams);
      if (itemResponse) return itemResponse;
    }

    const unsupportedFilters = specFiltersOutsideCategory(
      categorySlug,
      filterParams
    );
    if (unsupportedFilters.length > 0) {
      return jsonApiError(
        400,
        `Filters not available for category ${categorySlug}: ${unsupportedFilters.join(', ')}`,
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }

    const [products, facets] = await Promise.all([
      categorySlug === 'all' && hasCategoryScopedSpecFilter(filterParams)
        ? getAllCategoryProductsWithSpecFilters(filterParams)
        : getMasterProducts(filterParams),
      includeFacets
        ? // Variant counts: API v1 stays per variant until `group=item`
          // (design doc 5.2, task 11).
          getCachedVariantCategoryDirectoryFacets(categorySlug)
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
            ...applyCategorySpecTemplate(getMasterProductCategorySlug(p), p),
            deal_radar: radarExportFields(computeProductRadarSignal(p, offers)),
            sale_state: saleStateOfMaster(p),
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
