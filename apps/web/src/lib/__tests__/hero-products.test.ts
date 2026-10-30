import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MasterProduct } from '@repo/shared-data';
import { withoutSpecSheet } from '../hero-products';

// A catalog row for a client list keeps what cards and links read and drops
// the spec sheet and long texts (DOS/Rate#1353).
const fullRow = {
  id: 'p-1353',
  slug: 'apple-iphone-16-128gb',
  name: 'Apple iPhone 16 128GB',
  min_price: 19_990_000,
  user_rating_weighted: 4.8,
  expert_rating: 9.1,
  metadata: { category_slug: 'smartphones' },
  specifications: {
    category_slug: 'smartphones',
    display: { refresh_rate_hz: 60 },
  },
  spec_provenance: { display: 'registry' },
  expert_review_summary: 'A long expert text',
  description: 'A long description',
} as unknown as MasterProduct;
const slimRow = withoutSpecSheet(fullRow) as MasterProduct &
  Record<string, unknown>;
assert.deepEqual(slimRow.specifications, { category_slug: 'smartphones' });
assert.deepEqual(slimRow.spec_provenance, {});
assert.equal(slimRow.expert_review_summary, null);
assert.equal(slimRow.description, null);
assert.equal(slimRow.min_price, 19_990_000);
assert.equal(slimRow.user_rating_weighted, 4.8);
assert.equal(slimRow.expert_rating, 9.1);
assert.deepEqual(slimRow.metadata, { category_slug: 'smartphones' });
assert.notEqual(slimRow, fullRow, 'the input row is not changed');
assert.equal(
  (fullRow.specifications as { display?: unknown }).display !== undefined,
  true
);

// The category and watchlist pages hand their client lists slim rows.
const page = (route: string) =>
  readFileSync(
    new URL(`../../app/[locale]/${route}/page.tsx`, import.meta.url),
    'utf8'
  );
assert.ok(page('watchlist').includes('catalogProducts.map(withoutSpecSheet)'));
assert.ok(page('smartphones').includes('products.map(withoutSpecSheet)'));

console.log('hero-products: withoutSpecSheet passed');
