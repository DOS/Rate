import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MasterProduct } from '@repo/shared-data';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const testDir = dirname(fileURLToPath(import.meta.url));

const CATEGORY_SMARTPHONES = 'c0000000-0000-4000-8000-000000000001';
const ITEM_IPHONE = '11111111-1111-4111-8111-111111111801';
const ITEM_GALAXY = '11111111-1111-4111-8111-111111111802';
const V_IPHONE_256 = '22222222-2222-4222-8222-222222222256';
const V_IPHONE_512 = '22222222-2222-4222-8222-222222222512';
const V_GALAXY_256 = '22222222-2222-4222-8222-222222223256';
const V_XIAOMI_LONE = '22222222-2222-4222-8222-222222224256';

function makePhone(
  id: string,
  slug: string,
  name: string,
  brand: string,
  minPrice: number,
  maxPrice: number,
  ratingScore: number,
  expertRating: number,
  storageGb: number | null = 256
): MasterProduct {
  return {
    id,
    slug,
    name,
    brand,
    model: name,
    model_key: `${brand.toLowerCase()}:${slug}`,
    variant_name: storageGb ? `${storageGb}GB` : null,
    category_id: CATEGORY_SMARTPHONES,
    status: 'published',
    storage_gb: storageGb,
    ram_gb: 12,
    min_price: minPrice,
    max_price: maxPrice,
    merchant_count: 3,
    rating_score: ratingScore,
    user_rating_weighted: ratingScore,
    average_rating: ratingScore,
    expert_rating: expertRating,
    authentic_review_count: 18,
    total_reviews: 20,
    images: [],
    thumbnail: null,
    key_specs: {
      screen: '6.9" LTPO OLED 120Hz',
      chip: 'Flagship SoC',
      battery: '5000 mAh',
    },
    metadata: { category_slug: 'smartphones' },
    specifications: {
      category_slug: 'smartphones',
    } as MasterProduct['specifications'],
  } as unknown as MasterProduct;
}

const CATALOG_ROWS: MasterProduct[] = [
  makePhone(
    V_IPHONE_512,
    'apple-iphone-16-pro-max-512gb',
    'Apple iPhone 16 Pro Max 512GB',
    'Apple',
    34_990_000,
    36_990_000,
    4.9,
    9.4,
    512
  ),
  makePhone(
    V_IPHONE_256,
    'apple-iphone-16-pro-max-256gb',
    'Apple iPhone 16 Pro Max 256GB',
    'Apple',
    29_990_000,
    31_990_000,
    4.9,
    9.4,
    256
  ),
  makePhone(
    V_GALAXY_256,
    'samsung-galaxy-s25-ultra-256gb',
    'Samsung Galaxy S25 Ultra 256GB',
    'Samsung',
    27_990_000,
    33_990_000,
    4.8,
    9.2,
    256
  ),
  makePhone(
    V_XIAOMI_LONE,
    'xiaomi-15-ultra',
    'Xiaomi 15 Ultra',
    'Xiaomi',
    24_990_000,
    25_990_000,
    4.7,
    9.0,
    512
  ),
];

const ITEM_ROWS = [
  {
    id: ITEM_IPHONE,
    item_key: 'apple:iphone-16-pro-max',
    slug: 'apple-iphone-16-pro-max',
    name: 'Apple iPhone 16 Pro Max',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    category_id: CATEGORY_SMARTPHONES,
    default_variant_id: V_IPHONE_256,
    min_price: 29_990_000,
    max_price: 36_990_000,
    price_variant_count: 2,
    merchant_count: 8,
    listing_count: 10,
    unknown_variant_listing_count: 0,
    updated_at: '2026-11-20T00:00:00Z',
  },
  {
    id: ITEM_GALAXY,
    item_key: 'samsung:galaxy-s25-ultra',
    slug: 'samsung-galaxy-s25-ultra',
    name: 'Samsung Galaxy S25 Ultra',
    brand: 'Samsung',
    model: 'Galaxy S25 Ultra',
    category_id: CATEGORY_SMARTPHONES,
    default_variant_id: V_GALAXY_256,
    min_price: 27_990_000,
    max_price: 33_990_000,
    price_variant_count: 1,
    merchant_count: 6,
    listing_count: 7,
    unknown_variant_listing_count: 0,
    updated_at: '2026-11-20T00:00:00Z',
  },
];

const ITEM_VARIANT_ROWS = [
  {
    id: V_IPHONE_256,
    item_id: ITEM_IPHONE,
    slug: 'apple-iphone-16-pro-max-256gb',
    name: 'Apple iPhone 16 Pro Max 256GB',
    variant_key: '256gb',
    variant_name: '256GB',
    sort_order: 1,
    storage_gb: 256,
    min_price: 29_990_000,
    max_price: 31_990_000,
    merchant_count: 5,
  },
  {
    id: V_IPHONE_512,
    item_id: ITEM_IPHONE,
    slug: 'apple-iphone-16-pro-max-512gb',
    name: 'Apple iPhone 16 Pro Max 512GB',
    variant_key: '512gb',
    variant_name: '512GB',
    sort_order: 2,
    storage_gb: 512,
    min_price: 34_990_000,
    max_price: 36_990_000,
    merchant_count: 3,
  },
  {
    id: V_GALAXY_256,
    item_id: ITEM_GALAXY,
    slug: 'samsung-galaxy-s25-ultra-256gb',
    name: 'Samsung Galaxy S25 Ultra 256GB',
    variant_key: '256gb',
    variant_name: '256GB',
    sort_order: 1,
    storage_gb: 256,
    min_price: 27_990_000,
    max_price: 33_990_000,
    merchant_count: 6,
  },
];

interface RecordedRpcCall {
  path: string;
  body: Record<string, unknown> | null;
}

let rpcCalls: RecordedRpcCall[] = [];
let itemTableReads = 0;
let itemsEndpointFailing = false;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  const query = decodeURIComponent(url.search);
  const parsedBody =
    typeof init?.body === 'string' && init.body.trim().startsWith('{')
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : null;

  const json = (body: unknown, status = 200) =>
    new Response(init?.method === 'HEAD' ? null : JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'content-range': '0-0/*',
      },
    });

  if (Number(url.searchParams.get('offset') ?? 0) > 0) {
    return json([]);
  }

  switch (url.pathname) {
    case '/rest/v1/categories':
      return json([
        {
          id: CATEGORY_SMARTPHONES,
          parent_id: null,
          name: 'Smartphones',
          slug: 'smartphones',
          icon: null,
          display_order: 1,
        },
      ]);

    case '/rest/v1/rpc/search_master_products': {
      rpcCalls.push({ path: url.pathname, body: parsedBody });
      const rawLimit = Number(parsedBody?.p_limit ?? 200);
      return json(CATALOG_ROWS.slice(0, Math.max(1, rawLimit)));
    }

    case '/rest/v1/items':
      itemTableReads += 1;
      if (itemsEndpointFailing) {
        return json({ code: '57014', message: 'statement timeout' }, 500);
      }
      return json(ITEM_ROWS);

    case '/rest/v1/master_products':
      if (query.includes('select=id,item_id')) {
        itemTableReads += 1;
        return json([
          { id: V_IPHONE_512, item_id: ITEM_IPHONE },
          { id: V_IPHONE_256, item_id: ITEM_IPHONE },
          { id: V_GALAXY_256, item_id: ITEM_GALAXY },
          { id: V_XIAOMI_LONE, item_id: null },
        ]);
      }
      if (query.includes('item_id=in.') || query.includes('item_id=eq.')) {
        itemTableReads += 1;
        return json(ITEM_VARIANT_ROWS);
      }
      return json([]);

    default:
      return json([]);
  }
}) as typeof fetch;

async function installCssExtensionStub() {
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
}

async function main() {
  console.warn(
    '🧪 homepage battles, Deals Item grouping & cached catalog reads suite (DOS/Rate#1808)'
  );
  await installCssExtensionStub();

  const { loadHomeMasterProducts, resolveHomeGroupedCatalog } =
    await import('../../app/[locale]/page');
  const { loadDealsCatalogProducts } =
    await import('../../app/[locale]/deals/page');
  const { loadContactHeroProducts } =
    await import('../../app/[locale]/contact-us/page');
  const { rankProductsForDealFinder } =
    await import('../../components/deals/DealFinderWorkspace');
  const { buildRadarIndex, getRadarSignal } = await import('../deal-radar');
  const { toHeroProductSuggestions } = await import('../hero-products');
  const {
    RATE_CACHE_TAGS,
    canonicalizeCacheParams,
    getCachedMasterProducts,
    getMasterProducts,
    resolveRevalidationTargets,
  } = await import('../../server/rate');

  // 1. Flag off: no Item reads, raw variants preserved on both / and /deals.
  delete process.env.RATE_ITEM_MODEL;
  itemTableReads = 0;
  const flagOffHome = await resolveHomeGroupedCatalog(CATALOG_ROWS);
  assert.equal(flagOffHome.gridProducts, CATALOG_ROWS);
  assert.equal(itemTableReads, 0, 'flag off must not read Item tables');
  assert.equal(
    flagOffHome.popularHomeBattles[0]?.versusSlug,
    'apple-iphone-16-pro-max-256gb-vs-apple-iphone-16-pro-max-512gb',
    'flag off pairs raw variant rows as legacy control baseline'
  );

  const flagOffDeals = await loadDealsCatalogProducts(async () => CATALOG_ROWS);
  assert.equal(flagOffDeals, CATALOG_ROWS);
  assert.equal(itemTableReads, 0, 'flag off /deals must not read Item tables');

  // 2. RATE_ITEM_MODEL active ('item' and 'nullable_variant'): homepage 1v1
  // battles group by Item BEFORE pairing, never pair two storage variants of
  // the same Item, and emit canonical Item slugs instead of variant slugs.
  for (const mode of ['item', 'nullable_variant'] as const) {
    process.env.RATE_ITEM_MODEL = mode;

    const { gridProducts, popularHomeBattles } =
      await resolveHomeGroupedCatalog(CATALOG_ROWS);

    assert.equal(
      gridProducts.length,
      3,
      `[${mode}] 4 rows (2 variants of iPhone 16 Pro Max + S25 Ultra + lone Xiaomi) collapse to 3 Items`
    );
    assert.deepEqual(
      gridProducts.map((p) => p.name),
      ['Apple iPhone 16 Pro Max', 'Samsung Galaxy S25 Ultra', 'Xiaomi 15 Ultra']
    );

    assert.equal(popularHomeBattles.length, 3);
    for (const battle of popularHomeBattles) {
      assert.notEqual(
        battle.productA.productHref,
        battle.productB.productHref,
        `[${mode}] battle must never pair two variants of the same Item`
      );
      assert.ok(
        !battle.versusSlug.includes('-256gb') &&
          !battle.versusSlug.includes('-512gb'),
        `[${mode}] battle versusSlug must use canonical Item slugs, got ${battle.versusSlug}`
      );
    }

    assert.deepEqual(
      popularHomeBattles.map((b) => b.versusHref),
      [
        '/compare/apple-iphone-16-pro-max-vs-samsung-galaxy-s25-ultra',
        '/compare/apple-iphone-16-pro-max-vs-xiaomi-15-ultra',
        '/compare/samsung-galaxy-s25-ultra-vs-xiaomi-15-ultra',
      ]
    );
    assert.equal(
      popularHomeBattles[0]?.productA.name,
      'Apple iPhone 16 Pro Max'
    );
    assert.equal(
      popularHomeBattles[0]?.productB.name,
      'Samsung Galaxy S25 Ultra'
    );

    // Only two storage variants of a SINGLE Item exist: must yield 0 battles
    // rather than pairing #1 vs #2 of the same Item (which 404s per #1764).
    const sameItemOnly = await resolveHomeGroupedCatalog(
      CATALOG_ROWS.slice(0, 2)
    );
    assert.equal(sameItemOnly.gridProducts.length, 1);
    assert.deepEqual(
      sameItemOnly.popularHomeBattles,
      [],
      `[${mode}] two storage variants of one Item must not form a 1v1 battle`
    );
  }

  // Fallback resilience on homepage if Item grouping throws unexpectedly.
  const recoveredHome = await resolveHomeGroupedCatalog(
    CATALOG_ROWS,
    async () => {
      throw new Error('synthetic item grouping failure');
    }
  );
  assert.equal(recoveredHome.gridProducts, CATALOG_ROWS);

  // 3. /deals applies groupCatalogRowsByItem consistently with category pages
  // under RATE_ITEM_MODEL, collapsing storage variants while keeping Radar &
  // canonical Item links intact.
  process.env.RATE_ITEM_MODEL = 'item';
  rpcCalls = [];
  const dealsProducts = await loadDealsCatalogProducts();
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0]?.body, {
    p_sort: 'rating_desc',
    p_limit: 100,
    p_offset: 0,
  });
  assert.equal(
    dealsProducts.length,
    3,
    '/deals must group duplicate storage variants into one Item row'
  );

  const rankedDeals = rankProductsForDealFinder(dealsProducts, {
    categoryFilter: 'all',
    persona: 'default',
    maxBudgetVnd: 65_000_000,
    searchQuery: '',
  });
  assert.equal(rankedDeals.length, 3);
  assert.deepEqual(
    rankedDeals.map((d) => ({
      name: d.name,
      slug: d.slug,
      href: d.productHref,
      minPrice: d.minPrice,
      spreadSavingsVnd: d.spreadSavingsVnd,
      merchantCount: d.merchantCount,
    })),
    [
      {
        name: 'Apple iPhone 16 Pro Max',
        slug: 'apple-iphone-16-pro-max-256gb',
        href: '/smartphones/apple-iphone-16-pro-max',
        minPrice: 29_990_000,
        spreadSavingsVnd: 7_000_000,
        merchantCount: 8,
      },
      {
        name: 'Samsung Galaxy S25 Ultra',
        slug: 'samsung-galaxy-s25-ultra-256gb',
        href: '/smartphones/samsung-galaxy-s25-ultra',
        minPrice: 27_990_000,
        spreadSavingsVnd: 6_000_000,
        merchantCount: 6,
      },
      {
        name: 'Xiaomi 15 Ultra',
        slug: 'xiaomi-15-ultra',
        href: '/smartphones/xiaomi-15-ultra',
        minPrice: 24_990_000,
        spreadSavingsVnd: 1_000_000,
        merchantCount: 3,
      },
    ]
  );

  // Variant-keyed Deal Radar signal still attaches to the Item-grouped deal card.
  const radarIndex = buildRadarIndex({
    generatedAt: '2026-11-21T00:00:00Z',
    categoryFilter: 'all',
    totalClustersAnalyzed: 3,
    totalOffersAnalyzed: 10,
    totalMerchantsAnalyzed: 8,
    genuineDeals: [
      {
        id: 'offer-1',
        verdict: 'genuine_all_time_low',
        verdictBadgeVi: 'Đáy giá đa sàn',
        productSlug: 'apple-iphone-16-pro-max-256gb',
        productName: 'Apple iPhone 16 Pro Max 256GB',
        productHref: '/smartphones/apple-iphone-16-pro-max',
        imageUrl: null,
        brand: 'Apple',
        categorySlug: 'smartphones',
        platform: 'shopee',
        merchantId: 'm-1',
        merchantName: 'Apple Flagship Store',
        isOfficialMall: true,
        merchantRiskScore: 5,
        priceCurrent: 29_990_000,
        priceOriginal: 32_990_000,
        marketMedianPrice: 33_490_000,
        marketMinPrice: 29_990_000,
        marketMaxPrice: 36_990_000,
        savingsVsMedianVnd: 3_500_000,
        savingsVsMedianPct: 10.5,
        marketOfferCount: 4,
        claimedDiscountPct: 9.1,
        fakeMarkupPct: 0,
        jreviewsScore10: 9.4,
        offerUrl: 'https://shopee.vn/item',
        explanationVi: 'Thấp hơn trung vị 10.5%',
      },
    ],
    fakeSaleTraps: [],
    priceSpreadLeaders: [],
  });
  assert.equal(
    getRadarSignal(radarIndex, rankedDeals[0]!.slug).verdict,
    'genuine_deal'
  );

  // /deals fallback when Item endpoint errors: returns ungrouped rows cleanly,
  // while a primary catalog read failure still rejects so ISR keeps the last good page.
  itemsEndpointFailing = true;
  const fallbackDeals = await loadDealsCatalogProducts(async () => [
    makePhone(
      '99999999-9999-4999-8999-999999999991',
      'fallback-phone-128gb',
      'Fallback Phone 128GB',
      'Apple',
      19_990_000,
      19_990_000,
      4.6,
      8.8,
      128
    ),
  ]);
  assert.equal(fallbackDeals.length, 1);
  assert.equal(fallbackDeals[0]?.slug, 'fallback-phone-128gb');
  itemsEndpointFailing = false;

  await assert.rejects(
    () =>
      loadDealsCatalogProducts(async () => {
        throw new Error('supabase catalog down');
      }),
    /supabase catalog down/
  );

  delete process.env.RATE_ITEM_MODEL;

  // 4. Cached catalog helper usage on / and /contact-us: exact arguments,
  // React.cache deduplication, and rate:products tag participation.
  const homeCapturedArgs: unknown[] = [];
  await loadHomeMasterProducts(async (params) => {
    homeCapturedArgs.push(params);
    return [];
  });
  assert.deepEqual(homeCapturedArgs, [{ categorySlug: 'all', limit: 24 }]);

  const contactCapturedArgs: unknown[] = [];
  await loadContactHeroProducts(async (params) => {
    contactCapturedArgs.push(params);
    return [];
  });
  assert.deepEqual(contactCapturedArgs, [{ limit: 6 }]);

  rpcCalls = [];
  const homeDefaultRows = await loadHomeMasterProducts();
  const homeDirectCachedRows = await getCachedMasterProducts({
    categorySlug: 'all',
    limit: 24,
  });
  assert.equal(rpcCalls.length, 2);
  assert.deepEqual(rpcCalls[0]?.body, {
    p_sort: 'default',
    p_limit: 24,
    p_offset: 0,
  });
  assert.deepEqual(rpcCalls[0]?.body, rpcCalls[1]?.body);
  assert.deepEqual(homeDefaultRows, homeDirectCachedRows);
  assert.equal(
    canonicalizeCacheParams({ categorySlug: 'all', limit: 24 }),
    '{"categorySlug":"all","limit":24}'
  );

  rpcCalls = [];
  const contactCachedRows = await loadContactHeroProducts();
  const contactDirectCachedRows = await getCachedMasterProducts({ limit: 6 });
  assert.equal(rpcCalls.length, 2);
  assert.deepEqual(rpcCalls[0]?.body, {
    p_sort: 'default',
    p_limit: 6,
    p_offset: 0,
  });
  assert.deepEqual(rpcCalls[0]?.body, rpcCalls[1]?.body);
  assert.deepEqual(contactCachedRows, contactDirectCachedRows);
  assert.equal(canonicalizeCacheParams({ limit: 6 }), '{"limit":6}');

  const contactUncachedControl = await getMasterProducts({ limit: 6 });
  assert.deepEqual(
    toHeroProductSuggestions(contactCachedRows),
    toHeroProductSuggestions(contactUncachedControl),
    'switching /contact-us to getCachedMasterProducts({ limit: 6 }) preserves hero suggestions 100%'
  );

  const revalidation = resolveRevalidationTargets({
    slugs: ['apple-iphone-16-pro-max-256gb'],
  });
  assert.ok(
    revalidation.tags.includes(RATE_CACHE_TAGS.PRODUCTS),
    'product slug revalidation must emit rate:products so cached / and /contact-us reads invalidate'
  );

  // 5. Source wiring contracts on /, /deals, and /contact-us.
  const homeSrc = readFileSync(
    join(testDir, '../../app/[locale]/page.tsx'),
    'utf8'
  );
  const dealsSrc = readFileSync(
    join(testDir, '../../app/[locale]/deals/page.tsx'),
    'utf8'
  );
  const contactSrc = readFileSync(
    join(testDir, '../../app/[locale]/contact-us/page.tsx'),
    'utf8'
  );

  assert.ok(
    !/\bgetMasterProducts\b/.test(homeSrc) &&
      homeSrc.includes('getCachedMasterProducts') &&
      homeSrc.includes('groupCatalogRowsByItem') &&
      homeSrc.includes('loadHomeMasterProducts()') &&
      homeSrc.includes('resolveHomeGroupedCatalog(masterProducts)') &&
      !/buildPopular1v1BattlesForCategory\(\s*masterProducts\b/.test(homeSrc),
    'app/[locale]/page.tsx must read via getCachedMasterProducts and group rows by Item before building 1v1 battles'
  );

  assert.ok(
    !/\bgetMasterProducts\b/.test(dealsSrc) &&
      dealsSrc.includes('getCachedMasterProducts') &&
      dealsSrc.includes('groupCatalogRowsByItem') &&
      dealsSrc.includes('loadDealsCatalogProducts()'),
    'app/[locale]/deals/page.tsx must read via getCachedMasterProducts and group rows via groupCatalogRowsByItem'
  );

  assert.ok(
    !/\bgetMasterProducts\b/.test(contactSrc) &&
      contactSrc.includes('getCachedMasterProducts') &&
      contactSrc.includes('loadContactHeroProducts()'),
    'app/[locale]/contact-us/page.tsx must read catalog rows via getCachedMasterProducts'
  );

  console.warn(
    '  ✅ homepage battles, Deals Item grouping & cached catalog reads suite passed'
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
