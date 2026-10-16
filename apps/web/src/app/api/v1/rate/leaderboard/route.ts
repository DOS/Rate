import { NextRequest, NextResponse } from 'next/server';
import { getCachedMasterProducts } from '@/server/rate';
import {
  normalizeLeaderboardCategory,
  normalizeLeaderboardCriterion,
  normalizeLeaderboardPriceSegment,
  rankMasterProductsForLeaderboard,
} from '@/lib/leaderboard-engine';

export const revalidate = 60;

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
    const limitParam = Number(searchParams.get('limit') || 20);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 50)
      : 20;

    const allProducts = await getCachedMasterProducts({
      categorySlug: 'all',
      limit: 100,
      sort: 'rating_desc',
    });

    const ranked = rankMasterProductsForLeaderboard(allProducts, {
      category,
      criterion,
      priceSegment,
      brand,
      query,
    });

    const items = ranked.slice(0, limit).map((r) => ({
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
    }));

    const top3Slugs = items.slice(0, 3).map((x) => x.slug);
    const compareCategory =
      category === 'all' ? items[0]?.category || 'smartphones' : category;
    const compareTop3Url =
      top3Slugs.length >= 2
        ? `/compare?cat=${compareCategory}&slugs=${top3Slugs.join(',')}`
        : null;

    return NextResponse.json(
      {
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
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to compute JReviews leaderboard ranking',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
