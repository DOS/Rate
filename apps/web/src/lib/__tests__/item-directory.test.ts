import assert from 'node:assert/strict';
import type { MasterProduct } from '@repo/shared-data';
import {
  catalogRowSlug,
  countBrandsByItem,
  groupRowsByItem,
  itemSizeChips,
  sitemapRowsByItem,
  type ItemLinkInput,
} from '../item-directory';

// One card, one leaderboard slot, one brand count and one sitemap URL per
// Item (DOS/Rate#1155).

const row = (
  id: string,
  slug: string,
  minPrice: number,
  maxPrice = minPrice,
  extra: Partial<MasterProduct> = {}
): MasterProduct =>
  ({
    id,
    slug,
    name: slug,
    brand: 'Apple',
    min_price: minPrice,
    max_price: maxPrice,
    merchant_count: 1,
    ...extra,
  }) as MasterProduct;

function main() {
  console.warn('🧪 item directory suite (DOS/Rate#1155)');

  const iphone: ItemLinkInput = {
    item: {
      id: 'item-15',
      slug: 'apple-iphone-15',
      name: 'Apple iPhone 15',
      merchant_count: 7,
    },
    variants: [
      { variant_key: '128gb', storage_gb: 128, min_price: 18_000_000 },
      { variant_key: '256gb', storage_gb: 256, min_price: 21_000_000 },
    ],
  };
  const links = new Map<string, ItemLinkInput>([
    ['m-128', iphone],
    ['m-256', iphone],
  ]);

  // Ranked order kept: the Item sits where its best variant ranked.
  const grouped = groupRowsByItem(
    [
      row('m-256', 'apple-iphone-15-256gb', 21_000_000, 23_000_000),
      row('m-other', 'samsung-galaxy-s24', 19_000_000),
      row('m-128', 'apple-iphone-15-128gb', 18_000_000, 19_500_000),
    ],
    links
  );
  assert.deepEqual(
    grouped.map((r) => r.id),
    ['m-256', 'm-other'],
    'one row per Item, at its best-ranked variant'
  );
  const card = grouped[0]!;
  assert.equal(card.name, 'Apple iPhone 15');
  assert.equal(card.slug, 'apple-iphone-15-256gb', 'radar keys stay variant');
  assert.equal(card.item_slug, 'apple-iphone-15');
  assert.equal(card.min_price, 18_000_000, 'from price over its variants');
  assert.equal(card.max_price, 23_000_000);
  assert.equal(card.merchant_count, 7, 'Item merchants, all listings');
  assert.equal(catalogRowSlug(card), 'apple-iphone-15');
  assert.equal(catalogRowSlug(grouped[1]!), 'samsung-galaxy-s24');
  assert.equal(grouped[1]!.item_slug, undefined, 'no Item: row unchanged');

  // A variant with no price does not zero the Item's "from" price.
  const unpriced = groupRowsByItem(
    [row('m-128', 'a', 0), row('m-256', 'b', 21_000_000)],
    links
  );
  assert.equal(unpriced[0]!.min_price, 21_000_000);

  // No links (flag off or unlinked masters): rows as they were.
  const plain = [row('x', 'x', 1), row('y', 'y', 2)];
  assert.deepEqual(groupRowsByItem(plain, new Map()), plain);

  // Size chips: sized variants only, and only when there is a choice.
  assert.deepEqual(
    itemSizeChips(card, '/smartphones/apple-iphone-15', (gb) => `${gb}GB`),
    [
      { label: '128GB', href: '/smartphones/apple-iphone-15?v=128gb' },
      { label: '256GB', href: '/smartphones/apple-iphone-15?v=256gb' },
    ]
  );
  assert.deepEqual(
    itemSizeChips(
      { ...card, item_variants: [card.item_variants![0]!] },
      '/x',
      String
    ),
    []
  );
  assert.deepEqual(
    itemSizeChips(
      {
        ...card,
        item_variants: [
          { variant_key: 'unknown', storage_gb: null, min_price: 0 },
          { variant_key: 'standard', storage_gb: null, min_price: 0 },
        ],
      },
      '/x',
      String
    ),
    [],
    'earbuds and other sizeless Items get no chips'
  );
  assert.deepEqual(itemSizeChips(grouped[1]!, '/x', String), []);

  // Brand facets: one count per Item, not per variant.
  assert.deepEqual(
    countBrandsByItem([
      { brand: 'apple', key: 'item:15' },
      { brand: 'Apple', key: 'item:15' },
      { brand: 'Apple', key: 'item:16' },
      { brand: 'Samsung', key: 'master:s24' },
      { brand: ' ', key: 'master:blank' },
    ]),
    [
      { name: 'Apple', count: 2 },
      { name: 'Samsung', count: 1 },
    ]
  );

  // Sitemap: one Item URL, dated by its newest variant.
  const slugs = new Map([
    ['apple-iphone-15-128gb', 'apple-iphone-15'],
    ['apple-iphone-15-256gb', 'apple-iphone-15'],
  ]);
  assert.deepEqual(
    sitemapRowsByItem(
      [
        { slug: 'apple-iphone-15-128gb', updated_at: '2026-10-01T00:00:00Z' },
        { slug: 'galaxy-s24', updated_at: '2026-10-02T00:00:00Z' },
        { slug: 'apple-iphone-15-256gb', updated_at: '2026-10-05T00:00:00Z' },
      ],
      slugs
    ),
    [
      { slug: 'apple-iphone-15', updated_at: '2026-10-05T00:00:00Z' },
      { slug: 'galaxy-s24', updated_at: '2026-10-02T00:00:00Z' },
    ]
  );

  console.warn('  ✅ item directory suite passed');
}

main();
