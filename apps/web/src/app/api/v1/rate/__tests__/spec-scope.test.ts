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
// What a `merchants` read answers (merchant list and directory routes).
let merchantRows: unknown[] = [];
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
    return jsonResponse(200, masterRows);
  }
  if (pathname === '/rest/v1/merchants') {
    // Paged reads (`.range()`) end on a short page.
    const params = new URL(url).searchParams;
    const from = Number(params.get('offset') ?? 0);
    const size = Number(params.get('limit') ?? merchantRows.length);
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
  expectPaths('/api/v1/rate/versus', await vs.json(), [
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

  // The extension lookup answers its result under `data` (route not run
  // here: the lookup itself is covered above).
  const extLookup = okSchema('/api/v1/rate/extension/lookup');
  for (const key of radarDetail) {
    assert.ok(specSchemaAt(spec, extLookup, ['data', 'radarSignal', key]));
  }
  assert.equal(specSchemaAt(spec, extLookup, ['radar_signal']), null);

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

async function main() {
  console.warn('🧪 API v1 category spec view suite (DOS/Rate#1184)');
  await testProductFilters();
  await testDetailAndCompare();
  await testExtensionLookup();
  await testSpecMatchesBodies();
  await testInspectRateLimit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
