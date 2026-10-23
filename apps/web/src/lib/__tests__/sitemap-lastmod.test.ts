import assert from 'node:assert/strict';
import {
  buildSitemapLastModified,
  newestOf,
  rowLastModified,
  versusLastModified,
} from '../sitemap-lastmod';

function main() {
  console.warn('🧪 Sitemap lastmod suite');

  const dates = buildSitemapLastModified([
    {
      slug: 'a',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      slug: 'b',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-05T00:00:00Z',
    },
    { slug: 'c', categorySlug: 'earbuds', updatedAt: '2026-10-03T00:00:00Z' },
    { slug: 'd', categorySlug: 'earbuds', updatedAt: null },
    { slug: 'e', categorySlug: 'tablets', updatedAt: 'not a date' },
  ]);

  // The newest change overall and per category (DOS/Rate#786).
  assert.equal(dates.latest?.toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(
    dates.byCategory.get('smartphones')?.toISOString(),
    '2026-10-05T00:00:00.000Z'
  );
  assert.equal(
    dates.byCategory.get('earbuds')?.toISOString(),
    '2026-10-03T00:00:00.000Z'
  );
  // A category whose rows have no usable date gets none.
  assert.equal(dates.byCategory.has('tablets'), false);
  assert.equal(dates.bySlug.has('d'), false);

  // A versus page takes the newer of its two products, or the one it has.
  assert.equal(
    versusLastModified(dates, 'a', 'c')?.toISOString(),
    '2026-10-03T00:00:00.000Z'
  );
  assert.equal(
    versusLastModified(dates, 'd', 'a')?.toISOString(),
    '2026-10-01T00:00:00.000Z'
  );
  assert.equal(versusLastModified(dates, 'd', 'e'), undefined);

  // Rows without a date carry none instead of the render time.
  assert.equal(rowLastModified(null), undefined);
  assert.equal(rowLastModified(''), undefined);
  assert.equal(rowLastModified('garbage'), undefined);
  assert.equal(
    rowLastModified('2026-10-02T00:00:00Z')?.toISOString(),
    '2026-10-02T00:00:00.000Z'
  );

  // An empty catalogue has no latest date.
  assert.equal(buildSitemapLastModified([]).latest, undefined);

  // The merchant directory takes the newest of the catalogue and its stores.
  assert.equal(
    newestOf(
      dates.latest,
      rowLastModified('2026-10-09T00:00:00Z'),
      undefined
    )?.toISOString(),
    '2026-10-09T00:00:00.000Z'
  );
  assert.equal(
    newestOf(dates.latest, undefined)?.toISOString(),
    '2026-10-05T00:00:00.000Z'
  );
  assert.equal(newestOf(), undefined);

  console.warn('✅ Sitemap lastmod suite passed');
}

main();
