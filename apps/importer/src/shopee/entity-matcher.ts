import crypto from 'node:crypto';
import {
  UNKNOWN_VARIANT_KEY,
  composeModelKey,
  isItemKey,
  isSizedVariantKey,
  splitModelKey,
  type VariantSource,
} from '@repo/shared-data';
import {
  UnkeyableProductTitleError,
  detectCategorySlug,
  type CanonicalCategorySlug,
  type NormalizedProductCandidate,
} from './product-normalizer.js';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { AiSpecEnricher, mergeProductSpecifications } from './ai-spec-enricher.js';
import { mergeKeySpecs } from './jobs/backfill-specs.js';
import { createImporterLogger } from './logger.js';
import { resolveItemModelMode, type ItemModelMode } from './item-model-flag.js';
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

export interface EntityMatcherOptions {
  /** Item model rollout mode; defaults to the `RATE_ITEM_MODEL` env (see item-model-flag.ts). */
  itemModel?: ItemModelMode;
}

export interface ItemMatchResult {
  /** The listing's Item; null only in mode `off`, where Items are not read. */
  itemId: string | null;
  /** The listing's variant (`cluster_id`); null = no variant, only in mode `nullable_variant`. */
  masterId: string | null;
  isNew: boolean;
  /** `products.variant_source`; null when the listing does not tell its variant. */
  variantSource: VariantSource | null;
}

type MatchedItem = { id: string; itemKey: string };

export class EntityMatcher {
  private enricher: AiSpecEnricher;
  public readonly itemModel: ItemModelMode;

  constructor(
    private supabase: RateSupabaseClient,
    enricher?: AiSpecEnricher,
    options: EntityMatcherOptions = {}
  ) {
    this.enricher = enricher ?? new AiSpecEnricher();
    this.itemModel = options?.itemModel ?? resolveItemModelMode();
  }

  /**
   * Item-first matching (DOS/Rate#1151, design doc section 4.5). In mode `off` this is
   * exactly `resolveOrCreateMasterProduct`. Otherwise:
   * 1. Item by `itemIdHint`, then by exact `item_key`, then fuzzy on Item names
   *    (`match_item`). Item names carry no storage, so a bare title can no longer
   *    land on a sized variant (#1105).
   * 2. Known size: the variant by exact `(item_id, variant_key)`, created when missing.
   * 3. Size not stated: a single-variant Item's one variant. On a multi-size Item, no
   *    variant in mode `nullable_variant`, the Item's `unknown` variant in mode `item`.
   * 4. No Item: seed a master as today; the M1 sync trigger creates its draft Item.
   */
  public async resolveItemAndVariant(
    candidate: NormalizedProductCandidate,
    categoryId?: string,
    rawTitle?: string,
    options: { itemIdHint?: string | null } = {}
  ): Promise<ItemMatchResult> {
    if (this.itemModel === 'off') {
      const { masterId, isNew } = await this.resolveOrCreateMasterProduct(
        candidate,
        categoryId,
        rawTitle
      );
      return { itemId: null, masterId, isNew, variantSource: null };
    }

    const input = this.sanitizeCandidateInput(candidate, categoryId, rawTitle);
    candidate = input.candidate;
    const { safeModelKey, safeCategoryId, safeRawTitle } = input;
    const keys = splitModelKey(safeModelKey);
    if (!keys) {
      throw new Error(
        `[EntityMatcher] model_key is not in brand:model:variant shape: ${JSON.stringify(safeModelKey)}`
      );
    }
    const variantKnown =
      typeof candidate.variant_known === 'boolean'
        ? candidate.variant_known
        : keys.variantKey !== UNKNOWN_VARIANT_KEY || candidate.category_slug === 'earbuds';
    const variantSource: VariantSource | null = variantKnown
      ? (candidate.variant_source ??
        (keys.variantKey === UNKNOWN_VARIANT_KEY ? 'single_variant' : 'title'))
      : null;

    // 1. Item: caller hint, exact item_key, then fuzzy on Item names.
    let item: MatchedItem | null = null;
    let ambiguousFuzzy = false;
    const safeItemIdHint = sanitizeMatcherEntityId(options?.itemIdHint, 128);
    if (safeItemIdHint) {
      item = await this.findItem('id', safeItemIdHint);
      if (item) {
        logger.info('entity_match.item_hint', `Item from caller hint: ${item.itemKey}`, {
          itemId: item.id,
        });
      } else {
        logger.warn('entity_match.item_hint_missing', `itemIdHint ${safeItemIdHint} not found`, {
          itemIdHint: safeItemIdHint,
        });
      }
    }
    if (!item) {
      item = await this.findItem('item_key', keys.itemKey);
      if (item) {
        logger.info('entity_match.item_tier1_exact', `Item Tier 1 exact: ${item.itemKey}`, {
          itemId: item.id,
        });
      }
    }
    let fuzzyItem = false;
    if (!item) {
      const fuzzy = await this.fuzzyMatchItem(candidate);
      item = fuzzy.item;
      fuzzyItem = Boolean(fuzzy.item);
      ambiguousFuzzy = fuzzy.ambiguous;
    }

    // 4. No Item: seed the master under the candidate's own key. A new Item's one
    // variant (sized or `unknown`) is its only variant until a sized one appears.
    const seedOwnKey = async (): Promise<ItemMatchResult> => {
      const seeded = await this.seedMasterProduct(
        candidate,
        safeModelKey,
        safeCategoryId,
        safeRawTitle,
        ambiguousFuzzy
      );
      const itemId = await this.itemIdOfMaster(seeded.masterId);
      return { itemId, masterId: seeded.masterId, isNew: seeded.isNew, variantSource };
    };
    if (!item) return seedOwnKey();
    if (!isItemKey(item.itemKey)) {
      throw new Error(
        `[EntityMatcher] Item ${item.id} has no brand:model key (${JSON.stringify(item.itemKey)}); cannot place a variant under it`
      );
    }

    const variants = await this.listItemVariants(item.id);
    let targetVariantKey = keys.variantKey;

    if (variantKnown) {
      // 2. Known size: exact (item_id, variant_key), as Tier 1 matches an exact model_key.
      // A sizeless line keyed `unknown` also takes a live `standard` variant (seed keys).
      const exact =
        variants.find(v => v.variant_key === keys.variantKey) ??
        (keys.variantKey === UNKNOWN_VARIANT_KEY
          ? variants.find(v => v.variant_key === 'standard' && v.status !== 'archived')
          : undefined);
      // An archived variant takes no new listings once variants may be NULL; mode
      // item keeps Tier 1's rule (it links to the existing row).
      if (exact?.status === 'archived' && this.itemModel === 'nullable_variant') {
        logger.info(
          'entity_match.variant_archived',
          `Variant ${exact.variant_key} of ${item.itemKey} is archived: no variant`,
          { itemId: item.id, masterId: exact.id }
        );
        return { itemId: item.id, masterId: null, isNew: false, variantSource: null };
      }
      if (exact) {
        logger.info('entity_match.variant_exact', `Variant ${keys.variantKey} of ${item.itemKey}`, {
          itemId: item.id,
          masterId: exact.id,
        });
        return { itemId: item.id, masterId: exact.id, isNew: false, variantSource };
      }
    } else {
      // 3. Size not stated. Multi-size = a live sized variant (design doc 4.2).
      const live = variants.filter(v => v.status !== 'archived');
      const multiSize = live.some(v => isSizedVariantKey(v.variant_key));
      if (multiSize && this.itemModel === 'nullable_variant') {
        logger.info(
          'entity_match.variant_unknown',
          `Size not stated on multi-size Item ${item.itemKey}: no variant`,
          { itemId: item.id }
        );
        return { itemId: item.id, masterId: null, isNew: false, variantSource: null };
      }
      const unknownVariant = live.find(v => v.variant_key === UNKNOWN_VARIANT_KEY);
      const only = multiSize
        ? unknownVariant
        : (unknownVariant ??
          live.find(v => v.variant_key === 'standard') ??
          (live.length === 1 ? live[0] : undefined));
      if (only) {
        logger.info(
          'entity_match.variant_size_not_stated',
          `Size not stated: variant ${only.variant_key} of ${item.itemKey}`,
          { itemId: item.id, masterId: only.id, multiSize }
        );
        return { itemId: item.id, masterId: only.id, isNew: false, variantSource: null };
      }
      targetVariantKey = UNKNOWN_VARIANT_KEY;
      // A retired `unknown` variant (M3) is never seeded again: the upsert would
      // adopt the archived row.
      if (variants.some(v => v.variant_key === UNKNOWN_VARIANT_KEY)) {
        if (this.itemModel === 'nullable_variant') {
          return { itemId: item.id, masterId: null, isNew: false, variantSource: null };
        }
        throw new Error(
          `[EntityMatcher] ${item.itemKey}:unknown is archived; RATE_ITEM_MODEL=item cannot place a listing with no stated size`
        );
      }
    }

    // A fuzzy Item hit only links to variants that exist, as Tier 2 only links to
    // existing masters: the listing's own name and model may not be the Item's
    // ("iPhone 15 Pro Max" ~ "iPhone 15 Pro"), so a new variant gets its own key.
    if (fuzzyItem) return seedOwnKey();

    // Missing variant of a known Item: create it under the Item's own key.
    const variantModelKey = composeModelKey(item.itemKey, targetVariantKey);
    const seeded = await this.seedMasterProduct(
      { ...candidate, model_key: variantModelKey },
      variantModelKey,
      safeCategoryId,
      safeRawTitle,
      ambiguousFuzzy
    );
    logger.info(
      'entity_match.variant_created',
      `Variant ${targetVariantKey} of ${item.itemKey}: ${seeded.masterId}`,
      { itemId: item.id, masterId: seeded.masterId, isNew: seeded.isNew }
    );
    return { itemId: item.id, masterId: seeded.masterId, isNew: seeded.isNew, variantSource };
  }

  private async findItem(column: 'id' | 'item_key', value: string): Promise<MatchedItem | null> {
    const { data, error } = await this.supabase
      .from('items')
      .select('id, item_key')
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw new Error(`[EntityMatcher] Item lookup by ${column} failed: ${error.message}`);
    }
    const row = data as { id?: unknown; item_key?: unknown } | null;
    const id = sanitizeMatcherEntityId(row?.id, 128);
    return id ? { id, itemKey: typeof row?.item_key === 'string' ? row.item_key : '' } : null;
  }

  /** Item Tier 2: pg_trgm on Item names through `rate.match_item` (design doc 4.5). */
  private async fuzzyMatchItem(
    candidate: NormalizedProductCandidate
  ): Promise<{ item: MatchedItem | null; ambiguous: boolean }> {
    const searchTitle =
      typeof candidate.item_name === 'string' && candidate.item_name.trim()
        ? candidate.item_name
        : `${candidate.brand} ${candidate.model}`;
    const { data, error } = await this.supabase.rpc('match_item', {
      search_title: searchTitle,
      p_brand: candidate.brand,
      p_model: candidate.model,
      p_threshold: ENTITY_MATCH_CANDIDATE_FLOOR,
    });
    // As in Tier 2: an RPC failure aborts instead of seeding a duplicate Item.
    if (error) {
      throw new Error(`[EntityMatcher] Item Tier 2 fuzzy match failed: ${error.message}`);
    }
    const rows = Array.isArray(data)
      ? data.filter(m => {
          if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
          if (!sanitizeMatcherEntityId(m.item_id, 128)) return false;
          const sim = typeof m.similarity === 'boolean' ? Number.NaN : Number(m.similarity);
          return Number.isFinite(sim) && sim >= ENTITY_MATCH_CANDIDATE_FLOOR && sim <= 1;
        })
      : [];
    const top = rows[0];
    if (!top) return { item: null, ambiguous: false };
    const sim = Number(top.similarity);
    if (sim < ENTITY_MATCH_ACCEPT_THRESHOLD) {
      logger.warn(
        'entity_match.item_tier2_ambiguous',
        `Item Tier 2 best similarity ${(sim * 100).toFixed(1)}% < ${(ENTITY_MATCH_ACCEPT_THRESHOLD * 100).toFixed(0)}%: seeding as draft if new.`,
        { similarity: sim, modelKey: candidate.model_key }
      );
      return { item: null, ambiguous: true };
    }
    const item = {
      id: sanitizeMatcherEntityId(top.item_id, 128),
      itemKey: typeof top.item_key === 'string' ? top.item_key : '',
    };
    logger.info(
      'entity_match.item_tier2_fuzzy',
      `Item Tier 2: "${searchTitle}" ~= "${top.name}" (similarity: ${(sim * 100).toFixed(1)}%)`,
      { itemId: item.id, similarity: sim }
    );
    return { item, ambiguous: false };
  }

  private async listItemVariants(
    itemId: string
  ): Promise<Array<{ id: string; variant_key: string; status: string | null }>> {
    const { data, error } = await this.supabase
      .from('master_products')
      .select('id, variant_key, status')
      .eq('item_id', itemId)
      .limit(200);
    if (error) {
      throw new Error(`[EntityMatcher] Variant lookup for Item ${itemId} failed: ${error.message}`);
    }
    return (Array.isArray(data) ? data : []).flatMap(row => {
      const id = sanitizeMatcherEntityId(row?.id, 128);
      return id && typeof row.variant_key === 'string'
        ? [{ id, variant_key: row.variant_key, status: row.status ?? null }]
        : [];
    });
  }

  /** The Item the M1 sync trigger linked to a master; fails loudly when M1 is missing. */
  private async itemIdOfMaster(masterId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('master_products')
      .select('item_id')
      .eq('id', masterId)
      .maybeSingle();
    if (error) {
      throw new Error(
        `[EntityMatcher] item_id lookup for master ${masterId} failed: ${error.message}`
      );
    }
    const itemId = sanitizeMatcherEntityId((data as { item_id?: unknown } | null)?.item_id, 128);
    if (!itemId) {
      throw new Error(
        `[EntityMatcher] master ${masterId} has no item_id: the Item migration (DOS/Rate#1150) is not applied`
      );
    }
    return itemId;
  }

  /**
   * Resolves an existing canonical Master Product or creates a new one using 3-tier matching
   */
  public async resolveOrCreateMasterProduct(
    candidate: NormalizedProductCandidate,
    categoryId?: string,
    rawTitle?: string
  ): Promise<{ masterId: string; isNew: boolean }> {
    const input = this.sanitizeCandidateInput(candidate, categoryId, rawTitle);
    candidate = input.candidate;
    const { safeModelKey, safeCategoryId, safeRawTitle } = input;

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

    return this.seedMasterProduct(
      candidate,
      safeModelKey,
      safeCategoryId,
      safeRawTitle,
      ambiguousFuzzy
    );
  }

  /** Validates and bounds the matcher input; throws on a missing candidate or key. */
  private sanitizeCandidateInput(
    candidate: NormalizedProductCandidate,
    categoryId?: string,
    rawTitle?: string
  ): {
    candidate: NormalizedProductCandidate;
    safeModelKey: string;
    safeCategoryId: string | undefined;
    safeRawTitle: string | undefined;
  } {
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
    if (candidate.keyable === false) {
      throw new UnkeyableProductTitleError(rawTitle ?? candidate.name);
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
    return { candidate, safeModelKey, safeCategoryId, safeRawTitle };
  }

  /**
   * Tier 3: no existing master matches. Enriches the candidate (AI Spec Enricher,
   * unless it is in the local benchmark registry) and seeds a new master.
   */
  private async seedMasterProduct(
    candidate: NormalizedProductCandidate,
    safeModelKey: string,
    safeCategoryId: string | undefined,
    safeRawTitle: string | undefined,
    ambiguousFuzzy: boolean
  ): Promise<{ masterId: string; isNew: boolean }> {
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
    const baseInsertRow = applyCategorySpecTemplate(
      candidate.category_slug,
      {
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
      },
      { forStorage: true }
    );

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
        // Only a stored category scopes the write: a guess from the title
        // could strip a phone's real RAM.
        applyCategorySpecTemplate(
          existingCategorySlug,
          {
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
          },
          { forStorage: true }
        )
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
