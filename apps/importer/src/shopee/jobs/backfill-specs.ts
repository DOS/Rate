/**
 * Dedicated Spec-Only Catalog Backfill & Cloud Spec Audit Job (Audit T2)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts              (Dry-run + audit, zero DB writes)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --apply      (Apply spec updates to rate.master_products)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts --audit-only (Read-only 10-Field-Group audit)
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
}

export interface BackfillSpecsResult {
  readonly apply: boolean;
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
    if (!row.specifications?.camera?.second_camera?.trim()) {
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

/**
 * Spec-only catalog sync for `rate.master_products`.
 * Defaults to dry-run (`apply = false`) unless explicitly invoked with `{ apply: true }`.
 */
export async function runMasterSpecsBackfill(
  options: BackfillSpecsOptions = {}
): Promise<BackfillSpecsResult> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  const apply = options.apply === true;
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
    `Running Spec-Only Catalog Sync for rate.master_products [mode=${apply ? 'APPLY' : 'DRY-RUN'}]`,
    {
      mode: apply ? 'APPLY' : 'DRY-RUN',
      provider: aiInfo.provider,
      model: aiInfo.model,
      configured: aiInfo.configured,
    }
  );

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

  const catalogModelKeys = new Set<string>();
  let catalogUpdated = 0;
  let catalogInserted = 0;

  for (const device of FLAGSHIP_DEVICES_TO_SEED) {
    catalogModelKeys.add(device.model_key);
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
      .select(
        'id, key_specs, specifications, variant_name, description, ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g, colors'
      )
      .eq('model_key', device.model_key)
      .maybeSingle();
    if (lookupErr) {
      throw new Error(`Failed to look up master product ${device.model_key}: ${lookupErr.message}`);
    }

    if (existing) {
      if (apply) {
        const { error: upErr } = await supabase
          .from('master_products')
          .update({
            ...specFields,
            ...seedMasterSpecUpdate(
              existing as { specifications?: unknown; key_specs?: unknown },
              device
            ),
            ...(categoryId ? { category_id: categoryId } : {}),
          })
          .eq('id', existing.id);
        if (upErr) {
          throw new Error(`Failed to update specs of ${device.name}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
      // A replaced seed shows exactly what it changes, so a dry-run can be checked against
      // the expected diff before an apply (DOS/Rate#1459).
      if (device.retract_spec_fields) {
        logger.info(
          'backfill.catalog_diff',
          `[Catalog Specs] ${device.model_key}: ${apply ? 'changed' : 'would change'}`,
          {
            modelKey: device.model_key,
            changes: specUpdateChanges(
              existing as Record<string, unknown>,
              seedMasterSpecUpdate(
                existing as { specifications?: unknown; key_specs?: unknown },
                device
              )
            ),
          }
        );
      }
      logger.info(
        'backfill.catalog_updated',
        `[Catalog Specs] ${device.name} (${device.model_key}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
        { modelKey: device.model_key, apply }
      );
    } else {
      if (apply) {
        const { error: insErr } = await supabase.from('master_products').insert({
          ...specFields,
          specifications: mergeProductSpecifications(
            undefined,
            device.specifications,
            device.colors
          ),
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
        });
        if (insErr) {
          throw new Error(`Failed to insert catalog device ${device.name}: ${insErr.message}`);
        }
      }
      catalogInserted++;
      logger.info(
        'backfill.catalog_inserted',
        `[Catalog Draft] ${device.name} (${device.model_key}): ${apply ? 'INSERTED as draft' : 'DRY-RUN WOULD INSERT'}`,
        { modelKey: device.model_key, apply }
      );
    }
  }

  // Item-level specs from the seeds, once Items exist (RATE_ITEM_MODEL on, DOS/Rate#1152).
  const itemsUpdated = (await syncItemSeedSpecs(supabase, { apply })).updated;

  const masters = await fetchAllPages('Failed to fetch master_products', (from, to) =>
    supabase
      .from('master_products')
      .select('id, name, model_key, key_specs, specifications')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

  let skipped = 0;
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
        ? stripKeySpecControlChars(m.name).replace(/\s+/g, ' ').trim().slice(0, 200) || '(unnamed)'
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
      if (apply) {
        const { error: upErr } = await supabase
          .from('master_products')
          .update({
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
          })
          .eq('id', safeMasterId);

        if (upErr) {
          throw new Error(`Failed to backfill ${safeName}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
      logger.info(
        'backfill.canonical_updated',
        `[Canonical Specs] ${safeName} (${safeModelKey}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
        { modelKey: safeModelKey, apply }
      );
    } else if (apply && enricher.isConfigured()) {
      const ok = await matcher.enrichMasterProductById(safeMasterId);
      if (ok) {
        catalogUpdated++;
      } else {
        skipped++;
      }
      logger.info(
        'backfill.ai_enriched',
        `[AI Enrich] ${safeName} (${safeMasterId}): ${ok ? 'UPDATED' : 'SKIPPED'}`,
        { masterId: safeMasterId, updated: ok }
      );
    } else {
      skipped++;
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
  const applyFlag = process.argv.includes('--apply');
  const auditOnlyFlag = process.argv.includes('--audit-only');
  (auditOnlyFlag
    ? runQuickSpecSyncAndAudit({ apply: applyFlag })
    : runMasterSpecsBackfill({ apply: applyFlag })
  ).catch((err: unknown) => {
    logger.error(
      'backfill.fatal',
      `Spec backfill/audit execution failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
