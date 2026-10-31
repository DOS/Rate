import { formatDecimal } from './locale-format';

/**
 * Whether two 1v1 scores are level as the page shows them (DOS/Rate#1209):
 * at one decimal, like the comparison matrix and every rating on the site
 * (DOS/Rate#1470). 5.0 vs 5.0 is a tie, not a lead for either model.
 */
export function isVersusScoreTie(scoreA: number, scoreB: number): boolean {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return false;
  return scoreA.toFixed(1) === scoreB.toFixed(1);
}

/**
 * The 1v1 API's winner and tie (DOS/Rate#1545): the persona scores on 10, at
 * one decimal as the response shows them, decide; on a tie the composite,
 * then the lower price, then side A only pick `overall_winner`.
 */
export function versusApiWinner(
  score10A: number,
  score10B: number,
  combined5A: number,
  combined5B: number,
  lowerPriceSide: string | null | undefined
): { tie: boolean; side: 'A' | 'B' } {
  const a = Number.isFinite(score10A) ? Number(score10A.toFixed(1)) : 0;
  const b = Number.isFinite(score10B) ? Number(score10B.toFixed(1)) : 0;
  if (a !== b) return { tie: false, side: a > b ? 'A' : 'B' };
  const side: 'A' | 'B' =
    combined5A > combined5B
      ? 'A'
      : combined5B > combined5A
        ? 'B'
        : lowerPriceSide === 'B'
          ? 'B'
          : 'A';
  return { tie: true, side };
}

export interface VersusVerdictInput {
  tie: boolean;
  /** The leader's score under the weights in use (either side on a tie). */
  score: number;
  winnerName: string;
  winnerExpertScore10?: number | null;
  /** The weights' name, or null for the default weights. */
  weightsLabel: string | null;
}

export type VersusVerdictCopy =
  | {
      key: 'versusAutoVerdictNoScore';
      values: Record<string, never>;
      weightsLabel: string | null;
    }
  | {
      key: 'versusAutoVerdictTie';
      values: { score: string };
      weightsLabel: string | null;
    }
  | {
      key: 'versusAutoVerdict';
      values: { winner: string; score: string; expertSuffix: string };
      weightsLabel: string | null;
    };

/**
 * The automatic 1v1 verdict for the scoreboard's current result, so it
 * names the same leader, or the same tie, as the banner, and says which
 * weights it uses when they are not the default ones (DOS/Rate#1235).
 */
export function versusVerdictCopy(
  input: VersusVerdictInput,
  locale?: string | null
): VersusVerdictCopy {
  // Level because neither model has a score yet: say so, as the stars do,
  // instead of a "0.0" tie (DOS/Rate#1545).
  if (input.tie && !(input.score > 0)) {
    return {
      key: 'versusAutoVerdictNoScore',
      values: {},
      weightsLabel: input.weightsLabel,
    };
  }
  const score = formatDecimal(input.score, locale, 1);
  if (input.tie) {
    return {
      key: 'versusAutoVerdictTie',
      values: { score },
      weightsLabel: input.weightsLabel,
    };
  }
  return {
    key: 'versusAutoVerdict',
    values: {
      winner: input.winnerName,
      score,
      expertSuffix:
        input.winnerExpertScore10 != null
          ? ` (${formatDecimal(input.winnerExpertScore10, locale, 1)}/10 Lab)`
          : '',
    },
    weightsLabel: input.weightsLabel,
  };
}

/**
 * `versusVerdictCopy` for a scoreboard result: the leader's score under the
 * weights in use, and the weights' label unless they are the default ones
 * (a persona without its own label reads as custom weights).
 */
export function versusVerdictFor(
  result: {
    tie: boolean;
    finalA: number;
    finalB: number;
    winner: { slug: string; name: string; expertScore10?: number | null };
  },
  slugA: string,
  persona: string,
  labels: Partial<Record<string, string>> & { custom: string },
  locale?: string | null
): VersusVerdictCopy {
  return versusVerdictCopy(
    {
      tie: result.tie,
      score:
        result.tie || result.winner.slug === slugA
          ? result.finalA
          : result.finalB,
      winnerName: result.winner.name,
      winnerExpertScore10: result.winner.expertScore10,
      weightsLabel:
        persona === 'default' ? null : (labels[persona] ?? labels.custom),
    },
    locale
  );
}
