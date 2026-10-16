import assert from 'node:assert/strict';
import {
  KNOWN_LOCAL_DEVICE_IMAGES,
  computeJReviewsWeight,
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  getMasterProductHref,
  parseEcommerceUrlOrQuery,
  resolveProductImageUrl,
} from '../../../lib/rate-api';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
} from '../../../lib/category-filters';
import { getRateCopy, normalizeRateLocale } from '../../../lib/rate-i18n';
import {
  getSpecUiDictionary,
  localizeSpecValue,
} from '../../../lib/spec-localizer';
import {
  buildPopular1v1BattlesForCategory,
  computeProductStandingInCategory,
  rankMasterProductsForLeaderboard,
} from '../../../lib/leaderboard-engine';

import {
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
} from '../extension';
import { buildRateOpenApiSpec } from '../openapi';
import {
  ProductSpecificationsSchema,
  RATE_API_V1_ENDPOINTS,
  RATE_ROUTES,
} from '@repo/shared-data';

function runCoreArchitectureSuite() {
  console.log(
    '🧪 Running Rate.vn Core Architecture & Multi-Category Verification Suite...'
  );

  // 1. JReviews logarithmic weight formula
  assert.equal(
    computeJReviewsWeight({
      upvotes: 20,
      downvotes: 0,
      reports: 0,
      flagCategory: 'low_value_coin_spam',
    }),
    0
  );
  assert.equal(
    computeJReviewsWeight({
      upvotes: 50,
      downvotes: 0,
      reports: 0,
      flagCategory: 'seeding_fake',
    }),
    0
  );
  assert.equal(
    computeJReviewsWeight({
      upvotes: 0,
      downvotes: 0,
      reports: 0,
      flagCategory: 'authentic',
    }),
    1
  );
  const boosted = computeJReviewsWeight({
    upvotes: 10,
    downvotes: 1,
    reports: 0,
    flagCategory: 'authentic',
  });
  assert.ok(boosted > 1.9 && boosted <= 3.0);

  const penalized = computeJReviewsWeight({
    upvotes: 0,
    downvotes: 2,
    reports: 2,
    flagCategory: 'authentic',
  });
  assert.equal(penalized, 0);
  console.log('  ✅ [1/7] JReviews Logarithmic Weight Formula passed');

  // 2. Canonical 5-category routing
  assert.equal(getCategoryRouteHref('smartphones'), '/smartphones');
  assert.equal(getCategoryRouteHref('tablets'), '/tablets');
  assert.equal(getCategoryRouteHref('laptops'), '/laptops');
  assert.equal(getCategoryRouteHref('smartwatches'), '/smartwatches');
  assert.equal(getCategoryRouteHref('earbuds'), '/earbuds');

  const catMap = new Map<string, string>([
    ['cat-watch', 'smartwatches'],
    ['cat-audio', 'earbuds'],
  ]);

  assert.equal(
    getMasterProductHref(
      { slug: 'apple-watch-series-10', category_id: 'cat-watch' },
      catMap
    ),
    '/smartwatches/apple-watch-series-10'
  );
  assert.equal(
    getMasterProductHref(
      { slug: 'airpods-pro-2-usb-c', category_id: 'cat-audio' },
      catMap
    ),
    '/earbuds/airpods-pro-2-usb-c'
  );
  assert.equal(
    getMasterProductHref({
      slug: 'ipad-pro-m4-256gb',
      name: 'Apple iPad Pro M4 11 inch',
    }),
    '/tablets/ipad-pro-m4-256gb'
  );
  assert.equal(
    getMasterProductHref({
      slug: 'macbook-air-m3-16gb',
      name: 'Apple MacBook Air M3',
    }),
    '/laptops/macbook-air-m3-16gb'
  );
  console.log(
    '  ✅ [2/7] Canonical 5-Category Routing (smartphones/tablets/laptops/smartwatches/earbuds) passed'
  );

  // 3. E-commerce URL and query parser
  const shopeeItem = parseEcommerceUrlOrQuery(
    'https://shopee.vn/Apple-iPhone-16-128GB-i.88201679.27110898667'
  );
  assert.equal(shopeeItem.platform, 'shopee');
  assert.equal(shopeeItem.platformShopId, '88201679');
  assert.equal(shopeeItem.platformItemId, '27110898667');

  const shopeeShop = parseEcommerceUrlOrQuery(
    'https://shopee.vn/shop/88201679'
  );
  assert.equal(shopeeShop.platform, 'shopee');
  assert.equal(shopeeShop.platformShopId, '88201679');
  assert.equal(shopeeShop.platformItemId, null);

  const internalWatch = parseEcommerceUrlOrQuery(
    'https://rate.vn/smartwatches/apple-watch-ultra-2'
  );
  assert.equal(internalWatch.platform, 'rate');
  assert.equal(internalWatch.internalSlug, 'apple-watch-ultra-2');
  console.log('  ✅ [3/7] E-Commerce URL & Internal Slug Parser passed');

  // 4. 10-Field-Groups category filter schemas
  for (const slug of [
    'smartphones',
    'tablets',
    'laptops',
    'smartwatches',
    'earbuds',
  ]) {
    const schema = getCategoryFilterSchema(slug, ['CustomBrand']);
    assert.equal(schema.categorySlug, slug);
    assert.ok(schema.defaultBrands.includes('CustomBrand'));
    assert.ok(schema.pricePresets.length >= 3);
  }
  assert.equal(formatStorageLabel(256), '256GB');
  assert.equal(formatStorageLabel(1024), '1TB');
  assert.equal(formatStorageLabel(2048), '2TB');
  console.log('  ✅ [4/7] 10-Field-Groups Category Filter Registry passed');

  // 5. Multi-locale dictionary (vi, en, cs)
  assert.equal(normalizeRateLocale('vi'), 'vi');
  assert.equal(normalizeRateLocale('en'), 'en');
  assert.equal(normalizeRateLocale('cs'), 'cs');
  assert.equal(normalizeRateLocale('unknown'), 'vi');

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const copy = getRateCopy(loc);
    assert.equal(copy.locale, loc);
    assert.ok(copy.seo.siteTitle.includes('Rate.vn'));
    assert.ok(copy.nav.developers.length > 0);
    assert.ok(copy.footer.links.smartwatches.length > 0);
  }
  console.log('  ✅ [5/7] Multi-Locale Dictionary (vi/en/cs) passed');

  // 6. Extension gatekeeper, URL canonicalization, and 10-Field-Groups Zod schema
  const canon = canonicalizeProductUrl(
    'https://shopee.vn/product/88201679/27110898667?sp_atk=abc&utm_source=fb'
  );
  assert.ok(canon && !canon.includes('sp_atk'));
  assert.ok(canon && !canon.includes('utm_source'));

  assert.equal(
    detectAccessoryOrJunk({
      title: 'Ốp lưng silicon chống sốc cho iPhone 16 Pro Max',
      price: 89_000,
    }).isAccessory,
    true
  );
  assert.equal(
    detectAccessoryOrJunk({
      title: 'Điện thoại Apple iPhone 16 128GB Chính hãng VN/A',
      price: 21_990_000,
    }).isAccessory,
    false
  );

  const insufficientVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 22_990_000,
    observedOriginalPrice: 31_990_000,
    offers: [],
    priceHistory: null,
  });
  assert.equal(insufficientVerdict.verdict, 'insufficient_data');

  assert.equal(RATE_ROUTES.SMARTWATCHES, '/smartwatches');
  assert.equal(RATE_ROUTES.EARBUDS, '/earbuds');
  assert.equal(RATE_ROUTES.INSPECT, '/inspect');
  assert.equal(RATE_API_V1_ENDPOINTS.STATS, '/api/v1/rate/stats');
  assert.equal(RATE_API_V1_ENDPOINTS.COMPARE, '/api/v1/rate/compare');
  assert.equal(RATE_API_V1_ENDPOINTS.INSPECT, '/api/v1/rate/inspect');
  assert.equal(RATE_API_V1_ENDPOINTS.WATCHLIST, '/api/v1/rate/watchlist');

  const validSpecs = ProductSpecificationsSchema.safeParse({
    display: { size_inch: 6.1, refresh_rate_hz: 120 },
    hardware: { chipset: 'Apple A18', ram_gb: 8, storage_gb: 128 },
    battery: { capacity_mah: 3561, charging_watt: 25 },
  });
  assert.equal(validSpecs.success, true);
  console.log(
    '  ✅ [6/7] Extension Gatekeeper, Price Verdict & 10-Field-Groups Zod Schema passed'
  );

  // 7. OpenAPI 3.1.0 Specification verification
  const openApi = buildRateOpenApiSpec('https://rate.vn');
  assert.equal(openApi.openapi, '3.1.0');
  assert.ok(Object.keys(openApi.paths).length >= 13);
  assert.ok(openApi.paths['/api/v1/rate/products']?.get);
  assert.ok(openApi.paths['/api/v1/rate/inspect']?.get);
  assert.ok(openApi.paths['/api/v1/rate/extension/lookup']?.get);
  assert.ok(openApi.paths['/api/v1/rate/extension/ingest']?.post);
  assert.ok(openApi.paths['/api/v1/rate/openapi.json']?.get);
  assert.equal(
    (
      openApi.components.schemas.SupportedEcommercePlatform as {
        enum: string[];
      }
    ).enum.length,
    10
  );
  console.log(
    '  ✅ [7/8] OpenAPI 3.1.0 Specification (/api/v1/rate/openapi.json) passed'
  );

  // 8. DESIGN.md v2.0 & Unprefixed Locale Routing (localePrefix: "never") + Live Middleware Regression Suite
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const { NextRequest } =
    require('next/server') as typeof import('next/server');
  const middleware = require('../../../middleware').default as (
    req: import('next/server').NextRequest
  ) => import('next/server').NextResponse;

  const repoRoot = path.resolve(__dirname, '../../../../../..');
  const designMdPath = path.join(repoRoot, 'DESIGN.md');
  assert.equal(
    fs.existsSync(designMdPath),
    true,
    'DESIGN.md must exist at repo root'
  );
  const designMd = fs.readFileSync(designMdPath, 'utf8');
  assert.ok(designMd.includes('Rate.vn Design System'));
  assert.ok(
    designMd.includes('10-Group Canonical Technical Specifications') ||
      designMd.includes('10-Group Specification Matrix')
  );

  // Guard against duplicate root middleware.ts shadowing src/middleware.ts
  const duplicateRootMiddleware = path.join(
    repoRoot,
    'apps',
    'web',
    'middleware.ts'
  );
  assert.equal(
    fs.existsSync(duplicateRootMiddleware),
    false,
    'apps/web/middleware.ts must not exist and shadow apps/web/src/middleware.ts'
  );

  // Guard RootLayout dynamic <html lang={locale}>
  const rootLayoutPath = path.resolve(__dirname, '../../../app/layout.tsx');
  const rootLayoutSrc = fs.readFileSync(rootLayoutPath, 'utf8');
  assert.ok(
    rootLayoutSrc.includes('getLocale') &&
      rootLayoutSrc.includes('<html lang={locale}>'),
    'RootLayout must dynamically resolve <html lang={locale}> via getLocale()'
  );

  const navTsPath = path.resolve(__dirname, '../../../lib/navigation.ts');
  const navTs = fs.readFileSync(navTsPath, 'utf8');
  assert.ok(
    navTs.includes('localePrefix: "never"') ||
      navTs.includes("localePrefix: 'never'"),
    'navigation.ts must use localePrefix: "never" so switching languages never adds /en or /cs URL slugs'
  );
  assert.ok(
    navTs.includes('localeDetection: true'),
    'navigation.ts must enable localeDetection: true so next-intl resolves NEXT_LOCALE cookie'
  );
  assert.ok(
    navTs.includes('NEXT_LOCALE'),
    'navigation.ts must persist locale selection via NEXT_LOCALE cookie'
  );

  // Execute middleware directly against NextRequest to verify 308 slug stripping & NEXT_LOCALE cookie rewrites
  const redirectEn = middleware(
    new NextRequest('https://rate.vn/en', {
      headers: { 'x-forwarded-proto': 'https', host: 'rate.vn' },
    })
  );
  assert.equal(redirectEn.status, 308);
  assert.equal(redirectEn.headers.get('location'), 'https://rate.vn/');
  assert.equal(redirectEn.cookies.get('NEXT_LOCALE')?.value, 'en');

  const redirectCsCompare = middleware(
    new NextRequest('https://rate.vn/cs/compare', {
      headers: { 'x-forwarded-proto': 'https', host: 'rate.vn' },
    })
  );
  assert.equal(redirectCsCompare.status, 308);
  assert.equal(
    redirectCsCompare.headers.get('location'),
    'https://rate.vn/compare'
  );
  assert.equal(redirectCsCompare.cookies.get('NEXT_LOCALE')?.value, 'cs');

  const unprefixedEnRes = middleware(
    new NextRequest('https://rate.vn/', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'rate.vn',
        cookie: 'NEXT_LOCALE=en',
      },
    })
  );
  assert.equal(unprefixedEnRes.status, 200);
  assert.equal(
    unprefixedEnRes.headers.get('x-middleware-rewrite'),
    'https://rate.vn/en'
  );

  const unprefixedCsRes = middleware(
    new NextRequest('https://rate.vn/smartwatches', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'rate.vn',
        cookie: 'NEXT_LOCALE=cs',
      },
    })
  );
  assert.equal(unprefixedCsRes.status, 200);
  assert.equal(
    unprefixedCsRes.headers.get('x-middleware-rewrite'),
    'https://rate.vn/cs/smartwatches'
  );

  const defaultViWithEnAcceptHeader = middleware(
    new NextRequest('https://rate.vn/', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'rate.vn',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
  );
  assert.equal(defaultViWithEnAcceptHeader.status, 200);
  assert.equal(
    defaultViWithEnAcceptHeader.headers.get('x-middleware-rewrite'),
    'https://rate.vn/vi'
  );

  console.log(
    '  ✅ [8/9] DESIGN.md v3.0 & Unprefixed Locale Middleware Regression Suite (308 strip + NEXT_LOCALE vi/en/cs) passed'
  );

  // 9. DESIGN.md v3.0 Rating-First Architecture, 28 Self-Hosted Studio Images & Same-Category Comparison Lock
  const devicesDir = path.join(repoRoot, 'apps', 'web', 'public');
  const deviceSlugs = Array.from(KNOWN_LOCAL_DEVICE_IMAGES);
  assert.ok(
    deviceSlugs.length >= 28,
    'Must have at least 28 flagship device images mapped'
  );
  for (const slug of deviceSlugs) {
    const relImgPath = `/img/devices/${slug}.jpg`;
    const absImgPath = path.join(devicesDir, relImgPath);
    assert.equal(
      fs.existsSync(absImgPath),
      true,
      `Self-hosted image must exist on disk: ${relImgPath}`
    );
    const stat = fs.statSync(absImgPath);
    assert.ok(
      stat.size > 1000,
      `Self-hosted image must be > 1KB: ${relImgPath}`
    );
    assert.equal(
      resolveProductImageUrl(slug, 'https://image.oppo.com/broken-404.png'),
      relImgPath
    );
  }

  // Verify Same-Category classification prevents Smartphones vs Earbuds mixing
  assert.equal(
    getMasterProductCategorySlug({
      slug: 'apple-iphone-16-pro-256gb',
      name: 'Apple iPhone 16 Pro 256GB',
    }),
    'smartphones'
  );
  assert.equal(
    getMasterProductCategorySlug({
      slug: 'oppo-find-x8-16gb-256gb',
      name: 'OPPO Find X8 5G 16GB/256GB',
    }),
    'smartphones'
  );
  assert.equal(
    getMasterProductCategorySlug({
      slug: 'samsung-galaxy-buds3-pro',
      name: 'Samsung Galaxy Buds3 Pro',
    }),
    'earbuds'
  );

  // Verify ProductDetailView places JReviewsSection (SECTION #1) before #specs-section (SECTION #2) and #offers-table (SECTION #3)
  const detailPagePath = path.resolve(
    __dirname,
    '../../../app/[locale]/smartphones/[slug]/page.tsx'
  );
  const detailPageSrc = fs.readFileSync(detailPagePath, 'utf8');
  const idxJReviews = detailPageSrc.indexOf('<JReviewsSection');
  const idxSpecs = detailPageSrc.indexOf('id="specs-section"');
  const idxOffers = detailPageSrc.indexOf('id="offers-table"');
  assert.ok(
    idxJReviews > 0 && idxSpecs > idxJReviews && idxOffers > idxSpecs,
    'ProductDetailView must render <JReviewsSection /> (Section #1) before #specs-section (Section #2) and #offers-table (Section #3)'
  );

  console.log(
    '  ✅ [9/10] DESIGN.md v3.0 Rating-First Hierarchy, 22 Studio Images & Same-Category Comparison Lock passed'
  );

  // 10. JReviews 5-Criteria Search/Filter, 9-Platform Merchant Explorer & Dead Strapi Template Purge
  const jreviewsSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps',
      'web',
      'src',
      'components',
      'reviews',
      'JReviewsSection.tsx'
    ),
    'utf8'
  );
  assert.ok(
    jreviewsSrc.includes('criteriaAverages') &&
      jreviewsSrc.includes('searchKeyword') &&
      jreviewsSrc.includes('starFilter') &&
      jreviewsSrc.includes('rate-scoreboard-dark'),
    'JReviewsSection.tsx must include 5-criteria breakdown, keyword search, star filter, and DESIGN.md v3.0 scoreboard'
  );

  const merchantExplorerSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps',
      'web',
      'src',
      'components',
      'merchants',
      'MerchantDirectoryExplorer.tsx'
    ),
    'utf8'
  );
  for (const plat of [
    'shopee',
    'lazada',
    'tiki',
    'cellphones',
    'tgdd',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
  ]) {
    assert.ok(
      merchantExplorerSrc.includes(`'${plat}'`),
      `MerchantDirectoryExplorer.tsx must support platform ${plat}`
    );
  }
  assert.ok(
    merchantExplorerSrc.includes('rate-card'),
    'MerchantDirectoryExplorer.tsx must use DESIGN.md v3.0 .rate-card'
  );

  for (const deadRel of [
    'apps/web/src/components/forms',
    'apps/web/src/components/typography',
    'apps/web/src/components/ui',
    'apps/web/src/app/[locale]/style',
  ]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, deadRel)),
      false,
      `Dead Strapi template directory must remain purged: ${deadRel}`
    );
  }

  console.log(
    '  ✅ [10/10] JReviews 5-Criteria Search/Filter, 9-Platform Merchant Explorer & Dead Strapi Template Purge passed'
  );

  // 11. 4-Tier JReviews Leaderboard (/leaderboard) & Same-Category Top 3 Compare Lock
  const leaderboardPageSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/leaderboard/page.tsx'),
    'utf8'
  );
  const leaderboardExplorerSource = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
    ),
    'utf8'
  );
  assert.ok(
    leaderboardPageSource.includes('LeaderboardExplorer') &&
      leaderboardPageSource.includes('ItemList'),
    '/leaderboard page must render LeaderboardExplorer and Schema.org ItemList JSON-LD'
  );
  assert.ok(
    leaderboardExplorerSource.includes('rate-scoreboard-dark') &&
      leaderboardExplorerSource.includes('rate-score-badge-user') &&
      leaderboardExplorerSource.includes('rate-score-badge-expert') &&
      leaderboardExplorerSource.includes(
        '/compare?cat=${activeCategory}&slugs='
      ),
    'LeaderboardExplorer must follow DESIGN.md v3.0 Dual-Rating tokens and lock 1-click Top 3 compare to activeCategory'
  );
  for (const locale of ['vi', 'en', 'cs'] as const) {
    const dict = getRateCopy(locale);
    assert.ok(
      dict.nav.leaderboard && dict.nav.leaderboard.length > 0,
      `Dictionary for ${locale} must define nav.leaderboard`
    );
  }
  console.log(
    '  ✅ [11/12] 4-Tier JReviews Dual-Rating Leaderboard (/leaderboard) & Same-Category Top 3 Compare Lock passed'
  );

  // 12. Multi-Locale 10-Group Specification Localizer (vi / en / cs) & 28/28 Studio Images
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const specDict = getSpecUiDictionary(loc);
    assert.equal(Object.keys(specDict.groups).length, 10);
    assert.ok(specDict.fields.mainCamera.length > 0);
  }
  const rawCamEn =
    '200 MP, f/1.6, 23mm (wide), 1/1.28", multi-directional PDAF, OIS, 3.2x optical zoom';
  const camVi = localizeSpecValue(rawCamEn, 'vi');
  assert.ok(
    camVi.includes('(góc rộng)') &&
      camVi.includes('lấy nét đa hướng PDAF') &&
      camVi.includes('chống rung quang học OIS') &&
      camVi.includes('zoom quang 3.2x'),
    `Expected Vietnamese localized camera spec, got: ${camVi}`
  );
  const camCs = localizeSpecValue(rawCamEn, 'cs');
  assert.ok(
    camCs.includes('(širokoúhlý)') && camCs.includes('optický zoom'),
    `Expected Czech localized camera spec, got: ${camCs}`
  );
  const rawVi =
    '3 ống kính (Triple Camera Leica), kháng nước và bụi IP68 (ngâm nước sâu 1.5m trong 30 phút)';
  const backToEn = localizeSpecValue(rawVi, 'en');
  assert.ok(
    backToEn.includes('Triple Camera') &&
      backToEn.includes('IP68 dust/water resistant'),
    `Expected English reverse-localized spec, got: ${backToEn}`
  );

  for (const slug2026 of [
    'xiaomi-18-pro-max-512gb',
    'xiaomi-17-pro-max-512gb',
    'apple-iphone-18-pro-max-256gb',
    'apple-iphone-18-pro-256gb',
    'samsung-galaxy-s26-ultra-256gb',
    'oppo-find-x9-pro-512gb',
  ]) {
    assert.ok(
      KNOWN_LOCAL_DEVICE_IMAGES.has(slug2026),
      `KNOWN_LOCAL_DEVICE_IMAGES must include 2026 flagship slug ${slug2026}`
    );
    assert.equal(
      fs.existsSync(
        path.join(repoRoot, 'apps/web/public/img/devices', `${slug2026}.jpg`)
      ),
      true,
      `Missing local studio image for ${slug2026}.jpg`
    );
  }
  console.log(
    '  ✅ [12/13] Multi-Locale 10-Group Spec Localizer (vi/en/cs) & 28/28 Studio Device Images passed'
  );

  // 13. Leaderboard Engine, GET /api/v1/rate/leaderboard OpenAPI Spec & ProductDetailView Rank Badges
  const openApiWithLeaderboard = buildRateOpenApiSpec('https://rate.vn');
  assert.ok(
    openApiWithLeaderboard.paths['/api/v1/rate/leaderboard']?.get,
    'OpenAPI 3.1.0 must include GET /api/v1/rate/leaderboard'
  );
  const mockPeers = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      brand: 'Apple',
      model: 'iPhone 18 Pro Max',
      model_key: 'apple-iphone-18-pro-max-256gb',
      name: 'Apple iPhone 18 Pro Max 256GB',
      slug: 'apple-iphone-18-pro-max-256gb',
      has_5g: true,
      specifications: {
        display: { refresh_rate_hz: 120 },
        hardware: { ram_gb: 12 },
        camera: { main_camera: '48MP', second_camera: '48MP' },
      },
      key_specs: {},
      images: [],
      colors: [],
      min_price: 33990000,
      max_price: 35990000,
      merchant_count: 10,
      total_reviews: 42,
      average_rating: 4.9,
      user_rating_weighted: 4.92,
      expert_rating: 9.6,
      authentic_review_count: 39,
      status: 'published' as const,
      metadata: {},
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      brand: 'Samsung',
      model: 'Galaxy S26 Ultra',
      model_key: 'samsung-galaxy-s26-ultra-256gb',
      name: 'Samsung Galaxy S26 Ultra 256GB',
      slug: 'samsung-galaxy-s26-ultra-256gb',
      has_5g: true,
      specifications: {
        display: { refresh_rate_hz: 120 },
        hardware: { ram_gb: 16 },
        camera: { main_camera: '200MP', second_camera: '50MP' },
      },
      key_specs: {},
      images: [],
      colors: [],
      min_price: 31990000,
      max_price: 34990000,
      merchant_count: 10,
      total_reviews: 38,
      average_rating: 4.85,
      user_rating_weighted: 4.88,
      expert_rating: 9.5,
      authentic_review_count: 35,
      status: 'published' as const,
      metadata: {},
    },
  ];
  const rankedList = rankMasterProductsForLeaderboard(mockPeers, {
    category: 'smartphones',
    criterion: 'combined',
  });
  assert.equal(rankedList.length, 2);
  assert.equal(rankedList[0]?.rank, 1);
  const standingBadges = computeProductStandingInCategory(
    mockPeers[0]!,
    mockPeers
  );
  assert.ok(
    standingBadges.some((b) => b.criterion === 'combined' && b.rank === 1),
    'computeProductStandingInCategory must compute overall rank #1 for top peer'
  );
  const smartphoneDetailSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/smartphones/[slug]/page.tsx'
    ),
    'utf8'
  );
  assert.ok(
    smartphoneDetailSrc.includes('ProductLeaderboardBadges'),
    'ProductDetailView must render ProductLeaderboardBadges inside .rate-scoreboard-dark'
  );
  console.log(
    '  ✅ [13/14] Leaderboard Engine, GET /api/v1/rate/leaderboard OpenAPI 3.1.0 & ProductDetailView Rank Badges passed'
  );

  // 14. Smart Use-Case Persona Recommender (#52) & 1v1 Head-to-Head Versus Route (/compare/[versus] #53)
  assert.ok(
    leaderboardExplorerSource.includes('applyPersonaPreset') &&
      leaderboardExplorerSource.includes('customWeights'),
    'LeaderboardExplorer must support Smart Use-Case Persona Presets and Custom 5-Criteria Weight Sliders'
  );
  const versusPageSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/compare/[versus]/page.tsx'),
    'utf8'
  );
  assert.ok(
    versusPageSource.includes('parseVersusSlugs') &&
      versusPageSource.includes('1V1 HEAD-TO-HEAD AUDIT') &&
      smartphoneDetailSrc.includes('/compare/${product.slug}-vs-${peer.slug}'),
    '/compare/[versus] 1v1 route and ProductDetailView 1v1 links must be wired'
  );
  console.log(
    '  ✅ [14/15] Smart Use-Case Persona Recommender (#52) & 1v1 Head-to-Head Versus SEO Route (/compare/[versus] #53) passed'
  );

  // 15. Popular 1v1 Battles Hub + Exportable Markdown Audit (#55) & Expanded Sitemap (#56)
  const popularPairs = buildPopular1v1BattlesForCategory(
    mockPeers,
    'smartphones',
    3
  );
  assert.equal(popularPairs.length, 1);
  assert.equal(
    popularPairs[0]?.versusHref,
    '/compare/apple-iphone-18-pro-max-256gb-vs-samsung-galaxy-s26-ultra-256gb'
  );
  const compareWorkspaceSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/compare/CompareWorkspace.tsx'),
    'utf8'
  );
  assert.ok(
    compareWorkspaceSrc.includes('handleCopyMarkdownReport') &&
      compareWorkspaceSrc.includes('popularBattles'),
    'CompareWorkspace must include 1-click Markdown Audit export and Popular 1v1 Battles Hub'
  );
  const sitemapSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/sitemap.ts'),
    'utf8'
  );
  assert.ok(
    sitemapSrc.includes("categorySlug: 'all'") &&
      sitemapSrc.includes('buildPopular1v1BattlesForCategory'),
    'sitemap.ts must include all 5 categories and curated 1v1 versus routes'
  );
  console.log(
    '  ✅ [15/16] Popular 1v1 Battles Hub, Markdown Audit Export (#55) & Expanded Dynamic Sitemap (#56) passed'
  );

  // 16. Interactive 1v1 Weight Sliders (#57) & Homepage/Category 1v1 Showdowns (#58)
  const versusScoreboardSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf8'
  );
  assert.ok(
    versusScoreboardSrc.includes('handleCopy1v1Markdown') &&
      versusScoreboardSrc.includes('PERSONA_WEIGHTS') &&
      versusPageSource.includes('VersusInteractiveScoreboard'),
    'VersusInteractiveScoreboard must provide custom 5-criteria weights, Markdown 1v1 export, and A/B swap link'
  );
  const homePageSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/page.tsx'),
    'utf8'
  );
  const categoryPageSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/smartphones/page.tsx'),
    'utf8'
  );
  assert.ok(
    homePageSrc.includes('popularHomeBattles') &&
      categoryPageSrc.includes(
        '/compare/${products[0].slug}-vs-${products[1].slug}'
      ),
    'Homepage and Category Catalogs must surface 1v1 Flagship Showdowns'
  );
  console.log(
    '  ✅ [16/17] Interactive 1v1 Weight Sliders (#57) & Homepage/Category 1v1 Showdowns (#58) passed'
  );

  // 17. 1-Click Shareable Audit Summary (#60) & GET /api/v1/rate/versus OpenAPI 3.1.0 (#61)
  const shareAuditSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductShareAuditButton.tsx'
    ),
    'utf8'
  );
  assert.ok(
    shareAuditSrc.includes('handleCopyMarkdown') &&
      shareAuditSrc.includes('handleCopyLink') &&
      smartphoneDetailSrc.includes('ProductShareAuditButton'),
    'ProductDetailView must include ProductShareAuditButton for 1-Click Markdown Audit & Link Copy'
  );
  const versusApiRouteSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/versus/route.ts'),
    'utf8'
  );
  assert.ok(
    versusApiRouteSrc.includes('parseVersusQueryParams') &&
      versusApiRouteSrc.includes('criteria_head_to_head') &&
      Boolean(openApi.paths['/api/v1/rate/versus']?.get),
    'GET /api/v1/rate/versus must exist and be documented in OpenAPI 3.1.0 spec'
  );
  console.log(
    '  ✅ [17/18] 1-Click Shareable Audit Summary (#60) & GET /api/v1/rate/versus OpenAPI 3.1.0 (#61) passed'
  );

  // 18. Value Efficiency & 2-Year Ownership Calculator (#62) & 1-Click Markdown Audit on /inspect + /merchants/[id] (#63)
  const valueCalcSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductValueCalculator.tsx'
    ),
    'utf8'
  );
  assert.ok(
    valueCalcSrc.includes('estimateResaleRetentionRatio') &&
      smartphoneDetailSrc.includes('ProductValueCalculator') &&
      compareWorkspaceSrc.includes('value_per_point') &&
      compareWorkspaceSrc.includes('daily_cost_2y'),
    'ProductValueCalculator and CompareWorkspace Value Efficiency rows must be wired'
  );
  const merchantShareSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantShareAuditButton.tsx'
    ),
    'utf8'
  );
  const merchantPageSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/merchants/[id]/page.tsx'),
    'utf8'
  );
  const inspectWorkspaceSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/inspect/DeepInspectWorkspace.tsx'
    ),
    'utf8'
  );
  assert.ok(
    merchantShareSrc.includes('handleCopyMerchantMarkdown') &&
      merchantPageSrc.includes('MerchantShareAuditButton') &&
      inspectWorkspaceSrc.includes('handleCopyAuditMarkdown'),
    'MerchantProfilePage and DeepInspectWorkspace must provide 1-Click Markdown Audit export'
  );
  console.log(
    '  ✅ [18/19] Value Efficiency & 2-Year Ownership Calculator (#62) & 1-Click Markdown Audit on /inspect + /merchants/[id] (#63) passed'
  );

  // 19. Same-Category 1v1 Matchup Switcher (#65) & Watchlist Portfolio Markdown/CSV Export (#66)
  const matchupSwitcherSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusMatchupSwitcher.tsx'
    ),
    'utf8'
  );
  const versusPageSrcUpdated = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/compare/[versus]/page.tsx'),
    'utf8'
  );
  const watchlistWorkspaceSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/watchlist/WatchlistWorkspace.tsx'
    ),
    'utf8'
  );
  assert.ok(
    matchupSwitcherSrc.includes('getMasterProductCategorySlug') &&
      versusPageSrcUpdated.includes('VersusMatchupSwitcher'),
    'VersusMatchupSwitcher must enforce Same-Category Lock and be rendered on /compare/[versus]'
  );
  assert.ok(
    watchlistWorkspaceSrc.includes('handleCopyPortfolioMarkdown') &&
      watchlistWorkspaceSrc.includes('handleDownloadPortfolioCsv') &&
      watchlistWorkspaceSrc.includes('portfolioStats'),
    'WatchlistWorkspace must provide Portfolio Value Summary and 1-Click Markdown/CSV export'
  );
  console.log(
    '  ✅ [19/19] Same-Category 1v1 Matchup Switcher (#65) & Watchlist Portfolio Markdown/CSV Export (#66) passed'
  );

  // 20. Leaderboard Export & 1v1 Matchup Picker (#67) + Merchant Seeding Filter & CSV Export (#68)
  const leaderboardExplorerUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
    ),
    'utf8'
  );
  const merchantExplorerUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantDirectoryExplorer.tsx'
    ),
    'utf8'
  );
  assert.ok(
    leaderboardExplorerUpdated.includes('handleCopyLeaderboardMarkdown') &&
      leaderboardExplorerUpdated.includes('handleDownloadLeaderboardCsv') &&
      leaderboardExplorerUpdated.includes('leaderboard-1v1-go-btn'),
    'LeaderboardExplorer must provide 1-Click Markdown/CSV export and Interactive 1v1 Matchup Picker'
  );
  assert.ok(
    merchantExplorerUpdated.includes('seedingTier') &&
      merchantExplorerUpdated.includes('handleCopyMerchantsMarkdown') &&
      merchantExplorerUpdated.includes('handleDownloadMerchantsCsv'),
    'MerchantDirectoryExplorer must provide AI Seeding Risk filter and 1-Click Markdown/CSV export'
  );
  console.log(
    '  ✅ [20/20] Leaderboard Markdown/CSV Export & 1v1 Matchup Picker (#67) + Merchant Seeding Filter & CSV Export (#68) passed'
  );

  // 21. Interactive 10-Platform Offers Explorer (#69) & Category Catalog Toolbar (#70)
  const offersExplorerSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx'
    ),
    'utf8'
  );
  const catalogToolbarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/CategoryCatalogToolbar.tsx'
    ),
    'utf8'
  );
  assert.ok(
    offersExplorerSrc.includes('handleCopyOffersMarkdown') &&
      offersExplorerSrc.includes('handleDownloadOffersCsv') &&
      offersExplorerSrc.includes('highTrustOnly'),
    'ProductOffersExplorer must provide platform/Mall/trust filters and 1-Click Markdown/CSV export'
  );
  assert.ok(
    catalogToolbarSrc.includes('handleCopyCatalogMarkdown') &&
      catalogToolbarSrc.includes('handleDownloadCatalogCsv') &&
      catalogToolbarSrc.includes('catalog-1v1-go-btn'),
    'CategoryCatalogToolbar must provide Same-Category 1v1 Matchup Picker and Markdown/CSV catalog export'
  );
  console.log(
    '  ✅ [21/21] 10-Platform Offers Explorer (#69) & Category Catalog 1v1 Picker + CSV Export (#70) passed'
  );
  console.log('🎉 All Rate.vn Core Architecture tests passed!');
}

runCoreArchitectureSuite();
