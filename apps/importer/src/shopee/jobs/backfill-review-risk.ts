/**
 * Merchant review risk report (DOS/Rate#691)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-review-risk.ts
 *
 * Scores every seller that has analyzed reviews over all of its reviews with
 * the scoring ingestion logs (../merchant-review-risk.ts) and reports how it
 * differs from the stored score.
 *
 * Read-only: Rate Services' MerchantRiskAuditor is the single writer of
 * review_risk_score, review_risk_breakdown and the risk keys in
 * merchants.metadata (DOS/Rate#1341, DOS/Rate-Services#724). `--apply` is
 * refused.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { AiReviewAnalyzer } from '../ai-review-analyzer.js';
import { fetchByKey, resolveBackfillSupabaseTarget } from '../paging.js';
import {
  MERCHANT_RISK_SELECT,
  PRODUCT_RISK_SELECT,
  REVIEW_RISK_SELECT,
  scoreMerchants,
  toValidPrice,
  type MerchantRow,
  type MerchantScore,
  type ProductRow,
  type ReviewRow,
} from '../merchant-review-risk.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';

export {
  mapStoredReview,
  scoreMerchants,
  strongestPriceAnomaly,
  type MerchantRow,
  type MerchantScore,
  type ProductRow,
  type ReviewRow,
} from '../merchant-review-risk.js';

const logger = createImporterLogger('BackfillReviewRiskJob');

export const REVIEW_RISK_OWNER_MESSAGE =
  "Merchant review risk is written by Rate Services' MerchantRiskAuditor (DOS/Rate#1341); this job only reports.";

export function parseReviewRiskBackfillArgs(argv: readonly string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') {
      if (apply) throw new Error('--apply is repeated.');
      apply = true;
      continue;
    }
    throw new Error(`Unknown CLI argument: ${JSON.stringify(arg)}.`);
  }
  return { apply };
}

export async function loadAndScore(supabase: RateSupabaseClient): Promise<MerchantScore[]> {
  const merchants = await fetchByKey<MerchantRow>(
    supabase,
    'merchants',
    MERCHANT_RISK_SELECT,
    'id'
  );
  const products = await fetchByKey<ProductRow>(supabase, 'products', PRODUCT_RISK_SELECT, 'id');
  const reviews = await fetchByKey<ReviewRow>(supabase, 'reviews', REVIEW_RISK_SELECT, 'id');
  const masters = await fetchByKey<{ id: string; min_price: number | string | null }>(
    supabase,
    'master_products',
    'id, min_price',
    'id'
  );
  const masterMinByCluster = new Map<string, number>();
  for (const m of masters) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const clusterId = typeof m.id === 'string' && !/\p{Cc}/u.test(m.id) ? m.id.trim() : '';
    const price = toValidPrice(m.min_price);
    if (clusterId && clusterId.length <= 128 && price) {
      masterMinByCluster.set(clusterId, price);
    }
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
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  if (safeOptions.apply === true) {
    throw new Error(REVIEW_RISK_OWNER_MESSAGE);
  }
  const apply = false;
  const scores = await loadAndScore(supabase);
  const changed = scores.filter(s => s.previousScore !== s.risk.risk_score);
  for (const s of changed.slice(0, 25)) {
    logger.info(
      'backfill.change',
      `${s.merchantId}: ${s.previousScore ?? 'none'} -> ${s.risk.risk_score} (${s.risk.total_reviews} reviews${s.risk.price_anomaly_detected ? ', price anomaly' : ''})`,
      { merchantId: s.merchantId }
    );
  }
  const written = 0;
  logger.info(
    'backfill.summary',
    `Review risk report [read-only]: ${scores.length} sellers scored, ${changed.length} differ from the stored score.`,
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
    const { apply } = parseReviewRiskBackfillArgs(process.argv.slice(2));
    if (apply) {
      throw new Error(REVIEW_RISK_OWNER_MESSAGE);
    }
    const { createClient } = await import('@supabase/supabase-js');
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();
    if (!rawUrl.trim() || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
    }
    const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
    const supabase = scopeSupabaseToRate(
      createClient(url, key, { auth: { persistSession: false } })
    );
    // The host is not secret; it shows which project the report reads.
    logger.info('backfill.target', `Target: ${host} (read-only)`, { host });
    await runReviewRiskBackfill(supabase, { apply });
  })().catch((err: unknown) => {
    logger.error(
      'backfill.fatal',
      `Review risk report (read-only; Rate Services' MerchantRiskAuditor owns the stored risk) failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
