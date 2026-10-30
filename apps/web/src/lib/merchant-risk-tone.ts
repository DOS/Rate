/**
 * One cut-off for every merchant risk score shown on the site, so the home
 * merchant cards and the merchant detail page agree (DOS/Rate#1140): below 20
 * is clean ("no scam detected"), 20-49 needs caution, 50+ is a risk alert.
 */
export type MerchantRiskTone = 'good' | 'warn' | 'bad';

export const MERCHANT_RISK_CLEAN_BELOW = 20;
export const MERCHANT_RISK_ALERT_FROM = 50;

export function merchantRiskTone(score: unknown): MerchantRiskTone {
  const n = typeof score === 'number' ? score : Number(score);
  // An unknown score is neither clean nor a scam alert.
  if (score == null || !Number.isFinite(n)) return 'warn';
  if (n < MERCHANT_RISK_CLEAN_BELOW) return 'good';
  return n < MERCHANT_RISK_ALERT_FROM ? 'warn' : 'bad';
}

export {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  reviewRiskScoreOrNull,
} from './rate-domain-core';
