import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProductNormalizer,
  detectApplianceBrand,
  detectCategorySlug,
  sanitizeWaveE3StructuredBrand,
} from '../product-normalizer.js';
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

test('DOS/Rate#1911: detects VN/regional Wave E1 appliance brands and extracts SKUs past slash-joined specs', () => {
  const normalizer = new ProductNormalizer();

  const liveProdCases = [
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Livotec Inverter 1 HP DHV09J',
      brand: 'Livotec',
      model: 'DHV09J',
      modelKey: 'livotec:dhv09j:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa LENSON 1 chiều LF-09CX1...',
      brand: 'Lenson',
      model: 'LF-09CX1',
      modelKey: 'lenson:lf-09cx1:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Nagakawa Inverter 1 HP NIS-C09R2T62',
      brand: 'Nagakawa',
      model: 'NIS-C09R2T62',
      modelKey: 'nagakawa:nis-c09r2t62:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Coex 1 chiều Inverter 9000Btu/1Hp CA-09IN35',
      brand: 'Coex',
      model: 'CA-09IN35',
      modelKey: 'coex:ca-09in35:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Coex Inverter 430 Lít RS-4007MIB',
      brand: 'Coex',
      model: 'RS-4007MIB',
      modelKey: 'coex:rs-4007mib:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Funiki Inverter 430 lít HR SS8430SDG',
      brand: 'Funiki',
      model: 'SS8430SDG',
      modelKey: 'funiki:ss8430sdg:unknown',
    },
  ];

  for (const tc of liveProdCases) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, tc.brand, tc.title);
    assert.equal(out.model, tc.model, tc.title);
    assert.equal(out.model_key, tc.modelKey, tc.title);
  }

  const peerBrandCases = [
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Máy lạnh Comfee Inverter 1 HP CFS-10FWFF-V',
      brand: 'Comfee',
      model: 'CFS-10FWFF-V',
      modelKey: 'comfee:cfs-10fwff-v:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Reetech Inverter 1 HP RTV9-TC-BI',
      brand: 'Reetech',
      model: 'RTV9-TC-BI',
      modelKey: 'reetech:rtv9-tc-bi:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Sumikura APS/APO-092',
      brand: 'Sumikura',
      model: 'APS-APO-092',
      modelKey: 'sumikura:aps-apo-092:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Sanaky Inverter VH-209HP',
      brand: 'Sanaky',
      model: 'VH-209HP',
      modelKey: 'sanaky:vh-209hp:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Alaska Inverter BD-200',
      brand: 'Alaska',
      model: 'BD-200',
      modelKey: 'alaska:bd-200:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Hoa Phat Inverter HRF-180',
      brand: 'Hoa Phat',
      model: 'HRF-180',
      modelKey: 'hoa-phat:hrf-180:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Hòa Phát Inverter 1 HP HPMC10',
      brand: 'Hoa Phat',
      model: 'HPMC10',
      modelKey: 'hoa-phat:hpmc10:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Hoà Phát Side By Side 430 lít',
      brand: 'Hoa Phat',
      model: 'Side By Side 430 lít',
      modelKey: 'hoa-phat:side-by-side-430-lit:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Levoit Core 300S',
      brand: 'Levoit',
      model: 'Core 300S',
      modelKey: 'levoit:core-300s:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Winix Zero S AZSU330-HWE',
      brand: 'Winix',
      model: 'AZSU330-HWE',
      modelKey: 'winix:azsu330-hwe:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Cuckoo CAC-G0910FW',
      brand: 'Cuckoo',
      model: 'CAC-G0910FW',
      modelKey: 'cuckoo:cac-g0910fw:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Bluestone APB-9545',
      brand: 'Bluestone',
      model: 'APB-9545',
      modelKey: 'bluestone:apb-9545:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Blue Stone APB-9545',
      brand: 'Bluestone',
      model: 'APB-9545',
      modelKey: 'bluestone:apb-9545:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Elmich AP-3838',
      brand: 'Elmich',
      model: 'AP-3838',
      modelKey: 'elmich:ap-3838:unknown',
    },
  ];

  for (const tc of peerBrandCases) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, tc.brand, tc.title);
    assert.equal(out.model, tc.model, tc.title);
    assert.equal(out.model_key, tc.modelKey, tc.title);
  }
});

test('DOS/Rate#1911: ignores slash-joined spec tokens, preserves slash SKUs, and guards HP fallback across Wave E1', () => {
  const normalizer = new ProductNormalizer();

  const slashSpecCases = [
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Casper Inverter 12.000BTU/1.5HP GC-12IS35',
      brand: 'Casper',
      model: 'GC-12IS35',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Toshiba Inverter 220V/50Hz GR-RT252WE',
      brand: 'Toshiba',
      model: 'GR-RT252WE',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Daikin 9000Btu/h FTF25UV1V',
      brand: 'Daikin',
      model: 'FTF25UV1V',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Levoit 300m3/h LV-H133',
      brand: 'Levoit',
      model: 'LV-H133',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Winix 300m³/h AZBU330-HWK',
      brand: 'Winix',
      model: 'AZBU330-HWK',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Coway 65W/220V AP-1018F',
      brand: 'Coway',
      model: 'AP-1018F',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt sấy LG Inverter 10kg/7kg 1400rpm FV1410D4M1',
      brand: 'LG',
      model: 'FV1410D4M1',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Aqua Inverter 1.2kWh/24h 50/60Hz AQR-T239FA',
      brand: 'Aqua',
      model: 'AQR-T239FA',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Sony 4K/120Hz XR-55X90L',
      brand: 'Sony',
      model: 'XR-55X90L',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Daikin Inverter 1 HP FTKB25YVMV/RKB25YVMV',
      brand: 'Daikin',
      model: 'FTKB25YVMV-RKB25YVMV',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Sony HDMI2.1 XR-55X90L',
      brand: 'Sony',
      model: 'XR-55X90L',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi LG HDMI2.1a Wi-Fi7 OLED55C4PSA',
      brand: 'LG',
      model: 'OLED55C4PSA',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi TCL HDMI2.0 55P755',
      brand: 'TCL',
      model: '55P755',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Xiaomi WiFi6E L55M8-A2SEA',
      brand: 'Xiaomi',
      model: 'L55M8-A2SEA',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Samsung 55 inch UA55DU7700/XXV',
      brand: 'Samsung',
      model: 'UA55DU7700-XXV',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Hòa Phát 1 chiều HIC09MFB',
      brand: 'Hoa Phat',
      model: 'HIC09MFB',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa phát ion Inverter 1 HP ABC-12345',
      brand: 'Khác',
      model: 'ABC-12345',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Dieu hoa phat ion Inverter 1 HP ABC-12345',
      brand: 'Khác',
      model: 'ABC-12345',
    },
  ];

  for (const tc of slashSpecCases) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, tc.brand, tc.title);
    assert.equal(out.model, tc.model, tc.title);
  }

  // Secondary fallback path detects appliance brands outside Wave E1 while preserving tech precedence.
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Nồi cơm điện Cuckoo CR-1021' })).brand,
    'Cuckoo'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Bình đun siêu tốc Bluestone KTB-3426' })).brand,
    'Bluestone'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Nồi chiên không dầu Elmich AFE-3945' })).brand,
    'Elmich'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Laptop LG Gram 16 16Z90S 512GB' })).brand,
    'LG'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Laptop Asus Vivobook 15 tặng nồi Elmich' })).brand,
    'Asus'
  );

  // Unknown appliance with horsepower ("1 HP" / "1.5 HP") across Wave E1 categories must not become HP.
  for (const waveE1Slug of [
    'air-conditioners',
    'refrigerators',
    'washing-machines',
    'air-purifiers',
    'tvs',
  ] as const) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: waveE1Slug,
        title: 'Unknown Brand Inverter 1 HP ABC-123',
      })
    );
    assert.equal(out.brand, 'Khác', `${waveE1Slug} must not match HP`);
  }
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Unknown Brand Inverter 1 HP' })).brand,
    'Khác'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Unknown Brand Inverter 1.5 HP XYZ-9000' })).brand,
    'Khác'
  );
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'air-conditioners',
        title: 'Unknown Brand Inverter 1.5 HP XYZ-9000',
      })
    ).brand,
    'Khác'
  );

  // Legitimate HP laptops and monitors remain intact.
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Laptop HP Pavilion 15 512GB' })).brand,
    'HP'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Folio 13 HP Core i5 8GB 256GB' })).brand,
    'HP'
  );
  assert.equal(
    normalizer.normalize(baseProduct({ title: 'Màn hình HP 24mh 24 inch' })).brand,
    'HP'
  );
});

test('DOS/Rate#1953: expanded Wave E1 appliance allowlist resolves VN brands with non-khac keys and guards collisions', () => {
  const normalizer = new ProductNormalizer();

  const expandedBrandCases = [
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Whirlpool Inverter 300 lít WRN3020',
      brand: 'Whirlpool',
      modelKey: 'whirlpool:wrn3020:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Robot hút bụi Ecovacs Deebot T20 Omni DLX23',
      brand: 'Ecovacs',
      modelKey: 'ecovacs:dlx23:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Robot hút bụi Roborock Q Revo MaxV QRV52',
      brand: 'Roborock',
      modelKey: 'roborock:qrv52:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Korihome APK-902',
      brand: 'Korihome',
      modelKey: 'korihome:apk-902:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Tefal Pure Air PT3030F0',
      brand: 'Tefal',
      modelKey: 'tefal:pt3030f0:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Haier Inverter 10 kg HW100-BP14929S',
      brand: 'Haier',
      modelKey: 'haier:hw100-bp14929s:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Hafele CF-8126S',
      brand: 'Hafele',
      modelKey: 'hafele:cf-8126s:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Häfele Air Pro',
      brand: 'Hafele',
      modelKey: 'hafele:air-pro:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa KoolMan Inverter 1 HP KM-09INV',
      brand: 'KoolMan',
      modelKey: 'koolman:km-09inv:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Kool Man Side By Side 400 lít',
      brand: 'KoolMan',
      modelKey: 'koolman:side-by-side-400-lit:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí DOUX DX-1628',
      brand: 'DOUX',
      modelKey: 'doux:dx-1628:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Dreame AirPursue PM20-A1',
      brand: 'Dreame',
      modelKey: 'dreame:pm20-a1:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt sàn Tineco Floor One S7 Pro FW2211',
      brand: 'Tineco',
      modelKey: 'tineco:fw2211:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Bear KJ-A01A1',
      brand: 'Bear',
      modelKey: 'bear:kj-a01a1:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Kärcher AF 100 H13 AF100-G2',
      brand: 'Karcher',
      modelKey: 'karcher:af100-g2:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Carrier Inverter 1 HP 42XIT009',
      brand: 'Carrier',
      modelKey: 'carrier:42xit009:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Deerma KJ230F',
      brand: 'Deerma',
      modelKey: 'deerma:kj230f:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Beko Inverter 9 kg WCV9649XWST',
      brand: 'Beko',
      modelKey: 'beko:wcv9649xwst:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Sanyo 8 kg ASW-S80KT',
      brand: 'Sanyo',
      modelKey: 'sanyo:asw-s80kt:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Gree Inverter 1 HP GWC09PB-K3D0P4',
      brand: 'Gree',
      modelKey: 'gree:gwc09pb-k3d0p4:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ mát Sanden Intercool SPA-0503',
      brand: 'Sanden',
      modelKey: 'sanden:spa-0503:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ đông Darling Inverter DMF-4699WSI',
      brand: 'Darling',
      modelKey: 'darling:dmf-4699wsi:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Máy nước nóng Ariston Vitaly 20L SL20B',
      brand: 'Ariston',
      modelKey: 'ariston:sl20b:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Máy nước nóng Ferroli Verdi 30L VERDI-30SE',
      brand: 'Ferroli',
      modelKey: 'ferroli:verdi-30se:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Honeywell Air Touch HAC35M1101W',
      brand: 'Honeywell',
      modelKey: 'honeywell:hac35m1101w:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Boneco P500-EU',
      brand: 'Boneco',
      modelKey: 'boneco:p500-eu:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Stadler Form Roger R-001',
      brand: 'Stadler Form',
      modelKey: 'stadler-form:r-001:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Beurer LR310-DE',
      brand: 'Beurer',
      modelKey: 'beurer:lr310-de:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Chung Ho Iguassu A400-VN',
      brand: 'Chungho',
      modelKey: 'chungho:a400-vn:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Lock & Lock ENP126WHT',
      brand: 'LocknLock',
      modelKey: 'locknlock:enp126wht:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí LocknLock Air Pure',
      brand: 'LocknLock',
      modelKey: 'locknlock:air-pure:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Mutosi MAP-801H-UV',
      brand: 'Mutosi',
      modelKey: 'mutosi:map-801h-uv:unknown',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Skyworth 4K 55 inch 55SUE9500',
      brand: 'Skyworth',
      modelKey: 'skyworth:55sue9500:unknown',
    },
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi iFFALCON 4K 55 inch 55U62',
      brand: 'FFalcon',
      modelKey: 'ffalcon:55u62:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Blueair Blue Pure 3210-EU',
      brand: 'Blueair',
      modelKey: 'blueair:3210-eu:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí A.O. Smith KJ420F-B01',
      brand: 'A.O. Smith',
      modelKey: 'ao-smith:kj420f-b01:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Lumias Bulma Compact LM-30W',
      brand: 'Lumias',
      modelKey: 'lumias:lm-30w:unknown',
    },
  ];

  for (const tc of expandedBrandCases) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, tc.brand, tc.title);
    assert.equal(out.model_key, tc.modelKey, tc.title);
    assert.ok(!out.model_key.startsWith('khac:'), `${tc.title} must not key as khac:`);
  }

  // Word-boundary and spelling collision guards: Bear vs Bearing, Midea vs Media, Lumias vs Lumia.
  for (const nonBrandTitle of [
    'Máy lọc không khí Bearing Silent AP-100',
    'Máy lọc không khí Unbearable Noise AP-100',
    'Máy lọc không khí Bear123 AP-100',
    'Tivi MediaMart 55 inch MM55-4K',
    'Máy lọc không khí Media Air AP-100',
    'Máy lọc không khí Lumia Air AP-100',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: 'air-purifiers',
        title: nonBrandTitle,
      })
    );
    assert.equal(out.brand, 'Khác', `${nonBrandTitle} must not falsely match an appliance brand`);
  }

  // detectApplianceBrand canonicalizes casing and spelling variants cleanly.
  assert.equal(detectApplianceBrand('KOOLMAN'), 'KoolMan');
  assert.equal(detectApplianceBrand('kool man'), 'KoolMan');
  assert.equal(detectApplianceBrand('doux'), 'DOUX');
  assert.equal(detectApplianceBrand('HAFELE'), 'Hafele');
  assert.equal(detectApplianceBrand('HÄFELE'), 'Hafele');
  assert.equal(detectApplianceBrand('KÄRCHER'), 'Karcher');
  assert.equal(detectApplianceBrand('LOCK & LOCK'), 'LocknLock');
  assert.equal(detectApplianceBrand("Lock'n'Lock"), 'LocknLock');
  assert.equal(detectApplianceBrand('CHUNG HO'), 'Chungho');
  assert.equal(detectApplianceBrand('a.o. smith'), 'A.O. Smith');
  assert.equal(detectApplianceBrand('Hòa Phát'), 'Hoa Phat');
  assert.equal(detectApplianceBrand('Media'), null);
  assert.equal(detectApplianceBrand('Bearing'), null);
});

test('DOS/Rate#1953: Wave E1 structured brand fallback resolves genuine hints and rejects retail chains/placeholders', () => {
  const normalizer = new ProductNormalizer();

  // 1. Canonical allowlist hints in raw.brand or attributes canonicalize casing when title omits brand.
  const canonicalStructuredCases = [
    {
      title: 'Máy làm mát không khí KM-4500',
      categorySlug: 'air-conditioners' as const,
      brand: 'KOOLMAN',
      expectedBrand: 'KoolMan',
      expectedKey: 'koolman:km-4500:unknown',
    },
    {
      title: 'Máy lọc không khí HEPA DX-1628',
      categorySlug: 'air-purifiers' as const,
      attributes: [{ name: 'Thương hiệu', value: 'doux' }],
      expectedBrand: 'DOUX',
      expectedKey: 'doux:dx-1628:unknown',
    },
    {
      title: 'Máy lọc không khí UV-C CF-8126S',
      categorySlug: 'air-purifiers' as const,
      attributes: [{ name: 'Hãng sản xuất', value: 'HAFELE' }],
      expectedBrand: 'Hafele',
      expectedKey: 'hafele:cf-8126s:unknown',
    },
    {
      title: 'Smart Tivi 4K 55 inch XR-55X90L',
      categorySlug: 'tvs' as const,
      brand: 'SONY',
      expectedBrand: 'Sony',
      expectedKey: 'sony:xr-55x90l:unknown',
    },
    {
      title: 'Smart Tivi 4K 55 inch UA55DU7000',
      categorySlug: 'tvs' as const,
      brand: 'SAMSUNG',
      expectedBrand: 'Samsung',
      expectedKey: 'samsung:ua55du7000:unknown',
    },
    {
      title: 'Máy lọc không khí Smart 4 Pro AC-M15-SC',
      categorySlug: 'air-purifiers' as const,
      brand: 'REDMI',
      expectedBrand: 'Xiaomi',
      expectedKey: 'xiaomi:ac-m15-sc:unknown',
    },
  ];
  for (const tc of canonicalStructuredCases) {
    const out = normalizer.normalize(
      baseProduct({
        platform: 'dienmayxanh',
        categorySlug: tc.categorySlug,
        title: tc.title,
        brand: tc.brand,
        attributes: tc.attributes ?? [],
        shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: true },
      })
    );
    assert.equal(out.brand, tc.expectedBrand, tc.title);
    assert.equal(out.model_key, tc.expectedKey, tc.title);
  }

  // 2. Unallowlisted genuine appliance brand accepted from raw.brand / attributes on curated
  // retail chains and when grounded in title on marketplaces.
  const curatedUnallowlisted = normalizer.normalize(
    baseProduct({
      platform: 'dienmayxanh',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí UV-C AP-900',
      brand: 'KUVINGS',
      shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: false },
    })
  );
  assert.equal(curatedUnallowlisted.brand, 'Kuvings');
  assert.equal(curatedUnallowlisted.model_key, 'kuvings:ap-900:unknown');

  const retailFallbackToAttr = normalizer.normalize(
    baseProduct({
      platform: 'nguyenkim',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí HEPA Pro AP-550',
      brand: 'Nguyễn Kim',
      attributes: [{ name: 'Thương hiệu', value: 'Bionaire Official' }],
      shop: { shopId: 'nk', name: 'Nguyễn Kim', isMall: false },
    })
  );
  assert.equal(retailFallbackToAttr.brand, 'Bionaire');
  assert.equal(retailFallbackToAttr.model_key, 'bionaire:ap-550:unknown');

  const groundedShopee = normalizer.normalize(
    baseProduct({
      platform: 'shopee',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí Kuvings AP-900',
      brand: 'Kuvings Official Store',
      shop: { shopId: 'shop-1', name: 'Gia Dụng Tổng Hợp', isMall: false },
    })
  );
  assert.equal(groundedShopee.brand, 'Kuvings');
  assert.equal(groundedShopee.model_key, 'kuvings:ap-900:unknown');

  // Ungrounded non-allowlisted hint on non-Mall Shopee must be rejected.
  const ungroundedShopee = normalizer.normalize(
    baseProduct({
      platform: 'shopee',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí UV-C AP-900',
      brand: 'Kuvings',
      shop: { shopId: 'shop-1', name: 'Gia Dụng Tổng Hợp', isMall: false },
    })
  );
  assert.equal(ungroundedShopee.brand, 'Khác');

  // Title brand always takes precedence over structured brand hint.
  const titlePrecedence = normalizer.normalize(
    baseProduct({
      platform: 'dienmayxanh',
      categorySlug: 'refrigerators',
      title: 'Tủ lạnh Whirlpool Inverter 300 lít WRN3020',
      brand: 'Điện Máy Xanh',
      shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: true },
    })
  );
  assert.equal(titlePrecedence.brand, 'Whirlpool');

  // 3. Strictly reject retail store/chain names (including Official/Store suffixes) and placeholders.
  const disallowedHints = [
    'Điện Máy Xanh',
    'Dien May Xanh',
    'Điện Máy Xanh Official',
    'Nguyễn Kim',
    'Nguyen Kim',
    'Nguyễn Kim Official Store',
    'Pico',
    'Pico Store',
    'MediaMart',
    'MediaMart VN',
    'Tiki',
    'Tiki Trading',
    'Shopee',
    'Shopee Mall',
    'Lazada',
    'FPT Shop',
    'FPT Shop Official',
    'Thế Giới Di Động',
    'The Gioi Di Dong',
    'CellphoneS',
    'Hoàng Hà',
    'Hoàng Hà Mobile',
    'Di Động Việt',
    'Phong Vũ',
    'An Phát',
    'An Phát PC',
    'HACOM',
    'GearVN',
    'TopZone',
    'ShopDunk',
    'Clickbuy',
    'Viettel Store',
    'Viettel Store Official',
    'MemoryZone',
    'AVAKids',
    'Pharmacity',
    'KidsPlaza',
    'Con Cưng',
    'OEM',
    'No Brand',
    'No-Brand',
    'Non-Brand',
    'Khác',
    'Khac',
    'Unknown',
    'Other',
    'Generic',
    'Unbranded',
    'N/A',
    'None',
    'Đang cập nhật',
  ];

  for (const hint of disallowedHints) {
    const fromBrand = normalizer.normalize(
      baseProduct({
        platform: 'dienmayxanh',
        categorySlug: 'air-conditioners',
        title: 'Điều hòa Inverter 1 HP ABC-12345',
        brand: hint,
        shop: { shopId: 'dmx', name: 'Retail Store', isMall: true },
      })
    );
    assert.equal(
      fromBrand.brand,
      'Khác',
      `Disallowed Wave E1 raw.brand ${JSON.stringify(hint)} must be rejected`
    );

    const fromAttr = normalizer.normalize(
      baseProduct({
        platform: 'tiki',
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí HEPA ABC-12345',
        attributes: [{ name: 'Thương hiệu', value: hint }],
        shop: { shopId: 'tiki', name: 'Tiki Trading', isMall: true },
      })
    );
    assert.equal(
      fromAttr.brand,
      'Khác',
      `Disallowed Wave E1 attribute brand ${JSON.stringify(hint)} must be rejected`
    );
  }

  // Linear-time guard against adversarial repeated suffix tokens.
  const redosStart = performance.now();
  assert.equal(
    sanitizeWaveE3StructuredBrand('fpt shop ' + 'official '.repeat(25_000), {
      identityTitle: 'Điều hòa Inverter 1 HP ABC-12345',
      platform: 'dienmayxanh',
      shopName: 'Retail Store',
      isMall: true,
    }),
    null
  );
  assert.ok(performance.now() - redosStart < 100, 'Expected linear runtime on repeated suffixes');
});

test('DOS/Rate#1953 Round 1 review: guards core-tech/Wave E2 brand hijacks, VN placeholders, spam injection, and variant stripping', () => {
  const normalizer = new ProductNormalizer();

  // 1. Ambiguous Wave E1 brands (Carrier, Bear, Darling, DOUX, Chungho) must never hijack
  // core-tech categories or Wave E2 service plans.
  const nonWaveE1NoHijackCases: Array<{
    categorySlug: 'smartphones' | 'smartwatches' | 'earbuds' | 'internet-telecom';
    title: string;
  }> = [
    {
      categorySlug: 'smartphones',
      title: 'Điện thoại Motorola Razr 50 Ultra Carrier Unlocked 256GB',
    },
    {
      categorySlug: 'smartphones',
      title: 'Điện thoại Nokia G42 5G Unlocked All Carrier 128GB',
    },
    {
      categorySlug: 'smartwatches',
      title: 'Đồng hồ thông minh Amazfit GTR 4 eSIM Carrier',
    },
    {
      categorySlug: 'internet-telecom',
      title: 'Gói cước Internet 5G Multi Carrier 100GB',
    },
    {
      categorySlug: 'earbuds',
      title: 'Tai nghe Bluetooth không dây hình gấu Bear đáng yêu',
    },
    {
      categorySlug: 'earbuds',
      title: 'Tai nghe True Wireless Moondrop Space Travel Bear',
    },
    {
      categorySlug: 'smartwatches',
      title: 'Đồng hồ thông minh trẻ em Bear 4G',
    },
    {
      categorySlug: 'earbuds',
      title: 'Tai nghe Bluetooth Darling Pink Edition',
    },
    {
      categorySlug: 'earbuds',
      title: 'Tai nghe Bluetooth Doux Edition',
    },
    {
      categorySlug: 'smartphones',
      title: 'Điện thoại dùng chung hộ gia đình 128GB',
    },
  ];
  for (const tc of nonWaveE1NoHijackCases) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, 'Khác', `${tc.categorySlug}: ${tc.title} must not be hijacked`);
  }

  // Wave E1 appliances still detect Carrier, Bear, Darling, DOUX cleanly while Chungho guards
  // unaccented "dung chung ho gia dinh".
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'air-conditioners',
        title: 'Máy lạnh Carrier Inverter 1HP',
      })
    ).brand,
    'Carrier'
  );
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí Bear',
      })
    ).brand,
    'Bear'
  );
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'refrigerators',
        title: 'Tủ đông Darling',
      })
    ).brand,
    'Darling'
  );
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'washing-machines',
        title: 'Máy giặt mini DOUX DX-1335',
      })
    ).brand,
    'DOUX'
  );
  for (const nonChunghoTitle of [
    'Máy lọc không khí dùng chung hộ gia đình AP-100',
    'May loc khong khi dung chung ho gia dinh AP-100',
    'May loc khong khi chung ho gia dinh AP-100',
  ]) {
    assert.equal(
      normalizer.normalize(
        baseProduct({
          categorySlug: 'air-purifiers',
          title: nonChunghoTitle,
        })
      ).brand,
      'Khác',
      `${nonChunghoTitle} must not match Chungho`
    );
  }

  // 2. Vietnamese placeholder brands and 3-token "Hàng Chính Hãng" / "Hàng Nhập Khẩu" suffixes.
  for (const vnPlaceholder of [
    'Không có thương hiệu',
    'Không rõ thương hiệu',
    'Thương hiệu khác',
    'Hãng khác',
    'Hàng nhập khẩu',
    'Hàng nội địa',
    'Nội địa Trung',
    'Nội địa Nhật',
    'FPT Shop - Hàng Chính Hãng',
    'FPT Shop Hàng Chính Hãng',
    'Nguyễn Kim - Hàng Chính Hãng',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        platform: 'dienmayxanh',
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí HEPA AP-900',
        brand: vnPlaceholder,
        shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: true },
      })
    );
    assert.equal(out.brand, 'Khác', `${vnPlaceholder} must be rejected`);
  }

  for (const genuineWithSuffix of [
    'Kuvings Hàng Chính Hãng',
    'Kuvings - Hàng Chính Hãng',
    'Kuvings - Hàng Nhập Khẩu',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        platform: 'dienmayxanh',
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí HEPA AP-900',
        brand: genuineWithSuffix,
        shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: false },
      })
    );
    assert.equal(out.brand, 'Kuvings', `${genuineWithSuffix} must strip to Kuvings`);
  }

  // 3. Block allowlist brand injection via compatibility/accessory spam or multi-brand hints.
  for (const spamBrand of [
    'Phụ kiện tương thích Dyson Sharp',
    'Dùng cho Sharp',
    'Compatible for Dyson',
    'Replacement filter LG',
    'Dyson Sharp',
    'Máy lọc không khí Sharp',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        platform: 'shopee',
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí mini giá rẻ AP-900',
        brand: spamBrand,
        shop: { shopId: 'shop-1', name: 'Cửa Hàng Phụ Kiện', isMall: false },
      })
    );
    assert.equal(out.brand, 'Khác', `Spam structured hint ${JSON.stringify(spamBrand)} rejected`);
  }

  // 4. Every accepted spelling variant strips identically in Wave E1 model cleanup.
  const stadlerCanonical = normalizer.normalize(
    baseProduct({
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí Stadler Form Roger Little',
    })
  );
  const stadlerGlued = normalizer.normalize(
    baseProduct({
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí StadlerForm Roger Little',
    })
  );
  assert.equal(stadlerCanonical.model_key, 'stadler-form:roger-little:unknown');
  assert.equal(stadlerGlued.model_key, stadlerCanonical.model_key);

  for (const aoVariant of [
    'Máy lọc không khí A.O. Smith Pure Air',
    'Máy lọc không khí A O Smith Pure Air',
    'Máy lọc không khí A.O Smith Pure Air',
    'Máy lọc không khí AO. Smith Pure Air',
    'Máy lọc không khí A. O.Smith Pure Air',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: 'air-purifiers',
        title: aoVariant,
      })
    );
    assert.equal(out.brand, 'A.O. Smith', aoVariant);
    assert.equal(out.model_key, 'ao-smith:pure-air:unknown', aoVariant);
  }

  for (const lockVariant of [
    'Máy lọc không khí LocknLock Pure Air',
    "Máy lọc không khí Lock 'n' Lock Pure Air",
    'Máy lọc không khí Lock& Lock Pure Air',
    'Máy lọc không khí LockandLock Pure Air',
    'Máy lọc không khí Lock-&-Lock Pure Air',
  ]) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: 'air-purifiers',
        title: lockVariant,
      })
    );
    assert.equal(out.brand, 'LocknLock', lockVariant);
    assert.equal(out.model_key, 'locknlock:pure-air:unknown', lockVariant);
  }
  assert.equal(
    normalizer.normalize(
      baseProduct({
        categorySlug: 'air-purifiers',
        title: 'Máy lọc không khí Lock& Lock Air Pure',
      })
    ).model_key,
    'locknlock:air-pure:unknown'
  );

  // 5. Additional structured hint sources: brand_name, metadata.brand, and trailing-colon attrs.
  const fromBrandName = normalizer.normalize({
    ...baseProduct({
      platform: 'dienmayxanh',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí UV-C AP-900',
      shop: { shopId: 'dmx', name: 'Điện Máy Xanh', isMall: false },
    }),
    brand_name: 'Kuvings Official',
  } as ShopeeProduct);
  assert.equal(fromBrandName.brand, 'Kuvings');
  assert.equal(fromBrandName.model_key, 'kuvings:ap-900:unknown');

  const fromMetadataBrand = normalizer.normalize(
    baseProduct({
      platform: 'nguyenkim',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí HEPA AP-700',
      metadata: { brand: 'Bionaire Hàng Chính Hãng' },
      shop: { shopId: 'nk', name: 'Nguyễn Kim', isMall: false },
    })
  );
  assert.equal(fromMetadataBrand.brand, 'Bionaire');
  assert.equal(fromMetadataBrand.model_key, 'bionaire:ap-700:unknown');

  const fromTrailingColonBrand = normalizer.normalize(
    baseProduct({
      platform: 'mediamart',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí HEPA AP-710',
      attributes: [{ name: 'Thương hiệu:', value: 'KOOLMAN' }],
      shop: { shopId: 'mm', name: 'MediaMart', isMall: false },
    })
  );
  assert.equal(fromTrailingColonBrand.brand, 'KoolMan');
  assert.equal(fromTrailingColonBrand.model_key, 'koolman:ap-710:unknown');

  const fromTrailingColonMaker = normalizer.normalize(
    baseProduct({
      platform: 'pico',
      categorySlug: 'air-purifiers',
      title: 'Máy lọc không khí HEPA AP-720',
      attributes: [{ name: 'Hãng sản xuất:', value: 'Kuvings' }],
      shop: { shopId: 'pico', name: 'Pico', isMall: false },
    })
  );
  assert.equal(fromTrailingColonMaker.brand, 'Kuvings');
  assert.equal(fromTrailingColonMaker.model_key, 'kuvings:ap-720:unknown');

  // 6. Explicit coverage for remaining newly added Wave E1 brands.
  const remainingBrands = [
    {
      categorySlug: 'tvs' as const,
      title: 'Smart Tivi Asanzo 43 inch 43SL900',
      brand: 'Asanzo',
      modelKey: 'asanzo:43sl900:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Nanoco NAP4521',
      brand: 'Nanoco',
      modelKey: 'nanoco:nap4521:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí FujiE AP500-VN',
      brand: 'FujiE',
      modelKey: 'fujie:ap500-vn:unknown',
    },
    {
      categorySlug: 'air-purifiers' as const,
      title: 'Máy lọc không khí Fujihome AP5-HEPA',
      brand: 'Fujihome',
      modelKey: 'fujihome:ap5-hepa:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Galanz Inverter 9 kg XQG90-M716',
      brand: 'Galanz',
      modelKey: 'galanz:xqg90-m716:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Teka Side By Side RMF-77960',
      brand: 'Teka',
      modelKey: 'teka:rmf-77960:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Malloca Side By Side MF-562SBS',
      brand: 'Malloca',
      modelKey: 'malloca:mf-562sbs:unknown',
    },
    {
      categorySlug: 'refrigerators' as const,
      title: 'Tủ lạnh Smeg Retro FAB28RCR5',
      brand: 'Smeg',
      modelKey: 'smeg:fab28rcr5:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Siemens Inverter 9 kg WG44G200GB',
      brand: 'Siemens',
      modelKey: 'siemens:wg44g200gb:unknown',
    },
    {
      categorySlug: 'washing-machines' as const,
      title: 'Máy giặt Miele W1 WCA030WCS',
      brand: 'Miele',
      modelKey: 'miele:wca030wcs:unknown',
    },
    {
      categorySlug: 'air-conditioners' as const,
      title: 'Điều hòa Dairry Inverter 1 HP I-DR09KH',
      brand: 'Dairry',
      modelKey: 'dairry:i-dr09kh:unknown',
    },
  ];
  for (const tc of remainingBrands) {
    const out = normalizer.normalize(
      baseProduct({
        categorySlug: tc.categorySlug,
        title: tc.title,
      })
    );
    assert.equal(out.brand, tc.brand, tc.title);
    assert.equal(out.model_key, tc.modelKey, tc.title);
  }
});
