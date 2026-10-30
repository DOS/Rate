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
let calls: string[] = [];
// The last `search_master_products` arguments, to see the filters reach SQL.
let searchArgs: Record<string, unknown> = {};

const jsonResponse = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  calls.push(url);
  const { pathname } = new URL(url);
  if (pathname === '/rest/v1/categories') {
    return jsonResponse(200, [{ id: 'cat-1' }]);
  }
  if (pathname === '/rest/v1/rpc/search_master_products') {
    searchArgs = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const from = Number(searchArgs.p_offset ?? 0);
    return jsonResponse(
      200,
      catalog.slice(from, from + Number(searchArgs.p_limit ?? 200))
    );
  }
  if (pathname === '/rest/v1/master_products') {
    // Honour a slug filter (`eq.` or `in.(...)`) so unknown slugs miss.
    const slugFilter = new URL(url).searchParams.get('slug');
    const wanted = slugFilter?.startsWith('eq.')
      ? [slugFilter.slice(3)]
      : slugFilter?.startsWith('in.(')
        ? slugFilter
            .slice(4, -1)
            .split(',')
            .map((s) => s.replace(/^"|"$/g, ''))
        : null;
    return jsonResponse(
      200,
      wanted
        ? masterRows.filter((row) =>
            wanted.includes((row as { slug: string }).slug)
          )
        : masterRows
    );
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

async function main() {
  console.warn('🧪 API v1 category spec view suite (DOS/Rate#1184)');
  await testProductFilters();
  await testDetailAndCompare();
  await testExtensionLookup();
  await testBoundedInputs();
  await testInspectRateLimit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
