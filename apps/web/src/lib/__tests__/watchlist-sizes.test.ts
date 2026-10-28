import assert from 'node:assert/strict';
import { isSizeRequiredAnswer, watchlistSizeChoices } from '../watchlist-sizes';

// The watchlist asks for a size when an entry names a whole Item
// (DOS/Rate#1278).

function main() {
  console.warn('🧪 watchlist sizes suite (DOS/Rate#1278)');
  const gb = (n: number) => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);

  assert.deepEqual(
    watchlistSizeChoices(
      [
        {
          slug: 'apple-iphone-16-128gb',
          name: 'Apple iPhone 16 128GB',
          variant_key: '128gb',
          storage_gb: 128,
          min_price: 19_990_000,
        },
        {
          slug: 'apple-iphone-16-1024gb',
          name: 'Apple iPhone 16 1TB',
          variant_key: '1024gb',
          storage_gb: 1024,
          min_price: 0,
        },
        // Same label as the first: one choice per label.
        {
          slug: 'apple-iphone-16-128gb-cellular',
          name: 'x',
          variant_key: '128gb-cellular',
          storage_gb: 128,
          min_price: 1,
        },
        // A sizeless variant reads its key; a bad slug is dropped.
        {
          slug: 'buds-standard',
          name: '',
          variant_key: 'standard',
          storage_gb: null,
          min_price: 3_000_000,
        },
        { slug: 'bad slug', variant_key: '256gb', storage_gb: 256 },
      ],
      gb
    ),
    [
      {
        slug: 'apple-iphone-16-128gb',
        name: 'Apple iPhone 16 128GB',
        label: '128GB',
        minPrice: 19_990_000,
      },
      {
        slug: 'apple-iphone-16-1024gb',
        name: 'Apple iPhone 16 1TB',
        label: '1TB',
        minPrice: 0,
      },
      {
        slug: 'buds-standard',
        name: 'buds-standard',
        label: 'standard',
        minPrice: 3_000_000,
      },
    ]
  );
  assert.deepEqual(watchlistSizeChoices(null, gb), []);
  assert.deepEqual(watchlistSizeChoices({ slug: 'x' }, gb), []);

  assert.equal(isSizeRequiredAnswer(422, { code: 'SIZE_REQUIRED' }), true);
  assert.equal(isSizeRequiredAnswer(422, { code: 'VALIDATION' }), false);
  assert.equal(isSizeRequiredAnswer(400, { code: 'SIZE_REQUIRED' }), false);
  assert.equal(isSizeRequiredAnswer(422, null), false);

  console.warn('  ✅ watchlist sizes suite passed');
}

main();
