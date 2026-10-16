/**
 * Verification Suite for Open-Core Intelligence Layer (@repo/crawlers):
 * - Multi-Category Detection (smartphones, tablets, laptops, smartwatches, earbuds)
 * - RAM/ROM Disambiguation & Identity Safety (:unknown + needs_review)
 * - 10-Field-Groups Benchmark Enrichment & Zod Schema Conformance
 */
import assert from 'node:assert/strict';
import { ProductSpecificationsSchema } from '@repo/shared-data';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import {
  FLAGSHIP_DEVICES_TO_SEED,
  SEED_MERCHANTS,
  synthesizeCrossPlatformOffersForMaster,
} from '../flagship-seed-data.js';
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
    models: [{ name: 'Titan Tự Nhiên', price: priceMin, stock: 10 }],
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
    scrapedAt: new Date().toISOString(),
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

  // 6. 10-Platform Merchant Coverage & Cross-Platform Offer/Review Synthesis
  assert.ok(SEED_MERCHANTS.length >= 18, 'Expected >= 18 multi-platform seed merchants');
  const merchantPlatforms = new Set(SEED_MERCHANTS.map(m => m.platform));
  for (const plat of [
    'shopee',
    'lazada',
    'tiki',
    'tiktok',
    'cellphones',
    'tgdd',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
  ] as const) {
    assert.ok(merchantPlatforms.has(plat), `SEED_MERCHANTS missing platform ${plat}`);
  }

  const synthOffers = synthesizeCrossPlatformOffersForMaster({
    modelKey: 'apple:iphone-16:128gb',
    name: 'Apple iPhone 16 128GB',
    slug: 'apple-iphone-16-128gb',
    brand: 'Apple',
    colors: ['Xanh Lưu Ly', 'Đen'],
    basePrice: 22_990_000,
    existingPlatforms: ['shopee'],
    keySpecs: {
      screen: '6.1" Super Retina XDR OLED',
      chip: 'Apple A18 (3 nm)',
      camera: '48MP Fusion + 12MP Ultrawide',
      battery: '3561 mAh',
      storage: '128GB',
      ram: '8GB',
    },
  });
  assert.equal(synthOffers.length, 9, 'Should synthesize 9 missing platform offers');
  assert.deepEqual(
    synthOffers.map(o => o.platform),
    [
      'lazada',
      'tiki',
      'tiktok',
      'cellphones',
      'tgdd',
      'fptshop',
      'hoangha',
      'didongviet',
      'phongvu',
    ]
  );
  for (const offer of synthOffers) {
    assert.ok(
      offer.price_history.length >= 6,
      'Each synthesized offer must have 60-day price history'
    );
    assert.ok(offer.reviews.length >= 2, 'Each synthesized offer must have multi-platform reviews');
  }
  console.log(
    '  ✅ [6/7] 10-Platform Cross-Offer, 60-Day Price History & Multi-Review Synthesis passed'
  );

  // 7. ArenaSpecSyncer (GSMArena [data-spec] + PhoneArena Split Camera) & 2026 Flagship Lineup
  const { parseGsmArenaHtmlToSpecs, UPSTREAM_2026_ARENA_REFERENCE_URLS } =
    await import('../arena-spec-syncer.js');

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

  // Ensure all 6 canonical 2026 upstream devices are present in FLAGSHIP_DEVICES_TO_SEED
  const seededModelKeys = new Set(FLAGSHIP_DEVICES_TO_SEED.map(d => d.model_key));
  for (const ref of UPSTREAM_2026_ARENA_REFERENCE_URLS) {
    assert.ok(
      seededModelKeys.has(ref.model_key),
      `Missing 2026 flagship ${ref.model_key} (${ref.name}) in FLAGSHIP_DEVICES_TO_SEED`
    );
  }
  console.log(
    '  ✅ [7/7] ArenaSpecSyncer (GSMArena/PhoneArena 10-Group Parser) & 2026 Flagship Lineup passed'
  );
  console.log('🎉 All @repo/crawlers Open-Core Intelligence tests passed!');
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
