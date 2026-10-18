import { createClient } from '@supabase/supabase-js';
import type { Database, MasterProduct } from '@repo/shared-data';
import { createLogger } from '@/lib/logger';
import { isPendingReview } from '@/lib/review-display';

const log = createLogger('rate-api');
export type { MasterProduct };

const createRateSchemaClient = (url: string, anonKey: string) =>
  createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  }).schema('rate');
type RateSchemaClient = ReturnType<typeof createRateSchemaClient>;
let _client: RateSchemaClient | null = null;

export function getRateClient(): RateSchemaClient {
  if (_client) {
    return _client;
  }
  // Fail hard on missing env (plan v7 §5.4): a silent fallback to the PROD
  // project makes preview verification read prod and look healthy.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'rate-api: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured; refusing to fall back to a hardcoded project'
    );
  }
  _client = createRateSchemaClient(supabaseUrl, supabaseAnonKey);
  return _client;
}

/**
 * PostgREST caps every response at the project's max-rows (1000 by default) and
 * silently drops the rest, so unbounded table reads must be paged. Pages advance by
 * the number of rows actually returned, which also works if max-rows is lowered.
 * On error, logs and returns what was read so far (matching the old ignore-error reads).
 */
async function fetchAllRows<T>(
  label: string,
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) {
      log.error('paged read failed', {
        table: label,
        row: from,
        message: error.message,
      });
      return rows;
    }
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
  }
}

export type ReviewFlagCategory =
  | 'authentic'
  | 'low_value_coin_spam'
  | 'seeding_fake'
  | 'competitor_sabotage'
  | 'review_bombing';

export interface MerchantOffer {
  id: string;
  platform: string;
  title: string;
  price_current: number;
  price_original: number | null;
  stock: number;
  rating_star: number;
  rating_count: number;
  url: string;
  merchant: {
    id: string;
    name: string;
    platform: string;
    is_official: boolean;
    rating_star: number | null;
    follower_count: number;
    location: string | null;
    risk_score: number;
    dosafe_risk_score: number;
    review_risk_score: number;
    review_risk_breakdown: Record<string, unknown> | null;
  };
}

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
  explanationVi: string;
}

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

export interface ReviewAnalysisSummary {
  total_analyzed: number;
  authentic_pct: number;
  suspicious_pct: number;
  fake_pct: number;
  pros: string[];
  cons: string[];
  ai_summary: string | null;
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
    Number.isFinite(helpfulWeight) && helpfulWeight > 0 ? helpfulWeight : 0;
  const neg =
    Number.isFinite(unhelpfulWeight) && unhelpfulWeight > 0
      ? unhelpfulWeight
      : 0;
  const n = pos + neg;
  if (n <= 0) return 0;
  const pHat = pos / n;
  const z2 = z * z;
  const numerator =
    pHat + z2 / (2 * n) - z * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * n)) / n);
  const denominator = 1 + z2 / n;
  return Number(Math.max(0, Math.min(1, numerator / denominator)).toFixed(4));
}

const WEB_SHIPPING_ASPECT_RE =
  /(?:giao\s*hàng|ship(?:per)?|vận\s*chuyển|đóng\s*gói|bọc\s*hàng|hộp\s*móp|giao\s*nhanh|giao\s*chậm|tư\s*vấn|chăm\s*sóc\s*khách)/i;
const WEB_PRODUCT_ASPECT_RE =
  /(?:\bpin\b|sạc|mah|màn(?:\s*hình)?|tần\s*số\s*quét|nit|hiển\s*thị|cam(?:era)?|chụp|quay\s*video|zoom|loa|mic|chất\s*âm|chống\s*ồn|bass|treble|hiệu\s*năng|chip|mượt|lag|giật|nóng|nhiệt\s*độ|fps|game|thiết\s*kế|cầm\s*nắm|vân\s*tay|face\s*id|wifi|5g|bluetooth|phím|bàn\s*phím|touchpad)/i;
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
  review: Pick<
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
  const comment = (review.comment || '').normalize('NFC').trim();
  const cleanText = comment.replace(/[\s.!,]+$/u, '').trim();
  const hasShipping = WEB_SHIPPING_ASPECT_RE.test(comment);
  const hasProduct = WEB_PRODUCT_ASPECT_RE.test(comment);
  const shippingOnly = hasShipping && !hasProduct && cleanText.length > 0;

  // 1. Axis A: Authenticity
  let authenticity: ReviewAuthenticityAxis = 'genuine';
  if (review.flag_category === 'seeding_fake' || review.verdict === 'fake') {
    authenticity = 'fabricated';
  } else if (review.flag_category === 'competitor_sabotage') {
    authenticity = 'sabotage';
  } else if (review.flag_category === 'review_bombing') {
    authenticity = 'bombing';
  } else if (
    review.rating_star >= 5 &&
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
  const upvotes = Math.max(0, Number(review.upvotes || 0));
  const downvotes = Math.max(0, Number(review.downvotes || 0));
  const reports = Math.max(0, Number(review.report_count || 0));
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

  let explanationVi: string;
  if (shippingOnly) {
    explanationVi =
      'Trọng số 0.00x cho sản phẩm: chỉ nhận xét giao hàng/đóng gói (chuyển sang điểm người bán)';
  } else if (gate === 0) {
    if (depth === 'filler') {
      explanationVi =
        'Trọng số 0.00x: bình luận cày xu / không mô tả trải nghiệm sản phẩm';
    } else if (authenticity === 'sabotage') {
      explanationVi = 'Trọng số 0.00x: nghi vấn đối thủ dìm hàng thiếu căn cứ';
    } else if (authenticity === 'bombing') {
      explanationVi = 'Trọng số 0.00x: đánh giá bất thường / bom đơn';
    } else {
      explanationVi = 'Trọng số 0.00x: nghi vấn seeding / văn mẫu trùng lặp';
    }
  } else if (depth === 'stars_only') {
    explanationVi = `Trọng số ${weight.toFixed(2)}x: chỉ chấm sao, không có nội dung (C=0.25)`;
  } else if (depth === 'platform_label') {
    explanationVi = `Trọng số ${weight.toFixed(2)}x: nhãn mặc định theo số sao của sàn (C=0.25)`;
  } else if (depth === 'low_effort') {
    explanationVi = `Trọng số ${weight.toFixed(2)}x: nhận xét ngắn, ít chi tiết kỹ thuật (C=0.50)`;
  } else {
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
      explanationVi,
    },
    wilsonScore: computeWilsonLowerBound(upvotes, downvotes),
  };
}

export interface CombinedDualScoreResult {
  overall: number;
  isBlended: boolean;
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
  const {
    userScore,
    expertScore,
    userConfidence,
    fallbackAverage = 0,
  } = params;
  const hasUser = typeof userScore === 'number' && userScore > 0;
  const hasExpert = typeof expertScore === 'number' && expertScore > 0;

  if (hasUser && hasExpert && userConfidence >= 0.6) {
    return {
      overall: Number((userScore * 0.6 + expertScore * 0.4).toFixed(2)),
      isBlended: true,
      blendFormulaNoteVi:
        'Tỷ trọng: 60% Người mua thực chất + 40% Chuyên gia Rate Lab (c ≥ 60%)',
    };
  }

  if (hasUser && hasExpert && userConfidence < 0.6) {
    return {
      overall: Number(expertScore.toFixed(2)),
      isBlended: false,
      blendFormulaNoteVi:
        'Hiển thị riêng Điểm Chuyên gia & Người mua (chờ độ tin cậy người dùng đạt mức Trung bình c ≥ 60% để gộp 60/40)',
    };
  }

  if (hasUser) {
    return {
      overall: Number(userScore.toFixed(2)),
      isBlended: false,
      blendFormulaNoteVi:
        'Tỷ trọng: 100% Người mua thực chất (đã lọc Seeding & Spam xu)',
    };
  }

  if (hasExpert) {
    return {
      overall: Number(expertScore.toFixed(2)),
      isBlended: false,
      blendFormulaNoteVi: 'Tỷ trọng: 100% Đánh giá Chuyên gia Rate Lab',
    };
  }

  return {
    overall: Number(Number(fallbackAverage || 0).toFixed(2)),
    isBlended: false,
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
  if (reviews.length < 5) {
    return {
      isAnomalous: false,
      fiveStarRatioPct: 0,
      lowEffortOrSeedingRatioPct: 0,
      warningLabelVi: null,
    };
  }

  let fiveStarCount = 0;
  let criticalStarCount = 0;
  let shallowOrFlaggedFiveStar = 0;

  for (const r of reviews) {
    const star = Math.round(Number(r.rating_star || 0));
    const text = (r.comment || '').trim();
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

  const fiveStarRatioPct = Math.round((fiveStarCount / reviews.length) * 100);
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

  const base = verdict === 'suspicious' ? 0.25 : 1.0;
  const net = Math.max(0, upvotes) - Math.max(0, downvotes);
  let weight = base;

  if (net > 0) {
    weight = base + Math.log(1 + net) * 0.45;
  } else if (net < 0) {
    weight = base - Math.abs(net) * 0.3;
  }

  weight -= Math.max(0, reports) * 0.35;
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

  for (const r of reviews) {
    if (!r.include_in_rating) continue;
    const w = Number(r.helpfulness_weight || 0);
    const star = Number(r.rating_star || 0);
    if (w > 0 && star >= 1 && star <= 5) {
      effectiveWeightSum += w;
      weightedStarSum += w * star;
    }
  }

  effectiveWeightSum = Math.round(effectiveWeightSum * 100) / 100;

  if (effectiveWeightSum <= 0) {
    const safeFallback =
      fallbackWeightedRating > 0
        ? Math.round(fallbackWeightedRating * 100) / 100
        : 0;
    return {
      bayesianRating: safeFallback,
      rawWeightedMean: safeFallback,
      effectiveWeightSum: 0,
      confidenceRatio: 0,
      confidenceTier: 'insufficient_data',
      tierLabelVi: 'Ít mẫu kiểm chứng (Bayesian Prior)',
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
  let tierLabelVi = 'Ít mẫu kiểm chứng (Đã làm mượt Bayesian)';
  if (effectiveWeightSum >= 12) {
    confidenceTier = 'high';
    tierLabelVi = 'Độ tin cậy cao (Bayesian High)';
  } else if (effectiveWeightSum >= 4) {
    confidenceTier = 'medium';
    tierLabelVi = 'Độ tin cậy trung bình (Bayesian Medium)';
  } else if (effectiveWeightSum >= 1.5) {
    confidenceTier = 'low';
    tierLabelVi = 'Độ tin cậy thấp (Bayesian Low)';
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

export interface RateCategoryItem {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  display_order: number;
}

export interface MasterProductFilterParams {
  categorySlug?: string;
  brand?: string;
  brands?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  ramGb?: number[];
  storageGb?: number[];
  minBatteryMah?: number;
  minRefreshRateHz?: number;
  minFastChargingW?: number;
  has5g?: boolean;
  hasNfc?: boolean;
  maxScreenSizeInch?: number;
  sort?:
    | 'default'
    | 'price_asc'
    | 'price_desc'
    | 'rating_desc'
    | 'merchants_desc'
    | 'newest';
  limit?: number;
}

export interface CategoryDirectoryFacets {
  currentCategory: RateCategoryItem | null;
  categories: RateCategoryItem[];
  brands: { name: string; count: number }[];
  totalUnfiltered: number;
}

/**
 * Fetch categories and available brand facets for a given category slug
 */
export async function getCategoryDirectoryFacets(
  categorySlug: string = 'smartphones'
): Promise<CategoryDirectoryFacets> {
  const supabase = getRateClient();

  const { data: catRows } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug, icon, display_order')
    .order('display_order', { ascending: true });

  const categories = (catRows as RateCategoryItem[]) || [];
  const currentCategory =
    categories.find((c) => c.slug === categorySlug) || null;

  if (!currentCategory) {
    return {
      currentCategory: null,
      categories,
      brands: [],
      totalUnfiltered: 0,
    };
  }

  // Audit C1: Prefer server-side GROUP BY brand RPC `get_category_brand_facets`
  {
    const { data: facetRows, error: facetErr } = await supabase.rpc(
      'get_category_brand_facets',
      { p_category_id: currentCategory.id }
    );
    if (!facetErr && Array.isArray(facetRows)) {
      const brands = (facetRows as { brand: string; count: number }[]).map(
        (r) => ({
          name: r.brand,
          count: Number(r.count) || 0,
        })
      );
      const totalUnfiltered = brands.reduce((acc, b) => acc + b.count, 0);
      return {
        currentCategory,
        categories,
        brands,
        totalUnfiltered,
      };
    }
  }

  const { data: prodRows } = await supabase
    .from('master_products')
    .select('brand, category_id')
    .eq('status', 'published')
    .eq('category_id', currentCategory.id)
    .limit(500);

  const rows =
    (prodRows as { brand: string; category_id: string | null }[]) || [];

  const brandCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.brand) continue;
    brandCounts.set(r.brand, (brandCounts.get(r.brand) || 0) + 1);
  }

  const brands = Array.from(brandCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    currentCategory,
    categories,
    brands,
    totalUnfiltered: rows.length,
  };
}

/**
 * Fetch list of master products with 10-Field-Groups multi-criteria filtering & sorting
 */
export async function getMasterProducts(
  params?: MasterProductFilterParams
): Promise<MasterProduct[]> {
  const supabase = getRateClient();
  let resolvedCategoryId: string | null = null;

  if (params?.categorySlug && params.categorySlug !== 'all') {
    const { data: catRow } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', params.categorySlug)
      .maybeSingle();

    if (!catRow?.id) {
      return [];
    }
    resolvedCategoryId = catRow.id;
  }

  const brandList =
    params?.brands && params.brands.length > 0
      ? params.brands.map((b) => b.trim()).filter(Boolean)
      : params?.brand
        ? [params.brand.trim()]
        : null;
  const boundedLimit =
    params?.limit && params.limit > 0 ? Math.min(params.limit, 500) : 200;

  // Audit C1: Prefer server-side SQL RPC `search_master_products` when deployed.
  // Every filter defaults to NULL in SQL, so an omitted (undefined) filter is
  // the same as passing null.
  {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      'search_master_products',
      {
        p_category_id: resolvedCategoryId ?? undefined,
        p_brands: brandList ?? undefined,
        p_search: params?.search?.trim() || undefined,
        p_min_price: params?.minPrice,
        p_max_price: params?.maxPrice,
        p_min_rating: params?.minRating,
        p_ram_gb:
          params?.ramGb && params.ramGb.length > 0 ? params.ramGb : undefined,
        p_storage_gb:
          params?.storageGb && params.storageGb.length > 0
            ? params.storageGb
            : undefined,
        p_min_battery_mah: params?.minBatteryMah,
        p_min_refresh_rate_hz: params?.minRefreshRateHz,
        p_min_fast_charging_w: params?.minFastChargingW,
        p_has_5g: params?.has5g,
        p_has_nfc: params?.hasNfc,
        p_max_screen_size_inch: params?.maxScreenSizeInch,
        p_sort: params?.sort || 'default',
        p_limit: boundedLimit,
        p_offset: 0,
      }
    );
    if (!rpcErr && Array.isArray(rpcRows)) {
      return rpcRows as MasterProduct[];
    }
  }

  let query = supabase
    .from('master_products')
    .select('*')
    .eq('status', 'published');

  if (resolvedCategoryId) {
    query = query.eq('category_id', resolvedCategoryId);
  }

  if (params?.brands && params.brands.length > 0) {
    query = query.in(
      'brand',
      params.brands.map((b) => b.trim()).filter(Boolean)
    );
  } else if (params?.brand) {
    query = query.ilike('brand', `%${params.brand}%`);
  }

  if (typeof params?.minPrice === 'number' && params.minPrice > 0) {
    query = query.gte('min_price', params.minPrice);
  }

  if (typeof params?.maxPrice === 'number' && params.maxPrice > 0) {
    query = query.lte('min_price', params.maxPrice);
  }

  if (params?.ramGb && params.ramGb.length > 0) {
    query = query.in('ram_gb', params.ramGb);
  }

  if (params?.storageGb && params.storageGb.length > 0) {
    query = query.in('storage_gb', params.storageGb);
  }

  if (typeof params?.minBatteryMah === 'number' && params.minBatteryMah > 0) {
    query = query.gte('battery_mah', params.minBatteryMah);
  }

  if (params?.has5g === true) {
    query = query.eq('has_5g', true);
  }

  // Server-side sort where directly supported by top-level columns
  switch (params?.sort) {
    case 'price_asc':
      query = query.order('min_price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('min_price', { ascending: false });
      break;
    case 'merchants_desc':
      query = query.order('merchant_count', { ascending: false });
      break;
    case 'rating_desc':
      query = query.order('user_rating_weighted', { ascending: false });
      break;
    case 'newest':
    case 'default':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.limit(boundedLimit);

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `rate-api: failed to fetch master products: ${error.message}`
    );
  }

  let items = ((data as MasterProduct[]) || []).slice();

  // Multi-brand case-insensitive filter
  if (params?.brands && params.brands.length > 0) {
    const allowedBrands = new Set(
      params.brands.map((b) => b.trim().toLowerCase())
    );
    items = items.filter((item) =>
      allowedBrands.has((item.brand || '').trim().toLowerCase())
    );
  }

  // Keyword search across combined brand + name + model + chipset + key_specs (supports multi-token queries like "Apple iPhone 16 Pro Max")
  if (params?.search && params.search.trim().length > 0) {
    const q = params.search.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    items = items.filter((item) => {
      const combined = [
        item.brand,
        item.name,
        item.model,
        item.model_key,
        item.variant_name || '',
        item.key_specs?.chip || '',
        item.specifications?.hardware?.chipset || '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (combined.includes(q)) return true;
      return tokens.length > 0 && tokens.every((tok) => combined.includes(tok));
    });
  }

  // Minimum effective rating filter (prefers JReviews weighted user rating -> expert rating -> average_rating)
  if (typeof params?.minRating === 'number' && params.minRating > 0) {
    const minRating = params.minRating;
    items = items.filter((item) => {
      const effectiveRating =
        item.user_rating_weighted && Number(item.user_rating_weighted) > 0
          ? Number(item.user_rating_weighted)
          : item.expert_rating && Number(item.expert_rating) > 0
            ? Number(item.expert_rating)
            : Number(item.average_rating || 0);
      return effectiveRating >= minRating;
    });
  }

  // 10 Field Groups JSONB filters:
  // Display: refresh_rate_hz >= minRefreshRateHz
  if (
    typeof params?.minRefreshRateHz === 'number' &&
    params.minRefreshRateHz > 0
  ) {
    const minHz = params.minRefreshRateHz;
    items = items.filter((item) => {
      const hz = Number(item.specifications?.display?.refresh_rate_hz || 0);
      if (hz >= minHz) return true;
      const screenText = (item.key_specs?.screen || '').toLowerCase();
      return screenText.includes('120hz') || screenText.includes('144hz');
    });
  }

  // Battery: fast_charging_w >= minFastChargingW
  if (
    typeof params?.minFastChargingW === 'number' &&
    params.minFastChargingW > 0
  ) {
    const minW = params.minFastChargingW;
    items = items.filter((item) => {
      const w = Number(item.specifications?.battery?.fast_charging_w || 0);
      return w >= minW;
    });
  }

  // Connectivity: nfc === true
  if (params?.hasNfc === true) {
    items = items.filter(
      (item) => item.specifications?.connectivity?.nfc === true
    );
  }

  // Display: compact screen <= maxScreenSizeInch
  if (
    typeof params?.maxScreenSizeInch === 'number' &&
    params.maxScreenSizeInch > 0
  ) {
    const maxInch = params.maxScreenSizeInch;
    items = items.filter((item) => {
      const size = Number(
        item.screen_size_inch ?? item.specifications?.display?.size_inch ?? 0
      );
      return size > 0 && size <= maxInch;
    });
  }

  // Sort by effective rating if requested
  if (params?.sort === 'rating_desc') {
    items.sort((a, b) => {
      const ratingA =
        a.user_rating_weighted && Number(a.user_rating_weighted) > 0
          ? Number(a.user_rating_weighted)
          : Number(a.average_rating || 0);
      const ratingB =
        b.user_rating_weighted && Number(b.user_rating_weighted) > 0
          ? Number(b.user_rating_weighted)
          : Number(b.average_rating || 0);
      return ratingB - ratingA;
    });
  }

  if (params?.limit && params.limit > 0) {
    items = items.slice(0, params.limit);
  }

  return items.map(normalizeMasterProductRow);
}

/**
 * Fetch a single master product by its slug
 */
export async function getMasterProductBySlug(
  slug: string
): Promise<MasterProduct | null> {
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) {
    log.warn('master product not found', { slug, message: error?.message });
    return null;
  }
  return normalizeMasterProductRow(data as MasterProduct);
}

interface RawTrustViewRow {
  id: string;
  cluster_id?: string | null;
  merchant_id: string;
  platform: string;
  title: string;
  price_current: number | string;
  price_original: number | string | null;
  stock: number;
  rating_star: number | string;
  rating_count: number;
  url: string;
  merchant_name?: string | null;
  merchant_is_official?: boolean | null;
  merchant_location?: string | null;
  threat_risk_score?: number | string | null;
  dosafe_risk_score?: number | string | null;
  review_risk_score?: number | string | null;
  review_risk_breakdown?: Record<string, unknown> | null;
}

interface RawMerchantRow {
  id?: string;
  name?: string;
  platform?: string;
  is_official?: boolean;
  rating_star?: number | string | null;
  follower_count?: number | null;
  location?: string | null;
  risk_score?: number | string | null;
}

interface RawOfferRow {
  id: string;
  cluster_id?: string | null;
  platform: string;
  title: string;
  price_current: number | string;
  price_original: number | string | null;
  stock: number;
  rating_star: number | string;
  rating_count: number;
  url: string;
  merchants?: RawMerchantRow | RawMerchantRow[] | null;
}

function mapTrustViewRowToMerchantOffer(row: RawTrustViewRow): MerchantOffer {
  const combinedRisk = Number(row.threat_risk_score || 0);
  const dosafeRisk = Number(row.dosafe_risk_score ?? combinedRisk);
  const reviewRisk = Number(row.review_risk_score || 0);
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    price_current: Number(row.price_current),
    price_original: row.price_original ? Number(row.price_original) : null,
    stock: row.stock,
    rating_star: Number(row.rating_star),
    rating_count: row.rating_count,
    url: row.url,
    merchant: {
      id: row.merchant_id || '',
      name: row.merchant_name || 'Gian hàng',
      platform: row.platform,
      is_official: Boolean(row.merchant_is_official),
      rating_star: null,
      follower_count: 0,
      location: row.merchant_location || null,
      risk_score: Math.max(combinedRisk, dosafeRisk, reviewRisk),
      dosafe_risk_score: dosafeRisk,
      review_risk_score: reviewRisk,
      review_risk_breakdown: row.review_risk_breakdown || null,
    },
  };
}

function mapOfferRowToMerchantOffer(item: RawOfferRow): MerchantOffer {
  const merchantObj = Array.isArray(item.merchants)
    ? item.merchants[0]
    : item.merchants;
  const dosafeRisk = Number(merchantObj?.risk_score || 0);
  return {
    id: item.id,
    platform: item.platform,
    title: item.title,
    price_current: Number(item.price_current),
    price_original: item.price_original ? Number(item.price_original) : null,
    stock: item.stock,
    rating_star: Number(item.rating_star),
    rating_count: item.rating_count,
    url: item.url,
    merchant: {
      id: merchantObj?.id || '',
      name: merchantObj?.name || 'Gian hàng',
      platform: merchantObj?.platform || item.platform,
      is_official: Boolean(merchantObj?.is_official),
      rating_star: merchantObj?.rating_star
        ? Number(merchantObj.rating_star)
        : null,
      follower_count: merchantObj?.follower_count || 0,
      location: merchantObj?.location || null,
      risk_score: dosafeRisk,
      dosafe_risk_score: dosafeRisk,
      review_risk_score: 0,
      review_risk_breakdown: null,
    },
  };
}

/**
 * Fetch all merchant listing offers for a master product.
 * Queries `rate.v_products_with_merchant_trust` (granted to anon/authenticated)
 * and falls back to explicit non-PII column selection on `rate.merchants`.
 */
export async function getMasterProductOffers(
  masterId: string
): Promise<MerchantOffer[]> {
  const supabase = getRateClient();

  const { data: viewData, error: viewErr } = await supabase
    .from('v_products_with_merchant_trust')
    .select('*')
    .eq('cluster_id', masterId)
    .order('price_current', { ascending: true });

  if (!viewErr && viewData) {
    return (viewData as unknown as RawTrustViewRow[]).map(
      mapTrustViewRowToMerchantOffer
    );
  }

  // Fallback with explicit column list matching column-level SELECT grants on rate.merchants
  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id,
      cluster_id,
      platform,
      title,
      price_current,
      price_original,
      stock,
      rating_star,
      rating_count,
      url,
      merchants (
        id,
        name,
        platform,
        is_official,
        rating_star,
        follower_count,
        location,
        risk_score
      )
    `
    )
    .eq('cluster_id', masterId)
    .order('price_current', { ascending: true });

  if (error || !data) {
    log.error('offers fetch failed', { masterId, message: error?.message });
    return [];
  }

  return (data as unknown as RawOfferRow[]).map(mapOfferRowToMerchantOffer);
}

/**
 * Batch-fetch merchant listing offers for multiple master products in chunked `.in('cluster_id', ...)` queries.
 * Eliminates N+1 query storms in Cross-Platform Deal Radar and multi-product aggregations.
 */
export async function getMasterProductOffersBatch(
  masterIds: readonly string[]
): Promise<Map<string, MerchantOffer[]>> {
  const uniqueIds = Array.from(
    new Set(masterIds.map((id) => id.trim()).filter(Boolean))
  );
  const offersByMaster = new Map<string, MerchantOffer[]>(
    uniqueIds.map((id) => [id, []])
  );
  if (uniqueIds.length === 0) {
    return offersByMaster;
  }

  const supabase = getRateClient();
  const chunkSize = 150;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const batchIds = uniqueIds.slice(i, i + chunkSize);

    const { data: viewData, error: viewErr } = await supabase
      .from('v_products_with_merchant_trust')
      .select('*')
      .in('cluster_id', batchIds)
      .order('price_current', { ascending: true });

    if (!viewErr && viewData) {
      for (const row of viewData as unknown as RawTrustViewRow[]) {
        const cid = row.cluster_id ? String(row.cluster_id) : '';
        if (!cid) continue;
        const list = offersByMaster.get(cid) ?? [];
        list.push(mapTrustViewRowToMerchantOffer(row));
        offersByMaster.set(cid, list);
      }
      continue;
    }

    const { data, error } = await supabase
      .from('products')
      .select(
        `
        id,
        cluster_id,
        platform,
        title,
        price_current,
        price_original,
        stock,
        rating_star,
        rating_count,
        url,
        merchants (
          id,
          name,
          platform,
          is_official,
          rating_star,
          follower_count,
          location,
          risk_score
        )
      `
      )
      .in('cluster_id', batchIds)
      .order('price_current', { ascending: true });

    if (error || !data) {
      log.error('batch offers fetch failed', {
        batchSize: batchIds.length,
        message: error?.message,
      });
      continue;
    }

    for (const item of data as unknown as RawOfferRow[]) {
      const cid = item.cluster_id ? String(item.cluster_id) : '';
      if (!cid) continue;
      const list = offersByMaster.get(cid) ?? [];
      list.push(mapOfferRowToMerchantOffer(item));
      offersByMaster.set(cid, list);
    }
  }

  return offersByMaster;
}

interface RawReviewFlagRow {
  verdict?: 'authentic' | 'suspicious' | 'fake' | 'unanalyzed' | null;
  fake_probability?: number | string | null;
  flag_category?: ReviewFlagCategory | null;
  include_in_rating?: boolean | null;
  reason?: string | null;
  signals?: Record<string, unknown> | null;
}

interface RawReviewRow {
  id: string;
  author_name?: string | null;
  rating_star?: number | string | null;
  comment?: string | null;
  variation?: string | null;
  created_at: string;
  reviewer_type?: string | null;
  upvotes?: number | string | null;
  downvotes?: number | string | null;
  report_count?: number | string | null;
  helpfulness_weight?: number | string | null;
  criteria_ratings?: Record<string, number> | null;
  review_flags?: RawReviewFlagRow | RawReviewFlagRow[] | null;
}

/**
 * Fetch reviews across listings grouped under a master product,
 * including JReviews vote metrics and AI transparency flags.
 */
export async function getMasterProductReviews(
  masterId: string
): Promise<ReviewItem[]> {
  const supabase = getRateClient();
  const { data: prods, error: prodsErr } = await supabase
    .from('products')
    .select('id')
    .eq('cluster_id', masterId);
  if (prodsErr) {
    throw new Error(
      `rate-api: failed to resolve listings for master ${masterId}: ${prodsErr.message}`
    );
  }
  if (!prods || prods.length === 0) return [];

  const productIds = (prods as Array<{ id: string }>).map((p) => p.id);
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*, review_flags(*)')
    .in('product_id', productIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(
      `rate-api: failed to fetch reviews for master ${masterId}: ${error.message}`
    );
  }
  if (!reviews) {
    return [];
  }

  return (reviews as unknown as RawReviewRow[]).map((r) => {
    const vf = Array.isArray(r.review_flags)
      ? r.review_flags[0]
      : r.review_flags;
    const verdict = vf?.verdict ?? null;
    const flagCategory: ReviewFlagCategory =
      vf?.flag_category ||
      (verdict === 'fake'
        ? 'seeding_fake'
        : verdict === 'suspicious'
          ? 'low_value_coin_spam'
          : 'authentic');
    const includeInRating = Boolean(
      vf?.include_in_rating ??
      (flagCategory === 'authentic' && verdict !== 'fake')
    );
    const upvotes = Number(r.upvotes ?? 0);
    const downvotes = Number(r.downvotes ?? 0);
    const reports = Number(r.report_count ?? 0);
    const computedWeight =
      r.helpfulness_weight != null
        ? Number(r.helpfulness_weight)
        : computeJReviewsWeight({
            upvotes,
            downvotes,
            reports,
            flagCategory,
            verdict,
            includeInRating,
          });

    const item: ReviewItem = {
      id: r.id,
      author_name: r.author_name || 'Khách hàng',
      rating_star: Number(r.rating_star || 5),
      comment: r.comment || '',
      variation: r.variation || null,
      created_at: r.created_at,
      reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
      upvotes,
      downvotes,
      report_count: reports,
      helpfulness_weight: includeInRating ? computedWeight : 0,
      include_in_rating: includeInRating,
      criteria_ratings: r.criteria_ratings || {},
      verdict,
      fake_probability:
        vf?.fake_probability != null ? Number(vf.fake_probability) : null,
      flag_category: flagCategory,
      reason: vf?.reason || null,
      signals: vf?.signals || null,
    };
    item.trust_assessment = evaluateReviewTrustAssessment(item);
    return item;
  });
}

interface RawReviewAnalysisRow {
  total_reviews_analyzed?: number | string | null;
  authenticity_score?: number | string | null;
  sentiment_positive_ratio?: number | string | null;
  ai_summary?: string | null;
  pros?: unknown;
  cons?: unknown;
}

/**
 * Fetch aggregated AI Review Analysis (Pros, Cons, AI Summary, Authenticity %)
 * across listings belonging to a master product.
 */
export async function getMasterProductReviewSummary(
  masterId: string,
  reviewsFallback: ReviewItem[] = []
): Promise<ReviewAnalysisSummary> {
  // Unanalyzed community reviews are neither authentic nor suspicious yet, so
  // they stay out of every percentage.
  const analyzedReviews = reviewsFallback.filter((r) => !isPendingReview(r));
  const totalFromReviews = analyzedReviews.length;
  const authenticFromReviews = analyzedReviews.filter(
    (r) => r.include_in_rating
  ).length;
  const fakeFromReviews = analyzedReviews.filter(
    (r) =>
      r.flag_category === 'seeding_fake' ||
      r.flag_category === 'competitor_sabotage' ||
      r.flag_category === 'review_bombing' ||
      r.verdict === 'fake'
  ).length;
  const suspiciousFromReviews = Math.max(
    0,
    totalFromReviews - authenticFromReviews - fakeFromReviews
  );

  const fallbackAuthenticPct =
    totalFromReviews > 0
      ? Math.round((authenticFromReviews / totalFromReviews) * 1000) / 10
      : 100;
  const fallbackSuspiciousPct =
    totalFromReviews > 0
      ? Math.round((suspiciousFromReviews / totalFromReviews) * 1000) / 10
      : 0;
  const fallbackFakePct =
    totalFromReviews > 0
      ? Math.round((fakeFromReviews / totalFromReviews) * 1000) / 10
      : 0;

  const supabase = getRateClient();
  const { data: prods } = await supabase
    .from('products')
    .select('id')
    .eq('cluster_id', masterId);

  const productIds = ((prods || []) as Array<{ id: string }>).map((p) => p.id);
  if (productIds.length > 0) {
    const { data: analyses } = await supabase
      .from('review_analysis')
      .select('*')
      .in('product_id', productIds)
      .order('analyzed_at', { ascending: false });

    if (analyses && analyses.length > 0) {
      const typedAnalyses = analyses as unknown as RawReviewAnalysisRow[];
      const prosSet = new Set<string>();
      const consSet = new Set<string>();
      let totalAnalyzed = 0;
      let weightedAuthenticity = 0;
      let latestSummary: string | null = null;

      for (const row of typedAnalyses) {
        const count = Number(row.total_reviews_analyzed || 0);
        totalAnalyzed += count;
        weightedAuthenticity +=
          Number(row.authenticity_score ?? fallbackAuthenticPct) *
          Math.max(1, count);
        if (!latestSummary && row.ai_summary) {
          latestSummary = String(row.ai_summary);
        }
        if (Array.isArray(row.pros)) {
          for (const p of row.pros) {
            if (typeof p === 'string' && p.trim()) prosSet.add(p.trim());
          }
        }
        if (Array.isArray(row.cons)) {
          for (const c of row.cons) {
            if (typeof c === 'string' && c.trim()) consSet.add(c.trim());
          }
        }
      }

      const denom = typedAnalyses.reduce(
        (acc, r) => acc + Math.max(1, Number(r.total_reviews_analyzed || 0)),
        0
      );
      const avgAuthScore =
        denom > 0
          ? Math.round((weightedAuthenticity / denom) * 10) / 10
          : fallbackAuthenticPct;

      return {
        total_analyzed: totalAnalyzed || totalFromReviews,
        authentic_pct:
          totalFromReviews > 0 ? fallbackAuthenticPct : avgAuthScore,
        suspicious_pct: totalFromReviews > 0 ? fallbackSuspiciousPct : 0,
        fake_pct:
          totalFromReviews > 0
            ? fallbackFakePct
            : Math.max(0, Math.round((100 - avgAuthScore) * 10) / 10),
        pros: Array.from(prosSet).slice(0, 6),
        cons: Array.from(consSet).slice(0, 6),
        ai_summary: latestSummary,
      };
    }
  }

  return {
    total_analyzed: totalFromReviews,
    authentic_pct: fallbackAuthenticPct,
    suspicious_pct: fallbackSuspiciousPct,
    fake_pct: fallbackFakePct,
    pros: [],
    cons: [],
    ai_summary: null,
  };
}

/**
 * Fetch comparison data for multiple master products while preserving the requested slug order.
 */
export async function compareMasterProducts(
  slugs: string[]
): Promise<MasterProduct[]> {
  if (!slugs || slugs.length === 0) return [];
  const uniqueSlugs = Array.from(
    new Set(slugs.map((s) => s.trim()).filter(Boolean))
  ).slice(0, 4);
  if (uniqueSlugs.length === 0) return [];

  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .in('slug', uniqueSlugs)
    .eq('status', 'published');

  if (error || !data) {
    return [];
  }
  const rows = (data as MasterProduct[]).map(normalizeMasterProductRow);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const ordered = uniqueSlugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is MasterProduct => Boolean(item));

  if (ordered.length <= 1) {
    return ordered;
  }

  // Enforce strict same-category comparison: lock to the first product's category
  const primaryCat = getMasterProductCategorySlug(ordered[0]!);
  return ordered.filter((p) => getMasterProductCategorySlug(p) === primaryCat);
}

export type DiscountVerdictType =
  'fake_discount' | 'suspicious_discount' | 'genuine_deal' | 'normal_price';

export interface PriceHistoryPoint {
  id: number;
  product_id: string;
  merchant_name: string;
  platform: string;
  is_official: boolean;
  price: number;
  price_original: number | null;
  recorded_at: string;
  source: string | null;
}

export interface OfferDiscountAnalysis {
  product_id: string;
  merchant_name: string;
  platform: string;
  price_current: number;
  price_original: number | null;
  claimed_discount_pct: number;
  real_discount_vs_median_pct: number;
  historical_min_price: number;
  historical_max_price: number;
  historical_median_price: number;
  observation_count: number;
  verdict: DiscountVerdictType;
  badge_label: string;
  explanation: string;
}

export interface MasterProductPriceHistorySummary {
  points: PriceHistoryPoint[];
  byOffer: Record<string, OfferDiscountAnalysis>;
  lowestEverPrice: number | null;
  lowestEverDate: string | null;
  lowestEverMerchant: string | null;
  highestEverPrice: number | null;
  currentMinPrice: number | null;
  fakeDiscountCount: number;
  genuineDealCount: number;
}

interface RawPriceHistoryRow {
  id: number | string;
  product_id: string;
  price: number | string;
  price_original?: number | string | null;
  recorded_at: string;
  source?: string | null;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/**
 * Fetch time-series price history across all merchant offers for a master product
 * and run Fake Discount Detection (nâng khống giá gốc / giảm giá ảo).
 */
export async function getMasterProductPriceHistory(
  masterId: string,
  existingOffers?: MerchantOffer[]
): Promise<MasterProductPriceHistorySummary> {
  const offers = existingOffers ?? (await getMasterProductOffers(masterId));
  if (offers.length === 0) {
    return {
      points: [],
      byOffer: {},
      lowestEverPrice: null,
      lowestEverDate: null,
      lowestEverMerchant: null,
      highestEverPrice: null,
      currentMinPrice: null,
      fakeDiscountCount: 0,
      genuineDealCount: 0,
    };
  }

  const offerMap = new Map<string, MerchantOffer>();
  for (const off of offers) {
    offerMap.set(off.id, off);
  }

  const productIds = offers.map((o) => o.id);
  const supabase = getRateClient();
  const { data: rawRows, error } = await supabase
    .from('price_history')
    .select('id, product_id, price, price_original, recorded_at, source')
    .in('product_id', productIds)
    .order('recorded_at', { ascending: false })
    .limit(1000);

  if (error) {
    log.error('price_history fetch failed', {
      masterId,
      message: error.message,
    });
  }

  const chronologicalRows = [
    ...((rawRows || []) as unknown as RawPriceHistoryRow[]),
  ].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const points: PriceHistoryPoint[] = [];
  const pricesByOffer = new Map<string, number[]>();
  const origPricesByOffer = new Map<string, number[]>();

  for (const row of chronologicalRows) {
    const off = offerMap.get(row.product_id);
    if (!off) continue;
    const price = Number(row.price || 0);
    if (price <= 0) continue;
    const priceOriginal =
      row.price_original != null && Number(row.price_original) > 0
        ? Number(row.price_original)
        : null;

    points.push({
      id: Number(row.id),
      product_id: row.product_id,
      merchant_name: off.merchant.name,
      platform: off.platform,
      is_official: off.merchant.is_official,
      price,
      price_original: priceOriginal,
      recorded_at: row.recorded_at,
      source: row.source || null,
    });

    const list = pricesByOffer.get(row.product_id) ?? [];
    list.push(price);
    pricesByOffer.set(row.product_id, list);

    if (priceOriginal) {
      const origList = origPricesByOffer.get(row.product_id) ?? [];
      origList.push(priceOriginal);
      origPricesByOffer.set(row.product_id, origList);
    }
  }

  // Ensure every active offer has at least its current price represented
  const nowIso = new Date().toISOString();
  for (const off of offers) {
    const existingList = pricesByOffer.get(off.id);
    if (!existingList || existingList.length === 0) {
      pricesByOffer.set(off.id, [off.price_current]);
      points.push({
        id: -1 * (points.length + 1),
        product_id: off.id,
        merchant_name: off.merchant.name,
        platform: off.platform,
        is_official: off.merchant.is_official,
        price: off.price_current,
        price_original: off.price_original,
        recorded_at: nowIso,
        source: 'live_listing',
      });
    }
  }

  // Sort all points chronologically
  points.sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  // Market median across all current offers
  const marketMedianPrice = computeMedian(offers.map((o) => o.price_current));

  const byOffer: Record<string, OfferDiscountAnalysis> = {};
  let fakeDiscountCount = 0;
  let genuineDealCount = 0;

  for (const off of offers) {
    const histPrices = pricesByOffer.get(off.id) ?? [off.price_current];
    const lastHistPrice = histPrices[histPrices.length - 1];
    const rawSamples =
      lastHistPrice === off.price_current
        ? histPrices
        : [...histPrices, off.price_current];
    const allSamples = rawSamples.filter((p) => p > 0);
    const histMin = Math.min(...allSamples);
    const histMax = Math.max(...allSamples);
    const histMedian = computeMedian(allSamples);
    const referenceBasePrice =
      histPrices.length >= 2
        ? histMedian
        : Math.max(histMedian, marketMedianPrice);

    const priceCurrent = off.price_current;
    const priceOriginal =
      off.price_original && off.price_original > priceCurrent
        ? off.price_original
        : null;

    const claimedDiscountPct = priceOriginal
      ? Math.round(((priceOriginal - priceCurrent) / priceOriginal) * 1000) / 10
      : 0;

    const realDiscountVsMedianPct =
      referenceBasePrice > 0
        ? Math.round(
            ((referenceBasePrice - priceCurrent) / referenceBasePrice) * 1000
          ) / 10
        : 0;

    let verdict: DiscountVerdictType = 'normal_price';
    let badgeLabel = 'Giá ổn định';
    let explanation = `Giá bán hiện tại (${priceCurrent.toLocaleString('vi-VN')} ₫) khớp với mức trung vị lịch sử (${histMedian.toLocaleString('vi-VN')} ₫).`;

    if (priceOriginal && claimedDiscountPct >= 5) {
      // Case 1: Shop claims >= 8% discount, but current price is at or above historical median
      // AND original price was inflated above historical max actual selling price
      if (
        priceCurrent >= referenceBasePrice * 0.98 &&
        (priceOriginal > histMax * 1.05 ||
          claimedDiscountPct - realDiscountVsMedianPct >= 10)
      ) {
        verdict = 'fake_discount';
        badgeLabel = 'Cảnh báo Giảm giá ảo';
        explanation = `Gian hàng niêm yết giá gạch ngang ${priceOriginal.toLocaleString('vi-VN')} ₫ (-${claimedDiscountPct}%), nhưng giá bán thực tế lịch sử chưa từng vượt ${histMax.toLocaleString('vi-VN')} ₫ (trung vị: ${histMedian.toLocaleString('vi-VN')} ₫).`;
        fakeDiscountCount += 1;
      } else if (claimedDiscountPct - realDiscountVsMedianPct >= 6) {
        verdict = 'suspicious_discount';
        badgeLabel = 'Nghi nâng giá gốc';
        explanation = `Mức giảm công bố (-${claimedDiscountPct}%) cao hơn đáng kể so với mức giảm thực tế (-${Math.max(0, realDiscountVsMedianPct)}%) khi đối chiếu lịch sử giá (${histMedian.toLocaleString('vi-VN')} ₫).`;
        fakeDiscountCount += 1;
      } else if (realDiscountVsMedianPct >= 3 || priceCurrent <= histMin) {
        verdict = 'genuine_deal';
        badgeLabel = 'Giảm giá thật';
        explanation = `Giá hiện tại thấp hơn ${Math.max(realDiscountVsMedianPct, claimedDiscountPct)}% so với mức trung vị lịch sử (${histMedian.toLocaleString('vi-VN')} ₫).`;
        genuineDealCount += 1;
      }
    } else if (
      realDiscountVsMedianPct >= 3 ||
      (histPrices.length >= 2 && priceCurrent <= histMin && histMin < histMax)
    ) {
      verdict = 'genuine_deal';
      badgeLabel = 'Đáy giá lịch sử';
      explanation = `Đang ở vùng giá thấp nhất ghi nhận được (${priceCurrent.toLocaleString('vi-VN')} ₫ so với đỉnh ${histMax.toLocaleString('vi-VN')} ₫).`;
      genuineDealCount += 1;
    }

    byOffer[off.id] = {
      product_id: off.id,
      merchant_name: off.merchant.name,
      platform: off.platform,
      price_current: priceCurrent,
      price_original: priceOriginal,
      claimed_discount_pct: claimedDiscountPct,
      real_discount_vs_median_pct: realDiscountVsMedianPct,
      historical_min_price: histMin,
      historical_max_price: histMax,
      historical_median_price: histMedian,
      observation_count: histPrices.length,
      verdict,
      badge_label: badgeLabel,
      explanation,
    };
  }

  let lowestPoint: PriceHistoryPoint | null = null;
  let highestEverPrice: number | null = null;

  for (const pt of points) {
    if (!lowestPoint || pt.price < lowestPoint.price) {
      lowestPoint = pt;
    }
    if (highestEverPrice === null || pt.price > highestEverPrice) {
      highestEverPrice = pt.price;
    }
  }

  const currentMinPrice =
    offers.length > 0 ? Math.min(...offers.map((o) => o.price_current)) : null;

  return {
    points,
    byOffer,
    lowestEverPrice: lowestPoint ? lowestPoint.price : currentMinPrice,
    lowestEverDate: lowestPoint ? lowestPoint.recorded_at : null,
    lowestEverMerchant: lowestPoint ? lowestPoint.merchant_name : null,
    highestEverPrice,
    currentMinPrice,
    fakeDiscountCount,
    genuineDealCount,
  };
}

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
  review_risk_score: number;
  risk_score: number;
  trust_score: number;
  product_count: number;
  min_price: number | null;
  max_price: number | null;
  review_risk_breakdown: MerchantRiskBreakdown;
  updated_at: string | null;
}

export interface MerchantProductListing {
  id: string;
  platform: string;
  platform_item_id: string;
  title: string;
  price_current: number;
  price_original: number | null;
  stock: number;
  historical_sold: number;
  rating_star: number;
  rating_count: number;
  url: string;
  image: string | null;
  master_product: {
    id: string;
    slug: string;
    name: string;
    brand: string;
    category_slug: string;
    market_min_price: number;
    market_max_price: number;
    merchant_count: number;
  } | null;
  discount_analysis: OfferDiscountAnalysis | null;
}

export interface MerchantProfileDetail extends MerchantSummary {
  listings: MerchantProductListing[];
  recent_reviews: Array<
    ReviewItem & {
      product_id: string;
      product_title: string;
      master_slug: string | null;
    }
  >;
}

export interface RatePlatformStats {
  masterProductsCount: number;
  listingsCount: number;
  merchantsCount: number;
  priceObservationsCount: number;
  totalReviewsCount: number;
  authenticReviewsCount: number;
  filteredSeedingCount: number;
  authenticRatioPct: number;
  categoriesWithCounts: Array<
    RateCategoryItem & {
      productCount: number;
      routeHref: string;
    }
  >;
  recentReviewsSample: Array<
    ReviewItem & {
      productTitle: string;
      masterSlug: string | null;
      masterRouteHref?: string | null;
    }
  >;
}

interface RawMerchantSafeRow {
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

interface RawProductRow {
  id: string;
  merchant_id: string;
  platform: string;
  platform_item_id: string;
  title: string;
  price_current: number | string;
  price_original?: number | string | null;
  stock?: number | null;
  historical_sold?: number | null;
  rating_star?: number | string | null;
  rating_count?: number | null;
  images?: string[] | null;
  url: string;
  cluster_id?: string | null;
}

export function getCategoryRouteHref(slug: string): string {
  if (
    slug === 'smartphones' ||
    slug === 'tablets' ||
    slug === 'laptops' ||
    slug === 'smartwatches' ||
    slug === 'earbuds'
  ) {
    return `/${slug}`;
  }
  return `/smartphones?category=${encodeURIComponent(slug)}`;
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
  if (slugOrProduct && typeof slugOrProduct === 'object') {
    const slug = slugOrProduct.slug;
    if (slug && KNOWN_LOCAL_DEVICE_IMAGES.has(slug)) {
      return `/img/devices/${slug}.jpg`;
    }
    return (
      slugOrProduct.thumbnail ||
      (Array.isArray(slugOrProduct.images) && slugOrProduct.images.length > 0
        ? slugOrProduct.images[0] || null
        : null) ||
      fallbackUrl ||
      null
    );
  }
  if (slugOrProduct && KNOWN_LOCAL_DEVICE_IMAGES.has(slugOrProduct)) {
    return `/img/devices/${slugOrProduct}.jpg`;
  }
  return fallbackUrl || null;
}

export function normalizeMasterProductRow(row: MasterProduct): MasterProduct {
  if (!row?.slug) return row;
  if (KNOWN_LOCAL_DEVICE_IMAGES.has(row.slug)) {
    const localImg = `/img/devices/${row.slug}.jpg`;
    return {
      ...row,
      thumbnail: localImg,
      images: [localImg],
    };
  }
  return row;
}

export type CanonicalCategorySlug =
  'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';

export function getMasterProductCategorySlug(
  product: Pick<MasterProduct, 'slug'> & {
    name?: string | null;
    model?: string | null;
    category_id?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  categorySlugById?: ReadonlyMap<string, string>
): CanonicalCategorySlug {
  const catSlugFromMap =
    product.category_id && categorySlugById
      ? categorySlugById.get(product.category_id)
      : undefined;
  const catSlugFromMeta =
    typeof product.metadata?.category_slug === 'string'
      ? product.metadata.category_slug
      : undefined;
  const resolvedCat = catSlugFromMap || catSlugFromMeta;

  if (
    resolvedCat === 'tablets' ||
    resolvedCat === 'laptops' ||
    resolvedCat === 'smartwatches' ||
    resolvedCat === 'earbuds' ||
    resolvedCat === 'smartphones'
  ) {
    return resolvedCat;
  }

  const haystack =
    `${product.name || ''} ${product.model || ''} ${product.slug}`.toLowerCase();
  if (
    /ipad|galaxy tab|xiaomi pad|matepad|redmi pad|tab s\d|tablet|máy tính bảng/i.test(
      haystack
    )
  ) {
    return 'tablets';
  }
  if (
    /macbook|thinkpad|zenbook|vivobook|inspiron|xps|legion|rog|tuf|omen|pavilion|spectre|envy|gram|surface laptop|ultrabook|laptop/i.test(
      haystack
    )
  ) {
    return 'laptops';
  }
  if (
    /apple watch|galaxy watch|garmin|xiaomi watch|huawei watch|amazfit|smartwatch|đồng hồ thông minh/i.test(
      haystack
    )
  ) {
    return 'smartwatches';
  }
  if (
    /airpods|galaxy buds|wf-1000xm|wh-1000xm|earbuds|tai nghe|freebuds|soundcore/i.test(
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
  },
  categorySlugById?: ReadonlyMap<string, string>
): string {
  const catSlug = getMasterProductCategorySlug(product, categorySlugById);
  return `/${catSlug}/${product.slug}`;
}

function computeDynamicReviewRisk(allReviews: ReviewItem[]): {
  reviewRiskScore: number;
  breakdown: MerchantRiskBreakdown;
} {
  // Unanalyzed community reviews carry no risk signal yet.
  const reviews = allReviews.filter((r) => !isPendingReview(r));
  const total = reviews.length;
  if (total === 0) {
    return {
      reviewRiskScore: 0,
      breakdown: {
        total_reviews: 0,
        authentic_count: 0,
        coin_spam_count: 0,
        seeding_fake_count: 0,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 0,
      },
    };
  }

  let authentic = 0;
  let coinSpam = 0;
  let seedingFake = 0;
  let sabotageOrBombing = 0;

  for (const r of reviews) {
    if (r.flag_category === 'seeding_fake' || r.verdict === 'fake') {
      seedingFake += 1;
    } else if (
      r.flag_category === 'competitor_sabotage' ||
      r.flag_category === 'review_bombing'
    ) {
      sabotageOrBombing += 1;
    } else if (
      r.flag_category === 'low_value_coin_spam' ||
      !r.include_in_rating
    ) {
      coinSpam += 1;
    } else {
      authentic += 1;
    }
  }

  const flaggedTotal = coinSpam + seedingFake + sabotageOrBombing;
  const suspiciousRatioPct = Math.round((flaggedTotal / total) * 1000) / 10;

  // Weighted risk formula matching Rate review risk engine:
  // seeding_fake carries heavy weight (1.0), coin_spam moderate (0.35), sabotage (0.5)
  const weightedPenalty =
    (seedingFake * 1.0 + coinSpam * 0.35 + sabotageOrBombing * 0.5) / total;
  const reviewRiskScore = Math.min(
    100,
    Math.max(0, Math.round(weightedPenalty * 100))
  );

  return {
    reviewRiskScore,
    breakdown: {
      total_reviews: total,
      authentic_count: authentic,
      coin_spam_count: coinSpam,
      seeding_fake_count: seedingFake,
      sabotage_or_bombing_count: sabotageOrBombing,
      suspicious_ratio_pct: suspiciousRatioPct,
    },
  };
}

/**
 * Fetch all tracked merchants with computed Dual Risk Scores (DOSafe + AI Review Risk)
 * and active listing statistics. Uses explicit non-PII column selection.
 */
export async function getMerchantsList(params?: {
  q?: string;
  platform?: string;
  officialOnly?: boolean;
  minTrust?: number;
  sort?: 'trust_desc' | 'products_desc' | 'seeding_asc' | 'followers_desc';
  limit?: number;
}): Promise<MerchantSummary[]> {
  const supabase = getRateClient();

  let mQuery = supabase
    .from('merchants')
    .select(
      'id, platform, platform_shop_id, name, slug, url, is_official, rating_star, follower_count, location, risk_score, metadata, updated_at'
    )
    .order('is_official', { ascending: false })
    .order('follower_count', { ascending: false });

  if (params?.platform && params.platform !== 'all') {
    mQuery = mQuery.eq('platform', params.platform.toLowerCase());
  }
  if (params?.officialOnly) {
    mQuery = mQuery.eq('is_official', true);
  }
  if (params?.limit && params.limit > 0) {
    mQuery = mQuery.limit(params.limit);
  }

  const { data: merchantRows } = await mQuery;
  const merchants = (merchantRows as unknown as RawMerchantSafeRow[]) || [];
  if (merchants.length === 0) return [];

  const merchantIds = merchants.map((m) => m.id);
  const prodRows = await fetchAllRows('products', (from, to) =>
    supabase
      .from('products')
      .select('id, merchant_id, price_current')
      .in('merchant_id', merchantIds)
      .order('id')
      .range(from, to)
  );

  const products =
    (prodRows as Array<{
      id: string;
      merchant_id: string;
      price_current: number | string;
    }>) || [];

  const prodToMerchant = new Map<string, string>();
  const prodsByMerchant = new Map<string, number[]>();
  const productIdsByMerchant = new Map<string, string[]>();

  for (const p of products) {
    prodToMerchant.set(p.id, p.merchant_id);
    const list = prodsByMerchant.get(p.merchant_id) ?? [];
    const price = Number(p.price_current || 0);
    if (price > 0) list.push(price);
    prodsByMerchant.set(p.merchant_id, list);

    const idList = productIdsByMerchant.get(p.merchant_id) ?? [];
    idList.push(p.id);
    productIdsByMerchant.set(p.merchant_id, idList);
  }

  const extractPersistedBreakdown = (
    m: RawMerchantSafeRow
  ): MerchantRiskBreakdown | null => {
    const candidate =
      m.review_risk_breakdown ??
      (m.metadata && typeof m.metadata === 'object'
        ? (m.metadata.review_risk_breakdown as
            MerchantRiskBreakdown | undefined)
        : undefined);
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.total_reviews === 'number'
    ) {
      return candidate;
    }
    return null;
  };

  const unscoredProductIds: string[] = [];
  for (const m of merchants) {
    if (!extractPersistedBreakdown(m)) {
      const mProdIds = productIdsByMerchant.get(m.id);
      if (mProdIds && mProdIds.length > 0) {
        unscoredProductIds.push(...mProdIds);
      }
    }
  }

  const mappedReviewsByMerchant = new Map<string, ReviewItem[]>();
  if (unscoredProductIds.length > 0) {
    const reviewRows = await fetchAllRows('reviews', (from, to) =>
      supabase
        .from('reviews')
        .select(
          'id, product_id, review_flags(verdict, flag_category, include_in_rating)'
        )
        .in('product_id', unscoredProductIds)
        .order('id')
        .range(from, to)
    );

    for (const r of (reviewRows as unknown as Array<
      RawReviewRow & { product_id: string }
    >) || []) {
      const mId = prodToMerchant.get(r.product_id);
      if (!mId) continue;
      const vf = Array.isArray(r.review_flags)
        ? r.review_flags[0]
        : r.review_flags;
      const verdict = vf?.verdict ?? null;
      const flagCategory: ReviewFlagCategory =
        vf?.flag_category ||
        (verdict === 'fake'
          ? 'seeding_fake'
          : verdict === 'suspicious'
            ? 'low_value_coin_spam'
            : 'authentic');
      const includeInRating = Boolean(
        vf?.include_in_rating ??
        (flagCategory === 'authentic' && verdict !== 'fake')
      );
      const upvotes = Number(r.upvotes ?? 0);
      const downvotes = Number(r.downvotes ?? 0);
      const reports = Number(r.report_count ?? 0);

      const item: ReviewItem = {
        id: r.id,
        author_name: r.author_name || 'Khách hàng',
        rating_star: Number(r.rating_star || 5),
        comment: r.comment || '',
        variation: r.variation || null,
        created_at: r.created_at,
        reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
        upvotes,
        downvotes,
        report_count: reports,
        helpfulness_weight: includeInRating
          ? Number(r.helpfulness_weight ?? 1)
          : 0,
        include_in_rating: includeInRating,
        criteria_ratings: r.criteria_ratings || {},
        verdict,
        fake_probability:
          vf?.fake_probability != null ? Number(vf.fake_probability) : null,
        flag_category: flagCategory,
        reason: vf?.reason || null,
        signals: vf?.signals || null,
      };

      const existing = mappedReviewsByMerchant.get(mId) ?? [];
      existing.push(item);
      mappedReviewsByMerchant.set(mId, existing);
    }
  }

  let results: MerchantSummary[] = merchants.map((m) => {
    const prices = prodsByMerchant.get(m.id) ?? [];
    const persistedBreakdown = extractPersistedBreakdown(m);
    const mReviews = mappedReviewsByMerchant.get(m.id) ?? [];
    const dynamicRisk = persistedBreakdown
      ? null
      : computeDynamicReviewRisk(mReviews);
    const meta = (
      m.metadata && typeof m.metadata === 'object' ? m.metadata : {}
    ) as Record<string, unknown>;
    const dosafeRisk =
      typeof meta.dosafe_risk_score === 'number'
        ? meta.dosafe_risk_score
        : Number(m.risk_score || 0);
    const persistedReviewRisk =
      m.review_risk_score != null
        ? Number(m.review_risk_score)
        : typeof meta.review_risk_score === 'number'
          ? meta.review_risk_score
          : 0;
    const effectiveReviewRisk = Math.max(
      dynamicRisk?.reviewRiskScore ?? 0,
      persistedReviewRisk
    );
    const breakdown = persistedBreakdown ??
      dynamicRisk?.breakdown ?? {
        total_reviews: 0,
        authentic_count: 0,
        coin_spam_count: 0,
        seeding_fake_count: 0,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 0,
      };
    const combinedRisk = Math.min(
      100,
      Math.max(Number(m.risk_score || 0), dosafeRisk, effectiveReviewRisk)
    );
    const trustScore = Math.max(0, 100 - combinedRisk);

    return {
      id: m.id,
      platform: m.platform,
      platform_shop_id: m.platform_shop_id,
      name: m.name,
      slug: m.slug || null,
      url:
        m.url ||
        (m.platform === 'shopee' && m.platform_shop_id
          ? `https://shopee.vn/shop/${m.platform_shop_id}`
          : null),
      is_official: Boolean(m.is_official),
      rating_star: m.rating_star != null ? Number(m.rating_star) : null,
      follower_count: Number(m.follower_count || 0),
      location: m.location || null,
      dosafe_risk_score: dosafeRisk,
      review_risk_score: effectiveReviewRisk,
      risk_score: combinedRisk,
      trust_score: trustScore,
      product_count: prices.length,
      min_price: prices.length > 0 ? Math.min(...prices) : null,
      max_price: prices.length > 0 ? Math.max(...prices) : null,
      review_risk_breakdown: breakdown,
      updated_at: m.updated_at || m.created_at || null,
    };
  });

  if (params?.q && params.q.trim()) {
    const kw = params.q.trim().toLowerCase();
    results = results.filter(
      (m) =>
        m.name.toLowerCase().includes(kw) ||
        m.platform_shop_id.toLowerCase().includes(kw) ||
        m.platform.toLowerCase().includes(kw) ||
        (m.slug && m.slug.toLowerCase().includes(kw))
    );
  }

  if (typeof params?.minTrust === 'number' && !Number.isNaN(params.minTrust)) {
    results = results.filter((m) => m.trust_score >= params.minTrust!);
  }

  if (params?.sort) {
    results = [...results].sort((a, b) => {
      switch (params.sort) {
        case 'trust_desc':
          return (
            b.trust_score - a.trust_score || b.product_count - a.product_count
          );
        case 'products_desc':
          return (
            b.product_count - a.product_count || b.trust_score - a.trust_score
          );
        case 'seeding_asc':
          return (
            a.review_risk_score - b.review_risk_score ||
            b.trust_score - a.trust_score
          );
        case 'followers_desc':
          return (
            b.follower_count - a.follower_count || b.trust_score - a.trust_score
          );
        default:
          return 0;
      }
    });
  }

  return results;
}

/**
 * Sanitize user-supplied identifier before interpolating into a PostgREST `.or()` filter
 * so commas, parentheses, dots, or spaces cannot inject arbitrary PostgREST operators.
 */
export function sanitizePostgrestFilterToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Fetch detailed profile for a single Merchant by UUID id, slug, or platform_shop_id,
 * including all listings with Fake Discount verdicts and buyer reviews with AI flags.
 */
export async function getMerchantProfileById(
  idOrSlug: string
): Promise<MerchantProfileDetail | null> {
  const cleaned = idOrSlug.trim();
  if (!cleaned) return null;

  const supabase = getRateClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleaned
    );

  const selectCols =
    'id, platform, platform_shop_id, name, slug, url, is_official, rating_star, follower_count, location, risk_score, metadata, created_at, updated_at';

  let merchantRow: RawMerchantSafeRow | null = null;

  if (isUuid) {
    const { data } = await supabase
      .from('merchants')
      .select(selectCols)
      .eq('id', cleaned)
      .maybeSingle();
    merchantRow = (data as unknown as RawMerchantSafeRow) || null;
  }

  if (!merchantRow) {
    const safeToken = sanitizePostgrestFilterToken(cleaned);
    if (!safeToken) {
      return null;
    }
    const { data } = await supabase
      .from('merchants')
      .select(selectCols)
      .or(`slug.eq.${safeToken},platform_shop_id.eq.${safeToken}`)
      .limit(1)
      .maybeSingle();
    merchantRow = (data as unknown as RawMerchantSafeRow) || null;
  }

  if (!merchantRow) {
    return null;
  }

  const { data: prodRows } = await supabase
    .from('products')
    .select(
      'id, merchant_id, platform, platform_item_id, title, price_current, price_original, stock, historical_sold, rating_star, rating_count, images, url, cluster_id'
    )
    .eq('merchant_id', merchantRow.id)
    .order('price_current', { ascending: true });

  const rawProducts = (prodRows as unknown as RawProductRow[]) || [];
  const clusterIds = Array.from(
    new Set(rawProducts.map((p) => p.cluster_id).filter(Boolean))
  ) as string[];
  const productIds = rawProducts.map((p) => p.id);

  const [masterRes, catsRes, reviewsRes] = await Promise.all([
    clusterIds.length > 0
      ? supabase
          .from('master_products')
          .select(
            'id, slug, name, brand, category_id, min_price, max_price, merchant_count'
          )
          .in('id', clusterIds)
      : Promise.resolve({ data: [] }),
    supabase.from('categories').select('id, slug'),
    productIds.length > 0
      ? supabase
          .from('reviews')
          .select('*, review_flags(*)')
          .in('product_id', productIds)
          .order('created_at', { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] }),
  ]);

  const catSlugById = new Map<string, string>();
  for (const c of (catsRes.data || []) as Array<{ id: string; slug: string }>) {
    catSlugById.set(c.id, c.slug);
  }

  const masterById = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      brand: string;
      category_slug: string;
      market_min_price: number;
      market_max_price: number;
      merchant_count: number;
    }
  >();

  for (const m of (masterRes.data || []) as Array<{
    id: string;
    slug: string;
    name: string;
    brand: string;
    category_id: string | null;
    min_price: number | string;
    max_price: number | string;
    merchant_count: number | null;
  }>) {
    masterById.set(m.id, {
      id: m.id,
      slug: m.slug,
      name: m.name,
      brand: m.brand,
      category_slug:
        (m.category_id && catSlugById.get(m.category_id)) || 'smartphones',
      market_min_price: Number(m.min_price || 0),
      market_max_price: Number(m.max_price || 0),
      merchant_count: Number(m.merchant_count || 0),
    });
  }

  // Compute price history / Fake Discount analysis per master product
  const discountByOfferId = new Map<string, OfferDiscountAnalysis>();
  await Promise.all(
    clusterIds.map(async (cId) => {
      try {
        const ph = await getMasterProductPriceHistory(cId);
        for (const [offerId, analysis] of Object.entries(ph.byOffer)) {
          discountByOfferId.set(offerId, analysis);
        }
      } catch {
        // Ignore individual history errors
      }
    })
  );

  const listings: MerchantProductListing[] = rawProducts.map((p) => {
    const masterInfo = p.cluster_id
      ? masterById.get(p.cluster_id) || null
      : null;
    return {
      id: p.id,
      platform: p.platform,
      platform_item_id: p.platform_item_id,
      title: p.title,
      price_current: Number(p.price_current || 0),
      price_original:
        p.price_original != null && Number(p.price_original) > 0
          ? Number(p.price_original)
          : null,
      stock: Number(p.stock || 0),
      historical_sold: Number(p.historical_sold || 0),
      rating_star: Number(p.rating_star || 0),
      rating_count: Number(p.rating_count || 0),
      url: p.url,
      image: p.images && p.images.length > 0 ? p.images[0] || null : null,
      master_product: masterInfo,
      discount_analysis: discountByOfferId.get(p.id) || null,
    };
  });

  const prodById = new Map(listings.map((l) => [l.id, l]));
  const recentReviews: MerchantProfileDetail['recent_reviews'] = (
    (reviewsRes.data || []) as unknown as Array<
      RawReviewRow & { product_id: string }
    >
  ).map((r) => {
    const vf = Array.isArray(r.review_flags)
      ? r.review_flags[0]
      : r.review_flags;
    const verdict = vf?.verdict ?? null;
    const flagCategory: ReviewFlagCategory =
      vf?.flag_category ||
      (verdict === 'fake'
        ? 'seeding_fake'
        : verdict === 'suspicious'
          ? 'low_value_coin_spam'
          : 'authentic');
    const includeInRating = Boolean(
      vf?.include_in_rating ??
      (flagCategory === 'authentic' && verdict !== 'fake')
    );
    const upvotes = Number(r.upvotes ?? 0);
    const downvotes = Number(r.downvotes ?? 0);
    const reports = Number(r.report_count ?? 0);
    const computedWeight =
      r.helpfulness_weight != null
        ? Number(r.helpfulness_weight)
        : computeJReviewsWeight({
            upvotes,
            downvotes,
            reports,
            flagCategory,
            verdict,
            includeInRating,
          });
    const prod = prodById.get(r.product_id);

    return {
      id: r.id,
      product_id: r.product_id,
      product_title: prod?.title || 'Sản phẩm niêm yết',
      master_slug: prod?.master_product?.slug || null,
      author_name: r.author_name || 'Khách hàng',
      rating_star: Number(r.rating_star || 5),
      comment: r.comment || '',
      variation: r.variation || null,
      created_at: r.created_at,
      reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
      upvotes,
      downvotes,
      report_count: reports,
      helpfulness_weight: includeInRating ? computedWeight : 0,
      include_in_rating: includeInRating,
      criteria_ratings: r.criteria_ratings || {},
      verdict,
      fake_probability:
        vf?.fake_probability != null ? Number(vf.fake_probability) : null,
      flag_category: flagCategory,
      reason: vf?.reason || null,
      signals: vf?.signals || null,
    };
  });

  const { reviewRiskScore, breakdown } =
    computeDynamicReviewRisk(recentReviews);
  const meta = (
    merchantRow.metadata && typeof merchantRow.metadata === 'object'
      ? merchantRow.metadata
      : {}
  ) as Record<string, unknown>;
  const dosafeRisk =
    typeof meta.dosafe_risk_score === 'number'
      ? meta.dosafe_risk_score
      : Number(merchantRow.risk_score || 0);
  const persistedReviewRisk =
    typeof meta.review_risk_score === 'number' ? meta.review_risk_score : 0;
  const effectiveReviewRisk = Math.max(reviewRiskScore, persistedReviewRisk);
  const combinedRisk = Math.min(
    100,
    Math.max(
      Number(merchantRow.risk_score || 0),
      dosafeRisk,
      effectiveReviewRisk
    )
  );
  const trustScore = Math.max(0, 100 - combinedRisk);
  const prices = listings.map((l) => l.price_current).filter((p) => p > 0);

  return {
    id: merchantRow.id,
    platform: merchantRow.platform,
    platform_shop_id: merchantRow.platform_shop_id,
    name: merchantRow.name,
    slug: merchantRow.slug || null,
    url:
      merchantRow.url ||
      (merchantRow.platform === 'shopee' && merchantRow.platform_shop_id
        ? `https://shopee.vn/shop/${merchantRow.platform_shop_id}`
        : null),
    is_official: Boolean(merchantRow.is_official),
    rating_star:
      merchantRow.rating_star != null ? Number(merchantRow.rating_star) : null,
    follower_count: Number(merchantRow.follower_count || 0),
    location: merchantRow.location || null,
    dosafe_risk_score: dosafeRisk,
    review_risk_score: effectiveReviewRisk,
    risk_score: combinedRisk,
    trust_score: trustScore,
    product_count: listings.length,
    min_price: prices.length > 0 ? Math.min(...prices) : null,
    max_price: prices.length > 0 ? Math.max(...prices) : null,
    review_risk_breakdown: breakdown,
    updated_at: merchantRow.updated_at || merchantRow.created_at || null,
    listings,
    recent_reviews: recentReviews,
  };
}

/**
 * Fetch live platform statistics, category product counts, and recent verified/flagged
 * reviews from the `rate` schema to power the Homepage with 100% real database data.
 */
export async function getRatePlatformStats(): Promise<RatePlatformStats> {
  const supabase = getRateClient();

  const [
    catsRes,
    masterRes,
    prodsRes,
    merchantsRes,
    priceHistCountRes,
    reviewsRes,
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('id, parent_id, name, slug, icon, display_order')
      .order('display_order', { ascending: true }),
    fetchAllRows('master_products', (from, to) =>
      supabase
        .from('master_products')
        .select('id, slug, name, category_id')
        .eq('status', 'published')
        .order('id')
        .range(from, to)
    ).then((data) => ({ data })),
    fetchAllRows('products', (from, to) =>
      supabase
        .from('products')
        .select('id, title, cluster_id')
        .order('id')
        .range(from, to)
    ).then((data) => ({ data })),
    supabase.from('merchants').select('id', { count: 'exact', head: true }),
    supabase
      .from('price_history')
      .select('id', { count: 'estimated', head: true }),
    supabase
      .from('reviews')
      .select('*, review_flags(*)')
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const categories = (catsRes.data as RateCategoryItem[]) || [];
  const masterRows =
    (masterRes.data as Array<{
      id: string;
      slug: string;
      name: string;
      category_id: string | null;
    }>) || [];
  const prodRows =
    (prodsRes.data as Array<{
      id: string;
      title: string;
      cluster_id: string | null;
    }>) || [];

  const catSlugById = new Map<string, string>();
  for (const c of categories) {
    catSlugById.set(c.id, c.slug);
  }

  const countByCatId = new Map<string, number>();
  const masterSlugById = new Map<string, string>();
  const masterRouteById = new Map<string, string>();
  for (const m of masterRows) {
    masterSlugById.set(m.id, m.slug);
    masterRouteById.set(
      m.id,
      getMasterProductHref(
        { slug: m.slug, name: m.name, category_id: m.category_id },
        catSlugById
      )
    );
    if (m.category_id) {
      countByCatId.set(
        m.category_id,
        (countByCatId.get(m.category_id) || 0) + 1
      );
    }
  }

  const prodInfoById = new Map<
    string,
    { title: string; masterSlug: string | null; masterRouteHref: string | null }
  >();
  for (const p of prodRows) {
    prodInfoById.set(p.id, {
      title: p.title,
      masterSlug: p.cluster_id
        ? masterSlugById.get(p.cluster_id) || null
        : null,
      masterRouteHref: p.cluster_id
        ? masterRouteById.get(p.cluster_id) || null
        : null,
    });
  }

  const rawReviews =
    (reviewsRes.data as unknown as Array<
      RawReviewRow & { product_id: string }
    >) || [];
  let authenticCount = 0;
  let filteredCount = 0;

  const mappedReviews: RatePlatformStats['recentReviewsSample'] =
    rawReviews.map((r) => {
      const vf = Array.isArray(r.review_flags)
        ? r.review_flags[0]
        : r.review_flags;
      const verdict = vf?.verdict ?? null;
      const flagCategory: ReviewFlagCategory =
        vf?.flag_category ||
        (verdict === 'fake'
          ? 'seeding_fake'
          : verdict === 'suspicious'
            ? 'low_value_coin_spam'
            : 'authentic');
      const includeInRating = Boolean(
        vf?.include_in_rating ??
        (flagCategory === 'authentic' && verdict !== 'fake')
      );
      if (verdict === 'unanalyzed') {
        // Pending community reviews are neither authentic nor filtered yet.
      } else if (includeInRating) {
        authenticCount += 1;
      } else {
        filteredCount += 1;
      }
      const pInfo = prodInfoById.get(r.product_id);
      return {
        id: r.id,
        author_name: r.author_name || 'Khách hàng',
        rating_star: Number(r.rating_star || 5),
        comment: r.comment || '',
        variation: r.variation || null,
        created_at: r.created_at,
        reviewer_type: r.reviewer_type === 'expert' ? 'expert' : 'user',
        upvotes: Number(r.upvotes ?? 0),
        downvotes: Number(r.downvotes ?? 0),
        report_count: Number(r.report_count ?? 0),
        helpfulness_weight: includeInRating
          ? Number(r.helpfulness_weight ?? 1)
          : 0,
        include_in_rating: includeInRating,
        criteria_ratings: r.criteria_ratings || {},
        verdict,
        fake_probability:
          vf?.fake_probability != null ? Number(vf.fake_probability) : null,
        flag_category: flagCategory,
        reason: vf?.reason || null,
        signals: vf?.signals || null,
        productTitle: pInfo?.title || 'Sản phẩm công nghệ',
        masterSlug: pInfo?.masterSlug || null,
        masterRouteHref: pInfo?.masterRouteHref || null,
      };
    });

  const totalRev = mappedReviews.length;
  const analyzedRev = authenticCount + filteredCount;
  const authenticRatioPct =
    analyzedRev > 0
      ? Math.round((authenticCount / analyzedRev) * 1000) / 10
      : 100;

  return {
    masterProductsCount: masterRows.length,
    listingsCount: prodRows.length,
    merchantsCount: merchantsRes.count ?? 0,
    priceObservationsCount: priceHistCountRes.count ?? 0,
    totalReviewsCount: totalRev,
    authenticReviewsCount: authenticCount,
    filteredSeedingCount: filteredCount,
    authenticRatioPct,
    categoriesWithCounts: categories.map((cat) => ({
      ...cat,
      productCount: countByCatId.get(cat.id) || 0,
      routeHref: getCategoryRouteHref(cat.slug),
    })),
    recentReviewsSample: mappedReviews.slice(0, 6),
  };
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

export interface UrlInspectionResult {
  query: string;
  matchedType:
    | 'product_listing'
    | 'master_product'
    | 'merchant'
    | 'search_suggestions'
    | 'not_found';
  parsedUrl: ParsedEcommerceUrl;
  masterProduct: MasterProduct | null;
  matchedOffer: MerchantOffer | null;
  allOffers: MerchantOffer[];
  discountAnalysis: OfferDiscountAnalysis | null;
  priceHistory: MasterProductPriceHistorySummary | null;
  reviewSummary: ReviewAnalysisSummary | null;
  merchantProfile: MerchantSummary | null;
  suggestions: MasterProduct[];
  radarSignal?: import('./deal-radar').RadarSignal | null;
}

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function parseEcommerceUrlOrQuery(raw: string): ParsedEcommerceUrl {
  const trimmed = raw.trim();
  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  const hasKnownDomainToken =
    /(?:^|\/\/|\.)(?:shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|cellphones\.com\.vn|thegioididong\.com|topzone\.vn|dienmayxanh\.com|fptshop\.com\.vn|hoanghamobile\.com|didongviet\.vn|phongvu\.vn|rate\.vn)(?:\/|$)/i.test(
      trimmed
    );
  const isUrl = hasHttpProtocol || hasKnownDomainToken;

  let parsedHost: string | null = null;
  let parsedPathname = trimmed;
  if (hasHttpProtocol || hasKnownDomainToken) {
    try {
      const parsed = new URL(
        hasHttpProtocol ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`
      );
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          isUrl: false,
          platform: null,
          platformShopId: null,
          platformItemId: null,
          internalSlug: null,
        };
      }
      parsedHost = parsed.hostname.toLowerCase();
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
        parsedPathname.match(/\/product\/(\d+)\/(\d+)/i);
      if (itemMatch) {
        return {
          isUrl: true,
          platform: 'shopee',
          platformShopId: itemMatch[1] || null,
          platformItemId: itemMatch[2] || null,
          internalSlug: null,
        };
      }
      const shopMatch = parsedPathname.match(/\/shop\/(\d+)/i);
      if (shopMatch) {
        return {
          isUrl: true,
          platform: 'shopee',
          platformShopId: shopMatch[1] || null,
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
      return {
        isUrl: true,
        platform: 'lazada',
        platformShopId: lazadaMatch?.[2] || null,
        platformItemId: lazadaMatch?.[1] || null,
        internalSlug: null,
      };
    }

    if (isDomainOrSubdomain(parsedHost, 'tiki.vn')) {
      const tikiMatch = parsedPathname.match(/-p(\d+)\.html/i);
      return {
        isUrl: true,
        platform: 'tiki',
        platformShopId: null,
        platformItemId: tikiMatch?.[1] || null,
        internalSlug: null,
      };
    }

    if (isDomainOrSubdomain(parsedHost, 'tiktok.com')) {
      const prodMatch =
        parsedPathname.match(/\/product\/(\d+)/i) ||
        parsedPathname.match(/\/view\/product\/(\d+)/i) ||
        parsedPathname.match(/\/video\/(\d+)/i);
      const shopMatch = parsedPathname.match(/\/@([a-zA-Z0-9_.-]+)/);
      return {
        isUrl: true,
        platform: 'tiktok',
        platformShopId: shopMatch?.[1] || null,
        platformItemId: prodMatch?.[1] || null,
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
      const segments = parsedPathname.split('/').filter(Boolean);
      const lastSeg =
        segments[segments.length - 1]?.replace(/\.html?$/i, '') || null;
      const isValidItemSlug =
        lastSeg &&
        lastSeg !== 'search' &&
        lastSeg !== 'tim-kiem' &&
        lastSeg.length >= 2;
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
        return {
          isUrl: true,
          platform: 'rate',
          platformShopId: null,
          platformItemId: null,
          internalSlug: rateSlugMatch[1] || null,
        };
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
  const shopeeItemMatch = trimmed.match(/(?:a-)?i\.(\d+)\.(\d+)/i);
  if (shopeeItemMatch) {
    return {
      isUrl: true,
      platform: 'shopee',
      platformShopId: shopeeItemMatch[1] || null,
      platformItemId: shopeeItemMatch[2] || null,
      internalSlug: null,
    };
  }

  const lazadaMatch = trimmed.match(/-i(\d+)(?:-s(\d+))?\.html/i);
  if (lazadaMatch) {
    return {
      isUrl: true,
      platform: 'lazada',
      platformShopId: lazadaMatch[2] || null,
      platformItemId: lazadaMatch[1] || null,
      internalSlug: null,
    };
  }

  const tikiMatch = trimmed.match(/-p(\d+)\.html/i);
  if (tikiMatch) {
    return {
      isUrl: true,
      platform: 'tiki',
      platformShopId: null,
      platformItemId: tikiMatch[1] || null,
      internalSlug: null,
    };
  }

  // Rate.vn internal relative URL: /smartphones/<slug>, /tablets/<slug>, /laptops/<slug>, /smartwatches/<slug>, /earbuds/<slug>
  const rateSlugMatch = trimmed.match(
    /\/(?:smartphones|tablets|laptops|smartwatches|earbuds)\/([a-z0-9-]+)/i
  );
  if (rateSlugMatch) {
    return {
      isUrl: true,
      platform: 'rate',
      platformShopId: null,
      platformItemId: null,
      internalSlug: rateSlugMatch[1] || null,
    };
  }

  return {
    isUrl,
    platform: null,
    platformShopId: null,
    platformItemId: null,
    internalSlug: null,
  };
}

const PLATFORM_ITEM_ID_PREFIX: Partial<
  Record<NonNullable<ParsedEcommerceUrl['platform']>, string>
> = {
  tiktok: 'tts-',
  cellphones: 'cps-',
  tgdd: 'tgdd-',
  fptshop: 'fpt-',
  hoangha: 'hhm-',
  didongviet: 'ddv-',
  phongvu: 'pv-',
};

/**
 * Inspect an e-commerce product/shop URL (all 10 platforms) or keyword:
 * - Resolves exact `platform_item_id` or `url` against `rate.products`
 * - Or resolves `platform_shop_id` / merchant name against `rate.merchants`
 * - Or resolves product slug / keyword against `rate.master_products`
 * Returns complete price comparison, Fake Discount analysis, JReviews summary, and Merchant Dual Risk Score.
 */
export async function inspectProductOrShopUrl(
  rawQuery: string
): Promise<UrlInspectionResult> {
  const query = rawQuery.trim();
  const parsedUrl = parseEcommerceUrlOrQuery(query);

  if (!query) {
    return {
      query: '',
      matchedType: 'not_found',
      parsedUrl,
      masterProduct: null,
      matchedOffer: null,
      allOffers: [],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [],
    };
  }

  const supabase = getRateClient();

  // 1. Direct lookup by platform_item_id if parsed from URL
  if (parsedUrl.platformItemId) {
    const candidateIds = new Set<string>([parsedUrl.platformItemId]);
    if (parsedUrl.platformShopId) {
      candidateIds.add(
        `${parsedUrl.platformShopId}_${parsedUrl.platformItemId}`
      );
    }
    const prefix = parsedUrl.platform
      ? PLATFORM_ITEM_ID_PREFIX[parsedUrl.platform]
      : undefined;
    if (prefix && !parsedUrl.platformItemId.startsWith(prefix)) {
      candidateIds.add(`${prefix}${parsedUrl.platformItemId}`);
    }

    const { data: prodRow } = await supabase
      .from('products')
      .select('id, cluster_id, merchant_id, platform_item_id')
      .in('platform_item_id', Array.from(candidateIds))
      .limit(1)
      .maybeSingle();

    const matchedProd = prodRow as {
      id: string;
      cluster_id: string | null;
      merchant_id: string;
      platform_item_id: string;
    } | null;

    if (matchedProd?.cluster_id) {
      const { data: masterData } = await supabase
        .from('master_products')
        .select('*')
        .eq('id', matchedProd.cluster_id)
        .maybeSingle();

      const masterProduct = (masterData as MasterProduct) || null;
      if (masterProduct) {
        const [offers, reviews, merchantsList] = await Promise.all([
          getMasterProductOffers(masterProduct.id),
          getMasterProductReviews(masterProduct.id),
          getMerchantsList(),
        ]);
        const [priceHistory, reviewSummary] = await Promise.all([
          getMasterProductPriceHistory(masterProduct.id, offers),
          getMasterProductReviewSummary(masterProduct.id, reviews),
        ]);
        const matchedOffer =
          offers.find((o) => o.id === matchedProd.id) || offers[0] || null;
        const discountAnalysis = matchedOffer
          ? priceHistory.byOffer[matchedOffer.id] || null
          : null;
        const merchantProfile =
          merchantsList.find((m) => m.id === matchedProd.merchant_id) || null;

        return {
          query,
          matchedType: 'product_listing',
          parsedUrl,
          masterProduct,
          matchedOffer,
          allOffers: offers,
          discountAnalysis,
          priceHistory,
          reviewSummary,
          merchantProfile,
          suggestions: [],
        };
      }
    }
  }

  // 2. Direct lookup by Shopee/platform shop ID if URL is a shop link
  if (parsedUrl.platformShopId && !parsedUrl.platformItemId) {
    const merchants = await getMerchantsList();
    const matchedMerchant =
      merchants.find((m) => m.platform_shop_id === parsedUrl.platformShopId) ||
      null;
    if (matchedMerchant) {
      const suggestions = await getMasterProducts({ limit: 3 });
      return {
        query,
        matchedType: 'merchant',
        parsedUrl,
        masterProduct: null,
        matchedOffer: null,
        allOffers: [],
        discountAnalysis: null,
        priceHistory: null,
        reviewSummary: null,
        merchantProfile: matchedMerchant,
        suggestions,
      };
    }
  }

  // 3. Internal slug or exact master product slug match
  const candidateSlug = parsedUrl.internalSlug || query.toLowerCase();
  const exactMaster = await getMasterProductBySlug(candidateSlug);
  if (exactMaster) {
    const [offers, reviews, merchantsList] = await Promise.all([
      getMasterProductOffers(exactMaster.id),
      getMasterProductReviews(exactMaster.id),
      getMerchantsList(),
    ]);
    const [priceHistory, reviewSummary] = await Promise.all([
      getMasterProductPriceHistory(exactMaster.id, offers),
      getMasterProductReviewSummary(exactMaster.id, reviews),
    ]);
    const matchedOffer = offers[0] || null;
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;
    const merchantProfile = matchedOffer
      ? merchantsList.find((m) => m.id === matchedOffer.merchant.id) || null
      : null;

    return {
      query,
      matchedType: 'master_product',
      parsedUrl,
      masterProduct: exactMaster,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile,
      suggestions: [],
    };
  }

  // 4. Search across merchants and master products by keyword
  const [merchants, matchedProducts] = await Promise.all([
    getMerchantsList(),
    getMasterProducts({ search: query, limit: 6 }),
  ]);

  const lowerQ = query.toLowerCase();
  const matchedMerchantByName =
    merchants.find(
      (m) =>
        m.name.toLowerCase().includes(lowerQ) || m.platform_shop_id === query
    ) || null;

  if (matchedProducts.length === 1) {
    const single = matchedProducts[0]!;
    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(single.id),
      getMasterProductReviews(single.id),
    ]);
    const [priceHistory, reviewSummary] = await Promise.all([
      getMasterProductPriceHistory(single.id, offers),
      getMasterProductReviewSummary(single.id, reviews),
    ]);
    const matchedOffer = offers[0] || null;
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;
    const merchantProfile = matchedOffer
      ? merchants.find((m) => m.id === matchedOffer.merchant.id) ||
        matchedMerchantByName
      : matchedMerchantByName;

    return {
      query,
      matchedType: 'master_product',
      parsedUrl,
      masterProduct: single,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile,
      suggestions: matchedProducts,
    };
  }

  if (matchedProducts.length > 1) {
    const top = matchedProducts[0]!;
    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(top.id),
      getMasterProductReviews(top.id),
    ]);
    const [priceHistory, reviewSummary] = await Promise.all([
      getMasterProductPriceHistory(top.id, offers),
      getMasterProductReviewSummary(top.id, reviews),
    ]);
    const matchedOffer = offers[0] || null;
    const discountAnalysis = matchedOffer
      ? priceHistory.byOffer[matchedOffer.id] || null
      : null;

    return {
      query,
      matchedType: 'search_suggestions',
      parsedUrl,
      masterProduct: top,
      matchedOffer,
      allOffers: offers,
      discountAnalysis,
      priceHistory,
      reviewSummary,
      merchantProfile: matchedMerchantByName,
      suggestions: matchedProducts,
    };
  }

  if (matchedMerchantByName) {
    const fallbackProducts = await getMasterProducts({ limit: 3 });
    return {
      query,
      matchedType: 'merchant',
      parsedUrl,
      masterProduct: null,
      matchedOffer: null,
      allOffers: [],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: matchedMerchantByName,
      suggestions: fallbackProducts,
    };
  }

  const fallbackSuggestions = await getMasterProducts({ limit: 3 });
  return {
    query,
    matchedType: 'not_found',
    parsedUrl,
    masterProduct: null,
    matchedOffer: null,
    allOffers: [],
    discountAnalysis: null,
    priceHistory: null,
    reviewSummary: null,
    merchantProfile: null,
    suggestions: fallbackSuggestions,
  };
}
