import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';
import * as comboCartRouteModule from '../combo-cart/route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const { GET, OPTIONS } = comboCartRouteModule;

let masterRows: Array<Record<string, unknown>> = [];
let itemRows: Array<Record<string, unknown>> = [];
const categoryRows: Array<Record<string, unknown>> = [
  { id: 'cat-phone', slug: 'smartphones' },
  { id: 'cat-earbud', slug: 'earbuds' },
  { id: 'cat-watch', slug: 'smartwatches' },
];
let trustViewRows: Array<Record<string, unknown>> = [];
let productRows: Array<Record<string, unknown>> = [];
let merchantMetadataRows: Array<Record<string, unknown>> = [];

const postgrestWantedValues = (filter: string | null): string[] | null =>
  filter?.startsWith('eq.')
    ? [filter.slice(3)]
    : filter?.startsWith('in.(')
      ? filter
          .slice(4, -1)
          .split(',')
          .map((s) => s.replace(/^"|"$/g, ''))
      : null;

const jsonResponse = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function makeMaster(
  id: string,
  slug: string,
  name: string,
  categoryId: string,
  categorySlug: string,
  extra?: Partial<Record<string, unknown>>
) {
  return {
    id,
    slug,
    name,
    brand: 'Apple',
    model: name,
    category_id: categoryId,
    status: 'published',
    min_price: 5_000_000,
    max_price: 25_000_000,
    merchant_count: 3,
    metadata: { category_slug: categorySlug },
    specifications: { category_slug: categorySlug },
    ...extra,
  };
}

function makeTrustOfferRow(params: {
  id: string;
  clusterId: string;
  merchantId: string;
  merchantName: string;
  platform: string;
  priceCurrent: number;
  priceOriginal?: number | null;
  isOfficial?: boolean;
  dosafeRisk?: number | null;
  threatSource?: string | null;
  reviewRisk?: number | null;
  reviewBreakdown?: Record<string, unknown> | null;
  threatRisk?: number | null;
  availability?: 'in_stock' | 'out_of_stock' | 'discontinued';
}) {
  return {
    id: params.id,
    cluster_id: params.clusterId,
    merchant_id: params.merchantId,
    platform: params.platform,
    title: `${params.merchantName} listing ${params.id}`,
    price_current: params.priceCurrent,
    price_original: params.priceOriginal ?? null,
    stock: 10,
    rating_star: 4.9,
    rating_count: 100,
    url: `https://shopee.vn/product/100/${params.id}`,
    merchant_name: params.merchantName,
    merchant_is_official: params.isOfficial ?? false,
    merchant_location: 'TP.HCM',
    threat_risk_score:
      params.threatRisk === undefined
        ? (params.dosafeRisk ?? 0)
        : params.threatRisk,
    threat_source:
      params.threatSource === undefined ? 'dosafe' : params.threatSource,
    dosafe_risk_score: params.dosafeRisk === undefined ? 0 : params.dosafeRisk,
    review_risk_score: params.reviewRisk === undefined ? 0 : params.reviewRisk,
    review_risk_breakdown:
      params.reviewBreakdown === undefined
        ? { total_reviews: 25 }
        : params.reviewBreakdown,
    availability: params.availability ?? 'in_stock',
  };
}

async function main() {
  console.warn('Testing GET /api/v1/rate/combo-cart (#1882)');

  // 1. Route module strictly exports GET and OPTIONS only (Next.js App Router clean)
  assert.deepEqual(Object.keys(comboCartRouteModule).sort(), [
    'GET',
    'OPTIONS',
  ]);

  // 2. Source-level hygiene: zero @repo/shared-data/server, zero SUPABASE_SECRET_KEY, zero em/en dashes
  for (const relPath of [
    '../../../../../lib/combo-cart-optimizer.ts',
    '../../../../../lib/merchant-trust-badge.ts',
    '../combo-cart/route.ts',
    '../../../../../server/rate/openapi.ts',
    '../../../../../lib/__tests__/combo-cart-optimizer.test.ts',
    './combo-cart.test.ts',
  ]) {
    const src = readFileSync(path.resolve(__dirname, relPath), 'utf8');
    assert.equal(
      src.includes('\u2014') || src.includes('\u2013'),
      false,
      `${relPath} must not contain em-dash or en-dash`
    );
  }
  const routeSrc = readFileSync(
    path.resolve(__dirname, '../combo-cart/route.ts'),
    'utf8'
  );
  assert.equal(routeSrc.includes('@repo/shared-data/server'), false);
  assert.equal(routeSrc.includes('SUPABASE_SECRET_KEY'), false);

  const origFetch = globalThis.fetch;
  const prevItemModelFlag = process.env.RATE_ITEM_MODEL;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const { pathname, searchParams } = new URL(url);

      if (pathname === '/rest/v1/categories') {
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        const rows = wantedIds
          ? categoryRows.filter((c) => wantedIds.includes(String(c.id)))
          : categoryRows;
        return jsonResponse(200, rows);
      }
      if (pathname === '/rest/v1/items') {
        const from = Number(searchParams.get('offset') ?? 0);
        if (from > 0) return jsonResponse(200, []);
        const wantedSlugs = postgrestWantedValues(searchParams.get('slug'));
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        return jsonResponse(
          200,
          itemRows.filter((row) => {
            if (wantedSlugs && !wantedSlugs.includes(String(row.slug ?? ''))) {
              return false;
            }
            if (wantedIds && !wantedIds.includes(String(row.id ?? ''))) {
              return false;
            }
            return true;
          })
        );
      }
      if (pathname === '/rest/v1/master_products') {
        const from = Number(searchParams.get('offset') ?? 0);
        if (from > 0) return jsonResponse(200, []);
        const wantedSlugs = postgrestWantedValues(searchParams.get('slug'));
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        const wantedItemIds = postgrestWantedValues(
          searchParams.get('item_id')
        );
        return jsonResponse(
          200,
          masterRows.filter((row) => {
            if (wantedSlugs && !wantedSlugs.includes(String(row.slug ?? ''))) {
              return false;
            }
            if (wantedIds && !wantedIds.includes(String(row.id ?? ''))) {
              return false;
            }
            if (
              wantedItemIds &&
              !wantedItemIds.includes(String(row.item_id ?? ''))
            ) {
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
        const filtered = wantedClusters
          ? productRows.filter((row) =>
              wantedClusters.includes(String(row.cluster_id ?? ''))
            )
          : productRows;
        const from = Number(searchParams.get('offset') ?? 0);
        const size = Number(searchParams.get('limit') ?? filtered.length);
        return jsonResponse(200, filtered.slice(from, from + size));
      }
      if (pathname === '/rest/v1/merchants') {
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        const filtered = wantedIds
          ? merchantMetadataRows.filter((m) =>
              wantedIds.includes(String(m.id ?? ''))
            )
          : merchantMetadataRows;
        return jsonResponse(200, filtered);
      }
      return jsonResponse(200, []);
    }) as typeof fetch;

    // 3. CORS OPTIONS preflight
    const optRes = await OPTIONS();
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get('access-control-allow-origin'), '*');
    assert.equal(
      optRes.headers.get('access-control-allow-methods'),
      'GET, OPTIONS'
    );

    // 4. Query validation: missing, 1 item, 6 items, prototype keys, invalid options -> 400 + no-store
    const badUrls = [
      'http://localhost/api/v1/rate/combo-cart',
      'http://localhost/api/v1/rate/combo-cart?items=',
      'http://localhost/api/v1/rate/combo-cart?items=only-one-slug',
      'http://localhost/api/v1/rate/combo-cart?items=dup-slug,DUP-SLUG',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2,s3,s4,s5,s6',
      'http://localhost/api/v1/rate/combo-cart?items=s1,__proto__',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2,constructor',
      'http://localhost/api/v1/rate/combo-cart?items=s1,toString',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&officialOnly=2',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&officialOnly=true',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&minTrust=-1',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&minTrust=101',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&minTrust=0x50',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&maxStores=0',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&maxStores=6',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&maxStores=1.5',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&shippingVnd=-10',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&shippingVnd=500001',
      'http://localhost/api/v1/rate/combo-cart?items=s1,s2&shippingVnd=10.5',
    ];
    for (let i = 0; i < badUrls.length; i++) {
      const res = await GET(
        new NextRequest(badUrls[i]!, {
          headers: { 'x-forwarded-for': `198.51.100.${10 + i}` },
        })
      );
      assert.equal(res.status, 400, `expected 400 for ${badUrls[i]}`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
      const body = (await res.json()) as { ok: boolean; code?: string };
      assert.equal(body.ok, false);
      assert.equal(body.code, 'INVALID_QUERY');
    }

    // 5. End-to-end master + Item slug resolution, bait/OOS filtering, fake-sale badge, Plan A/B
    process.env.RATE_ITEM_MODEL = 'item';
    const ITEM_PHONE_ID = 'item-1111-1111-4111-8111-111111111111';
    const MASTER_PHONE_128_ID = '11111111-1111-4111-8111-111111111111';
    const MASTER_EARBUD_ID = '22222222-2222-4222-8222-222222222222';
    const MASTER_WATCH_ID = '33333333-3333-4333-8333-333333333333';

    const MERCHANT_CELLPHONES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const MERCHANT_SHOPEE_MALL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    const MERCHANT_SHADY_TRAP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
    const MERCHANT_UNSCORED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';

    itemRows = [
      {
        id: ITEM_PHONE_ID,
        item_key: 'apple:iphone-16',
        slug: 'apple-iphone-16',
        name: 'Apple iPhone 16',
        brand: 'Apple',
        model: 'iPhone 16',
        category_id: 'cat-phone',
        default_variant_id: MASTER_PHONE_128_ID,
        status: 'published',
      },
    ];
    masterRows = [
      makeMaster(
        MASTER_PHONE_128_ID,
        'apple-iphone-16-128gb',
        'Apple iPhone 16 128GB',
        'cat-phone',
        'smartphones',
        { item_id: ITEM_PHONE_ID, variant_key: '128gb', storage_gb: 128 }
      ),
      makeMaster(
        MASTER_EARBUD_ID,
        'apple-airpods-pro-2-usb-c',
        'Apple AirPods Pro 2 USB-C',
        'cat-earbud',
        'earbuds'
      ),
      makeMaster(
        MASTER_WATCH_ID,
        'apple-watch-series-10-42mm',
        'Apple Watch Series 10 42mm',
        'cat-watch',
        'smartwatches'
      ),
    ];

    trustViewRows = [
      // Phone offers: CellphoneS 20M (official, safe), Shopee Mall 18.8M (official, safe), Unscored 15M (rejected at default minTrust=80), Bait 3M
      makeTrustOfferRow({
        id: 'off-p-cps',
        clusterId: MASTER_PHONE_128_ID,
        merchantId: MERCHANT_CELLPHONES,
        merchantName: 'CellphoneS',
        platform: 'cellphones',
        priceCurrent: 20_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      }),
      makeTrustOfferRow({
        id: 'off-p-mall',
        clusterId: MASTER_PHONE_128_ID,
        merchantId: MERCHANT_SHOPEE_MALL,
        merchantName: 'Apple Flagship Store',
        platform: 'shopee',
        priceCurrent: 18_800_000,
        isOfficial: true,
        dosafeRisk: 4,
        reviewRisk: 10,
        threatRisk: 10,
      }),
      makeTrustOfferRow({
        id: 'off-p-unscored',
        clusterId: MASTER_PHONE_128_ID,
        merchantId: MERCHANT_UNSCORED,
        merchantName: 'Unscored Seller',
        platform: 'shopee',
        priceCurrent: 15_000_000,
        isOfficial: false,
        dosafeRisk: 0,
        threatSource: null,
        reviewRisk: 0,
        reviewBreakdown: null,
        threatRisk: 0,
      }),
      makeTrustOfferRow({
        id: 'off-p-bait',
        clusterId: MASTER_PHONE_128_ID,
        merchantId: MERCHANT_SHADY_TRAP,
        merchantName: 'Shady Trap Shop',
        platform: 'lazada',
        priceCurrent: 3_000_000,
        isOfficial: false,
        dosafeRisk: 10,
        reviewRisk: 10,
        threatRisk: 10,
      }),

      // Earbud offers: CellphoneS 6M, Shady Trap 5.7M (inflated original price at median!), risky 5.5M (filtered by minTrust=80), Official Mall 5.2M (out of stock!)
      makeTrustOfferRow({
        id: 'off-e-cps',
        clusterId: MASTER_EARBUD_ID,
        merchantId: MERCHANT_CELLPHONES,
        merchantName: 'CellphoneS',
        platform: 'cellphones',
        priceCurrent: 6_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      }),
      makeTrustOfferRow({
        id: 'off-e-other-risky',
        clusterId: MASTER_EARBUD_ID,
        merchantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
        merchantName: 'Risky Shop',
        platform: 'tiktok',
        priceCurrent: 5_500_000,
        isOfficial: false,
        dosafeRisk: 30,
        reviewRisk: 25,
        threatRisk: 30,
      }),
      makeTrustOfferRow({
        id: 'off-e-trap',
        clusterId: MASTER_EARBUD_ID,
        merchantId: MERCHANT_SHADY_TRAP,
        merchantName: 'Shady Trap Shop',
        platform: 'lazada',
        priceCurrent: 5_700_000,
        // Market median across [5.5M, 5.7M, 6.0M] = 5.7M; original 9M => +57.9% inflated markup => activeFakeDiscountCount = 1!
        priceOriginal: 9_000_000,
        isOfficial: false,
        dosafeRisk: 10,
        reviewRisk: 10,
        threatRisk: 10,
      }),
      makeTrustOfferRow({
        id: 'off-e-mall-oos',
        clusterId: MASTER_EARBUD_ID,
        merchantId: MERCHANT_SHOPEE_MALL,
        merchantName: 'Apple Flagship Store',
        platform: 'shopee',
        priceCurrent: 5_200_000,
        isOfficial: true,
        dosafeRisk: 4,
        reviewRisk: 10,
        threatRisk: 10,
        availability: 'out_of_stock',
      }),

      // Watch offers: CellphoneS 11M, Shopee Mall 10M
      makeTrustOfferRow({
        id: 'off-w-cps',
        clusterId: MASTER_WATCH_ID,
        merchantId: MERCHANT_CELLPHONES,
        merchantName: 'CellphoneS',
        platform: 'cellphones',
        priceCurrent: 11_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      }),
      makeTrustOfferRow({
        id: 'off-w-mall',
        clusterId: MASTER_WATCH_ID,
        merchantId: MERCHANT_SHOPEE_MALL,
        merchantName: 'Apple Flagship Store',
        platform: 'shopee',
        priceCurrent: 10_000_000,
        isOfficial: true,
        dosafeRisk: 4,
        reviewRisk: 10,
        threatRisk: 10,
      }),
    ];
    productRows = trustViewRows.map((r) => ({
      id: r.id,
      cluster_id: r.cluster_id,
      availability: r.availability,
    }));
    merchantMetadataRows = [
      {
        id: MERCHANT_CELLPHONES,
        follower_count: 100000,
        metadata_dosafe_risk_score: 5,
      },
      {
        id: MERCHANT_SHOPEE_MALL,
        follower_count: 200000,
        metadata_dosafe_risk_score: 4,
      },
      {
        id: MERCHANT_SHADY_TRAP,
        follower_count: 5000,
        metadata_dosafe_risk_score: 10,
      },
      {
        id: MERCHANT_UNSCORED,
        follower_count: 500,
        metadata_dosafe_risk_score: null,
      },
    ];

    const res200 = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-airpods-pro-2-usb-c,apple-watch-series-10-42mm&minTrust=80&maxStores=3&shippingVnd=30000',
        { headers: { 'x-forwarded-for': '203.0.113.50' } }
      )
    );
    assert.equal(res200.status, 200);
    assert.equal(
      res200.headers.get('cache-control'),
      'public, s-maxage=60, stale-while-revalidate=300'
    );
    assert.equal(res200.headers.get('access-control-allow-origin'), '*');

    const payload = (await res200.json()) as {
      ok: boolean;
      data: {
        items: Array<{
          requestedSlug: string;
          resolvedSlug: string;
          itemSlug: string | null;
          productHref: string | null;
          found: boolean;
        }>;
        missingSlugs: string[];
        singleStoreBest: {
          totalVnd: number;
          distinctStoreCount: number;
          storeGroups: Array<{
            storeKey: string;
            trustBadge: { verifiedSafe: boolean; badgeCode: string | null };
          }>;
        } | null;
        multiStoreOptimal: {
          totalVnd: number;
          distinctStoreCount: number;
          shippingVnd: number;
          storeGroups: Array<{
            storeKey: string;
            trustBadge: {
              verifiedSafe: boolean;
              failedReasons: string[];
            };
          }>;
        } | null;
        savingsVsSingleStoreVnd: number;
        uncoveredSlugs: string[];
        merchantBadges: Array<{
          storeKey: string;
          verifiedSafe: boolean;
          failedReasons: string[];
        }>;
      };
    };

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.data.missingSlugs, []);
    assert.deepEqual(payload.data.uncoveredSlugs, []);

    // Item slug 'apple-iphone-16' resolved to default variant 'apple-iphone-16-128gb'
    assert.equal(payload.data.items[0]!.requestedSlug, 'apple-iphone-16');
    assert.equal(payload.data.items[0]!.resolvedSlug, 'apple-iphone-16-128gb');
    assert.equal(payload.data.items[0]!.itemSlug, 'apple-iphone-16');
    assert.equal(
      payload.data.items[0]!.productHref,
      '/smartphones/apple-iphone-16'
    );

    // Plan A: CellphoneS covers all 3: 20M + 6M + 11M + 30k = 37,030,000
    assert.ok(payload.data.singleStoreBest);
    assert.equal(payload.data.singleStoreBest.totalVnd, 37_030_000);
    assert.equal(
      payload.data.singleStoreBest.storeGroups[0]!.trustBadge.verifiedSafe,
      true
    );

    // Plan B: Apple Flagship Store (phone 18.8M + watch 10M) + Shady Trap Shop (earbud 5.7M) = 34.5M + 2*30k = 34,560,000
    assert.ok(payload.data.multiStoreOptimal);
    assert.equal(payload.data.multiStoreOptimal.totalVnd, 34_560_000);
    assert.equal(payload.data.multiStoreOptimal.distinctStoreCount, 2);
    assert.equal(payload.data.multiStoreOptimal.shippingVnd, 60_000);
    assert.equal(payload.data.savingsVsSingleStoreVnd, 2_470_000);

    // Shady Trap Shop fails verifiedSafe due to active fake discount markup
    const shadyBadge = payload.data.merchantBadges.find(
      (b) => b.storeKey === MERCHANT_SHADY_TRAP
    );
    assert.ok(shadyBadge);
    assert.equal(shadyBadge.verifiedSafe, false);
    assert.ok(
      shadyBadge.failedReasons.includes('active_fake_discounts_detected')
    );

    // 5b. officialOnly=1 excludes Shady Trap Shop (non-official) so Plan B switches to Apple Flagship + CellphoneS
    const resOfficialOnly = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-airpods-pro-2-usb-c,apple-watch-series-10-42mm&officialOnly=1&minTrust=80&maxStores=3&shippingVnd=0',
        { headers: { 'x-forwarded-for': '203.0.113.55' } }
      )
    );
    assert.equal(resOfficialOnly.status, 200);
    const officialPayload = (await resOfficialOnly.json()) as {
      ok: boolean;
      data: {
        multiStoreOptimal: {
          totalVnd: number;
          allOfficial: boolean;
        } | null;
      };
    };
    assert.ok(officialPayload.data.multiStoreOptimal);
    assert.equal(officialPayload.data.multiStoreOptimal.allOfficial, true);
    // Apple Flagship (18.8M + 10M) + CellphoneS (6M) = 34.8M
    assert.equal(officialPayload.data.multiStoreOptimal.totalVnd, 34_800_000);

    // 5c. RATE_ITEM_MODEL off still resolves canonical master product slugs cleanly
    delete process.env.RATE_ITEM_MODEL;
    const resFlagOff = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16-128gb,apple-airpods-pro-2-usb-c',
        { headers: { 'x-forwarded-for': '203.0.113.56' } }
      )
    );
    assert.equal(resFlagOff.status, 200);
    const flagOffPayload = (await resFlagOff.json()) as {
      ok: boolean;
      data: {
        missingSlugs: string[];
        items: Array<{ itemSlug: string | null; resolvedSlug: string | null }>;
      };
    };
    assert.deepEqual(flagOffPayload.data.missingSlugs, []);
    assert.equal(flagOffPayload.data.items[0]!.itemSlug, null);
    assert.equal(
      flagOffPayload.data.items[0]!.resolvedSlug,
      'apple-iphone-16-128gb'
    );
    process.env.RATE_ITEM_MODEL = 'item';

    // 6. Duplicate resolved product (Item slug + its default variant slug) -> 400
    const dupResolvedRes = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-iphone-16-128gb',
        { headers: { 'x-forwarded-for': '203.0.113.51' } }
      )
    );
    assert.equal(dupResolvedRes.status, 400);
    assert.equal(dupResolvedRes.headers.get('cache-control'), 'no-store');

    // 7. Missing slug reports missingSlugs + uncoveredSlugs cleanly
    const missingSlugRes = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,missing-product-slug',
        { headers: { 'x-forwarded-for': '203.0.113.52' } }
      )
    );
    assert.equal(missingSlugRes.status, 200);
    const missingBody = (await missingSlugRes.json()) as {
      ok: boolean;
      data: {
        missingSlugs: string[];
        uncoveredSlugs: string[];
        singleStoreBest: unknown;
        multiStoreOptimal: unknown;
      };
    };
    assert.equal(missingBody.ok, true);
    assert.deepEqual(missingBody.data.missingSlugs, ['missing-product-slug']);
    assert.deepEqual(missingBody.data.uncoveredSlugs, ['missing-product-slug']);
    assert.equal(missingBody.data.singleStoreBest, null);
    assert.equal(missingBody.data.multiStoreOptimal, null);

    // 8. Rate limit 60 req/min per IP -> 61st returns 429 with Retry-After and no-store
    const rateLimitIp = '198.51.100.240';
    for (let i = 0; i < 60; i++) {
      const r = await GET(
        new NextRequest(
          'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-airpods-pro-2-usb-c',
          { headers: { 'x-forwarded-for': rateLimitIp } }
        )
      );
      assert.equal(r.status, 200, `request ${i + 1} should succeed`);
    }
    const limitedRes = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-airpods-pro-2-usb-c',
        { headers: { 'x-forwarded-for': rateLimitIp } }
      )
    );
    assert.equal(limitedRes.status, 429);
    assert.equal(limitedRes.headers.get('retry-after'), '60');
    assert.equal(limitedRes.headers.get('cache-control'), 'no-store');
    assert.match(
      limitedRes.headers.get('access-control-expose-headers') ?? '',
      /Retry-After/
    );
    const limitedJson = (await limitedRes.json()) as {
      ok: boolean;
      code?: string;
    };
    assert.equal(limitedJson.ok, false);
    assert.equal(limitedJson.code, 'RATE_LIMIT_EXCEEDED');

    // 9. OpenAPI sync check
    const spec = buildRateOpenApiSpec('https://rate.vn');
    const comboOp = spec.paths['/api/v1/rate/combo-cart']?.get;
    assert.ok(
      comboOp,
      'OpenAPI spec must document GET /api/v1/rate/combo-cart'
    );
    assert.equal(comboOp.operationId, 'optimizeComboCart');
    const paramNames = (comboOp.parameters ?? []).map((p) => p.name);
    for (const pName of [
      'items',
      'officialOnly',
      'minTrust',
      'maxStores',
      'shippingVnd',
    ]) {
      assert.ok(
        paramNames.includes(pName),
        `OpenAPI /combo-cart must document parameter ${pName}`
      );
    }
    assert.ok(comboOp.responses['200']);
    assert.ok(comboOp.responses['400']);
    assert.ok(comboOp.responses['429']);
    assert.ok(spec.components.schemas.ComboCartPlan);
    assert.ok(spec.components.schemas.MerchantTrustBadge);

    console.warn('All GET /api/v1/rate/combo-cart tests passed');
  } finally {
    globalThis.fetch = origFetch;
    if (prevItemModelFlag === undefined) delete process.env.RATE_ITEM_MODEL;
    else process.env.RATE_ITEM_MODEL = prevItemModelFlag;
  }
}

void main();
