import 'server-only';
import { cache } from 'react';
import {
  POINT_AI_WEIGHT_SHARE,
  POINT_WRITER_SHARE_CAP,
  aggregateProductPoints,
  comparablePoint,
  type PointCluster,
  type PointLine,
} from '@repo/shared-data/rules';
import { fetchAllRows, getRateClient } from '../../lib/rate-api';
import {
  eligiblePointReviewWeight,
  isPointLineBeforeCutoff,
  normalizePointCriterionKey,
  preferProductPointsMethod,
  type PointEligibleReviewCandidate,
  type StoredProductPointRow,
} from '../../lib/product-points-display';
import {
  RATE_CACHE_TAGS,
  masterReviewsCacheTag,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';

export interface MasterProductPointsData {
  rows: StoredProductPointRow[];
  /** Distinct eligible reviews in `rate.review_points` counted up to `updated_at`. */
  reviewCount: number;
}

const MASTER_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_PRODUCT_SLUG_REGEX = /^[a-z0-9._-]{1,120}$/;
const SAFE_CATEGORY_SLUG_REGEX = /^[a-z_-]{2,64}$/;
const DISALLOWED_SLUG_TOKEN_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

function sanitizeMasterUuid(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  return MASTER_UUID_REGEX.test(cleaned) &&
    !/^0+$/.test(cleaned.replace(/-/g, ''))
    ? cleaned
    : '';
}

function sanitizeSlugTag(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (
    !SAFE_PRODUCT_SLUG_REGEX.test(cleaned) ||
    !/[a-z0-9]/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    DISALLOWED_SLUG_TOKEN_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function sanitizeCategorySlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  return SAFE_CATEGORY_SLUG_REGEX.test(cleaned) &&
    !DISALLOWED_SLUG_TOKEN_REGEX.test(cleaned)
    ? cleaned
    : '';
}

const PRODUCT_POINTS_SELECT =
  'id, master_id, criterion_key, kind, label, support, reviewer_count, has_expert, first_seen, last_seen, method, updated_at';

const COUNTED_POINT_REVIEWS_SELECT =
  'id, reviewer_type, helpfulness_weight, created_at, platform_created_at, products!inner(cluster_id, origin), review_points!inner(id, kind, criterion_key, body, method, created_at), review_flags(include_in_rating, verdict)';

function latestPointUpdate(rows: readonly StoredProductPointRow[]): {
  ms: number;
  iso: string | null;
} {
  let latestMs = 0;
  let latestIso: string | null = null;
  for (const row of rows) {
    if (typeof row.updated_at !== 'string' || !row.updated_at.trim()) continue;
    const ms = Date.parse(row.updated_at);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = row.updated_at.trim();
    }
  }
  return { ms: latestMs, iso: latestIso };
}

function parseMs(raw: string | undefined): number {
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function annotateOwnWordsFromClusters(
  rows: readonly StoredProductPointRow[],
  clusters: readonly PointCluster[],
  lines: readonly PointLine[],
  categorySlug: string | null
): StoredProductPointRow[] {
  const visible = clusters.filter((c) => c.visible);
  if (visible.length === 0) return [...rows];

  const lineWordsById = new Map<string, Set<string>>();
  for (const line of lines) {
    lineWordsById.set(
      line.id,
      new Set(comparablePoint(line.body).split(' ').filter(Boolean))
    );
  }
  const clusterWords = new Map<string, Set<string>>();
  for (const cl of visible) {
    const words = new Set(comparablePoint(cl.label).split(' ').filter(Boolean));
    for (const id of cl.lineIds) {
      for (const w of lineWordsById.get(id) ?? []) words.add(w);
    }
    clusterWords.set(cl.key, words);
  }

  return rows.map((row) => {
    const reviewerCount = Math.max(
      0,
      Math.trunc(Number(row.reviewer_count) || 0)
    );
    const support = Number(row.support) || 0;
    const aiCeiling =
      POINT_AI_WEIGHT_SHARE * POINT_WRITER_SHARE_CAP * reviewerCount + 1e-6;
    if (row.has_expert || support > aiCeiling) {
      return { ...row, has_own_words: true };
    }
    const rowCriterion = normalizePointCriterionKey(
      row.criterion_key,
      categorySlug
    );
    const rowComp = comparablePoint(row.label);
    const rowWords = rowComp.split(' ').filter(Boolean);
    const rowFirstMs = parseMs(row.first_seen);
    const rowLastMs = parseMs(row.last_seen);
    const candidates = visible.filter(
      (c) => c.kind === row.kind && (c.criterionKey ?? null) === rowCriterion
    );
    const sharesGroundedWords = (cl: PointCluster): boolean => {
      const words = clusterWords.get(cl.key);
      if (!words || rowWords.length === 0) return false;
      const shared = rowWords.filter((w) => words.has(w)).length;
      return shared >= Math.min(2, rowWords.length);
    };
    const byLabel = candidates.find(
      (c) => comparablePoint(c.label) === rowComp
    );
    if (byLabel) {
      return {
        ...row,
        has_own_words: byLabel.reviewerCount > byLabel.aiReviewerCount,
      };
    }
    // Reworded single AI cluster: matches stats AND grounded content words.
    const exact = candidates.find(
      (c) =>
        c.reviewerCount === reviewerCount &&
        Math.abs(c.support - support) <= 0.02 &&
        (rowLastMs === 0 ||
          Math.abs(c.lastSeen.getTime() - rowLastMs) <= 1_000) &&
        sharesGroundedWords(c)
    );
    if (exact) {
      return {
        ...row,
        has_own_words: exact.reviewerCount > exact.aiReviewerCount,
      };
    }
    // Merged AI cluster: true only when an own-words cluster in the same bucket
    // lies within [first_seen, last_seen] AND shares grounded words with the label.
    const hasMergedOwn = candidates.some(
      (c) =>
        c.reviewerCount > c.aiReviewerCount &&
        (rowFirstMs === 0 || c.firstSeen.getTime() >= rowFirstMs - 1_000) &&
        (rowLastMs === 0 || c.lastSeen.getTime() <= rowLastMs + 1_000) &&
        sharesGroundedWords(c)
    );
    return { ...row, has_own_words: hasMergedOwn };
  });
}

/**
 * Reads `rate.product_points` (and, when non-empty, counts the distinct eligible
 * `rate.review_points` reviews and resolves writer-authored cluster priority up
 * to `updated_at`) for one master product via the public anon client
 * (DOS/Rate#1624). Prefers `method = 'ai'` rows when the master has any valid
 * `ai` rows; otherwise falls back to `method = 'code'` rows. Throws
 * `RateDataUnavailableError` on database failure so Next.js Data Cache never
 * caches an empty outage response.
 */
export async function getMasterProductPoints(
  masterProductId: string,
  categorySlug?: string | null
): Promise<MasterProductPointsData> {
  const cleanId = sanitizeMasterUuid(masterProductId);
  if (!cleanId) return { rows: [], reviewCount: 0 };
  const cleanCat = sanitizeCategorySlug(categorySlug) || null;
  const supabase = getRateClient();
  const rawRows = await fetchAllRows<StoredProductPointRow>(
    `product_points for master ${cleanId}`,
    (from, to) =>
      supabase
        .from('product_points')
        .select(PRODUCT_POINTS_SELECT, { count: 'exact' })
        .eq('master_id', cleanId)
        .in('method', ['ai', 'code'])
        .order('support', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
  );
  const rows = preferProductPointsMethod(rawRows);
  if (rows.length === 0) {
    return { rows: [], reviewCount: 0 };
  }

  const { ms: latestUpdatedMs, iso: latestUpdatedIso } =
    latestPointUpdate(rows);
  const reviewRows = await fetchAllRows<PointEligibleReviewCandidate>(
    `product_points reviews for master ${cleanId}`,
    (from, to) => {
      let query = supabase
        .from('reviews')
        .select(COUNTED_POINT_REVIEWS_SELECT, { count: 'exact' })
        .eq('products.cluster_id', cleanId)
        .eq('products.origin', 'crawl')
        .in('origin', ['crawl', 'community'])
        .in('review_points.method', ['writer', 'ai'])
        .in('review_points.kind', ['pro', 'con']);
      if (latestUpdatedIso) {
        query = query.lte('review_points.created_at', latestUpdatedIso);
      }
      return query.order('id', { ascending: true }).range(from, to);
    }
  );

  const countedIds = new Set<string>();
  const pointLines: PointLine[] = [];
  for (const rev of reviewRows) {
    const weight = eligiblePointReviewWeight(rev, latestUpdatedMs);
    if (weight <= 0) continue;
    countedIds.add(rev.id);
    if (!Array.isArray(rev.review_points)) continue;
    for (const [idx, pt] of rev.review_points.entries()) {
      if (!isPointLineBeforeCutoff(pt, latestUpdatedMs)) continue;
      if (typeof pt.body !== 'string' || !pt.body.trim()) continue;
      pointLines.push({
        id:
          typeof pt.id === 'string' && pt.id.trim()
            ? pt.id.trim()
            : `${rev.id}:${idx}`,
        reviewId: rev.id,
        writerId: rev.id,
        kind: pt.kind as 'pro' | 'con',
        criterionKey: pt.criterion_key ?? null,
        body: pt.body,
        weight,
        isExpert: rev.reviewer_type === 'expert',
        writtenAt: rev.platform_created_at ?? rev.created_at ?? '',
        method: pt.method === 'ai' ? 'ai' : 'writer',
      });
    }
  }

  if (pointLines.length === 0) {
    return { rows, reviewCount: countedIds.size };
  }

  const aggregated = aggregateProductPoints(
    cleanCat,
    pointLines,
    latestUpdatedMs > 0 ? new Date(latestUpdatedMs) : new Date()
  );
  return {
    rows: annotateOwnWordsFromClusters(
      rows,
      aggregated.clusters,
      pointLines,
      cleanCat
    ),
    reviewCount: aggregated.reviewCount,
  };
}

const _getCachedMasterProductPointsByKey = cache(
  (cleanId: string, cleanSlug: string, cleanCat: string) =>
    withRateDataCache(
      getMasterProductPoints,
      [
        'rate-master-product-points',
        cleanId,
        ...(cleanSlug ? [cleanSlug] : []),
        ...(cleanCat ? [cleanCat] : []),
      ],
      {
        revalidate: 300,
        tags: [
          RATE_CACHE_TAGS.REVIEWS,
          RATE_CACHE_TAGS.PRODUCTS,
          masterReviewsCacheTag(cleanId),
          ...(cleanSlug ? [productCacheTag(cleanSlug)] : []),
        ],
      }
    )(cleanId, cleanCat || null)
);

/**
 * Server-cached `rate.product_points` reader deduplicated per render pass with
 * `React.cache()` and across requests with `withRateDataCache` (`revalidate: 300`).
 */
export function getCachedMasterProductPoints(
  masterProductId: string,
  productSlug?: string | null,
  categorySlug?: string | null
): Promise<MasterProductPointsData> {
  const cleanId = sanitizeMasterUuid(masterProductId);
  if (!cleanId) return Promise.resolve({ rows: [], reviewCount: 0 });
  const cleanSlug = sanitizeSlugTag(productSlug);
  const cleanCat = sanitizeCategorySlug(categorySlug);
  return _getCachedMasterProductPointsByKey(cleanId, cleanSlug, cleanCat);
}
