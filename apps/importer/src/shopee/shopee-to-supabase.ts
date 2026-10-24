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
import { ProductNormalizer } from './product-normalizer.js';
import { EntityMatcher, sanitizeHttpUrl, sanitizeHttpUrlList } from './entity-matcher.js';
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

export function platformReviewIdFor(r: ShopeeReview): string {
  const safeReview = r && typeof r === 'object' ? r : ({} as Partial<ShopeeReview>);
  const cleanId =
    typeof safeReview.reviewId === 'string'
      ? safeReview.reviewId.replace(/\p{Cc}+/gu, '').trim()
      : '';
  if (cleanId.length > 0 && cleanId.length <= 160) {
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
  if (!product || typeof product !== 'object') {
    throw new Error('normalizeScrapedProductPrices requires a non-null product object');
  }
  const priceMin = typeof product.priceMin === 'boolean' ? 0 : Number(product.priceMin);
  const rawPriceMax = typeof product.priceMax === 'boolean' ? Number.NaN : Number(product.priceMax);
  const priceMax =
    Number.isFinite(rawPriceMax) && rawPriceMax >= priceMin && rawPriceMax <= MAX_VALID_VND_PRICE
      ? rawPriceMax
      : priceMin;
  const rawBefore =
    product.priceBeforeDiscount !== undefined &&
    product.priceBeforeDiscount !== null &&
    typeof product.priceBeforeDiscount !== 'boolean'
      ? Number(product.priceBeforeDiscount)
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
    ? product.models.filter(m => {
        if (!m || typeof m !== 'object' || typeof m.price === 'boolean') return false;
        const p = Number(m.price);
        return Number.isFinite(p) && p > 0 && p <= MAX_VALID_VND_PRICE;
      })
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
  const shopUrl = sanitizeHttpUrl(product.shop?.url) ?? undefined;
  const reviews = Array.isArray(product.reviews)
    ? product.reviews.map(r => ({
        ...r,
        authorAvatar: sanitizeHttpUrl(r.authorAvatar) ?? undefined,
        images: sanitizeHttpUrlList(r.images),
        ...(r.videos !== undefined ? { videos: sanitizeHttpUrlList(r.videos) } : {}),
        ...(r.reviewer
          ? {
              reviewer: {
                ...r.reviewer,
                profileUrl: sanitizeHttpUrl(r.reviewer.profileUrl) ?? undefined,
              },
            }
          : {}),
      }))
    : [];
  return {
    ...product,
    priceMax,
    priceBeforeDiscount: validBeforeDiscount,
    historicalSold,
    ratingStar,
    ratingCount,
    images,
    models,
    shop: {
      ...product.shop,
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
}

export interface IngestOptions {
  /**
   * Master product this listing is already known to belong to. Used when it exists;
   * otherwise the listing goes through entity matching as usual.
   */
  masterIdHint?: string | null;
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
      const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

      if (!rawUrl.trim() || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
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
    this.matcher = new EntityMatcher(this.supabase, this.enricher);
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
    const safeProductId =
      typeof productId === 'string'
        ? productId
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 128)
        : '';
    if (!safeProductId || !Array.isArray(ids) || ids.length === 0) return found;
    const unique = [
      ...new Set(
        ids
          .filter((id): id is string => typeof id === 'string')
          .map(id =>
            id
              .replace(/\p{Cc}+/gu, '')
              .trim()
              .slice(0, 160)
          )
          .filter(Boolean)
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
        if (!r || typeof r !== 'object' || typeof r.platform_review_id !== 'string') continue;
        const cleanRevId = r.platform_review_id
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 160);
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
      const safeSlug =
        typeof c.slug === 'string'
          ? c.slug
              .replace(/\p{Cc}+/gu, '')
              .trim()
              .slice(0, 120)
          : '';
      const safeId =
        typeof c.id === 'string' && !/\p{Cc}/u.test(c.id.trim()) ? c.id.trim().slice(0, 128) : '';
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
    masterId: string;
    platform: SupportedEcommercePlatform;
  }> {
    if (!options || typeof options !== 'object') options = {};
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

    // 2. Normalize Specs & Match / Seed Master Product
    const candidate = this.normalizer.normalize(product);
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
    let hinted: { masterId: string; isNew: boolean } | null = null;
    const safeMasterIdHint =
      typeof options.masterIdHint === 'string'
        ? options.masterIdHint
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 128)
        : '';
    if (safeMasterIdHint) {
      const { data: hintRow, error: hintErr } = await this.supabase
        .from('master_products')
        .select('id, specifications')
        .eq('id', safeMasterIdHint)
        .maybeSingle();
      if (hintErr) {
        throw new Error(`Failed to verify masterIdHint (${safeMasterIdHint}): ${hintErr.message}`);
      }
      if (hintRow?.id) {
        hinted = { masterId: hintRow.id, isNew: false };
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
    const { masterId, isNew } =
      hinted ??
      (await this.matcher.resolveOrCreateMasterProduct(
        candidate,
        resolvedCategoryId || undefined,
        product.title
      ));
    platLogger.info(
      'ingest.master_resolved',
      `Master Product ${hinted ? 'LINKED (caller hint)' : isNew ? 'CREATED' : 'LINKED'}: ID = ${masterId}`,
      { masterId, isNew, hinted: Boolean(hinted) }
    );
    await report?.('master');

    // 3. Upsert product listing into rate.products (linked via cluster_id)
    const { data: savedProduct, error: productErr } = await this.supabase
      .from('products')
      .upsert(
        {
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
    if (typeof this.supabase.rpc === 'function') {
      const { error: marketStatsErr } = await this.supabase.rpc('refresh_master_market_stats', {
        p_master_id: masterId,
      });
      if (marketStatsErr) {
        platLogger.warn(
          'ingest.market_stats_rpc_warn',
          `Could not refresh master market stats via RPC: ${marketStatsErr.message}`,
          { masterId }
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

      const latestObs =
        Array.isArray(latestObsRows) && latestObsRows.length > 0 ? latestObsRows[0] : null;
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
        const analysisInput: ReviewInputItem[] = (storedReviews || []).map(
          (row: ReviewInputItem & { platform_review_id?: string | null }) => ({
            ...row,
            reviewer: row.platform_review_id
              ? reviewerByPlatformId.get(row.platform_review_id)
              : undefined,
          })
        );

        if (storedErr) {
          platLogger.warn(
            'ingest.review_analysis_skipped',
            `Review analysis skipped (fetch failed): ${storedErr.message}`,
            { productId }
          );
        } else if (storedReviews && storedReviews.length > 0) {
          const [{ data: masterRow }, { data: peerRows }] = await Promise.all([
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
                typeof (q as unknown as { lte?: (col: string, val: number) => typeof q }).lte ===
                'function'
                  ? q.lte('price_current', MAX_VALID_VND_PRICE)
                  : q;
              return withLte.limit(100);
            })(),
          ]);

          const canonicalMinPrice = resolveClusterPeerFloorPrice(
            Array.isArray(peerRows) ? (peerRows as ClusterPeerPriceCandidate[]) : [],
            productId,
            masterRow?.min_price ? Number(masterRow.min_price) : undefined
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
    return { productId, merchantId, masterId, platform };
  }
}
