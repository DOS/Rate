/**
 * The sourced seeds that replace the unsourced iPhone 18 Pro, 18 Pro Max and Galaxy S26 Ultra
 * 256GB entries: they parse, keys and slugs stay unique, every spec group is sourced, each
 * seed's name and retail aliases key exactly as the normalizer keys real titles, the
 * benchmark registry agrees with them, and the backfill retracts what the old entries wrote.
 */
import assert from 'node:assert/strict';
import { KeySpecsSchema, ProductSpecificationsSchema, splitModelKey } from '@repo/shared-data';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { SOURCED_SEEDS_2026 as REPLACED } from '../flagship-seed-sourced-2026.js';
import { CATALOG_EXPANSION_2026_SEEDS } from '../flagship-seed-catalog-2026.js';

// The replaced 256GB seeds and the A1-A3 catalog expansion, checked alike.
const SOURCED_SEEDS_2026 = [...REPLACED, ...CATALOG_EXPANSION_2026_SEEDS];
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import {
  mergeKeySpecs,
  seedMasterSpecUpdate,
  specUpdateChanges,
  withoutRetractedSpecs,
} from '../jobs/backfill-specs.js';
import { mergeProductSpecifications } from '../ai-spec-enricher.js';
import { UPSTREAM_2026_ARENA_REFERENCE_URLS } from '../arena-spec-syncer.js';
import { specPageMatchesItem } from '../spec-retraction.js';
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

// Catalog wave 1a: the 39 phone keys of the Rate Services wave list (RS#799; keys only).
// Three exist already (the published 256GB iPhone 18 Pro and Pro Max, and the draft 256GB
// Galaxy S26 Ultra): their sourced seeds are flagship-seed-sourced-2026.ts. The other 36
// are flagship-seed-catalog-2026.ts. The seeds are exactly this set.
const WAVE_1A_KEYS = [
  'apple:iphone-17-pro-max:256gb',
  'apple:iphone-17-pro-max:512gb',
  'apple:iphone-17-pro-max:1024gb',
  'apple:iphone-17-pro-max:2048gb',
  'apple:iphone-17-pro:256gb',
  'apple:iphone-17-pro:512gb',
  'apple:iphone-17-pro:1024gb',
  'apple:iphone-17:256gb',
  'apple:iphone-17:512gb',
  'apple:iphone-17e:256gb',
  'apple:iphone-17e:512gb',
  'apple:iphone-18-pro-max:256gb',
  'apple:iphone-18-pro-max:512gb',
  'apple:iphone-18-pro-max:1024gb',
  'apple:iphone-18-pro-max:2048gb',
  'apple:iphone-18-pro:256gb',
  'apple:iphone-18-pro:512gb',
  'apple:iphone-18-pro:1024gb',
  'apple:iphone-18-pro:2048gb',
  'apple:iphone-air:256gb',
  'apple:iphone-air:512gb',
  'apple:iphone-air:1024gb',
  'samsung:galaxy-s26:256gb',
  'samsung:galaxy-s26:512gb',
  'samsung:galaxy-s26-plus:256gb',
  'samsung:galaxy-s26-plus:512gb',
  'samsung:galaxy-s26-ultra:256gb',
  'samsung:galaxy-s26-ultra:512gb',
  'samsung:galaxy-s26-ultra:1024gb',
  'samsung:galaxy-s26-fe:128gb',
  'samsung:galaxy-s26-fe:256gb',
  'samsung:galaxy-z-flip8:256gb',
  'samsung:galaxy-z-flip8:512gb',
  'samsung:galaxy-z-fold8:256gb',
  'samsung:galaxy-z-fold8:512gb',
  'samsung:galaxy-z-fold8:1024gb',
  'samsung:galaxy-z-fold8-ultra:256gb',
  'samsung:galaxy-z-fold8-ultra:512gb',
  'samsung:galaxy-z-fold8-ultra:1024gb',
];
assert.equal(WAVE_1A_KEYS.length, 39);
assert.deepEqual(
  SOURCED_SEEDS_2026.map(seed => seed.model_key).sort(),
  [...WAVE_1A_KEYS].sort(),
  'wave 1a seeds'
);
assert.deepEqual(
  REPLACED.map(seed => seed.model_key).sort(),
  ['apple:iphone-18-pro-max:256gb', 'apple:iphone-18-pro:256gb', 'samsung:galaxy-s26-ultra:256gb'],
  'the three existing keys keep their sourced seeds'
);
// Each model's storages, in key order.
const EXPECTED: Record<string, number[]> = {};
for (const key of WAVE_1A_KEYS) {
  const parts = splitModelKey(key);
  assert.ok(parts, key);
  EXPECTED[parts.itemKey] = [
    ...(EXPECTED[parts.itemKey] ?? []),
    Number(key.split(':')[2]!.slice(0, -2)),
  ];
}
for (const itemKey of Object.keys(EXPECTED)) EXPECTED[itemKey]!.sort((a, b) => a - b);
const byItem = new Map<string, number[]>();
for (const seed of SOURCED_SEEDS_2026) {
  const parts = splitModelKey(seed.model_key);
  assert.ok(parts, seed.model_key);
  byItem.set(parts.itemKey, [...(byItem.get(parts.itemKey) ?? []), seed.storage_gb ?? 0]);
}
assert.deepEqual(Object.fromEntries(byItem), EXPECTED);

// Unique keys and slugs across the whole seed list.
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
for (const seed of SOURCED_SEEDS_2026) {
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
  ['iPhone Air 1 TB', 'apple:iphone-air:1024gb'],
  ['Samsung Galaxy Z Fold 8 Ultra 16GB/1TB', 'samsung:galaxy-z-fold8-ultra:1024gb'],
  ['Samsung Galaxy Fold8 512GB', 'samsung:galaxy-z-fold8:512gb'],
  ['Samsung Galaxy Z Flip 8 12GB/256GB', 'samsung:galaxy-z-flip8:256gb'],
] as const) {
  assert.equal(normalize(title).model_key, key, title);
}
const seededKeys = new Set(SOURCED_SEEDS_2026.map(seed => seed.model_key));
for (const title of [
  'Samsung Galaxy S26 Edge 256GB',
  'Samsung Galaxy S26 FE 512GB',
  // No Z Flip8 FE this year: its key keeps clear of the Flip8 (DOS/Rate#1493).
  'Samsung Galaxy Z Flip8 FE 256GB',
  'Apple iPhone 16e 256GB',
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
  const seed = SOURCED_SEEDS_2026.find(s => s.model_key === key)!;
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
  const seed = SOURCED_SEEDS_2026.find(s => s.model_key === key)!;
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

// The master update both backfill entry points write, from a row the old unsourced seed
// wrote: the retracted values go, the label follows, and the stored input is untouched.
{
  const seed = SOURCED_SEEDS_2026.find(s => s.model_key === 'samsung:galaxy-s26-ultra:256gb')!;
  const stored = {
    specifications: {
      battery: { capacity_mah: 5200, fast_charging_w: 65 },
      regulatory: { certifications: 'FCC, CE, QCVN' },
    },
    key_specs: { ram: '16GB' },
  };
  const before = JSON.stringify(stored);
  const update = seedMasterSpecUpdate(stored, seed) as {
    specifications: Record<string, Record<string, unknown> | undefined>;
    key_specs: Record<string, unknown>;
    variant_name?: string;
  };
  assert.equal(update.variant_name, '12GB/256GB');
  assert.equal(update.specifications.battery?.capacity_mah, 5000);
  assert.equal(update.specifications.battery?.fast_charging_w, 60);
  assert.equal(update.specifications.regulatory?.certifications, undefined);
  assert.equal(update.key_specs.ram, '12GB');
  assert.equal(JSON.stringify(stored), before, 'the stored row is not mutated');
  // The value columns follow too, so the quick sync leaves no 16GB / 5200 mAh row.
  assert.equal((update as Record<string, unknown>).ram_gb, 12);
  assert.equal((update as Record<string, unknown>).battery_mah, 5000);
  assert.deepEqual((update as Record<string, unknown>).colors, seed.colors);
  // A seed with nothing to retract keeps its stored label.
  const plain = FLAGSHIP_DEVICES_TO_SEED.find(
    s => s.model_key === 'samsung:galaxy-s24-ultra:256gb'
  )!;
  assert.equal('variant_name' in seedMasterSpecUpdate(null, plain), false);
}

// The registry counts photo cameras: LiDAR is no fourth camera on the iPhones.
for (const title of ['Apple iPhone 18 Pro 256GB', 'Apple iPhone 18 Pro Max 256GB']) {
  assert.equal(normalize(title).specifications.camera?.rear_setup, 'Triple Camera', title);
}

// Every other seed writes exactly what it wrote before: the merged specs and key specs,
// nothing more, whatever the stored row holds (DOS/Rate#1459).
for (const seed of FLAGSHIP_DEVICES_TO_SEED.filter(s => !s.retract_spec_fields)) {
  for (const stored of [
    null,
    { specifications: seed.specifications, key_specs: seed.key_specs },
    {
      specifications: { battery: { fast_charging_w: 99 }, regulatory: { sar_head: 'x' } },
      key_specs: { battery: 'old' },
    },
  ]) {
    assert.deepEqual(
      seedMasterSpecUpdate(stored, seed),
      {
        specifications: mergeProductSpecifications(
          stored?.specifications,
          seed.specifications,
          seed.colors
        ),
        key_specs: mergeKeySpecs(
          stored?.key_specs,
          seed.key_specs as unknown as Record<string, unknown>
        ),
      },
      seed.model_key
    );
  }
}

// The iPhones' old unsourced row: its 35W and SAR go, nothing else stale stays.
for (const key of ['apple:iphone-18-pro-max:256gb', 'apple:iphone-18-pro:256gb']) {
  const seed = SOURCED_SEEDS_2026.find(s => s.model_key === key)!;
  const update = seedMasterSpecUpdate(
    {
      specifications: {
        battery: { capacity_mah: 5567, fast_charging_w: 35 },
        regulatory: { sar_head: '1.14 W/kg', sar_body: '1.18 W/kg' },
      },
      key_specs: { battery: '5567 mAh, Sạc nhanh 35W' },
    },
    seed
  ) as { specifications: Record<string, Record<string, unknown> | undefined> };
  assert.equal(update.specifications.battery?.fast_charging_w, undefined, key);
  assert.equal(update.specifications.regulatory?.sar_head, undefined, key);
  assert.equal(update.specifications.regulatory?.sar_body, undefined, key);
}

// The dry-run prints what changes.
assert.deepEqual(
  specUpdateChanges(
    { ram_gb: 16, specifications: { battery: { capacity_mah: 5200, type: 'Li-Ion' } } },
    { ram_gb: 12, specifications: { battery: { capacity_mah: 5000, type: 'Li-Ion' } } }
  ),
  ['ram_gb: 16 -> 12', 'specifications.battery.capacity_mah: 5200 -> 5000']
);

// The Arena sync takes a spec page only for its own Item: these three rows pointed at
// other devices (itel A95, itel A90, Honor Pad GT2 Pro); their URLs are the seeds' sources.
assert.equal(specPageMatchesItem('itel A95', 'apple:iphone-18-pro-max'), false);
assert.equal(specPageMatchesItem('itel A90 Limited', 'apple:iphone-18-pro'), false);
assert.equal(specPageMatchesItem('Honor Pad GT2 Pro', 'samsung:galaxy-s26-ultra'), false);
assert.equal(specPageMatchesItem(undefined, 'apple:iphone-18-pro'), false);
for (const ref of UPSTREAM_2026_ARENA_REFERENCE_URLS) {
  const itemKey = splitModelKey(ref.model_key)!.itemKey;
  assert.ok(specPageMatchesItem(ref.name, itemKey), `${ref.name} is ${itemKey}`);
  const seed = SOURCED_SEEDS_2026.find(s => s.model_key === ref.model_key);
  if (seed) {
    assert.ok(
      Object.values(seed.sources ?? {}).includes(ref.gsmarenaUrl),
      `${ref.model_key}: Arena URL ${ref.gsmarenaUrl} is not the seed's source`
    );
  }
}

console.warn(`✅ Sourced seeds (${SOURCED_SEEDS_2026.length}) passed`);
