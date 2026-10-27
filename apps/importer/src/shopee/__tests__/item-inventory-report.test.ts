import assert from 'node:assert/strict';
import type { FlagshipDeviceSeed } from '../flagship-seed-data.js';
import {
  buildInventoryReport,
  itemKeyOf,
  itemNameOf,
  itemSlugOf,
  type InventoryListing,
  type InventoryMaster,
} from '../jobs/item-inventory-report.js';

const master = (
  id: string,
  model_key: string,
  slug: string,
  name: string,
  overrides: Partial<InventoryMaster> = {}
): InventoryMaster => ({
  id,
  model_key,
  slug,
  name,
  brand: name.split(' ')[0]!,
  status: 'published',
  category_id: 'phones',
  storage_gb: Number(/:(\d+)gb$/.exec(model_key)?.[1] ?? NaN) || null,
  ...overrides,
});

const listing = (
  id: string,
  cluster_id: string | null,
  title: string,
  price_max = 1
): InventoryListing => ({
  id,
  cluster_id,
  title,
  platform: 'tgdd',
  platform_item_id: id,
  price_min: 1,
  price_max,
});

const seed = (model_key: string, name: string) => ({ model_key, name }) as FlagshipDeviceSeed;

function run() {
  assert.equal(itemSlugOf('asus-zenbook-s-14-1tb'), 'asus-zenbook-s-14');
  assert.equal(itemSlugOf('sony-wf-1000xm6'), 'sony-wf-1000xm6');
  assert.equal(itemNameOf('Apple iPhone 16 128GB'), 'Apple iPhone 16');
  // As SQL split_part does: a one-segment key keeps its trailing ':'.
  assert.equal(itemKeyOf('legacy'), 'legacy:');

  const report = buildInventoryReport({
    categories: [
      { id: 'phones', slug: 'smartphones' },
      { id: 'buds', slug: 'earbuds' },
    ],
    masters: [
      master('a', 'apple:iphone-16:128gb', 'apple-iphone-16-128gb', 'Apple iPhone 16 128GB'),
      // Same Item, but its slug strips to another Item slug.
      master('b', 'apple:iphone-16:256gb', 'apple-iphone-16-vn-256gb', 'Apple iPhone 16 256GB'),
      // Another Item whose variant slug is iPhone 16's Item slug.
      master('c', 'apple:iphone-16-x:64gb', 'apple-iphone-16', 'Apple iPhone 16 X 64GB'),
      master(
        'd',
        'samsung:galaxy-buds3-pro:64gb',
        'samsung-galaxy-buds3-pro',
        'Samsung Galaxy Buds3 Pro',
        {
          category_id: 'buds',
        }
      ),
      master('e', 'khc:legacy', 'legacy', 'Legacy'),
      master('f', 'oddkey', 'odd', 'Odd'),
      // A size in TB, and a NULL brand next to a real one: neither is a mismatch or a conflict.
      master('g', 'asus:zenbook-s-14:1tb', 'asus-zenbook-s-14-1tb', 'Asus Zenbook S 14 1TB', {
        storage_gb: 1024,
      }),
      master('h', 'asus:zenbook-s-14:512gb-oled', 'asus-zenbook-s-14-512gb', 'Asus Zenbook 512GB', {
        brand: null,
        storage_gb: 512,
      }),
      // A real conflict: two categories under one Item, and a stored size that disagrees.
      master('i', 'oppo:find-x8:256gb', 'oppo-find-x8-256gb', 'OPPO Find X8 256GB', {
        category_id: 'buds',
        storage_gb: 128,
      }),
      master('j', 'oppo:find-x8:512gb', 'oppo-find-x8-128gb-512gb', 'OPPO Find X8 512GB'),
    ],
    listings: [
      listing('p1', 'a', 'Apple iPhone 16 256GB'),
      listing('p2', 'a', 'Apple iPhone 16'),
      listing('p3', null, 'x', 2),
      listing('p4', 'gone', 'x'),
    ],
    seeds: [
      seed('apple:iphone-16:128gb', 'Apple iPhone 16 128GB'),
      seed('samsung:galaxy-buds3-pro:64gb', 'Samsung Galaxy Buds3 Pro'),
    ],
  });

  assert.equal(report.counts.total, 10);
  assert.equal(report.counts.khc_keys, 1);
  assert.equal(report.counts.bad_shape, 2);
  assert.equal(report.counts.listings_without_master, 1);
  assert.equal(report.counts.listings_on_missing_master, 1);
  assert.deepEqual(
    report.legacy_keys.map(r => r.model_key),
    ['khc:legacy', 'oddkey']
  );
  assert.deepEqual(report.item_conflicts, [
    { item_key: 'oppo:find-x8', variants: ['oppo:find-x8:256gb', 'oppo:find-x8:512gb'] },
  ]);
  assert.deepEqual(
    report.sizeless_with_size.map(r => r.model_key),
    ['samsung:galaxy-buds3-pro:64gb', 'oppo:find-x8:256gb']
  );
  assert.deepEqual(report.seed_drift, [
    {
      seed_key: 'samsung:galaxy-buds3-pro:64gb',
      normalized_key: 'samsung:galaxy-buds3-pro:unknown',
      stored_status: 'published',
      normalized_key_stored: false,
    },
  ]);
  assert.ok(report.master_drift.some(d => d.normalized_key === 'samsung:galaxy-buds3-pro:unknown'));
  assert.deepEqual(
    report.listing_drift.map(d => [d.kind, d.normalized_key]),
    [
      ['variant', 'apple:iphone-16:256gb'],
      ['size_not_stated', 'apple:iphone-16:unknown'],
    ]
  );
  assert.deepEqual(report.slug_collisions, [
    {
      kind: 'two_items',
      slugs: ['apple-iphone-16'],
      items: ['apple:iphone-16', 'apple:iphone-16-x'],
    },
    {
      kind: 'item_slug_differs',
      slugs: ['apple-iphone-16', 'apple-iphone-16-vn'],
      items: ['apple:iphone-16'],
    },
    {
      kind: 'item_slug_differs',
      slugs: ['oppo-find-x8', 'oppo-find-x8-128gb'],
      items: ['oppo:find-x8'],
    },
    { kind: 'still_sized', slugs: ['oppo-find-x8-128gb'], items: ['oppo:find-x8'] },
  ]);
  assert.deepEqual(
    report.storage_mismatch.map(r => r.model_key),
    ['oppo:find-x8:256gb']
  );
  assert.equal(report.multi_sku_listings.length, 1);

  console.log('item-inventory-report tests passed');
}

run();
