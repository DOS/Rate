/**
 * Ingestion pipeline: Multi-Platform Scraped Data (Shopee, Lazada, Tiki, CellphoneS, TGDD) -> Supabase Cloud Schema `rate`
 * Uses 2-Tier Architecture (rate.master_products + rate.products)
 * Automatic 10 Field Groups Normalization & Entity Matching via Postgres
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  MAX_VALID_VND_PRICE,
  ScrapedProductSchema,
  scopeSupabaseToRate,
  type RateSupabaseClient,
  type ShopeeProduct,
  type ShopeeReview,
  type SupportedEcommercePlatform,
  type ValidatedScrapedProduct,
} from './types.js';
import { ProductNormalizer, UnkeyableProductTitleError } from './product-normalizer.js';
import {
  EntityMatcher,
  sanitizeHttpUrl,
  sanitizeHttpUrlList,
  type ItemMatchResult,
} from './entity-matcher.js';
import type { ItemModelMode } from './item-model-flag.js';
import { AiSpecEnricher, type AiSpecEnricherConfig } from './ai-spec-enricher.js';
import { AiReviewAnalyzer, type ReviewInputItem } from './ai-review-analyzer.js';
import { createImporterLogger } from './logger.js';
import { resolveBackfillSupabaseTarget } from './paging.js';
import {
  resolveClusterPeerFloorPrice,
  type ClusterPeerPriceCandidate,
} from './cluster-peer-floor.js';
import { rescoreMerchantReviewRisk } from './merchant-review-risk.js';

dotenv.config({ quiet: true });

const logger = createImporterLogger('ShopeeIngestionPipeline');

function hashEntity(val: string): string {
  return '0x' + crypto.createHash('sha256').update(val.toLowerCase()).digest('hex');
}

const DISALLOWED_INGEST_ID_REGEX =
  /^(?:null|undefined|nan|infinity|-infinity|true|false|none|n\/a|unknown|__proto__|constructor|prototype)$/i;

export function sanitizeIngestionEntityId(raw: unknown, maxLen = 128): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  if (typeof raw === 'number' && (!Number.isFinite(raw) || raw <= 0)) return null;
  const cleaned = String(raw)
    .replace(/\p{Cc}+/gu, '')
    .trim();
  if (!cleaned || cleaned.length > maxLen || /\s/.test(cleaned)) return null;
  if (
    /^0+$/.test(cleaned) ||
    !/[\p{L}\p{N}]/u.test(cleaned) ||
    DISALLOWED_INGEST_ID_REGEX.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

export function platformReviewIdFor(r: ShopeeReview): string {
  const safeReview =
    r && typeof r === 'object' && !Array.isArray(r) ? r : ({} as Partial<ShopeeReview>);
  const cleanId = sanitizeIngestionEntityId(safeReview.reviewId, 160);
  if (cleanId) {
    return cleanId;
  }
  const author = String(safeReview.author || '').slice(0, 200);
  const rating =
    typeof safeReview.ratingStar === 'boolean' ? '' : String(safeReview.ratingStar ?? '');
  const variation = String(safeReview.variation || '').slice(0, 200);
  const createdAt = String(safeReview.createdAt || '').slice(0, 64);
  const comment = String(safeReview.comment || '').slice(0, 10_000);
  return (
    'rv-' +
    crypto
      .createHash('sha256')
      .update(`${author}|${rating}|${variation}|${createdAt}|${comment}`)
      .digest('hex')
  );
}

const SPEC_FIELD_GROUP_KEYS = [
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
 * Returns true if at least one of the 10 specification field groups contains a
 * non-empty value (ignoring top-level metadata keys such as `category_slug`).
 */
export function hasPopulatedSpecificationGroups(specs: unknown): boolean {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return false;
  const record = specs as Record<string, unknown>;
  for (const groupKey of SPEC_FIELD_GROUP_KEYS) {
    const group = record[groupKey];
    if (group && typeof group === 'object' && !Array.isArray(group)) {
      const hasValue = Object.values(group as Record<string, unknown>).some(v => {
        if (v === undefined || v === null) return false;
        if (typeof v === 'number') return Number.isFinite(v);
        if (typeof v === 'boolean') return true;
        if (Array.isArray(v)) {
          return v.some(
            item =>
              item !== undefined &&
              item !== null &&
              (typeof item === 'number'
                ? Number.isFinite(item)
                : typeof item === 'boolean'
                  ? true
                  : String(item)
                      .replace(/\p{Cc}+/gu, '')
                      .trim() !== '')
          );
        }
        return (
          String(v)
            .replace(/\p{Cc}+/gu, '')
            .trim() !== ''
        );
      });
      if (hasValue) return true;
    }
  }
  return false;
}

/**
 * Normalizes optional original/discount prices and variant models on a validated
 * product before writing to `rate.products` and `rate.price_history`:
 *  - clamps `priceMax` to `>= priceMin` (within `MAX_VALID_VND_PRICE`);
 *  - strips `priceBeforeDiscount` when `<= 0`, `< priceMin`, non-finite, or `> MAX_VALID_VND_PRICE`;
 *  - filters out variant `models` whose `price` is `<= 0`, non-finite, or `> MAX_VALID_VND_PRICE`.
 */
export function normalizeScrapedProductPrices(
  product: ValidatedScrapedProduct
): ValidatedScrapedProduct {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('normalizeScrapedProductPrices requires a non-null product object');
  }
  const rawPriceMin = typeof product.priceMin === 'boolean' ? 0 : Number(product.priceMin);
  const priceMin =
    Number.isFinite(rawPriceMin) && rawPriceMin > 0
      ? Math.min(Math.round(rawPriceMin), MAX_VALID_VND_PRICE)
      : 0;
  const rawPriceMax = typeof product.priceMax === 'boolean' ? Number.NaN : Number(product.priceMax);
  const roundedPriceMax = Number.isFinite(rawPriceMax) ? Math.round(rawPriceMax) : Number.NaN;
  const priceMax =
    Number.isFinite(roundedPriceMax) &&
    roundedPriceMax >= priceMin &&
    roundedPriceMax <= MAX_VALID_VND_PRICE
      ? roundedPriceMax
      : priceMin;
  const rawBefore =
    product.priceBeforeDiscount !== undefined &&
    product.priceBeforeDiscount !== null &&
    typeof product.priceBeforeDiscount !== 'boolean'
      ? Math.round(Number(product.priceBeforeDiscount))
      : undefined;
  const validBeforeDiscount =
    rawBefore !== undefined &&
    Number.isFinite(rawBefore) &&
    rawBefore > 0 &&
    rawBefore >= priceMin &&
    rawBefore <= MAX_VALID_VND_PRICE
      ? rawBefore
      : undefined;
  const models = Array.isArray(product.models)
    ? product.models
        .filter(m => {
          if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.price === 'boolean')
            return false;
          const p = Math.round(Number(m.price));
          return Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE;
        })
        .map(m => ({
          ...m,
          price: Math.round(Number(m.price)),
        }))
    : [];
  const rawSold =
    typeof product.historicalSold === 'boolean' ? Number.NaN : Number(product.historicalSold);
  const historicalSold =
    Number.isFinite(rawSold) && rawSold >= 0 ? Math.min(Math.floor(rawSold), 1_000_000_000) : 0;
  const rawRatingStar =
    typeof product.ratingStar === 'boolean' ? Number.NaN : Number(product.ratingStar);
  const ratingStar =
    Number.isFinite(rawRatingStar) && rawRatingStar >= 0 && rawRatingStar <= 5 ? rawRatingStar : 0;
  const rawRatingCount =
    typeof product.ratingCount === 'boolean' ? Number.NaN : Number(product.ratingCount);
  const ratingCount =
    Number.isFinite(rawRatingCount) && rawRatingCount >= 0
      ? Math.min(Math.floor(rawRatingCount), 100_000_000)
      : 0;
  const images = sanitizeHttpUrlList(product.images);
  const safeShop =
    product.shop && typeof product.shop === 'object' && !Array.isArray(product.shop)
      ? product.shop
      : ({} as ValidatedScrapedProduct['shop']);
  const shopUrl = sanitizeHttpUrl(safeShop.url) ?? undefined;
  const reviews = Array.isArray(product.reviews)
    ? product.reviews
        .filter((r): r is ShopeeReview => Boolean(r && typeof r === 'object' && !Array.isArray(r)))
        .map(r => ({
          ...r,
          authorAvatar: sanitizeHttpUrl(r.authorAvatar) ?? undefined,
          images: sanitizeHttpUrlList(r.images),
          ...(r.videos !== undefined ? { videos: sanitizeHttpUrlList(r.videos) } : {}),
          reviewer:
            r.reviewer && typeof r.reviewer === 'object' && !Array.isArray(r.reviewer)
              ? {
                  ...r.reviewer,
                  profileUrl: sanitizeHttpUrl(r.reviewer.profileUrl) ?? undefined,
                }
              : undefined,
        }))
    : [];
  return {
    ...product,
    priceMin,
    priceMax,
    priceBeforeDiscount: validBeforeDiscount,
    historicalSold,
    ratingStar,
    ratingCount,
    images,
    models,
    shop: {
      ...safeShop,
      url: shopUrl,
    },
    reviews,
  };
}

export {
  resolveClusterPeerFloorPrice,
  type ClusterPeerPriceCandidate,
} from './cluster-peer-floor.js';

export interface ShopeeIngestionPipelineConfig extends AiSpecEnricherConfig {
  /**
   * Optional pre-scoped `rate` schema Supabase client for dependency injection / deterministic testing.
   */
  supabaseClient?: RateSupabaseClient;
  /** Item model rollout mode; defaults to the `RATE_ITEM_MODEL` env (see item-model-flag.ts). */
  itemModel?: ItemModelMode;
}

export interface IngestOptions {
  /**
   * Master product this listing is already known to belong to. Used when it exists;
   * otherwise the listing goes through entity matching as usual.
   */
  masterIdHint?: string | null;
  /**
   * Item this listing is known to belong to, for a page that states no size
   * (DOS/Rate#1151). Its variant still comes from the title. Ignored while
   * `RATE_ITEM_MODEL` is `off`, and when `masterIdHint` resolves.
   */
  itemIdHint?: string | null;
  /**
   * When true, skips Step 6 review re-analysis so price-only (affiliate) ingests
   * do not re-score stored reviews without reviewer metadata or pay an extra AI pass.
   */
  skipReviewAnalysis?: boolean;
  /**
   * Alias for `skipReviewAnalysis` for price-only (affiliate) ingests.
   */
  pricesOnly?: boolean;
}

export class ShopeeIngestionPipeline {
  private supabase: RateSupabaseClient;
  private normalizer: ProductNormalizer;
  private matcher: EntityMatcher;
  private enricher: AiSpecEnricher;
  private reviewAnalyzer: AiReviewAnalyzer;
  private smartphoneCategoryId: string | null = null;
  private categoryIdBySlug = new Map<string, string>();

  constructor(aiConfig?: ShopeeIngestionPipelineConfig) {
    if (aiConfig?.supabaseClient) {
      this.supabase = aiConfig.supabaseClient;
    } else {
      const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();

      if (!rawUrl.trim() || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
      }
      const { url } = resolveBackfillSupabaseTarget(rawUrl);

      const admin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Scope to rate schema
      this.supabase = scopeSupabaseToRate(admin);
    }
    this.normalizer = new ProductNormalizer();
    this.enricher = new AiSpecEnricher(aiConfig);
    this.reviewAnalyzer = new AiReviewAnalyzer(aiConfig);
    this.matcher = new EntityMatcher(this.supabase, this.enricher, {
      itemModel: aiConfig?.itemModel,
    });
  }

  /**
   * Which of `ids` this product already stores. Filters on the ids (50 per
   * request, a short URL) instead of reading every stored review, which
   * PostgREST caps at max-rows.
   */
  private async findExistingReviewIds(
    productId: string,
    ids: readonly string[],
    errorPrefix: string
  ): Promise<Set<string>> {
    const found = new Set<string>();
    const safeProductId = sanitizeIngestionEntityId(productId, 128) ?? '';
    if (!safeProductId || !Array.isArray(ids) || ids.length === 0) return found;
    const unique = [
      ...new Set(
        ids.map(id => sanitizeIngestionEntityId(id, 160)).filter((id): id is string => id !== null)
      ),
    ].slice(0, 1_000);
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const eqBuilder = this.supabase
        .from('reviews')
        .select('platform_review_id')
        .eq('product_id', safeProductId) as unknown as {
        in?: (
          col: string,
          vals: string[]
        ) => PromiseLike<{
          data: Array<{ platform_review_id: string }> | null;
          error: { message: string } | null;
        }>;
        not: (
          col: string,
          op: string,
          val: null
        ) => PromiseLike<{
          data: Array<{ platform_review_id: string }> | null;
          error: { message: string } | null;
        }>;
      };
      const { data, error } =
        typeof eqBuilder.in === 'function'
          ? await eqBuilder.in('platform_review_id', chunk)
          : await eqBuilder.not('platform_review_id', 'is', null);
      if (error) throw new Error(`${errorPrefix}: ${error.message}`);
      for (const r of (data || []) as Array<{ platform_review_id: string }>) {
        if (!r || typeof r !== 'object') continue;
        const cleanRevId = sanitizeIngestionEntityId(r.platform_review_id, 160);
        if (cleanRevId) found.add(cleanRevId);
      }
      if (typeof eqBuilder.in !== 'function') break;
    }
    return found;
  }

  /**
   * Initializes category lookup across all 5 tech categories
   */
  public async init(): Promise<void> {
    const { data: cats, error: catsErr } = await this.supabase
      .from('categories')
      .select('id, slug');
    if (catsErr) {
      throw new Error(`Failed to initialize categories: ${catsErr.message}`);
    }

    for (const c of cats || []) {
      if (!c || typeof c !== 'object') continue;
      const safeSlug = sanitizeIngestionEntityId(c.slug, 120) ?? '';
      const safeId =
        typeof c.id === 'string' && !/[\s\p{Cc}]/u.test(c.id.trim())
          ? (sanitizeIngestionEntityId(c.id.trim(), 128) ?? '')
          : '';
      if (!safeSlug || !safeId) continue;
      this.categoryIdBySlug.set(safeSlug, safeId);
      if (safeSlug === 'smartphones') {
        this.smartphoneCategoryId = safeId;
      }
    }

    const aiInfo = this.enricher.getProviderInfo();
    logger.info(
      'ingest.init',
      `AI Spec Enricher status: provider=${aiInfo.provider}, model=${aiInfo.model}, configured=${aiInfo.configured}`,
      {
        provider: aiInfo.provider,
        model: aiInfo.model,
        configured: aiInfo.configured,
      }
    );
  }

  /**
   * Ingest a full e-commerce product (Shopee, Lazada, Tiki, CellphoneS, TGDD) into rate schema
   * with canonical Master Product deduplication.
   */
  public async ingestProduct(
    rawProduct: ShopeeProduct,
    report?: (section: 'merchant' | 'master' | 'listing' | 'price' | 'reviews') => Promise<void>,
    options: IngestOptions = {}
  ): Promise<{
    productId: string;
    merchantId: string;
    /** The listing's variant; null only in `RATE_ITEM_MODEL=nullable_variant` (no variant). */
    masterId: string | null;
    /** The listing's Item; null while `RATE_ITEM_MODEL` is `off`. */
    itemId: string | null;
    platform: SupportedEcommercePlatform;
  }> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
    const product = normalizeScrapedProductPrices(ScrapedProductSchema.parse(rawProduct));
    if (
      !Number.isFinite(product.priceMin) ||
      product.priceMin <= 0 ||
      product.priceMin > MAX_VALID_VND_PRICE
    ) {
      throw new Error(
        `Cannot ingest unpriced or out-of-bounds product listing (priceMin=${product.priceMin})`
      );
    }
    if (this.categoryIdBySlug.size === 0) {
      await this.init();
    }

    const platform: SupportedEcommercePlatform = product.platform || 'shopee';
    const platLogger = logger.child({ platform });

    platLogger.info('ingest.start', `Processing: "${product.title}"`, {
      itemId: product.itemId,
      shopId: product.shop.shopId,
    });

    // Normalize first: a title with no keyable brand or model is rejected
    // (UnkeyableProductTitleError) before anything is written. With a masterIdHint
    // whose row is gone, the matcher throws it after the merchant upsert instead.
    const candidate = this.normalizer.normalize(product);
    // With a masterIdHint the title's key is not used; the matcher still rejects
    // the candidate if the hint does not resolve.
    if (candidate.keyable === false && !options.masterIdHint) {
      throw new UnkeyableProductTitleError(product.title);
    }

    // 1. Upsert merchant
    const entityHash = hashEntity(`${platform}:${product.shop.shopId}`);
    const { data: merchant, error: merchantErr } = await this.supabase
      .from('merchants')
      .upsert(
        {
          platform,
          platform_shop_id: product.shop.shopId,
          name: product.shop.name,
          url: product.shop.url || null,
          is_official: product.shop.isMall,
          rating_star: product.shop.ratingStar || null,
          follower_count: product.shop.followerCount || 0,
          location: product.shop.location || null,
          entity_hash: entityHash,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'platform,platform_shop_id' }
      )
      .select('id')
      .single();

    if (merchantErr || !merchant) {
      throw new Error(`Failed to upsert merchant: ${merchantErr?.message}`);
    }

    const merchantId = merchant.id;
    platLogger.info(
      'ingest.merchant_resolved',
      `Merchant resolved: ${product.shop.name} -> ID: ${merchantId}`,
      { merchantId, shopName: product.shop.name }
    );
    await report?.('merchant');

    // 2. Match / Seed Master Product
    const resolvedCategoryId =
      this.categoryIdBySlug.get(candidate.category_slug || 'smartphones') ||
      this.smartphoneCategoryId;

    platLogger.info(
      'ingest.specs_normalized',
      `Specs normalized -> Key: "${candidate.model_key}", Category: ${candidate.category_slug || 'smartphones'}, RAM: ${candidate.ram_gb}GB, Storage: ${candidate.storage_gb}GB`,
      {
        modelKey: candidate.model_key,
        categorySlug: candidate.category_slug || 'smartphones',
        ramGb: candidate.ram_gb,
        storageGb: candidate.storage_gb,
      }
    );

    // A caller that already verified the master (coverage discovery, or a refresh of
    // a listing that is already clustered) keeps the listing on it instead of
    // re-matching every crawl, which can split it onto a new draft master.
    // A matcher with no mode (e.g. a test double) reads as the flag's default, off.
    const itemModel: ItemModelMode = this.matcher.itemModel ?? 'off';
    let hinted: ItemMatchResult | null = null;
    // undefined = leave the stored variant_source as it is.
    let hintedVariantSource: ItemMatchResult['variantSource'] | undefined;
    let safeItemIdHint =
      typeof options.itemIdHint === 'string'
        ? (sanitizeIngestionEntityId(options.itemIdHint, 128) ?? '')
        : '';
    if (safeItemIdHint && itemModel === 'off') {
      platLogger.warn('ingest.item_hint_ignored', 'itemIdHint ignored: RATE_ITEM_MODEL is off', {
        itemIdHint: safeItemIdHint,
      });
      safeItemIdHint = '';
    }
    const safeMasterIdHint =
      typeof options.masterIdHint === 'string'
        ? (sanitizeIngestionEntityId(options.masterIdHint, 128) ?? '')
        : '';
    if (safeMasterIdHint) {
      const { data: hintData, error: hintErr } = await this.supabase
        .from('master_products')
        .select(
          itemModel === 'off'
            ? 'id, specifications'
            : 'id, specifications, status, item_id, variant_key'
        )
        .eq('id', safeMasterIdHint)
        .maybeSingle();
      if (hintErr) {
        throw new Error(`Failed to verify masterIdHint (${safeMasterIdHint}): ${hintErr.message}`);
      }
      const hintRow = hintData as {
        id?: string;
        specifications?: Record<string, unknown> | null;
      } | null;
      const hintMeta = hintData as {
        status?: unknown;
        item_id?: unknown;
        variant_key?: unknown;
      } | null;
      const hintItemId =
        itemModel === 'off' ? null : sanitizeIngestionEntityId(hintMeta?.item_id, 128);
      if (hintRow?.id && itemModel !== 'off' && hintMeta?.status === 'archived') {
        // A retired master (an Item's `unknown` variant after M3) must not take the
        // listing back: the hint maps to its Item, and the variant comes from the title.
        platLogger.info(
          'ingest.master_hint_archived',
          `masterIdHint ${hintRow.id} is archived: matching under its Item ${hintItemId ?? '(none)'}`,
          { masterId: hintRow.id, itemId: hintItemId }
        );
        if (hintItemId) safeItemIdHint = hintItemId;
      } else if (hintRow?.id) {
        hinted = { masterId: hintRow.id, itemId: hintItemId, isNew: false, variantSource: null };
        // The title's variant source holds only when it names the hinted variant.
        hintedVariantSource =
          candidate.variant_known && candidate.variant_key === hintMeta?.variant_key
            ? (candidate.variant_source ?? null)
            : undefined;
        const existingSpecs = (hintRow as { specifications?: Record<string, unknown> | null })
          .specifications;
        if (existingSpecs !== undefined && !hasPopulatedSpecificationGroups(existingSpecs)) {
          try {
            await this.matcher.enrichMasterProductById(hintRow.id);
          } catch (enrichErr: unknown) {
            const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
            platLogger.warn(
              'ingest.master_hint_enrich_warn',
              `Could not enrich hinted master ${hintRow.id}: ${msg}`,
              { masterId: hintRow.id }
            );
          }
        }
      }
    }
    const resolved =
      hinted ??
      (await this.matcher.resolveItemAndVariant(
        candidate,
        resolvedCategoryId || undefined,
        product.title,
        { itemIdHint: safeItemIdHint || null }
      ));
    const { isNew } = resolved;
    let itemId = resolved.itemId;
    let masterId = resolved.masterId;
    let variantSourceToWrite = hinted ? hintedVariantSource : resolved.variantSource;
    // The variant and Item the listing had before this crawl, so their stats follow a move.
    let previousClusterId: string | null = null;
    let previousItemId: string | null = null;
    if (itemModel !== 'off') {
      // A variant set by hand is evidence, never undone by a later page that just
      // does not state the size (design doc 4.4): only listing evidence
      // (variant_source set) may move it.
      const { data: stored, error: storedErr } = await this.supabase
        .from('products')
        .select('cluster_id, variant_source, item_id')
        .eq('platform', platform)
        .eq('platform_item_id', product.itemId)
        .maybeSingle();
      if (storedErr) {
        throw new Error(`Failed to read the stored listing variant: ${storedErr.message}`);
      }
      const storedClusterId = sanitizeIngestionEntityId(stored?.cluster_id, 128);
      previousClusterId = storedClusterId;
      previousItemId = sanitizeIngestionEntityId(stored?.item_id, 128);
      // A hand-set variant always stays. A variant backed by listing evidence stays
      // when this crawl has none; a `legacy` or NULL-source link (e.g. a #1105
      // fuzzy link) does not. A caller hint is not overridden.
      const storedSource = stored?.variant_source;
      const keepStored =
        !hinted &&
        (storedSource === 'manual' ||
          (!resolved.variantSource &&
            (storedSource === 'title' ||
              storedSource === 'sku' ||
              storedSource === 'single_size')));
      if (storedClusterId && keepStored) {
        masterId = storedClusterId;
        variantSourceToWrite = undefined;
        // The kept variant brings its own Item: the title may now resolve to another
        // one (a repurposed listing), and a variant never sits under a foreign Item.
        const { data: keptVariant, error: keptErr } = await this.supabase
          .from('master_products')
          .select('id, item_id')
          .eq('id', storedClusterId)
          .maybeSingle();
        if (keptErr) {
          throw new Error(`Failed to read the kept variant's Item: ${keptErr.message}`);
        }
        const keptItemId = sanitizeIngestionEntityId(
          (keptVariant as { item_id?: unknown } | null)?.item_id,
          128
        );
        if (keptItemId !== itemId) {
          platLogger.info(
            'ingest.kept_variant_item',
            `Kept variant ${storedClusterId} belongs to Item ${keptItemId ?? '(none)'}, not the title's ${itemId ?? '(none)'}`,
            { masterId: storedClusterId, itemId: keptItemId, titleItemId: itemId }
          );
        }
        itemId = keptItemId;
      }
    }
    platLogger.info(
      'ingest.master_resolved',
      `Master Product ${hinted ? 'LINKED (caller hint)' : isNew ? 'CREATED' : 'LINKED'}: ID = ${masterId ?? '(no variant)'}`,
      { masterId, itemId, isNew, hinted: Boolean(hinted) }
    );
    await report?.('master');

    // Item columns exist only once the DOS-Me Item migration is applied (DOS/Rate#1150).
    const itemColumns: { item_id?: string; variant_source?: string | null } = {};
    if (itemModel !== 'off') {
      if (itemId) itemColumns.item_id = itemId;
      if (variantSourceToWrite !== undefined) itemColumns.variant_source = variantSourceToWrite;
    }

    // 3. Upsert product listing into rate.products (linked via cluster_id)
    const { data: savedProduct, error: productErr } = await this.supabase
      .from('products')
      .upsert(
        {
          ...itemColumns,
          merchant_id: merchantId,
          cluster_id: masterId,
          category_id: resolvedCategoryId,
          platform,
          platform_item_id: product.itemId,
          title: product.title,
          brand: candidate.brand,
          description: product.description || '',
          price_current: product.priceMin,
          price_min: product.priceMin,
          price_max: product.priceMax,
          price_original: product.priceBeforeDiscount || null,
          currency: product.currency || 'VND',
          historical_sold: product.historicalSold || 0,
          historical_sold_display: product.historicalSoldDisplay ?? null,
          stock: product.stock ?? null,
          rating_star: product.ratingStar || 0,
          rating_count: product.ratingCount || 0,
          images: product.images || [],
          models: product.models || [],
          attributes: product.attributes || [],
          url: product.url,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'platform,platform_item_id' }
      )
      .select('id')
      .single();

    if (productErr || !savedProduct) {
      throw new Error(`Failed to upsert product listing: ${productErr?.message}`);
    }

    const productId = savedProduct.id;
    platLogger.info('ingest.listing_upserted', `Listing upserted -> ID: ${productId}`, {
      productId,
      masterId,
    });

    // 3b. Refresh canonical master_products market stats (min_price, max_price, merchant_count) via SQL RPC (Audit C5)
    // A variant the listing just left is refreshed too, or it keeps the old price.
    const statsMasterIds = [masterId, previousClusterId].filter(
      (id, i, all): id is string => Boolean(id) && all.indexOf(id) === i
    );
    for (const statsMasterId of typeof this.supabase.rpc === 'function' ? statsMasterIds : []) {
      const { error: marketStatsErr } = await this.supabase.rpc('refresh_master_market_stats', {
        p_master_id: statsMasterId,
      });
      if (marketStatsErr) {
        platLogger.warn(
          'ingest.market_stats_rpc_warn',
          `Could not refresh master market stats via RPC: ${marketStatsErr.message}`,
          { masterId: statsMasterId }
        );
      }
    }
    // Then the Item roll-up (DOS-Me M2 `refresh_item_stats`, design doc 4.1), for the
    // Item the listing just left too.
    const statsItemIds =
      itemModel === 'off'
        ? []
        : [itemId, previousItemId].filter(
            (id, i, all): id is string => Boolean(id) && all.indexOf(id) === i
          );
    for (const statsItemId of typeof this.supabase.rpc === 'function' ? statsItemIds : []) {
      const { error: itemStatsErr } = await this.supabase.rpc('refresh_item_stats', {
        p_item_id: statsItemId,
      });
      if (itemStatsErr) {
        platLogger.warn(
          'ingest.item_stats_rpc_warn',
          `Could not refresh Item stats via RPC: ${itemStatsErr.message}`,
          { itemId: statsItemId }
        );
      }
    }

    await report?.('listing');

    // 4. Smart Delta Price Compression + stable observation_id (Audit M7)
    // Prefer single-round-trip `rate.record_price_observation` RPC (performs 7-day delta
    // check + `ON CONFLICT (observation_id) WHERE observation_id IS NOT NULL DO NOTHING`).
    const dayBucket = new Date().toISOString().slice(0, 10);
    const observationId =
      'px-' +
      crypto
        .createHash('sha256')
        .update(
          `${productId}|${product.priceMin}|${product.priceBeforeDiscount || ''}|${dayBucket}`
        )
        .digest('hex');

    let handledByObservationRpc = false;
    if (typeof this.supabase.rpc === 'function') {
      const { data: obsStatus, error: obsRpcErr } = await this.supabase.rpc(
        'record_price_observation',
        {
          p_product_id: productId,
          p_price: product.priceMin,
          p_price_original: product.priceBeforeDiscount || null,
          p_source: `${platform}_crawler`,
          p_observation_id: observationId,
          p_promotion_id: null,
        }
      );

      if (!obsRpcErr && typeof obsStatus === 'string') {
        handledByObservationRpc = true;
        if (obsStatus === 'unchanged_delta') {
          platLogger.info(
            'ingest.price_delta_unchanged',
            `Delta Price Compression (RPC): price unchanged (${Number(product.priceMin).toLocaleString('vi-VN')}₫), skipping redundant history row.`,
            { productId, observationId, priceMin: product.priceMin }
          );
        } else if (obsStatus === 'deduped_conflict') {
          platLogger.info(
            'ingest.price_deduped_rpc',
            `Price observation already recorded via RPC (${observationId}), skipping.`,
            { productId, observationId }
          );
        }
      } else if (
        obsRpcErr &&
        !/function .*record_price_observation.* does not exist|PGRST202/i.test(
          `${obsRpcErr.code || ''} ${obsRpcErr.message || ''}`
        )
      ) {
        platLogger.warn(
          'ingest.price_rpc_fallback',
          `record_price_observation RPC warning (${obsRpcErr.message}); falling back to client-side delta check.`,
          { productId }
        );
      }
    }

    if (!handledByObservationRpc) {
      const { data: latestObsRows } = await this.supabase
        .from('price_history')
        .select('observation_id, price, price_original, recorded_at')
        .eq('product_id', productId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      const latestObs = Array.isArray(latestObsRows)
        ? (latestObsRows.find(row => row && typeof row === 'object' && !Array.isArray(row)) ?? null)
        : null;
      const currentPrice = Number(product.priceMin);
      const currentOriginal = Number(product.priceBeforeDiscount || 0);
      const prevPrice = latestObs ? Number(latestObs.price) : -1;
      const prevOriginal = latestObs ? Number(latestObs.price_original || 0) : -1;
      const ageMs =
        latestObs && latestObs.recorded_at
          ? Date.now() - new Date(latestObs.recorded_at).getTime()
          : Number.POSITIVE_INFINITY;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      if (
        latestObs &&
        prevPrice === currentPrice &&
        prevOriginal === currentOriginal &&
        ageMs < sevenDaysMs
      ) {
        platLogger.info(
          'ingest.price_delta_unchanged_client',
          `Delta Price Compression: price unchanged (${currentPrice.toLocaleString('vi-VN')}₫, last anchor ${String(latestObs.recorded_at).slice(0, 10)}), skipping redundant history row.`,
          { productId, observationId }
        );
      } else {
        const { data: existingPrice, error: priceLookupErr } = await this.supabase
          .from('price_history')
          .select('observation_id')
          .eq('observation_id', observationId)
          .limit(1);
        if (priceLookupErr) {
          throw new Error(`Failed to check existing price observation: ${priceLookupErr.message}`);
        }
        if (Array.isArray(existingPrice) && existingPrice.length > 0) {
          platLogger.info(
            'ingest.price_deduped_client',
            `Price observation already recorded (${observationId}), skipping.`,
            { productId, observationId }
          );
        } else {
          const { error: priceErr } = await this.supabase.from('price_history').insert({
            product_id: productId,
            observation_id: observationId,
            price: product.priceMin,
            price_original: product.priceBeforeDiscount || null,
            recorded_at: new Date().toISOString(),
            source: `${platform}_crawler`,
          });
          if (priceErr) {
            const pCode = (priceErr as { code?: string }).code || '';
            if (pCode === '23505' || /duplicate key/i.test(priceErr.message)) {
              platLogger.warn(
                'ingest.price_race_deduped',
                'Concurrent price observation insert lost the race; treated as dedupe.',
                { productId, observationId }
              );
            } else {
              throw new Error(
                `Failed to record price history (observation ${observationId}): ${priceErr.message}`
              );
            }
          }
        }
      }
    }
    await report?.('price');

    // 5. Batch insert reviews if available
    if (product.reviews && product.reviews.length > 0) {
      const reviewRows = product.reviews.map(r => ({
        product_id: productId,
        platform_review_id: platformReviewIdFor(r),
        author_name: r.author,
        author_avatar: r.authorAvatar || null,
        rating_star: r.ratingStar,
        comment: r.comment,
        variation: r.variation || null,
        images: r.images || [],
        // null = the platform does not say (the column default `true` would claim a purchase we cannot confirm)
        is_verified_buyer: r.reviewer?.verifiedPurchase ?? null,
        platform_created_at: r.createdAt || null,
      }));

      // Ask only about the ids in this batch: reading every stored id stops at
      // PostgREST's max-rows (1000), so popular products missed duplicates.
      const candidateIds = reviewRows
        .map(r => r.platform_review_id)
        .filter((id): id is string => Boolean(id));
      const seen = await this.findExistingReviewIds(
        productId,
        candidateIds,
        'Failed to fetch existing reviews'
      );
      const newRows = reviewRows.filter(r => {
        if (!r.platform_review_id) return true;
        if (seen.has(r.platform_review_id)) return false;
        seen.add(r.platform_review_id);
        return true;
      });

      if (newRows.length === 0) {
        platLogger.info(
          'ingest.reviews_none_new',
          `No new reviews to ingest (${seen.size} duplicates skipped).`,
          { productId, skippedDuplicates: seen.size }
        );
      } else {
        let pending = newRows;
        for (let pass = 0; pass < 2; pass++) {
          const { error: reviewErr } = await this.supabase.from('reviews').insert(pending);
          if (!reviewErr) {
            platLogger.info(
              'ingest.reviews_inserted',
              `Successfully ingested ${pending.length} reviews (batch pass ${pass + 1}).`,
              { productId, insertedCount: pending.length, pass: pass + 1 }
            );
            pending = [];
            break;
          }
          const code = (reviewErr as { code?: string }).code || '';
          const isRace = code === '23505' || /duplicate key/i.test(reviewErr.message);
          if (!isRace || pass > 0) {
            throw new Error(`Failed to insert reviews: ${reviewErr.message}`);
          }
          platLogger.warn(
            'ingest.reviews_race_retry',
            'Review batch hit a unique-index race; retrying the remainder.',
            { productId }
          );
          const nowSeen = await this.findExistingReviewIds(
            productId,
            pending.map(r => r.platform_review_id).filter((id): id is string => Boolean(id)),
            'Failed to refetch reviews after race'
          );
          pending = pending.filter(r => !nowSeen.has(r.platform_review_id as string));
        }
        if (pending.length > 0) {
          throw new Error(
            `Failed to insert reviews: unexplained retry state (${pending.length} rows left)`
          );
        }
      }
      // Rows stored before the platform's purchase flag was captured still carry the
      // column default; refresh it for reviews already in the DB.
      for (const verified of [true, false]) {
        const ids = Array.from(
          new Set(
            product.reviews
              .filter(r => r.reviewer?.verifiedPurchase === verified)
              .map(platformReviewIdFor)
          )
        );
        if (ids.length === 0) continue;
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const { error: verifiedErr } = await this.supabase
            .from('reviews')
            .update({ is_verified_buyer: verified })
            .eq('product_id', productId)
            .in('platform_review_id', chunk);
          if (verifiedErr) {
            platLogger.warn(
              'ingest.reviews_verified_refresh_warn',
              `Could not refresh is_verified_buyer: ${verifiedErr.message}`,
              { productId }
            );
          }
        }
      }
      await report?.('reviews');
    }

    // 6. Review analysis + JReviews-style weighted rating + merchant risk score
    const shouldSkipReviewAnalysis = Boolean(
      options.skipReviewAnalysis || options.pricesOnly || product.pricesOnly
    );
    if (shouldSkipReviewAnalysis) {
      platLogger.info(
        'ingest.review_analysis_skipped_prices_only',
        'Review analysis skipped for price-only ingest.',
        { productId, masterId }
      );
    } else {
      try {
        const { data: storedReviews, error: storedErr } = await this.supabase
          .from('reviews')
          .select(
            'id, platform_review_id, author_name, rating_star, comment, variation, images, is_verified_buyer, reviewer_type, upvotes, downvotes, report_count, platform_created_at'
          )
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(200);

        // Reviewer metadata is not persisted yet; attach what this scrape saw so the analyzer can use it.
        const reviewerByPlatformId = new Map(
          (product.reviews || [])
            .filter(r => r.reviewer)
            .map(r => [platformReviewIdFor(r), r.reviewer] as const)
        );
        const analysisInput: ReviewInputItem[] = (storedReviews || [])
          .filter(row => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
          .map((row: ReviewInputItem & { platform_review_id?: string | null }) => ({
            ...row,
            reviewer: row.platform_review_id
              ? reviewerByPlatformId.get(row.platform_review_id)
              : undefined,
          }));

        if (storedErr) {
          platLogger.warn(
            'ingest.review_analysis_skipped',
            `Review analysis skipped (fetch failed): ${storedErr.message}`,
            { productId }
          );
        } else if (analysisInput.length > 0) {
          // No variant: no peer floor, since peers and min price are per variant.
          const [{ data: masterRow }, { data: peerRows }] = !masterId
            ? [{ data: null }, { data: null }]
            : await Promise.all([
                this.supabase
                  .from('master_products')
                  .select('min_price')
                  .eq('id', masterId)
                  .maybeSingle(),
                (() => {
                  const q = this.supabase
                    .from('products')
                    .select('id, price_current, merchants(is_official)')
                    .eq('cluster_id', masterId)
                    .gt('price_current', 0);
                  const withLte =
                    typeof (q as unknown as { lte?: (col: string, val: number) => typeof q })
                      .lte === 'function'
                      ? q.lte('price_current', MAX_VALID_VND_PRICE)
                      : q;
                  return withLte.limit(100);
                })(),
              ]);

          const rawMasterMinPrice = masterRow?.min_price;
          const parsedMasterMinPrice =
            typeof rawMasterMinPrice === 'number'
              ? rawMasterMinPrice
              : typeof rawMasterMinPrice === 'string'
                ? (() => {
                    const cleaned = rawMasterMinPrice.replace(/\p{Cc}+/gu, '').trim();
                    return cleaned && !/^0[xob]/i.test(cleaned) ? Number(cleaned) : Number.NaN;
                  })()
                : Number.NaN;
          const canonicalMinPrice = resolveClusterPeerFloorPrice(
            Array.isArray(peerRows) ? (peerRows as ClusterPeerPriceCandidate[]) : [],
            productId,
            Number.isFinite(parsedMasterMinPrice) &&
              parsedMasterMinPrice > 0 &&
              parsedMasterMinPrice <= MAX_VALID_VND_PRICE
              ? parsedMasterMinPrice
              : undefined
          );

          const { summary, merchantRisk } = await this.reviewAnalyzer.persistAnalysisToSupabase(
            this.supabase,
            {
              productId,
              masterId,
              merchantId,
              reviews: analysisInput,
              entityName: candidate.name,
              entityType: 'product',
              platform,
              listingPrice: product.priceMin,
              canonicalMinPrice,
              isOfficial: product.shop.isMall,
              followerCount: product.shop.followerCount,
            }
          );
          // persistAnalysisToSupabase scored the seller from this product's
          // reviews only; store the seller-wide score instead (DOS/Rate#698).
          if (merchantId) {
            try {
              const sellerWide = await rescoreMerchantReviewRisk(
                this.supabase,
                this.reviewAnalyzer,
                merchantId
              );
              platLogger.info(
                'ingest.review_risk_rescored',
                `Seller review risk ${sellerWide?.risk.risk_score ?? 'n/a'} from ${sellerWide?.risk.total_reviews ?? 0} reviews.`,
                {
                  merchantId,
                  reviewRiskScore: sellerWide?.risk.risk_score ?? null,
                  totalReviews: sellerWide?.risk.total_reviews ?? 0,
                }
              );
            } catch (err: unknown) {
              platLogger.warn(
                'ingest.review_risk_rescore_failed',
                `Seller-wide review risk rescore failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
                { merchantId }
              );
            }
          }
          platLogger.info(
            'ingest.review_analysis_completed',
            `Review analysis: ${summary.authentic_review_count}/${summary.total_reviews_analyzed} authentic, weighted rating ${summary.user_rating_weighted}/5, merchant risk ${merchantRisk?.risk_score ?? 'n/a'} (${merchantRisk?.risk_level ?? 'n/a'}).`,
            {
              productId,
              masterId,
              authenticCount: summary.authentic_review_count,
              totalAnalyzed: summary.total_reviews_analyzed,
              weightedRating: summary.user_rating_weighted,
              merchantRiskScore: merchantRisk?.risk_score ?? null,
            }
          );
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        platLogger.warn(
          'ingest.review_analysis_failed',
          `Review analysis failed (non-fatal): ${errMsg}`,
          { productId }
        );
      }
    }

    platLogger.info(
      'ingest.completed',
      `Product ingestion complete! (Master: ${masterId}, Product: ${productId})`,
      { masterId, productId, merchantId }
    );
    return { productId, merchantId, masterId, itemId, platform };
  }
}
