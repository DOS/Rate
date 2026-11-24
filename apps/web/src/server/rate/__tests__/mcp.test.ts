import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { BoundedSlidingWindowRateLimiter } from '../api-handler';
import {
  CANONICAL_RATE_ORIGIN,
  MAX_MCP_BODY_BYTES,
  MAX_MCP_RESULT_ITEMS,
  MCP_LATEST_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_TOOL_DEFINITIONS,
  buildRateLlmsTxt,
  buildRateWellKnownMcpDescriptor,
  handleMcpHttpPost,
  type McpDataReaders,
} from '../mcp';
import { computeEffectivePrice } from '../../../lib/effective-price';
import {
  DELETE as deleteMcpRoute,
  GET as getMcpRoute,
  OPTIONS as optionsMcpRoute,
  POST as postMcpRoute,
} from '../../../app/api/mcp/route';
import { GET as getLlmsTxtRoute } from '../../../app/llms.txt/route';
import { GET as getWellKnownMcpRoute } from '../../../app/.well-known/mcp.json/route';
import {
  parseEcommerceUrlOrQuery,
  type MasterProduct,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
  type ReviewAnalysisSummary,
  type UrlInspectionResult,
} from '../../../lib/rate-api';
import type { CrossPlatformDealRadarResponse } from '../deals';

const FIXED_NOW_ISO = '2026-11-22T14:30:00.000Z';

function makeProduct(
  overrides: Partial<MasterProduct> & { id: string; slug: string; name: string }
): MasterProduct {
  return {
    brand: 'Apple',
    model: overrides.name,
    model_key: overrides.slug,
    has_5g: true,
    specifications: {
      display: { refresh_rate_hz: 120, type: 'LTPO OLED' },
      hardware: { chipset: 'Apple A18 Pro', ram_gb: 8 },
      battery: { capacity_mah: 4685, fast_charging_w: 30 },
    },
    key_specs: {
      chipset: 'Apple A18 Pro',
      ram_gb: 8,
      storage_gb: 256,
    },
    images: ['/img/devices/apple-iphone-16-pro-max-256gb.jpg'],
    colors: ['Natural Titanium'],
    min_price: 28_990_000,
    max_price: 32_990_000,
    merchant_count: 4,
    total_reviews: 48,
    average_rating: 4.8,
    rating_score: 4.82,
    user_rating_weighted: 4.82,
    expert_rating: 9.4,
    authentic_review_count: 42,
    criteria_scores: {
      screen: { score: 4.8, writers: 12 },
      performance: { score: 4.9, writers: 12 },
      camera: { score: 4.9, writers: 12 },
      battery: { score: 4.6, writers: 12 },
      value: { score: 4.2, writers: 12 },
    },
    status: 'published',
    metadata: { category_slug: 'smartphones' },
    updated_at: '2026-11-22T12:00:00.000Z',
    ...overrides,
  } as MasterProduct;
}

function makeOffer(
  overrides: Partial<MerchantOffer> & {
    id: string;
    platform: string;
    price_current: number;
  }
): MerchantOffer {
  return {
    title: 'Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    price_original: 34_990_000,
    stock: 15,
    rating_star: 4.9,
    rating_count: 120,
    url: `https://${overrides.platform}.vn/product/${overrides.id}`,
    availability: 'in_stock',
    merchant: {
      id: `merchant-${overrides.platform}`,
      name: `${overrides.platform.toUpperCase()} Official`,
      platform: overrides.platform,
      is_official: true,
      rating_star: 4.9,
      follower_count: 50_000,
      location: 'Ho Chi Minh City',
      risk_score: 8,
      dosafe_risk_score: 0,
      review_risk_score: 8,
      review_risk_breakdown: { total_reviews: 25 },
    },
    ...overrides,
  };
}

const iphoneProduct = makeProduct({
  id: '11111111-1111-4111-8111-000000000001',
  slug: 'apple-iphone-16-pro-max-256gb',
  name: 'Apple iPhone 16 Pro Max 256GB',
  brand: 'Apple',
});

const galaxyProduct = makeProduct({
  id: '11111111-1111-4111-8111-000000000002',
  slug: 'samsung-galaxy-s25-ultra-256gb',
  name: 'Samsung Galaxy S25 Ultra 256GB',
  brand: 'Samsung',
  min_price: 26_490_000,
  max_price: 30_990_000,
  rating_score: 4.78,
  user_rating_weighted: 4.78,
  expert_rating: 9.2,
  criteria_scores: {
    screen: { score: 4.9, writers: 10 },
    performance: { score: 4.95, writers: 10 },
    camera: { score: 4.6, writers: 10 },
    battery: { score: 4.85, writers: 10 },
    value: { score: 4.7, writers: 10 },
  },
});

const macbookProduct = makeProduct({
  id: '11111111-1111-4111-8111-000000000003',
  slug: 'apple-macbook-air-m3-16gb-256gb',
  name: 'Apple MacBook Air M3 16GB 256GB',
  brand: 'Apple',
  metadata: { category_slug: 'laptops' },
});

const sampleOffersForIphone: MerchantOffer[] = [
  // Bait-price silicone case trap (must be excluded from floor!)
  makeOffer({
    id: 'offer-bait-case',
    platform: 'shopee',
    title: 'Ốp lưng silicon iPhone 16 Pro Max',
    price_current: 89_000,
    price_original: 150_000,
    merchant: {
      id: 'merchant-random',
      name: 'Random Case Shop',
      platform: 'shopee',
      is_official: false,
      rating_star: 4.2,
      follower_count: 100,
      location: 'Hanoi',
      risk_score: 45,
      dosafe_risk_score: 0,
      // No analysed reviews -> must be nulled by withPublicOfferReviewRisk
      review_risk_score: 25,
      review_risk_breakdown: { total_reviews: 0 },
    },
  }),
  // Sold-out stale cheap listing (must be excluded from floor!)
  makeOffer({
    id: 'offer-sold-out',
    platform: 'tiki',
    price_current: 25_990_000,
    availability: 'out_of_stock',
  }),
  // Valid Official Mall floor offer
  makeOffer({
    id: 'offer-cps-official',
    platform: 'cellphones',
    price_current: 28_990_000,
    price_original: 34_990_000,
    url: 'https://cellphones.com.vn/iphone-16-pro-max.html',
  }),
  makeOffer({
    id: 'offer-shopee-mall',
    platform: 'shopee',
    price_current: 29_490_000,
    price_original: 34_990_000,
    url: 'https://shopee.vn/Apple-iPhone-16-Pro-Max-i.88201679.27110898667',
    merchant: {
      id: 'merchant-shopee-unanalysed',
      name: 'Apple Flagship Store',
      platform: 'shopee',
      is_official: true,
      rating_star: 4.9,
      follower_count: 900_000,
      location: 'Ho Chi Minh City',
      risk_score: 5,
      dosafe_risk_score: 0,
      dosafe_risk_known: false,
      review_risk_score: 12,
      review_risk_breakdown: { total_reviews: 0 },
    } as MerchantOffer['merchant'] & { dosafe_risk_known: boolean },
  }),
  makeOffer({
    id: 'offer-tgdd',
    platform: 'tgdd',
    price_current: 30_990_000,
    price_original: 34_990_000,
    url: 'https://www.thegioididong.com/dtdd/iphone-16-pro-max',
  }),
];

const sampleOffersForGalaxy: MerchantOffer[] = [
  makeOffer({
    id: 'offer-galaxy-cps',
    platform: 'cellphones',
    title: 'Samsung Galaxy S25 Ultra 256GB',
    price_current: 26_490_000,
    price_original: 31_990_000,
    url: 'https://cellphones.com.vn/samsung-galaxy-s25-ultra.html',
  }),
  makeOffer({
    id: 'offer-galaxy-fpt',
    platform: 'fptshop',
    title: 'Samsung Galaxy S25 Ultra 256GB',
    price_current: 27_990_000,
    price_original: 31_990_000,
    url: 'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s25-ultra',
  }),
  makeOffer({
    id: 'offer-galaxy-hhm',
    platform: 'hoangha',
    title: 'Samsung Galaxy S25 Ultra 256GB',
    price_current: 26_790_000,
    price_original: 31_990_000,
    url: 'https://hoanghamobile.com/dien-thoai/samsung-galaxy-s25-ultra',
  }),
];

function createMockReaders(): McpDataReaders {
  const catalog = Array.from({ length: 14 }, (_, i) =>
    i === 0
      ? iphoneProduct
      : i === 1
        ? galaxyProduct
        : makeProduct({
            id: `11111111-1111-4111-8111-0000000000${String(i + 10).padStart(2, '0')}`,
            slug: `sample-phone-${i + 1}`,
            name: `Sample Phone ${i + 1}`,
            min_price: 10_000_000 + i * 500_000,
          })
  );

  return {
    nowIso: () => FIXED_NOW_ISO,
    resolveCompareTokenTarget: async (rawToken) => {
      const trimmed = rawToken.trim();
      if (trimmed.includes('@')) {
        const [base, vKey] = trimmed.split('@');
        if (
          base?.toLowerCase() === 'iphone-16-pro-max' &&
          vKey?.toLowerCase() === '256gb'
        ) {
          return {
            variantSlug: iphoneProduct.slug,
            itemId: 'item-iphone-16-pro-max',
          };
        }
        return { variantSlug: null, itemId: null };
      }
      if (trimmed.toLowerCase() === 'iphone-16-pro-max') {
        return {
          variantSlug: iphoneProduct.slug,
          itemId: 'item-iphone-16-pro-max',
        };
      }
      if (trimmed.toLowerCase() === iphoneProduct.slug) {
        return {
          variantSlug: iphoneProduct.slug,
          itemId: 'item-iphone-16-pro-max',
        };
      }
      return { variantSlug: trimmed.toLowerCase(), itemId: null };
    },
    getCachedMasterProducts: async (params) => {
      const lim = params?.limit ?? 24;
      return catalog
        .filter((p) =>
          params?.search
            ? p.name.toLowerCase().includes(params.search.toLowerCase())
            : true
        )
        .slice(0, lim);
    },
    getCachedMasterProductBySlug: async (slug) => {
      const lower = slug.toLowerCase();
      if (lower === iphoneProduct.slug) return iphoneProduct;
      if (lower === galaxyProduct.slug) return galaxyProduct;
      if (lower === macbookProduct.slug) return macbookProduct;
      return null;
    },
    getCachedMasterProductOffers: async (id) => {
      if (id === iphoneProduct.id) return sampleOffersForIphone;
      if (id === galaxyProduct.id) return sampleOffersForGalaxy;
      return [
        makeOffer({
          id: `offer-${id}-1`,
          platform: 'cellphones',
          price_current: 15_990_000,
        }),
        makeOffer({
          id: `offer-${id}-2`,
          platform: 'fptshop',
          price_current: 16_490_000,
        }),
      ];
    },
    getCachedMasterProductReviews: async () => [],
    getCachedMasterProductReviewSummary:
      async (): Promise<ReviewAnalysisSummary> => ({
        total_analyzed: 48,
        authentic_pct: 88,
        suspicious_pct: 8,
        fake_pct: 4,
        pros: [
          'Excellent 5x tetraprism camera',
          'Cool thermals under sustained load',
        ],
        cons: ['30W wired charging is slower than peers'],
        ai_summary:
          'Verified buyers praise camera consistency and battery life.',
      }),
    getCachedMasterProductPriceHistory:
      async (): Promise<MasterProductPriceHistorySummary> => ({
        points: [
          {
            id: 1,
            product_id: 'offer-cps-official',
            merchant_name: 'CELLPHONES Official',
            platform: 'cellphones',
            is_official: true,
            price: 28_990_000,
            price_original: 34_990_000,
            recorded_at: '2026-11-22T13:45:00.000Z',
            source: 'crawler',
          },
        ],
        byOffer: {
          'offer-cps-official': {
            product_id: 'offer-cps-official',
            merchant_name: 'CELLPHONES Official',
            platform: 'cellphones',
            price_current: 28_990_000,
            price_original: 34_990_000,
            claimed_discount_pct: 17,
            real_discount_vs_median_pct: 4.9,
            historical_min_price: 28_790_000,
            historical_max_price: 33_990_000,
            historical_median_price: 30_490_000,
            observation_count: 14,
            verdict: 'genuine_deal',
            badge_label: 'Genuine Deal',
            explanation: '4.9% below historical median.',
          },
        },
        lowestEverPrice: 28_790_000,
        lowestEverDate: '2026-11-11T00:00:00.000Z',
        lowestEverMerchant: 'CELLPHONES Official',
        highestEverPrice: 33_990_000,
        currentMinPrice: 28_990_000,
        fakeDiscountCount: 0,
        genuineDealCount: 2,
      }),
    getCachedCompareMasterProducts: async (csv) => {
      const slugs = csv.split(',').map((s) => s.trim().toLowerCase());
      const matched = slugs
        .map((s) => {
          if (s === iphoneProduct.slug) return iphoneProduct;
          if (s === galaxyProduct.slug) return galaxyProduct;
          if (s === macbookProduct.slug) return macbookProduct;
          return null;
        })
        .filter((p): p is MasterProduct => p !== null);
      if (matched.length === 0) return [];
      const firstCat =
        (matched[0]!.metadata as { category_slug?: string })?.category_slug ??
        'smartphones';
      return matched.filter(
        (p) =>
          ((p.metadata as { category_slug?: string })?.category_slug ??
            'smartphones') === firstCat
      );
    },
    getCachedFilteredReviewCountsByMaster: async () => ({
      [iphoneProduct.id]: 6,
      [galaxyProduct.id]: 3,
    }),
    getCachedInspectProductOrShopUrl: async (
      rawQuery
    ): Promise<UrlInspectionResult> => ({
      query: rawQuery,
      matchedType: 'product_listing',
      parsedUrl: parseEcommerceUrlOrQuery(rawQuery),
      masterProduct: iphoneProduct,
      matchedOffer: sampleOffersForIphone[3]!,
      allOffers: sampleOffersForIphone,
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [galaxyProduct],
    }),
    getCrossPlatformDealRadar: async (
      opts
    ): Promise<CrossPlatformDealRadarResponse> => {
      const deals = Array.from({ length: 12 }, (_, idx) => ({
        id: `deal-phone-${idx + 1}`,
        verdict:
          idx === 0
            ? ('genuine_all_time_low' as const)
            : ('best_market_deal' as const),
        verdictBadgeVi: 'Giá Tốt Nhất Hiện Có',
        productSlug: idx === 0 ? iphoneProduct.slug : `sample-phone-${idx + 1}`,
        productName: idx === 0 ? iphoneProduct.name : `Sample Phone ${idx + 1}`,
        brand: idx % 2 === 0 ? 'Apple' : 'Samsung',
        categorySlug: 'smartphones' as const,
        productHref: `/smartphones/${idx === 0 ? iphoneProduct.slug : `sample-phone-${idx + 1}`}`,
        imageUrl: '/img/devices/apple-iphone-16-pro-max-256gb.jpg',
        platform: idx % 2 === 0 ? 'cellphones' : 'shopee',
        merchantId: `merchant-${idx + 1}`,
        merchantName:
          idx % 2 === 0 ? 'CellphoneS Official' : 'Third-Party Shop',
        isOfficialMall: idx % 2 === 0,
        merchantRiskScore: 8,
        offerUrl: 'https://cellphones.com.vn/iphone-16-pro-max.html',
        priceCurrent: 18_000_000 + idx * 2_000_000,
        priceOriginal: 22_000_000 + idx * 2_000_000,
        marketMedianPrice: 20_500_000 + idx * 2_000_000,
        marketMinPrice: 18_000_000 + idx * 2_000_000,
        marketMaxPrice: 23_000_000 + idx * 2_000_000,
        savingsVsMedianVnd: 2_500_000,
        savingsVsMedianPct: 11.2,
        marketOfferCount: 6,
        claimedDiscountPct: 18,
        fakeMarkupPct: 0,
        jreviewsScore10: 9.4,
        explanationVi: 'Rẻ hơn trung vị.',
      }));
      return {
        generatedAt: FIXED_NOW_ISO,
        categoryFilter: opts?.categorySlug ?? 'all',
        platformFilter: opts?.platform ?? 'all',
        totalClustersAnalyzed: 28,
        totalOffersAnalyzed: 164,
        totalMerchantsAnalyzed: 22,
        genuineDeals: deals,
        fakeSaleTraps: [],
        priceSpreadLeaders: [],
      };
    },
  };
}

function makeMcpRequest(
  body: string | ReadableStream<Uint8Array>,
  headers?: Record<string, string>
): NextRequest {
  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body,
    ...(typeof body !== 'string' ? { duplex: 'half' } : {}),
  };
  return new NextRequest('https://rate.vn/api/mcp', init as never);
}

async function runMcpTestSuite() {
  console.warn(
    '🧪 Running Rate Shopping MCP Server & AI Discovery Test Suite...'
  );

  // 0. Source-level server-only and zero em-dash / en-dash check
  const mcpSourcePath = path.resolve(__dirname, '../mcp.ts');
  const mcpSource = fs.readFileSync(mcpSourcePath, 'utf8');
  assert.ok(
    mcpSource.startsWith("import 'server-only';"),
    "mcp.ts must start with import 'server-only';"
  );
  for (const [label, text] of [
    ['mcp.ts', mcpSource],
    ['/llms.txt', buildRateLlmsTxt()],
    [
      '/.well-known/mcp.json',
      JSON.stringify(buildRateWellKnownMcpDescriptor()),
    ],
  ] as const) {
    assert.equal(
      /[\u2013\u2014]/.test(text),
      false,
      `${label} must contain zero em-dashes or en-dashes`
    );
  }

  // 1. Route HTTP method guards (GET -> 405, DELETE -> 405, OPTIONS -> 204)
  const getRes = await getMcpRoute();
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(getRes.headers.get('access-control-allow-origin'), '*');
  const getErrJson = (await getRes.json()) as {
    jsonrpc: string;
    error: { code: number };
  };
  assert.equal(getErrJson.jsonrpc, '2.0');
  assert.equal(getErrJson.error.code, -32600);

  const deleteRes = await deleteMcpRoute();
  assert.equal(deleteRes.status, 405);
  assert.equal(deleteRes.headers.get('allow'), 'POST, OPTIONS');

  const optRes = await optionsMcpRoute();
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(
    optRes.headers.get('access-control-allow-methods'),
    'POST, OPTIONS'
  );

  const readers = createMockReaders();
  const limiter = new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
  });
  const auditLimiter = new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
  });

  // 2. initialize (2025-06-18, 2025-03-26 backward compatibility, and unknown version negotiation)
  const initRes = await postMcpRoute(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'claude-desktop', version: '1.2.0' },
        },
      })
    )
  );
  assert.equal(initRes.status, 200);
  assert.equal(
    initRes.headers.get('mcp-protocol-version'),
    MCP_LATEST_PROTOCOL_VERSION
  );
  const initBody = (await initRes.json()) as {
    jsonrpc: string;
    id: number;
    result: {
      protocolVersion: string;
      capabilities: { tools: { listChanged: boolean } };
      serverInfo: { name: string; version: string };
    };
  };
  assert.equal(initBody.jsonrpc, '2.0');
  assert.equal(initBody.id, 1);
  assert.equal(initBody.result.protocolVersion, '2025-06-18');
  assert.equal(initBody.result.capabilities.tools.listChanged, false);
  assert.equal(initBody.result.serverInfo.name, 'rate-vn-shopping-mcp');
  assert.equal(initBody.result.serverInfo.version, '1.1.0');
  assert.equal(MCP_SERVER_INFO.version, '1.1.0');

  const initLegacyRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'init-legacy',
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(initLegacyRes.status, 200);
  assert.equal(initLegacyRes.headers.get('mcp-protocol-version'), '2025-03-26');
  const initLegacyJson = (await initLegacyRes.json()) as {
    result: { protocolVersion: string };
  };
  assert.equal(initLegacyJson.result.protocolVersion, '2025-03-26');

  const initFutureRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'init-future',
        method: 'initialize',
        params: { protocolVersion: '2099-01-01' },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(initFutureRes.status, 200);
  const initFutureJson = (await initFutureRes.json()) as {
    result: { protocolVersion: string };
  };
  assert.equal(initFutureJson.result.protocolVersion, '2025-06-18');

  // 3. notifications/initialized (202 Accepted without id, 200 JSON-RPC ack with id) & ping
  const notifRes = await postMcpRoute(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      })
    )
  );
  assert.equal(notifRes.status, 202);
  assert.equal(await notifRes.text(), '');

  const notifWithIdRes = await postMcpRoute(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'notif-1',
        method: 'notifications/initialized',
      })
    )
  );
  assert.equal(notifWithIdRes.status, 200);
  assert.deepEqual(await notifWithIdRes.json(), {
    jsonrpc: '2.0',
    id: 'notif-1',
    result: {},
  });

  const pingRes = await postMcpRoute(
    makeMcpRequest(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }))
  );
  assert.equal(pingRes.status, 200);
  assert.deepEqual(await pingRes.json(), {
    jsonrpc: '2.0',
    id: 7,
    result: {},
  });

  // 4. tools/list & Zod 4 JSON Schema verification
  const listRes = await postMcpRoute(
    makeMcpRequest(
      JSON.stringify({ jsonrpc: '2.0', id: 'list-1', method: 'tools/list' })
    )
  );
  assert.equal(listRes.status, 200);
  const listJson = (await listRes.json()) as {
    result: { tools: typeof MCP_TOOL_DEFINITIONS };
  };
  assert.equal(listJson.result.tools.length, 7);
  assert.deepEqual(
    listJson.result.tools.map((t) => t.name),
    [
      'search_verified_catalog',
      'get_22_store_offers_and_price_truth',
      'compare_devices_by_use_case',
      'audit_listing_url',
      'get_genuine_deals',
      'optimize_combo_cart',
      'calculate_effective_price',
    ]
  );
  for (const tool of listJson.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
  const offersSchema = listJson.result.tools.find(
    (t) => t.name === 'get_22_store_offers_and_price_truth'
  )!.inputSchema as {
    required?: string[];
    properties: Record<string, { maximum?: number }>;
  };
  assert.deepEqual(offersSchema.required, ['slug']);
  assert.equal(offersSchema.properties.limit?.maximum, MAX_MCP_RESULT_ITEMS);

  const comboSchema = listJson.result.tools.find(
    (t) => t.name === 'optimize_combo_cart'
  )!.inputSchema as {
    required?: string[];
    properties: Record<string, { minItems?: number; maxItems?: number }>;
  };
  assert.deepEqual(comboSchema.required, ['items']);
  assert.equal(comboSchema.properties.items?.minItems, 2);
  assert.equal(comboSchema.properties.items?.maxItems, 5);

  const effPriceSchema = listJson.result.tools.find(
    (t) => t.name === 'calculate_effective_price'
  )!.inputSchema as {
    required?: string[];
    properties: Record<string, { maximum?: number }>;
  };
  assert.deepEqual(effPriceSchema.required, ['slug']);
  assert.equal(effPriceSchema.properties.discountPercent?.maximum, 80);
  assert.equal(effPriceSchema.properties.installmentFeePercent?.maximum, 15);

  // 5. Tool 1: search_verified_catalog (caps <= 10, excludes bait/sold-out, includes citations + freshness)
  const searchRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-search',
        method: 'tools/call',
        params: {
          name: 'search_verified_catalog',
          arguments: { category: 'smartphones', limit: 10 },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(searchRes.status, 200);
  const searchJson = (await searchRes.json()) as {
    result: {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
      structuredContent: {
        ok: boolean;
        returned_count: number;
        canonical_citation_url: string;
        observed_at: string;
        items: Array<{
          slug: string;
          verified_min_price_vnd: number | null;
          excluded_unavailable_offer_count: number;
          excluded_bait_offer_count: number;
          canonical_citation_url: string;
          observed_at: string;
          price_observed_at: string;
        }>;
      };
    };
  };
  assert.equal(searchJson.result.isError, undefined);
  assert.equal(searchJson.result.structuredContent.ok, true);
  assert.equal(searchJson.result.structuredContent.returned_count, 10);
  assert.equal(
    searchJson.result.structuredContent.canonical_citation_url,
    'https://rate.vn/smartphones'
  );
  const firstSearchItem = searchJson.result.structuredContent.items[0]!;
  assert.equal(firstSearchItem.slug, 'apple-iphone-16-pro-max-256gb');
  // Bait 89k case and 25.99M sold-out listing must be excluded -> floor is 28,990,000 VND!
  assert.equal(firstSearchItem.verified_min_price_vnd, 28_990_000);
  assert.equal(firstSearchItem.excluded_unavailable_offer_count, 1);
  assert.equal(firstSearchItem.excluded_bait_offer_count, 1);
  for (const item of searchJson.result.structuredContent.items) {
    assert.ok(
      item.canonical_citation_url.startsWith(`${CANONICAL_RATE_ORIGIN}/`)
    );
    assert.ok(Date.parse(item.observed_at) > 0);
    assert.ok(Date.parse(item.price_observed_at) > 0);
  }
  assert.deepEqual(
    JSON.parse(searchJson.result.content[0]!.text),
    searchJson.result.structuredContent
  );

  // 6. Tool 2: get_22_store_offers_and_price_truth
  const offersRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-offers',
        method: 'tools/call',
        params: {
          name: 'get_22_store_offers_and_price_truth',
          arguments: {
            slug: 'apple-iphone-16-pro-max-256gb',
            officialOnly: true,
            limit: 10,
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(offersRes.status, 200);
  const offersBody = (await offersRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        canonical_citation_url: string;
        price_observed_at: string;
        price_truth: {
          verified_min_price_vnd: number;
          excluded_unavailable_offer_count: number;
          excluded_bait_offer_count: number;
        };
        review_trust_summary: {
          trust_model: string;
          authentic_pct: number;
        };
        offers: Array<{
          id: string;
          price_current_vnd: number;
          merchant: { review_risk_score: number | null };
          canonical_citation_url: string;
          price_observed_at: string;
        }>;
      };
    };
  };
  const offersData = offersBody.result.structuredContent;
  assert.equal(offersData.ok, true);
  assert.equal(
    offersData.canonical_citation_url,
    'https://rate.vn/smartphones/apple-iphone-16-pro-max-256gb'
  );
  assert.equal(offersData.price_observed_at, '2026-11-22T13:45:00.000Z');
  assert.equal(offersData.price_truth.verified_min_price_vnd, 28_990_000);
  assert.equal(offersData.price_truth.excluded_unavailable_offer_count, 1);
  assert.equal(offersData.price_truth.excluded_bait_offer_count, 1);
  assert.equal(
    offersData.review_trust_summary.trust_model,
    'review_trust_v2_6_axis'
  );
  assert.equal(offersData.review_trust_summary.authentic_pct, 88);
  assert.equal(offersData.offers.length, 3);
  assert.equal(offersData.offers[0]!.id, 'offer-cps-official');
  // Merchant with 0 analysed reviews must report null review_risk_score (#1376)
  const shopeeOffer = offersData.offers.find(
    (o) => o.id === 'offer-shopee-mall'
  )!;
  assert.equal(shopeeOffer.merchant.review_risk_score, null);
  for (const offer of offersData.offers) {
    assert.equal(
      offer.canonical_citation_url,
      'https://rate.vn/smartphones/apple-iphone-16-pro-max-256gb#offers-table'
    );
    assert.ok(Date.parse(offer.price_observed_at) > 0);
  }

  // Not-found slug returns domain isError: true with citation URL
  const missingSlugRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-missing-slug',
        method: 'tools/call',
        params: {
          name: 'get_22_store_offers_and_price_truth',
          arguments: { slug: 'unknown-device-slug-2026' },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const missingSlugJson = (await missingSlugRes.json()) as {
    result: {
      isError: boolean;
      structuredContent: { ok: boolean; canonical_citation_url: string };
    };
  };
  assert.equal(missingSlugJson.result.isError, true);
  assert.equal(missingSlugJson.result.structuredContent.ok, false);
  assert.equal(
    missingSlugJson.result.structuredContent.canonical_citation_url,
    CANONICAL_RATE_ORIGIN
  );

  // 7. Tool 3: compare_devices_by_use_case (weight overrides shift winner & cross-category check)
  const comparePhotoRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-compare-photo',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: {
            slugs: [
              'apple-iphone-16-pro-max-256gb',
              'samsung-galaxy-s25-ultra-256gb',
            ],
            weights: {
              camera: 90,
              screen: 0,
              performance: 0,
              battery: 0,
              value: 10,
            },
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const comparePhotoJson = (await comparePhotoRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        recommended_slug_for_use_case: string;
        canonical_citation_url: string;
        devices: Array<{
          slug: string;
          canonical_citation_url: string;
          observed_at: string;
        }>;
      };
    };
  };
  assert.equal(comparePhotoJson.result.structuredContent.ok, true);
  assert.equal(
    comparePhotoJson.result.structuredContent.recommended_slug_for_use_case,
    'apple-iphone-16-pro-max-256gb'
  );
  assert.ok(
    comparePhotoJson.result.structuredContent.canonical_citation_url.startsWith(
      'https://rate.vn/compare?cat=smartphones&slugs='
    )
  );

  const compareValueRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-compare-value',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: {
            slugs: [
              'apple-iphone-16-pro-max-256gb',
              'samsung-galaxy-s25-ultra-256gb',
            ],
            weights: {
              camera: 0,
              screen: 0,
              performance: 10,
              battery: 40,
              value: 50,
            },
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const compareValueJson = (await compareValueRes.json()) as {
    result: { structuredContent: { recommended_slug_for_use_case: string } };
  };
  assert.equal(
    compareValueJson.result.structuredContent.recommended_slug_for_use_case,
    'samsung-galaxy-s25-ultra-256gb'
  );

  const crossCatRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-compare-cross',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: {
            slugs: [
              'apple-iphone-16-pro-max-256gb',
              'apple-macbook-air-m3-16gb-256gb',
            ],
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const crossCatJson = (await crossCatRes.json()) as {
    result: {
      isError: boolean;
      structuredContent: { excluded_cross_category_slugs: string[] };
    };
  };
  assert.equal(crossCatJson.result.isError, true);
  assert.deepEqual(
    crossCatJson.result.structuredContent.excluded_cross_category_slugs,
    ['apple-macbook-air-m3-16gb-256gb']
  );

  // 8. Tool 4: audit_listing_url + SSRF / unsupported host rejection
  const auditRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-audit',
        method: 'tools/call',
        params: {
          name: 'audit_listing_url',
          arguments: {
            url: 'https://shopee.vn/Apple-iPhone-16-Pro-Max-i.88201679.27110898667?utm_source=fb&sp_atk=xyz',
            observedPriceVnd: 29_490_000,
            observedOriginalPriceVnd: 45_990_000,
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const auditJson = (await auditRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        canonical_listing_url: string;
        canonical_citation_url: string;
        inspect_citation_url: string;
        observed_at: string;
        merchant_risk_summary: { review_risk_score: number | null };
        top_competing_offers: Array<{ canonical_citation_url: string }>;
      };
    };
  };
  assert.equal(auditJson.result.structuredContent.ok, true);
  assert.ok(
    !auditJson.result.structuredContent.canonical_listing_url.includes(
      'utm_source'
    )
  );
  assert.equal(
    auditJson.result.structuredContent.canonical_citation_url,
    'https://rate.vn/smartphones/apple-iphone-16-pro-max-256gb'
  );
  assert.equal(
    auditJson.result.structuredContent.merchant_risk_summary.review_risk_score,
    null
  );
  assert.ok(
    auditJson.result.structuredContent.top_competing_offers.length <= 5
  );

  for (const badUrl of [
    'http://localhost:3000/secret',
    'http://127.0.0.1/admin',
    'javascript:alert(1)',
    'https://evil.example/product/123',
  ]) {
    const badUrlRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'bad-url',
          method: 'tools/call',
          params: { name: 'audit_listing_url', arguments: { url: badUrl } },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    const badUrlJson = (await badUrlRes.json()) as { error: { code: number } };
    assert.equal(
      badUrlJson.error.code,
      -32602,
      `must reject unsafe URL ${badUrl}`
    );
  }

  // 9. Tool 5: get_genuine_deals (caps <= 10, filters officialOnly & maxBudgetVnd)
  const dealsRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-deals',
        method: 'tools/call',
        params: {
          name: 'get_genuine_deals',
          arguments: {
            category: 'smartphones',
            officialOnly: true,
            maxBudgetVnd: 30_000_000,
            limit: 10,
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const dealsJson = (await dealsRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        canonical_citation_url: string;
        deals: Array<{
          is_official_mall: boolean;
          price_current_vnd: number;
          canonical_citation_url: string;
          observed_at: string;
        }>;
      };
    };
  };
  assert.equal(dealsJson.result.structuredContent.ok, true);
  assert.equal(
    dealsJson.result.structuredContent.canonical_citation_url,
    'https://rate.vn/deals'
  );
  assert.ok(
    dealsJson.result.structuredContent.deals.length > 0 &&
      dealsJson.result.structuredContent.deals.length <= MAX_MCP_RESULT_ITEMS
  );
  for (const deal of dealsJson.result.structuredContent.deals) {
    assert.equal(deal.is_official_mall, true);
    assert.ok(deal.price_current_vnd <= 30_000_000);
    assert.ok(
      deal.canonical_citation_url.startsWith('https://rate.vn/smartphones/')
    );
    assert.equal(deal.observed_at, FIXED_NOW_ISO);
  }

  // 10. Security & anti-DoS guards: oversize body (413 / -32600), streamed oversize, Content-Type (415),
  //     batch arrays, invalid JSON-RPC, prototype keys, lone surrogates, rate limit 429, and error sanitization
  const oversizeHeaderRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
      'content-length': String(MAX_MCP_BODY_BYTES + 1),
    }),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(oversizeHeaderRes.status, 413);
  const oversizeHeaderJson = (await oversizeHeaderRes.json()) as {
    error: { code: number; data: { code: string } };
  };
  assert.equal(oversizeHeaderJson.error.code, -32600);
  assert.equal(oversizeHeaderJson.error.data.code, 'PAYLOAD_TOO_LARGE');

  let streamedBytes = 0;
  const hugeStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      streamedBytes += 4096;
      if (streamedBytes > 128 * 1024) controller.close();
      else controller.enqueue(new Uint8Array(4096).fill(65));
    },
  });
  const oversizeStreamRes = await handleMcpHttpPost(
    makeMcpRequest(hugeStream),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(oversizeStreamRes.status, 413);
  assert.ok(
    streamedBytes <= MAX_MCP_BODY_BYTES + 8192,
    `oversize stream cancelled early at ${streamedBytes} bytes`
  );

  // Exact 16384-byte valid JSON body passes size guard
  const padPrefix = '{"jsonrpc":"2.0","id":"';
  const padSuffix = '","method":"ping"}';
  const exact16kId = 'x'.repeat(200);
  const exactPadded =
    `${padPrefix}${exact16kId}${padSuffix}` +
    ' '.repeat(
      MAX_MCP_BODY_BYTES -
        Buffer.byteLength(`${padPrefix}${exact16kId}${padSuffix}`, 'utf8')
    );
  assert.equal(Buffer.byteLength(exactPadded, 'utf8'), MAX_MCP_BODY_BYTES);
  const exact16kRes = await handleMcpHttpPost(makeMcpRequest(exactPadded), {
    readers,
    rateLimiter: limiter,
    auditUrlRateLimiter: auditLimiter,
  });
  assert.equal(exact16kRes.status, 200);

  // Wrong Content-Type -> 415
  const wrongCtRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
      'content-type': 'text/plain',
    }),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(wrongCtRes.status, 415);

  // Batch array -> 400 -32600
  const batchRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ])
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(batchRes.status, 400);
  assert.equal(
    ((await batchRes.json()) as { error: { code: number } }).error.code,
    -32600
  );

  // Invalid JSON & invalid JSON-RPC envelopes
  const badJsonRes = await handleMcpHttpPost(makeMcpRequest('{broken'), {
    readers,
    rateLimiter: limiter,
    auditUrlRateLimiter: auditLimiter,
  });
  assert.equal(badJsonRes.status, 400);
  assert.equal(
    ((await badJsonRes.json()) as { error: { code: number } }).error.code,
    -32700
  );

  for (const invalidEnvelope of [
    '{"jsonrpc":"1.0","id":1,"method":"ping"}',
    '{"jsonrpc":"2.0","id":null,"method":"ping"}',
    '{"jsonrpc":"2.0","method":"tools/list"}',
    '{"jsonrpc":"2.0","id":{},"method":"ping"}',
  ]) {
    const res = await handleMcpHttpPost(makeMcpRequest(invalidEnvelope), {
      readers,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    });
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: { code: number } }).error.code,
      -32600
    );
  }

  // Prototype pollution keys rejected at root, params, and nested arguments
  for (const protoPayload of [
    '{"jsonrpc":"2.0","id":1,"method":"ping","__proto__":{"polluted":true}}',
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_genuine_deals","arguments":{"constructor":{"prototype":{"polluted":true}}}}}',
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"prototype":{}}}',
  ]) {
    const protoRes = await handleMcpHttpPost(makeMcpRequest(protoPayload), {
      readers,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    });
    assert.equal(protoRes.status, 400);
    assert.equal(
      ((await protoRes.json()) as { error: { code: number } }).error.code,
      -32600
    );
    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      'Object.prototype must never be polluted'
    );
  }

  // Lone UTF-16 surrogate sanitization via .toWellFormed()
  let capturedWellFormedSearch = '';
  const surrogateRes = await handleMcpHttpPost(
    makeMcpRequest(
      '{"jsonrpc":"2.0","id":"surr-1","method":"tools/call","params":{"name":"search_verified_catalog","arguments":{"query":"iPhone \\uD800 16"}}}'
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProducts: async (p) => {
          capturedWellFormedSearch = p?.search ?? '';
          return [iphoneProduct];
        },
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  assert.equal(surrogateRes.status, 200);
  assert.equal(capturedWellFormedSearch, 'iPhone \uFFFD 16');

  // Strict Zod 4 rejection of limit > 10 and unknown extra arguments
  for (const invalidCallArgs of [
    { category: 'smartphones', limit: 11 },
    { category: 'smartphones', offset: 20 },
    { minPriceVnd: 30_000_000, maxPriceVnd: 10_000_000 },
  ]) {
    const badArgsRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'bad-args',
          method: 'tools/call',
          params: {
            name: 'search_verified_catalog',
            arguments: invalidCallArgs,
          },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    assert.equal(badArgsRes.status, 200);
    assert.equal(
      ((await badArgsRes.json()) as { error: { code: number } }).error.code,
      -32602
    );
  }

  // Unknown method (-32601) and unknown tool (-32602)
  const unknownMethodRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":9,"method":"resources/list"}'),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(
    ((await unknownMethodRes.json()) as { error: { code: number } }).error.code,
    -32601
  );

  const unknownToolRes = await handleMcpHttpPost(
    makeMcpRequest(
      '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"drop_database","arguments":{}}}'
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(
    ((await unknownToolRes.json()) as { error: { code: number } }).error.code,
    -32602
  );

  // Internal DB error sanitization (never leak PGRST / table / schema names)
  const dbFailRes = await handleMcpHttpPost(
    makeMcpRequest(
      '{"jsonrpc":"2.0","id":"db-err","method":"tools/call","params":{"name":"get_genuine_deals","arguments":{}}}'
    ),
    {
      readers: {
        ...readers,
        getCrossPlatformDealRadar: async () => {
          throw new Error(
            'PGRST116: relation "rate.master_products" does not exist in schema "rate" on supabase'
          );
        },
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  assert.equal(dbFailRes.status, 200);
  const dbFailText = await dbFailRes.text();
  assert.doesNotMatch(
    dbFailText,
    /PGRST|master_products|schema|supabase/i,
    'must never leak internal database details'
  );
  const dbFailParsed = JSON.parse(dbFailText) as {
    result: { isError: boolean };
  };
  assert.equal(dbFailParsed.result.isError, true);

  // Rate limit 429 + Retry-After on both overall MCP limiter and audit_listing_url limiter
  const strictLimiter = new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
  });
  for (let i = 0; i < 2; i++) {
    const ok = await handleMcpHttpPost(
      makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
        'x-forwarded-for': '198.51.100.77',
      }),
      { readers, rateLimiter: strictLimiter, auditUrlRateLimiter: auditLimiter }
    );
    assert.equal(ok.status, 200);
  }
  const rlRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":3,"method":"ping"}', {
      'x-forwarded-for': '198.51.100.77',
    }),
    { readers, rateLimiter: strictLimiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(rlRes.status, 429);
  assert.equal(rlRes.headers.get('retry-after'), '60');
  assert.match(
    rlRes.headers.get('access-control-expose-headers') ?? '',
    /Retry-After/
  );
  const rlJson = (await rlRes.json()) as {
    error: { code: number; data: { code: string } };
  };
  assert.equal(rlJson.error.code, -32029);
  assert.equal(rlJson.error.data.code, 'RATE_LIMIT_EXCEEDED');

  const strictAuditLimiter = new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 1,
  });
  const auditOk = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'a1',
        method: 'tools/call',
        params: {
          name: 'audit_listing_url',
          arguments: {
            url: 'https://cellphones.com.vn/iphone-16-pro-max.html',
          },
        },
      }),
      { 'x-forwarded-for': '198.51.100.88' }
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: strictAuditLimiter }
  );
  assert.equal(auditOk.status, 200);
  const auditRl = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'a2',
        method: 'tools/call',
        params: {
          name: 'audit_listing_url',
          arguments: {
            url: 'https://cellphones.com.vn/iphone-16-pro-max.html',
          },
        },
      }),
      { 'x-forwarded-for': '198.51.100.88' }
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: strictAuditLimiter }
  );
  assert.equal(auditRl.status, 429);
  assert.equal(auditRl.headers.get('retry-after'), '60');

  // 11. /llms.txt and /.well-known/mcp.json route handlers
  const llmsRes = await getLlmsTxtRoute();
  assert.equal(llmsRes.status, 200);
  assert.equal(
    llmsRes.headers.get('content-type'),
    'text/plain; charset=utf-8'
  );
  assert.equal(
    llmsRes.headers.get('cache-control'),
    'public, s-maxage=3600, stale-while-revalidate=86400'
  );
  const llmsAllowHeaders =
    llmsRes.headers.get('access-control-allow-headers') ?? '';
  assert.match(llmsAllowHeaders, /MCP-Protocol-Version/);
  assert.match(llmsAllowHeaders, /Accept/);
  const llmsBody = await llmsRes.text();
  for (const expectedFragment of [
    'Server Version: `1.1.0`',
    'https://rate.vn/api/mcp',
    'https://rate.vn/.well-known/mcp.json',
    'https://rate.vn/api/v1/rate/openapi.json',
    'https://rate.vn/api/v1/rate/combo-cart',
    'https://rate.vn/api/v1/rate/og',
    'search_verified_catalog',
    'get_22_store_offers_and_price_truth',
    'compare_devices_by_use_case',
    'audit_listing_url',
    'get_genuine_deals',
    'optimize_combo_cart',
    'calculate_effective_price',
    '6-axis Review Trust Model v2',
    'anphatpc',
    'availability',
    'design',
    'display',
    'hardware',
    'battery',
    'camera',
    'connectivity',
    'cellular',
    'multimedia',
    'regulatory',
  ]) {
    assert.ok(
      llmsBody.includes(expectedFragment),
      `/llms.txt must mention ${expectedFragment}`
    );
  }

  const wkRes = await getWellKnownMcpRoute();
  assert.equal(wkRes.status, 200);
  assert.match(wkRes.headers.get('content-type') ?? '', /application\/json/);
  assert.match(
    wkRes.headers.get('access-control-allow-headers') ?? '',
    /MCP-Protocol-Version/
  );
  assert.equal(
    wkRes.headers.get('cache-control'),
    'public, s-maxage=3600, stale-while-revalidate=86400'
  );
  const wkJson = (await wkRes.json()) as {
    mcpVersion: string;
    serverInfo: { name: string; version: string };
    transport: string;
    url: string;
    endpoints: { mcp: string; transport: string };
    tools: Array<{ name: string }>;
  };
  assert.equal(wkJson.mcpVersion, '2025-06-18');
  assert.equal(wkJson.serverInfo.version, '1.1.0');
  assert.equal(wkJson.transport, 'streamable-http');
  assert.equal(wkJson.url, 'https://rate.vn/api/mcp');
  assert.equal(wkJson.endpoints.mcp, 'https://rate.vn/api/mcp');
  assert.equal(wkJson.endpoints.transport, 'streamable-http');
  assert.equal(wkJson.tools.length, 7);
  assert.deepEqual(
    wkJson.tools.map((t) => t.name),
    [
      'search_verified_catalog',
      'get_22_store_offers_and_price_truth',
      'compare_devices_by_use_case',
      'audit_listing_url',
      'get_genuine_deals',
      'optimize_combo_cart',
      'calculate_effective_price',
    ]
  );

  // 12. Round-1 review regressions (protocol headers, stream errors, IDs, price filters, synthetic points, DOSafe masking, compare deduplication)
  // 12a. audit_listing_url canonicalizes tracking params BEFORE getCachedInspectProductOrShopUrl and handles rate.vn dotted paths safely
  let capturedInspectQuery = '';
  const canonicalAuditRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'audit-canon',
        method: 'tools/call',
        params: {
          name: 'audit_listing_url',
          arguments: {
            url: 'https://shopee.vn/Apple-iPhone-16-Pro-Max-i.88201679.27110898667?utm_source=zalo&sp_atk=abc123&fbclid=xyz',
          },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedInspectProductOrShopUrl: async (rawQuery) => {
          capturedInspectQuery = rawQuery;
          return readers.getCachedInspectProductOrShopUrl(rawQuery);
        },
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  assert.equal(canonicalAuditRes.status, 200);
  assert.ok(
    !capturedInspectQuery.includes('utm_source') &&
      !capturedInspectQuery.includes('sp_atk') &&
      !capturedInspectQuery.includes('fbclid'),
    `expected canonicalized URL before cache reader, got: ${capturedInspectQuery}`
  );

  for (const allowedRateUrl of [
    'https://rate.vn/smartphones/nokia-8.1',
    'https://rate.vn/merchants/anker.vn',
  ]) {
    const okRateUrlRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'ok-rate-url',
          method: 'tools/call',
          params: {
            name: 'audit_listing_url',
            arguments: { url: allowedRateUrl },
          },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    const okRateUrlJson = (await okRateUrlRes.json()) as {
      result?: { structuredContent: { ok: boolean } };
      error?: unknown;
    };
    assert.equal(
      okRateUrlJson.error,
      undefined,
      `must allow ${allowedRateUrl}`
    );
    assert.equal(okRateUrlJson.result?.structuredContent.ok, true);
  }

  for (const rejectedRateUrl of [
    'https://rate.vn/merchants/..',
    'https://rate.vn/api/mcp',
  ]) {
    const rejRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'rej-rate-url',
          method: 'tools/call',
          params: {
            name: 'audit_listing_url',
            arguments: { url: rejectedRateUrl },
          },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    assert.equal(
      ((await rejRes.json()) as { error: { code: number } }).error.code,
      -32602,
      `must reject ${rejectedRateUrl}`
    );
  }

  // 12b. Aborted/errored ReadableStream returns 400 JSON-RPC -32700 (never unhandled 500)
  const abortedStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error('client socket reset mid-stream'));
    },
  });
  const abortedRes = await handleMcpHttpPost(makeMcpRequest(abortedStream), {
    readers,
    rateLimiter: limiter,
    auditUrlRateLimiter: auditLimiter,
  });
  assert.equal(abortedRes.status, 400);
  assert.equal(
    ((await abortedRes.json()) as { error: { code: number } }).error.code,
    -32700
  );

  // 12c. MCP-Protocol-Version header negotiation on initialize vs strict check on ping
  const initFutureHeaderRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'init-hdr',
        method: 'initialize',
        params: { protocolVersion: '2099-01-01' },
      }),
      { 'mcp-protocol-version': '2099-01-01' }
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(initFutureHeaderRes.status, 200);
  assert.equal(
    initFutureHeaderRes.headers.get('mcp-protocol-version'),
    '2025-06-18'
  );

  const ping202503Res = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
      'mcp-protocol-version': '2025-03-26',
    }),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(ping202503Res.status, 200);
  assert.equal(ping202503Res.headers.get('mcp-protocol-version'), '2025-03-26');

  const pingUnsupportedVerRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
      'mcp-protocol-version': '2099-01-01',
    }),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(pingUnsupportedVerRes.status, 400);
  assert.equal(
    ((await pingUnsupportedVerRes.json()) as { error: { code: number } }).error
      .code,
    -32600
  );

  // 12d. search_verified_catalog enforces minPriceVnd/maxPriceVnd & price_asc on verified_min_price_vnd (never bait stored min_price)
  const baitStoredFloorProduct = makeProduct({
    id: '11111111-1111-4111-8111-000000000099',
    slug: 'bait-stored-floor-phone',
    name: 'Bait Stored Floor Phone',
    // Stored min_price polluted by 89k case, while real offer is 28.99M
    min_price: 89_000,
    max_price: 30_990_000,
  });
  const searchPriceFilterRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'search-price-truth',
        method: 'tools/call',
        params: {
          name: 'search_verified_catalog',
          arguments: {
            category: 'smartphones',
            maxPriceVnd: 27_000_000,
            sort: 'price_asc',
            limit: 10,
          },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProducts: async () => [
          baitStoredFloorProduct,
          galaxyProduct,
        ],
        getCachedMasterProductOffers: async (id) =>
          id === baitStoredFloorProduct.id
            ? sampleOffersForIphone
            : sampleOffersForGalaxy,
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const searchPriceFilterJson = (await searchPriceFilterRes.json()) as {
    result: {
      structuredContent: {
        items: Array<{ slug: string; verified_min_price_vnd: number }>;
      };
    };
  };
  assert.deepEqual(
    searchPriceFilterJson.result.structuredContent.items.map((i) => i.slug),
    ['samsung-galaxy-s25-ultra-256gb']
  );

  // 12e. get_22_store_offers_and_price_truth ignores synthetic live_listing / id < 0 points and sold-out offer timestamps, and masks dosafe_risk_known: false -> null (#1465)
  const syntheticHistRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'offers-synth',
        method: 'tools/call',
        params: {
          name: 'get_22_store_offers_and_price_truth',
          arguments: { slug: 'apple-iphone-16-pro-max-256gb' },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductPriceHistory: async () => ({
          points: [
            {
              id: -1,
              product_id: 'offer-cps-official',
              merchant_name: 'CELLPHONES Official',
              platform: 'cellphones',
              is_official: true,
              price: 28_990_000,
              price_original: 34_990_000,
              recorded_at: '2099-01-01T00:00:00.000Z',
              source: 'live_listing',
            },
            {
              id: 2,
              product_id: 'offer-sold-out',
              merchant_name: 'TIKI Sold Out',
              platform: 'tiki',
              is_official: true,
              price: 25_990_000,
              price_original: 34_990_000,
              recorded_at: '2098-01-01T00:00:00.000Z',
              source: 'crawler',
            },
            {
              id: 3,
              product_id: 'offer-cps-official',
              merchant_name: 'CELLPHONES Official',
              platform: 'cellphones',
              is_official: true,
              price: 28_990_000,
              price_original: 34_990_000,
              recorded_at: '2026-11-22T11:15:00.000Z',
              source: 'crawler',
            },
          ],
          byOffer: {},
          lowestEverPrice: 28_790_000,
          lowestEverDate: '2026-11-11T00:00:00.000Z',
          lowestEverMerchant: 'CELLPHONES Official',
          highestEverPrice: 33_990_000,
          currentMinPrice: 28_990_000,
          fakeDiscountCount: 0,
          genuineDealCount: 1,
        }),
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const syntheticHistJson = (await syntheticHistRes.json()) as {
    result: {
      structuredContent: {
        price_observed_at: string;
        offers: Array<{
          id: string;
          merchant: {
            dosafe_risk_score: number | null;
            review_risk_score: number | null;
          };
        }>;
      };
    };
  };
  assert.equal(
    syntheticHistJson.result.structuredContent.price_observed_at,
    '2026-11-22T11:15:00.000Z'
  );
  const shopeeMasked = syntheticHistJson.result.structuredContent.offers.find(
    (o) => o.id === 'offer-shopee-mall'
  )!;
  assert.equal(shopeeMasked.merchant.dosafe_risk_score, null);
  assert.equal(shopeeMasked.merchant.review_risk_score, null);

  // 12f. JSON-RPC numeric IDs (0 and -5 allowed, fractional 1.5 & >53-bit integer rejected), Accept q=0 -> 406, enum message, and compare deduplication/not_found/unrated
  for (const validNumericId of [0, -5]) {
    const idOkRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({ jsonrpc: '2.0', id: validNumericId, method: 'ping' })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    assert.equal(idOkRes.status, 200);
    assert.equal(((await idOkRes.json()) as { id: number }).id, validNumericId);
  }

  for (const unsafeIdBody of [
    '{"jsonrpc":"2.0","id":1.5,"method":"ping"}',
    '{"jsonrpc":"2.0","id":9007199254740993,"method":"ping"}',
  ]) {
    const badIdRes = await handleMcpHttpPost(makeMcpRequest(unsafeIdBody), {
      readers,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    });
    assert.equal(badIdRes.status, 400);
    assert.equal(
      ((await badIdRes.json()) as { error: { code: number } }).error.code,
      -32600
    );
  }

  const qZeroAcceptRes = await handleMcpHttpPost(
    makeMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}', {
      accept: 'application/json;q=0, text/event-stream;q=1',
    }),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  assert.equal(qZeroAcceptRes.status, 406);

  const invalidPlatformRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'bad-plat',
        method: 'tools/call',
        params: {
          name: 'get_genuine_deals',
          arguments: { platform: 'amazon' },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const invalidPlatformJson = (await invalidPlatformRes.json()) as {
    error: { code: number; message: string };
  };
  assert.equal(invalidPlatformJson.error.code, -32602);
  assert.match(invalidPlatformJson.error.message, /platform/i);

  const compareDedupRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'cmp-dedup',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: {
            slugs: [
              'iphone-16-pro-max',
              'apple-iphone-16-pro-max-256gb',
              'iphone-16-pro-max@999tb',
              'samsung-galaxy-s25-ultra-256gb',
            ],
          },
        },
      })
    ),
    { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
  );
  const compareDedupJson = (await compareDedupRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        deduplicated_slugs: string[];
        not_found_slugs: string[];
      };
    };
  };
  assert.equal(compareDedupJson.result.structuredContent.ok, true);
  assert.deepEqual(
    compareDedupJson.result.structuredContent.deduplicated_slugs,
    ['apple-iphone-16-pro-max-256gb']
  );
  assert.deepEqual(compareDedupJson.result.structuredContent.not_found_slugs, [
    'iphone-16-pro-max@999tb',
  ]);

  // Unrated devices return recommended_slug_for_use_case: null rather than fabricating a winner
  const unratedA = makeProduct({
    id: '11111111-1111-4111-8111-000000000091',
    slug: 'unrated-phone-a',
    name: 'Unrated Phone A',
    total_reviews: 0,
    average_rating: 0,
    rating_score: 0,
    user_rating_weighted: 0,
    expert_rating: 0,
    authentic_review_count: 0,
    criteria_scores: {},
  });
  const unratedB = makeProduct({
    id: '11111111-1111-4111-8111-000000000092',
    slug: 'unrated-phone-b',
    name: 'Unrated Phone B',
    total_reviews: 0,
    average_rating: 0,
    rating_score: 0,
    user_rating_weighted: 0,
    expert_rating: 0,
    authentic_review_count: 0,
    criteria_scores: {},
  });
  const compareUnratedRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'cmp-unrated',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: { slugs: ['unrated-phone-a', 'unrated-phone-b'] },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedCompareMasterProducts: async () => [unratedA, unratedB],
        getCachedFilteredReviewCountsByMaster: async () => ({}),
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const compareUnratedJson = (await compareUnratedRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        recommended_slug_for_use_case: string | null;
      };
    };
  };
  assert.equal(compareUnratedJson.result.structuredContent.ok, true);
  assert.equal(
    compareUnratedJson.result.structuredContent.recommended_slug_for_use_case,
    null
  );

  // 13. Tool 6: optimize_combo_cart (v1.1.0 - Plan A/B, bounded fan-out, retired variant guard, validation, DB sanitization)
  const comboEarbudProduct = makeProduct({
    id: '11111111-1111-4111-8111-000000000010',
    slug: 'apple-airpods-pro-2-usb-c',
    name: 'Apple AirPods Pro 2 USB-C',
    metadata: { category_slug: 'earbuds' },
    updated_at: '2026-11-22T10:15:00.000Z',
  });
  const comboWatchProduct = makeProduct({
    id: '11111111-1111-4111-8111-000000000011',
    slug: 'apple-watch-series-10-42mm',
    name: 'Apple Watch Series 10 42mm',
    metadata: { category_slug: 'smartwatches' },
    updated_at: '2026-11-22T10:20:00.000Z',
  });

  const COMBO_CPS_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const COMBO_MALL_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  const COMBO_EXPENSIVE_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  const comboProfileLookups: string[] = [];

  const comboReaders: McpDataReaders = {
    ...readers,
    resolveWatchlistSlug: async (slug) => {
      const lower = slug.toLowerCase();
      if (lower === 'apple-iphone-16') {
        return {
          variantSlug: iphoneProduct.slug,
          itemSlug: 'apple-iphone-16',
          itemCategoryId: 'cat-phone',
          sizeRequired: true,
        };
      }
      if (lower === 'apple-iphone-16-512gb-retired') {
        return {
          variantSlug: iphoneProduct.slug,
          itemSlug: 'apple-iphone-16',
          itemCategoryId: 'cat-phone',
          sizeRequired: true,
        };
      }
      return null;
    },
    getCachedMasterProductBySlug: async (slug) => {
      const lower = slug.toLowerCase();
      if (lower === iphoneProduct.slug) return iphoneProduct;
      if (lower === comboEarbudProduct.slug) return comboEarbudProduct;
      if (lower === comboWatchProduct.slug) return comboWatchProduct;
      return null;
    },
    getMasterProductOffersBatch: async () =>
      new Map<string, MerchantOffer[]>([
        [
          iphoneProduct.id,
          [
            makeOffer({
              id: 'c-p-bait',
              platform: 'shopee',
              price_current: 99_000,
              merchant: {
                id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9',
                name: 'Bait Shop',
                platform: 'shopee',
                is_official: false,
                rating_star: 4.2,
                follower_count: 100,
                location: 'Hanoi',
                risk_score: 5,
                dosafe_risk_score: 5,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 20 },
              },
            }),
            makeOffer({
              id: 'c-p-oos',
              platform: 'tiki',
              price_current: 20_000_000,
              availability: 'out_of_stock',
              merchant: {
                id: COMBO_MALL_ID,
                name: 'Apple Flagship Store',
                platform: 'shopee',
                is_official: true,
                rating_star: 4.9,
                follower_count: 200_000,
                location: 'Ho Chi Minh City',
                risk_score: 6,
                dosafe_risk_score: 4,
                review_risk_score: 6,
                review_risk_breakdown: { total_reviews: 30 },
              },
            }),
            makeOffer({
              id: 'c-p-cps',
              platform: 'cellphones',
              price_current: 28_990_000,
              price_original: null,
              merchant: {
                id: COMBO_CPS_ID,
                name: 'CellphoneS Official',
                platform: 'cellphones',
                is_official: true,
                rating_star: 4.9,
                follower_count: 150_000,
                location: 'Ho Chi Minh City',
                risk_score: 5,
                dosafe_risk_score: 3,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 40 },
              },
            }),
            makeOffer({
              id: 'c-p-mall',
              platform: 'shopee',
              price_current: 27_500_000,
              price_original: null,
              merchant: {
                id: COMBO_MALL_ID,
                name: 'Apple Flagship Store',
                platform: 'shopee',
                is_official: true,
                rating_star: 4.9,
                follower_count: 200_000,
                location: 'Ho Chi Minh City',
                risk_score: 6,
                dosafe_risk_score: 4,
                review_risk_score: 6,
                review_risk_breakdown: { total_reviews: 30 },
              },
            }),
            makeOffer({
              id: 'c-p-exp',
              platform: 'tiki',
              price_current: 33_000_000,
              price_original: null,
              merchant: {
                id: COMBO_EXPENSIVE_ID,
                name: 'Overpriced Tiki Mall',
                platform: 'tiki',
                is_official: true,
                rating_star: 4.8,
                follower_count: 80_000,
                location: 'Ho Chi Minh City',
                risk_score: 5,
                dosafe_risk_score: 5,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 25 },
              },
            }),
          ],
        ],
        [
          comboEarbudProduct.id,
          [
            makeOffer({
              id: 'c-e-cps',
              platform: 'cellphones',
              title: 'Apple AirPods Pro 2 USB-C Chính hãng VN/A',
              price_current: 5_600_000,
              price_original: null,
              merchant: {
                id: COMBO_CPS_ID,
                name: 'CellphoneS Official',
                platform: 'cellphones',
                is_official: true,
                rating_star: 4.9,
                follower_count: 150_000,
                location: 'Ho Chi Minh City',
                risk_score: 5,
                dosafe_risk_score: 3,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 40 },
              },
            }),
            makeOffer({
              id: 'c-e-exp',
              platform: 'tiki',
              title: 'Apple AirPods Pro 2 USB-C',
              price_current: 6_500_000,
              price_original: null,
              merchant: {
                id: COMBO_EXPENSIVE_ID,
                name: 'Overpriced Tiki Mall',
                platform: 'tiki',
                is_official: true,
                rating_star: 4.8,
                follower_count: 80_000,
                location: 'Ho Chi Minh City',
                risk_score: 5,
                dosafe_risk_score: 5,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 25 },
              },
            }),
          ],
        ],
        [
          comboWatchProduct.id,
          [
            makeOffer({
              id: 'c-w-cps',
              platform: 'cellphones',
              title: 'Apple Watch Series 10 42mm Chính hãng VN/A',
              price_current: 10_500_000,
              price_original: null,
              merchant: {
                id: COMBO_CPS_ID,
                name: 'CellphoneS Official',
                platform: 'cellphones',
                is_official: true,
                rating_star: 4.9,
                follower_count: 150_000,
                location: 'Ho Chi Minh City',
                risk_score: 5,
                dosafe_risk_score: 3,
                review_risk_score: 5,
                review_risk_breakdown: { total_reviews: 40 },
              },
            }),
            makeOffer({
              id: 'c-w-mall',
              platform: 'shopee',
              title: 'Apple Watch Series 10 42mm',
              price_current: 9_800_000,
              price_original: null,
              merchant: {
                id: COMBO_MALL_ID,
                name: 'Apple Flagship Store',
                platform: 'shopee',
                is_official: true,
                rating_star: 4.9,
                follower_count: 200_000,
                location: 'Ho Chi Minh City',
                risk_score: 6,
                dosafe_risk_score: 4,
                review_risk_score: 6,
                review_risk_breakdown: { total_reviews: 30 },
              },
            }),
          ],
        ],
      ]),
    getCachedMerchantProfileById: async (merchantId) => {
      comboProfileLookups.push(merchantId);
      if (merchantId === COMBO_CPS_ID) {
        return {
          listings: [
            {
              id: 'l-cps-1',
              platform: 'cellphones',
              title: 'Clean listing',
              price_current: 28_990_000,
              price_original: null,
              availability: 'in_stock',
              discount_analysis: null,
            },
          ],
        } as never;
      }
      if (merchantId === COMBO_MALL_ID) {
        return {
          listings: [
            {
              id: 'l-mall-fake',
              platform: 'shopee',
              title: 'Fake sale outside cart',
              price_current: 5_000_000,
              price_original: 9_000_000,
              availability: 'in_stock',
              discount_analysis: { verdict: 'fake_discount' },
            },
          ],
        } as never;
      }
      return null;
    },
    getCachedCategorySlugById: async () =>
      new Map([
        ['cat-phone', 'smartphones'],
        ['cat-earbud', 'earbuds'],
      ]),
  };

  const comboRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-combo',
        method: 'tools/call',
        params: {
          name: 'optimize_combo_cart',
          arguments: {
            items: [
              'apple-iphone-16',
              'apple-airpods-pro-2-usb-c',
              'apple-watch-series-10-42mm',
            ],
            officialOnly: true,
            minTrust: 80,
            maxStores: 2,
            shippingVndPerOrder: 30_000,
          },
        },
      })
    ),
    {
      readers: comboReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  assert.equal(comboRes.status, 200);
  const comboJson = (await comboRes.json()) as {
    result: {
      isError?: boolean;
      structuredContent: {
        ok: boolean;
        tool: string;
        canonical_citation_url: string;
        observed_at: string;
        items: Array<{
          requested_slug: string;
          resolved_slug: string | null;
          size_required: boolean;
          retired_variant: boolean;
          canonical_citation_url: string;
          observed_at: string;
        }>;
        single_store_best: {
          total_vnd: number;
          distinct_store_count: number;
          store_groups: Array<{
            merchant_id: string | null;
            trust_badge: { verified_safe: boolean; audit_scope: string };
          }>;
        } | null;
        multi_store_optimal: {
          total_vnd: number;
          distinct_store_count: number;
          shipping_vnd: number;
        } | null;
        savings_vs_single_store_vnd: number;
        merchant_badges: Array<{
          merchant_id: string | null;
          verified_safe: boolean;
          audit_scope: string;
        }>;
      };
    };
  };
  assert.equal(comboJson.result.isError, undefined);
  const comboData = comboJson.result.structuredContent;
  assert.equal(comboData.ok, true);
  assert.equal(comboData.tool, 'optimize_combo_cart');
  assert.ok(
    comboData.canonical_citation_url.startsWith(
      'https://rate.vn/watchlist?items='
    )
  );
  assert.equal(comboData.observed_at, FIXED_NOW_ISO);
  assert.equal(comboData.items[0]!.resolved_slug, iphoneProduct.slug);
  assert.equal(
    comboData.items[0]!.canonical_citation_url,
    'https://rate.vn/smartphones/apple-iphone-16'
  );
  // Plan A: CellphoneS covers all 3 = 28,990,000 + 5,600,000 + 10,500,000 + 30,000 = 45,120,000
  assert.equal(comboData.single_store_best?.total_vnd, 45_120_000);
  assert.equal(
    comboData.single_store_best?.store_groups[0]!.trust_badge.verified_safe,
    true
  );
  assert.equal(
    comboData.single_store_best?.store_groups[0]!.trust_badge.audit_scope,
    'merchant_wide'
  );
  // Plan B: Flagship Store (phone 27.5M + watch 9.8M) + CellphoneS (earbud 5.6M) + 2*30k shipping = 42,960,000
  assert.equal(comboData.multi_store_optimal?.total_vnd, 42_960_000);
  assert.equal(comboData.multi_store_optimal?.distinct_store_count, 2);
  assert.equal(comboData.multi_store_optimal?.shipping_vnd, 60_000);
  assert.equal(comboData.savings_vs_single_store_vnd, 2_160_000);
  const mallBadge = comboData.merchant_badges.find(
    (b) => b.merchant_id === COMBO_MALL_ID
  );
  assert.equal(mallBadge?.verified_safe, false);
  assert.equal(mallBadge?.audit_scope, 'merchant_wide');
  // Bounded fan-out: COMBO_EXPENSIVE_ID was never in Plan A or Plan B, so never queried
  assert.equal(comboProfileLookups.includes(COMBO_EXPENSIVE_ID), false);
  assert.deepEqual(
    [...comboProfileLookups].sort(),
    [COMBO_CPS_ID, COMBO_MALL_ID].sort()
  );

  // Retired variant slug triggers retired_variant: true without sibling offer substitution
  const comboRetiredRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-combo-retired',
        method: 'tools/call',
        params: {
          name: 'optimize_combo_cart',
          arguments: {
            items: [
              'apple-iphone-16-512gb-retired',
              'apple-airpods-pro-2-usb-c',
            ],
          },
        },
      })
    ),
    {
      readers: comboReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const comboRetiredJson = (await comboRetiredRes.json()) as {
    result: {
      structuredContent: {
        ok: boolean;
        missing_slugs: string[];
        uncovered_slugs: string[];
        single_store_best: unknown;
        multi_store_optimal: unknown;
        items: Array<{
          retired_variant: boolean;
          size_required: boolean;
          found: boolean;
          canonical_citation_url: string;
        }>;
      };
    };
  };
  assert.equal(comboRetiredJson.result.structuredContent.ok, true);
  assert.equal(
    comboRetiredJson.result.structuredContent.items[0]!.retired_variant,
    true
  );
  assert.equal(
    comboRetiredJson.result.structuredContent.items[0]!.size_required,
    true
  );
  assert.equal(
    comboRetiredJson.result.structuredContent.items[0]!.found,
    false
  );
  assert.equal(
    comboRetiredJson.result.structuredContent.items[0]!.canonical_citation_url,
    'https://rate.vn/smartphones/apple-iphone-16'
  );
  assert.equal(
    comboRetiredJson.result.structuredContent.single_store_best,
    null
  );
  assert.equal(
    comboRetiredJson.result.structuredContent.multi_store_optimal,
    null
  );

  // Duplicate resolved products (Item slug + its default variant) -> domain isError: true
  const comboDupRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-combo-dup-resolved',
        method: 'tools/call',
        params: {
          name: 'optimize_combo_cart',
          arguments: {
            items: ['apple-iphone-16', iphoneProduct.slug],
          },
        },
      })
    ),
    {
      readers: comboReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const comboDupJson = (await comboDupRes.json()) as {
    result: { isError: boolean; structuredContent: { ok: boolean } };
  };
  assert.equal(comboDupJson.result.isError, true);
  assert.equal(comboDupJson.result.structuredContent.ok, false);

  // Strict validation on optimize_combo_cart (-32602)
  for (const badComboArgs of [
    { items: ['apple-iphone-16'] },
    { items: ['apple-iphone-16', 'APPLE-IPHONE-16'] },
    { items: ['s1', 's2', 's3', 's4', 's5', 's6'] },
    { items: ['apple-iphone-16', '__proto__'] },
    { items: ['apple-iphone-16', 'constructor'] },
    { items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'], maxStores: 6 },
    { items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'], minTrust: 101 },
    {
      items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'],
      shippingVndPerOrder: -1,
    },
    {
      items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'],
      unexpectedKey: true,
    },
  ]) {
    const badRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'bad-combo',
          method: 'tools/call',
          params: { name: 'optimize_combo_cart', arguments: badComboArgs },
        })
      ),
      {
        readers: comboReaders,
        rateLimiter: limiter,
        auditUrlRateLimiter: auditLimiter,
      }
    );
    assert.equal(
      ((await badRes.json()) as { error: { code: number } }).error.code,
      -32602,
      `must reject invalid optimize_combo_cart args: ${JSON.stringify(badComboArgs)}`
    );
  }

  // DB error sanitization on optimize_combo_cart
  const comboDbErrRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'combo-db-err',
        method: 'tools/call',
        params: {
          name: 'optimize_combo_cart',
          arguments: {
            items: ['apple-iphone-16', 'apple-airpods-pro-2-usb-c'],
          },
        },
      })
    ),
    {
      readers: {
        ...comboReaders,
        getMasterProductOffersBatch: async () => {
          throw new Error('PGRST500: relation "rate.products" failed');
        },
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const comboDbErrText = await comboDbErrRes.text();
  assert.doesNotMatch(comboDbErrText, /PGRST|rate\.products/i);
  assert.equal(
    (JSON.parse(comboDbErrText) as { result: { isError: boolean } }).result
      .isError,
    true
  );

  // 14. Tool 7: calculate_effective_price (v1.1.0 - VN/A spread, voucher cap, trade-in, installment, @variant pin, validation)
  const effectiveOffersMixed: MerchantOffer[] = [
    // Sold-out cheap offer (excluded)
    makeOffer({
      id: 'eff-oos',
      platform: 'tiki',
      title: 'Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
      price_current: 24_000_000,
      availability: 'out_of_stock',
    }),
    // Bait offer (excluded)
    makeOffer({
      id: 'eff-bait',
      platform: 'shopee',
      title: 'Cường lực iPhone 16 Pro Max',
      price_current: 99_000,
      merchant: {
        id: 'm-bait',
        name: 'Accessory Bait',
        platform: 'shopee',
        is_official: false,
        rating_star: 4.1,
        follower_count: 100,
        location: 'Hanoi',
        risk_score: 50,
        dosafe_risk_score: 40,
        review_risk_score: 50,
        review_risk_breakdown: null,
      },
    }),
    // Cheapest plausible imported offer
    makeOffer({
      id: 'eff-imported',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay',
      price_current: 26_500_000,
      merchant: {
        id: 'm-imported',
        name: 'Global Import Shop',
        platform: 'shopee',
        is_official: false,
        rating_star: 4.7,
        follower_count: 25_000,
        location: 'Ho Chi Minh City',
        risk_score: 20,
        dosafe_risk_score: 15,
        review_risk_score: 20,
        review_risk_breakdown: { total_reviews: 18 },
      },
    }),
    // Best Official VN/A offer
    makeOffer({
      id: 'eff-vna-cps',
      platform: 'cellphones',
      title: 'Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
      price_current: 28_990_000,
      merchant: {
        id: 'm-cps',
        name: 'CellphoneS Official',
        platform: 'cellphones',
        is_official: true,
        rating_star: 4.9,
        follower_count: 150_000,
        location: 'Ho Chi Minh City',
        risk_score: 5,
        dosafe_risk_score: 0,
        review_risk_score: 5,
        review_risk_breakdown: { total_reviews: 50 },
      },
    }),
  ];

  const effCalcArgs = {
    slug: 'iphone-16-pro-max@256gb',
    discountMode: 'percent' as const,
    discountPercent: 10,
    discountMaxCapVnd: 1_500_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 12_000_000,
    tradeInConditionTier: 'grade_2_light_wear' as const,
    tradeInBonusVnd: 1_000_000,
    installmentTerm: 6 as const,
    installmentFeePercent: 3,
  };

  const expectedCheapestCalc = computeEffectivePrice({
    ...effCalcArgs,
    basePriceVnd: 26_500_000,
  });
  const expectedVnaCalc = computeEffectivePrice({
    ...effCalcArgs,
    basePriceVnd: 28_990_000,
  });

  const effRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-eff-price',
        method: 'tools/call',
        params: {
          name: 'calculate_effective_price',
          arguments: effCalcArgs,
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductOffers: async () => effectiveOffersMixed,
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  assert.equal(effRes.status, 200);
  const effJson = (await effRes.json()) as {
    result: {
      isError?: boolean;
      structuredContent: {
        ok: boolean;
        tool: string;
        is_reference_estimate: boolean;
        canonical_citation_url: string;
        observed_at: string;
        price_observed_at: string;
        excluded_unavailable_offer_count: number;
        excluded_bait_offer_count: number;
        best_plausible_offer: {
          id: string;
          origin: string;
          seller_channel: string;
          price_current_vnd: number;
        } | null;
        best_official_vna_offer: {
          id: string;
          origin: string;
          seller_channel: string;
          price_current_vnd: number;
        } | null;
        best_plausible_effective_price: {
          voucher_savings_vnd: number;
          store_trade_in_credit_vnd: number;
          self_resale_comparison_delta_vnd: number;
          conversion_fee_vnd: number;
          total_paid_vnd: number;
          monthly_payment_vnd: number;
        };
        best_official_vna_effective_price: {
          total_paid_vnd: number;
          monthly_payment_vnd: number;
        } | null;
        vna_vs_cheapest_base_delta_vnd: number | null;
        vna_vs_cheapest_effective_delta_vnd: number | null;
      };
    };
  };
  assert.equal(effJson.result.isError, undefined);
  const effData = effJson.result.structuredContent;
  assert.equal(effData.ok, true);
  assert.equal(effData.tool, 'calculate_effective_price');
  assert.equal(effData.is_reference_estimate, true);
  assert.equal(
    effData.canonical_citation_url,
    'https://rate.vn/smartphones/apple-iphone-16-pro-max-256gb'
  );
  assert.equal(effData.observed_at, iphoneProduct.updated_at);
  assert.equal(effData.price_observed_at, iphoneProduct.updated_at);
  assert.equal(effData.excluded_unavailable_offer_count, 1);
  assert.equal(effData.excluded_bait_offer_count, 1);
  assert.equal(effData.best_plausible_offer?.id, 'eff-imported');
  assert.equal(effData.best_plausible_offer?.origin, 'imported');
  assert.equal(
    effData.best_plausible_offer?.seller_channel,
    'independent_shop'
  );
  assert.equal(effData.best_official_vna_offer?.id, 'eff-vna-cps');
  assert.equal(effData.best_official_vna_offer?.origin, 'official_vna');
  assert.equal(
    effData.best_official_vna_offer?.seller_channel,
    'authorized_vat'
  );
  assert.equal(
    effData.best_plausible_effective_price.voucher_savings_vnd,
    expectedCheapestCalc.voucherSavingsVnd
  );
  assert.equal(
    effData.best_plausible_effective_price.store_trade_in_credit_vnd,
    expectedCheapestCalc.storeTradeInCreditVnd
  );
  assert.equal(
    effData.best_plausible_effective_price.conversion_fee_vnd,
    expectedCheapestCalc.conversionFeeVnd
  );
  assert.equal(
    effData.best_plausible_effective_price.total_paid_vnd,
    expectedCheapestCalc.totalPaidVnd
  );
  assert.equal(
    effData.best_plausible_effective_price.monthly_payment_vnd,
    expectedCheapestCalc.monthlyPaymentVnd
  );
  assert.equal(
    effData.best_official_vna_effective_price?.total_paid_vnd,
    expectedVnaCalc.totalPaidVnd
  );
  assert.equal(effData.vna_vs_cheapest_base_delta_vnd, 2_490_000);
  assert.equal(
    effData.vna_vs_cheapest_effective_delta_vnd,
    expectedVnaCalc.totalPaidVnd - expectedCheapestCalc.totalPaidVnd
  );

  // Imported-only offers -> best_official_vna_offer is null
  const effNoVnaRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-eff-no-vna',
        method: 'tools/call',
        params: {
          name: 'calculate_effective_price',
          arguments: { slug: iphoneProduct.slug },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductOffers: async () => [effectiveOffersMixed[2]!],
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const effNoVnaJson = (await effNoVnaRes.json()) as {
    result: {
      structuredContent: {
        best_official_vna_offer: unknown;
        best_official_vna_effective_price: unknown;
        vna_vs_cheapest_effective_delta_vnd: unknown;
      };
    };
  };
  assert.equal(
    effNoVnaJson.result.structuredContent.best_official_vna_offer,
    null
  );
  assert.equal(
    effNoVnaJson.result.structuredContent.best_official_vna_effective_price,
    null
  );
  assert.equal(
    effNoVnaJson.result.structuredContent.vna_vs_cheapest_effective_delta_vnd,
    null
  );

  // Invalid @variant pin or unknown slug -> isError: true + is_reference_estimate: true
  for (const missingPin of [
    'iphone-16-pro-max@999tb',
    'nonexistent-phone-2026',
  ]) {
    const missingPinRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'eff-missing',
          method: 'tools/call',
          params: {
            name: 'calculate_effective_price',
            arguments: { slug: missingPin },
          },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    const missingPinJson = (await missingPinRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: { ok: boolean; is_reference_estimate: boolean };
      };
    };
    assert.equal(missingPinJson.result.isError, true);
    assert.equal(missingPinJson.result.structuredContent.ok, false);
    assert.equal(
      missingPinJson.result.structuredContent.is_reference_estimate,
      true
    );
  }

  // Strict validation on calculate_effective_price (-32602)
  for (const badEffArgs of [
    { slug: '__proto__' },
    { slug: 'constructor' },
    { slug: 'toString' },
    { slug: 'bad..slug' },
    { slug: iphoneProduct.slug, discountPercent: 81 },
    { slug: iphoneProduct.slug, installmentFeePercent: 16 },
    { slug: iphoneProduct.slug, installmentTerm: 24 },
    { slug: iphoneProduct.slug, discountAmountVnd: -1 },
    { slug: iphoneProduct.slug, extraField: 'nope' },
  ]) {
    const badEffRes = await handleMcpHttpPost(
      makeMcpRequest(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'bad-eff',
          method: 'tools/call',
          params: {
            name: 'calculate_effective_price',
            arguments: badEffArgs,
          },
        })
      ),
      { readers, rateLimiter: limiter, auditUrlRateLimiter: auditLimiter }
    );
    assert.equal(
      ((await badEffRes.json()) as { error: { code: number } }).error.code,
      -32602,
      `must reject invalid calculate_effective_price args: ${JSON.stringify(badEffArgs)}`
    );
  }

  // Existing product with zero plausible offers and min_price <= 0 -> isError: true + is_reference_estimate: true
  const unpricedProduct = makeProduct({
    id: '11111111-1111-4111-8111-000000000095',
    slug: 'unpriced-phone',
    name: 'Unpriced Phone',
    min_price: 0,
    max_price: 0,
  });
  const unpricedEffRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'eff-unpriced',
        method: 'tools/call',
        params: {
          name: 'calculate_effective_price',
          arguments: { slug: unpricedProduct.slug },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductBySlug: async () => unpricedProduct,
        getCachedMasterProductOffers: async () => [],
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const unpricedEffJson = (await unpricedEffRes.json()) as {
    result: {
      isError: boolean;
      structuredContent: { ok: boolean; is_reference_estimate: boolean };
    };
  };
  assert.equal(unpricedEffJson.result.isError, true);
  assert.equal(unpricedEffJson.result.structuredContent.ok, false);
  assert.equal(
    unpricedEffJson.result.structuredContent.is_reference_estimate,
    true
  );

  // dosafe_risk_known: false & unmeasured review_risk_score masking on best_plausible_offer.merchant
  const maskedEffRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'eff-masked',
        method: 'tools/call',
        params: {
          name: 'calculate_effective_price',
          arguments: { slug: iphoneProduct.slug },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductOffers: async () => [sampleOffersForIphone[3]!],
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const maskedEffJson = (await maskedEffRes.json()) as {
    result: {
      structuredContent: {
        best_plausible_offer: {
          id: string;
          merchant: {
            dosafe_risk_score: number | null;
            review_risk_score: number | null;
          };
        } | null;
        best_official_vna_offer: { id: string } | null;
        vna_vs_cheapest_effective_delta_vnd: number | null;
      };
    };
  };
  assert.equal(
    maskedEffJson.result.structuredContent.best_plausible_offer?.id,
    'offer-shopee-mall'
  );
  assert.equal(
    maskedEffJson.result.structuredContent.best_official_vna_offer?.id,
    'offer-shopee-mall'
  );
  assert.equal(
    maskedEffJson.result.structuredContent.vna_vs_cheapest_effective_delta_vnd,
    0
  );
  assert.equal(
    maskedEffJson.result.structuredContent.best_plausible_offer?.merchant
      .dosafe_risk_score,
    null
  );
  assert.equal(
    maskedEffJson.result.structuredContent.best_plausible_offer?.merchant
      .review_risk_score,
    null
  );

  // DB error sanitization on calculate_effective_price
  const effDbErrRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'eff-db-err',
        method: 'tools/call',
        params: {
          name: 'calculate_effective_price',
          arguments: { slug: iphoneProduct.slug },
        },
      })
    ),
    {
      readers: {
        ...readers,
        getCachedMasterProductOffers: async () => {
          throw new Error('PGRST501: relation "rate.master_products" failed');
        },
      },
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const effDbErrText = await effDbErrRes.text();
  assert.doesNotMatch(effDbErrText, /PGRST|master_products/i);
  assert.equal(
    (JSON.parse(effDbErrText) as { result: { isError: boolean } }).result
      .isError,
    true
  );

  // 13. Wave E2 PCT decimal precision across MCP catalog, offers, compare, and audit_url
  const pctProductA = makeProduct({
    id: '11111111-1111-4111-8111-000000000101',
    slug: 'vcb-online-12m',
    name: 'Vietcombank Online Savings 12M',
    brand: 'Vietcombank',
    min_price: 4.85,
    max_price: 5.45,
    metadata: { category_slug: 'bank-savings', currency: 'PCT' },
  });
  const pctProductB = makeProduct({
    id: '11111111-1111-4111-8111-000000000102',
    slug: 'acb-online-12m',
    name: 'ACB Online Savings 12M',
    brand: 'ACB',
    min_price: 5.15,
    max_price: 5.65,
    metadata: { category_slug: 'bank-savings', currency: 'PCT' },
  });
  const pctOfferA = {
    ...makeOffer({
      id: 'offer-vcb-12m',
      platform: 'vietcombank',
      title: 'Vietcombank Online Savings 12M',
      price_current: 4.85,
      price_original: 5.45,
      url: 'https://www.vietcombank.com.vn/lai-suat',
    }),
    currency: 'PCT' as const,
  };
  const pctOfferB = {
    ...makeOffer({
      id: 'offer-acb-12m',
      platform: 'acb',
      title: 'ACB Online Savings 12M',
      price_current: 5.15,
      price_original: 5.65,
      url: 'https://acb.com.vn/lai-suat',
    }),
    currency: 'PCT' as const,
  };
  const pctReaders: McpDataReaders = {
    ...readers,
    getCachedMasterProducts: async () => [pctProductA, pctProductB],
    getCachedMasterProductBySlug: async (slug) =>
      slug === pctProductA.slug
        ? pctProductA
        : slug === pctProductB.slug
          ? pctProductB
          : null,
    getCachedCompareMasterProducts: async () => [pctProductA, pctProductB],
    getCachedMasterProductOffers: async (id) =>
      id === pctProductA.id ? [pctOfferA, pctOfferB] : [pctOfferB],
    getCachedInspectProductOrShopUrl: async (rawQuery) => ({
      query: rawQuery,
      matchedType: 'product_listing',
      parsedUrl: parseEcommerceUrlOrQuery(rawQuery),
      masterProduct: pctProductA,
      matchedOffer: pctOfferA,
      allOffers: [pctOfferA, pctOfferB],
      discountAnalysis: null,
      priceHistory: null,
      reviewSummary: null,
      merchantProfile: null,
      suggestions: [pctProductB],
    }),
  };

  const pctSearchRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'pct-search',
        method: 'tools/call',
        params: {
          name: 'search_verified_catalog',
          arguments: { category: 'bank-savings' },
        },
      })
    ),
    {
      readers: pctReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const pctSearchBody = JSON.parse(await pctSearchRes.text()) as {
    result: {
      structuredContent: {
        items: Array<{
          currency: string;
          verified_min_price_vnd: number;
          verified_median_price_vnd: number;
          verified_max_price_vnd: number;
        }>;
      };
    };
  };
  assert.equal(
    pctSearchBody.result.structuredContent.items[0]?.currency,
    'PCT'
  );
  assert.equal(
    pctSearchBody.result.structuredContent.items[0]?.verified_min_price_vnd,
    4.85
  );
  assert.equal(
    pctSearchBody.result.structuredContent.items[0]?.verified_median_price_vnd,
    5
  );
  assert.equal(
    pctSearchBody.result.structuredContent.items[0]?.verified_max_price_vnd,
    5.15
  );

  const pctOffersRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'pct-offers',
        method: 'tools/call',
        params: {
          name: 'get_22_store_offers_and_price_truth',
          arguments: { slug: pctProductA.slug },
        },
      })
    ),
    {
      readers: pctReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const pctOffersBody = JSON.parse(await pctOffersRes.text()) as {
    result: {
      structuredContent: {
        price_truth: { currency: string; verified_min_price_vnd: number };
        offers: Array<{
          currency: string;
          price_current_vnd: number;
          price_original_vnd: number | null;
        }>;
      };
    };
  };
  assert.equal(
    pctOffersBody.result.structuredContent.price_truth.currency,
    'PCT'
  );
  assert.equal(
    pctOffersBody.result.structuredContent.price_truth.verified_min_price_vnd,
    4.85
  );
  assert.equal(
    pctOffersBody.result.structuredContent.offers[0]?.currency,
    'PCT'
  );
  assert.equal(
    pctOffersBody.result.structuredContent.offers[0]?.price_current_vnd,
    4.85
  );
  assert.equal(
    pctOffersBody.result.structuredContent.offers[0]?.price_original_vnd,
    5.45
  );

  const pctCompareRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'pct-compare',
        method: 'tools/call',
        params: {
          name: 'compare_devices_by_use_case',
          arguments: { slugs: [pctProductA.slug, pctProductB.slug] },
        },
      })
    ),
    {
      readers: pctReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const pctCompareBody = JSON.parse(await pctCompareRes.text()) as {
    result: {
      structuredContent: {
        devices: Array<{ currency: string; verified_min_price_vnd: number }>;
      };
    };
  };
  assert.equal(
    pctCompareBody.result.structuredContent.devices[0]?.currency,
    'PCT'
  );
  assert.equal(
    pctCompareBody.result.structuredContent.devices[0]?.verified_min_price_vnd,
    4.85
  );

  const pctAuditRes = await handleMcpHttpPost(
    makeMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'pct-audit',
        method: 'tools/call',
        params: {
          name: 'audit_listing_url',
          arguments: {
            url: 'https://rate.vn/bank-savings/vcb-online-12m',
            observedPriceVnd: 4.85,
            observedOriginalPriceVnd: 5.45,
          },
        },
      })
    ),
    {
      readers: pctReaders,
      rateLimiter: limiter,
      auditUrlRateLimiter: auditLimiter,
    }
  );
  const pctAuditBody = JSON.parse(await pctAuditRes.text()) as {
    result: {
      structuredContent: {
        matched_offer: {
          currency: string;
          price_current_vnd: number;
          price_original_vnd: number | null;
        };
        top_competing_offers: Array<{
          currency: string;
          price_current_vnd: number;
        }>;
      };
    };
  };
  assert.equal(
    pctAuditBody.result.structuredContent.matched_offer.currency,
    'PCT'
  );
  assert.equal(
    pctAuditBody.result.structuredContent.matched_offer.price_current_vnd,
    4.85
  );
  assert.equal(
    pctAuditBody.result.structuredContent.matched_offer.price_original_vnd,
    5.45
  );
  assert.equal(
    pctAuditBody.result.structuredContent.top_competing_offers[0]
      ?.price_current_vnd,
    4.85
  );

  console.warn(
    '  ✅ Rate Shopping MCP Server v1.1.0 (/api/mcp), /llms.txt & /.well-known/mcp.json suite passed (#1896)'
  );
}

runMcpTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
