/**
 * DOS/Rate#1748: the generic Apple spec fallbacks were wrong for models other than the
 * 16e/17e (DOS/Rate#1743): Camera Control on the iPhone 15 and 15 Pro Max, MagSafe/Qi2,
 * UWB and satellite SOS on Apple laptops, tablets, watches and earbuds, and a loudspeaker
 * and SAR no source checked on every Apple or registry phone. The 15 and 15 Pro Max get the
 * keys Apple's tech specs list, the phone-only Apple defaults stay on phones, and an Apple
 * or registry device gets only a sourced loudspeaker and SAR.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { countPopulatedFieldGroups } from '../arena-spec-syncer.js';
import { SOURCED_SEEDS_2026 } from '../flagship-seed-sourced-2026.js';
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

const seed2026 = (modelKey: string) => {
  const found = SOURCED_SEEDS_2026.find(s => s.model_key === modelKey);
  assert.ok(found, modelKey);
  return found.specifications;
};

test('the iPhone 15 and 15 Pro Max get the buttons Apple lists, without Camera Control', () => {
  for (const title of ['Apple iPhone 15 128GB', 'Apple iPhone 15']) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, 'Ring/Silent switch, side button, volume buttons', title);
  }
  for (const title of ['Apple iPhone 15 Pro Max 256GB', 'Apple iPhone 15 Pro Max']) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, 'Action button, side button, volume buttons', title);
  }
  for (const title of [
    'Apple iPhone 15 128GB',
    'Apple iPhone 15 Pro Max 256GB',
    'Apple iPhone 15',
    'Apple iPhone 15 Pro Max',
  ]) {
    const out = normalize(title).specifications;
    assert.doesNotMatch(out.design?.keys ?? '', /Camera Control/i, title);
    // Apple's tech specs list MagSafe and Qi2, the UWB chip and satellite SOS for both:
    // the iPhone defaults stay.
    assert.equal(out.battery?.charging, 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2', title);
    assert.equal(out.connectivity?.other, 'Ultra Wideband (UWB), SOS vệ tinh', title);
    assert.equal(out.display?.features, 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch');
  }
});

test('Apple laptops, tablets, watches and earbuds get no iPhone charging, UWB or satellite SOS', () => {
  for (const title of [
    'Apple MacBook Air M3 13 inch 256GB',
    'Apple MacBook Air M4 13 inch 256GB',
    'Apple iPad Pro M4 11 inch 256GB',
    'Apple iPad Pro M4 13 inch 256GB',
    'Apple Watch Ultra 2 49mm',
    'Apple Watch Series 10 46mm',
    'Tai nghe AirPods Pro 2',
    'Apple AirPods Pro 3',
  ]) {
    const n = normalize(title);
    assert.notEqual(n.category_slug, 'smartphones', title);
    const out = n.specifications;
    assert.doesNotMatch(out.battery?.charging ?? '', /MagSafe\/Qi2/, title);
    assert.doesNotMatch(out.connectivity?.other ?? '', /Ultra Wideband \(UWB\)|SOS vệ tinh/, title);
    assert.equal(out.battery?.charging, undefined, title);
    assert.equal(out.connectivity?.other, undefined, title);
    assert.equal(out.multimedia?.loudspeaker, undefined, title);
    assert.equal(out.regulatory?.sar_head, undefined, title);
    // The groups the catalog audit requires stay non-empty.
    for (const name of ['battery', 'connectivity', 'multimedia', 'regulatory'] as const) {
      assert.equal(countPopulatedFieldGroups({ [name]: out[name] }), 1, `${title} ${name}`);
    }
  }
});

test('an Apple or registry phone gets only the loudspeaker and SAR its sources state', () => {
  // Sourced: as the 2026 seeds state them.
  for (const [title, seedKey] of [
    ['Apple iPhone 18 Pro Max 256GB', 'apple:iphone-18-pro-max:256gb'],
    ['Apple iPhone 18 Pro 256GB', 'apple:iphone-18-pro:256gb'],
    ['Samsung Galaxy S26 Ultra 256GB', 'samsung:galaxy-s26-ultra:256gb'],
  ] as const) {
    const out = normalize(title).specifications;
    const s = seed2026(seedKey);
    assert.ok(s.multimedia?.loudspeaker, seedKey);
    assert.equal(out.multimedia?.loudspeaker, s.multimedia?.loudspeaker, title);
    assert.equal(out.regulatory?.sar_head, s.regulatory?.sar_head, title);
    assert.equal(out.regulatory?.sar_body, s.regulatory?.sar_body, title);
  }
  assert.equal(
    normalize('Samsung Galaxy S26 Ultra 256GB').specifications.regulatory?.sar_head,
    '1.09 W/kg'
  );

  // Unsourced: no generic value, while the multimedia and regulatory groups stay non-empty.
  for (const title of [
    'Apple iPhone 15 128GB',
    'Apple iPhone 15 Pro Max 256GB',
    'Apple iPhone 16 Pro Max 256GB',
    'Apple iPhone 14 128GB',
    'Samsung Galaxy S24 Ultra 256GB',
    'Google Pixel 9 Pro XL 256GB',
  ]) {
    const out = normalize(title).specifications;
    assert.equal(out.multimedia?.loudspeaker, undefined, title);
    assert.equal(out.regulatory?.sar_head, undefined, title);
    assert.equal(out.regulatory?.sar_body, undefined, title);
    assert.ok(countPopulatedFieldGroups({ multimedia: out.multimedia }) === 1, title);
    assert.ok(countPopulatedFieldGroups({ regulatory: out.regulatory }) === 1, title);
  }
});

test('non-Apple devices outside the registry, and other iPhones, keep their previous output', () => {
  const redmi = normalize('Xiaomi Redmi Note 99 Pro 256GB').specifications;
  assert.equal(redmi.design?.keys, 'Volume, Power');
  assert.equal(redmi.battery?.charging, 'Sạc nhanh USB-C PD/PPS');
  assert.equal(redmi.connectivity?.other, 'Hỗ trợ OTG, Chia sẻ nhanh');
  // No source states its loudspeaker or SAR: none since DOS/Rate#1754.
  assert.equal(redmi.multimedia?.loudspeaker, undefined);
  assert.equal(redmi.regulatory?.sar_head, undefined);
  assert.equal(redmi.regulatory?.sar_body, undefined);

  // A non-Apple tablet keeps the non-Apple charging and connectivity defaults; as a registry
  // device it gets no unsourced loudspeaker.
  const tab = normalize('Samsung Galaxy Tab S10 Ultra 256GB').specifications;
  assert.equal(tab.multimedia?.loudspeaker, undefined);
  assert.equal(tab.battery?.charging, 'Sạc nhanh USB-C PD/PPS');
  assert.equal(tab.connectivity?.other, 'Hỗ trợ OTG, Chia sẻ nhanh');

  // The generic iPhone keys hold for the iPhone 16 line in the registry.
  for (const title of ['Apple iPhone 16 Pro Max 256GB', 'Apple iPhone 16 128GB']) {
    const out = normalize(title).specifications;
    assert.equal(out.design?.keys, 'Action Button, Camera Control, Volume, Power', title);
    assert.equal(out.battery?.charging, 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2', title);
    assert.equal(out.connectivity?.other, 'Ultra Wideband (UWB), SOS vệ tinh', title);
  }
});
