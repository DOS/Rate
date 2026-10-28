/**
 * Item web data layer behind RATE_ITEM_MODEL (DOS/Rate#1153). rate.items does
 * not exist in prod yet (#1150), so the flag-on path runs against a stubbed
 * PostgREST built from the M1+M2 draft in PR #1242.
 */
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const ITEM_ID = '11111111-1111-4111-8111-111111111153';
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
const variantRow = (id: string, gb: number, sort: number | null) => ({
  id,
  item_id: ITEM_ID,
  slug: `apple-iphone-16-${gb}gb`,
  name: `Apple iPhone 16 ${gb}GB`,
  variant_key: `${gb}gb`,
  variant_name: `${gb}GB`,
  sort_order: sort,
  storage_gb: gb,
  min_price: gb === 128 ? 21990000 : 24990000,
  max_price: gb === 128 ? 23990000 : 25990000,
  merchant_count: 2,
});

let calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  calls.push(`${url.pathname}?${decodeURIComponent(url.search)}`);
  const q = decodeURIComponent(url.search);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/*' },
    });
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (offset > 0) return json([]);
  switch (url.pathname) {
    case '/rest/v1/items':
      if (
        q.includes('slug=eq.apple-iphone-16&') ||
        q.endsWith('slug=eq.apple-iphone-16')
      )
        return json([itemRow]);
      if (q.includes(`id=eq.${ITEM_ID}`)) return json([itemRow]);
      return json([]);
    case '/rest/v1/master_products':
      if (q.includes('slug=eq.apple-iphone-16-128gb'))
        return json([variantRow(V128, 128, null)]);
      if (q.includes(`item_id=eq.${ITEM_ID}`))
        return json([variantRow(V256, 256, null), variantRow(V128, 128, null)]);
      return json([]);
    case '/rest/v1/products':
      if (
        q.includes(`item_id=eq.${ITEM_ID}`) &&
        q.includes('cluster_id=is.null')
      )
        return json([{ id: UNKNOWN_LISTING, availability: 'in_stock' }]);
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
            url: 'https://shopee.vn/product/1/2',
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

async function main() {
  console.warn('🧪 Item web data layer suite (DOS/Rate#1153)');
  const flag = await import('../item-model');
  const { planItemRoute, resolveWebItemModelMode, sanitizeVariantParam } = flag;

  // 1. The flag reads like the importer's: anything unknown is off.
  assert.equal(resolveWebItemModelMode(undefined), 'off');
  assert.equal(resolveWebItemModelMode('ITEM'), 'item');
  assert.equal(resolveWebItemModelMode('nullable-variant'), 'nullable_variant');
  assert.equal(resolveWebItemModelMode('on'), 'off');
  assert.equal(sanitizeVariantParam(['256GB']), '256gb');
  assert.equal(sanitizeVariantParam('../x'), null);

  // 2. Flag off: no Item read at all, and no extra cache tag.
  delete process.env.RATE_ITEM_MODEL;
  const { resolveItemRoute } = await import('../item-route');
  const { resolveRevalidationTargets, productCacheTag } =
    await import('../cache-tags');
  calls = [];
  assert.equal(
    await resolveItemRoute({
      slug: 'apple-iphone-16-128gb',
      categoryBasePath: '/smartphones',
      // Throws only if awaited: flag off must not read the query string.
      searchParams: {
        then() {
          throw new Error('must not be read');
        },
      } as unknown as Promise<Record<string, string>>,
    }),
    null
  );
  assert.deepEqual(calls, [], 'flag off reads nothing');
  assert.ok(
    !resolveRevalidationTargets({
      slugs: ['apple-iphone-16-128gb'],
    }).tags.includes(productCacheTag('apple-iphone-16'))
  );

  // 3. Route plans (Q1).
  const { sortItemVariants } = await import('../../../lib/rate-api');
  const item = { ...itemRow } as never;
  const variants = sortItemVariants([
    variantRow(V256, 256, null),
    variantRow(V128, 128, null),
  ] as never);
  assert.deepEqual(
    variants.map((v) => v.variant_key),
    ['128gb', '256gb'],
    'sized variants by storage'
  );
  const base = { categoryBasePath: '/smartphones', variants };
  assert.deepEqual(
    planItemRoute({
      ...base,
      resolution: null,
      requestedSlug: 'x',
      requestedVariant: null,
    }),
    { kind: 'not_found' }
  );
  assert.deepEqual(
    planItemRoute({
      ...base,
      resolution: { kind: 'variant', item, variant: variants[0]! },
      requestedSlug: 'apple-iphone-16-128gb',
      requestedVariant: null,
    }),
    { kind: 'redirect', to: '/smartphones/apple-iphone-16?v=128gb' }
  );
  // A single-variant Item that shares its variant's slug renders, no loop.
  const shared = { ...variants[0]!, slug: 'apple-iphone-16' };
  assert.equal(
    planItemRoute({
      ...base,
      resolution: { kind: 'variant', item, variant: shared },
      requestedSlug: 'apple-iphone-16',
      requestedVariant: null,
    }).kind,
    'render'
  );
  const render = (v: string | null, vs = variants) =>
    planItemRoute({
      ...base,
      variants: vs,
      resolution: { kind: 'item', item, variant: null },
      requestedSlug: 'apple-iphone-16',
      requestedVariant: v,
    });
  assert.deepEqual(render('128gb'), {
    kind: 'render',
    variantSlug: 'apple-iphone-16-128gb',
    itemSlug: 'apple-iphone-16',
    variantKey: '128gb',
  });
  assert.equal(
    (render(null) as { variantKey: string }).variantKey,
    '256gb',
    'default variant'
  );
  assert.equal(
    (render('1024gb') as { variantKey: string }).variantKey,
    '256gb',
    'an unknown ?v= falls back to the default'
  );
  assert.equal(render(null, []).kind, 'not_found');
  assert.equal(
    flag.itemSlugFromVariantSlug('apple-iphone-16-1024gb'),
    'apple-iphone-16'
  );
  assert.equal(
    flag.itemSlugFromVariantSlug('sony-wf-1000xm5-unknown'),
    'sony-wf-1000xm5'
  );
  assert.equal(
    flag.itemSlugFromVariantSlug('garmin-forerunner-265'),
    'garmin-forerunner-265'
  );

  // 4. Flag on: the data layer against the M1+M2 shape.
  process.env.RATE_ITEM_MODEL = 'item';
  const api = await import('../../../lib/rate-api');
  calls = [];
  const byVariant = await api.resolveCatalogSlug('apple-iphone-16-128gb');
  assert.equal(byVariant?.kind, 'variant');
  assert.equal(byVariant?.item.slug, 'apple-iphone-16');
  assert.equal(byVariant?.variant?.variant_key, '128gb');
  assert.ok(
    calls.some(
      (c) =>
        c.startsWith('/rest/v1/items?') && c.includes('status=eq.published')
    )
  );
  const byItem = await api.resolveCatalogSlug('apple-iphone-16');
  assert.equal(byItem?.kind, 'item');
  assert.equal(await api.resolveCatalogSlug('no-such-slug'), null);
  assert.equal(await api.resolveCatalogSlug('../etc'), null);

  const itemVariants = await api.getItemVariants(ITEM_ID);
  assert.deepEqual(
    itemVariants.map((v) => v.variant_key),
    ['128gb', '256gb']
  );
  const offers = await api.getItemOffers(ITEM_ID, itemVariants);
  assert.equal(offers.unknownVariant.length, 1);
  assert.equal(offers.unknownVariant[0]?.id, UNKNOWN_LISTING);
  assert.equal(offers.unknownVariant[0]?.availability, 'in_stock');
  assert.ok(
    calls.some(
      (c) =>
        c.startsWith('/rest/v1/products?') && c.includes('cluster_id=is.null')
    ),
    'the unknown group reads listings with no variant'
  );

  // 5. Flag on: an old variant URL plans a 308, and revalidating it busts the Item.
  const plan = await resolveItemRoute({
    slug: 'apple-iphone-16-128gb',
    categoryBasePath: '/smartphones',
  });
  assert.deepEqual(plan, {
    kind: 'redirect',
    to: '/smartphones/apple-iphone-16?v=128gb',
  });
  const itemPlan = await resolveItemRoute({
    slug: 'apple-iphone-16',
    categoryBasePath: '/smartphones',
    searchParams: Promise.resolve({ v: '128gb' }),
  });
  assert.equal(itemPlan?.kind, 'render');
  assert.ok(
    resolveRevalidationTargets({
      slugs: ['apple-iphone-16-128gb'],
    }).tags.includes(productCacheTag('apple-iphone-16'))
  );
  delete process.env.RATE_ITEM_MODEL;
  console.warn('✅ Item web data layer suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
