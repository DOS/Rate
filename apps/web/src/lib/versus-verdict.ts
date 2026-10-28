/**
 * Whether two 1v1 scores are level as the page shows them, at two decimals
 * (DOS/Rate#1209): 5.00 vs 5.00 is a tie, not a lead for either model.
 */
export function isVersusScoreTie(scoreA: number, scoreB: number): boolean {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return false;
  return scoreA.toFixed(2) === scoreB.toFixed(2);
}
