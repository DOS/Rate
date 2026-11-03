/**
 * The prompt, output schema and checks of the review AI points job
 * (DOS/Rate#1531, Docs/Proposals/2026-11-03-ai-review-points.html).
 *
 * Plain functions only: no client, no network. The job
 * (jobs/review-ai-points.ts) decides which reviews to send, sends them through
 * the Batch API and stores what passes these checks through
 * rate.store_review_ai_points, which checks the same limits again.
 *
 * What a model sees: the category's criteria (key, Vietnamese label, a line of
 * explanation), the rules and a few made-up examples, then up to
 * REVIEWS_PER_REQUEST review texts with a temporary ref each. Never a name, a
 * user id, an order id or a link the job could leave out.
 */
import { createHash } from 'node:crypto';
import {
  comparablePoint,
  getRatingCriteria,
  hasRatingCriteria,
  isEvasiveCon,
  hasContent,
  storedPoint,
  RATING_CRITERIA_VERSION,
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
} from '@repo/shared-data/rules';

/** Bump on any change to the instructions, examples or schema (design 4). */
export const REVIEW_AI_PROMPT_VERSION = 'v1';
export { RATING_CRITERIA_VERSION };

/** Reviews per request: one category, one cached instruction block. */
export const REVIEWS_PER_REQUEST = 20;
/** Lines per side per review (design 2.2). */
export const AI_POINTS_PER_KIND = 3;
/** Output tokens per request: 20 reviews x ~120 tokens, with room for low-effort thinking. */
export const REQUEST_MAX_TOKENS = 6000;
/** Evidence length, in characters as stored (the writer takes 2 to 300). */
export const EVIDENCE_MAX = 300;

/** Text length a review needs (D3): characters and words, without emoji and repeats. */
export const REVIEW_AI_MIN_CHARS = 40;
export const REVIEW_AI_MIN_WORDS = 8;

/** Models the job may use (D1) and their list prices in USD per million tokens. */
export const REVIEW_AI_MODELS = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, monthlyCapUsd: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, monthlyCapUsd: 15 },
} as const;
export type ReviewAiModel = keyof typeof REVIEW_AI_MODELS;
export const DEFAULT_REVIEW_AI_MODEL: ReviewAiModel = 'claude-haiku-5-5';
/** The Batch API halves every token price. */
export const BATCH_DISCOUNT = 0.5;
/** Cache reads cost 0.1x the input price; cache writes 1.25x. */
export const CACHE_READ_FACTOR = 0.1;
export const CACHE_WRITE_FACTOR = 1.25;

export function isReviewAiModel(value: unknown): value is ReviewAiModel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REVIEW_AI_MODELS, value);
}

/** Categories the job extracts for: a criteria list, and not services (design 1). */
export function aiCategoryOpen(slug: string | null | undefined): slug is string {
  return typeof slug === 'string' && slug !== 'services' && hasRatingCriteria(slug);
}

/** The text hash the writer compares: sha256 hex of the comment in NFC. */
export function reviewTextHash(text: string): string {
  return createHash('sha256').update(text.normalize('NFC'), 'utf8').digest('hex');
}

// Pictographs and flag letters, then the joiners and selectors they leave behind.
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** The text without emoji, a character repeated three times or more kept once. */
export function substantiveText(text: string): string {
  return text
    .normalize('NFC')
    .replace(EMOJI, ' ')
    .replace(/(.)\1{2,}/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

// Vietnamese letters with diacritics, and common words written without them.
const VI_LETTERS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;
const VI_WORDS =
  /\b(?:khong|ko|rat|dung|may|pin|hang|tot|nhung|duoc|cung|minh|mua|giao|nhanh|dep|man hinh|sac|ok lam|chay|muot|nong|lag)\b/iu;
const EN_WORDS =
  /\b(?:the|and|is|it|very|good|great|battery|phone|screen|not|but|works|quality|fast|slow)\b/iu;

/** 'vi', 'en' or null, without a model call (D3). */
export function reviewLanguage(text: string): 'vi' | 'en' | null {
  if (VI_LETTERS.test(text)) return 'vi';
  // Letters outside Latin (Chinese, Thai...): another language.
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\s]/u.test(text.replace(EMOJI, ''))) return null;
  if (VI_WORDS.test(text)) return 'vi';
  if (EN_WORDS.test(text)) return 'en';
  return null;
}

/** Whether a text is long enough and in a language the job reads (D3). */
export function textQualifies(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  const plain = substantiveText(text);
  const words = plain.split(' ').filter(w => /[\p{L}\p{N}]/u.test(w));
  return (
    [...plain].length >= REVIEW_AI_MIN_CHARS &&
    words.length >= REVIEW_AI_MIN_WORDS &&
    reviewLanguage(plain) !== null
  );
}

// One line of explanation per criterion, so the model knows what each key covers.
const CRITERION_HINTS: Readonly<Record<string, string>> = {
  performance: 'tốc độ, độ mượt, lag, giật, chơi game, đa nhiệm',
  camera: 'ảnh, video, chụp đêm, zoom, camera trước',
  battery: 'thời lượng pin, tốc độ sạc, hao pin, nóng khi sạc',
  display: 'độ sáng, màu, nhìn ngoài nắng, tần số quét, kích thước màn',
  design: 'ngoại hình, chất liệu, cầm nắm, trọng lượng, độ bền, chống nước',
  value: 'đáng tiền hay không so với giá',
  sound: 'loa, âm lượng, chất âm khi xem phim nghe nhạc',
  software: 'hệ điều hành, ứng dụng, bút, bàn phím rời, phụ kiện',
  keyboard: 'bàn phím, hành trình phím, đèn phím, touchpad',
  thermals: 'nóng, quạt, độ ồn khi tải nặng',
  health: 'đo nhịp tim, giấc ngủ, SpO2, bước chân, độ chính xác',
  apps: 'ứng dụng, thông báo, kết nối điện thoại, GPS, NFC',
  anc: 'chống ồn chủ động, chế độ xuyên âm',
  comfort: 'đeo lâu có đau không, vừa tai, chắc chắn',
  calls: 'micro, gọi điện, người nghe có rõ không',
};

const EXAMPLES = `Ví dụ (minh hoạ, không phải review thật):
Review ref 1: "pin xài cả ngày vẫn còn 30%, mà ra nắng hơi khó nhìn. shop giao nhanh"
Kết quả: {"ref": 1, "points": [
  {"kind": "pro", "criterion_key": "battery", "body": "Pin dùng hết ngày vẫn còn dư", "evidence": "pin xài cả ngày vẫn còn 30%"},
  {"kind": "con", "criterion_key": "display", "body": "Màn hình hơi khó nhìn ngoài nắng", "evidence": "ra nắng hơi khó nhìn"}]}
(Không lấy "shop giao nhanh": đó là chuyện của người bán.)
Review ref 2: "hàng đẹp lắm, đóng gói cẩn thận, 5 sao cho shop, sẽ ủng hộ tiếp nha mọi người"
Kết quả: {"ref": 2, "points": []}
Review ref 3: "máy chạy mượt, chơi liên quân không giật, nhưng sạc lâu quá, gần 2 tiếng mới đầy"
Kết quả: {"ref": 3, "points": [
  {"kind": "pro", "criterion_key": "performance", "body": "Chơi game mượt, không giật", "evidence": "chơi liên quân không giật"},
  {"kind": "con", "criterion_key": "battery", "body": "Sạc đầy mất gần 2 tiếng", "evidence": "sạc lâu quá, gần 2 tiếng mới đầy"}]}
Review ref 4: "good phone for the price, camera is decent but the speaker is quiet"
Kết quả: {"ref": 4, "points": [
  {"kind": "pro", "criterion_key": "value", "body": "Đáng tiền so với giá", "evidence": "good phone for the price"},
  {"kind": "pro", "criterion_key": "camera", "body": "Camera ở mức khá", "evidence": "camera is decent"},
  {"kind": "con", "criterion_key": null, "body": "Loa nhỏ", "evidence": "the speaker is quiet"}]}`;

/** The cached instruction block of a category (design 2.1). */
export function reviewAiInstructions(categorySlug: string): string {
  const criteria = getRatingCriteria(categorySlug)
    .map(
      c =>
        `- ${c.key}: ${c.label.vi}${CRITERION_HINTS[c.key] ? ` (${CRITERION_HINTS[c.key]})` : ''}`
    )
    .join('\n');
  return `Bạn đọc review sản phẩm do người mua viết trên sàn thương mại điện tử và rút ra ưu điểm, nhược điểm của chính sản phẩm.

Tiêu chí của ngành hàng này (criterion_key: tên):
${criteria}

Luật:
1. Chỉ lấy điều review nói ra. Không suy ra từ số sao, không đoán, không thêm ý.
2. Mỗi review tối đa ${AI_POINTS_PER_KIND} ưu và ${AI_POINTS_PER_KIND} nhược. Không có ý rõ ràng về sản phẩm thì trả "points": [] (đây là kết quả bình thường).
3. body: viết lại gọn bằng tiếng Việt, ${REVIEW_POINT_MIN} đến ${REVIEW_POINT_MAX} ký tự, giữ đúng ý và đúng mức độ ("pin hơi yếu" không thành "pin rất tệ").
4. criterion_key: một khoá trong danh sách trên, hoặc null nếu là ý chung không thuộc tiêu chí nào.
5. evidence: đoạn trích nguyên văn, ngắn, chép đúng từng chữ từ chính review đó (giữ nguyên chữ không dấu, viết tắt, lỗi chính tả). Ít nhất 2 từ.
6. Bỏ qua chuyện giao hàng, đóng gói, người bán, khuyến mãi, quà tặng, xu.
7. Không có dòng nào vừa là ưu vừa là nhược. Không lặp ý.
8. Trả đúng một mục cho mỗi ref nhận được.

${EXAMPLES}`;
}

/** The user message: the reviews with their temporary refs, as JSON. */
export function reviewAiUserMessage(reviews: readonly { ref: number; text: string }[]): string {
  return `Các review cần đọc (JSON):\n${JSON.stringify(
    reviews.map(r => ({ ref: r.ref, text: r.text.normalize('NFC') }))
  )}`;
}

/** The structured output schema of a category: criterion_key limited to its keys. */
export function reviewAiOutputSchema(categorySlug: string): Record<string, unknown> {
  const keys = getRatingCriteria(categorySlug).map(c => c.key);
  return {
    type: 'object',
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'integer' },
            points: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['pro', 'con'] },
                  criterion_key: { anyOf: [{ type: 'string', enum: keys }, { type: 'null' }] },
                  body: { type: 'string' },
                  evidence: { type: 'string' },
                },
                required: ['kind', 'criterion_key', 'body', 'evidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['ref', 'points'],
          additionalProperties: false,
        },
      },
    },
    required: ['reviews'],
    additionalProperties: false,
  };
}

/** One line as rate.store_review_ai_points takes it. */
export interface AiPoint {
  kind: 'pro' | 'con';
  criterion_key: string | null;
  body: string;
  evidence: string;
  match: 'exact' | 'unaccented';
}

/** Why the job dropped a line (counted, never logged with text). */
export type AiRejectReason =
  'shape' | 'evidence' | 'length' | 'criterion' | 'evasive' | 'duplicate' | 'too_many';

/**
 * What the evidence check compares: the compared form of a line
 * (comparablePoint: lower case, punctuation as spaces, spaces collapsed), the
 * same form rate.store_review_ai_points compares with
 * rate.review_point_compare, so a quote the job calls exact the writer finds.
 */
export function evidenceForm(text: string): string {
  return comparablePoint(storedPoint(text));
}

/** The same without diacritics (đ as d): the fallback for unaccented reviews. */
export function unaccentedForm(text: string): string {
  return evidenceForm(text)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gu, 'd')
    .normalize('NFC');
}

/** Where an evidence quote is found in its own review, or null (design 7.2). */
export function evidenceMatch(review: string, evidence: string): 'exact' | 'unaccented' | null {
  const quote = evidenceForm(evidence);
  // Two words in the compared form, as the writer counts them ("đẹp :)" is one).
  if (!quote.includes(' ')) return null;
  if (evidenceForm(review).includes(quote)) return 'exact';
  if (unaccentedForm(review).includes(unaccentedForm(evidence))) return 'unaccented';
  return null;
}

/** What the checks made of one review's lines. */
export interface CheckedReview {
  points: AiPoint[];
  rejected: Record<AiRejectReason, number>;
}

const emptyRejects = (): Record<AiRejectReason, number> => ({
  shape: 0,
  evidence: 0,
  length: 0,
  criterion: 0,
  evasive: 0,
  duplicate: 0,
  too_many: 0,
});

/**
 * The lines of one review that pass (design 7.2): a known kind; a key of the
 * category or null; a body of 5 to 150 characters with words, as the writer
 * stores it; no evasive con; no line twice, nor as a pro and a con; evidence
 * found in this review's own text; at most 3 a side, in the model's order.
 */
export function checkReviewPoints(
  reviewText: string,
  categorySlug: string,
  raw: unknown
): CheckedReview {
  const rejected = emptyRejects();
  const keys = new Set<string>(getRatingCriteria(categorySlug).map(c => c.key));
  const points: AiPoint[] = [];
  const seen = new Set<string>();
  const perKind = { pro: 0, con: 0 };
  for (const item of Array.isArray(raw) ? raw : []) {
    const line = item as Record<string, unknown> | null;
    if (
      !line ||
      typeof line !== 'object' ||
      (line.kind !== 'pro' && line.kind !== 'con') ||
      typeof line.body !== 'string' ||
      typeof line.evidence !== 'string' ||
      (line.criterion_key !== null && typeof line.criterion_key !== 'string')
    ) {
      rejected.shape += 1;
      continue;
    }
    const kind = line.kind;
    const key = line.criterion_key as string | null;
    if (key !== null && !keys.has(key)) {
      rejected.criterion += 1;
      continue;
    }
    const body = storedPoint(line.body);
    const length = [...body].length;
    if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX || !hasContent(body)) {
      rejected.length += 1;
      continue;
    }
    if (kind === 'con' && isEvasiveCon(body)) {
      rejected.evasive += 1;
      continue;
    }
    const evidence = storedPoint(line.evidence);
    const match = [...evidence].length <= EVIDENCE_MAX ? evidenceMatch(reviewText, evidence) : null;
    if (match === null) {
      rejected.evidence += 1;
      continue;
    }
    const compared = comparablePoint(body);
    if (seen.has(compared)) {
      rejected.duplicate += 1;
      continue;
    }
    if (perKind[kind] >= AI_POINTS_PER_KIND) {
      rejected.too_many += 1;
      continue;
    }
    seen.add(compared);
    perKind[kind] += 1;
    points.push({ kind, criterion_key: key, body, evidence, match });
  }
  return { points, rejected };
}

/** USD for a usage at a model's batch prices, cache reads and writes included. */
export function batchCostUsd(
  model: ReviewAiModel,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  }
): number {
  const price = REVIEW_AI_MODELS[model];
  const n = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : 0);
  const usd =
    (n(usage.input_tokens) * price.input +
      n(usage.cache_read_input_tokens) * price.input * CACHE_READ_FACTOR +
      n(usage.cache_creation_input_tokens) * price.input * CACHE_WRITE_FACTOR +
      n(usage.output_tokens) * price.output) /
    1_000_000;
  return usd * BATCH_DISCOUNT;
}

/**
 * The most a batch can cost before it is sent (design 8): every request at its
 * output ceiling, its input counted at 2 characters a token (Vietnamese runs
 * dense; real counts are lower) with no cache hit
 * (the instruction block written to the cache each time).
 */
export function reserveUsd(
  model: ReviewAiModel,
  requests: readonly { instructions: string; message: string }[]
): number {
  let total = 0;
  for (const r of requests) {
    const instructionTokens = Math.ceil(r.instructions.length / 2);
    const messageTokens = Math.ceil(r.message.length / 2);
    total += batchCostUsd(model, {
      input_tokens: messageTokens,
      cache_creation_input_tokens: instructionTokens,
      output_tokens: REQUEST_MAX_TOKENS,
    });
  }
  return Math.ceil(total * 10_000) / 10_000;
}
