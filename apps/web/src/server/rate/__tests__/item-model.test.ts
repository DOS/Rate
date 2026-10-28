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
// Answer as a database without M1+M2 (PostgREST schema-cache miss).
let schemaMissing = false;
// Answer as a database whose master_products lacks the M2 columns.
let variantColumnsMissing = false;
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
  if (schemaMissing && url.pathname === '/rest/v1/items') {
    return new Response(
      JSON.stringify({
        code: 'PGRST205',
        message: "Could not find the table 'rate.items' in the schema cache",
      }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    );
  }
  if (variantColumnsMissing && url.pathname === '/rest/v1/master_products') {
    return new Response(
      JSON.stringify({
        code: '42703',
        message: 'column master_products.sort_order does not exist',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }
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
        return json([{ ...variantRow(V128, 128, null), status: 'published' }]);
      if (q.includes('slug=eq.apple-iphone-16-unknown'))
        return json([
          {
            ...variantRow(V128, 128, null),
            slug: 'apple-iphone-16-unknown',
            variant_key: 'unknown',
            storage_gb: null,
            status: 'archived',
          },
        ]);
      // A published master the backfill has not linked to an Item yet.
      if (q.includes('slug=eq.samsung-galaxy-s24-256gb'))
        return json([
          {
            ...variantRow(V128, 256, null),
            item_id: null,
            slug: 'samsung-galaxy-s24-256gb',
            status: 'published',
          },
        ]);
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
      resolution: {
        kind: 'variant',
        item,
        variant: variants[0]!,
        retired: false,
      },
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
      resolution: { kind: 'variant', item, variant: shared, retired: false },
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
    item,
    variants,
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
  // A sold-out default size (256gb) gives way to the first priced one.
  assert.equal(
    (
      render(
        null,
        variants.map((v) => (v.id === V256 ? { ...v, min_price: 0 } : v))
      ) as { variantKey: string }
    ).variantKey,
    '128gb'
  );
  // A retired size redirects to the Item with no size preselected.
  assert.deepEqual(
    planItemRoute({
      ...base,
      resolution: {
        kind: 'variant',
        item,
        variant: {
          ...variants[0]!,
          slug: 'apple-iphone-16-unknown',
          variant_key: 'unknown',
        },
        retired: true,
      },
      requestedSlug: 'apple-iphone-16-unknown',
      requestedVariant: null,
    }),
    { kind: 'redirect', to: '/smartphones/apple-iphone-16' }
  );
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
  const retired = await api.resolveCatalogSlug('apple-iphone-16-unknown');
  assert.equal(retired?.kind === 'variant' && retired.retired, true);
  assert.ok(
    calls.some((c) => c.includes('status=in.(published,archived)')),
    'old variant URLs include retired ones'
  );
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
  // An Item URL renders its default variant; ?v= is applied client-side.
  const itemPlan = await resolveItemRoute({
    slug: 'apple-iphone-16',
    categoryBasePath: '/smartphones',
  });
  assert.equal(itemPlan?.kind === 'render' && itemPlan.variantKey, '256gb');
  assert.deepEqual(
    await resolveItemRoute({
      slug: 'apple-iphone-16-unknown',
      categoryBasePath: '/smartphones',
    }),
    { kind: 'redirect', to: '/smartphones/apple-iphone-16' }
  );
  // Flag on without M1+M2: the page falls back to today's variant page.
  schemaMissing = true;
  await assert.rejects(
    () => api.resolveCatalogSlug('apple-iphone-16-256gb'),
    (err: unknown) => err instanceof api.ItemModelUnavailableError
  );
  assert.equal(
    await resolveItemRoute({
      slug: 'apple-iphone-16-256gb',
      categoryBasePath: '/smartphones',
    }),
    null
  );
  schemaMissing = false;
  // Variant columns missing behind a readable Item: same fallback.
  variantColumnsMissing = true;
  await assert.rejects(
    () => api.getItemVariants(ITEM_ID),
    (err: unknown) => err instanceof api.ItemModelUnavailableError
  );
  assert.equal(
    await resolveItemRoute({
      slug: 'apple-iphone-16',
      categoryBasePath: '/smartphones',
    }),
    null
  );
  variantColumnsMissing = false;
  // A master with no Item yet keeps its page instead of a 404.
  assert.deepEqual(await api.resolveCatalogSlug('samsung-galaxy-s24-256gb'), {
    kind: 'unlinked',
    item: null,
    variant: null,
  });
  assert.equal(
    await resolveItemRoute({
      slug: 'samsung-galaxy-s24-256gb',
      categoryBasePath: '/smartphones',
    }),
    null
  );
  assert.ok(
    resolveRevalidationTargets({
      slugs: ['apple-iphone-16-128gb'],
    }).tags.includes(productCacheTag('apple-iphone-16'))
  );
  delete process.env.RATE_ITEM_MODEL;

  // Product routes stay ISR whatever the flag: no request-time API (query
  // string, headers, cookies) and no dynamic opt-in. `?v=` is client-side.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const productRouteFiles = [
    'smartphones',
    'earbuds',
    'laptops',
    'smartwatches',
    'tablets',
  ].map((c) =>
    path.resolve(__dirname, `../../../app/[locale]/${c}/[slug]/page.tsx`)
  );
  // The Item page reads `?v=` in the browser (window.location), never through
  // useSearchParams, which would need a Suspense bailout (#1154).
  for (const file of [
    'selected-variant.ts',
    'ItemVariantPicker.tsx',
    'ItemVariantPanels.tsx',
  ].map((f) =>
    path.resolve(__dirname, `../../../components/product/item/${f}`)
  )) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      /useSearchParams|useRouter|searchParams:/,
      file
    );
  }
  for (const file of [
    ...productRouteFiles,
    path.resolve(__dirname, '../item-route.ts'),
    path.resolve(__dirname, '../item-page.ts'),
  ]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /searchParams|\bheaders\(|\bcookies\(/, file);
    assert.doesNotMatch(src, /export const dynamic\b|force-dynamic/, file);
  }
  for (const file of productRouteFiles) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export const revalidate = 300;/, file);
    assert.match(src, /export function generateStaticParams\(/, file);
  }
  // Item page helpers (#1154).
  const page = await import('../../../lib/item-page');
  assert.equal(
    page.itemVariantLabel({ variant_key: '256gb', storage_gb: 256 }),
    '256GB'
  );
  assert.equal(
    page.itemVariantLabel({ variant_key: '1024gb', storage_gb: 1024 }),
    '1TB'
  );
  assert.equal(page.itemVariantLabel({ variant_key: '1tb' }), '1TB');
  assert.equal(
    page.itemVariantLabel({
      variant_key: '256gb',
      variant_name: '256GB Titan',
    }),
    '256GB Titan'
  );
  assert.equal(page.itemVariantLabel({ variant_key: 'standard' }), 'standard');
  assert.equal(page.cleanVariantKey(' 256GB '), '256gb');
  assert.equal(page.cleanVariantKey('../x'), null);
  assert.equal(page.cleanVariantKey(['256gb']), null);
  assert.deepEqual(
    page
      .withoutItemSiblings(
        [
          { slug: 'apple-iphone-16-128gb' },
          { slug: 'samsung-galaxy-s24-256gb' },
        ],
        ['apple-iphone-16-128gb', 'apple-iphone-16-256gb']
      )
      .map((p) => p.slug),
    ['samsung-galaxy-s24-256gb'],
    'same-Item sizes are no competitors'
  );
  const group = page.buildItemProductGroupNode({
    itemKey: 'apple:iphone-16',
    name: 'Apple iPhone 16',
    brand: 'Apple',
    canonicalUrl: 'https://rate.vn/smartphones/apple-iphone-16',
    description: 'd',
    images: [],
    variants: [
      {
        variantKey: '128gb',
        label: '128GB',
        minPrice: 21990000,
        maxPrice: 23000000,
        sellerCount: 3,
      },
      {
        variantKey: '256gb',
        label: '256GB',
        minPrice: 0,
        maxPrice: 0,
        sellerCount: 0,
      },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      reviewCount: 10,
    },
  }) as {
    '@type': string;
    url: string;
    variesBy: string[];
    aggregateRating?: unknown;
    hasVariant: {
      sku: string;
      url: string;
      size: string;
      offers?: { lowPrice: number; offerCount: number };
    }[];
  };
  assert.equal(group['@type'], 'ProductGroup');
  assert.equal(group.url, 'https://rate.vn/smartphones/apple-iphone-16');
  assert.deepEqual(group.variesBy, ['https://schema.org/size']);
  assert.ok(group.aggregateRating, 'one Item-level rating');
  assert.equal(group.hasVariant[0]!.sku, 'apple:iphone-16:128gb');
  assert.equal(
    group.hasVariant[0]!.url,
    'https://rate.vn/smartphones/apple-iphone-16?v=128gb'
  );
  assert.equal(group.hasVariant[0]!.offers?.lowPrice, 21990000);
  assert.equal(group.hasVariant.length, 1, 'a size with no price is left out');
  assert.deepEqual(
    page.itemFromStats([
      { min_price: 24990000, max_price: 25990000, merchant_count: 2 },
      { min_price: 21990000, max_price: 23990000, merchant_count: 4 },
      { min_price: 0, max_price: 0, merchant_count: 0 },
    ]),
    { minPrice: 21990000, maxPrice: 25990000, sellerCount: 4 }
  );
  assert.deepEqual(page.itemFromStats([{ min_price: null }]), {
    minPrice: 0,
    maxPrice: 0,
    sellerCount: 0,
  });
  console.warn('✅ Item web data layer suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
