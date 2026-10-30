import assert from 'node:assert/strict';
import {
  buildProductVariantLinks,
  masterSiblingKeyPrefix,
} from '../product-variant-links';

// The product page's variant links with the Item flag off (DOS/Rate#1436).

assert.equal(
  masterSiblingKeyPrefix('apple:iphone-16e:128gb'),
  'apple:iphone-16e:'
);
assert.equal(
  masterSiblingKeyPrefix('apple:watch-series-10-46mm:64gb'),
  'apple:watch-series-10-46mm:'
);
assert.equal(
  masterSiblingKeyPrefix('xiaomi:redmi-note-13-pro-plus:unknown'),
  'xiaomi:redmi-note-13-pro-plus:'
);
// Keys of another shape have no variants to find, and nothing reaches LIKE.
assert.equal(masterSiblingKeyPrefix('apple_iphone_16_pro_max_256gb'), '');
assert.equal(masterSiblingKeyPrefix('apple:iphone-16e'), '');
assert.equal(masterSiblingKeyPrefix('apple:iphone%:128gb'), '');
assert.equal(masterSiblingKeyPrefix('apple:iphone_16:128gb'), '');
assert.equal(masterSiblingKeyPrefix('Apple:iPhone-16e:128gb'), '');
assert.equal(masterSiblingKeyPrefix(null), '');

const row = (
  slug: string,
  modelKey: string,
  minPrice: number | null,
  extra: {
    storage_gb?: number | null;
    variant_name?: string | null;
    name?: string;
  } = {}
) => ({
  slug,
  name: extra.name ?? slug,
  model_key: modelKey,
  min_price: minPrice,
  max_price: minPrice,
  merchant_count: minPrice ? 2 : 0,
  storage_gb: extra.storage_gb ?? null,
  variant_name: extra.variant_name ?? null,
});

const siblings = [
  row('apple-iphone-16e-128gb', 'apple:iphone-16e:128gb', 14_990_000, {
    storage_gb: 128,
  }),
  row('apple-iphone-16e-256gb', 'apple:iphone-16e:256gb', 17_990_000, {
    storage_gb: 256,
  }),
  row('apple-iphone-16e-512gb', 'apple:iphone-16e:512gb', null, {
    storage_gb: 512,
  }),
  row('apple-iphone-16e', 'apple:iphone-16e:unknown', 13_000_000),
];
assert.deepEqual(buildProductVariantLinks('apple-iphone-16e-256gb', siblings), [
  {
    slug: 'apple-iphone-16e-128gb',
    label: '128GB',
    minPrice: 14_990_000,
    current: false,
  },
  {
    slug: 'apple-iphone-16e-256gb',
    label: '256GB',
    minPrice: 17_990_000,
    current: true,
  },
  {
    slug: 'apple-iphone-16e-512gb',
    label: '512GB',
    minPrice: 0,
    current: false,
  },
]);
// The size-less master is offered only on its own page.
assert.equal(
  buildProductVariantLinks('apple-iphone-16e', siblings)?.find((l) => l.current)
    ?.slug,
  'apple-iphone-16e'
);
// No other variant, or the page's own master missing from the read: collapse.
assert.equal(
  buildProductVariantLinks('apple-iphone-16e-128gb', siblings.slice(0, 1)),
  null
);
assert.equal(buildProductVariantLinks('apple-iphone-16e-1tb', siblings), null);
assert.equal(buildProductVariantLinks('x', []), null);
// A stored name wins; 1024 GB reads as 1TB; equal labels fall back to names.
assert.deepEqual(
  buildProductVariantLinks('a-1tb', [
    row('a-1tb', 'apple:ipad-pro-m4-13:1tb', 50_000_000, { storage_gb: 1024 }),
    row('a-blue', 'apple:ipad-pro-m4-13:256gb-blue', 30_000_000, {
      storage_gb: 256,
      name: 'iPad Pro M4 13 256GB Blue',
    }),
    row('a-black', 'apple:ipad-pro-m4-13:256gb-black', 30_000_000, {
      storage_gb: 256,
      name: 'iPad Pro M4 13 256GB Black',
    }),
    row('a-wifi', 'apple:ipad-pro-m4-13:2tb', 60_000_000, {
      variant_name: '2TB Wi-Fi',
    }),
  ])?.map((l) => l.label),
  [
    '1TB',
    'iPad Pro M4 13 256GB Blue',
    'iPad Pro M4 13 256GB Black',
    '2TB Wi-Fi',
  ]
);
// A slug read twice is one link.
assert.equal(
  buildProductVariantLinks('apple-iphone-16e-128gb', [
    siblings[0]!,
    siblings[0]!,
    siblings[1]!,
  ])?.length,
  2
);

console.warn('✅ Product variant links suite passed');
