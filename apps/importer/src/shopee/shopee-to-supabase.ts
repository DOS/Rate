/**
 * Ingestion pipeline: Multi-Platform Scraped Data (Shopee, Lazada, Tiki, CellphoneS, TGDD) -> Supabase Cloud Schema `rate`
 * Uses 2-Tier Architecture (rate.master_products + rate.products)
 * Automatic 10 Field Groups Normalization & Entity Matching via Postgres
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ShopeeProduct, SupportedEcommercePlatform } from './types.js';
import { ProductNormalizer } from './product-normalizer.js';
import { EntityMatcher } from './entity-matcher.js';
import { AiSpecEnricher, type AiSpecEnricherConfig } from './ai-spec-enricher.js';
import { AiReviewAnalyzer } from './ai-review-analyzer.js';

dotenv.config();

function hashEntity(val: string): string {
  return '0x' + crypto.createHash('sha256').update(val.toLowerCase()).digest('hex');
}

export class ShopeeIngestionPipeline {
  private supabase: SupabaseClient<any, 'rate'>;
  private normalizer: ProductNormalizer;
  private matcher: EntityMatcher;
  private enricher: AiSpecEnricher;
  private reviewAnalyzer: AiReviewAnalyzer;
  private smartphoneCategoryId: string | null = null;
  private categoryIdBySlug = new Map<string, string>();

  constructor(aiConfig?: AiSpecEnricherConfig) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    }

    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Scope to rate schema
    this.supabase = (admin as any).schema('rate');
    this.normalizer = new ProductNormalizer();
    this.enricher = new AiSpecEnricher(aiConfig);
    this.reviewAnalyzer = new AiReviewAnalyzer(aiConfig);
    this.matcher = new EntityMatcher(this.supabase, this.enricher);
  }

  /**
   * Initializes category lookup across all 5 tech categories
   */
  public async init(): Promise<void> {
    const { data: cats } = await this.supabase.from('categories').select('id, slug');

    for (const c of cats || []) {
      this.categoryIdBySlug.set(c.slug, c.id);
      if (c.slug === 'smartphones') {
        this.smartphoneCategoryId = c.id;
      }
    }

    const aiInfo = this.enricher.getProviderInfo();
    console.log(
      `[MultiPlatformIngest] AI Spec Enricher status: provider=${aiInfo.provider}, model=${aiInfo.model}, configured=${aiInfo.configured}`
    );
  }

  /**
   * Ingest a full e-commerce product (Shopee, Lazada, Tiki, CellphoneS, TGDD) into rate schema
   * with canonical Master Product deduplication.
   */
  public async ingestProduct(
    product: ShopeeProduct,
    report?: (section: 'merchant' | 'master' | 'listing' | 'price' | 'reviews') => Promise<void>
  ): Promise<{
    productId: string;
    merchantId: string;
    masterId: string;
    platform: SupportedEcommercePlatform;
  }> {
    if (this.categoryIdBySlug.size === 0) {
      await this.init();
    }

    const platform: SupportedEcommercePlatform = product.platform || 'shopee';

    console.log(`\n================================================================`);
    console.log(`[MultiPlatformIngest:${platform}] Processing: "${product.title}"`);
    console.log(`================================================================`);

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
    console.log(
      `[MultiPlatformIngest:${platform}] Merchant resolved: ${product.shop.name} -> ID: ${merchantId}`
    );
    await report?.('merchant');

    // 2. Normalize Specs & Match / Seed Master Product
    const candidate = this.normalizer.normalize(product);
    const resolvedCategoryId =
      this.categoryIdBySlug.get(candidate.category_slug || 'smartphones') ||
      this.smartphoneCategoryId;

    console.log(
      `[MultiPlatformIngest:${platform}] Specs normalized -> Key: "${candidate.model_key}", Category: ${candidate.category_slug || 'smartphones'}, RAM: ${candidate.ram_gb}GB, Storage: ${candidate.storage_gb}GB`
    );

    const { masterId, isNew } = await this.matcher.resolveOrCreateMasterProduct(
      candidate,
      resolvedCategoryId || undefined,
      product.title
    );
    console.log(
      `[MultiPlatformIngest:${platform}] Master Product ${isNew ? 'CREATED' : 'LINKED'}: ID = ${masterId}`
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
          stock: product.stock || 0,
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
    console.log(`[MultiPlatformIngest:${platform}] Listing upserted -> ID: ${productId}`);
    await report?.('listing');

    // 4. Smart Delta Price Compression + stable observation_id
    // Only record a new row in rate.price_history when:
    //   (a) there is no prior observation, OR
    //   (b) price or price_original changed vs the latest observation, OR
    //   (c) the latest observation is >= 7 days old (weekly heartbeat anchor for charts)
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
      console.log(
        `[MultiPlatformIngest:${platform}] Delta Price Compression: price unchanged (${currentPrice.toLocaleString('vi-VN')}₫, last anchor ${String(latestObs.recorded_at).slice(0, 10)}), skipping redundant history row.`
      );
    } else {
      const dayBucket = new Date().toISOString().slice(0, 10);
      const observationId =
        'px-' +
        crypto
          .createHash('sha256')
          .update(
            `${productId}|${product.priceMin}|${product.priceBeforeDiscount || ''}|${dayBucket}`
          )
          .digest('hex');

      const { data: existingPrice, error: priceLookupErr } = await this.supabase
        .from('price_history')
        .select('observation_id')
        .eq('observation_id', observationId)
        .limit(1);
      if (priceLookupErr) {
        throw new Error(`Failed to check existing price observation: ${priceLookupErr.message}`);
      }
      if (Array.isArray(existingPrice) && existingPrice.length > 0) {
        console.log(
          `[MultiPlatformIngest:${platform}] Price observation already recorded (${observationId}), skipping.`
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
            console.warn(
              '[MultiPlatformIngest] Concurrent price observation insert lost the race; treated as dedupe.'
            );
          } else {
            throw new Error(
              `Failed to record price history (observation ${observationId}): ${priceErr.message}`
            );
          }
        }
      }
    }
    await report?.('price');

    // 5. Batch insert reviews if available
    if (product.reviews && product.reviews.length > 0) {
      const reviewRows = product.reviews.map(r => ({
        product_id: productId,
        platform_review_id:
          r.reviewId ||
          'rv-' +
            crypto
              .createHash('sha256')
              .update(`${r.author || ''}|${r.comment || ''}`)
              .digest('hex'),
        author_name: r.author,
        author_avatar: r.authorAvatar || null,
        rating_star: r.ratingStar,
        comment: r.comment,
        variation: r.variation || null,
        images: r.images || [],
        platform_created_at: r.createdAt,
      }));

      const { data: existingReviews, error: existingErr } = await this.supabase
        .from('reviews')
        .select('platform_review_id')
        .eq('product_id', productId)
        .not('platform_review_id', 'is', null);
      if (existingErr) {
        throw new Error(`Failed to fetch existing reviews: ${existingErr.message}`);
      }
      const seen = new Set<string>(
        (existingReviews || []).map((r: { platform_review_id: string }) => r.platform_review_id)
      );
      const newRows = reviewRows.filter(r => {
        if (!r.platform_review_id) return true;
        if (seen.has(r.platform_review_id)) return false;
        seen.add(r.platform_review_id);
        return true;
      });

      if (newRows.length === 0) {
        console.log(
          `[MultiPlatformIngest:${platform}] No new reviews to ingest (${seen.size} duplicates skipped).`
        );
      } else {
        let pending = newRows;
        for (let pass = 0; pass < 2; pass++) {
          const { error: reviewErr } = await this.supabase.from('reviews').insert(pending);
          if (!reviewErr) {
            console.log(
              `[MultiPlatformIngest:${platform}] Successfully ingested ${pending.length} reviews (batch pass ${pass + 1}).`
            );
            pending = [];
            break;
          }
          const code = (reviewErr as { code?: string }).code || '';
          const isRace = code === '23505' || /duplicate key/i.test(reviewErr.message);
          if (!isRace || pass > 0) {
            throw new Error(`Failed to insert reviews: ${reviewErr.message}`);
          }
          console.warn(
            '[MultiPlatformIngest] Review batch hit a unique-index race; retrying the remainder.'
          );
          const { data: existingNow, error: refetchErr } = await this.supabase
            .from('reviews')
            .select('platform_review_id')
            .eq('product_id', productId)
            .not('platform_review_id', 'is', null);
          if (refetchErr) {
            throw new Error(`Failed to refetch reviews after race: ${refetchErr.message}`);
          }
          const nowSeen = new Set<string>(
            (existingNow || []).map((r: { platform_review_id: string }) => r.platform_review_id)
          );
          pending = pending.filter(r => !nowSeen.has(r.platform_review_id as string));
        }
        if (pending.length > 0) {
          throw new Error(
            `Failed to insert reviews: unexplained retry state (${pending.length} rows left)`
          );
        }
      }
      await report?.('reviews');
    }

    // 6. Review analysis + JReviews-style weighted rating + merchant risk score
    try {
      const { data: storedReviews, error: storedErr } = await this.supabase
        .from('reviews')
        .select(
          'id, author_name, rating_star, comment, variation, images, is_verified_buyer, reviewer_type, upvotes, downvotes, report_count, platform_created_at'
        )
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (storedErr) {
        console.warn(
          `[MultiPlatformIngest:${platform}] Review analysis skipped (fetch failed): ${storedErr.message}`
        );
      } else if (storedReviews && storedReviews.length > 0) {
        const { data: masterRow } = await this.supabase
          .from('master_products')
          .select('min_price')
          .eq('id', masterId)
          .maybeSingle();

        const { summary, merchantRisk } = await this.reviewAnalyzer.persistAnalysisToSupabase(
          this.supabase,
          {
            productId,
            masterId,
            merchantId,
            reviews: storedReviews,
            entityName: candidate.name,
            entityType: 'product',
            platform,
            listingPrice: product.priceMin,
            canonicalMinPrice: masterRow?.min_price ? Number(masterRow.min_price) : undefined,
            isOfficial: product.shop.isMall,
            followerCount: product.shop.followerCount,
          }
        );
        console.log(
          `[MultiPlatformIngest:${platform}] Review analysis: ${summary.authentic_review_count}/${summary.total_reviews_analyzed} authentic, weighted rating ${summary.user_rating_weighted}/5, merchant risk ${merchantRisk?.risk_score ?? 'n/a'} (${merchantRisk?.risk_level ?? 'n/a'}).`
        );
      }
    } catch (err: any) {
      console.warn(
        `[MultiPlatformIngest:${platform}] Review analysis failed (non-fatal): ${err?.message || err}`
      );
    }

    console.log(
      `[MultiPlatformIngest:${platform}] Product ingestion complete! (Master: ${masterId}, Product: ${productId})`
    );
    return { productId, merchantId, masterId, platform };
  }
}
