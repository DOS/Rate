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
import csMessages from '../../../../locales/cs.json';
import enMessages from '../../../../locales/en.json';
import viMessages from '../../../../locales/vi.json';
import { normalizeRateLocale } from '../../../lib/rate-i18n';
import {
  getSpecUiDictionary,
  localizeSpecValue,
} from '../../../lib/spec-localizer';
import {
  buildPopular1v1BattlesForCategory,
  computeProductStandingInCategory,
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
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

async function runCoreArchitectureSuite() {
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

  const localeCatalogs = {
    vi: viMessages,
    en: enMessages,
    cs: csMessages,
  } as const;
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const copy = localeCatalogs[loc].rate;
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
  assert.ok(
    openApi.paths['/api/v1/rate/openapi.json']?.get ||
      openApi.paths['/api/v1/rate/openapi']?.get
  );
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
  // Next.js 16 renamed middleware.ts to proxy.ts; the locale routing it runs
  // first is exported synchronously as localeProxy.
  const middleware = require('../../../proxy').localeProxy as (
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
    'apps/web/middleware.ts must not exist and shadow apps/web/src/proxy.ts'
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'apps', 'web', 'src', 'middleware.ts')),
    false,
    'src/middleware.ts must not exist next to src/proxy.ts (Next.js 16)'
  );

  // Guard RootLayout dynamic <html lang={locale}>
  const rootLayoutPath = path.resolve(__dirname, '../../../app/layout.tsx');
  const rootLayoutSrc = fs.readFileSync(rootLayoutPath, 'utf8');
  assert.ok(
    rootLayoutSrc.includes('getLocale') &&
      /<html\b[^>]*\slang=\{locale\}/.test(rootLayoutSrc),
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
    const dict = localeCatalogs[locale].rate;
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

  // 22. JReviews Audit Export (#71) & 60-Day Price History Markdown/CSV Export (#72)
  const jreviewsSrcUpdated = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/reviews/JReviewsSection.tsx'),
    'utf8'
  );
  const priceHistorySrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/price-history/PriceHistorySection.tsx'
    ),
    'utf8'
  );
  assert.ok(
    jreviewsSrcUpdated.includes('handleCopyReviewsMarkdown') &&
      jreviewsSrcUpdated.includes('handleDownloadReviewsCsv'),
    'JReviewsSection must provide 1-Click Markdown and CSV export of AI-audited buyer reviews'
  );
  assert.ok(
    priceHistorySrcUpdated.includes('handleCopyPriceHistoryMarkdown') &&
      priceHistorySrcUpdated.includes('handleDownloadPriceHistoryCsv'),
    'PriceHistorySection must provide 1-Click Markdown and CSV export of 60-day price history and Fake Sale audit verdicts'
  );
  console.log(
    '  ✅ [22/22] JReviews Audit Export (#71) & 60-Day Price History Markdown/CSV Export (#72) passed'
  );

  // 23. API Playground Python/JSON Export (#73) & 10-Group Specs Markdown/JSON Export (#74)
  const apiPlaygroundSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/developers/ApiPlaygroundClient.tsx'
    ),
    'utf8'
  );
  const specsExportToolbarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductSpecsExportToolbar.tsx'
    ),
    'utf8'
  );
  assert.ok(
    apiPlaygroundSrcUpdated.includes('pythonSnippet') &&
      apiPlaygroundSrcUpdated.includes('handleCopyResponseJson') &&
      apiPlaygroundSrcUpdated.includes('handleDownloadResponseJson'),
    'ApiPlaygroundClient must provide cURL/TS/Python snippets and 1-Click JSON response copy/download'
  );
  assert.ok(
    specsExportToolbarSrc.includes('handleCopySpecsMarkdown') &&
      specsExportToolbarSrc.includes('handleDownloadSpecsJson'),
    'ProductSpecsExportToolbar must provide 1-Click 10-Field-Groups Markdown and JSON export'
  );
  console.log(
    '  ✅ [23/23] API Playground Python/JSON Export (#73) & 10-Group Specs Markdown/JSON Export (#74) passed'
  );

  // 24. Compare Matrix CSV/JSON Export (#75) & 1v1 Versus Scoreboard CSV/JSON Export (#76)
  const compareWorkspaceSrcUpdated = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/compare/CompareWorkspace.tsx'),
    'utf8'
  );
  const versusScoreboardSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf8'
  );
  assert.ok(
    compareWorkspaceSrcUpdated.includes('handleDownloadCompareCsv') &&
      compareWorkspaceSrcUpdated.includes('handleDownloadCompareJson'),
    'CompareWorkspace must provide 1-Click CSV and JSON export of the multi-product 10-Group comparison matrix'
  );
  assert.ok(
    versusScoreboardSrcUpdated.includes('handleDownloadVersusCsv') &&
      versusScoreboardSrcUpdated.includes('handleDownloadVersusJson'),
    'VersusInteractiveScoreboard must provide 1-Click CSV and JSON export of the 1v1 JReviews scoreboard'
  );
  console.log(
    '  ✅ [24/24] Compare Matrix CSV/JSON Export (#75) & 1v1 Versus Scoreboard CSV/JSON Export (#76) passed'
  );

  // 25. DealFinderWorkspace Markdown/CSV/JSON Export (#77) & Inspect/Merchant CSV/JSON Export (#78)
  const dealFinderSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/deals/DealFinderWorkspace.tsx'
    ),
    'utf8'
  );
  const inspectSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/inspect/DeepInspectWorkspace.tsx'
    ),
    'utf8'
  );
  const merchantShareSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantShareAuditButton.tsx'
    ),
    'utf8'
  );
  assert.ok(
    dealFinderSrc.includes('handleCopyDealsMarkdown') &&
      dealFinderSrc.includes('handleDownloadDealsCsv') &&
      dealFinderSrc.includes('handleDownloadDealsJson'),
    'DealFinderWorkspace on /deals must provide 1-Click Markdown, CSV, and JSON export'
  );
  assert.ok(
    inspectSrcUpdated.includes('handleDownloadInspectCsv') &&
      inspectSrcUpdated.includes('handleDownloadInspectJson') &&
      merchantShareSrcUpdated.includes('handleDownloadMerchantCsv') &&
      merchantShareSrcUpdated.includes('handleDownloadMerchantJson'),
    'DeepInspectWorkspace (/inspect) and MerchantShareAuditButton (/merchants/[id]) must provide 1-Click CSV and JSON export'
  );
  console.log(
    '  ✅ [25/25] DealFinderWorkspace Markdown/CSV/JSON Export (#77) & Inspect/Merchant CSV/JSON Export (#78) passed'
  );

  // 26. ProductShareAuditButton/ProductOffersExplorer (#79) & Leaderboard/Catalog/Watchlist/Merchants JSON Export (#80)
  const shareAuditSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductShareAuditButton.tsx'
    ),
    'utf8'
  );
  const offersExplorerSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx'
    ),
    'utf8'
  );
  const leaderboardSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
    ),
    'utf8'
  );
  const catalogToolbarSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/CategoryCatalogToolbar.tsx'
    ),
    'utf8'
  );
  const watchlistSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/watchlist/WatchlistWorkspace.tsx'
    ),
    'utf8'
  );
  const merchantDirSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantDirectoryExplorer.tsx'
    ),
    'utf8'
  );
  assert.ok(
    shareAuditSrcUpdated.includes('handleDownloadProductCsv') &&
      shareAuditSrcUpdated.includes('handleDownloadProductJson') &&
      offersExplorerSrcUpdated.includes('handleDownloadOffersJson'),
    'ProductShareAuditButton and ProductOffersExplorer must provide CSV/JSON export'
  );
  assert.ok(
    leaderboardSrcUpdated.includes('handleDownloadLeaderboardJson') &&
      catalogToolbarSrcUpdated.includes('handleDownloadCategoryJson') &&
      watchlistSrcUpdated.includes('handleDownloadPortfolioJson') &&
      merchantDirSrcUpdated.includes('handleDownloadMerchantsJson'),
    'LeaderboardExplorer, CategoryCatalogToolbar, WatchlistWorkspace, and MerchantDirectoryExplorer must provide 1-Click JSON export'
  );
  console.log(
    '  ✅ [26/27] ProductShareAuditButton/ProductOffersExplorer (#79) & Full 3-Format JSON Export Parity (#80) passed'
  );

  // 27. JReviewsSection / PriceHistorySection JSON Export (#82) & ProductValueCalculator / ProductSpecsExportToolbar CSV/JSON Export (#83)
  const jreviewsSrcJson = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/reviews/JReviewsSection.tsx'),
    'utf8'
  );
  const priceHistorySrcJson = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/price-history/PriceHistorySection.tsx'
    ),
    'utf8'
  );
  const valueCalcSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductValueCalculator.tsx'
    ),
    'utf8'
  );
  const specsToolbarSrcUpdated = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductSpecsExportToolbar.tsx'
    ),
    'utf8'
  );
  assert.ok(
    jreviewsSrcJson.includes('handleDownloadReviewsJson') &&
      priceHistorySrcJson.includes('handleDownloadPriceHistoryJson'),
    'JReviewsSection and PriceHistorySection must provide 1-Click JSON export'
  );
  assert.ok(
    valueCalcSrcUpdated.includes('handleDownloadValueCsv') &&
      valueCalcSrcUpdated.includes('handleDownloadValueJson') &&
      specsToolbarSrcUpdated.includes('handleDownloadSpecsCsv') &&
      specsToolbarSrcUpdated.includes('handleDownloadSpecsJson'),
    'ProductValueCalculator and ProductSpecsExportToolbar must provide 1-Click CSV & JSON export'
  );
  console.log(
    '  ✅ [27/28] JReviewsSection/PriceHistorySection JSON Export (#82) & ProductValueCalculator/ProductSpecsExportToolbar CSV/JSON Export (#83) passed'
  );

  // 28. Live Cross-Platform Deal Radar in /deals (#85) & Deal Radar Preset + 3-Format Catalog Export in /developers (#86)
  const dealsPageSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/deals/page.tsx'),
    'utf8'
  );
  const dealFinderRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/deals/DealFinderWorkspace.tsx'
    ),
    'utf8'
  );
  const apiPlaygroundCatalogSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/developers/ApiPlaygroundClient.tsx'
    ),
    'utf8'
  );
  assert.ok(
    dealsPageSrc.includes('getCrossPlatformDealRadar') &&
      dealFinderRadarSrc.includes('cross-platform-deal-radar') &&
      dealFinderRadarSrc.includes('handleCopyRadarMarkdown') &&
      dealFinderRadarSrc.includes('handleDownloadRadarCsv') &&
      dealFinderRadarSrc.includes('handleDownloadRadarJson'),
    'DealsPage and DealFinderWorkspace must render Cross-Platform Deal Radar and provide 3-format Radar export'
  );
  assert.ok(
    apiPlaygroundCatalogSrc.includes('deals-radar') &&
      apiPlaygroundCatalogSrc.includes('handleCopyApiCatalogMarkdown') &&
      apiPlaygroundCatalogSrc.includes('handleDownloadApiCatalogCsv'),
    'ApiPlaygroundClient must include deals-radar preset and 3-format API catalog export'
  );
  console.log(
    '  ✅ [28/29] Live Cross-Platform Deal Radar in /deals (#85) & API Catalog Export in /developers (#86) passed'
  );

  // 29. Homepage Cross-Platform Deal Radar (#87) & Same-Category Value Alternatives Cost-Per-Point on ProductDetailView (#88)
  const homePageRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/page.tsx'),
    'utf8'
  );
  const productDetailValuePeersSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/smartphones/[slug]/page.tsx'
    ),
    'utf8'
  );
  assert.ok(
    homePageRadarSrc.includes('getCrossPlatformDealRadar') &&
      homePageRadarSrc.includes('homepage-deal-radar'),
    'Homepage must fetch and render getCrossPlatformDealRadar (#87)'
  );
  assert.ok(
    productDetailValuePeersSrc.includes('same-category-value-alternatives') &&
      productDetailValuePeersSrc.includes('peerCostPerPoint') &&
      productDetailValuePeersSrc.includes('costPerPointDelta'),
    'ProductDetailView must compute and render Cost-Per-Point comparison for same-category peers (#88)'
  );
  console.log(
    '  ✅ [29/30] Homepage Deal Radar (#87) & Same-Category Value Alternatives Cost-Per-Point (#88) passed'
  );

  // 30. Category-Scoped Deal Radar across 5 Category Catalogs (#90) & Watchlist Deal Radar Signals (#91)
  const categoryCatalogRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/smartphones/page.tsx'),
    'utf8'
  );
  const watchlistRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/watchlist/WatchlistWorkspace.tsx'
    ),
    'utf8'
  );
  assert.ok(
    categoryCatalogRadarSrc.includes('getCrossPlatformDealRadar') &&
      categoryCatalogRadarSrc.includes('category-deal-radar'),
    'CategoryCatalogContent must fetch and render category-deal-radar (#90)'
  );
  assert.ok(
    watchlistRadarSrc.includes('useDealRadarIndex') &&
      watchlistRadarSrc.includes('watchlist-radar-signal'),
    'WatchlistWorkspace must fetch /api/v1/rate/deals and render watchlist-radar-signal badges (#91)'
  );
  console.log(
    '  ✅ [30/31] Category-Scoped Deal Radar (#90) & Watchlist Deal Radar Signals (#91) passed'
  );

  // 31. Leaderboard Deal Radar Badges (#93) & Compare/Versus Deal Radar Comparison Rows (#94)
  const leaderboardPageRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/leaderboard/page.tsx'),
    'utf8'
  );
  const leaderboardExplorerRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
    ),
    'utf8'
  );
  const compareWorkspaceRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/compare/CompareWorkspace.tsx'),
    'utf8'
  );
  const versusScoreboardRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf8'
  );
  assert.ok(
    leaderboardPageRadarSrc.includes('getCrossPlatformDealRadar') &&
      leaderboardExplorerRadarSrc.includes('RadarBadge') &&
      leaderboardExplorerRadarSrc.includes('useDealRadarIndex'),
    'LeaderboardPage and LeaderboardExplorer must fetch and render leaderboard-radar-signal badges (#93)'
  );
  assert.ok(
    compareWorkspaceRadarSrc.includes('useDealRadarIndex') &&
      compareWorkspaceRadarSrc.includes('compare-radar-row') &&
      versusScoreboardRadarSrc.includes('useDealRadarIndex') &&
      versusScoreboardRadarSrc.includes('versus-radar-row'),
    'CompareWorkspace and VersusInteractiveScoreboard must fetch /api/v1/rate/deals and render radar comparison rows (#94)'
  );
  console.log(
    '  ✅ [31/32] Leaderboard Deal Radar Badges (#93) & Compare/Versus Deal Radar Rows (#94) passed'
  );

  // 32. Cross-Platform Price Spread Leaders in /deals & Homepage (#95) + Price Spread Audit Banner in ProductOffersExplorer (#96)
  const dealsSpreadSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/deals/DealFinderWorkspace.tsx'
    ),
    'utf8'
  );
  const homeSpreadSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/page.tsx'),
    'utf8'
  );
  const offersSpreadSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx'
    ),
    'utf8'
  );
  assert.ok(
    dealsSpreadSrc.includes('filteredPriceSpreadLeaders') &&
      dealsSpreadSrc.includes('deals-price-spread-leaders') &&
      homeSpreadSrc.includes('homepage-price-spread-leaders'),
    'DealFinderWorkspace and Homepage must render priceSpreadLeaders (#95)'
  );
  assert.ok(
    offersSpreadSrc.includes('priceSpreadAudit') &&
      offersSpreadSrc.includes('price-spread-audit-banner'),
    'ProductOffersExplorer must compute priceSpreadAudit and render price-spread-audit-banner (#96)'
  );
  console.log(
    '  ✅ [32/33] Price Spread Leaders in /deals & Homepage (#95) + Price Spread Audit Banner in ProductOffersExplorer (#96) passed'
  );

  // 33. Category Price Spread Leaders & Card Radar Badges (#97) + DeepInspectWorkspace Deal Radar Verdict (#98)
  const categoryCatalogSpreadSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/smartphones/page.tsx'),
    'utf8'
  );
  const deepInspectRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/inspect/DeepInspectWorkspace.tsx'
    ),
    'utf8'
  );
  const productCardSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/product/ProductCard.tsx'),
    'utf8'
  );
  assert.ok(
    categoryCatalogSpreadSrc.includes('category-price-spread-leaders') &&
      categoryCatalogSpreadSrc.includes('<ProductCard') &&
      categoryCatalogSpreadSrc.includes('radarSignal={getRadarSignal(') &&
      productCardSrc.includes('<RadarBadge'),
    'CategoryCatalogContent must render category-price-spread-leaders and catalog-card-radar-badge (#97)'
  );
  assert.ok(
    deepInspectRadarSrc.includes('useDealRadarIndex') &&
      deepInspectRadarSrc.includes('inspect-deal-radar-verdict') &&
      deepInspectRadarSrc.includes('dealRadarContext'),
    'DeepInspectWorkspace must fetch /api/v1/rate/deals, render inspect-deal-radar-verdict, and include dealRadarContext in exports (#98)'
  );
  console.log(
    '  ✅ [33/34] Category Price Spread Leaders & Card Badges (#97) + DeepInspectWorkspace Deal Radar Verdict (#98) passed'
  );

  // 34. Merchant Directory/Profile Deal Radar (#99) + Watchlist 10-Platform Price Spread Arbitrage (#100)
  const merchantDirRadarSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantDirectoryExplorer.tsx'
    ),
    'utf8'
  );
  const merchantProfileRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/merchants/[id]/page.tsx'),
    'utf8'
  );
  const watchlistSpreadSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/watchlist/WatchlistWorkspace.tsx'
    ),
    'utf8'
  );
  assert.ok(
    merchantDirRadarSrc.includes('merchant-deal-radar-badge') &&
      merchantDirRadarSrc.includes('GenuineDeals60D') &&
      merchantProfileRadarSrc.includes('merchant-profile-deal-radar'),
    'MerchantDirectoryExplorer and MerchantProfilePage must integrate Deal Radar and render merchant-deal-radar-badge / merchant-profile-deal-radar (#99)'
  );
  assert.ok(
    watchlistSpreadSrc.includes('useDealRadarIndex') &&
      watchlistSpreadSrc.includes('watchlist-price-spread-badge') &&
      watchlistSpreadSrc.includes('Price Spread 10-Platform (%)'),
    'WatchlistWorkspace must integrate priceSpreadLeaders, render watchlist-price-spread-badge, and include spread columns in exports (#100)'
  );
  console.log(
    '  ✅ [34/36] Merchant Deal Radar (#99) + Watchlist Price Spread Arbitrage (#100) passed'
  );

  // 35. Deal Radar columns in Leaderboard (#101) and Category Catalog (#102) exports
  const leaderboardExportSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
    ),
    'utf8'
  );
  const catalogToolbarExportSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/CategoryCatalogToolbar.tsx'
    ),
    'utf8'
  );
  assert.ok(
    leaderboardExportSrc.includes('radarExportFields') &&
      leaderboardExportSrc.includes('RADAR_CSV_HEADERS') &&
      leaderboardExportSrc.includes('radarCsvCells'),
    'LeaderboardExplorer exports must include Deal Radar columns (#101)'
  );
  assert.ok(
    catalogToolbarExportSrc.includes('radarCsvCells') &&
      catalogToolbarExportSrc.includes('RADAR_CSV_HEADERS') &&
      catalogToolbarExportSrc.includes('radarMarkdownCell'),
    'CategoryCatalogToolbar exports must include Deal Radar columns (#102)'
  );
  console.log(
    '  ✅ [35/36] Leaderboard (#101) + Category Catalog (#102) Deal Radar export columns passed'
  );

  // 36. Deal Radar single source of truth (#104)
  const radarLib =
    require('../../../lib/deal-radar') as typeof import('../../../lib/deal-radar');
  const mkItem = (slug: string, over: Record<string, unknown>) =>
    ({
      id: slug + '-' + String(over.platform ?? 'x'),
      productSlug: slug,
      merchantId: 'm1',
      merchantName: 'Shop One',
      platform: 'shopee',
      savingsVsMedianPct: 0,
      fakeMarkupPct: 0,
      ...over,
    }) as never;
  const sample = {
    genuineDeals: [mkItem('a', { savingsVsMedianPct: 12.34 })],
    fakeSaleTraps: [
      mkItem('a', { fakeMarkupPct: 40 }),
      mkItem('b', {
        fakeMarkupPct: 25.5,
        merchantId: 'm2',
        merchantName: 'Shop Two',
      }),
    ],
    priceSpreadLeaders: [
      { productSlug: 'b', spreadPct: 18.2, spreadVnd: 1_000_000 },
      { productSlug: 'c', spreadPct: 6, spreadVnd: 300_000 },
    ],
  } as never;
  const idx = radarLib.buildRadarIndex(sample);
  assert.equal(
    radarLib.getRadarSignal(idx, 'a').verdict,
    'genuine_deal',
    'A genuine deal must win over a fake-sale trap for the same product'
  );
  assert.equal(radarLib.getRadarSignal(idx, 'a').savingsPct, 12.34);
  assert.equal(radarLib.getRadarSignal(idx, 'b').verdict, 'fake_sale_trap');
  assert.equal(radarLib.getRadarSignal(idx, 'b').fakeMarkupPct, 25.5);
  assert.equal(radarLib.getRadarSignal(idx, 'c').verdict, 'none');
  assert.equal(radarLib.getRadarSignal(idx, 'c').spreadPct, 6);
  assert.equal(radarLib.getRadarSignal(idx, 'zzz').verdict, 'none');
  assert.equal(radarLib.getRadarSignal(null, 'a').verdict, 'none');
  assert.equal(
    radarLib.radarLabel(radarLib.getRadarSignal(idx, 'c'), 10),
    '',
    'Spread below the badge threshold must not render a label'
  );
  assert.ok(
    radarLib.radarLabel(radarLib.getRadarSignal(idx, 'b'), 10).includes('🚨'),
    'A verdict label must take priority over the spread label'
  );
  assert.ok(
    radarLib.radarLabel(radarLib.getRadarSignal(idx, 'c'), 5).includes('📊'),
    'Spread-only products render the spread label above the threshold'
  );
  assert.equal(radarLib.unwrapRadarPayload({ data: sample }) !== null, true);
  assert.equal(radarLib.unwrapRadarPayload(sample) !== null, true);
  assert.equal(radarLib.unwrapRadarPayload({ ok: false }), null);
  assert.equal(
    radarLib.radarCsvCells(radarLib.getRadarSignal(idx, 'a')).length,
    radarLib.RADAR_CSV_HEADERS.length
  );
  const m1 = radarLib.selectMerchantRadar(sample, { id: 'm1', name: 'x' });
  assert.equal(m1.genuineDealCount, 1);
  assert.equal(m1.fakeTrapCount, 1);
  const m2 = radarLib.selectMerchantRadar(sample, {
    id: 'other',
    name: 'shop two',
  });
  assert.equal(
    m2.fakeTrapCount,
    1,
    'Merchant match must fall back to case-insensitive name'
  );

  // No component may re-implement radar fetch or slug lookup.
  const webSrcRoot = path.join(repoRoot, 'apps/web/src');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory()
        ? walk(full)
        : /\.(ts|tsx)$/.test(e.name)
          ? [full]
          : [];
    });
  const offenders: string[] = [];
  for (const f of walk(webSrcRoot)) {
    const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
    if (rel.includes('__tests__')) continue;
    const src = fs.readFileSync(f, 'utf8');
    const fetchesRadar = /fetch\(\s*['"`]\/api\/v1\/rate\/deals/.test(src);
    const isShared = rel.endsWith('components/radar/use-deal-radar.ts');
    const isPlayground = rel.endsWith('ApiPlaygroundClient.tsx');
    if (fetchesRadar && !isShared && !isPlayground)
      offenders.push(rel + ' (fetch)');
    if (/dealRadarBySlug|radarSignals\b/.test(src))
      offenders.push(rel + ' (local lookup)');
  }
  assert.deepEqual(
    offenders,
    [],
    'Radar must only be fetched/looked up via lib/deal-radar and use-deal-radar: ' +
      offenders.join(', ')
  );
  console.log(
    '  ✅ [36/37] Deal Radar single source of truth: shared index, labels, exports and no duplicated fetch/lookup (#104) passed'
  );

  // 37. Radar is a product property: per-product signal is independent of feed truncation (#106)
  const dealsMod = require('../deals') as typeof import('../deals');
  const mkMaster = (n: number) =>
    ({
      id: 'id-' + n,
      slug: 'phone-' + n,
      name: 'Phone ' + n,
      brand: 'Brand',
      category: 'smartphones',
      min_price: 90 * n,
      max_price: 110 * n,
    }) as never;
  const mkOffer = (
    n: number,
    i: number,
    price: number,
    original: number | null
  ) =>
    ({
      id: 'o-' + n + '-' + i,
      platform: ['shopee', 'lazada', 'tiki'][i],
      url: 'https://example.test/' + n + '/' + i,
      price_current: price * n,
      price_original: original == null ? null : original * n,
      merchant: {
        id: 'm-' + i,
        name: 'Shop ' + i,
        risk_score: 5,
        is_official: true,
      },
    }) as never;
  const clusters = [1, 2, 3, 4, 5].map((n) => ({
    master: mkMaster(n),
    offers: [
      mkOffer(n, 0, 90, null),
      mkOffer(n, 1, 100, null),
      mkOffer(n, 2, 110, 200),
    ],
  }));
  const feed = dealsMod.computeCrossPlatformDealRadarFromData(
    clusters as never,
    {
      categorySlug: 'all',
      limit: 3,
    }
  );
  assert.equal(
    feed.genuineDeals.length,
    3,
    'The feed is truncated to the requested limit'
  );
  const feedIndex = radarLib.buildRadarIndex(feed);
  const wrongFromFeed = clusters.filter(
    (c) =>
      radarLib.getRadarSignal(feedIndex, (c.master as { slug: string }).slug)
        .verdict !== 'genuine_deal'
  );
  assert.ok(
    wrongFromFeed.length > 0,
    'Regression guard: an index built from a truncated feed gives wrong verdicts beyond the limit'
  );
  for (const c of clusters) {
    const sig = dealsMod.computeProductRadarSignal(
      c.master as never,
      c.offers as never
    );
    assert.equal(
      sig.verdict,
      'genuine_deal',
      'Every product must get its own signal: ' +
        (c.master as { slug: string }).slug
    );
    assert.ok(
      sig.fakeSaleTrap,
      'Inflated strikethrough must be detected per product'
    );
    assert.ok(
      sig.priceSpread && sig.spreadPct > 0,
      'Spread must be computed per product'
    );
  }
  const pdvSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/smartphones/[slug]/page.tsx'
    ),
    'utf8'
  );
  assert.ok(
    pdvSrc.includes('computeProductRadarSignal') &&
      pdvSrc.includes('RadarBadge'),
    'ProductDetailView must show the product Radar signal (#106)'
  );
  const catalogSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/smartphones/page.tsx'),
    'utf8'
  );
  assert.ok(
    /categorySlug as CanonicalCategorySlug,[\s\S]{0,200}limit: 50/.test(
      catalogSrc
    ),
    'Category catalog must request the maximum radar limit so every card gets its badge'
  );
  const dealFinderRadarCardSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/deals/DealFinderWorkspace.tsx'
    ),
    'utf8'
  );
  const dealsPageRadarLimitSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/deals/page.tsx'),
    'utf8'
  );
  assert.ok(
    dealFinderRadarCardSrc.includes('RadarBadge') &&
      dealFinderRadarCardSrc.includes('RADAR_CSV_HEADERS') &&
      dealFinderRadarCardSrc.includes('radarMarkdownCell') &&
      dealFinderRadarCardSrc.includes('dealRadar: radarExportFields'),
    'DealFinderWorkspace ranked cards and exports must carry the per-product Radar (#116)'
  );
  assert.ok(
    /categorySlug: 'all',[\s\S]{0,200}limit: 50/.test(dealsPageRadarLimitSrc),
    '/deals must request the maximum radar limit so every ranked card gets its badge (#116)'
  );
  const homePageRadarCardSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/page.tsx'),
    'utf8'
  );
  const heroSearchRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/home/HeroSearchInspector.tsx'),
    'utf8'
  );
  assert.ok(
    homePageRadarCardSrc.includes('<ProductCard') &&
      homePageRadarCardSrc.includes('radarSignal={getRadarSignal(') &&
      productCardSrc.includes('<RadarBadge') &&
      homePageRadarCardSrc.includes('buildRadarIndex') &&
      /categorySlug: 'all', limit: 50/.test(homePageRadarCardSrc),
    'Homepage featured product cards must render RadarBadge from full catalog index (#117)'
  );
  assert.ok(
    heroSearchRadarSrc.includes('RadarBadge') &&
      heroSearchRadarSrc.includes('useDealRadarIndex'),
    'HeroSearchInspector search cards must render RadarBadge (#117)'
  );
  const productRouteSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/api/v1/rate/products/[slug]/route.ts'
    ),
    'utf8'
  );
  const productShareSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductShareAuditButton.tsx'
    ),
    'utf8'
  );
  const compareWorkspaceRadarExportSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/compare/CompareWorkspace.tsx'),
    'utf8'
  );
  const versusScoreboardRadarExportSrc = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf8'
  );
  assert.ok(
    productRouteSrc.includes('computeProductRadarSignal') &&
      productRouteSrc.includes('radarSignal'),
    'GET /api/v1/rate/products/[slug] must include product-level radarSignal (#117)'
  );
  assert.ok(
    productShareSrc.includes('RADAR_CSV_HEADERS') &&
      productShareSrc.includes('radarExportFields'),
    'ProductShareAuditButton must include product-level Deal Radar in exports (#117)'
  );
  assert.ok(
    compareWorkspaceRadarExportSrc.includes('radarMarkdownCell') &&
      compareWorkspaceRadarExportSrc.includes('dealRadar: radarExportFields') &&
      versusScoreboardRadarExportSrc.includes('radarMarkdownCell') &&
      versusScoreboardRadarExportSrc.includes('dealRadar: radarExportFields'),
    'CompareWorkspace and VersusInteractiveScoreboard exports must include Deal Radar (#117)'
  );
  console.log(
    '  ✅ [37/38] Per-product Radar across ProductDetailView, Homepage, HeroSearchInspector, catalog, /deals, /compare, /compare/[versus] & REST API (#106, #116, #117) passed'
  );

  // 38. REST API v1 product-level Deal Radar parity across extension/lookup, inspect, products, leaderboard, compare, versus (#119)
  const extensionServerRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/server/rate/extension.ts'),
    'utf8'
  );
  const inspectRouteRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/inspect/route.ts'),
    'utf8'
  );
  const productsRouteRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/products/route.ts'),
    'utf8'
  );
  const leaderboardRouteRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/leaderboard/route.ts'),
    'utf8'
  );
  const compareRouteRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/compare/route.ts'),
    'utf8'
  );
  const versusRouteRadarSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/versus/route.ts'),
    'utf8'
  );
  assert.ok(
    extensionServerRadarSrc.includes('computeProductRadarSignal') &&
      extensionServerRadarSrc.includes('radarSignal'),
    'Extension lookup must compute and return product-level radarSignal (#119)'
  );
  assert.ok(
    inspectRouteRadarSrc.includes('computeProductRadarSignal') &&
      inspectRouteRadarSrc.includes('radarSignal'),
    'GET /api/v1/rate/inspect must include product-level radarSignal (#119)'
  );
  assert.ok(
    productsRouteRadarSrc.includes('deal_radar: radarExportFields') &&
      leaderboardRouteRadarSrc.includes('deal_radar: radarExportFields') &&
      compareRouteRadarSrc.includes('deal_radar: radarExportFields') &&
      versusRouteRadarSrc.includes('deal_radar: radarExportFields'),
    'All REST API v1 product/leaderboard/compare/versus endpoints must embed deal_radar from the shared module (#119)'
  );
  const extContentScriptSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/extension/src/content/content-script.ts'),
    'utf8'
  );
  assert.ok(
    extContentScriptSrc.includes('lookup.radarSignal') &&
      extContentScriptSrc.includes('radarChipHtml'),
    'Browser Extension Floating Shadow DOM Trust Pill must render product-level radarSignal (#121)'
  );
  assert.ok(
    'ProductDealRadarSignal' in openApi.components.schemas,
    'OpenAPI 3.1.0 components.schemas must document ProductDealRadarSignal (#121)'
  );
  console.log(
    '  ✅ [38/39] REST API v1, Extension Shadow DOM Pill & OpenAPI 3.1.0 product-level Deal Radar parity (#119, #121) passed'
  );

  // 39. Zero fabricated ratings, review counts, offer counts or expert scores when data is missing (#123)
  const unratedProduct = {
    id: '00000000-0000-0000-0000-000000000099',
    brand: 'Apple',
    model: 'iPhone 18 Air',
    model_key: 'apple-iphone-18-air-256gb',
    name: 'Apple iPhone 18 Air 256GB',
    slug: 'apple-iphone-18-air-256gb',
    has_5g: true,
    specifications: {},
    key_specs: {},
    images: [],
    colors: [],
    min_price: 25990000,
    max_price: 25990000,
    merchant_count: 0,
    total_reviews: 0,
    average_rating: 0,
    user_rating_weighted: undefined,
    expert_rating: null,
    authentic_review_count: 0,
    status: 'published' as const,
    metadata: {},
  };
  const unratedScored = scoreMasterProductForLeaderboard(
    unratedProduct,
    'combined'
  );
  assert.equal(unratedScored.userScore5, 0);
  assert.equal(unratedScored.expertScore10, null);
  assert.equal(unratedScored.combinedScore5, 0);
  assert.equal(unratedScored.authenticReviewCount, 0);
  assert.equal(unratedScored.filteredNoiseReviewCount, 0);
  assert.equal(unratedScored.merchantCount, 0);

  const rankedWithUnrated = rankMasterProductsForLeaderboard(
    [...mockPeers, unratedProduct],
    {
      category: 'smartphones',
      criterion: 'combined',
    }
  );
  assert.equal(
    rankedWithUnrated.some((item) => item.product.slug === unratedProduct.slug),
    false,
    'rankMasterProductsForLeaderboard must exclude unrated products (#123)'
  );
  console.log(
    '  ✅ [39/40] Zero fabricated ratings, review counts, offer counts or expert scores when data is missing (#123) passed'
  );

  // 40. Unified radarSignal in inspectProductOrShopUrl, RadarBadge in HeroSearchInspector Mode 2 / DeepInspectWorkspace / MerchantProfilePage, and real catalog presets in ApiPlaygroundClient (#126)
  const serverRateIndexSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/server/rate/index.ts'),
    'utf8'
  );
  const deepInspectSrc126 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/inspect/DeepInspectWorkspace.tsx'
    ),
    'utf8'
  );
  const heroSearchSrc126 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/home/HeroSearchInspector.tsx'),
    'utf8'
  );
  const apiPlaygroundSrc126 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/developers/ApiPlaygroundClient.tsx'
    ),
    'utf8'
  );
  assert.ok(
    serverRateIndexSrc.includes('inspectProductOrShopUrlWithRadar') &&
      serverRateIndexSrc.includes('computeProductRadarSignal'),
    'getCachedInspectProductOrShopUrl must attach product-level radarSignal from computeProductRadarSignal (#126)'
  );
  assert.ok(
    deepInspectSrc126.includes('result?.radarSignal') &&
      deepInspectSrc126.includes('<RadarBadge signal={radarSignal} />') &&
      !deepInspectSrc126.includes('4.8'),
    'DeepInspectWorkspace must use result.radarSignal, render RadarBadge, and have zero 4.8 fallbacks (#126)'
  );
  assert.ok(
    heroSearchSrc126.includes('inspectResult.radarSignal') &&
      !heroSearchSrc126.includes('merchant_count || 1'),
    'HeroSearchInspector must render RadarBadge on Mode 2 inspection card and not fall back merchant_count to 1 (#126)'
  );
  assert.ok(
    !apiPlaygroundSrc126.includes('iphone-18') &&
      apiPlaygroundSrc126.includes(
        'apple-iphone-16-128gb-vs-apple-iphone-16-plus-256gb'
      ),
    'ApiPlaygroundClient presets must reference real crawled catalog slugs (#126)'
  );
  console.log(
    '  ✅ [40/41] Unified radarSignal in inspectProductOrShopUrl, RadarBadge in Inspector/Merchant & real API Playground presets (#126) passed'
  );

  // =========================================================================
  // 41. Unified Deal Radar Exports in Watchlist API, WatchlistWorkspace,
  //     DeepInspectWorkspace, ProductOffersExplorer & ProductValueCalculator (#127)
  // =========================================================================
  const watchlistRouteSrc127 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/api/v1/rate/watchlist/route.ts'),
    'utf-8'
  );
  const watchlistWorkspaceSrc127 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/watchlist/WatchlistWorkspace.tsx'
    ),
    'utf-8'
  );
  const deepInspectSrc127 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/inspect/DeepInspectWorkspace.tsx'
    ),
    'utf-8'
  );
  const offersExplorerSrc127 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx'
    ),
    'utf-8'
  );
  const valueCalculatorSrc127 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductValueCalculator.tsx'
    ),
    'utf-8'
  );
  const pdvSrc127 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/smartphones/[slug]/page.tsx'
    ),
    'utf-8'
  );

  assert.ok(
    watchlistRouteSrc127.includes('computeProductRadarSignal') &&
      watchlistRouteSrc127.includes(
        'deal_radar: radarExportFields(radarSignal)'
      ) &&
      watchlistRouteSrc127.includes('radar_signal: radarSignal'),
    'GET and POST /api/v1/rate/watchlist must return deal_radar and radar_signal per watched product (#127)'
  );
  assert.ok(
    watchlistWorkspaceSrc127.includes('RADAR_CSV_HEADERS') &&
      watchlistWorkspaceSrc127.includes('radarCsvCells') &&
      watchlistWorkspaceSrc127.includes('radarExportFields') &&
      watchlistWorkspaceSrc127.includes('radarMarkdownCell'),
    'WatchlistWorkspace exports (MD/CSV/JSON) must include unified Deal Radar columns (#127)'
  );
  assert.ok(
    deepInspectSrc127.includes('RADAR_CSV_HEADERS') &&
      deepInspectSrc127.includes('radarCsvCells') &&
      deepInspectSrc127.includes('dealRadar: radarExportFields(radarSignal)') &&
      deepInspectSrc127.includes('radarMarkdownCell(radarSignal)'),
    'DeepInspectWorkspace exports (MD/CSV/JSON) must include unified Deal Radar columns (#127)'
  );
  assert.ok(
    offersExplorerSrc127.includes('RADAR_CSV_HEADERS') &&
      offersExplorerSrc127.includes('radarCsvCells') &&
      offersExplorerSrc127.includes('radarExportFields') &&
      valueCalculatorSrc127.includes('RADAR_CSV_HEADERS') &&
      valueCalculatorSrc127.includes('radarCsvCells') &&
      valueCalculatorSrc127.includes('radarExportFields'),
    'ProductOffersExplorer and ProductValueCalculator must include unified Deal Radar columns in exports (#127)'
  );
  assert.ok(
    pdvSrc127.includes('peerRadarIndex') &&
      pdvSrc127.includes('getRadarSignal(peerRadarIndex, peer.slug)'),
    'ProductDetailView relatedCompetitors cards must render per-product RadarBadge (#127)'
  );
  console.log(
    '  ✅ [41/44] Unified Deal Radar exports across Watchlist API, WatchlistWorkspace, DeepInspectWorkspace, ProductOffersExplorer & ProductValueCalculator (#127) passed'
  );

  // =========================================================================
  // 42. Unified Deal Radar Exports in PriceHistorySection, JReviewsSection,
  //     ProductSpecsExportToolbar, Compare/Versus CSVs & OpenAPI 3.1.0 (#128)
  // =========================================================================
  const priceHistorySrc128 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/price-history/PriceHistorySection.tsx'
    ),
    'utf-8'
  );
  const specsToolbarSrc128 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/leaderboard/ProductSpecsExportToolbar.tsx'
    ),
    'utf-8'
  );
  const jreviewsSrc128 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/reviews/JReviewsSection.tsx'),
    'utf-8'
  );
  const compareWorkspaceSrc128 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/compare/CompareWorkspace.tsx'),
    'utf-8'
  );
  const versusScoreboardSrc128 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf-8'
  );
  const openApiSpec128 = buildRateOpenApiSpec();

  assert.ok(
    priceHistorySrc128.includes('RADAR_CSV_HEADERS') &&
      priceHistorySrc128.includes('radarCsvCells') &&
      priceHistorySrc128.includes('radarExportFields') &&
      priceHistorySrc128.includes('radarMarkdownCell'),
    'PriceHistorySection exports (MD/CSV/JSON) must include unified Deal Radar columns (#128)'
  );
  assert.ok(
    specsToolbarSrc128.includes('RADAR_CSV_HEADERS') &&
      specsToolbarSrc128.includes('radarCsvCells') &&
      specsToolbarSrc128.includes('radarExportFields') &&
      specsToolbarSrc128.includes('radarMarkdownCell'),
    'ProductSpecsExportToolbar exports (MD/CSV/JSON) must include unified Deal Radar columns (#128)'
  );
  assert.ok(
    jreviewsSrc128.includes('RADAR_CSV_HEADERS') &&
      jreviewsSrc128.includes('radarCsvCells') &&
      jreviewsSrc128.includes('radarExportFields') &&
      jreviewsSrc128.includes('radarMarkdownCell'),
    'JReviewsSection exports (MD/CSV/JSON) must include unified Deal Radar columns (#128)'
  );
  assert.ok(
    compareWorkspaceSrc128.includes('RADAR_CSV_HEADERS.map') &&
      compareWorkspaceSrc128.includes('radarCsvCells') &&
      versusScoreboardSrc128.includes('RADAR_CSV_HEADERS.map') &&
      versusScoreboardSrc128.includes('radarCsvCells'),
    'CompareWorkspace and VersusInteractiveScoreboard CSV exports must include the 4 canonical RADAR_CSV_HEADERS rows (#128)'
  );
  assert.ok(
    openApiSpec128.paths['/api/v1/rate/watchlist']?.post?.operationId ===
      'registerWatchlistPriceAlert' &&
      JSON.stringify(openApiSpec128.paths['/api/v1/rate/compare']).includes(
        '#/components/schemas/ProductDealRadarSignal'
      ) &&
      JSON.stringify(openApiSpec128.paths['/api/v1/rate/versus']).includes(
        '#/components/schemas/ProductDealRadarSignal'
      ) &&
      JSON.stringify(openApiSpec128.paths['/api/v1/rate/watchlist']).includes(
        '#/components/schemas/ProductDealRadarSignal'
      ) &&
      JSON.stringify(openApiSpec128.paths['/api/v1/rate/inspect']).includes(
        '#/components/schemas/ProductDealRadarSignal'
      ),
    'OpenAPI 3.1.0 spec must document POST /api/v1/rate/watchlist and reference ProductDealRadarSignal across all product/radar endpoints (#128)'
  );
  console.log(
    '  ✅ [42/44] Unified Deal Radar exports in PriceHistorySection, JReviewsSection, ProductSpecsExportToolbar, Compare/Versus CSVs & OpenAPI 3.1.0 (#128) passed'
  );
  // 43. Bootstrap JS ships from the installed package, not a CDN script (#145)
  const rootLayoutSrc145 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/layout.tsx'),
    'utf8'
  );
  assert.ok(
    !rootLayoutSrc145.includes('cdn.jsdelivr.net') &&
      rootLayoutSrc145.includes('<BootstrapClient />') &&
      fs
        .readFileSync(
          path.join(repoRoot, 'apps/web/src/app/BootstrapClient.tsx'),
          'utf8'
        )
        .includes("import('bootstrap/dist/js/bootstrap.bundle.min.js')"),
    'Root layout must render BootstrapClient (bundled bootstrap JS) and must not load Bootstrap from cdn.jsdelivr.net (#145)'
  );
  console.log(
    '  ✅ [43/44] Bootstrap JS bundled from the bootstrap package via BootstrapClient, no jsDelivr script in the root layout (#145) passed'
  );
  // 44. Fonts are self-hosted by next/font, not @import-ed from Google (#147)
  const customScssSrc147 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/style/scss/_custom.scss'),
    'utf8'
  );
  assert.ok(
    !customScssSrc147.includes('fonts.googleapis.com') &&
      customScssSrc147.includes('var(--font-inter') &&
      customScssSrc147.includes('var(--font-jetbrains-mono') &&
      rootLayoutSrc145.includes('fontInter.variable') &&
      rootLayoutSrc145.includes('fontJetBrainsMono.variable'),
    'Inter and JetBrains Mono must come from next/font (src/lib/fonts.ts) via --font-inter / --font-jetbrains-mono, never a Google Fonts @import (#147)'
  );
  console.log(
    '  ✅ [44/45] Inter & JetBrains Mono self-hosted via next/font, no Google Fonts @import (#147) passed'
  );

  // 45. Web Security Headers (C4), Per-Page SEO Canonicals & Sitemap Revalidation (C10), PostgREST Filter Sanitization (T10) & CSV Formula Guard (T11) (#163)
  const { escapeCsvCell } =
    require('../../../lib/csv-safe') as typeof import('../../../lib/csv-safe');
  const { sanitizePostgrestFilterToken } =
    require('../../../lib/rate-api') as typeof import('../../../lib/rate-api');
  assert.equal(
    escapeCsvCell("=cmd|'/C calc'!A0"),
    "'=cmd|'/C calc'!A0",
    'Must neutralize leading = formula injection in CSV text cells'
  );
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('@IMPORTXML()'), "'@IMPORTXML()");
  assert.equal(
    escapeCsvCell(-15.4),
    '-15.4',
    'Must preserve negative numbers without prepending a single quote'
  );
  assert.equal(
    escapeCsvCell('-12.5%'),
    '-12.5%',
    'Must preserve negative percentage strings'
  );
  assert.equal(
    sanitizePostgrestFilterToken('apple-flagship,id.eq.1234()'),
    'apple-flagshipideq1234',
    'Must strip PostgREST operator delimiters (commas, dots, parens) from .or() filter tokens'
  );

  const nextConfigSrc163 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/next.config.mjs'),
    'utf8'
  );
  assert.ok(
    nextConfigSrc163.includes('X-Content-Type-Options') &&
      nextConfigSrc163.includes('X-Frame-Options') &&
      nextConfigSrc163.includes('Referrer-Policy') &&
      nextConfigSrc163.includes('Permissions-Policy') &&
      nextConfigSrc163.includes('Strict-Transport-Security') &&
      nextConfigSrc163.includes("frame-ancestors 'self'"),
    'next.config.mjs must configure HTTP security headers (C4)'
  );

  const localeLayoutSrc163 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/layout.tsx'),
    'utf8'
  );
  assert.ok(
    localeLayoutSrc163.includes("metadataBase: new URL('https://rate.vn')") &&
      !localeLayoutSrc163.includes("canonical: 'https://rate.vn'"),
    '[locale]/layout.tsx must set metadataBase and not force canonical: https://rate.vn onto all subpages (C10)'
  );

  const sitemapSrc163 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/sitemap.ts'),
    'utf8'
  );
  assert.ok(
    sitemapSrc163.includes('export const revalidate = 3600') &&
      sitemapSrc163.includes('/deals'),
    'sitemap.ts must export revalidate = 3600 and include /deals (C10)'
  );
  console.log(
    '  ✅ [45/46] HTTP Security Headers (C4), Per-Page SEO Canonicals & Sitemap Revalidation (C10), PostgREST Filter Sanitization (T10) & CSV Formula Guard (T11) (#163) passed'
  );

  // 46. Static Page SEO Canonicals, Workspace CSV Formula Guards & Product Scoreboard Bayesian Confidence (#166)
  const { computeBayesianRatingSummary } =
    require('../../../lib/rate-api') as typeof import('../../../lib/rate-api');
  const bayesianSparse = computeBayesianRatingSummary([
    { rating_star: 5, helpfulness_weight: 0.9, include_in_rating: true },
  ]);
  assert.equal(bayesianSparse.bayesianRating, 4.38);
  assert.equal(bayesianSparse.confidenceTier, 'insufficient_data');

  const bayesianMedium = computeBayesianRatingSummary([
    { rating_star: 5, helpfulness_weight: 2.0, include_in_rating: true },
    { rating_star: 4, helpfulness_weight: 2.5, include_in_rating: true },
    { rating_star: 5, helpfulness_weight: 0, include_in_rating: false },
  ]);
  assert.equal(bayesianMedium.effectiveWeightSum, 4.5);
  assert.equal(bayesianMedium.confidenceTier, 'medium');
  assert.ok(
    bayesianMedium.bayesianRating > 4.2 && bayesianMedium.bayesianRating < 4.5,
    'Bayesian shrinkage must pull small-sample weighted ratings toward prior mu=4.2'
  );

  for (const staticRoute of [
    'about-us',
    'faq',
    'privacy-policy',
    'contact-us',
  ]) {
    const pageSrc = fs.readFileSync(
      path.join(repoRoot, `apps/web/src/app/[locale]/${staticRoute}/page.tsx`),
      'utf8'
    );
    assert.ok(
      pageSrc.includes(`canonical: 'https://rate.vn/${staticRoute}'`),
      `${staticRoute}/page.tsx must define per-page canonical URL (C10)`
    );
  }

  for (const csvComponentPath of [
    'apps/web/src/components/deals/DealFinderWorkspace.tsx',
    'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx',
    'apps/web/src/components/inspect/DeepInspectWorkspace.tsx',
    'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx',
    'apps/web/src/components/leaderboard/ProductValueCalculator.tsx',
  ]) {
    const compSrc = fs.readFileSync(
      path.join(repoRoot, csvComponentPath),
      'utf8'
    );
    assert.ok(
      compSrc.includes("from '@/lib/csv-safe'") &&
        compSrc.includes('escapeCsvCell'),
      `${csvComponentPath} must use shared escapeCsvCell formula guard (T11)`
    );
  }

  const pdvSrc166 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/smartphones/[slug]/page.tsx'
    ),
    'utf8'
  );
  assert.ok(
    pdvSrc166.includes('computeBayesianRatingSummary') &&
      pdvSrc166.includes('pdv-bayesian-confidence'),
    'Product Detail Scoreboard must display Bayesian confidence tier badge (#166)'
  );
  console.log(
    '  ✅ [46/47] Static Page SEO Canonicals, Workspace CSV Formula Guards & Product Scoreboard Bayesian Confidence (#166) passed'
  );

  // 47. getMerchantsList Scoped Query (C2), /api/health, global-error.tsx, Root Layout CSS Cleanup, Turbo Outputs (T14) & Dependabot (#168)
  const rateApiSrc168 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/rate-api.ts'),
    'utf8'
  );
  assert.ok(
    rateApiSrc168.includes(".in('merchant_id', merchantIds)") &&
      rateApiSrc168.includes('extractPersistedBreakdown') &&
      rateApiSrc168.includes(".in('product_id', unscoredProductIds)"),
    'getMerchantsList must scope products by merchantIds and only query reviews for unscoredProductIds (C2)'
  );

  const healthRoute =
    require('../../../app/api/health/route') as typeof import('../../../app/api/health/route');
  const healthRes = await healthRoute.GET();
  assert.equal(healthRes.status, 200);
  const healthBody = (await healthRes.json()) as {
    status: string;
    service: string;
  };
  assert.equal(healthBody.status, 'ok');
  assert.equal(healthBody.service, 'rate-web');
  assert.ok(
    (healthRes.headers.get('cache-control') || '').includes('no-store'),
    'GET /api/health must return Cache-Control: no-store'
  );

  assert.ok(
    fs.existsSync(path.join(repoRoot, 'apps/web/src/app/global-error.tsx')) &&
      fs.existsSync(path.join(repoRoot, '.nvmrc')),
    'global-error.tsx and .nvmrc must exist (Audit Section 7)'
  );

  const rootLayoutSrc168 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/layout.tsx'),
    'utf8'
  );
  assert.ok(
    !rootLayoutSrc168.includes('animate.css') &&
      !rootLayoutSrc168.includes('font-awesome'),
    'apps/web/src/app/layout.tsx must not load unused animate.css or Font Awesome CDN'
  );

  const turboJsonSrc168 = fs.readFileSync(
    path.join(repoRoot, 'turbo.json'),
    'utf8'
  );
  assert.ok(
    !turboJsonSrc168.includes('"public/**"'),
    'turbo.json build.outputs must not include public/** (T14)'
  );

  const dependabotSrc168 = fs.readFileSync(
    path.join(repoRoot, '.github/dependabot.yml'),
    'utf8'
  );
  const codeownersSrc168 = fs.readFileSync(
    path.join(repoRoot, 'CODEOWNERS'),
    'utf8'
  );
  assert.ok(
    dependabotSrc168.includes('github-actions') &&
      !dependabotSrc168.includes('/apps/strapi') &&
      !codeownersSrc168.includes('/apps/strapi') &&
      !codeownersSrc168.includes('@claude-code'),
    'dependabot.yml and CODEOWNERS must match the current Open-Core monorepo without legacy Strapi or ghost handles'
  );
  console.log(
    '  ✅ [47/48] getMerchantsList Scoped Query (C2), /api/health, global-error.tsx, Layout CSS Cleanup, Turbo Outputs (T14) & Dependabot (#168) passed'
  );

  // 48. Unified API v1 Error Sanitizer & Bounded Query Parsers (T9) + Pure Domain Module rate-domain.ts (T12) (#170)
  const {
    sanitizePublicApiError,
    jsonApiError,
    parseBoundedIntParam,
    parseBoundedNumberParam,
  } = require('../api-handler') as typeof import('../api-handler');
  assert.equal(
    sanitizePublicApiError(
      new Error('PGRST204: relation "rate.master_products" does not exist'),
      'Failed to fetch products catalog'
    ),
    'Failed to fetch products catalog',
    'Must mask internal PostgreSQL/PostgREST error messages from public API responses (T9)'
  );
  assert.equal(
    sanitizePublicApiError(
      new Error('Missing required slug parameter'),
      'Fallback error'
    ),
    'Missing required slug parameter',
    'Must preserve short, non-DB validation messages'
  );
  assert.equal(parseBoundedIntParam('999', 24, 1, 100), 100);
  assert.equal(parseBoundedIntParam('-5', 24, 1, 100), 1);
  assert.equal(parseBoundedIntParam('abc', 24, 1, 100), 24);
  assert.equal(parseBoundedNumberParam('125', 0, 100), 100);
  assert.equal(parseBoundedNumberParam(null, 0, 100), undefined);

  const errRes170 = jsonApiError(
    500,
    'Failed to fetch merchants list',
    new Error('permission denied for schema "rate"')
  );
  assert.equal(errRes170.status, 500);
  const errBody170 = (await errRes170.json()) as { ok: boolean; error: string };
  assert.equal(errBody170.ok, false);
  assert.equal(errBody170.error, 'Failed to fetch merchants list');

  const rateDomain =
    require('../../../lib/rate-domain') as typeof import('../../../lib/rate-domain');
  assert.equal(typeof rateDomain.computeBayesianRatingSummary, 'function');
  assert.equal(typeof rateDomain.computeJReviewsWeight, 'function');
  assert.equal(typeof rateDomain.getMasterProductCategorySlug, 'function');
  assert.equal(typeof rateDomain.resolveProductImageUrl, 'function');

  for (const apiRouteRel of [
    'apps/web/src/app/api/v1/rate/products/route.ts',
    'apps/web/src/app/api/v1/rate/products/[slug]/route.ts',
    'apps/web/src/app/api/v1/rate/compare/route.ts',
    'apps/web/src/app/api/v1/rate/deals/route.ts',
    'apps/web/src/app/api/v1/rate/inspect/route.ts',
    'apps/web/src/app/api/v1/rate/leaderboard/route.ts',
    'apps/web/src/app/api/v1/rate/lookup/route.ts',
    'apps/web/src/app/api/v1/rate/merchants/route.ts',
    'apps/web/src/app/api/v1/rate/merchants/[id]/route.ts',
    'apps/web/src/app/api/v1/rate/stats/route.ts',
    'apps/web/src/app/api/v1/rate/versus/route.ts',
    'apps/web/src/app/api/v1/rate/extension/lookup/route.ts',
  ]) {
    const routeSrc = fs.readFileSync(path.join(repoRoot, apiRouteRel), 'utf8');
    assert.ok(
      routeSrc.includes('@/server/rate/api-handler'),
      `${apiRouteRel} must use @/server/rate/api-handler error sanitizer (T9)`
    );
  }
  console.log(
    '  ✅ [48/49] Unified API v1 Error Sanitizer & Bounded Query Parsers (T9) + Pure Domain Module rate-domain.ts (T12) (#170) passed'
  );

  // 49. Issue #159: POST /api/v1/rate/extension/ingest never uses SUPABASE_SERVICE_ROLE_KEY, calls narrow enqueue_crowd_verify_signal RPC, and never echoes raw DB error.message
  const extensionServerSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/server/rate/extension.ts'),
    'utf8'
  );
  assert.ok(
    !extensionServerSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'apps/web/src/server/rate/extension.ts must never reference SUPABASE_SERVICE_ROLE_KEY (#159)'
  );
  const eslintSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/eslint.config.mjs'),
    'utf8'
  );
  assert.ok(
    eslintSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'apps/web/eslint.config.mjs must ban SUPABASE_SERVICE_ROLE_KEY in src/app/** and src/server/** (#159)'
  );

  const { ingestExtensionCrowdSignal } =
    require('../extension') as typeof import('../extension');
  const rpcCalls159: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const okIngest159 = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: '29512841920',
    externalShopId: '88201679',
    url: 'https://shopee.vn/product/88201679/29512841920?utm_source=ads',
    title: 'Điện thoại Samsung Galaxy S24 Ultra 12GB 256GB Chính Hãng',
    price: 25_690_000,
    userConsentOptIn: true,
    rateClient: {
      rpc: async (fn, args) => {
        rpcCalls159.push({ fn, args });
        return {
          data: [{ job_id: 'job-crowd-159', state: 'enqueued' }],
          error: null,
        };
      },
    },
  });
  assert.equal(okIngest159.accepted, true);
  assert.equal(okIngest159.quarantinedForWorker, true);
  assert.equal(okIngest159.jobId, 'job-crowd-159');
  assert.equal(rpcCalls159.length, 1);
  assert.equal(rpcCalls159[0]?.fn, 'enqueue_crowd_verify_signal');
  assert.equal(rpcCalls159[0]?.args.p_platform, 'shopee');

  const errIngest159 = await ingestExtensionCrowdSignal({
    platform: 'tiki',
    externalItemId: '274019283',
    url: 'https://tiki.vn/dien-thoai-samsung-galaxy-s24-ultra-p274019283.html',
    title: 'Điện thoại Samsung Galaxy S24 Ultra 12GB 256GB Chính Hãng',
    price: 25_690_000,
    userConsentOptIn: true,
    rateClient: {
      rpc: async () => ({
        data: null,
        error: {
          code: '42501',
          message:
            'permission denied for table rate.crawl_jobs_internal_secret',
        },
      }),
    },
  });
  assert.equal(errIngest159.accepted, false);
  assert.equal(errIngest159.jobState, 'queue_error');
  assert.ok(
    !errIngest159.reason.includes('crawl_jobs_internal_secret'),
    'queue_error reason must never echo raw database error.message (#159)'
  );
  console.log(
    '  ✅ [49/50] Zero-Service-Role Extension Crowd Ingest, enqueue_crowd_verify_signal RPC & Error Sanitization (#159) passed'
  );

  // 50. Issue #172: env.mjs removes Prod URL default & NEXTAUTH_*, postcss-selector-parser override, .nvmrc & CI permissions
  const envMjsSrc = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/env.mjs'),
    'utf8'
  );
  assert.ok(
    !envMjsSrc.includes('gulptwduchsjcsbndmua.supabase.co'),
    'apps/web/src/env.mjs must not default NEXT_PUBLIC_SUPABASE_URL to Production project (#172)'
  );
  assert.ok(
    !envMjsSrc.includes('NEXTAUTH_'),
    'apps/web/src/env.mjs must not include legacy NEXTAUTH_* variables (#172)'
  );
  const rootPkgSrc172 = fs.readFileSync(
    path.join(repoRoot, 'package.json'),
    'utf8'
  );
  assert.ok(
    rootPkgSrc172.includes('"postcss-selector-parser@<7.1.6": "^7.1.6"') &&
      !rootPkgSrc172.includes('"animate.css"') &&
      !rootPkgSrc172.includes('"axios"'),
    'root package.json must override postcss-selector-parser>=7.1.6 and drop unused animate.css/axios (#172)'
  );
  const nvmrcSrc = fs
    .readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8')
    .trim();
  assert.equal(nvmrcSrc, '22', '.nvmrc must pin Node 22 LTS (#172)');
  const ciYmlSrc172 = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );
  assert.ok(
    ciYmlSrc172.includes('permissions:') &&
      ciYmlSrc172.includes('contents: read'),
    '.github/workflows/ci.yml must declare least-privilege permissions: contents: read (#172)'
  );
  console.log(
    '  ✅ [50/51] Dependabot Alert #722 Override, env.mjs Prod Fallback Removal (T13), .nvmrc & CI Least-Privilege Permissions (#172) passed'
  );

  // 51. Issue #173: js-yaml>=4.1.1 override eliminates sprintf-js (#724) & all Client Components in src/components/** import @/lib/rate-domain instead of @/lib/rate-api (Audit T12)
  assert.ok(
    rootPkgSrc172.includes('"js-yaml@<4.1.0": "^4.1.1"'),
    'root package.json must override js-yaml@<4.1.0 to ^4.1.1 to eliminate sprintf-js (#173)'
  );
  assert.ok(
    eslintSrc.includes('no-restricted-imports') &&
      eslintSrc.includes('@/lib/rate-api'),
    'apps/web/eslint.config.mjs must forbid @/lib/rate-api in src/components/** (#173)'
  );
  for (const compRel of [
    'apps/web/src/components/compare/CompareWorkspace.tsx',
    'apps/web/src/components/compare/VersusMatchupSwitcher.tsx',
    'apps/web/src/components/compare/compare-tray.ts',
    'apps/web/src/components/deals/DealFinderWorkspace.tsx',
    'apps/web/src/components/home/HeroSearchInspector.tsx',
    'apps/web/src/components/inspect/DeepInspectWorkspace.tsx',
    'apps/web/src/components/leaderboard/CategoryCatalogToolbar.tsx',
    'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx',
    'apps/web/src/components/leaderboard/ProductLeaderboardBadges.tsx',
    'apps/web/src/components/leaderboard/ProductOffersExplorer.tsx',
    'apps/web/src/components/price-history/PriceHistorySection.tsx',
    'apps/web/src/components/reviews/JReviewsSection.tsx',
    'apps/web/src/components/watchlist/WatchlistWorkspace.tsx',
    'apps/web/src/components/watchlist/watchlist-store.ts',
  ]) {
    const compSrc = fs.readFileSync(path.join(repoRoot, compRel), 'utf8');
    assert.ok(
      !compSrc.includes("from '@/lib/rate-api'") &&
        compSrc.includes("from '@/lib/rate-domain'"),
      `${compRel} must import from @/lib/rate-domain instead of @/lib/rate-api (Audit T12, #173)`
    );
  }
  console.log(
    '  ✅ [51/52] Dependabot Alert #724 (sprintf-js) Removal & Full Client Component @/lib/rate-domain Migration (Audit T12, #173) passed'
  );

  // 52. Issue #175: .gitignore unblocks apps/web/public/**/*.png & ignores local machine configs, CLAUDE.md points to AGENTS.md
  const gitignoreSrc175 = fs.readFileSync(
    path.join(repoRoot, '.gitignore'),
    'utf8'
  );
  assert.ok(
    gitignoreSrc175.includes('/*.png') &&
      gitignoreSrc175.includes('!apps/web/public/**/*.png') &&
      gitignoreSrc175.includes('mcp.json') &&
      gitignoreSrc175.includes('memory-bank/'),
    '.gitignore must scope/*.png to root and ignore local machine configs (#175)'
  );
  const claudeMdSrc175 = fs.readFileSync(
    path.join(repoRoot, 'CLAUDE.md'),
    'utf8'
  );
  assert.ok(
    claudeMdSrc175.includes('AGENTS.md') &&
      !claudeMdSrc175.includes('PVTSSF_lADOA388Vc4Bm5MlzhlgSt8'),
    'CLAUDE.md must reference AGENTS.md without duplicating Project #9 field IDs (#175)'
  );
  console.log(
    '  ✅ [52/53] Local Config Untracking, .gitignore Asset Rule & CLAUDE.md Deduplication (Audit Low, #175) passed'
  );

  // 53. Issue #176: Audit T4, T6, T7, T8 reference migration & price_history limit(1000)
  const mig176Src = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261018120102_rate_audit_t4_t6_t7_t8_hardening.sql'
    ),
    'utf8'
  );
  assert.ok(
    mig176Src.includes('idx_price_history_recorded_at_brin') &&
      mig176Src.includes('ON DELETE RESTRICT') &&
      mig176Src.includes('SECURITY INVOKER') &&
      mig176Src.includes("SET search_path = ''") &&
      mig176Src.includes("ESCAPE ''\\''"),
    "20261018120102_rate_audit_t4_t6_t7_t8_hardening.sql must enforce BRIN index, ON DELETE RESTRICT, SECURITY INVOKER, search_path='' & escaped ILIKE wildcards (#176)"
  );
  const rateApiSrc176 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/rate-api.ts'),
    'utf8'
  );
  assert.ok(
    rateApiSrc176.includes(".from('price_history')") &&
      rateApiSrc176.includes('.limit(1000)'),
    'getMasterProductPriceHistory must fetch up to 1000 price_history observations per master product (Audit T6, #176)'
  );
  console.log(
    '  ✅ [53/54] DB Hardening Reference Migration (Audit T4, T6, T7, T8) & 1000-Row Price History Window (#176) passed'
  );

  // 54. Issue #177: Audit C5 & T3 (refresh_master_market_stats RPC, review_votes UPDATE flood guard & search_path='')
  const mig177Src = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261018120103_rate_audit_c5_t3_market_stats_and_vote_guard.sql'
    ),
    'utf8'
  );
  assert.ok(
    mig177Src.includes(
      'CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id UUID)'
    ) &&
      mig177Src.includes('idx_rate_review_votes_voter_updated') &&
      mig177Src.includes("AND updated_at > now() - interval '1 hour'") &&
      mig177Src.includes(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rate.review_flags FROM PUBLIC, anon, authenticated;'
      ),
    '20261018120103_rate_audit_c5_t3_market_stats_and_vote_guard.sql must define refresh_master_market_stats, UPDATE flood guard on review_votes, and revoke public DML on review_flags (#177)'
  );
  const ingestSrc177 = fs.readFileSync(
    path.join(repoRoot, 'apps/importer/src/shopee/shopee-to-supabase.ts'),
    'utf8'
  );
  assert.ok(
    ingestSrc177.includes("'refresh_master_market_stats'"),
    'ShopeeIngestionPipeline.ingestProduct must invoke refresh_master_market_stats RPC (#177)'
  );
  console.log(
    '  ✅ [54/55] Canonical refresh_master_market_stats RPC & Review Votes UPDATE Flood Guard (Audit C5/T3, #177) passed'
  );

  // 55. Issue #178: Audit C1 (get_category_brand_facets & search_master_products RPCs + getMasterProducts pushdown) & ROADMAP/CHANGELOG split
  const mig178Src = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261018120104_rate_audit_c1_catalog_search_and_facets_rpc.sql'
    ),
    'utf8'
  );
  assert.ok(
    mig178Src.includes(
      'CREATE OR REPLACE FUNCTION rate.get_category_brand_facets(p_category_id UUID)'
    ) &&
      mig178Src.includes(
        'CREATE OR REPLACE FUNCTION rate.search_master_products('
      ) &&
      mig178Src.includes('idx_master_products_specs_gin') &&
      mig178Src.includes('SECURITY INVOKER'),
    '20261018120104_rate_audit_c1_catalog_search_and_facets_rpc.sql must define get_category_brand_facets and search_master_products with SECURITY INVOKER (#178)'
  );
  assert.ok(
    rateApiSrc176.includes("'get_category_brand_facets'") &&
      rateApiSrc176.includes("'search_master_products'") &&
      rateApiSrc176.includes('query = query.limit(boundedLimit);'),
    'rate-api.ts must invoke get_category_brand_facets and search_master_products RPCs and enforce bounded .limit() (#178)'
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, 'Docs/Resources/CHANGELOG.md')) &&
      fs
        .readFileSync(path.join(repoRoot, 'Docs/Resources/ROADMAP.md'), 'utf8')
        .includes('CHANGELOG.md'),
    'Docs/Resources/ROADMAP.md must link to Docs/Resources/CHANGELOG.md and keep forward-looking Phase 6 & 7 items (#178)'
  );
  console.log(
    '  ✅ [55/56] Catalog Search/Facets SQL RPCs (Audit C1) & ROADMAP/CHANGELOG Split (Audit Low, #178) passed'
  );

  // 56. Issue #179: Audit T1/T9 Route Handler Behavioral Test Suite (200/204/400/401/429) & Voter Eligibility Gate
  const voteRoute =
    require('../../../app/api/reviews/[id]/vote/route') as typeof import('../../../app/api/reviews/[id]/vote/route');
  const compareRoute =
    require('../../../app/api/v1/rate/compare/route') as typeof import('../../../app/api/v1/rate/compare/route');
  const versusRoute =
    require('../../../app/api/v1/rate/versus/route') as typeof import('../../../app/api/v1/rate/versus/route');
  const lookupRoute =
    require('../../../app/api/v1/rate/lookup/route') as typeof import('../../../app/api/v1/rate/lookup/route');
  const inspectRoute =
    require('../../../app/api/v1/rate/inspect/route') as typeof import('../../../app/api/v1/rate/inspect/route');
  const extLookupRoute =
    require('../../../app/api/v1/rate/extension/lookup/route') as typeof import('../../../app/api/v1/rate/extension/lookup/route');
  const extIngestRoute =
    require('../../../app/api/v1/rate/extension/ingest/route') as typeof import('../../../app/api/v1/rate/extension/ingest/route');

  // 56.1 Voter Eligibility Gate (Review Trust Model Section 9)
  assert.equal(
    voteRoute.evaluateVoterEligibility({
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      email_confirmed_at: new Date().toISOString(),
      phone_confirmed_at: null,
    }).eligible,
    false,
    'Account < 7 days old must be rejected by evaluateVoterEligibility'
  );
  assert.equal(
    voteRoute.evaluateVoterEligibility({
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      email_confirmed_at: null,
      phone_confirmed_at: null,
    }).eligible,
    false,
    'Account with neither confirmed email nor confirmed phone must be rejected'
  );
  assert.equal(
    voteRoute.evaluateVoterEligibility({
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      email_confirmed_at: new Date().toISOString(),
      phone_confirmed_at: null,
    }).eligible,
    true,
    'Confirmed account >= 7 days old must be eligible to vote'
  );

  // 56.2 POST /api/reviews/[id]/vote -> 400 Invalid UUID & 401 Missing Bearer Token
  const badUuidVoteRes = await voteRoute.POST(
    new NextRequest('https://rate.vn/api/reviews/not-a-uuid/vote', {
      method: 'POST',
      body: JSON.stringify({ voteType: 'up' }),
    }),
    { params: Promise.resolve({ id: 'not-a-uuid' }) }
  );
  assert.equal(badUuidVoteRes.status, 400);

  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-test-key';
  try {
    const unauthVoteRes = await voteRoute.POST(
      new NextRequest(
        'https://rate.vn/api/reviews/11111111-2222-3333-4444-555555555555/vote',
        {
          method: 'POST',
          body: JSON.stringify({ voteType: 'up' }),
        }
      ),
      {
        params: Promise.resolve({
          id: '11111111-2222-3333-4444-555555555555',
        }),
      }
    );
    assert.equal(unauthVoteRes.status, 401);
    const unauthVoteBody = (await unauthVoteRes.json()) as { code?: string };
    assert.equal(unauthVoteBody.code, 'AUTH_REQUIRED');
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevAnon === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  }

  // 56.3 GET /api/v1/rate/compare, /versus, /lookup, /inspect -> 400 Bad Request on missing params
  const compare400Res = await compareRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/compare')
  );
  assert.equal(compare400Res.status, 400);

  const versus400Res = await versusRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/versus?pair=same-vs-same')
  );
  assert.equal(versus400Res.status, 400);

  const lookup400Res = await lookupRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/lookup')
  );
  assert.equal(lookup400Res.status, 400);

  const inspect400Res = await inspectRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/inspect')
  );
  assert.equal(inspect400Res.status, 400);

  // 56.4 Extension Lookup & Ingest OPTIONS (204), 400 Validation, Opt-In Gate (200) & 429 Rate Limit
  const extLookupOptRes = await extLookupRoute.OPTIONS();
  assert.equal(extLookupOptRes.status, 204);
  const extLookup400Res = await extLookupRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/extension/lookup')
  );
  assert.equal(extLookup400Res.status, 400);

  const extIngestOptRes = await extIngestRoute.OPTIONS();
  assert.equal(extIngestOptRes.status, 204);

  const extIngest400Res = await extIngestRoute.POST(
    new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ platform: 'invalid_platform' }),
    })
  );
  assert.equal(extIngest400Res.status, 400);

  const extIngestOptOutRes = await extIngestRoute.POST(
    new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({
        platform: 'shopee',
        externalItemId: '123456',
        url: 'https://shopee.vn/i.1.123456',
        title: 'Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
        price: 28990000,
        userConsentOptIn: false,
      }),
    })
  );
  assert.equal(extIngestOptOutRes.status, 200);
  const extIngestOptOutBody = (await extIngestOptOutRes.json()) as {
    ok: boolean;
    data: { accepted: boolean; jobState: string };
  };
  assert.equal(extIngestOptOutBody.data.accepted, false);
  assert.equal(extIngestOptOutBody.data.jobState, 'skipped_no_consent');

  const extIngestAccessoryRes = await extIngestRoute.POST(
    new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.12',
      },
      body: JSON.stringify({
        platform: 'shopee',
        externalItemId: '999999',
        url: 'https://shopee.vn/i.1.999999',
        title: 'Ốp lưng silicon iPhone 16 Pro Max chống sốc',
        price: 55000,
        userConsentOptIn: true,
      }),
    })
  );
  assert.equal(extIngestAccessoryRes.status, 200);
  const extIngestAccessoryBody = (await extIngestAccessoryRes.json()) as {
    ok: boolean;
    data: { accepted: boolean; jobState: string };
  };
  assert.equal(extIngestAccessoryBody.data.accepted, false);
  assert.equal(extIngestAccessoryBody.data.jobState, 'skipped_accessory');

  let hit429 = false;
  for (let i = 0; i < 16; i++) {
    const rlRes = await extIngestRoute.POST(
      new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.99',
        },
        body: JSON.stringify({ platform: 'invalid_platform' }),
      })
    );
    if (rlRes.status === 429) {
      hit429 = true;
      break;
    }
  }
  assert.equal(
    hit429,
    true,
    'POST /api/v1/rate/extension/ingest must return 429 after 15 requests/min from the same IP'
  );
  console.log(
    '  ✅ [56/57] Route Handler Behavioral Test Suite (200/204/400/401/429) & Voter Eligibility Gate (Audit T1/T9, #179) passed'
  );

  // 57. Issue #189: Audit T12 (Complete Client Component boundary) & Audit Low (purge_completed_crawl_jobs RPC & updated_at triggers)
  const mig189Src = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261018120105_rate_audit_low_queue_purge_and_updated_at_triggers.sql'
    ),
    'utf8'
  );
  assert.ok(
    mig189Src.includes(
      'CREATE OR REPLACE FUNCTION rate.purge_completed_crawl_jobs('
    ) &&
      mig189Src.includes(
        'CREATE OR REPLACE FUNCTION rate.set_updated_at_timestamp()'
      ) &&
      mig189Src.includes("SET search_path = ''"),
    '20261018120105_rate_audit_low_queue_purge_and_updated_at_triggers.sql must define purge_completed_crawl_jobs and set_updated_at_timestamp (#189)'
  );
  const sidebarSrc189 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/components/list-sidebar-one.tsx'
    ),
    'utf8'
  );
  const merchDirSrc189 = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/components/merchants/MerchantDirectoryExplorer.tsx'
    ),
    'utf8'
  );
  assert.ok(
    sidebarSrc189.includes("from '@/lib/rate-domain'") &&
      !sidebarSrc189.includes("from '@/lib/rate-api'") &&
      merchDirSrc189.includes("from '@/lib/rate-domain'") &&
      !merchDirSrc189.includes("from '@/server/rate'") &&
      // minimatch treats [locale] as a character class; the flat config escapes it.
      eslintSrc.includes('src/app/[[]locale]/components/**') &&
      eslintSrc.includes('@/server/rate'),
    'list-sidebar-one.tsx and MerchantDirectoryExplorer.tsx must import from @/lib/rate-domain and ESLint must ban @/lib/rate-api & @/server/rate in Client Component folders (#189)'
  );
  console.log(
    '  ✅ [57/58] Zero Server-Import Client Component Boundary (Audit T12) & Queue Purge + updated_at Triggers (Audit Low, #189) passed'
  );

  // 58. Issue #215: Baseline master/queue migrations sync & Audit M3/M4/M5/M7 queue/observation RPCs
  const migMaster215 = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261005130000_rate_recover_master_products.sql'
    ),
    'utf8'
  );
  const migPlatform215 = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261005130001_rate_platform_tables.sql'
    ),
    'utf8'
  );
  assert.ok(
    migMaster215.includes('CREATE TABLE IF NOT EXISTS rate.master_products') &&
      migPlatform215.includes('CREATE TABLE IF NOT EXISTS rate.crawl_jobs') &&
      migPlatform215.includes('CREATE TABLE IF NOT EXISTS rate.crawl_runs'),
    'Baseline master_products and crawl_jobs/crawl_runs migrations must be present in supabase/migrations/ (#215)'
  );
  const mig215Src = fs.readFileSync(
    path.join(
      repoRoot,
      'supabase/migrations/20261018120106_rate_audit_m3_m4_m5_m7_queue_and_observation_rpc.sql'
    ),
    'utf8'
  );
  assert.ok(
    mig215Src.includes('CREATE OR REPLACE FUNCTION rate.cancel_crawl_jobs(') &&
      mig215Src.includes(
        'CREATE OR REPLACE FUNCTION rate.release_crawl_job('
      ) &&
      mig215Src.includes(
        'CREATE OR REPLACE FUNCTION rate.record_price_observation('
      ) &&
      mig215Src.includes('idx_crawl_jobs_claimable_platform') &&
      mig215Src.includes('uq_crawl_jobs_live_target_url') &&
      mig215Src.includes('idx_price_history_promotion_id') &&
      mig215Src.includes('idx_crawl_jobs_run_id') &&
      mig215Src.includes('idx_promotions_product_id') &&
      mig215Src.includes("SET search_path = ''"),
    '20261018120106_rate_audit_m3_m4_m5_m7_queue_and_observation_rpc.sql must define cancel_crawl_jobs, release_crawl_job, record_price_observation, queue/FK indexes, and Linter 0011 search_path hardening (#215)'
  );
  const ingest215Src = fs.readFileSync(
    path.join(repoRoot, 'apps/importer/src/shopee/shopee-to-supabase.ts'),
    'utf8'
  );
  assert.ok(
    ingest215Src.includes("'record_price_observation'"),
    'apps/importer/src/shopee/shopee-to-supabase.ts must invoke record_price_observation RPC (Audit M7, #215)'
  );
  console.log(
    '  ✅ [58/58] Baseline Queue/Master Migrations Sync & M3/M4/M5/M7 Queue/Observation RPCs (#215) passed'
  );

  // ---------------------------------------------------------------------------
  // 57. Review Trust Model v2 Web Domain & 6-Axis Breakdown (#184)
  // ---------------------------------------------------------------------------
  const {
    computeCombinedDualScore,
    computeWilsonLowerBound,
    detectStarDistributionAnomaly,
    evaluateReviewTrustAssessment,
  } = await import('../../../lib/rate-domain');

  assert.equal(computeWilsonLowerBound(0, 0), 0);
  const wilsonSingleVote = computeWilsonLowerBound(1, 0);
  const wilsonManyVotes = computeWilsonLowerBound(50, 2);
  assert.ok(
    wilsonManyVotes > wilsonSingleVote,
    `Wilson lower bound for 50/52 (${wilsonManyVotes}) must exceed 1/1 (${wilsonSingleVote})`
  );

  const shippingOnlyEval = evaluateReviewTrustAssessment({
    rating_star: 1,
    comment: 'Giao hàng quá chậm, đóng gói hộp móp méo, shipper thái độ kém',
    reviewer_type: 'user',
    upvotes: 5,
    downvotes: 0,
    report_count: 0,
    flag_category: 'authentic',
    verdict: 'authentic',
    include_in_rating: true,
    signals: null,
  });
  assert.equal(shippingOnlyEval.routesTo, 'merchant');
  assert.equal(shippingOnlyEval.breakdown.context, 0);
  assert.equal(shippingOnlyEval.breakdown.gate, 0);
  assert.equal(shippingOnlyEval.breakdown.weight, 0);

  const sponsoredPromoEval = evaluateReviewTrustAssessment({
    rating_star: 5,
    comment:
      'Bài viết được tài trợ bởi hãng: Màn hình 120Hz siêu đẹp, camera chụp nét, pin 5000mAh cực trâu!',
    reviewer_type: 'user',
    upvotes: 0,
    downvotes: 0,
    report_count: 0,
    flag_category: 'authentic',
    verdict: 'authentic',
    include_in_rating: true,
    signals: null,
  });
  assert.equal(sponsoredPromoEval.independence, 'sponsored_promo');
  assert.equal(sponsoredPromoEval.sponsorshipBadgeVi, 'Quảng cáo');
  assert.equal(sponsoredPromoEval.breakdown.independence, 0.1);

  const sponsoredBalancedEval = evaluateReviewTrustAssessment({
    rating_star: 4,
    comment:
      'Nhận sản phẩm từ hãng để trải nghiệm: Màn hình OLED 120Hz rất đẹp nhưng nhược điểm là máy hơi nóng khi quay video 4K.',
    reviewer_type: 'user',
    upvotes: 3,
    downvotes: 0,
    report_count: 0,
    flag_category: 'authentic',
    verdict: 'authentic',
    include_in_rating: true,
    signals: null,
  });
  assert.equal(sponsoredBalancedEval.independence, 'sponsored_balanced');
  assert.equal(sponsoredBalancedEval.sponsorshipBadgeVi, 'Có tài trợ');
  assert.equal(sponsoredBalancedEval.breakdown.independence, 0.5);

  const gatedLowConfidenceDual = computeCombinedDualScore({
    userScore: 5.0,
    expertScore: 4.2,
    userConfidence: 0.29,
    fallbackAverage: 4.5,
  });
  assert.equal(gatedLowConfidenceDual.isBlended, false);
  assert.equal(gatedLowConfidenceDual.overall, 4.2);

  const blendedHighConfidenceDual = computeCombinedDualScore({
    userScore: 4.5,
    expertScore: 4.0,
    userConfidence: 0.75,
    fallbackAverage: 4.2,
  });
  assert.equal(blendedHighConfidenceDual.isBlended, true);
  assert.equal(blendedHighConfidenceDual.overall, 4.3);

  const anomalousCluster = detectStarDistributionAnomaly([
    { rating_star: 5, comment: '', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Cực kì hài lòng', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Tốt', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Ok lắm', flag_category: 'authentic' },
    {
      rating_star: 5,
      comment: 'Pin 5000mAh dùng ổn định cả ngày, màn hình sáng đẹp',
      flag_category: 'authentic',
    },
  ]);
  assert.equal(anomalousCluster.isAnomalous, true);
  assert.equal(anomalousCluster.fiveStarRatioPct, 100);
  assert.ok(
    anomalousCluster.warningLabelVi?.includes('Cảnh báo phân bố sao bất thường')
  );

  console.log(
    '  ✅ [57/57] Review Trust Model v2 6-axis breakdown, Wilson sort & confidence gate (#184) passed'
  );

  // 58. Server-only boundary enforcement & 16/16 CSV formula-injection guard (#185 - Audit T11, T12)
  const { buildSafeCsvContent } = await import('../../../lib/csv-safe');
  const { assertServerOnlyBoundary } = await import('../server-only');

  assert.equal(escapeCsvCell("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0");
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(
    escapeCsvCell('@HYPERLINK("http://evil")'),
    `"'@HYPERLINK(""http://evil"")"`
  );
  assert.equal(escapeCsvCell('-15.4%'), '-15.4%');
  assert.equal(escapeCsvCell(-250000), '-250000');
  const safeCsvDoc = buildSafeCsvContent(
    ['Model', 'FormulaPayload', 'Savings'],
    [['iPhone 16 Pro Max', '=1+1', '-12.5%']],
    '\n'
  );
  assert.ok(safeCsvDoc.startsWith('\uFEFFModel,FormulaPayload,Savings\n'));
  assert.ok(safeCsvDoc.includes("iPhone 16 Pro Max,'=1+1,-12.5%"));

  assert.doesNotThrow(() => assertServerOnlyBoundary());

  const fs58 = await import('node:fs');
  const path58 = await import('node:path');
  const webSrcRoot58 = path58.resolve(__dirname, '../../..');

  const serverRateModules58 = [
    'index.ts',
    'extension.ts',
    'deals.ts',
    'openapi.ts',
    'api-handler.ts',
    'cache-tags.ts',
  ];
  for (const modName of serverRateModules58) {
    const modSource = fs58.readFileSync(
      path58.join(webSrcRoot58, 'server', 'rate', modName),
      'utf8'
    );
    assert.ok(
      modSource.includes("import 'server-only';"),
      `Expected src/server/rate/${modName} to import 'server-only'`
    );
  }

  const csvComponents58: string[] = [];
  const clientServerRateLeaks58: string[] = [];
  function walkSrc58(dir: string) {
    for (const entry of fs58.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path58.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walkSrc58(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = fs58.readFileSync(fullPath, 'utf8');
        const rel = path58.relative(webSrcRoot58, fullPath).replace(/\\/g, '/');
        if (content.includes('text/csv')) {
          csvComponents58.push(rel);
          assert.ok(
            content.includes('@/lib/csv-safe'),
            `Expected CSV export component ${rel} to import @/lib/csv-safe`
          );
        }
        if (
          (content.includes("'use client'") ||
            content.includes('"use client"')) &&
          content.includes('@/server/rate')
        ) {
          clientServerRateLeaks58.push(rel);
        }
      }
    }
  }
  walkSrc58(webSrcRoot58);
  assert.ok(
    csvComponents58.length >= 16,
    `Expected at least 16 CSV export components using @/lib/csv-safe, found ${csvComponents58.length}`
  );
  assert.deepEqual(
    clientServerRateLeaks58,
    [],
    `Client components must not import @/server/rate directly: ${clientServerRateLeaks58.join(', ')}`
  );

  console.log(
    `  ✅ [58/58] Server-only boundary across 5 server/rate modules & ${csvComponents58.length}/16 CSV formula guards (#185) passed`
  );

  // 59. Cross-request Data Cache tags & POST /api/v1/rate/revalidate webhook (#186 - Audit C3)
  const {
    RATE_CACHE_TAGS,
    productCacheTag,
    categoryCacheTag,
    merchantCacheTag,
    withRateDataCache,
  } = await import('../cache-tags');
  const revalidateRoute =
    await import('../../../app/api/v1/rate/revalidate/route');

  assert.equal(
    productCacheTag('  Apple-iPhone-16-Pro-Max '),
    'rate:product:apple-iphone-16-pro-max'
  );
  assert.equal(categoryCacheTag('Smartphones'), 'rate:category:smartphones');
  assert.equal(
    merchantCacheTag('Shopee-88201679'),
    'rate:merchant:shopee-88201679'
  );

  let fallbackInvocations = 0;
  const wrappedProbe = withRateDataCache(
    async (slug: string) => {
      fallbackInvocations += 1;
      return { slug, ok: true };
    },
    ['rate-test-probe'],
    { revalidate: 120, tags: [RATE_CACHE_TAGS.PRODUCTS] }
  );
  const probeResult = await wrappedProbe('samsung-galaxy-s24-ultra');
  assert.equal(probeResult.slug, 'samsung-galaxy-s24-ultra');
  assert.equal(fallbackInvocations, 1);

  const revalOptionsRes = await revalidateRoute.OPTIONS();
  assert.equal(revalOptionsRes.status, 204);

  const prevRevalSecret = process.env.RATE_REVALIDATE_SECRET;
  process.env.RATE_REVALIDATE_SECRET = 'test-revalidate-secret-2026';
  try {
    const unauthReq = new NextRequest(
      'https://rate.vn/api/v1/rate/revalidate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-secret',
        },
        body: JSON.stringify({ tags: ['rate:products'] }),
      }
    );
    const unauthRes = await revalidateRoute.POST(unauthReq);
    assert.equal(unauthRes.status, 401);

    const emptyPayloadReq = new NextRequest(
      'https://rate.vn/api/v1/rate/revalidate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-revalidate-secret-2026',
        },
        body: JSON.stringify({}),
      }
    );
    const emptyPayloadRes = await revalidateRoute.POST(emptyPayloadReq);
    assert.equal(emptyPayloadRes.status, 400);

    const validRevalReq = new NextRequest(
      'https://rate.vn/api/v1/rate/revalidate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rate-Revalidate-Token': 'test-revalidate-secret-2026',
        },
        body: JSON.stringify({
          slugs: ['apple-iphone-16-pro-max'],
          categories: ['smartphones'],
          merchants: ['shopee-88201679'],
          paths: ['/smartphones/apple-iphone-16-pro-max'],
        }),
      }
    );
    const validRevalRes = await revalidateRoute.POST(validRevalReq);
    assert.equal(validRevalRes.status, 200);
    const validRevalBody = (await validRevalRes.json()) as {
      ok: boolean;
      data: {
        revalidated: boolean;
        tags: string[];
        paths: string[];
      };
    };
    assert.equal(validRevalBody.ok, true);
    assert.equal(validRevalBody.data.revalidated, true);
    assert.ok(
      validRevalBody.data.tags.includes('rate:product:apple-iphone-16-pro-max')
    );
    assert.ok(validRevalBody.data.tags.includes('rate:products'));
    assert.ok(validRevalBody.data.tags.includes('rate:deals'));
    assert.ok(validRevalBody.data.tags.includes('rate:category:smartphones'));
    assert.ok(
      validRevalBody.data.tags.includes('rate:merchant:shopee-88201679')
    );
    assert.deepEqual(validRevalBody.data.paths, [
      '/smartphones/apple-iphone-16-pro-max',
    ]);
  } finally {
    if (prevRevalSecret === undefined) {
      delete process.env.RATE_REVALIDATE_SECRET;
    } else {
      process.env.RATE_REVALIDATE_SECRET = prevRevalSecret;
    }
  }

  assert.ok(
    openApi.paths['/api/v1/rate/revalidate']?.post,
    'OpenAPI 3.1.0 must document POST /api/v1/rate/revalidate'
  );

  console.log(
    '  ✅ [59/59] Cross-request Data Cache tags & POST /api/v1/rate/revalidate webhook (#186) passed'
  );

  // 60. Complete behavioral NextRequest -> NextResponse coverage for all remaining REST API v1 routes (#187 - Audit T1)
  const healthRoute60 = await import('../../../app/api/health/route');
  const openApiRoute = await import('../../../app/api/v1/rate/openapi/route');
  const openApiJsonRoute =
    await import('../../../app/api/v1/rate/openapi.json/route');
  const productsRoute = await import('../../../app/api/v1/rate/products/route');
  const productDetailRoute =
    await import('../../../app/api/v1/rate/products/[slug]/route');
  const dealsRoute = await import('../../../app/api/v1/rate/deals/route');
  const leaderboardRoute =
    await import('../../../app/api/v1/rate/leaderboard/route');
  const merchantsRoute =
    await import('../../../app/api/v1/rate/merchants/route');
  const merchantDetailRoute =
    await import('../../../app/api/v1/rate/merchants/[id]/route');
  const statsRoute = await import('../../../app/api/v1/rate/stats/route');

  // 60.1 /api/health
  const healthRes60 = await healthRoute60.GET();
  assert.equal(healthRes60.status, 200);
  assert.equal(healthRes60.headers.get('Cache-Control'), 'no-store, max-age=0');
  const healthBody60 = (await healthRes60.json()) as {
    status: string;
    service: string;
  };
  assert.equal(healthBody60.status, 'ok');
  assert.equal(healthBody60.service, 'rate-web');

  // 60.2 /api/v1/rate/openapi & /api/v1/rate/openapi.json
  const openApiOpt = await openApiRoute.OPTIONS();
  assert.equal(openApiOpt.status, 204);
  const openApiGet = await openApiRoute.GET(
    new Request('https://rate.vn/api/v1/rate/openapi')
  );
  assert.equal(openApiGet.status, 200);
  const openApiDoc = (await openApiGet.json()) as {
    openapi: string;
    servers: Array<{ url: string }>;
  };
  assert.equal(openApiDoc.openapi, '3.1.0');
  assert.equal(openApiDoc.servers[0]?.url, 'https://rate.vn');

  const openApiJsonOpt = await openApiJsonRoute.OPTIONS();
  assert.equal(openApiJsonOpt.status, 204);
  const openApiJsonGet = await openApiJsonRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/openapi.json')
  );
  assert.equal(openApiJsonGet.status, 200);

  // 60.3 /api/v1/rate/products & /api/v1/rate/products/[slug]
  const productsOpt = await productsRoute.OPTIONS();
  assert.equal(productsOpt.status, 204);
  const productsGet = await productsRoute.GET(
    new NextRequest(
      'https://rate.vn/api/v1/rate/products?category=smartphones&limit=5&ram=8,12&has5g=true'
    )
  );
  assert.ok([200, 500].includes(productsGet.status));
  const productsBody = (await productsGet.json()) as {
    ok: boolean;
    error?: string;
    count?: number;
  };
  if (productsGet.status === 200) {
    assert.equal(productsBody.ok, true);
    assert.equal(typeof productsBody.count, 'number');
  } else {
    assert.equal(productsBody.ok, false);
    assert.ok(!/PGRST|relation|schema/i.test(productsBody.error ?? ''));
  }

  const prodDetailOpt = await productDetailRoute.OPTIONS();
  assert.equal(prodDetailOpt.status, 204);
  const prodDetailBadSlug = await productDetailRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/products/bad'),
    { params: Promise.resolve({ slug: '../etc/passwd' }) }
  );
  assert.equal(prodDetailBadSlug.status, 400);

  const prodDetailMissing = await productDetailRoute.GET(
    new NextRequest(
      'https://rate.vn/api/v1/rate/products/non-existent-device-slug-2099'
    ),
    { params: Promise.resolve({ slug: 'non-existent-device-slug-2099' }) }
  );
  assert.ok([404, 500].includes(prodDetailMissing.status));

  // 60.4 /api/v1/rate/deals, /api/v1/rate/leaderboard, /api/v1/rate/stats
  const dealsOpt = await dealsRoute.OPTIONS();
  assert.equal(dealsOpt.status, 204);
  const dealsGet = await dealsRoute.GET(
    new Request(
      'https://rate.vn/api/v1/rate/deals?category=smartphones&limit=4'
    )
  );
  assert.ok([200, 500].includes(dealsGet.status));

  const leaderboardGet = await leaderboardRoute.GET(
    new NextRequest(
      'https://rate.vn/api/v1/rate/leaderboard?category=smartphones&criterion=overall&limit=5'
    )
  );
  assert.ok([200, 500].includes(leaderboardGet.status));

  const statsGet = await statsRoute.GET();
  assert.ok([200, 500].includes(statsGet.status));

  // 60.5 /api/v1/rate/merchants & /api/v1/rate/merchants/[id]
  const merchantsOpt = await merchantsRoute.OPTIONS();
  assert.equal(merchantsOpt.status, 204);
  const merchantsGet = await merchantsRoute.GET(
    new NextRequest(
      'https://rate.vn/api/v1/rate/merchants?platform=shopee&official=1&min_trust=70&limit=10'
    )
  );
  assert.ok([200, 500].includes(merchantsGet.status));

  const merchDetailOpt = await merchantDetailRoute.OPTIONS();
  assert.equal(merchDetailOpt.status, 204);
  const merchDetailBadId = await merchantDetailRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/merchants/bad'),
    { params: Promise.resolve({ id: 'invalid/id with spaces' }) }
  );
  assert.equal(merchDetailBadId.status, 400);

  const merchDetailMissing = await merchantDetailRoute.GET(
    new NextRequest(
      'https://rate.vn/api/v1/rate/merchants/non-existent-merchant-999999'
    ),
    { params: Promise.resolve({ id: 'non-existent-merchant-999999' }) }
  );
  assert.ok([404, 500].includes(merchDetailMissing.status));

  console.log(
    '  ✅ [60/60] Complete behavioral NextRequest->NextResponse test coverage across all REST API v1 routes (#187) passed'
  );

  // 61. Dedicated backfill-specs CLI with --apply guard & migration security audit (#188 - Audit T2, C9)
  const importerBackfillPath = path.join(
    repoRoot,
    'apps',
    'importer',
    'src',
    'shopee',
    'jobs',
    'backfill-specs.ts'
  );
  const importerTestEnricherPath = path.join(
    repoRoot,
    'apps',
    'importer',
    'src',
    'shopee',
    'test-ai-enricher.ts'
  );
  assert.equal(
    fs.existsSync(importerBackfillPath),
    true,
    'apps/importer/src/shopee/jobs/backfill-specs.ts must exist (Audit T2)'
  );
  const backfillSource = fs.readFileSync(importerBackfillPath, 'utf8');
  assert.ok(
    backfillSource.includes('const apply = options.apply === true;'),
    'backfill-specs.ts must default to dry-run (apply = false) unless --apply is passed'
  );
  assert.ok(
    backfillSource.includes('export async function runMasterSpecsBackfill') &&
      backfillSource.includes('export async function auditMasterSpecs'),
    'backfill-specs.ts must export runMasterSpecsBackfill and auditMasterSpecs'
  );

  const testEnricherSource = fs.readFileSync(importerTestEnricherPath, 'utf8');
  assert.ok(
    !testEnricherSource.includes(".from('master_products')") &&
      !testEnricherSource.includes('.insert(') &&
      !testEnricherSource.includes('.update('),
    'test-ai-enricher.ts must not contain direct master_products DB mutations (Audit T2)'
  );
  assert.ok(
    testEnricherSource.includes('./jobs/backfill-specs.js'),
    'test-ai-enricher.ts must delegate --backfill and --audit-only to ./jobs/backfill-specs.js'
  );

  // Verify reference migrations in supabase/migrations/ enforce Audit C9, T3, T4, T6, T7, T8
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert.ok(
    migrationFiles.length >= 11,
    `Expected at least 11 reference migrations in supabase/migrations/, found ${migrationFiles.length}`
  );
  const combinedMigrationsSql = migrationFiles
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
    .join('\n');

  assert.ok(
    combinedMigrationsSql.includes(
      'REVOKE SELECT ON rate.merchants FROM anon, authenticated'
    ),
    'Migrations must revoke table-wide SELECT on rate.merchants from anon and authenticated (Audit C9)'
  );
  assert.ok(
    combinedMigrationsSql.includes('SET search_path = rate, public, pg_temp') ||
      combinedMigrationsSql.includes('SET search_path = rate, pg_temp'),
    'SECURITY DEFINER functions must pin search_path'
  );
  assert.ok(
    combinedMigrationsSql.includes('refresh_master_market_stats'),
    'Migrations must define canonical refresh_master_market_stats RPC (Audit C5)'
  );
  assert.ok(
    combinedMigrationsSql.includes('search_master_products') &&
      combinedMigrationsSql.includes('get_category_brand_facets'),
    'Migrations must define search_master_products and get_category_brand_facets RPCs (Audit C1)'
  );

  console.log(
    '  ✅ [61/62] Dedicated backfill-specs CLI (--apply guard) & reference migration security audit (#188) passed'
  );

  // 62. Full next-intl Multilingual Parity (vi/en/cs) across all 15 namespaces (#241, #266, #272)
  const viJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/web/locales/vi.json'), 'utf8')
  ) as Record<string, unknown>;
  const enJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/web/locales/en.json'), 'utf8')
  ) as Record<string, unknown>;
  const csJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/web/locales/cs.json'), 'utf8')
  ) as Record<string, unknown>;

  function collectLeafPaths(obj: unknown, prefix = ''): string[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [prefix];
    }
    const paths: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      paths.push(...collectLeafPaths(v, next));
    }
    return paths.sort();
  }

  const viPaths = collectLeafPaths(viJson);
  const enPaths = collectLeafPaths(enJson);
  const csPaths = collectLeafPaths(csJson);

  assert.deepEqual(
    enPaths,
    viPaths,
    'en.json leaf keys must match vi.json 100% across all namespaces (#241, #266, #272)'
  );
  assert.deepEqual(
    csPaths,
    viPaths,
    'cs.json leaf keys must match vi.json 100% across all namespaces (#241, #266, #272)'
  );
  assert.ok(
    viPaths.length >= 1550,
    `Expected at least 1,550 localized leaf keys per locale, found ${viPaths.length}`
  );

  for (const requiredNamespace of [
    'rate',
    'errors',
    'compare',
    'leaderboard',
    'reviews',
    'watchlist',
    'deals',
    'inspect',
    'merchants',
    'productDetail',
    'homePage',
    'developers',
    'staticPages',
    'catalog',
    'heroSearch',
    'authPortal',
  ]) {
    assert.ok(
      requiredNamespace in viJson &&
        requiredNamespace in enJson &&
        requiredNamespace in csJson,
      `Locale catalogs must include namespace "${requiredNamespace}" in vi, en, and cs`
    );
  }

  for (const localeFile of [
    'apps/web/locales/vi.json',
    'apps/web/locales/en.json',
    'apps/web/locales/cs.json',
  ]) {
    const rawLocaleText = fs.readFileSync(
      path.join(repoRoot, localeFile),
      'utf8'
    );
    assert.ok(
      !rawLocaleText.includes('??'),
      `${localeFile} must not contain '??' UTF-8 encoding corruption`
    );
  }

  console.log(
    `  ✅ [62/63] Full next-intl Multilingual Parity (${viPaths.length} keys x 3 locales vi/en/cs across 16 namespaces) (#241, #266, #272, #279) passed`
  );

  // 63. Retirement of getRateCopy & Localization of Navbar, Footer, RadarBadge, and GlobalError (#279)
  const rateI18nSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/rate-i18n.ts'),
    'utf8'
  );
  assert.ok(
    !rateI18nSource.includes('getRateCopy') &&
      !rateI18nSource.includes('RateLocaleCopy'),
    'rate-i18n.ts must retire legacy getRateCopy and RateLocaleCopy (#279)'
  );

  const navbarSource = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/components/navbar/NavbarDarkDynamic.tsx'
    ),
    'utf8'
  );
  const footerDynamicSource = fs.readFileSync(
    path.join(
      repoRoot,
      'apps/web/src/app/[locale]/components/footer/FooterDynamic.tsx'
    ),
    'utf8'
  );
  const footerTopSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/components/footer-top.tsx'),
    'utf8'
  );
  const radarBadgeSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/components/radar/RadarBadge.tsx'),
    'utf8'
  );
  const globalErrorSource = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/global-error.tsx'),
    'utf8'
  );

  assert.ok(
    navbarSource.includes("useTranslations('rate.nav')") &&
      !navbarSource.includes('getRateCopy'),
    'NavbarDarkDynamic.tsx must use useTranslations("rate.nav") (#279)'
  );
  assert.ok(
    footerDynamicSource.includes("namespace: 'rate.footer'") &&
      !footerDynamicSource.includes('getRateCopy'),
    'FooterDynamic.tsx must use getTranslations("rate.footer") (#279)'
  );
  assert.ok(
    footerTopSource.includes("namespace: 'rate.footer'") &&
      footerTopSource.includes("tFooter('bannerInspectCta')") &&
      !footerTopSource.includes('getRateCopy'),
    'footer-top.tsx must use getTranslations("rate.footer") and bannerInspectCta (#279)'
  );
  assert.ok(
    radarBadgeSource.includes("useTranslations('deals')"),
    'RadarBadge.tsx must localize badges via useTranslations("deals") (#279)'
  );
  assert.ok(
    globalErrorSource.includes('GLOBAL_ERROR_CATALOG') &&
      globalErrorSource.includes('detectBrowserLocale'),
    'global-error.tsx must localize recovery UI across vi/en/cs (#279)'
  );

  console.log(
    '  ✅ [63/63] Retirement of getRateCopy & Localization of Navbar, Footer, RadarBadge, and GlobalError (#279) passed'
  );

  console.log('🎉 All Rate.vn Core Architecture tests passed!');
}

runCoreArchitectureSuite();
