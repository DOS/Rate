/**
 * Dedicated Spec-Only Catalog Backfill & Cloud Spec Audit Job (Audit T2)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts              (Dry-run + audit, zero DB writes)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --apply      (Apply spec updates to rate.master_products)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --audit-only (Read-only 10-Field-Group audit)
 *
 * Scoped run (DOS/Rate#1464), for an approved fix of named masters only:
 *   ... backfill-specs.ts --only <model_key,...>                  (Dry-run: per-row field diff + planned count)
 *   ... backfill-specs.ts --only <model_key,...> --apply --expect <n>
 *   --only <keys>  Plans and writes only these seed model_keys: no other seed is inserted or
 *                  updated, no canonical or AI master and no rate.items row is touched. A key
 *                  with no seed fails before any database read.
 *   --expect <n>   With --apply, stops before the first write unless the plan updates or
 *                  inserts exactly n masters. A dry run logs whether the plan matches.
 *   A scoped run only updates existing masters: a named key with no master row stops an
 *   --apply before any write (a dry run warns). Any unknown argument, `--flag=value` or a
 *   repeated flag fails. Neither flag combines with --audit-only. The read-only catalog
 *   audit still runs at the end, so a scoped --apply can exit 1 after its writes when an
 *   unrelated master fails the audit: read the log, not only the exit code.
 *
 * Safety invariant:
 * - Dry-run by default (`apply = false`): never mutates `rate.master_products` unless `--apply` is passed.
 * - Never writes listings (`rate.products`), merchants, reviews, price_history, or fabricated scores.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { ProductSpecificationsSchema, type ProductSpecifications } from '@repo/shared-data';
import { AiSpecEnricher, mergeProductSpecifications } from '../ai-spec-enricher.js';
import { fetchAllPages, resolveBackfillSupabaseTarget } from '../paging.js';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
  flagshipSeedsByItem,
  type FlagshipDeviceSeed,
  type FlagshipItemSeed,
} from '../flagship-seed-data.js';
import { withoutRetractedSpecs } from '../spec-retraction.js';

export { withoutRetractedSpecs };
import { resolveItemModelMode, type ItemModelMode } from '../item-model-flag.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';

const logger = createImporterLogger('BackfillSpecsJob');

export const REQUIRED_10_SPEC_GROUPS = [
  'availability',
  'design',
  'display',
  'hardware',
  'battery',
  'camera',
  'connectivity',
  'cellular',
  'multimedia',
  'regulatory',
] as const;

export interface BackfillSpecsOptions {
  readonly apply?: boolean;
  /**
   * `--only`: the seed `model_key`s to update. Nothing else is inserted or updated: no other
   * seed, no canonical or AI master, no `rate.items` row. A key with no seed is an error
   * before any read; a key with no master row stops an apply before any write.
   */
  readonly only?: readonly string[];
  /**
   * `--expect`: the number of masters the plan must update or insert. With `apply`, a plan
   * of any other size stops before the first write; a dry run only reports the comparison.
   */
  readonly expect?: number;
}

export interface BackfillSpecsResult {
  readonly apply: boolean;
  /** Masters the plan updates or inserts (seeds, canonical entries, AI candidates). */
  readonly planned: number;
  readonly catalogUpdated: number;
  readonly catalogInserted: number;
  /** Items whose specs the seeds set (RATE_ITEM_MODEL on only; 0 otherwise). */
  readonly itemsUpdated: number;
  readonly skipped: number;
  readonly totalAudited: number;
}

/** Item specs carry no storage or RAM: those are per variant (design doc 4.1). */
export function withoutVariantSpecs(specs: ProductSpecifications): ProductSpecifications {
  if (!specs.hardware) return specs;
  const hardware = { ...specs.hardware };
  delete hardware.storage_gb;
  delete hardware.ram_gb;
  return { ...specs, hardware };
}

export function withoutVariantKeySpecs(keySpecs: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...keySpecs };
  delete rest.storage;
  delete rest.ram;
  return rest;
}

/**
 * The leaf paths an update changes on a stored row, with their old and new values
 * ("specifications.battery.capacity_mah: 5200 -> 5000"), for the dry-run log.
 */
export function specUpdateChanges(
  stored: Record<string, unknown> | null | undefined,
  update: Record<string, unknown>
): string[] {
  const leaves = (value: unknown, path: string, out: Map<string, unknown>) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
    } else out.set(path, value);
    return out;
  };
  const before = new Map<string, unknown>();
  const after = new Map<string, unknown>();
  for (const key of Object.keys(update)) {
    leaves(stored?.[key], key, before);
    leaves(update[key], key, after);
  }
  const show = (v: unknown) => (v === undefined ? '(none)' : JSON.stringify(v));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter(path => JSON.stringify(before.get(path)) !== JSON.stringify(after.get(path)))
    .sort()
    .map(path => `${path}: ${show(before.get(path))} -> ${show(after.get(path))}`);
}

/**
 * The spec columns a seed writes onto its existing master: specs and key specs merged into
 * the stored ones, minus the seed's retracted paths, and for a replaced seed its variant
 * name and value columns. Shared by the full backfill and the quick sync, so neither keeps a retracted value.
 */
export function seedMasterSpecUpdate(
  existing: { specifications?: unknown; key_specs?: unknown } | null | undefined,
  seed: FlagshipDeviceSeed
): Record<string, unknown> {
  return {
    specifications: withoutRetractedSpecs(
      mergeProductSpecifications(existing?.specifications, seed.specifications, seed.colors),
      seed.retract_spec_fields,
      'specifications'
    ),
    key_specs: withoutRetractedSpecs(
      mergeKeySpecs(existing?.key_specs, seed.key_specs as unknown as Record<string, unknown>),
      seed.retract_spec_fields,
      'key_specs'
    ),
    // A replaced, unsourced seed's label ("16GB/256GB") and columns (RAM, battery, colours)
    // follow the new one, on both entry points.
    ...(seed.retract_spec_fields
      ? {
          variant_name: seed.variant_name,
          description: seed.description,
          ram_gb: seed.ram_gb,
          storage_gb: seed.storage_gb,
          screen_size_inch: seed.screen_size_inch,
          battery_mah: seed.battery_mah,
          has_5g: seed.has_5g,
          colors: seed.colors,
        }
      : {}),
  };
}

/**
 * Writes each seed Item's specs, key specs, description and images onto its `rate.items`
 * row (design doc 4.1, 5.3, DOS/Rate#1152). Variant-only fields (storage) stay on the
 * variants. Items are never created here: the M1 sync trigger and M2 backfill own that,
 * so an Item not found is skipped. Dry-run unless `apply` is true.
 */
export async function syncItemSeedSpecs(
  supabase: RateSupabaseClient,
  options: {
    apply?: boolean;
    seeds?: readonly FlagshipItemSeed[];
    itemModel?: ItemModelMode;
  } = {}
): Promise<{ updated: number; missing: string[] }> {
  // Items exist only with the Item model on: with it off this writes nothing.
  if ((options.itemModel ?? resolveItemModelMode()) === 'off') return { updated: 0, missing: [] };
  const apply = options.apply === true;
  const missing: string[] = [];
  let updated = 0;
  for (const seed of options.seeds ?? flagshipSeedsByItem()) {
    const { data: item, error: lookupErr } = await supabase
      .from('items')
      .select('id, specifications, key_specs')
      .eq('item_key', seed.itemKey)
      .maybeSingle();
    if (lookupErr) {
      throw new Error(`Failed to look up Item ${seed.itemKey}: ${lookupErr.message}`);
    }
    if (!item) {
      missing.push(seed.itemKey);
      continue;
    }
    const row = item as { id: string; specifications?: unknown; key_specs?: unknown };
    if (apply) {
      const { error: upErr } = await supabase
        .from('items')
        .update({
          description: seed.description,
          specifications: withoutRetractedSpecs(
            withoutVariantSpecs(
              mergeProductSpecifications(row.specifications, seed.specifications)
            ),
            seed.retract_spec_fields,
            'specifications'
          ),
          key_specs: withoutRetractedSpecs(
            withoutVariantKeySpecs(
              mergeKeySpecs(row.key_specs, seed.key_specs as unknown as Record<string, unknown>)
            ),
            seed.retract_spec_fields,
            'key_specs'
          ),
          ...(seed.images.length > 0 ? { images: seed.images, thumbnail: seed.images[0] } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) {
        throw new Error(`Failed to update Item specs of ${seed.itemKey}: ${upErr.message}`);
      }
    }
    updated++;
    logger.info(
      'backfill.item_specs',
      `[Item Specs] ${seed.name} (${seed.itemKey}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
      { itemKey: seed.itemKey, apply }
    );
  }
  if (missing.length > 0) {
    logger.warn('backfill.item_missing', `${missing.length} seed Item(s) have no rate.items row`, {
      missing,
    });
  }
  return { updated, missing };
}

/**
 * Spec-only audit: every master product must carry all 10 Field Groups and the main + second
 * camera. Deliberately asserts nothing about offers, reviews or ratings.
 */
export async function auditMasterSpecs(supabase: RateSupabaseClient): Promise<number> {
  // Paged: an unpaged read stops at PostgREST's 1000-row cap and would skip
  // the rest of the catalog silently.
  const rows = await fetchAllPages('Final audit query failed', (from, to) =>
    supabase
      .from('master_products')
      .select('id, name, model_key, specifications')
      .order('id')
      .range(from, to)
  );

  const failures: string[] = [];
  for (const row of rows as Array<{
    id: string;
    name: string;
    model_key: string;
    specifications?: ProductSpecifications | null;
  }>) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const safeName =
      stripKeySpecControlChars(String(row.name ?? ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200) || '(unnamed)';
    const safeModelKey =
      stripKeySpecControlChars(String(row.model_key ?? ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160) || '(no-key)';
    const label = `${safeName} (${safeModelKey})`;
    const specCheck = ProductSpecificationsSchema.safeParse(row.specifications);
    if (!specCheck.success) {
      failures.push(`${label} failed ProductSpecificationsSchema validation`);
    }
    for (const grp of REQUIRED_10_SPEC_GROUPS) {
      if (!row.specifications?.[grp]) {
        failures.push(`${label} is missing specification group "${grp}"`);
      }
    }
    if (!row.specifications?.camera?.main_camera?.trim()) {
      failures.push(`${label} is missing camera.main_camera`);
    }
    // A phone with one rear camera (iPhone 17e, iPhone Air) has no second one to name.
    if (
      !/^single\b/i.test(row.specifications?.camera?.rear_setup?.trim() ?? '') &&
      !row.specifications?.camera?.second_camera?.trim()
    ) {
      failures.push(`${label} is missing camera.second_camera`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `Spec audit failed (${failures.length}):\n  - ${failures.join('\n  - ')}`
  );
  return rows.length;
}

export const MAX_KEY_SPEC_STRING_LENGTH = 500;
export const MAX_KEY_SPEC_KEY_LENGTH = 100;
export const MAX_KEY_SPEC_OBJECT_KEYS = 100;

const UNSAFE_KEY_SPEC_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripKeySpecControlChars(input: string): string {
  return input.replace(/\p{Cc}+/gu, ' ');
}

function isPlainSpecObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeKeySpecKey(key: string): string | null {
  if (typeof key !== 'string') return null;
  const cleaned = stripKeySpecControlChars(key).replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_KEY_SPEC_KEY_LENGTH || UNSAFE_KEY_SPEC_KEYS.has(cleaned)) {
    return null;
  }
  return cleaned;
}

function sanitizeKeySpecValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>()
): unknown {
  if (depth > 4 || value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const cleaned = stripKeySpecControlChars(value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_KEY_SPEC_STRING_LENGTH)
      .trim();
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    try {
      return value
        .slice(0, 50)
        .map(item => sanitizeKeySpecValue(item, depth + 1, seen))
        .filter(item => item !== undefined);
    } finally {
      seen.delete(value);
    }
  }
  if (isPlainSpecObject(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    try {
      const objOut: Record<string, unknown> = {};
      let count = 0;
      for (const [k, v] of Object.entries(value)) {
        const safeKey = sanitizeKeySpecKey(k);
        if (!safeKey) continue;
        if (count >= MAX_KEY_SPEC_OBJECT_KEYS && !Object.hasOwn(objOut, safeKey)) continue;
        const sanitized = sanitizeKeySpecValue(v, depth + 1, seen);
        if (sanitized !== undefined) {
          if (!Object.hasOwn(objOut, safeKey)) count += 1;
          objOut[safeKey] = sanitized;
        }
      }
      return objOut;
    } finally {
      seen.delete(value);
    }
  }
  return undefined;
}

export function mergeKeySpecs(
  existing: unknown,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base = isPlainSpecObject(existing) ? existing : {};
  const next = isPlainSpecObject(incoming) ? incoming : {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const source of [base, next]) {
    for (const [k, v] of Object.entries(source)) {
      const safeKey = sanitizeKeySpecKey(k);
      if (!safeKey) continue;
      if (count >= MAX_KEY_SPEC_OBJECT_KEYS && !Object.hasOwn(out, safeKey)) continue;
      const sanitized = sanitizeKeySpecValue(v, 0, new WeakSet<object>([source]));
      if (sanitized !== undefined) {
        if (!Object.hasOwn(out, safeKey)) count += 1;
        out[safeKey] = sanitized;
      }
    }
  }
  return out;
}

/** The CLI flags of this job (see the usage header). */
export interface BackfillSpecsArgs {
  readonly apply: boolean;
  readonly auditOnly: boolean;
  readonly only?: readonly string[];
  readonly expect?: number;
}

/** Parses the job's flags; throws on a malformed `--only` or `--expect`. */
export function parseBackfillSpecsArgs(argv: readonly string[]): BackfillSpecsArgs {
  // Strict: an argument this job does not know (a typo, `--only=keys`) or a repeated flag
  // fails, so it can never turn a scoped run into a full one.
  let apply = false;
  let auditOnly = false;
  let onlyRaw: string | undefined;
  let expectRaw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply' || arg === '--audit-only') {
      if ((arg === '--apply' ? apply : auditOnly) === true) throw new Error(`${arg} is repeated`);
      if (arg === '--apply') apply = true;
      else auditOnly = true;
      continue;
    }
    if (arg === '--only' || arg === '--expect') {
      if ((arg === '--only' ? onlyRaw : expectRaw) !== undefined) {
        throw new Error(`${arg} is repeated`);
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      if (arg === '--only') onlyRaw = next;
      else expectRaw = next;
      i++;
      continue;
    }
    throw new Error(
      `unknown argument ${JSON.stringify(arg)}: this job takes --apply, --audit-only, --only <model_key,...> and --expect <n>`
    );
  }
  let only: string[] | undefined;
  if (onlyRaw !== undefined) {
    only = [
      ...new Set(
        onlyRaw
          .split(',')
          .map(k => k.trim())
          .filter(Boolean)
      ),
    ];
    if (only.length === 0) throw new Error('--only needs at least one model_key');
  }
  let expect: number | undefined;
  if (expectRaw !== undefined) {
    if (!/^\d+$/.test(expectRaw.trim())) {
      throw new Error(`--expect takes a whole number of masters, got "${expectRaw}"`);
    }
    expect = Number(expectRaw.trim());
  }
  if (auditOnly && (only !== undefined || expect !== undefined)) {
    throw new Error('--only and --expect do not combine with --audit-only');
  }
  return {
    apply,
    auditOnly,
    ...(only !== undefined ? { only } : {}),
    ...(expect !== undefined ? { expect } : {}),
  };
}

/**
 * The seeds a `--only` list names, in seed order. Throws, naming them, on keys with no seed,
 * so a typo never turns a scoped run into a smaller one.
 */
export function selectOnlySeeds(
  only: readonly string[],
  seeds: readonly FlagshipDeviceSeed[] = FLAGSHIP_DEVICES_TO_SEED
): FlagshipDeviceSeed[] {
  if (!Array.isArray(only) || only.length === 0) {
    throw new Error('--only needs at least one model_key');
  }
  const wanted = new Set(only.map(k => (typeof k === 'string' ? k.trim() : '')));
  const seedKeys = new Set(seeds.map(s => s.model_key));
  const unknown = [...wanted].filter(k => !k || !seedKeys.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `--only names ${unknown.length} key(s) with no seed: ${unknown.map(k => JSON.stringify(k)).join(', ')}`
    );
  }
  return seeds.filter(s => wanted.has(s.model_key));
}

/** What the job needs besides the client, so tests can pass stand-ins. */
export interface BackfillSpecsDeps {
  readonly enricher: { isConfigured(): boolean };
  readonly matcher: { enrichMasterProductById(masterId: string): Promise<boolean> };
  /** The seed list; the flagship seeds unless a test passes its own. */
  readonly seeds?: readonly FlagshipDeviceSeed[];
}

type SeedWrite =
  | {
      kind: 'seed-update';
      device: FlagshipDeviceSeed;
      id: string;
      payload: Record<string, unknown>;
      changes?: string[];
    }
  | {
      kind: 'seed-insert';
      device: FlagshipDeviceSeed;
      payload: Record<string, unknown>;
      changes?: string[];
    };

type MasterWrite =
  | {
      kind: 'canonical-update';
      id: string;
      modelKey: string;
      name: string;
      payload: Record<string, unknown>;
    }
  | { kind: 'ai-enrich'; id: string; name: string };

/**
 * Logs a field diff in parts of at most 50 lines: the logger keeps only the first 50 items
 * of an array, and a part beyond that would drop silently. A diff of 50 lines or fewer
 * logs exactly as before.
 */
function logDiff(message: string, modelKey: string, changes: readonly string[]): void {
  const PART = 50;
  const parts = Math.max(1, Math.ceil(changes.length / PART));
  for (let i = 0; i < parts; i++) {
    logger.info(
      'backfill.catalog_diff',
      parts === 1 ? message : `${message} (part ${i + 1}/${parts}, ${changes.length} lines)`,
      { modelKey, changes: changes.slice(i * PART, (i + 1) * PART) }
    );
  }
}

/** A write payload without its timestamp, for the field diff. */
function withoutTimestamp(payload: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...payload };
  delete rest.updated_at;
  return rest;
}

/**
 * Spec-only catalog sync for `rate.master_products`.
 * Defaults to dry-run (`apply = false`) unless explicitly invoked with `{ apply: true }`.
 */
export async function runMasterSpecsBackfill(
  options: BackfillSpecsOptions = {}
): Promise<BackfillSpecsResult> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  // An unknown --only key fails before the client exists.
  if (options.only !== undefined) selectOnlySeeds(options.only);
  const { createClient } = await import('@supabase/supabase-js');
  const { EntityMatcher } = await import('../entity-matcher.js');

  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();
  if (!rawUrl.trim() || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
  }
  const { url } = resolveBackfillSupabaseTarget(rawUrl);

  const supabase = scopeSupabaseToRate(createClient(url, key, { auth: { persistSession: false } }));
  const enricher = new AiSpecEnricher();
  const matcher = new EntityMatcher(supabase, enricher);

  const aiInfo = enricher.getProviderInfo();
  logger.info(
    'backfill.start',
    `Running Spec-Only Catalog Sync for rate.master_products [mode=${options.apply === true ? 'APPLY' : 'DRY-RUN'}]`,
    {
      mode: options.apply === true ? 'APPLY' : 'DRY-RUN',
      provider: aiInfo.provider,
      model: aiInfo.model,
      configured: aiInfo.configured,
    }
  );

  return runMasterSpecsBackfillWith(supabase, { enricher, matcher }, options);
}

/**
 * The backfill on a given client. It plans every master write first (reads only), checks
 * `expect` against the plan, then writes, so a mismatch stops before the first write.
 */
export async function runMasterSpecsBackfillWith(
  supabase: RateSupabaseClient,
  deps: BackfillSpecsDeps,
  options: BackfillSpecsOptions = {}
): Promise<BackfillSpecsResult> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  const apply = options.apply === true;
  const allSeeds = deps.seeds ?? FLAGSHIP_DEVICES_TO_SEED;
  const scoped = options.only !== undefined;
  const seeds = scoped ? selectOnlySeeds(options.only!, allSeeds) : allSeeds;
  const expect = options.expect;
  if (expect !== undefined && (!Number.isInteger(expect) || expect < 0)) {
    throw new Error(`expect must be a whole number of masters, got ${String(expect)}`);
  }
  const { enricher, matcher } = deps;

  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, slug, name');
  if (catErr) {
    throw new Error(`Failed to fetch categories: ${catErr.message}`);
  }
  const categoryIdBySlug = new Map<string, string>();
  for (const c of categories || []) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const safeSlug =
      typeof c.slug === 'string' ? stripKeySpecControlChars(c.slug).trim().slice(0, 120) : '';
    const safeCatId =
      typeof c.id === 'string' && !/\p{Cc}/u.test(c.id.trim()) ? c.id.trim().slice(0, 128) : '';
    if (safeSlug && safeCatId) {
      categoryIdBySlug.set(safeSlug, safeCatId);
    }
  }

  // Plan: reads only.
  // Typed as a plain string: the client then reads rows as records, not a parsed column union.
  // A scoped run also reads the image and category columns, so its diff covers every write.
  const lookupColumns: string = scoped
    ? 'id, category_id, key_specs, specifications, variant_name, description, ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g, colors, images, thumbnail'
    : 'id, key_specs, specifications, variant_name, description, ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g, colors';
  const catalogModelKeys = new Set<string>(allSeeds.map(d => d.model_key));
  const seedWrites: SeedWrite[] = [];
  for (const device of seeds) {
    const categoryId = categoryIdBySlug.get(device.categorySlug) || null;
    const specFields = {
      description: device.description,
      ram_gb: device.ram_gb,
      storage_gb: device.storage_gb,
      screen_size_inch: device.screen_size_inch,
      battery_mah: device.battery_mah,
      has_5g: device.has_5g,
      specifications: device.specifications,
      key_specs: mergeKeySpecs(undefined, device.key_specs as unknown as Record<string, unknown>),
      colors: device.colors,
      ...(device.images.length > 0 ? { images: device.images, thumbnail: device.images[0] } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: lookupErr } = await supabase
      .from('master_products')
      .select(lookupColumns)
      .eq('model_key', device.model_key)
      .maybeSingle();
    if (lookupErr) {
      throw new Error(`Failed to look up master product ${device.model_key}: ${lookupErr.message}`);
    }

    if (existing) {
      const row = existing as unknown as { id: string } & Record<string, unknown>;
      const specUpdate = seedMasterSpecUpdate(
        row as { specifications?: unknown; key_specs?: unknown },
        device
      );
      const payload = {
        ...specFields,
        ...specUpdate,
        ...(categoryId ? { category_id: categoryId } : {}),
      };
      // A replaced seed shows exactly what it changes, so a dry-run can be checked against
      // the expected diff before an apply (DOS/Rate#1459). A scoped run shows it for every
      // row, over everything the update writes (DOS/Rate#1464).
      const changes = scoped
        ? specUpdateChanges(row, withoutTimestamp(payload))
        : device.retract_spec_fields
          ? specUpdateChanges(row, specUpdate)
          : undefined;
      seedWrites.push({ kind: 'seed-update', device, id: row.id, payload, changes });
    } else {
      const payload = {
        ...specFields,
        specifications: mergeProductSpecifications(undefined, device.specifications, device.colors),
        category_id: categoryId,
        brand: device.brand,
        model: device.model,
        variant_name: device.variant_name,
        model_key: device.model_key,
        name: device.name,
        slug: device.slug,
        merchant_count: 0,
        status: 'draft',
        metadata: { category_slug: device.categorySlug },
      };
      seedWrites.push({
        kind: 'seed-insert',
        device,
        payload,
        ...(scoped ? { changes: specUpdateChanges(null, withoutTimestamp(payload)) } : {}),
      });
    }
  }

  // Canonical and AI masters: never in a scoped run.
  const masterWrites: MasterWrite[] = [];
  let skipped = 0;
  if (!scoped) {
    const masters = await fetchAllPages('Failed to fetch master_products', (from, to) =>
      supabase
        .from('master_products')
        .select('id, name, model_key, key_specs, specifications')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    );

    for (const m of masters || []) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const safeMasterId =
        typeof m.id === 'string' && !/\p{Cc}/u.test(m.id.trim()) ? m.id.trim().slice(0, 128) : '';
      const safeModelKey =
        typeof m.model_key === 'string'
          ? stripKeySpecControlChars(m.model_key).trim().slice(0, 160)
          : '';
      const safeName =
        typeof m.name === 'string'
          ? stripKeySpecControlChars(m.name).replace(/\s+/g, ' ').trim().slice(0, 200) ||
            '(unnamed)'
          : '(unnamed)';
      if (!safeMasterId || !safeModelKey) {
        skipped++;
        continue;
      }
      if (catalogModelKeys.has(safeModelKey)) continue;

      const canonicalEntry = Object.hasOwn(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY, safeModelKey)
        ? CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY[safeModelKey]
        : undefined;

      if (canonicalEntry) {
        masterWrites.push({
          kind: 'canonical-update',
          id: safeMasterId,
          modelKey: safeModelKey,
          name: safeName,
          payload: {
            ram_gb: canonicalEntry.ram_gb,
            storage_gb: canonicalEntry.storage_gb,
            screen_size_inch: canonicalEntry.screen_size_inch,
            battery_mah: canonicalEntry.battery_mah,
            has_5g: canonicalEntry.has_5g,
            colors: canonicalEntry.colors,
            specifications: mergeProductSpecifications(
              (m as { specifications?: unknown }).specifications,
              canonicalEntry.specifications,
              canonicalEntry.colors
            ),
            key_specs: mergeKeySpecs(
              (m as { key_specs?: unknown }).key_specs,
              canonicalEntry.key_specs as unknown as Record<string, unknown>
            ),
            updated_at: new Date().toISOString(),
          },
        });
      } else if (apply && enricher.isConfigured()) {
        masterWrites.push({ kind: 'ai-enrich', id: safeMasterId, name: safeName });
      } else {
        skipped++;
      }
    }
  }

  // A scoped run fixes existing masters: a named key with no master row would insert a draft
  // (and through the master trigger possibly an Item), which --expect alone cannot catch.
  const scopedInserts = scoped
    ? seedWrites.filter(w => w.kind === 'seed-insert').map(w => w.device.model_key)
    : [];
  if (scopedInserts.length > 0) {
    const message = `--only updates existing masters only; no master row for ${scopedInserts.join(', ')}`;
    if (apply) throw new Error(`${message}: stopped before any write`);
    logger.warn(
      'backfill.scoped_insert',
      `DRY-RUN: ${message}; an --apply would stop before any write`,
      {
        modelKeys: scopedInserts,
      }
    );
  }

  const planned = seedWrites.length + masterWrites.length;
  const plannedKeys = [
    ...seedWrites.map(w => w.device.model_key),
    ...masterWrites.map(w => (w.kind === 'canonical-update' ? w.modelKey : w.id)),
  ];
  logger.info(
    'backfill.plan',
    `Plan [mode=${apply ? 'APPLY' : 'DRY-RUN'}${scoped ? ', scoped' : ''}]: ${planned} master(s) to update or insert (${seedWrites.filter(w => w.kind === 'seed-insert').length} insert(s))${expect !== undefined ? `, expected ${expect}` : ''}`,
    { apply, scoped, planned, expect, ...(scoped ? { modelKeys: plannedKeys } : {}) }
  );
  if (expect !== undefined && planned !== expect) {
    if (apply) {
      throw new Error(
        `--expect ${expect} does not match the plan of ${planned} master(s) (${plannedKeys.join(', ') || 'none'}): stopped before any write`
      );
    }
    logger.warn(
      'backfill.expect_mismatch',
      `DRY-RUN: the plan holds ${planned} master(s), not the expected ${expect}; an --apply with this --expect would stop before any write`,
      { planned, expect }
    );
  }

  // Write.
  let catalogUpdated = 0;
  let catalogInserted = 0;
  for (const w of seedWrites) {
    if (w.kind === 'seed-update') {
      const { device } = w;
      if (apply) {
        const { error: upErr } = await supabase
          .from('master_products')
          .update(w.payload)
          .eq('id', w.id);
        if (upErr) {
          throw new Error(`Failed to update specs of ${device.name}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
      if (w.changes) {
        logDiff(
          `[Catalog Specs] ${device.model_key}: ${apply ? 'changed' : 'would change'}`,
          device.model_key,
          w.changes
        );
      }
      logger.info(
        'backfill.catalog_updated',
        `[Catalog Specs] ${device.name} (${device.model_key}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
        { modelKey: device.model_key, apply }
      );
    } else {
      const { device } = w;
      if (apply) {
        const { error: insErr } = await supabase.from('master_products').insert(w.payload);
        if (insErr) {
          throw new Error(`Failed to insert catalog device ${device.name}: ${insErr.message}`);
        }
      }
      catalogInserted++;
      if (w.changes) {
        logDiff(
          `[Catalog Draft] ${device.model_key}: ${apply ? 'inserted' : 'would insert'}`,
          device.model_key,
          w.changes
        );
      }
      logger.info(
        'backfill.catalog_inserted',
        `[Catalog Draft] ${device.name} (${device.model_key}): ${apply ? 'INSERTED as draft' : 'DRY-RUN WOULD INSERT'}`,
        { modelKey: device.model_key, apply }
      );
    }
  }

  // Item-level specs from the seeds, once Items exist (RATE_ITEM_MODEL on, DOS/Rate#1152).
  // A scoped run writes masters only: an Item row spans variants outside the scope.
  let itemsUpdated = 0;
  if (scoped) {
    logger.info('backfill.items_skipped', 'Scoped run (--only): rate.items rows are not touched');
  } else {
    itemsUpdated = (await syncItemSeedSpecs(supabase, { apply })).updated;
  }

  for (const w of masterWrites) {
    if (w.kind === 'canonical-update') {
      if (apply) {
        const { error: upErr } = await supabase
          .from('master_products')
          .update(w.payload)
          .eq('id', w.id);

        if (upErr) {
          throw new Error(`Failed to backfill ${w.name}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
      logger.info(
        'backfill.canonical_updated',
        `[Canonical Specs] ${w.name} (${w.modelKey}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
        { modelKey: w.modelKey, apply }
      );
    } else {
      const ok = await matcher.enrichMasterProductById(w.id);
      if (ok) {
        catalogUpdated++;
      } else {
        skipped++;
      }
      logger.info(
        'backfill.ai_enriched',
        `[AI Enrich] ${w.name} (${w.id}): ${ok ? 'UPDATED' : 'SKIPPED'}`,
        { masterId: w.id, updated: ok }
      );
    }
  }

  const totalAudited = await auditMasterSpecs(supabase);
  logger.info(
    'backfill.completed',
    `SPEC CATALOG SYNC COMPLETE [mode=${apply ? 'APPLY' : 'DRY-RUN'}]: ${catalogUpdated} updated, ${catalogInserted} inserted as draft, ${skipped} skipped; ${totalAudited}/${totalAudited} master products verified with 10/10 Field Groups.`,
    { apply, catalogUpdated, catalogInserted, itemsUpdated, skipped, totalAudited }
  );

  return {
    apply,
    planned,
    catalogUpdated,
    catalogInserted,
    itemsUpdated,
    skipped,
    totalAudited,
  };
}

export async function runQuickSpecSyncAndAudit(
  options: BackfillSpecsOptions = {}
): Promise<number> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  const apply = options.apply === true;
  const { createClient } = await import('@supabase/supabase-js');
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!rawSupabaseUrl?.trim() || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  }
  const { url: supabaseUrl } = resolveBackfillSupabaseTarget(rawSupabaseUrl);
  const supabase = scopeSupabaseToRate(
    createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  );

  if (apply) {
    for (const seed of FLAGSHIP_DEVICES_TO_SEED) {
      const { data: existingRow, error: lookupErr } = await supabase
        .from('master_products')
        .select('id, key_specs, specifications')
        .eq('model_key', seed.model_key)
        .maybeSingle();
      if (lookupErr) {
        throw new Error(`Failed to look up master product ${seed.model_key}: ${lookupErr.message}`);
      }
      const { error: upErr } = await supabase
        .from('master_products')
        .update({
          ...seedMasterSpecUpdate(
            existingRow as { specifications?: unknown; key_specs?: unknown } | null,
            seed
          ),
          updated_at: new Date().toISOString(),
        })
        .eq('model_key', seed.model_key);
      if (upErr) {
        throw new Error(`Failed to sync specs of ${seed.model_key}: ${upErr.message}`);
      }
    }
  }

  const total = await auditMasterSpecs(supabase);
  logger.info(
    'backfill.audit_passed',
    `SPEC CLOUD AUDIT PASSED [mode=${apply ? 'APPLY' : 'AUDIT-ONLY'}]: ${total}/${total} master products on Supabase Cloud verified with 10/10 Field Groups (main + second camera).`,
    { apply, totalAudited: total }
  );
  return total;
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
    .then((): Promise<unknown> => {
      const args = parseBackfillSpecsArgs(process.argv.slice(2));
      return args.auditOnly
        ? runQuickSpecSyncAndAudit({ apply: args.apply })
        : runMasterSpecsBackfill({
            apply: args.apply,
            ...(args.only !== undefined ? { only: args.only } : {}),
            ...(args.expect !== undefined ? { expect: args.expect } : {}),
          });
    })
    .catch((err: unknown) => {
      logger.error(
        'backfill.fatal',
        `Spec backfill/audit execution failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    });
}
