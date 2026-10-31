/**
 * The text a Rate review must carry (DOS/Rate#1542, design #1531, D5): a
 * verdict, at least one pro and at least one con. The web form, the review
 * API and the importer's checks share these rules, so a review rejected in
 * one place is rejected everywhere. Plain data and functions only.
 */

export const REVIEW_VERDICT_MIN = 20;
export const REVIEW_VERDICT_MAX = 300;
export const REVIEW_POINT_MIN = 5;
export const REVIEW_POINT_MAX = 150;
/** Pros and cons each: at least one, at most five. */
export const REVIEW_POINTS_MAX = 5;
/** Pros and cons of one criterion: at most three each, none required. */
export const REVIEW_CRITERION_POINTS_MAX = 3;

export interface ReviewText {
  verdict: string;
  pros: readonly string[];
  cons: readonly string[];
}

export type ReviewTextIssue =
  | { kind: 'verdict_length'; length: number }
  | { kind: 'points_count'; list: 'pros' | 'cons'; count: number }
  | { kind: 'point_length'; list: 'pros' | 'cons'; index: number }
  | { kind: 'evasive_con'; index: number }
  | { kind: 'duplicate_point'; list: 'pros' | 'cons'; index: number }
  | { kind: 'pro_and_con'; index: number };

// Canonical decomposition, so diacritics split off as marks.
const DECOMPOSED = 'NFD';

/**
 * The form a line is compared in: lower case, no diacritics, "đ" as "d",
 * punctuation as spaces and spaces collapsed. Only for comparing lines;
 * what is stored and shown keeps the writer's text.
 */
export function comparablePoint(text: string): string {
  const decomposed = text.normalize(DECOMPOSED);
  return decomposed
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A con that dodges the question ("không có", "chưa thấy", "không có gì để
// chê", "ko co", "none"), compared without diacritics. A real con, however
// small ("giá hơi cao"), never matches: the whole line must be the dodge.
const EVASIVE_CON =
  /^(?:(?:hien\s+tai|tam\s+thoi|den\s+gio|van)\s+)?(?:khong|ko|k|chua|chang|hok|hong)(?:\s+(?:co|thay|gap|phat\s+hien))?(?:\s+(?:gi|j|nhuoc\s+diem|diem\s+tru))?(?:\s+(?:de|ma)\s+che)?(?:\s+(?:ca|het|nao|luon))?$|^(?:none|nothing|no\s+cons?|n\s*a|0|ok|tot|hoan\s+hao|perfect)$/;

/** Whether a con line says only that there is no con. */
export function isEvasiveCon(text: string): boolean {
  const plain = comparablePoint(text);
  return plain.length === 0 || EVASIVE_CON.test(plain);
}

function checkList(
  list: 'pros' | 'cons',
  points: readonly string[],
  issues: ReviewTextIssue[]
): void {
  if (points.length < 1 || points.length > REVIEW_POINTS_MAX)
    issues.push({ kind: 'points_count', list, count: points.length });
  const seen = new Set<string>();
  points.forEach((point, index) => {
    const length = point.trim().length;
    if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX)
      issues.push({ kind: 'point_length', list, index });
    const plain = comparablePoint(point);
    if (plain && seen.has(plain))
      issues.push({ kind: 'duplicate_point', list, index });
    seen.add(plain);
  });
}

/**
 * What is wrong with a Rate review's text under D5 (design 4.2): verdict
 * length, the number and length of pros and cons, a con that dodges, the
 * same line twice in a list, and a line that is both a pro and a con. An
 * empty result is a valid review.
 */
export function validateReviewText(review: ReviewText): ReviewTextIssue[] {
  const issues: ReviewTextIssue[] = [];
  const verdictLength = review.verdict.trim().length;
  if (verdictLength < REVIEW_VERDICT_MIN || verdictLength > REVIEW_VERDICT_MAX)
    issues.push({ kind: 'verdict_length', length: verdictLength });
  checkList('pros', review.pros, issues);
  checkList('cons', review.cons, issues);
  const pros = new Set(review.pros.map(comparablePoint));
  review.cons.forEach((con, index) => {
    if (isEvasiveCon(con)) issues.push({ kind: 'evasive_con', index });
    else if (pros.has(comparablePoint(con)))
      issues.push({ kind: 'pro_and_con', index });
  });
  return issues;
}
