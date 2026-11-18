/**
 * DOS/Rate#1743: the generic Apple spec fallbacks ("Camera Control", "Dynamic Island", UWB,
 * MagSafe, made-up SAR and loudspeaker) contradicted the sourced iPhone 16e and 17e seeds.
 * Their registry entries now carry the seeds' values, and a field no source states gets no
 * value. Every other model keeps its previous output.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAGSHIP_DEVICES_TO_SEED } from '../flagship-seed-data.js';
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
  const found = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === modelKey);
  assert.ok(found, modelKey);
  return found.specifications;
};

// Each title, its seed, and an ':unknown' title (the Tier 3 case the issue describes).
const E_MODELS = [
  ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
  ['Apple iPhone 16e', 'apple:iphone-16e:128gb'],
  ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
  ['Apple iPhone 17e 512GB', 'apple:iphone-17e:512gb'],
  ['Apple iPhone 17e', 'apple:iphone-17e:256gb'],
] as const;

test('the 16e and 17e get the keys, display, charging, connectivity, cellular and regulatory values their seeds state', () => {
  for (const [title, seedKey] of E_MODELS) {
    const out = normalize(title).specifications;
    const s = seed(seedKey);
    assert.equal(out.design?.keys, s.design?.keys, title);
    assert.equal(out.display?.features, s.display?.features, title);
    assert.equal(out.battery?.charging, s.battery?.charging, title);
    assert.equal(out.connectivity?.bluetooth, s.connectivity?.bluetooth, title);
    assert.equal(out.connectivity?.sensors, s.connectivity?.sensors, title);
    assert.equal(out.connectivity?.other, s.connectivity?.other, title);
    assert.equal(out.multimedia?.audio_features, s.multimedia?.audio_features, title);
    assert.equal(out.display?.protection, s.display?.protection, title);
    assert.equal(out.connectivity?.usb, s.connectivity?.usb, title);
    assert.equal(out.cellular?.bands_5g, s.cellular?.bands_5g, title);
    assert.equal(out.cellular?.bands_4g, s.cellular?.bands_4g, title);
    assert.equal(out.cellular?.technology, s.cellular?.technology, title);
    assert.equal(out.cellular?.sim_type, s.cellular?.sim_type, title);
    assert.equal(out.regulatory?.certifications, s.regulatory?.certifications, title);
    assert.doesNotMatch(out.cellular?.sim_type ?? '', /2 Nano-SIM/, title);
    assert.doesNotMatch(out.connectivity?.usb ?? '', /OTG/, title);
  }
});

test('the 16e and 17e get none of the generic Apple claims their sources contradict', () => {
  for (const [title] of E_MODELS) {
    const out = normalize(title).specifications;
    assert.doesNotMatch(out.design?.keys ?? '', /Camera Control/i, title);
    assert.doesNotMatch(out.display?.features ?? '', /^Dynamic Island/i, title);
    assert.doesNotMatch(out.connectivity?.other ?? '', /Ultra Wideband \(UWB\)|SOS vệ tinh/, title);
  }
  const e16 = normalize('Apple iPhone 16e 128GB').specifications;
  assert.match(e16.display?.features ?? '', /Notch \(no Dynamic Island\)/);
  assert.match(e16.battery?.charging ?? '', /no MagSafe/);
  assert.doesNotMatch(e16.battery?.charging ?? '', /MagSafe\/Qi2|MagSafe and Qi2/);
  // The 17e has MagSafe/Qi2 (Apple Vietnam lists it), and no satellite features in Vietnam.
  const e17 = normalize('Apple iPhone 17e 256GB').specifications;
  assert.match(e17.battery?.charging ?? '', /MagSafe and Qi2/);
  assert.doesNotMatch(e17.connectivity?.other ?? '', /satellite|vệ tinh/i);
});

test('fields no source states for the 16e and 17e get no generic value', () => {
  for (const [title, seedKey] of E_MODELS) {
    const out = normalize(title).specifications;
    const s = seed(seedKey);
    // The seeds leave these out: no source checked states them.
    assert.equal(s.multimedia?.loudspeaker, undefined, seedKey);
    assert.equal(s.multimedia?.headphone_jack_35mm, undefined, seedKey);
    assert.equal(s.regulatory?.sar_head, undefined, seedKey);
    assert.equal(s.regulatory?.sar_body, undefined, seedKey);
    assert.equal(out.multimedia?.loudspeaker, undefined, title);
    assert.equal(out.multimedia?.headphone_jack_35mm, undefined, title);
    assert.equal(out.regulatory?.sar_head, undefined, title);
    assert.equal(out.regulatory?.sar_body, undefined, title);
    // The groups the catalog audit requires stay non-empty.
    assert.ok(
      Object.values(out.multimedia ?? {}).some(v => v !== undefined),
      title
    );
    assert.ok(
      Object.values(out.regulatory ?? {}).some(v => v !== undefined),
      title
    );
  }
});

test('models without the new registry fields keep their previous output', () => {
  for (const title of [
    'Apple iPhone 16 Pro Max 256GB',
    'Apple iPhone 16 128GB',
    'Apple iPhone 11 64GB',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, 'Action Button, Camera Control, Volume, Power', title);
    assert.equal(
      out.display?.features,
      'Dynamic Island, True Tone, Wide color (P3), Haptic Touch',
      title
    );
    assert.equal(out.battery?.charging, 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2', title);
    assert.equal(out.connectivity?.bluetooth, '5.3, A2DP, LE', title);
    assert.equal(
      out.connectivity?.sensors,
      'Face ID, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn, khí áp kế',
      title
    );
    assert.equal(out.connectivity?.other, 'Ultra Wideband (UWB), SOS vệ tinh', title);
    assert.equal(out.multimedia?.loudspeaker, 'Loa kép Stereo đa chiều', title);
    assert.equal(out.multimedia?.headphone_jack_35mm, false, title);
    assert.equal(out.multimedia?.audio_features, 'Dolby Atmos, Hi-Res Audio', title);
    assert.equal(out.regulatory?.sar_head, '1.10 W/kg', title);
    assert.equal(out.regulatory?.sar_body, '1.15 W/kg', title);
    assert.equal(out.display?.protection, 'Ceramic Shield', title);
    assert.equal(out.connectivity?.usb, 'USB Type-C, OTG', title);
    assert.equal(out.regulatory?.certifications, 'CE, FCC ID, Apple Eco Standards', title);
    // A phone whose 5G is unknown (iPhone 11, outside the registry) gets no cellular group.
    if (title !== 'Apple iPhone 11 64GB') {
      assert.equal(out.cellular?.sim_type, '2 Nano-SIM + eSIM', title);
      assert.equal(out.cellular?.bands_4g, 'LTE Cat 20', title);
    } else {
      assert.deepEqual(out.cellular, {}, title);
    }
  }

  for (const title of ['Samsung Galaxy S24 Ultra 256GB', 'Xiaomi Redmi Note 99 Pro 256GB']) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, 'Volume, Power', title);
    assert.equal(out.display?.features, 'Always-on display, HDR10+, Eye Comfort Shield', title);
    assert.equal(out.battery?.charging, 'Sạc nhanh USB-C PD/PPS', title);
    assert.equal(out.connectivity?.other, 'Hỗ trợ OTG, Chia sẻ nhanh', title);
    assert.equal(out.multimedia?.loudspeaker, 'Loa kép Stereo đa chiều', title);
    assert.equal(out.regulatory?.sar_head, '1.10 W/kg', title);
    assert.equal(out.display?.protection, 'Corning Gorilla Glass', title);
    assert.equal(out.regulatory?.certifications, 'CE, FCC, RoHS', title);
    // The Xiaomi is outside the registry and its 5G is unknown: no cellular group.
    assert.equal(
      out.cellular?.sim_type,
      title.startsWith('Samsung') ? '2 Nano-SIM + eSIM' : undefined,
      title
    );
  }
});
