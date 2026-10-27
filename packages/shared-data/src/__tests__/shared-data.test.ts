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
import * as rules from '../rules/index.js';
import { readdirSync, readFileSync } from 'node:fs';

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
  assert.equal(
    RATE_API_V1_ENDPOINTS.PRODUCT_DETAIL('..'),
    '/api/v1/rate/products/'
  );
  assert.equal(
    RATE_API_V1_ENDPOINTS.MERCHANT_DETAIL('.'),
    '/api/v1/rate/merchants/'
  );
  assert.equal(RATE_API_V1_ENDPOINTS.REVIEW_VOTE('..'), '/api/reviews//vote');
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

  assert.equal(
    ScrapedProductSchema.parse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      priceBeforeDiscount: 2_000_000_000,
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).priceBeforeDiscount,
    undefined,
    'ScrapedProductSchema must drop priceBeforeDiscount exceeding MAX_VALID_VND_PRICE to undefined'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      priceBeforeDiscount: -1,
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject negative priceBeforeDiscount'
  );
  assert.deepEqual(
    ScrapedProductSchema.parse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      models: [
        { modelId: 'm1', name: '256GB', price: 31990000 },
        { modelId: 'm2', name: 'Oversized', price: 2_000_000_000 },
      ],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).models,
    [{ modelId: 'm1', name: '256GB', price: 31990000 }],
    'ScrapedProductSchema must filter out models with price exceeding MAX_VALID_VND_PRICE'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      reviews: [
        {
          reviewId: 'r1',
          author: 'Buyer',
          ratingStar: 5,
          comment: 'Good',
          images: ['javascript:alert(1)'],
        },
      ],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http reviews[].images'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      reviews: [
        {
          reviewId: 'r1',
          author: 'Buyer',
          ratingStar: 5,
          comment: 'Good',
          videos: ['javascript:alert(1)'],
        },
      ],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http reviews[].videos'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      reviews: [
        {
          reviewId: 'r1',
          author: 'Buyer',
          authorAvatar: 'javascript:alert(1)',
          ratingStar: 5,
          comment: 'Good',
        },
      ],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http reviews[].authorAvatar'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      reviews: [
        {
          reviewId: 'r1',
          author: 'Buyer',
          ratingStar: 5,
          comment: 'Good',
          reviewer: { profileUrl: 'javascript:alert(1)' },
        },
      ],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http reviews[].reviewer.profileUrl'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      images: ['javascript:alert(1)'],
      shop: { shopId: '654321', name: 'Apple Flagship Store', isMall: true },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http images'
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      platform: 'shopee',
      itemId: '123456',
      shopId: '654321',
      url: 'https://shopee.vn/product/654321/123456',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 31990000,
      priceMax: 33990000,
      shop: {
        shopId: '654321',
        name: 'Apple Flagship Store',
        isMall: true,
        url: 'javascript:alert(1)',
      },
    }).success,
    false,
    'ScrapedProductSchema must reject non-http shop.url'
  );

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

  assert.equal(
    sharedDataRoot.ListingSchema.safeParse({
      id: '01929000-0000-7000-8000-000000000001',
      title: '   ',
      slug: 'valid-slug',
      type: 'product',
      category: 'technology',
      status: 'published',
      locale: 'vi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).success,
    false,
    'ListingSchema must reject whitespace-only title'
  );
  assert.equal(
    sharedDataRoot.ListingSchema.safeParse({
      id: '01929000-0000-7000-8000-000000000001',
      title: 'Valid Title',
      slug: '../admin',
      type: 'product',
      category: 'technology',
      status: 'published',
      locale: 'vi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).success,
    false,
    'ListingSchema must reject path separators in slug'
  );
  assert.equal(
    sharedDataRoot.ReviewFilterSchema.safeParse({
      minRating: 5,
      maxRating: 2,
    }).success,
    false,
    'ReviewFilterSchema must reject minRating > maxRating'
  );
  assert.equal(
    sharedDataRoot.ReviewReactionSchema.safeParse({
      reviewId: '01929000-0000-7000-8000-000000000001',
      userId: '01929000-0000-7000-8000-000000000002',
      type: 'report',
      reason: '   ',
    }).success,
    false,
    'ReviewReactionSchema must reject whitespace-only reason'
  );
  assert.equal(
    sharedDataRoot.UserSchema.safeParse({
      id: '01929000-0000-7000-8000-000000000001',
      username: '   ',
      email: 'user@example.com',
      role: 'user',
      isActive: true,
      emailConfirmed: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).success,
    false,
    'UserSchema must reject whitespace-only username'
  );
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

function testPriceRules(): void {
  // One 1B VND ceiling for the schemas and the bait-price rule.
  assert.equal(rules.MAX_VALID_VND_PRICE, sharedDataRoot.MAX_VALID_VND_PRICE);
  assert.equal(
    rules.MAX_PLAUSIBLE_VND_PRICE,
    sharedDataRoot.MAX_VALID_VND_PRICE
  );
  // The rules ship on their own subpath, not the root export.
  assert.equal('plausibleOffers' in sharedDataRoot, false);

  assert.equal(
    rules.minimumListingPriceVnd(['iphone 16 pro max 256gb']),
    1_200_000
  );
  assert.equal(
    rules.minimumListingPriceVnd(['galaxy buds pro', 'https://shop.vn/x']),
    400_000
  );
  // A model number right after the name is still earbuds (DOS/Rate#1092).
  for (const title of [
    'galaxy buds3 pro',
    'Samsung Galaxy Buds2',
    'Huawei FreeBuds5i',
    'Huawei FreeBuds 5i',
    'Apple AirPods4',
    'https://shop.vn/samsung-galaxy-buds3-pro',
    'Samsung Galaxy Buds2Pro',
    'https://shop.vn/galaxy-buds3pro',
    'Apple AirPodsPro 2',
    'Sony WF1000XM5',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 400_000, title);
  }
  // Glued tiers and a glued brand are earbuds; over-ear WH- headphones and
  // other devices keep the device floor (DOS/Rate#1116).
  for (const title of [
    'Samsung Galaxy BudsPro3',
    'Samsung Galaxy Buds Pro 3',
    'Huawei FreeBudsPro4',
    'Huawei FreeBuds5i',
    'Huawei FreeBuds 5i',
    'SamsungGalaxyBuds3',
    'Galaxy Buds3 Pro',
    'Galaxy Buds2Pro',
    'Sony WF-1000XM5',
    'Apple AirPods Pro 2',
    'AirPodsPro',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 400_000, title);
  }
  for (const title of [
    'Sony WH-1000XM5',
    'Sony WH-CH720N',
    'Samsung Galaxy S24',
    'Galaxy Watch7',
    'Samsung Galaxy Z Flip',
    'Buddha statue',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 1_200_000, title);
  }
  assert.equal(
    rules.minimumListingPriceVnd(['galaxy buds+']),
    400_000,
    'a "+" after the name is no word character'
  );
  assert.equal(
    rules.minimumListingPriceVnd(['sony', 'https://shop.vn/tai-nghe-sony']),
    400_000,
    'the URL alone can name earbuds'
  );
  assert.equal(
    rules.minimumListingPriceVnd(['budsy phone stand']),
    1_200_000,
    'whole words only'
  );

  // 500k is below 40% of the median of the other three (3.1M): flagged.
  const offers = [
    { id: 'a', price_current: 500_000 },
    { id: 'b', price_current: 3_000_000 },
    { id: 'c', price_current: 3_100_000 },
    { id: 'd', price_current: 9_000_000 },
  ];
  assert.deepEqual([...rules.implausiblyLowOfferIds(offers)], ['a']);
  assert.equal(rules.plausibleMinPrice(0, offers), 3_000_000);

  // One definition of the ceiling: the schemas re-export it, never redefine it.
  assert.doesNotMatch(
    readFileSync(
      new URL('../schemas/specs.schema.js', import.meta.url),
      'utf8'
    ),
    /MAX_VALID_VND_PRICE\s*=/
  );

  // Browser-safe: the compiled rules import only each other, so neither zod
  // nor Supabase can reach a client bundle through them.
  const dir = new URL('../rules/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    // Static import/export statements (tsc emits them at column 0) and
    // dynamic import() calls; comments are not matched.
    const specifiers = [
      ...source.matchAll(/^(?:import|export)\b[^;]*?['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.match(
        specifier ?? '',
        /^\.\/[\w-]+\.js$/,
        `rules/${file} imports ${specifier}`
      );
    }
  }
}

function main(): void {
  console.log('🧪 Running @repo/shared-data unit tests...');
  testVersionAndZeroStrapiExports();
  console.log(
    '  ✅ [1/7] Version & Zero-Strapi root export isolation verified'
  );
  testRouteConstants();
  console.log('  ✅ [2/7] Route & REST API v1 constants verified');
  testTenFieldGroupsSpecificationsSchema();
  console.log(
    '  ✅ [3/7] 10-Field-Groups ProductSpecificationsSchema verified'
  );
  testMasterProductAndScrapedProductSchemas();
  console.log(
    '  ✅ [4/7] MasterProduct, ScrapedProduct & common schemas verified'
  );
  testSupabaseClientGuards();
  console.log('  ✅ [5/7] Supabase client fail-closed env guards verified');
  testSeedingRiskPenalty();
  console.log('  ✅ [6/7] Shared seeding risk penalty verified');
  testPriceRules();
  console.log(
    '  ✅ [7/7] Shared price rules (@repo/shared-data/rules) verified'
  );
  console.log('🎉 All @repo/shared-data tests passed!');
}

main();
