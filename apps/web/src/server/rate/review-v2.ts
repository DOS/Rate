import type { CriteriaRatings } from '@repo/shared-data/rules';
import { RATING_CRITERIA_VERSION } from '@repo/shared-data/rules';
import {
  reviewV2Errors,
  reviewV2Star,
  type CriterionPoints,
  type ReviewV2Error,
} from '@/lib/review-form-v2';
import {
  isMissingRpcError,
  type AuthenticatedRateRequest,
} from './request-auth';

/** A checked v2 review, as `rate.submit_community_review_v2` takes it. */
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

export interface ReviewV2RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

export type ReviewV2SubmitResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; missing: boolean; error: ReviewV2RpcError | null };

/**
 * Stores a v2 review through `rate.submit_community_review_v2` (DOS-Me
 * 20261102090000), as the signed-in user: the database takes the author
 * from auth.uid(), checks the same D5 rules again, refuses anonymous
 * accounts, a second review of the same product and more than 5 a day, and
 * stores the review excluded until it is analysed.
 */
export async function submitCommunityReviewV2(
  rateClient: AuthenticatedRateRequest['rateClient'],
  submission: ReviewV2Submission
): Promise<ReviewV2SubmitResult> {
  const criteria: Record<string, number> = {};
  for (const [key, star] of Object.entries(submission.criteriaRatings)) {
    if (typeof star === 'number') criteria[key] = star;
  }
  const points = submission.criterionPoints;
  const { data, error } = await rateClient.rpc('submit_community_review_v2', {
    p_master_product_id: submission.masterProductId,
    p_criteria_ratings: criteria,
    p_verdict: submission.verdict,
    p_pros: [...submission.pros],
    p_cons: [...submission.cons],
    ...(Object.keys(points).length > 0
      ? { p_criterion_points: points as Record<string, never> }
      : {}),
    ...(submission.comment ? { p_comment: submission.comment } : {}),
    p_author_name: submission.authorName,
    ...(submission.variation ? { p_variation: submission.variation } : {}),
  });
  if (error) {
    return { ok: false, missing: isMissingRpcError(error), error };
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !('id' in data)
  ) {
    return { ok: false, missing: false, error: null };
  }
  return { ok: true, record: data as Record<string, unknown> };
}

/**
 * The form field a 22023 rejection names in its DETAIL ('pros.2',
 * 'criteria.battery', 'criterion_points.anc.cons.0'), in the form's own
 * field names (`criterion.<key>`, `points.<key>...`). Null for a detail the
 * form has no field for.
 */
export function reviewV2FieldFromRpcDetail(detail: unknown): string | null {
  if (typeof detail !== 'string') return null;
  const d = detail.trim();
  if (/^(verdict|pros|cons|criteria|comment)$/.test(d)) return d;
  if (/^(pros|cons)\.\d{1,2}$/.test(d)) return d;
  const criterion = /^criteria\.([a-z][a-z_]{1,31})$/.exec(d);
  if (criterion) return `criterion.${criterion[1]}`;
  const points =
    /^criterion_points(?:\.([a-z][a-z_]{1,31})(?:\.(pros|cons)(?:\.(\d{1,2}))?)?)?$/.exec(
      d
    );
  if (points) {
    // The form shows pros and cons lists only, so a whole entry (an unknown
    // key, a value that is no object) is marked on the criteria box.
    if (!points[1] || !points[2]) return 'criteria';
    return ['points', points[1], points[2], points[3]]
      .filter((part): part is string => Boolean(part))
      .join('.');
  }
  return null;
}
