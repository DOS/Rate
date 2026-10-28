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

// A number next to a score, rating or count unit (vi and en). Spec numbers
// (5000mAh, 65W, 120Hz), durations and "điểm cộng/trừ" (pros/cons) are not.
const NUMBER_THEN_UNIT =
  /\d+(?:[.,]\d+)?\s*(?:★|⭐|🌟|☆|sao\b(?!\s*(?:lưu|chép))|điểm(?!\s*(?:cộng|trừ|ảnh|chết|sáng|yếu|mạnh|nhấn|đáng|nổi|nóng|đen|lỗi))|stars?\b|points?\b|pts?\b|(?:bài\s*)?đánh\s*giá|bình\s*luận|nhận\s*xét|phản\s*hồi|lượt\s*(?:đánh\s*giá|mua|bán)|người\s*(?:mua|dùng|đánh\s*giá|khen|chê|phàn\s*nàn|hài\s*lòng|cho|nói|thấy|đều)|khách|reviews?\b|ratings?\b|comments?\b|feedbacks?\b|buyers?\b|customers?\b|users?\b|reviewers?\b)/iu;
// A score word followed by a number: "điểm 4,8", "đánh giá trung bình 4.8", "rated 4.7".
const UNIT_THEN_NUMBER =
  /(?:điểm(?!\s*(?:cộng|trừ|ảnh|chết|sáng|yếu|mạnh|nhấn|đáng|nổi|nóng|đen|lỗi))|đánh\s*giá(?:\s*trung\s*bình)?|rated|rating|score|average)\s*(?:là|đạt|of|is|:)?\s*\d+(?:[.,]\d+)?/iu;
// A share of buyers: "90% người mua", "80 phần trăm các khách hàng", "90% khen".
// A percentage elsewhere in a sentence about buyers (battery 90%) is not one.
const SHARE =
  /\d+(?:[.,]\d+)?\s*(?:%|phần\s*trăm|percent)\s*(?:of\s*)?(?:the\s*|các\s*|số\s*)?(?:khen|chê|hài\s*lòng|phàn\s*nàn|praise|complain|recommend|satisf|người|khách|buyers?|customers?|users?|reviewers?|reviews?|đánh\s*giá)/iu;
// Star ratings in words: "năm sao", "five stars".
const WORD_STARS =
  /(?:một|hai|ba|bốn|năm|one|two|three|four|five)\s*(?:sao\b(?!\s*(?:lưu|chép))|stars?\b)/iu;
// Counts in words: "hơn trăm người", "hàng nghìn đánh giá", "hundreds of buyers".
const WORD_COUNT =
  /(?:chục|trăm|nghìn|ngàn|dozens?|hundreds?|thousands?)\s*(?:of\s*)?(?:người|khách|lượt|bài|đánh\s*giá|bình\s*luận|phản\s*hồi|reviews?\b|buyers?\b|customers?\b|users?\b)/iu;
// Score words that quote the analyzer's or the platform's numbers.
const SCORE_WORDS =
  /jreviews|bayes|trọng\s*số|weighted|điểm\s*(?:số|trung\s*bình|tổng|đánh\s*giá|chấm)|average\s*rating|rating\s*score|overall\s*score/iu;
// "4.8/5", "đạt 9/10", "85/100 điểm": a fraction is a score only with a decimal
// numerator, a score word before it or a score unit after it, so dates (5/10)
// and durations (3/5 ngày) are not.
const FRACTION = String.raw`\d{1,3}(?:[.,]\d+)?\s*\/\s*(?:5|10|100)(?![\d/])`;
const SLASH_SCORE = new RegExp(
  String.raw`(?<![\d.,/])\d[.,]\d+\s*\/\s*(?:5|10)(?![\d/])` +
    String.raw`|(?:đạt|chấm|cho|điểm|đánh\s*giá|rating|rated|score[ds]?)\s*(?:là|:)?\s*(?<![\d.,/])` +
    FRACTION +
    String.raw`|(?<![\d.,/])` +
    FRACTION +
    String.raw`\s*(?:sao|điểm|★|⭐|🌟|stars?|points?)`,
  'iu'
);
// "4,8 trên 5".
const OUT_OF = /\d+(?:[.,]\d+)?\s*(?:trên|out\s*of)\s*(?:5|10|100)\b/iu;

/** True when the text quotes a score, rating, share or count. */
function hasReviewScoreClaim(text: string): boolean {
  if (typeof text !== 'string') return false;
  // NFKC folds full-width digits and symbols; format characters are invisible.
  const normalized = text.normalize('NFKC').replace(/\p{Cf}+/gu, '');
  return (
    NUMBER_THEN_UNIT.test(normalized) ||
    UNIT_THEN_NUMBER.test(normalized) ||
    SLASH_SCORE.test(normalized) ||
    SHARE.test(normalized) ||
    WORD_STARS.test(normalized) ||
    WORD_COUNT.test(normalized) ||
    SCORE_WORDS.test(normalized) ||
    OUT_OF.test(normalized)
  );
}

/** The longest prefix of `text` within `maxUnits` UTF-16 units, on a code point boundary. */
function clipCodePoints(text: string, maxUnits: number): string {
  let out = '';
  for (const ch of text) {
    if (out.length + ch.length > maxUnits) break;
    out += ch;
  }
  return out;
}

// A surrogate half without its pair, as left by a UTF-16 cut upstream.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function cleanSummaryText(text: unknown): string {
  if (typeof text !== 'string') return '';
  return clipCodePoints(text, MAX_LLM_REVIEW_SUMMARY_LENGTH * 2)
    .replace(LONE_SURROGATE, '')
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
  // Every leading copy of the prefix goes; one is added back.
  while (isScopedLlmReviewSummary(body)) {
    body = body.slice(LLM_REVIEW_SUMMARY_PREFIX.trim().length).trim();
  }
  if (!body || hasReviewScoreClaim(body)) return null;
  const room = MAX_LLM_REVIEW_SUMMARY_LENGTH - LLM_REVIEW_SUMMARY_PREFIX.length;
  // Cut on code points, so no lone surrogate is left at the end.
  const clipped =
    body.length > room ? `${clipCodePoints(body, room - 1).trimEnd()}…` : body;
  return `${LLM_REVIEW_SUMMARY_PREFIX}${clipped}`;
}

// One export list: the rules test reads quoted text in export statements as import paths.
export {
  LLM_REVIEW_SUMMARY_PREFIX,
  hasReviewScoreClaim,
  isScopedLlmReviewSummary,
  scopeLlmReviewSummary,
};
