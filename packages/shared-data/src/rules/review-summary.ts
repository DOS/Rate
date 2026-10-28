/**
 * Free-text review summaries written by the LLM pass of the review analyzer
 * (DOS/Rate#1244). Such a summary covers one listing's latest batch, not the
 * product, so:
 * - it is stored and shown after a fixed scope prefix, and
 * - a summary that quotes a score, a star rating, a percentage or a count is
 *   never stored or shown: those are batch numbers, not the product's.
 * Shared by the importer (before storing) and the web reader (for rows stored
 * before this rule, which are not rewritten).
 */

/** The scope every free-text summary is stored and shown with. */
const LLM_REVIEW_SUMMARY_PREFIX =
  'Theo các đánh giá của một nơi bán trong lần phân tích gần nhất: ';

const MAX_LLM_REVIEW_SUMMARY_LENGTH = 600;

// A number next to a score, rating, share or count unit (vi and en).
const NUMBER_CLAIM =
  /\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|%|★|⭐|☆|sao\b|điểm|stars?\b|points?\b|pts?\b|đánh\s*giá|bình\s*luận|nhận\s*xét|lượt|người|reviews?\b|ratings?\b|comments?\b|buyers?\b|users?\b)/iu;
// Score words that quote the analyzer's or the platform's numbers.
const SCORE_WORDS =
  /jreviews|bayes|trọng\s*số|weighted|điểm\s*(?:số|trung\s*bình|tổng|đánh\s*giá|chấm)|average\s*rating|rating\s*score|overall\s*score/iu;
// "4.8/5", "4,8 trên 5".
const OUT_OF = /\d+(?:[.,]\d+)?\s*(?:trên|out\s*of)\s*\d+/iu;

/** True when the text quotes a score, rating, share or count. */
function hasReviewScoreClaim(text: string): boolean {
  if (typeof text !== 'string') return false;
  const normalized = text.normalize('NFC');
  return (
    NUMBER_CLAIM.test(normalized) ||
    SCORE_WORDS.test(normalized) ||
    OUT_OF.test(normalized)
  );
}

function cleanSummaryText(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .slice(0, MAX_LLM_REVIEW_SUMMARY_LENGTH * 2)
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

/** True when the text already carries the scope prefix. */
function isScopedLlmReviewSummary(text: unknown): boolean {
  return (
    typeof text === 'string' &&
    text
      .normalize('NFC')
      .trimStart()
      .startsWith(LLM_REVIEW_SUMMARY_PREFIX.trim())
  );
}

/**
 * The free-text summary as it may be stored or shown: the scope prefix plus
 * the text, or null when the text is empty or quotes a score or count.
 * Already-scoped text is not prefixed twice.
 */
function scopeLlmReviewSummary(text: unknown): string | null {
  let body = cleanSummaryText(text);
  if (isScopedLlmReviewSummary(body)) {
    body = body.slice(LLM_REVIEW_SUMMARY_PREFIX.trim().length).trim();
  }
  if (!body || hasReviewScoreClaim(body)) return null;
  const room = MAX_LLM_REVIEW_SUMMARY_LENGTH - LLM_REVIEW_SUMMARY_PREFIX.length;
  const clipped =
    body.length > room ? `${body.slice(0, room - 1).trimEnd()}…` : body;
  return `${LLM_REVIEW_SUMMARY_PREFIX}${clipped}`;
}

// One export list: the rules test reads quoted text in export statements as import paths.
export {
  LLM_REVIEW_SUMMARY_PREFIX,
  hasReviewScoreClaim,
  isScopedLlmReviewSummary,
  scopeLlmReviewSummary,
};
