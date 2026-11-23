import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  reviewRiskScoreOrNull,
} from './rate-domain-core';

export const VERIFIED_SAFE_MAX_DOSAFE_RISK = 15;
export const VERIFIED_SAFE_MAX_REVIEW_RISK = 20;
export const VERIFIED_SAFE_MIN_TRUST_SCORE = 85;

export type MerchantTrustBadgeReason =
  | 'dosafe_low_risk'
  | 'review_risk_clean'
  | 'review_risk_unmeasured'
  | 'official_store'
  | 'combined_trust_high'
  | 'active_offers_present'
  | 'no_active_fake_discounts'
  | 'missing_dosafe_score'
  | 'dosafe_risk_too_high'
  | 'review_risk_too_high'
  | 'invalid_review_score'
  | 'trust_score_below_threshold'
  | 'no_active_offers'
  | 'missing_fake_discount_audit'
  | 'active_fake_discounts_detected';

export interface MerchantTrustBadgeInput {
  dosafe_risk_score?: number | string | null;
  dosafe_risk_known?: boolean;
  review_risk_score?: number | string | null;
  review_risk_breakdown?: { total_reviews?: unknown } | null;
  risk_score?: number | string | null;
  trust_score?: number | string | null;
  is_official?: boolean | null;
  offerCount?: number | null;
  product_count?: number | null;
  activeFakeDiscountCount?: number | null;
  fakeDiscountCount?: number | null;
}

export interface MerchantTrustBadgeSignals {
  dosafeRiskScore: number | null;
  reviewRiskScore: number | null;
  combinedTrustScore: number | null;
  isOfficial: boolean;
  offerCount: number;
  activeFakeDiscountCount: number | null;
}

export interface MerchantTrustBadgeResult {
  verifiedSafe: boolean;
  badgeCode: 'verified_safe' | null;
  reasons: MerchantTrustBadgeReason[];
  failedReasons: MerchantTrustBadgeReason[];
  signals: MerchantTrustBadgeSignals;
}

function toBoundedScore100(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string') {
    if (/[\p{Cc}]/u.test(raw)) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return null;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0 || num > 100) return null;
    return num === 0 ? 0 : num;
  }
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return null;
  return raw === 0 ? 0 : raw;
}

function hasExplicitScoreInput(raw: unknown): boolean {
  return (
    raw !== null &&
    raw !== undefined &&
    !(typeof raw === 'string' && raw.trim() === '')
  );
}

function toNonNegativeCountOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || !Number.isInteger(raw)) return null;
  return raw === 0 ? 0 : raw;
}

/**
 * Evaluates whether a merchant qualifies for the truthful `verified_safe` badge
 * using strictly verified live catalog, risk, and discount-audit signals.
 * Never fabricates or implies unbacked historical audit windows.
 */
export function evaluateMerchantTrustBadge(
  rawInput: MerchantTrustBadgeInput
): MerchantTrustBadgeResult {
  const input =
    rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? rawInput
      : ({} as MerchantTrustBadgeInput);

  // Validate before knownDosafeRiskScore so whitespace-only strings or booleans
  // never coerce to 0.
  const preValidatedDosafe = toBoundedScore100(input.dosafe_risk_score);
  const dosafeRiskScore =
    preValidatedDosafe === null
      ? null
      : knownDosafeRiskScore({
          dosafe_risk_score: preValidatedDosafe,
          dosafe_risk_known: input.dosafe_risk_known,
        });

  const hasRawReviewInput = hasExplicitScoreInput(input.review_risk_score);
  const reviewEvidencePresent = hasReviewRiskEvidence(
    input.review_risk_breakdown
  );
  // Normalize defined non-null input via toBoundedScore100 before reviewRiskScoreOrNull
  // so hex/boolean runtime inputs cannot bypass bounds checks while preserving null/0/'0'.
  const preValidatedReview =
    input.review_risk_score === null || input.review_risk_score === undefined
      ? null
      : toBoundedScore100(input.review_risk_score);
  const reviewRiskScore =
    preValidatedReview === null
      ? null
      : reviewRiskScoreOrNull({
          review_risk_score: preValidatedReview,
          review_risk_breakdown: input.review_risk_breakdown,
        });
  const invalidReviewScore =
    hasRawReviewInput && reviewEvidencePresent && reviewRiskScore === null;

  const explicitTrust = toBoundedScore100(input.trust_score);
  const explicitRisk = toBoundedScore100(input.risk_score);
  const hasInvalidExplicitTrust =
    hasExplicitScoreInput(input.trust_score) && explicitTrust === null;
  const hasInvalidExplicitRisk =
    !hasExplicitScoreInput(input.trust_score) &&
    hasExplicitScoreInput(input.risk_score) &&
    explicitRisk === null;
  let combinedTrustScore: number | null = null;
  if (explicitTrust !== null) {
    combinedTrustScore = Math.round(explicitTrust * 100) / 100;
  } else if (hasInvalidExplicitTrust) {
    combinedTrustScore = null;
  } else if (explicitRisk !== null) {
    combinedTrustScore = Math.round((100 - explicitRisk) * 100) / 100;
  } else if (hasInvalidExplicitRisk) {
    combinedTrustScore = null;
  } else if (dosafeRiskScore !== null || reviewRiskScore !== null) {
    const worstRisk = Math.max(dosafeRiskScore ?? 0, reviewRiskScore ?? 0);
    combinedTrustScore = Math.round((100 - worstRisk) * 100) / 100;
  }

  const isOfficial = input.is_official === true;
  const offerCount =
    toNonNegativeCountOrNull(input.offerCount ?? input.product_count) ?? 0;
  const activeFakeDiscountCount = toNonNegativeCountOrNull(
    input.activeFakeDiscountCount ?? input.fakeDiscountCount
  );

  const passedReasons: MerchantTrustBadgeReason[] = [];
  const failedReasons: MerchantTrustBadgeReason[] = [];

  if (dosafeRiskScore === null) {
    failedReasons.push('missing_dosafe_score');
  } else if (dosafeRiskScore > VERIFIED_SAFE_MAX_DOSAFE_RISK) {
    failedReasons.push('dosafe_risk_too_high');
  } else {
    passedReasons.push('dosafe_low_risk');
  }

  if (invalidReviewScore) {
    failedReasons.push('invalid_review_score');
  } else if (reviewRiskScore === null) {
    passedReasons.push('review_risk_unmeasured');
  } else if (reviewRiskScore > VERIFIED_SAFE_MAX_REVIEW_RISK) {
    failedReasons.push('review_risk_too_high');
  } else {
    passedReasons.push('review_risk_clean');
  }

  const meetsAuthority = isOfficial;
  const meetsCombinedTrust =
    combinedTrustScore !== null &&
    combinedTrustScore >= VERIFIED_SAFE_MIN_TRUST_SCORE;
  if (meetsAuthority || meetsCombinedTrust) {
    if (meetsAuthority) passedReasons.push('official_store');
    if (meetsCombinedTrust) passedReasons.push('combined_trust_high');
  } else {
    failedReasons.push('trust_score_below_threshold');
  }

  if (offerCount > 0) {
    passedReasons.push('active_offers_present');
  } else {
    failedReasons.push('no_active_offers');
  }

  if (activeFakeDiscountCount === null) {
    failedReasons.push('missing_fake_discount_audit');
  } else if (activeFakeDiscountCount > 0) {
    failedReasons.push('active_fake_discounts_detected');
  } else {
    passedReasons.push('no_active_fake_discounts');
  }

  const verifiedSafe = failedReasons.length === 0;

  return {
    verifiedSafe,
    badgeCode: verifiedSafe ? 'verified_safe' : null,
    reasons: verifiedSafe ? passedReasons : failedReasons,
    failedReasons,
    signals: {
      dosafeRiskScore,
      reviewRiskScore,
      combinedTrustScore,
      isOfficial,
      offerCount,
      activeFakeDiscountCount,
    },
  };
}
