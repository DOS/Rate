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
const CAT_EARBUDS = 'c0000000-0000-4000-8000-000000000004';

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

  // DOS/Rate#1822: End-to-end sitemap() integration across RATE_ITEM_MODEL on & off.
  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevItemModel = process.env.RATE_ITEM_MODEL;
  const prevFetch = globalThis.fetch;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

    const { resetRateClientForTests } = await import('../rate-api');
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

      // Tablets: overlong Item slug (>120 chars) with two variants + valid peer Item
      // + raw variant containing "-vs-" (must be rejected in variant mode too).
      makeCatalogProduct({
        id: 'mp-raw-vs-tablet',
        slug: 'tab-Case-VS-Cover-256gb',
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

      // Laptops: two trailing "-vs" slugs (unparseable together in either order)
      // plus one normal slug (parseable when ordered first).
      makeCatalogProduct({
        id: 'mp-laptop-alpha-vs',
        slug: 'Alpha-Book-VS',
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

      // Earbuds: case-colliding duplicate slugs ('Sony-WF-1000XM5' vs 'sony-wf-1000xm5')
      // plus AirPods Pro 2 -> must never emit Sony vs sony, only AirPods vs Sony once.
      makeCatalogProduct({
        id: 'mp-buds-sony-upper',
        slug: 'Sony-WF-1000XM5',
        name: 'Sony WF-1000XM5',
        brand: 'Sony',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 5_990_000,
        ratingScore: 4.9,
        expertRating: 9.4,
        updatedAt: '2026-10-14T00:00:00Z',
      }),
      makeCatalogProduct({
        id: 'mp-buds-sony-lower',
        slug: 'sony-wf-1000xm5',
        name: 'Sony WF-1000XM5 Duplicate',
        brand: 'Sony',
        categoryId: CAT_EARBUDS,
        categorySlug: 'earbuds',
        minPrice: 6_190_000,
        ratingScore: 4.85,
        expertRating: 9.3,
        updatedAt: '2026-10-09T00:00:00Z',
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
      ['tab-Case-VS-Cover-256gb', null],
      ['ipad-pro-m4-256gb', ITEM_OVERLONG_IPAD],
      ['ipad-pro-m4-512gb', ITEM_OVERLONG_IPAD],
      ['samsung-galaxy-tab-s10-ultra-256gb', ITEM_GALAXY_TAB],
      ['Alpha-Book-VS', ITEM_ALPHA_VS_END],
      ['beta-book-vs', ITEM_BETA_VS_END],
      ['zeta-ultrabook', ITEM_ZETA_LAPTOP],
      ['Sony-WF-1000XM5', null],
      ['sony-wf-1000xm5', null],
      ['apple-airpods-pro-2', null],
    ]);

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
      const compareEntries = entries.filter((e) => e.url.includes('/compare/'));
      const compareUrls = compareEntries.map((e) => e.url);

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
      // Newest variant of iPhone 16 Pro Max is 512GB (2026-10-16), newer than S25 Ultra 512GB (2026-10-13).
      const iphoneVsGalaxy = compareEntries.find(
        (e) =>
          e.url ===
          'https://rate.vn/compare/Apple-iPhone-16-Pro-Max-vs-samsung-galaxy-s25-ultra'
      );
      assert.equal(
        (iphoneVsGalaxy?.lastModified as Date | undefined)?.toISOString(),
        '2026-10-16T00:00:00.000Z',
        `[${mode}] Item versus lastModified must reflect newest variant timestamp`
      );

      // Tablets: overlong Item slug falls back to ipad-pro-m4-256gb via versusHref,
      // deduplicates ipad-pro-m4-512gb (same Item), skips tab-Case-VS-Cover-256gb,
      // and still resolves lastModified (2026-10-17 from 512GB variant on Item row).
      const tabletFallback = compareEntries.find(
        (e) =>
          e.url ===
          'https://rate.vn/compare/ipad-pro-m4-256gb-vs-samsung-galaxy-tab-s10-ultra'
      );
      assert.ok(
        tabletFallback,
        `[${mode}] overlong Item slug must fall back cleanly to variant slug via versusHref`
      );
      assert.equal(
        (tabletFallback.lastModified as Date | undefined)?.toISOString(),
        '2026-10-17T00:00:00.000Z',
        `[${mode}] fallback variant versus URL must still resolve Item newest lastModified`
      );
      assert.ok(
        !compareUrls.some((u) => u.includes('ipad-pro-m4-512gb')),
        `[${mode}] second variant of overlong-slug Item must be deduplicated`
      );

      // Laptops: Alpha-Book-VS vs beta-book-vs (both ending in -vs) excluded;
      // single trailing -vs pairs emit in parseable order (zeta-ultrabook first).
      assert.ok(
        !compareUrls.some(
          (u) =>
            u.toLowerCase().includes('alpha-book-vs') &&
            u.toLowerCase().includes('beta-book-vs')
        ),
        `[${mode}] unparseable pair of two -vs-suffixed slugs must be excluded`
      );
      assert.ok(
        compareUrls.includes(
          'https://rate.vn/compare/zeta-ultrabook-vs-Alpha-Book-VS'
        ) &&
          compareUrls.includes(
            'https://rate.vn/compare/zeta-ultrabook-vs-beta-book-vs'
          ),
        `[${mode}] single trailing -vs slug paired with normal slug emits in parseable canonical order`
      );

      // Earbuds & global guards: no "-vs-" side slugs, no case-colliding self-pairs, no duplicates.
      assert.ok(
        !compareUrls.some(
          (u) =>
            u.toLowerCase().includes('case-vs-cover') ||
            u.toLowerCase().includes('caseco-flagship-256gb')
        ),
        `[${mode}] slugs containing -vs- (any case) and variants of -vs- Items must never appear in sitemap`
      );
      assert.ok(
        !compareUrls.some((u) =>
          u.toLowerCase().includes('sony-wf-1000xm5-vs-sony-wf-1000xm5')
        ),
        `[${mode}] case-colliding duplicate slugs must not self-pair`
      );
      assert.ok(
        compareUrls.includes(
          'https://rate.vn/compare/apple-airpods-pro-2-vs-Sony-WF-1000XM5'
        )
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
      e.url.includes('/compare/')
    );
    const offCompareUrls = offCompareEntries.map((e) => e.url);

    // Variant mode keeps variant-vs-variant pairings for distinct variant slugs,
    // while STILL enforcing -vs-, trailing -vs parseability, and case-insensitive pairKey guards!
    assert.deepEqual(
      offCompareUrls.slice(0, 3),
      [
        'https://rate.vn/compare/apple-iphone-16-pro-max-256gb-vs-caseco-flagship-256gb',
        'https://rate.vn/compare/apple-iphone-16-pro-max-512gb-vs-caseco-flagship-256gb',
        'https://rate.vn/compare/apple-iphone-16-pro-max-256gb-vs-apple-iphone-16-pro-max-512gb',
      ],
      '[flag off] variant mode pairs distinct variant slugs via versusHref'
    );
    assert.ok(
      !offCompareUrls.some((u) => u.toLowerCase().includes('case-vs-cover')),
      '[flag off] variant slug containing -VS- must be excluded in variant mode too'
    );
    assert.ok(
      !offCompareUrls.some(
        (u) =>
          u.toLowerCase().includes('alpha-book-vs') &&
          u.toLowerCase().includes('beta-book-vs')
      ),
      '[flag off] unparseable trailing -vs pair must be excluded in variant mode too'
    );
    assert.ok(
      offCompareUrls.includes(
        'https://rate.vn/compare/zeta-ultrabook-vs-Alpha-Book-VS'
      ) &&
        offCompareUrls.includes(
          'https://rate.vn/compare/zeta-ultrabook-vs-beta-book-vs'
        ),
      '[flag off] single trailing -vs slug paired with normal slug still emits in variant mode'
    );
    assert.ok(
      !offCompareUrls.some((u) =>
        u.toLowerCase().includes('sony-wf-1000xm5-vs-sony-wf-1000xm5')
      ),
      '[flag off] case-colliding duplicate variant slugs must be excluded in variant mode too'
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
