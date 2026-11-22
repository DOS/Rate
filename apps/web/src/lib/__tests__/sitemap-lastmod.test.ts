import assert from 'node:assert/strict';
import type { MasterProduct } from '@repo/shared-data';
import {
  buildSitemapLastModified,
  newestOf,
  rowLastModified,
  versusLastModified,
} from '../sitemap-lastmod';

const CAT_SMARTPHONES = 'c0000000-0000-4000-8000-000000000001';
const CAT_TABLETS = 'c0000000-0000-4000-8000-000000000002';
const CAT_LAPTOPS = 'c0000000-0000-4000-8000-000000000003';
const CAT_SMARTWATCHES = 'c0000000-0000-4000-8000-000000000004';
const CAT_EARBUDS = 'c0000000-0000-4000-8000-000000000005';

function makeCatalogProduct(overrides: {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: string;
  categorySlug: string;
  minPrice: number;
  ratingScore: number;
  expertRating: number;
  updatedAt?: string;
}): MasterProduct {
  return {
    id: overrides.id,
    slug: overrides.slug,
    name: overrides.name,
    brand: overrides.brand,
    model: overrides.name,
    model_key: `${overrides.brand.toLowerCase()}:${overrides.slug}`,
    variant_name: '256GB',
    category_id: overrides.categoryId,
    status: 'published',
    storage_gb: 256,
    ram_gb: 12,
    min_price: overrides.minPrice,
    max_price: overrides.minPrice,
    merchant_count: 4,
    rating_score: overrides.ratingScore,
    user_rating_weighted: overrides.ratingScore,
    average_rating: overrides.ratingScore,
    expert_rating: overrides.expertRating,
    authentic_review_count: 20,
    total_reviews: 24,
    images: [],
    thumbnail: null,
    key_specs: {},
    metadata: { category_slug: overrides.categorySlug },
    specifications: {
      category_slug: overrides.categorySlug,
    } as MasterProduct['specifications'],
    ...(overrides.updatedAt ? { updated_at: overrides.updatedAt } : {}),
  } as unknown as MasterProduct;
}

async function main() {
  console.warn('🧪 Sitemap lastmod & 1v1 versus guards suite');

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

  // DOS/Rate#850: Reject Unix epoch placeholders (< 2020-01-01) and far-future timestamps (> now + 24h)
  assert.equal(rowLastModified('1970-01-01T00:00:00Z'), undefined);
  assert.equal(rowLastModified('2099-01-01T00:00:00Z'), undefined);
  const cleanedDates = buildSitemapLastModified([
    {
      slug: '  iphone-16\u0000 ',
      categorySlug: ' smartphones\r\n ',
      updatedAt: '2026-10-05T00:00:00Z',
    },
    {
      slug: '   ',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-06T00:00:00Z',
    },
  ]);
  assert.equal(cleanedDates.bySlug.has('iphone-16'), true);
  assert.equal(
    cleanedDates.byCategory.get('smartphones')?.toISOString(),
    '2026-10-05T00:00:00.000Z'
  );

  // DOS/Rate#1822: Keep newer timestamp on duplicate slugs, resolve case-insensitively,
  // and resolve across canonical Item slugs + fallback variant slugs.
  const overlongItemSlug = `apple-ipad-pro-${'x'.repeat(115)}`;
  assert.ok(overlongItemSlug.length > 120 && overlongItemSlug.length <= 256);
  const itemAndFallbackDates = buildSitemapLastModified([
    {
      slug: 'Apple-iPhone-16',
      fallbackSlugs: ['apple-iphone-16-128gb', 'apple-iphone-16-256gb'],
      categorySlug: 'smartphones',
      updatedAt: '2026-10-12T00:00:00Z',
    },
    {
      slug: 'Apple-iPhone-16',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-02T00:00:00Z',
    },
    {
      slug: overlongItemSlug,
      fallbackSlugs: ['ipad-pro-m4-256gb', 'ipad-pro-m4-512gb'],
      categorySlug: 'tablets',
      updatedAt: '2026-10-14T00:00:00Z',
    },
    {
      slug: 'constructor',
      fallbackSlugs: ['safe-fallback-variant'],
      categorySlug: 'tablets',
      updatedAt: '2026-10-15T00:00:00Z',
    },
    {
      slug: 'samsung-galaxy-s25-ultra',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-10T00:00:00Z',
    },
  ]);

  assert.equal(
    itemAndFallbackDates.bySlug.get('Apple-iPhone-16')?.toISOString(),
    '2026-10-12T00:00:00.000Z',
    'older duplicate row must not overwrite a newer slug timestamp'
  );
  assert.equal(
    versusLastModified(
      itemAndFallbackDates,
      'apple-iphone-16',
      'samsung-galaxy-s25-ultra'
    )?.toISOString(),
    '2026-10-12T00:00:00.000Z',
    'versusLastModified matches canonical Item slugs case-insensitively'
  );
  assert.equal(
    versusLastModified(
      itemAndFallbackDates,
      'ipad-pro-m4-256gb',
      'samsung-galaxy-s25-ultra'
    )?.toISOString(),
    '2026-10-14T00:00:00.000Z',
    'versusLastModified resolves fallback variant slug via Item row fallbackSlugs'
  );
  assert.equal(
    versusLastModified(
      itemAndFallbackDates,
      'safe-fallback-variant',
      'samsung-galaxy-s25-ultra'
    )?.toISOString(),
    '2026-10-15T00:00:00.000Z',
    'reserved primary Item slug still preserves timestamp under its clean fallback variant slug'
  );
  const variantOnlyDates = buildSitemapLastModified([
    {
      slug: 'pixel-9-pro-256gb',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-11T00:00:00Z',
    },
  ]);
  assert.equal(
    versusLastModified(
      variantOnlyDates,
      ['google-pixel-9-pro', 'pixel-9-pro-256gb'],
      'missing-peer'
    )?.toISOString(),
    '2026-10-11T00:00:00.000Z',
    'versusLastModified resolves candidate slug arrays across canonical and fallback slugs'
  );

  // Reject >256-char slugs rather than truncating prefixes (prevents prefix collisions)
  // while still preserving each Item's timestamp via its own fallbackSlugs.
  const shared256Prefix = `item-${'p'.repeat(251)}`;
  assert.equal(shared256Prefix.length, 256);
  const over256ItemA = `${shared256Prefix}-alpha`;
  const over256ItemB = `${shared256Prefix}-bravo`;
  const over256Dates = buildSitemapLastModified([
    {
      slug: over256ItemA,
      fallbackSlugs: ['prefix-item-a-256gb'],
      categorySlug: 'smartphones',
      updatedAt: '2026-10-04T00:00:00Z',
    },
    {
      slug: over256ItemB,
      fallbackSlugs: ['prefix-item-b-256gb'],
      categorySlug: 'smartphones',
      updatedAt: '2026-10-18T00:00:00Z',
    },
  ]);
  assert.equal(
    versusLastModified(
      over256Dates,
      ['prefix-item-a-256gb', over256ItemA],
      'missing-peer'
    )?.toISOString(),
    '2026-10-04T00:00:00.000Z',
    '>256-char Item slugs sharing a 256-char prefix must not bleed timestamps across items'
  );
  assert.equal(
    versusLastModified(
      over256Dates,
      ['prefix-item-b-256gb', over256ItemB],
      'missing-peer'
    )?.toISOString(),
    '2026-10-18T00:00:00.000Z'
  );

  // Mutations to dates.bySlug (same-size update or delete) are reflected immediately.
  const mutableDates = buildSitemapLastModified([
    {
      slug: 'Mutable-Phone',
      categorySlug: 'smartphones',
      updatedAt: '2026-10-03T00:00:00Z',
    },
  ]);
  mutableDates.bySlug.set('Mutable-Phone', new Date('2026-10-19T00:00:00Z'));
  assert.equal(
    versusLastModified(mutableDates, 'mutable-phone', 'missing')?.toISOString(),
    '2026-10-19T00:00:00.000Z',
    'in-place bySlug update must refresh case-insensitive lookup cache'
  );
  mutableDates.bySlug.delete('Mutable-Phone');
  assert.equal(
    versusLastModified(mutableDates, 'mutable-phone', 'missing'),
    undefined,
    'deleting from bySlug must not retain stale cached entries'
  );

  // DOS/Rate#1822: End-to-end sitemap() integration across RATE_ITEM_MODEL on & off.
  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevItemModel = process.env.RATE_ITEM_MODEL;
  const prevFetch = globalThis.fetch;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

    const nodeModule = await import('node:module');
    const extMap = (
      nodeModule.default as unknown as {
        _extensions?: Record<string, (mod: { exports: unknown }) => void>;
      }
    )._extensions;
    if (extMap && !extMap['.css']) {
      extMap['.css'] = (mod) => {
        mod.exports = {};
      };
    }

    const { resetRateClientForTests } = await import('../rate-api');
    const { canonicalVersusOrder, planVersusRoute, versusAliasRedirect } =
      await import('../item-compare');
    const { parseVersusSlugs } =
      await import('../../app/[locale]/compare/[versus]/page');
    const { sanitizeCachedProductSlug } = await import('../../server/rate');
    resetRateClientForTests();

    const ITEM_IPHONE = '11111111-1111-4111-8111-111111111822';
    const ITEM_GALAXY = '22222222-2222-4222-8222-222222221822';
    const ITEM_XIAOMI = '33333333-3333-4333-8333-333333331822';
    const ITEM_BAD_VS = '44444444-4444-4444-8444-444444441822';
    const ITEM_OVERLONG_IPAD = '55555555-5555-4555-8555-555555551822';
    const ITEM_GALAXY_TAB = '66666666-6666-4666-8666-666666661822';
    const ITEM_ALPHA_VS_END = '77777777-7777-4777-8777-777777771822';
    const ITEM_BETA_VS_END = '88888888-8888-4888-8888-888888881822';
    const ITEM_ZETA_LAPTOP = '99999999-9999-4999-8999-999999991822';
    const ITEM_WATCH_ULTRA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1822';
    const ITEM_GARMIN_FENIX = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1822';
    const ITEM_WATCH_FOO = 'cccccccc-cccc-4ccc-8ccc-cccccccc1822';

    const catalogProducts: MasterProduct[] = [
      // Smartphones: top 3 raw variants ALL belong to the SAME Item (iPhone 16 Pro Max),
      // plus an Item whose stored slug holds "-VS-", followed by Galaxy S25 Ultra (2 variants),
      // Xiaomi 15 Ultra, and an unlinked Pixel 9 Pro.
      makeCatalogProduct({
        id: 'mp-bad-vs-item',
        slug: 'caseco-flagship-256gb',
        name: 'Case VS Cover Flagship',
        brand: 'CaseCo',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 20_000_000,
        ratingScore: 5.0,
        expertRating: 9.8,
        updatedAt: '2026-10-10T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-iphone-256',
        slug: 'apple-iphone-16-pro-max-256gb',
        name: 'Apple iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 29_990_000,
        ratingScore: 4.9,
        expertRating: 9.6,
        updatedAt: '2026-10-08T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-iphone-512',
        slug: 'apple-iphone-16-pro-max-512gb',
        name: 'Apple iPhone 16 Pro Max 512GB',
        brand: 'Apple',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 34_990_000,
        ratingScore: 4.9,
        expertRating: 9.6,
        updatedAt: '2026-10-16T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-iphone-1tb',
        slug: 'apple-iphone-16-pro-max-1tb',
        name: 'Apple iPhone 16 Pro Max 1TB',
        brand: 'Apple',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 40_990_000,
        ratingScore: 4.9,
        expertRating: 9.6,
        updatedAt: '2026-10-12T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-galaxy-256',
        slug: 'samsung-galaxy-s25-ultra-256gb',
        name: 'Samsung Galaxy S25 Ultra 256GB',
        brand: 'Samsung',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 27_990_000,
        ratingScore: 4.8,
        expertRating: 9.4,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-galaxy-512',
        slug: 'samsung-galaxy-s25-ultra-512gb',
        name: 'Samsung Galaxy S25 Ultra 512GB',
        brand: 'Samsung',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 31_990_000,
        ratingScore: 4.8,
        expertRating: 9.4,
        updatedAt: '2026-10-13T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-xiaomi-512',
        slug: 'xiaomi-15-ultra-512gb',
        name: 'Xiaomi 15 Ultra 512GB',
        brand: 'Xiaomi',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 24_990_000,
        ratingScore: 4.7,
        expertRating: 9.2,
        updatedAt: '2026-10-09T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-pixel-unlinked',
        slug: 'google-pixel-9-pro-256gb',
        name: 'Google Pixel 9 Pro 256GB',
        brand: 'Google',
        categoryId: CAT_SMARTPHONES,
        categorySlug: 'smartphones',
        minPrice: 22_990_000,
        ratingScore: 4.6,
        expertRating: 9.0,
        updatedAt: '2026-10-07T00:00:00Z',
      }),

      // Tablets: overlong Item slug (>120 chars) where #1 variant has an unusable
      // mixed-case slug ('Ipad-Pro-M4-BadCase'), #2 variant ('ipad-pro-m4-256gb')
      // recovers cleanly as the Item representative, and #3 ('ipad-pro-m4-512gb')
      // is deduplicated; plus a raw "-vs-" variant slug.
      makeCatalogProduct({
        id: 'mp-raw-vs-tablet',
        slug: 'tab-case-vs-cover-256gb',
        name: 'Tab Case VS Cover',
        brand: 'CaseCo',
        categoryId: CAT_TABLETS,
        categorySlug: 'tablets',
        minPrice: 15_000_000,
        ratingScore: 5.0,
        expertRating: 9.7,
        updatedAt: '2026-10-10T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-ipad-badcase',
        slug: 'Ipad-Pro-M4-BadCase',
        name: 'iPad Pro M4 BadCase',
        brand: 'Apple',
        categoryId: CAT_TABLETS,
        categorySlug: 'tablets',
        minPrice: 24_990_000,
        ratingScore: 4.95,
        expertRating: 9.6,
        updatedAt: '2026-10-05T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-ipad-256',
        slug: 'ipad-pro-m4-256gb',
        name: 'iPad Pro M4 256GB',
        brand: 'Apple',
        categoryId: CAT_TABLETS,
        categorySlug: 'tablets',
        minPrice: 26_990_000,
        ratingScore: 4.9,
        expertRating: 9.5,
        updatedAt: '2026-10-06T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-ipad-512',
        slug: 'ipad-pro-m4-512gb',
        name: 'iPad Pro M4 512GB',
        brand: 'Apple',
        categoryId: CAT_TABLETS,
        categorySlug: 'tablets',
        minPrice: 31_990_000,
        ratingScore: 4.9,
        expertRating: 9.5,
        updatedAt: '2026-10-17T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-tab-s10',
        slug: 'samsung-galaxy-tab-s10-ultra-256gb',
        name: 'Samsung Galaxy Tab S10 Ultra 256GB',
        brand: 'Samsung',
        categoryId: CAT_TABLETS,
        categorySlug: 'tablets',
        minPrice: 25_990_000,
        ratingScore: 4.8,
        expertRating: 9.3,
        updatedAt: '2026-10-11T00:00:00Z',
      }),

      // Laptops: two trailing "-vs" slugs (mixed-case Item 'Alpha-Book-VS' backed by
      // lowercase master 'alpha-book-vs', plus 'beta-book-vs') and normal 'zeta-ultrabook'.
      makeCatalogProduct({
        id: 'mp-laptop-alpha-vs',
        slug: 'alpha-book-vs',
        name: 'Alpha Book VS',
        brand: 'Alpha',
        categoryId: CAT_LAPTOPS,
        categorySlug: 'laptops',
        minPrice: 28_000_000,
        ratingScore: 4.9,
        expertRating: 9.4,
        updatedAt: '2026-10-12T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-laptop-beta-vs',
        slug: 'beta-book-vs',
        name: 'Beta Book VS',
        brand: 'Beta',
        categoryId: CAT_LAPTOPS,
        categorySlug: 'laptops',
        minPrice: 27_000_000,
        ratingScore: 4.8,
        expertRating: 9.2,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-laptop-zeta',
        slug: 'zeta-ultrabook',
        name: 'Zeta Ultrabook',
        brand: 'Zeta',
        categoryId: CAT_LAPTOPS,
        categorySlug: 'laptops',
        minPrice: 26_000_000,
        ratingScore: 4.7,
        expertRating: 9.1,
        updatedAt: '2026-10-10T00:00:00Z',
      }),

      // Smartwatches: exercises cross-category versusSeen deduplication in both
      // Item mode (duplicate Item pair already emitted by smartphones) and variant
      // mode (duplicate variant slugs already emitted by smartphones), plus a
      // mixed-case linked variant 'Foo-Cross-Case' that must NOT bleed onto
      // earbuds' unlinked 'foo-cross-case'.
      makeCatalogProduct({
        id: 'mp-watch-dup-a',
        slug: 'apple-iphone-16-pro-max-256gb',
        name: 'Duplicate Cross-Cat A',
        brand: 'Apple',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 29_990_000,
        ratingScore: 4.95,
        expertRating: 9.7,
        updatedAt: '2026-10-08T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-watch-dup-b',
        slug: 'caseco-flagship-256gb',
        name: 'Duplicate Cross-Cat B',
        brand: 'CaseCo',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 20_000_000,
        ratingScore: 4.94,
        expertRating: 9.7,
        updatedAt: '2026-10-10T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-watch-dup-galaxy',
        slug: 'samsung-galaxy-s25-ultra-256gb',
        name: 'Duplicate Cross-Cat Galaxy',
        brand: 'Samsung',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 27_990_000,
        ratingScore: 4.92,
        expertRating: 9.6,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-watch-foo-upper',
        slug: 'Foo-Cross-Case',
        name: 'Foo Cross Case Watch',
        brand: 'Foo',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 9_990_000,
        ratingScore: 4.91,
        expertRating: 9.5,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-watch-ultra-2',
        slug: 'apple-watch-ultra-2-49mm',
        name: 'Apple Watch Ultra 2',
        brand: 'Apple',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 19_990_000,
        ratingScore: 4.85,
        expertRating: 9.3,
        updatedAt: '2026-10-12T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-watch-garmin',
        slug: 'garmin-fenix-8-47mm',
        name: 'Garmin Fenix 8',
        brand: 'Garmin',
        categoryId: CAT_SMARTWATCHES,
        categorySlug: 'smartwatches',
        minPrice: 24_990_000,
        ratingScore: 4.8,
        expertRating: 9.2,
        updatedAt: '2026-10-10T00:00:00Z',
      }),

      // Earbuds: invalid mixed-case unlinked 'Sony-WF-1000XM5' (#1) must be skipped
      // so valid lowercase 'sony-wf-1000xm5' (#2) emits canonical 200 URLs; unlinked
      // 'foo-cross-case' must NOT inherit smartwatches' 'Foo-Cross-Case' Item.
      makeCatalogProduct({
        id: 'mp-buds-sony-upper',
        slug: 'Sony-WF-1000XM5',
        name: 'Sony WF-1000XM5 Uppercase',
        brand: 'Sony',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 5_990_000,
        ratingScore: 4.95,
        expertRating: 9.5,
        updatedAt: '2026-10-14T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-buds-sony-lower',
        slug: 'sony-wf-1000xm5',
        name: 'Sony WF-1000XM5',
        brand: 'Sony',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 6_190_000,
        ratingScore: 4.9,
        expertRating: 9.4,
        updatedAt: '2026-10-09T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-buds-foo-unlinked',
        slug: 'foo-cross-case',
        name: 'Foo Cross Case Buds',
        brand: 'Foo',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 4_990_000,
        ratingScore: 4.85,
        expertRating: 9.3,
        updatedAt: '2026-10-10T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-buds-airpods',
        slug: 'apple-airpods-pro-2',
        name: 'Apple AirPods Pro 2',
        brand: 'Apple',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 5_490_000,
        ratingScore: 4.8,
        expertRating: 9.2,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
    ];

    const itemRows = [
      { id: ITEM_IPHONE, slug: 'Apple-iPhone-16-Pro-Max' },
      { id: ITEM_GALAXY, slug: 'samsung-galaxy-s25-ultra' },
      { id: ITEM_XIAOMI, slug: 'xiaomi-15-ultra' },
      { id: ITEM_BAD_VS, slug: 'Case-VS-Cover' },
      { id: ITEM_OVERLONG_IPAD, slug: overlongItemSlug },
      { id: ITEM_GALAXY_TAB, slug: 'samsung-galaxy-tab-s10-ultra' },
      { id: ITEM_ALPHA_VS_END, slug: 'Alpha-Book-VS' },
      { id: ITEM_BETA_VS_END, slug: 'beta-book-vs' },
      { id: ITEM_ZETA_LAPTOP, slug: 'zeta-ultrabook' },
      { id: ITEM_WATCH_ULTRA, slug: 'apple-watch-ultra-2' },
      { id: ITEM_GARMIN_FENIX, slug: 'garmin-fenix-8' },
      { id: ITEM_WATCH_FOO, slug: 'unrelated-watch-foo' },
    ];

    const itemLinksBySlug = new Map<string, string | null>([
      ['caseco-flagship-256gb', ITEM_BAD_VS],
      ['apple-iphone-16-pro-max-256gb', ITEM_IPHONE],
      ['apple-iphone-16-pro-max-512gb', ITEM_IPHONE],
      ['apple-iphone-16-pro-max-1tb', ITEM_IPHONE],
      ['samsung-galaxy-s25-ultra-256gb', ITEM_GALAXY],
      ['samsung-galaxy-s25-ultra-512gb', ITEM_GALAXY],
      ['xiaomi-15-ultra-512gb', ITEM_XIAOMI],
      ['google-pixel-9-pro-256gb', null],
      ['tab-case-vs-cover-256gb', null],
      ['Ipad-Pro-M4-BadCase', ITEM_OVERLONG_IPAD],
      ['ipad-pro-m4-256gb', ITEM_OVERLONG_IPAD],
      ['ipad-pro-m4-512gb', ITEM_OVERLONG_IPAD],
      ['samsung-galaxy-tab-s10-ultra-256gb', ITEM_GALAXY_TAB],
      ['alpha-book-vs', ITEM_ALPHA_VS_END],
      ['beta-book-vs', ITEM_BETA_VS_END],
      ['zeta-ultrabook', ITEM_ZETA_LAPTOP],
      ['Foo-Cross-Case', ITEM_WATCH_FOO],
      ['apple-watch-ultra-2-49mm', ITEM_WATCH_ULTRA],
      ['garmin-fenix-8-47mm', ITEM_GARMIN_FENIX],
      ['Sony-WF-1000XM5', null],
      ['sony-wf-1000xm5', null],
      ['foo-cross-case', null],
      ['apple-airpods-pro-2', null],
    ]);

    // Route-level 200 parity verifier matching /compare/[versus]/page.tsx:
    // ensures zero emitted sitemap URLs 308-redirect or 404.
    const validMasterSet = new Set(
      catalogProducts
        .map((p) => p.slug)
        .filter((s) => sanitizeCachedProductSlug(s) === s)
    );
    const itemById = new Map(itemRows.map((i) => [i.id, i]));
    const variantsForItemId = (itemId: string) =>
      catalogProducts
        .filter((p) => itemLinksBySlug.get(p.slug) === itemId)
        .filter((p) => sanitizeCachedProductSlug(p.slug) === p.slug)
        .map((p, idx) => ({
          id: p.id,
          slug: p.slug,
          variant_key: `v${idx}`,
        }));

    const resolveFixtureSide = (rawSlug: string) => {
      const exactItem = itemRows.find((i) => i.slug === rawSlug);
      if (exactItem) {
        const variants = variantsForItemId(exactItem.id);
        return {
          slug: rawSlug,
          resolution: {
            kind: 'item' as const,
            item: {
              id: exactItem.id,
              slug: exactItem.slug,
              default_variant_id: variants[0]?.id ?? null,
            },
            variants,
          },
        };
      }
      const lower = rawSlug.toLowerCase();
      const lowerItem = itemRows.find((i) => i.slug === lower);
      if (lowerItem) {
        const variants = variantsForItemId(lowerItem.id);
        return {
          slug: lower,
          resolution: {
            kind: 'item' as const,
            item: {
              id: lowerItem.id,
              slug: lowerItem.slug,
              default_variant_id: variants[0]?.id ?? null,
            },
            variants,
          },
        };
      }
      const linkedItemId =
        itemLinksBySlug.get(rawSlug) ?? itemLinksBySlug.get(lower) ?? null;
      const linkedItem = linkedItemId ? itemById.get(linkedItemId) : undefined;
      const matchedSlug = itemLinksBySlug.has(rawSlug) ? rawSlug : lower;
      if (linkedItem && validMasterSet.has(matchedSlug)) {
        const variants = variantsForItemId(linkedItem.id);
        const own =
          variants.find((v) => v.slug === matchedSlug) ?? variants[0]!;
        return {
          slug: matchedSlug,
          resolution: {
            kind: 'variant' as const,
            item: {
              id: linkedItem.id,
              slug: linkedItem.slug,
              default_variant_id: variants[0]?.id ?? null,
            },
            variant: own,
            variants,
            retired: false,
          },
        };
      }
      return { slug: rawSlug, resolution: { kind: 'unlinked' as const } };
    };

    const assertEveryCompareUrlRenders200 = (
      urls: readonly string[],
      itemModeOn: boolean,
      label: string
    ) => {
      assert.ok(urls.length > 0, `${label}: expected compare URLs`);
      for (const fullUrl of urls) {
        const parsedUrl = new URL(fullUrl);
        assert.equal(
          parsedUrl.origin,
          'https://rate.vn',
          `${label}: unexpected origin in ${fullUrl}`
        );
        const pathname = parsedUrl.pathname;
        const versus = pathname.replace(/^\/compare\//, '');
        const parsedLower = parseVersusSlugs(versus);
        const parsedTyped = parseVersusSlugs(versus, true);
        assert.ok(
          parsedLower && parsedTyped,
          `${label}: unparseable ${fullUrl}`
        );

        let canonicalPath: string;
        let masterPair: [string, string];
        if (itemModeOn) {
          const plan = planVersusRoute(
            resolveFixtureSide(parsedTyped[0]),
            resolveFixtureSide(parsedTyped[1])
          );
          assert.ok(
            plan.kind === 'render' || plan.kind === 'legacy',
            `${label}: ${fullUrl} resolved to ${plan.kind} instead of render/legacy`
          );
          if (plan.kind === 'render') {
            canonicalPath = plan.canonical;
            masterPair = [plan.slugA, plan.slugB];
          } else {
            const ordered = canonicalVersusOrder(
              parsedLower[0],
              parsedLower[1]
            );
            canonicalPath = `/compare/${ordered.join('-vs-')}`;
            masterPair = ordered;
          }
        } else {
          const ordered = canonicalVersusOrder(parsedLower[0], parsedLower[1]);
          canonicalPath = `/compare/${ordered.join('-vs-')}`;
          masterPair = ordered;
        }

        assert.equal(
          pathname,
          canonicalPath,
          `${label}: ${fullUrl} differs from canonical ${canonicalPath}`
        );
        assert.equal(
          versusAliasRedirect(versus, canonicalPath),
          null,
          `${label}: ${fullUrl} triggers a 308 redirect`
        );
        for (const masterSlug of masterPair) {
          assert.equal(
            sanitizeCachedProductSlug(masterSlug),
            masterSlug,
            `${label}: ${fullUrl} master slug ${masterSlug} fails sanitizeCachedProductSlug`
          );
          assert.ok(
            validMasterSet.has(masterSlug),
            `${label}: ${fullUrl} master slug ${masterSlug} missing from master_products`
          );
        }
      }
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const query = decodeURIComponent(url.search);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/*',
          },
        });

      if (Number(url.searchParams.get('offset') ?? 0) > 0) {
        return json([]);
      }

      if (url.pathname === '/rest/v1/categories') {
        return json([
          { id: CAT_SMARTPHONES, slug: 'smartphones' },
          { id: CAT_TABLETS, slug: 'tablets' },
          { id: CAT_LAPTOPS, slug: 'laptops' },
          { id: CAT_SMARTWATCHES, slug: 'smartwatches' },
          { id: CAT_EARBUDS, slug: 'earbuds' },
        ]);
      }

      if (url.pathname === '/rest/v1/merchants') {
        return json([{ id: 'merchant-1', updated_at: '2026-10-12T00:00:00Z' }]);
      }

      if (url.pathname === '/rest/v1/items') {
        return json(itemRows);
      }

      if (url.pathname === '/rest/v1/rpc/search_master_products') {
        return json(catalogProducts);
      }

      if (url.pathname === '/rest/v1/master_products') {
        if (query.includes('select=slug,item_id')) {
          return json(
            catalogProducts.map((p) => ({
              slug: p.slug,
              item_id: itemLinksBySlug.get(p.slug) ?? null,
            }))
          );
        }
        return json(
          catalogProducts.map((p) => ({
            slug: p.slug,
            name: p.name,
            model: p.model,
            category_id: p.category_id,
            metadata: p.metadata,
            specifications: p.specifications,
            updated_at: p.updated_at ?? null,
          }))
        );
      }

      return json([]);
    }) as typeof fetch;

    const { default: sitemap } = await import('../../app/sitemap');

    // 1. RATE_ITEM_MODEL active ('item' & 'nullable_variant'):
    for (const mode of ['item', 'nullable_variant'] as const) {
      process.env.RATE_ITEM_MODEL = mode;
      const entries = await sitemap();
      const compareEntries = entries.filter((e) =>
        new URL(e.url).pathname.startsWith('/compare/')
      );
      const compareUrls = compareEntries.map((e) => e.url);
      const comparePaths = compareEntries.map((e) => new URL(e.url).pathname);
      const comparePathSet = new Set(comparePaths);

      assertEveryCompareUrlRenders200(compareUrls, true, `[${mode}]`);

      // Smartphones: top 3 raw variants of iPhone 16 Pro Max + Case-VS-Cover Item
      // must NOT starve the 3 distinct Item-vs-Item pairs.
      assert.deepEqual(
        compareUrls.slice(0, 3),
        [
          'https://rate.vn/compare/Apple-iPhone-16-Pro-Max-vs-samsung-galaxy-s25-ultra',
          'https://rate.vn/compare/Apple-iPhone-16-Pro-Max-vs-xiaomi-15-ultra',
          'https://rate.vn/compare/samsung-galaxy-s25-ultra-vs-xiaomi-15-ultra',
        ],
        `[${mode}] smartphones must emit 3 distinct canonical Item-vs-Item URLs via versusHref`
      );
      const iphoneVsGalaxy = compareEntries.find(
        (e) =>
          new URL(e.url).pathname ===
          '/compare/Apple-iPhone-16-Pro-Max-vs-samsung-galaxy-s25-ultra'
      );
      assert.equal(
        (iphoneVsGalaxy?.lastModified as Date | undefined)?.toISOString(),
        '2026-10-16T00:00:00.000Z',
        `[${mode}] Item versus lastModified must reflect newest variant timestamp`
      );

      // Tablets: skips #1 invalid 'Ipad-Pro-M4-BadCase' without poisoning seenItemKeys,
      // falls back to #2 'ipad-pro-m4-256gb' via versusHref, deduplicates #3 'ipad-pro-m4-512gb',
      // skips 'tab-case-vs-cover-256gb', and resolves lastModified (2026-10-17).
      const tabletFallback = compareEntries.find(
        (e) =>
          new URL(e.url).pathname ===
          '/compare/ipad-pro-m4-256gb-vs-samsung-galaxy-tab-s10-ultra'
      );
      assert.ok(
        tabletFallback,
        `[${mode}] overlong Item slug must recover on #2 valid lowercase variant slug`
      );
      assert.equal(
        (tabletFallback.lastModified as Date | undefined)?.toISOString(),
        '2026-10-17T00:00:00.000Z',
        `[${mode}] fallback variant versus URL must still resolve Item newest lastModified`
      );
      assert.ok(
        !comparePaths.some(
          (p) =>
            p.includes('Ipad-Pro-M4-BadCase') || p.includes('ipad-pro-m4-512gb')
        ),
        `[${mode}] invalid #1 and duplicate #3 variants of overlong-slug Item must not emit`
      );

      // Laptops: Alpha-Book-VS vs beta-book-vs (both ending in -vs) excluded;
      // single trailing -vs pairs emit in parseable order (zeta-ultrabook first).
      assert.ok(
        !comparePaths.some(
          (p) =>
            p.toLowerCase().includes('alpha-book-vs') &&
            p.toLowerCase().includes('beta-book-vs')
        ),
        `[${mode}] unparseable pair of two -vs-suffixed slugs must be excluded`
      );
      assert.ok(
        comparePathSet.has('/compare/zeta-ultrabook-vs-Alpha-Book-VS') &&
          comparePathSet.has('/compare/zeta-ultrabook-vs-beta-book-vs'),
        `[${mode}] single trailing -vs Item slug paired with normal slug emits in parseable canonical order`
      );

      // Smartwatches: cross-category duplicate iPhone vs Galaxy pair skipped by versusSeen;
      // valid watch pair still emits.
      assert.equal(
        comparePaths.filter(
          (p) =>
            p.toLowerCase() ===
            '/compare/apple-iphone-16-pro-max-vs-samsung-galaxy-s25-ultra'
        ).length,
        1,
        `[${mode}] cross-category duplicate pairKey must be emitted only once`
      );
      assert.ok(
        comparePathSet.has('/compare/apple-watch-ultra-2-vs-garmin-fenix-8'),
        `[${mode}] smartwatches must still emit valid watch-vs-watch URL after skipping cross-category duplicate`
      );

      // Earbuds: invalid mixed-case unlinked 'Sony-WF-1000XM5' skipped so valid
      // lowercase 'sony-wf-1000xm5' emits; unlinked 'foo-cross-case' never inherits
      // smartwatches' 'Foo-Cross-Case' Item ('unrelated-watch-foo').
      assert.ok(
        !comparePaths.some((p) => p.includes('Sony-WF-1000XM5')) &&
          !comparePaths.some((p) => p.includes('unrelated-watch-foo')),
        `[${mode}] unlinked mixed-case rows must be skipped and unlinked lowercase rows must never cross-link by case`
      );
      assert.ok(
        comparePathSet.has('/compare/apple-airpods-pro-2-vs-sony-wf-1000xm5') &&
          comparePathSet.has('/compare/foo-cross-case-vs-sony-wf-1000xm5'),
        `[${mode}] valid lowercase unlinked earbuds emit canonical 200 versus URLs`
      );

      assert.ok(
        !comparePaths.some(
          (p) =>
            p.toLowerCase().includes('case-vs-cover') ||
            p.toLowerCase().includes('caseco-flagship-256gb')
        ),
        `[${mode}] slugs containing -vs- (any case) and variants of -vs- Items must never appear in sitemap`
      );
      const lowerSet = new Set(compareUrls.map((u) => u.toLowerCase()));
      assert.equal(
        lowerSet.size,
        compareUrls.length,
        `[${mode}] versusSeen must prevent case-insensitive duplicate compare URLs`
      );
    }

    // 2. RATE_ITEM_MODEL off (variant mode):
    delete process.env.RATE_ITEM_MODEL;
    const offEntries = await sitemap();
    const offCompareEntries = offEntries.filter((e) =>
      new URL(e.url).pathname.startsWith('/compare/')
    );
    const offCompareUrls = offCompareEntries.map((e) => e.url);
    const offComparePaths = offCompareEntries.map(
      (e) => new URL(e.url).pathname
    );
    const offComparePathSet = new Set(offComparePaths);

    assertEveryCompareUrlRenders200(offCompareUrls, false, '[flag off]');

    // Variant mode keeps variant-vs-variant pairings for distinct valid lowercase
    // variant slugs, while enforcing -vs-, trailing -vs parseability, exact lowercase
    // master slug validity, and cross-category versusSeen deduplication.
    assert.deepEqual(
      offCompareUrls.slice(0, 3),
      [
        'https://rate.vn/compare/apple-iphone-16-pro-max-256gb-vs-caseco-flagship-256gb',
        'https://rate.vn/compare/apple-iphone-16-pro-max-512gb-vs-caseco-flagship-256gb',
        'https://rate.vn/compare/apple-iphone-16-pro-max-256gb-vs-apple-iphone-16-pro-max-512gb',
      ],
      '[flag off] variant mode pairs distinct variant slugs via versusHref'
    );
    assert.equal(
      offComparePaths.filter(
        (p) =>
          p ===
          '/compare/apple-iphone-16-pro-max-256gb-vs-caseco-flagship-256gb'
      ).length,
      1,
      '[flag off] cross-category duplicate variant pair must be emitted only once via versusSeen'
    );
    assert.ok(
      !offComparePaths.some((p) => p.toLowerCase().includes('case-vs-cover')),
      '[flag off] variant slug containing -vs- must be excluded in variant mode too'
    );
    assert.ok(
      !offComparePaths.some(
        (p) =>
          p.toLowerCase().includes('alpha-book-vs') &&
          p.toLowerCase().includes('beta-book-vs')
      ),
      '[flag off] unparseable trailing -vs pair must be excluded in variant mode too'
    );
    assert.ok(
      offComparePathSet.has('/compare/zeta-ultrabook-vs-alpha-book-vs') &&
        offComparePathSet.has('/compare/zeta-ultrabook-vs-beta-book-vs'),
      '[flag off] single trailing -vs variant slug paired with normal slug emits in parseable lowercase order'
    );
    assert.ok(
      !offComparePaths.some((p) => p.includes('Sony-WF-1000XM5')) &&
        offComparePathSet.has(
          '/compare/apple-airpods-pro-2-vs-sony-wf-1000xm5'
        ),
      '[flag off] mixed-case variant slug is skipped so valid lowercase sibling emits canonical 200 URL'
    );
    const offLowerSet = new Set(offCompareUrls.map((u) => u.toLowerCase()));
    assert.equal(
      offLowerSet.size,
      offCompareUrls.length,
      '[flag off] versusSeen enforces case-insensitive pairKey deduplication in variant mode'
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;
    }
    if (prevSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevSupabaseAnonKey;
    }
    if (prevItemModel === undefined) {
      delete process.env.RATE_ITEM_MODEL;
    } else {
      process.env.RATE_ITEM_MODEL = prevItemModel;
    }
    const { resetRateClientForTests } = await import('../rate-api');
    resetRateClientForTests();
  }

  console.warn('✅ Sitemap lastmod & 1v1 versus guards suite passed');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
