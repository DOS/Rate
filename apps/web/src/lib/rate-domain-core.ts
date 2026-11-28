/**
 * Client-safe pure domain code shared by rate-api.ts (server) and client
 * components: scoring, routing, image resolution and URL parsing. It must
 * not import rate-api or any Supabase client, so client bundles stay free of
 * them (DOS/Rate#756).
 */
import type { MasterProduct } from '@repo/shared-data';
import type { ReviewValueTier } from '@repo/shared-data/rules';
import {
  REVIEW_PLATFORM_LABEL_RE,
  REVIEW_PRODUCT_ASPECT_RE,
  reviewDepth,
  type ReviewDepth,
} from '@repo/shared-data/rules';

/** A finite number from a number or a numeric string, else NaN. */
export function parseFiniteNumericSpec(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return NaN;
    }
    return Number(cleaned.replace(',', '.'));
  }
  return NaN;
}

export function normalizeCompareFiveStarRating(
  raw: number | string | null | undefined
): number {
  const num = parseFiniteNumericSpec(raw);
  if (!Number.isFinite(num) || num <= 0 || num > 100) {
    return 0;
  }
  const scaled = num > 10 ? num / 20 : num > 5 ? num / 2 : num;
  if (scaled <= 0 || scaled > 5) return 0;
  return Number(scaled.toFixed(2));
}

/**
 * The stored Bayesian rating (`rating_score`, DOS/Rate#1545), out of 5 and
 * unrounded: it is stored at 3 decimals so a page rounds once, to 1. Zero
 * when there is none.
 */
export function resolveStoredRatingScore(
  p: Partial<Pick<MasterProduct, 'rating_score'>> | null | undefined
): number {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 0;
  const num = parseFiniteNumericSpec(p.rating_score);
  return Number.isFinite(num) && num > 0 && num <= 5 ? num : 0;
}

/**
 * The one rating every page shows (design #1531 D3): the stored Bayesian
 * `rating_score`. A product without one falls back to the weighted user
 * rating, then the marketplace average, as before the column existed.
 */
export function resolveCompareEffectiveUserRating(
  p: Pick<MasterProduct, 'user_rating_weighted' | 'average_rating'> &
    Partial<Pick<MasterProduct, 'rating_score'>>
): number {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 0;
  const stored = resolveStoredRatingScore(p);
  if (stored > 0) return stored;
  const weighted = normalizeCompareFiveStarRating(p.user_rating_weighted);
  if (weighted > 0) return weighted;
  return normalizeCompareFiveStarRating(p.average_rating);
}

export type ReviewFlagCategory =
  | 'authentic'
  | 'low_value_coin_spam'
  | 'seeding_fake'
  | 'competitor_sabotage'
  | 'review_bombing';

export type ReviewAuthenticityAxis =
  'genuine' | 'doubtful' | 'fabricated' | 'sabotage' | 'bombing' | 'copied';

export type ReviewIndependenceAxis =
  | 'organic'
  | 'affiliate'
  | 'incentivized'
  | 'sponsored_balanced'
  | 'sponsored_promo'
  | 'undisclosed_paid'
  | 'conflict_of_interest';

/** Axis C, classified by `reviewDepth` in `@repo/shared-data/rules`. */
export type ReviewDepthAxis = ReviewDepth;

export interface ReviewWeightBreakdown {
  gate: 0 | 1;
  gateReason?: string;
  authenticity: number;
  independence: number;
  depth: number;
  reviewer: number;
  context: number;
  community: number;
  base_weight: number;
  weight: number;
  /** Which `explanationVi` case applies, so the UI can localize it. */
  explanationKind: ReviewWeightExplanationKind;
  explanationVi: string;
}

export type ReviewWeightExplanationKind =
  | 'shipping_only'
  | 'filler'
  | 'sabotage'
  | 'bombing'
  | 'seeding'
  | 'stars_only'
  | 'platform_label'
  | 'low_effort'
  | 'formula';

export interface ReviewTrustAssessment {
  authenticity: ReviewAuthenticityAxis;
  independence: ReviewIndependenceAxis;
  depth: ReviewDepthAxis;
  routesTo: 'product' | 'merchant';
  sponsorshipBadgeVi: string | null;
  breakdown: ReviewWeightBreakdown;
  wilsonScore: number;
}

export const REVIEW_REPORT_REASONS = [
  'spam',
  'fake',
  'offensive',
  'off_topic',
  'other',
] as const;

export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

export type ReviewStarTier = 1 | 2 | 3 | 4 | 5;

export interface ReviewStarCounts {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  total: number;
}

export function computeReviewStarCounts(
  reviews: ReadonlyArray<Pick<ReviewItem, 'rating_star'>>
): ReviewStarCounts {
  const counts: ReviewStarCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 };
  if (!Array.isArray(reviews)) return counts;
  for (const r of reviews) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const raw = Number(r.rating_star);
    if (!Number.isFinite(raw)) continue;
    const rounded = Math.round(raw);
    if (rounded >= 1 && rounded <= 5) {
      const star = rounded as ReviewStarTier;
      counts[star] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

export function addReviewStarCounts(
  base: ReviewStarCounts,
  delta: ReviewStarCounts
): ReviewStarCounts {
  return {
    1: Math.max(0, base[1] + delta[1]),
    2: Math.max(0, base[2] + delta[2]),
    3: Math.max(0, base[3] + delta[3]),
    4: Math.max(0, base[4] + delta[4]),
    5: Math.max(0, base[5] + delta[5]),
    total: Math.max(0, base.total + delta.total),
  };
}

export const REVIEW_IMAGES_MAX = 6;

export interface ReviewItem {
  id: string;
  author_name: string;
  rating_star: number;
  comment: string;
  variation: string | null;
  created_at: string;
  reviewer_type: 'user' | 'expert';
  upvotes: number;
  downvotes: number;
  report_count: number;
  helpfulness_weight: number;
  include_in_rating: boolean;
  criteria_ratings: Record<string, number>;
  verdict: 'authentic' | 'suspicious' | 'fake' | 'unanalyzed' | null;
  fake_probability: number | null;
  flag_category: ReviewFlagCategory;
  reason: string | null;
  signals: Record<string, unknown> | null;
  images?: string[];
  trust_assessment?: ReviewTrustAssessment;
  /** The public quality tier (DOS/Rate#1547, D7); null when unscored. */
  value_tier?: ReviewValueTier | null;
}

export function toSafeNonNegativeVoteCount(
  raw: unknown,
  max = 1_000_000
): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  let num = Number.NaN;
  if (typeof raw === 'number') {
    num = raw;
  } else {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (
      cleaned.length > 0 &&
      cleaned.length <= 32 &&
      !/^[+-]?0[xbo]/i.test(cleaned)
    ) {
      num = Number(cleaned);
    }
  }
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(max, Math.floor(num));
}

/**
 * Computes the 95% Wilson score confidence interval lower bound for ranking "Most Helpful" reviews
 * over weighted upvotes and downvotes (Section 9 of `Docs/Platform/review-trust-model.html`).
 * Prevents a review with 1 upvote / 0 downvotes from outranking a review with 50 upvotes / 2 downvotes.
 */
export function computeWilsonLowerBound(
  helpfulWeight: number,
  unhelpfulWeight: number,
  z = 1.96
): number {
  const pos =
    Number.isFinite(helpfulWeight) && helpfulWeight > 0
      ? Math.min(10_000_000, helpfulWeight)
      : 0;
  const neg =
    Number.isFinite(unhelpfulWeight) && unhelpfulWeight > 0
      ? Math.min(10_000_000, unhelpfulWeight)
      : 0;
  const n = pos + neg;
  if (n <= 0) return 0;
  const safeZ = Number.isFinite(z) && z > 0 ? Math.min(10, z) : 1.96;
  const pHat = pos / n;
  const z2 = safeZ * safeZ;
  const radicand = Math.max(0, (pHat * (1 - pHat) + z2 / (4 * n)) / n);
  const numerator = pHat + z2 / (2 * n) - safeZ * Math.sqrt(radicand);
  const denominator = 1 + z2 / n;
  return Number(Math.max(0, Math.min(1, numerator / denominator)).toFixed(4));
}

const WEB_SHIPPING_ASPECT_RE =
  /(?:giao\s*hàng|ship(?:per)?|vận\s*chuyển|đóng\s*gói|bọc\s*hàng|hộp\s*móp|giao\s*nhanh|giao\s*chậm|tư\s*vấn|chăm\s*sóc\s*khách)/i;

// Any mention of the product or of using it, based on the product words in
// apps/importer/src/shopee/ai-review-analyzer.ts (isShippingOnlyComment) plus
// Shopee's structured product fields. Matched as whole words so "hư" in "như"
// or "pin" in "shopping" do not count. Words that also describe delivery
// count only outside a delivery phrase ("sản phẩm" but not "sản phẩm được
// đóng gói", "đẹp" but not "đóng gói rất đẹp"); see PRODUCT_MENTION_RE in
// the importer, which must stay identical (its tests compare the two). Only used
// to decide that a review is about shipping alone; depth still uses the
// stricter REVIEW_PRODUCT_ASPECT_RE.
const WEB_PRODUCT_MENTION_RE =
  /(?<![\p{L}\p{N}])(?:máy|điện\s*thoại|tai\s*nghe|pin|màn(?:\s*hình)?|camera|loa|mic|chất\s*âm|chống\s*ồn|cảm\s*ứng|hiệu\s*năng|cấu\s*hình|chip|ram|rom|sạc|dùng|xài|sử\s*dụng|trải\s*nghiệm|mượt|lag|giật|nóng|ấm|lỗi|hỏng|hư|bền|xịn|chính\s*hãng|nguyên\s*seal|bảo\s*hành|vân\s*tay|wifi|5g|bluetooth|nhiệt\s*độ|tần\s*số|sản\s*phẩm(?!\s+(?:(?:đã\s+)?được\s+|đã\s+)?(?:đóng\s*gói|giao\s*(?:hàng|nhanh|chậm|trễ|lâu|đến|tới)|vận\s*chuyển|bọc|ship))|chất\s*lượng(?!\s+(?:đóng\s*gói|giao|vận\s*chuyển|phục\s*vụ|dịch\s*vụ))|(?<!(?:giao|gói|đóng|nhận|gửi|ship)\s+)hàng(?:\s+\p{L}+){0,2}?\s+(?:đẹp|tốt|xịn|chuẩn|ok|ổn|kém|tệ|lỗi|tuyệt|ngon|hài\s*lòng|ưng)|(?<!(?:gói|hộp|bọc|bì)(?:\s+\p{L}+)?\s*)đẹp|mô\s*tả|(?:y|giống|đúng)\s*hình|tính\s*năng\s*nổi\s*bật)(?![\p{L}\p{N}])/iu;

const WEB_SPONSORED_RE =
  /(?:được\s*tài\s*trợ|nhận\s*sản\s*phẩm\s*từ\s*hãng|bài\s*viết\s*tài\s*trợ|quảng\s*cáo|sponsored|gifted\s*by|partner(?:ed)?\s*with)/i;

const WEB_AFFILIATE_RE =
  /(?:link\s*mua|link\s*bio|tiếp\s*thị\s*liên\s*kết|affiliate|hoa\s*hồng|s\.shopee\.vn|shope\.ee|vt\.tiktok\.com)/i;

const WEB_INCENTIVIZED_RE =
  /(?:đánh\s*giá\s*5\s*sao\s*nhận\s*quà|nhận\s*voucher|hoàn\s*tiền\s*khi\s*đánh\s*giá|thẻ\s*cào\s*trong\s*hộp)/i;

const WEB_LONG_TERM_RE =
  /(?:sau\s*\d+\s*(?:tháng|năm|tuần)|dùng\s*(?:được\s*)?\d+\s*(?:tháng|năm)|cập\s*nhật\s*sau)/i;

/**
 * Evaluates a `ReviewItem` on the 6 independent axes of Review Trust Model v2
 * (`Docs/Platform/review-trust-model.html` Sections 3, 5, 9, 15).
 */
export function evaluateReviewTrustAssessment(
  rawReview: Pick<
    ReviewItem,
    | 'rating_star'
    | 'comment'
    | 'reviewer_type'
    | 'upvotes'
    | 'downvotes'
    | 'report_count'
    | 'flag_category'
    | 'verdict'
    | 'include_in_rating'
    | 'signals'
  >,
  /**
   * The rest of a form v2 review's text, which axis C reads with the
   * comment: its verdict line and its writer's pros and cons
   * (`rate.review_points`, DOS/Rate#1583).
   */
  reviewText?: { verdict?: unknown; points?: readonly unknown[] | null }
): ReviewTrustAssessment {
  const review = (
    rawReview && typeof rawReview === 'object' && !Array.isArray(rawReview)
      ? rawReview
      : {}
  ) as typeof rawReview;
  const comment = (typeof review.comment === 'string' ? review.comment : '')
    .normalize('NFC')
    .trim();
  const cleanText = comment.replace(/[\s.!,]+$/u, '').trim();
  const hasShipping = WEB_SHIPPING_ASPECT_RE.test(comment);
  const hasProduct = REVIEW_PRODUCT_ASPECT_RE.test(comment);
  const shippingOnly =
    hasShipping &&
    !hasProduct &&
    !WEB_PRODUCT_MENTION_RE.test(comment) &&
    cleanText.length > 0;

  // 1. Axis A: Authenticity
  let authenticity: ReviewAuthenticityAxis = 'genuine';
  // Sabotage and bombing also carry verdict 'fake'; their category wins.
  if (review.flag_category === 'competitor_sabotage') {
    authenticity = 'sabotage';
  } else if (review.flag_category === 'review_bombing') {
    authenticity = 'bombing';
  } else if (
    review.flag_category === 'seeding_fake' ||
    review.verdict === 'fake'
  ) {
    authenticity = 'fabricated';
  } else if (
    Number.isFinite(Number(review.rating_star)) &&
    Number(review.rating_star) >= 5 &&
    /(?:tệ\s*quá|hàng\s*giả|lừa\s*đảo|đừng\s*mua|phí\s*tiền|dở\s*tệ|hỏng\s*ngay)/i.test(
      comment
    )
  ) {
    authenticity = 'doubtful';
  }

  // 2. Axis B: Independence & Sponsorship disclosure
  let independence: ReviewIndependenceAxis = 'organic';
  let sponsorshipBadgeVi: string | null = null;
  if (WEB_SPONSORED_RE.test(comment)) {
    const hasCriticism =
      /(?:nhưng|tuy\s*nhiên|nhược\s*điểm|điểm\s*trừ|hơi\s*tiếc)/i.test(comment);
    if (hasCriticism) {
      independence = 'sponsored_balanced';
      sponsorshipBadgeVi = 'Có tài trợ';
    } else {
      independence = 'sponsored_promo';
      sponsorshipBadgeVi = 'Quảng cáo';
    }
  } else if (WEB_INCENTIVIZED_RE.test(comment)) {
    independence = 'incentivized';
    sponsorshipBadgeVi = 'Đổi quà / Nhận ưu đãi';
  } else if (WEB_AFFILIATE_RE.test(comment)) {
    independence = 'affiliate';
    sponsorshipBadgeVi = 'Tiếp thị liên kết';
  }

  // 3. Axis C: Depth, shared with the review value score (DOS/Rate#1581).
  const depth: ReviewDepthAxis = reviewDepth({
    comment,
    verdict: reviewText?.verdict,
    points: reviewText?.points ?? undefined,
    reviewerType: review.reviewer_type,
    flagCategory: review.flag_category,
  });

  const A =
    authenticity === 'genuine' ? 1.0 : authenticity === 'doubtful' ? 0.5 : 0;
  const B =
    independence === 'organic'
      ? 1.0
      : independence === 'affiliate'
        ? 0.7
        : independence === 'incentivized' ||
            independence === 'sponsored_balanced'
          ? 0.5
          : independence === 'sponsored_promo'
            ? 0.1
            : 0;
  let C =
    depth === 'stars_only' || depth === 'platform_label'
      ? 0.25
      : depth === 'filler'
        ? 0
        : depth === 'low_effort'
          ? 0.5
          : depth === 'specific_short'
            ? 0.8
            : depth === 'detailed'
              ? 1.0
              : 1.2;
  if (
    (depth === 'specific_short' ||
      depth === 'detailed' ||
      depth === 'expert_depth') &&
    WEB_LONG_TERM_RE.test(comment)
  ) {
    C = Math.min(1.5, Number((C + 0.2).toFixed(2)));
  }

  // 4. Axis D: Reviewer credibility
  const D = review.reviewer_type === 'expert' ? 1.3 : 1.0;

  // 5. Axis E: Context & routing
  const routesTo: 'product' | 'merchant' = shippingOnly
    ? 'merchant'
    : 'product';
  const E = shippingOnly ? 0 : 1.0;

  // 6. Axis F: Community signal
  const upvotes = toSafeNonNegativeVoteCount(review.upvotes);
  const downvotes = toSafeNonNegativeVoteCount(review.downvotes);
  const reports = toSafeNonNegativeVoteCount(review.report_count);
  const netPos = Math.max(0, upvotes - downvotes);
  const netNeg = Math.max(0, downvotes - upvotes);
  const rawF = 1 + 0.45 * Math.log(1 + netPos) - 0.3 * netNeg - 0.35 * reports;
  const F = Number(Math.max(0.1, Math.min(2.0, rawF)).toFixed(2));

  let gate: 0 | 1 = 1;
  let gateReason: string | undefined;
  if (!review.include_in_rating || A === 0 || B === 0 || C === 0 || E === 0) {
    gate = 0;
    if (E === 0) {
      gateReason = 'shipping_only_routed_to_merchant';
    } else if (A === 0) {
      gateReason = `authenticity:${authenticity}`;
    } else if (C === 0) {
      gateReason = 'depth:filler';
    } else if (B === 0) {
      gateReason = `independence:${independence}`;
    } else {
      gateReason = 'excluded_from_rating';
    }
  }

  const baseWeight = gate === 0 ? 0 : Number((A * B * C * D * E).toFixed(4));
  const weight =
    gate === 0
      ? 0
      : Number(Math.max(0, Math.min(3.0, baseWeight * F)).toFixed(2));

  let explanationKind: ReviewWeightExplanationKind;
  let explanationVi: string;
  if (shippingOnly) {
    explanationKind = 'shipping_only';
    explanationVi =
      'Trọng số 0.00x cho sản phẩm: chỉ nhận xét giao hàng/đóng gói (chuyển sang điểm người bán)';
  } else if (gate === 0) {
    if (depth === 'filler') {
      explanationKind = 'filler';
      explanationVi =
        'Trọng số 0.00x: bình luận cày xu / không mô tả trải nghiệm sản phẩm';
    } else if (authenticity === 'sabotage') {
      explanationKind = 'sabotage';
      explanationVi = 'Trọng số 0.00x: nghi vấn đối thủ dìm hàng thiếu căn cứ';
    } else if (authenticity === 'bombing') {
      explanationKind = 'bombing';
      explanationVi = 'Trọng số 0.00x: đánh giá bất thường / bom đơn';
    } else {
      explanationKind = 'seeding';
      explanationVi =
        'Trọng số 0.00x: nghi là đánh giá ảo hoặc văn mẫu trùng lặp';
    }
  } else if (depth === 'stars_only') {
    explanationKind = 'stars_only';
    explanationVi = `Trọng số ${weight.toFixed(2)}x: chỉ chấm sao, không có nội dung (C=0.25)`;
  } else if (depth === 'platform_label') {
    explanationKind = 'platform_label';
    explanationVi = `Trọng số ${weight.toFixed(2)}x: nhãn mặc định theo số sao của sàn (C=0.25)`;
  } else if (depth === 'low_effort') {
    explanationKind = 'low_effort';
    explanationVi = `Trọng số ${weight.toFixed(2)}x: nhận xét ngắn, ít chi tiết kỹ thuật (C=0.50)`;
  } else {
    explanationKind = 'formula';
    explanationVi = `A=${A} · B=${B} · C=${C} · D=${D} · E=${E} · F=${F} -> ${weight.toFixed(2)}x`;
  }

  return {
    authenticity,
    independence,
    depth,
    routesTo,
    sponsorshipBadgeVi,
    breakdown: {
      gate,
      ...(gateReason ? { gateReason } : {}),
      authenticity: A,
      independence: B,
      depth: C,
      reviewer: D,
      context: E,
      community: F,
      base_weight: baseWeight,
      weight,
      explanationKind,
      explanationVi,
    },
    wilsonScore: computeWilsonLowerBound(upvotes, downvotes),
  };
}

export type CombinedDualScoreBlendMode =
  | 'blended'
  | 'separate_low_confidence'
  | 'user_only'
  | 'expert_only'
  | 'insufficient_data';

export interface CombinedDualScoreResult {
  overall: number;
  isBlended: boolean;
  /** Which `blendFormulaNoteVi` case applies, so the UI can localize it. */
  blendMode: CombinedDualScoreBlendMode;
  blendFormulaNoteVi: string;
}

/**
 * Section 7 of `Docs/Platform/review-trust-model.html`:
 * "Điểm người dùng và điểm chuyên gia tách riêng, như JReviews.
 * Điểm tổng (40% chuyên gia, 60% người dùng) chỉ hiện khi có cả hai
 * và độ tin cậy của điểm người dùng từ mức trung bình trở lên (c >= 0.6)."
 */
export function computeCombinedDualScore(params: {
  userScore: number | null;
  expertScore: number | null;
  userConfidence: number;
  fallbackAverage?: number;
}): CombinedDualScoreResult {
  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : ({} as typeof params);
  const {
    userScore,
    expertScore,
    userConfidence,
    fallbackAverage = 0,
  } = safeParams;
  const safeUser =
    typeof userScore === 'number' &&
    Number.isFinite(userScore) &&
    userScore > 0 &&
    userScore <= 10
      ? userScore
      : null;
  const safeExpert =
    typeof expertScore === 'number' &&
    Number.isFinite(expertScore) &&
    expertScore > 0 &&
    expertScore <= 10
      ? expertScore
      : null;
  const safeConfidence =
    typeof userConfidence === 'number' && Number.isFinite(userConfidence)
      ? Math.max(0, Math.min(1, userConfidence))
      : 0;
  const safeFallback =
    typeof fallbackAverage === 'number' &&
    Number.isFinite(fallbackAverage) &&
    fallbackAverage > 0 &&
    fallbackAverage <= 10
      ? fallbackAverage
      : 0;

  if (safeUser !== null && safeExpert !== null && safeConfidence >= 0.6) {
    return {
      overall: Number((safeUser * 0.6 + safeExpert * 0.4).toFixed(2)),
      isBlended: true,
      blendMode: 'blended',
      blendFormulaNoteVi:
        'Tỷ trọng: 60% người mua thực chất + 40% chuyên gia Rate Lab (độ tin cậy ≥ 60%)',
    };
  }

  if (safeUser !== null && safeExpert !== null && safeConfidence < 0.6) {
    return {
      overall: Number(safeExpert.toFixed(2)),
      isBlended: false,
      blendMode: 'separate_low_confidence',
      blendFormulaNoteVi:
        'Hiển thị riêng điểm chuyên gia và điểm người mua (gộp 60/40 khi độ tin cậy người mua đạt mức trung bình, độ tin cậy ≥ 60%)',
    };
  }

  if (safeUser !== null) {
    return {
      overall: Number(safeUser.toFixed(2)),
      isBlended: false,
      blendMode: 'user_only',
      blendFormulaNoteVi:
        'Tỷ trọng: 100% người mua thực chất (đã lọc đánh giá ảo và spam nhận xu)',
    };
  }

  if (safeExpert !== null) {
    return {
      overall: Number(safeExpert.toFixed(2)),
      isBlended: false,
      blendMode: 'expert_only',
      blendFormulaNoteVi: 'Tỷ trọng: 100% đánh giá chuyên gia Rate Lab',
    };
  }

  return {
    overall: Number(safeFallback.toFixed(2)),
    isBlended: false,
    blendMode: 'insufficient_data',
    blendFormulaNoteVi: 'Chưa đủ dữ liệu đánh giá thực chất',
  };
}

export interface StarDistributionAnomalySummary {
  isAnomalous: boolean;
  fiveStarRatioPct: number;
  lowEffortOrSeedingRatioPct: number;
  warningLabelVi: string | null;
}

/**
 * Section 4 (#24) & Section 7 of `Docs/Platform/review-trust-model.html`:
 * Detects abnormal 5-star clustering at listing/product level (e.g. >= 90% 5-star reviews
 * with zero <=3 star reviews and >= 60% stars-only/low-effort/seeding reviews across >= 5 reviews).
 */
export function detectStarDistributionAnomaly(
  reviews: ReadonlyArray<
    Pick<ReviewItem, 'rating_star' | 'comment' | 'flag_category'>
  >
): StarDistributionAnomalySummary {
  let ratedCount = 0;
  let fiveStarCount = 0;
  let criticalStarCount = 0;
  let shallowOrFlaggedFiveStar = 0;
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  for (const r of safeReviews) {
    if (
      !r ||
      typeof r !== 'object' ||
      Array.isArray(r) ||
      typeof r.rating_star === 'boolean'
    ) {
      continue;
    }
    const rawStar = Number(r.rating_star);
    if (!Number.isFinite(rawStar)) continue;
    const star = Math.round(rawStar);
    if (star < 1 || star > 5) continue;
    ratedCount += 1;
    const text = (typeof r.comment === 'string' ? r.comment : '').trim();
    if (star === 5) {
      fiveStarCount += 1;
      if (
        text.length < 25 ||
        REVIEW_PLATFORM_LABEL_RE.test(text) ||
        r.flag_category !== 'authentic'
      ) {
        shallowOrFlaggedFiveStar += 1;
      }
    } else if (star <= 3) {
      criticalStarCount += 1;
    }
  }

  if (ratedCount < 5) {
    return {
      isAnomalous: false,
      fiveStarRatioPct: 0,
      lowEffortOrSeedingRatioPct: 0,
      warningLabelVi: null,
    };
  }

  const fiveStarRatioPct = Math.round((fiveStarCount / ratedCount) * 100);
  const lowEffortOrSeedingRatioPct =
    fiveStarCount > 0
      ? Math.round((shallowOrFlaggedFiveStar / fiveStarCount) * 100)
      : 0;

  const isAnomalous =
    fiveStarRatioPct >= 90 &&
    criticalStarCount === 0 &&
    lowEffortOrSeedingRatioPct >= 60;

  return {
    isAnomalous,
    fiveStarRatioPct,
    lowEffortOrSeedingRatioPct,
    warningLabelVi: isAnomalous
      ? `Cảnh báo phân bố sao bất thường: ${fiveStarRatioPct}% đánh giá là 5 sao tuyệt đối (${lowEffortOrSeedingRatioPct}% chỉ chấm sao hoặc thiếu chi tiết trải nghiệm)`
      : null,
  };
}

/**
 * Canonical JReviews review weight formula matching SQL `rate.compute_review_weight`:
 * - Ignored categories (coin_spam, seeding_fake, sabotage, bombing) or fake verdict -> 0.00
 * - Suspicious verdict base = 0.25, otherwise 1.00
 * - Net votes > 0: base + ln(1 + net) * 0.45
 * - Net votes < 0: base - |net| * 0.30
 * - Reports penalty: - reports * 0.35
 * - Clamped to [0.00, 3.00]
 */
export function computeJReviewsWeight(params: {
  upvotes: number;
  downvotes: number;
  reports: number;
  flagCategory: ReviewFlagCategory;
  verdict?: string | null;
  includeInRating?: boolean;
}): number {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return 0;
  }
  const {
    upvotes,
    downvotes,
    reports,
    flagCategory,
    verdict = 'authentic',
    includeInRating = true,
  } = params;

  if (
    !includeInRating ||
    flagCategory === 'low_value_coin_spam' ||
    flagCategory === 'seeding_fake' ||
    flagCategory === 'competitor_sabotage' ||
    flagCategory === 'review_bombing' ||
    verdict === 'fake'
  ) {
    return 0;
  }

  const safeUpvotes = toSafeNonNegativeVoteCount(upvotes);
  const safeDownvotes = toSafeNonNegativeVoteCount(downvotes);
  const safeReports = toSafeNonNegativeVoteCount(reports);
  const base = verdict === 'suspicious' ? 0.25 : 1.0;
  const net = safeUpvotes - safeDownvotes;
  let weight = base;

  if (net > 0) {
    weight = base + Math.log(1 + net) * 0.45;
  } else if (net < 0) {
    weight = base - Math.abs(net) * 0.3;
  }

  weight -= safeReports * 0.35;
  return Math.round(Math.max(0, Math.min(3.0, weight)) * 100) / 100;
}

export type BayesianConfidenceTier =
  'high' | 'medium' | 'low' | 'insufficient_data';

export interface BayesianRatingSummary {
  bayesianRating: number;
  rawWeightedMean: number;
  effectiveWeightSum: number;
  confidenceRatio: number;
  confidenceTier: BayesianConfidenceTier;
  tierLabelVi: string;
}

export const BAYESIAN_PRIOR_K = 3;

export const BAYESIAN_PRIOR_MEAN = 4.2;

/**
 * Review Trust Model P1 (Docs/Platform/review-trust-model.html):
 * S_bayesian = (k * mu + sum(w_i * r_i)) / (k + sum(w_i)), c = sum(w_i) / (sum(w_i) + k)
 * Prior k = 3, mu = 4.2.
 */
export function computeBayesianRatingSummary(
  reviews: ReadonlyArray<{
    rating_star: number;
    helpfulness_weight: number;
    include_in_rating: boolean;
  }>,
  fallbackWeightedRating = 0
): BayesianRatingSummary {
  let effectiveWeightSum = 0;
  let weightedStarSum = 0;
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  for (const r of safeReviews) {
    if (
      !r ||
      typeof r !== 'object' ||
      Array.isArray(r) ||
      !r.include_in_rating
    ) {
      continue;
    }
    const rawW =
      typeof r.helpfulness_weight === 'number'
        ? r.helpfulness_weight
        : Number.NaN;
    const star = typeof r.rating_star === 'number' ? r.rating_star : Number.NaN;
    if (
      Number.isFinite(rawW) &&
      rawW > 0 &&
      Number.isFinite(star) &&
      star >= 1 &&
      star <= 5
    ) {
      const w = Math.min(3.0, rawW);
      effectiveWeightSum += w;
      weightedStarSum += w * star;
    }
  }

  effectiveWeightSum = Math.round(effectiveWeightSum * 100) / 100;

  if (effectiveWeightSum <= 0) {
    const safeFallback =
      Number.isFinite(fallbackWeightedRating) &&
      fallbackWeightedRating > 0 &&
      fallbackWeightedRating <= 5
        ? Math.round(fallbackWeightedRating * 100) / 100
        : 0;
    return {
      bayesianRating: safeFallback,
      rawWeightedMean: safeFallback,
      effectiveWeightSum: 0,
      confidenceRatio: 0,
      confidenceTier: 'insufficient_data',
      tierLabelVi: 'Chưa đủ mẫu kiểm chứng',
    };
  }

  const rawWeightedMean =
    Math.round((weightedStarSum / effectiveWeightSum) * 100) / 100;
  const bayesianRating =
    Math.round(
      ((BAYESIAN_PRIOR_K * BAYESIAN_PRIOR_MEAN + weightedStarSum) /
        (BAYESIAN_PRIOR_K + effectiveWeightSum)) *
        100
    ) / 100;
  const confidenceRatio =
    Math.round(
      (effectiveWeightSum / (effectiveWeightSum + BAYESIAN_PRIOR_K)) * 100
    ) / 100;

  let confidenceTier: BayesianConfidenceTier = 'insufficient_data';
  let tierLabelVi = 'Ít mẫu kiểm chứng, điểm đã được điều chỉnh';
  if (effectiveWeightSum >= 12) {
    confidenceTier = 'high';
    tierLabelVi = 'Độ tin cậy cao';
  } else if (effectiveWeightSum >= 4) {
    confidenceTier = 'medium';
    tierLabelVi = 'Độ tin cậy trung bình';
  } else if (effectiveWeightSum >= 1.5) {
    confidenceTier = 'low';
    tierLabelVi = 'Độ tin cậy thấp';
  }

  return {
    bayesianRating,
    rawWeightedMean,
    effectiveWeightSum,
    confidenceRatio,
    confidenceTier,
    tierLabelVi,
  };
}

export const MAX_VALID_VND_PRICE = 1_000_000_000;

export interface MerchantRiskBreakdown {
  total_reviews: number;
  authentic_count: number;
  coin_spam_count: number;
  seeding_fake_count: number;
  sabotage_or_bombing_count: number;
  suspicious_ratio_pct: number;
}

export interface MerchantSummary {
  id: string;
  platform: string;
  platform_shop_id: string;
  name: string;
  slug: string | null;
  url: string | null;
  is_official: boolean;
  rating_star: number | null;
  follower_count: number;
  location: string | null;
  dosafe_risk_score: number;
  /**
   * False when no DOSafe score is known: no metadata score and the column's default 0
   * (#1099). Internal: public payloads turn it into a null `dosafe_risk_score`
   * (`withPublicReviewRisk`, DOS/Rate#1465).
   */
  dosafe_risk_known?: boolean;
  review_risk_score: number;
  /**
   * Combined risk and trust from the signals that are known: the DOSafe score
   * and the analysed reviews. Null when neither is known: a store with no data
   * is not "high trust 100/100" (DOS/Rate#1484).
   */
  risk_score: number | null;
  trust_score: number | null;
  product_count: number;
  min_price: number | null;
  max_price: number | null;
  review_risk_breakdown: MerchantRiskBreakdown;
  updated_at: string | null;
}

export interface RawMerchantSafeRow {
  id: string;
  platform: string;
  platform_shop_id: string;
  name: string;
  slug?: string | null;
  url?: string | null;
  is_official?: boolean | null;
  rating_star?: number | string | null;
  follower_count?: number | string | null;
  location?: string | null;
  risk_score?: number | string | null;
  review_risk_score?: number | string | null;
  review_risk_breakdown?: MerchantRiskBreakdown | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function getCategoryRouteHref(slug: string): string {
  const safeSlug =
    typeof slug === 'string'
      ? slug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
          .slice(0, 128)
      : '';
  if (!safeSlug) {
    return '/smartphones';
  }
  if (isCanonicalCategorySlug(safeSlug)) {
    return `/${safeSlug}`;
  }
  return `/smartphones?category=${encodeURIComponent(safeSlug)}`;
}

export const KNOWN_LOCAL_DEVICE_IMAGES = new Set<string>([
  'apple-airpods-pro-2-usb-c',
  'apple-airpods-pro-3-usb-c',
  'apple-ipad-pro-m4-11-inch-256gb',
  'apple-ipad-pro-m5-11-inch-256gb',
  'apple-iphone-15-128gb',
  'apple-iphone-16-128gb',
  'apple-iphone-16-plus-256gb',
  'apple-iphone-16-pro-256gb',
  'apple-iphone-16-pro-max-256gb',
  'apple-iphone-18-pro-256gb',
  'apple-iphone-18-pro-max-256gb',
  'apple-macbook-air-m3-13-inch-256gb',
  'apple-macbook-air-m4-13-inch-256gb',
  'apple-macbook-pro-m4-pro-14-inch-512gb',
  'apple-watch-series-10-42mm-gps-64gb',
  'apple-watch-series-11-46mm-gps-64gb',
  'apple-watch-ultra-2-64gb',
  'apple-watch-ultra-3-49mm-64gb',
  'asus-zenbook-s-14-1tb',
  'garmin-forerunner-265-8gb',
  'lenovo-thinkpad-x1-carbon-gen-12-512gb',
  'oppo-find-x8-256gb',
  'oppo-find-x9-pro-512gb',
  'samsung-galaxy-a55-256gb',
  'samsung-galaxy-buds3-pro',
  'samsung-galaxy-s24-ultra-256gb',
  'samsung-galaxy-s26-ultra-256gb',
  'samsung-galaxy-tab-s10-ultra-5g-256gb',
  'samsung-galaxy-watch-ultra-32gb',
  'sony-wf-1000xm5',
  'sony-wf-1000xm6',
  'xiaomi-14-ultra-512gb',
  'xiaomi-17-pro-max-512gb',
  'xiaomi-18-pro-max-512gb',
  'xiaomi-pad-6s-pro-256gb',
  'xiaomi-pad-7-pro-256gb',
]);

/**
 * Whether a stored image entry can be used as an `src`: an absolute
 * http(s) URL, a protocol-relative URL or a site path. Crawled rows can hold
 * other strings, such as "[object Object]" from a stringified image object
 * (DOS/Rate#810).
 */
export function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || /[\s\p{Cc}]/u.test(trimmed))
    return false;
  if (/^\/(?!\/)\S+$/.test(trimmed)) {
    return !trimmed.includes('..') && !trimmed.includes('\\');
  }
  if (!/^(?:https?:)?\/\/[^\s/?#]+\S*$/i.test(trimmed)) return false;
  try {
    const parsed = new URL(
      trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
    );
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..')
    ) {
      return false;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** The usable images of a stored `images` list, trimmed, in order. */
export function usableImageUrls(
  images: readonly unknown[] | null | undefined
): string[] {
  return (Array.isArray(images) ? images : [])
    .filter(isImageUrl)
    .map((url) => url.trim());
}

/**
 * Sanitizes stored marketplace/community review photo URLs for public rendering:
 * HTTPS only, parsed with `URL`, no embedded credentials or non-standard ports,
 * deduplicated by normalized href, capped at `REVIEW_IMAGES_MAX` (6).
 */
export function sanitizeReviewImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const scanCap = Math.min(raw.length, 100);
  for (let i = 0; i < scanCap && out.length < REVIEW_IMAGES_MAX; i += 1) {
    const entry = raw[i];
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (
      !trimmed ||
      trimmed.length > 2048 ||
      /[\s\p{Cc}]/u.test(trimmed) ||
      trimmed.slice(0, 8).toLowerCase() !== 'https://'
    ) {
      continue;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') continue;
      if (parsed.username !== '' || parsed.password !== '') continue;
      if (parsed.port !== '' && parsed.port !== '443') continue;
      const host = parsed.hostname.toLowerCase();
      if (
        !host ||
        host.startsWith('.') ||
        host.endsWith('.') ||
        host.includes('..')
      ) {
        continue;
      }
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      out.push(parsed.href);
    } catch {
      // Drop unparseable URLs
    }
  }
  return out;
}

/** The first usable image of a stored `images` list, or null. */
export function firstImageUrl(
  images: readonly unknown[] | null | undefined
): string | null {
  return usableImageUrls(images)[0] ?? null;
}

/** A product's thumbnail if usable, else its first usable stored image. */
export function productImageUrl(product: {
  readonly thumbnail?: string | null;
  readonly images?: readonly unknown[] | null;
}): string | null {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return null;
  }
  return firstImageUrl([
    product.thumbnail,
    ...(Array.isArray(product.images) ? product.images : []),
  ]);
}

/**
 * A store CDN image at about the width it is shown (DOS/Rate#1328). The two
 * CDNs Rate hotlinks resize by URL: FPT Shop's thumbor (`/unsafe/{w}x0/`,
 * WebP via a filter) and CellphoneS (`/{w}x/`). Their originals are
 * 600-800 px PNGs of up to 700 KB, shown in 52 px thumbnails. Any other URL is
 * returned unchanged. `width` is in image pixels (allow for the device pixel
 * ratio), rounded and kept within 32-1024.
 */
export function sizedStoreImageUrl(
  url: string | null | undefined,
  width: number
): string | null {
  if (typeof url !== 'string' || !url) return url ?? null;
  const w = Math.min(1024, Math.max(32, Math.round(Number(width) || 0)));
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'https:') return url;
  if (parsed.hostname === 'cdn2.fptshop.com.vn') {
    // Only the plain form `/unsafe/[WxH/][filters:.../]image` is rewritten.
    // Other Thumbor options (fit-in, smart, trim, crop, align, meta) would be
    // read as part of the image path, so those URLs are left as they are.
    const m = /^\/unsafe\/(?:-?\d*x-?\d*\/)?(?:filters:[^/]*\/)?(.+)$/.exec(
      parsed.pathname
    );
    if (!m?.[1]) return url;
    if (
      /^(?:(?:adaptive-|full-)?fit-in|smart|trim(?::[^/]*)?|meta|left|right|center|top|middle|bottom|-?\d*x-?\d*|\d+x\d+:\d+x\d+|filters:[^/]*)(?:\/|$)/.test(
        m[1]
      )
    ) {
      return url;
    }
    parsed.pathname = `/unsafe/${w}x0/filters:format(webp)/${m[1]}`;
    return parsed.toString();
  }
  if (parsed.hostname === 'cdn2.cellphones.com.vn') {
    const m = /^\/(?:\d+x\d*\/)?(media\/.+)$/.exec(parsed.pathname);
    if (!m) return url;
    parsed.pathname = `/${w}x/${m[1]}`;
    return parsed.toString();
  }
  return url;
}

/**
 * The widths a store CDN image's `srcSet` names, as the device renditions.
 * CellphoneS never enlarges: a 600 px original asked for at 800 comes back at
 * 600, which an `800w` entry would draw at 3/4 of its size, so its list stops
 * at 600, the size of its usual originals. FPT Shop's thumbor enlarges.
 */
const STORE_IMAGE_SRCSET_WIDTHS = [200, 400, 600, 800] as const;
const CELLPHONES_SRCSET_WIDTHS = [200, 400, 600] as const;

/**
 * A `srcSet` of a store CDN image at the widths a product hero takes, resized
 * by the CDN itself as `sizedStoreImageUrl` does. React's preload hint for the
 * hero, which a prefetch of the page applies too, then fetches one of these
 * rather than the 600-800 px original (DOS/Rate#1417). Null for a URL the CDN
 * cannot resize.
 */
export function storeImageSrcSet(
  url: string | null | undefined
): string | null {
  if (typeof url !== 'string' || !url) return null;
  let host: string;
  let path: string;
  try {
    ({ hostname: host, pathname: path } = new URL(url));
  } catch {
    return null;
  }
  // A thumbor filter other than format or quality (rotate, crop, fill...)
  // changes the picture, and the resize drops it: keep such a URL whole.
  const filters = /\/filters:([^/]*)\//.exec(path)?.[1];
  if (
    filters &&
    filters.split(':').some((filter) => !/^(?:format|quality)\(/i.test(filter))
  )
    return null;
  const widths =
    host === 'cdn2.cellphones.com.vn'
      ? CELLPHONES_SRCSET_WIDTHS
      : STORE_IMAGE_SRCSET_WIDTHS;
  const sized = widths.map((w) => sizedStoreImageUrl(url, w) ?? url);
  // A URL the CDN cannot resize comes back unchanged at every width; one
  // already at one of these widths ("/200x/") changes at the others.
  if (sized.every((sizedUrl) => sizedUrl === url)) return null;
  return sized.map((sizedUrl, i) => `${sizedUrl} ${widths[i]}w`).join(', ');
}

export function resolveProductImageUrl(
  slugOrProduct?:
    | string
    | {
        slug?: string | null;
        thumbnail?: string | null;
        images?: string[] | null;
        [key: string]: unknown;
      }
    | null,
  fallbackUrl?: string | null
): string | null {
  if (
    slugOrProduct &&
    typeof slugOrProduct === 'object' &&
    !Array.isArray(slugOrProduct)
  ) {
    const slug =
      typeof slugOrProduct.slug === 'string'
        ? slugOrProduct.slug
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
        : '';
    if (slug && KNOWN_LOCAL_DEVICE_IMAGES.has(slug)) {
      return `/img/devices/${slug}.jpg`;
    }
    // Stored thumbnails and listing images can be junk such as
    // "[object Object]" (DOS/Rate#810).
    return (
      firstImageUrl([slugOrProduct.thumbnail]) ||
      firstImageUrl(
        Array.isArray(slugOrProduct.images) ? slugOrProduct.images : null
      ) ||
      firstImageUrl([fallbackUrl])
    );
  }
  const cleanStringSlug =
    typeof slugOrProduct === 'string'
      ? slugOrProduct
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  if (cleanStringSlug && KNOWN_LOCAL_DEVICE_IMAGES.has(cleanStringSlug)) {
    return `/img/devices/${cleanStringSlug}.jpg`;
  }
  return firstImageUrl([fallbackUrl]);
}

export type CanonicalCategorySlug =
  | 'smartphones'
  | 'tablets'
  | 'laptops'
  | 'smartwatches'
  | 'earbuds'
  | 'tvs'
  | 'air-conditioners'
  | 'refrigerators'
  | 'washing-machines'
  | 'air-purifiers'
  | 'bank-savings'
  | 'internet-telecom'
  | 'supplements'
  | 'cosmetics'
  | 'mother-baby'
  | 'restaurants'
  | 'cafes'
  | 'hotels'
  | 'homestays'
  | 'dental-clinics'
  | 'gyms-fitness'
  | 'spas-aesthetics'
  | 'english-centers'
  | 'credit-cards'
  | 'monitors'
  | 'cameras'
  | 'vps-hosting';

export const CORE_TECH_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
] as const;

export const WAVE_E1_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  'tvs',
  'air-conditioners',
  'refrigerators',
  'washing-machines',
  'air-purifiers',
] as const;

export const WAVE_E2_SERVICE_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] =
  ['bank-savings', 'internet-telecom'] as const;

export const WAVE_E3_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  'supplements',
  'cosmetics',
  'mother-baby',
] as const;

export const WAVE_E4_PLACE_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  'restaurants',
  'cafes',
  'hotels',
  'homestays',
] as const;

/** Wave E5 local place categories (DOS/Rate#1937, #1968). */
export const WAVE_E5_PLACE_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  'dental-clinics',
  'gyms-fitness',
  'spas-aesthetics',
  'english-centers',
] as const;

/** Wave E5 Phase 2 service categories (DOS/Rate#1968). */
export const WAVE_E5_SERVICE_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] =
  ['credit-cards'] as const;

/** Wave E6 hardware product categories (DOS/Rate#1976). */
export const WAVE_E6_PRODUCT_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] =
  ['monitors', 'cameras'] as const;

/** Wave E6 service categories (DOS/Rate#1976). */
export const WAVE_E6_SERVICE_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] =
  ['vps-hosting'] as const;

export const ALL_CANONICAL_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  ...CORE_TECH_CATEGORY_SLUGS,
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
  ...WAVE_E3_CATEGORY_SLUGS,
  ...WAVE_E4_PLACE_CATEGORY_SLUGS,
  ...WAVE_E5_PLACE_CATEGORY_SLUGS,
  ...WAVE_E5_SERVICE_CATEGORY_SLUGS,
  ...WAVE_E6_PRODUCT_CATEGORY_SLUGS,
  ...WAVE_E6_SERVICE_CATEGORY_SLUGS,
] as const;

const CANONICAL_CATEGORY_SLUG_SET = new Set<string>(
  ALL_CANONICAL_CATEGORY_SLUGS
);
const CORE_TECH_CATEGORY_SLUG_SET = new Set<string>(CORE_TECH_CATEGORY_SLUGS);
const WAVE_E1_CATEGORY_SLUG_SET = new Set<string>(WAVE_E1_CATEGORY_SLUGS);
const WAVE_E2_SERVICE_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E2_SERVICE_CATEGORY_SLUGS
);
const WAVE_E3_CATEGORY_SLUG_SET = new Set<string>(WAVE_E3_CATEGORY_SLUGS);
const WAVE_E4_PLACE_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E4_PLACE_CATEGORY_SLUGS
);
const WAVE_E5_PLACE_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E5_PLACE_CATEGORY_SLUGS
);
const WAVE_E5_SERVICE_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E5_SERVICE_CATEGORY_SLUGS
);
const WAVE_E6_PRODUCT_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E6_PRODUCT_CATEGORY_SLUGS
);
const WAVE_E6_SERVICE_CATEGORY_SLUG_SET = new Set<string>(
  WAVE_E6_SERVICE_CATEGORY_SLUGS
);

export function isCanonicalCategorySlug(
  value: unknown
): value is CanonicalCategorySlug {
  return typeof value === 'string' && CANONICAL_CATEGORY_SLUG_SET.has(value);
}

export function isCoreTechCategorySlug(value: unknown): boolean {
  return typeof value === 'string' && CORE_TECH_CATEGORY_SLUG_SET.has(value);
}

export function isWaveE1CategorySlug(value: unknown): boolean {
  return typeof value === 'string' && WAVE_E1_CATEGORY_SLUG_SET.has(value);
}

export function isWaveE2ServiceCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E2_SERVICE_CATEGORY_SLUG_SET.has(value)
  );
}

export function isWaveE3CategorySlug(value: unknown): boolean {
  return typeof value === 'string' && WAVE_E3_CATEGORY_SLUG_SET.has(value);
}

export function isWaveE4PlaceCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E4_PLACE_CATEGORY_SLUG_SET.has(value)
  );
}

export function isWaveE5PlaceCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E5_PLACE_CATEGORY_SLUG_SET.has(value)
  );
}

export function isWaveE5ServiceCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E5_SERVICE_CATEGORY_SLUG_SET.has(value)
  );
}

export function isWaveE6ProductCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E6_PRODUCT_CATEGORY_SLUG_SET.has(value)
  );
}

export function isWaveE6ServiceCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' && WAVE_E6_SERVICE_CATEGORY_SLUG_SET.has(value)
  );
}

/** Wave E2, Wave E5, and Wave E6 services: masters with `entity_type = 'service'`. */
export function isServiceCategorySlug(value: unknown): boolean {
  return (
    isWaveE2ServiceCategorySlug(value) ||
    isWaveE5ServiceCategorySlug(value) ||
    isWaveE6ServiceCategorySlug(value)
  );
}

/** Wave E4 and Wave E5 places: masters with `entity_type = 'place'`. */
export function isPlaceCategorySlug(value: unknown): boolean {
  return isWaveE4PlaceCategorySlug(value) || isWaveE5PlaceCategorySlug(value);
}

/**
 * Keep the 5 core tech categories, any populated Wave E1/E2 category, or the
 * explicitly opened category visible while hiding unseeded Wave E1/E2 tabs/cards.
 */
export function isCategoryVisibleInDirectory(
  slug: string,
  productCount: number,
  activeSlug?: string | null
): boolean {
  if (productCount > 0) return true;
  if (activeSlug && slug === activeSlug) return true;
  return isCoreTechCategorySlug(slug);
}

export function resolveListingPriceCurrency(options: {
  currency?: string | null;
  categorySlug?: string | null;
  metadata?: unknown;
  master?: {
    slug?: string | null;
    name?: string | null;
    model?: string | null;
    category_id?: string | null;
    metadata?: unknown;
    specifications?: unknown;
  } | null;
  offers?: ReadonlyArray<
    { currency?: string | null } | null | undefined
  > | null;
}): 'VND' | 'PCT' {
  if (typeof options.currency === 'string' && options.currency.trim()) {
    return options.currency.trim().toUpperCase() === 'PCT' ? 'PCT' : 'VND';
  }
  if (Array.isArray(options.offers)) {
    for (const offer of options.offers) {
      if (typeof offer?.currency === 'string' && offer.currency.trim()) {
        return offer.currency.trim().toUpperCase() === 'PCT' ? 'PCT' : 'VND';
      }
    }
  }
  const ownMeta =
    options.metadata &&
    typeof options.metadata === 'object' &&
    !Array.isArray(options.metadata)
      ? (options.metadata as Record<string, unknown>)
      : null;
  const masterMeta =
    options.master?.metadata &&
    typeof options.master.metadata === 'object' &&
    !Array.isArray(options.master.metadata)
      ? (options.master.metadata as Record<string, unknown>)
      : null;
  const metaCurrency = ownMeta?.currency ?? masterMeta?.currency;
  if (typeof metaCurrency === 'string' && metaCurrency.trim()) {
    return metaCurrency.trim().toUpperCase() === 'PCT' ? 'PCT' : 'VND';
  }
  const resolvedCategorySlug =
    options.categorySlug ||
    (options.master
      ? getMasterProductCategorySlug({
          slug: options.master.slug ?? '',
          name: options.master.name,
          model: options.master.model,
          category_id: options.master.category_id,
          metadata: masterMeta,
          specifications:
            options.master.specifications &&
            typeof options.master.specifications === 'object' &&
            !Array.isArray(options.master.specifications)
              ? (options.master.specifications as Record<string, unknown>)
              : null,
        })
      : null);
  if (resolvedCategorySlug === 'bank-savings') {
    return 'PCT';
  }
  return 'VND';
}

export function getMasterProductCategorySlug(
  rawProduct: Pick<MasterProduct, 'slug'> & {
    name?: string | null;
    model?: string | null;
    category_id?: string | null;
    metadata?: Record<string, unknown> | null;
    specifications?:
      { category_slug?: string | null } | Record<string, unknown> | null;
  },
  categorySlugById?: ReadonlyMap<string, string>
): CanonicalCategorySlug {
  const product = (
    rawProduct && typeof rawProduct === 'object' && !Array.isArray(rawProduct)
      ? rawProduct
      : { slug: '' }
  ) as typeof rawProduct;
  const catSlugFromMap =
    product.category_id &&
    categorySlugById &&
    typeof categorySlugById.get === 'function'
      ? categorySlugById.get(product.category_id)
      : undefined;
  const catSlugFromMeta =
    typeof product.metadata?.category_slug === 'string'
      ? product.metadata.category_slug
      : undefined;
  const catSlugFromSpecs =
    product.specifications &&
    typeof product.specifications === 'object' &&
    !Array.isArray(product.specifications) &&
    typeof (product.specifications as { category_slug?: unknown })
      .category_slug === 'string'
      ? (product.specifications as { category_slug: string }).category_slug
      : undefined;
  // Each hint trimmed and lower-cased, and the first canonical one wins, so
  // links, the sitemap and the category-path redirect agree (DOS/Rate#1366).
  const resolvedCat = [catSlugFromMap, catSlugFromMeta, catSlugFromSpecs]
    .map((hint) =>
      typeof hint === 'string'
        ? hint
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
            .slice(0, 64)
        : undefined
    )
    .find((hint) => isCanonicalCategorySlug(hint));

  if (isCanonicalCategorySlug(resolvedCat)) {
    return resolvedCat;
  }

  const haystack =
    `${product.name || ''} ${product.model || ''} ${product.slug}`
      .normalize('NFC')
      .toLowerCase();
  const isNonCreditCardItem =
    /(?<![\p{L}\d])(?:thẻ\s*(?:quà\s*tặng|nhớ|sim|cào|điện\s*thoại|nạp|game|garena|zing|học|tên|nhân\s*viên|từ|thang\s*máy|giữ\s*xe|bảo\s*hành|thành\s*viên|hội\s*viên|tập|bài|đồ\s*chơi)|the\s*(?:qua\s*tang|nho|sim|cao|dien\s*thoai|nap|game|hoc|ten|nhan\s*vien|tu|bao\s*hanh|thanh\s*vien|hoi\s*vien|tap|bai)|gift\s*cards?|memory\s*cards?|micro\s*sd|sd(?:xc|hc)?\s*cards?|tf\s*cards?|cfexpress|sim\s*cards?|card\s*readers?|đầu\s*đọc\s*thẻ|dau\s*doc\s*the|ví\s*(?:đựng\s*thẻ|da|nam|nữ|card)|vi\s*(?:dung\s*the|da|nam|nu|card)|(?:bao|hộp|túi|ngăn|kẹp|dây\s*đeo)\s*(?:đựng\s*|bảo\s*vệ\s*|da\s*đựng\s*)?thẻ|(?:bao|hop|tui|kep|day\s*deo)\s*(?:dung\s*|bao\s*ve\s*)?the|ốp\s*lưng|op\s*lung|bóp|bop|miếng\s*dán|mieng\s*dan|sticker|skin\s*dán|máy\s*quẹt\s*thẻ|may\s*quet\s*the|card\s*holders?|rfid\s*(?:wallet|sleeve|blocker|holder)|chống\s*rfid|flash\s*cards?|bộ\s*thẻ|bo\s*the|(?:trả\s*góp|tra\s*gop|thanh\s*toán|thanh\s*toan|giảm\s*giá|giam\s*gia)\s*(?:\d+%\s*)?(?:(?:qua|bằng|bang|với|voi)\s+)?(?:thẻ\s*tín\s*dụng|the\s*tin\s*dung)|iphone|ipad|macbook|galaxy[\s-]*(?:s\d|z[\s-]*|a\d|m\d|tab|watch|buds)|điện[\s-]*thoại|laptop|máy[\s-]*tính|màn[\s-]*hình|man[\s-]*hinh|máy[\s-]*ảnh|may[\s-]*anh|camera|vps|hosting|tivi|tủ\s*lạnh|máy\s*giặt|điều\s*hòa|điều\s*hoà|máy\s*lạnh|máy\s*lọc\s*(?:không\s*)?khí|tai\s*nghe|airpods|apple\s*watch|smartwatch|đồng\s*hồ|smart\s*tv|oled\s*tv|qled\s*tv|xiaomi|redmi|poco|oppo|vivo|realme)(?![\p{L}\d])/iu.test(
      haystack
    );
  if (
    !isNonCreditCardItem &&
    /(?<![\p{L}\d])(?:thẻ\s*tín\s*dụng|the\s*tin\s*dung|credit\s*cards?|thẻ\s*(?:visa|mastercard|jcb|amex)\s*tín\s*dụng|mở\s*thẻ\s*(?:tín\s*dụng|visa|mastercard|jcb))(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'credit-cards';
  }
  if (
    /(?<![\p{L}\d])(?:gửi tiết kiệm|tiết kiệm trực tuyến|tiết kiệm online|lãi suất tiết kiệm|bank savings?|term deposit|vietcombank|acb)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'bank-savings';
  }
  if (
    /(?<![\p{L}\d])(?:gói cước internet|cáp quang|lắp mạng|home net|internet giga|vnpt|fpt telecom|fpttelecom)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'internet-telecom';
  }
  const isNonVpsHostingItem =
    /(?<![\p{L}\d])(?:chứng[\s-]*khoán|chung[\s-]*khoan|cổ[\s-]*phiếu|co[\s-]*phieu|securities|điện[\s-]*thoại|dien[\s-]*thoai|smartphone|iphone|ipad|macbook|laptop|máy[\s-]*tính[\s-]*(?:xách[\s-]*tay|bảng)|tablet|tivi|smart[\s-]*tv|màn[\s-]*hình|man[\s-]*hinh|máy[\s-]*ảnh|may[\s-]*anh|camera|tai[\s-]*nghe|airpods|smartwatch|đồng[\s-]*hồ|tủ[\s-]*lạnh|máy[\s-]*giặt|điều[\s-]*hòa|điều[\s-]*hoà|máy[\s-]*lạnh|máy[\s-]*lọc|router|switch|cáp[\s-]*mạng|ổ[\s-]*cứng[\s-]*di[\s-]*động|box[\s-]*ssd|ốp[\s-]*lưng|túi[\s-]*đựng|sách|khóa[\s-]*học|khoa[\s-]*hoc)(?![\p{L}\d])/iu.test(
      haystack
    );
  if (
    !isNonVpsHostingItem &&
    /(?<![\p{L}\d])(?:cloud[\s-]*vps|vps[\s-]*(?:hosting|giá[\s-]*rẻ|gia[\s-]*re|nvme|ssd|việt[\s-]*nam|viet[\s-]*nam|vn|pro|linux|windows|cao[\s-]*cấp|starter|basic|standard|business|enterprise|gpu|storage|\d+[\s-]*(?:vcpu|core|gb))|thuê[\s-]*vps|thue[\s-]*vps|gói[\s-]*vps|goi[\s-]*vps|máy[\s-]*chủ[\s-]*ảo|may[\s-]*chu[\s-]*ao|cloud[\s-]*server|thuê[\s-]*máy[\s-]*chủ|thue[\s-]*may[\s-]*chu|dedicated[\s-]*server|(?:web|wordpress|ssd|nvme|cloud|business|reseller|linux|windows|seo|email)[\s-]*hosting|thuê[\s-]*hosting|thue[\s-]*hosting|gói[\s-]*hosting|goi[\s-]*hosting|chỗ[\s-]*đặt[\s-]*máy[\s-]*chủ|colocation|nhanhoa|nh[aâ]n[\s-]*h[oò]a|pavietnam|p\.?[\s-]*a\.?[\s-]*vi[eệ]t[\s-]*nam|hostvn|bkns|longvan|long[\s-]*v[aâ]n|\bvps\b)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'vps-hosting';
  }
  if (
    /(?<![\p{L}\d])(?:máy lọc không khí|air purifier|lọc không khí)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'air-purifiers';
  }
  if (
    /(?<![\p{L}\d])(?:máy giặt|washing machine|washer)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'washing-machines';
  }
  if (
    /(?<![\p{L}\d])(?:tủ lạnh|refrigerator|fridge)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'refrigerators';
  }
  if (
    /(?<![\p{L}\d])(?:điều hòa|điều hoà|máy lạnh|air conditioner)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'air-conditioners';
  }
  if (
    (/(?<![\p{L}\d])tivi(?![\p{L}\d])/iu.test(haystack) ||
      /(?<![\p{L}\d])(?:smart|google|android|qled|oled|mini led)\s*tv(?![\p{L}\d])/iu.test(
        haystack
      )) &&
    !/(?<![\p{L}\d])(?:apple tv|tv box)(?![\p{L}\d])/iu.test(haystack)
  ) {
    return 'tvs';
  }
  const isNonMonitorItem =
    /(?<![\p{L}\d])(?:điện[\s-]*thoại|dien[\s-]*thoai|smartphone|iphone|ipad|macbook|laptop|máy[\s-]*tính[\s-]*(?:xách[\s-]*tay|bảng)|ultrabook|tablet|thinkpad|ideapad|zenbook|vivo[\s-]*book|inspiron|latitude|pavilion|envy|victus|surface[\s-]*laptop|galaxy[\s-]*(?:s\d|z[\s-]*|a\d|m\d|tab|watch|buds)|redmi[\s-]*(?:note|pad|\d)|poco|oppo|vivo(?!\s*display)|realme|smartwatch|đồng[\s-]*hồ|tai[\s-]*nghe|airpods|tivi|smart[\s-]*tv|oled[\s-]*tv|qled[\s-]*tv|google[\s-]*tv|android[\s-]*tv|máy[\s-]*ảnh|may[\s-]*anh|camera|ô[\s-]*tô|o[\s-]*to|xe[\s-]*hơi|android[\s-]*box|thay[\s-]*màn[\s-]*hình|màn[\s-]*hình[\s-]*(?:thay[\s-]*thế|zin|bóc[\s-]*máy|linh[\s-]*kiện|điện[\s-]*thoại|laptop|iphone|ipad)|ép[\s-]*kính|giá[\s-]*treo|gia[\s-]*treo|tay[\s-]*(?:đỡ|nâng)|arm[\s-]*màn[\s-]*hình|arm[\s-]*man[\s-]*hinh|chân[\s-]*đế[\s-]*rời|dán[\s-]*màn[\s-]*hình|dan[\s-]*man[\s-]*hinh|kính[\s-]*cường[\s-]*lực|kinh[\s-]*cuong[\s-]*luc|miếng[\s-]*dán|tấm[\s-]*bảo[\s-]*vệ|đèn[\s-]*treo[\s-]*màn[\s-]*hình|monitor[\s-]*(?:arm|mount|stand|light[\s-]*bar|riser|hood|protector|cable)|screen[\s-]*protectors?|baby[\s-]*monitor|blood[\s-]*pressure[\s-]*monitor|heart[\s-]*rate[\s-]*monitor|máy[\s-]*đo[\s-]*huyết[\s-]*áp|cáp[\s-]*(?:hdmi|displayport|vga))(?![\p{L}\d])/iu.test(
      haystack
    );
  if (
    !isNonMonitorItem &&
    (/(?<![\p{L}\d])(?:màn[\s-]*hình[\s-]*(?:máy[\s-]*tính|pc|gaming|cong|đồ[\s-]*họa|đồ[\s-]*hoạ|văn[\s-]*phòng|rời|di[\s-]*động|chuyên[\s-]*đồ[\s-]*họa|chơi[\s-]*game|phẳng|led|lcd|ips|oled|va|mini[\s-]*led|4k|2k|qhd|wqhd|fhd|ultrawide)|man[\s-]*hinh[\s-]*(?:may[\s-]*tinh|pc|gaming|cong|do[\s-]*hoa|van[\s-]*phong|roi|di[\s-]*dong)|(?:gaming|ultrawide|computer|pc|curved|oled|4k|2k|portable|ips)[\s-]*monitors?|ultrasharp|odyssey[\s-]*(?:g\d+[a-z0-9-]*|neo|oled|ark)|proart(?:[\s-]*display|[\s-]*pa\d+[a-z0-9-]*)?|tuf[\s-]*gaming[\s-]*vg\d+[a-z0-9-]*|rog[\s-]*(?:strix|swift)[\s-]*(?:xg|pg)\d+[a-z0-9-]*|ultragear|benq[\s-]*(?:mobiuz|pd\d+[a-z0-9-]*|sw\d+[a-z0-9-]*|gw\d+[a-z0-9-]*|ex\d+[a-z0-9-]*|zowie[\s-]*xl\d+[a-z0-9-]*)|zowie[\s-]*xl\d+[a-z0-9-]*|viewsonic[\s-]*(?:vx|vg|va|vp|xg|omni)\d+[a-z0-9-]*|aoc[\s-]*(?:(?:24g|27g|q27g|cu34|c24g|c27g|ag|24b|27b)[a-z0-9-]*|agon)|msi[\s-]*(?:optix|mpg|mag|modern[\s-]*md|pro[\s-]*mp|g\d{2}[a-z])[\s-]*[a-z0-9-]+|gigabyte[\s-]*(?:m27|m28|m32|g24|g27|g32|gs27|gs32|fo\d|fi\d|aorus[\s-]*(?:fo|fi|fv|co))[a-z0-9-]*|dell[\s-]*(?:u\d{4}|p\d{4}|s\d{4}|g\d{4}|se\d{4}|e\d{4}|aw\d{4})[a-z0-9-]*|alienware[\s-]*aw\d{4}[a-z0-9-]*|lg[\s-]*(?:\d{2}(?:up|ul|gp|gr|gn|gq|mr|mp|uq|un|bp|bn|wq|gs|gx)\d{2,3}[a-z0-9-]*|dualup|ergo)|philips[\s-]*(?:evnia|\d{2}[a-z]\d{1,4}[a-z0-9-]*)|hkc[\s-]*(?:mg|mb|ant|gs|g\d)[a-z0-9-]*|ktc[\s-]*(?:h\d{2}|m\d{2}|g\d{2})[a-z0-9-]*|acer[\s-]*(?:nitro[\s-]*(?:vg|xv|kg|ed|qg|xf)|predator[\s-]*(?:xb|x\d{2}|cg)|ka\d{3}|ek\d{3}|sa\d{3})[a-z0-9-]*|lenovo[\s-]*(?:thinkvision|legion[\s-]*(?:r\d{2}|y\d{2}|g\d{2})[a-z0-9-]*)|hp[\s-]*(?:omen[\s-]*\d{2}[a-z]|e\d{2}[a-z]?|m\d{2}[a-z]|z\d{2}[a-z])[a-z0-9-]*|xiaomi[\s-]*(?:mi[\s-]*)?(?:desktop[\s-]*monitor|gaming[\s-]*monitor|curved[\s-]*gaming[\s-]*monitor|(?:g24|g27|a24|a27|p27)[a-z0-9-]*))(?![\p{L}\d])/iu.test(
      haystack
    ) ||
      /^\s*(?:(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*)*(?:màn[\s-]*hình|man[\s-]*hinh)(?![\p{L}\d])/iu.test(
        haystack
      ))
  ) {
    return 'monitors';
  }
  const isNonCameraItem =
    /(?<![\p{L}\d])(?:điện[\s-]*thoại|dien[\s-]*thoai|smartphone|iphone|ipad|macbook|laptop|máy[\s-]*tính[\s-]*(?:xách[\s-]*tay|bảng)|tablet|galaxy[\s-]*(?:s\d|z[\s-]*|a\d|m\d|tab|watch|buds)|redmi|poco|oppo|vivo|realme|smartwatch|đồng[\s-]*hồ|tai[\s-]*nghe|airpods|tivi|smart[\s-]*tv|màn[\s-]*hình[\s-]*(?:máy[\s-]*tính|pc|gaming|cong)|camera[\s-]*(?:hành[\s-]*trình|hanh[\s-]*trinh|an[\s-]*ninh|giám[\s-]*sát|giam[\s-]*sat|wifi|wi-fi|ip|quan[\s-]*sát|ngoài[\s-]*trời|trong[\s-]*nhà|lùi|ô[\s-]*tô|xe[\s-]*hơi|xe[\s-]*máy|nội[\s-]*soi|cửa|chuông[\s-]*cửa|360[\s-]*(?:wifi|trong[\s-]*nhà|ngoài[\s-]*trời|ezviz|imou|tapo|xiaomi|yoosee))|dash[\s-]*cam|dashcam|cctv|security[\s-]*camera|ip[\s-]*camera|ezviz|imou|tapo[\s-]*c\d|yoosee|hikvision|dahua|kbvision|webcam|web[\s-]*cam|flycam|drone|mavic|đồ[\s-]*chơi|trẻ[\s-]*em|cho[\s-]*bé)(?![\p{L}\d])/iu.test(
      haystack
    ) ||
    /^\s*(?:(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*)*(?:ống[\s-]*kính|ong[\s-]*kinh|lens|chân[\s-]*máy|chan[\s-]*may|tripods?|monopods?|gimbals?|túi[\s-]*(?:đựng[\s-]*)?máy[\s-]*ảnh|ba[\s-]*lô[\s-]*máy[\s-]*ảnh|balo[\s-]*máy[\s-]*ảnh|thẻ[\s-]*nhớ|the[\s-]*nho|memory[\s-]*cards?|kính[\s-]*lọc|kinh[\s-]*loc|filters?|lens[\s-]*hoods?|hood|loa[\s-]*che[\s-]*nắng|ngàm[\s-]*chuyển|ngam[\s-]*chuyen|mount[\s-]*adapters?|pin[\s-]*(?:rời|sạc|dự[\s-]*phòng|máy[\s-]*ảnh)|sạc[\s-]*rời|đèn[\s-]*flash|tủ[\s-]*chống[\s-]*ẩm|nắp[\s-]*(?:ống[\s-]*kính|lens|body)|khung[\s-]*bảo[\s-]*vệ|cage|ốp|miếng[\s-]*dán|dây[\s-]*đeo)(?![\p{L}\d])/iu.test(
      haystack
    ) ||
    (/(?<![\p{L}\d])(?:ống[\s-]*kính|ong[\s-]*kinh|lens|chân[\s-]*máy|tripods?|túi[\s-]*đựng|thẻ[\s-]*nhớ|memory[\s-]*cards?|kính[\s-]*lọc|filters?|hood|ngàm[\s-]*chuyển|pin[\s-]*rời|sạc[\s-]*rời|tủ[\s-]*chống[\s-]*ẩm)(?![\p{L}\d])/iu.test(
      haystack
    ) &&
      !/(?<![\p{L}\d])(?:máy[\s-]*ảnh|may[\s-]*anh|body|kit|mirrorless|dslr|action[\s-]*cam|camera[\s-]*hành[\s-]*động|camera[\s-]*hanh[\s-]*dong|gopro[\s-]*hero|osmo[\s-]*(?:action|pocket)|insta360|powershot|coolpix|instax)(?![\p{L}\d])/iu.test(
        haystack
      ));
  if (
    !isNonCameraItem &&
    /(?<![\p{L}\d])(?:máy[\s-]*ảnh|may[\s-]*anh|mirrorless|dslr|action[\s-]*cam(?:era)?|camera[\s-]*(?:hành[\s-]*động|hanh[\s-]*dong|thể[\s-]*thao|the[\s-]*thao)|máy[\s-]*quay[\s-]*(?:phim|vlog|cầm[\s-]*tay|hành[\s-]*động|360)|gopro[\s-]*(?:hero(?:[\s-]*\d+[a-z0-9-]*|[\s-]*max|[\s-]*mini|[\s-]*black)?|max)|dji[\s-]*(?:osmo[\s-]*(?:action|pocket)|action[\s-]*\d+[a-z0-9-]*|pocket[\s-]*\d+[a-z0-9-]*)|insta360[\s-]*(?:x\d+[a-z0-9-]*|ace|go[\s-]*\d+[a-z0-9-]*|one[\s-]*(?:r|rs|x))|sony[\s-]*(?:alpha|a\d{1,4}[a-z0-9-]*|zv-[a-z0-9-]+|fx\d+[a-z0-9-]*|rx\d+[a-z0-9-]*|ilce-[a-z0-9-]+|dsc-[a-z0-9-]+)|canon[\s-]*(?:eos|powershot|ixus)|fujifilm[\s-]*(?:x-[a-z0-9-]+|gfx[\s-]*\d+[a-z0-9-]*|instax)|nikon[\s-]*(?:z[\s-]*\d+[a-z0-9-]*|z[\s-]*f[c]?|d\d{3,4}[a-z0-9-]*|coolpix)|(?:panasonic[\s-]*)?lumix[\s-]*(?:s\d|g\d|gh\d|gx\d|tz\d|lx\d)[a-z0-9-]*|om[\s-]*system[\s-]*om-\d+[a-z0-9-]*|olympus[\s-]*(?:om-d|pen[\s-]*e-[a-z0-9-]+|tg-\d+[a-z0-9-]*)|leica[\s-]*(?:q\d+[a-z0-9-]*|m\d+[a-z0-9-]*|sl\d+[a-z0-9-]*|d-lux|sofort)|ricoh[\s-]*gr[\s-]*(?:iii|ii|3|2)[a-z0-9-]*)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'cameras';
  }
  if (
    /ipad|galaxy tab|xiaomi pad|matepad|redmi pad|tab s\d|tab a\d|tab p\d|tab m\d|oneplus pad|oppo pad|vivo pad|honor pad|surface pro|tablet|máy tính bảng/i.test(
      haystack
    )
  ) {
    return 'tablets';
  }
  if (
    /macbook|thinkpad|zenbook|vivobook|inspiron|xps|latitude|legion|ideapad|lenovo\s+yoga|yoga\s+(?:slim|pro|book|duet|c?\d)|loq|rog|tuf|omen|victus|pavilion|spectre|envy|elitebook|probook|zbook|swift|aspire|predator|nitro|prestige|stealth|raider|katana|cyborg|modern \d|matebook|gram|surface laptop|ultrabook|laptop|máy tính xách tay/i.test(
      haystack
    )
  ) {
    return 'laptops';
  }
  if (
    /apple watch|galaxy watch|garmin|coros|suunto|fitbit|xiaomi watch|redmi watch|huawei watch|watch gt|watch fit|watch d|amazfit|miband|smart band|smartwatch|đồng hồ thông minh/i.test(
      haystack
    )
  ) {
    return 'smartwatches';
  }
  if (
    /airpods|galaxy buds|wf-1000xm|wh-1000xm|linkbuds|quietcomfort|momentum true wireless|tour pro|tune beam|tune buds|wave beam|liberty \d|space a40|soundcore|freebuds|nothing ear|pixel buds|beats fit|beats studio buds|enco|earbuds|tai nghe/i.test(
      haystack
    )
  ) {
    return 'earbuds';
  }
  if (
    /(?<![\p{L}\d])(?:mỹ phẩm|kem chống nắng|sữa rửa mặt|nước tẩy trang|kem dưỡng|son môi|tinh chất|serum|toner|retinol|niacinamide|miếng dán (?:mụn|lột mụn|trắng răng)|cosmetics?|skincare(?![\s-]*(?:spa|clinic|salon)(?![\p{L}\d]))|la roche-posay|bioderma|cerave)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'cosmetics';
  }
  if (
    /(?<![\p{L}\d])(?:thực phẩm chức năng|tpcn|viên uống|collagen|omega[\s-]?3|vitamin[\s-]?[a-z0-9]+|glucosamine|men vi sinh|bổ sung dinh dưỡng|whey\s*protein|creatine|supplements?|blackmores|doppelherz)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'supplements';
  }
  if (
    /(?<![\p{L}\d])(?:mẹ và bé|mẹ & bé|mother[- ]?baby|tã dán|tã quần|bỉm|sữa bột|sữa công thức|bình sữa|xe đẩy em bé|xe đẩy trẻ em|huggies|pampers|merries|moony|enfamil|similac|aptamil)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'mother-baby';
  }
  if (
    /(?<![\p{L}\d])(?:homestays?|home stay|farmstay|villa nghỉ dưỡng|bungalow|căn hộ nghỉ dưỡng)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'homestays';
  }
  if (
    /(?<![\p{L}\d])(?:khách sạn|khu nghỉ dưỡng|hotels?|resorts?|intercontinental|marriott|hilton|sheraton|melia|vinpearl|novotel|pullman)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'hotels';
  }
  if (
    /(?<![\p{L}\d])(?:quán cà phê|tiệm cà phê|tiệm trà|trà sữa|coffee shop|coffee house|highlands coffee|phúc long|starbucks|katinat|cộng cà phê|cong caphe|cafes?|café|espresso bar|roastery)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'cafes';
  }
  if (
    /(?<![\p{L}\d])(?:nhà hàng|quán ăn|quán nhậu|restaurants?|bistro|buffet|lẩu|nướng bbq|quán phở|bún chả|cơm tấm|haidilao|manwah|gogi house|kichi kichi|pizza 4p)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'restaurants';
  }
  // Wave E5 places run after Wave E3 retail checks and reject retail product nouns
  // (e.g. gym bags/mats/gloves/shakers/supplements, oral-care devices/consumables,
  // exercise machines, spa skincare/beauty devices, English textbooks/flashcards/pens/toys)
  // while keeping Vietnamese district names like Tan Binh / Binh Thanh unblocked
  // (DOS/Rate#1937, DOS/Rate#1943, DOS/Rate#1968).
  const hasRetailEssentialOil =
    /(?<![\p{L}\d])(?:tinh\s*dầu|tinh\s*dau)(?![\p{L}\d])/iu.test(haystack) &&
    (/(?<![\p{L}\d])(?:chai|lọ|(?:\d+\s*)?(?:ml|lít|lit)|máy\s*xông|may\s*xong|đèn\s*xông|den\s*xong)(?![\p{L}\d])/iu.test(
      haystack
    ) ||
      !/(?<![\p{L}\d])(?:spa|massage|mát\s*xa|thẩm\s*mỹ|tham\s*my|clinic)(?![\p{L}\d])/iu.test(
        haystack
      ));
  const isWaveE5RetailProduct =
    hasRetailEssentialOil ||
    /(?<![\p{L}\d])(?:túi|thảm|găng|bình\s*(?:lắc|nước|giữ\s*nhiệt|thể\s*thao|uống|xịt|đựng|tập)|shaker|dây|whey|creatine|protein|bcaa|bàn\s*chải|máy\s*tăm|tăm\s*nước|miếng\s*dán|kem|gel|nước\s*súc\s*miệng|chỉ\s*nha\s*khoa|tăm\s*chỉ|sáp\s*(?:nha\s*khoa|wax)|xịt\s*(?:thơm\s*miệng|khoáng)|xit\s*khoang|bột\s*(?:tẩy\s*trắng|trắng\s*răng|đánh\s*răng|protein|whey)|máng\s*(?:tẩy\s*trắng|chống\s*nghiến)|tạ\s*(?:tay|đơn|đòn|ấm|bánh|chân|tập)|đai\s*(?:lưng|tập|kháng\s*lực|quấn)|khăn\s*(?:tập|gym|lau)|(?:quần|áo|giày)\s*(?:tập|gym|yoga|thể\s*thao)|bóng\s*(?:tập|yoga)|gạch\s*yoga|xà\s*đơn|máy\s*(?:chạy\s*bộ|tập|massage|mát\s*xa|triệt\s*lông|rửa\s*mặt|xông\s*(?:mặt|hơi)|hút\s*mụn|nâng\s*cơ|đẩy\s*tinh\s*chất|làm\s*đẹp|chăm\s*sóc\s*da|cạo\s*râu|sấy\s*tóc|uốn\s*tóc|phiên\s*dịch|học\s*tiếng\s*anh|đọc\s*sách|nghe\s*tiếng\s*anh)|may\s*(?:chay\s*bo|tap|massage|mat\s*xa|triet\s*long|rua\s*mat|xong\s*(?:mat|hoi)|hut\s*mun|nang\s*co|lam\s*dep|phien\s*dich|hoc\s*tieng\s*anh)|giàn\s*(?:tạ|tập)|(?<!khong\s)(?<!thoi\s)(?<!không\s)(?<!thời\s)gian\s*(?:ta|tap)|xe\s*đạp\s*tập|xe\s*dap\s*tap|ghế\s*(?:tập|đẩy\s*tạ|massage)|ghe\s*(?:tap|day\s*ta|massage)|giường\s*(?:spa|massage|gội)|giuong\s*(?:spa|massage|goi)|serum|lotion|toner|essence|ampoule|dầu\s*(?:massage|gội|xả|dưỡng)|dau\s*(?:massage|goi|xa|duong)|mặt\s*nạ|mat\s*na|sữa\s*(?:dưỡng|tắm|rửa\s*mặt)|sua\s*(?:duong|tam|rua\s*mat)|tẩy\s*tế\s*bào\s*chết|tay\s*te\s*bao\s*chet|nước\s*hoa|nuoc\s*hoa|(?:kem|bột|bot|sữa|sua|set|hũ|hu|tuýp|tuyp|chai)\s*(?:ủ\s*trắng|u\s*trang)|tắm\s*trắng\s*(?:tại\s*nhà|body)|đèn\s*(?:led\s*spa|chiếu\s*sinh\s*học|xông\s*tinh\s*dầu)|bồn\s*(?:ngâm\s*chân|tắm\s*spa)|(?:cây|thanh)\s*lăn|miếng\s*lột|wax\s*lông|bộ\s*dụng\s*cụ\s*(?:nặn\s*mụn|spa|làm\s*đẹp)|nến\s*thơm|muối\s*tắm|đá\s*massage|facial\s*(?:steamer|device|roller|brush|mask)|(?:eye|sheet|face)\s*mask|massage\s*(?:gun|chair|oil|machine)|epilator|ipl\s*device|sách|sach|(?:sách|sach|bộ|bo|cuốn|cuon|tập|tap|combo)\s*(?:giáo\s*trình|giao\s*trinh)|^\s*(?:giáo\s*trình|giao\s*trinh)|tài\s*liệu\s*(?:luyện\s*thi|ôn\s*thi|học|tiếng\s*anh|ielts|toeic)|tai\s*lieu\s*(?:luyen\s*thi|on\s*thi|hoc|tieng\s*anh|ielts|toeic)|từ\s*điển|tu\s*dien|flash\s*cards?|thẻ\s*(?:học|từ\s*vựng|flashcard)|the\s*(?:hoc|tu\s*vung)|bút\s*(?:chấm\s*đọc|thông\s*minh|dịch|scan|từ\s*điển)|but\s*(?:cham\s*doc|thong\s*minh|dich|scan)|bảng\s*(?:chữ\s*cái|học\s*tiếng\s*anh)|đồ\s*chơi|do\s*choi|truyện\s*(?:song\s*ngữ|tiếng\s*anh|tranh)|truyen\s*(?:song\s*ngu|tieng\s*anh)|vở\s*(?:tập\s*viết|bài\s*tập|ghi\s*chép)|vo\s*(?:tap\s*viet|bai\s*tap)|bộ\s*(?:sách|đề\s*thi|thẻ\s*học|tài\s*liệu)|bo\s*(?:sach|de\s*thi|the\s*hoc)|textbooks?|workbooks?|dictionar(?:y|ies)|(?:talking|speaking)\s*pen|learning\s*toys?|toothbrush|flosser|mouthwash|toothpaste|gym\s*bag|yoga\s*mat)(?![\p{L}\d])/iu.test(
      haystack
    );
  if (
    !isWaveE5RetailProduct &&
    (/(?<![\p{L}\d])(?:phòng\s*khám\s*(?:nha|răng)|trung\s*tâm\s*nha\s*khoa|bệnh\s*viện\s*răng\s*hàm\s*mặt|hệ\s*thống\s*nha\s*khoa|he\s*thong\s*nha\s*khoa|nha\s*khoa\s*(?:quốc\s*tế|thẩm\s*mỹ)|dental\s*(?:clinic|center|centre|hospital))(?![\p{L}\d])/iu.test(
      haystack
    ) ||
      /^\s*nha\s*khoa(?![\p{L}\d])/iu.test(haystack))
  ) {
    return 'dental-clinics';
  }
  if (
    !isWaveE5RetailProduct &&
    /(?<![\p{L}\d])(?:phòng\s*(?:tập\s*)?(?:gym|thể\s*hình|fitness)|trung\s*tâm\s*(?:thể\s*hình|fitness|gym)|(?:fitness|gym)\s*(?:center|centre|club)|california\s*fitness|citi\s*gym|elite\s*fitness|get\s*fit\s*gym|the\s*new\s*gym|swequity)(?![\p{L}\d])/iu.test(
      haystack
    )
  ) {
    return 'gyms-fitness';
  }
  if (
    !isWaveE5RetailProduct &&
    (/(?<![\p{L}\d])(?:thẩm\s*mỹ\s*viện|tham\s*my\s*vien|viện\s*thẩm\s*mỹ|vien\s*tham\s*my|bệnh\s*viện\s*thẩm\s*mỹ|benh\s*vien\s*tham\s*my|trung\s*tâm\s*thẩm\s*mỹ|trung\s*tam\s*tham\s*my|hệ\s*thống\s*(?:thẩm\s*mỹ|spa)|he\s*thong\s*(?:tham\s*my|spa)|phòng\s*khám\s*(?:da\s*liễu\s*thẩm\s*mỹ|thẩm\s*mỹ)|tmv\s*(?:thu\s*c[uú]c|kangnam|ng[oọ]c\s*dung|mailisa)|spa\s*(?:chăm\s*sóc\s*da|làm\s*đẹp|trị\s*mụn|massage|thư\s*giãn|dưỡng\s*sinh|thẩm\s*mỹ|clinic)|(?:beauty|aesthetic|skincare|day)[\s-]*(?:spa|clinic|salon)|thu\s*c[uú]c\s*(?:clinic|spa|thẩm\s*mỹ)|thẩm\s*mỹ\s*(?:thu\s*c[uú]c|kangnam|ng[oọ]c\s*dung|mailisa)|ng[oọ]c\s*dung\s*(?:clinic|spa|beauty)|seoul\s*center|g[aà]\s*spa|hasaki\s*clinic(?:\s*(?:&|and|và)\s*spa)?|hasaki\s*spa|shynh\s*house|menard\s*(?:facial\s*salon|spa|beauty)|(?:(?:thẩm\s*mỹ|tham\s*my|viện|vien|spa|clinic)\s*mailisa|mailisa\s*(?:thẩm\s*mỹ|tham\s*my|spa|clinic|viện|vien))|kangnam\s*(?:clinic|spa|hospital|thẩm\s*mỹ))(?![\p{L}\d])/iu.test(
      haystack
    ) ||
      /^\s*(?:spa|thẩm\s*mỹ\s*viện|viện\s*thẩm\s*mỹ)(?![\p{L}\d])/iu.test(
        haystack
      ))
  ) {
    return 'spas-aesthetics';
  }
  const isNonEnglishLanguageCenter =
    /(?<![\p{L}\d])(?:tiếng\s*(?:nhật|hàn|trung|pháp|đức|nga)|tieng\s*(?:nhat|han|trung|phap|duc|nga)|nhật\s*ngữ|nhat\s*ngu|hàn\s*ngữ|han\s*ngu|hoa\s*ngữ|hoa\s*ngu|jlpt|topik|hsk|tin\s*học|tin\s*hoc|japanese|korean|chinese|french|german)(?![\p{L}\d])/iu.test(
      haystack
    ) &&
    !/(?<![\p{L}\d])(?:tiếng\s*anh|tieng\s*anh|anh\s*ngữ|anh\s*ngu|anh\s*văn|anh\s*van|english|ielts|toeic|toefl)(?![\p{L}\d])/iu.test(
      haystack
    );
  if (
    !isWaveE5RetailProduct &&
    !isNonEnglishLanguageCenter &&
    (/(?<![\p{L}\d])(?:trung\s*tâm\s*(?:tiếng\s*anh|anh\s*ngữ|luyện\s*thi\s*(?:ielts|toeic))|trung\s*tam\s*(?:tieng\s*anh|anh\s*ngu|luyen\s*thi\s*(?:ielts|toeic))|hệ\s*thống\s*(?:anh\s*ngữ|tiếng\s*anh)|he\s*thong\s*(?:anh\s*ngu|tieng\s*anh)|học\s*viện\s*(?:anh\s*ngữ|tiếng\s*anh|ielts)|anh\s*ngữ\s*(?:quốc\s*tế|hội\s*việt\s*mỹ|ila|vus|yola|zim|acet|ames|ms\.?\s*hoa|apollo|apax)|anh\s*văn\s*hội\s*việt\s*mỹ|english\s*(?:center|centre|academy|school|institute)|vus|apollo\s*english|british\s*council|wall\s*street\s*english|yola|ielts\s*fighter|dol\s*english|zim\s*(?:academy|english|ielts)|apax\s*(?:english|leaders?)|language\s*link|ames\s*english|(?:anh\s*ngữ|anh\s*ngu)\s*ms\.?\s*hoa|ms\.?\s*hoa\s*(?:toeic|giao\s*tiếp|giao\s*tiep|junior|english|ielts)|ila\s*(?:vietnam|việt\s*nam|english|anh\s*ngữ)|acet\s*(?:vietnam|việt\s*nam|english|ielts|anh\s*ngữ))(?![\p{L}\d])/iu.test(
      haystack
    ) ||
      /^\s*(?:anh\s*ngữ|ila|acet)(?![\p{L}\d])/iu.test(haystack) ||
      /^\s*zim\s*(?:academy|english|ielts|quận|q\.?\s*\d|tp\.?\s*hcm|hà\s*nội|ha\s*noi|đà\s*nẵng|da\s*nang|cơ\s*sở|chi\s*nhánh)(?![\p{L}\d])/iu.test(
        haystack
      ))
  ) {
    return 'english-centers';
  }
  return 'smartphones';
}

/**
 * Resolve the canonical product detail route (`/smartphones/[slug]`, `/tablets/[slug]`, `/laptops/[slug]`, `/smartwatches/[slug]`, or `/earbuds/[slug]`)
 * for a MasterProduct across all 5 categories.
 */
export function getMasterProductHref(
  product: Pick<MasterProduct, 'slug'> & {
    name?: string | null;
    model?: string | null;
    category_id?: string | null;
    metadata?: Record<string, unknown> | null;
    specifications?:
      { category_slug?: string | null } | Record<string, unknown> | null;
  },
  categorySlugById?: ReadonlyMap<string, string>
): string {
  const safeProduct =
    product && typeof product === 'object' && !Array.isArray(product)
      ? product
      : ({ slug: '' } as Pick<MasterProduct, 'slug'>);
  const catSlug = getMasterProductCategorySlug(safeProduct, categorySlugById);
  const rawSlug =
    typeof safeProduct.slug === 'string'
      ? safeProduct.slug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .replace(/^\/+|\/+$/g, '')
          .slice(0, 256)
      : '';
  const safeSlug =
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(rawSlug) &&
    !rawSlug.endsWith('.') &&
    !rawSlug.includes('..') &&
    !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(rawSlug)
      ? rawSlug
      : '';
  return safeSlug
    ? `/${catSlug}/${encodeURIComponent(safeSlug)}`
    : `/${catSlug}`;
}

/**
 * A product's `metadata` or `specifications` reduced to its category hint,
 * trimmed, lower-case and canonical only (null otherwise), the way
 * `getMasterProductCategorySlug` reads hints (DOS/Rate#1366).
 */
export const categorySlugOnly = (
  value: Record<string, unknown> | null | undefined
): { category_slug: string } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.category_slug !== 'string') return null;
  const slug = value.category_slug
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
  return isCanonicalCategorySlug(slug) ? { category_slug: slug } : null;
};

/**
 * The product's own URL when it is asked for under another category's path
 * (`/laptops/<phone>`), else null. Built with `getMasterProductHref`, the way
 * the site links products and lists them in the sitemap, so a redirect lands
 * on the listed URL (DOS/Rate#1366). Null too when no product URL can be
 * built: the page then renders as asked.
 */
export function foreignCategoryProductHref(
  product: Parameters<typeof getMasterProductHref>[0],
  categoryBasePath: string,
  categorySlugById: ReadonlyMap<string, string>
): string | null {
  const href = getMasterProductHref(product, categorySlugById);
  if (!/^\/[a-z-]+\/[^/]+$/.test(href)) return null;
  return href.startsWith(`${categoryBasePath}/`) ? null : href;
}

export interface MerchantListFilterParams {
  q?: string;
  platform?: string;
  officialOnly?: boolean;
  minTrust?: number;
  sort?: 'trust_desc' | 'products_desc' | 'seeding_asc' | 'followers_desc';
  limit?: number;
  /** Database-side filters, so a lookup reads only the merchants it needs. */
  ids?: readonly string[];
  platformShopIds?: readonly string[];
  /** Case-insensitive substring of the merchant name. */
  nameContains?: string;
}

function parseMerchantRiskBreakdownCandidate(
  raw: unknown
): MerchantRiskBreakdown | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.total_reviews !== 'number' ||
    !Number.isFinite(obj.total_reviews) ||
    obj.total_reviews < 0
  ) {
    return null;
  }
  const totalReviews = Math.round(obj.total_reviews);
  const seedingFakeCount =
    typeof obj.seeding_fake_count === 'number' &&
    Number.isFinite(obj.seeding_fake_count)
      ? Math.max(0, Math.round(obj.seeding_fake_count))
      : typeof obj.seeding_ratio === 'number' &&
          Number.isFinite(obj.seeding_ratio)
        ? Math.max(0, Math.round(totalReviews * obj.seeding_ratio))
        : 0;
  const coinSpamCount =
    typeof obj.coin_spam_count === 'number' &&
    Number.isFinite(obj.coin_spam_count)
      ? Math.max(0, Math.round(obj.coin_spam_count))
      : typeof obj.coin_spam_ratio === 'number' &&
          Number.isFinite(obj.coin_spam_ratio)
        ? Math.max(0, Math.round(totalReviews * obj.coin_spam_ratio))
        : 0;
  const sabotageOrBombingCount =
    typeof obj.sabotage_or_bombing_count === 'number' &&
    Number.isFinite(obj.sabotage_or_bombing_count)
      ? Math.max(0, Math.round(obj.sabotage_or_bombing_count))
      : typeof obj.sabotage_ratio === 'number' &&
          Number.isFinite(obj.sabotage_ratio)
        ? Math.max(0, Math.round(totalReviews * obj.sabotage_ratio))
        : 0;
  const authenticCount =
    typeof obj.authentic_count === 'number' &&
    Number.isFinite(obj.authentic_count)
      ? Math.max(0, Math.round(obj.authentic_count))
      : Math.max(
          0,
          totalReviews -
            seedingFakeCount -
            coinSpamCount -
            sabotageOrBombingCount
        );
  const flaggedTotal =
    coinSpamCount + seedingFakeCount + sabotageOrBombingCount;
  const suspiciousRatioPct =
    typeof obj.suspicious_ratio_pct === 'number' &&
    Number.isFinite(obj.suspicious_ratio_pct)
      ? Math.max(
          0,
          Math.min(100, Math.round(obj.suspicious_ratio_pct * 10) / 10)
        )
      : totalReviews > 0
        ? Math.round((flaggedTotal / totalReviews) * 1000) / 10
        : 0;

  return {
    total_reviews: totalReviews,
    authentic_count: authenticCount,
    coin_spam_count: coinSpamCount,
    seeding_fake_count: seedingFakeCount,
    sabotage_or_bombing_count: sabotageOrBombingCount,
    suspicious_ratio_pct: suspiciousRatioPct,
  };
}

export function extractPersistedBreakdown(
  m: Pick<RawMerchantSafeRow, 'review_risk_breakdown' | 'metadata'>
): MerchantRiskBreakdown | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return null;
  }
  const fromTopLevel = parseMerchantRiskBreakdownCandidate(
    m.review_risk_breakdown
  );
  if (fromTopLevel) {
    return fromTopLevel;
  }
  if (
    m.metadata &&
    typeof m.metadata === 'object' &&
    !Array.isArray(m.metadata)
  ) {
    const fromMetaBreakdown = parseMerchantRiskBreakdownCandidate(
      m.metadata.review_risk_breakdown
    );
    if (fromMetaBreakdown) {
      return fromMetaBreakdown;
    }
  }
  return null;
}

/**
 * Pure post-query filter, sort, and limit helper for tracked merchants (#347).
 * Ensures `?q=`, `?min_trust=`, and `?sort=` evaluate across the full candidate set
 * before slicing to `limit`, rather than truncating in SQL before filtering/sorting.
 */
export function filterAndSortMerchants(
  merchants: MerchantSummary[],
  params?: MerchantListFilterParams
): MerchantSummary[] {
  if (!Array.isArray(merchants)) return [];
  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : undefined;
  let results = merchants.filter((m): m is MerchantSummary =>
    Boolean(m && typeof m === 'object' && !Array.isArray(m))
  );

  const cleanQ =
    typeof safeParams?.q === 'string'
      ? safeParams.q
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200)
          .toLowerCase()
      : '';
  if (cleanQ) {
    results = results.filter((m) => {
      const name =
        typeof m.name === 'string'
          ? m.name
              .replace(/\p{Cc}+/gu, ' ')
              .replace(/\s+/g, ' ')
              .toLowerCase()
          : '';
      const shopId =
        typeof m.platform_shop_id === 'string'
          ? m.platform_shop_id.replace(/\p{Cc}+/gu, '').toLowerCase()
          : '';
      const platform =
        typeof m.platform === 'string'
          ? m.platform.replace(/\p{Cc}+/gu, '').toLowerCase()
          : '';
      const slug =
        typeof m.slug === 'string'
          ? m.slug.replace(/\p{Cc}+/gu, '').toLowerCase()
          : '';
      return (
        name.includes(cleanQ) ||
        shopId.includes(cleanQ) ||
        platform.includes(cleanQ) ||
        (Boolean(slug) && slug.includes(cleanQ))
      );
    });
  }

  if (
    typeof safeParams?.minTrust === 'number' &&
    Number.isFinite(safeParams.minTrust)
  ) {
    const safeMinTrust = Math.max(0, Math.min(100, safeParams.minTrust));
    // Any threshold, 0 included, needs a real score (DOS/Rate#1484).
    results = results.filter(
      (m) =>
        typeof m.trust_score === 'number' &&
        Number.isFinite(m.trust_score) &&
        m.trust_score >= safeMinTrust
    );
  }

  if (safeParams?.sort) {
    const safeNum = (v: unknown, fallback = 0): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    // A store with no trust score sorts after every scored one (DOS/Rate#1484).
    const trustOf = (m: MerchantSummary): number => safeNum(m.trust_score, -1);
    results.sort((a, b) => {
      switch (safeParams.sort) {
        case 'trust_desc':
          return (
            trustOf(b) - trustOf(a) ||
            safeNum(b.product_count) - safeNum(a.product_count)
          );
        case 'products_desc':
          return (
            safeNum(b.product_count) - safeNum(a.product_count) ||
            trustOf(b) - trustOf(a)
          );
        case 'seeding_asc':
          // Measured scores first: no reviews is not the lowest risk
          // (DOS/Rate#1249).
          return (
            Number(!hasReviewRiskEvidence(a.review_risk_breakdown)) -
              Number(!hasReviewRiskEvidence(b.review_risk_breakdown)) ||
            safeNum(a.review_risk_score, 100) -
              safeNum(b.review_risk_score, 100) ||
            trustOf(b) - trustOf(a)
          );
        case 'followers_desc':
          return (
            safeNum(b.follower_count) - safeNum(a.follower_count) ||
            trustOf(b) - trustOf(a)
          );
        default:
          return 0;
      }
    });
  }

  if (
    typeof safeParams?.limit === 'number' &&
    Number.isFinite(safeParams.limit) &&
    safeParams.limit >= 1
  ) {
    results = results.slice(0, Math.min(Math.floor(safeParams.limit), 5000));
  }

  return results;
}

/**
 * Sanitize user-supplied identifier before interpolating into a PostgREST `.or()` filter
 * so commas, parentheses, dots, or spaces cannot inject arbitrary PostgREST operators.
 */
export function sanitizePostgrestFilterToken(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export interface ParsedEcommerceUrl {
  isUrl: boolean;
  platform:
    | 'shopee'
    | 'lazada'
    | 'tiki'
    | 'tiktok'
    | 'cellphones'
    | 'tgdd'
    | 'fptshop'
    | 'hoangha'
    | 'didongviet'
    | 'phongvu'
    | 'dienmayxanh'
    | 'topzone'
    | 'gearvn'
    | 'nguyenkim'
    | 'shopdunk'
    | 'hacom'
    | 'clickbuy'
    | 'viettelstore'
    | 'pico'
    | 'mediamart'
    | 'memoryzone'
    | 'anphatpc'
    | 'rate'
    | null;
  platformShopId: string | null;
  platformItemId: string | null;
  internalSlug: string | null;
}

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const KNOWN_ECOMMERCE_DOMAIN_TOKEN_REGEX =
  /(?:^|\/\/|\.)(?:shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|cellphones\.com\.vn|thegioididong\.com|dienmayxanh\.com|topzone\.vn|fptshop\.com\.vn|hoanghamobile\.com|didongviet\.vn|phongvu\.vn|gearvn\.com|nguyenkim\.com|shopdunk\.com|hacom\.vn|clickbuy\.com\.vn|viettelstore\.vn|pico\.vn|mediamart\.vn|memoryzone\.com\.vn|anphatpc\.com\.vn|rate\.vn)(?:\/|$)/i;

const RETAIL_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'tin-tuc',
  'tin-khuyen-mai',
  'cong-nghe',
  'sforum',
  'dchannel',
  'hoi-dap',
  'huong-dan',
  'khuyen-mai',
  'hot-deal',
  'tra-gop',
  'thu-cu-doi-moi',
  'bao-hanh',
  'tra-bao-hanh',
  'tra-cuu-bao-hanh',
  'chinh-sach',
  'lien-he',
  'gioi-thieu',
  've-chung-toi',
  'tuyen-dung',
  'so-sanh',
  'so-sanh-san-pham',
  'compare',
  'cua-hang',
  'showroom',
  'sieu-thi',
  'he-thong-cua-hang',
  'he-thong-sieu-thi',
  'he-thong-showroom',
  'he-thong-trung-tam',
  'trung-tam-bao-hanh',
  'catalogsearch',
  'tim-kiem',
  'ket-qua-tim-kiem',
  'tim',
  'search',
  'filter',
  'cart',
  'gio-hang',
  'checkout',
  'thanh-toan',
  'account',
  'tai-khoan',
  'taikhoan',
  'login',
  'dang-nhap',
  'register',
  'dang-ky',
  'logout',
  'dang-xuat',
  'auth',
  'captcha',
  'challenge',
  'blog',
  'blogs',
  'news',
  'event',
  'su-kien',
  'landing',
  'collection',
  'collections',
  'pages',
  'page',
  'policies',
  'tag',
  'tags',
  'brand',
  'thuong-hieu',
  'buildpc',
  'xay-dung-cau-hinh',
  'sua-chua',
  'dich-vu',
  'may-cu',
  'hang-cu',
  'may-cu-gia-re',
  'likenew',
  'like-new',
  'outlet',
  'xa-kho',
  'ajax',
  'api',
  'media',
  'static',
  'assets',
  'cdn-cgi',
  'c',
  'danh-muc',
]);

const RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX =
  /^(?:chinh-sach-|quy-che-|huong-dan-|dieu-khoan-|gioi-thieu(?:-|$)|ve-chung-toi(?:-|$)|tin-khuyen-mai(?:-|$)|tin-tuc-|khuyen-mai-|sua-chua(?:-|$)|dich-vu(?:-|$)|tra-bao-hanh(?:-|$)|tra-cuu-bao-hanh(?:-|$)|he-thong-(?:cua-hang|sieu-thi|showroom|trung-tam)(?:-|$)|ket-qua-tim-kiem$|so-sanh(?:-san-pham)?$|buildpc$|xay-dung-cau-hinh$)/i;

const RETAIL_AUTH_SEGMENT_REGEX =
  /^(?:login|register|account|tai-khoan|taikhoan|dang-nhap|dang-ky|logout|dang-xuat|auth|captcha|challenge)$/i;

const RETAIL_STATIC_ASSET_EXT_REGEX =
  /\.(?:js|mjs|cjs|json|css|xml|txt|pdf|zip|rar|7z|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|eot|map|mp[34]|webm|aspx|ashx|axd|php)$/i;

const ANPHAT_DESK_PHONE_SLUG_REGEX =
  /^(?:dien-thoai-(?:huu-tuyen|ip|ban|de-ban|khong-day|keo-dai|hoi-nghi)|tong-dai-ip)(?:-|$)/i;

// A path ending in a bare brand lists that brand's products, as in
// cellphones.com.vn/mobile/apple.html or fptshop.com.vn/dien-thoai/samsung;
// no product slug is a brand alone (DOS/Rate#1246). Keep these rules in
// sync with extractIdsFromUrl in apps/extension/src/extractors/ecommerce-detector.ts.
const RETAIL_BRAND_LISTING_SLUGS = new Set([
  'apple',
  'samsung',
  'xiaomi',
  'redmi',
  'poco',
  'oppo',
  'vivo',
  'realme',
  'oneplus',
  'honor',
  'huawei',
  'nokia',
  'motorola',
  'sony',
  'google',
  'asus',
  'acer',
  'lenovo',
  'dell',
  'hp',
  'msi',
  'lg',
  'tecno',
  'infinix',
  'itel',
  'nubia',
  'zte',
  'masstel',
  'benco',
  'garmin',
  'amazfit',
  'jbl',
  'marshall',
  'anker',
  'baseus',
  'ugreen',
  'logitech',
  'razer',
  'corsair',
  'hyperx',
  'steelseries',
  'bose',
  'sennheiser',
  'gigabyte',
  'tcl',
  'mac',
]);

// "iphone-16-series" lists a series; a case or screen protector for it
// ("op-lung-iphone-16-series") is a product.
const ACCESSORY_SLUG_PREFIX =
  /^(?:op|bao|cuong-luc|kinh|mieng-dan|dan|sac|cu-sac|cap|day|tui|vo|ban-phim|chuot)-/;
const isSeriesListingSlug = (slug: string) =>
  /-series$/.test(slug) && !ACCESSORY_SLUG_PREFIX.test(slug);

const RETAIL_CATEGORY_ROOT_SLUGS = new Set([
  'dtdd',
  'mtb',
  'dien-thoai',
  'dien-thoai-di-dong',
  'dien-thoai-thong-minh',
  'mobile',
  'smartphones',
  'laptop',
  'laptops',
  'laptop-gaming',
  'laptop-gaming-do-hoa',
  'laptop-van-phong',
  'laptop-tablet-mobile',
  'may-tinh-xach-tay',
  'may-tinh-xach-tay-laptop',
  'may-tinh-bang',
  'may-tinh-bang-tablet',
  'tablet',
  'tablets',
  'dong-ho',
  'dong-ho-thong-minh',
  'smartwatch',
  'smartwatches',
  'tai-nghe',
  'tai-nghe-bluetooth',
  'tai-nghe-nhet-tai',
  'tai-nghe-chup-tai',
  'tai-nghe-gaming',
  'am-thanh',
  'thiet-bi-am-thanh',
  'loa',
  'earbuds',
  'phu-kien',
  'phu-kien-di-dong',
  'linh-kien',
  'linh-kien-may-tinh',
  'man-hinh',
  'man-hinh-may-tinh',
  'pc',
  'pc-gaming',
  'pc-van-phong-do-hoa',
  'may-tinh-de-ban',
  'gaming-gear',
  'tivi',
  'tu-lanh',
  'may-giat',
  'may-lanh',
  'gia-dung',
  'dien-gia-dung',
  'dien-may',
  'sim-so',
  'san-pham',
  'products',
  'product',
  'apple',
  'apple-iphone',
  'apple-ipad',
  'apple-watch',
  'iphone',
  'ipad',
  'macbook',
  'watch',
  'airpods',
]);

const MEDIAMART_ALLOWED_CATEGORY_PREFIXES = new Set([
  'smartphones',
  'dien-thoai',
  'dien-thoai-di-dong',
  'laptop',
  'may-tinh-xach-tay',
  'macbook',
  'may-tinh-bang',
  'tablet',
  'ipad',
  'smartwatch',
  'dong-ho-thong-minh',
  'tai-nghe',
  'san-pham',
  'products',
]);

const HACOM_CATEGORY_BRAND_SLUG_REGEX =
  /^(?:laptop-(?:asus(?:-(?:vivobook|zenbook|tuf|rog|expertbook|proart))?|dell(?:-(?:inspiron|vostro|xps|latitude|alienware|precision))?|acer(?:-(?:aspire|nitro|swift|predator|travelmate))?|lenovo(?:-(?:thinkpad|thinkbook|ideapad|legion|loq|yoga))?|hp(?:-(?:pavilion|victus|omen|envy|probook|elitebook|omnibook))?|msi(?:-(?:modern|katana|cyborg|prestige|stealth|raider|thin|sword))?|apple(?:-(?:macbook|macbook-air|macbook-pro))?|lg(?:-gram)?|gigabyte(?:-(?:aorus|aero|gaming))?)|may-tinh-nguyen-bo-theo-hang|may-tinh-mini-da-dung)$/i;

const CLICKBUY_NON_PRODUCT_SLUG_REGEX =
  /^(?:dien-thoai-(?:iphone|samsung|xiaomi|oppo|vivo|realme|nokia|honor|asus|tcl|google|sony|tecno|infinix|masstel|itel)|(?:iphone|samsung|dien-thoai|ipad|macbook|apple-watch)-cu|thay-pin|ep-kinh|google-pixel|trang)$/i;

const VIETTELSTORE_PRODUCT_CATEGORY_SEGMENTS = new Set([
  'dien-thoai',
  'may-tinh-bang',
  'tablet',
  'laptop',
  'may-tinh-xach-tay',
  'dong-ho-thong-minh',
  'dong-ho',
  'apple-watch',
  'smartwatch',
  'tai-nghe',
  'am-thanh',
  'loa',
  'phu-kien',
  'man-hinh',
  'pc',
  'tivi',
  'san-pham',
  'products',
]);

const VIETTELSTORE_NON_PRODUCT_PREFIXES = new Set([
  'tra-gop',
  'so-sanh',
  'so-sanh-san-pham',
  'tin-tuc',
  'chuyen-muc-tin',
  'landing',
  'khuyen-mai',
  'site',
  'he-thong-sieu-thi',
  'sieu-thi',
  'ho-tro',
  'tuyen-dung',
  'account',
  'login',
  'dang-nhap',
  'register',
  'dang-ky',
  'auth',
  'captcha',
  'challenge',
  'cart',
  'gio-hang',
  'dtdd',
  'mtb',
  'tim-kiem',
  'ket-qua-tim-kiem',
]);

const VIETTELSTORE_CATEGORY_SLUG_REGEX =
  /^(?:dtdd(?:-|$)|mtb(?:-|$)|laptop-(?:apple|asus|acer|dell|hp|lenovo|msi|lg)$|phu-kien-o-to$|bao-da-op-lung$|tam-dan$)/i;

const ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'template',
  'templates',
  'includes',
  'user',
  'order',
  'don-hang',
  'rss',
  'sitemap',
  'robots.txt',
]);

const ANPHAT_INFO_SUFFIX_REGEX =
  /(?:^|-)(?:he-thong-showroom|tin-khuyen-mai|tin-tuc|khuyen-mai|bao-hanh|chinh-sach|huong-dan|lien-he|tuyen-dung|gioi-thieu|pc-an-phat)$/i;

const ANPHAT_ACTIVE_DEVICE_SLUG_CUE_REGEX =
  /(?:^|[-/_])(?:laptop|may-tinh-xach-tay|macbook|ipad|may-tinh-bang|tablet|galaxy-tab|redmi-pad|xiaomi-pad|matepad|lenovo-tab|apple-watch|galaxy-watch|dong-ho|smartwatch|garmin|amazfit|tai-nghe|airpods|earbuds|galaxy-buds|redmi-buds|headphone|headset)(?:[-/_]|$)/i;

const ANPHAT_SMARTPHONE_SLUG_REGEX =
  /(?:^(?:dien-thoai|iphone|smartphone)(?:-|_|$)|(?:^|[-/_])(?:iphone-\d+|galaxy-(?:s\d+|z-(?:fold|flip)|a\d+|m\d+)|redmi-(?:note|\d+)|poco-[xfmc]\d+|oppo-(?:reno|find)|vivo-[vxyt]\d+|realme-(?:c\d+|gt|\d+)|xiaomi-\d+|google-pixel-\d+)(?:[-/_]|$))/i;

function isExcludedAnPhatPhoneSlug(slugLower: string): boolean {
  if (ANPHAT_DESK_PHONE_SLUG_REGEX.test(slugLower)) return true;
  if (/^(?:dien-thoai|iphone|smartphone)(?:-|_|$)/i.test(slugLower)) {
    return true;
  }
  return (
    ANPHAT_SMARTPHONE_SLUG_REGEX.test(slugLower) &&
    !ANPHAT_ACTIVE_DEVICE_SLUG_CUE_REGEX.test(slugLower)
  );
}

function sha1Hex10(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = ((n << 1) | (n >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp =
        ((((a << 5) | (a >>> 27)) >>> 0) + (f >>> 0) + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return (
    h0.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0')
  ).slice(0, 10);
}

/**
 * Encodes an An Phat Computer URL slug/path into canonical `ap-<slug>` format
 * (`<= 128` chars, matching `AnPhatScraper.sanitizeAnPhatItemId` in `DOS/Rate-Services`).
 */
export function sanitizeAnPhatItemId(rawKey: string): string {
  const cleaned = rawKey.trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned) return '';
  const normalized = cleaned.toLowerCase().replace(/[^a-z0-9-]/g, (ch) => {
    const hex = ch.codePointAt(0)?.toString(16).padStart(2, '0') ?? '00';
    return `_${hex}`;
  });
  if (!normalized) return '';
  const maxSlugLen = 125;
  if (normalized.length <= maxSlugLen) {
    return `ap-${normalized}`;
  }
  const digest = sha1Hex10(normalized);
  const keepLen = Math.max(1, maxSlugLen - digest.length - 1);
  let trimmed = normalized.slice(0, keepLen).replace(/[-_]+$/g, '');
  if (!trimmed) trimmed = normalized.slice(0, keepLen);
  return `ap-${trimmed}-${digest}`;
}

function extractValidRetailItemSlug(
  retailPlatform: NonNullable<ParsedEcommerceUrl['platform']>,
  segments: readonly string[]
): string | null {
  if (segments.length === 0) return null;

  for (const seg of segments) {
    const strippedSeg = seg
      .toLowerCase()
      .replace(/\.(?:html|htm|aspx|ashx|axd|php)$/i, '');
    if (
      RETAIL_AUTH_SEGMENT_REGEX.test(strippedSeg) ||
      RETAIL_AUTH_SEGMENT_REGEX.test(seg)
    ) {
      return null;
    }
  }

  const firstRawLower = segments[0]!.toLowerCase();
  const firstSegLower = firstRawLower.replace(/\.html?$/i, '');
  const lastRaw = segments[segments.length - 1]!;
  if (RETAIL_STATIC_ASSET_EXT_REGEX.test(lastRaw)) {
    return null;
  }
  if (
    (retailPlatform === 'nguyenkim' || retailPlatform === 'pico') &&
    /\.(?:c|b)$/i.test(lastRaw)
  ) {
    return null;
  }

  const isCollectionProductPath =
    segments.length === 4 &&
    firstSegLower === 'collections' &&
    segments[2]!.toLowerCase() === 'products';

  if (retailPlatform === 'gearvn') {
    if (
      !(segments.length === 2 && firstSegLower === 'products') &&
      !isCollectionProductPath
    ) {
      return null;
    }
  } else if (retailPlatform === 'memoryzone') {
    if (
      segments.length !== 1 &&
      !(segments.length === 2 && firstSegLower === 'products') &&
      !isCollectionProductPath
    ) {
      return null;
    }
  } else if (retailPlatform === 'mediamart') {
    if (
      segments.length !== 2 ||
      !MEDIAMART_ALLOWED_CATEGORY_PREFIXES.has(firstSegLower)
    ) {
      return null;
    }
  } else if (
    retailPlatform === 'tgdd' ||
    retailPlatform === 'dienmayxanh' ||
    retailPlatform === 'topzone'
  ) {
    if (segments.length < 2) return null;
  } else if (retailPlatform === 'cellphones') {
    // CellphoneS product pages sit at the root (DOS/Rate#1246).
    if (segments.length > 1) return null;
  } else if (
    retailPlatform === 'nguyenkim' ||
    retailPlatform === 'shopdunk' ||
    retailPlatform === 'hacom' ||
    retailPlatform === 'clickbuy' ||
    retailPlatform === 'pico'
  ) {
    if (
      segments.length !== 1 &&
      !(
        segments.length === 2 &&
        (firstSegLower === 'products' || firstSegLower === 'san-pham')
      )
    ) {
      return null;
    }
  } else if (retailPlatform === 'viettelstore') {
    if (segments.length > 2) return null;
    if (segments.length === 2) {
      if (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(firstSegLower)) return null;
      const leafLower = lastRaw.toLowerCase().replace(/\.html?$/i, '');
      const hasPid = /(?:^|-)pid[1-9]\d{1,14}$/i.test(leafLower);
      if (
        !VIETTELSTORE_PRODUCT_CATEGORY_SEGMENTS.has(firstSegLower) &&
        !hasPid
      ) {
        return null;
      }
    }
  } else if (retailPlatform === 'anphatpc') {
    const hasHtmlExt = /\.html?$/i.test(lastRaw);
    const isDirectRoutePrefix =
      segments.length === 2 &&
      (firstSegLower === 'products' || firstSegLower === 'san-pham');
    if (!hasHtmlExt && !isDirectRoutePrefix) return null;
    if (
      firstRawLower.startsWith('ajax') ||
      firstRawLower.endsWith('.php') ||
      ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS.has(firstRawLower) ||
      ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) ||
      RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower)
    ) {
      return null;
    }
    if (segments.some((s) => /_dm\d+$/i.test(s.replace(/\.html?$/i, '')))) {
      return null;
    }
    if (segments.length > 1 && !isDirectRoutePrefix) {
      const lastClean = lastRaw.replace(/\.html?$/i, '');
      if (!lastClean) return null;
      const rawKey = [...segments.slice(0, -1), lastClean].join('/');
      const rawKeyLower = rawKey.toLowerCase();
      if (
        rawKey.length < 3 ||
        rawKey.length > 512 ||
        rawKeyLower.includes('..') ||
        isExcludedAnPhatPhoneSlug(rawKeyLower) ||
        RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX.test(rawKeyLower) ||
        ANPHAT_INFO_SUFFIX_REGEX.test(lastClean.toLowerCase())
      ) {
        return null;
      }
      return sanitizeAnPhatItemId(rawKey) || null;
    }
  }

  if (
    !isCollectionProductPath &&
    RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower)
  ) {
    return null;
  }

  const lastSeg = lastRaw.replace(/\.html?$/i, '') || null;
  const lastSegLower = (lastSeg || '').toLowerCase();
  const vtsHasPid =
    retailPlatform === 'viettelstore' &&
    /(?:^|-)pid[1-9]\d{1,14}$/i.test(lastSegLower);
  if (
    !lastSeg ||
    lastSeg.length < 2 ||
    lastSeg.length > 256 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(lastSegLower) ||
    lastSegLower.includes('..') ||
    /^(?:0+|null|undefined|nan|infinity|-infinity|true|false|default|index|home|trang-chu|404|page-not-found|error)$/i.test(
      lastSegLower
    ) ||
    RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(lastSegLower) ||
    RETAIL_CATEGORY_ROOT_SLUGS.has(lastSegLower) ||
    RETAIL_BRAND_LISTING_SLUGS.has(lastSegLower) ||
    RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX.test(lastSegLower) ||
    isSeriesListingSlug(lastSegLower) ||
    (retailPlatform === 'hacom' &&
      HACOM_CATEGORY_BRAND_SLUG_REGEX.test(lastSegLower)) ||
    (retailPlatform === 'clickbuy' &&
      CLICKBUY_NON_PRODUCT_SLUG_REGEX.test(lastSegLower)) ||
    (retailPlatform === 'viettelstore' &&
      !vtsHasPid &&
      (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(lastSegLower) ||
        VIETTELSTORE_CATEGORY_SLUG_REGEX.test(lastSegLower))) ||
    (retailPlatform === 'anphatpc' &&
      (isExcludedAnPhatPhoneSlug(lastSegLower) ||
        ANPHAT_INFO_SUFFIX_REGEX.test(lastSegLower)))
  ) {
    return null;
  }

  if (retailPlatform === 'anphatpc' && lastSeg.length > 120) {
    return sanitizeAnPhatItemId(lastSeg) || null;
  }

  return lastSeg.length <= 120 ? lastSeg : null;
}

export function parseEcommerceUrlOrQuery(raw: string): ParsedEcommerceUrl {
  const trimmed =
    typeof raw === 'string'
      ? raw
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 2048)
      : '';
  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  const hasKnownDomainToken = KNOWN_ECOMMERCE_DOMAIN_TOKEN_REGEX.test(trimmed);
  const isUrl = hasHttpProtocol || hasKnownDomainToken;

  const toPositiveNumericId = (
    val: string | undefined,
    minLen = 1,
    maxLen = 24
  ): string | null => {
    if (!val || val.length < minLen || val.length > maxLen) return null;
    return /^[1-9]\d*$/.test(val) ? val : null;
  };

  let parsedHost: string | null = null;
  let parsedPathname = trimmed;
  if (hasHttpProtocol || hasKnownDomainToken) {
    try {
      const parsed = new URL(
        hasHttpProtocol ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`
      );
      const candidateHost = parsed.hostname.toLowerCase();
      const isLoopback =
        candidateHost === 'localhost' || candidateHost === '127.0.0.1';
      if (
        (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        Boolean(parsed.username || parsed.password) ||
        !candidateHost ||
        candidateHost.startsWith('.') ||
        candidateHost.endsWith('.') ||
        candidateHost.includes('..') ||
        (!isLoopback &&
          parsed.port !== '' &&
          parsed.port !== '80' &&
          parsed.port !== '443')
      ) {
        return {
          isUrl: false,
          platform: null,
          platformShopId: null,
          platformItemId: null,
          internalSlug: null,
        };
      }
      parsedHost = candidateHost;
      parsedPathname = parsed.pathname;
    } catch {
      parsedHost = null;
    }
  }

  // If a full HTTP/HTTPS URL was supplied, verify host against known domains first
  if (parsedHost) {
    if (isDomainOrSubdomain(parsedHost, 'shopee.vn')) {
      const itemMatch =
        parsedPathname.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
        parsedPathname.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
      if (itemMatch) {
        const shopId = toPositiveNumericId(itemMatch[1]);
        const itemId = toPositiveNumericId(itemMatch[2]);
        return {
          isUrl: true,
          platform: 'shopee',
          platformShopId: shopId && itemId ? shopId : null,
          platformItemId: shopId && itemId ? itemId : null,
          internalSlug: null,
        };
      }
      const shopMatch = parsedPathname.match(/\/shop\/(\d+)/i);
      if (shopMatch) {
        return {
          isUrl: true,
          platform: 'shopee',
          platformShopId: toPositiveNumericId(shopMatch[1]),
          platformItemId: null,
          internalSlug: null,
        };
      }
      return {
        isUrl: true,
        platform: 'shopee',
        platformShopId: null,
        platformItemId: null,
        internalSlug: null,
      };
    }

    if (isDomainOrSubdomain(parsedHost, 'lazada.vn')) {
      const lazadaMatch = parsedPathname.match(/-i(\d+)(?:-s(\d+))?\.html/i);
      const itemId = toPositiveNumericId(lazadaMatch?.[1]);
      const skuId = toPositiveNumericId(lazadaMatch?.[2]);
      return {
        isUrl: true,
        platform: 'lazada',
        platformShopId: itemId ? skuId : null,
        platformItemId: itemId,
        internalSlug: null,
      };
    }

    if (isDomainOrSubdomain(parsedHost, 'tiki.vn')) {
      const tikiMatch = parsedPathname.match(/-p(\d+)\.html/i);
      return {
        isUrl: true,
        platform: 'tiki',
        platformShopId: null,
        platformItemId: toPositiveNumericId(tikiMatch?.[1]),
        internalSlug: null,
      };
    }

    if (isDomainOrSubdomain(parsedHost, 'tiktok.com')) {
      if (/\/video\/\d+/i.test(parsedPathname)) {
        return {
          isUrl: true,
          platform: 'tiktok',
          platformShopId: null,
          platformItemId: null,
          internalSlug: null,
        };
      }
      const prodMatch =
        parsedPathname.match(/\/product\/(\d+)/i) ||
        parsedPathname.match(/\/view\/product\/(\d+)/i) ||
        // TikTok Shop's newer product pages (DOS/Rate#1245).
        parsedPathname.match(/\/shop\/(?:[a-z]{2}\/)?pdp\/[^/]+\/(\d+)/i);
      const shopMatch = parsedPathname.match(/\/@([a-zA-Z0-9_.-]{1,64})/);
      const rawShopHandle = shopMatch?.[1] || null;
      const safeShopHandle =
        rawShopHandle &&
        /[a-zA-Z0-9]/.test(rawShopHandle) &&
        !rawShopHandle.startsWith('.') &&
        !rawShopHandle.endsWith('.') &&
        !rawShopHandle.includes('..')
          ? rawShopHandle
          : null;
      return {
        isUrl: true,
        platform: 'tiktok',
        platformShopId: safeShopHandle,
        platformItemId: toPositiveNumericId(prodMatch?.[1], 6, 24),
        internalSlug: null,
      };
    }

    const retailPlatform: ParsedEcommerceUrl['platform'] = isDomainOrSubdomain(
      parsedHost,
      'cellphones.com.vn'
    )
      ? 'cellphones'
      : isDomainOrSubdomain(parsedHost, 'thegioididong.com')
        ? 'tgdd'
        : isDomainOrSubdomain(parsedHost, 'dienmayxanh.com')
          ? 'dienmayxanh'
          : isDomainOrSubdomain(parsedHost, 'topzone.vn')
            ? 'topzone'
            : isDomainOrSubdomain(parsedHost, 'fptshop.com.vn')
              ? 'fptshop'
              : isDomainOrSubdomain(parsedHost, 'hoanghamobile.com')
                ? 'hoangha'
                : isDomainOrSubdomain(parsedHost, 'didongviet.vn')
                  ? 'didongviet'
                  : isDomainOrSubdomain(parsedHost, 'phongvu.vn')
                    ? 'phongvu'
                    : isDomainOrSubdomain(parsedHost, 'gearvn.com')
                      ? 'gearvn'
                      : isDomainOrSubdomain(parsedHost, 'nguyenkim.com')
                        ? 'nguyenkim'
                        : isDomainOrSubdomain(parsedHost, 'shopdunk.com')
                          ? 'shopdunk'
                          : isDomainOrSubdomain(parsedHost, 'hacom.vn')
                            ? 'hacom'
                            : isDomainOrSubdomain(parsedHost, 'clickbuy.com.vn')
                              ? 'clickbuy'
                              : isDomainOrSubdomain(
                                    parsedHost,
                                    'viettelstore.vn'
                                  )
                                ? 'viettelstore'
                                : isDomainOrSubdomain(parsedHost, 'pico.vn')
                                  ? 'pico'
                                  : isDomainOrSubdomain(
                                        parsedHost,
                                        'mediamart.vn'
                                      )
                                    ? 'mediamart'
                                    : isDomainOrSubdomain(
                                          parsedHost,
                                          'memoryzone.com.vn'
                                        )
                                      ? 'memoryzone'
                                      : isDomainOrSubdomain(
                                            parsedHost,
                                            'anphatpc.com.vn'
                                          )
                                        ? 'anphatpc'
                                        : null;

    if (retailPlatform) {
      const segments = parsedPathname
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      const validItemSlug = extractValidRetailItemSlug(
        retailPlatform,
        segments
      );
      return {
        isUrl: true,
        platform: retailPlatform,
        platformShopId: null,
        platformItemId: validItemSlug,
        internalSlug: null,
      };
    }

    if (
      isDomainOrSubdomain(parsedHost, 'rate.vn') ||
      parsedHost === 'localhost' ||
      parsedHost === '127.0.0.1'
    ) {
      const rateSlugMatch = parsedPathname.match(
        new RegExp(
          `\\/(?:${ALL_CANONICAL_CATEGORY_SLUGS.join('|')})\\/([a-z0-9-]+)`,
          'i'
        )
      );
      if (rateSlugMatch) {
        const candidateSlug = (rateSlugMatch[1] || '').toLowerCase();
        const validSlug =
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateSlug) &&
          !/^(?:0+|null|undefined|nan|infinity|true|false)$/i.test(
            candidateSlug
          )
            ? rateSlugMatch[1]!
            : null;
        if (validSlug) {
          return {
            isUrl: true,
            platform: 'rate',
            platformShopId: null,
            platformItemId: null,
            internalSlug: validSlug,
          };
        }
      }
    }

    // Full URL to an unknown/unrelated domain (e.g., https://google.com/search?q=shopee.vn or https://shopee.vn.evil.com/...)
    return {
      isUrl: true,
      platform: null,
      platformShopId: null,
      platformItemId: null,
      internalSlug: null,
    };
  }

  // Fallback for relative paths / raw product tokens without hostname
  const shopeeItemMatch =
    trimmed.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
    trimmed.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
  if (shopeeItemMatch) {
    const shopId = toPositiveNumericId(shopeeItemMatch[1]);
    const itemId = toPositiveNumericId(shopeeItemMatch[2]);
    if (shopId && itemId) {
      return {
        isUrl: true,
        platform: 'shopee',
        platformShopId: shopId,
        platformItemId: itemId,
        internalSlug: null,
      };
    }
  }

  const lazadaMatch = trimmed.match(/-i(\d+)(?:-s(\d+))?\.html/i);
  if (lazadaMatch) {
    const itemId = toPositiveNumericId(lazadaMatch[1]);
    const skuId = toPositiveNumericId(lazadaMatch[2]);
    if (itemId) {
      return {
        isUrl: true,
        platform: 'lazada',
        platformShopId: skuId,
        platformItemId: itemId,
        internalSlug: null,
      };
    }
  }

  const tikiMatch = trimmed.match(/-p(\d+)\.html/i);
  if (tikiMatch) {
    const itemId = toPositiveNumericId(tikiMatch[1]);
    if (itemId) {
      return {
        isUrl: true,
        platform: 'tiki',
        platformShopId: null,
        platformItemId: itemId,
        internalSlug: null,
      };
    }
  }

  // Rate.vn internal relative URL across all canonical categories
  const rateSlugMatch = trimmed.match(
    new RegExp(
      `\\/(?:${ALL_CANONICAL_CATEGORY_SLUGS.join('|')})\\/([a-z0-9-]+)`,
      'i'
    )
  );
  if (rateSlugMatch) {
    const candidateSlug = (rateSlugMatch[1] || '').toLowerCase();
    const validSlug =
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateSlug) &&
      !/^(?:0+|null|undefined|nan|infinity|true|false)$/i.test(candidateSlug)
        ? rateSlugMatch[1]!
        : null;
    if (validSlug) {
      return {
        isUrl: true,
        platform: 'rate',
        platformShopId: null,
        platformItemId: null,
        internalSlug: validSlug,
      };
    }
  }

  return {
    isUrl,
    platform: null,
    platformShopId: null,
    platformItemId: null,
    internalSlug: null,
  };
}

const ECOMMERCE_SLUG_NOISE_PHRASES_REGEX =
  /(?:^|[\s,.|-]+)(?:điện thoại di động|dien thoai di dong|điện thoại|dien thoai|di động|di dong|smartphone|máy tính bảng|may tinh bang|tablet|máy tính xách tay|may tinh xach tay|laptop|đồng hồ thông minh|dong ho thong minh|smartwatch|tai nghe bluetooth true wireless|tai nghe bluetooth không dây|tai nghe bluetooth khong day|tai nghe chụp tai chống ồn|tai nghe chup tai chong on|tai nghe bluetooth|tai nghe không dây|tai nghe khong day|tai nghe true wireless|tai nghe nhét tai|tai nghe nhet tai|tai nghe(?!\s+(?:có dây|co day))|earbuds|chính hãng vn\/a|chinh hang vn a|chinh hang vna|chính hãng|chinh hang|vn\/a|vn a|vna|fullbox|mới 100%|moi 100%|moi 100|nguyên seal|nguyen seal|trả góp 0%|tra gop 0%|trả góp|tra gop|bảo hành \d+ tháng|bao hanh \d+ thang|bảo hành chính hãng|bao hanh chinh hang|freeship|hoả tốc|hỏa tốc|hoa toc|giá rẻ|gia re|nhập khẩu|nhap khau|quốc tế|quoc te)(?=$|[\s,.|-])/giu;

export function stripEcommerceNoiseTokens(rawText: string): string {
  if (typeof rawText !== 'string') return '';
  return rawText
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(ECOMMERCE_SLUG_NOISE_PHRASES_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a clean, human-readable product search keyword from an e-commerce product URL
 * across all 22 supported platforms (Shopee, Lazada, Tiki, TikTok Shop, CellphoneS,
 * TGDD, Điện Máy Xanh, TopZone, FPT Shop, Hoàng Hà, Di Động Việt, Phong Vũ,
 * GearVN, Nguyễn Kim, ShopDunk, HACOM, Clickbuy, Viettel Store, Pico, MediaMart,
 * MemoryZone, An Phát Computer).
 */
export function extractProductKeywordFromUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 2048) return '';
  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  const hasKnownDomainToken = KNOWN_ECOMMERCE_DOMAIN_TOKEN_REGEX.test(trimmed);
  if (!hasHttpProtocol && !hasKnownDomainToken) return '';

  try {
    const parsed = new URL(
      hasHttpProtocol ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`
    );
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    let decodedPathname = parsed.pathname;
    try {
      decodedPathname = decodeURIComponent(parsed.pathname);
    } catch {
      decodedPathname = parsed.pathname;
    }

    const parsedHostLower = parsed.hostname.toLowerCase();
    const rawSegments = decodedPathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const firstSegLower = (rawSegments[0] || '')
      .replace(/\.html?$/i, '')
      .toLowerCase();
    const isCollectionProductPath =
      rawSegments.length === 4 &&
      firstSegLower === 'collections' &&
      rawSegments[2]?.toLowerCase() === 'products';
    const rawLeaf = rawSegments[rawSegments.length - 1] || '';
    const vtsLeafLower = rawLeaf.toLowerCase().replace(/\.html?$/i, '');
    const vtsLeafHasPid = /(?:^|-)pid[1-9]\d{1,14}$/i.test(vtsLeafLower);
    if (
      (!isCollectionProductPath &&
        RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower)) ||
      firstSegLower === 'shop' ||
      firstSegLower === 'opaanlp' ||
      firstSegLower === 'video' ||
      (isDomainOrSubdomain(parsedHostLower, 'mediamart.vn') &&
        (rawSegments.length !== 2 ||
          !MEDIAMART_ALLOWED_CATEGORY_PREFIXES.has(firstSegLower))) ||
      (isDomainOrSubdomain(parsedHostLower, 'viettelstore.vn') &&
        (rawSegments.length > 2 ||
          (rawSegments.length === 2 &&
            (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(firstSegLower) ||
              (!VIETTELSTORE_PRODUCT_CATEGORY_SEGMENTS.has(firstSegLower) &&
                !vtsLeafHasPid))) ||
          (!vtsLeafHasPid &&
            (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(vtsLeafLower) ||
              VIETTELSTORE_CATEGORY_SLUG_REGEX.test(vtsLeafLower))))) ||
      (isDomainOrSubdomain(parsedHostLower, 'anphatpc.com.vn') &&
        (ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) ||
          rawSegments.some((s) => /_dm\d+(?:\.html?)?$/i.test(s))))
    ) {
      return '';
    }
    if (
      RETAIL_STATIC_ASSET_EXT_REGEX.test(rawLeaf) ||
      /\.(?:c|b)$/i.test(rawLeaf) ||
      /_dm\d+(?:\.html?)?$/i.test(rawLeaf)
    ) {
      return '';
    }

    // Multi-segment An Phat Computer URLs embed `/` inside Apple part numbers
    // (e.g. `/apple-ipad-11-inch-ipad-wi-fi-128gb-blue-md4a4za/a.html`);
    // flatten the full path before extracting keywords so the trailing `/a`
    // is never treated as a 1-character product slug.
    const effectivePath =
      isDomainOrSubdomain(parsedHostLower, 'anphatpc.com.vn') &&
      rawSegments.length > 1 &&
      firstSegLower !== 'products' &&
      firstSegLower !== 'san-pham' &&
      /\.html?$/i.test(rawLeaf)
        ? `/${rawSegments.join('-').replace(/\.html?$/i, '')}`
        : decodedPathname;

    const cleanedPath = effectivePath
      .replace(/(?:\/a-i|-i|\/i)\.\d+\.\d+\/?$/i, '')
      .replace(/\/(?:product|opaanlp)\/\d+\/\d+\/?$/i, '')
      .replace(/\/(?:view\/)?product\/\d+\/?$/i, '')
      .replace(/(?:\/|-)i\d+(?:-s\d+)?\.html?$/i, '')
      .replace(/(?:\/|-)p\d+\.html?$/i, '')
      .replace(/--s\d+(?:\.html?)?$/i, '')
      .replace(/(?:_id|-pid)\d+(?:\.html?)?$/i, '')
      .replace(/\.html?$/i, '')
      .replace(/^\/collections\/[^/]+\/products\//i, '/')
      .replace(
        new RegExp(
          `^\\/(?:products?|san-pham|dien-thoai|dien-thoai-di-dong|dtdd|may-tinh-bang|may-tinh-xach-tay|laptop|dong-ho-thong-minh|tai-nghe|${ALL_CANONICAL_CATEGORY_SLUGS.join('|')}|apple|iphone|ipad|macbook|watch|airpods)\\/`,
          'i'
        ),
        '/'
      );
    const segments = cleanedPath.split('/').filter(Boolean);
    const rawLastSeg = segments[segments.length - 1] || '';
    const lastSeg = rawLastSeg.replace(/^\d{3,8}-(?=.*[a-z])/i, '');
    const lastSegLower = lastSeg.toLowerCase();
    if (
      !lastSeg ||
      lastSeg.length < 2 ||
      /^\d+$/.test(lastSeg) ||
      /^(?:a-)?i\.\d+\.\d+$/i.test(lastSeg) ||
      lastSeg.startsWith('@') ||
      RETAIL_CATEGORY_ROOT_SLUGS.has(lastSegLower) ||
      RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(lastSegLower) ||
      RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX.test(lastSegLower) ||
      HACOM_CATEGORY_BRAND_SLUG_REGEX.test(lastSegLower) ||
      CLICKBUY_NON_PRODUCT_SLUG_REGEX.test(lastSegLower) ||
      ANPHAT_DESK_PHONE_SLUG_REGEX.test(lastSegLower) ||
      (isDomainOrSubdomain(parsedHostLower, 'anphatpc.com.vn') &&
        isExcludedAnPhatPhoneSlug(lastSegLower)) ||
      /^(?:search|tim-kiem|result|product|products|view)$/.test(lastSegLower)
    ) {
      return '';
    }

    const spaceSeparated = lastSeg
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const stripped = stripEcommerceNoiseTokens(spaceSeparated);
    return stripped || spaceSeparated;
  } catch {
    return '';
  }
}

/**
 * The merchant risk split Rate Services writes (RS#708, DOS/Rate#1268): the
 * `review_risk_score` column is the combined risk, and the breakdown (which
 * metadata mirrors) carries `combined_risk_score` and the review-only
 * `review_risk_score`, measured over `total_reviews` (0 when none). A source
 * counts as the split only with numeric `combined_risk_score`,
 * `review_risk_score` and `total_reviews`: older metadata already carried a combined score next to a
 * review score, and keeps today's reading, as does an older breakdown. The
 * combined score is never below the column (`column`), should they drift.
 */
export function storedRiskSplit(
  breakdown: unknown,
  metadata?: unknown,
  column?: unknown
): { combined: number; reviewOnly: number | null } | null {
  const asRecord = (raw: unknown): Record<string, unknown> | null =>
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const score = (raw: unknown): number | null =>
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(0, Math.min(100, Math.round(raw)))
      : null;
  // The column breakdown, then the one nested in metadata, then metadata's
  // top level, as extractPersistedBreakdown reads them.
  const meta = asRecord(metadata);
  for (const source of [
    asRecord(breakdown),
    asRecord(meta?.review_risk_breakdown),
    meta,
  ]) {
    const combined = score(source?.combined_risk_score);
    const total = source?.total_reviews;
    if (!source || combined == null) continue;
    if (typeof total !== 'number' || !Number.isFinite(total)) continue;
    if (score(source.review_risk_score) == null) continue;
    return {
      combined: Math.max(combined, score(column) ?? 0),
      reviewOnly: total > 0 ? score(source.review_risk_score) : null,
    };
  }
  return null;
}

/**
 * Whether a merchant's review risk score may be shown as a measurement. A
 * breakdown that counts no analysed review (0, or a malformed count) means
 * the score is only a platform baseline: it is shown as "not enough data",
 * and is neither a low-risk filter match nor sorted as the lowest risk
 * (DOS/Rate#1249). A missing breakdown or count says nothing either way, so
 * a stored score stays (an offer's seller often carries no breakdown).
 */
export function hasReviewRiskEvidence(
  breakdown: { total_reviews?: unknown } | null | undefined
): boolean {
  const rawTotal = breakdown?.total_reviews;
  if (rawTotal == null) return true;
  const total = Number(rawTotal);
  return Number.isFinite(total) && total > 0;
}

/**
 * A store's combined risk and trust (DOS/Rate#1484). A store with no DOSafe
 * score, no review evidence and no stored combined score has no score at all
 * (null), never risk 0 and "high trust 100/100". A stored combined score
 * alone (RS#708) is a signal too.
 *
 * With at least one signal the score is as before: the higher of the known
 * risks, where the review side keeps its platform baseline when no review was
 * analysed (#1249) and a stored combined score (the importer's split, RS#708)
 * stays a floor. An unknown DOSafe score adds nothing (its column default is
 * 0), so it never lowers the risk either. `baseRisk` is the merchants.risk_score
 * column, the DOSafe score's legacy home.
 */
export function merchantRiskFromSignals(signals: {
  dosafeKnown: boolean;
  dosafeRisk: number;
  baseRisk: number;
  reviewKnown: boolean;
  reviewRisk: number;
  storedCombined: number | null;
}): { risk_score: number | null; trust_score: number | null } {
  if (
    !signals.dosafeKnown &&
    !signals.reviewKnown &&
    signals.storedCombined == null
  ) {
    return { risk_score: null, trust_score: null };
  }
  const parts = [signals.reviewRisk, signals.storedCombined ?? 0];
  if (signals.dosafeKnown) parts.push(signals.dosafeRisk, signals.baseRisk);
  const finite = parts.filter((n) => Number.isFinite(n));
  const risk = Math.min(100, Math.max(0, ...finite));
  return { risk_score: risk, trust_score: Math.max(0, 100 - risk) };
}

/**
 * The DOSafe risk score a merchant card may show, or null when none is known:
 * a public payload's null, or a server-side summary flagged unknown (the
 * column's default 0). The same seller then reads alike before and after a
 * client fetch, and never as 0, the lowest risk (DOS/Rate#1465).
 */
export function knownDosafeRiskScore(merchant: {
  dosafe_risk_score?: number | string | null;
  dosafe_risk_known?: boolean;
}): number | null {
  if (merchant.dosafe_risk_known === false) return null;
  const raw = merchant.dosafe_risk_score;
  if (raw == null || raw === '') return null;
  const score = Number(raw);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null;
}

/**
 * The review risk score a public payload carries: null when the store has no
 * analysed review to score (DOS/Rate#1258), else the score clamped to 0-100.
 */
export function reviewRiskScoreOrNull(merchant: {
  review_risk_score?: number | string | null;
  review_risk_breakdown?: { total_reviews?: unknown } | null;
}): number | null {
  if (!hasReviewRiskEvidence(merchant?.review_risk_breakdown)) return null;
  const raw = merchant?.review_risk_score;
  const score = Number(raw);
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}
