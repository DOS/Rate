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
import { fetchAllPages } from '../paging.js';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
} from '../flagship-seed-data.js';
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
  readonly skipped: number;
  readonly totalAudited: number;
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
    const label = `${row.name} (${row.model_key})`;
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
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code > 0x1f && code !== 0x7f) {
      out += input[i];
    } else {
      out += ' ';
    }
  }
  return out;
}

function sanitizeKeySpecKey(key: string): string | null {
  const cleaned = stripKeySpecControlChars(key).replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_KEY_SPEC_KEY_LENGTH || UNSAFE_KEY_SPEC_KEYS.has(cleaned)) {
    return null;
  }
  return cleaned;
}

function sanitizeKeySpecValue(value: unknown, depth = 0): unknown {
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
    return value
      .slice(0, 50)
      .map(item => sanitizeKeySpecValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    const objOut: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = sanitizeKeySpecKey(k);
      if (!safeKey) continue;
      if (count >= MAX_KEY_SPEC_OBJECT_KEYS && !Object.hasOwn(objOut, safeKey)) continue;
      const sanitized = sanitizeKeySpecValue(v, depth + 1);
      if (sanitized !== undefined) {
        if (!Object.hasOwn(objOut, safeKey)) count += 1;
        objOut[safeKey] = sanitized;
      }
    }
    return objOut;
  }
  return undefined;
}

export function mergeKeySpecs(
  existing: unknown,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const next = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const source of [base, next]) {
    for (const [k, v] of Object.entries(source)) {
      const safeKey = sanitizeKeySpecKey(k);
      if (!safeKey) continue;
      if (count >= MAX_KEY_SPEC_OBJECT_KEYS && !Object.hasOwn(out, safeKey)) continue;
      const sanitized = sanitizeKeySpecValue(v, 0);
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
  const apply = options.apply === true;
  const { createClient } = await import('@supabase/supabase-js');
  const { EntityMatcher } = await import('../entity-matcher.js');

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

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
    categoryIdBySlug.set(c.slug, c.id);
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
      .select('id, key_specs, specifications')
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
            specifications: mergeProductSpecifications(
              (existing as { specifications?: unknown }).specifications,
              device.specifications,
              device.colors
            ),
            key_specs: mergeKeySpecs(
              (existing as { key_specs?: unknown }).key_specs,
              device.key_specs as unknown as Record<string, unknown>
            ),
            ...(categoryId ? { category_id: categoryId } : {}),
          })
          .eq('id', existing.id);
        if (upErr) {
          throw new Error(`Failed to update specs of ${device.name}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
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
    if (catalogModelKeys.has(m.model_key)) continue;

    const canonicalEntry = Object.hasOwn(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY, m.model_key)
      ? CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY[m.model_key]
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
          .eq('id', m.id);

        if (upErr) {
          throw new Error(`Failed to backfill ${m.name}: ${upErr.message}`);
        }
      }
      catalogUpdated++;
      logger.info(
        'backfill.canonical_updated',
        `[Canonical Specs] ${m.name} (${m.model_key}): ${apply ? 'UPDATED' : 'DRY-RUN WOULD UPDATE'}`,
        { modelKey: m.model_key, apply }
      );
    } else if (apply && enricher.isConfigured()) {
      const ok = await matcher.enrichMasterProductById(m.id);
      if (ok) {
        catalogUpdated++;
      } else {
        skipped++;
      }
      logger.info(
        'backfill.ai_enriched',
        `[AI Enrich] ${m.name} (${m.id}): ${ok ? 'UPDATED' : 'SKIPPED'}`,
        { masterId: m.id, updated: ok }
      );
    } else {
      skipped++;
    }
  }

  const totalAudited = await auditMasterSpecs(supabase);
  logger.info(
    'backfill.completed',
    `SPEC CATALOG SYNC COMPLETE [mode=${apply ? 'APPLY' : 'DRY-RUN'}]: ${catalogUpdated} updated, ${catalogInserted} inserted as draft, ${skipped} skipped; ${totalAudited}/${totalAudited} master products verified with 10/10 Field Groups.`,
    { apply, catalogUpdated, catalogInserted, skipped, totalAudited }
  );

  return {
    apply,
    catalogUpdated,
    catalogInserted,
    skipped,
    totalAudited,
  };
}

export async function runQuickSpecSyncAndAudit(
  options: BackfillSpecsOptions = {}
): Promise<number> {
  const apply = options.apply === true;
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
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
          specifications: mergeProductSpecifications(
            (existingRow as { specifications?: unknown } | null)?.specifications,
            seed.specifications,
            seed.colors
          ),
          key_specs: mergeKeySpecs(
            (existingRow as { key_specs?: unknown } | null)?.key_specs,
            seed.key_specs as unknown as Record<string, unknown>
          ),
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
