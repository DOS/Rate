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

function runSuite() {
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
  console.log('  ✅ [5/5] Flagship Seed Dataset Multi-Brand Coverage (>=3 per Category) passed');
  console.log('🎉 All @repo/crawlers Open-Core Intelligence tests passed!');
}

runSuite();
