import assert from 'node:assert/strict';
import * as sharedDataRoot from '../index.js';
import {
  SHARED_DATA_VERSION,
  ProductSpecificationsSchema,
  MasterProductSchema,
  ScrapedProductSchema,
  SupportedEcommercePlatformSchema,
  PaginationSchema,
  ApiResponseSchema,
  RATE_ROUTES,
  RATE_API_V1_ENDPOINTS,
  ROUTES,
  STATUS_CODES,
  SEEDING_RISK_MAX_PENALTY,
  seedingRiskPenalty,
  getPublicClient,
  z,
} from '../index.js';
import { getAdminClient, getRateClient, getDosafeClient } from '../server.js';

function testVersionAndZeroStrapiExports(): void {
  assert.equal(SHARED_DATA_VERSION, '2.0.0');

  // Legacy Strapi constants must not be exported
  assert.equal('API_ENDPOINTS' in sharedDataRoot, false);
  assert.equal('ADMIN_ROUTES' in sharedDataRoot, false);

  // Service-role clients must never leak into the public root export
  assert.equal('getAdminClient' in sharedDataRoot, false);
  assert.equal('getRateClient' in sharedDataRoot, false);
  assert.equal('getDosafeClient' in sharedDataRoot, false);
}

function testRouteConstants(): void {
  assert.equal(RATE_ROUTES.HOME, '/');
  assert.equal(RATE_ROUTES.SMARTPHONES, '/smartphones');
  assert.equal(RATE_ROUTES.LAPTOPS, '/laptops');
  assert.equal(RATE_ROUTES.TABLETS, '/tablets');
  assert.equal(RATE_ROUTES.SMARTWATCHES, '/smartwatches');
  assert.equal(RATE_ROUTES.EARBUDS, '/earbuds');
  assert.equal(RATE_ROUTES.DEALS, '/deals');
  assert.equal(RATE_ROUTES.LEADERBOARD, '/leaderboard');
  assert.equal(RATE_ROUTES.MERCHANTS, '/merchants');
  assert.equal(RATE_ROUTES.COMPARE, '/compare');
  assert.equal(RATE_ROUTES.WATCHLIST, '/watchlist');
  assert.equal(RATE_ROUTES.INSPECT, '/inspect');
  assert.equal(RATE_ROUTES.DEVELOPERS, '/developers');

  assert.equal(RATE_API_V1_ENDPOINTS.PRODUCTS, '/api/v1/rate/products');
  assert.equal(
    RATE_API_V1_ENDPOINTS.PRODUCT_DETAIL('iphone-16-pro-max'),
    '/api/v1/rate/products/iphone-16-pro-max'
  );
  assert.equal(
    RATE_API_V1_ENDPOINTS.PRODUCT_DETAIL('slug with spaces'),
    '/api/v1/rate/products/slug%20with%20spaces'
  );
  assert.equal(RATE_API_V1_ENDPOINTS.COMPARE, '/api/v1/rate/compare');
  assert.equal(RATE_API_V1_ENDPOINTS.VERSUS, '/api/v1/rate/versus');
  assert.equal(RATE_API_V1_ENDPOINTS.DEALS, '/api/v1/rate/deals');
  assert.equal(RATE_API_V1_ENDPOINTS.LEADERBOARD, '/api/v1/rate/leaderboard');
  assert.equal(RATE_API_V1_ENDPOINTS.MERCHANTS, '/api/v1/rate/merchants');
  assert.equal(
    RATE_API_V1_ENDPOINTS.MERCHANT_DETAIL('shopee-123'),
    '/api/v1/rate/merchants/shopee-123'
  );
  assert.equal(RATE_API_V1_ENDPOINTS.LOOKUP, '/api/v1/rate/lookup');
  assert.equal(RATE_API_V1_ENDPOINTS.INSPECT, '/api/v1/rate/inspect');
  assert.equal(RATE_API_V1_ENDPOINTS.WATCHLIST, '/api/v1/rate/watchlist');
  assert.equal(RATE_API_V1_ENDPOINTS.STATS, '/api/v1/rate/stats');
  assert.equal(RATE_API_V1_ENDPOINTS.REVIEWS, '/api/v1/rate/reviews');
  assert.equal(RATE_API_V1_ENDPOINTS.OPENAPI, '/api/v1/rate/openapi');
  assert.equal(RATE_API_V1_ENDPOINTS.OPENAPI_JSON, '/api/v1/rate/openapi.json');
  assert.equal(RATE_API_V1_ENDPOINTS.REVALIDATE, '/api/v1/rate/revalidate');
  assert.equal(
    RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP,
    '/api/v1/rate/extension/lookup'
  );
  assert.equal(
    RATE_API_V1_ENDPOINTS.EXTENSION_INGEST,
    '/api/v1/rate/extension/ingest'
  );
  assert.equal(
    RATE_API_V1_ENDPOINTS.REVIEW_VOTE('rev-42'),
    '/api/reviews/rev-42/vote'
  );
  assert.equal(RATE_API_V1_ENDPOINTS.HEALTH, '/api/health');
  assert.equal(ROUTES.API.LISTINGS, '/api/v1/rate/products');
  assert.equal(STATUS_CODES.OK, 200);
}

function testTenFieldGroupsSpecificationsSchema(): void {
  const fullSpecs = {
    availability: {
      announced: '2026, September',
      status: 'Available',
      prices_msrp: '34,990,000 VND',
    },
    design: {
      dimensions: '163 x 77.6 x 8.25 mm',
      weight_g: 227,
      materials: 'Titanium frame, Gorilla Glass Armor',
      resistance: 'IP68',
      biometrics: 'Face ID',
      colors: ['Natural Titanium', 'Desert Titanium'],
    },
    display: {
      size_inch: 6.9,
      type: 'LTPO Super Retina XDR OLED',
      resolution: '1320 x 2868 pixels',
      refresh_rate_hz: 120,
      ppi: 460,
      protection: 'Ceramic Shield',
    },
    hardware: {
      chipset: 'Apple A18 Pro (3 nm)',
      cpu: 'Hexa-core',
      gpu: 'Apple GPU (6-core graphics)',
      ram_gb: 8,
      storage_gb: 256,
      os: 'iOS 18',
    },
    battery: {
      capacity_mah: 4685,
      type: 'Li-Ion',
      charging: 'Wired PD2.0, 25W MagSafe',
      fast_charging_w: 30,
      reverse_charging: true,
    },
    camera: {
      rear_setup: 'Triple',
      main_camera: '48 MP, f/1.8, 24mm (wide), OIS',
      second_camera:
        '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom',
      third_camera: '48 MP, f/2.2, 13mm (ultrawide)',
      video_recording: '4K@24/25/30/60/100/120fps',
      front_camera: '12 MP, f/1.9, 23mm (wide)',
    },
    connectivity: {
      bluetooth: '5.3, A2DP, LE',
      wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7',
      usb: 'USB Type-C 3.2 Gen 2',
      nfc: true,
    },
    cellular: {
      has_5g: true,
      sim_type: 'Nano-SIM and eSIM',
      volte: true,
      vowifi: true,
    },
    multimedia: {
      loudspeaker: 'Yes, with stereo speakers',
      headphone_jack_35mm: false,
      audio_features: 'Spatial Audio',
    },
    regulatory: {
      certifications: 'CE, FCC, RoHS',
    },
  };

  const parsed = ProductSpecificationsSchema.safeParse(fullSpecs);
  assert.equal(parsed.success, true);

  // Reject out-of-bounds values
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      display: { size_inch: 150 },
    }).success,
    false
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      hardware: { ram_gb: -4 },
    }).success,
    false
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      battery: { fast_charging_w: 2500 },
    }).success,
    false
  );
}

function testMasterProductAndScrapedProductSchemas(): void {
  const master = MasterProductSchema.parse({
    id: '01929000-0000-7000-8000-000000000001',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    model_key: 'apple-iphone-16-pro-max-8gb-256gb',
    name: 'Apple iPhone 16 Pro Max 256GB',
    slug: 'apple-iphone-16-pro-max-256gb',
  });
  assert.equal(master.has_5g, false);
  assert.equal(master.status, 'draft');
  assert.deepEqual(master.images, []);
  assert.deepEqual(master.metadata, {});

  for (const platform of [
    'shopee',
    'lazada',
    'tiki',
    'tiktok',
    'cellphones',
    'tgdd',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
  ]) {
    assert.equal(
      SupportedEcommercePlatformSchema.safeParse(platform).success,
      true
    );
  }
  assert.equal(
    SupportedEcommercePlatformSchema.safeParse('amazon').success,
    false
  );

  const scraped = ScrapedProductSchema.parse({
    platform: 'shopee',
    itemId: '123456',
    shopId: '654321',
    url: 'https://shopee.vn/product/654321/123456',
    title: 'iPhone 16 Pro Max 256GB Chính hãng VN/A',
    priceMin: 31990000,
    priceMax: 33990000,
    shop: {
      shopId: '654321',
      name: 'Apple Flagship Store',
      isMall: true,
    },
  });
  assert.equal(scraped.currency, 'VND');
  assert.equal(scraped.historicalSold, 0);
  assert.deepEqual(scraped.reviews, []);

  const paged = PaginationSchema.parse({});
  assert.equal(paged.page, 1);
  assert.equal(paged.pageSize, 25);
  assert.equal(PaginationSchema.safeParse({ page: 1.5 }).success, false);
  assert.equal(PaginationSchema.safeParse({ total: -1 }).success, false);

  assert.equal(
    MasterProductSchema.safeParse({
      id: '01929000-0000-7000-8000-000000000001',
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      model_key: 'apple-iphone-16-pro-max-8gb-256gb',
      name: 'Apple iPhone 16 Pro Max 256GB',
      slug: 'apple-iphone-16-pro-max-256gb',
      ram_gb: 99999,
    }).success,
    false
  );
  assert.equal(
    MasterProductSchema.safeParse({
      id: '01929000-0000-7000-8000-000000000001',
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      model_key: 'apple-iphone-16-pro-max-8gb-256gb',
      name: 'Apple iPhone 16 Pro Max 256GB',
      slug: 'apple-iphone-16-pro-max-256gb',
      images: ['javascript:alert(1)'],
    }).success,
    false
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('javascript:alert(1)').success,
    false
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('https://rate.vn/smartphones')
      .success,
    true
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('https://.rate.vn/smartphones')
      .success,
    false,
    'HttpUrlSchema must reject leading-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('https://rate..vn/smartphones')
      .success,
    false,
    'HttpUrlSchema must reject consecutive-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('https://rate.vn:8443/smartphones')
      .success,
    false,
    'HttpUrlSchema must reject non-standard ports on public hosts'
  );
  assert.equal(
    sharedDataRoot.isValidSupabaseHttpUrl('https://.supabase.co'),
    false,
    'isValidSupabaseHttpUrl must reject leading-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.isValidSupabaseHttpUrl('https://example..supabase.co'),
    false,
    'isValidSupabaseHttpUrl must reject consecutive-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.isValidSupabaseHttpUrl('https://example.supabase.co.'),
    false,
    'isValidSupabaseHttpUrl must reject trailing-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('https://rate.vn./smartphones')
      .success,
    false,
    'HttpUrlSchema must reject trailing-dot hostnames'
  );
  assert.equal(
    sharedDataRoot.HttpUrlSchema.safeParse('http://localhost:3000/smartphones')
      .success,
    true,
    'HttpUrlSchema must allow custom ports on loopback hosts'
  );

  const responseSchema = ApiResponseSchema(z.object({ ok: z.boolean() }));
  const parsedResponse = responseSchema.parse({
    data: { ok: true },
    error: {
      status: 400,
      name: 'BadRequestError',
      message: 'Invalid query',
      details: { field: 'slug' },
    },
  });
  assert.equal(parsedResponse.data.ok, true);
}

function testSupabaseClientGuards(): void {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevFallbackUrl = process.env.SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevFallbackAnon = process.env.SUPABASE_ANON_KEY;
  const prevService = process.env.SUPABASE_SECRET_KEY;

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SECRET_KEY;

    assert.throws(() => getPublicClient(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
    assert.throws(() => getAdminClient(), /Missing SUPABASE_URL/);
    assert.throws(() => getRateClient(), /Missing SUPABASE_URL/);
    assert.throws(() => getDosafeClient(), /Missing SUPABASE_URL/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'javascript:alert(1)';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.SUPABASE_SECRET_KEY = 'service-role-test-key';
    assert.throws(() => getPublicClient(), /Invalid NEXT_PUBLIC_SUPABASE_URL/);
    assert.throws(() => getAdminClient(), /Invalid SUPABASE_URL/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.SUPABASE_SECRET_KEY = 'service-role-test-key';

    const pub = getPublicClient();
    assert.equal(typeof pub.from, 'function');

    const rateClient = getRateClient();
    assert.equal(typeof rateClient.from, 'function');

    const dosafeClient = getDosafeClient();
    assert.equal(typeof dosafeClient.from, 'function');
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;

    if (prevFallbackUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevFallbackUrl;

    if (prevAnon === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

    if (prevFallbackAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = prevFallbackAnon;

    if (prevService === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = prevService;
  }
}

function testSeedingRiskPenalty(): void {
  // Importer and web share this term of the review risk (DOS/Rate#671).
  assert.equal(seedingRiskPenalty(0, 10), 0);
  assert.equal(seedingRiskPenalty(1, 4), 19);
  assert.equal(seedingRiskPenalty(1, 2), 38);
  assert.equal(seedingRiskPenalty(3, 5), SEEDING_RISK_MAX_PENALTY);
  assert.equal(seedingRiskPenalty(10, 10), 45);
  // Ratio rounded to three decimals first: 1/3 -> 0.333 -> 24.975 -> 25.
  assert.equal(seedingRiskPenalty(1, 3), 25);
  for (const bad of [NaN, Infinity, -1]) {
    assert.equal(seedingRiskPenalty(bad, 10), 0);
    assert.equal(seedingRiskPenalty(1, bad), 0);
  }
  assert.equal(seedingRiskPenalty(1, 0), 0);
  assert.equal(
    seedingRiskPenalty(20, 10),
    45,
    'more seeding than reviews is capped'
  );
}

function main(): void {
  console.log('🧪 Running @repo/shared-data unit tests...');
  testVersionAndZeroStrapiExports();
  console.log(
    '  ✅ [1/5] Version & Zero-Strapi root export isolation verified'
  );
  testRouteConstants();
  console.log('  ✅ [2/5] Route & REST API v1 constants verified');
  testTenFieldGroupsSpecificationsSchema();
  console.log(
    '  ✅ [3/5] 10-Field-Groups ProductSpecificationsSchema verified'
  );
  testMasterProductAndScrapedProductSchemas();
  console.log(
    '  ✅ [4/5] MasterProduct, ScrapedProduct & common schemas verified'
  );
  testSupabaseClientGuards();
  console.log('  ✅ [5/6] Supabase client fail-closed env guards verified');
  testSeedingRiskPenalty();
  console.log('  ✅ [6/6] Shared seeding risk penalty verified');
  console.log('🎉 All @repo/shared-data tests passed!');
}

main();
