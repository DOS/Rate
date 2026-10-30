/**
 * Review risk shared by the importer (which scores it for its logs and reports;
 * Rate Services' MerchantRiskAuditor stores `merchants.review_risk_score`,
 * DOS/Rate#1341) and the web (which computes it when nothing is stored), so both
 * give the same seeding contribution for the same reviews (DOS/Rate#671).
 */

/** Most seeding can add to a merchant's review risk. */
export const SEEDING_RISK_MAX_PENALTY = 45;
/** Points per unit of seeding ratio, before the cap. */
export const SEEDING_RISK_SLOPE = 75;

/**
 * Risk points for `seedingCount` seeding/fake reviews out of `total` analyzed
 * reviews: `min(45, round(ratio * 75))`, with the ratio rounded to three
 * decimals as the importer stores it. Bad input counts as no seeding.
 */
export function seedingRiskPenalty(
  seedingCount: number,
  total: number
): number {
  if (
    typeof seedingCount !== 'number' ||
    typeof total !== 'number' ||
    !Number.isFinite(seedingCount) ||
    !Number.isFinite(total) ||
    seedingCount <= 0 ||
    total <= 0
  ) {
    return 0;
  }
  const ratio = Number((Math.min(seedingCount, total) / total).toFixed(3));
  return Math.min(
    SEEDING_RISK_MAX_PENALTY,
    Math.round(ratio * SEEDING_RISK_SLOPE)
  );
}
