/**
 * The catalog expansion seeds, groups A1-A3 (Docs/Proposals/2026-10-30-catalog-expansion.html):
 * they parse, their keys and slugs are unique, every spec group is sourced, and every
 * seed's name and retail aliases key exactly as the normalizer keys real titles, so a
 * crawled listing lands on its seed.
 */
import assert from 'node:assert/strict';
import { KeySpecsSchema, ProductSpecificationsSchema, splitModelKey } from '@repo/shared-data';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { CATALOG_EXPANSION_2026_SEEDS } from '../flagship-seed-catalog-2026.js';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import { withoutRetractedSpecs } from '../jobs/backfill-specs.js';
import type { ShopeeProduct } from '../types.js';

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 30_000_000,
    priceMax: 30_000_000,
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

// The groups and storages the proposal asks for, in every storage sold in Vietnam.
const EXPECTED: Record<string, number[]> = {
  'apple:iphone-17': [256, 512],
  'apple:iphone-17-pro': [256, 512, 1024],
  'apple:iphone-17-pro-max': [256, 512, 1024, 2048],
  'apple:iphone-18-pro': [256, 512, 1024, 2048],
  'apple:iphone-18-pro-max': [256, 512, 1024, 2048],
  'samsung:galaxy-s26': [256, 512],
  'samsung:galaxy-s26-plus': [256, 512],
  'samsung:galaxy-s26-ultra': [256, 512, 1024],
};
const byItem = new Map<string, number[]>();
for (const seed of CATALOG_EXPANSION_2026_SEEDS) {
  const parts = splitModelKey(seed.model_key);
  assert.ok(parts, seed.model_key);
  byItem.set(parts.itemKey, [...(byItem.get(parts.itemKey) ?? []), seed.storage_gb ?? 0]);
}
assert.deepEqual(Object.fromEntries(byItem), EXPECTED);

// Unique keys and slugs across the whole seed list, the replaced 256GB entries included.
for (const field of ['model_key', 'slug'] as const) {
  const values = FLAGSHIP_DEVICES_TO_SEED.map(seed => seed[field]);
  assert.equal(new Set(values).size, values.length, `duplicate ${field}`);
}
// One Item per model, its variants the storages above.
for (const [itemKey, storages] of Object.entries(EXPECTED)) {
  const item = flagshipSeedsByItem().find(i => i.itemKey === itemKey);
  assert.deepEqual(
    item?.variants.map(v => v.storage_gb),
    storages,
    itemKey
  );
}

const strip = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
for (const seed of CATALOG_EXPANSION_2026_SEEDS) {
  const where = seed.model_key;
  // The specs parse, with no field outside the schema (zod drops unknown keys silently).
  const specs = ProductSpecificationsSchema.safeParse(seed.specifications);
  assert.equal(specs.success, true, `${where}: ${specs.error?.message}`);
  assert.deepEqual(strip(specs.data), strip(seed.specifications), `${where}: unknown spec field`);
  const keySpecs = KeySpecsSchema.safeParse(seed.key_specs);
  assert.equal(keySpecs.success, true, `${where}: ${keySpecs.error?.message}`);
  assert.deepEqual(strip(keySpecs.data), strip(seed.key_specs), `${where}: unknown key spec`);

  // Storage and RAM agree between the columns, the specs and the key.
  assert.equal(seed.specifications.hardware?.storage_gb, seed.storage_gb, where);
  assert.equal(seed.specifications.hardware?.ram_gb, seed.ram_gb, where);
  assert.ok(seed.model_key.endsWith(`:${seed.storage_gb}gb`), where);

  // Every spec group the seed fills is cited, by the group or one of its fields, and every
  // source is an https URL. No synthetic listing, price, merchant or review data.
  const sources = seed.sources ?? {};
  for (const url of Object.values(sources)) assert.match(url, /^https:\/\/\S+$/, where);
  for (const group of Object.keys(seed.specifications)) {
    assert.ok(
      Object.keys(sources).some(path => path === group || path.startsWith(`${group}.`)),
      `${where}: spec group "${group}" has no source`
    );
  }
  for (const field of ['listings', 'expert_rating', 'expert_review_summary', 'min_price']) {
    assert.ok(!(field in seed), `${where}: synthetic field ${field}`);
  }

  // The seed's own name and each retail alias key exactly as the seed, in its category.
  for (const title of [seed.name, ...(seed.aliases ?? [])]) {
    assert.equal(normalize(title).model_key, seed.model_key, `${where}: "${title}"`);
    assert.equal(detectCategorySlug(title), 'smartphones', `${where}: "${title}"`);
  }
  assert.ok((seed.aliases ?? []).length >= 2, `${where}: needs retail aliases`);
}

// More retail spellings key as their seed; near-miss models never land on these keys.
for (const [title, key] of [
  ['iPhone 17 Pro Max 1 TB', 'apple:iphone-17-pro-max:1024gb'],
  ['Samsung Galaxy S26 Ultra 16GB 1TB', 'samsung:galaxy-s26-ultra:1024gb'],
  ['Galaxy S26+ 12GB/512GB', 'samsung:galaxy-s26-plus:512gb'],
  ['Samsung Galaxy S26 Plus 5G 512GB', 'samsung:galaxy-s26-plus:512gb'],
] as const) {
  assert.equal(normalize(title).model_key, key, title);
}
const seededKeys = new Set(CATALOG_EXPANSION_2026_SEEDS.map(seed => seed.model_key));
for (const title of [
  'Apple iPhone 17e 256GB',
  'Apple iPhone Air 256GB',
  'Samsung Galaxy S26 FE 256GB',
  'Samsung Galaxy S26 Edge 256GB',
]) {
  assert.ok(!seededKeys.has(normalize(title).model_key), title);
}

// The benchmark registry (product-normalizer.ts) agrees with the sourced seeds on the
// headline values for the models both describe, so an enriched listing carries them.
for (const key of [
  'apple:iphone-18-pro-max:256gb',
  'apple:iphone-18-pro:256gb',
  'samsung:galaxy-s26-ultra:256gb',
]) {
  const seed = CATALOG_EXPANSION_2026_SEEDS.find(s => s.model_key === key)!;
  const enriched = normalize(seed.name);
  assert.equal(enriched.is_benchmark_enriched, true, key);
  assert.equal(enriched.battery_mah, seed.battery_mah, key);
  assert.equal(enriched.screen_size_inch, seed.screen_size_inch, key);
  assert.equal(
    enriched.specifications.hardware?.chipset,
    seed.specifications.hardware?.chipset?.replace(/ \(SM8850-1-AD, 3 nm\)$/, ' (3 nm)'),
    key
  );
}

// No charging wattage is invented for a registry model whose sources state none, and a
// storage with its own RAM gets it when the title names no RAM.
for (const title of ['Apple iPhone 18 Pro 256GB', 'Apple iPhone 18 Pro Max 1TB']) {
  const phone = normalize(title);
  assert.equal(phone.specifications.battery?.fast_charging_w, undefined, title);
  assert.doesNotMatch(phone.key_specs.battery ?? '', /W\)/, title);
}
assert.equal(normalize('Samsung Galaxy S26 Ultra 1TB').ram_gb, 16);
assert.equal(normalize('Samsung Galaxy S26 Ultra 512GB').ram_gb, 12);
assert.equal(normalize('Samsung Galaxy S26 Ultra 12GB/1TB').ram_gb, 12);

// The replaced 256GB entries retract what their unsourced versions wrote: the backfill's
// merge would keep it otherwise, and the Item carries the paths of its variants.
const retracted = withoutRetractedSpecs(
  {
    battery: { capacity_mah: 5391, fast_charging_w: 35 },
    regulatory: { sar_head: '1.14 W/kg', sar_body: '1.18 W/kg' },
  },
  ['battery.fast_charging_w', 'regulatory.sar_head', 'regulatory.sar_body', 'key_specs.ram'],
  'specifications'
);
assert.deepEqual(retracted, { battery: { capacity_mah: 5391 } });
assert.deepEqual(
  withoutRetractedSpecs({ ram: '16GB', chip: 'x' }, ['key_specs.ram', 'battery.type'], 'key_specs'),
  { chip: 'x' }
);
for (const key of [
  'apple:iphone-18-pro-max:256gb',
  'apple:iphone-18-pro:256gb',
  'samsung:galaxy-s26-ultra:256gb',
]) {
  const seed = CATALOG_EXPANSION_2026_SEEDS.find(s => s.model_key === key)!;
  assert.ok((seed.retract_spec_fields ?? []).length > 0, key);
  for (const path of seed.retract_spec_fields ?? []) {
    const [group, field] = path.split('.') as [string, string];
    assert.equal(
      (seed.specifications as Record<string, Record<string, unknown> | undefined>)[group]?.[field],
      undefined,
      `${key} retracts ${path} but still sets it`
    );
  }
  const item = flagshipSeedsByItem().find(i => key.startsWith(`${i.itemKey}:`))!;
  assert.deepEqual(item.retract_spec_fields, seed.retract_spec_fields, key);
}

console.warn(`✅ Catalog expansion seeds (${CATALOG_EXPANSION_2026_SEEDS.length} variants) passed`);
