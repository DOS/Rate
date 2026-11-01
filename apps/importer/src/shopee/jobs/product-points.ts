/**
 * Product pros and cons writer (DOS/Rate#1546, design #1531 section 5, D9)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/product-points.ts [--apply] [--master <uuid>]
 *
 * Reads every review line (rate.review_points) with its review, flag, listing
 * and category, clusters the lines of each master with
 * aggregateProductPoints (@repo/shared-data/rules), and writes the points it
 * shows to rate.product_points (method 'code'). Dry-run by default: it prints
 * what it would write. `--apply` writes, as the rate_worker role
 * (SUPABASE_RATE_WORKER_KEY), which may read the review tables and write only
 * product_points.
 *
 * Per master, new rows are inserted before the old 'code' rows are deleted, so
 * a reader never sees a master with no points while the job runs. A master
 * whose lines no longer show anything has its 'code' rows removed. Rows of
 * another method ('ai', the rewording step of design 5.2) are left alone.
 *
 * Not here yet: review_points.cluster_id (rate_worker has no UPDATE on
 * review_points) and lines extracted by AI from marketplace reviews.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { aggregateProductPoints, type PointCluster, type PointLine } from '@repo/shared-data/rules';
import { fetchAllPages, resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';

const logger = createImporterLogger('ProductPointsJob');

/** IDs per `in` filter, so a request URL stays short. */
const IN_CHUNK = 150;

export interface ReviewPointRow {
  id: string;
  review_id: string;
  criterion_key: string | null;
  kind: string;
  body: string;
}

export interface PointReviewRow {
  id: string;
  product_id: string;
  reviewer_type: string | null;
  helpfulness_weight: number | string | null;
  created_at: string | null;
  platform_created_at: string | null;
  review_flags:
    | { include_in_rating: boolean | null; verdict: string | null }
    | { include_in_rating: boolean | null; verdict: string | null }[]
    | null;
}

export interface PointListingRow {
  id: string;
  cluster_id: string | null;
}

export interface PointMasterRow {
  id: string;
  category_id: string | null;
}

export interface CategoryRow {
  id: string;
  slug: string;
}

/** One rate.product_points row to insert. */
export interface ProductPointInsert {
  master_id: string;
  criterion_key: string | null;
  kind: 'pro' | 'con';
  label: string;
  support: number;
  reviewer_count: number;
  has_expert: boolean;
  first_seen: string;
  last_seen: string;
  method: 'code';
  updated_at: string;
}

const flagOf = (
  review: PointReviewRow
): { include_in_rating: boolean | null; verdict: string | null } | null =>
  Array.isArray(review.review_flags) ? (review.review_flags[0] ?? null) : review.review_flags;

/**
 * The weight a review's lines carry. A user review counts only once the
 * analyzer included it in the rating, with its stored weight (the gate of
 * design 5.1: weight 0 is not counted). An expert review Rate published counts
 * with weight 1 at least, unless the analyzer excluded it after looking at it.
 */
export function reviewPointWeight(review: PointReviewRow): number {
  const flag = flagOf(review);
  const stored = Number(review.helpfulness_weight ?? 0);
  const weight = Number.isFinite(stored) && stored > 0 ? stored : 0;
  if (review.reviewer_type === 'expert') {
    const excluded =
      flag !== null &&
      flag.include_in_rating === false &&
      (flag.verdict ?? 'unanalyzed') !== 'unanalyzed';
    return excluded ? 0 : Math.max(1, weight);
  }
  return flag?.include_in_rating === true ? weight : 0;
}

/**
 * The points to write per master. A Rate user writes one review per master,
 * so a review is a writer (as in the P2 rating). Masters with lines but
 * nothing to show map to an empty list, so their old rows are cleared.
 */
export function buildProductPoints(
  input: {
    points: readonly ReviewPointRow[];
    reviews: readonly PointReviewRow[];
    listings: readonly PointListingRow[];
    masters: readonly PointMasterRow[];
    categories: readonly CategoryRow[];
  },
  now: Date
): Map<string, ProductPointInsert[]> {
  const reviewById = new Map(input.reviews.map(r => [r.id, r]));
  const masterByListing = new Map(
    input.listings
      .filter(l => typeof l.cluster_id === 'string' && l.cluster_id)
      .map(l => [l.id, l.cluster_id as string])
  );
  const slugByCategory = new Map(input.categories.map(c => [c.id, c.slug]));
  const categoryByMaster = new Map(
    input.masters.map(m => [
      m.id,
      m.category_id ? (slugByCategory.get(m.category_id) ?? null) : null,
    ])
  );

  const linesByMaster = new Map<string, PointLine[]>();
  for (const point of input.points) {
    const review = reviewById.get(point.review_id);
    if (!review) continue;
    const masterId = masterByListing.get(review.product_id);
    if (!masterId || !categoryByMaster.has(masterId)) continue;
    if (point.kind !== 'pro' && point.kind !== 'con') continue;
    const lines = linesByMaster.get(masterId) ?? [];
    lines.push({
      id: point.id,
      reviewId: review.id,
      writerId: review.id,
      kind: point.kind,
      criterionKey: point.criterion_key,
      body: point.body,
      weight: reviewPointWeight(review),
      isExpert: review.reviewer_type === 'expert',
      writtenAt: review.platform_created_at ?? review.created_at ?? '',
    });
    linesByMaster.set(masterId, lines);
  }

  const out = new Map<string, ProductPointInsert[]>();
  const stamp = now.toISOString();
  for (const [masterId, lines] of linesByMaster) {
    const result = aggregateProductPoints(categoryByMaster.get(masterId), lines, now);
    // What a page shows: the top points of each criterion and the summary.
    const shown = new Map<string, PointCluster>();
    for (const sides of [...Object.values(result.byCriterion), result.summary])
      for (const cluster of [...sides.pros, ...sides.cons]) shown.set(cluster.key, cluster);
    out.set(
      masterId,
      [...shown.values()].map(c => ({
        master_id: masterId,
        criterion_key: c.criterionKey,
        kind: c.kind,
        label: c.label,
        support: c.support,
        reviewer_count: c.reviewerCount,
        has_expert: c.hasExpert,
        first_seen: c.firstSeen.toISOString(),
        last_seen: c.lastSeen.toISOString(),
        method: 'code' as const,
        updated_at: stamp,
      }))
    );
  }
  return out;
}

function chunks<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectIn<T>(
  supabase: RateSupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: readonly string[]
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const { data, error } = await supabase.from(table).select(columns).in(column, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runProductPointsJob(
  supabase: RateSupabaseClient,
  options: { apply?: boolean; masterId?: string | null; now?: Date } = {}
): Promise<{
  apply: boolean;
  masters: number;
  points: number;
  inserted: number;
  deleted: number;
}> {
  const apply = options.apply === true;
  const now = options.now ?? new Date();
  const only = options.masterId ?? null;
  if (only !== null && !UUID.test(only)) throw new Error('--master must be a UUID.');

  const points = await fetchAllPages<ReviewPointRow>('review_points', (from, to) =>
    supabase
      .from('review_points')
      .select('id, review_id, criterion_key, kind, body')
      .order('id')
      .range(from, to)
  );
  const reviews = await selectIn<PointReviewRow>(
    supabase,
    'reviews',
    'id, product_id, reviewer_type, helpfulness_weight, created_at, platform_created_at, review_flags(include_in_rating, verdict)',
    'id',
    points.map(p => p.review_id)
  );
  const listings = await selectIn<PointListingRow>(
    supabase,
    'products',
    'id, cluster_id',
    'id',
    reviews.map(r => r.product_id)
  );
  // Masters that have 'code' rows now: they are rewritten or cleared too.
  const existing = await fetchAllPages<{ id: string; master_id: string }>(
    'product_points',
    (from, to) =>
      supabase
        .from('product_points')
        .select('id, master_id')
        .eq('method', 'code')
        .order('id')
        .range(from, to)
  );
  const masterIds = [
    ...new Set([
      ...listings.map(l => l.cluster_id).filter((id): id is string => !!id),
      ...existing.map(row => row.master_id),
    ]),
  ].filter(id => only === null || id === only);
  const masters = await selectIn<PointMasterRow>(
    supabase,
    'master_products',
    'id, category_id',
    'id',
    masterIds
  );
  const categories = await fetchAllPages<CategoryRow>('categories', (from, to) =>
    supabase.from('categories').select('id, slug').order('id').range(from, to)
  );

  const built = buildProductPoints({ points, reviews, listings, masters, categories }, now);
  for (const id of masterIds) if (!built.has(id)) built.set(id, []);
  const oldIdsByMaster = new Map<string, string[]>();
  for (const row of existing) {
    const ids = oldIdsByMaster.get(row.master_id) ?? [];
    ids.push(row.id);
    oldIdsByMaster.set(row.master_id, ids);
  }

  let inserted = 0;
  let deleted = 0;
  let total = 0;
  for (const id of masterIds) {
    const rows = built.get(id) ?? [];
    const oldIds = oldIdsByMaster.get(id) ?? [];
    total += rows.length;
    logger.info(
      'product_points.master',
      `${apply ? 'Writing' : 'Would write'} ${rows.length} points for ${id} (replacing ${oldIds.length}).`,
      { master_id: id, points: rows.length, replaced: oldIds.length }
    );
    if (!apply) continue;
    if (rows.length > 0) {
      const { error } = await supabase.from('product_points').insert(rows);
      if (error) throw new Error(`product_points insert for ${id}: ${error.message}`);
      inserted += rows.length;
    }
    for (const part of chunks(oldIds)) {
      const { error } = await supabase.from('product_points').delete().in('id', part);
      if (error) throw new Error(`product_points delete for ${id}: ${error.message}`);
      deleted += part.length;
    }
  }
  logger.info(
    'product_points.done',
    `${apply ? 'Wrote' : 'Dry run:'} ${total} points for ${masterIds.length} masters from ${points.length} review lines.`,
    { apply, masters: masterIds.length, points: total, inserted, deleted }
  );
  return { apply, masters: masterIds.length, points: total, inserted, deleted };
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
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // The rate_worker key: it can read the review tables and write only
    // product_points, so a mistake here cannot touch anything else.
    const key = (process.env.SUPABASE_RATE_WORKER_KEY || '').trim();
    if (!rawUrl.trim() || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_RATE_WORKER_KEY in environment.');
    }
    const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
    const supabase = scopeSupabaseToRate(
      createClient(url, key, { auth: { persistSession: false } })
    );
    const apply = process.argv.includes('--apply');
    const at = process.argv.indexOf('--master');
    const masterId = at >= 0 ? (process.argv[at + 1] ?? '') : null;
    // The host is not secret; it shows which project the job reads.
    logger.info('product_points.target', `Target: ${host} (${apply ? 'apply' : 'dry run'})`, {
      host,
    });
    await runProductPointsJob(supabase, { apply, masterId });
  })().catch((err: unknown) => {
    logger.error(
      'product_points.fatal',
      `Product points job failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
