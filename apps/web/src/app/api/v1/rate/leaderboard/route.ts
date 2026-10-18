import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedMasterProducts,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import {
  buildRadarIndex,
  getRadarSignal,
  radarExportFields,
} from '@/lib/deal-radar';
import {
  normalizeLeaderboardCategory,
  normalizeLeaderboardCriterion,
  normalizeLeaderboardPriceSegment,
  rankMasterProductsForLeaderboard,
} from '@/lib/leaderboard-engine';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedIntParam,
} from '@/server/rate/api-handler';

export const revalidate = 60;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCat = (
      searchParams.get('category') ||
      searchParams.get('cat') ||
      'smartphones'
    )
      .toLowerCase()
      .trim();
    const category =
      rawCat === 'all' ? 'all' : normalizeLeaderboardCategory(rawCat);
    const criterion = normalizeLeaderboardCriterion(
      searchParams.get('criterion')
    );
    const priceSegment = normalizeLeaderboardPriceSegment(
      searchParams.get('price')
    );
    const brand = (searchParams.get('brand') || 'all').trim();
    const query = (searchParams.get('q') || '').trim();
    const limit = parseBoundedIntParam(searchParams.get('limit'), 20, 1, 50);

    const [allProducts, dealRadar] = await Promise.all([
      getCachedMasterProducts({
        categorySlug: category,
        limit: 100,
        sort: 'rating_desc',
      }),
      getCrossPlatformDealRadar({
        categorySlug: category,
        limit: 50,
      }),
    ]);
    const radarIndex = buildRadarIndex(dealRadar);

    const ranked = rankMasterProductsForLeaderboard(allProducts, {
      category,
      criterion,
      priceSegment,
      brand,
      query,
    });

    const items = ranked.slice(0, limit).map((r) => {
      const rawSignal = getRadarSignal(radarIndex, r.slug);
      return {
        rank: r.rank,
        slug: r.slug,
        name: r.name,
        brand: r.brand,
        model: r.model,
        category: r.categorySlug,
        product_url: r.productHref,
        thumbnail: r.thumbnail,
        active_criterion: criterion,
        active_score_5: r.activeScore5,
        active_score_10: r.activeScore10,
        combined_score_5: r.combinedScore5,
        user_score_5: r.userScore5,
        expert_score_10: r.expertScore10,
        authentic_review_count: r.authenticReviewCount,
        filtered_noise_review_count: r.filteredNoiseReviewCount,
        criteria_scores: r.criteria,
        min_price: r.minPrice,
        max_price: r.maxPrice,
        merchant_count: r.merchantCount,
        key_specs: r.product.key_specs || {},
        deal_radar: radarExportFields(rawSignal),
        radar_signal: radarExportFields(rawSignal),
      };
    });

    const top3Slugs = items.slice(0, 3).map((x) => x.slug);
    const compareCategory =
      category === 'all' ? items[0]?.category || 'smartphones' : category;
    const compareTop3Url =
      top3Slugs.length >= 2
        ? `/compare?cat=${compareCategory}&slugs=${top3Slugs.join(',')}`
        : null;

    const payload = {
      directory: 'tech_electronics',
      category,
      criterion,
      price_segment: priceSegment,
      brand,
      total_matched: ranked.length,
      returned_count: items.length,
      compare_top_3_url: compareTop3Url,
      podium_top_3: items.slice(0, 3),
      items,
    };

    return NextResponse.json(
      {
        ok: true,
        ...payload,
        data: payload,
      },
      {
        status: 200,
        headers: {
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    return jsonApiError(
      500,
      'Failed to compute JReviews leaderboard ranking',
      err
    );
  }
}
