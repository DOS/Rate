import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import { ShopeeIngestionPipeline, normalizeScrapedProductPrices } from '../shopee-to-supabase.js';
import { mergeProductSpecifications, sanitizeSpecifications } from '../ai-spec-enricher.js';
import { aiCategoryOpen, getRatingCriteriaVersion } from '../review-ai-prompt.js';
import { buildRequests } from '../jobs/review-ai-points.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

function baseProduct(overrides: Partial<ShopeeProduct> = {}): ShopeeProduct {
  return {
    platform: 'shopee',
    itemId: 'e1-e2-item-1',
    shopId: 'e1-e2-shop-1',
    url: 'https://shopee.vn/product/1/1',
    title: 'Smart Tivi Samsung 4K 55 inch UA55DU7000',
    priceMin: 11990000,
    priceMax: 12990000,
    currency: 'VND',
    historicalSold: 12,
    ratingStar: 4.9,
    ratingCount: 5,
    images: ['https://rate.vn/img/tv.png'],
    models: [],
    attributes: [],
    shop: {
      shopId: 'e1-e2-shop-1',
      name: 'Dien May Test',
      isMall: true,
    },
    reviews: [],
    ...overrides,
  };
}

test('ProductNormalizer handles Wave E1 appliance categories, SKUs, and sizeless templates', () => {
  const normalizer = new ProductNormalizer();

  const tv = normalizer.normalize(
    baseProduct({
      title: 'Smart Tivi Samsung 4K 55 inch UA55DU7000',
    })
  );
  assert.equal(tv.category_slug, 'tvs');
  assert.equal(tv.brand, 'Samsung');
  assert.equal(tv.model, 'UA55DU7000');
  assert.equal(tv.model_key, 'samsung:ua55du7000:unknown');
  assert.equal(tv.storage_gb, null);
  assert.equal(tv.ram_gb, null);
  assert.equal(tv.has_5g, false);
  assert.equal(tv.screen_size_inch, 55);
  assert.equal(tv.variant_known, true);
  assert.equal(tv.entity_type, 'product');

  const ac = normalizer.normalize(
    baseProduct({
      title: 'Điều hòa Daikin Inverter 1 HP FTKB25YVMV',
    })
  );
  assert.equal(ac.category_slug, 'air-conditioners');
  assert.equal(ac.brand, 'Daikin');
  assert.equal(ac.model_key, 'daikin:ftkb25yvmv:unknown');
  assert.equal(ac.storage_gb, null);
  assert.equal(ac.screen_size_inch, null);
  assert.equal(ac.has_5g, false);
  assert.equal(ac.variant_known, true);

  const fridge = normalizer.normalize(
    baseProduct({
      title: 'Tủ lạnh Panasonic Inverter 255 lít NR-TV261BPKV',
    })
  );
  assert.equal(fridge.category_slug, 'refrigerators');
  assert.equal(fridge.brand, 'Panasonic');
  assert.equal(fridge.model_key, 'panasonic:nr-tv261bpkv:unknown');
  assert.equal(fridge.storage_gb, null);
  assert.equal(fridge.variant_known, true);

  const washer = normalizer.normalize(
    baseProduct({
      title: 'Máy giặt LG AI DD Inverter 10 kg FV1410S4P',
    })
  );
  assert.equal(washer.category_slug, 'washing-machines');
  assert.equal(washer.brand, 'LG');
  assert.equal(washer.model_key, 'lg:fv1410s4p:unknown');
  assert.equal(washer.storage_gb, null);
  assert.equal(washer.variant_known, true);

  const purifier = normalizer.normalize(
    baseProduct({
      title: 'Máy lọc không khí Xiaomi Smart Air Purifier 4',
    })
  );
  assert.equal(purifier.category_slug, 'air-purifiers');
  assert.equal(purifier.brand, 'Xiaomi');
  assert.equal(purifier.model_key, 'xiaomi:smart-air-purifier-4:unknown');
  assert.equal(purifier.storage_gb, null);
  assert.equal(purifier.variant_known, true);

  const sharpPurifier = normalizer.normalize(
    baseProduct({
      title: 'Máy lọc không khí Sharp FP-J30E-A',
    })
  );
  assert.equal(sharpPurifier.category_slug, 'air-purifiers');
  assert.equal(sharpPurifier.brand, 'Sharp');
  assert.equal(sharpPurifier.model_key, 'sharp:fp-j30e-a:unknown');

  // Streaming box stays sized and outside tvs; iPad WiFi never flips to internet-telecom.
  const appleTv = normalizer.normalize(
    baseProduct({
      title: 'Apple TV 4K 64GB - Smart TV Box with Siri Remote',
    })
  );
  assert.notEqual(appleTv.category_slug, 'tvs');
  assert.equal(appleTv.model_key, 'apple:tv-4k:64gb');

  assert.equal(detectCategorySlug('iPad Pro 11 M4 WiFi 256GB'), 'tablets');
});

test('ProductNormalizer handles Wave E2 services, distinct plan durations, and metadata', () => {
  const normalizer = new ProductNormalizer();

  const savings6 = normalizer.normalize(
    baseProduct({
      platform: 'vietcombank',
      entityType: 'service',
      categorySlug: 'bank-savings',
      url: 'https://www.vietcombank.com.vn/rates',
      title: 'Vietcombank Tiền gửi tiết kiệm trực tuyến 6 tháng',
      priceMin: 3.5,
      priceMax: 3.5,
      currency: 'PCT',
      metadata: { term_months: 6 },
    })
  );
  const savings12 = normalizer.normalize(
    baseProduct({
      platform: 'vietcombank',
      entityType: 'service',
      categorySlug: 'bank-savings',
      url: 'https://www.vietcombank.com.vn/rates',
      title: 'Vietcombank Tiền gửi tiết kiệm trực tuyến 12 tháng',
      priceMin: 5.4,
      priceMax: 5.4,
      currency: 'PCT',
      metadata: { term_months: 12 },
    })
  );
  assert.equal(savings6.category_slug, 'bank-savings');
  assert.equal(savings6.brand, 'Vietcombank');
  assert.equal(savings6.entity_type, 'service');
  assert.equal(savings6.variant_known, true);
  assert.equal(savings6.has_5g, false);
  assert.deepEqual(savings6.metadata, { term_months: 6 });
  assert.notEqual(savings6.model_key, savings12.model_key);

  const internet = normalizer.normalize(
    baseProduct({
      platform: 'vnpt',
      url: 'https://vnpt.com.vn/goi-cuoc',
      title: 'VNPT Gói cước Home Net 3 250Mbps',
      priceMin: 210000,
      priceMax: 210000,
      currency: 'VND',
    })
  );
  assert.equal(internet.category_slug, 'internet-telecom');
  assert.equal(internet.brand, 'VNPT');
  assert.equal(internet.entity_type, 'service');
  assert.equal(internet.model_key, 'vnpt:goi-cuoc-home-net-3-250mbps:unknown');

  const fpt5g = normalizer.normalize(
    baseProduct({
      platform: 'fpttelecom',
      categorySlug: 'internet-telecom',
      url: 'https://fpt.vn/internet',
      title: 'FPT Telecom Gói cước Internet Giga 5G',
      priceMin: 180000,
      priceMax: 180000,
      currency: 'VND',
    })
  );
  assert.equal(fpt5g.brand, 'FPT Telecom');
  assert.equal(fpt5g.has_5g, false);
});

test('normalizeScrapedProductPrices preserves decimal PCT rates and rounds VND', () => {
  const pct = normalizeScrapedProductPrices({
    platform: 'vietcombank',
    itemId: 'vcb-12m',
    shopId: 'vietcombank',
    url: 'https://www.vietcombank.com.vn/rates',
    title: 'Vietcombank 12M Savings',
    priceMin: 0.15,
    priceMax: 5.4,
    priceBeforeDiscount: 5.75,
    currency: 'PCT',
    historicalSold: 0,
    ratingStar: 0,
    ratingCount: 0,
    images: [],
    models: [{ modelId: 'm1', name: '12M', price: 5.4 }],
    attributes: [],
    shop: { shopId: 'vietcombank', name: 'Vietcombank', isMall: true },
    reviews: [],
  });
  assert.equal(pct.currency, 'PCT');
  assert.equal(pct.priceMin, 0.15);
  assert.equal(pct.priceMax, 5.4);
  assert.equal(pct.priceBeforeDiscount, 5.75);
  assert.equal(pct.models[0]?.price, 5.4);

  const vnd = normalizeScrapedProductPrices({
    platform: 'shopee',
    itemId: 'tv-1',
    shopId: 'shop-1',
    url: 'https://shopee.vn/product/1/1',
    title: 'Smart Tivi Samsung UA55DU7000',
    priceMin: 11990000.4,
    priceMax: 12990000.6,
    currency: 'VND',
    historicalSold: 0,
    ratingStar: 0,
    ratingCount: 0,
    images: [],
    models: [],
    attributes: [],
    shop: { shopId: 'shop-1', name: 'DMX', isMall: true },
    reviews: [],
  });
  assert.equal(vnd.currency, 'VND');
  assert.equal(vnd.priceMin, 11990000);
  assert.equal(vnd.priceMax, 12990001);
});

test('ShopeeIngestionPipeline refuses silent smartphone fallback when Wave E1/E2 category is absent', async () => {
  const db = {
    rpc(fn: string) {
      if (fn === 'match_master_product') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      if (table === 'categories') {
        return {
          select() {
            return Promise.resolve({
              data: [{ id: 'cat-smartphones', slug: 'smartphones' }],
              error: null,
            });
          },
        };
      }
      if (table === 'merchants') {
        return {
          upsert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 'm-1' }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as RateSupabaseClient;

  const pipeline = new ShopeeIngestionPipeline({ supabaseClient: db, itemModel: 'off' });
  await assert.rejects(
    pipeline.ingestProduct(
      baseProduct({
        title: 'Smart Tivi Samsung 4K 55 inch UA55DU7000',
      }),
      undefined,
      { pricesOnly: true }
    ),
    /Missing category_id for canonical slug "tvs"/
  );
});

test('review-ai-points and ai-spec-enricher support Wave E1 criteria v2 and custom spec groups', () => {
  assert.equal(aiCategoryOpen('tvs'), true);
  assert.equal(aiCategoryOpen('air-purifiers'), true);
  assert.equal(aiCategoryOpen('bank-savings'), false);
  assert.equal(aiCategoryOpen('internet-telecom'), false);
  assert.equal(getRatingCriteriaVersion('tvs'), 2);
  assert.equal(getRatingCriteriaVersion('smartphones'), 1);

  const built = buildRequests(
    [
      {
        id: 'rev-1',
        text: 'Tivi hình ảnh sắc nét, âm thanh rõ ràng, đáng tiền trong tầm giá',
        textHash: 'abc',
        category: 'tvs',
      },
    ],
    'dos'
  );
  assert.equal(built.manifest[0]?.criteria_version, 2);

  const sanitized = sanitizeSpecifications({
    category_slug: 'air-conditioners',
    cooling: { capacity_btu: 9000, refrigerant: 'R32' },
    __proto__: { polluted: true },
  });
  assert.deepEqual((sanitized as Record<string, unknown>).cooling, {
    capacity_btu: 9000,
    refrigerant: 'R32',
  });
  const merged = mergeProductSpecifications(sanitized, {
    cooling: { area_m2: '15m2' },
  });
  assert.deepEqual((merged as Record<string, unknown>).cooling, {
    capacity_btu: 9000,
    refrigerant: 'R32',
    area_m2: '15m2',
  });
});

test('P0 #2: ProductNormalizer and ingestProduct preserve both camelCase and snake_case category_slug and entity_type hints', async () => {
  const normalizer = new ProductNormalizer();
  const snakeNormalized = normalizer.normalize(
    baseProduct({
      platform: 'shopee',
      title: 'Xiaomi Smart 4 Pro',
      category_slug: 'air-purifiers',
      entity_type: 'service',
    })
  );
  assert.equal(snakeNormalized.category_slug, 'air-purifiers');
  assert.equal(snakeNormalized.entity_type, 'service');

  const insertedMasters: Array<Record<string, unknown>> = [];
  const upsertedProducts: Array<Record<string, unknown>> = [];

  const createQueryBuilder = (rows: Array<Record<string, unknown>>) => {
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      in() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return Promise.resolve({ data: rows, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return chain;
  };

  const db = {
    rpc(fn: string) {
      if (fn === 'match_master_product') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      if (table === 'categories') {
        return {
          select() {
            return Promise.resolve({
              data: [
                { id: 'cat-smartphones', slug: 'smartphones' },
                { id: 'cat-air-purifiers', slug: 'air-purifiers' },
              ],
              error: null,
            });
          },
        };
      }
      if (table === 'merchants') {
        return {
          upsert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 'm-1' }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'master_products') {
        const writeHandler = (payload: Record<string, unknown>) => {
          insertedMasters.push(payload);
          const rows = [{ id: 'master-purifier-1' }];
          return {
            select() {
              const res = { data: rows, error: null };
              return Object.assign(Promise.resolve(res), {
                single() {
                  return Promise.resolve({ data: rows[0], error: null });
                },
                maybeSingle() {
                  return Promise.resolve({ data: rows[0], error: null });
                },
              });
            },
          };
        };
        return {
          select() {
            return createQueryBuilder([]);
          },
          insert: writeHandler,
          upsert: writeHandler,
          update() {
            return createQueryBuilder([]);
          },
        };
      }
      if (table === 'products') {
        return {
          select() {
            return createQueryBuilder([]);
          },
          upsert(payload: Record<string, unknown>) {
            upsertedProducts.push(payload);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 'prod-purifier-1' }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'price_history') {
        return {
          select() {
            return createQueryBuilder([]);
          },
          insert() {
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as RateSupabaseClient;

  const pipeline = new ShopeeIngestionPipeline({ supabaseClient: db, itemModel: 'off' });
  const result = await pipeline.ingestProduct(
    baseProduct({
      platform: 'shopee',
      title: 'Xiaomi Smart 4 Pro',
      categorySlug: 'air-purifiers',
      entityType: 'service',
      priceMin: 3990000,
      priceMax: 3990000,
    }),
    undefined,
    { pricesOnly: true }
  );

  assert.equal(result.masterId, 'master-purifier-1');
  assert.equal(insertedMasters[0]?.category_id, 'cat-air-purifiers');
  assert.equal(insertedMasters[0]?.entity_type, 'service');
  assert.equal(upsertedProducts[0]?.category_id, 'cat-air-purifiers');

  const snakeResult = await pipeline.ingestProduct(
    baseProduct({
      platform: 'shopee',
      itemId: 'e1-e2-item-2',
      title: 'Xiaomi Smart 4 Lite',
      category_slug: 'air-purifiers',
      entity_type: 'service',
      priceMin: 2490000,
      priceMax: 2490000,
    }),
    undefined,
    { pricesOnly: true }
  );
  assert.equal(snakeResult.masterId, 'master-purifier-1');
  assert.equal(insertedMasters[1]?.category_id, 'cat-air-purifiers');
  assert.equal(insertedMasters[1]?.entity_type, 'service');
  assert.equal(upsertedProducts[1]?.category_id, 'cat-air-purifiers');
});
