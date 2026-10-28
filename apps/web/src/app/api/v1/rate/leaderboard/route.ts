import { NextRequest, NextResponse } from 'next/server';
import {
  computeProductRadarSignal,
  getCachedFilteredReviewCountsByMaster,
  getCachedMasterProducts,
  getMasterProductOffersBatch,
} from '@/server/rate';
import { radarExportFields } from '@/lib/deal-radar';
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
  parseBoundedStringParam,
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
      parseBoundedStringParam(
        searchParams.get('category') || searchParams.get('cat'),
        32
      ) || 'smartphones'
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
    const brand =
      parseBoundedStringParam(searchParams.get('brand'), 64) || 'all';
    const query = parseBoundedStringParam(searchParams.get('q'), 160) || '';
    const limit = parseBoundedIntParam(searchParams.get('limit'), 20, 1, 50);

    // Brand, price segment, query and the criterion ranking all run on this
    // list, so it must be the whole category, not its 100 best-rated models
    // (DOS/Rate#473). 500 is getMasterProducts' cap.
    const [allProducts, filteredReviewCounts] = await Promise.all([
      getCachedMasterProducts({
        categorySlug: category,
        limit: 500,
        sort: 'rating_desc',
      }),
      // A failed count read shows no blocked count (still true) instead of
      // failing the whole ranking (DOS/Rate#1139).
      getCachedFilteredReviewCountsByMaster().catch(
        () => ({}) as Record<string, number>
      ),
    ]);

    const ranked = rankMasterProductsForLeaderboard(allProducts, {
      category,
      criterion,
      priceSegment,
      brand,
      query,
      filteredReviewCounts,
    });

    const pageRanked = ranked.slice(0, limit);
    const offersByMasterId = await getMasterProductOffersBatch(
      pageRanked.map((r) => r.product.id)
    );

    const items = pageRanked.map((r) => {
      const offers = offersByMasterId.get(r.product.id) ?? [];
      const rawSignal = computeProductRadarSignal(r.product, offers);
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
      err,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
