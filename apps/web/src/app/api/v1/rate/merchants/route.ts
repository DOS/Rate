import { NextRequest, NextResponse } from 'next/server';
import { getCachedMerchantsList } from '@/server/rate';
import {
  PUBLIC_API_CORS_HEADERS,
  withPublicReviewRisk,
  jsonApiError,
  parseBoundedIntParam,
  parseBoundedNumberParam,
  parseBoundedStringParam,
  SUPPORTED_PLATFORM_SLUGS,
} from '@/server/rate/api-handler';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/merchants
 * Returns tracked merchants with Dual Risk Scores (DOSafe + AI Review Risk) and listing counts.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const q = parseBoundedStringParam(sp.get('q'), 160) || undefined;
    const rawPlatform = (
      parseBoundedStringParam(sp.get('platform'), 32) || ''
    ).toLowerCase();
    // Only a tracked platform: a free string would make a cache entry per
    // value (DOS/Rate#1308).
    if (rawPlatform && !SUPPORTED_PLATFORM_SLUGS.has(rawPlatform)) {
      return jsonApiError(
        400,
        'Unknown platform',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }
    const platform = rawPlatform || undefined;
    const rawOfficial = (sp.get('officialOnly') ?? sp.get('official') ?? '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase();
    const officialOnly = rawOfficial === '1' || rawOfficial === 'true';
    const minTrust = parseBoundedNumberParam(
      sp.get('min_trust') ?? sp.get('minTrust'),
      0,
      100
    );
    const rawSort = (sp.get('sort') ?? '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase();
    const sort =
      rawSort === 'trust_desc' ||
      rawSort === 'products_desc' ||
      rawSort === 'seeding_asc' ||
      rawSort === 'followers_desc'
        ? rawSort
        : undefined;
    const limit = parseBoundedIntParam(sp.get('limit'), 50, 1, 100);

    const merchants = await getCachedMerchantsList({
      q,
      platform,
      officialOnly,
      minTrust,
      sort,
      limit,
    });

    return NextResponse.json(
      {
        ok: true,
        count: merchants.length,
        data: merchants.map(withPublicReviewRisk),
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
      'Failed to fetch merchants list',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
