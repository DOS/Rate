import assert from 'node:assert/strict';
import { isPlainListing } from '../catalog-listing';

console.warn('🧪 Catalogue plain-listing suite');

// Category, sort and page window only: cached (DOS/Rate#495).
assert.equal(isPlainListing({}), true);
assert.equal(
  isPlainListing({
    categorySlug: 'smartphones',
    sort: 'price_asc',
    limit: 201,
    offset: 400,
    brands: undefined,
    search: undefined,
  }),
  true
);

// Any filter, free-form or not, keeps the read uncached.
for (const filter of [
  { search: 'iphone' },
  { brands: ['Apple'] },
  { minPrice: 1_000_000 },
  { maxPrice: 9_000_000 },
  { minRating: 4 },
  { ramGb: [8] },
  { storageGb: [256] },
  { has5g: true },
  { hasNfc: true },
  { minBatteryMah: 5000 },
  { minRefreshRateHz: 120 },
  { minFastChargingW: 45 },
  { maxScreenSizeInch: 6.2 },
]) {
  assert.equal(
    isPlainListing({ categorySlug: 'smartphones', ...filter }),
    false,
    JSON.stringify(filter)
  );
}

console.warn('✅ Catalogue plain-listing suite passed');
