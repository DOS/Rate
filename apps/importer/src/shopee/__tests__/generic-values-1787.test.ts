/**
 * DOS/Rate#1787: generic or wrong spec values left after DOS/Rate#1761. Registry laptops,
 * watches, earbuds and the iPad Pro M5 had ports, sensors, microphones, controls and a
 * flash in their camera fields; a laptop, watch, earbuds, phone or tablet outside the
 * registry got a category guess for every camera field; and a non-Apple phone got generic
 * Android materials, biometrics, IP rating, sensors, GNSS, flash, video, display features,
 * LTE, SIM, VoLTE and Wi-Fi calling text. Each field now holds a sourced registry or seed
 * value, or none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { auditMasterSpecs, statesRearCamera } from '../jobs/backfill-specs.js';
import { SOURCED_SEEDS_2025 } from '../flagship-seed-sourced-2025.js';
import { SOURCED_SEEDS_2026 } from '../flagship-seed-sourced-2026.js';
import { SOURCED_SEEDS_IPHONE_17E } from '../flagship-seed-sourced-iphone-17e.js';
import { ProductNormalizer } from '../product-normalizer.js';
import type { ShopeeProduct } from '../types.js';

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 15_000_000,
    priceMax: 15_000_000,
    priceBeforeDiscount: 0,
    currency: 'VND',
    stock: 1,
    historicalSold: 1,
    ratingStar: 5,
    ratingCount: 1,
    images: [],
    models: [],
    attributes: [],
    shop: { shopId: '2' },
  } as unknown as ShopeeProduct);

const seed = (modelKey: string) => {
  const found = [...SOURCED_SEEDS_2025, ...SOURCED_SEEDS_2026, ...SOURCED_SEEDS_IPHONE_17E].find(
    s => s.model_key === modelKey
  );
  assert.ok(found, modelKey);
  return found.specifications;
};

/** Every string value in a nested spec object. */
const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
};

// The generic values this issue removes, compared whole (some are prefixes of sourced text).
const GENERIC = [
  // Category camera guesses.
  '1080p FHD Webcam with Dual-Array Mic',
  'IR Camera / Privacy Shutter',
  '1080p FHD Webcam',
  'Multi-Mic Array + Active Noise Cancellation (ANC)',
  'Voice Pickup & Ambient Sound Sensor',
  'Capacitive Touch Controls',
  'Active Noise Cancellation (ANC)',
  'Optical Heart Rate + SpO2 Blood Oxygen Sensor',
  'Accelerometer + Gyroscope + Altimeter',
  'AMOLED Touch + Physical Crown/Button',
  'Optical HR + SpO2 Sensor',
  '50 MP (wide, OIS)',
  '12 MP (ultrawide)',
  '50 MP OIS',
  // Android phone text.
  'Glass front/back, metal frame',
  'IP68 dust/water resistant',
  'Fingerprint (under display), Face unlock',
  'Vân tay dưới màn hình, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn',
  'GPS, GLONASS, Galileo, QZSS, BeiDou',
  'LED flash, auto-HDR, panorama',
  '4K@30/60fps, 1080p@30/60/120/240fps, HDR',
  'Always-on display, HDR10+, Eye Comfort Shield',
  'LTE Cat 20',
  '2 Nano-SIM + eSIM',
];

const assertNoGeneric = (title: string) => {
  const n = normalize(title);
  const values = [...strings(n.specifications), ...strings(n.key_specs)];
  for (const generic of GENERIC) assert.ok(!values.includes(generic), `${title}: ${generic}`);
  return n;
};

const CAMERA_FIELDS = [
  'rear_setup',
  'main_camera',
  'second_camera',
  'third_camera',
  'fourth_camera',
  'front_camera',
  'flash',
  'video_recording',
] as const;

test('a registry watch or earbuds has no camera fields', () => {
  for (const title of [
    'Apple Watch Ultra 2 49mm',
    'Apple Watch Series 10 42mm',
    'Apple Watch Series 11 46mm',
    'Apple Watch Ultra 3 49mm',
    'Samsung Galaxy Watch Ultra 47mm',
    'Đồng hồ Garmin Forerunner 265',
    'Tai nghe AirPods Pro 2',
    'Tai nghe AirPods Pro 3',
    'Sony WF-1000XM5',
    'Sony WF-1000XM6',
    'Samsung Galaxy Buds3 Pro',
  ]) {
    const n = assertNoGeneric(title);
    assert.equal(n.is_benchmark_enriched, true, title);
    assert.ok(['smartwatches', 'earbuds'].includes(n.category_slug), title);
    for (const field of CAMERA_FIELDS) {
      assert.equal(n.specifications.camera?.[field], undefined, `${title} ${field}`);
    }
    assert.equal(n.key_specs.camera, undefined, title);
  }
});

test('a registry laptop has only its webcam, and no port, mic or sensor text', () => {
  for (const [title, webcam] of [
    ['Apple MacBook Air M3 13 inch 256GB', '1080p FaceTime HD camera'],
    ['MacBook Air M4 13 inch 256GB', '12MP Center Stage camera with Desk View (1080p HD)'],
    [
      'Apple MacBook Pro 14 inch M4 Pro 512GB',
      '12MP Center Stage camera with Desk View (1080p HD)',
    ],
    ['Laptop Asus Zenbook S 14 OLED 1TB', '1080p FHD AiSense IR Webcam with privacy shutter'],
    [
      'Laptop Lenovo ThinkPad X1 Carbon Gen 12 512GB',
      'FHD 1080p MIPI + IR discrete camera with physical shutter',
    ],
  ] as const) {
    const n = assertNoGeneric(title);
    assert.equal(n.is_benchmark_enriched, true, title);
    assert.equal(n.category_slug, 'laptops', title);
    const camera = n.specifications.camera;
    assert.equal(camera?.front_camera, webcam, title);
    for (const field of CAMERA_FIELDS.filter(f => f !== 'front_camera')) {
      assert.equal(camera?.[field], undefined, `${title} ${field}`);
    }
    assert.equal(n.key_specs.camera, webcam, title);
  }
});

test('the iPad Pro M5 lists its flash as no second camera', () => {
  const n = assertNoGeneric('Apple iPad Pro M5 11 inch 256GB');
  assert.equal(n.is_benchmark_enriched, true);
  const camera = n.specifications.camera;
  assert.equal(camera?.second_camera, undefined);
  assert.equal(camera?.rear_setup, 'Single Camera');
  assert.match(camera?.main_camera ?? '', /^12 MP/);
});

test('a listing outside the registry gets no category camera guess', () => {
  for (const title of [
    'Laptop Dell XPS 13 512GB',
    'Tai nghe JBL Tune 230NC',
    'Đồng hồ thông minh Huawei Watch GT 5 Pro 1,4 inch 32GB',
    'Samsung Galaxy Watch7 44mm',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Samsung Galaxy A35 5G 128GB',
    'Apple iPhone 11 64GB',
    'Samsung Galaxy Tab A9 64GB',
  ]) {
    const n = assertNoGeneric(title);
    assert.equal(n.is_benchmark_enriched, false, title);
    for (const field of CAMERA_FIELDS) {
      assert.equal(n.specifications.camera?.[field], undefined, `${title} ${field}`);
    }
    assert.equal(n.key_specs.camera, undefined, title);
  }
});

test('a non-Apple phone gets no generic Android design, sensor, GNSS, video or network text', () => {
  for (const title of [
    'Samsung Galaxy A35 5G 128GB',
    '[Chính hãng] Xiaomi Redmi Note 14 Pro 5G 256GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Samsung Galaxy A55 5G 128GB',
    'Google Pixel 9 Pro XL 256GB',
  ]) {
    const n = assertNoGeneric(title);
    assert.equal(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.equal(out.design?.materials, undefined, title);
    assert.equal(out.design?.biometrics, undefined, title);
    assert.equal(out.connectivity?.sensors, undefined, title);
    assert.equal(out.connectivity?.location, undefined, title);
    assert.equal(out.camera?.flash, undefined, title);
    assert.equal(out.camera?.video_recording, undefined, title);
    assert.equal(out.display?.features, undefined, title);
    // A 5G phone keeps its 5G flag, without generic LTE, SIM, VoLTE or Wi-Fi calling text.
    assert.equal(out.cellular?.has_5g, true, title);
    assert.equal(out.cellular?.bands_4g, undefined, title);
    assert.equal(out.cellular?.sim_type, undefined, title);
    assert.equal(out.cellular?.volte, undefined, title);
    assert.equal(out.cellular?.vowifi, undefined, title);
    // Only a registry entry states an IP rating.
    if (!n.is_benchmark_enriched) assert.equal(out.design?.resistance, undefined, title);
    else assert.match(out.design?.resistance ?? '', /^IP6/, title);
  }
  // An iPhone keeps Apple's biometrics, but no generic IP rating or video, and outside the
  // registry no Apple materials text (DOS/Rate#1790).
  const iphone = assertNoGeneric('Apple iPhone 13 128GB').specifications;
  assert.equal(iphone.design?.materials, undefined);
  assert.equal(iphone.design?.biometrics, 'Face ID');
  assert.equal(iphone.design?.resistance, undefined);
  assert.equal(iphone.camera?.video_recording, undefined);
});

test('a registry model with a sourced seed gets the seed’s values', () => {
  const s26 = assertNoGeneric('Samsung Galaxy S26 Ultra 256GB').specifications;
  const s26Seed = seed('samsung:galaxy-s26-ultra:256gb');
  assert.ok(s26Seed.design?.materials && s26Seed.design?.biometrics);
  assert.equal(s26.design?.materials, s26Seed.design?.materials);
  assert.equal(s26.design?.biometrics, s26Seed.design?.biometrics);
  assert.equal(s26.display?.features, s26Seed.display?.features);
  assert.equal(s26.connectivity?.sensors, s26Seed.connectivity?.sensors);
  assert.equal(s26.camera?.video_recording, s26Seed.camera?.video_recording);
  assert.equal(s26.cellular?.bands_4g, s26Seed.cellular?.bands_4g);
  assert.equal(s26.cellular?.sim_type, s26Seed.cellular?.sim_type);

  for (const [title, modelKey] of [
    ['Apple iPhone 18 Pro Max 256GB', 'apple:iphone-18-pro-max:256gb'],
    ['Apple iPhone 18 Pro 256GB', 'apple:iphone-18-pro:256gb'],
  ] as const) {
    const out = assertNoGeneric(title).specifications;
    const s = seed(modelKey);
    assert.ok(s.camera?.video_recording && s.cellular?.bands_4g && s.cellular?.sim_type);
    assert.equal(out.camera?.video_recording, s.camera?.video_recording, title);
    assert.equal(out.cellular?.bands_4g, s.cellular?.bands_4g, title);
    assert.equal(out.cellular?.sim_type, s.cellular?.sim_type, title);
  }
  for (const [title, modelKey] of [
    ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
    ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
  ] as const) {
    const out = assertNoGeneric(title).specifications;
    const s = seed(modelKey);
    assert.ok(s.camera?.video_recording, modelKey);
    assert.equal(out.camera?.video_recording, s.camera?.video_recording, title);
  }
});

test('the spec audit accepts a master whose camera group states no rear camera', async () => {
  const titles = [
    'Laptop Dell XPS 13 512GB',
    'Apple MacBook Air M3 13 inch 256GB',
    'Sony WF-1000XM5',
    'Tai nghe JBL Tune 230NC',
    'Apple Watch Ultra 2 49mm',
    'Samsung Galaxy Watch7 44mm',
    'Samsung Galaxy A35 5G 128GB',
    'Samsung Galaxy Tab A9 64GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Apple iPhone 16e 128GB',
  ];
  const rows = titles.map((title, i) => {
    const n = normalize(title);
    return { id: `m${i}`, name: title, model_key: n.model_key, specifications: n.specifications };
  });
  // Only the registry phones state rear cameras; the rest leave the group to a spec sync.
  assert.deepEqual(
    rows.filter(r => statesRearCamera(r.specifications.camera)).map(r => r.name),
    ['Samsung Galaxy S24 Ultra 256GB', 'Apple iPhone 16e 128GB']
  );
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number) => ({ data: from === 0 ? rows : [], error: null }),
        }),
      }),
    }),
  };
  assert.equal(await auditMasterSpecs(client as never), rows.length);
});
