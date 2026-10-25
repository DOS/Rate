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
import {
  AiSpecEnricher,
  AiSpecEnrichmentPayloadSchema,
  extractJsonObjectString,
  resolveValidHttpBaseUrl,
  sanitizeSpecifications,
} from './ai-spec-enricher.js';
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

  // Case C: DOS/Rate#514 - Reject 0GB / 100TB storage, >2048GB RAM, out-of-bounds priceMin, and whitespace colors/images
  const zeroStorageProduct = makeDummyShopeeProduct(
    'Điện thoại Realme GT6 4000GB RAM 0GB Quốc Tế',
    2_500_000_000
  );
  zeroStorageProduct.models = [
    { modelId: '1', name: '   ', price: 10000000 },
    { modelId: '2', name: ' Bạc Ánh Kim ', price: 10000000 },
    { modelId: '3', name: 'Bạc Ánh Kim', price: 10000000 },
  ];
  zeroStorageProduct.images = [
    '  ',
    ' https://example.com/gt6.jpg ',
    'https://example.com/gt6.jpg',
  ];
  const normalizedZero = normalizer.normalize(zeroStorageProduct);
  assert.equal(normalizedZero.storage_gb, null, '0GB storage token must be rejected as null');
  assert.equal(normalizedZero.ram_gb, null, '4000GB RAM (> 2048) must be rejected as null');
  assert.equal(normalizedZero.model_key, 'realme:gt6:unknown');
  assert.equal(normalizedZero.needs_review, true);
  assert.deepEqual(normalizedZero.colors, ['Bạc Ánh Kim']);
  assert.deepEqual(normalizedZero.images, ['https://example.com/gt6.jpg']);
  assert.equal(
    normalizedZero.specifications.availability?.prices_msrp,
    'Không rõ dung lượng: 0₫',
    'priceMin > MAX_VALID_VND_PRICE must clamp to 0₫ in prices_msrp'
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse(normalizedZero.specifications).success,
    true,
    'Normalized specs with rejected 0GB/4000GB tokens must pass ProductSpecificationsSchema'
  );

  const hugeStorageProduct = normalizer.normalize(
    makeDummyShopeeProduct('Điện thoại Vivo X200 Pro 100000GB RAM 512GB Chính Hãng', 21990000)
  );
  assert.equal(
    hugeStorageProduct.storage_gb,
    512,
    '100000GB token before RAM keyword must be claimed by RAM so 512GB ROM is preserved'
  );
  assert.equal(
    hugeStorageProduct.ram_gb,
    null,
    'Claimed 100000GB RAM token (> 2048) must be rejected from ram_gb'
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse(hugeStorageProduct.specifications).success,
    true
  );

  const romOverflowProduct = normalizer.normalize(
    makeDummyShopeeProduct('Điện thoại Vivo X200 Pro ROM 100TB Chính Hãng', 21990000)
  );
  assert.equal(
    romOverflowProduct.storage_gb,
    null,
    'ROM 100TB (102400GB > 65536GB) must be rejected as null'
  );
  assert.equal(romOverflowProduct.needs_review, true);

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
      'In-memory cache should prevent duplicate API calls for the same model and RAM/storage'
    );

    // Verify cached specifications.design.colors was not mutated in-place by first candidate's colors (#356)
    const cachedColorsCandidate = await enricher.enrichCandidate({
      ...xiaomi,
      colors: [],
      is_benchmark_enriched: false,
    });
    assert.deepEqual(
      cachedColorsCandidate.specifications.design?.colors,
      ['Black', 'White', 'Titanium Special Edition'],
      'Candidate with empty colors must receive original AI design.colors without mutation from previous candidate'
    );

    // Verify different RAM variant (12GB/512GB vs 16GB/512GB) does not collide in memoryCache (#356)
    await enricher.enrichCandidate({
      ...xiaomi,
      ram_gb: 12,
      is_benchmark_enriched: false,
    });
    assert.equal(requestCount, 2, 'Different RAM variant must use a distinct cacheKey');

    // Verify sanitizeSpecifications strips out-of-range numeric fields without wiping valid groups (#356)
    const partialOutOfBounds = sanitizeSpecifications({
      ...messyLlmOutput,
      design: { ...messyLlmOutput.design, weight_g: 0 },
      display: { ...messyLlmOutput.display, ppi: -10, refresh_rate_hz: 99999 },
      battery: { ...messyLlmOutput.battery, capacity_mah: 0, fast_charging_w: 0 },
    });
    assert.equal(partialOutOfBounds.design?.weight_g, undefined);
    assert.equal(partialOutOfBounds.design?.dimensions, '161.4 x 75.3 x 9.2 mm');
    assert.equal(partialOutOfBounds.display?.ppi, undefined);
    assert.equal(partialOutOfBounds.display?.refresh_rate_hz, undefined);
    assert.equal(partialOutOfBounds.display?.size_inch, 6.73);
    assert.equal(partialOutOfBounds.battery?.capacity_mah, undefined);
    assert.equal(partialOutOfBounds.battery?.fast_charging_w, 0);
    assert.equal(
      partialOutOfBounds.hardware?.chipset,
      'Qualcomm SM8650-AB Snapdragon 8 Gen 3 (4 nm)'
    );

    // Verify extractJsonObjectString handles preamble/postamble text and markdown fences (#356)
    const wrappedJson =
      'Here are the specifications:\n```json\n{"ram_gb":12,"storage_gb":256}\n```\nHope this helps!';
    assert.deepEqual(JSON.parse(extractJsonObjectString(wrappedJson)), {
      ram_gb: 12,
      storage_gb: 256,
    });

    // DOS/Rate#522: sanitizeSpecifications rejects NaN/Infinity in toStringOrUndefined, deduplicates/filters design.colors, and normalizes reverse_charging
    const sanitized522 = sanitizeSpecifications({
      availability: { announced: NaN, status: Infinity, prices_msrp: '24.990.000₫' },
      design: {
        dimensions: '160 x 75 x 8 mm',
        colors: ['  Black  ', 'Black', {}, null, '', '   ', 'Silver'],
      },
      battery: {
        capacity_mah: 5000,
        reverse_charging: '   ',
      },
    });
    assert.equal(sanitized522.availability?.announced, undefined);
    assert.equal(sanitized522.availability?.status, undefined);
    assert.equal(sanitized522.availability?.prices_msrp, '24.990.000₫');
    assert.deepEqual(sanitized522.design?.colors, ['Black', 'Silver']);
    assert.equal(sanitized522.battery?.reverse_charging, undefined);

    const sanitizedBoolRevCharge = sanitizeSpecifications({
      battery: { capacity_mah: 5000, reverse_charging: 'true' },
      design: { colors: [{}, '   '] },
    });
    assert.equal(sanitizedBoolRevCharge.battery?.reverse_charging, true);
    assert.equal(sanitizedBoolRevCharge.design?.colors, undefined);

    // DOS/Rate#522: fetchSpecsFromAi bounds caller params.ramGb / params.storageGb so 0 or >max falls back to AI specs
    const boundedAiRes = await enricher.fetchSpecsFromAi({
      brand: 'Xiaomi',
      model: '14 Ultra',
      storageGb: 0,
      ramGb: 99999,
      categorySlug: 'smartphones',
    });
    assert.ok(boundedAiRes);
    assert.equal(
      boundedAiRes?.ram_gb,
      16,
      'Out-of-bounds params.ramGb (99999) must fall back to valid AI ram_gb'
    );
    assert.equal(
      boundedAiRes?.storage_gb,
      512,
      'Invalid params.storageGb (0) must fall back to valid AI storage_gb'
    );
    assert.equal(ProductSpecificationsSchema.safeParse(boundedAiRes?.specifications).success, true);

    // DOS/Rate#825: AiSpecEnrichmentPayloadSchema integer/domain bounds, baseUrl validation, fractional integer rejection, and enrichCandidate storage_gb backfill
    assert.equal(
      AiSpecEnrichmentPayloadSchema.safeParse({
        ram_gb: 4096,
        specifications: {},
      }).success,
      false,
      'AiSpecEnrichmentPayloadSchema must reject ram_gb > 2048'
    );
    assert.equal(
      AiSpecEnrichmentPayloadSchema.safeParse({
        ram_gb: 12.5,
        specifications: {},
      }).success,
      false,
      'AiSpecEnrichmentPayloadSchema must reject non-integer ram_gb'
    );

    const fallbackUrlEnricher = new AiSpecEnricher({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'javascript:alert(1)',
      timeoutMs: -50,
      temperature: 99,
    });
    assert.equal(fallbackUrlEnricher.getProviderInfo().baseUrl, 'https://api.openai.com/v1');

    const fractionalSpecs = sanitizeSpecifications({
      display: { size_inch: 6.7, refresh_rate_hz: 120.5, ppi: 450.2 },
      hardware: { ram_gb: 12.5, storage_gb: 256.8 },
      battery: { capacity_mah: 5000.5 },
    });
    assert.equal(fractionalSpecs.display?.size_inch, 6.7);
    assert.equal(fractionalSpecs.display?.refresh_rate_hz, undefined);
    assert.equal(fractionalSpecs.display?.ppi, undefined);
    assert.equal(fractionalSpecs.hardware?.ram_gb, undefined);
    assert.equal(fractionalSpecs.hardware?.storage_gb, undefined);
    assert.equal(fractionalSpecs.battery?.capacity_mah, undefined);

    const enrichedBackfillStorage = await enricher.enrichCandidate({
      ...xiaomi,
      ram_gb: 0 as unknown as null,
      storage_gb: null,
      is_benchmark_enriched: false,
    });
    assert.equal(enrichedBackfillStorage.ram_gb, 16);
    assert.equal(enrichedBackfillStorage.storage_gb, 512);

    // DOS/Rate#882: resolveValidHttpBaseUrl rejects credentials/query/fragment/control-chars, and sanitizeSpecifications strips HTML/control chars & bounds colors
    assert.equal(
      resolveValidHttpBaseUrl('https://user:pass@api.example.com/v1', 'https://api.openai.com/v1'),
      'https://api.openai.com/v1',
      'resolveValidHttpBaseUrl must reject embedded URL credentials'
    );
    assert.equal(
      resolveValidHttpBaseUrl('https://api.example.com/v1?foo=1', 'https://api.openai.com/v1'),
      'https://api.openai.com/v1',
      'resolveValidHttpBaseUrl must reject query strings on baseUrl'
    );
    assert.equal(
      resolveValidHttpBaseUrl('https://api.example.com/v1#frag', 'https://api.openai.com/v1'),
      'https://api.openai.com/v1',
      'resolveValidHttpBaseUrl must reject fragments on baseUrl'
    );
    assert.equal(
      resolveValidHttpBaseUrl('https://api.example.com/v1\u0000/', 'https://api.openai.com/v1'),
      'https://api.openai.com/v1',
      'resolveValidHttpBaseUrl must reject control characters in baseUrl'
    );
    const sanitizedHtmlSpecs = sanitizeSpecifications({
      hardware: {
        chipset: '  <b>Apple A18 Pro</b>\u0000<script>alert(1)</script> (3 nm)  ',
      },
      design: {
        colors: [
          '<b>Titan</b>\u0000 Đen',
          'x'.repeat(120),
          ...Array.from({ length: 40 }, (_, idx) => `Color-${idx}`),
        ],
      },
    });
    assert.equal(sanitizedHtmlSpecs.hardware?.chipset, 'Apple A18 Pro alert(1) (3 nm)');
    assert.equal(sanitizedHtmlSpecs.design?.colors?.[0], 'Titan Đen');
    assert.equal(sanitizedHtmlSpecs.design?.colors?.[1]?.length, 80);
    assert.equal(sanitizedHtmlSpecs.design?.colors?.length, 32);

    // DOS/Rate#888: ArenaSpecSyncer Object.hasOwn prototype safety, C1 control-char URL guard, and audit key normalization
    const {
      ArenaSpecSyncer,
      extractGsmArenaDataSpecs,
      extractPhoneArenaTableSpecs,
      parseGsmArenaBrandCatalogHtml,
    } = await import('./arena-spec-syncer.js');
    const gsmSpecs888 = extractGsmArenaDataSpecs(
      '<td data-spec="toString">Proto\u0000Value</td><td data-spec="modelname">Apple\u0085iPhone 18 Pro</td>'
    );
    assert.equal(
      gsmSpecs888.toString,
      'Proto Value',
      'extractGsmArenaDataSpecs must use Object.hasOwn so prototype keys like toString are captured'
    );
    assert.equal(
      gsmSpecs888.modelname,
      'Apple iPhone 18 Pro',
      'extractGsmArenaDataSpecs must strip C1 control characters from values'
    );
    const paSpecs888 = extractPhoneArenaTableSpecs(
      '<tr><th>toString:</th><td>PA\u0000Proto</td></tr><tr><th>System chip</th><td>Apple A20 Pro</td></tr>'
    );
    assert.equal(
      paSpecs888.tostring,
      'PA Proto',
      'extractPhoneArenaTableSpecs must use Object.hasOwn so prototype keys are captured'
    );
    const catalog888 = parseGsmArenaBrandCatalogHtml(
      '<li><a href="apple_iphone_18\u0085-1.php"><span>iPhone 18</span></a></li>' +
        '<li><a href="apple_iphone_18_pro-2.php"><span>iPhone 18 Pro</span></a></li>',
      'Apple'
    );
    assert.equal(
      catalog888.length,
      1,
      'parseGsmArenaBrandCatalogHtml must reject URLs containing C1 control characters'
    );
    const syncer888 = new ArenaSpecSyncer();
    const auditReport888 = await syncer888.auditCatalogAgainstArenaRegistry({
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number) => ({
              data:
                from === 0
                  ? [
                      {
                        id: 'm-1',
                        name: 'Xiaomi 18 Pro Max 512GB',
                        model_key: '  XIAOMI:18-PRO-MAX:512GB\u0000 ',
                        slug: '  xiaomi-18-pro-max-512gb\r\n ',
                        specifications: null,
                      },
                    ]
                  : [],
              error: null,
            }),
          }),
        }),
      }),
    });
    assert.equal(
      auditReport888.missingFromDatabase.some(r => r.model_key === 'xiaomi:18-pro-max:512gb'),
      false,
      'auditCatalogAgainstArenaRegistry must trim and strip control chars from DB model_key and slug'
    );

    console.log('✅ [AiSpecEnricher] Mock OpenAI-compatible enrichment & caching passed 100%!');
    // DOS/Rate#904: merchant-review-risk C1 control-char & nullish guards, ai-spec-enricher negative-string guard, entity-matcher boolean similarity guard, and shopee-to-supabase NaN/boolean guards
    const { uniqueIds, strongestPriceAnomaly, scoreMerchants } =
      await import('./merchant-review-risk.js');
    const { trimTrailingSlashes, cloneAiEnrichmentResponse } =
      await import('./ai-spec-enricher.js');
    const { hasPopulatedSpecificationGroups, normalizeScrapedProductPrices } =
      await import('./shopee-to-supabase.js');

    assert.deepEqual(
      uniqueIds(['valid-id', 'badid', 'bad id']),
      ['valid-id'],
      'uniqueIds must reject C1 and C0 control characters via normalizeSafeId'
    );
    assert.equal(
      strongestPriceAnomaly(
        null as unknown as Parameters<typeof strongestPriceAnomaly>[0],
        [],
        new Map(),
        new Map(),
        new Map()
      ),
      null,
      'strongestPriceAnomaly must guard nullish merchant'
    );
    assert.deepEqual(
      scoreMerchants(
        null as unknown as Parameters<typeof scoreMerchants>[0],
        null as unknown as [],
        null as unknown as [],
        null as unknown as [],
        new Map()
      ),
      [],
      'scoreMerchants must guard non-array inputs'
    );

    const negStringSpecs = sanitizeSpecifications({
      hardware: { ram_gb: '-12 GB', storage_gb: '256 GB' },
      display: { size_inch: '-6.7 inch' },
    });
    assert.equal(
      negStringSpecs.hardware?.ram_gb,
      undefined,
      'sanitizeSpecifications must not parse "-12 GB" as +12'
    );
    assert.equal(negStringSpecs.hardware?.storage_gb, 256);
    assert.equal(
      negStringSpecs.display?.size_inch,
      undefined,
      'sanitizeSpecifications must not parse "-6.7 inch" as +6.7'
    );
    assert.equal(extractJsonObjectString(null as unknown as string), '');
    assert.equal(trimTrailingSlashes(null as unknown as string), '');
    assert.deepEqual(cloneAiEnrichmentResponse(null as unknown as never).specifications, {});

    assert.equal(
      hasPopulatedSpecificationGroups({
        display: { size_inch: Number.NaN, ppi: Number.POSITIVE_INFINITY },
      }),
      false,
      'hasPopulatedSpecificationGroups must reject NaN and Infinity numbers'
    );
    const normalizedPrices904 = normalizeScrapedProductPrices({
      platform: 'shopee',
      itemId: '1',
      shopId: '2',
      url: 'https://shopee.vn/item-i.2.1',
      title: 'Phone',
      priceMin: 10_000_000,
      priceMax: true as unknown as number,
      priceBeforeDiscount: true as unknown as number,
      currency: 'VND',
      stock: 5,
      historicalSold: 10,
      ratingStar: 4.9,
      ratingCount: 10,
      images: [],
      attributes: [],
      models: [{ modelId: 'm1', name: '128GB', price: true as unknown as number, stock: 1 }],
      shop: { shopId: '2', name: 'Shop', isMall: false, ratingStar: 4.9, followerCount: 100 },
      reviews: [],
    });
    assert.equal(
      normalizedPrices904.priceMax,
      10_000_000,
      'normalizeScrapedProductPrices must reject boolean priceMax'
    );
    assert.equal(
      normalizedPrices904.priceBeforeDiscount,
      undefined,
      'normalizeScrapedProductPrices must reject boolean priceBeforeDiscount'
    );
    assert.deepEqual(
      normalizedPrices904.models,
      [],
      'normalizeScrapedProductPrices must reject boolean model price'
    );

    // 10. ArenaSpecSyncer, ProductNormalizer & Logger Bounds (#906)
    const { countPopulatedFieldGroups, splitCameraModulesToPhoneArenaFormat } =
      await import('./arena-spec-syncer.js');
    const { detectProductCondition, detectProductOrigin, detectCategorySlug } =
      await import('./product-normalizer.js');
    const { computeImporterAlgorithmMetadata, redactSensitiveString, sanitizeLogMeta } =
      await import('./logger.js');

    const circularGroup906: Record<string, unknown> = {};
    circularGroup906.self = circularGroup906;
    assert.equal(
      countPopulatedFieldGroups({ display: circularGroup906 }),
      0,
      'countPopulatedFieldGroups must not overflow stack on circular spec group'
    );
    assert.deepEqual(
      splitCameraModulesToPhoneArenaFormat(null as unknown as string),
      {},
      'splitCameraModulesToPhoneArenaFormat must guard non-string input'
    );

    assert.equal(
      detectProductCondition(null as unknown as string),
      'new',
      'detectProductCondition must guard non-string title'
    );
    assert.equal(
      detectProductOrigin(null as unknown as string),
      'unknown',
      'detectProductOrigin must guard non-string title'
    );
    assert.equal(
      detectCategorySlug(null as unknown as string),
      'smartphones',
      'detectCategorySlug must guard non-string title'
    );
    const normalized906 = new ProductNormalizer().normalize({
      itemId: '906',
      shopId: '2',
      url: 'https://shopee.vn/item-i.2.906',
      title: 'Apple iPhone 16 Pro Max 256GB VN/A',
      description: 'M\u0085y m\u009fi 100%',
      priceMin: true as unknown as number,
      priceMax: 30_000_000,
      currency: 'VND',
      stock: 5,
      historicalSold: 10,
      ratingStar: 4.9,
      ratingCount: 10,
      images: ['https://user:pass@cf.shopee.vn/file/bad.jpg', 'https://cf.shopee.vn/file/good.jpg'],
      attributes: [],
      models: [],
      shop: { shopId: '2', name: 'Shop', isMall: true, ratingStar: 4.9, followerCount: 100 },
      reviews: [],
    });
    assert.ok(
      !/\p{Cc}/u.test(normalized906.description ?? ''),
      'ProductNormalizer must strip C1 control characters from description'
    );
    assert.deepEqual(
      normalized906.images,
      ['https://cf.shopee.vn/file/good.jpg'],
      'ProductNormalizer must reject image URLs with embedded credentials'
    );
    assert.ok(
      normalized906.specifications.availability?.prices_msrp?.includes(': 0'),
      'ProductNormalizer must reject boolean priceMin'
    );

    const circularParams906: Record<string, unknown> = { a: 1 };
    circularParams906.self = circularParams906;
    const importerMeta906 = computeImporterAlgorithmMetadata(
      '  norm_engine\u0000\r\n ',
      ' 2.0.0\u0007 ',
      circularParams906
    );
    assert.equal(importerMeta906.algo, 'norm_engine');
    assert.equal(importerMeta906.version, '2.0.0');
    assert.equal(importerMeta906.paramsHash.length, 12);
    assert.equal(
      redactSensitiveString(123 as unknown as string),
      '',
      'redactSensitiveString must return empty string for non-string input'
    );
    const sanitizedMeta906 = sanitizeLogMeta({
      publishableKey: 'dummy',
      publishable_key: 'dummy',
    }) as Record<string, unknown>;
    assert.equal(sanitizedMeta906.publishableKey, '[REDACTED]');
    assert.equal(sanitizedMeta906.publishable_key, '[REDACTED]');

    // Regression tests for #952: AI spec enricher, peer floor, merchant risk, and price normalizer
    const { resolveClusterPeerFloorPrice: resolveFloor952 } =
      await import('./cluster-peer-floor.js');
    const { toValidPrice: toValidPrice952, mapStoredReview: mapStoredReview952 } =
      await import('./merchant-review-risk.js');

    const clonedMalformed952 = cloneAiEnrichmentResponse({
      ram_gb: 99_999,
      storage_gb: -16,
      screen_size_inch: 250,
      battery_mah: 999_999,
      has_5g: 'maybe' as unknown as boolean,
      specifications: {} as never,
      key_specs: {
        screen: '  6.8" OLED\u0000\r\n ',
        chip: '   ',
      } as never,
    });
    assert.equal(clonedMalformed952.ram_gb, null);
    assert.equal(clonedMalformed952.storage_gb, null);
    assert.equal(clonedMalformed952.screen_size_inch, null);
    assert.equal(clonedMalformed952.battery_mah, null);
    assert.equal(clonedMalformed952.has_5g, undefined);
    assert.deepEqual(clonedMalformed952.key_specs, { screen: '6.8" OLED' });
    assert.deepEqual(cloneAiEnrichmentResponse([] as unknown as never).key_specs, {});

    assert.equal(
      resolveFloor952(
        [
          {
            id: 'peer-1',
            price_current: 24_990_000.6,
            merchants: { is_official: true },
          },
        ],
        'self-1',
        26_990_000.4
      ),
      24_990_001,
      'resolveClusterPeerFloorPrice must round peer prices to integer VND'
    );
    assert.equal(
      resolveFloor952([], 'self-1', 26_990_000.4),
      26_990_000,
      'resolveClusterPeerFloorPrice must round fallbackMasterMinPrice to integer VND'
    );

    assert.equal(toValidPrice952(19_990_000.6), 19_990_001);
    const mappedSparseFlags952 = mapStoredReview952({
      id: 'rev-sparse-952',
      product_id: 'prod-952',
      rating_star: 5,
      comment: 'Great phone',
      review_flags: [
        null as unknown as { verdict?: string | null },
        { verdict: 'fake', flag_category: 'seeding_fake', include_in_rating: false },
      ],
    });
    assert.equal(mappedSparseFlags952?.result.verdict, 'fake');
    assert.equal(mappedSparseFlags952?.result.include_in_rating, false);

    const normalizedPrices952 = normalizeScrapedProductPrices({
      platform: 'shopee',
      itemId: '952',
      shopId: '888',
      title: 'iPhone 16 Pro Max',
      priceMin: 29_990_000.6,
      priceMax: 29_990_000.2,
      priceBeforeDiscount: 34_990_000.4,
      currency: 'VND',
      stock: 10,
      historicalSold: 12.9,
      ratingStar: 4.9,
      ratingCount: 5,
      images: [],
      attributes: [],
      models: [{ modelId: 'm1', name: '256GB', price: 29_990_000.6, stock: 5 }],
      shop: {
        shopId: '888',
        name: 'Official',
        isMall: true,
        ratingStar: 4.9,
        followerCount: 1000,
      },
      reviews: [
        null as unknown as never,
        {
          reviewId: 'r1',
          author: 'User',
          ratingStar: 5,
          comment: 'Nice',
          createdAt: '2026-10-01T00:00:00Z',
          images: [],
        },
      ],
      url: 'https://shopee.vn/item-i.888.952',
    });
    assert.equal(normalizedPrices952.priceMin, 29_990_001);
    assert.equal(normalizedPrices952.priceMax, 29_990_001);
    assert.equal(normalizedPrices952.priceBeforeDiscount, 34_990_000);
    assert.equal(normalizedPrices952.models[0]?.price, 29_990_001);
    assert.equal(normalizedPrices952.reviews.length, 1);
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
    const { runQuickSpecSyncAndAudit } = await import('./jobs/backfill-specs.js');
    await runQuickSpecSyncAndAudit({ apply: isApply });
    return;
  }
  if (isBackfill) {
    const { runMasterSpecsBackfill } = await import('./jobs/backfill-specs.js');
    await runMasterSpecsBackfill({ apply: isApply });
    return;
  }
  await runTests();
})().catch(err => {
  console.error('❌ Execution failed:', err);
  process.exit(1);
});
