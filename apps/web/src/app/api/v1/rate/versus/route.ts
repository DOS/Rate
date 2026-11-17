import { NextRequest, NextResponse } from 'next/server';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
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
  displayedScore5,
  scoreMasterProductForLeaderboard,
  sharedScoredCriteria,
  type LeaderboardCriteriaWeights,
} from '@/lib/leaderboard-engine';
import { roundScore } from '@/lib/rating-display';
import {
  computeVersusResult,
  versusCriteriaHeadToHead,
  type PersonaPresetKey,
} from '@/lib/versus-score';
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
  /**
   * The shared preset this one scores as (DOS/Rate#1647, `PERSONA_WEIGHTS`
   * in `lib/versus-score.ts`): `default` adds no lead; a preset outside
   * that list (`creator`, `gamer`, `traveler`) scores as custom weights.
   */
  preset: PersonaPresetKey;
  weights: LeaderboardCriteriaWeights;
}

const VERSUS_PERSONAS: VersusPersonaConfig[] = [
  {
    id: 'balanced',
    preset: 'default',
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
    preset: 'default',
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
    preset: 'custom',
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
    preset: 'photography',
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
    preset: 'custom',
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
    preset: 'gaming',
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
    preset: 'custom',
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
    preset: 'endurance',
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
    preset: 'business',
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
    preset: 'value_hunter',
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
    preset: 'value_hunter',
    weights: {
      screen: 15,
      performance: 20,
      camera: 10,
      battery: 15,
      value: 40,
    },
  },
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

    const category = getMasterProductCategorySlug(compared[0]);
    const prodA = applyCategorySpecTemplate(category, compared[0]);
    const prodB = applyCategorySpecTemplate(
      getMasterProductCategorySlug(compared[1]),
      compared[1]
    );

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

    const WEIGHT_PARAMS = {
      screen: 'w_screen',
      performance: 'w_performance',
      camera: 'w_camera',
      battery: 'w_battery',
      value: 'w_value',
    } as const;
    const weightParam = (key: keyof typeof WEIGHT_PARAMS): number | null => {
      const raw = parseBoundedStringParam(
        searchParams.get(WEIGHT_PARAMS[key]),
        32
      );
      if (!raw) return null;
      const num = Number(raw);
      return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : null;
    };
    const weightKeys = Object.keys(WEIGHT_PARAMS) as Array<
      keyof typeof WEIGHT_PARAMS
    >;
    const explicitWeights = Object.fromEntries(
      weightKeys.map((key) => [key, weightParam(key)])
    ) as Record<keyof typeof WEIGHT_PARAMS, number | null>;
    // A weight given in the query is the page's custom sliders: the
    // preset's weights with that one changed (DOS/Rate#1647).
    const hasCustomWeights = weightKeys.some(
      (key) => explicitWeights[key] != null
    );
    const sanitizedWeights = Object.fromEntries(
      weightKeys.map((key) => [
        key,
        explicitWeights[key] ?? matchedPersona.weights[key],
      ])
    ) as unknown as LeaderboardCriteriaWeights;

    // Weights as percentages of their total; equal when all are 0.
    const toPercentWeights = (
      w: LeaderboardCriteriaWeights
    ): LeaderboardCriteriaWeights => {
      const total = weightKeys.reduce((sum, key) => sum + w[key], 0);
      return total > 0
        ? (Object.fromEntries(
            weightKeys.map((key) => [
              key,
              roundScore((w[key] / total) * 100, 1),
            ])
          ) as unknown as LeaderboardCriteriaWeights)
        : {
            screen: 20,
            performance: 20,
            camera: 20,
            battery: 20,
            value: 20,
          };
    };
    const normalizedWeights = toPercentWeights(sanitizedWeights);

    // The criteria both products have a score for past the ranking
    // threshold (D9); a criterion outside them is not won or lost
    // (DOS/Rate#1143).
    const comparedCriteria = sharedScoredCriteria(
      scoreA.rankCriteria,
      scoreB.rankCriteria
    );

    // The same result as the versus page, from the same function and with
    // the same preset fallback (DOS/Rate#1647). The final winner and the tie
    // read the overall rating as shown (`rating_score_5`, or the composite
    // for a model with no buyer rating yet, `overall_score_source` says
    // which), whatever weights are asked for: the overall stars are the final
    // comparison. On a tie the higher
    // unrounded score, the lower price, then the pair's canonical first slug
    // pick `overall_winner`. A preset or custom weights only add
    // `persona_result`: 0.35 * rating + 0.65 * the weighted shared criteria.
    const versus = computeVersusResult(
      scoreA,
      scoreB,
      hasCustomWeights ? 'custom' : matchedPersona.preset,
      sanitizedWeights
    );
    const overall = versus.overall;
    // The weights the pair is scored with, after the preset fallback.
    const appliedWeights = toPercentWeights(versus.appliedWeights);
    const byWeights = versus.persona ?? overall;
    // Rounded once, as the page rounds (D3), then put on 10.
    const shown10 = (score5: number) => displayedScore5(score5) * 2;
    const overallA5 = displayedScore5(overall.finalA) || null;
    const overallB5 = displayedScore5(overall.finalB) || null;
    const customScoreA5 = byWeights.finalA;
    const customScoreB5 = byWeights.finalB;
    const customScoreA10 = shown10(customScoreA5);
    const customScoreB10 = shown10(customScoreB5);
    const priceSide = comparePositiveMinPrices(
      scoreA.minPrice,
      scoreB.minPrice
    );

    const isTie = overall.tie;
    const winnerSide = overall.winnerSide;
    const winnerScore = winnerSide === 'A' ? scoreA : scoreB;
    // The gap between the overall stars as shown, on 10; null when one side
    // has no score, as the page shows no gap then.
    const margin10 =
      overallA5 != null && overallB5 != null
        ? roundScore(Math.abs(overallA5 - overallB5) * 2, 1)
        : overallA5 == null && overallB5 == null
          ? 0
          : null;
    const personaResult = versus.persona
      ? {
          persona: versus.appliedPersona,
          basis: versus.persona.basis,
          is_tie: versus.persona.tie,
          winner_slug: versus.persona.winner.slug,
          score_a_5: versus.persona.finalA,
          score_a_10: shown10(versus.persona.finalA),
          score_b_5: versus.persona.finalB,
          score_b_10: shown10(versus.persona.finalB),
        }
      : null;

    // A criterion without a real score on both sides has no winner: its
    // scores, delta and winner are null (DOS/Rate#1143).
    const criteriaHeadToHead = versusCriteriaHeadToHead(scoreA, scoreB).map(
      ({ key, winner }) => {
        const a5 = scoreA.criteria[key];
        const b5 = scoreB.criteria[key];
        // On 10 from the criterion stars as shown (one decimal on 5), with
        // the versus page's criterion winner (DOS/Rate#1647).
        const a10 = a5 != null ? displayedScore5(a5) * 2 : null;
        const b10 = b5 != null ? displayedScore5(b5) * 2 : null;
        const gap10 =
          winner != null && a10 != null && b10 != null
            ? roundScore(Math.abs(a10 - b10), 1)
            : null;
        return {
          criterion: key,
          weight_pct: appliedWeights[key],
          score_a_5: a5,
          score_a_10: a10,
          score_b_5: b5,
          score_b_10: b10,
          delta_10: gap10 == null ? null : winner === 'B' ? -gap10 : gap10,
          winner_slug:
            winner == null
              ? null
              : winner === 'A'
                ? scoreA.slug
                : winner === 'B'
                  ? scoreB.slug
                  : 'tie',
        };
      }
    );

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
        // The page preset the pair is scored with: `default` when the
        // requested one cannot weigh this pair (DOS/Rate#1556, #1647).
        applied_persona: versus.appliedPersona,
        weights: normalizedWeights,
        applied_weights: appliedWeights,
        // What the custom weighted scores weigh: the shown rating alone, or
        // 0.35 * rating + 0.65 * the weighted criteria both products have a
        // real score for (`compared_criteria`).
        custom_weighted_basis: byWeights.basis,
        // The lead under the asked preset or weights; null with the default
        // weights. It never replaces `overall_winner` (DOS/Rate#1647).
        persona_result: personaResult,
        compared_criteria: comparedCriteria,
        deal_radar: {
          productA: radarSignalA,
          productB: radarSignalB,
        },
        // Level at the shown precision: overall_winner is then only the
        // tie-break (DOS/Rate#1209, DOS/Rate#1545).
        is_tie: isTie,
        overall_winner: {
          side: winnerSide,
          slug: winnerScore.slug,
          name: winnerScore.name,
          brand: winnerScore.brand,
          combined_score_5: winnerScore.combinedScore5,
          combined_score_10: roundScore(winnerScore.combinedScore5 * 2, 1),
          // The deciding score; the weighted ones are in `persona_result`.
          overall_score_5: winnerSide === 'A' ? overallA5 : overallB5,
          overall_score_source:
            winnerSide === 'A' ? overall.sourceA : overall.sourceB,
          overall_score_10:
            (winnerSide === 'A' ? overallA5 : overallB5) != null
              ? shown10(winnerSide === 'A' ? overall.finalA : overall.finalB)
              : null,
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
          combined_score_10: roundScore(scoreA.combinedScore5 * 2, 1),
          custom_weighted_score_5: customScoreA5,
          custom_weighted_score_10: customScoreA10,
          user_score_5: scoreA.userScore5,
          rating_score_5: displayedScore5(scoreA.userScore5) || null,
          overall_score_5: overallA5,
          // `buyers`, or `expert_criteria` for a model with no buyer rating
          // yet (its composite), as the page labels it (DOS/Rate#1663).
          overall_score_source: overall.sourceA,
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
          combined_score_10: roundScore(scoreB.combinedScore5 * 2, 1),
          custom_weighted_score_5: customScoreB5,
          custom_weighted_score_10: customScoreB10,
          user_score_5: scoreB.userScore5,
          rating_score_5: displayedScore5(scoreB.userScore5) || null,
          overall_score_5: overallB5,
          overall_score_source: overall.sourceB,
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
