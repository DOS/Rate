/**
 * Review form v2 (DOS/Rate#1544, design #1531 section 4): stars per category
 * criterion, a verdict, 1-5 pros and 1-5 cons, and optional pros and cons per
 * criterion. The form and the review API check a review with the same
 * function, so the API never trusts the browser and the browser shows the
 * API's errors on the same fields.
 *
 * The form stays off until DOS-Me ships `rate.submit_community_review` v2:
 * set NEXT_PUBLIC_RATE_REVIEW_FORM_V2=1 to turn it on.
 */
import {
  MAX_SKIPPED_CRITERIA,
  REVIEW_CRITERION_POINTS_MAX,
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
  REVIEW_POINTS_MAX,
  REVIEW_VERDICT_MAX,
  REVIEW_VERDICT_MIN,
  comparablePoint,
  getRatingCriteria,
  hasContent,
  isEvasiveCon,
  validateCriteriaRatings,
  validateReviewText,
  weightedReviewStar,
  type CriteriaRatings,
} from '@repo/shared-data/rules';

export const REVIEW_FORM_VERSION = 2;

/** Whether the v2 form and API path are on. Off unless the env says "1". */
export function isReviewFormV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 === '1';
}

export interface CriterionPoints {
  pros?: readonly string[];
  cons?: readonly string[];
}

export interface ReviewV2Input {
  criteriaRatings: CriteriaRatings;
  verdict: string;
  pros: readonly string[];
  cons: readonly string[];
  /** Pros and cons of one rated criterion, keyed by criterion. */
  criterionPoints?: Partial<Record<string, CriterionPoints>>;
}

/** Message keys in the `reviews` namespace, one per kind of error. */
export type ReviewV2MessageKey =
  | 'v2ErrCriterion'
  | 'v2ErrRequired'
  | 'v2ErrSkipped'
  | 'v2ErrVerdict'
  | 'v2ErrCount'
  | 'v2ErrLength'
  | 'v2ErrNoContent'
  | 'v2ErrEvasive'
  | 'v2ErrDuplicate'
  | 'v2ErrBoth';

/**
 * One error on one field. Fields: `criteria`, `criterion.<key>`, `verdict`,
 * `pros`, `pros.<i>`, `cons`, `cons.<i>`, `points.<key>`,
 * `points.<key>.pros`, `points.<key>.pros.<i>` (and the same for cons).
 */
export interface ReviewV2Error {
  field: string;
  key: ReviewV2MessageKey;
  values?: Record<string, number>;
}

const LINE = { min: REVIEW_POINT_MIN, max: REVIEW_POINT_MAX };
// Named once: gitleaks reads `key: 'v2ErrDuplicate'` as a generic API key.
const DUPLICATE_LINE: ReviewV2MessageKey = 'v2ErrDuplicate';

/** Length as the writer sees it, like review-form.ts and char_length. */
function lineLength(text: string): number {
  const composed = String(text ?? '').normalize('NFKC');
  return [...composed.replace(/\p{Cf}+/gu, '').trim()].length;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function criterionPointErrors(
  field: string,
  list: 'pros' | 'cons',
  lines: unknown,
  errors: ReviewV2Error[]
): void {
  if (lines == null) return;
  if (!Array.isArray(lines) || lines.length > REVIEW_CRITERION_POINTS_MAX) {
    errors.push({
      field: `${field}.${list}`,
      key: 'v2ErrCount',
      values: { max: REVIEW_CRITERION_POINTS_MAX },
    });
    return;
  }
  const seen = new Set<string>();
  lines.forEach((raw, index) => {
    const line = String(raw ?? '');
    const at = `${field}.${list}.${index}`;
    const length = lineLength(line);
    if (length < LINE.min || length > LINE.max)
      errors.push({ field: at, key: 'v2ErrLength', values: LINE });
    else if (list === 'cons' && isEvasiveCon(line))
      errors.push({ field: at, key: 'v2ErrEvasive' });
    else if (!hasContent(line))
      errors.push({ field: at, key: 'v2ErrNoContent' });
    const compared = comparablePoint(line);
    if (compared && seen.has(compared))
      errors.push({ field: at, key: DUPLICATE_LINE });
    seen.add(compared);
  });
}

/**
 * Everything wrong with a v2 review of a product in `categorySlug`, one entry
 * per field (design 4.1, 4.2). Empty when the review may be stored. A
 * malformed input gives errors and never throws.
 */
export function reviewV2Errors(
  categorySlug: string | null | undefined,
  input: ReviewV2Input
): ReviewV2Error[] {
  const errors: ReviewV2Error[] = [];
  const ratings: CriteriaRatings =
    input?.criteriaRatings && typeof input.criteriaRatings === 'object'
      ? input.criteriaRatings
      : {};

  for (const issue of validateCriteriaRatings(categorySlug, ratings)) {
    if (issue.kind === 'too_many_skipped')
      errors.push({
        field: 'criteria',
        key: 'v2ErrSkipped',
        values: { max: MAX_SKIPPED_CRITERIA },
      });
    else
      errors.push({
        field: `criterion.${issue.key}`,
        key:
          issue.kind === 'missing_required'
            ? 'v2ErrRequired'
            : 'v2ErrCriterion',
      });
  }

  for (const issue of validateReviewText({
    verdict: input?.verdict,
    pros: input?.pros,
    cons: input?.cons,
  } as Parameters<typeof validateReviewText>[0])) {
    switch (issue.kind) {
      case 'verdict_length':
        errors.push({
          field: 'verdict',
          key: 'v2ErrVerdict',
          values: { min: REVIEW_VERDICT_MIN, max: REVIEW_VERDICT_MAX },
        });
        break;
      case 'points_count':
        errors.push({
          field: issue.list,
          key: 'v2ErrCount',
          values: { max: REVIEW_POINTS_MAX },
        });
        break;
      case 'point_length':
        errors.push({
          field: `${issue.list}.${issue.index}`,
          key: 'v2ErrLength',
          values: LINE,
        });
        break;
      case 'no_content':
        errors.push({
          field:
            issue.list === 'verdict'
              ? 'verdict'
              : `${issue.list}.${issue.index}`,
          key: 'v2ErrNoContent',
        });
        break;
      case 'evasive_con':
        errors.push({ field: `cons.${issue.index}`, key: 'v2ErrEvasive' });
        break;
      case 'duplicate_point':
        errors.push({
          field: `${issue.list}.${issue.index}`,
          key: DUPLICATE_LINE,
        });
        break;
      case 'pro_and_con':
        errors.push({ field: `cons.${issue.index}`, key: 'v2ErrBoth' });
        break;
    }
  }

  const points = input?.criterionPoints;
  if (points && typeof points === 'object') {
    const known = new Set<string>(
      getRatingCriteria(categorySlug).map((c) => c.key)
    );
    for (const key of Object.keys(points)) {
      const field = `points.${key}`;
      // Pros and cons go only on a criterion the writer rated.
      if (!known.has(key) || !hasOwn(ratings, key) || ratings[key] == null) {
        errors.push({ field, key: 'v2ErrCriterion' });
        continue;
      }
      const entry = points[key];
      if (!entry || typeof entry !== 'object') {
        errors.push({ field, key: 'v2ErrCriterion' });
        continue;
      }
      const pros = Array.isArray(entry.pros) ? entry.pros : [];
      const cons = Array.isArray(entry.cons) ? entry.cons : [];
      // A criterion entry carries 1 to 3 lines; an empty one is not sent.
      if (pros.length + cons.length === 0) {
        errors.push({
          field,
          key: 'v2ErrCount',
          values: { max: REVIEW_CRITERION_POINTS_MAX },
        });
        continue;
      }
      criterionPointErrors(field, 'pros', entry.pros, errors);
      criterionPointErrors(field, 'cons', entry.cons, errors);
      const proLines = new Set(pros.map((p) => comparablePoint(String(p))));
      cons.forEach((con, index) => {
        const compared = comparablePoint(String(con));
        if (compared && proLines.has(compared))
          errors.push({ field: `${field}.cons.${index}`, key: 'v2ErrBoth' });
      });
    }
  }
  return errors;
}

/** The review star the server stores: weighted criteria at 0.1, or null. */
export function reviewV2Star(
  categorySlug: string | null | undefined,
  criteriaRatings: CriteriaRatings
): number | null {
  return weightedReviewStar(categorySlug, criteriaRatings);
}

/** What the form keeps while the writer types (and in the browser draft). */
export interface ReviewV2Draft {
  /** A star, null for "Chưa dùng tới", no key while not rated yet. */
  ratings: Record<string, number | null>;
  verdict: string;
  pros: string[];
  cons: string[];
  points: Record<string, { pros: string[]; cons: string[] }>;
  comment: string;
}

export function emptyReviewV2Draft(): ReviewV2Draft {
  return {
    ratings: {},
    verdict: '',
    pros: [''],
    cons: [''],
    points: {},
    comment: '',
  };
}

const trimmedLines = (lines: readonly string[]): string[] =>
  lines.map((line) => String(line ?? '').trim()).filter(Boolean);

/**
 * The checked part of a draft: blank lines dropped, and pros and cons of a
 * criterion only while it is rated and has a line.
 */
export function reviewV2InputFromDraft(draft: ReviewV2Draft): ReviewV2Input {
  const criteriaRatings: CriteriaRatings = {};
  for (const [key, star] of Object.entries(draft.ratings ?? {}))
    if (star != null) criteriaRatings[key] = star;
  const criterionPoints: Record<string, { pros: string[]; cons: string[] }> =
    {};
  for (const [key, entry] of Object.entries(draft.points ?? {})) {
    if (criteriaRatings[key] == null) continue;
    const pros = trimmedLines(entry?.pros ?? []);
    const cons = trimmedLines(entry?.cons ?? []);
    if (pros.length || cons.length) criterionPoints[key] = { pros, cons };
  }
  return {
    criteriaRatings,
    verdict: String(draft.verdict ?? '').trim(),
    pros: trimmedLines(draft.pros ?? []),
    cons: trimmedLines(draft.cons ?? []),
    ...(Object.keys(criterionPoints).length ? { criterionPoints } : {}),
  };
}

/**
 * A draft read back from browser storage, or null when it is not one: the
 * stored text is the writer's own, but a broken entry must not break the form.
 */
export function parseReviewV2Draft(raw: string | null): ReviewV2Draft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReviewV2Draft> | null;
    if (!value || typeof value !== 'object') return null;
    const lines = (v: unknown, fallback: string[]): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string').slice(0, 10)
        : fallback;
    const ratings: Record<string, number | null> = {};
    if (value.ratings && typeof value.ratings === 'object')
      for (const [k, v] of Object.entries(value.ratings))
        if (
          v === null ||
          (typeof v === 'number' && v >= 1 && v <= 5 && Number.isInteger(v * 2))
        )
          ratings[k] = v;
    const points: ReviewV2Draft['points'] = {};
    if (value.points && typeof value.points === 'object')
      for (const [k, v] of Object.entries(value.points))
        if (v && typeof v === 'object')
          points[k] = { pros: lines(v.pros, []), cons: lines(v.cons, []) };
    return {
      ratings,
      verdict: typeof value.verdict === 'string' ? value.verdict : '',
      pros: lines(value.pros, ['']),
      cons: lines(value.cons, ['']),
      points,
      comment: typeof value.comment === 'string' ? value.comment : '',
    };
  } catch {
    return null;
  }
}

export const REVIEW_V2_DRAFT_PREFIX = 'rate_review_draft_v2_';
