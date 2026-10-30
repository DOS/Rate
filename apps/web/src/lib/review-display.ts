import { formatDecimal } from './locale-format';
import type {
  CombinedDualScoreBlendMode,
  ReviewFlagCategory,
  ReviewIndependenceAxis,
  ReviewItem,
  ReviewWeightBreakdown,
  ReviewWeightExplanationKind,
} from './rate-api';

/**
 * Badge shown on a review card. Community reviews are stored unanalyzed and
 * excluded from the rating (DOS-Me 20261018100000) until an analyzer scores
 * them, so they get their own neutral state instead of the category fallback.
 */
export type ReviewBadgeKind = ReviewFlagCategory | 'pending';

const VALID_REVIEW_FLAG_CATEGORIES = new Set<ReviewFlagCategory>([
  'authentic',
  'low_value_coin_spam',
  'seeding_fake',
  'competitor_sabotage',
  'review_bombing',
]);

function parseDecimalReviewNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    return Number(cleaned);
  }
  return Number.NaN;
}

export function isPendingReview(review: Pick<ReviewItem, 'verdict'>): boolean {
  return (
    Boolean(review && typeof review === 'object') &&
    review.verdict === 'unanalyzed'
  );
}

export function reviewBadgeKind(
  review: Pick<ReviewItem, 'verdict' | 'flag_category'>
): ReviewBadgeKind {
  if (!review || typeof review !== 'object') return 'authentic';
  if (isPendingReview(review)) return 'pending';
  const rawCat = review.flag_category;
  return typeof rawCat === 'string' &&
    VALID_REVIEW_FLAG_CATEGORIES.has(rawCat as ReviewFlagCategory)
    ? (rawCat as ReviewFlagCategory)
    : 'authentic';
}

/** Excluded from the rating because it was flagged, not because it is still pending. */
export function isFilteredOutReview(
  review: Pick<
    ReviewItem,
    'verdict' | 'include_in_rating' | 'helpfulness_weight'
  >
): boolean {
  if (!review || typeof review !== 'object') return false;
  if (isPendingReview(review)) return false;
  const weight = parseDecimalReviewNumber(review.helpfulness_weight);
  return !review.include_in_rating || !Number.isFinite(weight) || weight <= 0;
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
  if (
    typeof independence !== 'string' ||
    !Object.hasOwn(SPONSORSHIP_BADGE_KEYS, independence)
  ) {
    return null;
  }
  return SPONSORSHIP_BADGE_KEYS[independence] ?? null;
}

export type WeightExplanationKey =
  | 'weightExplanationShippingOnly'
  | 'weightExplanationFiller'
  | 'weightExplanationSabotage'
  | 'weightExplanationBombing'
  | 'weightExplanationSeeding'
  | 'weightExplanationStarsOnly'
  | 'weightExplanationPlatformLabel'
  | 'weightExplanationLowEffort';

const WEIGHT_EXPLANATION_KEYS: Record<
  Exclude<ReviewWeightExplanationKind, 'formula'>,
  WeightExplanationKey
> = {
  shipping_only: 'weightExplanationShippingOnly',
  filler: 'weightExplanationFiller',
  sabotage: 'weightExplanationSabotage',
  bombing: 'weightExplanationBombing',
  seeding: 'weightExplanationSeeding',
  stars_only: 'weightExplanationStarsOnly',
  platform_label: 'weightExplanationPlatformLabel',
  low_effort: 'weightExplanationLowEffort',
};

export type WeightExplanationCopy =
  { key: WeightExplanationKey; values: { weight: string } } | { text: string };

/**
 * Localized copy for a review's weight explanation. The `formula` case
 * (`A=1 · B=1 ... -> 1.20x`) has no words, so it keeps the server text, as
 * does an assessment cached before `explanationKind` existed.
 */
export function weightExplanationCopy(
  breakdown: Pick<ReviewWeightBreakdown, 'weight' | 'explanationVi'> & {
    explanationKind?: ReviewWeightExplanationKind;
  },
  locale?: string | null
): WeightExplanationCopy {
  if (!breakdown || typeof breakdown !== 'object') return { text: '' };
  const kind = breakdown.explanationKind;
  if (
    !kind ||
    kind === 'formula' ||
    !Object.hasOwn(WEIGHT_EXPLANATION_KEYS, kind)
  ) {
    const cleanText =
      typeof breakdown.explanationVi === 'string'
        ? breakdown.explanationVi
            .replace(/\p{Cc}+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300)
        : '';
    return { text: cleanText };
  }
  const rawWeight = parseDecimalReviewNumber(breakdown.weight);
  const safeWeight = Number.isFinite(rawWeight)
    ? Math.max(0, Math.min(10, rawWeight))
    : 0;
  return {
    key: WEIGHT_EXPLANATION_KEYS[kind],
    values: { weight: formatDecimal(safeWeight, locale, 2) },
  };
}

export type BlendNoteKey =
  | 'blendNoteBlended'
  | 'blendNoteSeparateLowConfidence'
  | 'blendNoteUserOnly'
  | 'blendNoteExpertOnly'
  | 'blendNoteInsufficientData';

const BLEND_NOTE_KEYS: Record<CombinedDualScoreBlendMode, BlendNoteKey> = {
  blended: 'blendNoteBlended',
  separate_low_confidence: 'blendNoteSeparateLowConfidence',
  user_only: 'blendNoteUserOnly',
  expert_only: 'blendNoteExpertOnly',
  insufficient_data: 'blendNoteInsufficientData',
};

/** Localized key for the `blendFormulaNoteVi` case `computeCombinedDualScore` picked. */
export function blendNoteKey(mode: CombinedDualScoreBlendMode): BlendNoteKey {
  if (typeof mode !== 'string' || !Object.hasOwn(BLEND_NOTE_KEYS, mode)) {
    return 'blendNoteInsufficientData';
  }
  return BLEND_NOTE_KEYS[mode];
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
  if (typeof code !== 'string') return 'errSubmitFailed';
  const normalized = code
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toUpperCase();
  return SUBMIT_ERROR_KEYS.get(normalized) ?? 'errSubmitFailed';
}
