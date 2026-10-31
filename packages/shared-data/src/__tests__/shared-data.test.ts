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
import {
  LLM_REVIEW_SUMMARY_PREFIX,
  hasReviewScoreClaim,
  isScopedLlmReviewSummary,
  scopeLlmReviewSummary,
} from '../rules/index.js';
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
    'samsung:galaxy-buds3-pro:unknown',
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
    'sony:wh-1000xm5:unknown',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 1_200_000, title);
  }
  // Any brand glued to the name, two glued tiers and a digit after "Pro" are
  // earbuds; an over-ear title stays a device even with "tai nghe" in it
  // (DOS/Rate#1125).
  for (const title of [
    'PixelBudsPro2',
    'Google PixelBudsPro2',
    'HuaweiFreeBudsPro4',
    'HuaweiFreeBuds5i',
    'SonyWF1000XM5',
    'SonyWF-1000XM5',
    'AirPodsPro2',
    'Apple AirPodsPro2',
    'Buds3ProFE',
    'Samsung Galaxy Buds3ProFE',
    'XiaomiRedmiBuds5Pro',
    'SamsungBuds3',
    'OppoEncoBuds2',
    'pin 0.5Wh tai nghe',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 400_000, title);
  }
  for (const title of [
    'Tai nghe Sony WH-1000XM5',
    'Tai nghe chụp tai Sony WH1000XM4',
    'Tai nghe Bluetooth Sony WH-CH720N',
    'SonyWH-XB910N tai nghe',
    'Tai nghe Sony WH 1000XM5',
    'Sony_WH-1000XM5 tai nghe',
    'Tai nghe Sony WH-L600',
    'Tai nghe Sony WH-RF400',
    'https://repairpods.vn/iphone-16',
    'https://shop.vn/tai-nghe-sony-wh-1000xm5',
    'Which phone',
  ]) {
    assert.equal(rules.minimumListingPriceVnd([title]), 1_200_000, title);
  }
  assert.equal(
    rules.minimumListingPriceVnd([
      'Tai nghe Sony WH-1000XM5',
      'https://shop.vn/tai-nghe-sony',
    ]),
    1_200_000,
    'an over-ear title wins over "tai-nghe" in the URL'
  );
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

function testCategorySpecTemplates(): void {
  const phoneShaped = {
    ram_gb: 1,
    storage_gb: 64,
    screen_size_inch: 1,
    has_5g: true,
    specifications: {
      category_slug: 'x',
      display: { size_inch: 1, refresh_rate_hz: 60, ppi: 300 },
      hardware: { ram_gb: 1, storage_gb: 64, gpu: 'g', chipset: 'c' },
      camera: { main_camera: 'mic' },
      cellular: { has_5g: true, bands_5g: 'n78', bands_4g: 'LTE' },
      design: { biometrics: 'b', weight_g: 5 },
      connectivity: { bluetooth: '5.4', wlan: 'w', nfc: false },
      multimedia: { audio_features: 'ANC', headphone_jack_35mm: false },
      battery: { capacity_mah: 500 },
    },
    key_specs: {
      screen: 's',
      chip: 'c',
      camera: 'm',
      battery: 'b',
      storage: '64GB',
      ram: '1GB',
    },
  };

  // Phones and tablets, and any unknown slug, keep everything untouched.
  for (const slug of [
    'smartphones',
    'tablets',
    'laptops',
    undefined,
    null,
    'nope',
  ]) {
    assert.equal(
      rules.applyCategorySpecTemplate(slug, phoneShaped),
      phoneShaped
    );
    assert.equal(rules.getCategorySpecTemplate(slug).groups.length, 10);
  }

  // Earbuds: audio groups only, no screen, RAM, ROM, camera or cellular.
  const buds = rules.applyCategorySpecTemplate(' Earbuds ', phoneShaped);
  const budsSpecs = buds.specifications as unknown as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(rules.getCategorySpecTemplate('earbuds').groups, [
    'multimedia',
    'battery',
    'connectivity',
    'hardware',
    'design',
    'availability',
    'regulatory',
  ]);
  assert.equal(buds.ram_gb, null);
  assert.equal(buds.storage_gb, null);
  assert.equal(buds.screen_size_inch, null);
  assert.equal(buds.has_5g, false);
  for (const group of ['display', 'camera', 'cellular']) {
    assert.equal(budsSpecs[group], undefined, `earbuds drop ${group}`);
  }
  assert.equal(budsSpecs.category_slug, 'x', 'non-group keys are kept');
  assert.deepEqual(budsSpecs.connectivity, { bluetooth: '5.4' });
  assert.deepEqual(budsSpecs.multimedia, { audio_features: 'ANC' });
  assert.deepEqual(budsSpecs.design, { weight_g: 5 });
  // The audio chip is the one hardware fact earbuds keep.
  assert.deepEqual(budsSpecs.hardware, { chipset: 'c' });
  const budsStored = rules.applyCategorySpecTemplate('earbuds', phoneShaped, {
    forStorage: true,
  });
  assert.deepEqual(budsStored, buds, 'earbuds store what they show');
  assert.deepEqual(buds.key_specs, { chip: 'c', battery: 'b' });

  // Smartwatches: the page shows no camera and no 5G; screen, storage and
  // LTE stay.
  const watch = rules.applyCategorySpecTemplate('smartwatches', phoneShaped);
  const watchSpecs = watch.specifications as unknown as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(watch.has_5g, false);
  assert.equal(watch.storage_gb, 64);
  assert.equal(watch.screen_size_inch, 1);
  assert.equal(watchSpecs.camera, undefined);
  assert.deepEqual(watchSpecs.cellular, { bands_4g: 'LTE' });
  assert.deepEqual(watchSpecs.hardware, {
    ram_gb: 1,
    storage_gb: 64,
    chipset: 'c',
  });
  assert.deepEqual(watch.key_specs, {
    screen: 's',
    chip: 'c',
    battery: 'b',
    storage: '64GB',
    ram: '1GB',
  });
  // Stored, a watch keeps its 5G facts: a few models (RedCap) do have 5G.
  const watchStored = rules.applyCategorySpecTemplate(
    'smartwatches',
    phoneShaped,
    { forStorage: true }
  );
  const watchStoredSpecs = watchStored.specifications as unknown as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(watchStored.has_5g, true);
  assert.deepEqual(
    watchStoredSpecs.cellular,
    phoneShaped.specifications.cellular
  );
  assert.equal(watchStoredSpecs.hardware?.gpu, 'g');
  assert.equal(watchStoredSpecs.camera, undefined);

  // The free-text network fields lose their 5G parts on the page only
  // (DOS/Rate#1166); a 5GHz Wi-Fi mention is not 5G.
  const lteWatch = {
    specifications: {
      cellular: {
        technology: 'LTE / 5G',
        data_speed: 'LTE Cat 4, 5G NR',
        sim_type: 'eSIM',
      },
      connectivity: { wlan: 'Wi-Fi 802.11 b/g/n, 5GHz' },
    },
  };
  const lteWatchShown = rules.applyCategorySpecTemplate(
    'smartwatches',
    lteWatch
  ).specifications as unknown as Record<string, Record<string, unknown>>;
  assert.deepEqual(lteWatchShown.cellular, {
    technology: 'LTE',
    data_speed: 'LTE Cat 4',
    sim_type: 'eSIM',
  });
  assert.deepEqual(
    lteWatchShown.connectivity,
    lteWatch.specifications.connectivity
  );
  assert.deepEqual(
    rules.applyCategorySpecTemplate('smartwatches', {
      specifications: { cellular: { technology: '5G' } },
    }).specifications,
    { cellular: {} }
  );
  assert.deepEqual(
    rules.applyCategorySpecTemplate('smartwatches', lteWatch, {
      forStorage: true,
    }).specifications,
    lteWatch.specifications
  );
  assert.equal(lteWatch.specifications.cellular.technology, 'LTE / 5G');
  // 5G qualifiers and bracketed notes go with it; other text stays.
  const shownTech = (technology: string) =>
    (
      rules.applyCategorySpecTemplate('smartwatches', {
        specifications: { cellular: { technology } },
      }).specifications as { cellular: { technology?: string } }
    ).cellular.technology;
  assert.equal(shownTech('HSPA, LTE-A, 5G SA/NSA/Sub6'), 'HSPA, LTE-A');
  assert.equal(shownTech('LTE / 5G NR Sub-6'), 'LTE');
  assert.equal(shownTech('LTE (5G RedCap)'), 'LTE');
  assert.equal(shownTech('5G-ready LTE'), 'LTE');
  assert.equal(shownTech('LTE (Cat 4) / 5G'), 'LTE (Cat 4)');
  assert.equal(shownTech('GSM / LTE'), 'GSM / LTE');
  assert.equal(
    shownTech(shownTech('HSPA, LTE-A, 5G SA/NSA/Sub6') ?? ''),
    'HSPA, LTE-A'
  );
  assert.equal(
    (
      rules.applyCategorySpecTemplate('smartwatches', {
        specifications: { cellular: { sim_type: 'eSIM (5G)' } },
      }).specifications as { cellular: { sim_type?: string } }
    ).cellular.sim_type,
    'eSIM'
  );

  // Idempotent, never mutates the input, and leaves absent columns absent.
  assert.deepEqual(rules.applyCategorySpecTemplate('earbuds', buds), buds);
  assert.equal(phoneShaped.ram_gb, 1);
  assert.equal(phoneShaped.specifications.display.size_inch, 1);
  assert.equal(
    'ram_gb' in rules.applyCategorySpecTemplate('earbuds', { has_5g: true }),
    false
  );

  const watchTemplate = rules.getCategorySpecTemplate('smartwatches');
  assert.equal(
    rules.specFieldApplies(watchTemplate, 'cellular', 'has_5g'),
    false
  );
  assert.equal(
    rules.specFieldApplies(watchTemplate, 'cellular', 'technology'),
    true
  );
  assert.equal(
    rules.specFieldApplies(watchTemplate, 'camera', 'main_camera'),
    false
  );
}

function assertRoundTrip(modelKey: string): void {
  const parts = sharedDataRoot.splitModelKey(modelKey);
  assert.ok(parts, `splitModelKey must parse ${modelKey}`);
  const segments = modelKey.split(':');
  assert.equal(parts.itemKey, `${segments[0]}:${segments[1]}`, modelKey);
  assert.equal(parts.variantKey, segments[2], modelKey);
  assert.equal(
    sharedDataRoot.composeModelKey(parts.itemKey, parts.variantKey),
    modelKey
  );
  assert.equal(sharedDataRoot.isItemKey(parts.itemKey), true, modelKey);
  assert.equal(sharedDataRoot.isVariantKey(parts.variantKey), true, modelKey);
}

function testItemVariantKeys(): void {
  const {
    splitModelKey,
    composeModelKey,
    isModelKey,
    isItemKey,
    isVariantKey,
    isSizedVariantKey,
    UNKNOWN_VARIANT_KEY,
    ItemSchema,
    VariantSchema,
    VariantSourceSchema,
    ItemKeySchema,
    VariantKeySchema,
    ModelKeySchema,
  } = sharedDataRoot;

  // Exported from the root entry and from the zod-free rules entry.
  assert.equal(rules.splitModelKey, splitModelKey);
  assert.equal(rules.composeModelKey, composeModelKey);

  // Every key form the normalizer emits today (design doc 4.2).
  const forms: Array<[string, string, string]> = [
    ['apple:iphone-17-pro:256gb', 'apple:iphone-17-pro', '256gb'],
    ['apple:iphone-17-pro-max:1024gb', 'apple:iphone-17-pro-max', '1024gb'],
    // Apple screen / case size stays in the Item (#1113, #1124).
    ['apple:ipad-pro-m5-11:256gb', 'apple:ipad-pro-m5-11', '256gb'],
    ['apple:ipad-pro-m5-13:1024gb', 'apple:ipad-pro-m5-13', '1024gb'],
    ['apple:watch-series-11-46mm:64gb', 'apple:watch-series-11-46mm', '64gb'],
    // Storage not stated, and earbuds / sizeless watches (single variant).
    ['apple:iphone-18-pro:unknown', 'apple:iphone-18-pro', 'unknown'],
    ['apple:airpods-pro-2:unknown', 'apple:airpods-pro-2', 'unknown'],
    ['samsung:galaxy-buds3-pro:unknown', 'samsung:galaxy-buds3-pro', 'unknown'],
    ['garmin:fenix-8:unknown', 'garmin:fenix-8', 'unknown'],
    // Literal legacy / future variant keys (design doc 4.2).
    [
      'samsung:galaxy-buds-3-pro:standard',
      'samsung:galaxy-buds-3-pro',
      'standard',
    ],
    [
      'apple:ipad-air-m3-11:256gb-cellular',
      'apple:ipad-air-m3-11',
      '256gb-cellular',
    ],
    [
      'samsung:galaxy-s26-ultra:256gb-16gbram',
      'samsung:galaxy-s26-ultra',
      '256gb-16gbram',
    ],
    // A dot is allowed in the model segment (design doc 7.3), although
    // today's slugify strips it.
    ['xiaomi:redmi-note-14.5:128gb', 'xiaomi:redmi-note-14.5', '128gb'],
    // slugify keeps `_` (it strips [^\w-]), including at the start.
    ['asus:vivobook-x1504_va:512gb', 'asus:vivobook-x1504_va', '512gb'],
    ['samsung:_galaxy-s25:256gb', 'samsung:_galaxy-s25', '256gb'],
  ];
  for (const [modelKey, itemKey, variantKey] of forms) {
    assert.deepEqual(splitModelKey(modelKey), { itemKey, variantKey });
    assert.equal(composeModelKey(itemKey, variantKey), modelKey);
    assertRoundTrip(modelKey);
  }

  // Every three-part key literal in the importer's normalizer fixtures.
  const fixtureDir = new URL(
    '../../../../apps/importer/src/shopee/__tests__/',
    import.meta.url
  );
  const fixtureKeys = new Set<string>();
  for (const file of readdirSync(fixtureDir)) {
    if (!/\.(ts|mjs)$/.test(file)) continue;
    const source = readFileSync(new URL(file, fixtureDir), 'utf8');
    for (const m of source.matchAll(
      // Wider than the key shape (upper case), so a fixture key the helpers
      // would reject fails here instead of being skipped. The brand must
      // start with a letter or `_`, which leaves out ISO timestamps.
      /['"`]([A-Za-z_][\w-]*:[\w.-]+:[\w.-]+)['"`]/g
    )) {
      fixtureKeys.add(m[1] ?? '');
    }
  }
  assert.ok(
    fixtureKeys.size >= 100,
    `expected the importer fixtures to hold 100+ keys, found ${fixtureKeys.size}`
  );
  for (const modelKey of fixtureKeys) assertRoundTrip(modelKey);

  // Not in the brand:model:variant shape: not parsed, not composed.
  for (const bad of [
    '',
    'apple_iphone_16',
    'other:key',
    'khc:legacy',
    'a:b:c:d',
    'Apple:iphone-17:256gb',
    'apple::256gb',
    ':iphone-17:256gb',
    'apple:iphone-17:',
    'apple:-iphone:256gb',
    'apple:iphone 17:256gb',
    // Empty model segment, as the normalizer emits for a title with no model.
    'samsung::unknown',
    'khac::256gb',
    'apple:iphone-17:256GB',
    `apple:${'x'.repeat(200)}:256gb`,
  ]) {
    assert.equal(splitModelKey(bad), null, bad);
    assert.equal(isModelKey(bad), false, bad);
    assert.equal(ModelKeySchema.safeParse(bad).success, false, bad);
  }
  assert.equal(splitModelKey(undefined as unknown as string), null);
  assert.throws(() => composeModelKey('apple', '256gb'), RangeError);
  assert.throws(
    () => composeModelKey('apple:iphone-17:256gb', '256gb'),
    RangeError
  );
  assert.throws(() => composeModelKey('apple:iphone-17', ''), RangeError);
  assert.throws(() => composeModelKey('apple:iphone-17', '256:gb'), RangeError);
  assert.throws(
    () => composeModelKey(`apple:${'x'.repeat(190)}`, '1024gb'),
    RangeError
  );
  assert.equal(isItemKey('apple:ipad-pro-m5-11'), true);
  assert.equal(isItemKey('apple:ipad-pro-m5-11:256gb'), false);
  assert.equal(isVariantKey('256gb-cellular'), true);
  assert.equal(isVariantKey('256gb:x'), false);
  assert.equal(ItemKeySchema.safeParse('apple:ipad-pro-m5-11').success, true);
  assert.equal(ItemKeySchema.safeParse('apple').success, false);
  assert.equal(VariantKeySchema.safeParse('unknown').success, true);
  assert.equal(VariantKeySchema.safeParse('').success, false);

  // Only a stated storage size makes an Item multi-size (design doc 4.2).
  for (const sized of ['8gb', '64gb', '256gb', '1024gb', '1tb']) {
    assert.equal(isSizedVariantKey(sized), true, sized);
  }
  for (const other of [
    UNKNOWN_VARIANT_KEY,
    'standard',
    '256gb-cellular',
    'gb',
    '',
  ]) {
    assert.equal(isSizedVariantKey(other), false, other);
  }
  assert.equal(UNKNOWN_VARIANT_KEY, 'unknown');

  const id = '018f3b2c-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
  const item = ItemSchema.parse({
    id,
    item_key: 'apple:ipad-pro-m5-11',
    slug: 'apple-ipad-pro-m5-11',
    name: 'Apple iPad Pro M5 11',
    brand: 'Apple',
    model: 'iPad Pro M5 11',
  });
  assert.equal(item.status, 'draft');
  assert.equal(item.min_price, 0);
  assert.equal(item.unknown_variant_listing_count, 0);
  assert.deepEqual(item.specifications, {});
  // Legacy keys still get an Item (design doc 4.3): no shape check on rows.
  assert.equal(
    ItemSchema.safeParse({ ...item, item_key: 'khc:legacy-thing' }).success,
    true
  );
  assert.equal(
    ItemSchema.safeParse({ ...item, status: 'hidden' }).success,
    false
  );
  assert.equal(
    ItemSchema.safeParse({ ...item, average_rating: 6 }).success,
    false
  );

  const variant = {
    id,
    brand: 'Apple',
    model: 'iPad Pro M5 11',
    model_key: 'apple:ipad-pro-m5-11:256gb',
    name: 'Apple iPad Pro M5 11 256GB',
    slug: 'apple-ipad-pro-m5-11-256gb',
    item_id: id,
    variant_key: '256gb',
    sort_order: 1,
  };
  assert.equal(VariantSchema.parse(variant).variant_key, '256gb');
  // Before the backfill both links may be missing.
  assert.equal(
    VariantSchema.safeParse({ ...variant, item_id: null, variant_key: null })
      .success,
    true
  );
  // model_key = item_key:variant_key must hold.
  assert.equal(
    VariantSchema.safeParse({ ...variant, variant_key: '512gb' }).success,
    false
  );
  assert.equal(
    VariantSchema.safeParse({ ...variant, sort_order: 40000 }).success,
    false
  );

  assert.deepEqual(VariantSourceSchema.options, [
    'title',
    'sku',
    'single_size',
    'single_variant',
    'manual',
    'legacy',
  ]);
}

function testLlmReviewSummaryScope(): void {
  // Qualitative text is kept, after the one-listing scope prefix, once.
  const plain = 'Pin trâu, camera đêm tốt, máy hơi nóng khi chơi game 2 tiếng.';
  const scoped = scopeLlmReviewSummary(`  ${plain}
`);
  assert.equal(scoped, `${LLM_REVIEW_SUMMARY_PREFIX}${plain}`);
  assert.ok(isScopedLlmReviewSummary(scoped));
  assert.equal(scopeLlmReviewSummary(scoped), scoped, 'never prefixed twice');
  // Spec numbers are not claims.
  for (const ok of [
    'Pin 5000mAh, sạc 65W, RAM 8GB, màn 120Hz, dùng 6 tháng vẫn ổn.',
    'Pin còn 90% sau 1 năm.',
    'Sạc từ 0 lên 100% trong 1 tiếng.',
    'Có 2 điểm trừ: nóng và nặng.',
    '1 lượt sạc dùng 2 ngày.',
    'Shop hỗ trợ 24/7.',
    'Giao ngày 28/10 đúng hẹn.',
    'Máy dùng được cho 2 người.',
    'Pin trung bình 2 ngày.',
    'Camera 50MP chụp đẹp, dùng 2 năm chưa lỗi.',
    'Pin dùng được 2/3 ngày.',
    'Pin tụt 10% sau một giờ.',
    'Màn hình có 1000 điểm ảnh bị lỗi.',
    'Máy hỗ trợ 2 sao lưu tự động.',
    'Người mua cho biết pin tụt 10% sau một giờ.',
    'Khách khen pin còn 90% sau một năm.',
    'Màn hình có 2 điểm chết.',
    'Có 2 điểm sáng: pin và camera.',
    'Giao hàng ngày 5/10 đúng hẹn.',
    'Pin dùng được 3/5 ngày.',
  ]) {
    assert.equal(hasReviewScoreClaim(ok), false, ok);
  }
  // Scores, shares and counts (vi and en) are claims: never stored or shown.
  for (const claim of [
    'Đạt 4.8/5.',
    '4,8 trên 5 điểm.',
    'Được chấm 5 sao.',
    '5★ từ người mua.',
    '90% khen pin.',
    'Có 120 đánh giá tích cực.',
    '30 người mua phàn nàn.',
    'Điểm trung bình cao.',
    'Điểm JReviews có trọng số tốt.',
    'Rated 4.7 out of 5.',
    '120 reviews praise the battery.',
    'Weighted score is high.',
    'Đánh giá trung bình 4.8.',
    'Điểm 4,8.',
    'Rated 4.7.',
    'Score of 4.7.',
    'Average of 4.7.',
    '80 phần trăm người mua khen pin.',
    '30 khách hàng phàn nàn.',
    'Trong 120 bài đánh giá, nhiều người khen.',
    '50 phản hồi tích cực.',
    'Hầu hết đều cho năm sao.',
    'Most buyers gave five stars.',
    '4.8 🌟.',
    'Đạt 9/10.',
    'Có 30 người khen pin.',
    '95% các khách hàng hài lòng.',
    'Được đánh giá 4.8.',
    'Chấm 4/5.',
    '85/100 điểm.',
    'rating 4.8',
    'điểm 9',
    'hơn trăm người khen pin.',
    'Hàng nghìn đánh giá tốt.',
    'Hundreds of buyers like it.',
    '95 percent of buyers are satisfied.',
    '95 phần trăm người mua hài lòng.',
    '４.８⭐',
    '4​.8/5',
  ]) {
    assert.equal(hasReviewScoreClaim(claim), true, claim);
    assert.equal(scopeLlmReviewSummary(claim), null, claim);
  }
  assert.equal(
    scopeLlmReviewSummary(`${LLM_REVIEW_SUMMARY_PREFIX}Đạt 4.8/5.`),
    null,
    'a scoped row is checked too'
  );
  for (const empty of [
    null,
    undefined,
    '',
    '   ',
    42,
    LLM_REVIEW_SUMMARY_PREFIX,
  ]) {
    assert.equal(scopeLlmReviewSummary(empty), null);
  }
  const long = scopeLlmReviewSummary('Máy dùng tốt. '.repeat(100))!;
  assert.ok(long.length <= 600 && long.endsWith('…'));
  const emoji = scopeLlmReviewSummary('😀'.repeat(400))!;
  // A pair cut in half upstream: the lone half is dropped.
  const loneHigh = scopeLlmReviewSummary(
    `${LLM_REVIEW_SUMMARY_PREFIX}a${'😀'.repeat(10)}${String.fromCharCode(0xd83d)}`
  )!;
  const lastUnit = loneHigh.charCodeAt(loneHigh.length - 1);
  assert.ok(
    !(lastUnit >= 0xd800 && lastUnit <= 0xdbff),
    'a cut-off pair is dropped'
  );
  const beforeEllipsis = emoji.charCodeAt(emoji.length - 2);
  assert.ok(emoji.length <= 600 && emoji.endsWith('…'));
  assert.ok(
    !(beforeEllipsis >= 0xd800 && beforeEllipsis <= 0xdbff),
    'no lone surrogate'
  );
  assert.equal(
    scopeLlmReviewSummary(
      `${LLM_REVIEW_SUMMARY_PREFIX}${LLM_REVIEW_SUMMARY_PREFIX}Pin tốt.`
    ),
    `${LLM_REVIEW_SUMMARY_PREFIX}Pin tốt.`,
    'repeated prefixes collapse to one'
  );
}

function testRatingCriteriaAndReviewForm(): void {
  // D1: every list is weighted to 100, with unique keys, both labels and
  // exactly one required criterion.
  for (const slug of rules.RATING_CRITERIA_CATEGORIES) {
    const criteria = rules.getRatingCriteria(slug);
    assert.equal(
      criteria.reduce((sum, criterion) => sum + criterion.weight, 0),
      100,
      slug
    );
    assert.equal(new Set(criteria.map((cr) => cr.key)).size, criteria.length);
    for (const criterion of criteria) {
      assert.ok(criterion.label.vi && criterion.label.en, criterion.key);
      assert.ok(criterion.weight > 0, criterion.key);
    }
    assert.equal(criteria.filter((cr) => cr.required).length, 1, slug);
  }
  assert.equal(rules.RATING_CRITERIA_VERSION, 1);
  // Earbuds rate sound, not a display; an unknown category rates as a phone.
  const earbudKeys = rules.getRatingCriteria('earbuds').map((cr) => cr.key);
  assert.ok(earbudKeys.includes('sound') && !earbudKeys.includes('display'));
  assert.deepEqual(
    rules.getRatingCriteria('cameras'),
    rules.getRatingCriteria('smartphones')
  );
  assert.deepEqual(
    rules.getRatingCriteria(null),
    rules.getRatingCriteria('smartphones')
  );

  // The review star is the weighted average, at one decimal: a phone with
  // performance 5 (20), camera 4 (20), battery 3 (20), display 5 (15),
  // design 4 (10) and value 4 (15) is 415 / 100 = 4.15, shown as 4.2.
  const phone = {
    performance: 5,
    camera: 4,
    battery: 3,
    display: 5,
    design: 4,
    value: 4,
  };
  assert.equal(rules.weightedReviewStar('smartphones', phone), 4.2);
  // Skipped criteria leave the weights of the rated ones: (5*20 + 4*15) / 35.
  assert.equal(
    rules.weightedReviewStar('smartphones', { performance: 5, value: 4 }),
    4.6
  );
  // Unknown keys and bad stars are ignored; nothing valid gives null.
  assert.equal(
    rules.weightedReviewStar('smartphones', { screen: 5, value: 7 }),
    null
  );
  assert.equal(rules.weightedReviewStar('earbuds', {}), null);

  // D5: up to two criteria skipped, value never; stars 1-5 in half steps.
  assert.deepEqual(rules.validateCriteriaRatings('smartphones', phone), []);
  assert.deepEqual(
    rules.validateCriteriaRatings('smartphones', {
      performance: 4.5,
      camera: 4,
      battery: 3,
      display: 5,
      value: 4,
    }),
    []
  );
  assert.deepEqual(
    rules.validateCriteriaRatings('smartphones', {
      performance: 5,
      camera: 4,
      battery: 3,
      display: 5,
      design: 4,
    }),
    [{ kind: 'missing_required', key: 'value' }]
  );
  assert.deepEqual(
    rules.validateCriteriaRatings('smartphones', {
      performance: 5,
      camera: 4,
      value: 4,
    }),
    [{ kind: 'too_many_skipped', skipped: 3 }]
  );
  assert.deepEqual(
    rules.validateCriteriaRatings('earbuds', {
      sound: 5,
      anc: 4.3,
      battery: 0,
      comfort: 5,
      screen: 4,
      value: 4,
    }),
    [
      { kind: 'bad_star', key: 'anc' },
      { kind: 'bad_star', key: 'battery' },
      { kind: 'unknown_key', key: 'screen' },
    ]
  );
  assert.deepEqual(
    rules.validateCriteriaRatings('services', {
      service_quality: 5,
      attitude: 4,
      speed: 4,
    }),
    [{ kind: 'missing_required', key: 'price' }]
  );

  // Legacy five keys map per category; a key with no counterpart is dropped
  // and nothing is inferred for the new criteria.
  const legacy = {
    screen: 4.3,
    performance: 5,
    camera: 4,
    battery: 3,
    value: 4,
  };
  assert.deepEqual(rules.mapLegacyCriteriaRatings('smartphones', legacy), {
    display: 4.3,
    performance: 5,
    camera: 4,
    battery: 3,
    value: 4,
  });
  assert.deepEqual(rules.mapLegacyCriteriaRatings('earbuds', legacy), {
    sound: 4.3,
    anc: 4,
    battery: 3,
    value: 4,
  });
  assert.deepEqual(rules.mapLegacyCriteriaRatings('smartwatches', legacy), {
    display: 4.3,
    battery: 3,
    value: 4,
  });
  assert.deepEqual(
    rules.mapLegacyCriteriaRatings('laptops', { screen: 9, value: 'x' }),
    {}
  );

  // D5 text: verdict, pros and cons.
  const review = {
    verdict: 'Hợp người chơi game, ai cần sạc nhanh nên cân nhắc.',
    pros: ['Chơi game mượt, ít nóng', 'Ảnh đêm rõ'],
    cons: ['Sạc chậm so với máy cùng giá'],
  };
  assert.deepEqual(rules.validateReviewText(review), []);
  assert.deepEqual(
    rules.validateReviewText({ verdict: 'Tốt', pros: [], cons: [] }),
    [
      { kind: 'verdict_length', length: 3 },
      { kind: 'points_count', list: 'pros', count: 0 },
      { kind: 'points_count', list: 'cons', count: 0 },
    ]
  );
  for (const dodge of [
    'Không có',
    'không có gì để chê',
    'Chưa thấy',
    'Hiện tại chưa thấy nhược điểm nào',
    'ko co',
    'Không có điểm trừ',
    'None.',
    '...',
    // Reviews of #1548.
    'Không có nhược điểm nào cả',
    'chua co nhuoc diem nao het',
    'Không có gì đáng chê',
    'không chê được gì',
    'Ko có gì để chê nha',
    'không có ạ',
    'Chả có gì',
    'Khum có',
    'kcj',
    'Chưa phát hiện ra',
    'Chưa gặp vấn đề gì',
    'Không có gì để phàn nàn',
    'Mọi thứ đều ổn',
    'no complaints',
    '10/10',
    'aaaaa',
    'Khô​ng có',
    'ＫＨÔＮＧ CÓ',
    // Round 2 of #1548.
    'Mình không thấy gì để chê',
    'Em chưa thấy gì',
    'Không có gì chê',
    'Không có điểm gì để chê',
    'Không có gì để nói',
    'Không có ý kiến',
    'Rất tốt',
    'Everything is fine',
    'hong co',
  ]) {
    assert.ok(rules.isEvasiveCon(dodge), dodge);
  }
  for (const real of [
    'Giá hơi cao',
    'Không có củ sạc trong hộp',
    'Chưa có bản màu xanh',
    'Không chống nước',
    'Không có jack 3.5mm',
    'Chưa hỗ trợ eSIM',
    'Pin không trâu',
    'Không có NFC',
    'Chưa có gì nổi bật',
    'K có sạc',
    // Round 2 of #1548: other diacritics are other words.
    'Hỏng hết',
    'Hỏng luôn',
    'Vẫn hỏng',
    'Không gập',
    'Chưa có lời',
    'Không có lõi',
    'Mọi thứ đều ồn',
    'Chả cá',
  ]) {
    assert.ok(!rules.isEvasiveCon(real), real);
  }
  assert.deepEqual(
    rules.validateReviewText({
      ...review,
      pros: ['Màn đẹp, sáng', 'màn đẹp sáng'],
      cons: ['Không có gì', 'Màn đẹp, sáng!'],
    }),
    [
      { kind: 'duplicate_point', list: 'pros', index: 1 },
      { kind: 'evasive_con', index: 0 },
      { kind: 'pro_and_con', index: 1 },
    ]
  );
  assert.deepEqual(
    rules.validateReviewText({
      ...review,
      pros: ['Tốt', 'x'.repeat(151), 'a', 'b1234', 'c1234', 'd1234'],
    }),
    [
      { kind: 'points_count', list: 'pros', count: 6 },
      { kind: 'point_length', list: 'pros', index: 0 },
      { kind: 'point_length', list: 'pros', index: 1 },
      { kind: 'point_length', list: 'pros', index: 2 },
    ]
  );
  // Reviews of #1548: lines with no words, lengths as the writer sees them
  // (three emoji are 3, a decomposed "Pin ổn" is 6),
  // diacritics kept when comparing, and malformed bodies that never throw.
  assert.deepEqual(
    rules.validateReviewText({
      verdict: '.'.repeat(25),
      pros: ['!!!!!!', '🔥🔥🔥🔥🔥', 'Màn hình sắc nét'],
      cons: ['Màn hình sạc nét'],
    }),
    [
      { kind: 'no_content', list: 'verdict', index: 0 },
      { kind: 'no_content', list: 'pros', index: 0 },
      { kind: 'no_content', list: 'pros', index: 1 },
    ]
  );
  assert.deepEqual(
    rules.validateReviewText({
      ...review,
      pros: ['😀😀😀', 'Pin ổn'.normalize('NFD')],
    }),
    [{ kind: 'point_length', list: 'pros', index: 0 }]
  );
  assert.deepEqual(
    rules.validateReviewText(
      null as unknown as Parameters<typeof rules.validateReviewText>[0]
    ),
    [
      { kind: 'verdict_length', length: 0 },
      { kind: 'points_count', list: 'pros', count: 0 },
      { kind: 'points_count', list: 'cons', count: 0 },
    ]
  );

  // Reviews of #1548: prototype keys are not categories or ratings, null is a
  // skipped criterion, and legacy 0.1-step stars count in the review star.
  for (const slug of ['toString', '__proto__', 'constructor']) {
    assert.deepEqual(
      rules.getRatingCriteria(slug),
      rules.getRatingCriteria('smartphones'),
      slug
    );
    assert.equal(rules.hasRatingCriteria(slug), false, slug);
    assert.deepEqual(
      rules.validateCriteriaRatings(slug, phone),
      [],
      `validate ${slug}`
    );
    assert.deepEqual(
      rules.mapLegacyCriteriaRatings(slug, { value: 5 }),
      { value: 5 },
      `legacy ${slug}`
    );
  }
  assert.equal(rules.hasRatingCriteria('earbuds'), true);
  assert.equal(rules.hasRatingCriteria('service'), false);
  assert.equal(
    rules.weightedReviewStar(
      'smartphones',
      Object.create({ value: 5 }) as Record<string, number>
    ),
    null
  );
  assert.deepEqual(
    rules.validateCriteriaRatings('smartphones', {
      ...phone,
      design: null,
      camera: null,
    }),
    []
  );
  const legacyStars = rules.mapLegacyCriteriaRatings('smartphones', {
    screen: 1.3,
    performance: 5,
    camera: 5,
    battery: 5,
    value: 5,
  });
  // (1.3*15 + 5*20 + 5*20 + 5*20 + 5*15) / 90 = 394.5 / 90 = 4.38.
  assert.equal(rules.weightedReviewStar('smartphones', legacyStars), 4.4);
  // An oversized con is never a dodge and is checked in linear time.
  const started = Date.now();
  assert.ok(!rules.isEvasiveCon('khong ' + 'gi '.repeat(50_000) + 'x'));
  assert.ok(Date.now() - started < 1000, 'linear on an oversized con');
}

function main(): void {
  console.log('🧪 Running @repo/shared-data unit tests...');
  testVersionAndZeroStrapiExports();
  console.log(
    '  ✅ [1/8] Version & Zero-Strapi root export isolation verified'
  );
  testRouteConstants();
  console.log('  ✅ [2/8] Route & REST API v1 constants verified');
  testTenFieldGroupsSpecificationsSchema();
  console.log(
    '  ✅ [3/8] 10-Field-Groups ProductSpecificationsSchema verified'
  );
  testMasterProductAndScrapedProductSchemas();
  console.log(
    '  ✅ [4/8] MasterProduct, ScrapedProduct & common schemas verified'
  );
  testSupabaseClientGuards();
  console.log('  ✅ [5/8] Supabase client fail-closed env guards verified');
  testSeedingRiskPenalty();
  console.log('  ✅ [6/8] Shared seeding risk penalty verified');
  testPriceRules();
  console.log(
    '  ✅ [7/8] Shared price rules (@repo/shared-data/rules) verified'
  );
  testItemVariantKeys();
  console.log(
    '  ✅ [8/8] Item / variant schemas and model_key helpers verified'
  );
  testCategorySpecTemplates();
  console.log('  ✅ [9/9] Category spec templates (DOS/Rate#1142) verified');
  testLlmReviewSummaryScope();
  console.log('  ✅ [10/10] LLM review summary scope (DOS/Rate#1244) verified');
  testRatingCriteriaAndReviewForm();
  console.log(
    '  ✅ [11/11] Rating criteria and review form rules (DOS/Rate#1542) verified'
  );
  console.log('🎉 All @repo/shared-data tests passed!');
}

main();
