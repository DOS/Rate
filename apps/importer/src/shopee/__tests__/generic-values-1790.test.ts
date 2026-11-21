/**
 * DOS/Rate#1790: generic or wrong spec values left after DOS/Rate#1787. Every Android phone
 * got the same keys, glass, pixel density, refresh rate, charging, USB and connectivity
 * text; every device got "no memory card", a Li-Ion battery and no reverse charging; a 5G
 * device got "SA/NSA/Sub6"; every phone and watch got NFC; a laptop, watch or earbuds
 * without 5G got "Wi-Fi / Bluetooth" and "No SIM" (wrong for an LTE watch); registry
 * laptops and tablets had body materials as their water resistance; an iPhone outside the
 * registry got Apple materials and sensor text (wrong for the SE); and a listing outside
 * the registry got a category OS, screen, chip, battery and charger. Each field now holds
 * a sourced registry or seed value, or none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCED_SEEDS_2025 } from '../flagship-seed-sourced-2025.js';
import { SOURCED_SEEDS_2026 } from '../flagship-seed-sourced-2026.js';
import { SOURCED_SEEDS_IPHONE_17E } from '../flagship-seed-sourced-iphone-17e.js';
import { ppiFromResolution, ProductNormalizer } from '../product-normalizer.js';
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

/** The fields of a group that hold a value. */
const defined = (group: object | undefined) =>
  Object.fromEntries(Object.entries(group ?? {}).filter(([, v]) => v !== undefined));

// The generic values this issue removes, compared whole.
const GENERIC = [
  // Android phone text.
  'Volume, Power',
  'Corning Gorilla Glass',
  'Sạc nhanh USB-C PD/PPS',
  'USB Type-C, OTG',
  'Hỗ trợ OTG, Chia sẻ nhanh',
  // Every-device text.
  'Không hỗ trợ thẻ nhớ',
  'Li-Ion, không thể tháo rời',
  'SA/NSA/Sub6',
  'Wi-Fi / Bluetooth',
  'Wi-Fi / Bluetooth (No Cellular)',
  'No SIM',
  // Materials in the water-resistance field.
  'Aluminum unibody',
  'Recycled aluminum enclosure',
  'All-metal unibody, Corning Gorilla Glass 5',
  'Ceraluminum chassis, MIL-STD 810H military-grade standard',
  'Carbon fiber weave top + recycled magnesium chassis, MIL-STD-810H',
  '5.3mm Ultra-thin 100% recycled aluminum enclosure',
  'Unibody aluminum alloy frame, 6.18mm slim profile',
  'Fanless silent 100% recycled aluminum unibody enclosure',
  'Precision-machined aluminum enclosure (Space Black anodized seal)',
  // Category fallbacks ('macOS Sequoia' and 'watchOS 11' are also registry values).
  'Windows 11 Home',
  'iPadOS 18',
  'Android 14',
  'Garmin OS',
  'Wear OS 5',
  'Apple AudioOS',
  'Bluetooth 5.3 Audio DSP',
  'iOS 18',
  'Liquid Retina IPS',
  'IPS / OLED Anti-Glare',
  'Liquid Retina IPS, True Tone',
  'IPS LCD / AMOLED, 120Hz',
  'AMOLED Always-On Touchscreen',
  'Status LED Indicator',
  'Super Retina XDR OLED, HDR10',
  'AMOLED, 120Hz, HDR10+',
  'Apple M-Series',
  'Intel Core / AMD Ryzen',
  'Apple M / A-Series',
  'Snapdragon / Dimensity',
  'Apple S-Series SiP',
  'Wearable Dual-Core SoC',
  'Apple H-Series Audio Chip',
  'Bluetooth 5.3 ANC DSP',
  'Apple A-Series',
  'TWS In-Ear + Charging Case',
  'GSM / HSPA / LTE / 5G',
  'GSM / HSPA / LTE',
  '2024',
];

const assertNoGeneric = (title: string) => {
  const n = normalize(title);
  const values = [...strings(n.specifications), ...strings(n.key_specs)];
  for (const generic of GENERIC) assert.ok(!values.includes(generic), `${title}: ${generic}`);
  // A key-spec screen or battery is no category guess either ('6.6" AMOLED', '5000 mAh').
  for (const value of strings(n.key_specs)) {
    assert.ok(!/^\d+(?:\.\d+)?" (?:AMOLED|IPS|Liquid|Super Retina)$/.test(value), title);
  }
  assert.notEqual(n.specifications.battery?.reverse_charging, false, title);
  return n;
};

const OUTSIDE = [
  'Samsung Galaxy A35 5G 128GB',
  'Xiaomi Redmi Note 99 Pro 256GB',
  '[Chính hãng] Xiaomi Redmi Note 14 Pro 5G 256GB',
  'Apple iPhone 11 64GB',
  'iPhone SE 2022 64GB',
  'Laptop Dell XPS 13 512GB',
  'Samsung Galaxy Tab A9 64GB',
  'iPad Air M2 11 inch 128GB',
  'Đồng hồ thông minh Huawei Watch GT 5 Pro 1,4 inch 32GB',
  'Samsung Galaxy Watch7 44mm',
  'Tai nghe JBL Tune 230NC',
];

test('a non-Apple phone gets no generic keys, glass, density, refresh rate, charging or ports', () => {
  for (const title of [
    'Samsung Galaxy A35 5G 128GB',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Google Pixel 9 Pro XL 256GB',
    'Samsung Galaxy A55 5G 128GB',
  ]) {
    const n = assertNoGeneric(title);
    assert.equal(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.equal(out.design?.keys, undefined, title);
    assert.equal(out.display?.protection, undefined, title);
    assert.equal(out.battery?.charging, undefined, title);
    assert.equal(out.connectivity?.usb, undefined, title);
    assert.equal(out.connectivity?.other, undefined, title);
    if (n.is_benchmark_enriched) {
      // A registry phone keeps the refresh rate its entry states and the density its
      // resolution states.
      assert.equal(out.display?.refresh_rate_hz, 120, title);
      assert.ok(out.display?.resolution?.includes(` ppi`), title);
      assert.equal(out.display?.ppi, ppiFromResolution(out.display?.resolution), title);
    } else {
      assert.equal(out.display?.refresh_rate_hz, undefined, title);
      assert.equal(out.display?.ppi, undefined, title);
    }
  }
  // An iPhone outside the registry gets no 60 Hz guess (the 13 Pro is 120 Hz) and, before
  // the iPhone 12, no Ceramic Shield.
  for (const title of ['Apple iPhone 13 Pro 128GB', 'Apple iPhone 11 64GB']) {
    const out = assertNoGeneric(title).specifications;
    assert.equal(out.display?.refresh_rate_hz, undefined, title);
    assert.equal(out.display?.ppi, undefined, title);
    assert.equal(out.display?.protection, undefined, title);
  }
});

test('no device gets a generic memory card, battery type or reverse charging value', () => {
  for (const title of [
    ...OUTSIDE,
    'Samsung Galaxy S24 Ultra 256GB',
    'Apple iPhone 16 Pro Max 256GB',
    'Samsung Galaxy Tab S10 Ultra 256GB',
    'Apple MacBook Air M3 13 inch 256GB',
    'Apple Watch Ultra 2 49mm',
    'Sony WF-1000XM5',
  ]) {
    const out = assertNoGeneric(title).specifications;
    assert.equal(out.hardware?.storage_expansion, undefined, title);
    assert.equal(out.battery?.type, undefined, title);
    assert.equal(out.battery?.reverse_charging, undefined, title);
  }
});

test('a registry model with a sourced seed gets the seed’s values', () => {
  for (const [title, modelKey] of [
    ['Apple iPhone 18 Pro Max 256GB', 'apple:iphone-18-pro-max:256gb'],
    ['Apple iPhone 18 Pro 256GB', 'apple:iphone-18-pro:256gb'],
    ['Samsung Galaxy S26 Ultra 256GB', 'samsung:galaxy-s26-ultra:256gb'],
  ] as const) {
    const out = assertNoGeneric(title).specifications;
    const s = seed(modelKey);
    assert.ok(s.hardware?.storage_expansion && s.battery?.reverse_charging, modelKey);
    assert.equal(out.hardware?.storage_expansion, s.hardware?.storage_expansion, title);
    assert.equal(out.battery?.type, s.battery?.type, title);
    assert.equal(out.battery?.reverse_charging, s.battery?.reverse_charging, title);
    assert.equal(out.battery?.charging, s.battery?.charging, title);
    assert.equal(out.display?.protection, s.display?.protection, title);
    assert.equal(out.display?.ppi, s.display?.ppi, title);
    assert.equal(out.connectivity?.nfc, s.connectivity?.nfc, title);
    assert.equal(out.connectivity?.other, s.connectivity?.other, title);
    assert.equal(out.cellular?.bands_5g, s.cellular?.bands_5g, title);
    assert.equal(out.cellular?.technology, s.cellular?.technology, title);
    assert.equal(out.design?.keys, s.design?.keys, title);
  }
  for (const title of ['Apple iPhone 18 Pro Max 256GB', 'Apple iPhone 18 Pro 256GB']) {
    const out = normalize(title).specifications;
    const s = seed(
      title.includes('Max') ? 'apple:iphone-18-pro-max:256gb' : 'apple:iphone-18-pro:256gb'
    );
    assert.equal(out.design?.materials, s.design?.materials, title);
    assert.equal(out.design?.biometrics, s.design?.biometrics, title);
    assert.equal(out.connectivity?.sensors, s.connectivity?.sensors, title);
    assert.equal(out.display?.features, s.display?.features, title);
  }
  for (const [title, modelKey] of [
    ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
    ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
  ] as const) {
    const out = assertNoGeneric(title).specifications;
    const s = seed(modelKey);
    assert.equal(out.battery?.type, s.battery?.type, title);
    assert.equal(out.connectivity?.nfc, true, title);
    assert.equal(out.cellular?.bands_5g, s.cellular?.bands_5g, title);
    assert.equal(out.display?.ppi, s.display?.ppi, title);
  }
});

test('a 5G device gets only the 5G bands its registry entry states', () => {
  for (const title of [
    'Samsung Galaxy A35 5G 128GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Samsung Galaxy Tab S10 Ultra 256GB',
    'Apple iPhone 16 Pro Max 256GB',
    'Apple Watch Ultra 3 49mm',
    // Its Wi-Fi + Cellular models have 5G (DOS/Rate#1793).
    'Apple iPad Pro M4 11 inch 256GB',
  ]) {
    const out = assertNoGeneric(title).specifications;
    assert.equal(out.cellular?.has_5g, true, title);
    assert.equal(out.cellular?.bands_5g, undefined, title);
    // No generic network text either (a watch's LTE, a CDMA phone).
    assert.equal(out.cellular?.technology, undefined, title);
  }
});

test('only a phone a source describes gets NFC', () => {
  for (const title of [
    'Samsung Galaxy A35 5G 128GB',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'iPhone SE 2022 64GB',
    'Samsung Galaxy Watch7 44mm',
    'Samsung Galaxy Watch Ultra 47mm',
    'Đồng hồ Garmin Forerunner 265',
    'Apple Watch Ultra 2 49mm',
    'Đồng hồ thông minh Huawei Watch GT 5 Pro 1,4 inch 32GB',
  ]) {
    assert.equal(assertNoGeneric(title).specifications.connectivity?.nfc, undefined, title);
  }
  // An iPhone whose generation's checked Apple page lists NFC, or a registry iPhone.
  for (const title of ['Apple iPhone 13 128GB', 'Apple iPhone 11 64GB', 'Apple iPhone 16 128GB']) {
    assert.equal(normalize(title).specifications.connectivity?.nfc, true, title);
  }
});

test('a device without 5G gets no Wi-Fi, SIM, VoLTE or Wi-Fi calling guess', () => {
  for (const title of [
    'Laptop Dell XPS 13 512GB',
    'Apple MacBook Air M3 13 inch 256GB',
    'Tai nghe JBL Tune 230NC',
    'Sony WF-1000XM5',
    'Samsung Galaxy Watch7 44mm',
    'Apple Watch Ultra 2 49mm',
    'Đồng hồ Garmin Forerunner 265',
  ]) {
    const out = assertNoGeneric(title).specifications;
    assert.deepEqual(defined(out.cellular), { has_5g: false }, title);
  }
});

test('registry laptops and tablets have no materials text as water resistance', () => {
  for (const title of [
    'Apple iPad Pro M4 11 inch 256GB',
    'Apple MacBook Air M3 13 inch 256GB',
    'Xiaomi Pad 6S Pro 256GB',
    'Laptop Asus Zenbook S 14 OLED 1TB',
    'Laptop Lenovo ThinkPad X1 Carbon Gen 12 512GB',
    'Apple iPad Pro M5 11 inch 256GB',
    'Xiaomi Pad 7 Pro 256GB',
    'MacBook Air M4 13 inch 256GB',
    'Apple MacBook Pro 14 inch M4 Pro 512GB',
  ]) {
    const n = assertNoGeneric(title);
    assert.equal(n.is_benchmark_enriched, true, title);
    assert.equal(n.specifications.design?.resistance, undefined, title);
  }
  // A real rating stays, without the materials or ear tips stated after it.
  for (const [title, rating] of [
    ['Samsung Galaxy Tab S10 Ultra 256GB', 'IP68 dust/water resistant (1.5m for 30 min)'],
    ['Samsung Galaxy Watch Ultra 47mm', 'IP68 + 10ATM water resistant (100m, MIL-STD-810H)'],
    ['Đồng hồ Garmin Forerunner 265', '5 ATM water resistant (50m swim-ready)'],
    ['Apple Watch Ultra 3 49mm', 'IP6X + WR100 (100m water resistant, MIL-STD 810H)'],
    ['Sony WF-1000XM6', 'IPX4 splash and sweat resistant'],
  ] as const) {
    assert.equal(assertNoGeneric(title).specifications.design?.resistance, rating, title);
  }
});

test('an iPhone outside the registry gets no Apple materials or sensor text', () => {
  for (const title of ['iPhone SE 2022 64GB', 'Apple iPhone 11 64GB', 'Apple iPhone 13 128GB']) {
    const out = assertNoGeneric(title).specifications;
    assert.equal(out.design?.materials, undefined, title);
    assert.equal(out.connectivity?.sensors, undefined, title);
  }
  assert.equal(normalize('iPhone SE 2022 64GB').specifications.design?.biometrics, 'Touch ID');
});

test('a listing outside the registry gets no category OS, screen, chip, battery or charger', () => {
  for (const title of OUTSIDE) {
    const n = assertNoGeneric(title);
    assert.equal(n.is_benchmark_enriched, false, title);
    const out = n.specifications;
    assert.equal(out.hardware?.os, undefined, title);
    assert.equal(out.display?.type, undefined, title);
    assert.equal(out.battery?.fast_charging_w, undefined, title);
    assert.equal(out.availability?.announced, undefined, title);
    assert.equal(n.key_specs.chip, undefined, title);
    assert.equal(n.key_specs.battery, undefined, title);
  }
  // A screen size the title states stays, without a guessed panel type.
  assert.equal(
    normalize('Laptop Dell XPS 14 14.5 inch OLED 16GB RAM 1TB SSD').key_specs.screen,
    '14.5"'
  );
  assert.equal(normalize('Samsung Galaxy A35 5G 128GB').key_specs.screen, undefined);
  // A registry model keeps its sourced values.
  const s24 = normalize('Samsung Galaxy S24 Ultra 256GB');
  assert.equal(s24.specifications.hardware?.os, 'Android 14, One UI 6.1');
  assert.equal(s24.key_specs.chip, s24.specifications.hardware?.chipset?.split('(')[0]?.trim());
  assert.match(s24.key_specs.battery ?? '', /^5000 mAh/);
  assert.match(s24.key_specs.screen ?? '', /^6\.8" /);
});

test('ppiFromResolution reads the stated density without a regex', () => {
  assert.equal(ppiFromResolution('1320 x 2868 pixels (~460 ppi)'), 460);
  assert.equal(ppiFromResolution('1170 x 2532 pixels (460 ppi)'), 460);
  assert.equal(ppiFromResolution('1440 x 3200 pixels, 20:9 ratio (~510 ppi density)'), 510);
  assert.equal(ppiFromResolution('2880 x 1800 pixels, 16:10 (3K Lumina OLED)'), undefined);
  assert.equal(ppiFromResolution('Custom high-excursion Apple driver'), undefined);
  assert.equal(ppiFromResolution(' ppi'), undefined);
  assert.equal(ppiFromResolution('(~ ppi)'), undefined);
  assert.equal(ppiFromResolution('(~0 ppi)'), undefined);
  assert.equal(ppiFromResolution(undefined), undefined);
  assert.equal(ppiFromResolution(`${'9'.repeat(50_000)} ppi`), undefined);
});
