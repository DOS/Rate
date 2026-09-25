/**
 * Ingestion pipeline: Shopee Scraped Data -> Supabase Cloud Schema `rate`
 * Uses 2-Tier Architecture (rate.master_products + rate.products)
 * Automatic 10 Field Groups Normalization & Entity Matching via Postgres
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ShopeeProduct } from './shopee-scraper.js';
import { ProductNormalizer } from './product-normalizer.js';
import { EntityMatcher } from './entity-matcher.js';

dotenv.config();

function hashEntity(val: string): string {
  return '0x' + crypto.createHash('sha256').update(val.toLowerCase()).digest('hex');
}

export class ShopeeIngestionPipeline {
  private supabase: SupabaseClient<any, 'rate'>;
  private normalizer: ProductNormalizer;
  private matcher: EntityMatcher;
  private smartphoneCategoryId: string | null = null;

  constructor() {
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
    this.matcher = new EntityMatcher(this.supabase);
  }

  /**
   * Initializes category lookup
   */
  public async init(): Promise<void> {
    const { data: cat } = await this.supabase
      .from('categories')
      .select('id')
      .eq('slug', 'smartphones')
      .maybeSingle();

    if (cat) {
      this.smartphoneCategoryId = cat.id;
    }
  }

  /**
   * Ingest a full Shopee product into rate schema with Master Product deduplication
   */
  public async ingestProduct(product: ShopeeProduct): Promise<{
    productId: string;
    merchantId: string;
    masterId: string;
  }> {
    if (!this.smartphoneCategoryId) {
      await this.init();
    }

    console.log(`\n================================================================`);
    console.log(`[ShopeeIngest] Processing: "${product.title}"`);
    console.log(`================================================================`);

    // 1. Upsert merchant
    const entityHash = hashEntity(`shopee:${product.shop.shopId}`);
    const { data: merchant, error: merchantErr } = await this.supabase
      .from('merchants')
      .upsert(
        {
          platform: 'shopee',
          platform_shop_id: product.shop.shopId,
          name: product.shop.name,
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
    console.log(`[ShopeeIngest] Merchant resolved: ${product.shop.name} -> ID: ${merchantId}`);

    // 2. Normalize Specs & Match / Seed Master Product
    const candidate = this.normalizer.normalize(product);
    console.log(`[ShopeeIngest] Specs normalized -> Key: "${candidate.model_key}", RAM: ${candidate.ram_gb}GB, Storage: ${candidate.storage_gb}GB`);

    const { masterId, isNew } = await this.matcher.resolveOrCreateMasterProduct(
      candidate,
      this.smartphoneCategoryId || undefined
    );
    console.log(`[ShopeeIngest] Master Product ${isNew ? 'CREATED' : 'LINKED'}: ID = ${masterId}`);

    // 3. Upsert product listing into rate.products (linked via cluster_id)
    const { data: savedProduct, error: productErr } = await this.supabase
      .from('products')
      .upsert(
        {
          merchant_id: merchantId,
          cluster_id: masterId, // FK to rate.master_products
          category_id: this.smartphoneCategoryId,
          platform: 'shopee',
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
    console.log(`[ShopeeIngest] Listing upserted -> ID: ${productId}`);

    // 4. Insert price history entry
    await this.supabase.from('price_history').insert({
      product_id: productId,
      price: product.priceMin,
      price_original: product.priceBeforeDiscount || null,
      recorded_at: new Date().toISOString(),
      source: 'shopee_crawler',
    });

    // 5. Batch insert reviews if available
    if (product.reviews && product.reviews.length > 0) {
      const reviewRows = product.reviews.map((r) => ({
        product_id: productId,
        platform_review_id: r.reviewId || undefined,
        author_name: r.author,
        author_avatar: r.authorAvatar || null,
        rating_star: r.ratingStar,
        comment: r.comment,
        variation: r.variation || null,
        images: r.images || [],
        platform_created_at: r.createdAt,
      }));

      const { error: reviewErr } = await this.supabase
        .from('reviews')
        .upsert(reviewRows, { onConflict: 'platform_review_id', ignoreDuplicates: true });

      if (reviewErr) {
        console.warn(`[ShopeeIngest] Warning: Reviews insert partial error: ${reviewErr.message}`);
      } else {
        console.log(`[ShopeeIngest] Successfully ingested ${reviewRows.length} reviews.`);
      }
    }

    console.log(`[ShopeeIngest] Product ingestion complete! (Master: ${masterId}, Product: ${productId})`);
    return { productId, merchantId, masterId };
  }
}
