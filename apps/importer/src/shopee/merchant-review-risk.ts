/**
 * Seller-wide review risk (DOS/Rate#691, DOS/Rate#698)
 *
 * Scores a seller with `evaluateMerchantRisk` over all of its analyzed reviews,
 * so every page reads the same persisted number. Reviews are mapped exactly as
 * the web does (`getMerchantsList` in apps/web/src/lib/rate-api.ts); the
 * price-anomaly term uses the same cluster peer floor as ingestion.
 *
 * Used by the backfill job (every seller) and by ingestion (the ingested
 * product's seller), so both write the same score.
 */
import { MAX_VALID_VND_PRICE } from '@repo/shared-data';
import {
  merchantRiskBreakdown,
  type AiReviewAnalyzer,
  type AnalyzedReviewResult,
  type MerchantRiskEvaluation,
  type ReviewInputItem,
} from './ai-review-analyzer.js';
import { resolveClusterPeerFloorPrice } from './cluster-peer-floor.js';
import { fetchAllPages } from './paging.js';
import type { RateSupabaseClient } from './types.js';

export const MERCHANT_RISK_SELECT = 'id, platform, is_official, follower_count, review_risk_score';
export const PRODUCT_RISK_SELECT = 'id, merchant_id, cluster_id, price_current';
export const REVIEW_RISK_SELECT =
  'id, product_id, rating_star, comment, review_flags(verdict, flag_category, include_in_rating)';

export interface MerchantRow {
  id: string;
  platform: string;
  is_official: boolean | null;
  follower_count: number | string | null;
  review_risk_score?: number | null;
}

export interface ProductRow {
  id: string;
  merchant_id: string | null;
  cluster_id: string | null;
  price_current: number | string | null;
}

export interface ReviewRow {
  id: string;
  product_id: string;
  rating_star: number | string | null;
  comment: string | null;
  review_flags:
    | { verdict?: string | null; flag_category?: string | null; include_in_rating?: boolean | null }
    | Array<{
        verdict?: string | null;
        flag_category?: string | null;
        include_in_rating?: boolean | null;
      }>
    | null;
}

/**
 * One stored review as the web reads it, or null while it is unanalyzed.
 * Mirrors the mapping in apps/web/src/lib/rate-api.ts (`getMerchantsList`)
 * and the verdict-before-category rule of `computeDynamicReviewRisk`.
 */
export function mapStoredReview(
  row: ReviewRow
): { result: AnalyzedReviewResult; raw: ReviewInputItem } | null {
  const vf = Array.isArray(row.review_flags) ? row.review_flags[0] : row.review_flags;
  const verdict = vf?.verdict ?? null;
  if (verdict === 'unanalyzed') return null;
  let category =
    vf?.flag_category ||
    (verdict === 'fake'
      ? 'seeding_fake'
      : verdict === 'suspicious'
        ? 'low_value_coin_spam'
        : 'authentic');
  // The web counts a 'fake' verdict as seeding unless the category says
  // sabotage or bombing (DOS/Rate#645).
  if (verdict === 'fake' && category !== 'competitor_sabotage' && category !== 'review_bombing') {
    category = 'seeding_fake';
  }
  const includeInRating = Boolean(
    vf?.include_in_rating ?? (category === 'authentic' && verdict !== 'fake')
  );
  return {
    result: {
      review_id: row.id,
      verdict: (verdict ?? 'authentic') as AnalyzedReviewResult['verdict'],
      flag_category: category as AnalyzedReviewResult['flag_category'],
      fake_probability: 0,
      include_in_rating: includeInRating,
      helpfulness_weight: includeInRating ? 1 : 0,
      reason: '',
      signals: {} as AnalyzedReviewResult['signals'],
    },
    raw: {
      id: row.id,
      rating_star: Number(row.rating_star || 5),
      comment: row.comment || '',
    },
  };
}

/** A usable VND price, or 0. */
export const toValidPrice = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_VALID_VND_PRICE ? n : 0;
};

/**
 * The seller's most anomalous listing against its cluster peer floor (the
 * same floor ingestion uses), or none. Official sellers never get the term.
 */
export function strongestPriceAnomaly(
  merchant: MerchantRow,
  listings: readonly ProductRow[],
  productsByCluster: ReadonlyMap<string, readonly ProductRow[]>,
  officialByMerchant: ReadonlyMap<string, boolean>,
  masterMinByCluster: ReadonlyMap<string, number>
): { listingPrice: number; canonicalMinPrice: number } | null {
  if (merchant.is_official) return null;
  let best: { listingPrice: number; canonicalMinPrice: number; ratio: number } | null = null;
  for (const listing of listings) {
    const price = toValidPrice(listing.price_current);
    if (!price || !listing.cluster_id) continue;
    const peers = (productsByCluster.get(listing.cluster_id) ?? []).map(p => ({
      id: p.id,
      price_current: p.price_current,
      merchants: { is_official: officialByMerchant.get(p.merchant_id ?? '') ?? false },
    }));
    const floor = resolveClusterPeerFloorPrice(
      peers,
      listing.id,
      masterMinByCluster.get(listing.cluster_id)
    );
    if (!floor || floor <= 2_000_000 || floor > MAX_VALID_VND_PRICE) continue;
    const ratio = price / floor;
    if (ratio < 0.58 && (!best || ratio < best.ratio)) {
      best = { listingPrice: price, canonicalMinPrice: floor, ratio };
    }
  }
  return best
    ? { listingPrice: best.listingPrice, canonicalMinPrice: best.canonicalMinPrice }
    : null;
}

export interface MerchantScore {
  merchantId: string;
  previousScore: number | null;
  risk: MerchantRiskEvaluation;
}

/** Scores every seller that has at least one analyzed review. */
export function scoreMerchants(
  analyzer: AiReviewAnalyzer,
  merchants: readonly MerchantRow[],
  products: readonly ProductRow[],
  reviews: readonly ReviewRow[],
  masterMinByCluster: ReadonlyMap<string, number>
): MerchantScore[] {
  const merchantById = new Map(merchants.map(m => [m.id, m]));
  const officialByMerchant = new Map(merchants.map(m => [m.id, Boolean(m.is_official)]));
  const productById = new Map(products.map(p => [p.id, p]));
  const productsByCluster = new Map<string, ProductRow[]>();
  const listingsByMerchant = new Map<string, ProductRow[]>();
  for (const p of products) {
    if (p.cluster_id) {
      const list = productsByCluster.get(p.cluster_id) ?? [];
      list.push(p);
      productsByCluster.set(p.cluster_id, list);
    }
    if (p.merchant_id) {
      const list = listingsByMerchant.get(p.merchant_id) ?? [];
      list.push(p);
      listingsByMerchant.set(p.merchant_id, list);
    }
  }
  const reviewsByMerchant = new Map<
    string,
    { results: AnalyzedReviewResult[]; raws: ReviewInputItem[] }
  >();
  for (const row of reviews) {
    const merchantId = productById.get(row.product_id)?.merchant_id;
    if (!merchantId || !merchantById.has(merchantId)) continue;
    const mapped = mapStoredReview(row);
    if (!mapped) continue;
    const bucket = reviewsByMerchant.get(merchantId) ?? { results: [], raws: [] };
    bucket.results.push(mapped.result);
    bucket.raws.push(mapped.raw);
    reviewsByMerchant.set(merchantId, bucket);
  }

  const scores: MerchantScore[] = [];
  for (const [merchantId, bucket] of reviewsByMerchant) {
    const merchant = merchantById.get(merchantId)!;
    const anomaly = strongestPriceAnomaly(
      merchant,
      listingsByMerchant.get(merchantId) ?? [],
      productsByCluster,
      officialByMerchant,
      masterMinByCluster
    );
    const risk = analyzer.evaluateMerchantRisk({
      merchantId,
      platform: merchant.platform,
      isOfficial: Boolean(merchant.is_official),
      followerCount: Number(merchant.follower_count) || 0,
      listingPrice: anomaly?.listingPrice,
      canonicalMinPrice: anomaly?.canonicalMinPrice,
      reviewResults: bucket.results,
      rawReviews: bucket.raws,
    });
    scores.push({
      merchantId,
      previousScore: merchant.review_risk_score ?? null,
      risk,
    });
  }
  return scores.sort((a, b) => a.merchantId.localeCompare(b.merchantId));
}

/** Writes only the review risk columns (and updated_at) on rate.merchants. */
export async function writeMerchantReviewRisk(
  supabase: RateSupabaseClient,
  merchantId: string,
  risk: MerchantRiskEvaluation,
  nowIso = new Date().toISOString()
): Promise<void> {
  const { error } = await supabase
    .from('merchants')
    .update({
      review_risk_score: risk.risk_score,
      review_risk_breakdown: merchantRiskBreakdown(risk),
      review_risk_updated_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', merchantId);
  if (error) {
    throw new Error(`Failed to write review risk for ${merchantId}: ${error.message}`);
  }
}

const ID_CHUNK = 100;

/** Pages through `table` rows whose `column` is one of `ids`, in id chunks. */
async function fetchAllByIds<T>(
  supabase: RateSupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: readonly string[]
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    rows.push(
      ...(await fetchAllPages<T>(
        table,
        (from, to) =>
          // A runtime select string gives no row type; T is the caller's shape.
          supabase
            .from(table)
            .select(select)
            .in(column, chunk)
            .order('id')
            .range(from, to) as unknown as PromiseLike<{
            data: T[] | null;
            error: { message: string } | null;
          }>
      ))
    );
  }
  return rows;
}

const uniqueIds = (values: ReadonlyArray<string | null | undefined>): string[] =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

/**
 * Scores one seller from the same inputs the backfill reads for it: its
 * listings, every listing in those clusters (with the peers' official flag),
 * the reviews of its listings and the clusters' master min prices. The result
 * equals the seller's entry in a full-table `scoreMerchants` run.
 */
export async function loadAndScoreMerchant(
  supabase: RateSupabaseClient,
  analyzer: AiReviewAnalyzer,
  merchantId: string
): Promise<MerchantScore | null> {
  const { data: merchant, error: merchantErr } = await supabase
    .from('merchants')
    .select(MERCHANT_RISK_SELECT)
    .eq('id', merchantId)
    .maybeSingle();
  if (merchantErr) throw new Error(`merchants: ${merchantErr.message}`);
  if (!merchant) return null;

  const listings = await fetchAllByIds<ProductRow>(
    supabase,
    'products',
    PRODUCT_RISK_SELECT,
    'merchant_id',
    [merchantId]
  );
  const clusterIds = uniqueIds(listings.map(p => p.cluster_id));
  // The peers' official flag comes embedded, so no per-merchant read.
  type PeerRow = ProductRow & {
    merchants?: { is_official?: boolean | null } | Array<{ is_official?: boolean | null }> | null;
  };
  const peers = await fetchAllByIds<PeerRow>(
    supabase,
    'products',
    `${PRODUCT_RISK_SELECT}, merchants(is_official)`,
    'cluster_id',
    clusterIds
  );
  const productById = new Map<string, ProductRow>();
  const peerMerchants = new Map<string, MerchantRow>();
  const rows: PeerRow[] = [...listings, ...peers];
  for (const { merchants: embedded, ...product } of rows) {
    productById.set(product.id, product);
    if (!product.merchant_id || product.merchant_id === merchantId) continue;
    const official = Array.isArray(embedded) ? embedded[0]?.is_official : embedded?.is_official;
    peerMerchants.set(product.merchant_id, {
      id: product.merchant_id,
      platform: '',
      is_official: Boolean(official),
      follower_count: 0,
    });
  }
  const reviews = await fetchAllByIds<ReviewRow>(
    supabase,
    'reviews',
    REVIEW_RISK_SELECT,
    'product_id',
    uniqueIds(listings.map(p => p.id))
  );
  const masters = await fetchAllByIds<{ id: string; min_price: number | string | null }>(
    supabase,
    'master_products',
    'id, min_price',
    'id',
    clusterIds
  );
  const masterMinByCluster = new Map<string, number>();
  for (const m of masters) {
    const price = toValidPrice(m.min_price);
    if (price) masterMinByCluster.set(m.id, price);
  }

  const scores = scoreMerchants(
    analyzer,
    [merchant as MerchantRow, ...peerMerchants.values()],
    [...productById.values()],
    reviews,
    masterMinByCluster
  );
  return scores.find(s => s.merchantId === merchantId) ?? null;
}

/**
 * Rescores one seller over all of its reviews and stores the result. Returns
 * null (and writes nothing) when the seller has no analyzed reviews.
 */
export async function rescoreMerchantReviewRisk(
  supabase: RateSupabaseClient,
  analyzer: AiReviewAnalyzer,
  merchantId: string
): Promise<MerchantScore | null> {
  const score = await loadAndScoreMerchant(supabase, analyzer, merchantId);
  if (score) await writeMerchantReviewRisk(supabase, merchantId, score.risk);
  return score;
}
