import type { CriteriaRatings } from '@repo/shared-data/rules';
import { RATING_CRITERIA_VERSION } from '@repo/shared-data/rules';
import {
  reviewV2Errors,
  reviewV2Star,
  type CriterionPoints,
  type ReviewV2Error,
} from '@/lib/review-form-v2';

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

/** A parsed v2 body, before the category's rules are applied. */
export interface ReviewV2Body {
  masterProductId: string;
  authorName?: string;
  variation?: string;
  comment?: string;
  criteriaRatings: CriteriaRatings;
  verdict: string;
  pros: string[];
  cons: string[];
  criterionPoints?: Partial<Record<string, CriterionPoints>>;
}

function cleanName(value: string | undefined, max: number): string | null {
  return (
    (value || '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .slice(0, max) || null
  );
}

/**
 * Checks a v2 body against its product's category and builds what is
 * stored. The star comes from the criteria and the category's weights; a
 * star in the body is never read.
 */
export function buildReviewV2Submission(
  categorySlug: string,
  body: ReviewV2Body
):
  | { ok: true; submission: ReviewV2Submission }
  | { ok: false; fieldErrors: ReviewV2Error[] } {
  const fieldErrors = reviewV2Errors(categorySlug, body);
  const ratingStar = reviewV2Star(categorySlug, body.criteriaRatings);
  if (fieldErrors.length > 0 || ratingStar == null)
    return { ok: false, fieldErrors };
  return {
    ok: true,
    submission: {
      masterProductId: body.masterProductId,
      authorName: cleanName(body.authorName, 80) ?? 'Người dùng Rate.vn',
      variation: cleanName(body.variation, 120),
      comment: body.comment || null,
      ratingStar,
      criteriaVersion: RATING_CRITERIA_VERSION,
      criteriaRatings: body.criteriaRatings,
      verdict: body.verdict,
      pros: body.pros,
      cons: body.cons,
      criterionPoints: body.criterionPoints ?? {},
    },
  };
}

export type ReviewV2SubmitResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; code: 'REVIEWS_UNAVAILABLE' };

/**
 * Stores a v2 review (DOS/Rate#1544). A stub until DOS-Me ships the v2 RPC
 * with its own checks (verdict, pros and cons tables, the stored star): it
 * never touches the database and always answers that reviews are not
 * available yet, which the route turns into a 503. The real call runs as
 * the signed-in user through `rateClient`, like the v1 RPC.
 */
export async function submitCommunityReviewV2(
  rateClient: unknown,
  submission: ReviewV2Submission
): Promise<ReviewV2SubmitResult> {
  void rateClient;
  void submission;
  return { ok: false, code: 'REVIEWS_UNAVAILABLE' };
}
