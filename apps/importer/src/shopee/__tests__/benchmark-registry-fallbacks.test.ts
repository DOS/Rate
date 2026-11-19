/**
 * DOS/Rate#1739: follow-ups from the #1738 review, on the normalizer's benchmark registry.
 * - A registry model's own Wi-Fi and flash replace the generic Apple defaults ("Wi-Fi 6E/7",
 *   "True Tone Dual-LED"), and a registry model whose sources state no refresh rate gets none
 *   instead of the 60/120 Hz category default. Models without the new fields keep their output.
 * - A per-model storage allowlist: a title naming a storage the model is not sold in
 *   ("iPhone 17e 128GB") keys as ':unknown' and needs review, so a Tier 3 upsert can never
 *   create a phantom master such as 'apple:iphone-17e:128gb'.
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
  return found;
};

test('the 16e and 17e get their sourced Wi-Fi and flash, as their seeds state them', () => {
  for (const [title, modelKey] of [
    ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
    ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
    ['Apple iPhone 17e 512GB', 'apple:iphone-17e:512gb'],
  ] as const) {
    const out = normalize(title);
    assert.equal(out.model_key, modelKey, title);
    const s = seed(modelKey).specifications;
    assert.equal(out.specifications.connectivity?.wlan, s.connectivity?.wlan, title);
    assert.equal(out.specifications.connectivity?.wlan, 'Wi-Fi 6 (802.11ax) with 2x2 MIMO', title);
    assert.equal(out.specifications.camera?.flash, s.camera?.flash, title);
    assert.equal(out.specifications.camera?.flash, 'True Tone flash', title);
  }
});

test('a registry phone with no sourced refresh rate gets none; one with a rate keeps it', () => {
  // The 17e seed leaves the refresh rate out: no source checked states it.
  assert.equal(seed('apple:iphone-17e:256gb').specifications.display?.refresh_rate_hz, undefined);
  assert.equal(
    normalize('Apple iPhone 17e 256GB').specifications.display?.refresh_rate_hz,
    undefined
  );
  // The 16e's is sourced (60 Hz) and unchanged.
  assert.equal(normalize('Apple iPhone 16e 128GB').specifications.display?.refresh_rate_hz, 60);
  assert.equal(
    normalize('Apple iPhone 16 Pro Max 256GB').specifications.display?.refresh_rate_hz,
    120
  );
});

test('models without the new registry fields keep their previous output', () => {
  const pro = normalize('Apple iPhone 16 Pro Max 256GB');
  assert.equal(pro.is_benchmark_enriched, true);
  assert.equal(pro.specifications.connectivity?.wlan, 'Wi-Fi 6E/7, dual-band, Wi-Fi Direct');
  assert.equal(pro.specifications.camera?.flash, 'True Tone Dual-LED');

  const samsung = normalize('Samsung Galaxy S24 Ultra 256GB');
  assert.equal(samsung.is_benchmark_enriched, true);
  assert.equal(samsung.specifications.connectivity?.wlan, 'Wi-Fi 6E/7, dual-band, Wi-Fi Direct');
  assert.equal(samsung.specifications.camera?.flash, 'LED flash, auto-HDR, panorama');

  // A phone outside the registry keeps the category fallbacks.
  const other = normalize('Xiaomi Redmi Note 99 Pro 256GB');
  assert.equal(other.is_benchmark_enriched, false);
  assert.equal(other.specifications.display?.refresh_rate_hz, 120);
  assert.equal(other.specifications.connectivity?.wlan, 'Wi-Fi 6E/7, dual-band, Wi-Fi Direct');
  assert.equal(other.specifications.camera?.flash, 'LED flash, auto-HDR, panorama');
  const otherApple = normalize('Apple iPhone 11 64GB');
  assert.equal(otherApple.is_benchmark_enriched, false);
  assert.equal(otherApple.specifications.display?.refresh_rate_hz, 60);
  // No checked Apple page states "Dual-LED": an iPhone outside the registry gets no flash
  // (DOS/Rate#1754).
  assert.equal(otherApple.specifications.camera?.flash, undefined);
});

test('a storage the model is not sold in keys as unknown, never as a sized phantom master', () => {
  for (const [title, unsold] of [
    ['Apple iPhone 17e 128GB', 128],
    ['iPhone 17e 64GB Chính hãng', 64],
    ['iPhone 17e 1TB', 1024],
    ['Apple iPhone 17 E 128GB', 128],
    // RAM/ROM pairs either way round, and ROM markers.
    ['iPhone 17e 8GB/128GB', 128],
    ['iPhone 17e 128GB/8GB', 128],
    ['iPhone 17e ROM 128GB', 128],
    ['iPhone 17e dung lượng 128GB', 128],
    ['iPhone 17e 1TB ROM', 1024],
    ['Apple iPhone 16e 1TB', 1024],
    ['Apple iPhone 16e 64GB', 64],
  ] as const) {
    const out = normalize(title);
    const item = title.includes('16') ? 'apple:iphone-16e' : 'apple:iphone-17e';
    assert.equal(out.item_key, item, title);
    assert.equal(out.model_key, `${item}:unknown`, title);
    assert.equal(out.storage_gb, null, title);
    assert.equal(out.unsold_storage_gb, unsold, title);
    assert.equal(out.variant_known, false, title);
    assert.equal(out.variant_source, null, title);
    assert.equal(out.needs_review, true, title);
    assert.equal(out.specifications.hardware?.storage_gb, undefined, title);
    assert.doesNotMatch(out.name, /\d+\s*(?:GB|TB)/, title);
    assert.doesNotMatch(out.slug, /\d+(?:gb|tb)/, title);
    // Still the model: its benchmark specs apply.
    assert.equal(out.is_benchmark_enriched, true, title);
    assert.equal(out.ram_gb, 8, title);
  }
});

test('the storages a model is sold in key as before', () => {
  for (const [title, modelKey] of [
    ['Apple iPhone 17e 256GB', 'apple:iphone-17e:256gb'],
    ['iPhone 17 e 512 GB', 'apple:iphone-17e:512gb'],
    ['Apple iPhone 16e 128GB', 'apple:iphone-16e:128gb'],
    ['Apple iPhone 16e 256GB', 'apple:iphone-16e:256gb'],
    ['Apple iPhone 16e 512GB', 'apple:iphone-16e:512gb'],
  ] as const) {
    const out = normalize(title);
    assert.equal(out.model_key, modelKey, title);
    assert.equal(out.variant_known, true, title);
    assert.equal(out.variant_source, 'title', title);
    assert.equal(out.unsold_storage_gb, undefined, title);
  }
  // A title with no storage keys as unknown, as before.
  assert.equal(normalize('Apple iPhone 17e').model_key, 'apple:iphone-17e:unknown');
  // A registry model with no allowlist keys any storage its title names.
  assert.equal(
    normalize('Apple iPhone 16 Pro Max 2TB').model_key,
    'apple:iphone-16-pro-max:2048gb'
  );
});
