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
   * Ingest a full Shopee product into rate schema with Master Product deduplication.
   * `report` (optional) is awaited after each section completes so a queue
   * worker can checkpoint progress. Ingest sections are idempotent upserts,
   * so a retried job simply re-runs them; the checkpoint trail is for
   * observability (which section a crash died in), not selective resume.
   */
  public async ingestProduct(
    product: ShopeeProduct,
    report?: (section: 'merchant' | 'master' | 'listing' | 'price' | 'reviews') => Promise<void>
  ): Promise<{
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
    await report?.('merchant');

    // 2. Normalize Specs & Match / Seed Master Product
    const candidate = this.normalizer.normalize(product);
    console.log(`[ShopeeIngest] Specs normalized -> Key: "${candidate.model_key}", RAM: ${candidate.ram_gb}GB, Storage: ${candidate.storage_gb}GB`);

    const { masterId, isNew } = await this.matcher.resolveOrCreateMasterProduct(
      candidate,
      this.smartphoneCategoryId || undefined
    );
    console.log(`[ShopeeIngest] Master Product ${isNew ? 'CREATED' : 'LINKED'}: ID = ${masterId}`);
    await report?.('master');

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
    await report?.('listing');

    // 4. Price history entry with a stable observation id (plan v7 §4.1,
    // Codex #8): re-crawls of the same price on the same day upsert instead of
    // duplicating, and insert errors are SURFACED (never silent).
    const dayBucket = new Date().toISOString().slice(0, 10);
    const observationId = 'px-' + crypto
      .createHash('sha256')
      // Scoped to the listing UUID (Codex: itemId alone is not cross-platform safe).
      .update(`${productId}|${product.priceMin}|${product.priceBeforeDiscount || ''}|${dayBucket}`)
      .digest('hex');
    // The unique index on observation_id is PARTIAL, which ON CONFLICT cannot
    // target (42P10, Codex blocker): dedupe client-side - fetch the id, insert
    // only when absent. Errors are SURFACED (never silent).
    const { data: existingPrice, error: priceLookupErr } = await this.supabase
      .from('price_history')
      .select('observation_id')
      .eq('observation_id', observationId)
      .limit(1);
    if (priceLookupErr) {
      throw new Error(`Failed to check existing price observation: ${priceLookupErr.message}`);
    }
    if (Array.isArray(existingPrice) && existingPrice.length > 0) {
      console.log(`[ShopeeIngest] Price observation already recorded (${observationId}), skipping.`);
    } else {
      const { error: priceErr } = await this.supabase.from('price_history').insert({
        product_id: productId,
        observation_id: observationId,
        price: product.priceMin,
        price_original: product.priceBeforeDiscount || null,
        recorded_at: new Date().toISOString(),
        source: 'shopee_crawler',
      });
      if (priceErr) {
        throw new Error(`Failed to record price history (observation ${observationId}): ${priceErr.message}`);
      }
    }
    await report?.('price');

    // 5. Batch insert reviews if available (the section checkpoint fires in
    // both branches - a zero-review ingest is still a completed section).
    if (product.reviews && product.reviews.length > 0) {
      const reviewRows = product.reviews.map((r) => ({
        product_id: productId,
        // Stable observation id fallback (plan v7 §4.1): reviews without a
        // platform id must not be re-inserted on every crawl. createdAt is
        // deliberately excluded from the hash - the scraper falls back to
        // now() when Shopee gives no ctime, minting a fresh id every recrawl
        // (Codex #7). author+comment is stable; two distinct reviews with
        // identical author+comment dedupe to one (accepted).
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

      // The unique index on (product_id, platform_review_id) is PARTIAL
      // (WHERE platform_review_id IS NOT NULL) so ON CONFLICT cannot target it
      // (42P10): dedupe client-side against existing ids, plain-insert new rows.
      const { data: existingReviews, error: existingErr } = await this.supabase
        .from('reviews')
        .select('platform_review_id')
        .eq('product_id', productId)
        .not('platform_review_id', 'is', null);
      if (existingErr) {
        throw new Error(`Failed to fetch existing reviews: ${existingErr.message}`);
      }
      const seen = new Set<string>((existingReviews || []).map((r: { platform_review_id: string }) => r.platform_review_id));
      const newRows = reviewRows.filter((r) => {
        if (!r.platform_review_id) return true;
        if (seen.has(r.platform_review_id)) return false;
        // In-batch dedupe (Codex round-2): two id-less reviews with the same
        // author+comment hash to the same id - inserting both violates the
        // partial unique index (23505). Keep the first, skip the rest.
        seen.add(r.platform_review_id);
        return true;
      });

      if (newRows.length === 0) {
        console.log(`[ShopeeIngest] No new reviews to ingest (${seen.size} duplicates skipped).`);
      } else {
        const { error: reviewErr } = await this.supabase.from('reviews').insert(newRows);
        if (reviewErr) {
          // Fail the whole ingestion (plan v7 §4.1, Codex blocker): a review
          // write failure must NOT let the caller ack the job as done.
          throw new Error(`Failed to insert reviews: ${reviewErr.message}`);
        }
        console.log(`[ShopeeIngest] Successfully ingested ${newRows.length} reviews (${reviewRows.length - newRows.length} duplicates skipped).`);
      }
      await report?.('reviews');
    } else {
      await report?.('reviews');
    }

    console.log(`[ShopeeIngest] Product ingestion complete! (Master: ${masterId}, Product: ${productId})`);
    return { productId, merchantId, masterId };
  }
}
