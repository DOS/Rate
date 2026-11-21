/**
 * Publishes named seed masters in `rate.master_products` (DOS/Rate#1756).
 *
 * A seed master is inserted as a draft (`backfill-specs.ts --only ... --insert-missing`), and
 * no job published one: rate.vn hides a draft. This job flips `status` from `draft` to
 * `published` for the seeds a run names, and nothing else.
 *
 * Usage (from apps/importer, with the target database's env loaded):
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --only <model_key,...>                     (Dry-run)
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --only <model_key,...> --apply --expect <n>
 *   --only <keys>  Required. The seed model_keys to publish; a key with no seed fails before
 *                  any read.
 *   --apply        Writes. Needs --expect.
 *   --expect <n>   With --apply, stops before the first write unless exactly n drafts are
 *                  ready to publish. A dry run with --expect fails (exit 1) when the plan
 *                  does not match, so its exit code can be checked.
 *   Unknown, repeated or `--flag=value` arguments fail.
 *
 * A named master is published only when all of these hold, so a run cannot publish a page
 * that is missing its specs or its licensed image:
 * - its row exists and its status is `draft` (an already published row is reported and left
 *   alone; any other status, such as `archived`, stops the run);
 * - its slug is the seed's (the page URL) and its category is the seed's category;
 * - the seed has images, and the row's `images` and `thumbnail` are the seed's (so the
 *   scoped `backfill-specs.ts --apply` that writes them ran first);
 * - its specifications pass the same checks as the catalog audit (schema, the 10 groups,
 *   and, for a phone or tablet seed or a camera group that states a rear camera, the main
 *   camera and a second camera unless the phone has one rear camera).
 * Any named master that fails stops the run before the first write. Each write is
 * `update ... where id = <id> and status = 'draft' and slug and thumbnail are the seed's`
 * and must touch exactly that row.
 *
 * Never writes listings, merchants, reviews, prices, specs, images or `rate.items`.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { ProductSpecificationsSchema, type ProductSpecifications } from '@repo/shared-data';
import { FLAGSHIP_DEVICES_TO_SEED, type FlagshipDeviceSeed } from '../flagship-seed-data.js';
import { resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';
import {
  hasSingleRearCamera,
  requiredSpecGroups,
  selectOnlySeeds,
  statesRearCamera,
} from './backfill-specs.js';

const logger = createImporterLogger('PublishMastersJob');

export interface PublishMastersArgs {
  readonly only: string[];
  readonly apply: boolean;
  readonly expect?: number;
}

/** Parses the job's flags; throws on anything it does not know. */
export function parsePublishMastersArgs(argv: readonly string[]): PublishMastersArgs {
  let apply = false;
  let onlyRaw: string | undefined;
  let expectRaw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      if (apply) throw new Error('--apply is repeated');
      apply = true;
      continue;
    }
    if (arg === '--only' || arg === '--expect') {
      if ((arg === '--only' ? onlyRaw : expectRaw) !== undefined) {
        throw new Error(`${arg} is repeated`);
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--only') onlyRaw = next;
      else expectRaw = next;
      i++;
      continue;
    }
    throw new Error(
      `unknown argument ${JSON.stringify(arg)}: this job takes --only <model_key,...>, --apply and --expect <n>`
    );
  }
  if (onlyRaw === undefined) throw new Error('--only is required');
  const only = [
    ...new Set(
      onlyRaw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
    ),
  ];
  if (only.length === 0) throw new Error('--only needs at least one model_key');
  let expect: number | undefined;
  if (expectRaw !== undefined) {
    if (!/^\d+$/.test(expectRaw)) {
      throw new Error(`--expect needs a whole number, got ${JSON.stringify(expectRaw)}`);
    }
    expect = Number(expectRaw);
  }
  if (apply && expect === undefined) throw new Error('--apply needs --expect');
  return { only, apply, ...(expect !== undefined ? { expect } : {}) };
}

interface MasterRow {
  id: string;
  model_key: string;
  slug: string | null;
  status: string | null;
  category_id: string | null;
  images: unknown;
  thumbnail: unknown;
  specifications: ProductSpecifications | null;
}

/** Why a named master may not be published; empty when it may. */
export function publishBlockers(
  row: MasterRow,
  seed: FlagshipDeviceSeed,
  categoryId: string | null
): string[] {
  const problems: string[] = [];
  if (!row.slug) problems.push('no slug');
  else if (row.slug !== seed.slug) {
    problems.push(
      `slug ${JSON.stringify(row.slug)} is not the seed's ${JSON.stringify(seed.slug)}`
    );
  }
  if (!row.category_id) problems.push('no category');
  else if (!categoryId) problems.push(`no category ${JSON.stringify(seed.categorySlug)} exists`);
  else if (row.category_id !== categoryId) {
    problems.push(
      `category ${JSON.stringify(row.category_id)} is not ${JSON.stringify(seed.categorySlug)} (${categoryId})`
    );
  }
  if (seed.images.length === 0) {
    problems.push('the seed has no images');
  } else {
    const images = Array.isArray(row.images) ? row.images : [];
    if (images.length !== seed.images.length || images.some((src, i) => src !== seed.images[i])) {
      problems.push(
        `images ${JSON.stringify(images)} are not the seed's ${JSON.stringify(seed.images)} (run the scoped backfill-specs apply first)`
      );
    }
    if (row.thumbnail !== seed.images[0]) {
      problems.push(
        `thumbnail ${JSON.stringify(row.thumbnail)} is not ${JSON.stringify(seed.images[0])}`
      );
    }
  }
  const specs = row.specifications;
  if (!ProductSpecificationsSchema.safeParse(specs).success) {
    problems.push('specifications fail ProductSpecificationsSchema');
  }
  for (const group of requiredSpecGroups(seed.categorySlug)) {
    if (!specs?.[group]) problems.push(`missing specification group "${group}"`);
  }
  // A phone or tablet seed always lists its rear cameras: a draft whose camera group is
  // empty never got the seed's specs. Other categories are audited only when their camera
  // group states a rear camera (DOS/Rate#1787).
  const rearCameraExpected = seed.categorySlug === 'smartphones' || seed.categorySlug === 'tablets';
  if (rearCameraExpected || statesRearCamera(specs?.camera)) {
    if (!specs?.camera?.main_camera?.trim()) problems.push('missing camera.main_camera');
    if (!hasSingleRearCamera(specs?.camera) && !specs?.camera?.second_camera?.trim()) {
      problems.push('missing camera.second_camera');
    }
  }
  return problems;
}

export interface PublishMastersResult {
  /** Drafts that pass every check, in seed order. */
  readonly planned: string[];
  /** Named masters that were already published (left alone). */
  readonly alreadyPublished: string[];
  readonly published: number;
}

export interface PublishMastersOptions {
  readonly only: readonly string[];
  readonly apply?: boolean;
  readonly expect?: number;
  /** The seed list; the flagship seeds unless a test passes its own. */
  readonly seeds?: readonly FlagshipDeviceSeed[];
}

/**
 * Plans with reads only, checks `expect`, then writes. Any blocker or a plan of the wrong
 * size stops the run before its first write.
 */
export async function publishSeedMastersWith(
  supabase: RateSupabaseClient,
  options: PublishMastersOptions
): Promise<PublishMastersResult> {
  const apply = options.apply === true;
  const expect = options.expect;
  if (expect !== undefined && (!Number.isInteger(expect) || expect < 0)) {
    throw new Error(`expect must be a whole number of masters, got ${String(expect)}`);
  }
  if (apply && expect === undefined) throw new Error('apply needs expect');
  const seeds = selectOnlySeeds(options.only, options.seeds ?? FLAGSHIP_DEVICES_TO_SEED);

  // The seeds' categories, by slug, so a draft filed elsewhere is not published.
  const categoryIds = new Map<string, string | null>();
  for (const slug of new Set(seeds.map(s => s.categorySlug))) {
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up category ${slug}: ${error.message}`);
    const id = (data as { id?: unknown } | null)?.id;
    categoryIds.set(slug, typeof id === 'string' ? id : null);
  }

  const planned: Array<{ seed: FlagshipDeviceSeed; id: string }> = [];
  const alreadyPublished: string[] = [];
  const failures: string[] = [];
  for (const seed of seeds) {
    const { data, error } = await supabase
      .from('master_products')
      .select('id, model_key, slug, status, category_id, images, thumbnail, specifications')
      .eq('model_key', seed.model_key)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up ${seed.model_key}: ${error.message}`);
    const row = data as MasterRow | null;
    if (!row) {
      failures.push(`${seed.model_key}: no master row`);
      continue;
    }
    if (row.status === 'published') {
      alreadyPublished.push(seed.model_key);
      logger.info('publish.already_published', `${seed.model_key}: already published, left alone`, {
        modelKey: seed.model_key,
      });
      continue;
    }
    if (row.status !== 'draft') {
      failures.push(`${seed.model_key}: status ${JSON.stringify(row.status)} is not draft`);
      continue;
    }
    const blockers = publishBlockers(row, seed, categoryIds.get(seed.categorySlug) ?? null);
    if (blockers.length > 0) {
      failures.push(`${seed.model_key}: ${blockers.join('; ')}`);
      continue;
    }
    planned.push({ seed, id: row.id });
    logger.info(
      'publish.planned',
      `${seed.model_key} (${row.id}): ${apply ? 'will publish' : 'DRY-RUN would publish'} (status: draft -> published, thumbnail ${String(row.thumbnail)})`,
      { modelKey: seed.model_key, id: row.id }
    );
  }
  if (failures.length > 0) {
    throw new Error(
      `Cannot publish (${failures.length}), nothing written:\n  - ${failures.join('\n  - ')}`
    );
  }

  const plannedKeys = planned.map(p => p.seed.model_key);
  const matches = expect === undefined ? undefined : planned.length === expect;
  logger.info(
    'publish.plan',
    `Plan [mode=${apply ? 'APPLY' : 'DRY-RUN'}]: ${planned.length} draft(s) to publish, ${alreadyPublished.length} already published${expect === undefined ? '' : `, expected ${expect}${matches ? '' : ' (MISMATCH)'}`}`,
    { planned: plannedKeys, alreadyPublished, expect }
  );
  if (!apply && expect === undefined)
    return { planned: plannedKeys, alreadyPublished, published: 0 };
  if (!matches) {
    throw new Error(
      `--expect ${String(expect)} does not match the plan (${planned.length} draft(s) to publish): nothing written`
    );
  }
  if (!apply) return { planned: plannedKeys, alreadyPublished, published: 0 };

  let published = 0;
  for (const { seed, id } of planned) {
    const { data, error } = await supabase
      .from('master_products')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'draft')
      .eq('slug', seed.slug)
      .eq('thumbnail', seed.images[0]!)
      .select('id');
    if (error) throw new Error(`Failed to publish ${seed.model_key}: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error(
        `Publishing ${seed.model_key} touched ${Array.isArray(data) ? data.length : 0} rows, not 1: its status, slug or thumbnail changed after the plan (${published} published before it)`
      );
    }
    published++;
    logger.info('publish.published', `${seed.model_key} (${id}): published`, {
      modelKey: seed.model_key,
      id,
    });
  }
  return { planned: plannedKeys, alreadyPublished, published };
}

/** The job against the database the environment names. */
export async function publishSeedMasters(
  options: PublishMastersOptions
): Promise<PublishMastersResult> {
  // An unknown --only key fails before the client exists.
  selectOnlySeeds(options.only, options.seeds ?? FLAGSHIP_DEVICES_TO_SEED);
  const { createClient } = await import('@supabase/supabase-js');
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();
  if (!rawUrl.trim() || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
  }
  const { url } = resolveBackfillSupabaseTarget(rawUrl);
  const supabase = scopeSupabaseToRate(createClient(url, key, { auth: { persistSession: false } }));
  return publishSeedMastersWith(supabase, options);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  Promise.resolve()
    .then(() => publishSeedMasters(parsePublishMastersArgs(process.argv.slice(2))))
    .catch((err: unknown) => {
      logger.error(
        'publish.fatal',
        `Publish run failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    });
}
