/**
 * Behaviour tests for the category spec view on REST API v1 (DOS/Rate#1184):
 * `GET /api/v1/rate/products` filters agree with the scoped body, and the
 * extension lookup returns no earbud screen, RAM, storage or camera and no
 * watch 5G.
 *
 * The route handlers and the lookup run for real; only the network is
 * stubbed, with an earbud and a cellular watch stored phone-shaped, the way
 * the enricher filled them.
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  parseBoundedIntParam,
  parseBoundedNumberParam,
  parseBoundedPositiveIntArrayParam,
  parseCompareSlugsParam,
  parseFiniteDecimalInput,
  parseOptionalVndPriceParam,
  parseProductsFilterBounds,
  parseReviewsQueryParams,
  parseVersusQueryParams,
  resolveInspectObservedPrices,
} from '@/server/rate/api-handler';
import {
  evaluateExtensionPriceVerdict,
  lookupExtensionProduct,
} from '@/server/rate/extension';
import * as compareRouteStatic from '../compare/route';
import * as inspectRouteStatic from '../inspect/route';
import * as versusRouteStatic from '../versus/route';
import * as watchlistRouteStatic from '../watchlist/route';
import { resolveWatchlistMerchantCount } from '../watchlist/route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const phoneShaped = (id: string, slug: string, categorySlug: string) => ({
  id,
  slug,
  name: slug,
  brand: 'Apple',
  model: slug,
  status: 'published',
  min_price: 5_000_000,
  max_price: 6_000_000,
  merchant_count: 0,
  ram_gb: 1,
  storage_gb: 64,
  screen_size_inch: 1,
  has_5g: true,
  specifications: {
    category_slug: categorySlug,
    display: { size_inch: 1, type: 'OLED', refresh_rate_hz: 60 },
    hardware: { chipset: 'H2', cpu: 'c', ram_gb: 1, storage_gb: 64 },
    camera: { main_camera: '2 mic', front_camera: 'f' },
    battery: { capacity_mah: 500 },
    cellular: {
      has_5g: true,
      technology: 'LTE / 5G',
      bands_5g: 'n78',
      sim_type: 'eSIM',
    },
    connectivity: { bluetooth: '5.3', nfc: true },
    multimedia: { audio_features: 'ANC' },
  },
  key_specs: {
    screen: '1 inch',
    chip: 'H2',
    camera: 'mic',
    ram: '1GB',
    storage: '64GB',
    battery: '500 mAh',
  },
});

const EARBUD = phoneShaped(
  '11111111-1111-4111-8111-111111111111',
  'apple-airpods-pro-2',
  'earbuds'
);
const WATCH = phoneShaped(
  '22222222-2222-4222-8222-222222222222',
  'apple-watch-series-10-lte',
  'smartwatches'
);

let catalog: unknown[] = [];
// What a `master_products` read answers (detail and compare routes).
let masterRows: unknown[] = [];
// What an `items` read answers when `RATE_ITEM_MODEL` is active.
let itemRows: Array<Record<string, unknown>> = [];
// What a `merchants` read answers (merchant list and directory routes).
let merchantRows: unknown[] = [];
// What `v_products_with_merchant_trust` and `products` answer (offer reads).
let trustViewRows: Array<Record<string, unknown>> = [];
let productRows: Array<Record<string, unknown>> = [];
let calls: string[] = [];
// The last `search_master_products` arguments, to see the filters reach SQL.
let searchArgs: Record<string, unknown> = {};

const jsonResponse = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const postgrestWantedValues = (filter: string | null): string[] | null =>
  filter?.startsWith('eq.')
    ? [filter.slice(3)]
    : filter?.startsWith('in.(')
      ? filter
          .slice(4, -1)
          .split(',')
          .map((s) => s.replace(/^"|"$/g, ''))
      : null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  calls.push(url);
  const { pathname, searchParams } = new URL(url);
  if (pathname === '/auth/v1/user') {
    return jsonResponse(200, {
      id: '33333333-3333-4333-8333-333333331765',
      email: 'tester@rate.vn',
    });
  }
  if (pathname === '/rest/v1/categories') {
    return jsonResponse(200, [{ id: 'cat-1' }]);
  }
  if (pathname === '/rest/v1/rpc/search_master_products') {
    searchArgs = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const wantedBrands = Array.isArray(searchArgs.p_brands)
      ? (searchArgs.p_brands as unknown[]).map((b) => String(b).toLowerCase())
      : null;
    const filtered = wantedBrands
      ? catalog.filter((r) =>
          wantedBrands.includes(
            String((r as { brand?: unknown }).brand ?? '').toLowerCase()
          )
        )
      : catalog;
    const from = Number(searchArgs.p_offset ?? 0);
    return jsonResponse(
      200,
      filtered.slice(from, from + Number(searchArgs.p_limit ?? 200))
    );
  }
  if (pathname === '/rest/v1/items') {
    const from = Number(searchParams.get('offset') ?? 0);
    if (from > 0) return jsonResponse(200, []);
    const wantedSlugs = postgrestWantedValues(searchParams.get('slug'));
    const wantedIds = postgrestWantedValues(searchParams.get('id'));
    const wantedStatuses = postgrestWantedValues(searchParams.get('status'));
    return jsonResponse(
      200,
      itemRows.filter((row) => {
        if (wantedSlugs && !wantedSlugs.includes(String(row.slug ?? ''))) {
          return false;
        }
        if (wantedIds && !wantedIds.includes(String(row.id ?? ''))) {
          return false;
        }
        if (
          wantedStatuses &&
          !wantedStatuses.includes(String(row.status ?? 'published'))
        ) {
          return false;
        }
        return true;
      })
    );
  }
  if (pathname === '/rest/v1/master_products') {
    const from = Number(searchParams.get('offset') ?? 0);
    if (from > 0) return jsonResponse(200, []);
    // Honour slug, id and item_id filters (`eq.`, `in.(...)`, `not.is.null`) so unknown rows miss.
    const wantedSlugs = postgrestWantedValues(searchParams.get('slug'));
    const wantedIds = postgrestWantedValues(searchParams.get('id'));
    const rawItemFilter = searchParams.get('item_id');
    const wantedItemIds = postgrestWantedValues(rawItemFilter);
    const requireNonNullItem = rawItemFilter === 'not.is.null';
    return jsonResponse(
      200,
      masterRows.filter((row) => {
        const r = row as { id: string; slug: string; item_id?: string | null };
        if (wantedSlugs && !wantedSlugs.includes(r.slug)) return false;
        if (wantedIds && !wantedIds.includes(r.id)) return false;
        if (requireNonNullItem && !r.item_id) return false;
        if (wantedItemIds && !wantedItemIds.includes(String(r.item_id ?? ''))) {
          return false;
        }
        return true;
      })
    );
  }
  if (pathname === '/rest/v1/v_products_with_merchant_trust') {
    const wantedClusters = postgrestWantedValues(
      searchParams.get('cluster_id')
    );
    const filtered = wantedClusters
      ? trustViewRows.filter((row) =>
          wantedClusters.includes(String(row.cluster_id ?? ''))
        )
      : trustViewRows;
    const from = Number(searchParams.get('offset') ?? 0);
    const size = Number(searchParams.get('limit') ?? filtered.length);
    return jsonResponse(200, filtered.slice(from, from + size));
  }
  if (pathname === '/rest/v1/products') {
    const wantedClusters = postgrestWantedValues(
      searchParams.get('cluster_id')
    );
    const wantedItemIds = postgrestWantedValues(
      searchParams.get('platform_item_id')
    );
    const filtered = productRows.filter((row) => {
      if (
        wantedClusters &&
        !wantedClusters.includes(String(row.cluster_id ?? ''))
      ) {
        return false;
      }
      if (
        wantedItemIds &&
        !wantedItemIds.includes(String(row.platform_item_id ?? ''))
      ) {
        return false;
      }
      return true;
    });
    const from = Number(searchParams.get('offset') ?? 0);
    const size = Number(searchParams.get('limit') ?? filtered.length);
    return jsonResponse(200, filtered.slice(from, from + size));
  }
  if (pathname === '/rest/v1/merchants') {
    // Paged reads (`.range()`) end on a short page.
    const from = Number(searchParams.get('offset') ?? 0);
    const size = Number(searchParams.get('limit') ?? merchantRows.length);
    return jsonResponse(200, merchantRows.slice(from, from + size));
  }
  return jsonResponse(200, []);
}) as typeof fetch;

async function listProducts(query: string) {
  const { GET } = await import('../products/route');
  const { NextRequest } = await import('next/server');
  calls = [];
  const res = await GET(
    new NextRequest(`http://localhost/api/v1/rate/products?${query}`)
  );
  return { status: res.status, body: await res.json() };
}

async function testProductFilters() {
  // A filter the category has no field for answers 400 before any query.
  for (const query of [
    'category=smartwatches&has5g=true',
    'category=smartwatches&5g=1',
    'category=earbuds&ram=1',
    'category=earbuds&rom=64',
    'category=earbuds&hz=60',
    'category=earbuds&compactScreen=true',
    'category=earbuds&nfc=1',
    'category=earbuds&highRefresh=1',
  ]) {
    const { status, body } = await listProducts(query);
    assert.equal(status, 400, query);
    assert.equal(body.ok, false, query);
    assert.equal(calls.length, 0, `${query} must not query the catalog`);
  }
  const { body: mixed } = await listProducts(
    'category=earbuds&ramGb=1&storageGb=64&has5g=true'
  );
  assert.match(mixed.error, /ramGb, storageGb, has5g/);

  // Filters the category has still run, and the body carries the scoped view.
  catalog = [WATCH];
  let { status, body } = await listProducts(
    'category=smartwatches&ram=1&hz=60&compactScreen=2'
  );
  assert.equal(status, 200);
  assert.deepEqual(searchArgs.p_ram_gb, [1]);
  assert.equal(searchArgs.p_min_refresh_rate_hz, 60);
  assert.equal(searchArgs.p_max_screen_size_inch, 2);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].ram_gb, 1);
  assert.equal(body.data[0].has_5g, false);
  assert.equal(body.data[0].specifications.cellular.technology, 'LTE');
  // In stock, so on sale (DOS/Rate#1188).
  assert.equal(body.data[0].sale_state, 'on_sale');

  catalog = [EARBUD];
  ({ status, body } = await listProducts('category=earbuds&battery=400'));
  assert.equal(status, 200);
  assert.equal(body.data.length, 1);
  const bud = body.data[0];
  assert.equal(bud.ram_gb, null);
  assert.equal(bud.storage_gb, null);
  assert.equal(bud.screen_size_inch, null);
  assert.equal(bud.has_5g, false);
  assert.equal(bud.specifications.display, undefined);
  assert.equal(bud.specifications.camera, undefined);

  // Filters every category has still run on `all`, over every category.
  catalog = [EARBUD];
  ({ status, body } = await listProducts(
    'category=all&fastCharge=1&battery=400'
  ));
  assert.equal(status, 200);
  assert.equal(body.data.length, 1);

  // On `all`, a filter some category lacks keeps only products whose own
  // category has it, paged after that cut: no 400, no watch or earbud.
  const PHONE = phoneShaped(
    '33333333-3333-4333-8333-333333333333',
    'apple-iphone-16-128gb',
    'smartphones'
  );
  const PHONE_2 = phoneShaped(
    '44444444-4444-4444-8444-444444444444',
    'apple-iphone-16-256gb',
    'smartphones'
  );
  catalog = [WATCH, PHONE, EARBUD, PHONE_2];
  ({ status, body } = await listProducts('category=all&has5g=1'));
  assert.equal(status, 200);
  assert.equal(searchArgs.p_has_5g, true);
  assert.deepEqual(
    body.data.map((p: { slug: string }) => p.slug),
    [PHONE.slug, PHONE_2.slug]
  );
  assert.ok(body.data.every((p: { has_5g: boolean }) => p.has_5g === true));
  ({ body } = await listProducts('category=all&has5g=1&offset=1&limit=1'));
  assert.deepEqual(
    body.data.map((p: { slug: string }) => p.slug),
    [PHONE_2.slug]
  );
  // The cut reads past the first 500-row page.
  catalog = [...Array.from({ length: 500 }, () => WATCH), PHONE];
  ({ body } = await listProducts('category=all&has5g=1'));
  assert.deepEqual(
    body.data.map((p: { slug: string }) => p.slug),
    [PHONE.slug]
  );
  catalog = [WATCH, PHONE, EARBUD, PHONE_2];
  // Watches have NFC, earbuds do not.
  ({ body } = await listProducts('category=all&nfc=1'));
  assert.deepEqual(
    body.data.map((p: { slug: string }) => p.slug),
    [WATCH.slug, PHONE.slug, PHONE_2.slug]
  );
  // A watch has RAM, earbuds do not.
  ({ body } = await listProducts('category=all&ram=1'));
  assert.deepEqual(
    body.data.map((p: { slug: string }) => p.slug),
    [WATCH.slug, PHONE.slug, PHONE_2.slug]
  );
  assert.ok(body.data.every((p: { ram_gb: number }) => p.ram_gb === 1));

  // Phones keep every filter and the stored body.
  catalog = [PHONE];
  ({ status, body } = await listProducts(
    'category=smartphones&has5g=true&ram=1&rom=64&hz=60&compact=1&nfc=1'
  ));
  assert.equal(status, 200);
  assert.equal(searchArgs.p_has_5g, true);
  assert.deepEqual(searchArgs.p_ram_gb, [1]);
  assert.deepEqual(searchArgs.p_storage_gb, [64]);
  assert.equal(searchArgs.p_min_refresh_rate_hz, 60);
  assert.equal(searchArgs.p_max_screen_size_inch, 6.2);
  assert.equal(searchArgs.p_has_nfc, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].has_5g, true);
  assert.equal(body.data[0].ram_gb, 1);
  assert.equal(body.data[0].screen_size_inch, 1);
  assert.deepEqual(body.data[0].specifications, PHONE.specifications);
  console.warn('  ✅ API v1 product filters agree with the scoped body');
}

// The detail and compare routes carry the same scoped view.
async function testDetailAndCompare() {
  const { NextRequest } = await import('next/server');
  const detail = await import('../products/[slug]/route');
  masterRows = [EARBUD];
  const res = await detail.GET(
    new NextRequest(`http://localhost/api/v1/rate/products/${EARBUD.slug}`),
    { params: Promise.resolve({ slug: EARBUD.slug }) } as never
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const product = body.data.product;
  assert.equal(product.slug, EARBUD.slug);
  assert.equal(product.ram_gb, null);
  assert.equal(product.screen_size_inch, null);
  assert.equal(product.specifications.camera, undefined);

  const compare = await import('../compare/route');
  masterRows = [WATCH];
  const cmp = await compare.GET(
    new NextRequest(`http://localhost/api/v1/rate/compare?slugs=${WATCH.slug}`)
  );
  assert.equal(cmp.status, 200);
  const cmpBody = await cmp.json();
  assert.equal(cmpBody.data.length, 1);
  assert.equal(cmpBody.data[0].has_5g, false);
  assert.equal(cmpBody.data[0].specifications.cellular.technology, 'LTE');
  assert.deepEqual(cmpBody.not_found_slugs, []);

  // Another category's product is excluded by the lock; a slug with no
  // published product is not found, not cross-category (DOS/Rate#1364).
  masterRows = [WATCH, EARBUD];
  const mixed = await compare.GET(
    new NextRequest(
      `http://localhost/api/v1/rate/compare?slugs=${WATCH.slug},${EARBUD.slug},does-not-exist-xyz`
    )
  );
  assert.equal(mixed.status, 200);
  const mixedBody = await mixed.json();
  assert.deepEqual(
    mixedBody.data.map((p: { slug: string }) => p.slug),
    [WATCH.slug]
  );
  assert.deepEqual(mixedBody.excluded_cross_category_slugs, [EARBUD.slug]);
  assert.deepEqual(mixedBody.not_found_slugs, ['does-not-exist-xyz']);
  // A slug in another case is the same product, compared once and not listed.
  const upper = await compare.GET(
    new NextRequest(
      `http://localhost/api/v1/rate/compare?slugs=${WATCH.slug.toUpperCase()},${WATCH.slug}`
    )
  );
  const upperBody = await upper.json();
  assert.deepEqual(
    upperBody.data.map((p: { slug: string }) => p.slug),
    [WATCH.slug]
  );
  assert.deepEqual(upperBody.excluded_cross_category_slugs, []);
  assert.deepEqual(upperBody.not_found_slugs, []);
  assert.equal(upperBody.requested_slugs.length, 1);
  masterRows = [];
  console.warn('  ✅ API v1 detail and compare return the scoped view');
}

async function testExtensionLookup() {
  const { lookupExtensionProduct } = await import('@/server/rate/extension');

  catalog = [EARBUD];
  const bud = await lookupExtensionProduct({
    title: 'Apple AirPods Pro 2 64GB',
    mode: 'full',
  });
  assert.equal(bud.categorySlug, 'earbuds');
  const budProduct = bud.masterProduct!;
  assert.ok(budProduct);
  assert.equal(budProduct.ram_gb, null);
  assert.equal(budProduct.storage_gb, null);
  assert.equal(budProduct.screen_size_inch, null);
  assert.equal(budProduct.has_5g, false);
  const budSpecs = budProduct.specifications as Record<string, unknown>;
  assert.equal(budSpecs.display, undefined);
  assert.equal(budSpecs.camera, undefined);
  assert.equal(budSpecs.cellular, undefined);
  assert.deepEqual(Object.keys(budProduct.key_specs ?? {}).sort(), [
    'battery',
    'chip',
  ]);
  assert.equal(bud.detectedStorageGb, null);
  assert.deepEqual(bud.variantCandidates, []);

  // Two sizes in an earbud title are not storage variants.
  const twoSizes = await lookupExtensionProduct({
    title: 'Apple AirPods Pro 2 64GB 128GB',
    mode: 'pill',
  });
  assert.notEqual(twoSizes.matchStatus, 'ambiguous_variant');

  catalog = [WATCH];
  const watch = await lookupExtensionProduct({
    title: 'Apple Watch Series 10 LTE',
    mode: 'pill',
  });
  assert.equal(watch.categorySlug, 'smartwatches');
  const watchProduct = watch.masterProduct!;
  assert.equal(watchProduct.has_5g, false);
  const cellular = (watchProduct.specifications as Record<string, unknown>)
    .cellular as Record<string, unknown>;
  assert.equal(cellular.has_5g, undefined);
  assert.equal(cellular.bands_5g, undefined);
  assert.equal(cellular.technology, 'LTE');
  // A watch keeps its RAM and storage.
  assert.equal(watchProduct.ram_gb, 1);
  assert.equal(watchProduct.storage_gb, 64);
  console.warn('  ✅ Extension lookup returns the category spec view');
}

// The extension lookup and the public lookup pick the model a title names,
// not the first model the search returns (DOS/Rate#1379, #594).
async function testModelMatch() {
  const { lookupExtensionProduct } = await import('@/server/rate/extension');
  const { inspectProductOrShopUrl } = await import('@/lib/rate-api');
  const named = (id: string, slug: string, name: string, storage = 128) => ({
    ...phoneShaped(id, slug, 'smartphones'),
    name,
    model: name.replace(/^Apple /, '').replace(/ \d+GB$/, ''),
    storage_gb: storage,
  });
  const IPHONE_16E = named(
    '55555555-5555-4555-8555-555555555555',
    'apple-iphone-16e-128gb',
    'Apple iPhone 16e 128GB'
  );
  const IPHONE_16 = named(
    '66666666-6666-4666-8666-666666666666',
    'apple-iphone-16-128gb',
    'Apple iPhone 16 128GB'
  );
  // The search returns the 16e first, as it did on rate.vn.
  catalog = [IPHONE_16E, IPHONE_16];
  masterRows = [];

  const ext16 = await lookupExtensionProduct({
    title: 'Apple iPhone 16 128GB',
    price: 19_990_000,
    mode: 'pill',
  });
  assert.equal(ext16.masterProduct?.slug, IPHONE_16.slug);
  const ext16e = await lookupExtensionProduct({
    title: 'Apple iPhone 16e 128GB',
    mode: 'pill',
  });
  assert.equal(ext16e.masterProduct?.slug, IPHONE_16E.slug);

  const public16 = await inspectProductOrShopUrl('iphone 16');
  assert.equal(public16.masterProduct?.slug, IPHONE_16.slug);
  assert.equal(public16.suggestions[0]?.slug, IPHONE_16.slug);
  const public16e = await inspectProductOrShopUrl('iphone 16e');
  assert.equal(public16e.masterProduct?.slug, IPHONE_16E.slug);

  // The other order, so the 16e cases are not won by the search order.
  catalog = [IPHONE_16, IPHONE_16E];
  const ext16eSecond = await lookupExtensionProduct({
    title: 'iPhone 16e 128GB | Chính hãng VN/A',
    mode: 'pill',
  });
  assert.equal(ext16eSecond.masterProduct?.slug, IPHONE_16E.slug);
  assert.equal(
    (await inspectProductOrShopUrl('iphone 16e')).masterProduct?.slug,
    IPHONE_16E.slug
  );

  // A size of another model does not beat the model the title names.
  const IPHONE_16_PLUS_256 = named(
    '77777777-7777-4777-8777-777777777777',
    'apple-iphone-16-plus-256gb',
    'Apple iPhone 16 Plus 256GB',
    256
  );
  catalog = [IPHONE_16_PLUS_256, IPHONE_16];
  const ext16Size = await lookupExtensionProduct({
    title: 'Apple iPhone 16 256GB',
    mode: 'pill',
  });
  assert.equal(ext16Size.masterProduct?.slug, IPHONE_16.slug);
  // A bracketed promotion is not part of the model.
  const extPromo = await lookupExtensionProduct({
    title: 'Apple iPhone 16 128GB [Trả góp 0% - Bảo hành Plus 12 tháng]',
    mode: 'pill',
  });
  assert.equal(extPromo.masterProduct?.slug, IPHONE_16.slug);
  catalog = [];
  console.warn('  ✅ Extension and public lookup pick the named model');
}

// Caller-controlled work is bounded (DOS/Rate#1308).
async function testBoundedInputs() {
  const { NextRequest } = await import('next/server');
  // category=all with a spec filter pages in process: its offset is capped.
  let res = await listProducts('category=all&has5g=1&offset=2001');
  assert.equal(res.status, 400);
  res = await listProducts('category=all&has5g=1&offset=2000');
  assert.equal(res.status, 200);
  // A merchants platform must be a tracked one.
  const merchants = await import('../merchants/route');
  const ask = (q: string) =>
    merchants.GET(
      new NextRequest(`http://localhost/api/v1/rate/merchants?${q}`)
    );
  assert.equal((await ask('platform=not-a-platform')).status, 400);
  assert.notEqual((await ask('platform=Shopee')).status, 400);
  // JSON write bodies are read up to 32 KB.
  const { readBoundedJsonBody, MAX_JSON_BODY_BYTES } =
    await import('@/server/rate/api-handler');
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request('http://localhost/x', { method: 'POST', body, headers });
  assert.deepEqual(await readBoundedJsonBody(post('{"a":1}')), {
    tooLarge: false,
    value: { a: 1 },
  });
  assert.deepEqual(await readBoundedJsonBody(post('not json')), {
    tooLarge: false,
    value: null,
  });
  // A longest review with every non-ASCII character escaped still fits.
  const escapedReview = JSON.stringify({
    masterProductId: '11111111-1111-4111-8111-111111111111',
    comment: 'ệ'.repeat(3000),
    authorName: 'ệ'.repeat(120),
    variation: 'ệ'.repeat(200),
  }).replace(
    /[^\x20-\x7e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  assert.ok(escapedReview.length > 16_384, 'the escaped body is over 16 KB');
  const escapedRead = await readBoundedJsonBody(post(escapedReview));
  assert.equal(escapedRead.tooLarge, false, 'an escaped longest review fits');
  const big = JSON.stringify({ a: 'x'.repeat(MAX_JSON_BODY_BYTES) });
  assert.deepEqual(await readBoundedJsonBody(post(big)), { tooLarge: true });
  assert.deepEqual(
    await readBoundedJsonBody(
      post('{}', { 'content-length': String(MAX_JSON_BODY_BYTES + 1) })
    ),
    { tooLarge: true },
    'a declared length over the cap is not read'
  );
  const ingest = await import('../extension/ingest/route');
  const tooBig = await ingest.POST(
    new NextRequest('http://localhost/api/v1/rate/extension/ingest', {
      method: 'POST',
      body: big,
      headers: { 'content-type': 'application/json' },
    })
  );
  assert.equal(tooBig.status, 413);
  console.warn('  ✅ Offsets, platforms and body sizes are bounded');
}

// Inspect and lookup share a per-IP limit (DOS/Rate#1307).
async function testInspectRateLimit() {
  const { NextRequest } = await import('next/server');
  const inspect = await import('../inspect/route');
  const lookup = await import('../lookup/route');
  const ask = (route: typeof inspect | typeof lookup, ip: string) =>
    route.GET(
      new NextRequest('http://localhost/api/v1/rate/inspect?q=iphone', {
        headers: { 'x-forwarded-for': ip },
      })
    );
  for (let i = 0; i < 30; i++) {
    const res = await ask(i % 2 ? inspect : lookup, '198.51.100.20');
    assert.notEqual(res.status, 429, `request ${i + 1}`);
  }
  const limited = await ask(inspect, '198.51.100.20');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await ask(lookup, '198.51.100.20')).status, 429);
  assert.notEqual(
    (await ask(inspect, '198.51.100.21')).status,
    429,
    'another client is not limited'
  );
  console.warn('  ✅ Inspect and lookup are rate-limited per client IP');
}

// The extension routes answer their 429 like /lookup and /inspect: a code,
// Retry-After, and the header readable cross-origin (DOS/Rate#1377).
async function testExtensionRateLimit() {
  const { NextRequest } = await import('next/server');
  const lookup = await import('../extension/lookup/route');
  const ingest = await import('../extension/ingest/route');
  const expectLimited = async (res: Response, route: string) => {
    assert.equal(res.status, 429, route);
    assert.equal(res.headers.get('retry-after'), '60', route);
    assert.match(
      res.headers.get('access-control-expose-headers') ?? '',
      /Retry-After/,
      route
    );
    const body = (await res.json()) as { ok?: boolean; code?: string };
    assert.equal(body.ok, false, route);
    assert.equal(body.code, 'RATE_LIMIT_EXCEEDED', route);
  };
  const lookupAt = (ip: string) =>
    lookup.GET(
      new NextRequest('http://localhost/api/v1/rate/extension/lookup', {
        headers: { 'x-forwarded-for': ip },
      })
    );
  for (let i = 0; i < 60; i++) {
    assert.notEqual((await lookupAt('198.51.100.30')).status, 429);
  }
  await expectLimited(await lookupAt('198.51.100.30'), 'extension lookup');
  const ingestAt = (ip: string) =>
    ingest.POST(
      new NextRequest('http://localhost/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
        body: '{}',
      })
    );
  for (let i = 0; i < 15; i++) {
    assert.notEqual((await ingestAt('198.51.100.31')).status, 429);
  }
  await expectLimited(await ingestAt('198.51.100.31'), 'extension ingest');
  console.warn(
    '  ✅ The extension routes answer 429 with a code and Retry-After'
  );
}

type Json = Record<string, unknown>;

/**
 * The schema at `path` in the OpenAPI document: a segment is a property
 * name, `[]` an array's items and `*` an object's additionalProperties.
 * `$ref`, `allOf` and `anyOf` are followed. Null when the path is not
 * documented.
 */
function specSchemaAt(spec: Json, schema: unknown, path: string[]): unknown {
  const resolve = (node: unknown): Json | null => {
    if (!node || typeof node !== 'object') return null;
    const ref = (node as Json).$ref;
    if (typeof ref === 'string') {
      const name = ref.replace('#/components/schemas/', '');
      const schemas = (spec.components as Json).schemas as Json;
      return resolve(schemas[name]);
    }
    return node as Json;
  };
  const step = (node: unknown, seg: string): unknown[] => {
    const s = resolve(node);
    if (!s) return [];
    const found: unknown[] = [];
    for (const key of ['allOf', 'anyOf'] as const) {
      if (Array.isArray(s[key])) {
        for (const branch of s[key] as unknown[]) {
          found.push(...step(branch, seg));
        }
      }
    }
    if (seg === '[]' && s.items) found.push(s.items);
    else if (seg === '*' && typeof s.additionalProperties === 'object') {
      found.push(s.additionalProperties);
    } else if (s.properties && seg in (s.properties as Json)) {
      found.push((s.properties as Json)[seg]);
    }
    return found;
  };
  let nodes: unknown[] = [schema];
  for (const seg of path) {
    nodes = nodes.flatMap((n) => step(n, seg));
    if (nodes.length === 0) return null;
  }
  return nodes[0] ?? null;
}

/**
 * Every value at `path` in a response body: `[]` takes every array element
 * and `*` every object value. Empty when the path is missing.
 */
function bodyValuesAt(body: unknown, path: string[]): unknown[] {
  let nodes: unknown[] = [body];
  for (const seg of path) {
    const next: unknown[] = [];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (seg === '[]') {
        if (Array.isArray(node)) next.push(...node);
      } else if (seg === '*') {
        next.push(...Object.values(node as Json));
      } else if (seg in (node as Json)) {
        next.push((node as Json)[seg]);
      }
    }
    nodes = next;
  }
  return nodes;
}

/**
 * Whether `value` fits the documented schema's `type` (`integer` must be a
 * whole number, `null` must be listed) and `enum`, following `$ref`, `allOf`
 * and `anyOf`/`oneOf`. A schema without a type accepts anything.
 */
function valueFits(spec: Json, schema: unknown, value: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true;
  const s = schema as Json;
  if (typeof s.$ref === 'string') {
    const name = s.$ref.replace('#/components/schemas/', '');
    return valueFits(
      spec,
      ((spec.components as Json).schemas as Json)[name],
      value
    );
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(s[key])) {
      return (s[key] as unknown[]).some((b) => valueFits(spec, b, value));
    }
  }
  if (Array.isArray(s.allOf)) {
    if (!(s.allOf as unknown[]).every((b) => valueFits(spec, b, value))) {
      return false;
    }
  }
  if (Array.isArray(s.enum) && !(s.enum as unknown[]).includes(value)) {
    return false;
  }
  if (s.type === undefined) return true;
  const types = Array.isArray(s.type)
    ? (s.type as string[])
    : [s.type as string];
  const kind =
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  return types.some((t) =>
    t === 'integer'
      ? typeof value === 'number' && Number.isInteger(value)
      : t === 'number'
        ? typeof value === 'number'
        : t === kind
  );
}

// The OpenAPI document describes what the routes answer (DOS/Rate#1357,
// #1358, #1359, #1363): each documented path below is checked in the
// document and in a real response body.
async function testSpecMatchesBodies() {
  const { NextRequest } = await import('next/server');
  const { buildRateOpenApiSpec } = await import('@/server/rate/openapi');
  const spec = buildRateOpenApiSpec('https://rate.vn') as unknown as Json;
  const paths = spec.paths as Record<string, Record<string, Json>>;

  const okSchema = (route: string, method = 'get', status = '200') =>
    (
      (paths[route]![method]!.responses as Json)[status] as {
        content: { 'application/json': { schema: unknown } };
      }
    ).content['application/json'].schema;

  const expectPaths = (
    route: string,
    body: unknown,
    documented: string[],
    status = '200'
  ) => {
    for (const dotted of documented) {
      const path = dotted.split('.');
      assert.ok(
        specSchemaAt(spec, okSchema(route, 'get', status), path),
        `${route} ${status}: the document has ${dotted}`
      );
      const values = bodyValuesAt(body, path);
      assert.ok(
        values.length > 0,
        `${route} ${status}: the body has ${dotted}`
      );
      // The values fit the documented type, nullability and enum, so an
      // integer documented for a decimal (or a missing null) fails here.
      const documentedSchema = specSchemaAt(
        spec,
        okSchema(route, 'get', status),
        path
      );
      for (const value of values) {
        assert.ok(
          valueFits(spec, documentedSchema, value),
          `${route} ${status}: ${dotted} = ${JSON.stringify(value)} does not fit the document`
        );
      }
    }
  };
  const radar = ['verdict', 'savingsPct', 'fakeMarkupPct', 'spreadPct'];
  const radarDetail = [...radar, 'genuineDeal', 'fakeSaleTrap', 'priceSpread'];
  const under = (prefix: string, keys: string[]) =>
    keys.map((k) => `${prefix}.${k}`);

  const PHONE = phoneShaped(
    '55555555-5555-4555-8555-555555555555',
    'apple-iphone-16-128gb',
    'smartphones'
  );
  const PHONE_2 = phoneShaped(
    '66666666-6666-4666-8666-666666666666',
    'apple-iphone-16-256gb',
    'smartphones'
  );
  const get = (url: string, ip = '203.0.113.7') =>
    new NextRequest(`http://localhost${url}`, {
      headers: { 'x-forwarded-for': ip },
    });

  // GET /products: `data[].deal_radar`, not `radar_signal` (#1357).
  catalog = [PHONE];
  const list = await listProducts('category=smartphones');
  assert.equal(list.status, 200);
  expectPaths('/api/v1/rate/products', list.body, [
    'ok',
    'category',
    'count',
    'offset',
    'data.[].slug',
    'data.[].sale_state',
    ...under('data.[].deal_radar', radar),
  ]);
  assert.equal(
    specSchemaAt(spec, okSchema('/api/v1/rate/products'), [
      'data',
      '[]',
      'radar_signal',
    ]),
    null
  );

  // GET /products/{slug}: `data.radarSignal`, camelCase, with the entries.
  masterRows = [PHONE];
  const detail = await import('../products/[slug]/route');
  const detailRes = await detail.GET(
    get(`/api/v1/rate/products/${PHONE.slug}`),
    { params: Promise.resolve({ slug: PHONE.slug }) } as never
  );
  assert.equal(detailRes.status, 200);
  const detailBody = await detailRes.json();
  expectPaths('/api/v1/rate/products/{slug}', detailBody, [
    'data.product.sale_state',
    'data.offers',
    'data.reviews',
    'data.priceHistory',
    'data.reviewSummary',
    ...under('data.radarSignal', radarDetail),
  ]);
  assert.ok(!('radar_signal' in detailBody));

  // GET /compare: `data[].deal_radar` per product, no top-level map.
  const compare = await import('../compare/route');
  const cmp = await compare.GET(
    get(`/api/v1/rate/compare?slugs=${PHONE.slug}`)
  );
  assert.equal(cmp.status, 200);
  const cmpBody = await cmp.json();
  expectPaths('/api/v1/rate/compare', cmpBody, [
    'count',
    'locked_category',
    'requested_slugs',
    'excluded_cross_category_slugs',
    'data.[].canonical_href',
    'data.[].sale_state',
    ...under('data.[].deal_radar', radar),
  ]);
  assert.ok(!('deal_radar' in cmpBody));

  // GET /watchlist: `items` keyed by slug, not a `data` array (#1358).
  const watchlist = await import('../watchlist/route');
  const watch = await watchlist.GET(
    get(`/api/v1/rate/watchlist?slugs=${PHONE.slug}`)
  );
  assert.equal(watch.status, 200);
  const watchBody = await watch.json();
  expectPaths('/api/v1/rate/watchlist', watchBody, [
    'count',
    'items.*.slug',
    'items.*.master_product_id',
    'items.*.offer_platforms',
    ...under('items.*.deal_radar', radar),
    ...under('items.*.radar_signal', radarDetail),
  ]);
  assert.ok(PHONE.slug in watchBody.items);
  assert.ok(!('data' in watchBody));

  // GET /lookup and /inspect: `data.radarSignal`.
  const lookup = await import('../lookup/route');
  const lookupRes = await lookup.GET(
    get(`/api/v1/rate/lookup?q=${PHONE.slug}`)
  );
  assert.equal(lookupRes.status, 200);
  expectPaths('/api/v1/rate/lookup', await lookupRes.json(), [
    'data.query',
    'data.matchedType',
    'data.allOffers',
    'data.merchantProfile',
    'data.radarSignal',
  ]);
  const inspect = await import('../inspect/route');
  const inspectRes = await inspect.GET(
    get(`/api/v1/rate/inspect?url=${PHONE.slug}`)
  );
  assert.equal(inspectRes.status, 200, 'url is an alternative to q');
  expectPaths('/api/v1/rate/inspect', await inspectRes.json(), [
    'data.matchedType',
    'data.canonicalUrl',
    'data.gatekeeper.isAccessory',
    'data.priceVerdict.verdict',
    'data.radarSignal',
  ]);

  // GET /versus: `deal_radar.productA` and the per-product signals.
  masterRows = [PHONE, PHONE_2];
  const versus = await import('../versus/route');
  const vs = await versus.GET(
    get(`/api/v1/rate/versus?pair=${PHONE.slug}-vs-${PHONE_2.slug}`)
  );
  assert.equal(vs.status, 200);
  const vsBody = await vs.json();
  // The tie and the winner read the /10 scores as shown, at one decimal
  // (#1545): a tie only when they are equal, else the higher one wins.
  const vsA10 = vsBody.product_a.custom_weighted_score_10;
  const vsB10 = vsBody.product_b.custom_weighted_score_10;
  assert.equal(vsBody.is_tie, vsA10 === vsB10);
  if (!vsBody.is_tie) {
    assert.equal(vsBody.overall_winner.side, vsA10 > vsB10 ? 'A' : 'B');
    assert.equal(
      vsBody.overall_winner.margin_10,
      Number(Math.abs(vsA10 - vsB10).toFixed(1))
    );
  }
  expectPaths('/api/v1/rate/versus', vsBody, [
    'is_tie',
    'versus_pair',
    ...under('deal_radar.productA', radar),
    ...under('deal_radar.productB', radar),
    ...under('product_a.deal_radar', radar),
    ...under('product_b.radar_signal', radar),
  ]);

  // GET /reviews: the list envelope (#1363).
  masterRows = [PHONE];
  const reviews = await import('../reviews/route');
  const rv = await reviews.GET(get(`/api/v1/rate/reviews?slug=${PHONE.slug}`));
  assert.equal(rv.status, 200);
  expectPaths('/api/v1/rate/reviews', await rv.json(), [
    'masterProductId',
    'count',
    'totalCount',
    'summary',
    'data',
  ]);

  // Merchants: `data[]` + `count`, the directory's `data.items`, and a
  // `review_risk_score` that is an integer or null (#1363).
  const ANALYSED = {
    id: '77777777-7777-4777-8777-777777777777',
    platform: 'shopee',
    platform_shop_id: '1001',
    name: 'Analysed store',
    is_official: true,
    follower_count: 10,
    // A decimal combined score and an integer review score, as stored.
    risk_score: 6.5,
    review_risk_score: 6,
    review_risk_breakdown: { total_reviews: 12 },
  };
  const UNANALYSED = {
    ...ANALYSED,
    id: '88888888-8888-4888-8888-888888888888',
    platform_shop_id: '1002',
    name: 'Store without reviews',
    review_risk_breakdown: null,
  };
  merchantRows = [ANALYSED, UNANALYSED];
  const merchants = await import('../merchants/route');
  const mRes = await merchants.GET(get('/api/v1/rate/merchants'));
  assert.equal(mRes.status, 200);
  const mBody = await mRes.json();
  expectPaths('/api/v1/rate/merchants', mBody, [
    'count',
    'data.[].review_risk_score',
    'data.[].risk_score',
    'data.[].trust_score',
  ]);
  const scoreType = (
    specSchemaAt(spec, okSchema('/api/v1/rate/merchants'), [
      'data',
      '[]',
      'review_risk_score',
    ]) as Json
  ).type;
  assert.deepEqual(scoreType, ['integer', 'null']);
  assert.deepEqual(
    mBody.data
      .map((m: { review_risk_score: unknown }) => m.review_risk_score)
      .sort(),
    [6, null]
  );
  const directory = await import('../merchants/directory/route');
  const dRes = await directory.GET(get('/api/v1/rate/merchants/directory'));
  assert.equal(dRes.status, 200);
  expectPaths('/api/v1/rate/merchants/directory', await dRes.json(), [
    'data.items.[].review_risk_score',
    'data.matched',
    'data.offset',
  ]);
  assert.ok(
    specSchemaAt(spec, okSchema('/api/v1/rate/merchants/{id}'), [
      'data',
      'review_risk_score',
    ])
  );
  merchantRows = [];

  // Error bodies are ApiError: `{ ok: false, error, code? }` (#1359).
  const apiError = (spec.components as Json).schemas as Json;
  assert.deepEqual((apiError.ApiError as Json).required, ['ok', 'error']);
  const errorBodies: Array<[string, string, Response]> = [
    [
      '/api/v1/rate/compare',
      '400',
      await compare.GET(get('/api/v1/rate/compare')),
    ],
    [
      '/api/v1/rate/lookup',
      '400',
      await lookup.GET(get('/api/v1/rate/lookup')),
    ],
    [
      '/api/v1/rate/inspect',
      '400',
      await inspect.GET(get('/api/v1/rate/inspect')),
    ],
    [
      '/api/v1/rate/reviews',
      '400',
      await reviews.GET(get('/api/v1/rate/reviews')),
    ],
    [
      '/api/v1/rate/merchants',
      '400',
      await merchants.GET(
        get('/api/v1/rate/merchants?platform=not-a-platform')
      ),
    ],
  ];
  masterRows = [];
  errorBodies.push([
    '/api/v1/rate/reviews',
    '404',
    await reviews.GET(get('/api/v1/rate/reviews?slug=does-not-exist-xyz')),
  ]);
  const merchantById = await import('../merchants/[id]/route');
  errorBodies.push([
    '/api/v1/rate/merchants/{id}',
    '404',
    await merchantById.GET(get('/api/v1/rate/merchants/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    } as never),
  ]);
  for (const [route, status, res] of errorBodies) {
    assert.equal(String(res.status), status, `${route} ${status}`);
    const body = await res.json();
    assert.equal(body.ok, false, `${route} ${status}`);
    assert.equal(typeof body.error, 'string', `${route} ${status}`);
    assert.ok(
      body.code === undefined || typeof body.code === 'string',
      `${route} ${status}`
    );
    assert.equal(
      (
        okSchema(route, 'get', status) as {
          $ref?: string;
        }
      ).$ref,
      '#/components/schemas/ApiError',
      `${route} documents its ${status} as ApiError`
    );
  }

  // Every documented 4xx references ApiError.
  for (const [route, ops] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(ops)) {
      for (const [status, res] of Object.entries(op.responses as Json)) {
        if (!status.startsWith('4')) continue;
        const ref = (
          res as {
            content?: { 'application/json'?: { schema?: { $ref?: string } } };
          }
        ).content?.['application/json']?.schema?.$ref;
        assert.equal(
          ref,
          '#/components/schemas/ApiError',
          `${method.toUpperCase()} ${route} ${status} references ApiError`
        );
      }
    }
  }

  // The extension lookup answers its result directly under `data` with no
  // nested `data.data` wrapper (#1830).
  const extLookup = okSchema('/api/v1/rate/extension/lookup');
  for (const key of radarDetail) {
    assert.ok(specSchemaAt(spec, extLookup, ['data', 'radarSignal', key]));
  }
  assert.equal(specSchemaAt(spec, extLookup, ['radar_signal']), null);
  assert.equal(
    specSchemaAt(spec, extLookup, ['data', 'data']),
    null,
    'extension lookup schema must not nest a second data object'
  );
  assert.ok(
    specSchemaAt(spec, extLookup, [
      'data',
      'priceAssessment',
      'implausiblyLow',
    ]),
    'extension lookup priceAssessment documents optional implausiblyLow'
  );
  catalog = [PHONE];
  const extLookupRoute = await import('../extension/lookup/route');
  const extLookupRes = await extLookupRoute.GET(
    get(
      '/api/v1/rate/extension/lookup?title=Apple%20iPhone%2016%20128GB&price=21990000&mode=pill',
      '203.0.113.88'
    )
  );
  assert.equal(extLookupRes.status, 200);
  const extLookupBody = await extLookupRes.json();
  assert.equal('data' in extLookupBody.data, false);
  expectPaths('/api/v1/rate/extension/lookup', extLookupBody, [
    'ok',
    'data.matchStatus',
    'data.priceAssessment.verdict',
    'data.priceAssessment.badgeLabel',
    'data.priceAssessment.explanation',
    'data.priceAssessment.messageKey',
    'data.priceAssessment.messageParams',
    'data.priceAssessment.observedPrice',
    'data.priceAssessment.observedOriginalPrice',
    'data.priceAssessment.claimedDiscountPct',
    'data.priceAssessment.vsMarketMedianPct',
    'data.priceAssessment.marketMinPrice',
    'data.priceAssessment.marketMedianPrice',
    'data.priceAssessment.marketMaxPrice',
    'data.priceAssessment.historicalMinPrice',
    'data.priceAssessment.historicalMaxPrice',
    'data.priceAssessment.cheaperOfferCount',
    'data.priceAssessment.maxSavingsAmount',
  ]);

  // GET /products documents category=all and brands query parameter (#1830).
  const productParams = paths['/api/v1/rate/products']!.get!
    .parameters as Array<{
    name: string;
    in: string;
    required?: boolean;
    schema: { type: string; enum?: string[]; default?: unknown };
  }>;
  const productCategoryParam = productParams.find((p) => p.name === 'category');
  assert.ok(productCategoryParam, '/products documents category');
  assert.deepEqual(productCategoryParam.schema.enum, [
    'smartphones',
    'tablets',
    'laptops',
    'smartwatches',
    'earbuds',
    'all',
  ]);
  assert.equal(productCategoryParam.schema.default, 'smartphones');
  const productBrandsParam = productParams.find((p) => p.name === 'brands');
  assert.ok(productBrandsParam, '/products documents brands');
  assert.equal(productBrandsParam.in, 'query');
  assert.notEqual(productBrandsParam.required, true);
  assert.equal(productBrandsParam.schema.type, 'string');
  assert.ok(
    productParams.some((p) => p.name === 'brand'),
    '/products keeps brand alias'
  );
  const SAMSUNG_PHONE = {
    ...phoneShaped(
      '99999991-9999-4999-8999-999999991830',
      'samsung-galaxy-s25-256gb',
      'smartphones'
    ),
    brand: 'Samsung',
  };
  const XIAOMI_PHONE = {
    ...phoneShaped(
      '99999992-9999-4999-8999-999999991830',
      'xiaomi-15-256gb',
      'smartphones'
    ),
    brand: 'Xiaomi',
  };
  catalog = [PHONE, SAMSUNG_PHONE, XIAOMI_PHONE];
  const allBrandsList = await listProducts('category=all&brands=Apple,Samsung');
  assert.equal(allBrandsList.status, 200);
  assert.equal(allBrandsList.body.category, 'all');
  assert.equal(searchArgs.p_category_id, undefined);
  assert.deepEqual(searchArgs.p_brands, ['Apple', 'Samsung']);
  assert.deepEqual(
    allBrandsList.body.data.map((p: { brand: string }) => p.brand),
    ['Apple', 'Samsung']
  );
  const aliasBrandList = await listProducts(
    'category=all&brands=&brand=Samsung'
  );
  assert.equal(aliasBrandList.status, 200);
  assert.deepEqual(searchArgs.p_brands, ['Samsung']);
  assert.deepEqual(
    aliasBrandList.body.data.map((p: { brand: string }) => p.brand),
    ['Samsung']
  );

  // GET /reviews documents optional `v` variant size slug under RATE_ITEM_MODEL (#1830).
  const prevItemModelFlag = process.env.RATE_ITEM_MODEL;
  try {
    delete process.env.RATE_ITEM_MODEL;
    const flagOffSpec = buildRateOpenApiSpec('https://rate.vn');
    assert.equal(
      flagOffSpec.paths['/api/v1/rate/reviews']!.get!.parameters!.some(
        (p) => p.name === 'v'
      ),
      false,
      'flag off does not advertise v on /reviews'
    );
    for (const mode of ['item', 'nullable_variant'] as const) {
      process.env.RATE_ITEM_MODEL = mode;
      const flagOnSpec = buildRateOpenApiSpec('https://rate.vn');
      const reviewParams =
        flagOnSpec.paths['/api/v1/rate/reviews']!.get!.parameters!;
      const vParam = reviewParams.find((p) => p.name === 'v');
      assert.ok(vParam, `/reviews documents v when RATE_ITEM_MODEL=${mode}`);
      assert.equal(vParam.in, 'query');
      assert.notEqual(vParam.required, true);
      assert.equal(vParam.schema.type, 'string');
      const slugParam = reviewParams.find((p) => p.name === 'slug');
      assert.match(String(slugParam?.description ?? ''), /Item slug/);
    }
  } finally {
    if (prevItemModelFlag === undefined) delete process.env.RATE_ITEM_MODEL;
    else process.env.RATE_ITEM_MODEL = prevItemModelFlag;
  }

  // GET /openapi returns standard ApiError JSON shape on 500 failures, matching /openapi.json (#1830).
  const openApiRoute = await import('../openapi/route');
  const openApiJsonRoute = await import('../openapi.json/route');
  const loggedErrors: string[] = [];
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args.map(String).join(' '));
  };
  let openApiErrRes: Response;
  let openApiJsonErrRes: Response;
  try {
    openApiErrRes = await openApiRoute.GET({
      get url(): string {
        throw new Error('PGRST116 relation "rate.items" internal leak');
      },
    } as unknown as Request);
    openApiJsonErrRes = await openApiJsonRoute.GET({
      get nextUrl(): never {
        throw new Error('PGRST116 relation "rate.items" internal leak');
      },
    } as unknown as NextRequest);
  } finally {
    console.error = origConsoleError;
  }
  assert.equal(openApiErrRes.status, 500);
  assert.equal(openApiErrRes.headers.get('access-control-allow-origin'), '*');
  assert.equal(loggedErrors.length, 1);
  const openApiErrBody = await openApiErrRes.json();
  const openApiJsonErrBody = await openApiJsonErrRes.json();
  assert.deepEqual(openApiErrBody, {
    ok: false,
    error: 'Failed to build OpenAPI specification',
  });
  assert.deepEqual(openApiErrBody, openApiJsonErrBody);
  assert.equal(
    (okSchema('/api/v1/rate/openapi', 'get', '500') as { $ref?: string }).$ref,
    '#/components/schemas/ApiError'
  );

  // /lookup and /inspect: 429 with Retry-After, and `q` or `url`.
  for (const route of ['/api/v1/rate/lookup', '/api/v1/rate/inspect']) {
    const op = paths[route]!.get!;
    const limited = (op.responses as Json)['429'] as Json;
    assert.ok(limited, `${route} documents 429`);
    assert.ok(
      (limited.headers as Json)['Retry-After'],
      `${route} 429 documents Retry-After`
    );
    assert.match(String(limited.description), /RATE_LIMIT_EXCEEDED/);
    const params = op.parameters as Array<{ name: string; required?: boolean }>;
    for (const name of ['q', 'url']) {
      const param = params.find((p) => p.name === name);
      assert.ok(param, `${route} documents ${name}`);
      assert.notEqual(param.required, true, `${route} ${name} is optional`);
    }
  }
  catalog = [];
  console.warn('  ✅ The OpenAPI document matches the API v1 response bodies');
}

// Inspect and lookup scope masterProduct and suggestions[] to each category's
// template across server helpers and HTTP routes (DOS/Rate#1684).
async function testInspectAndLookupSpecScope() {
  const { NextRequest } = await import('next/server');
  const { getCachedInspectProductOrShopUrl, inspectProductOrShopUrl } =
    await import('@/server/rate');
  const inspectRoute = await import('../inspect/route');
  const lookupRoute = await import('../lookup/route');

  const assertScopedEarbud = (
    product: Record<string, unknown>,
    label: string
  ) => {
    assert.equal(product.slug, EARBUD.slug, label);
    assert.equal(product.ram_gb, null, label);
    assert.equal(product.storage_gb, null, label);
    assert.equal(product.screen_size_inch, null, label);
    assert.equal(product.has_5g, false, label);
    const specs = product.specifications as Record<string, unknown>;
    assert.equal(specs.display, undefined, label);
    assert.equal(specs.camera, undefined, label);
    assert.equal(specs.cellular, undefined, label);
    assert.deepEqual(
      Object.keys((product.key_specs as Record<string, unknown>) ?? {}).sort(),
      ['battery', 'chip'],
      label
    );
  };

  const assertScopedWatch = (
    product: Record<string, unknown>,
    label: string
  ) => {
    assert.equal(product.slug, WATCH.slug, label);
    assert.equal(product.has_5g, false, label);
    assert.equal(product.ram_gb, 1, label);
    assert.equal(product.storage_gb, 64, label);
    assert.equal(product.screen_size_inch, 1, label);
    const specs = product.specifications as Record<string, unknown>;
    assert.equal(specs.camera, undefined, label);
    const cellular = specs.cellular as Record<string, unknown>;
    assert.equal(cellular.has_5g, undefined, label);
    assert.equal(cellular.bands_5g, undefined, label);
    assert.equal(cellular.technology, 'LTE', label);
  };

  try {
    masterRows = [EARBUD, WATCH];
    productRows = [
      {
        id: 'offer-earbud-1',
        cluster_id: EARBUD.id,
        merchant_id: '99999999-9999-4999-8999-999999999999',
        platform_item_id: '999000111',
        availability: 'in_stock',
      },
      {
        id: 'offer-watch-1',
        cluster_id: WATCH.id,
        merchant_id: '99999999-9999-4999-8999-999999999999',
        platform_item_id: '999000222',
        availability: 'in_stock',
      },
    ];
    catalog = [];

    // 1. Server layer (used by SSR /inspect and route handlers): slug + listing URL.
    const cachedBud = await getCachedInspectProductOrShopUrl(EARBUD.slug);
    assert.equal(cachedBud.matchedType, 'master_product');
    assertScopedEarbud(
      cachedBud.masterProduct as unknown as Record<string, unknown>,
      'getCachedInspectProductOrShopUrl earbud slug'
    );

    const directWatch = await inspectProductOrShopUrl(WATCH.slug);
    assert.equal(directWatch.matchedType, 'master_product');
    assertScopedWatch(
      directWatch.masterProduct as unknown as Record<string, unknown>,
      'inspectProductOrShopUrl watch slug'
    );

    const listingBud = await getCachedInspectProductOrShopUrl(
      'https://shopee.vn/product/88201679/999000111'
    );
    assert.equal(listingBud.matchedType, 'product_listing');
    assertScopedEarbud(
      listingBud.masterProduct as unknown as Record<string, unknown>,
      'getCachedInspectProductOrShopUrl earbud listing URL'
    );

    // 2. GET /api/v1/rate/inspect and GET /api/v1/rate/lookup on earbuds & watches.
    const askRoute = async (
      route: typeof inspectRoute | typeof lookupRoute,
      path: string,
      ip: string
    ) => {
      const res = await route.GET(
        new NextRequest(`http://localhost${path}`, {
          headers: { 'x-forwarded-for': ip },
        })
      );
      assert.equal(res.status, 200, path);
      return (await res.json()) as {
        ok: boolean;
        data: {
          matchedType: string;
          masterProduct: Record<string, unknown> | null;
          suggestions: Array<Record<string, unknown>>;
        };
      };
    };

    const inspectBud = await askRoute(
      inspectRoute,
      `/api/v1/rate/inspect?q=${EARBUD.slug}`,
      '198.51.100.41'
    );
    assertScopedEarbud(
      inspectBud.data.masterProduct!,
      'GET /inspect earbud slug'
    );

    const lookupBudListing = await askRoute(
      lookupRoute,
      '/api/v1/rate/lookup?url=https://shopee.vn/product/88201679/999000111',
      '198.51.100.41'
    );
    assert.equal(lookupBudListing.data.matchedType, 'product_listing');
    assertScopedEarbud(
      lookupBudListing.data.masterProduct!,
      'GET /lookup earbud listing URL'
    );

    const inspectWatchListing = await askRoute(
      inspectRoute,
      '/api/v1/rate/inspect?url=https://shopee.vn/product/88201679/999000222',
      '198.51.100.41'
    );
    assert.equal(inspectWatchListing.data.matchedType, 'product_listing');
    assertScopedWatch(
      inspectWatchListing.data.masterProduct!,
      'GET /inspect watch listing URL'
    );

    const lookupWatch = await askRoute(
      lookupRoute,
      `/api/v1/rate/lookup?q=${WATCH.slug}`,
      '198.51.100.41'
    );
    assertScopedWatch(
      lookupWatch.data.masterProduct!,
      'GET /lookup watch slug'
    );

    // 3. Multi-result keyword search and fallback suggestions[] on both routes.
    masterRows = [];
    productRows = [];
    catalog = [EARBUD, WATCH];

    for (const [name, route] of [
      ['inspect', inspectRoute],
      ['lookup', lookupRoute],
    ] as const) {
      const multi = await askRoute(
        route,
        `/api/v1/rate/${name}?q=apple-device-1684`,
        '198.51.100.42'
      );
      assert.equal(multi.data.matchedType, 'search_suggestions', name);
      assert.equal(multi.data.suggestions.length, 2, name);
      const budSuggestion = multi.data.suggestions.find(
        (s) => s.slug === EARBUD.slug
      );
      const watchSuggestion = multi.data.suggestions.find(
        (s) => s.slug === WATCH.slug
      );
      assert.ok(budSuggestion, `${name} earbud suggestion`);
      assert.ok(watchSuggestion, `${name} watch suggestion`);
      assertScopedEarbud(budSuggestion, `${name} suggestions[] earbud`);
      assertScopedWatch(watchSuggestion, `${name} suggestions[] watch`);
    }

    // Fallback suggestions on a query with no search hits (matchedType=not_found).
    let searchCall = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (new URL(url).pathname === '/rest/v1/rpc/search_master_products') {
        searchCall++;
        return jsonResponse(200, searchCall === 1 ? [] : [EARBUD, WATCH]);
      }
      return origFetch(input, init);
    }) as typeof fetch;
    try {
      const miss = await getCachedInspectProductOrShopUrl(
        'unmatched-fallback-1684'
      );
      assert.equal(miss.matchedType, 'not_found');
      assert.equal(miss.masterProduct, null);
      assert.equal(miss.suggestions.length, 2);
      assertScopedEarbud(
        miss.suggestions[0] as unknown as Record<string, unknown>,
        'not_found fallback earbud suggestion'
      );
      assertScopedWatch(
        miss.suggestions[1] as unknown as Record<string, unknown>,
        'not_found fallback watch suggestion'
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    masterRows = [];
    productRows = [];
    catalog = [];
  }
  console.warn(
    '  ✅ Inspect and lookup scope masterProduct and suggestions[] to category templates'
  );
}

// GET /products and GET /compare pass loaded offer counts into saleStateOfMaster
// so sold_out / not_listed / no_stock match GET /products/[slug] (DOS/Rate#1684).
async function testProductsAndCompareSaleStateParity() {
  const { NextRequest } = await import('next/server');
  const detail = await import('../products/[slug]/route');
  const compare = await import('../compare/route');

  const zeroPricePhone = (id: string, slug: string) => ({
    ...phoneShaped(id, slug, 'smartphones'),
    min_price: 0,
    max_price: 0,
    merchant_count: 0,
  });

  const SOLD_OUT = zeroPricePhone(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'apple-iphone-15-sold-out-1684'
  );
  const NOT_LISTED = zeroPricePhone(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'apple-iphone-15-not-listed-1684'
  );
  const UNPRICED_IN_STOCK = zeroPricePhone(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'apple-iphone-15-unpriced-live-1684'
  );

  const makeOfferPair = (
    id: string,
    clusterId: string,
    availability: 'in_stock' | 'out_of_stock' | 'discontinued'
  ) => ({
    trust: {
      id,
      cluster_id: clusterId,
      merchant_id: '99999999-9999-4999-8999-999999999999',
      platform: 'shopee',
      title: 'Stub listing',
      price_current: 14_990_000,
      price_original: 16_990_000,
      stock: availability === 'in_stock' ? 3 : 0,
      rating_star: 4.9,
      rating_count: 12,
      url: 'https://shopee.vn/product/88201679/999000333',
      merchant_name: 'Official Store',
      merchant_is_official: true,
      merchant_location: 'TP.HCM',
      threat_risk_score: 10,
      threat_source: 'combined',
      dosafe_risk_score: 10,
      review_risk_score: 10,
      review_risk_breakdown: { total_reviews: 5 },
    },
    product: {
      id,
      cluster_id: clusterId,
      merchant_id: '99999999-9999-4999-8999-999999999999',
      platform_item_id: id,
      availability,
    },
  });

  const o1 = makeOfferPair('offer-sold-1', SOLD_OUT.id, 'out_of_stock');
  const o2 = makeOfferPair('offer-sold-2', SOLD_OUT.id, 'discontinued');
  const o3 = makeOfferPair('offer-live-1', UNPRICED_IN_STOCK.id, 'in_stock');

  try {
    catalog = [SOLD_OUT, NOT_LISTED, UNPRICED_IN_STOCK];
    masterRows = [SOLD_OUT, NOT_LISTED, UNPRICED_IN_STOCK];
    trustViewRows = [o1.trust, o2.trust, o3.trust];
    productRows = [o1.product, o2.product, o3.product];

    const list = await listProducts('category=smartphones');
    assert.equal(list.status, 200);
    const listStates = new Map(
      (list.body.data as Array<{ slug: string; sale_state: string }>).map(
        (p) => [p.slug, p.sale_state]
      )
    );
    assert.equal(listStates.get(SOLD_OUT.slug), 'sold_out');
    assert.equal(listStates.get(NOT_LISTED.slug), 'not_listed');
    assert.equal(listStates.get(UNPRICED_IN_STOCK.slug), 'no_stock');

    const cmpRes = await compare.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/compare?slugs=${SOLD_OUT.slug},${NOT_LISTED.slug},${UNPRICED_IN_STOCK.slug}`
      )
    );
    assert.equal(cmpRes.status, 200);
    const cmpBody = await cmpRes.json();
    const cmpStates = new Map(
      (cmpBody.data as Array<{ slug: string; sale_state: string }>).map((p) => [
        p.slug,
        p.sale_state,
      ])
    );
    assert.equal(cmpStates.get(SOLD_OUT.slug), 'sold_out');
    assert.equal(cmpStates.get(NOT_LISTED.slug), 'not_listed');
    assert.equal(cmpStates.get(UNPRICED_IN_STOCK.slug), 'no_stock');

    for (const [fixture, expected] of [
      [SOLD_OUT, 'sold_out'],
      [NOT_LISTED, 'not_listed'],
      [UNPRICED_IN_STOCK, 'no_stock'],
    ] as const) {
      const detailRes = await detail.GET(
        new NextRequest(
          `http://localhost/api/v1/rate/products/${fixture.slug}`
        ),
        { params: Promise.resolve({ slug: fixture.slug }) } as never
      );
      assert.equal(detailRes.status, 200, fixture.slug);
      const detailBody = await detailRes.json();
      assert.equal(detailBody.data.product.sale_state, expected, fixture.slug);
      assert.equal(listStates.get(fixture.slug), expected, fixture.slug);
      assert.equal(cmpStates.get(fixture.slug), expected, fixture.slug);
    }
  } finally {
    catalog = [];
    masterRows = [];
    trustViewRows = [];
    productRows = [];
  }
  console.warn(
    '  ✅ API v1 products and compare sale_state match products/[slug]'
  );
}

// DOS/Rate#1699: GET /versus and GET /leaderboard scope specs per category,
// and GET /watchlist reports merchant_count from plausible in-stock offers only.
async function testVersusAndLeaderboardSpecScope() {
  const { NextRequest } = await import('next/server');
  const versus = await import('../versus/route');
  const leaderboard = await import('../leaderboard/route');

  const ratedBud = (id: string, slug: string, rating: number) => ({
    ...phoneShaped(id, slug, 'earbuds'),
    rating_score: rating,
    user_rating_weighted: rating,
    average_rating: rating,
    total_reviews: 25,
    expert_criteria_scores: {
      screen: 9,
      performance: 8.5,
      camera: 9,
      battery: 8,
      value: 8.5,
    },
    metadata: { category_slug: 'earbuds' },
  });
  const ratedWatch = (id: string, slug: string, rating: number) => ({
    ...phoneShaped(id, slug, 'smartwatches'),
    rating_score: rating,
    user_rating_weighted: rating,
    average_rating: rating,
    total_reviews: 25,
    metadata: { category_slug: 'smartwatches' },
  });

  const BUD_A = ratedBud(
    'd1111111-1111-4111-8111-111111111111',
    'apple-airpods-pro-2-1699',
    4.8
  );
  const BUD_B = ratedBud(
    'd2222222-2222-4222-8222-222222222222',
    'sony-wf-1000xm5-1699',
    4.6
  );
  const WATCH_A = ratedWatch(
    'd3333333-3333-4333-8333-333333333333',
    'apple-watch-s10-lte-1699',
    4.7
  );
  const WATCH_B = ratedWatch(
    'd4444444-4444-4444-8444-444444444444',
    'galaxy-watch-7-lte-1699',
    4.5
  );

  try {
    masterRows = [BUD_A, BUD_B];
    const vsBudRes = await versus.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/versus?pair=${BUD_A.slug}-vs-${BUD_B.slug}`
      )
    );
    assert.equal(vsBudRes.status, 200);
    const vsBud = await vsBudRes.json();
    for (const side of [vsBud.product_a, vsBud.product_b]) {
      assert.deepEqual(Object.keys(side.key_specs).sort(), ['battery', 'chip']);
      assert.equal(side.specifications.display, undefined);
      assert.equal(side.specifications.camera, undefined);
      assert.equal(side.specifications.cellular, undefined);
      assert.equal(side.specifications.hardware?.ram_gb, undefined);
      assert.equal(side.specifications.hardware?.storage_gb, undefined);
      assert.equal(side.criteria_scores.screen, null);
    }
    assert.equal(vsBud.compared_criteria.includes('screen'), false);

    masterRows = [WATCH_A, WATCH_B];
    const vsWatchRes = await versus.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/versus?pair=${WATCH_A.slug}-vs-${WATCH_B.slug}`
      )
    );
    assert.equal(vsWatchRes.status, 200);
    const vsWatch = await vsWatchRes.json();
    for (const side of [vsWatch.product_a, vsWatch.product_b]) {
      assert.equal(side.key_specs.camera, undefined);
      assert.equal(side.specifications.camera, undefined);
      assert.equal(side.specifications.cellular?.has_5g, undefined);
      assert.equal(side.specifications.cellular?.bands_5g, undefined);
      assert.equal(side.specifications.cellular?.technology, 'LTE');
    }

    catalog = [BUD_A, BUD_B];
    const lbBudRes = await leaderboard.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/leaderboard?category=earbuds'
      )
    );
    assert.equal(lbBudRes.status, 200);
    const lbBud = await lbBudRes.json();
    assert.equal(lbBud.items.length, 2);
    assert.deepEqual(Object.keys(lbBud.items[0].key_specs).sort(), [
      'battery',
      'chip',
    ]);

    const lbBudScreenQueryRes = await leaderboard.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/leaderboard?category=earbuds&q=1%20inch'
      )
    );
    const lbBudScreenQuery = await lbBudScreenQueryRes.json();
    assert.equal(lbBudScreenQuery.items.length, 0);
    assert.equal(lbBudScreenQuery.total_matched, 0);

    const lbBudChipQueryRes = await leaderboard.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/leaderboard?category=earbuds&q=h2'
      )
    );
    const lbBudChipQuery = await lbBudChipQueryRes.json();
    assert.equal(lbBudChipQuery.items.length, 2);

    catalog = [BUD_A, WATCH_A];
    const lbAllRes = await leaderboard.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/leaderboard?category=all&q=1%20inch'
      )
    );
    const lbAll = await lbAllRes.json();
    assert.deepEqual(
      lbAll.items.map((i: { slug: string }) => i.slug),
      [WATCH_A.slug]
    );
    assert.equal(lbAll.items[0].key_specs.camera, undefined);

    const watchlist = await import('../watchlist/route');
    const SOLD_OUT_WATCHED = {
      ...phoneShaped(
        'd5555555-5555-4555-8555-555555555555',
        'iphone-15-sold-out-watch-1699',
        'smartphones'
      ),
      min_price: 0,
      max_price: 0,
      merchant_count: 0,
    };
    const STALE_COUNT_WATCHED = {
      ...phoneShaped(
        'd6666666-6666-4666-8666-666666666666',
        'iphone-16-fallback-watch-1699',
        'smartphones'
      ),
      min_price: 0,
      max_price: 0,
      merchant_count: 0,
    };
    masterRows = [SOLD_OUT_WATCHED, STALE_COUNT_WATCHED];
    trustViewRows = [
      {
        id: 'w-so-1',
        cluster_id: SOLD_OUT_WATCHED.id,
        merchant_id: 'm1',
        platform: 'shopee',
        title: 'Sold out 1',
        price_current: 18_990_000,
        stock: 0,
        url: 'https://shopee.vn/product/1/10',
        threat_risk_score: 5,
      },
      {
        id: 'w-so-2',
        cluster_id: SOLD_OUT_WATCHED.id,
        merchant_id: 'm2',
        platform: 'lazada',
        title: 'Discontinued 2',
        price_current: 19_490_000,
        stock: 0,
        url: 'https://www.lazada.vn/products/i11.html',
        threat_risk_score: 5,
      },
      {
        id: 'w-live-bait',
        cluster_id: STALE_COUNT_WATCHED.id,
        merchant_id: 'm3',
        platform: 'shopee',
        title: 'Bait case',
        price_current: 500_000,
        stock: 5,
        url: 'https://shopee.vn/product/1/12',
        threat_risk_score: 5,
      },
      {
        id: 'w-live-1',
        cluster_id: STALE_COUNT_WATCHED.id,
        merchant_id: 'm4',
        platform: 'shopee',
        title: 'iPhone 16',
        price_current: 20_990_000,
        stock: 5,
        url: 'https://shopee.vn/product/1/13',
        threat_risk_score: 5,
      },
      {
        id: 'w-live-2',
        cluster_id: STALE_COUNT_WATCHED.id,
        merchant_id: 'm5',
        platform: 'tiki',
        title: 'iPhone 16',
        price_current: 21_490_000,
        stock: 5,
        url: 'https://tiki.vn/iphone-p14.html',
        threat_risk_score: 5,
      },
      {
        id: 'w-live-so',
        cluster_id: STALE_COUNT_WATCHED.id,
        merchant_id: 'm6',
        platform: 'lazada',
        title: 'Sold out iPhone 16',
        price_current: 19_990_000,
        stock: 0,
        url: 'https://www.lazada.vn/products/i15.html',
        threat_risk_score: 5,
      },
    ];
    productRows = [
      {
        id: 'w-so-1',
        cluster_id: SOLD_OUT_WATCHED.id,
        availability: 'out_of_stock',
      },
      {
        id: 'w-so-2',
        cluster_id: SOLD_OUT_WATCHED.id,
        availability: 'discontinued',
      },
      {
        id: 'w-live-bait',
        cluster_id: STALE_COUNT_WATCHED.id,
        availability: 'in_stock',
      },
      {
        id: 'w-live-1',
        cluster_id: STALE_COUNT_WATCHED.id,
        availability: 'in_stock',
      },
      {
        id: 'w-live-2',
        cluster_id: STALE_COUNT_WATCHED.id,
        availability: 'in_stock',
      },
      {
        id: 'w-live-so',
        cluster_id: STALE_COUNT_WATCHED.id,
        availability: 'out_of_stock',
      },
    ];
    const watchRes = await watchlist.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/watchlist?slugs=${SOLD_OUT_WATCHED.slug},${STALE_COUNT_WATCHED.slug}`
      )
    );
    assert.equal(watchRes.status, 200);
    const watchJson = await watchRes.json();
    assert.equal(watchJson.items[SOLD_OUT_WATCHED.slug].current_min_price, 0);
    assert.equal(watchJson.items[SOLD_OUT_WATCHED.slug].best_offer, null);
    assert.equal(watchJson.items[SOLD_OUT_WATCHED.slug].merchant_count, 0);
    assert.equal(watchJson.items[SOLD_OUT_WATCHED.slug].platform_count, 0);
    assert.equal(
      watchJson.items[STALE_COUNT_WATCHED.slug].current_min_price,
      20_990_000
    );
    assert.equal(watchJson.items[STALE_COUNT_WATCHED.slug].merchant_count, 2);
    assert.equal(watchlist.resolveWatchlistMerchantCount(3, 0, 0), 0);
    assert.equal(watchlist.resolveWatchlistMerchantCount(0, 0, 0), 0);
  } finally {
    masterRows = [];
    catalog = [];
    trustViewRows = [];
    productRows = [];
  }
  console.warn(
    '  ✅ API v1 versus, leaderboard and watchlist enforce spec and offer truth'
  );
}

// DOS/Rate#1765: Reject embedded control-char digit joining & hex/octal versus weights,
// guard unpriced 0 VND strikethroughs & unavailable genuine_deal verdicts, and resolve
// Item-model slugs / @variant_key tokens across versus, compare, and extension topRival.
async function testControlCharsUnavailableVerdictsAndItemRouting() {
  // 1. Numeric query parsers preserve leading/trailing control-char trimming
  // while rejecting embedded control-char/whitespace digit joining and hex/octal weights.
  assert.equal(parseFiniteDecimalInput('\u000036'), 36);
  assert.equal(parseFiniteDecimalInput(' \u000025000000\n '), 25_000_000);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('2\u00005000000')), true);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('1\t0')), true);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('1\n0')), true);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('0x10')), true);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('-0b101')), true);
  assert.equal(Number.isNaN(parseFiniteDecimalInput('0o77')), true);

  assert.equal(parseBoundedIntParam('\u000036', 24, 1, 100), 36);
  assert.equal(parseBoundedIntParam('1\t0', 24, 1, 100), 24);
  assert.equal(parseBoundedIntParam('3\u00006', 24, 1, 100), 24);
  assert.equal(parseBoundedNumberParam('\u00004.5', 0, 5), 4.5);
  assert.equal(parseBoundedNumberParam('4\u0000.5', 0, 5), undefined);
  assert.equal(parseOptionalVndPriceParam('\u000025000000'), 25_000_000);
  assert.equal(parseOptionalVndPriceParam('2\u00005000000'), null);
  assert.equal(parseOptionalVndPriceParam('1\t000000'), null);
  assert.deepEqual(
    parseBoundedPositiveIntArrayParam('1\u00002,\u000016,2\t4,32', 128),
    [16, 32]
  );

  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: 'iphone-16', limit: '1\u00000' })
    ),
    null
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: 'iphone-16', limit: '1\t0' })
    ),
    null
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: 'iphone-\u000016', limit: '20' })
    ),
    null
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({
        masterProductId: '11111111-\u00001111-4111-8111-111111111111',
      })
    ),
    null
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: '\u0000iphone-16\n', limit: '\u000020' })
    )?.limit,
    20
  );

  assert.equal(
    parseProductsFilterBounds(
      new URLSearchParams({ category: 'smart\u0000phones' })
    ),
    null
  );
  assert.equal(
    parseProductsFilterBounds(
      new URLSearchParams({
        category: '\u0000smartphones\t',
        minPrice: '2\u00005000000',
      })
    )?.minPrice,
    undefined
  );

  assert.equal(resolveWatchlistMerchantCount('1\u00005', 2, 20_000_000), 2);
  assert.equal(resolveWatchlistMerchantCount('1\t0', 2, 20_000_000), 2);
  assert.equal(resolveWatchlistMerchantCount('0x10', 2, 20_000_000), 2);
  assert.equal(resolveWatchlistMerchantCount('\u00005', 2, 20_000_000), 5);

  assert.equal(
    parseVersusQueryParams(
      new URLSearchParams({ pair: 'iphone-\u000016-vs-galaxy-s25' })
    ),
    null
  );
  assert.deepEqual(
    parseCompareSlugsParam('apple-iphone-16@128gb,samsung-galaxy-s25@512gb'),
    ['apple-iphone-16@128gb', 'samsung-galaxy-s25@512gb']
  );

  // 2. resolveInspectObservedPrices never pairs masterMinPrice with an unpriced
  // matchedOffer's price_original, and evaluateExtensionPriceVerdict suppresses
  // genuine_deal on unavailable offers unless a live caller price overrode it.
  assert.deepEqual(
    resolveInspectObservedPrices({
      queryPrice: null,
      queryOriginalPrice: null,
      matchedOfferPriceCurrent: 0,
      matchedOfferPriceOriginal: 32_000_000,
      masterMinPrice: 21_000_000,
    }),
    { observedPrice: 21_000_000, observedOriginalPrice: 0 }
  );
  assert.deepEqual(
    resolveInspectObservedPrices({
      queryPrice: null,
      queryOriginalPrice: null,
      matchedOfferPriceCurrent: '2\u00002000000',
      matchedOfferPriceOriginal: 32_000_000,
      masterMinPrice: 21_000_000,
    }),
    { observedPrice: 21_000_000, observedOriginalPrice: 0 }
  );

  const mkMerchantOffer = (
    id: string,
    priceCurrent: number | string,
    availability: 'in_stock' | 'out_of_stock' | 'discontinued',
    priceOriginal: number | null = null
  ) =>
    ({
      id,
      merchant: {
        id: `m-${id}`,
        name: `Shop ${id}`,
        platform: 'shopee',
        is_official: true,
        trust_score: 90,
        risk_score: 10,
      },
      platform: 'shopee',
      platform_item_id: id,
      title: `Phone ${id}`,
      price_current: priceCurrent as number,
      price_original: priceOriginal,
      stock: availability === 'in_stock' ? 5 : 0,
      availability,
      rating_star: 4.9,
      rating_count: 20,
      url: `https://shopee.vn/product/88201679/${id}`,
    }) as never;

  const mixedOffers = [
    mkMerchantOffer('99176501', 17_990_000, 'out_of_stock'),
    mkMerchantOffer('99176502', 18_200_000, 'discontinued'),
    mkMerchantOffer('99176503', 21_500_000, 'out_of_stock', 29_990_000),
    mkMerchantOffer('99176504', 21_000_000, 'in_stock'),
    mkMerchantOffer('99176505', 22_000_000, 'in_stock'),
  ];

  const soldOutStoredVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 17_990_000,
    observedOriginalPrice: null,
    offers: mixedOffers,
    observedOfferId: '99176501',
    priceHistory: null,
  });
  assert.equal(soldOutStoredVerdict.verdict, 'fair_market_price');

  const discontinuedStoredVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 18_200_000,
    observedOriginalPrice: null,
    offers: mixedOffers,
    observedOfferId: '99176502',
    priceHistory: null,
  });
  assert.equal(discontinuedStoredVerdict.verdict, 'fair_market_price');

  const soldOutFakeSaleVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 21_500_000,
    observedOriginalPrice: 29_990_000,
    offers: mixedOffers,
    observedOfferId: '99176503',
    priceHistory: null,
  });
  assert.equal(soldOutFakeSaleVerdict.verdict, 'inflated_fake_sale');

  const liveOverrideVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 17_990_000,
    observedOriginalPrice: null,
    offers: mixedOffers,
    observedOfferId: '99176501',
    hasLiveObservedPrice: true,
    priceHistory: null,
  });
  assert.equal(liveOverrideVerdict.verdict, 'genuine_deal');

  // Embedded control-char price_current in all-sold-out fallback median is ignored,
  // while leading control-char price_current is preserved.
  const allSoldOutControlVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 500_000,
    observedOriginalPrice: null,
    offers: [
      mkMerchantOffer('so-bait', 500_000, 'out_of_stock'),
      mkMerchantOffer('so-corrupt', '2\u00005000000', 'out_of_stock'),
      mkMerchantOffer('so-clean-lead', '\u000020000000', 'out_of_stock'),
      mkMerchantOffer('so-clean-2', 22_000_000, 'discontinued'),
    ],
    observedOfferId: 'so-bait',
    priceHistory: null,
  });
  assert.equal(allSoldOutControlVerdict.implausiblyLow, true);
  assert.equal(
    allSoldOutControlVerdict.messageParams?.marketMedianPrice,
    21_000_000
  );

  // 3. Route-level verification for inspect, versus weights, extension topRival,
  // and RATE_ITEM_MODEL Item slugs + @variant_key tokens on versus and compare.
  const ITEM_IPHONE = 'a1111111-1111-4111-8111-111111111765';
  const ITEM_GALAXY = 'a2222222-2222-4222-8222-222222221765';
  const V_IP_128 = {
    ...phoneShaped(
      'b1111111-1111-4111-8111-111111111128',
      'apple-iphone-16-128gb-1765',
      'smartphones'
    ),
    item_id: ITEM_IPHONE,
    name: 'Apple iPhone 16 128GB',
    brand: 'Apple',
    model: 'iPhone 16',
    model_key: 'apple:iphone-16-1765:128gb',
    variant_key: '128gb',
    variant_name: '128GB',
    storage_gb: 128,
    min_price: 20_990_000,
    max_price: 21_990_000,
    merchant_count: 2,
    rating_score: 4.8,
    user_rating_weighted: 4.8,
    average_rating: 4.8,
    total_reviews: 30,
    expert_criteria_scores: {
      screen: 8.8,
      performance: 9.2,
      camera: 8.9,
      battery: 8.5,
      value: 8.6,
    },
  };
  const V_IP_256 = {
    ...V_IP_128,
    id: 'b1111111-1111-4111-8111-111111111256',
    slug: 'apple-iphone-16-256gb-1765',
    name: 'Apple iPhone 16 256GB',
    model_key: 'apple:iphone-16-1765:256gb',
    variant_key: '256gb',
    variant_name: '256GB',
    storage_gb: 256,
    min_price: 23_990_000,
    max_price: 24_990_000,
  };
  const V_S25_256 = {
    ...phoneShaped(
      'b2222222-2222-4222-8222-222222222256',
      'samsung-galaxy-s25-256gb-1765',
      'smartphones'
    ),
    item_id: ITEM_GALAXY,
    name: 'Samsung Galaxy S25 256GB',
    brand: 'Samsung',
    model: 'Galaxy S25',
    model_key: 'samsung:galaxy-s25-1765:256gb',
    variant_key: '256gb',
    variant_name: '256GB',
    storage_gb: 256,
    min_price: 19_990_000,
    max_price: 20_990_000,
    merchant_count: 2,
    rating_score: 4.7,
    user_rating_weighted: 4.7,
    average_rating: 4.7,
    total_reviews: 25,
    expert_criteria_scores: {
      screen: 9.0,
      performance: 9.0,
      camera: 8.6,
      battery: 8.4,
      value: 8.9,
    },
  };
  const V_S25_512 = {
    ...V_S25_256,
    id: 'b2222222-2222-4222-8222-222222222512',
    slug: 'samsung-galaxy-s25-512gb-1765',
    name: 'Samsung Galaxy S25 512GB',
    model_key: 'samsung:galaxy-s25-1765:512gb',
    variant_key: '512gb',
    variant_name: '512GB',
    storage_gb: 512,
    min_price: 22_990_000,
    max_price: 23_990_000,
  };

  const prevFlag = process.env.RATE_ITEM_MODEL;
  try {
    delete process.env.RATE_ITEM_MODEL;
    masterRows = [V_IP_128, V_IP_256, V_S25_256, V_S25_512];
    catalog = [V_IP_128, V_IP_256, V_S25_256];
    trustViewRows = [
      {
        id: 'off-zero-orig',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-zero',
        platform: 'shopee',
        title: 'Apple iPhone 16 128GB Unpriced',
        price_current: 0,
        price_original: 32_000_000,
        stock: 0,
        url: 'https://shopee.vn/product/88201679/77176501',
        merchant_name: 'Zero Shop',
        merchant_is_official: false,
        threat_risk_score: 10,
      },
      {
        id: 'off-sold-low',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-sold',
        platform: 'shopee',
        title: 'Apple iPhone 16 128GB Sold Out',
        price_current: 17_990_000,
        price_original: null,
        stock: 0,
        url: 'https://shopee.vn/product/88201679/77176502',
        merchant_name: 'Sold Shop',
        merchant_is_official: true,
        threat_risk_score: 5,
      },
      {
        id: 'off-live-1',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-live-1',
        platform: 'shopee',
        title: 'Apple iPhone 16 128GB Official',
        price_current: 20_990_000,
        price_original: null,
        stock: 5,
        url: 'https://shopee.vn/product/88201679/77176503',
        merchant_name: 'Apple Flagship',
        merchant_is_official: true,
        threat_risk_score: 5,
      },
      {
        id: 'off-live-2',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-live-2',
        platform: 'lazada',
        title: 'Apple iPhone 16 128GB Mall',
        price_current: 21_490_000,
        price_original: null,
        stock: 5,
        url: 'https://www.lazada.vn/products/i77176504.html',
        merchant_name: 'LazMall',
        merchant_is_official: true,
        threat_risk_score: 5,
      },
    ];
    productRows = [
      {
        id: 'off-zero-orig',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-zero',
        platform_item_id: '88201679_77176501',
        availability: 'out_of_stock',
      },
      {
        id: 'off-sold-low',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-sold',
        platform_item_id: '88201679_77176502',
        availability: 'out_of_stock',
      },
      {
        id: 'off-live-1',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-live-1',
        platform_item_id: '88201679_77176503',
        availability: 'in_stock',
      },
      {
        id: 'off-live-2',
        cluster_id: V_IP_128.id,
        merchant_id: 'm-live-2',
        platform_item_id: '77176504',
        availability: 'in_stock',
      },
    ];

    // Inspect on 0 VND sold-out listing never pairs its 32M price_original with
    // masterMinPrice AND never awards genuine_deal when masterMinPrice == histMin.
    const fullTrustRows = trustViewRows;
    const fullProductRows = productRows;
    trustViewRows = fullTrustRows.filter((r) => r.id !== 'off-sold-low');
    productRows = fullProductRows.filter((r) => r.id !== 'off-sold-low');
    const zeroInspectRes = await inspectRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/inspect?url=https://shopee.vn/product/88201679/77176501',
        { headers: { 'x-forwarded-for': '198.51.100.91' } }
      )
    );
    assert.equal(zeroInspectRes.status, 200);
    const zeroInspectBody = await zeroInspectRes.json();
    assert.equal(zeroInspectBody.data.priceVerdict.observedOriginalPrice, null);
    assert.equal(
      zeroInspectBody.data.priceVerdict.verdict,
      'fair_market_price'
    );
    trustViewRows = fullTrustRows;
    productRows = fullProductRows;

    // Inspect on out-of-stock listing suppresses genuine_deal unless ?price= overrides it.
    const soldInspectRes = await inspectRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/inspect?url=https://shopee.vn/product/88201679/77176502',
        { headers: { 'x-forwarded-for': '198.51.100.92' } }
      )
    );
    assert.equal(soldInspectRes.status, 200);
    const soldInspectBody = await soldInspectRes.json();
    assert.equal(
      soldInspectBody.data.priceVerdict.verdict,
      'fair_market_price'
    );

    const liveInspectRes = await inspectRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/inspect?url=https://shopee.vn/product/88201679/77176502&price=17990000',
        { headers: { 'x-forwarded-for': '198.51.100.93' } }
      )
    );
    assert.equal(liveInspectRes.status, 200);
    const liveInspectBody = await liveInspectRes.json();
    assert.equal(liveInspectBody.data.priceVerdict.verdict, 'genuine_deal');

    // Versus route rejects hex/octal/binary and embedded control-char weights,
    // while preserving leading control-char trimming.
    const badWeightsRes = await versusRouteStatic.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/versus?pair=${V_IP_128.slug}-vs-${V_S25_256.slug}&w_screen=0x40&w_performance=0o77&w_camera=0b1010&w_battery=3%005&w_value=1%090`
      )
    );
    assert.equal(badWeightsRes.status, 200);
    const badWeightsBody = await badWeightsRes.json();
    assert.equal(badWeightsBody.applied_persona, 'default');
    assert.deepEqual(badWeightsBody.applied_weights, {
      screen: 20,
      performance: 20,
      camera: 20,
      battery: 20,
      value: 20,
    });

    const trimmedWeightRes = await versusRouteStatic.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/versus?pair=${V_IP_128.slug}-vs-${V_S25_256.slug}&w_screen=%0060&w_camera=0`
      )
    );
    assert.equal(trimmedWeightRes.status, 200);
    const trimmedWeightBody = await trimmedWeightRes.json();
    assert.equal(trimmedWeightBody.applied_persona, 'custom');

    // Extension lookup with flag off skips sibling 256GB variant and picks Samsung rival.
    const offLookup = await lookupExtensionProduct({
      url: 'https://shopee.vn/product/88201679/77176502',
      title: 'Apple iPhone 16 128GB',
      mode: 'pill',
    });
    assert.equal(offLookup.priceAssessment.verdict, 'fair_market_price');
    assert.equal(offLookup.topRivalName, V_S25_256.name);
    assert.equal(
      offLookup.versusUrl,
      `/compare/${V_IP_128.slug}-vs-${V_S25_256.slug}`
    );

    // Sibling-only peers produce no self/sibling topRival.
    catalog = [V_IP_128, V_IP_256];
    const siblingOnlyLookup = await lookupExtensionProduct({
      url: 'https://shopee.vn/product/88201679/77176503',
      title: 'Apple iPhone 16 128GB',
      mode: 'pill',
    });
    assert.equal(siblingOnlyLookup.topRivalName, null);
    assert.equal(siblingOnlyLookup.versusUrl, null);

    // Enable RATE_ITEM_MODEL: extension topRival, /versus, and /compare resolve Item slugs & @variant_key.
    process.env.RATE_ITEM_MODEL = 'item';
    itemRows = [
      {
        id: ITEM_IPHONE,
        item_key: 'apple:iphone-16-1765',
        slug: 'apple-iphone-16-1765',
        name: 'Apple iPhone 16',
        brand: 'Apple',
        model: 'iPhone 16',
        category_id: 'cat-1',
        status: 'published',
        default_variant_id: V_IP_256.id,
        min_price: 20_990_000,
        max_price: 24_990_000,
        price_variant_count: 2,
        merchant_count: 2,
        listing_count: 3,
        unknown_variant_listing_count: 0,
        updated_at: '2026-11-19T00:00:00Z',
      },
      {
        id: ITEM_GALAXY,
        item_key: 'samsung:galaxy-s25-1765',
        slug: 'samsung-galaxy-s25-1765',
        name: 'Samsung Galaxy S25',
        brand: 'Samsung',
        model: 'Galaxy S25',
        category_id: 'cat-1',
        status: 'published',
        default_variant_id: V_S25_256.id,
        min_price: 19_990_000,
        max_price: 23_990_000,
        price_variant_count: 2,
        merchant_count: 2,
        listing_count: 2,
        unknown_variant_listing_count: 0,
        updated_at: '2026-11-19T00:00:00Z',
      },
    ];
    catalog = [V_IP_128, V_IP_256, V_S25_256];

    const onLookup = await lookupExtensionProduct({
      url: 'https://shopee.vn/product/88201679/77176503',
      title: 'Apple iPhone 16 128GB',
      mode: 'pill',
    });
    assert.equal(onLookup.topRivalName, V_S25_256.name);
    assert.equal(
      onLookup.versusUrl,
      '/compare/apple-iphone-16-1765-vs-samsung-galaxy-s25-1765'
    );

    const vsItemRes = await versusRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/versus?pair=samsung-galaxy-s25-1765-vs-apple-iphone-16-1765'
      )
    );
    assert.equal(vsItemRes.status, 200);
    const vsItemBody = await vsItemRes.json();
    assert.equal(vsItemBody.product_a.slug, V_S25_256.slug);
    assert.equal(vsItemBody.product_b.slug, V_IP_256.slug);
    assert.equal(
      vsItemBody.versus_url,
      '/compare/apple-iphone-16-1765-vs-samsung-galaxy-s25-1765'
    );

    const vsPinnedRes = await versusRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/versus?slugA=apple-iphone-16-1765@128gb&slugB=samsung-galaxy-s25-1765@512gb'
      )
    );
    assert.equal(vsPinnedRes.status, 200);
    const vsPinnedBody = await vsPinnedRes.json();
    assert.equal(vsPinnedBody.product_a.slug, V_IP_128.slug);
    assert.equal(vsPinnedBody.product_b.slug, V_S25_512.slug);
    assert.equal(
      vsPinnedBody.versus_url,
      '/compare/apple-iphone-16-1765-vs-samsung-galaxy-s25-1765'
    );

    const vsSameItemRes = await versusRouteStatic.GET(
      new NextRequest(
        `http://localhost/api/v1/rate/versus?pair=${V_IP_128.slug}-vs-${V_IP_256.slug}`
      )
    );
    assert.equal(vsSameItemRes.status, 404);

    const vsSamePinnedItemRes = await versusRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/versus?pair=apple-iphone-16-1765@128gb-vs-apple-iphone-16-1765@256gb'
      )
    );
    assert.equal(vsSamePinnedItemRes.status, 404);

    const cmpItemRes = await compareRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/compare?slugs=apple-iphone-16-1765,samsung-galaxy-s25-1765'
      )
    );
    assert.equal(cmpItemRes.status, 200);
    const cmpItemBody = await cmpItemRes.json();
    assert.deepEqual(
      cmpItemBody.data.map((p: { slug: string }) => p.slug),
      [V_IP_256.slug, V_S25_256.slug]
    );
    assert.deepEqual(cmpItemBody.not_found_slugs, []);
    assert.deepEqual(cmpItemBody.excluded_cross_category_slugs, []);

    const cmpPinnedRes = await compareRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/compare?slugs=apple-iphone-16-1765@128gb,apple-iphone-16-1765@256gb,samsung-galaxy-s25-1765@512gb'
      )
    );
    assert.equal(cmpPinnedRes.status, 200);
    const cmpPinnedBody = await cmpPinnedRes.json();
    assert.deepEqual(
      cmpPinnedBody.data.map((p: { slug: string }) => p.slug),
      [V_IP_128.slug, V_S25_512.slug]
    );
    assert.deepEqual(cmpPinnedBody.not_found_slugs, []);

    // Unresolved tokens paired with a valid Item slug stay in not_found_slugs,
    // legacy _prefix masters still compare, underscore variant_key pins resolve,
    // and diagnostic arrays report the caller's requested tokens.
    const LEGACY_UNDERSCORE = {
      ...V_S25_256,
      id: 'b3333333-3333-4333-8333-333333331765',
      item_id: null,
      slug: '_legacy-phone-1765',
      name: 'Legacy Phone 1765',
      model: 'Legacy 1765',
      model_key: 'legacy:phone-1765:256gb',
    };
    const V_S25_CELLULAR = {
      ...V_S25_512,
      id: 'b2222222-2222-4222-8222-222222222999',
      slug: 'samsung-galaxy-s25-256gb-cellular-1765',
      name: 'Samsung Galaxy S25 256GB Cellular',
      model_key: 'samsung:galaxy-s25-1765:256gb_cellular',
      variant_key: '256gb_cellular',
      variant_name: '256GB Cellular',
    };
    const CROSS_WATCH_ITEM = 'a9999999-9999-4999-8999-999999991765';
    const V_WATCH_64 = {
      ...phoneShaped(
        'b9999999-9999-4999-8999-999999991765',
        'apple-watch-cross-64gb-1765',
        'smartwatches'
      ),
      item_id: CROSS_WATCH_ITEM,
      variant_key: '64gb',
      variant_name: '64GB',
    };
    masterRows = [
      V_IP_128,
      V_IP_256,
      V_S25_256,
      V_S25_512,
      V_S25_CELLULAR,
      LEGACY_UNDERSCORE,
      V_WATCH_64,
    ];
    itemRows = [
      ...itemRows,
      {
        id: CROSS_WATCH_ITEM,
        item_key: 'apple:watch-cross-1765',
        slug: 'apple-watch-cross-1765',
        name: 'Apple Watch Cross',
        brand: 'Apple',
        model: 'Watch Cross',
        category_id: 'cat-1',
        status: 'published',
        default_variant_id: V_WATCH_64.id,
        min_price: 9_990_000,
        max_price: 9_990_000,
        price_variant_count: 1,
        merchant_count: 1,
        listing_count: 1,
        unknown_variant_listing_count: 0,
        updated_at: '2026-11-19T00:00:00Z',
      },
    ];

    const cmpMixedMissingRes = await compareRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/compare?slugs=apple-iphone-16-1765@128gb,_legacy-phone-1765,apple-watch-cross-1765@64gb,missing-1765@64gb'
      )
    );
    assert.equal(cmpMixedMissingRes.status, 200);
    const cmpMixedMissingBody = await cmpMixedMissingRes.json();
    assert.deepEqual(
      cmpMixedMissingBody.data.map((p: { slug: string }) => p.slug),
      [V_IP_128.slug, LEGACY_UNDERSCORE.slug]
    );
    assert.deepEqual(cmpMixedMissingBody.excluded_cross_category_slugs, [
      'apple-watch-cross-1765@64gb',
    ]);
    assert.deepEqual(cmpMixedMissingBody.not_found_slugs, [
      'missing-1765@64gb',
    ]);

    const vsUnderscorePinRes = await versusRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/versus?slugA=apple-iphone-16-1765@128gb&slugB=samsung-galaxy-s25-1765@256gb_cellular'
      )
    );
    assert.equal(vsUnderscorePinRes.status, 200);
    const vsUnderscorePinBody = await vsUnderscorePinRes.json();
    assert.equal(vsUnderscorePinBody.product_a.slug, V_IP_128.slug);
    assert.equal(vsUnderscorePinBody.product_b.slug, V_S25_CELLULAR.slug);
    assert.equal(
      vsUnderscorePinBody.versus_url,
      '/compare/apple-iphone-16-1765-vs-samsung-galaxy-s25-1765'
    );

    const vsLegacyMixRes = await versusRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/versus?pair=_legacy-phone-1765-vs-apple-iphone-16-1765'
      )
    );
    assert.equal(vsLegacyMixRes.status, 200);
    const vsLegacyMixBody = await vsLegacyMixRes.json();
    assert.equal(vsLegacyMixBody.product_a.slug, LEGACY_UNDERSCORE.slug);
    assert.equal(vsLegacyMixBody.product_b.slug, V_IP_256.slug);
    assert.equal(
      vsLegacyMixBody.versus_url,
      '/compare/_legacy-phone-1765-vs-apple-iphone-16-1765'
    );

    // Sub-0.5 VND ?price=0.1 rounds to 0 -> null, never overriding an out-of-stock verdict.
    assert.equal(parseOptionalVndPriceParam('0.1'), null);
    const subVndInspectRes = await inspectRouteStatic.GET(
      new NextRequest(
        'http://localhost/api/v1/rate/inspect?url=https://shopee.vn/product/88201679/77176502&price=0.1',
        { headers: { 'x-forwarded-for': '198.51.100.94' } }
      )
    );
    assert.equal(subVndInspectRes.status, 200);
    const subVndInspectBody = await subVndInspectRes.json();
    assert.equal(
      subVndInspectBody.data.priceVerdict.verdict,
      'fair_market_price'
    );

    // Distinct Watch models sharing coarse brand + model strings (46mm vs 42mm)
    // but distinct item_ids / model_key prefixes remain eligible topRivals.
    delete process.env.RATE_ITEM_MODEL;
    const WATCH_46 = {
      ...phoneShaped(
        'c4600000-0000-4000-8000-000000001765',
        'apple-watch-s11-46mm-1765',
        'smartwatches'
      ),
      item_id: 'a4600000-0000-4000-8000-000000001765',
      name: 'Apple Watch Series 11 46mm',
      brand: 'Apple',
      model: 'Watch Series 11',
      model_key: 'apple:watch-s11-46mm-1765:64gb',
      storage_gb: 64,
    };
    const WATCH_42 = {
      ...WATCH_46,
      id: 'c4200000-0000-4000-8000-000000001765',
      item_id: 'a4200000-0000-4000-8000-000000001765',
      slug: 'apple-watch-s11-42mm-1765',
      name: 'Apple Watch Series 11 42mm',
      model_key: 'apple:watch-s11-42mm-1765:64gb',
    };
    masterRows = [V_IP_128, WATCH_46, WATCH_42];
    catalog = [WATCH_46, WATCH_42];
    const watchLookup = await lookupExtensionProduct({
      title: 'Apple Watch Series 11 46mm 64GB',
      mode: 'pill',
    });
    assert.equal(watchLookup.topRivalName, WATCH_42.name);
    assert.equal(
      watchLookup.versusUrl,
      `/compare/${WATCH_42.slug}-vs-${WATCH_46.slug}`
    );

    // POST /api/v1/rate/watchlist rejects hex, embedded control-char, and boolean
    // targetPrice inputs while trimming leading control chars.
    const validBearer = 'stub-bearer-token-1765';
    const postWatchlistAlert = (targetPrice: unknown) =>
      watchlistRouteStatic.POST(
        new NextRequest('http://localhost/api/v1/rate/watchlist', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${validBearer}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            slug: V_IP_128.slug,
            targetPrice,
          }),
        })
      );
    for (const badPrice of ['2\u00005000000', '0x100000', true]) {
      const badRes = await postWatchlistAlert(badPrice);
      assert.equal(badRes.status, 400, `targetPrice=${String(badPrice)}`);
    }
    const okLeadCtrlRes = await postWatchlistAlert('\u000020000000');
    assert.equal(okLeadCtrlRes.status, 200);
  } finally {
    if (prevFlag === undefined) delete process.env.RATE_ITEM_MODEL;
    else process.env.RATE_ITEM_MODEL = prevFlag;
    itemRows = [];
    masterRows = [];
    catalog = [];
    trustViewRows = [];
    productRows = [];
  }
  console.warn(
    '  ✅ Control-char numeric guards, unavailable offer verdicts and Item-model routing verified (#1765)'
  );
}

async function main() {
  console.warn('🧪 API v1 category spec view suite (DOS/Rate#1184)');
  await testProductFilters();
  await testDetailAndCompare();
  await testExtensionLookup();
  await testModelMatch();
  await testInspectAndLookupSpecScope();
  await testProductsAndCompareSaleStateParity();
  await testVersusAndLeaderboardSpecScope();
  await testSpecMatchesBodies();
  await testBoundedInputs();
  await testInspectRateLimit();
  await testExtensionRateLimit();
  await testControlCharsUnavailableVerdictsAndItemRouting();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
