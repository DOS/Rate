/**
 * DOS/Rate#1761: generic spec values left after DOS/Rate#1754 that no source checked. A
 * registry iPhone got a "True Tone Dual-LED" flash, a GNSS list and "no jack"; every
 * device got the same audio, certification, Bluetooth and Wi-Fi text; watches, tablets,
 * laptops and earbuds got Android phone charging, OTG and USB text; a non-Apple tablet got
 * a flash; a title that names no product (a speaker, an air purifier) got phone hardware;
 * and the arena syncer wrote biometrics, 5G, SIM and card-slot text a page omits. Each
 * field now holds a sourced registry or seed value, or none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { biometricsFromSensors, parseGsmArenaHtmlToSpecs } from '../arena-spec-syncer.js';
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

// The generic values this issue removes, wherever they would appear.
const GENERIC = [
  'True Tone Dual-LED',
  'GPS, GLONASS, Galileo, QZSS, BeiDou',
  'Dolby Atmos, Hi-Res Audio',
  'CE, FCC, RoHS',
  'CE, FCC ID, Apple Eco Standards',
  '5.3, A2DP, LE',
  'Wi-Fi 6E/7, dual-band, Wi-Fi Direct',
];

test('a registry iPhone without a sourced field gets no flash, GNSS list or jack value', () => {
  for (const title of [
    'Apple iPhone 15 128GB',
    'Apple iPhone 15 Pro Max 256GB',
    'Apple iPhone 16 128GB',
    'Apple iPhone 16 Plus 128GB',
    'Apple iPhone 16 Pro 128GB',
    'Apple iPhone 16 Pro Max 256GB',
  ]) {
    const n = normalize(title);
    assert.equal(n.is_benchmark_enriched, true, title);
    const out = n.specifications;
    assert.equal(out.camera?.flash, undefined, title);
    assert.equal(out.connectivity?.location, undefined, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, undefined, title);
    assert.equal(out.connectivity?.usb, undefined, title);
    // The iPhone text Apple's pages state stays.
    assert.equal(out.connectivity?.nfc, true, title);
    assert.equal(out.connectivity?.other, 'Ultra Wideband (UWB), SOS vệ tinh', title);
  }
});

test('a registry model with a sourced seed gets the seed’s values', () => {
  for (const [title, modelKey] of [
    ['Apple iPhone 18 Pro Max 256GB', 'apple:iphone-18-pro-max:256gb'],
    ['Apple iPhone 18 Pro 256GB', 'apple:iphone-18-pro:256gb'],
    ['Samsung Galaxy S26 Ultra 256GB', 'samsung:galaxy-s26-ultra:256gb'],
  ] as const) {
    const out = normalize(title).specifications;
    const s = seed(modelKey);
    assert.ok(s.camera?.flash && s.connectivity?.location, modelKey);
    assert.equal(out.camera?.flash, s.camera?.flash, title);
    assert.equal(out.connectivity?.location, s.connectivity?.location, title);
    assert.equal(out.connectivity?.bluetooth, s.connectivity?.bluetooth, title);
    assert.equal(out.connectivity?.wlan, s.connectivity?.wlan, title);
    assert.equal(out.connectivity?.usb, s.connectivity?.usb, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, s.multimedia?.headphone_jack_35mm, title);
    assert.equal(out.multimedia?.audio_features, s.multimedia?.audio_features, title);
    // The S26 Ultra seed retracts its certifications: none.
    assert.equal(out.regulatory?.certifications, s.regulatory?.certifications, title);
  }
  assert.equal(
    normalize('Samsung Galaxy S26 Ultra 256GB').specifications.regulatory?.certifications,
    undefined
  );
  for (const [title, modelKey] of [
    ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
    ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
  ] as const) {
    const out = normalize(title).specifications;
    assert.equal(out.connectivity?.location, seed(modelKey).connectivity?.location, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, undefined, title);
  }
});

test('no device gets the generic audio, certification, Bluetooth or Wi-Fi text', () => {
  for (const title of [
    'Apple iPhone 11 64GB',
    'Apple iPhone 16 Pro Max 256GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Samsung Galaxy Tab A9 64GB',
    'Samsung Galaxy Tab S10 Ultra 256GB',
    'iPad Air M2 11 inch 128GB',
    'Laptop Dell XPS 13 512GB',
    'Apple MacBook Air M3 13 inch 256GB',
    'Samsung Galaxy Watch7 44mm',
    'Apple Watch Ultra 2 49mm',
    'Tai nghe JBL Tune 230NC',
    'Sony WF-1000XM5',
  ]) {
    const out = normalize(title).specifications;
    const values = [
      out.camera?.flash,
      out.connectivity?.location,
      out.connectivity?.bluetooth,
      out.connectivity?.wlan,
      out.multimedia?.audio_features,
      out.regulatory?.certifications,
    ];
    for (const generic of GENERIC.slice(2)) {
      assert.ok(!values.includes(generic), `${title}: ${generic}`);
    }
    if (title.includes('iPhone')) {
      assert.ok(!values.includes('True Tone Dual-LED'), title);
      assert.ok(!values.includes('GPS, GLONASS, Galileo, QZSS, BeiDou'), title);
    }
  }
});

test('a watch, tablet, laptop or earbuds gets no Android phone charging, OTG or USB text', () => {
  for (const title of [
    'Samsung Galaxy Watch7 44mm',
    'Samsung Galaxy Watch Ultra 47mm',
    'Samsung Galaxy Tab A9 64GB',
    'Samsung Galaxy Tab S10 Ultra 256GB',
    'Xiaomi Pad 7 128GB',
    'Laptop Dell XPS 13 512GB',
    'Tai nghe JBL Tune 230NC',
    'Samsung Galaxy Buds3 Pro',
    'Apple Watch Ultra 2 49mm',
    'Apple MacBook Air M3 13 inch 256GB',
  ]) {
    const n = normalize(title);
    assert.notEqual(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.notEqual(out.battery?.charging, 'Sạc nhanh USB-C PD/PPS', title);
    assert.notEqual(out.connectivity?.other, 'Hỗ trợ OTG, Chia sẻ nhanh', title);
    assert.notEqual(out.connectivity?.usb, 'USB Type-C, OTG', title);
  }
  // A non-Apple phone keeps them.
  const phone = normalize('Xiaomi Redmi Note 99 Pro 256GB').specifications;
  assert.equal(phone.battery?.charging, 'Sạc nhanh USB-C PD/PPS');
  assert.equal(phone.connectivity?.other, 'Hỗ trợ OTG, Chia sẻ nhanh');
  assert.equal(phone.connectivity?.usb, 'USB Type-C, OTG');
});

test('a non-Apple tablet outside the registry gets no flash', () => {
  for (const title of [
    'Samsung Galaxy Tab A9 64GB',
    'Xiaomi Pad 7 128GB',
    'Lenovo Tab M11 128GB',
  ]) {
    const n = normalize(title);
    assert.equal(n.category_slug, 'tablets', title);
    assert.equal(n.specifications.camera?.flash, undefined, title);
  }
});

test('a title that names no phone gets no phone hardware', () => {
  for (const title of [
    'Loa JBL Charge 5',
    'Loa Bluetooth Xiaomi Mi Portable Speaker',
    'Máy lọc không khí Xiaomi Smart Air Purifier 4',
    'Xiaomi Smart Air Purifier 4 Pro',
    'Robot hút bụi Xiaomi Vacuum S20',
    'Xiaomi Mi Band 8',
    'Apple HomePod mini',
  ]) {
    const n = normalize(title);
    // 'smartphones' is the category of a title that names no category.
    assert.equal(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.equal(out.camera?.flash, undefined, title);
    assert.equal(out.camera?.video_recording, undefined, title);
    assert.equal(out.connectivity?.location, undefined, title);
    assert.equal(out.connectivity?.nfc, undefined, title);
    assert.equal(out.connectivity?.sensors, undefined, title);
    assert.equal(out.connectivity?.usb, undefined, title);
    assert.equal(out.connectivity?.other, undefined, title);
    assert.equal(out.battery?.charging, undefined, title);
    assert.equal(out.design?.biometrics, undefined, title);
    assert.equal(out.design?.keys, undefined, title);
    assert.equal(out.display?.features, undefined, title);
  }
  // A phone title keeps its phone text, also when it names its screen or speakers.
  for (const title of [
    'Samsung Galaxy A15 màn hình 6.5 inch loa kép 128GB',
    'Điện thoại Vsmart Joy 4 64GB',
    'Nokia 105 4G',
    'Huawei Nova 12 256GB',
    'Galaxy Z Fold7 512GB',
    '[Chính hãng] Xiaomi Redmi Note 14 Pro 256GB',
    // A gift that names another product, or a leading "Máy", leaves a phone a phone.
    'Samsung Galaxy A15 tặng sạc dự phòng',
    '[Tặng sạc dự phòng] Samsung Galaxy A35 5G 128GB',
    'Xiaomi Redmi Note 13 kèm Power Bank',
    'Máy Xiaomi Redmi 12C 4/128GB cũ',
    'Máy Samsung Galaxy A54 5G 8/128GB',
    // Phone makers outside PHONE_BRAND_RE.
    'Asus Zenfone 11 Ultra',
    'TCL 50 SE',
    'Masstel Fami 12 4G',
    'Cat S75',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.camera?.flash, 'LED flash, auto-HDR, panorama', title);
    assert.equal(out.connectivity?.nfc, true, title);
    assert.equal(out.battery?.charging, 'Sạc nhanh USB-C PD/PPS', title);
  }
  // An iPhone outside the registry is a phone by its model.
  assert.equal(normalize('Apple iPhone 13 128GB').specifications.connectivity?.nfc, true);
});

test('the arena syncer writes no biometrics, 5G, SIM or card-slot text the page omits', () => {
  const page = `
    <h1 data-spec="modelname">Xiaomi 18 Pro Max</h1>
    <td data-spec="nettech">GSM / HSPA / LTE / 5G</td>
    <td data-spec="sensors">Accelerometer, gyro, proximity, compass</td>`;
  const bare = parseGsmArenaHtmlToSpecs(page).specifications;
  assert.equal(bare.cellular?.has_5g, true);
  assert.equal(bare.cellular?.technology, 'GSM / HSPA / LTE / 5G');
  assert.equal(bare.cellular?.bands_5g, undefined);
  assert.equal(bare.cellular?.sim_type, undefined);
  assert.equal(bare.cellular?.data_speed, undefined);
  assert.equal(bare.design?.biometrics, undefined);
  assert.equal(bare.hardware?.storage_expansion, undefined);

  // A page without 5G: no "No cellular connectivity" or "Wi-Fi Only" either.
  const lte = parseGsmArenaHtmlToSpecs(
    `<h1 data-spec="modelname">Redmi Pad 2</h1><td data-spec="nettech">No cellular connectivity</td>`
  ).specifications;
  assert.equal(lte.cellular?.has_5g, false);
  assert.equal(lte.cellular?.technology, 'No cellular connectivity');
  assert.equal(lte.cellular?.data_speed, undefined);
  assert.equal(lte.cellular?.sim_type, undefined);

  // What the page states is kept, as the page words it.
  const full = parseGsmArenaHtmlToSpecs(
    `${page}
    <td data-spec="net5g">1, 3, 5, 7, 8, 28, 41, 77, 78 SA/NSA</td>
    <td data-spec="sim">Nano-SIM + Nano-SIM</td>
    <td data-spec="speed">HSPA, LTE, 5G</td>
    <td data-spec="memoryslot">microSDXC (dedicated slot)</td>
    <td data-spec="memoryother">UFS 4.1</td>`.replace(
      'Accelerometer, gyro, proximity, compass',
      'Fingerprint (under display, optical), accelerometer, gyro, proximity, compass'
    )
  ).specifications;
  assert.equal(full.cellular?.bands_5g, '1, 3, 5, 7, 8, 28, 41, 77, 78 SA/NSA');
  assert.equal(full.cellular?.sim_type, 'Nano-SIM + Nano-SIM');
  assert.equal(full.cellular?.data_speed, 'HSPA, LTE, 5G');
  assert.equal(full.hardware?.storage_expansion, 'microSDXC (dedicated slot) (UFS 4.1)');
  // An optical fingerprint is not "ultrasonic", and no face unlock is stated.
  assert.equal(full.design?.biometrics, 'Fingerprint (under display, optical)');

  assert.equal(biometricsFromSensors('Face ID, accelerometer, gyro, barometer'), 'Face ID');
  assert.equal(
    biometricsFromSensors('Fingerprint (side-mounted), accelerometer, gyro, compass'),
    'Fingerprint (side-mounted)'
  );
  assert.equal(biometricsFromSensors('Accelerometer, gyro'), undefined);
  assert.equal(biometricsFromSensors(undefined), undefined);
});
