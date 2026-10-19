/**
 * Verification Suite for Open-Core Intelligence Layer (@repo/crawlers):
 * - Multi-Category Detection (smartphones, tablets, laptops, smartwatches, earbuds)
 * - RAM/ROM Disambiguation & Identity Safety (:unknown + needs_review)
 * - 10-Field-Groups Benchmark Enrichment & Zod Schema Conformance
 */
import assert from 'node:assert/strict';
import { ProductSpecificationsSchema } from '@repo/shared-data';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import { FLAGSHIP_DEVICES_TO_SEED } from '../flagship-seed-data.js';
import type { ShopeeProduct } from '../types.js';

function createDummyShopeeProduct(title: string, priceMin = 25990000): ShopeeProduct {
  return {
    itemId: '10001',
    shopId: '20001',
    title,
    priceMin,
    priceMax: priceMin,
    priceBeforeDiscount: Math.round(priceMin * 1.1),
    currency: 'VND',
    stock: 20,
    historicalSold: 150,
    ratingStar: 4.9,
    ratingCount: 85,
    images: ['https://rate.vn/img/placeholder.png'],
    models: [{ modelId: 'm-1', name: 'Titan Tự Nhiên', price: priceMin, stock: 10 }],
    attributes: [],
    shop: {
      shopId: '20001',
      name: 'Official Flagship Store',
      isMall: true,
      ratingStar: 4.95,
      followerCount: 150000,
      location: 'TP. Hồ Chí Minh',
    },
    reviews: [],
    url: 'https://shopee.vn/product/20001/10001',
  };
}

async function runSuite() {
  console.log('🧪 Running @repo/crawlers Open-Core Multi-Category Normalizer Suite...');
  const normalizer = new ProductNormalizer();

  // 1. Canonical 5-Category Detection
  assert.equal(
    detectCategorySlug('Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng'),
    'smartphones'
  );
  assert.equal(detectCategorySlug('Máy tính bảng Apple iPad Pro M4 11 inch WiFi 256GB'), 'tablets');
  assert.equal(detectCategorySlug('Laptop Apple MacBook Air M3 13 inch 16GB RAM 512GB'), 'laptops');
  assert.equal(
    detectCategorySlug('Đồng hồ thông minh Apple Watch Ultra 2 49mm GPS + Cellular'),
    'smartwatches'
  );
  assert.equal(
    detectCategorySlug('Tai nghe Bluetooth Apple AirPods Pro 2 MagSafe USB-C'),
    'earbuds'
  );
  assert.equal(detectCategorySlug('Tai nghe chống ồn Sony WF-1000XM5 Chính hãng'), 'earbuds');
  console.log('  ✅ [1/5] 5-Category Canonical Detection passed');

  // 2. RAM/ROM Disambiguation & Ambiguity Safety
  const s24 = normalizer.normalize(
    createDummyShopeeProduct('Điện thoại Samsung Galaxy S24 Ultra 12GB RAM 512GB')
  );
  assert.equal(s24.category_slug, 'smartphones');
  assert.equal(s24.brand, 'Samsung');
  assert.equal(s24.storage_gb, 512);
  assert.equal(s24.ram_gb, 12);
  assert.equal(s24.model_key, 'samsung:galaxy-s24-ultra:512gb');
  assert.equal(s24.needs_review, false);
  assert.equal(s24.is_benchmark_enriched, true);

  const a55ExplicitRom = normalizer.normalize(
    createDummyShopeeProduct('Samsung Galaxy A55 ROM 256GB RAM 8GB Chính hãng')
  );
  assert.equal(a55ExplicitRom.storage_gb, 256);
  assert.equal(a55ExplicitRom.model_key, 'samsung:galaxy-a55:256gb');
  assert.equal(a55ExplicitRom.needs_review, false);

  const ambiguous = normalizer.normalize(
    createDummyShopeeProduct('Điện thoại Samsung Galaxy S24 Ultra 256GB / 512GB')
  );
  assert.equal(ambiguous.storage_gb, null);
  assert.equal(ambiguous.model_key, 'samsung:galaxy-s24-ultra:unknown');
  assert.equal(ambiguous.needs_review, true);
  console.log('  ✅ [2/5] RAM/ROM Disambiguation & Identity Safety passed');

  // 3. Multi-Category Benchmark Enrichment (Tablets, Laptops, Smartwatches, Earbuds)
  const ipad = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Apple iPad Pro M4 256GB WiFi')
  );
  assert.equal(ipad.category_slug, 'tablets');
  assert.equal(ipad.model_key, 'apple:ipad-pro-m4:256gb');
  assert.equal(ipad.is_benchmark_enriched, true);
  assert.equal(ipad.specifications.hardware?.chipset, 'Apple M4 (3 nm)');
  // Retail titles put the chip after the screen size; it must still reach the key.
  for (const title of [
    'Máy tính bảng Apple iPad Pro 11 inch M4 Wi-Fi 256GB',
    'Apple iPad Pro 11 inch M4 WiFi 256GB - Chính hãng',
  ]) {
    assert.equal(
      normalizer.normalize(createDummyShopeeProduct(title)).model_key,
      'apple:ipad-pro-m4:256gb',
      title
    );
  }
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('MacBook Air 13 inch M3 8GB 256GB')).model_key,
    'apple:macbook-air-m3:256gb'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Tai nghe Apple AirPods Pro 2 USB-C MTJV3'))
      .model_key,
    normalizer.normalize(createDummyShopeeProduct('Apple AirPods Pro 2 USB-C')).model_key,
    'part numbers such as MTJV3 must not read as a chip'
  );

  const tabS10Ultra = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Samsung Galaxy Tab S10 Ultra 5G 12GB RAM 256GB')
  );
  assert.equal(tabS10Ultra.category_slug, 'tablets');
  assert.equal(tabS10Ultra.model_key, 'samsung:galaxy-tab-s10-ultra:256gb');
  assert.equal(tabS10Ultra.is_benchmark_enriched, true);

  const xiaomiPad = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Xiaomi Pad 6S Pro 12.4 8GB RAM 256GB')
  );
  assert.equal(xiaomiPad.category_slug, 'tablets');
  assert.equal(xiaomiPad.model_key, 'xiaomi:pad-6s-pro:256gb');
  assert.equal(xiaomiPad.is_benchmark_enriched, true);

  const macbook = normalizer.normalize(
    createDummyShopeeProduct('Laptop Apple MacBook Air M3 16GB RAM 512GB SSD')
  );
  assert.equal(macbook.category_slug, 'laptops');
  assert.equal(macbook.model_key, 'apple:macbook-air-m3:512gb');
  assert.equal(macbook.is_benchmark_enriched, true);
  assert.equal(macbook.specifications.hardware?.chipset, 'Apple M3 (3 nm)');

  const zenbook = normalizer.normalize(
    createDummyShopeeProduct('Laptop ASUS Zenbook S 14 OLED UX5406 32GB RAM 1TB SSD')
  );
  assert.equal(zenbook.category_slug, 'laptops');
  assert.equal(zenbook.model_key, 'asus:zenbook-s-14:1024gb');
  assert.equal(zenbook.is_benchmark_enriched, true);

  const thinkpad = normalizer.normalize(
    createDummyShopeeProduct('Laptop Lenovo ThinkPad X1 Carbon Gen 12 32GB RAM 512GB')
  );
  assert.equal(thinkpad.category_slug, 'laptops');
  assert.equal(thinkpad.model_key, 'lenovo:thinkpad-x1-carbon-gen-12:512gb');
  assert.equal(thinkpad.is_benchmark_enriched, true);

  const watchUltra = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Apple Watch Ultra 2 49mm')
  );
  assert.equal(watchUltra.category_slug, 'smartwatches');
  assert.equal(watchUltra.model_key, 'apple:watch-ultra-2:64gb');
  assert.equal(watchUltra.needs_review, false);
  assert.equal(watchUltra.is_benchmark_enriched, true);

  const galaxyWatchUltra = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Samsung Galaxy Watch Ultra 47mm LTE')
  );
  assert.equal(galaxyWatchUltra.category_slug, 'smartwatches');
  assert.equal(galaxyWatchUltra.model_key, 'samsung:galaxy-watch-ultra:32gb');
  assert.equal(galaxyWatchUltra.is_benchmark_enriched, true);

  const garminFr265 = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Garmin Forerunner 265 Music')
  );
  assert.equal(garminFr265.category_slug, 'smartwatches');
  assert.equal(garminFr265.model_key, 'garmin:forerunner-265:8gb');
  assert.equal(garminFr265.is_benchmark_enriched, true);

  const sonyBuds = normalizer.normalize(
    createDummyShopeeProduct('Tai nghe chống ồn Sony WF-1000XM5 Chính hãng')
  );
  assert.equal(sonyBuds.category_slug, 'earbuds');
  assert.equal(sonyBuds.brand, 'Sony');
  assert.equal(sonyBuds.model, 'WF-1000XM5');
  assert.equal(sonyBuds.needs_review, false);
  assert.equal(sonyBuds.is_benchmark_enriched, true);

  const galaxyBuds3Pro = normalizer.normalize(
    createDummyShopeeProduct('Tai nghe Bluetooth Samsung Galaxy Buds3 Pro Chính hãng')
  );
  assert.equal(galaxyBuds3Pro.category_slug, 'earbuds');
  assert.equal(galaxyBuds3Pro.model_key, 'samsung:galaxy-buds3-pro:1gb');
  assert.equal(galaxyBuds3Pro.is_benchmark_enriched, true);
  console.log('  ✅ [3/5] Multi-Category Benchmark Enrichment (5 Categories, 12 Flagships) passed');

  // 4. 10-Field-Groups Zod Schema Conformance
  for (const item of [
    s24,
    ipad,
    tabS10Ultra,
    xiaomiPad,
    macbook,
    zenbook,
    thinkpad,
    watchUltra,
    galaxyWatchUltra,
    garminFr265,
    sonyBuds,
    galaxyBuds3Pro,
  ]) {
    const parsed = ProductSpecificationsSchema.safeParse(item.specifications);
    assert.equal(parsed.success, true, `10-Group Zod validation failed for ${item.model_key}`);
  }
  console.log('  ✅ [4/5] 10-Field-Groups Zod Schema Conformance passed');

  // 5. Flagship Seed Dataset Multi-Category Coverage
  const countsByCat = new Map<string, number>();
  for (const dev of FLAGSHIP_DEVICES_TO_SEED) {
    countsByCat.set(dev.categorySlug, (countsByCat.get(dev.categorySlug) || 0) + 1);
    const parsed = ProductSpecificationsSchema.safeParse(dev.specifications);
    assert.equal(parsed.success, true, `Seed spec validation failed for ${dev.model_key}`);
  }
  for (const cat of ['smartphones', 'tablets', 'laptops', 'smartwatches', 'earbuds']) {
    assert.ok(
      (countsByCat.get(cat) || 0) >= 3,
      `Expected at least 3 flagship seed devices in category "${cat}", got ${countsByCat.get(cat) || 0}`
    );
  }
  console.log('  ✅ [5/6] Flagship Seed Dataset Multi-Brand Coverage (>=3 per Category) passed');

  // 6. Spec-only catalog: no fabricated listings, reviews, prices or expert scores
  for (const dev of FLAGSHIP_DEVICES_TO_SEED) {
    for (const field of [
      'listings',
      'expert_rating',
      'expert_review_summary',
      'expert_criteria_scores',
    ]) {
      assert.ok(
        !(field in dev),
        `Seed catalog entry ${dev.model_key} must not carry synthetic field "${field}"`
      );
    }
  }
  console.log('  ✅ [6/7] Spec-Only Catalog (no synthetic listings or expert scores) passed');

  // 7. ArenaSpecSyncer (GSMArena [data-spec] + PhoneArena Split Camera) & 14 2026 Multi-Category Flagships (36 Total Catalog)
  const {
    parseGsmArenaHtmlToSpecs,
    parseGsmArenaBrandCatalogHtml,
    parsePhoneArenaCatalogHtml,
    countPopulatedFieldGroups,
    UPSTREAM_2026_ARENA_REFERENCE_URLS,
  } = await import('../arena-spec-syncer.js');

  const sampleGsmHtml = `
    <h1 data-spec="modelname">Xiaomi 18 Pro Max</h1>
    <td data-spec="announced">2026, September 23</td>
    <td data-spec="status">Available. Released 2026, September</td>
    <td data-spec="dimensions">162.8 x 77.6 x 8.5 mm</td>
    <td data-spec="weight">228 g (8.04 oz)</td>
    <td data-spec="bodyother">IP69 dust tight and water resistant (high pressure water jets; immersible up to 2m for 30 min)</td>
    <td data-spec="displaytype">LTPO AMOLED, 68B colors, 120Hz, Dolby Vision, 3500 nits (peak)</td>
    <td data-spec="displaysize">6.9 inches, 114.5 cm2 (~91.2% screen-to-body ratio)</td>
    <td data-spec="displayresolution">1440 x 3200 pixels, 20:9 ratio (~510 ppi density)</td>
    <td data-spec="displayprotection">Xiaomi Dragon Crystal Glass 2</td>
    <td data-spec="os">Android 17, HyperOS 4</td>
    <td data-spec="chipset">Qualcomm Snapdragon 8 Elite Extreme Gen 6 (2 nm)</td>
    <td data-spec="cpu">Octa-core (2x4.75 GHz Oryon V3 + 6x3.80 GHz)</td>
    <td data-spec="gpu">Adreno 850</td>
    <td data-spec="internalmemory">256GB 12GB RAM, 512GB 16GB RAM, 1TB 16GB RAM</td>
    <td data-spec="memoryother">UFS 4.1</td>
    <td data-spec="cam1modules">200 MP, f/1.6, 23mm (wide), 1/1.28", OIS<br>50 MP, f/2.0, 14mm, 115˚ (ultrawide)<br>200 MP, f/2.5, 75mm (periscope telephoto), 3.2x optical zoom, OIS</td>
    <td data-spec="cam1video">8K@30fps, 4K@24/30/60/120fps, Dolby Vision HDR</td>
    <td data-spec="cam2modules">32 MP, f/2.0, 22mm (wide)</td>
    <td data-spec="batdescription1">Si/C Li-Ion 8500 mAh, non-removable</td>
    <td data-spec="batcharging">100W wired, PD3.0, 50W wireless, 27W reverse wireless</td>
    <td data-spec="wlan">Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band</td>
    <td data-spec="bluetooth">6.0, A2DP, LE, aptX HD, LHDC 5.0</td>
    <td data-spec="usb">USB Type-C 3.2 Gen 2, DisplayPort, OTG</td>
    <td data-spec="nfc">Yes</td>
    <td data-spec="gps">GPS (L1+L5), GLONASS, BDS, GALILEO</td>
    <td data-spec="sensors">Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass</td>
  `;
  const synced = parseGsmArenaHtmlToSpecs(sampleGsmHtml, {
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_18_pro_max-14288.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-18-Pro-Max_id12894',
  });
  assert.equal(synced.brand, 'Xiaomi');
  assert.equal(synced.model, '18 Pro Max');
  assert.equal(synced.ramGb, 16);
  assert.equal(synced.storageGb, 1024);
  assert.equal(synced.screenSizeInch, 6.9);
  assert.equal(synced.batteryMah, 8500);
  assert.ok(synced.specifications.camera?.main_camera?.startsWith('200 MP'));
  assert.ok(synced.specifications.camera?.second_camera?.startsWith('50 MP'));
  assert.ok(synced.specifications.camera?.third_camera?.startsWith('200 MP'));
  assert.equal(synced.specifications.battery?.fast_charging_w, 100);
  assert.equal(synced.specifications.battery?.reverse_charging, true);
  assert.equal(
    countPopulatedFieldGroups(synced.specifications as unknown as Record<string, unknown>),
    10
  );

  const gsmBrandItems = parseGsmArenaBrandCatalogHtml(
    `<div class="makers"><ul><li><a href="xiaomi_18_pro_max-14288.php"><strong><span>18 Pro Max</span></strong></a></li></ul></div>`,
    'Xiaomi'
  );
  assert.equal(gsmBrandItems.length, 1);
  assert.equal(gsmBrandItems[0]?.name, 'Xiaomi 18 Pro Max');

  const paCatalogItems = parsePhoneArenaCatalogHtml(
    `<a href="/phones/Samsung-Galaxy-S26-Ultra_id12621">Samsung Galaxy S26 Ultra</a>`
  );
  assert.equal(paCatalogItems.length, 1);
  assert.equal(paCatalogItems[0]?.name, 'Samsung Galaxy S26 Ultra');

  // Ensure all 14 canonical 2026 upstream devices across 5 categories are present in FLAGSHIP_DEVICES_TO_SEED (33 seed entries -> 36 total master products)
  assert.equal(UPSTREAM_2026_ARENA_REFERENCE_URLS.length, 14);
  assert.equal(FLAGSHIP_DEVICES_TO_SEED.length, 33);
  const seededModelKeys = new Set(FLAGSHIP_DEVICES_TO_SEED.map(d => d.model_key));
  for (const ref of UPSTREAM_2026_ARENA_REFERENCE_URLS) {
    assert.ok(
      seededModelKeys.has(ref.model_key),
      `Missing 2026 flagship ${ref.model_key} (${ref.name}) in FLAGSHIP_DEVICES_TO_SEED`
    );
  }

  // Verify ProductNormalizer recognizes 2026 multi-category flagships
  const normPad7 = normalizer.normalize(
    createDummyShopeeProduct(
      'Máy tính bảng Xiaomi Pad 7 Pro (12GB/256GB) Màn hình 3.2K 144Hz Chính Hãng',
      12490000
    )
  );
  assert.equal(normPad7.model_key, 'xiaomi:pad-7-pro:256gb');
  assert.equal(normPad7.category_slug, 'tablets');
  assert.equal(normPad7.is_benchmark_enriched, true);

  console.log(
    '  ✅ [7/8] ArenaSpecSyncer (GSMArena/PhoneArena 10-Group Parser), 14 2026 Multi-Category Flagships & 36 Seeded Devices passed'
  );

  // 8. AiSpecEnricher Fail-Closed Validation & Provenance (K4, C8) (#164)
  const { AiSpecEnricher, sanitizeSpecifications } = await import('../ai-spec-enricher.js');
  const sanitizedValid = sanitizeSpecifications({
    display: { size_inch: '6.8 inches', refresh_rate_hz: '120Hz' },
    hardware: { ram_gb: '12GB', storage_gb: '256GB' },
  });
  assert.equal(sanitizedValid.display?.size_inch, 6.8);
  assert.equal(sanitizedValid.hardware?.ram_gb, 12);

  const enricher = new AiSpecEnricher({ apiKey: '' });
  const benchmarkCandidate = await enricher.enrichCandidate(s24);
  assert.equal(benchmarkCandidate.spec_source, 'benchmark_registry');
  console.log(
    '  ✅ [8/9] AiSpecEnricher Fail-Closed Validation, Provenance & Batch Retry Hardening (K4, C8) (#164) passed'
  );

  // 9. Data Contract Hardening: Numeric Bounds, MasterProduct Defaults & ScrapedProductSchema (Audit T15) (#171)
  const { MasterProductSchema, ScrapedProductSchema } = await import('@repo/shared-data');
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      hardware: { ram_gb: -8 },
    }).success,
    false,
    'Negative ram_gb must fail ProductSpecificationsSchema'
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      battery: { capacity_mah: 9999999 },
    }).success,
    false,
    'Out-of-bounds capacity_mah must fail ProductSpecificationsSchema'
  );

  const defaultMaster = MasterProductSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    model_key: 'apple:iphone-18-pro-max:256gb',
    name: 'Apple iPhone 18 Pro Max 256GB',
    slug: 'apple-iphone-18-pro-max-256gb',
  });
  assert.equal(defaultMaster.status, 'draft', 'MasterProductSchema must default to draft');
  assert.equal(
    defaultMaster.user_rating_weighted,
    undefined,
    'MasterProductSchema must not fabricate 0 for user_rating_weighted when omitted'
  );

  const validScraped = ScrapedProductSchema.safeParse(
    createDummyShopeeProduct('Điện thoại Apple iPhone 16 Pro Max 256GB')
  );
  assert.equal(
    validScraped.success,
    true,
    'Valid ShopeeProduct fixture must pass ScrapedProductSchema'
  );
  const invalidScraped = ScrapedProductSchema.safeParse({
    ...createDummyShopeeProduct('Invalid Product'),
    priceMin: -100,
  });
  assert.equal(invalidScraped.success, false, 'Negative priceMin must fail ScrapedProductSchema');
  console.log(
    '  ✅ [9/10] Data Contract Hardening: Numeric Bounds, Draft/Null Defaults & ScrapedProductSchema (Audit T15) (#171) passed'
  );

  // 10. Deep-Merge 10-Field-Group Specifications, Defensive Cache Cloning & Bounded Memory Cache (#496)
  const { MAX_SPEC_CACHE_ENTRIES, cloneAiEnrichmentResponse, mergeProductSpecifications } =
    await import('../ai-spec-enricher.js');
  const { EntityMatcher } = await import('../entity-matcher.js');

  assert.equal(MAX_SPEC_CACHE_ENTRIES, 250);

  const deepMergedSpecs = mergeProductSpecifications(
    {
      hardware: {
        ram_gb: 16,
        storage_gb: 512,
        os: 'Android 15',
      },
      display: {
        size_inch: 6.8,
        refresh_rate_hz: 120,
      },
      regulatory: {
        certifications: 'CE, RoHS',
      },
    },
    {
      hardware: {
        chipset: 'Qualcomm Snapdragon 8 Elite (3 nm)',
        cpu: 'Octa-core',
        os: '   ', // Empty string must not clobber existing 'Android 15'
      },
      camera: {
        main_camera: '200 MP, f/1.7, OIS',
      },
    },
    ['Titan Đen', '  Titan Trắng  ']
  );

  assert.equal(
    deepMergedSpecs.hardware?.ram_gb,
    16,
    'mergeProductSpecifications must preserve base hardware.ram_gb when incoming omits it (#496)'
  );
  assert.equal(
    deepMergedSpecs.hardware?.chipset,
    'Qualcomm Snapdragon 8 Elite (3 nm)',
    'mergeProductSpecifications must merge incoming hardware.chipset (#496)'
  );
  assert.equal(
    deepMergedSpecs.hardware?.os,
    'Android 15',
    'mergeProductSpecifications must not overwrite base string with whitespace-only incoming string (#496)'
  );
  assert.equal(
    deepMergedSpecs.display?.size_inch,
    6.8,
    'mergeProductSpecifications must preserve untouched base field groups (#496)'
  );
  assert.equal(
    deepMergedSpecs.regulatory?.certifications,
    'CE, RoHS',
    'mergeProductSpecifications must preserve base regulatory group (#496)'
  );
  assert.deepEqual(
    deepMergedSpecs.design?.colors,
    ['Titan Đen', 'Titan Trắng'],
    'mergeProductSpecifications must populate design.colors even when design group was absent (#496)'
  );

  const originalAiRes = {
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.7,
    battery_mah: 5000,
    has_5g: true,
    specifications: {
      hardware: { chipset: 'Apple A18 Pro', ram_gb: 12 },
      design: { colors: ['Black'] },
    },
    key_specs: { chip: 'Apple A18 Pro', ram: '12GB' },
  };
  const clonedAiRes = cloneAiEnrichmentResponse(originalAiRes);
  clonedAiRes.specifications.hardware!.chipset = 'Mutated Chip';
  clonedAiRes.specifications.design!.colors!.push('Gold');
  clonedAiRes.key_specs.chip = 'Mutated';
  assert.equal(
    originalAiRes.specifications.hardware?.chipset,
    'Apple A18 Pro',
    'cloneAiEnrichmentResponse must isolate nested specification objects (#496)'
  );
  assert.deepEqual(
    originalAiRes.specifications.design?.colors,
    ['Black'],
    'cloneAiEnrichmentResponse must isolate nested arrays (#496)'
  );
  assert.equal(
    originalAiRes.key_specs.chip,
    'Apple A18 Pro',
    'cloneAiEnrichmentResponse must isolate key_specs (#496)'
  );

  // Verify enrichMasterProductById selects existing specifications and deep-merges them
  let capturedSelectCols = '';
  let capturedUpdatePayload: Record<string, unknown> | null = null;
  const mockEnrichClient = {
    from(table: string) {
      assert.equal(table, 'master_products');
      return {
        select(cols: string) {
          capturedSelectCols = cols;
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: 'master-496',
                      brand: 'ASUS',
                      model: 'Zenbook S 14',
                      storage_gb: 1024,
                      ram_gb: 32,
                      screen_size_inch: 14,
                      battery_mah: null,
                      has_5g: false,
                      name: 'Laptop ASUS Zenbook S 14 OLED',
                      description: 'Intel Core Ultra 7',
                      colors: ['Zumaia Gray'],
                      specifications: {
                        display: { size_inch: 14, refresh_rate_hz: 120 },
                      },
                      key_specs: { screen: '14" 3K OLED 120Hz' },
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          capturedUpdatePayload = payload;
          return {
            async eq(_col: string, _val: string) {
              return { data: null, error: null };
            },
          };
        },
      };
    },
  } as unknown as import('../types.js').RateSupabaseClient;

  const stubEnricher = new AiSpecEnricher({ apiKey: '' });
  let capturedCategorySlug: string | undefined;
  stubEnricher.fetchSpecsFromAi = async params => {
    capturedCategorySlug = params.categorySlug;
    return {
      ram_gb: 32,
      storage_gb: 1024,
      screen_size_inch: 14,
      battery_mah: 7200,
      has_5g: false,
      specifications: {
        hardware: { chipset: 'Intel Core Ultra 7 258V' },
      },
      key_specs: { chip: 'Core Ultra 7 258V', storage: '1TB' },
    };
  };

  const enrichMatcher = new EntityMatcher(mockEnrichClient, stubEnricher);
  const enrichedOk = await enrichMatcher.enrichMasterProductById('master-496');
  assert.equal(enrichedOk, true);
  assert.ok(
    capturedSelectCols.includes('specifications'),
    'enrichMasterProductById must select existing specifications from master_products (#496)'
  );
  assert.equal(
    capturedCategorySlug,
    'laptops',
    'enrichMasterProductById must pass inferred categorySlug to fetchSpecsFromAi (#496)'
  );
  const updatedSpecs = (
    capturedUpdatePayload as { specifications?: Record<string, unknown> } | null
  )?.specifications as {
    display?: { size_inch?: number; refresh_rate_hz?: number };
    hardware?: { chipset?: string };
    design?: { colors?: string[] };
  };
  assert.equal(updatedSpecs?.display?.refresh_rate_hz, 120);
  assert.equal(updatedSpecs?.hardware?.chipset, 'Intel Core Ultra 7 258V');
  assert.deepEqual(updatedSpecs?.design?.colors, ['Zumaia Gray']);
  console.log(
    '  ✅ [10/11] Deep-Merge 10-Field-Group Specifications, Defensive Cache Cloning & Bounded Memory Cache (#496) passed'
  );

  // =========================================================================
  // 11. Backfill KeySpecs Merge, Whitespace Field Group Audit & Arena PhoneArena Fallbacks (#503)
  // =========================================================================
  const { mergeKeySpecs, auditMasterSpecs } = await import('../jobs/backfill-specs.js');

  const mergedKeys = mergeKeySpecs(
    { screen: '6.9" LTPO OLED 120Hz', chip: 'Apple A18 Pro', camera: '48MP + 48MP + 12MP' },
    {
      screen: '6.9" Super Retina XDR 120Hz',
      chip: undefined,
      camera: '   ',
      battery: '4685mAh 45W',
    }
  );
  assert.deepEqual(mergedKeys, {
    screen: '6.9" Super Retina XDR 120Hz',
    chip: 'Apple A18 Pro',
    camera: '48MP + 48MP + 12MP',
    battery: '4685mAh 45W',
  });

  assert.equal(
    countPopulatedFieldGroups({
      display: { type: '   ' },
      design: { colors: ['   ', ''] },
      hardware: { chipset: 'Snapdragon 8 Elite' },
    }),
    1,
    'countPopulatedFieldGroups must ignore whitespace-only strings and empty-element arrays (#503)'
  );

  const phoneArenaFallbackSpec = parseGsmArenaHtmlToSpecs('<html></html>', {
    phonearenaHtml: `
      <table>
        <tr><th>Device name</th><td>Google Pixel 10 Pro XL</td></tr>
        <tr><th>Screen size</th><td>6.8"</td></tr>
        <tr><th>Refresh rate</th><td>120 Hz</td></tr>
        <tr><th>System chip</th><td>Google Tensor G5</td></tr>
        <tr><th>RAM</th><td>16 GB RAM</td></tr>
        <tr><th>Internal storage</th><td>256 GB</td></tr>
        <tr><th>Main camera</th><td>50 MP, f/1.7, OIS</td></tr>
        <tr><th>Ultra-wide camera</th><td>48 MP, f/1.9, 123-degree</td></tr>
        <tr><th>Capacity</th><td>5200 mAh</td></tr>
        <tr><th>Charging</th><td>45W USB-C PD 3.1, reverse wireless</td></tr>
        <tr><th>NFC</th><td>No</td></tr>
        <tr><th>Colors</th><td>Obsidian, Porcelain, Hazel</td></tr>
      </table>
    `,
  });
  assert.equal(phoneArenaFallbackSpec.screenSizeInch, 6.8);
  assert.equal(phoneArenaFallbackSpec.specifications.battery?.fast_charging_w, 45);
  assert.equal(phoneArenaFallbackSpec.specifications.connectivity?.nfc, false);
  assert.deepEqual(phoneArenaFallbackSpec.specifications.design?.colors, [
    'Obsidian',
    'Porcelain',
    'Hazel',
  ]);

  await assert.rejects(
    () =>
      auditMasterSpecs({
        from: () => ({
          select: () => ({
            order: () => ({
              range: async (from: number) => ({
                data:
                  from === 0
                    ? [
                        {
                          id: 'm-ws',
                          name: 'Whitespace Cam Device',
                          model_key: 'test:ws:128gb',
                          specifications: {
                            ...phoneArenaFallbackSpec.specifications,
                            camera: {
                              main_camera: '50 MP',
                              second_camera: '   ',
                            },
                          },
                        },
                      ]
                    : [],
                error: null,
              }),
            }),
          }),
        }),
      } as never),
    /missing camera\.second_camera/,
    'auditMasterSpecs must reject whitespace-only camera.second_camera (#503)'
  );

  console.log(
    '  ✅ [11/12] Backfill KeySpecs Merge, Whitespace Field Group Audit & Arena PhoneArena Fallbacks (#503) passed'
  );

  // =========================================================================
  // 12. ProductNormalizer Category-Aware Fallbacks, Earbud Storage & Title Screen Size (#505)
  // =========================================================================
  const unbenchmarkedEarbuds = normalizer.normalize(
    createDummyShopeeProduct(
      'Tai nghe Bluetooth Bose QuietComfort Ultra Earbuds Chính hãng',
      6990000
    )
  );
  assert.equal(unbenchmarkedEarbuds.category_slug, 'earbuds');
  assert.equal(unbenchmarkedEarbuds.specifications.category_slug, 'earbuds');
  assert.equal(unbenchmarkedEarbuds.storage_gb, 1);
  assert.equal(unbenchmarkedEarbuds.variant_name, 'Standard');
  assert.equal(unbenchmarkedEarbuds.needs_review, false);
  assert.ok(unbenchmarkedEarbuds.model_key.endsWith(':1gb'));
  assert.equal(unbenchmarkedEarbuds.specifications.hardware?.os, 'Bluetooth 5.3 Audio DSP');
  assert.equal(unbenchmarkedEarbuds.specifications.cellular?.has_5g, false);
  assert.equal(unbenchmarkedEarbuds.specifications.cellular?.sim_type, 'No SIM');
  assert.equal(unbenchmarkedEarbuds.key_specs.camera, 'Active Noise Cancellation (ANC)');

  const unbenchmarkedLaptop = normalizer.normalize(
    createDummyShopeeProduct(
      'Laptop Dell XPS 14 14.5 inch OLED 16GB RAM 1TB SSD Chính hãng',
      48990000
    )
  );
  assert.equal(unbenchmarkedLaptop.category_slug, 'laptops');
  assert.equal(unbenchmarkedLaptop.specifications.category_slug, 'laptops');
  assert.equal(unbenchmarkedLaptop.screen_size_inch, 14.5);
  assert.equal(unbenchmarkedLaptop.specifications.display?.size_inch, 14.5);
  assert.equal(unbenchmarkedLaptop.specifications.hardware?.os, 'Windows 11 Home');
  assert.equal(unbenchmarkedLaptop.specifications.cellular?.has_5g, false);
  assert.equal(unbenchmarkedLaptop.specifications.cellular?.sim_type, 'No SIM');
  assert.equal(unbenchmarkedLaptop.key_specs.chip, 'Intel Core / AMD Ryzen');
  assert.equal(unbenchmarkedLaptop.key_specs.camera, '1080p FHD Webcam');

  const unbenchmarkedWatch = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Huawei Watch GT 5 Pro 1,4 inch 32GB', 7490000)
  );
  assert.equal(unbenchmarkedWatch.category_slug, 'smartwatches');
  assert.equal(unbenchmarkedWatch.specifications.category_slug, 'smartwatches');
  assert.equal(unbenchmarkedWatch.screen_size_inch, 1.4);
  assert.equal(unbenchmarkedWatch.specifications.hardware?.os, 'Wear OS 5');
  assert.equal(unbenchmarkedWatch.key_specs.camera, 'Optical HR + SpO2 Sensor');

  const mergedWithCategorySlug = mergeProductSpecifications(unbenchmarkedLaptop.specifications, {
    hardware: { chipset: 'Intel Core Ultra 7 155H' },
  });
  assert.equal(
    mergedWithCategorySlug.category_slug,
    'laptops',
    'mergeProductSpecifications must preserve category_slug after ProductSpecificationsSchema.safeParse (#505)'
  );

  console.log(
    '  ✅ [12/13] ProductNormalizer Category-Aware Fallbacks, Earbud Storage & Title Screen Size (#505) passed'
  );

  // =========================================================================
  // 13. AiReviewAnalyzer MerchantRiskBreakdown Schema Alignment (#521)
  // =========================================================================
  {
    const { AiReviewAnalyzer } = await import('../ai-review-analyzer.js');
    const analyzer521 = new AiReviewAnalyzer({ apiKey: '' });
    const sampleResults521 = [
      {
        review_id: 'r-1',
        verdict: 'authentic' as const,
        flag_category: 'authentic' as const,
        fake_probability: 0.05,
        include_in_rating: true,
        helpfulness_weight: 1.2,
        reason: 'Authentic review',
        signals: {
          burst_pattern_score: 0,
          duplicate_text_ratio: 0,
          account_age_bucket: 'high' as const,
          reviewer_history_score: 0.9,
          language_marker_score: 0.1,
        },
      },
      {
        review_id: 'r-2',
        verdict: 'suspicious' as const,
        flag_category: 'low_value_coin_spam' as const,
        fake_probability: 0.45,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Coin spam',
        signals: {
          burst_pattern_score: 0.2,
          duplicate_text_ratio: 0.5,
          account_age_bucket: 'medium' as const,
          reviewer_history_score: 0.4,
          language_marker_score: 0.6,
        },
      },
      {
        review_id: 'r-3',
        verdict: 'fake' as const,
        flag_category: 'seeding_fake' as const,
        fake_probability: 0.9,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Seeding fake',
        signals: {
          burst_pattern_score: 0.85,
          duplicate_text_ratio: 0.8,
          account_age_bucket: 'low' as const,
          reviewer_history_score: 0.1,
          language_marker_score: 0.85,
        },
      },
      {
        review_id: 'r-4',
        verdict: 'suspicious' as const,
        flag_category: 'competitor_sabotage' as const,
        fake_probability: 0.8,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Sabotage',
        signals: {
          burst_pattern_score: 0.7,
          duplicate_text_ratio: 0.6,
          account_age_bucket: 'low' as const,
          reviewer_history_score: 0.2,
          language_marker_score: 0.7,
        },
      },
    ];

    const eval521 = analyzer521.evaluateMerchantRisk({
      merchantId: 'merch-521',
      platform: 'shopee',
      isOfficial: false,
      reviewResults: sampleResults521,
    });
    assert.equal(eval521.total_reviews, 4);
    assert.equal(eval521.authentic_count, 1);
    assert.equal(eval521.coin_spam_count, 1);
    assert.equal(eval521.seeding_fake_count, 1);
    assert.equal(eval521.sabotage_or_bombing_count, 1);
    assert.equal(eval521.suspicious_ratio_pct, 75);

    let capturedMerchPayload: Record<string, unknown> | null = null;
    const stub521 = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
        upsert: async () => ({ error: null }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            if (table === 'merchants') {
              capturedMerchPayload = payload;
            }
            return { error: null };
          },
        }),
      }),
      rpc: async () => ({ error: null }),
    };

    await analyzer521.persistAnalysisToSupabase(stub521 as never, {
      productId: 'prod-521',
      masterId: 'master-521',
      merchantId: 'merch-521',
      platform: 'shopee',
      isOfficial: false,
      reviews: [
        {
          id: 'r-1',
          rating_star: 5,
          comment:
            'Máy dùng rất mượt, màn hình 120Hz sáng rõ ngoài trời, pin dùng trọn 1 ngày làm việc.',
        },
        {
          id: 'r-2',
          rating_star: 5,
          comment: 'Hình ảnh mang tính chất nhận xu',
        },
      ],
    });
    assert.ok(capturedMerchPayload, 'merchants.update must be invoked (#521)');
    const brk521 = (capturedMerchPayload as Record<string, unknown>)
      .review_risk_breakdown as Record<string, unknown>;
    assert.equal(brk521.total_reviews, 2);
    assert.equal(brk521.authentic_count, 1);
    assert.equal(brk521.coin_spam_count, 1);
    assert.equal(brk521.seeding_fake_count, 0);
    assert.equal(brk521.sabotage_or_bombing_count, 0);
    assert.equal(brk521.suspicious_ratio_pct, 50);
  }

  console.log('  ✅ [13/13] AiReviewAnalyzer MerchantRiskBreakdown Schema Alignment (#521) passed');

  console.log('🎉 All @repo/crawlers Open-Core Intelligence tests passed!');
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
