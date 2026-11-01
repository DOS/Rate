import type { CriteriaRatings } from '@repo/shared-data/rules';
import { RATING_CRITERIA_VERSION } from '@repo/shared-data/rules';
import type { CriterionPoints } from '@/lib/review-form-v2';

/** A checked v2 review, as `rate.submit_community_review` v2 will take it. */
export interface ReviewV2Submission {
  masterProductId: string;
  authorName: string;
  variation: string | null;
  comment: string | null;
  /** Computed on the server from the criteria, never read from the body. */
  ratingStar: number;
  criteriaVersion: typeof RATING_CRITERIA_VERSION;
  criteriaRatings: CriteriaRatings;
  verdict: string;
  pros: readonly string[];
  cons: readonly string[];
  criterionPoints: Partial<Record<string, CriterionPoints>>;
}

export type ReviewV2SubmitResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; code: 'REVIEWS_UNAVAILABLE' };

/**
 * Stores a v2 review (DOS/Rate#1544). A stub until DOS-Me ships the v2 RPC
 * with its own checks (verdict, pros and cons tables, the stored star): it
 * never touches the database and always answers that reviews are not
 * available yet, which the route turns into a 503.
 */
export async function submitCommunityReviewV2(
  submission: ReviewV2Submission
): Promise<ReviewV2SubmitResult> {
  void submission;
  return { ok: false, code: 'REVIEWS_UNAVAILABLE' };
}
