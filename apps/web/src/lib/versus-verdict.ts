/**
 * Whether two 1v1 scores are level as the page shows them, at two decimals
 * (DOS/Rate#1209): 5.00 vs 5.00 is a tie, not a lead for either model.
 */
export function isVersusScoreTie(scoreA: number, scoreB: number): boolean {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return false;
  return scoreA.toFixed(2) === scoreB.toFixed(2);
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
  input: VersusVerdictInput
): VersusVerdictCopy {
  const score = input.score.toFixed(2);
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
          ? ` (${input.winnerExpertScore10.toFixed(1)}/10 Lab)`
          : '',
    },
    weightsLabel: input.weightsLabel,
  };
}
