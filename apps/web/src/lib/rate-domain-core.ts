/**
 * Client-safe pure domain code shared by rate-api.ts (server) and client
 * components: scoring, routing, image resolution and URL parsing. It must
 * not import rate-api or any Supabase client, so client bundles stay free of
 * them (DOS/Rate#756).
 */
import type { MasterProduct } from '@repo/shared-data';

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

export type ReviewDepthAxis =
  | 'stars_only'
  | 'platform_label'
  | 'filler'
  | 'low_effort'
  | 'specific_short'
  | 'detailed'
  | 'expert_depth';

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
  trust_assessment?: ReviewTrustAssessment;
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

const WEB_PRODUCT_ASPECT_RE =
  /(?:\bpin\b|sạc|mah|màn(?:\s*hình)?|tần\s*số\s*quét|nit|hiển\s*thị|cam(?:era)?(?!\s*kết)|chụp|quay\s*video|zoom|loa|mic|chất\s*âm|chống\s*ồn|bass|treble|hiệu\s*năng|chip|mượt|lag|giật|nóng|nhiệt\s*độ|fps|game|thiết\s*kế|cầm\s*nắm|vân\s*tay|face\s*id|wifi|5g|bluetooth|phím|bàn\s*phím|touchpad)/i;

// Any mention of the product or of using it, based on PRODUCT_ASPECT_RE in
// apps/importer/src/shopee/ai-review-analyzer.ts (isShippingOnlyComment) plus
// Shopee's structured product fields. Matched as whole words so "hư" in "như"
// or "pin" in "shopping" do not count. Words that also describe delivery
// count only outside a delivery phrase ("sản phẩm" but not "sản phẩm được
// đóng gói", "đẹp" but not "đóng gói rất đẹp"); see PRODUCT_MENTION_RE in
// the importer, which must stay identical (its tests compare the two). Only used
// to decide that a review is about shipping alone; depth still uses the
// stricter WEB_PRODUCT_ASPECT_RE.
const WEB_PRODUCT_MENTION_RE =
  /(?<![\p{L}\p{N}])(?:máy|điện\s*thoại|tai\s*nghe|pin|màn(?:\s*hình)?|camera|loa|mic|chất\s*âm|chống\s*ồn|cảm\s*ứng|hiệu\s*năng|cấu\s*hình|chip|ram|rom|sạc|dùng|xài|sử\s*dụng|trải\s*nghiệm|mượt|lag|giật|nóng|ấm|lỗi|hỏng|hư|bền|xịn|chính\s*hãng|nguyên\s*seal|bảo\s*hành|vân\s*tay|wifi|5g|bluetooth|nhiệt\s*độ|tần\s*số|sản\s*phẩm(?!\s+(?:(?:đã\s+)?được\s+|đã\s+)?(?:đóng\s*gói|giao\s*(?:hàng|nhanh|chậm|trễ|lâu|đến|tới)|vận\s*chuyển|bọc|ship))|chất\s*lượng(?!\s+(?:đóng\s*gói|giao|vận\s*chuyển|phục\s*vụ|dịch\s*vụ))|(?<!(?:giao|gói|đóng|nhận|gửi|ship)\s+)hàng(?:\s+\p{L}+){0,2}?\s+(?:đẹp|tốt|xịn|chuẩn|ok|ổn|kém|tệ|lỗi|tuyệt|ngon|hài\s*lòng|ưng)|(?<!(?:gói|hộp|bọc|bì)(?:\s+\p{L}+)?\s*)đẹp|mô\s*tả|(?:y|giống|đúng)\s*hình|tính\s*năng\s*nổi\s*bật)(?![\p{L}\p{N}])/iu;

const WEB_PLATFORM_LABEL_RE =
  /^(?:cực\s*k[ìỳ]\s*hài\s*lòng|rất\s*hài\s*lòng|hài\s*lòng|bình\s*thường|không\s*hài\s*lòng|rất\s*không\s*hài\s*lòng|tuyệt\s*vời|tốt|khá|tệ|rất\s*tệ)$/iu;

const WEB_SPONSORED_RE =
  /(?:được\s*tài\s*trợ|nhận\s*sản\s*phẩm\s*từ\s*hãng|bài\s*viết\s*tài\s*trợ|quảng\s*cáo|sponsored|gifted\s*by|partner(?:ed)?\s*with)/i;

const WEB_AFFILIATE_RE =
  /(?:link\s*mua|link\s*bio|tiếp\s*thị\s*liên\s*kết|affiliate|hoa\s*hồng|s\.shopee\.vn|shope\.ee|vt\.tiktok\.com)/i;

const WEB_INCENTIVIZED_RE =
  /(?:đánh\s*giá\s*5\s*sao\s*nhận\s*quà|nhận\s*voucher|hoàn\s*tiền\s*khi\s*đánh\s*giá|thẻ\s*cào\s*trong\s*hộp)/i;

const WEB_TECH_MEASURE_RE =
  /(?:\b\d+\s*(?:mah|wh|w|hz|nit|nits|fps|gb|tb|mp|mm|gram|g|db|ms|°c|độ\s*c)\b|geekbench|antutu|3dmark|cinebench|pcmag|gsmarena|phonearena)/i;

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
  >
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
  const hasProduct = WEB_PRODUCT_ASPECT_RE.test(comment);
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

  // 3. Axis C: Depth
  let depth: ReviewDepthAxis;
  if (cleanText.length === 0) {
    depth = 'stars_only';
  } else if (WEB_PLATFORM_LABEL_RE.test(cleanText)) {
    depth = 'platform_label';
  } else if (review.flag_category === 'low_value_coin_spam') {
    depth = 'filler';
  } else if (
    review.reviewer_type === 'expert' ||
    WEB_TECH_MEASURE_RE.test(comment) ||
    (cleanText.length >= 240 && hasProduct)
  ) {
    depth = 'expert_depth';
  } else if (cleanText.length >= 90 && hasProduct) {
    depth = 'detailed';
  } else if (hasProduct && cleanText.length >= 30) {
    depth = 'specific_short';
  } else {
    depth = 'low_effort';
  }

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
        WEB_PLATFORM_LABEL_RE.test(text) ||
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
  risk_score: number;
  trust_score: number;
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
  if (
    safeSlug === 'smartphones' ||
    safeSlug === 'tablets' ||
    safeSlug === 'laptops' ||
    safeSlug === 'smartwatches' ||
    safeSlug === 'earbuds'
  ) {
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
  'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';

export function isCanonicalCategorySlug(
  value: unknown
): value is CanonicalCategorySlug {
  return (
    value === 'smartphones' ||
    value === 'tablets' ||
    value === 'laptops' ||
    value === 'smartwatches' ||
    value === 'earbuds'
  );
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
    `${product.name || ''} ${product.model || ''} ${product.slug}`.toLowerCase();
  if (
    /ipad|galaxy tab|xiaomi pad|matepad|redmi pad|tab s\d|tab a\d|tab p\d|tab m\d|oneplus pad|oppo pad|vivo pad|honor pad|surface pro|tablet|máy tính bảng/i.test(
      haystack
    )
  ) {
    return 'tablets';
  }
  if (
    /macbook|thinkpad|zenbook|vivobook|inspiron|xps|latitude|legion|ideapad|yoga|loq|rog|tuf|omen|victus|pavilion|spectre|envy|elitebook|probook|zbook|swift|aspire|predator|nitro|prestige|stealth|raider|katana|cyborg|modern \d|matebook|gram|surface laptop|ultrabook|laptop|máy tính xách tay/i.test(
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
  if (!/^\/[a-z]+\/[^/]+$/.test(href)) return null;
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
    results = results.filter((m) => {
      const trust =
        typeof m.trust_score === 'number' && Number.isFinite(m.trust_score)
          ? m.trust_score
          : 0;
      return trust >= safeMinTrust;
    });
  }

  if (safeParams?.sort) {
    const safeNum = (v: unknown, fallback = 0): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    results.sort((a, b) => {
      switch (safeParams.sort) {
        case 'trust_desc':
          return (
            safeNum(b.trust_score) - safeNum(a.trust_score) ||
            safeNum(b.product_count) - safeNum(a.product_count)
          );
        case 'products_desc':
          return (
            safeNum(b.product_count) - safeNum(a.product_count) ||
            safeNum(b.trust_score) - safeNum(a.trust_score)
          );
        case 'seeding_asc':
          // Measured scores first: no reviews is not the lowest risk
          // (DOS/Rate#1249).
          return (
            Number(!hasReviewRiskEvidence(a.review_risk_breakdown)) -
              Number(!hasReviewRiskEvidence(b.review_risk_breakdown)) ||
            safeNum(a.review_risk_score, 100) -
              safeNum(b.review_risk_score, 100) ||
            safeNum(b.trust_score) - safeNum(a.trust_score)
          );
        case 'followers_desc':
          return (
            safeNum(b.follower_count) - safeNum(a.follower_count) ||
            safeNum(b.trust_score) - safeNum(a.trust_score)
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
    | 'rate'
    | null;
  platformShopId: string | null;
  platformItemId: string | null;
  internalSlug: string | null;
}

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const RETAIL_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'tin-tuc',
  'sforum',
  'dchannel',
  'hoi-dap',
  'khuyen-mai',
  'tra-gop',
  'bao-hanh',
  'he-thong-cua-hang',
  'he-thong-sieu-thi',
  'catalogsearch',
  'tim-kiem',
  'search',
  'cart',
  'gio-hang',
  'account',
  'login',
  'blog',
  'news',
  'event',
  'landing',
  'collection',
  'c',
]);

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
  'dien-thoai',
  'dien-thoai-di-dong',
  'mobile',
  'smartphones',
  'laptop',
  'laptops',
  'may-tinh-xach-tay',
  'may-tinh-bang',
  'tablet',
  'tablets',
  'dong-ho-thong-minh',
  'smartwatch',
  'smartwatches',
  'tai-nghe',
  'earbuds',
  'phu-kien',
  'apple',
  'iphone',
  'ipad',
  'macbook',
  'watch',
  'airpods',
]);

export function parseEcommerceUrlOrQuery(raw: string): ParsedEcommerceUrl {
  const trimmed =
    typeof raw === 'string'
      ? raw
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 2048)
      : '';
  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  const hasKnownDomainToken =
    /(?:^|\/\/|\.)(?:shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|cellphones\.com\.vn|thegioididong\.com|topzone\.vn|dienmayxanh\.com|fptshop\.com\.vn|hoanghamobile\.com|didongviet\.vn|phongvu\.vn|rate\.vn)(?:\/|$)/i.test(
      trimmed
    );
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
      : isDomainOrSubdomain(parsedHost, 'thegioididong.com') ||
          isDomainOrSubdomain(parsedHost, 'topzone.vn') ||
          isDomainOrSubdomain(parsedHost, 'dienmayxanh.com')
        ? 'tgdd'
        : isDomainOrSubdomain(parsedHost, 'fptshop.com.vn')
          ? 'fptshop'
          : isDomainOrSubdomain(parsedHost, 'hoanghamobile.com')
            ? 'hoangha'
            : isDomainOrSubdomain(parsedHost, 'didongviet.vn')
              ? 'didongviet'
              : isDomainOrSubdomain(parsedHost, 'phongvu.vn')
                ? 'phongvu'
                : null;

    if (retailPlatform) {
      const segments = parsedPathname
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      const firstSegLower = (segments[0] || '')
        .replace(/\.html?$/i, '')
        .toLowerCase();
      const lastSeg =
        segments[segments.length - 1]?.replace(/\.html?$/i, '') || null;
      const lastSegLower = (lastSeg || '').toLowerCase();
      const isValidItemSlug =
        Boolean(lastSeg) &&
        lastSeg!.length >= 2 &&
        lastSeg!.length <= 256 &&
        /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(lastSegLower) &&
        !lastSegLower.includes('..') &&
        !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
          lastSegLower
        ) &&
        !RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) &&
        !RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(lastSegLower) &&
        !(
          segments.length === 1 && RETAIL_CATEGORY_ROOT_SLUGS.has(firstSegLower)
        ) &&
        !RETAIL_BRAND_LISTING_SLUGS.has(lastSegLower) &&
        !isSeriesListingSlug(lastSegLower) &&
        !(retailPlatform === 'tgdd' && segments.length < 2) &&
        // CellphoneS product pages sit at the root (DOS/Rate#1246).
        !(retailPlatform === 'cellphones' && segments.length > 1);
      return {
        isUrl: true,
        platform: retailPlatform,
        platformShopId: null,
        platformItemId: isValidItemSlug ? lastSeg : null,
        internalSlug: null,
      };
    }

    if (
      isDomainOrSubdomain(parsedHost, 'rate.vn') ||
      parsedHost === 'localhost' ||
      parsedHost === '127.0.0.1'
    ) {
      const rateSlugMatch = parsedPathname.match(
        /\/(?:smartphones|tablets|laptops|smartwatches|earbuds)\/([a-z0-9-]+)/i
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

  // Rate.vn internal relative URL: /smartphones/<slug>, /tablets/<slug>, /laptops/<slug>, /smartwatches/<slug>, /earbuds/<slug>
  const rateSlugMatch = trimmed.match(
    /\/(?:smartphones|tablets|laptops|smartwatches|earbuds)\/([a-z0-9-]+)/i
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
 * across all 10 supported platforms (Shopee, Lazada, Tiki, TikTok Shop, CellphoneS,
 * TGDD/TopZone/DMX, FPT Shop, Hoàng Hà, Di Động Việt, Phong Vũ).
 */
export function extractProductKeywordFromUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 2048) return '';
  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  const hasKnownDomainToken =
    /(?:^|\/\/|\.)(?:shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|cellphones\.com\.vn|thegioididong\.com|topzone\.vn|dienmayxanh\.com|fptshop\.com\.vn|hoanghamobile\.com|didongviet\.vn|phongvu\.vn|rate\.vn)(?:\/|$)/i.test(
      trimmed
    );
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

    const rawSegments = decodedPathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const firstSegLower = (rawSegments[0] || '')
      .replace(/\.html?$/i, '')
      .toLowerCase();
    if (
      RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) ||
      firstSegLower === 'shop' ||
      firstSegLower === 'opaanlp' ||
      firstSegLower === 'video'
    ) {
      return '';
    }

    const cleanedPath = decodedPathname
      .replace(/(?:\/a-i|-i|\/i)\.\d+\.\d+\/?$/i, '')
      .replace(/\/(?:product|opaanlp)\/\d+\/\d+\/?$/i, '')
      .replace(/\/(?:view\/)?product\/\d+\/?$/i, '')
      .replace(/(?:\/|-)i\d+(?:-s\d+)?\.html?$/i, '')
      .replace(/(?:\/|-)p\d+\.html?$/i, '')
      .replace(/--s\d+(?:\.html?)?$/i, '')
      .replace(/\.html?$/i, '')
      .replace(
        /^\/(?:products?|san-pham|dien-thoai|dien-thoai-di-dong|dtdd|may-tinh-bang|may-tinh-xach-tay|laptop|dong-ho-thong-minh|tai-nghe|smartphones|tablets|laptops|smartwatches|earbuds|apple|iphone|ipad|macbook|watch|airpods)\//i,
        '/'
      );
    const segments = cleanedPath.split('/').filter(Boolean);
    const lastSeg = segments[segments.length - 1] || '';
    const lastSegLower = lastSeg.toLowerCase();
    if (
      !lastSeg ||
      /^\d+$/.test(lastSeg) ||
      /^(?:a-)?i\.\d+\.\d+$/i.test(lastSeg) ||
      lastSeg.startsWith('@') ||
      RETAIL_CATEGORY_ROOT_SLUGS.has(lastSegLower) ||
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
