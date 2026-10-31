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
  | { kind: 'no_content'; list: 'verdict' | 'pros' | 'cons'; index: number }
  | { kind: 'evasive_con'; index: number }
  | { kind: 'duplicate_point'; list: 'pros' | 'cons'; index: number }
  | { kind: 'pro_and_con'; index: number };

const EMPTY = '';
// Compatibility composition: fullwidth letters ("ＫＨÔＮＧ") fold to plain
// ones and Vietnamese letters stay whole.
const COMPOSED = 'NFKC';
// Compatibility decomposition, so diacritics split off as marks.
const DECOMPOSED = 'NFKD';

/**
 * The form two lines are compared in: lower case, no zero-width characters,
 * punctuation and symbols as spaces, spaces collapsed. Diacritics stay
 * ("sạc" and "sắc" differ, design 5.1). Only for comparing lines; what is
 * stored and shown keeps the writer's text.
 */
export function comparablePoint(text: string): string {
  const composed = String(text ?? EMPTY).normalize(COMPOSED);
  return composed
    .replace(/\p{Cf}+/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A compared line without diacritics, "đ" as "d": for spotting dodges. */
function plainPoint(text: string): string {
  const decomposed = comparablePoint(text).normalize(DECOMPOSED);
  return decomposed.replace(/\p{M}+/gu, '').replace(/đ/g, 'd');
}

/** Length in characters as the writer sees them (code points, composed). */
function visibleLength(text: string): number {
  const composed = String(text ?? EMPTY).normalize(COMPOSED);
  return [...composed.replace(/\p{Cf}+/gu, '').trim()].length;
}

/**
 * Whether a line has words in it: at least three letters or digits, and
 * not one character repeated ("aaaaa", "....", "🔥🔥🔥🔥🔥").
 */
function hasContent(text: string): boolean {
  const letters = comparablePoint(text).match(/[\p{L}\p{N}]/gu) ?? [];
  return letters.length >= 3 && new Set(letters).size >= 2;
}

// Each word of a dodge as typed with its diacritics or without any ("không" or
// "khong"), but never with other ones: "hỏng" (broken), "gập", "lời" and "ồn"
// are real words, not "hông", "gặp", "lỗi" and "ổn" typed loosely.
const anyOf = (words: readonly string[]): string =>
  `(?:${[...new Set(words.flatMap((word) => [word, plainPoint(word)]))].join('|')})`;

// A con that dodges the question: "không có", "chưa thấy ạ", "mình không thấy
// gì để chê", "Không có nhược điểm nào cả", "chả có gì", "khum có", "không chê
// được gì", "chưa gặp vấn đề gì", "không có ý kiến", "mọi thứ đều ổn", "none",
// "10/10". A real con, however small ("giá hơi cao", "không có jack 3.5mm",
// "chưa có gì nổi bật", "hỏng luôn"), never matches: the whole line must be
// the dodge.
const EVASIVE_CON = new RegExp(
  [
    `^(?:${anyOf(['hiện tại', 'tạm thời', 'đến giờ', 'vẫn', 'thì', 'thực sự', 'thật sự', 'mình', 'em', 'tôi', 'tui', 'anh', 'chị', 'e', 'm'])} )*`,
    anyOf([
      'không',
      'ko',
      'k',
      'kh',
      'khum',
      'chưa',
      'chẳng',
      'chả',
      'hok',
      'hông',
      'hem',
    ]),
    `(?: ${anyOf(['có', 'thấy', 'gặp', 'phát hiện', 'phát hiện ra', 'chê được', 'chê'])})*`,
    `(?: ${anyOf(['gì', 'j', 'nhược điểm', 'điểm trừ', 'khuyết điểm', 'điểm yếu', 'vấn đề', 'lỗi', 'điểm', 'ý kiến'])})*`,
    `(?:(?: ${anyOf(['để', 'mà', 'đáng', 'phải', 'cần'])})? ${anyOf(['chê', 'phàn nàn', 'nói', 'kể'])})?`,
    `(?: ${anyOf(['cả', 'hết', 'nào', 'luôn', 'ạ', 'nhé', 'nha', 'nhen', 'đâu'])})*$`,
    `|^(?:${anyOf(['mọi thứ', 'tất cả', 'all'])} (?:${anyOf(['đều'])} )?${anyOf(['ổn', 'tốt', 'ok', 'good', 'fine'])}`,
    `|${anyOf(['kcj', 'no', 'none', 'nothing', 'nothing to complain', 'nothing to complain about', 'no con', 'no cons', 'no complaint', 'no complaints', 'everything is fine', 'n a', '0', 'ok', 'ổn', 'tốt', 'rất tốt', 'tuyệt vời', 'hoàn hảo', 'perfect', '10 10', '5 sao'])})$`,
  ].join('')
);

/**
 * Whether a con line says only that there is no con. A dodge is short: a
 * line longer than a con may be is never one, which also keeps the check
 * linear on an oversized request.
 */
export function isEvasiveCon(text: string): boolean {
  const compared = comparablePoint(text);
  if (compared.length > REVIEW_POINT_MAX) return false;
  return !hasContent(text) || EVASIVE_CON.test(compared);
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
    const length = visibleLength(point);
    if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX)
      issues.push({ kind: 'point_length', list, index });
    else if (list === 'pros' && !hasContent(point))
      issues.push({ kind: 'no_content', list, index });
    const compared = comparablePoint(point);
    if (compared && seen.has(compared))
      issues.push({ kind: 'duplicate_point', list, index });
    seen.add(compared);
  });
}

function asLines(value: unknown): string[] {
  return Array.isArray(value) ? value.map((line) => String(line ?? '')) : [];
}

/**
 * What is wrong with a Rate review's text under D5 (design 4.2): verdict
 * length, the number and length of pros and cons, a line with no words, a
 * con that dodges, the same line twice in a list, and a line that is both a
 * pro and a con. Lengths count characters as the writer sees them, like
 * Postgres char_length. An empty result is a valid review; a malformed body
 * gives issues and never throws.
 */
export function validateReviewText(review: ReviewText): ReviewTextIssue[] {
  const issues: ReviewTextIssue[] = [];
  const verdict = String(review?.verdict ?? '');
  const pros = asLines(review?.pros);
  const cons = asLines(review?.cons);
  const verdictLength = visibleLength(verdict);
  if (verdictLength < REVIEW_VERDICT_MIN || verdictLength > REVIEW_VERDICT_MAX)
    issues.push({ kind: 'verdict_length', length: verdictLength });
  else if (!hasContent(verdict))
    issues.push({ kind: 'no_content', list: 'verdict', index: 0 });
  checkList('pros', pros, issues);
  checkList('cons', cons, issues);
  const proLines = new Set(pros.map(comparablePoint));
  cons.forEach((con, index) => {
    if (isEvasiveCon(con)) issues.push({ kind: 'evasive_con', index });
    else if (proLines.has(comparablePoint(con)))
      issues.push({ kind: 'pro_and_con', index });
  });
  return issues;
}
