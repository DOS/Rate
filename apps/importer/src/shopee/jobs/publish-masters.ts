/**
 * Publishes named seed masters or wave-validated crawled Wave E1-E4 drafts in
 * `rate.master_products` (DOS/Rate#1756, DOS/Rate#1918).
 *
 * Seed mode (default, unchanged):
 * A seed master is inserted as a draft (`backfill-specs.ts --only ... --insert-missing`), and
 * rate.vn hides a draft. This job flips `status` from `draft` to `published` for the seeds a
 * run names, and nothing else.
 *
 * Usage (from apps/importer, with the target database's env loaded):
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --only <model_key,...>                     (Dry-run)
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --only <model_key,...> --apply --expect <n>
 *
 * Crawled Wave E1-E4 mode (explicit opt-in via `--crawled`):
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --crawled [--category <slug[,slug2]>] [--only <model_key,...>] [--limit <n>] [--allow-unknown-brand]
 *   pnpm exec tsx src/shopee/jobs/publish-masters.ts --crawled [--category <slug[,slug2]>] --apply --expect <n>
 *
 * Flags:
 *   --crawled              Explicit opt-in for crawled Wave E1-E4 master audit/publish mode.
 *   --category <slugs>     Wave E1-E4 category slug(s), comma-separated. Core 5 tech device
 *                          categories are rejected (use strict seed `--only` mode instead).
 *   --only <keys>          In seed mode: required seed model_keys. In --crawled mode: optional
 *                          filter to specific model_keys.
 *   --limit <n>            Optional positive integer cap (1..1000) on eligible crawled drafts
 *                          selected after deterministic sorting, applied before --expect.
 *   --reject-unknown-brand Default true in --crawled mode; rejects brand "Khac" / "khac:..." keys.
 *   --allow-unknown-brand  Explicit override in --crawled mode to allow unknown brand masters.
 *   --apply                Writes. Always requires --expect.
 *   --expect <n>           With --apply, stops before the first write unless eligible drafts
 *                          match n. A dry run with --expect fails (exit 1) on mismatch.
 *   Unknown, repeated or `--flag=value` arguments fail.
 *
 * Never writes listings, merchants, reviews, prices, specs, images or `rate.items`.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import {
  HttpUrlSchema,
  ProductSpecificationsSchema,
  splitModelKey,
  type ProductSpecifications,
} from '@repo/shared-data';
import { RATING_DEVICE_CATEGORIES } from '@repo/shared-data/rules';
import { FLAGSHIP_DEVICES_TO_SEED, type FlagshipDeviceSeed } from '../flagship-seed-data.js';
import { fetchByKey, resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import {
  UNKEYED_MODEL_SEGMENT,
  WAVE_E1_CATEGORY_SLUGS,
  WAVE_E2_SERVICE_CATEGORY_SLUGS,
  WAVE_E3_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  type CanonicalCategorySlug,
} from '../product-normalizer.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';
import {
  auditedSpecGroups,
  hasSingleRearCamera,
  requiredSpecGroups,
  selectOnlySeeds,
  statesRearCamera,
} from './backfill-specs.js';

const logger = createImporterLogger('PublishMastersJob');

/** Chunk size <= 150 for `.in()` filters so PostgREST request URLs stay short. */
const IN_CHUNK_SIZE = 150;
const MAX_CRAWLED_LIMIT = 1000;
const MAX_SLUG_LENGTH = 200;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export const CORE_TECH_CATEGORY_SLUGS: ReadonlySet<string> = new Set(RATING_DEVICE_CATEGORIES);

export const WAVE_E_ALL_CATEGORY_SLUGS: readonly CanonicalCategorySlug[] = [
  ...WAVE_E1_CATEGORY_SLUGS,
  ...WAVE_E2_SERVICE_CATEGORY_SLUGS,
  ...WAVE_E3_CATEGORY_SLUGS,
  ...WAVE_E4_PLACE_CATEGORY_SLUGS,
];

export const WAVE_E_CATEGORY_SLUGS: ReadonlySet<string> = new Set(WAVE_E_ALL_CATEGORY_SLUGS);

const WAVE_E2_EXPECTED_CURRENCY: Readonly<Record<string, 'PCT' | 'VND'>> = {
  'bank-savings': 'PCT',
  'internet-telecom': 'VND',
};

const PLACEHOLDER_IDENTITY_SEGMENTS: ReadonlySet<string> = new Set([
  UNKEYED_MODEL_SEGMENT,
  'unknown',
  'placeholder',
  'null',
  'undefined',
  'none',
  'tbd',
]);

const PLACEHOLDER_VARIANT_SEGMENTS: ReadonlySet<string> = new Set([
  UNKEYED_MODEL_SEGMENT,
  'placeholder',
  'null',
  'undefined',
  'tbd',
]);

export interface PublishMastersArgs {
  readonly only: string[];
  readonly apply: boolean;
  readonly expect?: number;
}

export interface CrawledPublishArgs {
  readonly crawled: true;
  readonly categories: string[];
  readonly only?: string[];
  readonly limit?: number;
  readonly rejectUnknownBrand: boolean;
  readonly apply: boolean;
  readonly expect?: number;
}

function parseCommaList(raw: string, emptyError: string): string[] {
  const items = [
    ...new Set(
      raw
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    ),
  ];
  if (items.length === 0) throw new Error(emptyError);
  return items;
}

function parseWholeNumber(raw: string, flagName: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${flagName} needs a whole number, got ${JSON.stringify(raw)}`);
  }
  return Number(trimmed);
}

function validateWaveECategories(categories: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const raw of categories) {
    const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!slug) {
      throw new Error('--category needs at least one category slug');
    }
    if (CORE_TECH_CATEGORY_SLUGS.has(slug)) {
      throw new Error(
        `--crawled does not support core tech category ${JSON.stringify(slug)}: use strict seed mode --only <model_key,...> instead`
      );
    }
    if (!WAVE_E_CATEGORY_SLUGS.has(slug)) {
      throw new Error(
        `unknown --crawled category ${JSON.stringify(slug)}: allowed categories are ${WAVE_E_ALL_CATEGORY_SLUGS.join(', ')}`
      );
    }
    if (!normalized.includes(slug)) normalized.push(slug);
  }
  if (normalized.length === 0) {
    throw new Error('--category needs at least one category slug');
  }
  return normalized;
}

/** Parses the job's flags for seed or `--crawled` mode; throws on anything invalid. */
export function parsePublishMastersArgs(
  argv: readonly string[]
): PublishMastersArgs | CrawledPublishArgs {
  let crawled = false;
  let apply = false;
  let onlyRaw: string | undefined;
  let categoryRaw: string | undefined;
  let limitRaw: string | undefined;
  let expectRaw: string | undefined;
  let seenRejectUnknownBrand = false;
  let seenAllowUnknownBrand = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--crawled') {
      if (crawled) throw new Error('--crawled is repeated');
      crawled = true;
      continue;
    }
    if (arg === '--apply') {
      if (apply) throw new Error('--apply is repeated');
      apply = true;
      continue;
    }
    if (arg === '--reject-unknown-brand') {
      if (seenRejectUnknownBrand) throw new Error('--reject-unknown-brand is repeated');
      seenRejectUnknownBrand = true;
      continue;
    }
    if (arg === '--allow-unknown-brand') {
      if (seenAllowUnknownBrand) throw new Error('--allow-unknown-brand is repeated');
      seenAllowUnknownBrand = true;
      continue;
    }
    if (arg === '--only' || arg === '--expect' || arg === '--category' || arg === '--limit') {
      const alreadySet =
        (arg === '--only' && onlyRaw !== undefined) ||
        (arg === '--expect' && expectRaw !== undefined) ||
        (arg === '--category' && categoryRaw !== undefined) ||
        (arg === '--limit' && limitRaw !== undefined);
      if (alreadySet) throw new Error(`${arg} is repeated`);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--only') onlyRaw = next;
      else if (arg === '--expect') expectRaw = next;
      else if (arg === '--category') categoryRaw = next;
      else limitRaw = next;
      i++;
      continue;
    }
    throw new Error(
      `unknown argument ${JSON.stringify(arg)}: this job takes --only <model_key,...>, --apply, --expect <n> (or --crawled with --category, --limit, --reject-unknown-brand/--allow-unknown-brand)`
    );
  }

  if (!crawled) {
    if (categoryRaw !== undefined) throw new Error('--category requires --crawled');
    if (limitRaw !== undefined) throw new Error('--limit requires --crawled');
    if (seenRejectUnknownBrand) throw new Error('--reject-unknown-brand requires --crawled');
    if (seenAllowUnknownBrand) throw new Error('--allow-unknown-brand requires --crawled');
    if (onlyRaw === undefined) throw new Error('--only is required');
    const only = parseCommaList(onlyRaw, '--only needs at least one model_key');
    const expect = expectRaw !== undefined ? parseWholeNumber(expectRaw, '--expect') : undefined;
    if (apply && expect === undefined) throw new Error('--apply needs --expect');
    return { only, apply, ...(expect !== undefined ? { expect } : {}) };
  }

  if (seenRejectUnknownBrand && seenAllowUnknownBrand) {
    throw new Error('cannot combine --reject-unknown-brand and --allow-unknown-brand');
  }
  const categories =
    categoryRaw !== undefined
      ? validateWaveECategories(
          parseCommaList(categoryRaw, '--category needs at least one category slug')
        )
      : [...WAVE_E_ALL_CATEGORY_SLUGS];
  const only =
    onlyRaw !== undefined
      ? parseCommaList(onlyRaw, '--only needs at least one model_key')
      : undefined;
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    limit = parseWholeNumber(limitRaw, '--limit');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CRAWLED_LIMIT) {
      throw new Error(`--limit needs an integer between 1 and ${MAX_CRAWLED_LIMIT}`);
    }
  }
  const expect = expectRaw !== undefined ? parseWholeNumber(expectRaw, '--expect') : undefined;
  if (apply && expect === undefined) throw new Error('--apply needs --expect');

  return {
    crawled: true,
    categories,
    ...(only !== undefined ? { only } : {}),
    ...(limit !== undefined ? { limit } : {}),
    rejectUnknownBrand: !seenAllowUnknownBrand,
    apply,
    ...(expect !== undefined ? { expect } : {}),
  };
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

async function createRateSupabaseClientFromEnv(): Promise<RateSupabaseClient> {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();
  if (!rawUrl.trim() || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
  }
  const { url } = resolveBackfillSupabaseTarget(rawUrl);
  const { createClient } = await import('@supabase/supabase-js');
  return scopeSupabaseToRate(createClient(url, key, { auth: { persistSession: false } }));
}

/** The job against the database the environment names. */
export async function publishSeedMasters(
  options: PublishMastersOptions
): Promise<PublishMastersResult> {
  // An unknown --only key fails before the client exists.
  selectOnlySeeds(options.only, options.seeds ?? FLAGSHIP_DEVICES_TO_SEED);
  const supabase = await createRateSupabaseClientFromEnv();
  return publishSeedMastersWith(supabase, options);
}

export interface CrawledMasterRow {
  readonly id?: string | null;
  readonly model_key: string | null;
  readonly slug: string | null;
  readonly name: string | null;
  readonly brand: string | null;
  readonly status: string | null;
  readonly category_id: string | null;
  readonly entity_type: string | null;
  readonly images: unknown;
  readonly thumbnail: unknown;
  readonly specifications: unknown;
}

export interface CrawledListingRow {
  readonly id?: string | null;
  readonly cluster_id?: string | null;
  readonly price_current: number | string | null;
  readonly currency?: string | null;
  readonly availability?: string | null;
}

export interface CrawledPlaceDetailRow {
  readonly master_id?: string | null;
  readonly place_key: string | null;
  readonly branch_group_key: string | null;
  readonly province_code: string | null;
}

export interface CrawledPublishContext {
  readonly categorySlug: string | null;
  readonly activeListingCount?: number;
  readonly listings?: readonly CrawledListingRow[];
  readonly placeDetail?: CrawledPlaceDetailRow | null;
  readonly rejectUnknownBrand?: boolean;
}

export interface CrawledPublishOptions {
  readonly categories?: readonly string[];
  readonly only?: readonly string[];
  readonly limit?: number;
  readonly rejectUnknownBrand?: boolean;
  readonly apply?: boolean;
  readonly expect?: number;
}

export interface CrawledEligibleMaster {
  readonly id: string;
  readonly model_key: string;
  readonly slug: string;
  readonly categorySlug: string;
}

export interface CrawledBlockedMaster {
  readonly id: string | null;
  readonly model_key: string;
  readonly categorySlug: string | null;
  readonly reasons: readonly string[];
}

export interface CrawledSkippedMaster {
  readonly id: string | null;
  readonly model_key: string;
  readonly categorySlug: string | null;
  readonly reason: string;
}

export interface CrawledPublishResult {
  readonly mode: 'crawled';
  readonly dryRun: boolean;
  readonly apply: boolean;
  readonly categories: readonly string[];
  readonly rejectUnknownBrand: boolean;
  readonly limit?: number;
  readonly expect?: number;
  readonly scanned: number;
  readonly alreadyPublished: readonly string[];
  readonly eligible: readonly CrawledEligibleMaster[];
  readonly blocked: readonly CrawledBlockedMaster[];
  readonly skipped: readonly CrawledSkippedMaster[];
  readonly published: number;
}

function isNonEmptyCleanString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/\p{Cc}/u.test(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isActivePricedListing(row: CrawledListingRow): boolean {
  const price = toFiniteNumber(row.price_current);
  if (price === null || price <= 0) return false;
  if (
    row.availability !== undefined &&
    row.availability !== null &&
    row.availability !== 'in_stock'
  ) {
    return false;
  }
  return true;
}

function isValidHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && HttpUrlSchema.safeParse(value).success;
}

function collectCommonCrawledBlockers(
  row: CrawledMasterRow,
  context: CrawledPublishContext,
  categorySlug: string,
  problems: string[]
): void {
  if (row.status !== 'draft') {
    problems.push(`status ${JSON.stringify(row.status)} is not "draft"`);
  }

  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    problems.push('missing or invalid slug');
  }

  if (!isNonEmptyCleanString(row.category_id)) {
    problems.push('missing category_id');
  } else if (!categorySlug) {
    problems.push(`unknown category_id ${JSON.stringify(row.category_id)}`);
  } else if (CORE_TECH_CATEGORY_SLUGS.has(categorySlug)) {
    problems.push(
      `category ${JSON.stringify(categorySlug)} is a core tech category and must use strict seed mode`
    );
  } else if (!WAVE_E_CATEGORY_SLUGS.has(categorySlug)) {
    problems.push(`category ${JSON.stringify(categorySlug)} is not a Wave E1-E4 category`);
  }

  const modelKey = typeof row.model_key === 'string' ? row.model_key.trim() : '';
  if (!modelKey) {
    problems.push('missing model_key');
  } else {
    const parts = modelKey.split(':');
    if (parts.length !== 3 || parts.some(p => p.trim().length === 0)) {
      problems.push('model_key must have 3 non-empty parts');
    } else if (splitModelKey(modelKey) === null) {
      problems.push('model_key format is invalid');
    } else {
      const [brandSeg, modelSeg, variantSeg] = parts as [string, string, string];
      if (
        brandSeg === UNKEYED_MODEL_SEGMENT ||
        modelSeg === UNKEYED_MODEL_SEGMENT ||
        variantSeg === UNKEYED_MODEL_SEGMENT
      ) {
        problems.push('model_key contains unkeyed placeholder');
      } else if (
        PLACEHOLDER_IDENTITY_SEGMENTS.has(brandSeg) ||
        PLACEHOLDER_IDENTITY_SEGMENTS.has(modelSeg) ||
        PLACEHOLDER_VARIANT_SEGMENTS.has(variantSeg)
      ) {
        problems.push('model_key contains placeholder segment');
      }
    }
  }

  const name = typeof row.name === 'string' ? row.name.replace(/\p{Cc}+/gu, ' ').trim() : '';
  if (!name) problems.push('missing name');

  const brand = typeof row.brand === 'string' ? row.brand.replace(/\p{Cc}+/gu, ' ').trim() : '';
  if (!brand) problems.push('missing brand');

  const rejectUnknownBrand = context.rejectUnknownBrand ?? true;
  if (rejectUnknownBrand) {
    const brandLower = brand.normalize('NFC').toLowerCase();
    const unknownBrandName =
      brandLower === 'khác' || brandLower === 'khac' || brandLower === 'unknown';
    const unknownBrandKey =
      modelKey.toLowerCase().startsWith('khac:') || modelKey.toLowerCase().startsWith('unknown:');
    if (unknownBrandName || unknownBrandKey) {
      problems.push(
        `unknown brand (${JSON.stringify(brand || modelKey)}) rejected; pass --allow-unknown-brand to override`
      );
    }
  }
}

function collectSpecCrawledBlockers(
  row: CrawledMasterRow,
  categorySlug: string,
  problems: string[]
): void {
  const parsedSpecs = ProductSpecificationsSchema.safeParse(row.specifications);
  if (!parsedSpecs.success) {
    problems.push('specifications fail ProductSpecificationsSchema');
    return;
  }
  const specs = parsedSpecs.data;
  const availability =
    specs.availability &&
    typeof specs.availability === 'object' &&
    !Array.isArray(specs.availability)
      ? specs.availability
      : null;
  const hasAvailabilityValue =
    availability !== null &&
    Object.values(availability).some(val => typeof val === 'string' && val.trim().length > 0);
  if (!hasAvailabilityValue) {
    problems.push('specifications missing non-empty availability group');
  }
  if (WAVE_E_CATEGORY_SLUGS.has(categorySlug)) {
    for (const group of auditedSpecGroups(categorySlug)) {
      if (!specs[group]) problems.push(`missing specification group "${group}"`);
    }
    if (
      typeof specs.category_slug === 'string' &&
      specs.category_slug.trim() !== '' &&
      specs.category_slug.trim().toLowerCase() !== categorySlug
    ) {
      problems.push(
        `specifications.category_slug ${JSON.stringify(specs.category_slug)} does not match ${JSON.stringify(categorySlug)}`
      );
    }
  }
}

function collectWaveCrawledBlockers(
  row: CrawledMasterRow,
  context: CrawledPublishContext,
  categorySlug: string,
  problems: string[]
): void {
  if (!WAVE_E_CATEGORY_SLUGS.has(categorySlug)) return;

  if (
    WAVE_E1_CATEGORY_SLUGS.has(categorySlug as CanonicalCategorySlug) ||
    WAVE_E3_CATEGORY_SLUGS.has(categorySlug as CanonicalCategorySlug)
  ) {
    if (row.entity_type !== 'product') {
      problems.push(
        `entity_type ${JSON.stringify(row.entity_type)} must be "product" for ${categorySlug}`
      );
    }
    const activeListings = Array.isArray(context.listings)
      ? context.listings.filter(
          listing =>
            isActivePricedListing(listing) &&
            (listing.currency === undefined ||
              listing.currency === null ||
              listing.currency === 'VND')
        ).length
      : (context.activeListingCount ?? 0);
    const effectiveActiveCount =
      typeof context.activeListingCount === 'number' && Array.isArray(context.listings)
        ? Math.min(activeListings, Math.max(0, Math.floor(context.activeListingCount)))
        : activeListings;
    if (effectiveActiveCount < 1) {
      problems.push('requires at least 1 active rate.products listing with price_current > 0');
    }
    if (!isValidHttpUrl(row.thumbnail)) {
      problems.push('missing or invalid HTTP/HTTPS thumbnail');
    }
    if (!Array.isArray(row.images) || row.images.length === 0) {
      problems.push('missing images array');
    } else if (!row.images.every(img => isValidHttpUrl(img))) {
      problems.push('images must contain only valid HTTP/HTTPS URLs');
    }
    return;
  }

  if (WAVE_E2_SERVICE_CATEGORY_SLUGS.has(categorySlug as CanonicalCategorySlug)) {
    if (row.entity_type !== 'service') {
      problems.push(
        `entity_type ${JSON.stringify(row.entity_type)} must be "service" for ${categorySlug}`
      );
    }
    const expectedCurrency = WAVE_E2_EXPECTED_CURRENCY[categorySlug] ?? 'VND';
    if (Array.isArray(context.listings)) {
      const pricedListings = context.listings.filter(isActivePricedListing);
      const matchingCurrency = pricedListings.filter(
        listing => listing.currency === expectedCurrency
      );
      const effectiveCount =
        typeof context.activeListingCount === 'number'
          ? Math.min(matchingCurrency.length, Math.max(0, Math.floor(context.activeListingCount)))
          : matchingCurrency.length;
      if (effectiveCount < 1) {
        if (pricedListings.length > 0) {
          const found = [...new Set(pricedListings.map(l => String(l.currency ?? 'null')))];
          problems.push(
            `requires active rate.products listing with currency ${expectedCurrency} (found ${found.join(', ')})`
          );
        } else {
          problems.push(
            `requires at least 1 active rate.products listing with price_current > 0 and currency ${expectedCurrency}`
          );
        }
      }
    } else if ((context.activeListingCount ?? 0) < 1) {
      problems.push(
        `requires at least 1 active rate.products listing with price_current > 0 and currency ${expectedCurrency}`
      );
    }
    return;
  }

  if (WAVE_E4_PLACE_CATEGORY_SLUGS.has(categorySlug as CanonicalCategorySlug)) {
    if (row.entity_type !== 'place') {
      problems.push(
        `entity_type ${JSON.stringify(row.entity_type)} must be "place" for ${categorySlug}`
      );
    }
    const detail = context.placeDetail;
    if (!detail) {
      problems.push('missing linked rate.place_details row');
      return;
    }
    if (!isNonEmptyCleanString(detail.place_key)) {
      problems.push('place_details missing place_key');
    }
    if (!isNonEmptyCleanString(detail.branch_group_key)) {
      problems.push('place_details missing branch_group_key');
    }
    if (!isNonEmptyCleanString(detail.province_code)) {
      problems.push('place_details missing province_code');
    }
  }
}

/**
 * Pure wave-aware predicate returning publish blockers for a crawled Wave E1-E4 master;
 * returns an empty array when the draft master is eligible to publish.
 */
export function crawledPublishBlockers(
  row: CrawledMasterRow,
  context: CrawledPublishContext
): string[] {
  const problems: string[] = [];
  const categorySlug =
    typeof context.categorySlug === 'string' ? context.categorySlug.trim().toLowerCase() : '';
  collectCommonCrawledBlockers(row, context, categorySlug, problems);
  collectSpecCrawledBlockers(row, categorySlug, problems);
  collectWaveCrawledBlockers(row, context, categorySlug, problems);
  return problems;
}

function chunks<T>(items: readonly T[], size = IN_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function selectInByKey<T>(
  supabase: RateSupabaseClient,
  table: string,
  columns: string,
  filterColumn: string,
  values: readonly string[],
  keyColumn = 'id'
): Promise<T[]> {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (uniqueValues.length === 0) return [];
  const rows: T[] = [];
  for (const part of chunks(uniqueValues, IN_CHUNK_SIZE)) {
    rows.push(
      ...(await fetchByKey<T>(supabase, table, columns, keyColumn, query =>
        query.in(filterColumn, part)
      ))
    );
  }
  return rows;
}

function compareStringsDeterministic(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeCrawledOptions(options: CrawledPublishOptions): {
  readonly apply: boolean;
  readonly categories: string[];
  readonly only?: string[];
  readonly limit?: number;
  readonly rejectUnknownBrand: boolean;
  readonly expect?: number;
} {
  const apply = options.apply === true;
  const categories =
    options.categories !== undefined
      ? validateWaveECategories(options.categories)
      : [...WAVE_E_ALL_CATEGORY_SLUGS];
  let only: string[] | undefined;
  if (options.only !== undefined) {
    only = [
      ...new Set(options.only.map(k => (typeof k === 'string' ? k.trim() : '')).filter(Boolean)),
    ];
    if (only.length === 0) throw new Error('--only needs at least one model_key');
  }
  const limit = options.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_CRAWLED_LIMIT)) {
    throw new Error(
      `limit must be an integer between 1 and ${MAX_CRAWLED_LIMIT}, got ${String(limit)}`
    );
  }
  const expect = options.expect;
  if (expect !== undefined && (!Number.isInteger(expect) || expect < 0)) {
    throw new Error(`expect must be a whole number of masters, got ${String(expect)}`);
  }
  if (apply && expect === undefined) throw new Error('apply needs expect');
  return {
    apply,
    categories,
    ...(only !== undefined ? { only } : {}),
    ...(limit !== undefined ? { limit } : {}),
    rejectUnknownBrand: options.rejectUnknownBrand ?? true,
    ...(expect !== undefined ? { expect } : {}),
  };
}

function logBatchMeta(event: string, prefix: string, items: readonly unknown[]): void {
  const BATCH = 50;
  if (items.length <= BATCH) return;
  const totalBatches = Math.ceil(items.length / BATCH);
  for (let i = 0; i < totalBatches; i++) {
    logger.info(event, `${prefix} (batch ${i + 1}/${totalBatches})`, {
      batch: i + 1,
      totalBatches,
      items: items.slice(i * BATCH, (i + 1) * BATCH),
    });
  }
}

const CRAWLED_MASTER_COLUMNS =
  'id, model_key, slug, name, brand, status, category_id, entity_type, images, thumbnail, specifications';

/**
 * Audits and optionally publishes Wave E1-E4 crawled draft masters in `rate.master_products`.
 * Dry-run by default; requires both `apply: true` and matching `expect` before any write.
 */
export async function runCrawledPublish(
  supabase: RateSupabaseClient,
  options: CrawledPublishOptions = {}
): Promise<CrawledPublishResult> {
  const cfg = normalizeCrawledOptions(options);
  const requestedCategorySet = new Set<string>(cfg.categories);

  const { data: rawCategories, error: catErr } = await supabase
    .from('categories')
    .select('id, slug');
  if (catErr) {
    throw new Error(`Failed to fetch categories: ${catErr.message}`);
  }
  const categoryIdBySlug = new Map<string, string>();
  const categorySlugById = new Map<string, string>();
  for (const cat of rawCategories ?? []) {
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) continue;
    const rawSlug = (cat as { slug?: unknown }).slug;
    const rawId = (cat as { id?: unknown }).id;
    const slug = typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : '';
    const id = typeof rawId === 'string' && !/\p{Cc}/u.test(rawId.trim()) ? rawId.trim() : '';
    if (slug && id) {
      categoryIdBySlug.set(slug, id);
      categorySlugById.set(id, slug);
    }
  }

  const targetCategoryIds = cfg.categories
    .map(slug => categoryIdBySlug.get(slug))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const masterRows = cfg.only
    ? await selectInByKey<CrawledMasterRow>(
        supabase,
        'master_products',
        CRAWLED_MASTER_COLUMNS,
        'model_key',
        cfg.only
      )
    : await selectInByKey<CrawledMasterRow>(
        supabase,
        'master_products',
        CRAWLED_MASTER_COLUMNS,
        'category_id',
        targetCategoryIds
      );

  const sortedRows = [...masterRows].sort((a, b) => {
    const keyCmp = compareStringsDeterministic(
      typeof a.model_key === 'string' ? a.model_key : '',
      typeof b.model_key === 'string' ? b.model_key : ''
    );
    if (keyCmp !== 0) return keyCmp;
    return compareStringsDeterministic(
      typeof a.id === 'string' ? a.id : '',
      typeof b.id === 'string' ? b.id : ''
    );
  });

  const foundModelKeys = new Set<string>();
  const alreadyPublished: string[] = [];
  const skipped: CrawledSkippedMaster[] = [];
  const blocked: CrawledBlockedMaster[] = [];
  const draftCandidates: Array<{
    row: CrawledMasterRow;
    id: string;
    modelKey: string;
    categorySlug: string | null;
  }> = [];

  for (const row of sortedRows) {
    const modelKey = typeof row.model_key === 'string' ? row.model_key.trim() : '';
    if (modelKey) foundModelKeys.add(modelKey);
    const id = isNonEmptyCleanString(row.id) ? row.id.trim() : null;
    const categorySlug = isNonEmptyCleanString(row.category_id)
      ? (categorySlugById.get(row.category_id.trim()) ?? null)
      : null;

    if (
      cfg.only &&
      categorySlug !== null &&
      WAVE_E_CATEGORY_SLUGS.has(categorySlug) &&
      !requestedCategorySet.has(categorySlug)
    ) {
      skipped.push({
        id,
        model_key: modelKey || '(no-model-key)',
        categorySlug,
        reason: `category ${JSON.stringify(categorySlug)} is outside selected categories`,
      });
      continue;
    }

    if (
      row.status === 'published' &&
      categorySlug !== null &&
      WAVE_E_CATEGORY_SLUGS.has(categorySlug)
    ) {
      alreadyPublished.push(modelKey || id || '(unknown)');
      continue;
    }

    if (!id) {
      blocked.push({
        id: null,
        model_key: modelKey || '(no-model-key)',
        categorySlug,
        reasons: ['missing master id'],
      });
      continue;
    }

    draftCandidates.push({ row, id, modelKey, categorySlug });
  }

  if (cfg.only) {
    const missingKeys = [...cfg.only]
      .filter(k => !foundModelKeys.has(k))
      .sort(compareStringsDeterministic);
    for (const missingKey of missingKeys) {
      blocked.push({
        id: null,
        model_key: missingKey,
        categorySlug: null,
        reasons: ['no master row'],
      });
    }
  }

  const listingMasterIds = draftCandidates
    .filter(
      c =>
        c.row.status === 'draft' &&
        c.categorySlug !== null &&
        (WAVE_E1_CATEGORY_SLUGS.has(c.categorySlug as CanonicalCategorySlug) ||
          WAVE_E2_SERVICE_CATEGORY_SLUGS.has(c.categorySlug as CanonicalCategorySlug) ||
          WAVE_E3_CATEGORY_SLUGS.has(c.categorySlug as CanonicalCategorySlug))
    )
    .map(c => c.id);

  const placeMasterIds = draftCandidates
    .filter(
      c =>
        c.row.status === 'draft' &&
        c.categorySlug !== null &&
        WAVE_E4_PLACE_CATEGORY_SLUGS.has(c.categorySlug as CanonicalCategorySlug)
    )
    .map(c => c.id);

  const [listingRows, placeDetailRows] = await Promise.all([
    selectInByKey<CrawledListingRow>(
      supabase,
      'products',
      'id, cluster_id, price_current, currency, availability',
      'cluster_id',
      listingMasterIds
    ),
    selectInByKey<CrawledPlaceDetailRow>(
      supabase,
      'place_details',
      'master_id, place_key, branch_group_key, province_code',
      'master_id',
      placeMasterIds,
      'master_id'
    ),
  ]);

  const listingsByMasterId = new Map<string, CrawledListingRow[]>();
  for (const listing of listingRows) {
    if (!isNonEmptyCleanString(listing.cluster_id)) continue;
    const masterId = listing.cluster_id.trim();
    const list = listingsByMasterId.get(masterId) ?? [];
    list.push(listing);
    listingsByMasterId.set(masterId, list);
  }

  const placeDetailByMasterId = new Map<string, CrawledPlaceDetailRow>();
  for (const detail of placeDetailRows) {
    if (!isNonEmptyCleanString(detail.master_id)) continue;
    placeDetailByMasterId.set(detail.master_id.trim(), detail);
  }

  const passingDrafts: CrawledEligibleMaster[] = [];
  for (const candidate of draftCandidates) {
    const reasons = crawledPublishBlockers(candidate.row, {
      categorySlug: candidate.categorySlug,
      listings: listingsByMasterId.get(candidate.id) ?? [],
      placeDetail: placeDetailByMasterId.get(candidate.id) ?? null,
      rejectUnknownBrand: cfg.rejectUnknownBrand,
    });
    if (reasons.length > 0) {
      blocked.push({
        id: candidate.id,
        model_key: candidate.modelKey || '(no-model-key)',
        categorySlug: candidate.categorySlug,
        reasons,
      });
      continue;
    }
    const slug = typeof candidate.row.slug === 'string' ? candidate.row.slug.trim() : '';
    passingDrafts.push({
      id: candidate.id,
      model_key: candidate.modelKey,
      slug,
      categorySlug: candidate.categorySlug!,
    });
  }

  const eligible = cfg.limit !== undefined ? passingDrafts.slice(0, cfg.limit) : passingDrafts;
  const limitSkipped = cfg.limit !== undefined ? passingDrafts.slice(cfg.limit) : [];
  for (const item of limitSkipped) {
    skipped.push({
      id: item.id,
      model_key: item.model_key,
      categorySlug: item.categorySlug,
      reason: `skipped by --limit ${cfg.limit}`,
    });
  }

  const expectMatches = cfg.expect === undefined ? undefined : eligible.length === cfg.expect;
  logger.info(
    'publish.crawled_plan',
    `Crawled Plan [mode=${cfg.apply ? 'APPLY' : 'DRY-RUN'}]: scanned=${sortedRows.length}, eligible=${eligible.length}, alreadyPublished=${alreadyPublished.length}, blocked=${blocked.length}, skipped=${skipped.length}${cfg.expect === undefined ? '' : `, expected=${cfg.expect}${expectMatches ? '' : ' (MISMATCH)'}`}`,
    {
      mode: 'crawled',
      dryRun: !cfg.apply,
      apply: cfg.apply,
      categories: cfg.categories,
      rejectUnknownBrand: cfg.rejectUnknownBrand,
      ...(cfg.limit !== undefined ? { limit: cfg.limit } : {}),
      ...(cfg.expect !== undefined ? { expect: cfg.expect } : {}),
      scanned: sortedRows.length,
      alreadyPublished,
      eligible,
      blocked,
      skipped,
    }
  );
  logBatchMeta('publish.crawled_eligible_batch', 'Crawled eligible masters', eligible);
  logBatchMeta('publish.crawled_blocked_batch', 'Crawled blocked masters', blocked);
  logBatchMeta('publish.crawled_skipped_batch', 'Crawled skipped masters', skipped);

  if (cfg.expect !== undefined && !expectMatches) {
    throw new Error(
      `--expect ${String(cfg.expect)} does not match the crawled plan (${eligible.length} eligible draft(s) to publish): nothing written`
    );
  }

  if (!cfg.apply) {
    return {
      mode: 'crawled',
      dryRun: true,
      apply: false,
      categories: cfg.categories,
      rejectUnknownBrand: cfg.rejectUnknownBrand,
      ...(cfg.limit !== undefined ? { limit: cfg.limit } : {}),
      ...(cfg.expect !== undefined ? { expect: cfg.expect } : {}),
      scanned: sortedRows.length,
      alreadyPublished,
      eligible,
      blocked,
      skipped,
      published: 0,
    };
  }

  let published = 0;
  for (const item of eligible) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('master_products')
      .update({ status: 'published', updated_at: nowIso })
      .eq('id', item.id)
      .eq('status', 'draft')
      .eq('slug', item.slug)
      .select('id');
    if (error) {
      throw new Error(`Failed to publish ${item.model_key}: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error(
        `Publishing ${item.model_key} touched ${Array.isArray(data) ? data.length : 0} rows, not 1: its status or slug changed after the plan (${published} published before it)`
      );
    }
    published++;
    logger.info('publish.crawled_published', `${item.model_key} (${item.id}): published`, {
      modelKey: item.model_key,
      id: item.id,
      categorySlug: item.categorySlug,
    });
  }

  return {
    mode: 'crawled',
    dryRun: false,
    apply: true,
    categories: cfg.categories,
    rejectUnknownBrand: cfg.rejectUnknownBrand,
    ...(cfg.limit !== undefined ? { limit: cfg.limit } : {}),
    ...(cfg.expect !== undefined ? { expect: cfg.expect } : {}),
    scanned: sortedRows.length,
    alreadyPublished,
    eligible,
    blocked,
    skipped,
    published,
  };
}

/** Runs `--crawled` mode against the database the environment names. */
export async function publishCrawledMasters(
  options: CrawledPublishOptions = {}
): Promise<CrawledPublishResult> {
  // Validate options before loading the Supabase client.
  normalizeCrawledOptions(options);
  const supabase = await createRateSupabaseClientFromEnv();
  return runCrawledPublish(supabase, options);
}

export function isCrawledPublishArgs(
  args: PublishMastersArgs | CrawledPublishArgs
): args is CrawledPublishArgs {
  return 'crawled' in args && args.crawled === true;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  void (async () => {
    const args = parsePublishMastersArgs(process.argv.slice(2));
    if (isCrawledPublishArgs(args)) {
      await publishCrawledMasters(args);
    } else {
      await publishSeedMasters(args);
    }
  })().catch((err: unknown) => {
    logger.error(
      'publish.fatal',
      `Publish run failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
