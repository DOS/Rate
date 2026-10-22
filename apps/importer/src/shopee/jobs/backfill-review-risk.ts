/**
 * Merchant review risk backfill (DOS/Rate#691)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-review-risk.ts          (Dry-run, zero DB writes)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-review-risk.ts --apply  (Write rate.merchants)
 *
 * Scores every seller that has analyzed reviews with `evaluateMerchantRisk`
 * over all of its reviews, so every page reads the same persisted number.
 * Reviews are mapped exactly as the web does (`getMerchantsList` in
 * apps/web/src/lib/rate-api.ts); the price-anomaly term uses the same cluster
 * peer floor as ingestion.
 *
 * Safety invariant:
 * - Dry-run by default: never writes unless `--apply` is passed.
 * - Writes only review_risk_score, review_risk_breakdown, review_risk_updated_at
 *   and updated_at on rate.merchants. No DDL, no other table.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { MAX_VALID_VND_PRICE } from '@repo/shared-data';
import {
  AiReviewAnalyzer,
  merchantRiskBreakdown,
  type AnalyzedReviewResult,
  type MerchantRiskEvaluation,
  type ReviewInputItem,
} from '../ai-review-analyzer.js';
import { fetchAllPages } from '../paging.js';
import { resolveClusterPeerFloorPrice } from '../shopee-to-supabase.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';

const logger = createImporterLogger('BackfillReviewRiskJob');

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

const toPrice = (raw: unknown): number => {
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
    const price = toPrice(listing.price_current);
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

export async function loadAndScore(supabase: RateSupabaseClient): Promise<MerchantScore[]> {
  const merchants = await fetchAllPages<MerchantRow>('merchants', (from, to) =>
    supabase
      .from('merchants')
      .select('id, platform, is_official, follower_count, review_risk_score')
      .order('id')
      .range(from, to)
  );
  const products = await fetchAllPages<ProductRow>('products', (from, to) =>
    supabase
      .from('products')
      .select('id, merchant_id, cluster_id, price_current')
      .order('id')
      .range(from, to)
  );
  const reviews = await fetchAllPages<ReviewRow>('reviews', (from, to) =>
    supabase
      .from('reviews')
      .select(
        'id, product_id, rating_star, comment, review_flags(verdict, flag_category, include_in_rating)'
      )
      .order('id')
      .range(from, to)
  );
  const masters = await fetchAllPages<{ id: string; min_price: number | string | null }>(
    'master_products',
    (from, to) =>
      supabase.from('master_products').select('id, min_price').order('id').range(from, to)
  );
  const masterMinByCluster = new Map<string, number>();
  for (const m of masters) {
    const price = toPrice(m.min_price);
    if (price) masterMinByCluster.set(m.id, price);
  }
  logger.info(
    'backfill.loaded',
    `Loaded ${merchants.length} merchants, ${products.length} listings, ${reviews.length} reviews.`,
    { merchants: merchants.length, products: products.length, reviews: reviews.length }
  );
  return scoreMerchants(new AiReviewAnalyzer(), merchants, products, reviews, masterMinByCluster);
}

export async function runReviewRiskBackfill(
  supabase: RateSupabaseClient,
  options: { apply?: boolean } = {}
): Promise<{ apply: boolean; scored: number; changed: number; written: number }> {
  const apply = Boolean(options.apply);
  const scores = await loadAndScore(supabase);
  const changed = scores.filter(s => s.previousScore !== s.risk.risk_score);
  for (const s of changed.slice(0, 25)) {
    logger.info(
      'backfill.change',
      `${s.merchantId}: ${s.previousScore ?? 'none'} -> ${s.risk.risk_score} (${s.risk.total_reviews} reviews${s.risk.price_anomaly_detected ? ', price anomaly' : ''})`,
      { merchantId: s.merchantId }
    );
  }
  let written = 0;
  if (apply) {
    const nowIso = new Date().toISOString();
    for (const s of scores) {
      const { error } = await supabase
        .from('merchants')
        .update({
          review_risk_score: s.risk.risk_score,
          review_risk_breakdown: merchantRiskBreakdown(s.risk),
          review_risk_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', s.merchantId);
      if (error) {
        throw new Error(`Failed to write review risk for ${s.merchantId}: ${error.message}`);
      }
      written += 1;
    }
  }
  logger.info(
    'backfill.summary',
    `Review risk backfill [mode=${apply ? 'APPLY' : 'DRY-RUN'}]: ${scores.length} sellers scored, ${changed.length} change, ${written} written.`,
    { apply, scored: scores.length, changed: changed.length, written }
  );
  return { apply, scored: scores.length, changed: changed.length, written };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    }
    const supabase = scopeSupabaseToRate(
      createClient(url, key, { auth: { persistSession: false } })
    );
    await runReviewRiskBackfill(supabase, { apply: process.argv.includes('--apply') });
  })().catch((err: unknown) => {
    logger.error(
      'backfill.fatal',
      `Review risk backfill failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
