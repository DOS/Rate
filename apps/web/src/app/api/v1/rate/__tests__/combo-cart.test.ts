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
let merchantRows: Array<Record<string, unknown>> = [];
let priceHistoryRows: Array<Record<string, unknown>> = [];

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
    platform_item_id: `item-${params.id}`,
    title: `${params.merchantName} listing ${params.id}`,
    price_current: params.priceCurrent,
    price_original: params.priceOriginal ?? null,
    stock: 10,
    historical_sold: 50,
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

function syncDerivedProductAndMerchantRows(
  specs: Array<{
    id: string;
    platform: string;
    name: string;
    isOfficial: boolean;
    dosafeRisk: number | null;
    reviewRisk: number | null;
    reviewBreakdown: Record<string, unknown> | null;
    followerCount: number;
  }>
) {
  productRows = trustViewRows.map((r) => ({
    id: r.id,
    cluster_id: r.cluster_id,
    merchant_id: r.merchant_id,
    platform: r.platform,
    platform_item_id: r.platform_item_id,
    title: r.title,
    price_current: r.price_current,
    price_original: r.price_original,
    stock: r.stock,
    historical_sold: r.historical_sold,
    rating_star: r.rating_star,
    rating_count: r.rating_count,
    url: r.url,
    availability: r.availability,
  }));
  merchantRows = specs.map((m) => ({
    id: m.id,
    platform: m.platform,
    platform_shop_id: `shop-${m.id}`,
    name: m.name,
    slug: null,
    url: `https://shopee.vn/shop/${m.id}`,
    is_official: m.isOfficial,
    rating_star: 4.9,
    follower_count: m.followerCount,
    location: 'TP.HCM',
    risk_score: m.dosafeRisk ?? 0,
    review_risk_score: m.reviewRisk ?? 0,
    review_risk_breakdown: m.reviewBreakdown,
    metadata:
      m.dosafeRisk !== null ? { dosafe_risk_score: m.dosafeRisk } : null,
    metadata_dosafe_risk_score: m.dosafeRisk,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
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
        const wantedStatuses = postgrestWantedValues(
          searchParams.get('status')
        );
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
              !wantedStatuses.includes(String(row.status ?? ''))
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
        const wantedSlugs = postgrestWantedValues(searchParams.get('slug'));
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        const wantedItemIds = postgrestWantedValues(
          searchParams.get('item_id')
        );
        const wantedStatuses = postgrestWantedValues(
          searchParams.get('status')
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
            if (
              wantedStatuses &&
              !wantedStatuses.includes(String(row.status ?? ''))
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
        const wantedMerchants = postgrestWantedValues(
          searchParams.get('merchant_id')
        );
        const filtered = productRows.filter((row) => {
          if (
            wantedClusters &&
            !wantedClusters.includes(String(row.cluster_id ?? ''))
          ) {
            return false;
          }
          if (
            wantedMerchants &&
            !wantedMerchants.includes(String(row.merchant_id ?? ''))
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
        const wantedIds = postgrestWantedValues(searchParams.get('id'));
        const filtered = wantedIds
          ? merchantRows.filter((m) => wantedIds.includes(String(m.id ?? '')))
          : merchantRows;
        return jsonResponse(200, filtered);
      }
      if (pathname === '/rest/v1/price_history') {
        const wantedProductIds = postgrestWantedValues(
          searchParams.get('product_id')
        );
        const filtered = wantedProductIds
          ? priceHistoryRows.filter((ph) =>
              wantedProductIds.includes(String(ph.product_id ?? ''))
            )
          : priceHistoryRows;
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

    // 5. End-to-end master + Item slug resolution, bait/OOS filtering, merchant-wide audit, Plan A/B
    process.env.RATE_ITEM_MODEL = 'item';
    const ITEM_PHONE_ID = 'item-1111-1111-4111-8111-111111111111';
    const MASTER_PHONE_128_ID = '11111111-1111-4111-8111-111111111111';
    const MASTER_PHONE_256_RETIRED_PARENT =
      '11111111-1111-4111-8111-111111111112';
    const MASTER_EARBUD_ID = '22222222-2222-4222-8222-222222222222';
    const MASTER_WATCH_ID = '33333333-3333-4333-8333-333333333333';
    const MASTER_OUTSIDE_ID = '44444444-4444-4444-8444-444444444444';

    const MERCHANT_CELLPHONES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const MERCHANT_SHOPEE_MALL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    const MERCHANT_SHADY_TRAP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
    const MERCHANT_UNSCORED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
    const MERCHANT_OUTSIDE_TRAP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';

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
        MASTER_PHONE_256_RETIRED_PARENT,
        'apple-iphone-16-256gb',
        'Apple iPhone 16 256GB (Retired)',
        'cat-phone',
        'smartphones',
        {
          item_id: ITEM_PHONE_ID,
          variant_key: '256gb',
          storage_gb: 256,
          status: 'archived',
        }
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
      makeMaster(
        MASTER_OUTSIDE_ID,
        'apple-ipad-pro-m4-256gb',
        'Apple iPad Pro M4 256GB',
        'cat-phone',
        'tablets'
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

      // Outside product where MERCHANT_OUTSIDE_TRAP has a fake discount (even though clean on cart items)
      makeTrustOfferRow({
        id: 'off-out-cps',
        clusterId: MASTER_OUTSIDE_ID,
        merchantId: MERCHANT_CELLPHONES,
        merchantName: 'CellphoneS',
        platform: 'cellphones',
        priceCurrent: 25_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      }),
      makeTrustOfferRow({
        id: 'off-out-trap',
        clusterId: MASTER_OUTSIDE_ID,
        merchantId: MERCHANT_OUTSIDE_TRAP,
        merchantName: 'CleanInCart FakeOutside',
        platform: 'lazada',
        priceCurrent: 25_000_000,
        priceOriginal: 36_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      }),
    ];
    syncDerivedProductAndMerchantRows([
      {
        id: MERCHANT_CELLPHONES,
        platform: 'cellphones',
        name: 'CellphoneS',
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 100000,
      },
      {
        id: MERCHANT_SHOPEE_MALL,
        platform: 'shopee',
        name: 'Apple Flagship Store',
        isOfficial: true,
        dosafeRisk: 4,
        reviewRisk: 10,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 200000,
      },
      {
        id: MERCHANT_SHADY_TRAP,
        platform: 'lazada',
        name: 'Shady Trap Shop',
        isOfficial: false,
        dosafeRisk: 10,
        reviewRisk: 10,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 5000,
      },
      {
        id: MERCHANT_UNSCORED,
        platform: 'shopee',
        name: 'Unscored Seller',
        isOfficial: false,
        dosafeRisk: null,
        reviewRisk: 0,
        reviewBreakdown: null,
        followerCount: 500,
      },
      {
        id: MERCHANT_OUTSIDE_TRAP,
        platform: 'lazada',
        name: 'CleanInCart FakeOutside',
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 50000,
      },
    ]);
    priceHistoryRows = [
      {
        id: 1,
        product_id: 'off-e-trap',
        price: 5_700_000,
        price_original: 9_000_000,
        recorded_at: '2026-11-20T00:00:00Z',
        source: 'crawler',
      },
      {
        id: 2,
        product_id: 'off-out-trap',
        price: 25_000_000,
        price_original: 36_000_000,
        recorded_at: '2026-11-20T00:00:00Z',
        source: 'crawler',
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
            trustBadge: {
              verifiedSafe: boolean;
              badgeCode: string | null;
              auditScope: string;
            };
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
              auditScope: string;
            };
          }>;
        } | null;
        savingsVsSingleStoreVnd: number;
        uncoveredSlugs: string[];
        merchantBadges: Array<{
          storeKey: string;
          verifiedSafe: boolean;
          auditScope: string;
          cartOfferCount: number;
          cartFakeDiscountCount: number;
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

    // Plan A: CellphoneS covers all 3: 20M + 6M + 11M + 30k = 37,030,000, verified_safe via merchant_wide audit
    assert.ok(payload.data.singleStoreBest);
    assert.equal(payload.data.singleStoreBest.totalVnd, 37_030_000);
    assert.equal(
      payload.data.singleStoreBest.storeGroups[0]!.trustBadge.verifiedSafe,
      true
    );
    assert.equal(
      payload.data.singleStoreBest.storeGroups[0]!.trustBadge.auditScope,
      'merchant_wide'
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
    assert.equal(shadyBadge.auditScope, 'merchant_wide');
    assert.equal(shadyBadge.cartFakeDiscountCount, 1);
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
    assert.equal(officialPayload.data.multiStoreOptimal.totalVnd, 34_800_000);

    // 5c. Merchant clean in cart but fake discount on OUTSIDE product -> merchant_wide audit denies verified_safe
    trustViewRows.push(
      makeTrustOfferRow({
        id: 'off-w-outside-trap',
        clusterId: MASTER_WATCH_ID,
        merchantId: MERCHANT_OUTSIDE_TRAP,
        merchantName: 'CleanInCart FakeOutside',
        platform: 'lazada',
        priceCurrent: 8_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      })
    );
    syncDerivedProductAndMerchantRows([
      {
        id: MERCHANT_CELLPHONES,
        platform: 'cellphones',
        name: 'CellphoneS',
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 100000,
      },
      {
        id: MERCHANT_SHOPEE_MALL,
        platform: 'shopee',
        name: 'Apple Flagship Store',
        isOfficial: true,
        dosafeRisk: 4,
        reviewRisk: 10,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 200000,
      },
      {
        id: MERCHANT_OUTSIDE_TRAP,
        platform: 'lazada',
        name: 'CleanInCart FakeOutside',
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        reviewBreakdown: { total_reviews: 25 },
        followerCount: 50000,
      },
    ]);
    const resOutsideTrap = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-watch-series-10-42mm&shippingVnd=0',
        { headers: { 'x-forwarded-for': '203.0.113.57' } }
      )
    );
    assert.equal(resOutsideTrap.status, 200);
    const outsideTrapBody = (await resOutsideTrap.json()) as {
      ok: boolean;
      data: {
        merchantBadges: Array<{
          storeKey: string;
          verifiedSafe: boolean;
          auditScope: string;
          cartFakeDiscountCount: number;
          failedReasons: string[];
        }>;
      };
    };
    const outsideTrapBadge = outsideTrapBody.data.merchantBadges.find(
      (b) => b.storeKey === MERCHANT_OUTSIDE_TRAP
    );
    assert.ok(outsideTrapBadge);
    assert.equal(outsideTrapBadge.auditScope, 'merchant_wide');
    assert.equal(outsideTrapBadge.cartFakeDiscountCount, 0);
    assert.equal(outsideTrapBadge.verifiedSafe, false);
    assert.ok(
      outsideTrapBadge.failedReasons.includes('active_fake_discounts_detected')
    );

    // 5d. Unavailable merchant-wide audit fails closed (missing_fake_discount_audit, cart_only_unverified)
    const MERCHANT_NO_PROFILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
    trustViewRows.push(
      makeTrustOfferRow({
        id: 'off-e-noprof',
        clusterId: MASTER_EARBUD_ID,
        merchantId: MERCHANT_NO_PROFILE,
        merchantName: 'Unbacked Profile Store',
        platform: 'tiki',
        priceCurrent: 4_800_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 8,
        threatRisk: 8,
      })
    );
    const resNoProfile = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-airpods-pro-2-usb-c,apple-watch-series-10-42mm&shippingVnd=0',
        { headers: { 'x-forwarded-for': '203.0.113.58' } }
      )
    );
    assert.equal(resNoProfile.status, 200);
    const noProfBody = (await resNoProfile.json()) as {
      ok: boolean;
      data: {
        merchantBadges: Array<{
          storeKey: string;
          verifiedSafe: boolean;
          auditScope: string;
          failedReasons: string[];
        }>;
      };
    };
    const noProfBadge = noProfBody.data.merchantBadges.find(
      (b) => b.storeKey === MERCHANT_NO_PROFILE
    );
    assert.ok(noProfBadge);
    assert.equal(noProfBadge.auditScope, 'cart_only_unverified');
    assert.equal(noProfBadge.verifiedSafe, false);
    assert.ok(
      noProfBadge.failedReasons.includes('missing_fake_discount_audit')
    );

    // 5e. Order-invariant reviewRisk + breakdown pairing across cart items
    const MERCHANT_MIXED_REV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
    trustViewRows.push(
      makeTrustOfferRow({
        id: 'off-p-mix',
        clusterId: MASTER_PHONE_128_ID,
        merchantId: MERCHANT_MIXED_REV,
        merchantName: 'Mixed Evidence Store',
        platform: 'tiki',
        priceCurrent: 17_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 0,
        reviewBreakdown: { total_reviews: 0 },
        threatRisk: 5,
      }),
      makeTrustOfferRow({
        id: 'off-w-mix',
        clusterId: MASTER_WATCH_ID,
        merchantId: MERCHANT_MIXED_REV,
        merchantName: 'Mixed Evidence Store',
        platform: 'tiki',
        priceCurrent: 7_000_000,
        isOfficial: true,
        dosafeRisk: 5,
        reviewRisk: 25,
        reviewBreakdown: { total_reviews: 12 },
        threatRisk: 15,
      })
    );
    const resOrderA = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-watch-series-10-42mm&shippingVnd=0',
        { headers: { 'x-forwarded-for': '203.0.113.59' } }
      )
    );
    const resOrderB = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-watch-series-10-42mm,apple-iphone-16&shippingVnd=0',
        { headers: { 'x-forwarded-for': '203.0.113.60' } }
      )
    );
    const bodyOrderA = (await resOrderA.json()) as {
      data: {
        merchantBadges: Array<{
          storeKey: string;
          verifiedSafe: boolean;
          failedReasons: string[];
          signals: { reviewRiskScore: number | null };
        }>;
      };
    };
    const bodyOrderB = (await resOrderB.json()) as typeof bodyOrderA;
    const mixBadgeA = bodyOrderA.data.merchantBadges.find(
      (b) => b.storeKey === MERCHANT_MIXED_REV
    )!;
    const mixBadgeB = bodyOrderB.data.merchantBadges.find(
      (b) => b.storeKey === MERCHANT_MIXED_REV
    )!;
    assert.equal(mixBadgeA.signals.reviewRiskScore, 25);
    assert.equal(mixBadgeB.signals.reviewRiskScore, 25);
    assert.equal(mixBadgeA.verifiedSafe, false);
    assert.equal(mixBadgeB.verifiedSafe, false);
    assert.ok(mixBadgeA.failedReasons.includes('review_risk_too_high'));
    assert.ok(mixBadgeB.failedReasons.includes('review_risk_too_high'));

    // 5f. Retired variant slug must NOT substitute live sibling variant offers for pricing
    const retiredRes = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16-256gb,apple-watch-series-10-42mm',
        { headers: { 'x-forwarded-for': '203.0.113.61' } }
      )
    );
    assert.equal(retiredRes.status, 200);
    const retiredBody = (await retiredRes.json()) as {
      ok: boolean;
      data: {
        items: Array<{
          requestedSlug: string;
          resolvedSlug: string | null;
          itemSlug: string | null;
          productHref: string | null;
          sizeRequired: boolean;
          retiredVariant: boolean;
          found: boolean;
        }>;
        missingSlugs: string[];
        uncoveredSlugs: string[];
        singleStoreBest: unknown;
        multiStoreOptimal: unknown;
      };
    };
    assert.equal(retiredBody.ok, true);
    assert.equal(retiredBody.data.items[0]!.found, false);
    assert.equal(retiredBody.data.items[0]!.resolvedSlug, null);
    assert.equal(retiredBody.data.items[0]!.itemSlug, 'apple-iphone-16');
    assert.equal(
      retiredBody.data.items[0]!.productHref,
      '/smartphones/apple-iphone-16'
    );
    assert.equal(retiredBody.data.items[0]!.sizeRequired, true);
    assert.equal(retiredBody.data.items[0]!.retiredVariant, true);
    assert.deepEqual(retiredBody.data.missingSlugs, ['apple-iphone-16-256gb']);
    assert.deepEqual(retiredBody.data.uncoveredSlugs, [
      'apple-iphone-16-256gb',
    ]);
    assert.equal(retiredBody.data.singleStoreBest, null);
    assert.equal(retiredBody.data.multiStoreOptimal, null);

    // 5g. RATE_ITEM_MODEL off still resolves canonical master product slugs cleanly
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

    // 6. Duplicate resolved product (Item slug + its default variant slug) -> 400 + INVALID_QUERY
    const dupResolvedRes = await GET(
      new NextRequest(
        'http://localhost/api/v1/rate/combo-cart?items=apple-iphone-16,apple-iphone-16-128gb',
        { headers: { 'x-forwarded-for': '203.0.113.51' } }
      )
    );
    assert.equal(dupResolvedRes.status, 400);
    assert.equal(dupResolvedRes.headers.get('cache-control'), 'no-store');
    assert.equal(
      ((await dupResolvedRes.json()) as { code?: string }).code,
      'INVALID_QUERY'
    );

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
    const itemsSchemaProps = (
      comboOp.responses['200'] as {
        content?: {
          'application/json'?: {
            schema?: {
              properties?: {
                data?: {
                  properties?: {
                    items?: {
                      items?: {
                        properties?: Record<string, unknown>;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      }
    )?.content?.['application/json']?.schema?.properties?.data?.properties
      ?.items?.items?.properties;
    assert.ok(itemsSchemaProps?.retiredVariant);
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
