import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { MasterProduct } from '@repo/shared-data';

type RateSchemaClient = ReturnType<SupabaseClient['schema']>;
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
  const raw = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  _client = raw.schema('rate');
  return _client;
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

/**
 * Fetch list of master products with optional filtering
 */
export async function getMasterProducts(params?: {
  brand?: string;
  search?: string;
  limit?: number;
}): Promise<MasterProduct[]> {
  const supabase = getRateClient();
  let query = supabase
    .from('master_products')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (params?.brand) {
    query = query.ilike('brand', `%${params.brand}%`);
  }

  if (params?.search) {
    query = query.ilike('name', `%${params.search}%`);
  }

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`rate-api: failed to fetch master products: ${error.message}`);
  }
  return (data as MasterProduct[]) || [];
}

/**
 * Fetch a single master product by its slug
 */
export async function getMasterProductBySlug(slug: string): Promise<MasterProduct | null> {
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) {
    console.error(`Master product not found for slug: ${slug}`, error?.message);
    return null;
  }
  return data as MasterProduct;
}

interface RawTrustViewRow {
  id: string;
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

/**
 * Fetch all merchant listing offers for a master product.
 * Queries `rate.v_products_with_merchant_trust` (granted to anon/authenticated)
 * and falls back to explicit non-PII column selection on `rate.merchants`.
 */
export async function getMasterProductOffers(masterId: string): Promise<MerchantOffer[]> {
  const supabase = getRateClient();

  const { data: viewData, error: viewErr } = await supabase
    .from('v_products_with_merchant_trust')
    .select('*')
    .eq('cluster_id', masterId)
    .order('price_current', { ascending: true });

  if (!viewErr && viewData) {
    return (viewData as unknown as RawTrustViewRow[]).map((row) => {
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
    });
  }

  // Fallback with explicit column list matching column-level SELECT grants on rate.merchants
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
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
    `)
    .eq('cluster_id', masterId)
    .order('price_current', { ascending: true });

  if (error || !data) {
    console.error('Error fetching offers for masterId:', masterId, error?.message);
    return [];
  }

  return (data as unknown as RawOfferRow[]).map((item) => {
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
        rating_star: merchantObj?.rating_star ? Number(merchantObj.rating_star) : null,
        follower_count: merchantObj?.follower_count || 0,
        location: merchantObj?.location || null,
        risk_score: dosafeRisk,
        dosafe_risk_score: dosafeRisk,
        review_risk_score: 0,
        review_risk_breakdown: null,
      },
    };
  });
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
export async function getMasterProductReviews(masterId: string): Promise<ReviewItem[]> {
  const supabase = getRateClient();
  const { data: prods, error: prodsErr } = await supabase
    .from('products')
    .select('id')
    .eq('cluster_id', masterId);
  if (prodsErr) {
    throw new Error(`rate-api: failed to resolve listings for master ${masterId}: ${prodsErr.message}`);
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
    throw new Error(`rate-api: failed to fetch reviews for master ${masterId}: ${error.message}`);
  }
  if (!reviews) {
    return [];
  }

  return (reviews as unknown as RawReviewRow[]).map((r) => {
    const vf = Array.isArray(r.review_flags) ? r.review_flags[0] : r.review_flags;
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

    return {
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
      fake_probability: vf?.fake_probability != null ? Number(vf.fake_probability) : null,
      flag_category: flagCategory,
      reason: vf?.reason || null,
      signals: vf?.signals || null,
    };
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
  const totalFromReviews = reviewsFallback.length;
  const authenticFromReviews = reviewsFallback.filter((r) => r.include_in_rating).length;
  const fakeFromReviews = reviewsFallback.filter(
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
          Number(row.authenticity_score ?? fallbackAuthenticPct) * Math.max(1, count);
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
        denom > 0 ? Math.round((weightedAuthenticity / denom) * 10) / 10 : fallbackAuthenticPct;

      return {
        total_analyzed: totalAnalyzed || totalFromReviews,
        authentic_pct: totalFromReviews > 0 ? fallbackAuthenticPct : avgAuthScore,
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
 * Fetch comparison data for multiple master products
 */
export async function compareMasterProducts(slugs: string[]): Promise<MasterProduct[]> {
  if (!slugs || slugs.length === 0) return [];
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .in('slug', slugs)
    .eq('status', 'published');

  if (error || !data) {
    return [];
  }
  return data as MasterProduct[];
}
