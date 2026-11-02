import type { ReviewValueGap, ReviewValueTier } from '@repo/shared-data/rules';

/**
 * Review value on the web (DOS/Rate#1547, D7). The public sees a review's
 * tier (`rate.reviews.value_tier`); only the writer sees the number and what
 * would raise it, read through `rate.my_review_values` as that writer.
 */

const TIERS: readonly ReviewValueTier[] = ['basic', 'complete', 'excellent'];

/** The tier of a stored review, null when it is unscored, gated or unknown. */
export function parseReviewValueTier(raw: unknown): ReviewValueTier | null {
  return typeof raw === 'string' && (TIERS as readonly string[]).includes(raw)
    ? (raw as ReviewValueTier)
    : null;
}

/** Sort rank of a tier: an unscored review ranks with a basic one. */
export function reviewTierRank(tier: ReviewValueTier | null | undefined) {
  return tier === 'excellent' ? 2 : tier === 'complete' ? 1 : 0;
}

/**
 * The tier a review shows and sorts by. A review the rating leaves out (a
 * flag or zero weight since it was scored) shows none, so a stale tier never
 * lifts it.
 */
export function shownReviewTier(review: {
  value_tier?: ReviewValueTier | null;
  include_in_rating: boolean;
  helpfulness_weight: number;
}): ReviewValueTier | null {
  return review.include_in_rating && review.helpfulness_weight > 0
    ? (review.value_tier ?? null)
    : null;
}

interface QualitySortedReview {
  value_tier?: ReviewValueTier | null;
  include_in_rating: boolean;
  helpfulness_weight: number;
  upvotes: number;
  downvotes: number;
  created_at: string | null;
}

/** Buyers voted it down: more down than up votes, at least 3 in all. */
function votedDown(r: { upvotes: number; downvotes: number }): boolean {
  return r.downvotes > r.upvotes && r.upvotes + r.downvotes >= 3;
}

/**
 * The "most helpful" order: the shown tier first (design 6.3), unless buyers
 * voted the review down, so votes still outrank a complete form; then the
 * helpful-vote order and the newest. `wilson` is the Wilson lower bound of a
 * review's votes.
 */
export function compareByQuality<T extends QualitySortedReview>(
  a: T,
  b: T,
  wilson: (upvotes: number, downvotes: number) => number
): number {
  const rank = (r: T) =>
    votedDown(r) ? 0 : reviewTierRank(shownReviewTier(r));
  const tierGap = rank(b) - rank(a);
  if (tierGap !== 0) return tierGap;
  const wilsonA = wilson(a.upvotes, a.downvotes);
  const wilsonB = wilson(b.upvotes, b.downvotes);
  if (
    a.include_in_rating &&
    b.include_in_rating &&
    Math.abs(wilsonB - wilsonA) >= 0.005
  ) {
    return wilsonB - wilsonA;
  }
  if (b.helpfulness_weight !== a.helpfulness_weight) {
    return b.helpfulness_weight - a.helpfulness_weight;
  }
  return (
    new Date(b.created_at || 0).getTime() -
    new Date(a.created_at || 0).getTime()
  );
}

/**
 * The gaps the writer is shown: at most three they can act on. A verified
 * purchase has no path from the form yet, and criteria gaps need a category
 * with a criteria list.
 */
export function shownReviewValueGaps(
  gaps: readonly ReviewValueGap[],
  hasCriteria: boolean
): ReviewValueGap[] {
  return gaps
    .filter(
      (gap) =>
        gap !== 'verified' &&
        (hasCriteria || (gap !== 'criteria' && gap !== 'criterion_points'))
    )
    .slice(0, 3);
}

/** The badge a tier shows: basic and unscored show none (less text). */
export function reviewTierBadgeKey(
  tier: ReviewValueTier | null | undefined
): 'valueTierExcellent' | 'valueTierComplete' | null {
  return tier === 'excellent'
    ? 'valueTierExcellent'
    : tier === 'complete'
      ? 'valueTierComplete'
      : null;
}

const GAP_KEYS = {
  detail: 'valueGapDetail',
  criteria: 'valueGapCriteria',
  verdict: 'valueGapVerdict',
  pros_cons: 'valueGapProsCons',
  criterion_points: 'valueGapCriterionPoints',
  photo: 'valueGapPhoto',
  verified: 'valueGapVerified',
} as const satisfies Record<ReviewValueGap, string>;

export type ReviewValueGapKey = (typeof GAP_KEYS)[ReviewValueGap];

/** The locale key naming a gap, null for a name this build does not know. */
export function reviewValueGapKey(gap: unknown): ReviewValueGapKey | null {
  return typeof gap === 'string' && Object.hasOwn(GAP_KEYS, gap)
    ? GAP_KEYS[gap as ReviewValueGap]
    : null;
}

/** True for a review id the value lookup can carry. */
export function isReviewId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** What the writer of a review sees about its value. */
export interface MyReviewValue {
  score: number;
  gaps: ReviewValueGap[];
}

/** At most this many ids per call, as `rate.my_review_values` allows. */
export const MY_REVIEW_VALUES_MAX_IDS = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The distinct review ids of a request, null when any is not a uuid. */
export function parseReviewIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MY_REVIEW_VALUES_MAX_IDS) {
    return null;
  }
  const ids = new Set<string>();
  for (const id of raw) {
    if (!isReviewId(id)) return null;
    ids.add(id.toLowerCase());
  }
  return [...ids];
}

/**
 * One row of `rate.my_review_values` (or of the route's answer) as the
 * writer's value; null for a row that is not a scored review.
 */
export function parseMyReviewValue(
  score: unknown,
  breakdown: unknown
): MyReviewValue | null {
  const n = typeof score === 'string' ? Number(score) : score;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
    return null;
  }
  const rawGaps =
    breakdown && typeof breakdown === 'object' && !Array.isArray(breakdown)
      ? (breakdown as { gaps?: unknown }).gaps
      : undefined;
  const gaps = Array.isArray(rawGaps)
    ? (rawGaps.filter((g) => reviewValueGapKey(g) !== null) as ReviewValueGap[])
    : [];
  return { score: Math.round(n), gaps: [...new Set(gaps)] };
}

/** True when the browser holds a Supabase session cookie. */
export function hasSessionCookie(cookie: string): boolean {
  return typeof cookie === 'string'
    ? /(?:^|;\s*)sb-[a-z0-9_-]{1,64}-auth-token(?:\.\d{1,3})?=[^;\s]/i.test(
        cookie
      )
    : false;
}
