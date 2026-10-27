import crypto from 'node:crypto';
import {
  detectCategorySlug,
  type CanonicalCategorySlug,
  type NormalizedProductCandidate,
} from './product-normalizer.js';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { AiSpecEnricher, mergeProductSpecifications } from './ai-spec-enricher.js';
import { mergeKeySpecs } from './jobs/backfill-specs.js';
import { createImporterLogger } from './logger.js';
import type { RateSupabaseClient } from './types.js';

const logger = createImporterLogger('EntityMatcher');

const VALID_CATEGORY_SLUGS = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

/** Minimum pg_trgm similarity returned from RPC so ambiguous near-misses (0.65..0.69) can be flagged as draft */
export const ENTITY_MATCH_CANDIDATE_FLOOR = 0.65;
/** Minimum pg_trgm similarity required to auto-merge into an existing Master Product */
export const ENTITY_MATCH_ACCEPT_THRESHOLD = 0.7;

const MAX_RAM_GB = 2048;
const MAX_STORAGE_GB = 65536;
const MAX_SCREEN_SIZE_INCH = 120;
const MAX_BATTERY_MAH = 500_000;
export const MAX_ENTITY_IMAGES = 50;

const SENTINEL_MATCHER_ID_RE =
  /^(?:0+|null|undefined|nan|none|n\/a|unknown|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

function hasControlOrSpaceChar(val: string): boolean {
  return /[\p{Cc}\s]/u.test(val);
}

export function sanitizeMatcherEntityId(raw: unknown, maxLen = 128): string {
  const str =
    typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0
      ? String(raw)
      : typeof raw === 'string'
        ? raw
        : '';
  if (!str) return '';
  const trimmed = str.trim();
  if (
    !trimmed ||
    trimmed.length > maxLen ||
    hasControlOrSpaceChar(trimmed) ||
    !/[a-zA-Z0-9]/.test(trimmed) ||
    SENTINEL_MATCHER_ID_RE.test(trimmed)
  ) {
    return '';
  }
  return trimmed;
}

function isStrictBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    return lower === 'true' || lower === '1';
  }
  return false;
}

export function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || hasControlOrSpaceChar(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    if (
      parsed.hostname.startsWith('.') ||
      parsed.hostname.endsWith('.') ||
      parsed.hostname.includes('..')
    ) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function sanitizeHttpUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of urls) {
    if (out.length >= MAX_ENTITY_IMAGES) break;
    const valid = sanitizeHttpUrl(item);
    if (valid && !seen.has(valid)) {
      seen.add(valid);
      out.push(valid);
    }
  }
  return out;
}

export function toBoundedPositiveInt(value: unknown, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  let n: number;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[\s\p{Cc}]+/gu, '');
    if (!cleaned || /^0[xob]/i.test(cleaned)) return null;
    n = Number(cleaned);
  } else {
    n = value;
  }
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

export function toBoundedPositiveNumber(value: unknown, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  let n: number;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[\s\p{Cc}]+/gu, '');
    if (!cleaned || /^0[xob]/i.test(cleaned)) return null;
    n = Number(cleaned);
  } else {
    n = value;
  }
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

export class EntityMatcher {
  private enricher: AiSpecEnricher;

  constructor(
    private supabase: RateSupabaseClient,
    enricher?: AiSpecEnricher
  ) {
    this.enricher = enricher ?? new AiSpecEnricher();
  }

  /**
   * Resolves an existing canonical Master Product or creates a new one using 3-tier matching
   */
  public async resolveOrCreateMasterProduct(
    candidate: NormalizedProductCandidate,
    categoryId?: string,
    rawTitle?: string
  ): Promise<{ masterId: string; isNew: boolean }> {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('[EntityMatcher] candidate must be a non-null object');
    }
    const safeModelKey = String(candidate.model_key ?? '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .slice(0, 200);
    if (!safeModelKey) {
      throw new Error('[EntityMatcher] candidate.model_key must be a non-empty string');
    }
    const safeCategoryId = sanitizeMatcherEntityId(categoryId, 128) || undefined;
    const safeRawTitle =
      typeof rawTitle === 'string'
        ? rawTitle
            .replace(/\p{Cc}+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500)
        : undefined;
    candidate = { ...candidate, model_key: safeModelKey };

    // Tier 1: Deterministic model_key matching
    const { data: exactMatch, error: exactErr } = await this.supabase
      .from('master_products')
      .select('id, name, model_key')
      .eq('model_key', candidate.model_key)
      .maybeSingle();

    // Infra errors must abort ingestion (plan v7 §5.1): a failed lookup must
    // never fall through to Tier 3 and silently split the canonical cluster.
    if (exactErr) {
      throw new Error(`[EntityMatcher] Tier 1 exact lookup failed: ${exactErr.message}`);
    }

    if (exactMatch) {
      logger.info(
        'entity_match.tier1_exact',
        `Tier 1 Exact Match found: ${exactMatch.name} (${exactMatch.model_key}) -> ID: ${exactMatch.id}`,
        { masterId: exactMatch.id, modelKey: exactMatch.model_key }
      );
      return { masterId: exactMatch.id, isNew: false };
    }

    // Tier 2: Trigram Fuzzy Match using Postgres pg_trgm (strictly constrained by brand and model series)
    const { data: fuzzyMatches, error: fuzzyErr } = await this.supabase.rpc(
      'match_master_product',
      {
        search_title: candidate.name,
        p_brand: candidate.brand,
        p_model: candidate.model,
        p_storage_gb: candidate.storage_gb,
        p_similarity_threshold: ENTITY_MATCH_CANDIDATE_FLOOR,
      }
    );

    // Same rule for Tier 2: RPC/infra failure aborts; only a genuine
    // "no match above threshold" reaches Tier 3 (plan v7 §5.1).
    if (fuzzyErr) {
      throw new Error(`[EntityMatcher] Tier 2 fuzzy match failed: ${fuzzyErr.message}`);
    }
    let ambiguousFuzzy = false;
    const validFuzzyMatches = Array.isArray(fuzzyMatches)
      ? fuzzyMatches.filter(m => {
          if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
          const masterId = sanitizeMatcherEntityId(m.master_id, 128);
          if (!masterId) return false;
          const sim = typeof m.similarity === 'boolean' ? Number.NaN : Number(m.similarity);
          return Number.isFinite(sim) && sim >= ENTITY_MATCH_CANDIDATE_FLOOR && sim <= 1;
        })
      : [];
    if (validFuzzyMatches.length > 0) {
      const topMatch = validFuzzyMatches[0]!;
      const topMasterId = sanitizeMatcherEntityId(topMatch.master_id, 128);
      const topSim = Number(topMatch.similarity);
      if (topSim >= ENTITY_MATCH_ACCEPT_THRESHOLD) {
        logger.info(
          'entity_match.tier2_fuzzy',
          `Tier 2 Fuzzy Match found: "${candidate.name}" ~= "${topMatch.name}" (similarity: ${(topSim * 100).toFixed(1)}%) -> ID: ${topMasterId}`,
          {
            masterId: topMasterId,
            similarity: topSim,
            candidateName: candidate.name,
          }
        );
        return { masterId: topMasterId, isNew: false };
      }
      // Candidates exist but all below the accept threshold: identity is
      // uncertain -> seed as draft (plan v7 §5.1), never auto-publish.
      ambiguousFuzzy = true;
      logger.warn(
        'entity_match.tier2_ambiguous',
        `Tier 2 best similarity ${(topSim * 100).toFixed(1)}% < ${(ENTITY_MATCH_ACCEPT_THRESHOLD * 100).toFixed(0)}%: seeding as draft if new.`,
        { similarity: topSim, modelKey: candidate.model_key }
      );
    }

    // Tier 3: No existing master product matches -> Enrich with AI Spec Enricher (if not in local benchmark registry)
    // and seed a new Master Product.
    candidate = await this.enricher.enrichCandidate(candidate, safeRawTitle);

    // - Upsert on model_key (unique) so a concurrent crawler inserting the same
    //   canonical entity resolves instead of crashing (plan v7 §5.1 / Gemini B3).
    // - Low-confidence identities (unparseable storage, non-new condition,
    //   ambiguous trigram match, or unverified AI/heuristic specs) are seeded as
    //   'draft', never auto-published; the live status CHECK allows only
    //   draft/published/archived, so 'draft' is the needs-review state.
    const isUnverifiedSpec =
      candidate.spec_source === 'ai_unverified' ||
      candidate.spec_source === 'crawled_title' ||
      !candidate.is_benchmark_enriched;
    const seedStatus =
      candidate.needs_review || ambiguousFuzzy || isUnverifiedSpec ? 'draft' : 'published';
    logger.info(
      'entity_match.tier3_create_start',
      `Tier 3: Creating new canonical Master Product: ${candidate.name} (status: ${seedStatus}, spec_source: ${candidate.spec_source ?? 'unknown'})...`,
      {
        modelKey: candidate.model_key,
        seedStatus,
        specSource: candidate.spec_source ?? 'unknown',
      }
    );

    // Insert-only with ignoreDuplicates: the LOSING worker must refetch the
    // winner WITHOUT overwriting its canonical metadata or status (Codex
    // blocker: a re-asserting upsert could re-publish a draft/archived master).
    const safeImages = sanitizeHttpUrlList(candidate.images);
    const safeColors = Array.isArray(candidate.colors)
      ? candidate.colors
          .filter((c): c is string => typeof c === 'string')
          .map(c =>
            c
              .replace(/\p{Cc}+/gu, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80)
          )
          .filter(Boolean)
          .slice(0, 50)
      : [];
    const safeSlug =
      String(candidate.slug ?? '')
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .slice(0, 300) ||
      safeModelKey
        .replace(/[^a-z0-9-]+/gi, '-')
        .toLowerCase()
        .slice(0, 300);
    // Only the spec fields the category has: no screen or RAM on earbuds, no
    // 5G on a watch (DOS/Rate#1142).
    const baseInsertRow = applyCategorySpecTemplate(candidate.category_slug, {
      category_id: safeCategoryId || null,
      brand:
        String(candidate.brand ?? '')
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, 100) || 'Unknown',
      model:
        String(candidate.model ?? '')
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, 200) || 'Unknown',
      variant_name: candidate.variant_name
        ? String(candidate.variant_name)
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 200) || null
        : null,
      model_key:
        String(candidate.model_key ?? '')
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 200) || safeModelKey,
      name:
        String(candidate.name ?? '')
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, 300) || safeModelKey,
      slug: safeSlug,
      description:
        typeof candidate.description === 'string'
          ? candidate.description
              .replace(/\p{Cc}+/gu, ' ')
              .trim()
              .slice(0, 10_000)
          : '',
      ram_gb: toBoundedPositiveInt(candidate.ram_gb, MAX_RAM_GB),
      storage_gb: toBoundedPositiveInt(candidate.storage_gb, MAX_STORAGE_GB),
      screen_size_inch: toBoundedPositiveNumber(candidate.screen_size_inch, MAX_SCREEN_SIZE_INCH),
      battery_mah: toBoundedPositiveInt(candidate.battery_mah, MAX_BATTERY_MAH),
      has_5g: isStrictBoolean(candidate.has_5g),
      specifications: candidate.specifications,
      key_specs: candidate.key_specs,
      images: safeImages,
      thumbnail: safeImages[0] || null,
      colors: safeColors,
      status: seedStatus,
    });

    let { data: createdRows, error: createErr } = await this.supabase
      .from('master_products')
      .upsert(baseInsertRow, { onConflict: 'model_key', ignoreDuplicates: true })
      .select('id');

    if (
      createErr &&
      ((createErr as { code?: string }).code === '23505' ||
        /master_products_slug_key|duplicate key/i.test(createErr.message))
    ) {
      const slugSuffix = crypto
        .createHash('sha256')
        .update(candidate.model_key)
        .digest('hex')
        .slice(0, 8);
      const fallbackSlug = `${safeSlug.slice(0, 170)}-${slugSuffix}`;
      const retry = await this.supabase
        .from('master_products')
        .upsert(
          { ...baseInsertRow, slug: fallbackSlug },
          { onConflict: 'model_key', ignoreDuplicates: true }
        )
        .select('id');
      createdRows = retry.data;
      createErr = retry.error;
    }

    if (createErr) {
      throw new Error(`Failed to create master product: ${createErr.message}`);
    }
    if (Array.isArray(createdRows) && createdRows.length > 0) {
      const createdMaster = createdRows[0];
      logger.info(
        'entity_match.tier3_created',
        `Successfully created Master Product ID: ${createdMaster.id}`,
        { masterId: createdMaster.id, modelKey: candidate.model_key, seedStatus }
      );
      return { masterId: createdMaster.id, isNew: true };
    }

    // Lost the race: another worker inserted this model_key first. Adopt the
    // winner as-is (its status/identity decisions stay authoritative).
    const { data: winner, error: winnerErr } = await this.supabase
      .from('master_products')
      .select('id')
      .eq('model_key', candidate.model_key)
      .maybeSingle();
    if (winnerErr || !winner) {
      throw new Error(`Master product race lost and winner fetch failed: ${winnerErr?.message}`);
    }
    logger.info(
      'entity_match.tier3_race_winner',
      `Master product already existed (race): ${winner.id}`,
      { masterId: winner.id, modelKey: candidate.model_key }
    );
    return { masterId: winner.id, isNew: false };
  }

  /**
   * Enriches an existing Master Product row in Supabase with full 10-Field-Group specs via AI
   */
  public async enrichMasterProductById(masterId: string): Promise<boolean> {
    const safeMasterId = sanitizeMatcherEntityId(masterId, 128);
    if (!safeMasterId) {
      throw new Error('[EntityMatcher] masterId must be a non-empty string');
    }

    const { data: row, error: fetchErr } = await this.supabase
      .from('master_products')
      .select(
        'id, brand, model, storage_gb, ram_gb, screen_size_inch, battery_mah, has_5g, name, description, colors, specifications, key_specs'
      )
      .eq('id', safeMasterId)
      .maybeSingle();

    if (fetchErr || !row) {
      throw new Error(
        `[EntityMatcher] Master product ${safeMasterId} not found: ${fetchErr?.message}`
      );
    }

    const existingSpecsRecord =
      row.specifications &&
      typeof row.specifications === 'object' &&
      !Array.isArray(row.specifications)
        ? (row.specifications as Record<string, unknown>)
        : undefined;
    const rawExistingCatSlug =
      typeof existingSpecsRecord?.category_slug === 'string'
        ? existingSpecsRecord.category_slug.trim().toLowerCase()
        : '';
    const existingCategorySlug = VALID_CATEGORY_SLUGS.has(
      rawExistingCatSlug as CanonicalCategorySlug
    )
      ? (rawExistingCatSlug as CanonicalCategorySlug)
      : undefined;
    const inferredCategorySlug =
      existingCategorySlug ??
      detectCategorySlug(`${row.brand || ''} ${row.model || ''} ${row.name || ''}`);

    const existingRamGb = toBoundedPositiveInt(row.ram_gb, MAX_RAM_GB);
    const existingStorageGb = toBoundedPositiveInt(row.storage_gb, MAX_STORAGE_GB);
    const existingScreenInch = toBoundedPositiveNumber(row.screen_size_inch, MAX_SCREEN_SIZE_INCH);
    const existingBatteryMah = toBoundedPositiveInt(row.battery_mah, MAX_BATTERY_MAH);

    const safeRowBrand =
      typeof row.brand === 'string'
        ? row.brand
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 100) || 'Unknown'
        : 'Unknown';
    const safeRowModel =
      typeof row.model === 'string'
        ? row.model
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 200) || 'Unknown'
        : 'Unknown';
    const safeRowName =
      typeof row.name === 'string'
        ? row.name
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 300)
        : undefined;
    const safeRowDescription =
      typeof row.description === 'string'
        ? row.description
            .replace(/\p{Cc}+/gu, ' ')
            .trim()
            .slice(0, 4_000)
        : undefined;

    const aiResult = await this.enricher.fetchSpecsFromAi({
      brand: safeRowBrand,
      model: safeRowModel,
      storageGb: existingStorageGb,
      ramGb: existingRamGb,
      rawTitle: safeRowName,
      rawDescription: safeRowDescription,
      categorySlug: inferredCategorySlug,
    });

    if (!aiResult) {
      return false;
    }

    const safeRowColors = Array.isArray(row.colors)
      ? row.colors
          .filter((c): c is string => typeof c === 'string')
          .map(c =>
            c
              .replace(/\p{Cc}+/gu, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80)
          )
          .filter(Boolean)
          .slice(0, 50)
      : [];

    const mergedSpecifications = mergeProductSpecifications(
      existingSpecsRecord,
      aiResult.specifications,
      safeRowColors.length > 0 ? safeRowColors : undefined
    );
    if (!mergedSpecifications.category_slug) {
      mergedSpecifications.category_slug = inferredCategorySlug;
    }

    const mergedKeySpecs = mergeKeySpecs(
      row.key_specs,
      aiResult.key_specs as unknown as Record<string, unknown>
    );

    const { error: updateErr } = await this.supabase
      .from('master_products')
      .update(
        applyCategorySpecTemplate(inferredCategorySlug, {
          ram_gb: existingRamGb ?? toBoundedPositiveInt(aiResult.ram_gb, MAX_RAM_GB),
          storage_gb:
            existingStorageGb ?? toBoundedPositiveInt(aiResult.storage_gb, MAX_STORAGE_GB),
          screen_size_inch:
            existingScreenInch ??
            toBoundedPositiveNumber(aiResult.screen_size_inch, MAX_SCREEN_SIZE_INCH),
          battery_mah:
            existingBatteryMah ?? toBoundedPositiveInt(aiResult.battery_mah, MAX_BATTERY_MAH),
          has_5g: isStrictBoolean(row.has_5g)
            ? true
            : isStrictBoolean(aiResult.has_5g ?? row.has_5g),
          specifications: mergedSpecifications,
          key_specs: mergedKeySpecs,
          updated_at: new Date().toISOString(),
        })
      )
      .eq('id', safeMasterId);

    if (updateErr) {
      throw new Error(
        `[EntityMatcher] Failed to update enriched specs for ${safeMasterId}: ${updateErr.message}`
      );
    }

    return true;
  }
}
