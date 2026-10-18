import { NextResponse } from 'next/server';
import { getCrossPlatformDealRadar } from '../../../../../server/rate/deals';
import type { CanonicalCategorySlug } from '../../../../../lib/rate-api';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedIntParam,
} from '@/server/rate/api-handler';

const VALID_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const VALID_PLATFORMS = new Set<string>([
  'shopee',
  'lazada',
  'tiki',
  'tiktok',
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
]);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
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

    const rawPlatform = (searchParams.get('platform') || 'all')
      .trim()
      .toLowerCase();
    const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : 'all';

    const limit = parseBoundedIntParam(searchParams.get('limit'), 12, 1, 50);

    const radar = await getCrossPlatformDealRadar({
      categorySlug,
      platform,
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
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    return jsonApiError(
      500,
      'Failed to load Cross-Platform Deal Radar',
      err,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
