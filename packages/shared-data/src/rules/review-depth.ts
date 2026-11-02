/**
 * Axis C of the review trust model (`Docs/Platform/review-trust-model.html`):
 * how deep a review's text goes, from no text to expert depth
 * (DOS/Rate#1581). It feeds the web's trust weight and the review value
 * score's specificity and completeness gate (`review-value.ts`), so the web,
 * the importer and the scoring job classify a review the same way.
 *
 * The text is the whole review: the comment, the verdict and the writer's
 * pros and cons, whole-review and per-criterion. A form v2 review often has no
 * comment, and read alone it would count as stars only.
 *
 * Padding does not count toward the length thresholds: a clause said again
 * and a word or phrase repeated three times or more in a row are left out of
 * the length, so "pin ok" repeated to 240 characters stays low effort
 * (design #1531, 6.4). A text without repeats is measured exactly as before.
 */

/** Axis C's levels, from no text to expert depth. */
export type ReviewDepth =
  | 'stars_only'
  | 'platform_label'
  | 'filler'
  | 'low_effort'
  | 'specific_short'
  | 'detailed'
  | 'expert_depth';

/** A product aspect a review can talk about; depth needs one. */
export const REVIEW_PRODUCT_ASPECT_RE =
  /(?:\bpin\b|sạc|mah|màn(?:\s*hình)?|tần\s*số\s*quét|nit|hiển\s*thị|cam(?:era)?(?!\s*kết)|chụp|quay\s*video|zoom|loa|mic|chất\s*âm|chống\s*ồn|bass|treble|hiệu\s*năng|chip|mượt|lag|giật|nóng|nhiệt\s*độ|fps|game|thiết\s*kế|cầm\s*nắm|vân\s*tay|face\s*id|wifi|5g|bluetooth|phím|bàn\s*phím|touchpad)/i;

/** A measurement or a benchmark: expert depth on its own. */
export const REVIEW_TECH_MEASURE_RE =
  /(?:\b\d+\s*(?:mah|wh|w|hz|nit|nits|fps|gb|tb|mp|mm|gram|g|db|ms|°c|độ\s*c)\b|geekbench|antutu|3dmark|cinebench|pcmag|gsmarena|phonearena)/i;

/** A marketplace's canned satisfaction label, the whole text. */
export const REVIEW_PLATFORM_LABEL_RE =
  /^(?:cực\s*k[ìỳ]\s*hài\s*lòng|rất\s*hài\s*lòng|hài\s*lòng|bình\s*thường|không\s*hài\s*lòng|rất\s*không\s*hài\s*lòng|tuyệt\s*vời|tốt|khá|tệ|rất\s*tệ)$/iu;

/** Length thresholds, in characters, for a text that names the product. */
export const REVIEW_DEPTH_LENGTH = {
  specificShort: 30,
  detailed: 90,
  expert: 240,
} as const;

/** A run of the same word or phrase this long or longer is padding. */
const PADDING_RUN = 3;
/** Parts of the review's text, one per line. */
const PART_SEPARATOR = '\n';
/** The longest phrase, in words, that a padding run repeats. */
const PADDING_PHRASE_WORDS = 4;

export interface ReviewDepthInput {
  comment?: unknown;
  /** The review's own verdict line (form v2), not the analyzer's verdict. */
  verdict?: unknown;
  /**
   * The writer's pros and cons, whole-review and per-criterion. A line
   * extracted by AI from a marketplace comment (`method: 'ai'`) is that
   * comment again and is left out.
   */
  points?: readonly unknown[];
  reviewerType?: unknown;
  /** `rate.reviews.flag_category`: 'low_value_coin_spam' is filler. */
  flagCategory?: unknown;
}

// The rules import check reads a quote after `export` as a module path, so
// the exported functions start with these helpers.
function asInput(input: unknown): ReviewDepthInput {
  return input && typeof input === 'object' ? (input as ReviewDepthInput) : {};
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

function pointText(point: unknown): string {
  if (typeof point === 'string') return text(point);
  if (!point || typeof point !== 'object') return '';
  const p = point as { body?: unknown; method?: unknown };
  return p.method === 'ai' ? '' : text(p.body);
}

/** The review's whole text, one part per line, in a fixed order. */
export function reviewDepthText(input: ReviewDepthInput): string {
  return reviewParts(asInput(input)).join(PART_SEPARATOR);
}

function reviewParts(safe: ReviewDepthInput): string[] {
  const points = Array.isArray(safe.points) ? safe.points : [];
  return [
    text(safe.comment),
    text(safe.verdict),
    ...points.map(pointText),
  ].filter((part) => part.length > 0);
}

const words = (clause: string): string[] =>
  clause.toLocaleLowerCase('vi').split(/\s+/u).filter(Boolean);

/**
 * Characters of `text` that are padding: a clause said again (compared in
 * lower case, by its words), and the extra copies in a run of the same word
 * or phrase repeated PADDING_RUN times or more. A repeated clause counts
 * with its punctuation, a repeated word or phrase with one space.
 */
export function reviewPaddingLength(textValue: string): number {
  if (!isText(textValue) || textValue.length === 0) return 0;
  let padding = 0;
  const seen = new Set<string>();
  // Each clause with the punctuation and spaces after it.
  for (const [whole, clause = ''] of textValue.matchAll(
    /([^.!?;,\n]*)([.!?;,\n]+\s*|$)/gu
  )) {
    const tokens = words(clause);
    if (tokens.length === 0) continue;
    const key = tokens.join(' ');
    if (seen.has(key)) {
      padding += whole.length;
      continue;
    }
    seen.add(key);
    // A run of one phrase, repeated back to back: its copies past the first
    // are padding.
    let i = 0;
    while (i < tokens.length) {
      let best = { size: 0, copies: 1 };
      for (let size = 1; size <= PADDING_PHRASE_WORDS; size++) {
        let copies = 1;
        while (
          i + (copies + 1) * size <= tokens.length &&
          tokens.slice(i + copies * size, i + (copies + 1) * size).join(' ') ===
            tokens.slice(i, i + size).join(' ')
        ) {
          copies++;
        }
        if (copies >= PADDING_RUN && copies * size > best.copies * best.size) {
          best = { size, copies };
        }
      }
      if (best.size > 0) {
        const phrase = tokens.slice(i, i + best.size).join(' ');
        padding += (best.copies - 1) * (phrase.length + 1);
        i += best.copies * best.size;
      } else {
        i++;
      }
    }
  }
  return padding;
}

/**
 * Axis C for a review's whole text. For a comment alone, with no repeats,
 * this is the web's classification before DOS/Rate#1581.
 */
export function reviewDepth(input: ReviewDepthInput): ReviewDepth {
  const safe = asInput(input);
  const parts = reviewParts(safe);
  const cleanText = parts
    .join(PART_SEPARATOR)
    .replace(/[\s.!,]+$/u, '')
    .trim();
  if (cleanText.length === 0) return 'stars_only';
  if (REVIEW_PLATFORM_LABEL_RE.test(cleanText)) return 'platform_label';
  if (safe.flagCategory === 'low_value_coin_spam') return 'filler';
  // Each part is matched alone: a number ending one part and a unit starting
  // the next ("Đặt 2" and "gọn nhẹ") are not a measurement.
  const hasProduct = parts.some((part) => REVIEW_PRODUCT_ASPECT_RE.test(part));
  const length = cleanText.length - reviewPaddingLength(cleanText);
  if (
    safe.reviewerType === 'expert' ||
    parts.some((part) => REVIEW_TECH_MEASURE_RE.test(part)) ||
    (length >= REVIEW_DEPTH_LENGTH.expert && hasProduct)
  ) {
    return 'expert_depth';
  }
  if (length >= REVIEW_DEPTH_LENGTH.detailed && hasProduct) return 'detailed';
  if (hasProduct && length >= REVIEW_DEPTH_LENGTH.specificShort) {
    return 'specific_short';
  }
  return 'low_effort';
}
