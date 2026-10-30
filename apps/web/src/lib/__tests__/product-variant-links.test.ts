import assert from 'node:assert/strict';
import {
  buildProductVariantLinks,
  masterSiblingKeyPrefix,
  siblingsInCategory,
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

const PHONES = 'c-phones';
const row = (
  slug: string,
  modelKey: string,
  minPrice: number | null,
  extra: {
    storage_gb?: number | null;
    variant_name?: string | null;
    name?: string;
    category_id?: string;
  } = {}
) => ({
  slug,
  name: extra.name ?? slug,
  category_id: extra.category_id ?? PHONES,
  model_key: modelKey,
  min_price: minPrice,
  max_price: minPrice,
  merchant_count: minPrice ? 2 : 0,
  storage_gb: extra.storage_gb ?? null,
  variant_name: extra.variant_name ?? null,
});

const v128 = row(
  'apple-iphone-16e-128gb',
  'apple:iphone-16e:128gb',
  14_990_000,
  {
    storage_gb: 128,
  }
);
const v256 = row(
  'apple-iphone-16e-256gb',
  'apple:iphone-16e:256gb',
  17_990_000,
  {
    storage_gb: 256,
  }
);
const v512 = row('apple-iphone-16e-512gb', 'apple:iphone-16e:512gb', null, {
  storage_gb: 512,
});
const vUnknown = row(
  'apple-iphone-16e',
  'apple:iphone-16e:unknown',
  13_000_000
);
const siblings = [v128, v256, v512, vUnknown];

assert.deepEqual(buildProductVariantLinks(v256, siblings), [
  { slug: v128.slug, label: '128GB', minPrice: 14_990_000, current: false },
  { slug: v256.slug, label: '256GB', minPrice: 17_990_000, current: true },
  { slug: v512.slug, label: '512GB', minPrice: 0, current: false },
]);
// The size-less master is offered only on its own page, last, with no label
// of its own: the page names it ("size not stated"), never "unknown".
assert.deepEqual(
  buildProductVariantLinks(vUnknown, siblings)?.map((l) => [
    l.label,
    l.current,
  ]),
  [
    ['128GB', false],
    ['256GB', false],
    ['512GB', false],
    [null, true],
  ]
);
// No other variant: the area collapses.
assert.equal(buildProductVariantLinks(v128, [v128]), null);
assert.equal(buildProductVariantLinks(v128, []), null);
assert.equal(buildProductVariantLinks(v128, [vUnknown]), null);
// The page's own master counts even when the bounded read left it out, and
// takes its place in the storage order.
assert.deepEqual(
  buildProductVariantLinks(v256, [v512, v128])?.map((l) => l.slug),
  [v128.slug, v256.slug, v512.slug]
);
// A stored name wins; 1024 GB reads as 1TB; equal labels fall back to names.
const tb = row('a-1tb', 'apple:ipad-pro-m4-13:1tb', 50_000_000, {
  storage_gb: 1024,
});
assert.deepEqual(
  buildProductVariantLinks(tb, [
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
    'iPad Pro M4 13 256GB Black',
    'iPad Pro M4 13 256GB Blue',
    '1TB',
    '2TB Wi-Fi',
  ]
);
// A slug read twice is one link.
assert.equal(buildProductVariantLinks(v128, [v128, v128, v256])?.length, 2);

// Siblings are kept only in the page's category, resolved as the route
// resolves it: the category id first, then the stored hints, so a sibling
// with no category id is placed by its hint, not dropped or mislinked.
const bySlug = new Map([
  ['c-phones', 'smartphones'],
  ['c-tablets', 'tablets'],
]);
const sib = (
  slug: string,
  category_id: string | null,
  hint: string | null
) => ({
  slug,
  category_id,
  metadata: hint ? { category_slug: hint } : null,
});
assert.deepEqual(
  siblingsInCategory(
    [
      sib('phone-by-id', 'c-phones', null),
      sib('tablet-by-id', 'c-tablets', null),
      sib('phone-by-hint', null, 'smartphones'),
      sib('tablet-by-hint', null, 'tablets'),
    ],
    'smartphones',
    bySlug
  ).map((row) => row.slug),
  ['phone-by-id', 'phone-by-hint']
);

console.warn('✅ Product variant links suite passed');
