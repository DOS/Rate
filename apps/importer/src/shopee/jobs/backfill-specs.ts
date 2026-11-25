/**
 * Dedicated Spec-Only Catalog Backfill & Cloud Spec Audit Job (Audit T2)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts              (Dry-run + audit, zero DB writes)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --apply      (Apply spec updates to rate.master_products)
 *   An unscoped run updates masters only: a seed with no master row is skipped with a
 *   warning, never inserted. A new seed goes in through the scoped insert below
 *   (DOS/Rate#1739).
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --audit-only (Read-only Field Group audit)
 *
 * Scoped run (DOS/Rate#1464), for an approved fix of named masters only:
 *   ... backfill-specs.ts --only <model_key,...>                  (Dry-run: per-row field diff + planned count)
 *   ... backfill-specs.ts --only <model_key,...> --apply --expect <n>
 *   --only <keys>  Plans and writes only these model_keys: each is a seed or a canonical
 *                  entry (CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY, DOS/Rate#1804). No other seed
 *                  or canonical master is inserted or updated, no AI master and no rate.items
 *                  row is touched. A key that is neither fails before any database read. A
 *                  canonical key is planned, diffed and counted like a seed, and is never
 *                  inserted: with no master row it stops an --apply (even with
 *                  --insert-missing) before any write.
 *   --expect <n>   With --apply, stops before the first write unless the plan updates or
 *                  inserts exactly n masters. A dry run logs whether the plan matches.
 *   --expect-inserts <n>  Optional, like --expect for the inserts alone, so a row that appears
 *                  between the dry run and the apply cannot pass as an update (DOS/Rate#1739).
 *   A scoped run only updates existing masters: a named key with no master row stops an
 *   --apply before any write (a dry run warns). Any unknown argument, `--flag=value` or a
 *   repeated flag fails. None of --apply, --only, --expect, --expect-inserts or
 *   --insert-missing combines with --audit-only. The read-only catalog
 *   audit still runs at the end over the whole catalog, but only a master the run names can
 *   fail it: an unrelated master's failure is logged as a warning (DOS/Rate#1910). The
 *   unscoped run and --audit-only still fail on any master.
 *
 * Scoped insert (DOS/Rate#1737), for an approved new seed (a model with no master yet):
 *   ... backfill-specs.ts --only <model_key,...> --insert-missing                (Dry-run)
 *   ... backfill-specs.ts --only <model_key,...> --insert-missing --apply --expect <n> --expect-inserts <i>
 *   --insert-missing  A named key with no master row is inserted as a draft master instead of
 *                     stopping the run; named keys that have a row are updated as usual. It
 *                     needs --only, and with --apply also --expect, so the plan (inserts plus
 *                     updates) is checked before the first write. A seed slug held by
 *                     another master stops the run before any write. The job writes no
 *                     rate.items row (a database master trigger may create a draft Item where
 *                     the Item model is deployed), and the draft master stays unpublished
 *                     until someone publishes it.
 *
 * Safety invariant:
 * - Dry-run by default (`apply = false`): never mutates `rate.master_products` unless `--apply` is passed.
 * - Inserts a master only for a seed named with `--only ... --insert-missing` (DOS/Rate#1739).
 * - Never writes listings (`rate.products`), merchants, reviews, price_history, or fabricated scores.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { ProductSpecificationsSchema, type ProductSpecifications } from '@repo/shared-data';
import { getCategorySpecTemplate, RATING_DEVICE_CATEGORIES } from '@repo/shared-data/rules';
import { AiSpecEnricher, mergeProductSpecifications } from '../ai-spec-enricher.js';
import { fetchByKey, resolveBackfillSupabaseTarget } from '../paging.js';
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

/**
 * The spec groups a master must carry: all 10, less the groups its category's spec template
 * removes (a watch has no camera; earbuds have no display, camera or cellular). The importer
 * stores a new master through that template, so an auto-created watch or earbuds master
 * never has those groups and would fail an audit of all 10 (DOS/Rate#1792). A category the
 * templates do not know, or none, keeps all 10.
 */
export function requiredSpecGroups(
  categorySlug: unknown
): ReadonlyArray<(typeof REQUIRED_10_SPEC_GROUPS)[number]> {
  const { groups } = getCategorySpecTemplate(
    typeof categorySlug === 'string' ? categorySlug : undefined
  );
  return REQUIRED_10_SPEC_GROUPS.filter(group => groups.includes(group));
}

const DEVICE_AUDIT_CATEGORIES: ReadonlySet<string> = new Set(RATING_DEVICE_CATEGORIES);

/**
 * The spec groups the catalog audit requires of a master (DOS/Rate#1910). A device category
 * (`RATING_DEVICE_CATEGORIES`: phones, tablets, laptops, watches, earbuds) keeps
 * `requiredSpecGroups`, and so does a master with no category or one the spec templates do
 * not know (all 10, as before). A category with a template of its own that is not a device
 * (TVs, home appliances, bank savings, internet plans, places, ...) requires none: its
 * catalog is not built from device spec sheets, so its template lists the groups its page
 * may show, not groups every master must carry. Such a master still goes through the schema
 * and camera checks. A new device category must join `RATING_DEVICE_CATEGORIES`, or its
 * masters are not held to any group: spec-audit-categories-1910.test.ts fails on a template
 * category that is neither a device nor a known non-device.
 */
export function auditedSpecGroups(
  categorySlug: unknown
): ReadonlyArray<(typeof REQUIRED_10_SPEC_GROUPS)[number]> {
  const slug = typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';
  if (DEVICE_AUDIT_CATEGORIES.has(slug)) return requiredSpecGroups(slug);
  const hasOwnTemplate = getCategorySpecTemplate(slug) !== getCategorySpecTemplate(undefined);
  return hasOwnTemplate ? [] : requiredSpecGroups(slug);
}

export interface BackfillSpecsOptions {
  readonly apply?: boolean;
  /**
   * `--only`: the seed or canonical `model_key`s to update. Nothing else is inserted or
   * updated: no other seed or canonical master, no AI master, no `rate.items` row. A key
   * that is neither a seed nor a canonical entry is an error before any read; a key with no
   * master row stops an apply before any write (a canonical key even with `insertMissing`).
   */
  readonly only?: readonly string[];
  /**
   * `--expect`: the number of masters the plan must update or insert. With `apply`, a plan
   * of any other size stops before the first write; a dry run only reports the comparison.
   */
  readonly expect?: number;
  /**
   * `--expect-inserts`: the number of masters the plan must insert, checked like `expect`.
   * Optional; it tells an insert from an update, which `expect` alone does not.
   */
  readonly expectInserts?: number;
  /**
   * `--insert-missing` (with `only`): a named key with no master row is inserted as a draft
   * instead of stopping the run. With `apply`, `expect` is required.
   */
  readonly insertMissing?: boolean;
}

export interface BackfillSpecsResult {
  readonly apply: boolean;
  /** Masters the plan updates or inserts (seeds, canonical entries, AI candidates). */
  readonly planned: number;
  readonly catalogUpdated: number;
  readonly catalogInserted: number;
  /** Seeds with no master row that an unscoped run left out (it never inserts). */
  readonly insertsSkipped: number;
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
 * name and value columns. Ensures no seed update keeps a retracted value.
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
 * Whether `camera.rear_setup` declares a single rear camera ("Single Camera", the label the
 * normalizer gives a one-camera benchmark model) and no third or fourth camera contradicts
 * it. Such a device has no second camera to audit: the iPhone 16e has one camera on the
 * back (DOS/Rate#1718).
 */
export function hasSingleRearCamera(
  camera:
    { rear_setup?: unknown; third_camera?: unknown; fourth_camera?: unknown } | null | undefined
): boolean {
  const setup = camera?.rear_setup;
  if (typeof setup !== 'string' || !/^\s*single\b/i.test(setup)) return false;
  const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return !filled(camera?.third_camera) && !filled(camera?.fourth_camera);
}

/**
 * Whether the camera group states any rear camera (a rear setup label, or a main, second,
 * third or fourth camera). A group that states none (a watch or earbuds, a laptop with
 * only its webcam, a listing no source describes) has no rear camera to audit: the
 * importer writes no guessed camera (DOS/Rate#1787).
 */
export function statesRearCamera(
  camera:
    | {
        rear_setup?: unknown;
        main_camera?: unknown;
        second_camera?: unknown;
        third_camera?: unknown;
        fourth_camera?: unknown;
      }
    | null
    | undefined
): boolean {
  const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return (
    filled(camera?.rear_setup) ||
    filled(camera?.main_camera) ||
    filled(camera?.second_camera) ||
    filled(camera?.third_camera) ||
    filled(camera?.fourth_camera)
  );
}

/**
 * Spec-only audit: every master product must carry the Field Groups its category requires
 * (`auditedSpecGroups`: all 10 for a device, less the ones its category does not have; none
 * for a non-device category). A master whose
 * camera group states a rear camera must carry the main camera, plus a second camera
 * unless `camera.rear_setup` declares a single rear camera.
 * Deliberately asserts nothing about offers, reviews or ratings.
 *
 * `scope` (a scoped `--only` run, DOS/Rate#1910): the whole catalog is still read and
 * checked, but only a master whose model_key is in `scope` fails the audit; the others'
 * failures are logged as a warning. A scoped run is the gate for the masters it names, and an
 * unrelated master (often another line's catalog) must not fail an approved fix; the
 * unscoped run and `--audit-only` still fail on any master.
 */
export async function auditMasterSpecs(
  supabase: RateSupabaseClient,
  options: { readonly scope?: Iterable<string> } = {}
): Promise<number> {
  const scope =
    options && options.scope !== undefined
      ? new Set([...options.scope].map(k => (typeof k === 'string' ? k.trim() : '')))
      : undefined;
  // Paged by keyset: an unpaged read stops at PostgREST's 1000-row cap, and OFFSET
  // would skip or duplicate rows under concurrent crawl writes.
  const rows = await fetchByKey<{
    id: string;
    name: string;
    model_key: string;
    specifications?: ProductSpecifications | null;
  }>(supabase, 'master_products', 'id, name, model_key, specifications', 'id');

  const failures: string[] = [];
  const outOfScopeFailures: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const inScope =
      scope === undefined || (typeof row.model_key === 'string' && scope.has(row.model_key.trim()));
    const rowFailures = inScope ? failures : outOfScopeFailures;
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
      rowFailures.push(`${label} failed ProductSpecificationsSchema validation`);
    }
    for (const grp of auditedSpecGroups(row.specifications?.category_slug)) {
      if (!row.specifications?.[grp]) {
        rowFailures.push(`${label} is missing specification group "${grp}"`);
      }
    }
    const camera = row.specifications?.camera;
    if (statesRearCamera(camera)) {
      if (!camera?.main_camera?.trim()) {
        rowFailures.push(`${label} is missing camera.main_camera`);
      }
      if (!hasSingleRearCamera(camera) && !camera?.second_camera?.trim()) {
        rowFailures.push(`${label} is missing camera.second_camera`);
      }
    }
  }

  if (outOfScopeFailures.length > 0) {
    logger.warn(
      'backfill.audit_out_of_scope',
      `Spec audit: ${outOfScopeFailures.length} failure(s) on masters outside this scoped run (not failing it; the unscoped audit still does):\n  - ${outOfScopeFailures.join('\n  - ')}`,
      { outOfScopeFailures: outOfScopeFailures.length }
    );
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
  readonly expectInserts?: number;
  readonly insertMissing?: boolean;
}

/** Parses the job's flags; throws on a malformed `--only`, `--expect` or `--expect-inserts`. */
export function parseBackfillSpecsArgs(argv: readonly string[]): BackfillSpecsArgs {
  // Strict: an argument this job does not know (a typo, `--only=keys`) or a repeated flag
  // fails, so it can never turn a scoped run into a full one.
  let apply = false;
  let auditOnly = false;
  let onlyRaw: string | undefined;
  let expectRaw: string | undefined;
  let expectInsertsRaw: string | undefined;
  let insertMissing = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--insert-missing') {
      if (insertMissing) throw new Error(`${arg} is repeated`);
      insertMissing = true;
      continue;
    }
    if (arg === '--apply' || arg === '--audit-only') {
      if ((arg === '--apply' ? apply : auditOnly) === true) throw new Error(`${arg} is repeated`);
      if (arg === '--apply') apply = true;
      else auditOnly = true;
      continue;
    }
    if (arg === '--only' || arg === '--expect' || arg === '--expect-inserts') {
      const seen = arg === '--only' ? onlyRaw : arg === '--expect' ? expectRaw : expectInsertsRaw;
      if (seen !== undefined) {
        throw new Error(`${arg} is repeated`);
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      if (arg === '--only') onlyRaw = next;
      else if (arg === '--expect') expectRaw = next;
      else expectInsertsRaw = next;
      i++;
      continue;
    }
    throw new Error(
      `unknown argument ${JSON.stringify(arg)}: this job takes --apply, --audit-only, --only <model_key,...>, --expect <n>, --expect-inserts <n> and --insert-missing`
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
  let expectInserts: number | undefined;
  if (expectInsertsRaw !== undefined) {
    if (!/^\d+$/.test(expectInsertsRaw.trim())) {
      throw new Error(
        `--expect-inserts takes a whole number of masters, got "${expectInsertsRaw}"`
      );
    }
    expectInserts = Number(expectInsertsRaw.trim());
  }
  if (auditOnly && apply) {
    throw new Error('--apply does not combine with --audit-only');
  }
  if (auditOnly && (only !== undefined || expect !== undefined || expectInserts !== undefined)) {
    throw new Error('--only, --expect and --expect-inserts do not combine with --audit-only');
  }
  if (insertMissing) {
    if (auditOnly) throw new Error('--insert-missing does not combine with --audit-only');
    if (only === undefined) throw new Error('--insert-missing needs --only');
    if (apply && expect === undefined) {
      throw new Error('--insert-missing --apply needs --expect');
    }
  }
  return {
    apply,
    auditOnly,
    ...(only !== undefined ? { only } : {}),
    ...(expect !== undefined ? { expect } : {}),
    ...(expectInserts !== undefined ? { expectInserts } : {}),
    ...(insertMissing ? { insertMissing } : {}),
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

type CanonicalBackfillEntry = (typeof CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY)[string];

/**
 * The masters a backfill `--only` list names: the seeds, in seed order, and the canonical
 * entries (`CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY`), in list order (DOS/Rate#1804). A key
 * that is both stays a seed, as in an unscoped run. Throws, naming them, on keys that are
 * neither, so a typo never turns a scoped run into a smaller one.
 */
export function selectOnlyScope(
  only: readonly string[],
  seeds: readonly FlagshipDeviceSeed[] = FLAGSHIP_DEVICES_TO_SEED,
  canonical: Readonly<
    Record<string, CanonicalBackfillEntry>
  > = CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY
): { seeds: FlagshipDeviceSeed[]; canonicalKeys: string[] } {
  if (!Array.isArray(only) || only.length === 0) {
    throw new Error('--only needs at least one model_key');
  }
  const wanted = new Set(only.map(k => (typeof k === 'string' ? k.trim() : '')));
  const seedKeys = new Set(seeds.map(s => s.model_key));
  const isCanonical = (k: string) => Object.hasOwn(canonical, k);
  const unknown = [...wanted].filter(k => !k || (!seedKeys.has(k) && !isCanonical(k)));
  if (unknown.length > 0) {
    throw new Error(
      `--only names ${unknown.length} key(s) with no seed and no canonical entry: ${unknown.map(k => JSON.stringify(k)).join(', ')}`
    );
  }
  return {
    seeds: seeds.filter(s => wanted.has(s.model_key)),
    canonicalKeys: [...wanted].filter(k => !seedKeys.has(k)),
  };
}

/**
 * The columns a canonical entry writes onto its existing master: its value columns, and its
 * specs and key specs merged into the stored ones. No timestamp. Shared by the unscoped run
 * and a scoped `--only` run, so both write the same thing.
 */
export function canonicalMasterUpdate(
  existing: { specifications?: unknown; key_specs?: unknown } | null | undefined,
  entry: CanonicalBackfillEntry
): Record<string, unknown> {
  return {
    ram_gb: entry.ram_gb,
    storage_gb: entry.storage_gb,
    screen_size_inch: entry.screen_size_inch,
    battery_mah: entry.battery_mah,
    has_5g: entry.has_5g,
    colors: entry.colors,
    specifications: mergeProductSpecifications(
      existing?.specifications,
      entry.specifications,
      entry.colors
    ),
    key_specs: mergeKeySpecs(
      existing?.key_specs,
      entry.key_specs as unknown as Record<string, unknown>
    ),
  };
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
      /** The field diff, for a canonical key named in a scoped run (DOS/Rate#1804). */
      changes?: string[];
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
  if (options.only !== undefined) selectOnlyScope(options.only);
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
  const scope = scoped ? selectOnlyScope(options.only!, allSeeds) : undefined;
  const seeds = scope ? scope.seeds : allSeeds;
  const expect = options.expect;
  if (expect !== undefined && (!Number.isInteger(expect) || expect < 0)) {
    throw new Error(`expect must be a whole number of masters, got ${String(expect)}`);
  }
  const expectInserts = options.expectInserts;
  if (expectInserts !== undefined && (!Number.isInteger(expectInserts) || expectInserts < 0)) {
    throw new Error(
      `expectInserts must be a whole number of masters, got ${String(expectInserts)}`
    );
  }
  // Checked again here (not only by the CLI parser), before any read.
  const insertMissing = options.insertMissing === true;
  if (insertMissing && !scoped) throw new Error('insertMissing needs only');
  if (insertMissing && apply && expect === undefined) {
    throw new Error('insertMissing with apply needs expect');
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
  // Seeds with no master row in an unscoped run: never inserted there (DOS/Rate#1739).
  const insertsSkippedKeys: string[] = [];
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
    } else if (!scoped) {
      // An unscoped run updates masters only: a new seed is inserted only when named,
      // with --only ... --insert-missing --apply --expect n (DOS/Rate#1739).
      insertsSkippedKeys.push(device.model_key);
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
      // A named insert (--insert-missing) checks the unique slug in the plan, so a clash
      // stops the run before the first write instead of after a partial insert.
      if (insertMissing) {
        const { data: slugOwner, error: slugErr } = await supabase
          .from('master_products')
          .select('id, model_key')
          .eq('slug', device.slug)
          .maybeSingle();
        if (slugErr) {
          throw new Error(`Failed to look up slug ${device.slug}: ${slugErr.message}`);
        }
        if (slugOwner) {
          const owner = String((slugOwner as { model_key?: unknown }).model_key ?? '');
          throw new Error(
            `--insert-missing: slug ${device.slug} already belongs to ${owner.slice(0, 160) || 'another master'}: stopped before any write`
          );
        }
      }
      seedWrites.push({
        kind: 'seed-insert',
        device,
        payload,
        ...(scoped ? { changes: specUpdateChanges(null, withoutTimestamp(payload)) } : {}),
      });
    }
  }

  // Canonical masters a scoped run names (DOS/Rate#1804): read by model_key, planned and
  // diffed like a seed. A canonical entry has no insert payload, so a missing row is never
  // inserted. No other canonical or AI master is read in a scoped run.
  const masterWrites: MasterWrite[] = [];
  const scopedCanonicalMissing: string[] = [];
  for (const modelKey of scope?.canonicalKeys ?? []) {
    const entry = CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY[modelKey]!;
    const { data: existing, error: lookupErr } = await supabase
      .from('master_products')
      .select(
        'id, name, key_specs, specifications, ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g, colors'
      )
      .eq('model_key', modelKey)
      .maybeSingle();
    if (lookupErr) {
      throw new Error(`Failed to look up master product ${modelKey}: ${lookupErr.message}`);
    }
    if (!existing) {
      scopedCanonicalMissing.push(modelKey);
      continue;
    }
    const row = existing as unknown as { id: unknown; name?: unknown } & Record<string, unknown>;
    // The update goes by id: an id the unscoped run would skip stops the plan instead.
    if (typeof row.id !== 'string' || !row.id.trim() || /\p{Cc}/u.test(row.id)) {
      throw new Error(`Master product ${modelKey} has no usable id: stopped before any write`);
    }
    const update = canonicalMasterUpdate(
      row as { specifications?: unknown; key_specs?: unknown },
      entry
    );
    masterWrites.push({
      kind: 'canonical-update',
      id: row.id,
      modelKey,
      name:
        typeof row.name === 'string'
          ? stripKeySpecControlChars(row.name).replace(/\s+/g, ' ').trim().slice(0, 200) ||
            '(unnamed)'
          : '(unnamed)',
      payload: { ...update, updated_at: new Date().toISOString() },
      changes: specUpdateChanges(row, update),
    });
  }

  // Unnamed canonical and AI masters: never in a scoped run.
  let skipped = 0;
  if (!scoped) {
    const masters = await fetchByKey<{
      id?: unknown;
      name?: unknown;
      model_key?: unknown;
      key_specs?: unknown;
      specifications?: unknown;
    }>(supabase, 'master_products', 'id, name, model_key, key_specs, specifications', 'id');

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
            ...canonicalMasterUpdate(
              m as { specifications?: unknown; key_specs?: unknown },
              canonicalEntry
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

  // A named canonical key with no master row: there is nothing to update and a canonical
  // entry is never inserted, so --expect alone must not hide it (DOS/Rate#1804).
  if (scopedCanonicalMissing.length > 0) {
    const message = `--only: no master row for canonical key(s) ${scopedCanonicalMissing.join(', ')}; a canonical entry is never inserted`;
    if (apply) throw new Error(`${message}: stopped before any write`);
    logger.warn(
      'backfill.scoped_canonical_missing',
      `DRY-RUN: ${message}; an --apply would stop before any write`,
      { modelKeys: scopedCanonicalMissing }
    );
  }

  // A scoped run fixes existing masters: a named key with no master row would insert a draft
  // (and through the master trigger possibly an Item), which --expect alone cannot catch.
  // Unless the run asks for the insert by name (--insert-missing, DOS/Rate#1737).
  const scopedInserts =
    scoped && !insertMissing
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

  if (insertsSkippedKeys.length > 0) {
    logger.warn(
      'backfill.unscoped_insert_skipped',
      `${insertsSkippedKeys.length} seed(s) with no master row left out: an unscoped run never inserts; use --only <keys> --insert-missing --apply --expect <n> --expect-inserts <i> (${insertsSkippedKeys.join(', ')})`,
      { modelKeys: insertsSkippedKeys }
    );
  }

  const planned = seedWrites.length + masterWrites.length;
  const plannedInserts = seedWrites.filter(w => w.kind === 'seed-insert').length;
  const plannedKeys = [
    ...seedWrites.map(w => w.device.model_key),
    ...masterWrites.map(w => (w.kind === 'canonical-update' ? w.modelKey : w.id)),
  ];
  logger.info(
    'backfill.plan',
    `Plan [mode=${apply ? 'APPLY' : 'DRY-RUN'}${scoped ? ', scoped' : ''}]: ${planned} master(s) to update or insert (${plannedInserts} insert(s))${expect !== undefined ? `, expected ${expect}` : ''}${expectInserts !== undefined ? `, expected inserts ${expectInserts}` : ''}`,
    {
      apply,
      scoped,
      planned,
      plannedInserts,
      expect,
      expectInserts,
      ...(scoped ? { modelKeys: plannedKeys } : {}),
    }
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
  if (expectInserts !== undefined && plannedInserts !== expectInserts) {
    const insertKeys = seedWrites
      .filter(w => w.kind === 'seed-insert')
      .map(w => w.device.model_key);
    if (apply) {
      throw new Error(
        `--expect-inserts ${expectInserts} does not match the plan of ${plannedInserts} insert(s) (${insertKeys.join(', ') || 'none'}): stopped before any write`
      );
    }
    logger.warn(
      'backfill.expect_inserts_mismatch',
      `DRY-RUN: the plan holds ${plannedInserts} insert(s), not the expected ${expectInserts}; an --apply with this --expect-inserts would stop before any write`,
      { plannedInserts, expectInserts }
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
    logger.info(
      'backfill.items_skipped',
      'Scoped run (--only): the job writes no rate.items row (a master trigger may still create a draft Item)'
    );
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
      if (w.changes) {
        logDiff(
          `[Canonical Specs] ${w.modelKey}: ${apply ? 'changed' : 'would change'}`,
          w.modelKey,
          w.changes
        );
      }
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

  // A scoped run fails only on the masters it names (DOS/Rate#1910).
  const totalAudited = await auditMasterSpecs(supabase, scoped ? { scope: options.only! } : {});
  logger.info(
    'backfill.completed',
    `SPEC CATALOG SYNC COMPLETE [mode=${apply ? 'APPLY' : 'DRY-RUN'}]: ${catalogUpdated} updated, ${catalogInserted} inserted as draft, ${insertsSkippedKeys.length} seed insert(s) left out, ${skipped} skipped; ${totalAudited} master products audited against their category's Field Groups${scoped ? ' (only the named masters can fail a scoped run)' : ''}.`,
    {
      apply,
      catalogUpdated,
      catalogInserted,
      insertsSkipped: insertsSkippedKeys.length,
      itemsUpdated,
      skipped,
      totalAudited,
    }
  );

  return {
    apply,
    planned,
    catalogUpdated,
    catalogInserted,
    insertsSkipped: insertsSkippedKeys.length,
    itemsUpdated,
    skipped,
    totalAudited,
  };
}

/**
 * Read-only quick spec audit (`--audit-only`). Fails closed before loading the Supabase
 * client if `apply` or any scoped/write flag is passed, including from delegating callers
 * such as `test-ai-enricher.ts --audit-only`.
 */
export async function runQuickSpecSyncAndAudit(
  options: BackfillSpecsOptions & { readonly auditOnly?: boolean } = {}
): Promise<number> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  if (options.apply) {
    throw new Error('--apply does not combine with --audit-only');
  }
  if (
    options.only !== undefined ||
    options.expect !== undefined ||
    options.expectInserts !== undefined
  ) {
    throw new Error('--only, --expect and --expect-inserts do not combine with --audit-only');
  }
  if (options.insertMissing) {
    throw new Error('--insert-missing does not combine with --audit-only');
  }
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

  const total = await auditMasterSpecs(supabase);
  logger.info(
    'backfill.audit_passed',
    `SPEC CLOUD AUDIT PASSED [mode=AUDIT-ONLY]: ${total}/${total} master products on Supabase Cloud verified with their category's Field Groups (devices: up to 10; main camera, and a second camera unless single-camera).`,
    { apply: false, totalAudited: total }
  );
  return total;
}

export interface BackfillSpecsCliRunners {
  readonly parseArgs?: (argv: readonly string[]) => BackfillSpecsArgs;
  readonly runQuickAudit?: (
    options: BackfillSpecsOptions & { readonly auditOnly?: boolean }
  ) => Promise<unknown>;
  readonly runBackfill?: (options: BackfillSpecsOptions) => Promise<unknown>;
}

/**
 * Parses CLI arguments and dispatches to the read-only quick audit (`--audit-only`) or the
 * master spec backfill. Fails closed if `auditOnly` and `apply` ever appear together.
 */
export async function runBackfillSpecsCli(
  argv: readonly string[],
  runners: BackfillSpecsCliRunners = {}
): Promise<unknown> {
  const parseArgs = runners.parseArgs ?? parseBackfillSpecsArgs;
  const args = parseArgs(argv);
  if (args.auditOnly) {
    if (args.apply) {
      throw new Error('--apply does not combine with --audit-only');
    }
    if (args.only !== undefined || args.expect !== undefined || args.expectInserts !== undefined) {
      throw new Error('--only, --expect and --expect-inserts do not combine with --audit-only');
    }
    if (args.insertMissing) {
      throw new Error('--insert-missing does not combine with --audit-only');
    }
    const runQuickAudit = runners.runQuickAudit ?? runQuickSpecSyncAndAudit;
    return runQuickAudit({ apply: false, auditOnly: true });
  }
  const runBackfill = runners.runBackfill ?? runMasterSpecsBackfill;
  return runBackfill({
    apply: args.apply,
    ...(args.only !== undefined ? { only: args.only } : {}),
    ...(args.expect !== undefined ? { expect: args.expect } : {}),
    ...(args.expectInserts !== undefined ? { expectInserts: args.expectInserts } : {}),
    ...(args.insertMissing ? { insertMissing: true } : {}),
  });
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  runBackfillSpecsCli(process.argv.slice(2)).catch((err: unknown) => {
    logger.error(
      'backfill.fatal',
      `Spec backfill/audit execution failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
