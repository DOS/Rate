import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupportedAiProvider, AiSpecEnricherConfig } from './ai-spec-enricher.js';
import type { ScrapedReviewer } from './types.js';

/**
 * 5-Category Classification for Reviews across Products & Services
 * (Shopee, Lazada, Tiki, TikTok Shop, Facebook Seller, Website, Rate.vn)
 */
export type ReviewFlagCategory =
  | 'authentic' // Đánh giá thực tế có giá trị -> Tính vào điểm cuối (nhân với trọng số Vote Up/Down)
  | 'low_value_coin_spam' // Bình luận cày xu / văn mẫu vô thưởng vô phạt -> Skip khỏi điểm cuối (W=0), KHÔNG phạt shop
  | 'seeding_fake' // Buff đơn ảo / Seeding nâng bi có tổ chức -> Skip khỏi điểm cuối (W=0), PHẠT nặng Risk Score của shop
  | 'competitor_sabotage' // Đối thủ chơi xấu / Dìm hàng ác ý vô căn cứ -> Skip khỏi điểm cuối (W=0), bảo vệ shop khỏi bị dìm oan
  | 'review_bombing'; // Bom review / Đánh giá khi chưa dùng dịch vụ hoặc hủy đơn -> Skip khỏi điểm cuối (W=0)

export type ReviewVerdict = 'authentic' | 'suspicious' | 'fake' | 'unanalyzed';

/**
 * Strictly conforms to PostgreSQL CHECK constraint `rate.signals_valid(signals)`
 */
export interface ReviewSignals {
  burst_pattern_score: number; // 0..1
  duplicate_text_ratio: number; // 0..1
  account_age_bucket: 'low' | 'medium' | 'high' | 'unknown';
  reviewer_history_score: number; // 0..1
  language_marker_score: number; // 0..1
}

export interface ReviewInputItem {
  id: string;
  author_name?: string | null;
  rating_star: number;
  comment?: string | null;
  variation?: string | null;
  images?: string[];
  is_verified_buyer?: boolean;
  reviewer_type?: 'user' | 'expert';
  upvotes?: number;
  downvotes?: number;
  report_count?: number;
  platform_created_at?: string | null;
  /** Reviewer metadata from the scrape, when the platform exposes it. */
  reviewer?: ScrapedReviewer | null;
}

export interface AnalyzedReviewResult {
  review_id: string;
  verdict: ReviewVerdict;
  flag_category: ReviewFlagCategory;
  fake_probability: number; // 0..1
  include_in_rating: boolean;
  helpfulness_weight: number; // 0..3.00 (JReviews-style dynamic weight)
  reason: string;
  signals: ReviewSignals;
  detector?: string;
}

export interface JReviewsProductSummary {
  total_reviews_analyzed: number;
  authentic_review_count: number;
  ignored_review_count: number;
  raw_average_rating: number;
  user_rating_weighted: number; // JReviews weighted user rating (after skipping spam/seeding & applying upvote/downvote weights)
  expert_rating: number | null;
  overall_rating: number; // Combined Expert (40%) + Weighted User (60%) when expert_rating exists, else Weighted User
  authenticity_score: number; // 0..100
  sentiment_positive_ratio: number; // 0..100
  pros: string[];
  cons: string[];
  ai_summary: string;
  breakdown_by_category: Record<ReviewFlagCategory, number>;
}

export interface MerchantRiskInput {
  merchantId?: string;
  platform: string; // 'shopee' | 'lazada' | 'tiki' | 'tiktok' | 'facebook' | 'website' | 'rate'
  isOfficial: boolean;
  ratingStar?: number | null;
  followerCount?: number;
  listingPrice?: number;
  canonicalMinPrice?: number;
  reviewResults: AnalyzedReviewResult[];
  rawReviews?: ReviewInputItem[];
}

export interface MerchantRiskEvaluation {
  risk_score: number; // 0..100 (Higher = More risky)
  trust_score: number; // 0..100 (100 - risk_score, JReviews/Rate Trust Index)
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  seeding_ratio: number; // 0..1
  coin_spam_ratio: number; // 0..1
  sabotage_ratio: number; // 0..1
  price_anomaly_detected: boolean;
  reasons: string[];
}

const PROVIDER_DEFAULTS: Record<
  SupportedAiProvider,
  { baseUrl: string; defaultModel: string; envKeys: string[] }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    envKeys: ['AI_API_KEY', 'OPENAI_API_KEY'],
  },
  'dos-ai': {
    baseUrl: 'https://api.dos.me/v1',
    defaultModel: 'gpt-4o-mini',
    envKeys: ['DOS_AI_API_KEY', 'AI_API_KEY', 'OPENAI_API_KEY'],
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AI_API_KEY'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    envKeys: ['DEEPSEEK_API_KEY', 'AI_API_KEY'],
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    envKeys: ['GROQ_API_KEY', 'AI_API_KEY'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    envKeys: ['OPENROUTER_API_KEY', 'AI_API_KEY'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:14b',
    envKeys: ['AI_API_KEY'],
  },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, Number(n.toFixed(3))));
}

/**
 * JReviews-inspired Dynamic Review Weight Calculator
 * - Completely skips/ignores (`weight = 0`) reviews flagged as:
 *   `low_value_coin_spam`, `seeding_fake`, `competitor_sabotage`, `review_bombing`, or `verdict === 'fake'`.
 * - Boosts weight logarithmically up to 3.0x when community Upvotes exceed Downvotes.
 * - Reduces weight down to 0.00 when Downvotes exceed Upvotes or when reported for abuse.
 */
export function computeReviewWeight(params: {
  upvotes?: number;
  downvotes?: number;
  reportCount?: number;
  flagCategory: ReviewFlagCategory;
  verdict: ReviewVerdict;
}): number {
  const { upvotes = 0, downvotes = 0, reportCount = 0, flagCategory, verdict } = params;

  if (
    flagCategory === 'low_value_coin_spam' ||
    flagCategory === 'seeding_fake' ||
    flagCategory === 'competitor_sabotage' ||
    flagCategory === 'review_bombing' ||
    verdict === 'fake'
  ) {
    return 0;
  }

  const base = verdict === 'suspicious' ? 0.25 : 1.0;
  const netVotes = upvotes - downvotes;

  let weight = base;
  if (netVotes > 0) {
    weight = base + Math.log(1 + netVotes) * 0.45;
  } else if (netVotes < 0) {
    weight = base - Math.abs(netVotes) * 0.3;
  }

  weight -= reportCount * 0.35;

  return Number(Math.max(0, Math.min(3.0, weight)).toFixed(2));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Age of the reviewer's account when the review was written, in days. */
function accountAgeDays(r: ReviewInputItem): number | null {
  const joined = Date.parse(r.reviewer?.joinedAt || '');
  if (!Number.isFinite(joined)) return null;
  // Age at the time of writing; without a review date we would be measuring today's age.
  const written = Date.parse(r.platform_created_at || '');
  if (!Number.isFinite(written)) return null;
  const days = (written - joined) / DAY_MS;
  return days >= 0 ? days : null;
}

/** `unknown` when the platform does not expose the join date. */
export function accountAgeBucket(r: ReviewInputItem): ReviewSignals['account_age_bucket'] {
  const days = accountAgeDays(r);
  if (days === null) return 'unknown';
  if (days < 30) return 'low';
  if (days < 365) return 'medium';
  return 'high';
}

/**
 * 0..1, higher = more established reviewer. Log-scaled on the account's total review
 * count (0 -> 0, 9 -> 0.5, 99+ -> 1). Falls back to the old neutral prior when unknown.
 */
export function reviewerHistoryScore(r: ReviewInputItem): number {
  if (r.reviewer_type === 'expert') return 1.0;
  const total = r.reviewer?.totalReviews;
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return 0.7;
  return clamp01(Math.log10(1 + total) / 2);
}

/**
 * Text a platform fills in from the star rating itself (Tiki titles every review "Cực kì hài lòng" /
 * "Hài lòng" / "Bình thường" / "Không hài lòng" / "Rất không hài lòng"). It says nothing beyond the
 * stars, so a review whose whole comment is one of these is a star-only rating.
 */
const RATING_LABEL_RE = /^(?:(?:cực\s*k[ìỳ]|rất)\s+)?(?:không\s+)?hài\s+lòng$|^bình\s+thường$/i;

export function isRatingOnlyComment(comment: string | null | undefined): boolean {
  const text = (comment || '')
    .normalize('NFC')
    .replace(/[\s.!,]+$/u, '')
    .trim();
  return text.length === 0 || RATING_LABEL_RE.test(text);
}

function normalizeTextForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Provider-Agnostic AI Review Analyzer & JReviews Scoring Engine
 * Supports Products & Services across Shopee, Lazada, Tiki, TikTok Shop, Facebook, Website
 */
export class AiReviewAnalyzer {
  private provider: SupportedAiProvider;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(config: AiSpecEnricherConfig = {}) {
    this.provider = this.resolveProvider(config.provider);
    const defaults = PROVIDER_DEFAULTS[this.provider];

    this.apiKey = config.apiKey ?? this.resolveApiKey(this.provider);
    this.baseUrl = (
      config.baseUrl ||
      process.env.AI_BASE_URL ||
      process.env.DOS_AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      defaults.baseUrl
    ).replace(/\/+$/, '');

    this.model =
      config.model || process.env.AI_MODEL || process.env.OPENAI_MODEL || defaults.defaultModel;

    this.timeoutMs = config.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS || 25000);
  }

  private resolveProvider(explicit?: SupportedAiProvider): SupportedAiProvider {
    if (explicit && explicit in PROVIDER_DEFAULTS) return explicit;
    const envProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase() as SupportedAiProvider;
    if (envProvider && envProvider in PROVIDER_DEFAULTS) return envProvider;

    if (process.env.DOS_AI_API_KEY || process.env.DOS_AI_BASE_URL) return 'dos-ai';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    return 'openai';
  }

  private resolveApiKey(provider: SupportedAiProvider): string {
    const keys = PROVIDER_DEFAULTS[provider].envKeys;
    for (const k of keys) {
      const val = process.env[k];
      if (val && val.trim().length > 0) return val.trim();
    }
    return '';
  }

  public isConfigured(): boolean {
    if (this.provider === 'ollama') return true;
    return this.apiKey.length > 0;
  }

  /**
   * Tier 1: Deterministic Heuristic Classifier for Vietnamese E-Commerce & Service Reviews
   * Catches coin-farming spam, duplicate seeding templates, competitor sabotage, and review bombing
   * at 0 token cost.
   */
  public analyzeWithHeuristics(reviews: ReviewInputItem[]): AnalyzedReviewResult[] {
    // 1. Pre-compute duplicate comment frequency across distinct authors
    const commentCounts = new Map<string, Set<string>>();
    for (const r of reviews) {
      const norm = normalizeTextForDedupe(r.comment || '');
      // Rating labels repeat across buyers because the platform writes them, not because of seeding.
      if (norm.length >= 15 && !isRatingOnlyComment(r.comment)) {
        const authors = commentCounts.get(norm) || new Set<string>();
        authors.add((r.author_name || r.id).toLowerCase());
        commentCounts.set(norm, authors);
      }
    }

    return reviews.map(r => {
      const comment = (r.comment || '').trim();
      const norm = normalizeTextForDedupe(comment);
      const distinctAuthorsWithSameText = commentCounts.get(norm)?.size ?? 1;

      // Default clean signals
      let burstScore = 0.05;
      let duplicateRatio =
        distinctAuthorsWithSameText > 1 ? clamp01((distinctAuthorsWithSameText - 1) / 3) : 0;
      let languageMarker = 0.05;
      let flagCategory: ReviewFlagCategory = 'authentic';
      let verdict: ReviewVerdict = 'authentic';
      let fakeProb = 0.05;
      let reason = 'Đánh giá chi tiết, hợp lệ từ người dùng thực tế.';

      // Rule A: Coin-farming / Low-value spam ("nhận xu", "mang tính chất minh họa", poetry/unrelated filler, empty/ultra-short)
      const isCoinSpamPhrase =
        /nhận\s*xu|kiếm\s*xu|lấy\s*xu|săn\s*xu|mang\s*tính\s*chất\s*minh\s*họa|hình\s*ảnh\s*chỉ\s*mang\s*tính|công\s*thức\s*nấu|bài\s*thơ|lời\s*bài\s*hát/i.test(
          comment
        );
      const isUnopenedFiller =
        r.rating_star >= 4 &&
        /chưa\s*(?:dùng|xài|bóc|khui|mở\s*hộp|test)\s*(?:nên\s*chưa\s*biết|nhưng\s*cứ\s*cho\s*5\s*sao)/i.test(
          comment
        );
      const isRatingOnly = isRatingOnlyComment(comment);
      const isGibberishOrTooShort = comment.length < 6 || /(.)\1{5,}/i.test(comment);

      // Rule B: Competitor Sabotage (Đối thủ chơi xấu / chèo kéo sang shop khác / dìm 1 sao vô căn cứ)
      const isCompetitorSabotage =
        r.rating_star <= 2 &&
        (/qua\s*shop\s*[\w\s]+\s*mua|mua\s*bên\s*[\w\s]+\s*rẻ\s*hơn|đừng\s*mua\s*shop\s*này\s*qua\s*bên|ib\s*mình\s*bán\s*rẻ\s*hơn|liên\s*hệ\s*zalo\s*\d{8,}/i.test(
          comment
        ) ||
          (r.is_verified_buyer === false &&
            /lừa\s*đảo|hàng\s*đểu|phốt/i.test(comment) &&
            comment.length < 30));

      // Rule C: Review Bombing (Bom review / hủy đơn chưa trải nghiệm dịch vụ / hùa theo drama)
      const isReviewBombing =
        r.rating_star <= 2 &&
        /chưa\s*(?:dùng|sử\s*dụng|trải\s*nghiệm)\s*(?:dịch\s*vụ|sản\s*phẩm)|mới\s*đặt\s*đã\s*hủy|hủy\s*đơn\s*rồi|vào\s*đánh\s*1\s*sao\s*cho\s*bõ\s*ghét|hùa\s*theo|tẩy\s*chay\s*shop/i.test(
          comment
        );

      // Rule D: Coordinated Seeding / Fake Boost (Văn mẫu trùng lặp giữa nhiều tài khoản khác nhau hoặc khen lố kịch bản)
      const isDuplicateSeeding =
        distinctAuthorsWithSameText >= 2 &&
        comment.length >= 15 &&
        !isCoinSpamPhrase &&
        !isRatingOnly;
      const isScriptedPraise =
        r.rating_star === 5 &&
        /sản\s*phẩm\s*tuyệt\s*vời\s*đáng\s*đồng\s*tiền\s*bát\s*gạo\s*sẽ\s*ủng\s*hộ\s*shop\s*dài\s*dài\s*10\s*điểm/i.test(
          comment
        ) &&
        distinctAuthorsWithSameText >= 2;

      if (isCompetitorSabotage) {
        flagCategory = 'competitor_sabotage';
        verdict = 'fake';
        fakeProb = 0.88;
        languageMarker = 0.85;
        reason =
          'Phát hiện dấu hiệu đối thủ cạnh tranh không lành mạnh / điều hướng sang nơi bán khác.';
      } else if (isReviewBombing) {
        flagCategory = 'review_bombing';
        verdict = 'fake';
        fakeProb = 0.82;
        burstScore = 0.8;
        reason = 'Đánh giá khi chưa sử dụng sản phẩm/dịch vụ (hủy đơn hoặc hiệu ứng đám đông).';
      } else if (isDuplicateSeeding || isScriptedPraise) {
        flagCategory = 'seeding_fake';
        verdict = 'fake';
        fakeProb = 0.9;
        duplicateRatio = Math.max(0.85, duplicateRatio);
        languageMarker = 0.8;
        reason = `Nội dung văn mẫu seeding trùng lặp giữa ${distinctAuthorsWithSameText} tài khoản khác nhau.`;
      } else if (isRatingOnly) {
        // Stars without text are a real rating (many platforms do not ask for a comment) with
        // nothing to verify, so they count at reduced weight: 'authentic' + 'suspicious' is the
        // 0.25 base weight in both computeReviewWeight and the SQL rate.compute_review_weight.
        // No seller penalty, low fake probability.
        flagCategory = 'authentic';
        verdict = 'suspicious';
        fakeProb = 0.3;
        reason =
          'Chỉ chấm sao, không có nội dung: vẫn tính vào điểm nhưng với trọng số thấp (25% một đánh giá có nội dung).';
      } else if (isCoinSpamPhrase || isUnopenedFiller || isGibberishOrTooShort) {
        flagCategory = 'low_value_coin_spam';
        verdict = 'suspicious';
        fakeProb = 0.65;
        languageMarker = 0.75;
        reason =
          'Bình luận mang tính chất nhận xu / chưa trải nghiệm thực tế (được bỏ qua khỏi điểm tổng, không phạt shop).';
      }

      const helpfulnessWeight = computeReviewWeight({
        upvotes: r.upvotes ?? 0,
        downvotes: r.downvotes ?? 0,
        reportCount: r.report_count ?? 0,
        flagCategory,
        verdict,
      });

      const includeInRating = helpfulnessWeight > 0;
      if (!includeInRating && flagCategory === 'authentic') {
        reason = 'Đánh giá bị cộng đồng Vote Down / Báo cáo nhiều nên giảm trọng số về 0.';
      }

      return {
        review_id: r.id,
        verdict,
        flag_category: flagCategory,
        fake_probability: clamp01(fakeProb),
        include_in_rating: includeInRating,
        helpfulness_weight: helpfulnessWeight,
        reason,
        signals: {
          burst_pattern_score: clamp01(burstScore),
          duplicate_text_ratio: clamp01(duplicateRatio),
          account_age_bucket: accountAgeBucket(r),
          reviewer_history_score: reviewerHistoryScore(r),
          language_marker_score: clamp01(languageMarker),
        },
      };
    });
  }

  /**
   * Tier 2: Combines Heuristic Rules + Optional LLM Batch Refinement & JReviews Aggregation
   */
  public async analyzeReviews(
    reviews: ReviewInputItem[],
    context?: {
      entityName?: string;
      entityType?: 'product' | 'service';
      platform?: string;
      expertRating?: number | null;
    }
  ): Promise<{
    results: AnalyzedReviewResult[];
    summary: JReviewsProductSummary;
  }> {
    const heuristicResults = this.analyzeWithHeuristics(reviews);
    let finalResults = heuristicResults;
    let aiPros: string[] = [];
    let aiCons: string[] = [];
    let aiSummaryText = '';

    if (this.isConfigured() && reviews.length > 0) {
      const llmRefinement = await this.refineBatchWithAi(reviews, heuristicResults, context);
      if (llmRefinement) {
        finalResults = llmRefinement.results;
        aiPros = llmRefinement.pros;
        aiCons = llmRefinement.cons;
        aiSummaryText = llmRefinement.aiSummary;
      }
    }

    const summary = this.computeJReviewsSummary(
      reviews,
      finalResults,
      context?.expertRating ?? null,
      aiPros,
      aiCons,
      aiSummaryText
    );

    return { results: finalResults, summary };
  }

  private async refineBatchWithAi(
    reviews: ReviewInputItem[],
    baseline: AnalyzedReviewResult[],
    context?: {
      entityName?: string;
      entityType?: 'product' | 'service';
      platform?: string;
    }
  ): Promise<{
    results: AnalyzedReviewResult[];
    pros: string[];
    cons: string[];
    aiSummary: string;
  } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const systemPrompt = `You are an expert e-commerce & service review fraud auditor for Rate.vn (inspired by JReviews).
Classify each review into one of 5 exact flag_category values:
1. "authentic": Genuine buyer/user feedback describing real product/service experience.
2. "low_value_coin_spam": Shopee/Lazada coin-farming spam ("nhận xu", "mang tính chất minh họa", copy-pasted poetry/recipes, or rating 5 stars before opening the box). Ignored in rating, does NOT penalize seller.
3. "seeding_fake": Coordinated fake positive review / astroturfing to artificially inflate ratings. Ignored in rating, PENALIZES seller risk score.
4. "competitor_sabotage": Malicious 1-2 star attack promoting a rival shop or baseless defamation. Ignored in rating, protects seller.
5. "review_bombing": Review left after cancelling an order without using the product/service, or mob brigading. Ignored in rating.

Reviewer fields (verified_purchase, reviewer_anonymous, reviewer_account_age_days, reviewer_total_reviews, repeat_purchase) are null when the platform does not expose them; null is NOT evidence of fraud. A brand-new account with no other reviews posting generic praise is supporting evidence, never proof on its own.

Return ONLY valid JSON matching:
{
  "reviews": [
    {
      "review_id": "string",
      "flag_category": "authentic" | "low_value_coin_spam" | "seeding_fake" | "competitor_sabotage" | "review_bombing",
      "verdict": "authentic" | "suspicious" | "fake",
      "fake_probability": number (0.0 to 1.0),
      "reason": "short Vietnamese explanation"
    }
  ],
  "pros": ["string (Vietnamese)"],
  "cons": ["string (Vietnamese)"],
  "ai_summary": "string (2-3 sentences in Vietnamese summarizing authentic buyer feedback)"
}`;

      const aiMap = new Map<string, any>();
      const collectedPros: string[] = [];
      const collectedCons: string[] = [];
      let firstSummary = '';
      let anyBatchSucceeded = false;

      for (let offset = 0; offset < reviews.length; offset += 25) {
        const batch = reviews.slice(offset, offset + 25);
        const batchBaseline = baseline.slice(offset, offset + 25);
        const userPrompt = JSON.stringify({
          entity_name: context?.entityName || 'Sản phẩm / Dịch vụ',
          entity_type: context?.entityType || 'product',
          platform: context?.platform || 'shopee',
          reviews: batch.map((r, idx) => ({
            review_id: r.id,
            author: r.author_name,
            rating_star: r.rating_star,
            comment: r.comment,
            verified_purchase: r.reviewer?.verifiedPurchase ?? r.is_verified_buyer ?? null,
            reviewer_anonymous: r.reviewer?.isAnonymous ?? null,
            reviewer_account_age_days: (() => {
              const days = accountAgeDays(r);
              return days === null ? null : Math.round(days);
            })(),
            reviewer_total_reviews: r.reviewer?.totalReviews ?? null,
            repeat_purchase: r.reviewer?.repeatPurchase ?? null,
            heuristic_hint: batchBaseline[idx]?.flag_category,
          })),
        });

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        if (!response.ok) continue;
        const data = (await response.json()) as any;
        const rawContent: string | undefined = data?.choices?.[0]?.message?.content;
        if (!rawContent) continue;

        const parsed = JSON.parse(
          rawContent
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim()
        );

        anyBatchSucceeded = true;
        if (Array.isArray(parsed.reviews)) {
          for (const item of parsed.reviews) {
            if (item?.review_id) aiMap.set(String(item.review_id), item);
          }
        }
        if (Array.isArray(parsed.pros)) {
          for (const p of parsed.pros) {
            if (typeof p === 'string' && p.trim() && !collectedPros.includes(p.trim())) {
              collectedPros.push(p.trim());
            }
          }
        }
        if (Array.isArray(parsed.cons)) {
          for (const c of parsed.cons) {
            if (typeof c === 'string' && c.trim() && !collectedCons.includes(c.trim())) {
              collectedCons.push(c.trim());
            }
          }
        }
        if (!firstSummary && typeof parsed.ai_summary === 'string' && parsed.ai_summary.trim()) {
          firstSummary = parsed.ai_summary.trim();
        }
      }

      if (!anyBatchSucceeded) return null;

      const validCategories = new Set<ReviewFlagCategory>([
        'authentic',
        'low_value_coin_spam',
        'seeding_fake',
        'competitor_sabotage',
        'review_bombing',
      ]);

      const hybridDetector = `hybrid:${this.provider}:${this.model}`;
      const mergedResults = baseline.map((base, idx) => {
        const aiItem = aiMap.get(base.review_id);
        // Stars without text give the model nothing to judge: keep the heuristic's low fake
        // probability and "Chỉ chấm sao" reason instead of the model's guess.
        if (!aiItem || isRatingOnlyComment(reviews[idx]?.comment)) {
          return { ...base, detector: 'heuristic:v2-jreviews' };
        }

        // If deterministic heuristic already caught an explicit phrase (e.g. "nhận xu" or duplicate seeding),
        // preserve high-confidence heuristic; otherwise adopt AI classification.
        const cat: ReviewFlagCategory =
          base.flag_category !== 'authentic'
            ? base.flag_category
            : validCategories.has(aiItem.flag_category)
              ? aiItem.flag_category
              : base.flag_category;

        const verdict: ReviewVerdict =
          cat === 'seeding_fake' || cat === 'competitor_sabotage' || cat === 'review_bombing'
            ? 'fake'
            : cat === 'low_value_coin_spam'
              ? 'suspicious'
              : 'authentic';

        const srcReview = reviews[idx];
        const weight = computeReviewWeight({
          upvotes: srcReview?.upvotes ?? 0,
          downvotes: srcReview?.downvotes ?? 0,
          reportCount: srcReview?.report_count ?? 0,
          flagCategory: cat,
          verdict,
        });

        return {
          ...base,
          flag_category: cat,
          verdict,
          fake_probability: clamp01(Number(aiItem.fake_probability ?? base.fake_probability)),
          include_in_rating: weight > 0,
          helpfulness_weight: weight,
          reason:
            typeof aiItem.reason === 'string' && aiItem.reason.trim()
              ? aiItem.reason.trim()
              : base.reason,
          detector: hybridDetector,
        };
      });

      return {
        results: mergedResults,
        pros: collectedPros.slice(0, 6),
        cons: collectedCons.slice(0, 6),
        aiSummary: firstSummary,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Computes JReviews-style Dual Rating (Expert vs Weighted Authentic User Rating)
   */
  public computeJReviewsSummary(
    reviews: ReviewInputItem[],
    results: AnalyzedReviewResult[],
    expertRatingInput: number | null = null,
    aiPros: string[] = [],
    aiCons: string[] = [],
    aiSummaryText = ''
  ): JReviewsProductSummary {
    const breakdown: Record<ReviewFlagCategory, number> = {
      authentic: 0,
      low_value_coin_spam: 0,
      seeding_fake: 0,
      competitor_sabotage: 0,
      review_bombing: 0,
    };

    let rawSum = 0;
    let weightedUserSum = 0;
    let totalUserWeight = 0;
    let expertSum = 0;
    let expertWeight = 0;
    let authenticCount = 0;
    let ignoredCount = 0;
    let positiveAuthenticCount = 0;

    for (let i = 0; i < reviews.length; i++) {
      const r = reviews[i];
      const res = results[i];
      const cat = res?.flag_category ?? 'authentic';
      breakdown[cat] = (breakdown[cat] || 0) + 1;

      rawSum += r.rating_star;

      if (!res?.include_in_rating || res.helpfulness_weight <= 0) {
        ignoredCount++;
        continue;
      }

      authenticCount++;
      if (r.rating_star >= 4) positiveAuthenticCount++;

      if (r.reviewer_type === 'expert') {
        expertSum += r.rating_star * res.helpfulness_weight;
        expertWeight += res.helpfulness_weight;
      } else {
        weightedUserSum += r.rating_star * res.helpfulness_weight;
        totalUserWeight += res.helpfulness_weight;
      }
    }

    const rawAvg = reviews.length > 0 ? Number((rawSum / reviews.length).toFixed(2)) : 0;
    // No user review carries weight: there is no weighted rating (0, as refresh_master_product_rating
    // writes), not the raw average of the reviews that were just excluded.
    const weightedUserRating =
      totalUserWeight > 0 ? Number((weightedUserSum / totalUserWeight).toFixed(2)) : 0;

    const computedExpertRating =
      expertRatingInput !== null
        ? expertRatingInput
        : expertWeight > 0
          ? Number((expertSum / expertWeight).toFixed(2))
          : null;

    // JReviews overall blend: 40% Expert + 60% Weighted Authentic User (or 100% Weighted User if no Expert review yet)
    const overallRating =
      computedExpertRating !== null && totalUserWeight > 0
        ? Number((computedExpertRating * 0.4 + weightedUserRating * 0.6).toFixed(2))
        : computedExpertRating !== null
          ? computedExpertRating
          : weightedUserRating;

    // Authenticity score penalizes seeding_fake, but treats coin_spam mildly
    const seedingCount = breakdown.seeding_fake;
    const coinSpamCount = breakdown.low_value_coin_spam;
    const total = Math.max(1, reviews.length);
    const authenticityScore = Number(
      Math.max(
        0,
        Math.min(100, 100 - (seedingCount / total) * 85 - (coinSpamCount / total) * 25)
      ).toFixed(2)
    );

    const sentimentPositiveRatio =
      authenticCount > 0
        ? Number(((positiveAuthenticCount / authenticCount) * 100).toFixed(2))
        : 100;

    const defaultSummary =
      authenticCount > 0
        ? `Đã phân tích ${reviews.length} đánh giá: giữ lại ${authenticCount} đánh giá thực chất (điểm JReviews có trọng số: ${weightedUserRating}/5★) và loại bỏ ${ignoredCount} đánh giá rác/nhận xu/seeding/bom hàng khỏi điểm tổng.`
        : `Chưa có đánh giá thực chất sau khi lọc ${ignoredCount} bình luận rác/nhận xu.`;

    return {
      total_reviews_analyzed: reviews.length,
      authentic_review_count: authenticCount,
      ignored_review_count: ignoredCount,
      raw_average_rating: rawAvg,
      user_rating_weighted: weightedUserRating,
      expert_rating: computedExpertRating,
      overall_rating: overallRating,
      authenticity_score: authenticityScore,
      sentiment_positive_ratio: sentimentPositiveRatio,
      pros:
        aiPros.length > 0
          ? aiPros
          : positiveAuthenticCount > 0
            ? ['Nhận phản hồi tích cực từ người dùng thực tế']
            : [],
      cons: aiCons.length > 0 ? aiCons : [],
      ai_summary: aiSummaryText || defaultSummary,
      breakdown_by_category: breakdown,
    };
  }

  /**
   * Evaluates Merchant Risk Score (0..100) fairly:
   * - Penalizes `seeding_fake` and abnormal counterfeit pricing (`price_anomaly`).
   * - Does NOT penalize the merchant for `low_value_coin_spam`, `competitor_sabotage`, or `review_bombing`!
   */
  public evaluateMerchantRisk(input: MerchantRiskInput): MerchantRiskEvaluation {
    const total = Math.max(1, input.reviewResults.length);
    const seedingCount = input.reviewResults.filter(r => r.flag_category === 'seeding_fake').length;
    const coinSpamCount = input.reviewResults.filter(
      r => r.flag_category === 'low_value_coin_spam'
    ).length;
    const sabotageCount = input.reviewResults.filter(
      r => r.flag_category === 'competitor_sabotage' || r.flag_category === 'review_bombing'
    ).length;

    const seedingRatio = Number((seedingCount / total).toFixed(3));
    const coinSpamRatio = Number((coinSpamCount / total).toFixed(3));
    const sabotageRatio = Number((sabotageCount / total).toFixed(3));

    let risk = 15; // Baseline neutral risk
    const reasons: string[] = [];

    // 1. Seeding Fake Penalty (up to +45 risk)
    if (seedingRatio > 0) {
      const seedingPenalty = Math.min(45, Math.round(seedingRatio * 75));
      risk += seedingPenalty;
      reasons.push(
        `Phát hiện ${(seedingRatio * 100).toFixed(0)}% đánh giá có dấu hiệu Seeding/Buff đơn ảo (+${seedingPenalty} điểm rủi ro).`
      );
    }

    // 2. Price Anomaly Detection (Scam / Counterfeit dump pricing)
    let priceAnomaly = false;
    if (
      input.listingPrice &&
      input.canonicalMinPrice &&
      input.canonicalMinPrice > 2000000 &&
      input.listingPrice < input.canonicalMinPrice * 0.58 &&
      !input.isOfficial
    ) {
      priceAnomaly = true;
      risk += 45;
      reasons.push(
        `Giá bán (${input.listingPrice.toLocaleString('vi-VN')}₫) thấp bất thường so với giá sàn chuẩn (${input.canonicalMinPrice.toLocaleString('vi-VN')}₫) -> Cảnh báo hàng dựng/nhái hoặc lừa đảo (+45 điểm rủi ro).`
      );
    }

    // 3. Authentic 1-2 Star Scam/Defect Reports (exclude competitor_sabotage & review_bombing!)
    if (input.rawReviews && input.rawReviews.length > 0) {
      let authenticLowStarCount = 0;
      for (let i = 0; i < input.rawReviews.length; i++) {
        const rev = input.rawReviews[i];
        const flag = input.reviewResults[i];
        if (rev.rating_star <= 2 && flag?.flag_category === 'authentic' && flag.include_in_rating) {
          // A review left out of the rating (e.g. voted down to weight 0) is no complaint either.
          // A low star with no text describes no defect: it counts at the same reduced weight
          // as in the rating, not as a full complaint.
          authenticLowStarCount += isRatingOnlyComment(rev.comment) ? 0.25 : 1;
        }
      }
      const lowStarRatio = authenticLowStarCount / total;
      if (lowStarRatio >= 0.2) {
        const defectPenalty = Math.min(25, Math.round(lowStarRatio * 45));
        risk += defectPenalty;
        reasons.push(
          `Tỷ lệ phàn nàn thực tế 1-2 sao cao (${(lowStarRatio * 100).toFixed(0)}%) (+${defectPenalty} điểm rủi ro).`
        );
      }
    }

    // 4. Platform & Official Mall Trust Bonus
    if (input.isOfficial) {
      risk -= 15;
      reasons.push('Gian hàng Chính hãng (Mall / Official Store) (-15 điểm rủi ro).');
    } else if (input.platform === 'facebook' || input.platform === 'website') {
      risk += 10;
      reasons.push(
        `Giao dịch qua kênh tự do (${input.platform}) cần kiểm tra kỹ thông tin thanh toán (+10 điểm rủi ro).`
      );
    }

    if ((input.followerCount ?? 0) >= 50000) {
      risk -= 5;
    }

    if (sabotageCount > 0) {
      reasons.push(
        `Hệ thống đã bảo vệ gian hàng bằng cách loại bỏ ${sabotageCount} đánh giá chơi xấu/bom hàng khỏi điểm uy tín.`
      );
    }

    const finalRisk = Math.max(0, Math.min(100, risk));
    const trustScore = 100 - finalRisk;
    const riskLevel: MerchantRiskEvaluation['risk_level'] =
      finalRisk >= 70
        ? 'critical'
        : finalRisk >= 45
          ? 'high'
          : finalRisk >= 25
            ? 'moderate'
            : 'low';

    return {
      risk_score: finalRisk,
      trust_score: trustScore,
      risk_level: riskLevel,
      seeding_ratio: seedingRatio,
      coin_spam_ratio: coinSpamRatio,
      sabotage_ratio: sabotageRatio,
      price_anomaly_detected: priceAnomaly,
      reasons,
    };
  }

  /**
   * Persists review flags, updates review helpfulness weights, review_analysis,
   * master_products weighted rating, and merchant risk_score in Supabase `rate` schema
   */
  public async persistAnalysisToSupabase(
    supabase: SupabaseClient<any, 'rate'>,
    params: {
      productId: string;
      masterId?: string | null;
      merchantId?: string | null;
      reviews: ReviewInputItem[];
      entityName?: string;
      entityType?: 'product' | 'service';
      platform?: string;
      listingPrice?: number;
      canonicalMinPrice?: number;
      isOfficial?: boolean;
      followerCount?: number;
    }
  ): Promise<{
    summary: JReviewsProductSummary;
    merchantRisk?: MerchantRiskEvaluation;
  }> {
    const { results, summary } = await this.analyzeReviews(params.reviews, {
      entityName: params.entityName,
      entityType: params.entityType,
      platform: params.platform,
    });

    // 1. Upsert into rate.review_flags & update helpfulness_weight on rate.reviews
    if (results.length > 0) {
      const flagRows = results.map((r, i) => ({
        review_id: r.review_id,
        fake_probability: r.fake_probability,
        verdict: r.verdict,
        flag_category: r.flag_category,
        reason: r.reason,
        include_in_rating: r.include_in_rating,
        signals: r.signals,
        detector:
          r.detector ||
          (this.isConfigured() ? `hybrid:${this.provider}:${this.model}` : 'heuristic:v2-jreviews'),
        detector_version: '2.0.0',
        input_hash:
          '0x' +
          crypto
            .createHash('sha256')
            .update(`${r.review_id}|${params.reviews[i]?.comment || ''}`)
            .digest('hex'),
        analyzed_at: new Date().toISOString(),
      }));

      const { error: flagErr } = await supabase
        .from('review_flags')
        .upsert(flagRows, { onConflict: 'review_id' });

      if (flagErr) {
        throw new Error(`[AiReviewAnalyzer] Failed to upsert review_flags: ${flagErr.message}`);
      }

      for (const r of results) {
        const { error: revErr } = await supabase
          .from('reviews')
          .update({ helpfulness_weight: r.helpfulness_weight })
          .eq('id', r.review_id);
        if (revErr) {
          throw new Error(
            `[AiReviewAnalyzer] Failed to update review helpfulness_weight: ${revErr.message}`
          );
        }
      }
    }

    // 2. Upsert product-level summary into rate.review_analysis
    const { error: analysisErr } = await supabase.from('review_analysis').upsert(
      {
        product_id: params.productId,
        total_reviews_analyzed: summary.total_reviews_analyzed,
        authenticity_score: summary.authenticity_score,
        sentiment_positive_ratio: summary.sentiment_positive_ratio,
        pros: summary.pros,
        cons: summary.cons,
        ai_summary: summary.ai_summary,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );

    if (analysisErr) {
      throw new Error(
        `[AiReviewAnalyzer] Failed to upsert review_analysis: ${analysisErr.message}`
      );
    }

    // 3. Update master_products weighted rating & authentic count
    if (params.masterId) {
      let refreshedViaRpc = false;
      if (typeof (supabase as any).rpc === 'function') {
        const { error: rpcErr } = await (supabase as any).rpc('refresh_master_product_rating', {
          p_master_id: params.masterId,
        });
        if (!rpcErr) refreshedViaRpc = true;
      }
      if (!refreshedViaRpc) {
        const { error: masterErr } = await supabase
          .from('master_products')
          .update({
            user_rating_weighted: summary.user_rating_weighted,
            authentic_review_count: summary.authentic_review_count,
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.masterId);
        if (masterErr) {
          throw new Error(
            `[AiReviewAnalyzer] Failed to update master_products rating: ${masterErr.message}`
          );
        }
      }
    }

    // 4. Evaluate and update merchant review_risk_score (leaving risk_score for DOSafe threat_intel)
    let merchantRisk: MerchantRiskEvaluation | undefined;
    if (params.merchantId) {
      merchantRisk = this.evaluateMerchantRisk({
        merchantId: params.merchantId,
        platform: params.platform || 'shopee',
        isOfficial: Boolean(params.isOfficial),
        followerCount: params.followerCount,
        listingPrice: params.listingPrice,
        canonicalMinPrice: params.canonicalMinPrice,
        reviewResults: results,
        rawReviews: params.reviews,
      });

      const nowIso = new Date().toISOString();
      const breakdownPayload = {
        risk_level: merchantRisk.risk_level,
        trust_score: merchantRisk.trust_score,
        seeding_ratio: merchantRisk.seeding_ratio,
        coin_spam_ratio: merchantRisk.coin_spam_ratio,
        sabotage_ratio: merchantRisk.sabotage_ratio,
        price_anomaly_detected: merchantRisk.price_anomaly_detected,
        reasons: merchantRisk.reasons,
      };
      const { error: merchErr } = await supabase
        .from('merchants')
        .update({
          review_risk_score: merchantRisk.risk_score,
          review_risk_breakdown: breakdownPayload,
          review_risk_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', params.merchantId);
      if (merchErr) {
        if (/review_risk_score|schema cache/i.test(merchErr.message)) {
          const { error: fallbackErr } = await supabase
            .from('merchants')
            .update({
              metadata: {
                review_risk_score: merchantRisk.risk_score,
                review_risk_breakdown: breakdownPayload,
                review_risk_updated_at: nowIso,
              },
              updated_at: nowIso,
            })
            .eq('id', params.merchantId);
          if (fallbackErr) {
            throw new Error(
              `[AiReviewAnalyzer] Failed to update merchant metadata risk fallback: ${fallbackErr.message}`
            );
          }
        } else {
          throw new Error(
            `[AiReviewAnalyzer] Failed to update merchant review_risk_score: ${merchErr.message}`
          );
        }
      }
    }

    return { summary, merchantRisk };
  }

  /**
   * Upserts or removes an authenticated user's vote/report on a review in `rate.review_votes`.
   * Database triggers (`trg_review_votes_guard` & `trg_review_votes_after_change`) enforce
   * rate-limiting (max 60 votes/hour/user) and automatically recompute `rate.reviews`
   * counters + `helpfulness_weight` + `rate.master_products.user_rating_weighted`.
   */
  public async castReviewVote(
    supabase: SupabaseClient<any, 'rate'>,
    params: {
      reviewId: string;
      voterId: string;
      vote?: 'up' | 'down' | null;
      reported?: boolean;
      reportReason?: 'spam' | 'fake' | 'offensive' | 'off_topic' | 'other' | null;
    }
  ): Promise<{ action: 'upserted' | 'deleted' }> {
    const vote = params.vote ?? null;
    const reported = Boolean(params.reported);
    const reportReason = reported ? (params.reportReason ?? 'other') : null;

    if (!vote && !reported) {
      const { error } = await supabase
        .from('review_votes')
        .delete()
        .eq('review_id', params.reviewId)
        .eq('voter_id', params.voterId);
      if (error) {
        throw new Error(`[AiReviewAnalyzer] Failed to delete review_vote: ${error.message}`);
      }
      return { action: 'deleted' };
    }

    const { error } = await supabase.from('review_votes').upsert(
      {
        review_id: params.reviewId,
        voter_id: params.voterId,
        vote,
        reported,
        report_reason: reportReason,
      },
      { onConflict: 'review_id,voter_id' }
    );

    if (error) {
      throw new Error(`[AiReviewAnalyzer] Failed to upsert review_vote: ${error.message}`);
    }
    return { action: 'upserted' };
  }
}
