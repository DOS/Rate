/**
 * Directory, leaderboard, facets, stats and sitemap per Item behind
 * RATE_ITEM_MODEL (DOS/Rate#1155), against a stubbed PostgREST shaped like
 * the M1+M2 draft (PR #1242).
 */
import assert from 'node:assert/strict';
import type { MasterProduct } from '@repo/shared-data';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const ITEM = '11111111-1111-4111-8111-111111111155';
const DRAFT_ITEM = '11111111-1111-4111-8111-111111111156';
const LAPTOP_ITEM = '11111111-1111-4111-8111-111111111157';
const V128 = '22222222-2222-4222-8222-222222222128';
const V256 = '22222222-2222-4222-8222-222222222256';
const LAPTOP_V256 = '22222222-2222-4222-8222-222222222777';
const LAPTOP_RETIRED = '22222222-2222-4222-8222-222222222778';
const LONE = '22222222-2222-4222-8222-222222222999';
const CATEGORY = '55555555-5555-4555-8555-555555555555';
const LAPTOP_CATEGORY = '55555555-5555-4555-8555-555555555556';

const itemRow = {
  id: ITEM,
  item_key: 'apple:iphone-16',
  slug: 'apple-iphone-16',
  name: 'Apple iPhone 16',
  brand: 'Apple',
  model: 'iPhone 16',
  category_id: CATEGORY,
  default_variant_id: V128,
  min_price: 21990000,
  max_price: 25990000,
  price_variant_count: 2,
  merchant_count: 5,
  listing_count: 6,
  unknown_variant_listing_count: 1,
  updated_at: '2026-10-29T00:00:00Z',
};
const laptopItemRow = {
  id: LAPTOP_ITEM,
  item_key: 'apple:macbook-air-m4',
  slug: 'apple-macbook-air-m4',
  name: 'Apple MacBook Air M4',
  brand: 'Apple',
  model: 'MacBook Air M4',
  category_id: LAPTOP_CATEGORY,
  default_variant_id: LAPTOP_V256,
  min_price: 26990000,
  max_price: 28990000,
  price_variant_count: 1,
  merchant_count: 3,
  listing_count: 3,
  unknown_variant_listing_count: 0,
  updated_at: '2026-10-29T00:00:00Z',
};
const variantRow = (id: string, gb: number) => ({
  id,
  item_id: ITEM,
  slug: `apple-iphone-16-${gb}gb`,
  name: `Apple iPhone 16 ${gb}GB`,
  variant_key: `${gb}gb`,
  variant_name: `${gb}GB`,
  sort_order: null,
  storage_gb: gb,
  min_price: gb === 128 ? 21990000 : 24990000,
  max_price: gb === 128 ? 23990000 : 25990000,
  merchant_count: 2,
});
const laptopVariantRow = {
  id: LAPTOP_V256,
  item_id: LAPTOP_ITEM,
  slug: 'apple-macbook-air-m4-256gb',
  name: 'Apple MacBook Air M4 256GB',
  variant_key: '256gb',
  variant_name: '256GB',
  sort_order: null,
  storage_gb: 256,
  min_price: 26990000,
  max_price: 28990000,
  merchant_count: 3,
};
const watchlistMasterRow = (params: {
  id: string;
  item_id: string | null;
  slug: string;
  name: string;
  brand: string;
  category_id: string;
  category_slug: string;
  variant_key: string | null;
  storage_gb: number | null;
  status: 'published' | 'archived';
  min_price: number;
  max_price: number;
}) => ({
  id: params.id,
  item_id: params.item_id,
  slug: params.slug,
  name: params.name,
  brand: params.brand,
  model: params.name,
  category_id: params.category_id,
  status: params.status,
  variant_key: params.variant_key,
  variant_name: params.storage_gb ? `${params.storage_gb}GB` : null,
  sort_order: null,
  storage_gb: params.storage_gb,
  min_price: params.min_price,
  max_price: params.max_price,
  merchant_count: 2,
  metadata: { category_slug: params.category_slug },
  specifications: { category_slug: params.category_slug },
  key_specs: {},
});
const WATCHLIST_MASTERS = [
  watchlistMasterRow({
    id: V128,
    item_id: ITEM,
    slug: 'apple-iphone-16-128gb',
    name: 'Apple iPhone 16 128GB',
    brand: 'Apple',
    category_id: CATEGORY,
    category_slug: 'smartphones',
    variant_key: '128gb',
    storage_gb: 128,
    status: 'published',
    min_price: 21990000,
    max_price: 23990000,
  }),
  watchlistMasterRow({
    id: V256,
    item_id: ITEM,
    slug: 'apple-iphone-16-256gb',
    name: 'Apple iPhone 16 256GB',
    brand: 'Apple',
    category_id: CATEGORY,
    category_slug: 'smartphones',
    variant_key: '256gb',
    storage_gb: 256,
    status: 'published',
    min_price: 24990000,
    max_price: 25990000,
  }),
  watchlistMasterRow({
    id: LAPTOP_V256,
    item_id: LAPTOP_ITEM,
    slug: 'apple-macbook-air-m4-256gb',
    name: 'Apple MacBook Air M4 256GB',
    brand: 'Apple',
    category_id: LAPTOP_CATEGORY,
    category_slug: 'laptops',
    variant_key: '256gb',
    storage_gb: 256,
    status: 'published',
    min_price: 26990000,
    max_price: 28990000,
  }),
  watchlistMasterRow({
    id: LAPTOP_RETIRED,
    item_id: LAPTOP_ITEM,
    slug: 'apple-macbook-air-m4-unknown',
    name: 'Apple MacBook Air M4',
    brand: 'Apple',
    category_id: LAPTOP_CATEGORY,
    category_slug: 'laptops',
    variant_key: 'unknown',
    storage_gb: null,
    status: 'archived',
    min_price: 26990000,
    max_price: 28990000,
  }),
  watchlistMasterRow({
    id: LONE,
    item_id: null,
    slug: 'samsung-galaxy-s24',
    name: 'Samsung Galaxy S24',
    brand: 'Samsung',
    category_id: CATEGORY,
    category_slug: 'smartphones',
    variant_key: null,
    storage_gb: 256,
    status: 'published',
    min_price: 19000000,
    max_price: 20000000,
  }),
];

let calls: string[] = [];
let schemaMissing = false;
let itemsDown = false;
let watchlistRouteTest = false;
let searchRpcBodies: unknown[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  const q = decodeURIComponent(url.search);
  calls.push(`${url.pathname}?${q}`);
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(init?.method === 'HEAD' ? null : JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-range': '0-0/*',
        ...headers,
      },
    });
  if (Number(url.searchParams.get('offset') ?? 0) > 0) return json([]);
  if (itemsDown && url.pathname === '/rest/v1/items') {
    return new Response(
      JSON.stringify({ code: '57014', message: 'canceling statement' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  if (
    schemaMissing &&
    (url.pathname === '/rest/v1/items' || q.includes('item_id'))
  ) {
    return new Response(
      JSON.stringify({ code: 'PGRST205', message: 'no rate.items' }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    );
  }
  switch (url.pathname) {
    case '/rest/v1/categories':
      return json([
        { id: CATEGORY, slug: 'smartphones' },
        { id: LAPTOP_CATEGORY, slug: 'laptops' },
      ]);
    case '/rest/v1/rpc/search_master_products': {
      let body: unknown = null;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      searchRpcBodies.push(body);
      return json(WATCHLIST_MASTERS.filter((m) => m.status === 'published'));
    }
    case '/rest/v1/items':
      if (init?.method === 'HEAD') return json([], { 'content-range': '*/3' });
      if (watchlistRouteTest) {
        if (
          /slug=eq\.apple-iphone-16(&|$)/.test(q) ||
          q.includes(`id=eq.${ITEM}`)
        ) {
          return json([itemRow]);
        }
        if (
          /slug=eq\.apple-macbook-air-m4(&|$)/.test(q) ||
          q.includes(`id=eq.${LAPTOP_ITEM}`)
        ) {
          return json([laptopItemRow]);
        }
        return json([]);
      }
      if (q.includes('select=id,slug')) {
        return json([{ id: ITEM, slug: 'apple-iphone-16' }]);
      }
      if (q.includes('select=id&')) return json([{ id: ITEM }]);
      return json([itemRow]);
    case '/rest/v1/master_products':
      if (watchlistRouteTest) {
        if (q.includes(`item_id=eq.${LAPTOP_ITEM}`)) {
          return json([laptopVariantRow]);
        }
        if (q.includes('item_id=in.') || q.includes(`item_id=eq.${ITEM}`)) {
          return json([variantRow(V256, 256), variantRow(V128, 128)]);
        }
        const slugFilter = url.searchParams.get('slug');
        if (slugFilter?.startsWith('eq.')) {
          const wantedSlug = slugFilter.slice(3);
          const onlyPublished =
            url.searchParams.get('status') === 'eq.published';
          const hit = WATCHLIST_MASTERS.find(
            (m) =>
              m.slug === wantedSlug &&
              (!onlyPublished || m.status === 'published')
          );
          return json(hit ? [hit] : []);
        }
      }
      if (q.includes('select=id,item_id&')) {
        return json([
          { id: V128, item_id: ITEM },
          { id: V256, item_id: ITEM },
          { id: LONE, item_id: null },
        ]);
      }
      if (q.includes('select=slug,item_id')) {
        return json([
          { slug: 'apple-iphone-16-128gb', item_id: ITEM },
          { slug: 'apple-iphone-16-256gb', item_id: ITEM },
          { slug: 'samsung-galaxy-s24', item_id: null },
          { slug: 'pixel-10', item_id: DRAFT_ITEM },
        ]);
      }
      if (q.includes('select=id,brand,item_id')) {
        return json([
          { id: V128, brand: 'Apple', item_id: ITEM },
          { id: V256, brand: 'Apple', item_id: ITEM },
          { id: LONE, brand: 'Samsung', item_id: null },
          // Its Item is a draft: the master counts as itself.
          { id: 'draft-variant', brand: 'Google', item_id: DRAFT_ITEM },
        ]);
      }
      if (q.includes('item_id=in.') || q.includes(`item_id=eq.${ITEM}`)) {
        return json([variantRow(V256, 256), variantRow(V128, 128)]);
      }
      return json([]);
    default:
      return json([]);
  }
}) as typeof fetch;

const row = (id: string, slug: string, min: number): MasterProduct =>
  ({
    id,
    slug,
    name: slug,
    brand: 'Apple',
    min_price: min,
    max_price: min,
    merchant_count: 1,
  }) as MasterProduct;

async function main() {
  console.warn('🧪 Item directory server suite (DOS/Rate#1155)');
  const dir = await import('../item-directory');
  const api = await import('../../../lib/rate-api');

  const rows = [
    row(V256, 'apple-iphone-16-256gb', 24990000),
    row(LONE, 'samsung-galaxy-s24', 19000000),
    row(V128, 'apple-iphone-16-128gb', 21990000),
  ];

  // Flag off: rows as they were, no page, and nothing reads the Item tables.
  delete process.env.RATE_ITEM_MODEL;
  calls = [];
  assert.equal(await dir.groupCatalogRowsByItem(rows), rows);
  assert.equal(
    await dir.getItemCatalogPage(async () => rows, 0, 10),
    null,
    'flag off: the caller reads its variants as before'
  );
  assert.equal(await dir.getItemBrandFacets(CATEGORY, 'smartphones'), null);
  assert.equal(await dir.getItemCount(), null);
  assert.equal(await dir.getItemSlugByVariantSlug(), null);
  assert.equal(await dir.getItemSlugsFor(['apple-iphone-16-128gb']), null);
  assert.deepEqual(calls, [], 'flag off: no database read');

  // Flag on: one row per Item, pages cut after grouping.
  process.env.RATE_ITEM_MODEL = 'item';
  const grouped = await dir.groupCatalogRowsByItem(rows);
  assert.deepEqual(
    grouped.map((r) => [r.id, r.item_slug ?? null]),
    [
      [V128, 'apple-iphone-16'],
      [LONE, null],
    ]
  );
  assert.equal(grouped[0]!.min_price, 21990000);
  assert.deepEqual(
    grouped[0]!.item_variants!.map((v) => v.variant_key),
    ['128gb', '256gb']
  );
  const page2 = await dir.getItemCatalogPage(
    async (offset) => (offset === 0 ? rows : []),
    1,
    5
  );
  assert.deepEqual(
    page2!.map((r) => r.id),
    [LONE],
    'offset counts Items, not variants'
  );

  // Past 500 variants the read continues in batches, so no Item falls off
  // the last page (Codex review): 600 lone variants, 2 batches, page 2.
  const many = Array.from({ length: 600 }, (_, i) =>
    row(`lone-${i}`, `lone-${i}`, 1000 + i)
  );
  const batches: number[] = [];
  const tail = await dir.getItemCatalogPage(
    async (offset, limit) => {
      batches.push(offset);
      return many.slice(offset, offset + limit);
    },
    580,
    30
  );
  assert.deepEqual(batches, [0, 500]);
  assert.equal(tail!.length, 20);
  assert.equal(tail!.at(-1)!.id, 'lone-599');

  // In-app versus links: only the slugs asked for, mapped to Items (#1290).
  assert.deepEqual(
    await dir.getItemSlugsFor(['apple-iphone-16-256gb', 'samsung-galaxy-s24']),
    {
      'apple-iphone-16-256gb': 'apple-iphone-16',
      'samsung-galaxy-s24': 'samsung-galaxy-s24',
    }
  );

  // Past the read cap the caller shows its variant listing (#1290).
  assert.equal(
    await dir.getItemCatalogPage(
      async (_offset, limit) =>
        Array.from({ length: limit }, (_, i) => row(`x-${i}`, `x-${i}`, 1)),
      0,
      10
    ),
    null
  );

  // Brand facets in Items; a master of a draft Item counts as itself.
  assert.deepEqual(await api.getCategoryItemBrandFacets(CATEGORY), [
    { name: 'Apple', count: 1 },
    { name: 'Google', count: 1 },
    { name: 'Samsung', count: 1 },
  ]);
  assert.equal(await api.countPublishedItems(), 3);
  const slugs = await api.getItemSlugByVariantSlug();
  assert.equal(slugs.get('apple-iphone-16-256gb'), 'apple-iphone-16');
  assert.equal(slugs.has('samsung-galaxy-s24'), false);
  assert.equal(slugs.has('pixel-10'), false, 'draft Items are not listed');

  // Flag on, Item tables missing (M1+M2 not applied): variants as before.
  schemaMissing = true;
  assert.equal(await dir.groupCatalogRowsByItem(rows), rows);
  // The variants already read are the page, ungrouped (#1275).
  assert.deepEqual(
    (await dir.getItemCatalogPage(async () => rows, 0, 10))?.map((r) => r.id),
    rows.map((r) => r.id)
  );
  assert.equal(await dir.getItemBrandFacets(CATEGORY, 'smartphones'), null);
  assert.equal(await dir.getItemCount(), null);
  schemaMissing = false;

  // Flag on, an Item read failing for another reason: variants too, never a
  // failed page (review round 1).
  itemsDown = true;
  // The catalogue page cuts the variants it read instead of reading them
  // again when the Item links fail (#1275).
  let catalogueReads = 0;
  assert.deepEqual(
    (
      await dir.getItemCatalogPage(
        async () => {
          catalogueReads += 1;
          return rows;
        },
        0,
        2
      )
    )?.map((r) => r.id),
    [V256, LONE]
  );
  assert.equal(catalogueReads, 1);
  assert.equal(await dir.groupCatalogRowsByItem(rows), rows);
  assert.equal(await dir.getItemCount(), null);
  itemsDown = false;
  delete process.env.RATE_ITEM_MODEL;

  // Compare, versus and watchlist per Item (DOS/Rate#1156).
  const cmp = await import('../item-compare');
  calls = [];
  assert.equal(await cmp.resolveCompareSlugs(['apple-iphone-16']), null);
  assert.equal(await cmp.resolveVersusPlan('a', 'b'), null);
  assert.equal(await cmp.resolveWatchlistSlug('apple-iphone-16'), null);
  assert.deepEqual(calls, [], 'flag off: no database read');
  process.env.RATE_ITEM_MODEL = 'item';
  assert.deepEqual(
    await cmp.resolveCompareSlugs(['apple-iphone-16@128gb']),
    ['apple-iphone-16-128gb'],
    'a pinned size compares that size'
  );
  assert.deepEqual(await cmp.resolveWatchlistSlug('apple-iphone-16'), {
    variantSlug: 'apple-iphone-16-128gb',
    itemSlug: 'apple-iphone-16',
    sizeRequired: true,
  });
  // An Item sharing its slug with one of its sizes watches that size
  // (review round 1): the stub answers every Item slug with the Item.
  assert.deepEqual(await cmp.resolveWatchlistSlug('apple-iphone-16-128gb'), {
    variantSlug: 'apple-iphone-16-128gb',
    itemSlug: 'apple-iphone-16',
    sizeRequired: false,
  });
  itemsDown = true;
  assert.equal(
    await cmp.resolveCompareSlugs(['apple-iphone-16']),
    null,
    'a failing Item read compares the slugs as sent'
  );
  itemsDown = false;
  delete process.env.RATE_ITEM_MODEL;

  // Watchlist API canonical Item product_href & /watchlist cached catalog read (DOS/Rate#1829).
  const { NextRequest } = await import('next/server');
  const watchlistRoute =
    await import('../../../app/api/v1/rate/watchlist/route');
  const {
    RATE_CACHE_TAGS,
    canonicalizeCacheParams,
    getCachedMasterProducts,
    resolveRevalidationTargets,
  } = await import('../index');
  const { loadWatchlistCatalogProducts } =
    await import('../../../app/[locale]/watchlist/page');
  watchlistRouteTest = true;
  try {
    // 1. Flag off: no Item read; variant and unlinked slugs emit their own master href.
    delete process.env.RATE_ITEM_MODEL;
    calls = [];
    const offWatchRes = await watchlistRoute.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/watchlist?slugs=apple-iphone-16,apple-iphone-16-256gb,apple-macbook-air-m4-256gb,samsung-galaxy-s24'
      )
    );
    assert.equal(offWatchRes.status, 200);
    assert.ok(
      !calls.some((c) => c.startsWith('/rest/v1/items')),
      'flag off watchlist GET must not query rate.items'
    );
    const offWatchBody = await offWatchRes.json();
    assert.equal(offWatchBody.ok, true);
    assert.equal(offWatchBody.count, 3);
    assert.equal('apple-iphone-16' in offWatchBody.items, false);
    assert.equal(
      offWatchBody.items['apple-iphone-16-256gb']?.product_href,
      '/smartphones/apple-iphone-16-256gb'
    );
    assert.equal(
      offWatchBody.items['apple-macbook-air-m4-256gb']?.product_href,
      '/laptops/apple-macbook-air-m4-256gb'
    );
    assert.equal(
      offWatchBody.items['samsung-galaxy-s24']?.product_href,
      '/smartphones/samsung-galaxy-s24'
    );

    // 2. Flag on (`item` and `nullable_variant`): resolveWatchlistSlug exposes itemSlug,
    // and GET /api/v1/rate/watchlist emits canonical `/<category>/<item-slug>` with no `?v=`.
    for (const mode of ['item', 'nullable_variant'] as const) {
      process.env.RATE_ITEM_MODEL = mode;

      assert.deepEqual(
        await cmp.resolveWatchlistSlug('apple-macbook-air-m4-256gb'),
        {
          variantSlug: 'apple-macbook-air-m4-256gb',
          itemSlug: 'apple-macbook-air-m4',
          sizeRequired: false,
        }
      );
      assert.deepEqual(
        await cmp.resolveWatchlistSlug('APPLE-MACBOOK-AIR-M4-256GB'),
        {
          variantSlug: 'apple-macbook-air-m4-256gb',
          itemSlug: 'apple-macbook-air-m4',
          sizeRequired: false,
        }
      );
      assert.deepEqual(
        await cmp.resolveWatchlistSlug('apple-macbook-air-m4-unknown'),
        {
          variantSlug: 'apple-macbook-air-m4-256gb',
          itemSlug: 'apple-macbook-air-m4',
          sizeRequired: true,
        }
      );
      assert.equal(await cmp.resolveWatchlistSlug('samsung-galaxy-s24'), null);

      const onWatchRes = await watchlistRoute.GET(
        new NextRequest(
          'http://localhost/api/v1/rate/watchlist?slugs=apple-iphone-16,apple-iphone-16-256gb,apple-macbook-air-m4-256gb,samsung-galaxy-s24'
        )
      );
      assert.equal(onWatchRes.status, 200);
      const onWatchBody = await onWatchRes.json();
      assert.equal(onWatchBody.ok, true);
      assert.equal(onWatchBody.count, 4);

      const iphoneItemEntry = onWatchBody.items['apple-iphone-16'];
      assert.equal(iphoneItemEntry?.slug, 'apple-iphone-16-128gb');
      assert.equal(
        iphoneItemEntry?.product_href,
        '/smartphones/apple-iphone-16'
      );
      assert.equal(iphoneItemEntry?.size_required, true);

      const iphoneVariantEntry = onWatchBody.items['apple-iphone-16-256gb'];
      assert.equal(iphoneVariantEntry?.slug, 'apple-iphone-16-256gb');
      assert.equal(
        iphoneVariantEntry?.product_href,
        '/smartphones/apple-iphone-16'
      );
      assert.equal('size_required' in iphoneVariantEntry, false);

      const laptopVariantEntry =
        onWatchBody.items['apple-macbook-air-m4-256gb'];
      assert.equal(laptopVariantEntry?.slug, 'apple-macbook-air-m4-256gb');
      assert.equal(
        laptopVariantEntry?.product_href,
        '/laptops/apple-macbook-air-m4'
      );
      assert.equal('size_required' in laptopVariantEntry, false);

      const unlinkedEntry = onWatchBody.items['samsung-galaxy-s24'];
      assert.equal(unlinkedEntry?.slug, 'samsung-galaxy-s24');
      assert.equal(
        unlinkedEntry?.product_href,
        '/smartphones/samsung-galaxy-s24'
      );
      assert.equal('size_required' in unlinkedEntry, false);

      for (const entry of Object.values(onWatchBody.items) as Array<{
        product_href: string;
      }>) {
        assert.match(entry.product_href, /^\/[a-z]+\/[^/?#\s]+$/);
        assert.equal(entry.product_href.includes('?v='), false);
      }
    }

    // 3. Flag on, Item schema missing or failing: falls back cleanly to variant hrefs.
    process.env.RATE_ITEM_MODEL = 'item';
    schemaMissing = true;
    const missingWatchRes = await watchlistRoute.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/watchlist?slugs=apple-iphone-16-256gb'
      )
    );
    assert.equal(missingWatchRes.status, 200);
    assert.equal(
      (await missingWatchRes.json()).items['apple-iphone-16-256gb']
        ?.product_href,
      '/smartphones/apple-iphone-16-256gb'
    );
    schemaMissing = false;

    itemsDown = true;
    const downWatchRes = await watchlistRoute.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/watchlist?slugs=apple-iphone-16-256gb'
      )
    );
    assert.equal(downWatchRes.status, 200);
    assert.equal(
      (await downWatchRes.json()).items['apple-iphone-16-256gb']?.product_href,
      '/smartphones/apple-iphone-16-256gb'
    );
    itemsDown = false;

    // 4. /watchlist catalog loading uses getCachedMasterProducts({ categorySlug: 'all', limit: 100 }).
    const capturedWatchlistArgs: unknown[] = [];
    await loadWatchlistCatalogProducts(async (params) => {
      capturedWatchlistArgs.push(params);
      return [];
    });
    assert.deepEqual(capturedWatchlistArgs, [
      { categorySlug: 'all', limit: 100 },
    ]);

    searchRpcBodies = [];
    const watchlistCatalogRows = await loadWatchlistCatalogProducts();
    const directCachedRows = await getCachedMasterProducts({
      categorySlug: 'all',
      limit: 100,
    });
    assert.equal(searchRpcBodies.length, 2);
    assert.deepEqual(searchRpcBodies[0], {
      p_sort: 'default',
      p_limit: 100,
      p_offset: 0,
    });
    assert.deepEqual(searchRpcBodies[0], searchRpcBodies[1]);
    assert.deepEqual(watchlistCatalogRows, directCachedRows);
    assert.equal(
      canonicalizeCacheParams({ categorySlug: 'all', limit: 100 }),
      '{"categorySlug":"all","limit":100}'
    );
    assert.ok(
      resolveRevalidationTargets({
        slugs: ['apple-iphone-16-128gb'],
      }).tags.includes(RATE_CACHE_TAGS.PRODUCTS)
    );
  } finally {
    watchlistRouteTest = false;
    schemaMissing = false;
    itemsDown = false;
    delete process.env.RATE_ITEM_MODEL;
  }

  // The cached pages this touches keep their cache mode: the leaderboard
  // stays ISR, and nothing here reads request-time APIs.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const leaderboard = fs.readFileSync(
    path.resolve(__dirname, '../../../app/[locale]/leaderboard/page.tsx'),
    'utf8'
  );
  assert.match(leaderboard, /export const revalidate = 60;/);
  const versus = fs.readFileSync(
    path.resolve(__dirname, '../../../app/[locale]/compare/[versus]/page.tsx'),
    'utf8'
  );
  assert.match(versus, /export const revalidate = 60;/);
  assert.doesNotMatch(versus, /searchParams|force-dynamic/);
  assert.doesNotMatch(leaderboard, /force-dynamic/);
  // The home page and the [locale] layout stay ISR: no request-time API and no
  // dynamic opt-in, so the proxy's per-request CSP nonce never turns them
  // dynamic (DOS/Rate#1323). The category pages read searchParams and render
  // per request on purpose (#491), so their HTML carries the current nonce;
  // a change to either mode must be deliberate.
  const appPage = (rel: string) =>
    fs.readFileSync(
      path.resolve(__dirname, `../../../app/[locale]/${rel}`),
      'utf8'
    );
  const home = appPage('page.tsx');
  assert.match(home, /export const revalidate = 300;/);
  const watchlistPage = appPage('watchlist/page.tsx');
  assert.match(watchlistPage, /export const revalidate = 300;/);
  assert.match(watchlistPage, /getCachedMasterProducts/);
  assert.doesNotMatch(watchlistPage, /\bgetMasterProducts\b/);
  const layout = appPage('layout.tsx');
  assert.match(layout, /export const revalidate = 86400;/);
  assert.match(layout, /export function generateStaticParams\(/);
  for (const [name, src] of [
    ['home', home],
    ['watchlist', watchlistPage],
    ['layout', layout],
  ] as const) {
    assert.doesNotMatch(
      src,
      /searchParams:|\bheaders\(|\bcookies\(|export const dynamic\b|force-dynamic/,
      name
    );
  }
  for (const category of [
    'smartphones',
    'tablets',
    'laptops',
    'earbuds',
    'smartwatches',
  ]) {
    assert.match(
      appPage(`${category}/page.tsx`),
      /export const dynamic = 'force-dynamic';/,
      `${category} renders per request`
    );
  }
  for (const file of [
    path.resolve(__dirname, '../item-directory.ts'),
    path.resolve(__dirname, '../item-compare.ts'),
    path.resolve(__dirname, '../../../lib/item-compare.ts'),
    path.resolve(__dirname, '../../../lib/item-directory.ts'),
  ]) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      /searchParams|\bheaders\(|\bcookies\(/,
      file
    );
  }
  console.warn('✅ Item directory server suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
