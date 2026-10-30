/**
 * Seller-wide review risk (DOS/Rate#691, DOS/Rate#698)
 *
 * Scores a seller with `evaluateMerchantRisk` over all of its analyzed reviews. Reviews are mapped exactly as
 * the web does (`getMerchantsList` in apps/web/src/lib/rate-api.ts); the
 * price-anomaly term uses the same cluster peer floor as ingestion.
 *
 * Used by the backfill report (every seller) and by ingestion's log (the
 * ingested product's seller). Neither writes it: Rate Services'
 * MerchantRiskAuditor owns the stored review risk (DOS/Rate#1341).
 */
import { MAX_VALID_VND_PRICE } from '@repo/shared-data';
import {
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
export const MAX_MERCHANT_FOLLOWER_COUNT = 100_000_000;

const VALID_STORED_VERDICTS = new Set<AnalyzedReviewResult['verdict']>([
  'authentic',
  'suspicious',
  'fake',
]);
const VALID_STORED_FLAG_CATEGORIES = new Set<AnalyzedReviewResult['flag_category']>([
  'authentic',
  'low_value_coin_spam',
  'seeding_fake',
  'competitor_sabotage',
  'review_bombing',
]);

export interface MerchantRow {
  id: string;
  platform: string;
  is_official: boolean | null;
  follower_count: number | string | null;
  review_risk_score?: number | string | null;
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

const DISALLOWED_MERCHANT_RISK_ID_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

function parseFiniteRiskNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.NaN;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    return Number(cleaned);
  }
  return Number.NaN;
}

/**
 * One stored review as the web reads it, or null while it is unanalyzed.
 * Mirrors the mapping in apps/web/src/lib/rate-api.ts (`getMerchantsList`)
 * and the verdict-before-category rule of `computeDynamicReviewRisk`.
 */
export function mapStoredReview(
  row: ReviewRow
): { result: AnalyzedReviewResult; raw: ReviewInputItem } | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const reviewId = normalizeSafeId(row.id);
  if (!reviewId) return null;
  const vf = Array.isArray(row.review_flags)
    ? row.review_flags.find((f): f is NonNullable<(typeof row.review_flags)[number]> =>
        Boolean(f && typeof f === 'object' && !Array.isArray(f))
      )
    : row.review_flags && typeof row.review_flags === 'object'
      ? row.review_flags
      : null;
  const rawVerdict = typeof vf?.verdict === 'string' ? vf.verdict.trim().toLowerCase() : null;
  if (rawVerdict === 'unanalyzed') return null;
  const verdict: AnalyzedReviewResult['verdict'] =
    rawVerdict && VALID_STORED_VERDICTS.has(rawVerdict as AnalyzedReviewResult['verdict'])
      ? (rawVerdict as AnalyzedReviewResult['verdict'])
      : 'authentic';
  const rawCategory =
    typeof vf?.flag_category === 'string' ? vf.flag_category.trim().toLowerCase() : '';
  let category: AnalyzedReviewResult['flag_category'] = VALID_STORED_FLAG_CATEGORIES.has(
    rawCategory as AnalyzedReviewResult['flag_category']
  )
    ? (rawCategory as AnalyzedReviewResult['flag_category'])
    : verdict === 'fake'
      ? 'seeding_fake'
      : verdict === 'suspicious'
        ? 'low_value_coin_spam'
        : 'authentic';
  // The web counts a 'fake' verdict as seeding unless the category says
  // sabotage or bombing (DOS/Rate#645).
  if (verdict === 'fake' && category !== 'competitor_sabotage' && category !== 'review_bombing') {
    category = 'seeding_fake';
  }
  const includeInRating =
    typeof vf?.include_in_rating === 'boolean'
      ? vf.include_in_rating
      : category === 'authentic' && verdict !== 'fake';
  const parsedStar = parseFiniteRiskNumber(row.rating_star);
  const ratingStar =
    Number.isFinite(parsedStar) && parsedStar >= 1 && parsedStar <= 5 ? Math.round(parsedStar) : 5;
  return {
    result: {
      review_id: reviewId,
      verdict,
      flag_category: category,
      fake_probability: 0,
      include_in_rating: includeInRating,
      helpfulness_weight: includeInRating ? 1 : 0,
      reason: '',
      signals: {} as AnalyzedReviewResult['signals'],
    },
    raw: {
      id: reviewId,
      rating_star: ratingStar,
      comment:
        typeof row.comment === 'string'
          ? row.comment.slice(0, 4000).replace(/(?:(?![\t\r\n])\p{Cc})+/gu, ' ')
          : '',
    },
  };
}

/** A usable VND price, or 0. */
export const toValidPrice = (raw: unknown): number => {
  const parsed = parseFiniteRiskNumber(raw);
  if (!Number.isFinite(parsed)) return 0;
  const n = Math.round(parsed);
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
  if (
    !merchant ||
    typeof merchant !== 'object' ||
    Array.isArray(merchant) ||
    merchant.is_official === true
  ) {
    return null;
  }
  if (!Array.isArray(listings) || listings.length === 0) return null;
  let best: { listingPrice: number; canonicalMinPrice: number; ratio: number } | null = null;
  for (const listing of listings) {
    if (!listing || typeof listing !== 'object' || Array.isArray(listing)) continue;
    const price = toValidPrice(listing.price_current);
    const clusterId = normalizeSafeId(listing.cluster_id);
    if (!price || !clusterId) continue;
    const clusterPeers =
      productsByCluster && typeof productsByCluster.get === 'function'
        ? (productsByCluster.get(clusterId) ?? [])
        : [];
    const peers = clusterPeers
      .filter((p): p is ProductRow => Boolean(p && typeof p === 'object' && !Array.isArray(p)))
      .map(p => ({
        id: p.id,
        cluster_id: p.cluster_id,
        price_current: p.price_current,
        merchants: {
          is_official:
            officialByMerchant && typeof officialByMerchant.get === 'function'
              ? (officialByMerchant.get(p.merchant_id ?? '') ?? false)
              : false,
        },
      }));
    const fallbackMasterMin =
      masterMinByCluster && typeof masterMinByCluster.get === 'function'
        ? masterMinByCluster.get(clusterId)
        : undefined;
    const floor = resolveClusterPeerFloorPrice(peers, listing.id, fallbackMasterMin, clusterId);
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
  const safeMerchants: MerchantRow[] = [];
  if (Array.isArray(merchants)) {
    for (const m of merchants) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const safeId = normalizeSafeId(m.id);
      if (!safeId) continue;
      safeMerchants.push({ ...m, id: safeId });
    }
  }
  const safeProducts: ProductRow[] = [];
  if (Array.isArray(products)) {
    for (const p of products) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const safeId = normalizeSafeId(p.id);
      if (!safeId) continue;
      safeProducts.push({
        ...p,
        id: safeId,
        merchant_id: normalizeSafeId(p.merchant_id),
        cluster_id: normalizeSafeId(p.cluster_id),
      });
    }
  }
  const safeReviews = Array.isArray(reviews)
    ? reviews.filter((rv): rv is ReviewRow =>
        Boolean(rv && typeof rv === 'object' && !Array.isArray(rv))
      )
    : [];
  const merchantById = new Map(safeMerchants.map(m => [m.id, m]));
  const officialByMerchant = new Map(safeMerchants.map(m => [m.id, m.is_official === true]));
  const productById = new Map(safeProducts.map(p => [p.id, p]));
  const productsByCluster = new Map<string, ProductRow[]>();
  const listingsByMerchant = new Map<string, ProductRow[]>();
  for (const p of safeProducts) {
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
  for (const row of safeReviews) {
    const safeProductId = normalizeSafeId(row.product_id);
    if (!safeProductId) continue;
    const merchantId = productById.get(safeProductId)?.merchant_id;
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
    const rawFollowers = parseFiniteRiskNumber(merchant.follower_count);
    const safeFollowerCount =
      Number.isFinite(rawFollowers) &&
      rawFollowers >= 0 &&
      rawFollowers <= MAX_MERCHANT_FOLLOWER_COUNT
        ? Math.floor(rawFollowers)
        : 0;
    const rawPlatform =
      typeof merchant.platform === 'string'
        ? merchant.platform
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 40)
        : '';
    const safePlatform =
      rawPlatform &&
      !/^0+$/.test(rawPlatform) &&
      !/^[-_.]+$/.test(rawPlatform) &&
      !DISALLOWED_MERCHANT_RISK_ID_REGEX.test(rawPlatform)
        ? rawPlatform
        : '';
    const risk = analyzer.evaluateMerchantRisk({
      merchantId,
      platform: safePlatform,
      isOfficial: merchant.is_official === true,
      followerCount: safeFollowerCount,
      listingPrice: anomaly?.listingPrice,
      canonicalMinPrice: anomaly?.canonicalMinPrice,
      reviewResults: bucket.results,
      rawReviews: bucket.raws,
    });
    const rawPrev = parseFiniteRiskNumber(merchant.review_risk_score);
    const previousScore =
      Number.isFinite(rawPrev) && rawPrev >= 0 && rawPrev <= 100 ? rawPrev : null;
    scores.push({
      merchantId,
      previousScore,
      risk,
    });
  }
  return scores.sort((a, b) => a.merchantId.localeCompare(b.merchantId));
}

export function normalizeSafeId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > 128 ||
    /[\s\p{Cc}]/u.test(trimmed) ||
    /^0+$/.test(trimmed) ||
    /^[-_.]+$/.test(trimmed) ||
    DISALLOWED_MERCHANT_RISK_ID_REGEX.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
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

export const uniqueIds = (values: ReadonlyArray<string | null | undefined>): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const v of values) {
    const safe = normalizeSafeId(v);
    if (safe) seen.add(safe);
  }
  return [...seen].sort();
};

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
  const safeMerchantId = normalizeSafeId(merchantId);
  if (!safeMerchantId) return null;
  const { data: merchant, error: merchantErr } = await supabase
    .from('merchants')
    .select(MERCHANT_RISK_SELECT)
    .eq('id', safeMerchantId)
    .maybeSingle();
  if (merchantErr) throw new Error(`merchants: ${merchantErr.message}`);
  if (!merchant) return null;

  const listings = await fetchAllByIds<ProductRow>(
    supabase,
    'products',
    PRODUCT_RISK_SELECT,
    'merchant_id',
    [safeMerchantId]
  );
  const clusterIds = uniqueIds(
    listings
      .filter(p => Boolean(p && typeof p === 'object' && !Array.isArray(p)))
      .map(p => p.cluster_id)
  );
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
  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) continue;
    const { merchants: embedded, ...product } = rawRow;
    const safeProductId = normalizeSafeId(product.id);
    if (!safeProductId) continue;
    productById.set(safeProductId, { ...product, id: safeProductId });
    const safePeerMerchantId = normalizeSafeId(product.merchant_id);
    if (!safePeerMerchantId || safePeerMerchantId === safeMerchantId) continue;
    const official = Array.isArray(embedded)
      ? embedded.find(e => Boolean(e && typeof e === 'object' && !Array.isArray(e)))?.is_official
      : embedded && typeof embedded === 'object'
        ? embedded.is_official
        : undefined;
    peerMerchants.set(safePeerMerchantId, {
      id: safePeerMerchantId,
      platform: '',
      is_official: official === true,
      follower_count: 0,
    });
  }
  const reviews = await fetchAllByIds<ReviewRow>(
    supabase,
    'reviews',
    REVIEW_RISK_SELECT,
    'product_id',
    uniqueIds(
      listings.filter(p => Boolean(p && typeof p === 'object' && !Array.isArray(p))).map(p => p.id)
    )
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
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const masterId = normalizeSafeId(m.id);
    const price = toValidPrice(m.min_price);
    if (masterId && price) masterMinByCluster.set(masterId, price);
  }

  const scores = scoreMerchants(
    analyzer,
    [merchant as MerchantRow, ...peerMerchants.values()],
    [...productById.values()],
    reviews,
    masterMinByCluster
  );
  return scores.find(s => s.merchantId === safeMerchantId) ?? null;
}

/**
 * Scores one seller over all of its reviews, for the ingest log. Returns null
 * when the seller has no analyzed reviews. Writes nothing: Rate Services'
 * MerchantRiskAuditor is the single writer of review_risk_score,
 * review_risk_breakdown and the risk keys in merchants.metadata, and runs at
 * the end of the Shopee job (DOS/Rate#1341, DOS/Rate-Services#724).
 */
export async function scoreSellerReviewRisk(
  supabase: RateSupabaseClient,
  analyzer: AiReviewAnalyzer,
  merchantId: string
): Promise<MerchantScore | null> {
  const safeMerchantId = normalizeSafeId(merchantId);
  if (!safeMerchantId) return null;
  return loadAndScoreMerchant(supabase, analyzer, safeMerchantId);
}
