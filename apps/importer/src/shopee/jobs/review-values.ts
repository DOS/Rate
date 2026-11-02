/**
 * Review value score writer (DOS/Rate#1547, design #1531 section 6, D6 and D7)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/review-values.ts [--apply] [--master <uuid>]
 *
 * Reads every crawled and community review with its flag, its lines
 * (rate.review_points), its listing and category, computes reviewValue
 * (@repo/shared-data/rules) with the review's depth on its whole text
 * (reviewDepth), and stores the values that changed through
 * rate.store_review_values. Dry-run by default: it prints what it would
 * store. `--apply` writes, as the rate_worker role: the job signs in as the
 * worker's Supabase Auth user (RATE_WORKER_EMAIL and RATE_WORKER_PASSWORD,
 * with the project's publishable key), whose access token carries that role.
 * It may read the review tables and write values only through the writer,
 * which accepts only a breakdown the shared module could produce.
 *
 * The inputs, as rate.reviews holds them today:
 *   - gated: the review does not count, as the product points job counts it
 *     (no flag, excluded, weight 0; an expert review Rate published unless the
 *     analyzer excluded it), or its depth is filler (6.1);
 *   - a photo: the review has an image; votes: upvotes and downvotes, as the
 *     review sort counts them; verified: the marketplace's purchase mark;
 *   - the writer's trust (axis D) is not stored yet, so it counts as unknown.
 *
 * Batches hold at most BATCH_ROWS rows and BATCH_BYTES bytes (the writer takes
 * 1000 rows and 2 MB). The writer locks a batch's reviews in id order; another
 * writer of rate.reviews may not, so a batch a deadlock aborts (40P01) is
 * retried. Run it from one place at a time (the importer's schedule).
 *
 * After a run it checks every rated master as V5 of the verify file does
 * (scripts/ops/rate-review-value-score-verify.sql in DOS-Me): the stored
 * rating, weight sum and criteria scores against what P2's rating with the
 * P6 weight gives. rate_worker cannot call rate.master_rating_extras, so the
 * job computes it from the rows it read; a master that differs is read again
 * on its own before it is reported, since a crawl may have moved it during
 * the run. A master still stale was held by another transaction when its
 * refresh ran (P2 skips a locked master); service_role refreshes it with
 * rate.refresh_master_rating_extras. The CLI exits with code 2 when any is
 * left. Masters are scoped by cluster_id: Items (M1+M2) are not in
 * production; this check needs their scope once they are.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import {
  reviewDepth,
  reviewRatingWeight,
  reviewValue,
  type ReviewValue,
  type ReviewValuePoint,
} from '@repo/shared-data/rules';
import { fetchAllPages, resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';
import { reviewPointWeight, type CategoryRow, type PointMasterRow } from './product-points.js';

const logger = createImporterLogger('ReviewValuesJob');

/** IDs per `in` filter, so a request URL stays short. */
const IN_CHUNK = 150;
/** Rows per writer call; the writer takes 1000. */
export const BATCH_ROWS = 500;
/** Bytes per writer call; the writer takes 2 MB. */
export const BATCH_BYTES = 1_500_000;
/** Attempts per batch when a deadlock (40P01) aborts it. */
export const DEADLOCK_ATTEMPTS = 4;
/** Stale master ids a log line lists; the result has all of them. */
const STALE_LOGGED = 50;

type FlagRow = {
  include_in_rating: boolean | null;
  verdict: string | null;
  flag_category: string | null;
};

export interface ValueReviewRow {
  id: string;
  product_id: string;
  origin: string | null;
  reviewer_type: string | null;
  helpfulness_weight: number | string | null;
  rating_star: number | null;
  rating_exact: number | string | null;
  comment: string | null;
  verdict: string | null;
  criteria_ratings: unknown;
  images: string[] | null;
  is_verified_buyer: boolean | null;
  upvotes: number | null;
  downvotes: number | null;
  value_tier: string | null;
  review_flags: FlagRow | FlagRow[] | null;
}

export interface ValuePointRow {
  review_id: string;
  kind: string;
  criterion_key: string | null;
  body: string;
  method: string;
}

export interface ValueListingRow {
  id: string;
  cluster_id: string | null;
  origin: string | null;
}

export interface StoredValueRow {
  review_id: string;
  value_score: number | string;
  value_breakdown: unknown;
}

export interface MasterRatingRow {
  id: string;
  rating_score: number | string | null;
  rating_weight_sum: number | string | null;
  criteria_scores: unknown;
}

/** One row of rate.store_review_values. */
export interface ReviewValueWrite {
  id: string;
  score: number;
  breakdown: ReviewValue;
}

const REVIEW_COLUMNS =
  'id, product_id, origin, reviewer_type, helpfulness_weight, rating_star, rating_exact, ' +
  'comment, verdict, criteria_ratings, images, is_verified_buyer, upvotes, downvotes, ' +
  'value_tier, review_flags(include_in_rating, verdict, flag_category)';

/** Reviews the job scores: crawled or community, never seed or test data. */
const SCORED_REVIEW_ORIGINS = ['crawl', 'community'];

const flagOf = (review: ValueReviewRow): FlagRow | null =>
  Array.isArray(review.review_flags) ? (review.review_flags[0] ?? null) : review.review_flags;

const count = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The shared module's input for one review. */
export function reviewValueInput(
  review: ValueReviewRow,
  lines: readonly ValuePointRow[],
  categorySlug: string | null
): Parameters<typeof reviewValue>[0] {
  const flag = flagOf(review);
  const points: ReviewValuePoint[] = lines
    .filter(l => l.kind === 'pro' || l.kind === 'con')
    .map(l => ({
      kind: l.kind as 'pro' | 'con',
      criterionKey: l.criterion_key,
      body: l.body,
      method: l.method === 'ai' ? 'ai' : 'writer',
    }));
  const depth = reviewDepth({
    comment: review.comment,
    verdict: review.verdict,
    points,
    reviewerType: review.reviewer_type,
    flagCategory: flag?.flag_category ?? null,
  });
  const weight = reviewPointWeight({
    id: review.id,
    product_id: review.product_id,
    origin: review.origin,
    reviewer_type: review.reviewer_type,
    helpfulness_weight: review.helpfulness_weight,
    created_at: null,
    platform_created_at: null,
    review_flags: flag,
  });
  return {
    categorySlug,
    gated: weight === 0 || depth === 'filler',
    depth,
    criteriaRatings: review.criteria_ratings,
    verdict: review.verdict,
    points,
    hasRealPhoto: Array.isArray(review.images) && review.images.length > 0,
    verifiedPurchase: review.is_verified_buyer === true,
    helpfulVotes: count(review.upvotes),
    unhelpfulVotes: count(review.downvotes),
    authorTrust: null,
  };
}

/** The category slug of each listing's master, or null. */
function categoryByListing(input: {
  listings: readonly ValueListingRow[];
  masters: readonly PointMasterRow[];
  categories: readonly CategoryRow[];
}): Map<string, string | null> {
  const slugByCategory = new Map(input.categories.map(c => [c.id, c.slug]));
  const slugByMaster = new Map(
    input.masters.map(m => [
      m.id,
      m.category_id ? (slugByCategory.get(m.category_id) ?? null) : null,
    ])
  );
  return new Map(
    input.listings.map(l => [l.id, l.cluster_id ? (slugByMaster.get(l.cluster_id) ?? null) : null])
  );
}

/** The value of every review, by review id. */
export function buildReviewValues(input: {
  reviews: readonly ValueReviewRow[];
  points: readonly ValuePointRow[];
  listings: readonly ValueListingRow[];
  masters: readonly PointMasterRow[];
  categories: readonly CategoryRow[];
}): Map<string, ReviewValue> {
  const linesByReview = new Map<string, ValuePointRow[]>();
  for (const line of input.points) {
    const lines = linesByReview.get(line.review_id) ?? [];
    lines.push(line);
    linesByReview.set(line.review_id, lines);
  }
  const slugOf = categoryByListing(input);
  const out = new Map<string, ReviewValue>();
  for (const review of input.reviews) {
    if (!SCORED_REVIEW_ORIGINS.includes(review.origin ?? '')) continue;
    out.set(
      review.id,
      reviewValue(
        reviewValueInput(
          review,
          linesByReview.get(review.id) ?? [],
          slugOf.get(review.product_id) ?? null
        )
      )
    );
  }
  return out;
}

/** JSON with sorted keys, so a stored jsonb and a computed object compare. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The rows to store: reviews whose stored number, breakdown or public tier
 * differs from the computed value, in review id order.
 */
export function changedValues(
  values: ReadonlyMap<string, ReviewValue>,
  stored: readonly StoredValueRow[],
  tierById: ReadonlyMap<string, string | null>
): ReviewValueWrite[] {
  const storedById = new Map(stored.map(row => [row.review_id, row]));
  const out: ReviewValueWrite[] = [];
  for (const [id, value] of values) {
    const row = storedById.get(id);
    const same =
      row !== undefined &&
      Number(row.value_score) === value.score &&
      canonical(row.value_breakdown) === canonical(value) &&
      (tierById.get(id) ?? null) === value.tier;
    if (!same) out.push({ id, score: value.score, breakdown: value });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Writer calls of at most BATCH_ROWS rows and BATCH_BYTES bytes each. */
export function batchValues(rows: readonly ReviewValueWrite[]): ReviewValueWrite[][] {
  const out: ReviewValueWrite[][] = [];
  let batch: ReviewValueWrite[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
    if (batch.length > 0 && (batch.length >= BATCH_ROWS || bytes + size > BATCH_BYTES)) {
      out.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length > 0) out.push(batch);
  return out;
}

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/** What rate.master_rating_extras gives for a master, from the rows read. */
export interface MasterRatingExpected {
  rating_score: number | null;
  rating_weight_sum: number;
  criteria_scores: Record<string, { score: number; weight_sum: number; writers: number }>;
}

const CRITERION_KEY = /^[a-z_]{2,32}$/;

/**
 * P2's rating with P6's weight, per master (cluster_id scope): user reviews
 * of crawled listings, crawl or community, with a flag that does not exclude
 * them and a weight above 0, each weighing LEAST(3, weight x factor).
 */
export function expectedMasterRatings(input: {
  reviews: readonly ValueReviewRow[];
  listings: readonly ValueListingRow[];
  values: ReadonlyMap<string, { weightCompleteness: unknown }>;
}): Map<string, MasterRatingExpected> {
  const masterByListing = new Map(
    input.listings
      .filter(l => l.origin === 'crawl' && typeof l.cluster_id === 'string' && l.cluster_id)
      .map(l => [l.id, l.cluster_id as string])
  );
  type Eligible = { w: number; star: number; criteria: unknown };
  const byMaster = new Map<string, Eligible[]>();
  for (const review of input.reviews) {
    const masterId = masterByListing.get(review.product_id);
    if (!masterId) continue;
    const flag = flagOf(review);
    const weight = Number(review.helpfulness_weight ?? 0);
    if (
      !SCORED_REVIEW_ORIGINS.includes(review.origin ?? '') ||
      review.reviewer_type !== 'user' ||
      flag === null ||
      flag.include_in_rating === false ||
      !(weight > 0)
    ) {
      continue;
    }
    const exact = review.rating_exact == null ? null : Number(review.rating_exact);
    const list = byMaster.get(masterId) ?? [];
    list.push({
      w: reviewRatingWeight(weight, input.values.get(review.id)?.weightCompleteness),
      star: exact ?? Number(review.rating_star),
      criteria: review.criteria_ratings,
    });
    byMaster.set(masterId, list);
  }
  const out = new Map<string, MasterRatingExpected>();
  for (const [masterId, eligible] of byMaster) {
    const rated = eligible.filter(e => e.star >= 1 && e.star <= 5);
    const sumW = rated.reduce((s, e) => s + e.w, 0);
    const sumWS = rated.reduce((s, e) => s + e.w * e.star, 0);
    const perKey = new Map<string, { writers: number; w: number; shown: number; ws: number }>();
    for (const e of eligible) {
      if (!e.criteria || typeof e.criteria !== 'object' || Array.isArray(e.criteria)) continue;
      for (const [key, value] of Object.entries(e.criteria as Record<string, unknown>)) {
        if (!CRITERION_KEY.test(key) || typeof value !== 'number' || value < 1 || value > 5) {
          continue;
        }
        const acc = perKey.get(key) ?? { writers: 0, w: 0, shown: 0, ws: 0 };
        acc.writers += 1;
        acc.w += e.w;
        acc.shown += Math.min(1, e.w);
        acc.ws += e.w * value;
        perKey.set(key, acc);
      }
    }
    const criteria: MasterRatingExpected['criteria_scores'] = {};
    for (const [key, acc] of perKey) {
      if (acc.writers < 3 || acc.shown < 1.5) continue;
      criteria[key] = {
        score: round((3 * 4.2 + acc.ws) / (3 + acc.w), 3),
        weight_sum: round(acc.w, 2),
        writers: acc.writers,
      };
    }
    out.set(masterId, {
      rating_score: sumW > 0 ? round((3 * 4.2 + sumWS) / (3 + sumW), 3) : null,
      rating_weight_sum: round(sumW, 2),
      criteria_scores: criteria,
    });
  }
  return out;
}

/** Floating point and numeric rounding may differ by one unit of the last place. */
const close = (a: unknown, b: number | null, unit: number): boolean => {
  if (a === null || a === undefined || b === null) return (a ?? null) === b;
  return Math.abs(Number(a) - b) <= unit * 1.1;
};

/** Whether a stored master equals what the rating gives (V5 of the verify file). */
export function masterRatingMatches(
  row: MasterRatingRow,
  expected: MasterRatingExpected | undefined
): boolean {
  const want: MasterRatingExpected = expected ?? {
    rating_score: null,
    rating_weight_sum: 0,
    criteria_scores: {},
  };
  if (!close(row.rating_score, want.rating_score, 0.001)) return false;
  if (!close(row.rating_weight_sum ?? 0, want.rating_weight_sum, 0.01)) return false;
  const stored =
    row.criteria_scores && typeof row.criteria_scores === 'object'
      ? (row.criteria_scores as Record<
          string,
          { score?: unknown; weight_sum?: unknown; writers?: unknown }
        >)
      : {};
  const keys = Object.keys(want.criteria_scores).sort();
  if (canonical(Object.keys(stored).sort()) !== canonical(keys)) return false;
  return keys.every(key => {
    const s = stored[key] ?? {};
    const w = want.criteria_scores[key]!;
    return (
      close(s.score, w.score, 0.001) &&
      close(s.weight_sum, w.weight_sum, 0.01) &&
      Number(s.writers) === w.writers
    );
  });
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Stores one batch, retrying a deadlock; returns the rows the writer changed. */
export async function storeBatch(
  supabase: RateSupabaseClient,
  batch: readonly ReviewValueWrite[],
  wait: (ms: number) => Promise<unknown> = sleep
): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase.rpc('store_review_values', { p_values: batch });
    if (!error) return Number(data ?? 0);
    if (error.code === '40P01' && attempt < DEADLOCK_ATTEMPTS) {
      logger.warn(
        'review_values.deadlock',
        `Batch of ${batch.length} hit a deadlock; retrying (${attempt}/${DEADLOCK_ATTEMPTS - 1}).`,
        { attempt }
      );
      await wait(250 * 2 ** (attempt - 1));
      continue;
    }
    // 22023: the writer refused a row the module produced, so the module and
    // the database disagree (a REVIEW_VALUE_VERSION change needs DOS-Me first).
    throw new Error(`store_review_values (${error.code ?? 'no code'}): ${error.message}`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The rows a master's rating reads, read again on their own. */
async function loadMasterRating(
  supabase: RateSupabaseClient,
  masterIds: readonly string[]
): Promise<{
  rows: MasterRatingRow[];
  expected: Map<string, MasterRatingExpected>;
}> {
  const listings = await selectIn<ValueListingRow>(
    supabase,
    'products',
    'id, cluster_id, origin',
    'cluster_id',
    masterIds
  );
  const reviews = await selectIn<ValueReviewRow>(
    supabase,
    'reviews',
    REVIEW_COLUMNS,
    'product_id',
    listings.map(l => l.id)
  );
  const stored = await selectIn<StoredValueRow>(
    supabase,
    'review_values',
    'review_id, value_score, value_breakdown',
    'review_id',
    reviews.map(r => r.id)
  );
  const values = new Map(
    stored.map(row => [
      row.review_id,
      {
        weightCompleteness: (row.value_breakdown as { weightCompleteness?: unknown } | null)
          ?.weightCompleteness,
      },
    ])
  );
  const rows = await selectIn<MasterRatingRow>(
    supabase,
    'master_products',
    'id, rating_score, rating_weight_sum, criteria_scores',
    'id',
    masterIds
  );
  return { rows, expected: expectedMasterRatings({ reviews, listings, values }) };
}

export interface ReviewValuesResult {
  apply: boolean;
  reviews: number;
  changed: number;
  stored: number;
  batches: number;
  masters: number;
  staleMasters: string[];
}

export async function runReviewValuesJob(
  supabase: RateSupabaseClient,
  options: {
    apply?: boolean;
    masterId?: string | null;
    wait?: (ms: number) => Promise<unknown>;
  } = {}
): Promise<ReviewValuesResult> {
  const apply = options.apply === true;
  const only = options.masterId ?? null;
  if (only !== null && !UUID.test(only)) throw new Error('--master must be a UUID.');

  // One master: its listings first, then their reviews. Otherwise every scored review.
  const scopedListings =
    only === null
      ? null
      : await selectIn<ValueListingRow>(
          supabase,
          'products',
          'id, cluster_id, origin',
          'cluster_id',
          [only]
        );
  const reviews =
    scopedListings === null
      ? await fetchAllPages<ValueReviewRow>(
          'reviews',
          (from, to) =>
            // The column list is not a literal, so the client cannot type the rows.
            supabase
              .from('reviews')
              .select(REVIEW_COLUMNS)
              .in('origin', SCORED_REVIEW_ORIGINS)
              .order('id')
              .range(from, to) as unknown as PromiseLike<{
              data: ValueReviewRow[] | null;
              error: { message: string } | null;
            }>
        )
      : (
          await selectIn<ValueReviewRow>(
            supabase,
            'reviews',
            REVIEW_COLUMNS,
            'product_id',
            scopedListings.map(l => l.id)
          )
        ).filter(r => SCORED_REVIEW_ORIGINS.includes(r.origin ?? ''));
  const reviewIds = reviews.map(r => r.id);
  const points =
    only === null
      ? await fetchAllPages<ValuePointRow>('review_points', (from, to) =>
          supabase
            .from('review_points')
            .select('review_id, kind, criterion_key, body, method')
            .order('id')
            .range(from, to)
        )
      : await selectIn<ValuePointRow>(
          supabase,
          'review_points',
          'review_id, kind, criterion_key, body, method',
          'review_id',
          reviewIds
        );
  const stored =
    only === null
      ? await fetchAllPages<StoredValueRow>('review_values', (from, to) =>
          supabase
            .from('review_values')
            .select('review_id, value_score, value_breakdown')
            .order('review_id')
            .range(from, to)
        )
      : await selectIn<StoredValueRow>(
          supabase,
          'review_values',
          'review_id, value_score, value_breakdown',
          'review_id',
          reviewIds
        );
  const listings =
    scopedListings ??
    (await selectIn<ValueListingRow>(
      supabase,
      'products',
      'id, cluster_id, origin',
      'id',
      reviews.map(r => r.product_id)
    ));
  const masterIds = [
    ...new Set(listings.map(l => l.cluster_id).filter((id): id is string => !!id)),
  ];
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

  const values = buildReviewValues({ reviews, points, listings, masters, categories });
  const changed = changedValues(values, stored, new Map(reviews.map(r => [r.id, r.value_tier])));
  const batches = batchValues(changed);
  logger.info(
    'review_values.plan',
    `${apply ? 'Storing' : 'Would store'} ${changed.length} of ${values.size} review values in ${batches.length} batches.`,
    { apply, reviews: values.size, changed: changed.length, batches: batches.length }
  );

  let written = 0;
  if (apply) {
    for (const [index, batch] of batches.entries()) {
      written += await storeBatch(supabase, batch, options.wait);
      logger.info(
        'review_values.batch',
        `Stored batch ${index + 1}/${batches.length} (${batch.length} rows).`,
        { batch: index + 1, rows: batch.length }
      );
    }
  }

  // V5: in a dry run, the values stored now; after --apply, the values just stored.
  const effective = new Map<string, { weightCompleteness: unknown }>();
  for (const row of stored) {
    effective.set(row.review_id, {
      weightCompleteness: (row.value_breakdown as { weightCompleteness?: unknown } | null)
        ?.weightCompleteness,
    });
  }
  if (apply) for (const row of changed) effective.set(row.id, row.breakdown);
  const expected = expectedMasterRatings({ reviews, listings, values: effective });
  const ratedMasters = [...new Set([...expected.keys(), ...masterIds])];
  const current = await selectIn<MasterRatingRow>(
    supabase,
    'master_products',
    'id, rating_score, rating_weight_sum, criteria_scores',
    'id',
    ratedMasters
  );
  const suspects = current.filter(row => !masterRatingMatches(row, expected.get(row.id)));
  let staleMasters: string[] = [];
  if (suspects.length > 0) {
    const again = await loadMasterRating(
      supabase,
      suspects.map(row => row.id)
    );
    staleMasters = again.rows
      .filter(row => !masterRatingMatches(row, again.expected.get(row.id)))
      .map(row => row.id)
      .sort();
  }
  if (staleMasters.length > 0) {
    logger.warn(
      'review_values.stale_masters',
      `${staleMasters.length} masters differ from their computed rating (V5); service_role refreshes them with rate.refresh_master_rating_extras.`,
      {
        masters: staleMasters.slice(0, STALE_LOGGED),
        more: Math.max(0, staleMasters.length - STALE_LOGGED),
      }
    );
  }

  logger.info(
    'review_values.done',
    `${apply ? 'Stored' : 'Dry run:'} ${apply ? written : changed.length} review values; ${ratedMasters.length} masters checked, ${staleMasters.length} stale.`,
    {
      apply,
      reviews: values.size,
      changed: changed.length,
      stored: written,
      masters: ratedMasters.length,
      stale: staleMasters.length,
    }
  );
  return {
    apply,
    reviews: values.size,
    changed: changed.length,
    stored: written,
    batches: batches.length,
    masters: ratedMasters.length,
    staleMasters,
  };
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
    // The publishable key plus the worker user's sign-in: its access token
    // carries the rate_worker role, which reads the review tables and writes
    // values only through rate.store_review_values.
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
    const role = (auth.user?.role ?? '').trim();
    if (role !== 'rate_worker') {
      throw new Error(`The signed-in user has role '${role}', not rate_worker; refusing to run.`);
    }
    const supabase = scopeSupabaseToRate(client);
    const apply = process.argv.includes('--apply');
    const at = process.argv.indexOf('--master');
    const masterId = at >= 0 ? (process.argv[at + 1] ?? '') : null;
    // The host is not secret; it shows which project the job reads.
    logger.info('review_values.target', `Target: ${host} (${apply ? 'apply' : 'dry run'})`, {
      host,
    });
    const result = await runReviewValuesJob(supabase, { apply, masterId });
    if (result.staleMasters.length > 0) process.exitCode = 2;
  })().catch((err: unknown) => {
    logger.error(
      'review_values.fatal',
      `Review values job failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
