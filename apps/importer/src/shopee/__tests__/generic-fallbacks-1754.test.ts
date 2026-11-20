/**
 * DOS/Rate#1754: the generic spec fallbacks left after DOS/Rate#1748 were wrong for older
 * iPhones outside the registry (Camera Control, Action button and Dynamic Island on an
 * iPhone 13), laptops and earbuds (rear flash, GPS, NFC, no MacBook headphone jack), and
 * a non-Apple device outside the registry (a loudspeaker and SAR no source checked). The
 * arena spec syncer wrote its own defaults when a page omitted a field. An iPhone outside
 * the registry now gets its generation's Apple Tech Specs text or none, a non-phone gets
 * no phone hardware, and a field no source states stays empty.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { countPopulatedFieldGroups, parseGsmArenaHtmlToSpecs } from '../arena-spec-syncer.js';
import { iphoneGenerationSpecs, ProductNormalizer } from '../product-normalizer.js';
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

const RING = 'Ring/Silent switch, side button, volume buttons';
const ACTION = 'Action button, side button, volume buttons';
const CAMERA_CONTROL = 'Action Button, Camera Control, Volume, Power';
const ISLAND = 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch';
const NO_ISLAND = 'True Tone, Wide color (P3), Haptic Touch';
const MAGSAFE_QI2 = 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2';
const MAGSAFE_QI = 'Sạc không dây MagSafe/Qi';
const QI = 'Sạc không dây Qi';
const UWB = 'Ultra Wideband (UWB)';
const UWB_SOS = 'Ultra Wideband (UWB), SOS vệ tinh';

test('an iPhone outside the registry gets its generation’s Apple Tech Specs text', () => {
  // [title, keys, display features, charging, connectivity other]
  const cases: Array<[string, string, string, string, string]> = [
    ['Apple iPhone 11 64GB', RING, NO_ISLAND, QI, UWB],
    ['iPhone 11Pro 64GB', RING, NO_ISLAND, QI, UWB],
    ['iPhone 12 mini 64GB', RING, NO_ISLAND, MAGSAFE_QI, UWB],
    ['iPhone 12mini 64GB', RING, NO_ISLAND, MAGSAFE_QI, UWB],
    ['iPhone 12 Pro 128GB', RING, NO_ISLAND, MAGSAFE_QI, UWB],
    ['Apple iPhone 13 128GB', RING, NO_ISLAND, MAGSAFE_QI2, UWB],
    ['iPhone 13 mini 128GB', RING, NO_ISLAND, MAGSAFE_QI, UWB],
    ['iPhone 13 Pro Max 256GB', RING, NO_ISLAND, MAGSAFE_QI, UWB],
    ['Apple iPhone 14 128GB', RING, NO_ISLAND, MAGSAFE_QI, UWB_SOS],
    ['iPhone 14 Plus 128GB', RING, NO_ISLAND, MAGSAFE_QI, UWB_SOS],
    ['iphone 14 pro 128GB', RING, ISLAND, MAGSAFE_QI, UWB_SOS],
    ['APPLE IPHONE 14 PRO MAX 256GB', RING, ISLAND, MAGSAFE_QI, UWB_SOS],
    ['iPhone 15 Plus 128GB', RING, ISLAND, MAGSAFE_QI2, UWB_SOS],
    ['Apple iPhone 15 Pro 128GB', ACTION, ISLAND, MAGSAFE_QI2, UWB_SOS],
    ['iPhone 17 256GB', CAMERA_CONTROL, ISLAND, MAGSAFE_QI2, UWB_SOS],
    ['iPhone 17 Pro Max 256GB', CAMERA_CONTROL, ISLAND, MAGSAFE_QI2, UWB_SOS],
    ['iPhone Air 256GB', CAMERA_CONTROL, ISLAND, MAGSAFE_QI2, UWB_SOS],
    ['iPhone 17 Air 256GB', CAMERA_CONTROL, ISLAND, MAGSAFE_QI2, UWB_SOS],
  ];
  for (const [title, keys, features, charging, other] of cases) {
    const n = normalize(title);
    assert.equal(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.equal(out.design?.keys, keys, title);
    assert.equal(out.display?.features, features, title);
    assert.equal(out.battery?.charging, charging, title);
    assert.equal(out.connectivity?.other, other, title);
    // No checked page states "Dual-LED", the generic GNSS list or a jack value: none.
    assert.equal(out.camera?.flash, undefined, title);
    assert.equal(out.connectivity?.location, undefined, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, undefined, title);
    assert.equal(out.connectivity?.nfc, true, title);
    // The battery, camera and connectivity groups stay non-empty for the catalog audit;
    // no source fills multimedia, which stays empty (DOS/Rate#1761).
    assert.equal(out.multimedia?.audio_features, undefined, title);
    for (const name of ['battery', 'camera', 'connectivity'] as const) {
      assert.equal(countPopulatedFieldGroups({ [name]: out[name] }), 1, `${title} ${name}`);
    }
  }
});

test('an iPhone no checked page describes gets no iPhone-only text', () => {
  // The SE has a Home button, no UWB and no Dynamic Island; "iPhone XR" keys as an
  // unnumbered "iPhone"; no page of a generation after the 17 was checked.
  for (const title of ['iPhone SE 2022 64GB', 'iPhone XR 64GB', 'iPhone 18 256GB']) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, undefined, title);
    assert.equal(out.display?.features, undefined, title);
    assert.equal(out.battery?.charging, undefined, title);
    assert.equal(out.connectivity?.other, undefined, title);
  }
  assert.deepEqual(iphoneGenerationSpecs('iPhone 16e'), {});
  assert.deepEqual(iphoneGenerationSpecs('iPhone 10'), {});
});

test('registry iPhones keep their iPhone text, without GNSS or jack no source states', () => {
  for (const [title, keys] of [
    ['Apple iPhone 16 Pro Max 256GB', CAMERA_CONTROL],
    ['Apple iPhone 16 128GB', CAMERA_CONTROL],
    ['Apple iPhone 18 Pro 256GB', CAMERA_CONTROL],
    ['Apple iPhone 15 128GB', RING],
    ['Apple iPhone 15 Pro Max 256GB', ACTION],
  ] as const) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, keys, title);
    assert.equal(out.display?.features, ISLAND, title);
    assert.equal(out.battery?.charging, MAGSAFE_QI2, title);
    assert.equal(out.connectivity?.other, UWB_SOS, title);
    // Apple's pages list NavIC or dual-frequency GPS by model: an entry gets the list its
    // sourced seed states (the 18 Pro) or none (DOS/Rate#1761).
    const sourced = title.includes('iPhone 18 Pro');
    assert.equal(
      out.connectivity?.location,
      sourced ? 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC' : undefined,
      title
    );
    assert.equal(out.connectivity?.nfc, true, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, sourced ? false : undefined, title);
  }
});

test('laptops, tablets and earbuds get no rear flash, GPS or NFC no source states', () => {
  for (const title of [
    'Apple MacBook Air M3 13 inch 256GB',
    'Laptop Dell XPS 13 512GB',
    'Sony WF-1000XM5',
    'Tai nghe JBL Tune 230NC',
    'Tai nghe AirPods Pro 2',
    'iPad Air M2 11 inch 128GB',
    'Samsung Galaxy Tab A9 64GB',
  ]) {
    const n = normalize(title);
    assert.ok(['laptops', 'earbuds', 'tablets'].includes(n.category_slug), title);
    const out = n.specifications;
    assert.equal(out.connectivity?.location, undefined, title);
    assert.equal(out.connectivity?.nfc, undefined, title);
  }
  for (const title of [
    'Apple MacBook Air M3 13 inch 256GB',
    'Laptop Dell XPS 13 512GB',
    'Sony WF-1000XM5',
    'Tai nghe JBL Tune 230NC',
    'Apple Watch Ultra 2 49mm',
    'iPad Air M2 11 inch 128GB',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.camera?.flash, undefined, title);
    // Tablets record video; a laptop, watch or earbuds has no rear video.
    if (!title.startsWith('iPad')) assert.equal(out.camera?.video_recording, undefined, title);
    assert.equal(countPopulatedFieldGroups({ camera: out.camera }), 1, title);
  }
  // A non-Apple phone keeps its flash; a tablet gets none (DOS/Rate#1761); a watch keeps
  // GPS and NFC.
  assert.equal(normalize('Samsung Galaxy Tab A9 64GB').specifications.camera?.flash, undefined);
  assert.equal(
    normalize('Xiaomi Redmi Note 99 Pro 256GB').specifications.camera?.flash,
    'LED flash, auto-HDR, panorama'
  );
  const watch = normalize('Apple Watch Ultra 2 49mm').specifications;
  assert.equal(watch.connectivity?.location, 'GPS, GLONASS, Galileo, QZSS, BeiDou');
  assert.equal(watch.connectivity?.nfc, true);
});

test('MacBooks get the headphone jack Apple lists; a device outside the registry gets none', () => {
  for (const title of [
    'Apple MacBook Air M3 13 inch 256GB',
    'MacBook Air M4 13 inch 256GB',
    'Apple MacBook Pro 14 inch M4 Pro 512GB',
  ]) {
    assert.equal(normalize(title).specifications.multimedia?.headphone_jack_35mm, true, title);
  }
  for (const title of [
    'Laptop Dell XPS 13 512GB',
    'Laptop Lenovo ThinkPad X1 Carbon Gen 12 512GB',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Tai nghe JBL Tune 230NC',
    'Samsung Galaxy Tab A9 64GB',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.multimedia?.headphone_jack_35mm, undefined, title);
  }
  // A registry phone or earbuds entry without a sourced jack gets none (DOS/Rate#1761).
  assert.equal(
    normalize('Sony WF-1000XM5').specifications.multimedia?.headphone_jack_35mm,
    undefined
  );
});

test('a non-Apple device outside the registry gets no unsourced loudspeaker or SAR', () => {
  for (const title of [
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Laptop Dell XPS 13 512GB',
    'Tai nghe JBL Tune 230NC',
    'Samsung Galaxy Tab A9 64GB',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.multimedia?.loudspeaker, undefined, title);
    assert.equal(out.regulatory?.sar_head, undefined, title);
    assert.equal(out.regulatory?.sar_body, undefined, title);
  }
});

test('the arena syncer leaves a field the page omits empty', () => {
  const page = `
    <h1 data-spec="modelname">Xiaomi 18 Pro Max</h1>
    <td data-spec="wlan">Wi-Fi 7</td>
    <td data-spec="bluetooth">6.0, A2DP, LE</td>`;
  const bare = parseGsmArenaHtmlToSpecs(page).specifications;
  assert.equal(bare.camera?.flash, undefined);
  assert.equal(bare.connectivity?.nfc, undefined);
  assert.equal(bare.multimedia?.loudspeaker, undefined);
  assert.equal(bare.multimedia?.headphone_jack_35mm, undefined);
  assert.equal(bare.multimedia?.audio_features, undefined);
  assert.equal(bare.regulatory?.certifications, undefined);
  assert.equal(countPopulatedFieldGroups({ multimedia: bare.multimedia }), 0);
  assert.equal(countPopulatedFieldGroups({ regulatory: bare.regulatory }), 0);

  // What the page states is kept.
  const full = parseGsmArenaHtmlToSpecs(
    `${page}
    <td data-spec="cam1features">LED flash, HDR, panorama</td>
    <td data-spec="nfc">No</td>
    <td data-spec="loudspeaker">Yes, with stereo speakers</td>
    <td data-spec="jack">No</td>
    <td data-spec="soundother">24-bit/192kHz Hi-Res audio</td>
    <td data-spec="sar-us">1.10 W/kg (head)</td>`
  ).specifications;
  assert.equal(full.camera?.flash, 'LED flash, HDR, panorama');
  assert.equal(full.connectivity?.nfc, false);
  assert.equal(full.multimedia?.loudspeaker, 'Yes, with stereo speakers');
  assert.equal(full.multimedia?.headphone_jack_35mm, false);
  assert.equal(full.multimedia?.audio_features, '24-bit/192kHz Hi-Res audio');
  assert.equal(full.regulatory?.sar_head, '1.10 W/kg (head)');
});
