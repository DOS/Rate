import assert from 'node:assert/strict';
import {
  buildInventoryReport,
  itemNameOf,
  itemSlugOf,
  type InventoryMaster,
} from '../jobs/item-inventory-report.js';

const master = (
  id: string,
  model_key: string,
  slug: string,
  name: string,
  category_id = 'phones',
  storage_gb: number | null = Number(/:(\d+)gb$/.exec(model_key)?.[1] ?? NaN) || null
): InventoryMaster => ({
  id,
  model_key,
  slug,
  name,
  brand: name.split(' ')[0]!,
  status: 'published',
  category_id,
  storage_gb,
});

function run() {
  assert.equal(itemSlugOf('asus-zenbook-s-14-1tb'), 'asus-zenbook-s-14');
  assert.equal(itemSlugOf('sony-wf-1000xm6'), 'sony-wf-1000xm6');
  assert.equal(itemNameOf('Apple iPhone 16 128GB'), 'Apple iPhone 16');

  const report = buildInventoryReport({
    categories: [
      { id: 'phones', slug: 'smartphones' },
      { id: 'buds', slug: 'earbuds' },
    ],
    masters: [
      master('a', 'apple:iphone-16:128gb', 'apple-iphone-16-128gb', 'Apple iPhone 16 128GB'),
      master('b', 'apple:iphone-16:256gb', 'apple-iphone-16-256gb', 'Apple iPhone 16 256GB'),
      // Another Item whose variant slug is iPhone 16's Item slug.
      master('c', 'apple:iphone-16-x:64gb', 'apple-iphone-16', 'Apple iPhone 16 X 64GB'),
      master(
        'd',
        'samsung:galaxy-buds3-pro:64gb',
        'samsung-galaxy-buds3-pro',
        'Samsung Galaxy Buds3 Pro',
        'buds',
        64
      ),
      master('e', 'khc:legacy', 'legacy', 'Legacy'),
    ],
    listings: [
      {
        id: 'p1',
        cluster_id: 'a',
        title: 'Apple iPhone 16 256GB',
        platform: 'tgdd',
        platform_item_id: '1',
        price_min: 1,
        price_max: 1,
      },
      {
        id: 'p2',
        cluster_id: null,
        title: 'x',
        platform: 'tgdd',
        platform_item_id: '2',
        price_min: 1,
        price_max: 2,
      },
    ],
    seeds: [],
  });

  assert.equal(report.counts.total, 5);
  assert.equal(report.counts.khc_keys, 1);
  assert.equal(report.counts.bad_shape, 1);
  assert.equal(report.counts.multi_variant_items, 1);
  assert.equal(report.counts.listings_without_master, 1);
  assert.deepEqual(report.legacy_keys, [{ model_key: 'khc:legacy', status: 'published' }]);
  assert.deepEqual(
    report.sizeless_with_size.map(r => r.model_key),
    ['samsung:galaxy-buds3-pro:64gb']
  );
  assert.ok(report.master_drift.some(d => d.normalized_key === 'samsung:galaxy-buds3-pro:unknown'));
  assert.deepEqual(
    report.listing_drift.map(d => [d.kind, d.normalized_key]),
    [['variant', 'apple:iphone-16:256gb']]
  );
  assert.deepEqual(report.slug_collisions, [
    { slug: 'apple-iphone-16', kind: 'two_items', items: ['apple:iphone-16', 'apple:iphone-16-x'] },
    {
      slug: 'apple-iphone-16',
      kind: 'item_slug_is_other_variant',
      items: ['apple:iphone-16', 'apple:iphone-16-x'],
    },
  ]);
  assert.equal(report.multi_sku_listings.length, 1);

  console.log('item-inventory-report tests passed');
}

run();
