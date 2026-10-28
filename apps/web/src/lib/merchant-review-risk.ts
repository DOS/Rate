/**
 * A store's review risk score, or null when it has no analysed review to
 * score (DOS/Rate#1249): "Rủi ro đánh giá: 4/100" next to "Chưa có đánh giá
 * để phân tích" claimed a measurement the data does not have. A store whose
 * breakdown is missing keeps its stored score.
 */
export function reviewRiskScoreOrNull(merchant: {
  review_risk_score?: number | string | null;
  review_risk_breakdown?: object | null;
}): number | null {
  const breakdown = merchant?.review_risk_breakdown as
    { total_reviews?: unknown } | null | undefined;
  const total = breakdown?.total_reviews;
  if (typeof total === 'number' && total <= 0) return null;
  const score = Number(merchant?.review_risk_score);
  if (merchant?.review_risk_score == null || !Number.isFinite(score)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
