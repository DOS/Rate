/**
 * Verification & Spec Catalog Sync CLI for Provider-Agnostic AI Spec Enricher
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts               (offline tests, no DB writes)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts --backfill    (spec-only catalog sync + audit)
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts --audit-only  (catalog spec refresh + audit)
 *
 * The catalog sync only writes device specifications to rate.master_products. It never
 * creates listings, merchants, reviews, price history or expert scores.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ProductSpecificationsSchema, KeySpecsSchema } from '@repo/shared-data';
import { ProductNormalizer } from './product-normalizer.js';
import { AiSpecEnricher, sanitizeSpecifications } from './ai-spec-enricher.js';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
} from './flagship-seed-data.js';
import type { ShopeeProduct } from './types.js';

dotenv.config();
dotenv.config({ path: '../../.env' });

const REQUIRED_10_GROUPS = [
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

function makeDummyShopeeProduct(title: string, priceMin = 24990000): ShopeeProduct {
  return {
    itemId: 'test-item-1',
    shopId: 'test-shop-1',
    title,
    description: `${title} chính hãng VN/A bảo hành 12 tháng`,
    priceMin,
    priceMax: priceMin,
    currency: 'VND',
    historicalSold: 120,
    stock: 50,
    ratingStar: 4.9,
    ratingCount: 45,
    images: ['https://example.com/phone.jpg'],
    models: [
      { modelId: '1', name: 'Titan Tự Nhiên', price: priceMin, stock: 25 },
      { modelId: '2', name: 'Titan Đen', price: priceMin, stock: 25 },
    ],
    attributes: [],
    shop: {
      shopId: 'test-shop-1',
      name: 'Official Brand Store',
      isMall: true,
      ratingStar: 4.9,
      followerCount: 150000,
    },
    reviews: [],
    url: 'https://shopee.vn/test-product',
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('1. Testing ProductNormalizer (RAM/ROM extraction + Registry)');
  console.log('================================================================');

  const normalizer = new ProductNormalizer();

  // Case A: Samsung Galaxy A55 8GB RAM 256GB (Registry match + tricky RAM before ROM)
  const a55 = normalizer.normalize(
    makeDummyShopeeProduct('Điện thoại Samsung Galaxy A55 8GB RAM 256GB Chính Hãng', 9690000)
  );
  assert.equal(a55.brand, 'Samsung');
  assert.equal(a55.storage_gb, 256);
  assert.equal(a55.ram_gb, 8);
  assert.equal(a55.model_key, 'samsung:galaxy-a55:256gb');
  assert.equal(a55.is_benchmark_enriched, true);
  assert.equal(a55.specifications.camera?.rear_setup, 'Triple Camera');
  assert.ok(a55.specifications.camera?.second_camera?.includes('12 MP'));
  console.log(
    `✅ [Normalizer] ${a55.name} -> key=${a55.model_key}, camera=${a55.specifications.camera?.rear_setup}`
  );

  // Case B: Unknown new Android model (Xiaomi 14 Ultra 16GB RAM 512GB)
  const xiaomi = normalizer.normalize(
    makeDummyShopeeProduct('Điện thoại Xiaomi 14 Ultra 16GB RAM 512GB Quốc Tế', 26990000)
  );
  assert.equal(xiaomi.brand, 'Xiaomi');
  assert.equal(xiaomi.storage_gb, 512);
  assert.equal(xiaomi.ram_gb, 16);
  assert.ok(!xiaomi.specifications.design?.biometrics?.includes('Face ID'));
  console.log(
    `✅ [Normalizer] ${xiaomi.name} -> key=${xiaomi.model_key}, is_benchmark_enriched=${xiaomi.is_benchmark_enriched}, default OS=${xiaomi.specifications.hardware?.os}`
  );

  console.log('\n================================================================');
  console.log('2. Testing sanitizeSpecifications & Zod 10-Field-Group Schema');
  console.log('================================================================');

  const messyLlmOutput = {
    availability: { announced: 'February 2024', status: 'Available', prices_msrp: '29.990.000₫' },
    design: {
      dimensions: '161.4 x 75.3 x 9.2 mm',
      weight_g: '219.8 g',
      materials: 'Shield Glass front, eco-leather back, titanium/aluminum frame',
      resistance: 'IP68 dust/water resistant (1.5m for 30 min)',
      biometrics: 'Ultrasonic under-display fingerprint, Face unlock',
      colors: ['Black', 'White', 'Titanium Special Edition'],
    },
    display: {
      size_inch: '6.73 inches',
      type: 'LTPO AMOLED, 68B colors, 120Hz, Dolby Vision, HDR10+, 3000 nits (peak)',
      resolution: '1440 x 3200 pixels, 20:9 ratio',
      refresh_rate_hz: '120Hz',
      ppi: '522 ppi',
      protection: 'Xiaomi Shield Glass',
      features: 'Always-on display, Dolby Vision, HDR10+',
    },
    hardware: {
      chipset: 'Qualcomm SM8650-AB Snapdragon 8 Gen 3 (4 nm)',
      cpu: 'Octa-core (1x3.3 GHz Cortex-X4 & 3x3.2 GHz Cortex-A720 & 2x3.0 GHz Cortex-A720 & 2x2.3 GHz Cortex-A520)',
      gpu: 'Adreno 750',
      ram_gb: '16 GB',
      storage_gb: '512 GB',
      storage_expansion: 'Không hỗ trợ thẻ nhớ',
      os: 'Android 14, HyperOS',
    },
    battery: {
      capacity_mah: '5000 mAh',
      type: 'Li-Po 5000 mAh, non-removable',
      charging: '90W wired, 80W wireless, 10W reverse wireless',
      fast_charging_w: '90W',
      reverse_charging: true,
    },
    camera: {
      rear_setup: 'Quad Camera (Leica Summilux)',
      main_camera:
        '50 MP, f/1.63-f/4.0, 23mm (wide), 1.0"-type, multi-directional PDAF, Laser AF, OIS',
      second_camera: '50 MP, f/1.8, 75mm (telephoto), 3.2x optical zoom, PDAF, OIS',
      third_camera: '50 MP, f/2.5, 120mm (periscope telephoto), 5x optical zoom, PDAF, OIS',
      fourth_camera: '50 MP, f/1.8, 12mm, 122˚ (ultrawide), dual-pixel PDAF',
      flash: 'Dual-LED flash, HDR, panorama',
      video_recording:
        '8K@24/30fps, 4K@24/30/60/120fps, 1080p@30/60/120/240/480/960/1920fps, Dolby Vision HDR 10-bit',
      front_camera: '32 MP, f/2.0, 22mm (wide)',
    },
    connectivity: {
      bluetooth: '5.4, A2DP, LE, aptX HD, aptX Adaptive, LHDC',
      wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
      usb: 'USB Type-C 3.2 Gen 2, DisplayPort, OTG',
      sensors:
        'Fingerprint (under display, ultrasonic), accelerometer, proximity, gyro, compass, barometer',
      location: 'GPS (L1+L5), GLONASS (G1), BDS (B1I+B1c+B2a), GALILEO (E1+E5a), QZSS (L1+L5)',
      nfc: 'có',
      other: 'Infrared port, Two-way satellite communication',
    },
    cellular: {
      has_5g: 'true',
      bands_5g: 'SA/NSA/Sub6',
      bands_4g: 'LTE',
      technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
      sim_type: 'Nano-SIM and eSIM or Dual SIM (Nano-SIM, dual stand-by)',
      volte: true,
      vowifi: true,
    },
    multimedia: {
      loudspeaker: 'Stereo speakers (4-mic array)',
      headphone_jack_35mm: 'không',
      audio_features: '24-bit/192kHz Hi-Res & Hi-Res Wireless audio, Snapdragon Sound',
    },
    regulatory: {
      certifications: 'CE, FCC, RoHS, TÜV Rheinland Low Blue Light',
      sar_head: '0.99 W/kg',
      sar_body: '1.19 W/kg',
    },
  };

  const sanitized = sanitizeSpecifications(messyLlmOutput);
  const zodCheck = ProductSpecificationsSchema.safeParse(sanitized);
  assert.equal(zodCheck.success, true, 'Sanitized specs must pass ProductSpecificationsSchema');
  assert.equal(sanitized.design?.weight_g, 219.8);
  assert.equal(sanitized.display?.size_inch, 6.73);
  assert.equal(sanitized.display?.refresh_rate_hz, 120);
  assert.equal(sanitized.connectivity?.nfc, true);
  assert.equal(sanitized.multimedia?.headphone_jack_35mm, false);
  assert.ok(sanitized.camera?.fourth_camera?.includes('122˚ (ultrawide)'));
  console.log(
    '✅ [Sanitizer + Zod] All 10 Field Groups validated cleanly against ProductSpecificationsSchema!'
  );

  console.log('\n================================================================');
  console.log('3. Validating Flagship Seed & Backfill Registry (10 Field Groups)');
  console.log('================================================================');
  for (const [key, item] of Object.entries(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY)) {
    const parsedSpecs = ProductSpecificationsSchema.safeParse(item.specifications);
    assert.equal(
      parsedSpecs.success,
      true,
      `Backfill registry ${key} failed ProductSpecificationsSchema`
    );
    for (const grp of REQUIRED_10_GROUPS) {
      assert.ok(item.specifications[grp], `Backfill registry ${key} missing group ${grp}`);
    }
    assert.ok(
      item.specifications.camera?.main_camera,
      `Backfill registry ${key} missing main_camera`
    );
    assert.ok(
      item.specifications.camera?.second_camera,
      `Backfill registry ${key} missing second_camera`
    );
  }
  for (const device of FLAGSHIP_DEVICES_TO_SEED) {
    const parsedSpecs = ProductSpecificationsSchema.safeParse(device.specifications);
    assert.equal(
      parsedSpecs.success,
      true,
      `Flagship seed ${device.model_key} failed ProductSpecificationsSchema`
    );
    const parsedKeySpecs = KeySpecsSchema.safeParse(device.key_specs);
    assert.equal(
      parsedKeySpecs.success,
      true,
      `Flagship seed ${device.model_key} failed KeySpecsSchema`
    );
    for (const grp of REQUIRED_10_GROUPS) {
      assert.ok(
        device.specifications[grp],
        `Flagship seed ${device.model_key} missing group ${grp}`
      );
    }
    assert.ok(
      device.specifications.camera?.main_camera,
      `Flagship seed ${device.model_key} missing main_camera`
    );
    assert.ok(
      device.specifications.camera?.second_camera,
      `Flagship seed ${device.model_key} missing second_camera`
    );
    console.log(
      `✅ [Seed Validation] ${device.name} (${device.categorySlug}) -> 10/10 groups, camera=${device.specifications.camera?.rear_setup}`
    );
  }

  console.log('\n================================================================');
  console.log('4. Testing AiSpecEnricher End-to-End with Mock OpenAI-Compatible Server');
  console.log('================================================================');

  let requestCount = 0;
  const mockServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      requestCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ram_gb: 16,
                  storage_gb: 512,
                  screen_size_inch: 6.73,
                  battery_mah: 5000,
                  has_5g: true,
                  specifications: messyLlmOutput,
                  key_specs: {
                    screen: '6.73" LTPO AMOLED 120Hz',
                    chip: 'Snapdragon 8 Gen 3',
                    camera: '50MP Leica Quad (1-inch main)',
                    battery: '5000 mAh (90W)',
                    storage: '512GB',
                    ram: '16GB',
                  },
                }),
              },
            },
          ],
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const address = mockServer.address() as { port: number };
  const mockBaseUrl = `http://127.0.0.1:${address.port}/v1`;

  try {
    const enricher = new AiSpecEnricher({
      provider: 'dos-ai',
      apiKey: 'test-mock-key',
      baseUrl: mockBaseUrl,
      model: 'qwen-3.6-27b',
    });

    const unenrichedCandidate = { ...xiaomi, is_benchmark_enriched: false };
    const enriched = await enricher.enrichCandidate(
      unenrichedCandidate,
      'Điện thoại Xiaomi 14 Ultra 16GB RAM 512GB'
    );
    assert.equal(enriched.is_benchmark_enriched, false);
    assert.equal(enriched.spec_source, 'ai_unverified');
    assert.equal(enriched.screen_size_inch, 6.73);
    assert.equal(enriched.battery_mah, 5000);
    assert.equal(
      enriched.specifications.hardware?.chipset,
      'Qualcomm SM8650-AB Snapdragon 8 Gen 3 (4 nm)'
    );
    assert.equal(enriched.specifications.camera?.rear_setup, 'Quad Camera (Leica Summilux)');
    assert.equal(enriched.key_specs.chip, 'Snapdragon 8 Gen 3');
    assert.deepEqual(enriched.specifications.design?.colors, ['Titan Tự Nhiên', 'Titan Đen']);
    assert.equal(KeySpecsSchema.safeParse(enriched.key_specs).success, true);

    await enricher.enrichCandidate({ ...xiaomi, is_benchmark_enriched: false });
    assert.equal(
      requestCount,
      1,
      'In-memory cache should prevent duplicate API calls for the same model'
    );

    console.log('✅ [AiSpecEnricher] Mock OpenAI-compatible enrichment & caching passed 100%!');
  } finally {
    mockServer.close();
  }

  console.log('\n🎉 ALL AI SPEC ENRICHER TESTS PASSED!');
}

const isBackfill = process.argv.includes('--backfill');
const isAuditOnly = process.argv.includes('--audit-only');
const isApply = process.argv.includes('--apply');

(async () => {
  if (isAuditOnly) {
    const { runQuickSpecSyncAndAudit } = await import(
      './jobs/backfill-specs.js'
    );
    await runQuickSpecSyncAndAudit({ apply: isApply });
    return;
  }
  if (isBackfill) {
    const { runMasterSpecsBackfill } = await import('./jobs/backfill-specs.js');
    await runMasterSpecsBackfill({ apply: isApply });
    return;
  }
  await runTests();
})().catch((err) => {
  console.error('❌ Execution failed:', err);
  process.exit(1);
});

