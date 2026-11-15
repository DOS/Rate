// The 1v1 score and winner, shared by the versus page
// (`VersusInteractiveScoreboard`) and `GET /api/v1/rate/versus` so both
// always name the same winner and the same tie (DOS/Rate#1647, item 5).
//
// The default weights read the product's rating as every page shows it; a
// use-case preset or custom weights blend that rating with the weighted
// criteria both models have a real score for: 0.35 * rating + 0.65 * criteria.

import { comparePositiveMinPrices } from './rate-domain';
import type { ScoredLeaderboardItem } from './rate-domain';
import {
  leaderboardCriteriaForCategory,
  sharedScoredCriteria,
  weightedCriteriaScore5,
} from './leaderboard-engine';
import { displayedScore5, formatScoreFixed } from './rating-display';
import { isVersusScoreTie } from './versus-verdict';

export type ScoredVersusItem = Omit<ScoredLeaderboardItem, 'rank'>;

export type PersonaPresetKey =
  | 'default'
  | 'photography'
  | 'gaming'
  | 'endurance'
  | 'business'
  | 'value_hunter'
  | 'custom';

export interface CriteriaWeights {
  screen: number;
  performance: number;
  camera: number;
  battery: number;
  value: number;
}

export const PERSONA_WEIGHTS: Record<
  Exclude<PersonaPresetKey, 'custom'>,
  CriteriaWeights
> = {
  default: { screen: 20, performance: 20, camera: 20, battery: 20, value: 20 },
  photography: {
    screen: 20,
    performance: 15,
    camera: 45,
    battery: 10,
    value: 10,
  },
  gaming: { screen: 25, performance: 45, camera: 5, battery: 15, value: 10 },
  endurance: {
    screen: 15,
    performance: 15,
    camera: 10,
    battery: 45,
    value: 15,
  },
  business: { screen: 35, performance: 25, camera: 10, battery: 20, value: 10 },
  value_hunter: {
    screen: 15,
    performance: 20,
    camera: 10,
    battery: 15,
    value: 40,
  },
};

/** Share of the shown rating in a preset or custom score. */
export const VERSUS_RATING_SHARE = 0.35;
/** Share of the weighted criteria in a preset or custom score. */
export const VERSUS_CRITERIA_SHARE = 0.65;

export function sanitizeVersusScore5(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  // Unrounded: the page rounds once, to 1 decimal (D3).
  return Math.min(5, num);
}

/** A criterion score out of 5, or null when there is no real one. */
export function versusCriterionScore5(value: unknown): number | null {
  if (value == null) return null;
  const score = sanitizeVersusScore5(value);
  return score > 0 ? score : null;
}

/**
 * Who wins one criterion (DOS/Rate#1647): the criterion stars as shown, at
 * one decimal, so 4.34 and 4.26 (both 4.3) are level. Null when either side
 * has no real score: the criterion is not won or lost (DOS/Rate#1143).
 */
export function versusCriterionWinner(
  scoreA: unknown,
  scoreB: unknown
): 'A' | 'B' | 'tie' | null {
  const a = versusCriterionScore5(scoreA);
  const b = versusCriterionScore5(scoreB);
  if (a == null || b == null) return null;
  const shownA = displayedScore5(a);
  const shownB = displayedScore5(b);
  return shownA > shownB ? 'A' : shownB > shownA ? 'B' : 'tie';
}

/**
 * The criterion rows of a pair, for its category (no screen for earbuds):
 * each side's real score out of 5, or null, and the row's winner. The page's
 * table and the API's `criteria_head_to_head` both read these rows.
 */
export function versusCriteriaHeadToHead(
  scoreA: Pick<ScoredVersusItem, 'categorySlug' | 'criteria'>,
  scoreB: Pick<ScoredVersusItem, 'criteria'>
) {
  return leaderboardCriteriaForCategory(scoreA.categorySlug).map((key) => {
    const aVal = versusCriterionScore5(scoreA.criteria?.[key]);
    const bVal = versusCriterionScore5(scoreB.criteria?.[key]);
    return { key, aVal, bVal, winner: versusCriterionWinner(aVal, bVal) };
  });
}

/**
 * The use-case presets worth offering for a pair (DOS/Rate#1556): one whose
 * heaviest criterion both models have a real score for. With no criterion
 * scored on both sides every preset would read as the default one.
 */
export function versusAvailablePersonas(
  shared: readonly string[]
): Exclude<PersonaPresetKey, 'custom'>[] {
  if (shared.length === 0) return [];
  return (
    Object.keys(PERSONA_WEIGHTS) as Exclude<PersonaPresetKey, 'custom'>[]
  ).filter((key) => {
    if (key === 'default') return true;
    const weights = PERSONA_WEIGHTS[key];
    const lead = (Object.keys(weights) as (keyof CriteriaWeights)[]).reduce(
      (best, c) => (weights[c] > weights[best] ? c : best)
    );
    return shared.includes(lead);
  });
}

/**
 * The preset and weights a pair is scored with: a preset the pair cannot be
 * weighed by (its heaviest criterion is not scored on both sides), or custom
 * weights when no criterion is, falls back to the default weights, as the
 * page does (DOS/Rate#1556).
 */
export function resolveVersusPersona(
  scoreA: Pick<ScoredVersusItem, 'rankCriteria'>,
  scoreB: Pick<ScoredVersusItem, 'rankCriteria'>,
  persona: PersonaPresetKey,
  weights: CriteriaWeights
): { persona: PersonaPresetKey; weights: CriteriaWeights } {
  const available = versusAvailablePersonas(
    sharedScoredCriteria(scoreA.rankCriteria, scoreB.rankCriteria)
  );
  const active: PersonaPresetKey =
    persona === 'custom'
      ? available.length > 0
        ? 'custom'
        : 'default'
      : available.includes(persona)
        ? persona
        : 'default';
  return {
    persona: active,
    weights: active === persona ? weights : PERSONA_WEIGHTS.default,
  };
}

export function computeVersusWeightedResult(
  scoreA: ScoredVersusItem,
  scoreB: ScoredVersusItem,
  weights: CriteriaWeights,
  persona: PersonaPresetKey
) {
  const sanitizeWeight = (v: number): number =>
    Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  const wScreen = sanitizeWeight(weights.screen);
  const wPerf = sanitizeWeight(weights.performance);
  const wCam = sanitizeWeight(weights.camera);
  const wBat = sanitizeWeight(weights.battery);
  const wVal = sanitizeWeight(weights.value);
  const rawSumW = wScreen + wPerf + wCam + wBat + wVal;

  // Weights read the scores past the ranking threshold (D9).
  const shared = sharedScoredCriteria(scoreA.rankCriteria, scoreB.rankCriteria);
  const calcWeighted = (
    item: ScoredVersusItem
  ): { score: number; byCriteria: boolean } => {
    // The product's rating as every page shows it (DOS/Rate#1470); a model
    // with no buyer rating yet keeps its composite (expert or criteria).
    const baseScore5 = sanitizeVersusScore5(
      item.userScore5 > 0 ? item.userScore5 : item.combinedScore5
    );
    if (persona === 'default') {
      return { score: baseScore5, byCriteria: false };
    }
    // Only the criteria both models have a real score for are weighed; with
    // none in common the weights change nothing (DOS/Rate#1143).
    const wAvg = weightedCriteriaScore5(
      item.rankCriteria,
      rawSumW > 0
        ? {
            screen: wScreen,
            performance: wPerf,
            camera: wCam,
            battery: wBat,
            value: wVal,
          }
        : { screen: 1, performance: 1, camera: 1, battery: 1, value: 1 },
      shared
    );
    if (wAvg == null) return { score: baseScore5, byCriteria: false };
    return {
      score: sanitizeVersusScore5(
        baseScore5 * VERSUS_RATING_SHARE + wAvg * VERSUS_CRITERIA_SHARE
      ),
      byCriteria: true,
    };
  };

  const weightedA = calcWeighted(scoreA);
  const weightedB = calcWeighted(scoreB);
  const finalA = weightedA.score;
  const finalB = weightedB.score;
  const tiePriceSide = comparePositiveMinPrices(
    scoreA.minPrice,
    scoreB.minPrice
  );
  const winnerSide: 'A' | 'B' =
    finalA > finalB
      ? 'A'
      : finalB > finalA
        ? 'B'
        : tiePriceSide === 'B'
          ? 'B'
          : 'A';
  const winner = winnerSide === 'A' ? scoreA : scoreB;

  const shownA = displayedScore5(finalA);
  const shownB = displayedScore5(finalB);
  const bothScored = shownA > 0 && shownB > 0;
  const anyScored = shownA > 0 || shownB > 0;

  return {
    finalA,
    finalB,
    bothScored,
    // What the scores weigh: the shown rating alone, or blended with the
    // criteria both models have a real score for.
    basis:
      weightedA.byCriteria && weightedB.byCriteria
        ? ('rating_and_criteria' as const)
        : ('rating' as const),
    // The gap between the scores as shown, at one decimal; null when one side
    // has no score at all so an unrated 0 never creates a fake gap (#1647).
    delta: bothScored
      ? formatScoreFixed(Math.abs(shownA - shownB), 1)
      : !anyScored
        ? '0.0'
        : null,
    winner,
    winnerSide,
    // Level at the shown precision: no lead for either (DOS/Rate#1209).
    tie: isVersusScoreTie(finalA, finalB),
  };
}

export type VersusWeightedResult = ReturnType<
  typeof computeVersusWeightedResult
>;
