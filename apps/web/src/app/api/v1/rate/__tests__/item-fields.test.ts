/**
 * API v1 and the extension lookup under the Item model (DOS/Rate#1158,
 * design doc 5.2), against a stubbed PostgREST in the M1+M2 shape (#1150):
 * - flag off: no Item read, and the same bytes as before (no new keys);
 * - flag on, Item tables missing: the same bytes as flag off;
 * - flag on: `/products/{slug}` adds `item`, `variants`, `selected_variant`
 *   and `unknown_variant_offers`; `/products?group=item` lists Items;
 * - the extension lookup returns every size of the Item from the DB, no
 *   invented 256GB, the Item URL, and a listing with no stated size.
 */
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const ITEM_ID = '11111111-1111-4111-8111-111111111158';
const V128 = '22222222-2222-4222-8222-222222222128';
const V256 = '22222222-2222-4222-8222-222222222256';
const UNKNOWN_LISTING = '33333333-3333-4333-8333-333333333333';
const MERCHANT = '44444444-4444-4444-8444-444444444444';

const itemRow = {
  id: ITEM_ID,
  item_key: 'apple:iphone-16',
  slug: 'apple-iphone-16',
  name: 'Apple iPhone 16',
  brand: 'Apple',
  model: 'iPhone 16',
  category_id: null,
  default_variant_id: V256,
  min_price: 21990000,
  max_price: 25990000,
  price_variant_count: 2,
  merchant_count: 3,
  listing_count: 4,
  unknown_variant_listing_count: 1,
  updated_at: '2026-10-29T00:00:00Z',
};

// A published variant row: the master's own columns plus the M2 ones.
const master = (id: string, gb: number) => ({
  id,
  item_id: ITEM_ID,
  slug: `apple-iphone-16-${gb}gb`,
  name: `Apple iPhone 16 ${gb}GB`,
  brand: 'Apple',
  model: 'iPhone 16',
  status: 'published',
  variant_key: `${gb}gb`,
  variant_name: `${gb}GB`,
  sort_order: null,
  storage_gb: gb,
  ram_gb: 8,
  min_price: gb === 128 ? 21990000 : 24990000,
  max_price: gb === 128 ? 23990000 : 25990000,
  merchant_count: 2,
  specifications: { category_slug: 'smartphones' },
  key_specs: {},
});
const M128 = master(V128, 128);
const M256 = master(V256, 256);

let calls: string[] = [];
let schemaMissing = false;
// What the catalogue search RPC answers (the extension's model guess).
let catalog: unknown[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  const q = decodeURIComponent(url.search);
  calls.push(`${url.pathname}?${q}`);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/*' },
    });
  if (Number(url.searchParams.get('offset') ?? 0) > 0) return json([]);
  const itemTable =
    url.pathname === '/rest/v1/items' ||
    (url.pathname === '/rest/v1/master_products' &&
      (q.includes('item_id') || q.includes('variant_key'))) ||
    (url.pathname === '/rest/v1/products' && q.includes('item_id'));
  if (schemaMissing && itemTable) {
    return new Response(
      JSON.stringify({
        code: 'PGRST205',
        message: "Could not find the table 'rate.items' in the schema cache",
      }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    );
  }
  switch (url.pathname) {
    case '/rest/v1/rpc/search_master_products':
      return json(catalog);
    case '/rest/v1/items':
      if (/slug=eq\.apple-iphone-16(&|$)/.test(q)) return json([itemRow]);
      if (q.includes(`id=eq.${ITEM_ID}`)) return json([itemRow]);
      if (!q.includes('slug=') && !q.includes('id=eq.')) return json([itemRow]);
      return json([]);
    case '/rest/v1/master_products':
      if (q.includes('slug=eq.apple-iphone-16-128gb')) return json([M128]);
      if (q.includes('slug=eq.apple-iphone-16-256gb')) return json([M256]);
      if (q.includes(`item_id=eq.${ITEM_ID}`) || q.includes(ITEM_ID))
        return json([M256, M128]);
      return json([]);
    case '/rest/v1/products':
      if (
        q.includes('cluster_id=is.null') &&
        q.includes(`item_id=eq.${ITEM_ID}`)
      )
        return json([{ id: UNKNOWN_LISTING, availability: 'in_stock' }]);
      if (q.includes('cluster_id=is.null') && q.includes('platform_item_id'))
        return json(
          q.includes('999888777')
            ? [{ item_id: ITEM_ID, platform_item_id: '999888777' }]
            : []
        );
      return json([]);
    case '/rest/v1/v_products_with_merchant_trust':
      if (q.includes(UNKNOWN_LISTING))
        return json([
          {
            id: UNKNOWN_LISTING,
            cluster_id: null,
            merchant_id: MERCHANT,
            platform: 'shopee',
            title: 'iPhone 16 chính hãng',
            price_current: 20990000,
            price_original: null,
            stock: 5,
            rating_star: 5,
            rating_count: 1,
            url: 'https://shopee.vn/product/1/999888777',
            merchant_name: 'Shop',
            merchant_is_official: false,
            merchant_trust_score: 90,
          },
        ]);
      return json([]);
    default:
      return json([]);
  }
}) as typeof fetch;

async function detail(slug: string, query = '') {
  const { NextRequest } = await import('next/server');
  const route = await import('../products/[slug]/route');
  calls = [];
  const res = await route.GET(
    new NextRequest(`http://localhost/api/v1/rate/products/${slug}${query}`),
    { params: Promise.resolve({ slug }) } as never
  );
  return { status: res.status, text: await res.text() };
}

async function list(query: string) {
  const { NextRequest } = await import('next/server');
  const route = await import('../products/route');
  calls = [];
  const res = await route.GET(
    new NextRequest(`http://localhost/api/v1/rate/products?${query}`)
  );
  return { status: res.status, text: await res.text() };
}

const setFlag = (value: string | undefined) => {
  if (value === undefined) delete process.env.RATE_ITEM_MODEL;
  else process.env.RATE_ITEM_MODEL = value;
};

async function testFlagOffUnchanged() {
  setFlag(undefined);
  const off = await detail('apple-iphone-16-128gb');
  assert.equal(off.status, 200);
  assert.ok(!calls.some((c) => c.startsWith('/rest/v1/items')));
  const body = JSON.parse(off.text);
  for (const key of [
    'item',
    'variants',
    'selected_variant',
    'unknown_variant_offers',
  ]) {
    assert.ok(!(key in body.data), `flag off adds no ${key}`);
  }
  // An Item slug is no product while the flag is off.
  assert.equal((await detail('apple-iphone-16')).status, 404);

  // Flag on but M1+M2 missing: the same bytes as flag off.
  setFlag('item');
  schemaMissing = true;
  const missing = await detail('apple-iphone-16-128gb');
  assert.equal(missing.text, off.text);
  schemaMissing = false;

  // `group=item` with the flag off answers the variant list, byte for byte.
  setFlag(undefined);
  catalog = [M128, M256];
  const plain = await list('category=all');
  const grouped = await list('category=all&group=item');
  assert.equal(grouped.text, plain.text);

  const { lookupExtensionProduct } = await import('@/server/rate/extension');
  calls = [];
  const lookup = await lookupExtensionProduct({
    title: 'Apple iPhone 16',
    mode: 'pill',
  });
  assert.ok(!('item' in lookup) && !('selectedVariant' in lookup));
  assert.equal(lookup.productDetailUrl, '/smartphones/apple-iphone-16-128gb');
  assert.ok(!calls.some((c) => c.startsWith('/rest/v1/items')));
  catalog = [];
  console.warn(
    '  ✅ Flag off (and flag on without M1+M2): responses unchanged'
  );
}

async function testDetailItemFields() {
  setFlag('item');
  // An Item slug answers its default variant (256GB) with the Item fields.
  let res = await detail('apple-iphone-16');
  assert.equal(res.status, 200);
  let data = JSON.parse(res.text).data;
  assert.equal(data.product.slug, 'apple-iphone-16-256gb');
  assert.equal(data.item.slug, 'apple-iphone-16');
  assert.equal(data.item.unknown_variant_listing_count, 1);
  assert.ok(!('default_variant_id' in data.item), 'internal columns stay out');
  assert.deepEqual(
    data.variants.map((v: { variant_key: string }) => v.variant_key),
    ['128gb', '256gb']
  );
  assert.equal(data.selected_variant, '256gb');
  assert.equal(data.unknown_variant_offers.length, 1);
  assert.equal(data.unknown_variant_offers[0].id, UNKNOWN_LISTING);

  // `?v=` picks the size; an old variant slug keeps its own.
  data = JSON.parse((await detail('apple-iphone-16', '?v=128gb')).text).data;
  assert.equal(data.product.slug, 'apple-iphone-16-128gb');
  assert.equal(data.selected_variant, '128gb');
  data = JSON.parse((await detail('apple-iphone-16-128gb')).text).data;
  assert.equal(data.product.slug, 'apple-iphone-16-128gb');
  assert.equal(data.item.slug, 'apple-iphone-16');
  // An unknown `?v=` falls back to the slug's own size.
  data = JSON.parse(
    (await detail('apple-iphone-16-128gb', '?v=9tb')).text
  ).data;
  assert.equal(data.selected_variant, '128gb');
  res = await detail('apple-iphone-17');
  assert.equal(res.status, 404);
  console.warn('  ✅ /products/{slug} adds the Item fields with the flag on');
}

async function testGroupItem() {
  setFlag('item');
  let res = await list('category=all&group=item');
  assert.equal(res.status, 200);
  let body = JSON.parse(res.text);
  assert.equal(body.group, 'item');
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].slug, 'apple-iphone-16');
  assert.deepEqual(
    body.data[0].variants.map((v: { variant_key: string }) => v.variant_key),
    ['128gb', '256gb']
  );
  const itemsCall = calls.find((c) => c.startsWith('/rest/v1/items'))!;
  assert.match(itemsCall, /status=eq\.published/);

  // Filters reach the Item query; spec filters are per variant: 400.
  res = await list(
    'category=all&group=item&q=iphone%2516&minPrice=1000000&sort=price_asc'
  );
  assert.equal(res.status, 200);
  const filtered = calls.find((c) => c.startsWith('/rest/v1/items'))!;
  // The "%" the caller sent is no wildcard: only the two the query adds.
  assert.match(filtered, /name=ilike\.%iphone\+16%&/);
  assert.match(filtered, /min_price=gte\.1000000/);
  assert.match(filtered, /order=min_price\.asc/);
  for (const query of [
    'ram=8',
    'has5g=1',
    'sort=rating_desc',
    'storageGb=256',
  ]) {
    res = await list(`category=all&group=item&${query}`);
    assert.equal(res.status, 400, query);
    assert.ok(!calls.some((c) => c.startsWith('/rest/v1/items')), query);
  }

  // Without `group=item`, the flag-on list is the variant list.
  catalog = [M128];
  body = JSON.parse((await list('category=all')).text);
  assert.equal(body.group, undefined);
  assert.equal(body.data[0].slug, 'apple-iphone-16-128gb');
  catalog = [];
  console.warn('  ✅ /products?group=item lists Items with the flag on');
}

async function testExtensionLookup() {
  setFlag('item');
  const { lookupExtensionProduct } = await import('@/server/rate/extension');
  // No size in the title: every size of the Item, none chosen, the Item URL.
  catalog = [M128];
  let lookup = await lookupExtensionProduct({
    title: 'Apple iPhone 16',
    mode: 'pill',
  });
  assert.equal(lookup.item?.slug, 'apple-iphone-16');
  assert.equal(lookup.selectedVariant, null);
  assert.equal(lookup.matchStatus, 'ambiguous_variant');
  assert.deepEqual(
    lookup.variantCandidates.map((v) => [v.storageGb, v.label]),
    [
      [128, '128GB'],
      [256, '256GB'],
    ]
  );
  assert.equal(lookup.productDetailUrl, '/smartphones/apple-iphone-16');

  // A stated size picks that variant, even when the search guessed another.
  lookup = await lookupExtensionProduct({
    title: 'Apple iPhone 16 256GB',
    mode: 'pill',
  });
  assert.equal(lookup.masterProduct?.slug, 'apple-iphone-16-256gb');
  assert.equal(lookup.selectedVariant, '256gb');
  assert.notEqual(lookup.matchStatus, 'ambiguous_variant');
  assert.equal(lookup.productDetailUrl, '/smartphones/apple-iphone-16?v=256gb');

  // A listing with no variant (cluster_id NULL) is still its Item's.
  catalog = [];
  lookup = await lookupExtensionProduct({
    url: 'https://shopee.vn/product/1/999888777',
    title: 'iPhone 16 chính hãng',
    mode: 'pill',
  });
  assert.equal(lookup.item?.slug, 'apple-iphone-16');
  assert.equal(lookup.selectedVariant, null);
  assert.equal(lookup.matchStatus, 'ambiguous_variant');
  assert.equal(lookup.masterProduct?.slug, 'apple-iphone-16-256gb');
  assert.equal(lookup.variantCandidates.length, 2);
  setFlag(undefined);
  console.warn('  ✅ Extension lookup returns the Item and all its sizes');
}

async function main() {
  console.warn('🧪 API v1 Item fields suite (DOS/Rate#1158)');
  await testFlagOffUnchanged();
  await testDetailItemFields();
  await testGroupItem();
  await testExtensionLookup();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
