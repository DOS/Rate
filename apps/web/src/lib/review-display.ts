import type {
  ReviewFlagCategory,
  ReviewIndependenceAxis,
  ReviewItem,
} from './rate-api';

/**
 * Badge shown on a review card. Community reviews are stored unanalyzed and
 * excluded from the rating (DOS-Me 20261018100000) until an analyzer scores
 * them, so they get their own neutral state instead of the category fallback.
 */
export type ReviewBadgeKind = ReviewFlagCategory | 'pending';

export function isPendingReview(review: Pick<ReviewItem, 'verdict'>): boolean {
  return review.verdict === 'unanalyzed';
}

export function reviewBadgeKind(
  review: Pick<ReviewItem, 'verdict' | 'flag_category'>
): ReviewBadgeKind {
  return isPendingReview(review) ? 'pending' : review.flag_category;
}

/** Excluded from the rating because it was flagged, not because it is still pending. */
export function isFilteredOutReview(
  review: Pick<
    ReviewItem,
    'verdict' | 'include_in_rating' | 'helpfulness_weight'
  >
): boolean {
  if (isPendingReview(review)) return false;
  return !review.include_in_rating || review.helpfulness_weight <= 0;
}

export type SponsorshipBadgeKey =
  | 'sponsorshipBadgeSponsoredBalanced'
  | 'sponsorshipBadgeSponsoredPromo'
  | 'sponsorshipBadgeIncentivized'
  | 'sponsorshipBadgeAffiliate';

const SPONSORSHIP_BADGE_KEYS: Partial<
  Record<ReviewIndependenceAxis, SponsorshipBadgeKey>
> = {
  sponsored_balanced: 'sponsorshipBadgeSponsoredBalanced',
  sponsored_promo: 'sponsorshipBadgeSponsoredPromo',
  incentivized: 'sponsorshipBadgeIncentivized',
  affiliate: 'sponsorshipBadgeAffiliate',
};

/**
 * Localized message key for the disclosure badge of a review. Mirrors the
 * cases where `evaluateReviewTrustAssessment` sets `sponsorshipBadgeVi`, which
 * is Vietnamese only, so the UI never shows that string directly.
 */
export function sponsorshipBadgeKey(
  independence: ReviewIndependenceAxis
): SponsorshipBadgeKey | null {
  return SPONSORSHIP_BADGE_KEYS[independence] ?? null;
}

export type SubmitErrorKey =
  | 'errLoginRequired'
  | 'errRealAccountRequired'
  | 'errDuplicateReview'
  | 'errRateLimited'
  | 'errInvalidReview'
  | 'errSubmitFailed';

const SUBMIT_ERROR_KEYS = new Map<string, SubmitErrorKey>([
  ['AUTH_REQUIRED', 'errLoginRequired'],
  ['AUTH_INVALID', 'errLoginRequired'],
  ['FORBIDDEN', 'errRealAccountRequired'],
  ['DUPLICATE_REVIEW', 'errDuplicateReview'],
  ['RATE_LIMITED', 'errRateLimited'],
  ['REJECTED', 'errInvalidReview'],
  ['INVALID_BODY', 'errInvalidReview'],
]);

/**
 * Maps the `code` of a failed POST /api/v1/rate/reviews response to a
 * localized message key. The response `error` text is Vietnamese only, so the
 * UI never shows it directly.
 */
export function submitErrorKey(code: unknown): SubmitErrorKey {
  return (
    (typeof code === 'string' && SUBMIT_ERROR_KEYS.get(code)) ||
    'errSubmitFailed'
  );
}
