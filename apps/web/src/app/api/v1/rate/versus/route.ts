import { NextRequest, NextResponse } from 'next/server';
import {
  computeProductRadarSignal,
  getCachedCompareMasterProducts,
  getCachedFilteredReviewCountsByMaster,
  getMasterProductCategorySlug,
  getMasterProductOffersBatch,
} from '@/server/rate';
import { radarExportFields } from '@/lib/deal-radar';
import {
  comparePositiveMinPrices,
  scoreMasterProductForLeaderboard,
  type LeaderboardCriteriaBreakdown,
} from '@/lib/leaderboard-engine';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseBoundedStringParam,
  parseVersusQueryParams,
} from '@/server/rate/api-handler';
import { canonicalVersusOrder, versusHref } from '@/lib/item-compare';

export { parseVersusQueryParams };

export const revalidate = 60;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

interface VersusPersonaConfig {
  id: string;
  weights: LeaderboardCriteriaBreakdown;
}

const VERSUS_PERSONAS: VersusPersonaConfig[] = [
  {
    id: 'balanced',
    weights: {
      screen: 20,
      performance: 20,
      camera: 20,
      battery: 20,
      value: 20,
    },
  },
  {
    id: 'default',
    weights: {
      screen: 20,
      performance: 20,
      camera: 20,
      battery: 20,
      value: 20,
    },
  },
  {
    id: 'creator',
    weights: {
      screen: 25,
      performance: 15,
      camera: 40,
      battery: 10,
      value: 10,
    },
  },
  {
    id: 'photography',
    weights: {
      screen: 20,
      performance: 15,
      camera: 45,
      battery: 10,
      value: 10,
    },
  },
  {
    id: 'gamer',
    weights: {
      screen: 25,
      performance: 40,
      camera: 5,
      battery: 20,
      value: 10,
    },
  },
  {
    id: 'gaming',
    weights: {
      screen: 25,
      performance: 45,
      camera: 5,
      battery: 15,
      value: 10,
    },
  },
  {
    id: 'traveler',
    weights: {
      screen: 15,
      performance: 15,
      camera: 15,
      battery: 40,
      value: 15,
    },
  },
  {
    id: 'endurance',
    weights: {
      screen: 15,
      performance: 15,
      camera: 10,
      battery: 45,
      value: 15,
    },
  },
  {
    id: 'business',
    weights: {
      screen: 35,
      performance: 25,
      camera: 10,
      battery: 20,
      value: 10,
    },
  },
  {
    id: 'budget',
    weights: {
      screen: 15,
      performance: 20,
      camera: 10,
      battery: 15,
      value: 40,
    },
  },
  {
    id: 'value_hunter',
    weights: {
      screen: 15,
      performance: 20,
      camera: 10,
      battery: 15,
      value: 40,
    },
  },
];

const CRITERIA_KEYS: Array<keyof LeaderboardCriteriaBreakdown> = [
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsedSlugs = parseVersusQueryParams(searchParams);

    if (!parsedSlugs) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing or invalid 1v1 pair. Provide ?pair=<slugA>-vs-<slugB> or ?slugA=<slugA>&slugB=<slugB> with two distinct same-category product slugs.',
        },
        { status: 400, headers: PUBLIC_API_CORS_HEADERS }
      );
    }

    const compared = await getCachedCompareMasterProducts(
      parsedSlugs.join(',')
    );

    if (compared.length < 2 || !compared[0] || !compared[1]) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Could not resolve two same-category master products for 1v1 comparison. Verify both slugs exist and belong to the same hardware category.',
          requested_pair: parsedSlugs,
        },
        { status: 404, headers: PUBLIC_API_CORS_HEADERS }
      );
    }

    const prodA = compared[0];
    const prodB = compared[1];
    const category = getMasterProductCategorySlug(prodA);

    // filtered_noise_review_count counts stored reviews only (DOS/Rate#1139).
    // On a read failure no product claims a blocked count, which is still true.
    const filteredReviewCounts =
      await getCachedFilteredReviewCountsByMaster().catch(
        () => ({}) as Record<string, number>
      );
    const scoreA = scoreMasterProductForLeaderboard(
      prodA,
      'combined',
      filteredReviewCounts
    );
    const scoreB = scoreMasterProductForLeaderboard(
      prodB,
      'combined',
      filteredReviewCounts
    );

    const requestedPersonaId = (
      parseBoundedStringParam(searchParams.get('persona'), 32) || 'balanced'
    )
      .toLowerCase()
      .trim();
    const matchedPersona =
      VERSUS_PERSONAS.find((p) => p.id === requestedPersonaId) ||
      VERSUS_PERSONAS[0]!;

    const parseWeight = (paramName: string, fallback: number): number => {
      const raw = parseBoundedStringParam(searchParams.get(paramName), 32);
      if (!raw) return fallback;
      const num = Number(raw);
      return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : fallback;
    };

    const sanitizedWeights: LeaderboardCriteriaBreakdown = {
      screen: parseWeight('w_screen', matchedPersona.weights.screen),
      performance: parseWeight(
        'w_performance',
        matchedPersona.weights.performance
      ),
      camera: parseWeight('w_camera', matchedPersona.weights.camera),
      battery: parseWeight('w_battery', matchedPersona.weights.battery),
      value: parseWeight('w_value', matchedPersona.weights.value),
    };

    const weightTotal =
      sanitizedWeights.screen +
      sanitizedWeights.performance +
      sanitizedWeights.camera +
      sanitizedWeights.battery +
      sanitizedWeights.value;

    const normalizedWeights: LeaderboardCriteriaBreakdown =
      weightTotal > 0
        ? {
            screen: Number(
              ((sanitizedWeights.screen / weightTotal) * 100).toFixed(1)
            ),
            performance: Number(
              ((sanitizedWeights.performance / weightTotal) * 100).toFixed(1)
            ),
            camera: Number(
              ((sanitizedWeights.camera / weightTotal) * 100).toFixed(1)
            ),
            battery: Number(
              ((sanitizedWeights.battery / weightTotal) * 100).toFixed(1)
            ),
            value: Number(
              ((sanitizedWeights.value / weightTotal) * 100).toFixed(1)
            ),
          }
        : {
            screen: 20,
            performance: 20,
            camera: 20,
            battery: 20,
            value: 20,
          };

    const computeWeighted5 = (c: LeaderboardCriteriaBreakdown): number => {
      const wSum =
        normalizedWeights.screen +
        normalizedWeights.performance +
        normalizedWeights.camera +
        normalizedWeights.battery +
        normalizedWeights.value;
      if (wSum <= 0) {
        return Number(
          (
            (c.screen + c.performance + c.camera + c.battery + c.value) /
            5
          ).toFixed(2)
        );
      }
      const weighted =
        (c.screen * normalizedWeights.screen +
          c.performance * normalizedWeights.performance +
          c.camera * normalizedWeights.camera +
          c.battery * normalizedWeights.battery +
          c.value * normalizedWeights.value) /
        wSum;
      return Number(weighted.toFixed(2));
    };

    const customScoreA5 = computeWeighted5(scoreA.criteria);
    const customScoreB5 = computeWeighted5(scoreB.criteria);
    const customScoreA10 = Number((customScoreA5 * 2).toFixed(1));
    const customScoreB10 = Number((customScoreB5 * 2).toFixed(1));
    const priceSide = comparePositiveMinPrices(
      scoreA.minPrice,
      scoreB.minPrice
    );

    const winnerSide: 'A' | 'B' =
      customScoreA5 > customScoreB5
        ? 'A'
        : customScoreB5 > customScoreA5
          ? 'B'
          : scoreA.combinedScore5 > scoreB.combinedScore5
            ? 'A'
            : scoreB.combinedScore5 > scoreA.combinedScore5
              ? 'B'
              : priceSide === 'B'
                ? 'B'
                : 'A';

    const winnerScore = winnerSide === 'A' ? scoreA : scoreB;
    const winnerCustom10 = winnerSide === 'A' ? customScoreA10 : customScoreB10;
    const margin10 = Number(
      Math.abs(customScoreA10 - customScoreB10).toFixed(1)
    );

    const criteriaHeadToHead = CRITERIA_KEYS.map((key) => {
      const a5 = scoreA.criteria[key];
      const b5 = scoreB.criteria[key];
      const a10 = Number((a5 * 2).toFixed(1));
      const b10 = Number((b5 * 2).toFixed(1));
      return {
        criterion: key,
        weight_pct: normalizedWeights[key],
        score_a_5: a5,
        score_a_10: a10,
        score_b_5: b5,
        score_b_10: b10,
        delta_10: Number((a10 - b10).toFixed(1)),
        winner_slug: a5 > b5 ? scoreA.slug : b5 > a5 ? scoreB.slug : 'tie',
      };
    });

    const bothPriced =
      Number.isFinite(scoreA.minPrice) &&
      scoreA.minPrice > 0 &&
      Number.isFinite(scoreB.minPrice) &&
      scoreB.minPrice > 0;
    const priceDeltaVnd = bothPriced
      ? Math.abs(scoreA.minPrice - scoreB.minPrice)
      : 0;
    const minOfTwoPrices = bothPriced
      ? Math.min(scoreA.minPrice, scoreB.minPrice)
      : 0;
    const priceDeltaPercent =
      minOfTwoPrices > 0
        ? Number(((priceDeltaVnd / minOfTwoPrices) * 100).toFixed(1))
        : 0;
    const cheaperSlug =
      priceSide === 'A'
        ? scoreA.slug
        : priceSide === 'B'
          ? scoreB.slug
          : priceSide;

    const offersByMaster = await getMasterProductOffersBatch([
      prodA.id,
      prodB.id,
    ]);
    const rawSignalA = computeProductRadarSignal(
      prodA,
      offersByMaster.get(prodA.id) ?? []
    );
    const rawSignalB = computeProductRadarSignal(
      prodB,
      offersByMaster.get(prodB.id) ?? []
    );
    const radarSignalA = radarExportFields(rawSignalA);
    const radarSignalB = radarExportFields(rawSignalB);

    return NextResponse.json(
      {
        ok: true,
        directory: 'tech_electronics',
        category,
        // The pair in its canonical order (sides sorted, the order of its
        // one URL) and the other order (DOS/Rate#1367).
        versus_pair: canonicalVersusOrder(scoreA.slug, scoreB.slug).join(
          '-vs-'
        ),
        swap_pair: canonicalVersusOrder(scoreA.slug, scoreB.slug)
          .reverse()
          .join('-vs-'),
        versus_url: versusHref(scoreA.slug, scoreB.slug),
        compare_matrix_url: `/compare?cat=${category}&slugs=${scoreA.slug},${scoreB.slug}`,
        persona: matchedPersona.id,
        weights: normalizedWeights,
        deal_radar: {
          productA: radarSignalA,
          productB: radarSignalB,
        },
        // Level at two decimals: overall_winner is then only the tie-break
        // (DOS/Rate#1209).
        is_tie:
          customScoreA5.toFixed(2) === customScoreB5.toFixed(2) &&
          scoreA.combinedScore5.toFixed(2) === scoreB.combinedScore5.toFixed(2),
        overall_winner: {
          side: winnerSide,
          slug: winnerScore.slug,
          name: winnerScore.name,
          brand: winnerScore.brand,
          combined_score_5: winnerScore.combinedScore5,
          combined_score_10: Number(
            (winnerScore.combinedScore5 * 2).toFixed(1)
          ),
          custom_weighted_score_5:
            winnerSide === 'A' ? customScoreA5 : customScoreB5,
          custom_weighted_score_10: winnerCustom10,
          margin_10: margin10,
          min_price: winnerScore.minPrice,
        },
        price_comparison: {
          min_price_a: scoreA.minPrice,
          min_price_b: scoreB.minPrice,
          cheaper_slug: cheaperSlug,
          price_delta_vnd: priceDeltaVnd,
          price_delta_percent: priceDeltaPercent,
        },
        criteria_head_to_head: criteriaHeadToHead,
        product_a: {
          slug: scoreA.slug,
          name: scoreA.name,
          brand: scoreA.brand,
          model: scoreA.model,
          category: scoreA.categorySlug,
          product_url: scoreA.productHref,
          thumbnail: scoreA.thumbnail,
          combined_score_5: scoreA.combinedScore5,
          combined_score_10: Number((scoreA.combinedScore5 * 2).toFixed(1)),
          custom_weighted_score_5: customScoreA5,
          custom_weighted_score_10: customScoreA10,
          user_score_5: scoreA.userScore5,
          expert_score_10: scoreA.expertScore10,
          authentic_review_count: scoreA.authenticReviewCount,
          filtered_noise_review_count: scoreA.filteredNoiseReviewCount,
          criteria_scores: scoreA.criteria,
          min_price: scoreA.minPrice,
          max_price: scoreA.maxPrice,
          merchant_count: scoreA.merchantCount,
          key_specs: prodA.key_specs || {},
          specifications: prodA.specifications || {},
          deal_radar: radarExportFields(rawSignalA),
          radar_signal: radarSignalA,
        },
        product_b: {
          slug: scoreB.slug,
          name: scoreB.name,
          brand: scoreB.brand,
          model: scoreB.model,
          category: scoreB.categorySlug,
          product_url: scoreB.productHref,
          thumbnail: scoreB.thumbnail,
          combined_score_5: scoreB.combinedScore5,
          combined_score_10: Number((scoreB.combinedScore5 * 2).toFixed(1)),
          custom_weighted_score_5: customScoreB5,
          custom_weighted_score_10: customScoreB10,
          user_score_5: scoreB.userScore5,
          expert_score_10: scoreB.expertScore10,
          authentic_review_count: scoreB.authenticReviewCount,
          filtered_noise_review_count: scoreB.filteredNoiseReviewCount,
          criteria_scores: scoreB.criteria,
          min_price: scoreB.minPrice,
          max_price: scoreB.maxPrice,
          merchant_count: scoreB.merchantCount,
          key_specs: prodB.key_specs || {},
          specifications: prodB.specifications || {},
          deal_radar: radarExportFields(rawSignalB),
          radar_signal: radarSignalB,
        },
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
      'Failed to compute 1v1 Head-to-Head JReviews versus verdict',
      err,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
