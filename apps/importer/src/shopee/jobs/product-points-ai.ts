/**
 * Product pros, cons and verdict AI rewording & cluster-merge batch job
 * (DOS/Rate#1623, design #1531 section 5.2, D9).
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/product-points-ai.ts
 *     [--apply] [--force] [--master <uuid>] [--hide-ai] [--wait-minutes <n>]
 *
 * Runs in importer batches (never on page load) after `product-points.ts`.
 * Dry-run by default: logs the `method = 'ai'` rows and verdict it would produce
 * without calling a model or writing to Supabase unless `--apply` (or a mock
 * `aiClient` in tests) is provided. Writes as `rate_worker` only, keeping
 * `method = 'code'` rows untouched as fallback and deleting stale `method = 'ai'`
 * rows when a master has zero `code` rows left.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { aggregateProductPoints, type PointCluster, type PointLine } from '@repo/shared-data/rules';
import { fetchAllPages, resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';
import {
  DEFAULT_REVIEW_AI_MODEL,
  isReviewAiModel,
  type ReviewAiModel,
} from '../review-ai-prompt.js';
import {
  PRODUCT_POINTS_AI_SCHEMA,
  buildProductPointsAiMessages,
  formatGroundedProductVerdict,
  mergeAndSelectAiProductPoints,
  parseProductPointsAiResponse,
  type AiClusterRewrite,
} from '../product-points-ai-prompt.js';
import {
  hideAiLinesFrom,
  reviewPointWeight,
  type CategoryRow,
  type PointListingRow,
  type PointMasterRow,
  type PointReviewRow,
  type ReviewPointRow,
} from './product-points.js';
import {
  DOS_AI_DEFAULT_BASE_URL,
  dosAiReviewAiClient,
  type BatchRequest,
  type ReviewAiClient,
} from './review-ai-points.js';
import { fetchByKey } from './review-values.js';

const logger = createImporterLogger('ProductPointsAiJob');
const IN_CHUNK = 150;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WAIT_MINUTES = 30;
const POLL_MS = 5_000;

export interface StoredProductPointRow {
  id: string;
  master_id: string;
  criterion_key: string | null;
  kind: 'pro' | 'con';
  label: string;
  support: number | string;
  reviewer_count: number;
  has_expert: boolean;
  first_seen: string;
  last_seen: string;
  method: 'code' | 'ai';
  updated_at: string;
}

export interface ProductPointAiInsert {
  master_id: string;
  criterion_key: string | null;
  kind: 'pro' | 'con';
  label: string;
  support: number;
  reviewer_count: number;
  has_expert: boolean;
  first_seen: string;
  last_seen: string;
  method: 'ai';
  updated_at: string;
}

/** True when `code` rows are new or newer than existing `ai` rows (or `--force`). */
export function isMasterDueForAiPoints(
  codeRows: readonly Pick<StoredProductPointRow, 'updated_at'>[],
  aiRows: readonly Pick<StoredProductPointRow, 'updated_at'>[],
  force = false
): boolean {
  if (codeRows.length === 0) return false;
  if (force || aiRows.length === 0) return true;
  const maxCode = Math.max(...codeRows.map(r => Date.parse(r.updated_at) || 0));
  const minAi = Math.min(...aiRows.map(r => Date.parse(r.updated_at) || 0));
  return maxCode > minAi;
}

const COUNTED_ORIGINS = new Set(['crawl', 'community']);

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
  key = 'id'
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunks([...new Set(ids)])) {
    rows.push(
      ...(await fetchByKey<T>(supabase, table, columns, key, query => query.in(column, part)))
    );
  }
  return rows;
}

export interface ProductPointsAiJobResult {
  apply: boolean;
  dueMasters: number;
  skippedUnchanged: number;
  staleClearedMasters: number;
  points: number;
  inserted: number;
  deleted: number;
  verdicts: Record<string, string>;
}

export async function runProductPointsAiJob(
  supabase: RateSupabaseClient,
  options: {
    apply?: boolean;
    force?: boolean;
    masterId?: string | null;
    now?: Date;
    hideAiLines?: boolean;
    model?: ReviewAiModel;
    waitMinutes?: number;
    aiClient?: ReviewAiClient | null;
    pollWait?: (ms: number) => Promise<unknown>;
  } = {}
): Promise<ProductPointsAiJobResult> {
  const apply = options.apply === true;
  const force = options.force === true;
  const now = options.now ?? new Date();
  const only = options.masterId ?? null;
  if (only !== null && !UUID_RE.test(only)) throw new Error('--master must be a UUID.');
  const model = options.model ?? DEFAULT_REVIEW_AI_MODEL;
  const hideAiLines = options.hideAiLines === true;

  const stored = await fetchAllPages<StoredProductPointRow>('product_points', (from, to) =>
    supabase
      .from('product_points')
      .select(
        'id, master_id, criterion_key, kind, label, support, reviewer_count, has_expert, first_seen, last_seen, method, updated_at'
      )
      .order('id')
      .range(from, to)
  );

  const codeByMaster = new Map<string, StoredProductPointRow[]>();
  const aiByMaster = new Map<string, StoredProductPointRow[]>();
  for (const row of stored) {
    if (only !== null && row.master_id !== only) continue;
    const map = row.method === 'ai' ? aiByMaster : codeByMaster;
    const list = map.get(row.master_id) ?? [];
    list.push(row);
    map.set(row.master_id, list);
  }

  const allMasterIds = [...new Set([...codeByMaster.keys(), ...aiByMaster.keys()])];
  const staleMasterIds: string[] = [];
  const dueMasterIds: string[] = [];
  let skippedUnchanged = 0;

  for (const id of allMasterIds) {
    const codeRows = codeByMaster.get(id) ?? [];
    const aiRows = aiByMaster.get(id) ?? [];
    if (codeRows.length === 0) {
      if (aiRows.length > 0) staleMasterIds.push(id);
      continue;
    }
    if (isMasterDueForAiPoints(codeRows, aiRows, force)) dueMasterIds.push(id);
    else skippedUnchanged += 1;
  }

  let inserted = 0;
  let deleted = 0;
  for (const id of staleMasterIds) {
    const oldAiIds = (aiByMaster.get(id) ?? []).map(r => r.id);
    logger.info(
      'product_points_ai.stale',
      `${apply ? 'Deleting' : 'Would delete'} ${oldAiIds.length} stale AI points for ${id} (0 code rows remain).`,
      { master_id: id, deleted: oldAiIds.length }
    );
    if (!apply) continue;
    for (const part of chunks(oldAiIds)) {
      const { error } = await supabase.from('product_points').delete().in('id', part);
      if (error) throw new Error(`product_points stale delete for ${id}: ${error.message}`);
      deleted += part.length;
    }
  }

  if (dueMasterIds.length === 0) {
    return {
      apply,
      dueMasters: 0,
      skippedUnchanged,
      staleClearedMasters: staleMasterIds.length,
      points: 0,
      inserted,
      deleted,
      verdicts: {},
    };
  }

  const masters = await selectIn<PointMasterRow>(
    supabase,
    'master_products',
    'id, category_id',
    'id',
    dueMasterIds
  );
  const categories = await fetchAllPages<CategoryRow>('categories', (from, to) =>
    supabase.from('categories').select('id, slug').order('id').range(from, to)
  );
  const listings = await selectIn<PointListingRow>(
    supabase,
    'products',
    'id, cluster_id, origin',
    'cluster_id',
    dueMasterIds
  );
  const crawledListings = listings.filter(
    l => l.origin === 'crawl' && typeof l.cluster_id === 'string' && l.cluster_id
  );
  const reviews = await selectIn<PointReviewRow>(
    supabase,
    'reviews',
    'id, product_id, origin, reviewer_type, helpfulness_weight, created_at, platform_created_at, review_flags(include_in_rating, verdict)',
    'product_id',
    crawledListings.map(l => l.id)
  );
  const countedReviews = reviews.filter(r => COUNTED_ORIGINS.has(r.origin ?? ''));
  const reviewPoints = await selectIn<ReviewPointRow>(
    supabase,
    'review_points',
    'id, review_id, criterion_key, kind, body, method',
    'review_id',
    countedReviews.map(r => r.id)
  );

  const slugByCat = new Map(categories.map(c => [c.id, c.slug]));
  const catByMaster = new Map(
    masters.map(m => [m.id, m.category_id ? (slugByCat.get(m.category_id) ?? null) : null])
  );
  const masterByListing = new Map(crawledListings.map(l => [l.id, l.cluster_id as string]));
  const reviewById = new Map(countedReviews.map(r => [r.id, r]));
  const linesByMaster = new Map<string, PointLine[]>();

  for (const pt of reviewPoints) {
    const rev = reviewById.get(pt.review_id);
    if (!rev) continue;
    const masterId = masterByListing.get(rev.product_id);
    if (!masterId || !catByMaster.has(masterId)) continue;
    if (pt.kind !== 'pro' && pt.kind !== 'con') continue;
    const method = pt.method ?? 'writer';
    if (method !== 'writer' && method !== 'ai') continue;
    if (hideAiLines && method === 'ai') continue;
    const arr = linesByMaster.get(masterId) ?? [];
    arr.push({
      id: pt.id,
      reviewId: rev.id,
      writerId: rev.id,
      kind: pt.kind,
      criterionKey: pt.criterion_key,
      body: pt.body,
      weight: reviewPointWeight(rev),
      isExpert: rev.reviewer_type === 'expert',
      writtenAt: rev.platform_created_at ?? rev.created_at ?? '',
      method,
    });
    linesByMaster.set(masterId, arr);
  }

  const plans = new Map<
    string,
    {
      categorySlug: string | null;
      lines: PointLine[];
      visibleClusters: PointCluster[];
      reviewCount: number;
    }
  >();
  const batchRequests: BatchRequest[] = [];
  for (const id of dueMasterIds) {
    const lines = linesByMaster.get(id) ?? [];
    const categorySlug = catByMaster.get(id) ?? null;
    const aggregated = aggregateProductPoints(categorySlug, lines, now, { hideAiLines });
    const visibleClusters = aggregated.clusters.filter(c => c.visible);
    plans.set(id, { categorySlug, lines, visibleClusters, reviewCount: aggregated.reviewCount });
    if (visibleClusters.length > 0) {
      const msgs = buildProductPointsAiMessages(
        categorySlug,
        visibleClusters,
        new Map(lines.map(l => [l.id, l]))
      );
      batchRequests.push({
        custom_id: id,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          max_tokens: 1800,
          temperature: 0.1,
          stream: false,
          messages: msgs,
          response_format: PRODUCT_POINTS_AI_SCHEMA,
        },
      });
    }
  }

  const aiOutputs = new Map<string, { rewrites: AiClusterRewrite[]; verdict: string | null }>();
  if (batchRequests.length > 0 && options.aiClient) {
    const client = options.aiClient;
    const waitFn = options.pollWait ?? (ms => new Promise(r => setTimeout(r, ms)));
    const deadline = Date.now() + Math.max(1, options.waitMinutes ?? DEFAULT_WAIT_MINUTES) * 60_000;
    const batch = await client.createBatch(batchRequests);
    while ((await client.batchStatus(batch.id)) !== 'ended') {
      if (Date.now() >= deadline) {
        await client.cancelBatch(batch.id).catch(() => undefined);
        throw new Error(`Timed out waiting for dos.ai batch ${batch.id} to finish.`);
      }
      await waitFn(POLL_MS);
    }
    for await (const item of client.results(batch.id)) {
      if (item.result.type !== 'succeeded' || item.result.message.stop_reason !== 'end_turn') {
        continue;
      }
      const rawText = item.result.message.content[0]?.text ?? '';
      try {
        aiOutputs.set(item.custom_id, parseProductPointsAiResponse(rawText));
      } catch {
        logger.warn(
          'product_points_ai.parse_failed',
          `Invalid JSON from AI for master ${item.custom_id}; skipping write so master stays due.`,
          { master_id: item.custom_id }
        );
      }
    }
  } else if (apply && batchRequests.length > 0 && !options.aiClient) {
    throw new Error('Missing AI client (DOS_AI_API_KEY) when running with --apply.');
  }

  const stamp = now.toISOString();
  const verdicts: Record<string, string> = {};
  let totalPoints = 0;

  for (const id of dueMasterIds) {
    const plan = plans.get(id)!;
    if (apply && plan.visibleClusters.length > 0 && !aiOutputs.has(id)) {
      logger.warn(
        'product_points_ai.master_deferred',
        `AI result unavailable for ${id}; keeping existing rows so master stays due.`,
        { master_id: id }
      );
      continue;
    }
    const aiOut = aiOutputs.get(id);
    const merged = mergeAndSelectAiProductPoints(
      plan.visibleClusters,
      plan.lines,
      aiOut?.rewrites ?? [],
      now
    );
    const rows: ProductPointAiInsert[] = merged.shown.map(c => ({
      master_id: id,
      criterion_key: c.criterionKey,
      kind: c.kind,
      label: c.label,
      support: c.support,
      reviewer_count: c.reviewerCount,
      has_expert: c.hasExpert,
      first_seen: c.firstSeen.toISOString(),
      last_seen: c.lastSeen.toISOString(),
      method: 'ai',
      updated_at: stamp,
    }));
    const verdict = formatGroundedProductVerdict({
      aiVerdict: aiOut?.verdict,
      summary: merged.summary,
      reviewCount: plan.reviewCount,
      updatedAt: now,
    });
    if (verdict) verdicts[id] = verdict;
    const oldAiIds = (aiByMaster.get(id) ?? []).map(r => r.id);
    totalPoints += rows.length;

    logger.info(
      'product_points_ai.master',
      `${apply ? 'Writing' : 'Would write'} ${rows.length} AI points for ${id} (replacing ${oldAiIds.length} AI rows; code rows untouched).`,
      {
        master_id: id,
        points: rows.length,
        replaced: oldAiIds.length,
        verdict_ready: Boolean(verdict),
        planned_labels: apply
          ? undefined
          : rows.map(r => `${r.kind}:${r.criterion_key ?? 'general'}:${r.label}`),
      }
    );
    if (!apply) continue;

    if (rows.length > 0) {
      const { error } = await supabase.from('product_points').insert(rows);
      if (error) throw new Error(`product_points AI insert for ${id}: ${error.message}`);
      inserted += rows.length;
    }
    for (const part of chunks(oldAiIds)) {
      const { error } = await supabase.from('product_points').delete().in('id', part);
      if (error) throw new Error(`product_points AI delete for ${id}: ${error.message}`);
      deleted += part.length;
    }
  }

  logger.info(
    'product_points_ai.done',
    `${apply ? 'Wrote' : 'Dry run:'} ${totalPoints} AI points for ${dueMasterIds.length} masters (${skippedUnchanged} unchanged skipped, ${staleMasterIds.length} stale cleared).`,
    {
      apply,
      dueMasters: dueMasterIds.length,
      skippedUnchanged,
      staleClearedMasters: staleMasterIds.length,
      points: totalPoints,
      inserted,
      deleted,
    }
  );

  return {
    apply,
    dueMasters: dueMasterIds.length,
    skippedUnchanged,
    staleClearedMasters: staleMasterIds.length,
    points: totalPoints,
    inserted,
    deleted,
    verdicts,
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
    const apply = process.argv.includes('--apply');
    const force = process.argv.includes('--force');
    const masterIdx = process.argv.indexOf('--master');
    const masterId = masterIdx >= 0 ? (process.argv[masterIdx + 1] ?? '') : null;
    const waitIdx = process.argv.indexOf('--wait-minutes');
    const waitMinutes =
      waitIdx >= 0 ? Number.parseInt(process.argv[waitIdx + 1] ?? '', 10) : DEFAULT_WAIT_MINUTES;
    const hideAiLines = hideAiLinesFrom(process.argv, process.env);
    const rawModel = (process.env.REVIEW_AI_MODEL || DEFAULT_REVIEW_AI_MODEL).trim();
    if (!isReviewAiModel(rawModel)) {
      throw new Error(`Unsupported REVIEW_AI_MODEL: ${JSON.stringify(rawModel)}.`);
    }

    let aiClient: ReviewAiClient | null = null;
    if (apply) {
      const aiKey = (process.env.DOS_AI_API_KEY || '').trim();
      if (!aiKey) {
        throw new Error('Missing DOS_AI_API_KEY in environment for --apply.');
      }
      const aiBase = (process.env.DOS_AI_BASE_URL || DOS_AI_DEFAULT_BASE_URL).trim();
      if (!/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(aiBase)) {
        throw new Error('DOS_AI_BASE_URL must be an https:// URL.');
      }
      aiClient = dosAiReviewAiClient(aiKey, aiBase);
    }

    logger.info(
      'product_points_ai.target',
      `Target: ${host} (${apply ? 'apply' : 'dry run'}${force ? ', force' : ''}${hideAiLines ? ', AI lines hidden' : ''})`,
      { host, apply, force, hideAiLines, model: rawModel }
    );
    await runProductPointsAiJob(scopeSupabaseToRate(client), {
      apply,
      force,
      masterId,
      hideAiLines,
      model: rawModel,
      waitMinutes:
        Number.isFinite(waitMinutes) && waitMinutes > 0 ? waitMinutes : DEFAULT_WAIT_MINUTES,
      aiClient,
    });
  })().catch((err: unknown) => {
    logger.error(
      'product_points_ai.fatal',
      `Product points AI job failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
