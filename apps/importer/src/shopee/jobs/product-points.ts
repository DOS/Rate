/**
 * Product pros and cons writer (DOS/Rate#1546, design #1531 section 5, D9)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/product-points.ts [--apply] [--master <uuid>] [--hide-ai]
 *
 * Reads every review line (rate.review_points) with its review, flag, listing
 * and category, clusters the lines of each master with
 * aggregateProductPoints (@repo/shared-data/rules), and writes the points it
 * shows to rate.product_points (method 'code'). Dry-run by default: it prints
 * what it would write. `--apply` writes, as the rate_worker role: the job
 * signs in as the worker's Supabase Auth user (RATE_WORKER_EMAIL and
 * RATE_WORKER_PASSWORD, with the project's publishable key), whose access
 * token carries that role. It may read the review tables and write only
 * product_points.
 *
 * Which lines count, as the P2 rating counts reviews: lines the writer wrote
 * (method 'writer') and lines AI extracted from marketplace reviews (method
 * 'ai', at half weight: POINT_AI_WEIGHT_SHARE, DOS/Rate#1531), on crawled
 * listings (origin 'crawl'), of crawled or community reviews; seed,
 * synthetic, fixture and backfill rows never show. `--hide-ai`, or
 * PRODUCT_POINTS_HIDE_AI=true, leaves every 'ai' line out: the next run
 * writes the points without them, and nothing is deleted from review_points.
 * A review is one writer: a Rate user writes one review per master. Two
 * reviews of one person on one master (after the matcher moves a listing) or
 * several marketplace reviews of one buyer count as several writers; the
 * analyzer's weights and D9's weight sum limit what that can show.
 *
 * Run it from one place at a time (the importer's schedule). Two runs at once
 * can leave both runs' rows until the next run, which replaces them.
 *
 * Per master, new rows are inserted before the old 'code' rows are deleted, so
 * a reader never sees a master with no points while the job runs. A master
 * whose lines no longer show anything has its 'code' rows removed.
 * product_points rows of another method (product_points.method 'ai', the
 * rewording step of design 5.2, not the review_points 'ai' lines above) are
 * left alone.
 *
 * Not here yet: review_points.cluster_id (rate_worker has no UPDATE on
 * review_points).
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { aggregateProductPoints, type PointCluster, type PointLine } from '@repo/shared-data/rules';
import {
  fetchByKey,
  parseStrictMasterUuid,
  resolveBackfillSupabaseTarget,
  type KeysetFilter,
} from '../paging.js';
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
  /** 'writer', or 'ai' for a line extracted from a marketplace review. */
  method?: string | null;
}

const SWITCH_ON = new Set(['true', '1', 'yes', 'on']);
const SWITCH_OFF = new Set(['false', '0', 'no', 'off']);

function parseBooleanSwitch(raw: string, from: string): boolean {
  const value = raw.trim().toLowerCase();
  if (SWITCH_ON.has(value)) return true;
  if (SWITCH_OFF.has(value)) return false;
  throw new Error(`${from} must be true or false, not ${JSON.stringify(raw)}.`);
}

/**
 * Whether `--hide-ai` (or `--hide-ai=<value>`) or PRODUCT_POINTS_HIDE_AI asks
 * to leave AI lines out. A value it does not know throws, so a typo never
 * shows lines someone meant to hide.
 */
export function hideAiLinesFrom(
  argv: readonly string[],
  env: Record<string, string | undefined>
): boolean {
  const rawEnv = (env.PRODUCT_POINTS_HIDE_AI ?? '').trim();
  let hide = rawEnv === '' ? false : parseBooleanSwitch(rawEnv, 'PRODUCT_POINTS_HIDE_AI');
  for (const arg of argv) {
    if (arg === '--hide-ai') hide = true;
    else if (arg.startsWith('--hide-ai=')) {
      hide = parseBooleanSwitch(arg.slice('--hide-ai='.length), '--hide-ai');
    }
  }
  return hide;
}

export interface ProductPointsCliArgs {
  readonly apply: boolean;
  readonly masterId: string | null;
  readonly hideAiLines: boolean;
}

/**
 * Strictly parses CLI arguments (`process.argv.slice(2)`) for `product-points.ts`.
 * Supports both `--master <uuid>` and `--master=<uuid>`, and fails closed on
 * missing/empty/malformed `--master` values, repeated flags, or unknown flags.
 */
export function parseProductPointsArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env
): ProductPointsCliArgs {
  let apply = false;
  let masterId: string | null = null;
  let hideAiSeen = false;
  let hideAiLines = hideAiLinesFrom([], env);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      if (apply) throw new Error('--apply is repeated.');
      apply = true;
      continue;
    }
    if (arg === '--master') {
      if (masterId !== null) throw new Error('--master is repeated.');
      const next = argv[i + 1];
      if (next === undefined || next === '' || next.startsWith('-')) {
        throw new Error('--master requires a valid UUID.');
      }
      masterId = parseStrictMasterUuid(next, '--master');
      i += 1;
      continue;
    }
    if (arg.startsWith('--master=')) {
      if (masterId !== null) throw new Error('--master is repeated.');
      const raw = arg.slice('--master='.length);
      if (!raw) throw new Error('--master requires a valid UUID.');
      masterId = parseStrictMasterUuid(raw, '--master');
      continue;
    }
    if (arg === '--hide-ai' || arg.startsWith('--hide-ai=')) {
      if (hideAiSeen) throw new Error('--hide-ai is repeated.');
      hideAiSeen = true;
      hideAiLines =
        arg === '--hide-ai'
          ? true
          : parseBooleanSwitch(arg.slice('--hide-ai='.length), '--hide-ai');
      continue;
    }
    throw new Error(`Unknown CLI argument: ${JSON.stringify(arg)}.`);
  }

  return { apply, masterId, hideAiLines };
}

export interface PointReviewRow {
  id: string;
  product_id: string;
  origin: string | null;
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
  origin: string | null;
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

/** Reviews whose lines may count: crawled or community, never seed or test data. */
const COUNTED_REVIEW_ORIGINS = new Set(['crawl', 'community']);

/**
 * The weight a review's lines carry. A user review counts as the P2 rating
 * counts it: it has a flag that does not exclude it (a NULL include counts),
 * with its stored weight; weight 0 is the gate of design 5.1. An expert review
 * Rate published counts with weight 1 at least, unless the analyzer excluded
 * it after looking at it (D9: one expert shows a point).
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
  return flag !== null && flag.include_in_rating !== false ? weight : 0;
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
  now: Date,
  options: { hideAiLines?: boolean } = {}
): Map<string, ProductPointInsert[]> {
  const hideAiLines = options.hideAiLines === true;
  const reviewById = new Map(input.reviews.map(r => [r.id, r]));
  const masterByListing = new Map(
    input.listings
      .filter(l => typeof l.cluster_id === 'string' && l.cluster_id && l.origin === 'crawl')
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
    if (!review || !COUNTED_REVIEW_ORIGINS.has(review.origin ?? '')) continue;
    const masterId = masterByListing.get(review.product_id);
    if (!masterId || !categoryByMaster.has(masterId)) continue;
    if (point.kind !== 'pro' && point.kind !== 'con') continue;
    // Only the writer's lines and AI's; any other method is not a review line.
    const method = point.method ?? 'writer';
    if (method !== 'writer' && method !== 'ai') continue;
    if (hideAiLines && method === 'ai') continue;
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
      method,
    });
    linesByMaster.set(masterId, lines);
  }

  const out = new Map<string, ProductPointInsert[]>();
  const stamp = now.toISOString();
  for (const [masterId, lines] of linesByMaster) {
    const result = aggregateProductPoints(categoryByMaster.get(masterId), lines, now, {
      hideAiLines,
    });
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
  ids: readonly string[],
  key = 'id',
  extraFilter: KeysetFilter = query => query
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunks([...new Set(ids)])) {
    rows.push(
      ...(await fetchByKey<T>(supabase, table, columns, key, query =>
        extraFilter(query.in(column, part))
      ))
    );
  }
  return rows;
}

export async function runProductPointsJob(
  supabase: RateSupabaseClient,
  options: { apply?: boolean; masterId?: string | null; now?: Date; hideAiLines?: boolean } = {}
): Promise<{
  apply: boolean;
  masters: number;
  points: number;
  inserted: number;
  deleted: number;
}> {
  const apply = options.apply === true;
  const now = options.now ?? new Date();
  const only =
    options.masterId === undefined || options.masterId === null
      ? null
      : parseStrictMasterUuid(options.masterId, '--master');
  const allowedMethods = options.hideAiLines === true ? ['writer'] : ['writer', 'ai'];
  const reviewColumns =
    'id, product_id, origin, reviewer_type, helpfulness_weight, created_at, platform_created_at, review_flags(include_in_rating, verdict)';
  const pointColumns = 'id, review_id, criterion_key, kind, body, method';

  let points: ReviewPointRow[];
  let reviews: PointReviewRow[];
  let listings: PointListingRow[];
  let existing: { id: string; master_id: string }[];
  let activeListings: PointListingRow[];

  if (only !== null) {
    listings = await fetchByKey<PointListingRow>(
      supabase,
      'products',
      'id, cluster_id, origin',
      'id',
      query => query.eq('cluster_id', only)
    );
    const crawledListingIds = listings
      .filter(l => l.origin === 'crawl' && typeof l.cluster_id === 'string' && l.cluster_id)
      .map(l => l.id);
    reviews = await selectIn<PointReviewRow>(
      supabase,
      'reviews',
      reviewColumns,
      'product_id',
      crawledListingIds
    );
    const countedReviewIds = reviews
      .filter(r => COUNTED_REVIEW_ORIGINS.has(r.origin ?? ''))
      .map(r => r.id);
    points = await selectIn<ReviewPointRow>(
      supabase,
      'review_points',
      pointColumns,
      'review_id',
      countedReviewIds,
      'id',
      query => query.in('method', allowedMethods)
    );
    existing = await fetchByKey<{ id: string; master_id: string }>(
      supabase,
      'product_points',
      'id, master_id',
      'id',
      query => query.eq('method', 'code').eq('master_id', only)
    );
    const pointReviewIds = new Set(points.map(p => p.review_id));
    const activeProductIds = new Set(
      reviews.filter(r => pointReviewIds.has(r.id)).map(r => r.product_id)
    );
    activeListings = listings.filter(l => activeProductIds.has(l.id));
  } else {
    points = await fetchByKey<ReviewPointRow>(
      supabase,
      'review_points',
      pointColumns,
      'id',
      query => query.in('method', allowedMethods)
    );
    reviews = await selectIn<PointReviewRow>(
      supabase,
      'reviews',
      reviewColumns,
      'id',
      points.map(p => p.review_id)
    );
    listings = await selectIn<PointListingRow>(
      supabase,
      'products',
      'id, cluster_id, origin',
      'id',
      reviews.map(r => r.product_id)
    );
    // Masters that have 'code' rows now: they are rewritten or cleared too.
    existing = await fetchByKey<{ id: string; master_id: string }>(
      supabase,
      'product_points',
      'id, master_id',
      'id',
      query => query.eq('method', 'code')
    );
    activeListings = listings;
  }

  const masterIds = [
    ...new Set([
      ...activeListings.map(l => l.cluster_id).filter((id): id is string => !!id),
      ...existing.map(row => row.master_id),
    ]),
  ]
    .filter(id => only === null || id === only)
    .sort();
  const masters = await selectIn<PointMasterRow>(
    supabase,
    'master_products',
    'id, category_id',
    'id',
    masterIds
  );
  const categories =
    masterIds.length === 0
      ? []
      : await fetchByKey<CategoryRow>(supabase, 'categories', 'id, slug', 'id');

  const built = buildProductPoints({ points, reviews, listings, masters, categories }, now, {
    hideAiLines: options.hideAiLines === true,
  });
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
    const { apply, masterId, hideAiLines } = parseProductPointsArgs(
      process.argv.slice(2),
      process.env
    );
    const { createClient } = await import('@supabase/supabase-js');
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // The publishable key plus the worker user's sign-in: its access token
    // carries the rate_worker role, which can read the review tables and write
    // only product_points, so a mistake here cannot touch anything else.
    const key = (
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    const email = (process.env.RATE_WORKER_EMAIL || '').trim();
    const password = process.env.RATE_WORKER_PASSWORD || '';
    if (!rawUrl.trim() || !key || !email || !password) {
      throw new Error(
        'Missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, RATE_WORKER_EMAIL or RATE_WORKER_PASSWORD in environment.'
      );
    }
    const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !auth.session) {
      throw new Error(
        `Sign-in as the rate_worker user failed: ${authError?.message ?? 'no session'}`
      );
    }
    try {
      const role = (auth.user?.role ?? '').trim();
      if (role !== 'rate_worker') {
        throw new Error(`The signed-in user has role '${role}', not rate_worker; refusing to run.`);
      }
      const supabase = scopeSupabaseToRate(client);
      // The host is not secret; it shows which project the job reads.
      logger.info(
        'product_points.target',
        `Target: ${host} (${apply ? 'apply' : 'dry run'}${hideAiLines ? ', AI lines hidden' : ''})`,
        { host, hideAiLines }
      );
      await runProductPointsJob(supabase, { apply, masterId, hideAiLines });
    } finally {
      await client.auth.signOut().catch(() => undefined);
    }
  })().catch((err: unknown) => {
    logger.error(
      'product_points.fatal',
      `Product points job failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
