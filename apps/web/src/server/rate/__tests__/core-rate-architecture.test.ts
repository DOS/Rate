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
  extractKeywordFromProductUrl,
  lookupExtensionProduct,
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

  // <html lang={locale}> comes from the [locale] segment. getLocale() in the
  // root layout reads request headers and made every page dynamic (#491).
  const rootLayoutPath = path.resolve(__dirname, '../../../app/layout.tsx');
  const rootLayoutSrc = fs.readFileSync(rootLayoutPath, 'utf8');
  const localeLayoutSrc491 = fs.readFileSync(
    path.resolve(__dirname, '../../../app/[locale]/layout.tsx'),
    'utf8'
  );
  assert.ok(
    !rootLayoutSrc.includes("from 'next-intl/server'") &&
      !/<html\s/.test(rootLayoutSrc) &&
      /<html\b[^>]*\slang=\{locale\}/.test(localeLayoutSrc491) &&
      localeLayoutSrc491.includes('setRequestLocale(locale)') &&
      localeLayoutSrc491.includes('export function generateStaticParams'),
    '[locale]/layout.tsx must render <html lang={locale}> from its params; the root layout must not call getLocale() (#491)'
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
  // The document shell (<html>, fonts, Bootstrap JS) lives in the [locale]
  // layout since #491.
  const rootLayoutSrc145 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/[locale]/layout.tsx'),
    'utf8'
  );
  assert.ok(
    !/cdn\.jsdelivr\.net/.test(rootLayoutSrc145) &&
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
  const fontsSrc447 = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/fonts.ts'),
    'utf8'
  );
  // Each subset is a separate face; the fallback-carrying Latin face must come
  // last in each stack or it would shadow the faces after it (#447).
  const inStackOrder = (src: string, vars: string[]) =>
    vars.every((v, i) => {
      const at = src.indexOf(`var(${v},`);
      return at >= 0 && (i === 0 || at > src.indexOf(`var(${vars[i - 1]},`));
    });
  assert.ok(
    !/fonts\.googleapis\.com/.test(customScssSrc147) &&
      !fontsSrc447.includes('next/font/google') &&
      fontsSrc447.includes("from 'next/font/local'") &&
      inStackOrder(customScssSrc147, [
        '--font-inter-vi',
        '--font-inter-ext',
        '--font-inter-greek',
        '--font-inter',
      ]) &&
      inStackOrder(customScssSrc147, [
        '--font-jetbrains-mono-vi',
        '--font-jetbrains-mono-ext',
        '--font-jetbrains-mono',
      ]) &&
      rootLayoutSrc145.includes('fontFaces.map((font) => font.variable)'),
    'Inter and JetBrains Mono must come from local files via next/font/local (src/lib/fonts.ts), one face per subset in stack order, never from Google Fonts (#147, #447)'
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
    // Chunked since #333: the ids are still only merchantIds / unscoredProductIds.
    /fetchAllRowsInChunks\(\s*'products',\s*merchantIds,/.test(rateApiSrc168) &&
      rateApiSrc168.includes('extractPersistedBreakdown') &&
      /fetchAllRowsInChunks\(\s*'reviews',\s*unscoredProductIds,/.test(
        rateApiSrc168
      ),
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
      rateApiSrc176.includes('boundedOffset + boundedLimit - 1') &&
      rateApiSrc176.includes(
        'items.slice(boundedOffset, boundedOffset + boundedLimit)'
      ),
    'rate-api.ts must invoke get_category_brand_facets and search_master_products RPCs and enforce a bounded page (#178, #466, #482)'
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

  // DOS/Rate#615: callers with only a URL get platform and item id derived.
  const postIngest = (ip: string, body: unknown) =>
    extIngestRoute.POST(
      new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      })
    );
  const derivedRes = await postIngest('203.0.113.13', {
    url: 'https://shopee.vn/op-lung-i.1.555555',
    title: 'Ốp lưng silicon iPhone 16 Pro Max chống sốc',
    price: 55000,
    userConsentOptIn: true,
  });
  assert.equal(derivedRes.status, 200);
  const derivedBody = (await derivedRes.json()) as {
    data: { jobState: string };
  };
  assert.equal(derivedBody.data.jobState, 'skipped_accessory');
  for (const [ip, body] of [
    [
      '203.0.113.14',
      {
        url: 'https://example.com/iphone-16',
        title: 'Apple iPhone 16 Pro Max 256GB',
        price: 28990000,
        userConsentOptIn: true,
      },
    ],
    [
      '203.0.113.15',
      {
        platform: 'lazada',
        url: 'https://shopee.vn/iphone-i.1.555556',
        title: 'Apple iPhone 16 Pro Max 256GB',
        price: 28990000,
        userConsentOptIn: true,
      },
    ],
  ] as const) {
    const res = await postIngest(ip, body);
    assert.equal(res.status, 200);
    const resBody = (await res.json()) as {
      data: { accepted: boolean; jobState: string };
    };
    assert.equal(resBody.data.accepted, false);
    assert.equal(resBody.data.jobState, 'rejected_invalid_url');
  }

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
  const prevCronSecret = process.env.CRON_SECRET;
  try {
    // No RATE_REVALIDATE_SECRET: 503 (not configured), even with a token that
    // matches CRON_SECRET; the cron secret is not accepted as a fallback.
    delete process.env.RATE_REVALIDATE_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-2026';
    const unconfiguredRes = await revalidateRoute.POST(
      new NextRequest('https://rate.vn/api/v1/rate/revalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-cron-secret-2026',
        },
        body: JSON.stringify({ tags: ['rate:products'] }),
      })
    );
    assert.equal(unconfiguredRes.status, 503);

    process.env.RATE_REVALIDATE_SECRET = 'test-revalidate-secret-2026';
    const cronTokenRes = await revalidateRoute.POST(
      new NextRequest('https://rate.vn/api/v1/rate/revalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-cron-secret-2026',
        },
        body: JSON.stringify({ tags: ['rate:products'] }),
      })
    );
    assert.equal(cronTokenRes.status, 401);

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
    if (prevCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = prevCronSecret;
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
    '  ✅ [63/64] Retirement of getRateCopy & Localization of Navbar, Footer, RadarBadge, and GlobalError (#279) passed'
  );

  // 64. Issue #344: RateDataUnavailableError propagation on DB failures, RPC image normalization & >150 IN-filter chunking
  const {
    RateDataUnavailableError,
    getCategoryDirectoryFacets,
    getMasterProducts: getMasterProductsRaw,
    getMasterProductOffers,
    getMasterProductOffersBatch,
    getMasterProductReviews,
    getMasterProductReviewSummary,
    getMasterProductPriceHistory,
    inspectProductOrShopUrl,
  } = await import('../../../lib/rate-api');

  const origFetch344 = globalThis.fetch;
  const supaUrlEnvKey = ['NEXT_PUBLIC_SUPABASE', 'URL'].join('_');
  const supaAnonEnvKey = ['NEXT_PUBLIC_SUPABASE', 'ANON', 'KEY'].join('_');
  process.env[supaUrlEnvKey] =
    process.env[supaUrlEnvKey] || 'https://stub.supabase.test';
  process.env[supaAnonEnvKey] =
    process.env[supaAnonEnvKey] || 'stub-public-token';

  try {
    const jsonResp344 = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    // 64.1 getCategoryDirectoryFacets throws RateDataUnavailableError when categories or fallback master_products fails
    globalThis.fetch = (async () =>
      jsonResp344(500, {
        message: 'simulated categories failure',
      })) as typeof fetch;
    await assert.rejects(
      () => getCategoryDirectoryFacets('smartphones'),
      (err: unknown) => err instanceof RateDataUnavailableError
    );

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/categories')) {
        return jsonResp344(200, [
          {
            id: 'cat-smartphones',
            parent_id: null,
            name: 'Smartphones',
            slug: 'smartphones',
            icon: null,
            display_order: 1,
          },
        ]);
      }
      return jsonResp344(500, { message: 'simulated facets fallback failure' });
    }) as typeof fetch;
    await assert.rejects(
      () => getCategoryDirectoryFacets('smartphones'),
      (err: unknown) => err instanceof RateDataUnavailableError
    );

    // 64.2 getMasterProducts throws RateDataUnavailableError on category lookup failure & normalizes search_master_products RPC rows
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/categories')) {
        return jsonResp344(500, { message: 'simulated category slug failure' });
      }
      return jsonResp344(200, []);
    }) as typeof fetch;
    await assert.rejects(
      () => getMasterProductsRaw({ categorySlug: 'smartphones' }),
      (err: unknown) => err instanceof RateDataUnavailableError
    );

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/rpc/search_master_products')) {
        return jsonResp344(200, [
          {
            id: 'master-16pm',
            slug: 'apple-iphone-16-pro-max-256gb',
            name: 'Apple iPhone 16 Pro Max 256GB',
            brand: 'Apple',
            model: 'iPhone 16 Pro Max',
            model_key: 'apple-iphone-16-pro-max-256gb',
            images: ['https://broken.example.com/404.jpg'],
            specifications: {},
            key_specs: {},
            min_price: 28990000,
            max_price: 30990000,
            merchant_count: 3,
            total_reviews: 10,
            average_rating: 4.8,
            status: 'published',
          },
        ]);
      }
      return jsonResp344(200, []);
    }) as typeof fetch;
    const rpcProducts344 = await getMasterProductsRaw({ categorySlug: 'all' });
    assert.equal(rpcProducts344.length, 1);
    assert.equal(
      rpcProducts344[0]?.images?.[0],
      '/img/devices/apple-iphone-16-pro-max-256gb.jpg',
      'search_master_products RPC rows must be normalized via normalizeMasterProductRow (#344)'
    );

    // 64.2b The master_products fallback (RPC down) applies JS-only filters
    // before paging: a search match outside the first SQL page is still found
    // (#482).
    const fallbackRows482 = Array.from({ length: 150 }, (_, idx) => ({
      id: `fb-${String(idx).padStart(3, '0')}`,
      slug: `fallback-${idx}`,
      name: idx === 120 ? 'Needle Phone X' : `Filler Phone ${idx}`,
      brand: 'E2E',
      model: `M${idx}`,
      model_key: `e2e_m${idx}`,
      category_id: 'cat-smartphones',
      status: 'published',
      metadata: { category_slug: 'smartphones' },
    }));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/categories')) {
        return jsonResp344(200, [
          {
            id: 'cat-smartphones',
            parent_id: null,
            name: 'Smartphones',
            slug: 'smartphones',
            icon: null,
            display_order: 1,
          },
        ]);
      }
      if (url.includes('/rest/v1/rpc/')) {
        return jsonResp344(500, { message: 'simulated RPC outage' });
      }
      if (url.includes('/rest/v1/master_products')) {
        const params = new URL(url).searchParams;
        const offset = Number(params.get('offset') ?? 0);
        const limit = Number(params.get('limit') ?? fallbackRows482.length);
        return jsonResp344(200, fallbackRows482.slice(offset, offset + limit));
      }
      return jsonResp344(200, []);
    }) as typeof fetch;
    const needle482 = await getMasterProductsRaw({
      categorySlug: 'smartphones',
      search: 'needle',
      limit: 48,
    });
    assert.deepEqual(
      needle482.map((p) => p.slug),
      ['fallback-120'],
      'fallback must search the whole category, not only its first SQL page (#482)'
    );

    // 64.3 getMasterProductOffers & getMasterProductOffersBatch throw RateDataUnavailableError when both view and products fallback fail
    globalThis.fetch = (async () =>
      jsonResp344(500, {
        message: 'simulated offers failure',
      })) as typeof fetch;
    await assert.rejects(
      () => getMasterProductOffers('master-16pm'),
      (err: unknown) => err instanceof RateDataUnavailableError
    );
    await assert.rejects(
      () => getMasterProductOffersBatch(['master-16pm']),
      (err: unknown) => err instanceof RateDataUnavailableError
    );

    // 64.3b A paged read against a server that ignores .range() stops with
    // RateDataUnavailableError instead of looping until memory runs out (#485).
    let ignoredRangeCalls485 = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/products')) {
        ignoredRangeCalls485 += 1;
        return jsonResp344(200, [{ id: 'same-row' }]);
      }
      return jsonResp344(200, []);
    }) as typeof fetch;
    await assert.rejects(
      () => getMasterProductReviews('master-ignores-range'),
      (err: unknown) =>
        err instanceof RateDataUnavailableError &&
        /exceeded 500 pages/.test(String((err as Error).message))
    );
    // 500 pages are allowed; the 501st non-empty one ends the read.
    assert.equal(ignoredRangeCalls485, 501);

    // 64.4 Chunking (>150 productIds) and RateDataUnavailableError in getMasterProductReviews, getMasterProductReviewSummary, and getMasterProductPriceHistory
    const manyListingRows344 = Array.from({ length: 160 }, (_, idx) => ({
      id: `prod-${idx + 1}`,
    }));
    let reviewChunksCalled = 0;
    let analysisChunksCalled = 0;
    let priceHistoryChunksCalled = 0;
    let priceExtremeChunksCalled = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/products')) {
        // Honour .range() (offset/limit) like PostgREST: the listing-id read
        // pages until it gets an empty page (#453).
        const params = new URL(url).searchParams;
        const offset = Number(params.get('offset') ?? 0);
        const limit = Number(params.get('limit') ?? manyListingRows344.length);
        return jsonResp344(
          200,
          manyListingRows344.slice(offset, offset + limit)
        );
      }
      if (url.includes('/rest/v1/reviews')) {
        reviewChunksCalled += 1;
        return jsonResp344(200, [
          {
            id: `rev-chunk-${reviewChunksCalled}`,
            author_name: 'Buyer',
            rating_star: 5,
            comment: 'Great display and battery life',
            created_at:
              reviewChunksCalled === 1
                ? '2026-10-17T10:00:00Z'
                : '2026-10-18T10:00:00Z',
            reviewer_type: 'user',
            upvotes: 2,
            downvotes: 0,
            report_count: 0,
            review_flags: {
              verdict: 'authentic',
              flag_category: 'authentic',
              include_in_rating: true,
            },
          },
        ]);
      }
      if (url.includes('/rest/v1/review_analysis')) {
        analysisChunksCalled += 1;
        return jsonResp344(200, [
          {
            total_reviews_analyzed: 10,
            authenticity_score: 92,
            ai_summary: `Summary from chunk ${analysisChunksCalled}`,
            pros: [`Pro ${analysisChunksCalled}`],
            cons: [`Con ${analysisChunksCalled}`],
            analyzed_at:
              analysisChunksCalled === 1
                ? '2026-10-17T10:00:00Z'
                : '2026-10-18T10:00:00Z',
          },
        ]);
      }
      if (
        url.includes('/rest/v1/price_history') &&
        /[?&]order=price./.test(url)
      ) {
        // All-time low/high reads (#464): one cheapest and one dearest row
        // per chunk.
        priceExtremeChunksCalled += 1;
        return jsonResp344(200, []);
      }
      if (url.includes('/rest/v1/price_history')) {
        priceHistoryChunksCalled += 1;
        return jsonResp344(200, [
          {
            id: priceHistoryChunksCalled,
            product_id: `prod-${priceHistoryChunksCalled === 1 ? 1 : 155}`,
            price: 27990000,
            price_original: 29990000,
            recorded_at:
              priceHistoryChunksCalled === 1
                ? '2026-10-17T10:00:00Z'
                : '2026-10-18T10:00:00Z',
            source: 'crawler',
          },
        ]);
      }
      return jsonResp344(200, []);
    }) as typeof fetch;

    const chunkedReviews344 = await getMasterProductReviews('master-16pm');
    assert.equal(
      reviewChunksCalled,
      2,
      'getMasterProductReviews must chunk 160 productIds into 2 requests of <=150 IDs (#344)'
    );
    assert.equal(chunkedReviews344.length, 2);
    assert.equal(chunkedReviews344[0]?.id, 'rev-chunk-2');

    const chunkedSummary344 = await getMasterProductReviewSummary(
      'master-16pm',
      chunkedReviews344
    );
    assert.equal(
      analysisChunksCalled,
      2,
      'getMasterProductReviewSummary must chunk 160 productIds into 2 requests of <=150 IDs (#344)'
    );
    assert.equal(chunkedSummary344.ai_summary, 'Summary from chunk 2');
    assert.deepEqual(chunkedSummary344.pros, ['Pro 2', 'Pro 1']);

    const mockOffers344 = manyListingRows344.map((r, idx) => ({
      id: r.id,
      platform: 'shopee',
      title: `Listing ${idx + 1}`,
      price_current: 27990000,
      price_original: 29990000,
      stock: 10,
      rating_star: 4.9,
      rating_count: 20,
      url: `https://shopee.vn/i.1.${idx + 1}`,
      merchant: {
        id: 'merch-1',
        name: 'Official Store',
        platform: 'shopee',
        is_official: true,
        rating_star: 4.9,
        follower_count: 1000,
        location: 'VN',
        risk_score: 5,
        dosafe_risk_score: 5,
        review_risk_score: 5,
        review_risk_breakdown: null,
      },
    }));
    const chunkedPriceHistory344 = await getMasterProductPriceHistory(
      'master-16pm',
      mockOffers344
    );
    assert.equal(
      priceHistoryChunksCalled,
      2,
      'getMasterProductPriceHistory must chunk 160 productIds into 2 requests of <=150 IDs (#344)'
    );
    assert.equal(
      priceExtremeChunksCalled,
      4,
      'getMasterProductPriceHistory must read the all-time low and high per chunk (#464)'
    );
    const crawlerPoints344 = chunkedPriceHistory344.points.filter(
      (p) => p.source === 'crawler'
    );
    assert.equal(crawlerPoints344.length, 2);
    assert.equal(crawlerPoints344[0]?.product_id, 'prod-1');
    assert.equal(crawlerPoints344[1]?.product_id, 'prod-155');

    // 64.5 inspectProductOrShopUrl throws RateDataUnavailableError on DB failure
    globalThis.fetch = (async () =>
      jsonResp344(500, {
        message: 'simulated inspect DB failure',
      })) as typeof fetch;
    await assert.rejects(
      () => inspectProductOrShopUrl('https://shopee.vn/i.88201679.24871920101'),
      (err: unknown) => err instanceof RateDataUnavailableError
    );
  } finally {
    globalThis.fetch = origFetch344;
  }

  console.log(
    '  ✅ [64/65] RateDataUnavailableError propagation, RPC row image normalization & >150 IN-filter chunking (#344) passed'
  );

  // 65. Issue #345: REST API v1 CORS headers, exact batch deal_radar on GET /api/v1/rate/products, and extension lookup URL/externalId resolution
  assert.equal(
    extractKeywordFromProductUrl(
      'https://shopee.vn/Apple-iPhone-16-Pro-Max-256GB-i.88201679.24871920101?sp_atk=abc'
    ),
    'Apple iPhone 16 Pro Max 256GB'
  );
  assert.equal(
    extractKeywordFromProductUrl(
      'https://www.lazada.vn/products/samsung-galaxy-s25-ultra-256gb-i2123456-s9876543.html'
    ),
    'samsung galaxy s25 ultra 256gb'
  );
  assert.equal(
    extractKeywordFromProductUrl(
      'https://cellphones.com.vn/iphone-16-pro-max.html'
    ),
    'iphone 16 pro max'
  );
  assert.equal(
    extractKeywordFromProductUrl('https://shopee.vn/i.88201679.24871920101'),
    ''
  );

  const inspectOptRes345 = await inspectRoute.OPTIONS();
  assert.equal(inspectOptRes345.status, 204);
  assert.equal(
    inspectOptRes345.headers.get('access-control-allow-origin'),
    '*',
    'OPTIONS /api/v1/rate/inspect must include Access-Control-Allow-Origin: * (#345)'
  );

  const lookupRoute345 = await import('../../../app/api/v1/rate/lookup/route');
  const lookupOptRes345 = await lookupRoute345.OPTIONS();
  assert.equal(lookupOptRes345.status, 204);
  assert.equal(
    lookupOptRes345.headers.get('access-control-allow-origin'),
    '*',
    'OPTIONS /api/v1/rate/lookup must include Access-Control-Allow-Origin: * (#345)'
  );

  const lookup400Res345 = await lookupRoute345.GET(
    new NextRequest('https://rate.vn/api/v1/rate/lookup?url=')
  );
  assert.equal(lookup400Res345.status, 400);
  assert.equal(
    lookup400Res345.headers.get('access-control-allow-origin'),
    '*',
    'GET /api/v1/rate/lookup 400 response must include Access-Control-Allow-Origin: * (#345)'
  );

  const inspect400Res345 = await inspectRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/inspect?q=')
  );
  assert.equal(inspect400Res345.status, 400);
  assert.equal(
    inspect400Res345.headers.get('access-control-allow-origin'),
    '*',
    'GET /api/v1/rate/inspect 400 response must include Access-Control-Allow-Origin: * (#345)'
  );

  const compare400Res345 = await compareRoute.GET(
    new NextRequest('https://rate.vn/api/v1/rate/compare?slugs=')
  );
  assert.equal(compare400Res345.status, 400);
  assert.equal(
    compare400Res345.headers.get('access-control-allow-origin'),
    '*',
    'GET /api/v1/rate/compare 400 response must include Access-Control-Allow-Origin: * (#345)'
  );

  const productSlugRoute345 =
    await import('../../../app/api/v1/rate/products/[slug]/route');
  const slug400Res345 = await productSlugRoute345.GET(
    new NextRequest('https://rate.vn/api/v1/rate/products/INVALID SLUG!'),
    { params: Promise.resolve({ slug: 'INVALID SLUG!' }) }
  );
  assert.equal(slug400Res345.status, 400);
  assert.equal(
    slug400Res345.headers.get('access-control-allow-origin'),
    '*',
    'GET /api/v1/rate/products/[slug] 400 response must include Access-Control-Allow-Origin: * (#345)'
  );

  const origFetch345 = globalThis.fetch;
  try {
    // 65.1 GET /api/v1/rate/products computes deal_radar via exact batch offers & includes CORS headers
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/rest/v1/master_products')) {
        return new Response(
          JSON.stringify([
            {
              id: 'master-radar-345',
              slug: 'apple-iphone-16-pro-max-256gb',
              name: 'Apple iPhone 16 Pro Max 256GB',
              brand: 'Apple',
              model: 'iPhone 16 Pro Max',
              storage_gb: 256,
              ram_gb: 8,
              thumbnail: '/img/devices/apple-iphone-16-pro-max-256gb.jpg',
              images: ['/img/devices/apple-iphone-16-pro-max-256gb.jpg'],
              key_specs: {},
              specifications: {},
              min_price: 27990000,
              max_price: 34990000,
              avg_rating: 9.4,
              user_rating_avg: 9.3,
              user_rating_count: 120,
              editor_rating: 9.5,
              total_reviews: 120,
              total_sold: 500,
              offer_count: 2,
              category_id: 'cat-smartphones',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/products')) {
        return new Response(
          JSON.stringify([
            {
              id: 'offer-fake-345',
              cluster_id: 'master-radar-345',
              platform: 'shopee',
              title: 'Apple iPhone 16 Pro Max 256GB',
              price_current: 31500000,
              price_original: 45990000,
              stock: 5,
              rating_star: 4.8,
              rating_count: 50,
              url: 'https://shopee.vn/i.88201679.24871920101',
              merchant_id: 'merch-345',
            },
            {
              id: 'offer-fair-345',
              cluster_id: 'master-radar-345',
              platform: 'lazada',
              title: 'Apple iPhone 16 Pro Max 256GB',
              price_current: 28990000,
              price_original: 29990000,
              stock: 10,
              rating_star: 4.9,
              rating_count: 80,
              url: 'https://www.lazada.vn/products/i2123456-s9876543.html',
              merchant_id: 'merch-345',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/merchants')) {
        return new Response(
          JSON.stringify([
            {
              id: 'merch-345',
              name: 'Apple Flagship Store',
              platform: 'shopee',
              is_official: true,
              rating_star: 4.9,
              follower_count: 500000,
              location: 'TP. Hồ Chí Minh',
              risk_score: 5,
              dosafe_risk_score: 5,
              review_risk_score: 5,
              review_risk_breakdown: null,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const prodRes345 = await productsRoute.GET(
      new NextRequest(
        'https://rate.vn/api/v1/rate/products?limit=5&sort=invalid_sort_param'
      )
    );
    assert.equal(prodRes345.status, 200);
    assert.equal(
      prodRes345.headers.get('access-control-allow-origin'),
      '*',
      'GET /api/v1/rate/products 200 response must include Access-Control-Allow-Origin: * (#345)'
    );
    const prodBody345 = (await prodRes345.json()) as {
      ok: boolean;
      data: Array<{ slug: string; deal_radar: { status: string } | null }>;
    };
    assert.equal(prodBody345.ok, true);
    assert.ok(
      prodBody345.data[0]?.deal_radar !== null,
      'GET /api/v1/rate/products must compute deal_radar directly for returned page items (#345)'
    );

    // 65.2 lookupExtensionProduct resolves externalId-only via products.platform_item_id -> master_products
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (
        url.includes('/rest/v1/products') &&
        url.includes('platform_item_id=in.')
      ) {
        return new Response(
          JSON.stringify([
            {
              cluster_id: 'master-ext-345',
              platform_item_id: '88201679_24871920101',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (
        url.includes('/rest/v1/master_products') &&
        url.includes('id=eq.master-ext-345')
      ) {
        return new Response(
          JSON.stringify({
            id: 'master-ext-345',
            slug: 'apple-iphone-16-pro-max-256gb',
            name: 'Apple iPhone 16 Pro Max 256GB',
            brand: 'Apple',
            model: 'iPhone 16 Pro Max',
            storage_gb: 256,
            ram_gb: 8,
            thumbnail: 'https://broken.example/img.jpg',
            images: [],
            key_specs: {},
            specifications: {},
            min_price: 28990000,
            max_price: 32990000,
            avg_rating: 9.4,
            user_rating_avg: 9.3,
            user_rating_count: 100,
            editor_rating: 9.5,
            total_reviews: 100,
            total_sold: 400,
            offer_count: 1,
            category_id: 'cat-smartphones',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (
        url.includes('/rest/v1/products') &&
        url.includes('cluster_id=eq.master-ext-345')
      ) {
        return new Response(
          JSON.stringify([
            {
              id: 'offer-ext-345',
              cluster_id: 'master-ext-345',
              platform: 'shopee',
              title: 'Apple iPhone 16 Pro Max 256GB',
              price_current: 28990000,
              price_original: 30990000,
              stock: 8,
              rating_star: 4.9,
              rating_count: 100,
              url: 'https://shopee.vn/i.88201679.24871920101',
              merchant_id: null,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const extByIdResult = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '88201679_24871920101',
      mode: 'pill',
    });
    assert.equal(
      extByIdResult.matchStatus,
      'exact_listing',
      'lookupExtensionProduct with externalId-only must resolve exact_listing via products.platform_item_id (#345)'
    );
    assert.equal(
      extByIdResult.masterProduct?.slug,
      'apple-iphone-16-pro-max-256gb'
    );
    assert.equal(
      extByIdResult.masterProduct?.thumbnail,
      '/img/devices/apple-iphone-16-pro-max-256gb.jpg',
      'lookupExtensionProduct must normalize master_products row thumbnail (#345)'
    );

    // 65.3 Unknown externalId-only lookup must return not_found instead of random catalog product
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const unknownExtResult = await lookupExtensionProduct({
      platform: 'shopee',
      externalId: '99999999_88888888',
      mode: 'pill',
    });
    assert.equal(
      unknownExtResult.matchStatus,
      'not_found',
      'Unknown externalId-only lookup must return not_found rather than falling back to unfiltered getMasterProducts (#345)'
    );
    assert.equal(unknownExtResult.masterProduct, null);
  } finally {
    globalThis.fetch = origFetch345;
  }

  console.log(
    '  ✅ [65/65] REST API v1 CORS headers, exact batch deal_radar & Extension Lookup URL/externalId resolution (#345) passed'
  );

  // =========================================================================
  // 66. Platform Stats Head Counts, Category Slug Stamping, Leaderboard Radar Batching & Watchlist Outlier Guard (#386)
  // =========================================================================
  const origFetch386 = globalThis.fetch;
  try {
    const { normalizeMasterProductRow, getRatePlatformStats } =
      await import('@/lib/rate-api');
    const { NextRequest } = await import('next/server');

    // 66.1 normalizeMasterProductRow stamps metadata.category_slug & expanded getMasterProductCategorySlug regexes
    const stampedLaptop = normalizeMasterProductRow(
      {
        id: 'mp-dell-7450',
        slug: 'dell-latitude-7450',
        name: 'Dell Latitude 7450',
        brand: 'Dell',
        model: 'Latitude 7450',
        model_key: 'dell_latitude_7450',
        min_price: 25000000,
        max_price: 28000000,
      } as unknown as Parameters<typeof normalizeMasterProductRow>[0],
      'laptops'
    );
    assert.equal(
      (stampedLaptop.metadata as Record<string, unknown>)?.category_slug,
      'laptops',
      'normalizeMasterProductRow must stamp metadata.category_slug when categorySlugHint is passed (#386)'
    );
    assert.equal(
      getMasterProductCategorySlug({
        slug: 'dell-latitude-7450',
        name: 'Dell Latitude 7450',
        model: 'Latitude 7450',
      }),
      'laptops',
      'getMasterProductCategorySlug must classify Dell Latitude as laptops (#386)'
    );
    assert.equal(
      getMasterProductCategorySlug({
        slug: 'lenovo-tab-p12',
        name: 'Lenovo Tab P12',
        model: 'Tab P12',
      }),
      'tablets',
      'getMasterProductCategorySlug must classify Lenovo Tab as tablets (#386)'
    );
    assert.equal(
      getMasterProductCategorySlug({
        slug: 'coros-pace-3',
        name: 'Coros Pace 3',
        model: 'Pace 3',
      }),
      'smartwatches',
      'getMasterProductCategorySlug must classify Coros Pace as smartwatches (#386)'
    );
    assert.equal(
      getMasterProductCategorySlug({
        slug: 'bose-quietcomfort-ultra-earbuds',
        name: 'Bose QuietComfort Ultra Earbuds',
        model: 'QuietComfort Ultra Earbuds',
      }),
      'earbuds',
      'getMasterProductCategorySlug must classify Bose QuietComfort as earbuds (#386)'
    );

    // 66.2 getRatePlatformStats uses exact HEAD counts and scoped .in('id', sampleProductIds)
    const statsFetchedUrls: Array<{ url: string; method: string }> = [];
    let returnedStatsMasterPage = false;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      statsFetchedUrls.push({ url, method });

      if (url.includes('/rest/v1/master_products')) {
        if (returnedStatsMasterPage) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        returnedStatsMasterPage = true;
        return new Response(
          JSON.stringify([
            {
              id: 'mp-stats-1',
              name: 'Samsung Galaxy S24 Ultra',
              slug: 'samsung-galaxy-s24-ultra',
              category_id: null,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/merchants') && method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/320',
          },
        });
      }
      if (url.includes('/rest/v1/products') && method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/18450',
          },
        });
      }
      if (url.includes('/rest/v1/price_history') && method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/145000',
          },
        });
      }
      if (url.includes('/rest/v1/reviews') && method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/92300',
          },
        });
      }
      if (url.includes('/rest/v1/reviews') && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              id: 'rev-stats-1',
              product_id: 'prod-sample-1',
              author_name: 'Minh',
              rating_star: 5,
              comment: 'Pin trâu, màn hình nét, giao hàng cực nhanh.',
              created_at: '2026-10-18T10:00:00.000Z',
              review_flags: [],
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (
        url.includes('/rest/v1/products') &&
        method === 'GET' &&
        url.includes('id=in.')
      ) {
        return new Response(
          JSON.stringify([
            {
              id: 'prod-sample-1',
              title: 'Samsung Galaxy S24 Ultra 256GB Chính Hãng',
              cluster_id: 'mp-stats-1',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const platformStats = await getRatePlatformStats();
    assert.equal(
      platformStats.listingsCount,
      18450,
      'getRatePlatformStats must read listingsCount from exact HEAD count (#386)'
    );
    assert.equal(
      platformStats.totalReviewsCount,
      92300,
      'getRatePlatformStats must read totalReviewsCount from exact HEAD count (#386)'
    );
    assert.equal(
      platformStats.recentReviewsSample[0]?.masterSlug,
      'samsung-galaxy-s24-ultra',
      'getRatePlatformStats must resolve recent review masterSlug via scoped .in(id, sampleProductIds) (#386)'
    );
    assert.ok(
      !statsFetchedUrls.some(
        (req) =>
          req.url.includes('/rest/v1/products') &&
          req.method === 'GET' &&
          !req.url.includes('id=in.')
      ),
      'getRatePlatformStats must never scan the entire products table via unfiltered GET (#386)'
    );

    // 66.3 GET /api/v1/rate/leaderboard computes deal_radar via getMasterProductOffersBatch and returns CORS on 500
    const { GET: getLeaderboardRoute } =
      await import('@/app/api/v1/rate/leaderboard/route');
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'DB failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const lbErrRes = await getLeaderboardRoute(
      new NextRequest(
        'https://rate.vn/api/v1/rate/leaderboard?category=earbuds&brand=bose-err-386'
      )
    );
    assert.equal(lbErrRes.status, 500);
    assert.equal(
      lbErrRes.headers.get('access-control-allow-origin'),
      '*',
      'GET /api/v1/rate/leaderboard 500 response must include Access-Control-Allow-Origin: * (#386)'
    );

    // 66.4 GET /api/v1/rate/watchlist filters out > MAX_VALID_VND_PRICE and normalizes inverted price_original
    const { GET: getWatchlistRoute } =
      await import('@/app/api/v1/rate/watchlist/route');
    let returnedWatchOffersPage = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/rest/v1/master_products')) {
        return new Response(
          JSON.stringify({
            id: 'mp-watch-386',
            slug: 'apple-iphone-16-watch-386',
            name: 'Apple iPhone 16 Pro Max 256GB',
            brand: 'Apple',
            model: 'iPhone 16 Pro Max',
            min_price: 28990000,
            max_price: 31990000,
            avg_rating: 9.4,
            user_rating_avg: 9.3,
            editor_rating: 9.5,
            offer_count: 2,
            merchant_count: 2,
            thumbnail: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/v_products_with_merchant_trust')) {
        if (returnedWatchOffersPage) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        returnedWatchOffersPage = true;
        return new Response(
          JSON.stringify([
            {
              id: 'prod-outlier-999m',
              cluster_id: 'mp-watch-386',
              platform: 'shopee',
              title: 'Outlier Placeholder Listing',
              price_current: 999999999,
              price_original: 999999999,
              stock: 5,
              rating_star: 4.9,
              rating_count: 10,
              url: 'https://shopee.vn/outlier',
              merchant_id: 'merch-watch-1',
              merchant_name: 'Apple Flagship Store',
              merchant_is_official: true,
              merchant_location: 'TP.HCM',
              threat_risk_score: 4,
              dosafe_risk_score: 4,
              review_risk_score: 4,
              review_risk_breakdown: null,
            },
            {
              id: 'prod-valid-inverted',
              cluster_id: 'mp-watch-386',
              platform: 'shopee',
              title: 'Apple iPhone 16 Pro Max 256GB VN/A',
              price_current: 28990000,
              price_original: 25000000, // inverted original < current
              stock: 5,
              rating_star: 4.9,
              rating_count: 50,
              url: 'https://shopee.vn/valid',
              merchant_id: 'merch-watch-1',
              merchant_name: 'Apple Flagship Store',
              merchant_is_official: true,
              merchant_location: 'TP.HCM',
              threat_risk_score: 4,
              dosafe_risk_score: 4,
              review_risk_score: 4,
              review_risk_breakdown: null,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const watchRes = await getWatchlistRoute(
      new NextRequest(
        'https://rate.vn/api/v1/rate/watchlist?slugs=apple-iphone-16-watch-386'
      )
    );
    assert.equal(watchRes.status, 200);
    const watchBody = (await watchRes.json()) as {
      ok: boolean;
      items: Record<
        string,
        {
          slug: string;
          best_offer: { price: number; original_price: number | null } | null;
        }
      >;
    };
    assert.equal(watchBody.ok, true);
    assert.equal(
      watchBody.items['apple-iphone-16-watch-386']?.best_offer?.price,
      28990000,
      'Watchlist best_offer must ignore placeholder prices > MAX_VALID_VND_PRICE (#386)'
    );
    assert.equal(
      watchBody.items['apple-iphone-16-watch-386']?.best_offer?.original_price,
      28990000,
      'Watchlist best_offer must normalize inverted price_original < price_current (#386)'
    );
  } finally {
    globalThis.fetch = origFetch386;
  }

  console.log(
    '  ✅ [66/67] Platform Stats head counts, Category Slug stamping, Leaderboard batch radar & Watchlist outlier guard (#386) passed'
  );

  // =========================================================================
  // 67. Worst Fake-Sale Trap Selection, Canonical Cache Keys/Tag Cascade & OpenAPI Parity (#396)
  // =========================================================================
  {
    const {
      RATE_CACHE_TAGS,
      buildRateOpenApiSpec,
      canonicalizeCacheParams,
      computeCrossPlatformDealRadarFromData,
      resolveRevalidationTargets,
    } = await import('@/server/rate');

    // 67.1 computeCrossPlatformDealRadarFromData selects the worst fake-sale trap regardless of offer order
    const radarMaster = {
      id: 'mp-trap-396',
      slug: 'apple-iphone-16-pro-max-256gb',
      name: 'Apple iPhone 16 Pro Max 256GB',
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      model_key: 'apple_iphone_16_pro_max_256gb',
      min_price: 28000000,
      max_price: 31000000,
      expert_rating: 9.4,
    } as unknown as Parameters<
      typeof computeCrossPlatformDealRadarFromData
    >[0][number]['master'];

    const makeOffer = (
      id: string,
      platform: string,
      priceCurrent: number,
      priceOriginal: number | null
    ) => ({
      id,
      platform,
      title: `Offer ${id}`,
      price_current: priceCurrent,
      price_original: priceOriginal,
      stock: 5,
      rating_star: 4.9,
      rating_count: 40,
      url: `https://example.com/${id}`,
      merchant: {
        id: `m-${id}`,
        name: `Merchant ${id}`,
        platform,
        is_official: true,
        rating_star: 4.9,
        follower_count: 10000,
        location: 'HN',
        risk_score: 5,
        dosafe_risk_score: 5,
        review_risk_score: 5,
        review_risk_breakdown: null,
      },
    });

    // Median across [28M, 30M, 30.5M] is 30M.
    // Offer 'trap-small' has original 33.6M (+12% markup over 30M median) and appears FIRST.
    // Offer 'trap-worst' has original 45M (+50% markup over 30M median) and appears SECOND.
    const radarResult = computeCrossPlatformDealRadarFromData([
      {
        master: radarMaster,
        offers: [
          makeOffer('fair-floor', 'tiki', 28000000, 29000000),
          makeOffer('trap-small', 'shopee', 30000000, 33600000),
          makeOffer('trap-worst', 'lazada', 30500000, 45000000),
        ],
      },
    ]);

    assert.equal(radarResult.fakeSaleTraps.length, 1);
    assert.equal(
      radarResult.fakeSaleTraps[0]?.fakeMarkupPct,
      50,
      'computeCrossPlatformDealRadarFromData must select the worst fake-sale trap (+50% markup) even when a smaller trap (+12%) appears first (#396)'
    );
    assert.equal(radarResult.fakeSaleTraps[0]?.platform, 'lazada');

    // 67.2 canonicalizeCacheParams produces identical keys regardless of key order or undefined properties
    const keyA = canonicalizeCacheParams({
      categorySlug: 'smartphones',
      limit: 24,
      brand: undefined,
      ramGb: [8, 12],
    });
    const keyB = canonicalizeCacheParams({
      ramGb: [8, 12],
      limit: 24,
      categorySlug: 'smartphones',
    });
    assert.equal(
      keyA,
      keyB,
      'canonicalizeCacheParams must produce key-order-independent JSON strings and strip undefined properties (#396)'
    );

    // 67.3 resolveRevalidationTargets cascades stats, products, and deals tags
    const catTargets = resolveRevalidationTargets({
      categories: ['Smartphones'],
    });
    assert.ok(
      catTargets.tags.includes('rate:category:smartphones') &&
        catTargets.tags.includes(RATE_CACHE_TAGS.CATEGORIES) &&
        catTargets.tags.includes(RATE_CACHE_TAGS.PRODUCTS) &&
        catTargets.tags.includes(RATE_CACHE_TAGS.DEALS) &&
        catTargets.tags.includes(RATE_CACHE_TAGS.STATS),
      'Category revalidation must cascade to rate:category:<slug>, categories, products, deals, and stats (#396)'
    );

    const slugTargets = resolveRevalidationTargets({
      slugs: ['apple-iphone-16-pro-max-256gb'],
    });
    assert.ok(
      slugTargets.tags.includes(RATE_CACHE_TAGS.STATS),
      'Product slug revalidation must also invalidate rate:stats (#396)'
    );

    const merchantTargets = resolveRevalidationTargets({
      merchants: ['shopee-88201679'],
    });
    assert.ok(
      merchantTargets.tags.includes(RATE_CACHE_TAGS.STATS),
      'Merchant revalidation must also invalidate rate:stats (#396)'
    );

    // 67.4 OpenAPI 3.1.0 spec aligns GET /api/v1/rate/products sort enum and documents /api/health
    const openApiDoc = buildRateOpenApiSpec('https://rate.vn');
    const productsSortParam = openApiDoc.paths[
      '/api/v1/rate/products'
    ]?.get?.parameters?.find((p) => p.name === 'sort');
    assert.deepEqual(
      productsSortParam?.schema.enum,
      [
        'default',
        'rating_desc',
        'price_asc',
        'price_desc',
        'merchants_desc',
        'newest',
      ],
      'OpenAPI GET /api/v1/rate/products sort enum must match actual supported sort values (#396)'
    );
    assert.equal(
      openApiDoc.paths['/api/health']?.get?.operationId,
      'getHealthStatus',
      'OpenAPI spec must document /api/health endpoint (#396)'
    );
  }

  console.log(
    '  ✅ [67/68] Worst Fake-Sale Trap selection, Canonical Cache Keys/Tag Cascade & OpenAPI parity (#396) passed'
  );

  // =========================================================================
  // 68. Leaderboard Engine Price Segment Guards, 10-Point User Normalization & Category-Aware Criteria (#399)
  // =========================================================================
  {
    const {
      scoreMasterProductForLeaderboard: scoreFromDomain,
      rankMasterProductsForLeaderboard: rankFromDomain,
      computeJReviewsCriteriaScores: criteriaFromDomain,
    } = await import('@/lib/rate-domain');

    assert.equal(
      typeof scoreFromDomain,
      'function',
      'rate-domain.ts must re-export scoreMasterProductForLeaderboard (#399)'
    );
    assert.equal(
      typeof rankFromDomain,
      'function',
      'rate-domain.ts must re-export rankMasterProductsForLeaderboard (#399)'
    );
    assert.equal(
      typeof criteriaFromDomain,
      'function',
      'rate-domain.ts must re-export computeJReviewsCriteriaScores (#399)'
    );

    // 68.1 10-point scale user rating normalization (9.2 -> 4.60 instead of clamped 5.00)
    const tenPointUserProduct = {
      id: '00000000-0000-0000-0000-000000000399',
      brand: 'Sony',
      model: 'WF-1000XM5',
      model_key: 'sony-wf-1000xm5',
      name: 'Sony WF-1000XM5 Wireless Earbuds',
      slug: 'sony-wf-1000xm5',
      has_5g: false,
      specifications: {
        design: { resistance: 'IPX4', weight_g: 11.8 },
        connectivity: { bluetooth: '5.3' },
        multimedia: { audio_features: 'ANC, LDAC, Hi-Res Audio' },
        battery: { capacity_mah: 500, charging: 'USB-C & Qi Wireless' },
      },
      key_specs: { chip: 'Integrated Processor V2' },
      images: [],
      colors: [],
      min_price: 5_490_000,
      max_price: 5_990_000,
      merchant_count: 6,
      total_reviews: 28,
      average_rating: 4.6,
      user_rating_weighted: 9.2,
      expert_rating: 9.0,
      authentic_review_count: 25,
      status: 'published' as const,
      metadata: { category_slug: 'earbuds' },
    };

    const scoredEarbud = scoreFromDomain(tenPointUserProduct, 'combined');
    assert.equal(
      scoredEarbud.userScore5,
      4.6,
      'scoreMasterProductForLeaderboard must normalize 10-point user_rating_weighted (9.2 -> 4.6) instead of clamping to 5.0 (#399)'
    );
    assert.equal(scoredEarbud.categorySlug, 'earbuds');

    // 68.2 Category-aware criteria fallback deltas for earbuds (no -0.04 penalty for missing refresh_rate_hz)
    // base5 = 4.6 * 0.55 + 4.5 * 0.45 = 2.53 + 2.025 = 4.56
    assert.ok(
      scoredEarbud.criteria.screen > 4.56,
      `Earbuds with IPX4 design must receive positive screen/design delta (${scoredEarbud.criteria.screen} > 4.56) instead of -0.04 smartphone refresh rate penalty (#399)`
    );
    assert.ok(
      scoredEarbud.criteria.camera >= 4.7,
      `Earbuds with ANC + LDAC must receive positive audio criterion delta (${scoredEarbud.criteria.camera}) (#399)`
    );
    assert.ok(
      scoredEarbud.criteria.battery >= 4.7,
      `Earbuds with 500mAh case must receive positive battery delta (${scoredEarbud.criteria.battery}) (#399)`
    );

    // 68.3 Unpriced (min_price = 0) products excluded from non-'all' priceSegments & sorted after priced ties
    const unpricedClone = {
      ...tenPointUserProduct,
      id: '00000000-0000-0000-0000-000000000400',
      slug: 'aaa-unpriced-earbud',
      name: 'AAA Unpriced Earbud',
      min_price: 0,
      max_price: 0,
      // Give unpriced clone identical criteria via explicit expert_criteria_scores so scores tie
      expert_criteria_scores: { ...scoredEarbud.criteria },
    };
    const pricedClone = {
      ...tenPointUserProduct,
      id: '00000000-0000-0000-0000-000000000401',
      slug: 'zzz-priced-earbud',
      name: 'ZZZ Priced Earbud',
      min_price: 5_490_000,
      max_price: 5_990_000,
      expert_criteria_scores: { ...scoredEarbud.criteria },
    };

    const under15mRanked = rankFromDomain([unpricedClone, pricedClone], {
      category: 'earbuds',
      criterion: 'combined',
      priceSegment: 'under15m',
    });
    assert.equal(
      under15mRanked.length,
      1,
      'under15m priceSegment must exclude unpriced (min_price = 0) products (#399)'
    );
    assert.equal(under15mRanked[0]?.slug, 'zzz-priced-earbud');

    const allSegmentTiedRanked = rankFromDomain([unpricedClone, pricedClone], {
      category: 'earbuds',
      criterion: 'combined',
      priceSegment: 'all',
    });
    assert.equal(allSegmentTiedRanked.length, 2);
    assert.equal(
      allSegmentTiedRanked[0]?.slug,
      'zzz-priced-earbud',
      'Priced product must win tie-breaker over unpriced (min_price = 0) product (#399)'
    );
    assert.equal(allSegmentTiedRanked[1]?.slug, 'aaa-unpriced-earbud');

    // 68.4 Search query matches key_specs.chip in rankMasterProductsForLeaderboard & LeaderboardExplorer uses scoreMasterProductForLeaderboard
    const chipSearched = rankFromDomain([pricedClone], {
      category: 'earbuds',
      query: 'processor v2',
    });
    assert.equal(
      chipSearched.length,
      1,
      'rankMasterProductsForLeaderboard query must match key_specs.chip (#399)'
    );

    const lbExplorerSrc399 = fs.readFileSync(
      path.join(
        repoRoot,
        'apps/web/src/components/leaderboard/LeaderboardExplorer.tsx'
      ),
      'utf8'
    );
    assert.ok(
      lbExplorerSrc399.includes('scoreMasterProductForLeaderboard(') &&
        lbExplorerSrc399.includes('if (minPrice <= 0) return false;'),
      'LeaderboardExplorer.tsx must delegate scoring to scoreMasterProductForLeaderboard and guard minPrice <= 0 in price segments (#399)'
    );
  }

  console.log(
    '  ✅ [68/69] Leaderboard Engine price segment guards, 10-point user normalization & category-aware criteria (#399) passed'
  );

  // =========================================================================
  // 69. Public Write Routes Hardening: Voter Eligibility, Malformed Ingest JSON, CORS & Stats Cache Revalidation (#402)
  // =========================================================================
  {
    const voteRoute402 = await import('@/app/api/reviews/[id]/vote/route');
    const ingestRoute402 =
      await import('@/app/api/v1/rate/extension/ingest/route');

    // 69.1 evaluateVoterEligibility rejects is_anonymous: true and single-field email_confirmed_at: null (when phone_confirmed_at is omitted)
    assert.equal(
      voteRoute402.evaluateVoterEligibility({
        created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        email_confirmed_at: new Date().toISOString(),
        is_anonymous: true,
      }).eligible,
      false,
      'Anonymous accounts must be rejected by evaluateVoterEligibility (#402)'
    );
    assert.equal(
      voteRoute402.evaluateVoterEligibility({
        created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        email_confirmed_at: null,
      }).eligible,
      false,
      'Account with email_confirmed_at: null and omitted phone_confirmed_at must be rejected (#402)'
    );

    // 69.2 POST /api/v1/rate/extension/ingest with malformed JSON returns 400 Bad Request + CORS instead of 500
    const badJsonIngestRes = await ingestRoute402.POST(
      new NextRequest('https://rate.vn/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.42',
        },
        body: '{invalid-json-payload',
      })
    );
    assert.equal(
      badJsonIngestRes.status,
      400,
      'POST /api/v1/rate/extension/ingest with malformed JSON must return 400 instead of 500 (#402)'
    );
    assert.equal(
      badJsonIngestRes.headers.get('access-control-allow-origin'),
      '*',
      'POST /api/v1/rate/extension/ingest 400 response must include Access-Control-Allow-Origin: * (#402)'
    );

    // 69.3 POST /api/v1/rate/reviews & POST /api/reviews/[id]/vote revalidate RATE_CACHE_TAGS.STATS
    const reviewsRouteSrc402 = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/v1/rate/reviews/route.ts'),
      'utf8'
    );
    const voteRouteSrc402 = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/reviews/[id]/vote/route.ts'),
      'utf8'
    );
    assert.ok(
      reviewsRouteSrc402.includes('RATE_CACHE_TAGS.STATS') &&
        voteRouteSrc402.includes('RATE_CACHE_TAGS.STATS') &&
        voteRouteSrc402.includes('authenticateRateRequest('),
      'POST /api/v1/rate/reviews and POST /api/reviews/[id]/vote must revalidate RATE_CACHE_TAGS.STATS and use authenticateRateRequest (#402)'
    );
  }

  console.log(
    '  ✅ [69/70] Public write routes hardening: cookie-session voting, voter eligibility, malformed ingest JSON & stats cache revalidation (#402) passed'
  );

  // =========================================================================
  // 70. CSV Formula Injection Guard, Deal Radar Index Selection & Client Store Normalization (#406)
  // =========================================================================
  {
    const { escapeCsvCell } = await import('@/lib/csv-safe');
    const { buildRadarIndex, selectMerchantRadar } =
      await import('@/lib/deal-radar');
    const { MAX_WATCHLIST_ITEMS, normalizeWatchlistItem } =
      await import('@/components/watchlist/watchlist-store');
    const { normalizeTrayItem } =
      await import('@/components/compare/compare-tray');

    // 70.1 escapeCsvCell blocks leading-whitespace and pipe (|) formula injection while preserving plain numbers
    assert.equal(
      escapeCsvCell(" =cmd|' /C calc'!A0"),
      "' =cmd|' /C calc'!A0",
      'escapeCsvCell must neutralize leading-whitespace formula payloads (#406)'
    );
    assert.equal(
      escapeCsvCell('\n=SUM(A1:A2)'),
      '"\'\n=SUM(A1:A2)"',
      'escapeCsvCell must neutralize newline-prefixed formula payloads (#406)'
    );
    assert.equal(
      escapeCsvCell('|calc!A0'),
      "'|calc!A0",
      'escapeCsvCell must neutralize pipe-prefixed DDE formula payloads (#406)'
    );
    assert.equal(
      escapeCsvCell('-15.4%'),
      '-15.4%',
      'escapeCsvCell must preserve plain negative numeric literals (#406)'
    );

    // 70.2 buildRadarIndex selects strongest genuine deal, worst fake-sale trap, and widest price spread per slug
    const radarIdx406 = buildRadarIndex({
      genuineDeals: [
        {
          id: 'gd-1',
          verdict: 'best_market_deal',
          verdictBadgeVi: 'Giá tốt',
          productSlug: 'apple-iphone-16-pro-256gb',
          productName: 'iPhone 16 Pro 256GB',
          brand: 'Apple',
          categorySlug: 'smartphones',
          productHref: '/smartphones/apple-iphone-16-pro-256gb',
          imageUrl: null,
          platform: 'shopee',
          merchantId: 'm-1',
          merchantName: 'Shop A',
          isOfficialMall: true,
          merchantRiskScore: 5,
          offerUrl: 'https://shopee.vn/a',
          priceCurrent: 25_500_000,
          priceOriginal: 28_990_000,
          marketMedianPrice: 27_000_000,
          marketMinPrice: 23_900_000,
          marketMaxPrice: 28_990_000,
          savingsVsMedianVnd: 1_500_000,
          savingsVsMedianPct: 5.6,
          claimedDiscountPct: 12,
          fakeMarkupPct: 0,
          jreviewsScore10: 9.2,
          explanationVi: 'Rẻ hơn trung vị',
        },
        {
          id: 'gd-2',
          verdict: 'genuine_all_time_low',
          verdictBadgeVi: 'Đáy giá',
          productSlug: 'apple-iphone-16-pro-256gb',
          productName: 'iPhone 16 Pro 256GB',
          brand: 'Apple',
          categorySlug: 'smartphones',
          productHref: '/smartphones/apple-iphone-16-pro-256gb',
          imageUrl: null,
          platform: 'lazada',
          merchantId: 'm-2',
          merchantName: 'Shop B',
          isOfficialMall: true,
          merchantRiskScore: 5,
          offerUrl: 'https://lazada.vn/b',
          priceCurrent: 23_900_000,
          priceOriginal: 28_990_000,
          marketMedianPrice: 27_000_000,
          marketMinPrice: 23_900_000,
          marketMaxPrice: 28_990_000,
          savingsVsMedianVnd: 3_100_000,
          savingsVsMedianPct: 11.5,
          claimedDiscountPct: 17.6,
          fakeMarkupPct: 0,
          jreviewsScore10: 9.2,
          explanationVi: 'Đáy giá lịch sử',
        },
      ],
      fakeSaleTraps: [
        {
          id: 'fst-1',
          verdict: 'inflated_fake_sale',
          verdictBadgeVi: 'Sale ảo',
          productSlug: 'samsung-galaxy-s24-ultra-256gb',
          productName: 'Galaxy S24 Ultra',
          brand: 'Samsung',
          categorySlug: 'smartphones',
          productHref: '/smartphones/samsung-galaxy-s24-ultra-256gb',
          imageUrl: null,
          platform: 'shopee',
          merchantId: 'm-3',
          merchantName: '',
          isOfficialMall: false,
          merchantRiskScore: 45,
          offerUrl: 'https://shopee.vn/c',
          priceCurrent: 26_000_000,
          priceOriginal: 32_000_000,
          marketMedianPrice: 25_500_000,
          marketMinPrice: 24_900_000,
          marketMaxPrice: 27_000_000,
          savingsVsMedianVnd: -500_000,
          savingsVsMedianPct: -2,
          claimedDiscountPct: 18.8,
          fakeMarkupPct: 25.5,
          jreviewsScore10: 9.1,
          explanationVi: 'Kê giá gốc',
        },
        {
          id: 'fst-2',
          verdict: 'inflated_fake_sale',
          verdictBadgeVi: 'Sale ảo',
          productSlug: 'samsung-galaxy-s24-ultra-256gb',
          productName: 'Galaxy S24 Ultra',
          brand: 'Samsung',
          categorySlug: 'smartphones',
          productHref: '/smartphones/samsung-galaxy-s24-ultra-256gb',
          imageUrl: null,
          platform: 'tiktok',
          merchantId: 'm-4',
          merchantName: 'Trap Shop',
          isOfficialMall: false,
          merchantRiskScore: 60,
          offerUrl: 'https://tiktok.com/d',
          priceCurrent: 26_500_000,
          priceOriginal: 39_990_000,
          marketMedianPrice: 25_500_000,
          marketMinPrice: 24_900_000,
          marketMaxPrice: 27_000_000,
          savingsVsMedianVnd: -1_000_000,
          savingsVsMedianPct: -3.9,
          claimedDiscountPct: 33.7,
          fakeMarkupPct: 56.8,
          jreviewsScore10: 9.1,
          explanationVi: 'Kê giá gốc nặng',
        },
      ],
      priceSpreadLeaders: [
        {
          id: 'sp-1',
          productSlug: 'apple-iphone-16-pro-256gb',
          productName: 'iPhone 16 Pro 256GB',
          brand: 'Apple',
          categorySlug: 'smartphones',
          productHref: '/smartphones/apple-iphone-16-pro-256gb',
          imageUrl: null,
          platformCount: 2,
          offerCount: 3,
          minPrice: 24_500_000,
          maxPrice: 27_000_000,
          medianPrice: 25_500_000,
          spreadVnd: 2_500_000,
          spreadPct: 10.2,
          cheapestPlatform: 'shopee',
          cheapestMerchantName: 'Shop A',
          cheapestOfferUrl: 'https://shopee.vn/a',
          priciestPlatform: 'lazada',
          priciestMerchantName: 'Shop X',
          explanationVi: 'Lệch 10.2%',
        },
        {
          id: 'sp-2',
          productSlug: 'apple-iphone-16-pro-256gb',
          productName: 'iPhone 16 Pro 256GB',
          brand: 'Apple',
          categorySlug: 'smartphones',
          productHref: '/smartphones/apple-iphone-16-pro-256gb',
          imageUrl: null,
          platformCount: 3,
          offerCount: 5,
          minPrice: 23_900_000,
          maxPrice: 28_500_000,
          medianPrice: 25_500_000,
          spreadVnd: 4_600_000,
          spreadPct: 19.2,
          cheapestPlatform: 'lazada',
          cheapestMerchantName: 'Shop B',
          cheapestOfferUrl: 'https://lazada.vn/b',
          priciestPlatform: 'tiktok',
          priciestMerchantName: 'Shop Y',
          explanationVi: 'Lệch 19.2%',
        },
      ],
      categoryFilter: 'all',
      totalClustersAnalyzed: 2,
      totalOffersAnalyzed: 4,
      generatedAt: new Date().toISOString(),
    });

    const ip16Sig = radarIdx406.get('apple-iphone-16-pro-256gb');
    assert.equal(
      ip16Sig?.savingsPct,
      11.5,
      'buildRadarIndex must select the strongest genuine deal savingsPct for duplicate slugs (#406)'
    );
    assert.equal(
      ip16Sig?.genuineDeal?.merchantId,
      'm-2',
      'buildRadarIndex must keep the best genuineDeal entry (#406)'
    );
    assert.equal(
      ip16Sig?.spreadPct,
      19.2,
      'buildRadarIndex must keep the widest priceSpread entry for duplicate slugs (#406)'
    );

    const s24Sig = radarIdx406.get('samsung-galaxy-s24-ultra-256gb');
    assert.equal(
      s24Sig?.fakeMarkupPct,
      56.8,
      'buildRadarIndex must select the worst fakeSaleTrap markup for duplicate slugs (#406)'
    );
    assert.equal(
      s24Sig?.fakeSaleTrap?.merchantId,
      'm-4',
      'buildRadarIndex must keep the worst fakeSaleTrap entry (#406)'
    );

    // 70.3 selectMerchantRadar refuses to match empty/whitespace merchant names
    const emptyMerchantRadar = selectMerchantRadar(
      {
        genuineDeals: [],
        fakeSaleTraps: [s24Sig!.fakeSaleTrap!],
        priceSpreadLeaders: [],
        categoryFilter: 'all',
        totalClustersAnalyzed: 1,
        totalOffersAnalyzed: 1,
        generatedAt: new Date().toISOString(),
      },
      { id: 'non-existent-id', name: '   ' }
    );
    assert.equal(
      emptyMerchantRadar.fakeTrapCount,
      0,
      'selectMerchantRadar must not match empty/whitespace merchant names (#406)'
    );

    // 70.4 normalizeWatchlistItem & normalizeTrayItem sanitize prices and infer category from categoryPath
    assert.equal(MAX_WATCHLIST_ITEMS, 50);
    const normWatch = normalizeWatchlistItem({
      slug: '  custom-tws-model  ',
      name: '  Custom Model X  ',
      brand: '  Sony  ',
      categoryPath: '/earbuds',
      thumbnail: null,
      priceWhenAdded: -50_000,
      targetPrice: 5_000_000_000,
      addedAt: '2026-10-19T00:00:00.000Z',
    });
    assert.equal(normWatch.slug, 'custom-tws-model');
    assert.equal(normWatch.categoryPath, '/earbuds');
    assert.equal(normWatch.priceWhenAdded, 0);
    assert.equal(normWatch.targetPrice, 0);

    const normTray = normalizeTrayItem({
      slug: '  apple-iphone-16-pro-256gb  ',
      name: '  iPhone 16 Pro 256GB  ',
      brand: 'Apple',
      thumbnail: 'https://broken.example.com/img.jpg',
      min_price: 9_999_999_999,
    });
    assert.equal(normTray.slug, 'apple-iphone-16-pro-256gb');
    assert.equal(
      normTray.thumbnail,
      '/img/devices/apple-iphone-16-pro-256gb.jpg'
    );
    assert.equal(normTray.min_price, 0);
  }

  console.log(
    '  ✅ [70/71] CSV formula guard, Deal Radar index selection & client store normalization (#406) passed'
  );

  // =========================================================================
  // 71. Case-Insensitive Brand Facets, Fractional TB Labels & getMasterProducts Fallback Hardening (#510)
  // =========================================================================
  {
    const { formatStorageLabel, getCategoryFilterSchema } =
      await import('@/lib/category-filters');
    const rateApi510 = await import('@/lib/rate-api');

    const laptopSchema = getCategoryFilterSchema('laptops', [
      'Asus',
      '  apple ',
      'Framework',
      'framework',
    ]);
    assert.equal(
      laptopSchema.defaultBrands.filter((b) => b.toLowerCase() === 'asus')
        .length,
      1,
      'getCategoryFilterSchema must deduplicate Asus and ASUS case-insensitively (#510)'
    );
    assert.ok(
      laptopSchema.defaultBrands.includes('ASUS'),
      'getCategoryFilterSchema must preserve canonical ASUS casing from defaultBrands (#510)'
    );
    assert.equal(
      laptopSchema.defaultBrands.filter((b) => b.toLowerCase() === 'framework')
        .length,
      1,
      'getCategoryFilterSchema must deduplicate custom dynamicBrands case-insensitively (#510)'
    );

    assert.equal(formatStorageLabel(512), '512GB');
    assert.equal(formatStorageLabel(1024), '1TB');
    assert.equal(
      formatStorageLabel(1536),
      '1.5TB',
      'formatStorageLabel must format 1536GB as 1.5TB (#510)'
    );
    assert.equal(formatStorageLabel(2048), '2TB');

    const origFetch510 = globalThis.fetch;
    try {
      let masterPageFetched = false;
      const capturedUrls510: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        capturedUrls510.push(url);

        if (url.includes('/rest/v1/rpc/get_category_brand_facets')) {
          return new Response(
            JSON.stringify({ message: 'function not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/rpc/search_master_products')) {
          return new Response(
            JSON.stringify({ message: 'function not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/categories')) {
          if (url.includes('slug=eq.')) {
            return new Response(JSON.stringify({ id: 'cat-laptops-510' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(
            JSON.stringify([
              {
                id: 'cat-laptops-510',
                name: 'Laptops',
                slug: 'laptops',
                sort_order: 3,
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/master_products')) {
          if (url.includes('select=brand%2Ccategory_id')) {
            return new Response(
              JSON.stringify([
                { brand: 'asus', category_id: 'cat-laptops-510' },
                { brand: 'Asus', category_id: 'cat-laptops-510' },
                { brand: 'ASUS ', category_id: 'cat-laptops-510' },
                { brand: 'Apple', category_id: 'cat-laptops-510' },
              ]),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }
          if (masterPageFetched) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          masterPageFetched = true;
          return new Response(
            JSON.stringify([
              {
                id: 'mp-510-1',
                category_id: 'cat-laptops-510',
                brand: 'Asus',
                model: 'ROG Zephyrus G16',
                model_key: 'asus:rog-zephyrus-g16:1024gb',
                name: 'ASUS ROG Zephyrus G16 1TB',
                slug: 'asus-rog-zephyrus-g16-1tb',
                min_price: 45_990_000,
                max_price: 48_990_000,
                merchant_count: 4,
                total_reviews: 12,
                average_rating: 4.2,
                user_rating_weighted: null,
                expert_rating: 4.9,
                status: 'published',
                specifications: {},
                key_specs: { screen: '16" 2.5K OLED 240Hz' },
              },
              {
                id: 'mp-510-2',
                category_id: 'cat-laptops-510',
                brand: 'ASUS',
                model: 'Zenbook S 14',
                model_key: 'asus:zenbook-s-14:1024gb',
                name: 'ASUS Zenbook S 14 1TB',
                slug: 'asus-zenbook-s-14-1tb',
                min_price: 39_990_000,
                max_price: 41_990_000,
                merchant_count: 5,
                total_reviews: 20,
                average_rating: 4.5,
                user_rating_weighted: 4.6,
                expert_rating: 4.5,
                status: 'published',
                specifications: { display: { refresh_rate_hz: 120 } },
                key_specs: { screen: '14" 3K OLED 120Hz' },
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const facets510 = await rateApi510.getCategoryDirectoryFacets('laptops');
      assert.equal(
        facets510.brands.length,
        2,
        'getCategoryDirectoryFacets must merge case-variant Asus/ASUS/asus into a single brand facet (#510)'
      );
      assert.equal(facets510.brands[0]?.count, 3);
      assert.equal(facets510.brands[0]?.name, 'Asus');

      masterPageFetched = false;
      const filtered510 = await rateApi510.getMasterProducts({
        categorySlug: 'laptops',
        brands: ['asus'],
        minRefreshRateHz: 165,
        sort: 'rating_desc',
      });
      assert.ok(
        !capturedUrls510.some(
          (u) =>
            u.includes('/rest/v1/master_products') && u.includes('brand=in.')
        ),
        'getMasterProducts fallback must not apply case-sensitive brand=in. SQL filter (#510)'
      );
      assert.equal(
        filtered510.length,
        1,
        'getMasterProducts fallback must match 240Hz in key_specs.screen when minRefreshRateHz=165 and match brand case-insensitively (#510)'
      );
      assert.equal(filtered510[0]?.id, 'mp-510-1');

      masterPageFetched = false;
      const sorted510 = await rateApi510.getMasterProducts({
        categorySlug: 'laptops',
        brands: ['asus'],
        sort: 'rating_desc',
      });
      assert.equal(sorted510.length, 2);
      assert.equal(
        sorted510[0]?.id,
        'mp-510-1',
        'rating_desc sort must use expert_rating (4.9) when user_rating_weighted is null (#510)'
      );
    } finally {
      globalThis.fetch = origFetch510;
    }
  }

  console.log(
    '  ✅ [71/72] Case-insensitive brand facets, fractional TB storage labels & getMasterProducts fallback hardening (#510) passed'
  );

  // 72. Issue #513: Resolve specifications.category_slug and harden merchant/stats category & review trust mapping
  {
    const rateApi513 =
      require('../../../lib/rate-api') as typeof import('../../../lib/rate-api');

    assert.equal(rateApi513.isCanonicalCategorySlug('earbuds'), true);
    assert.equal(rateApi513.isCanonicalCategorySlug('tablets'), true);
    assert.equal(rateApi513.isCanonicalCategorySlug('unknown'), false);

    // 72a. getMasterProductCategorySlug resolves specifications.category_slug even when name/slug has no keyword match
    assert.equal(
      rateApi513.getMasterProductCategorySlug({
        slug: 'marshall-motif-ii-anc',
        name: 'Marshall Motif II A.N.C.',
        category_id: null,
        metadata: null,
        specifications: { category_slug: 'earbuds' },
      }),
      'earbuds',
      'getMasterProductCategorySlug must resolve specifications.category_slug when category_id and metadata.category_slug are null (#513)'
    );
    assert.equal(
      rateApi513.getMasterProductHref({
        slug: 'marshall-motif-ii-anc',
        name: 'Marshall Motif II A.N.C.',
        specifications: { category_slug: 'earbuds' },
      }),
      '/earbuds/marshall-motif-ii-anc',
      'getMasterProductHref must route to /earbuds/[slug] when specifications.category_slug is earbuds (#513)'
    );

    // 72b. normalizeMasterProductRow stamps metadata.category_slug from specifications.category_slug
    const normalized513 = rateApi513.normalizeMasterProductRow({
      id: 'mp-513-earbud',
      slug: 'marshall-motif-ii-anc',
      name: 'Marshall Motif II A.N.C.',
      brand: 'Marshall',
      model: 'Motif II A.N.C.',
      model_key: 'marshall-motif-ii-anc-1',
      category_id: null,
      specifications: { category_slug: 'earbuds' },
      key_specs: {},
      metadata: {},
      min_price: 4990000,
      max_price: 5490000,
      merchant_count: 2,
      average_rating: 4.8,
      user_rating_weighted: 4.8,
      expert_rating: 4.7,
      total_reviews: 12,
      has_5g: false,
      colors: [],
      status: 'published',
      thumbnail: null,
      images: [],
    });
    assert.equal(
      normalized513.metadata?.category_slug,
      'earbuds',
      'normalizeMasterProductRow must populate metadata.category_slug from specifications.category_slug (#513)'
    );

    // 72c. getMerchantProfileById & getRatePlatformStats resolve specifications.category_slug and attach trust_assessment
    const origFetch513 = globalThis.fetch;
    let merchantProdsFetched = false;
    let statsMastersFetched = false;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.includes('/rest/v1/merchants') && url.includes('id=eq.')) {
          return new Response(
            JSON.stringify({
              id: '00000000-0000-4000-8000-000000000513',
              platform: 'shopee',
              platform_shop_id: 'shop-513',
              name: 'Marshall Official Store',
              slug: 'marshall-official-store',
              is_official: true,
              rating_star: 4.9,
              follower_count: 55000,
              location: 'TP. Hồ Chí Minh',
              risk_score: 5,
              metadata: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/merchants')) {
          return new Response('[]', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'content-range': '0-0/8',
            },
          });
        }
        if (url.includes('/rest/v1/categories')) {
          return new Response(
            JSON.stringify([
              {
                id: 'cat-smartphones',
                parent_id: null,
                name: 'Điện thoại',
                slug: 'smartphones',
                icon: 'smartphone',
                display_order: 1,
              },
              {
                id: 'cat-earbuds',
                parent_id: null,
                name: 'Tai nghe',
                slug: 'earbuds',
                icon: 'headphones',
                display_order: 5,
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (
          url.includes('/rest/v1/products') &&
          url.includes('merchant_id=eq.')
        ) {
          if (merchantProdsFetched) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          merchantProdsFetched = true;
          return new Response(
            JSON.stringify([
              {
                id: 'prod-513-1',
                merchant_id: '00000000-0000-4000-8000-000000000513',
                platform: 'shopee',
                platform_item_id: 'item-513-1',
                title: 'Marshall Motif II A.N.C. Chính Hãng',
                price_current: 4990000,
                price_original: 5490000,
                stock: 15,
                historical_sold: 40,
                rating_star: 4.9,
                rating_count: 18,
                images: [],
                url: 'https://shopee.vn/product/513/1',
                cluster_id: 'mp-513-earbud',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/products') && url.includes('id=in.')) {
          return new Response(
            JSON.stringify([
              {
                id: 'prod-513-1',
                title: 'Marshall Motif II A.N.C. Chính Hãng',
                cluster_id: 'mp-513-earbud',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (
          url.includes('/rest/v1/products') &&
          url.includes('cluster_id=eq.')
        ) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/rest/v1/products')) {
          return new Response('[]', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'content-range': '0-0/25',
            },
          });
        }
        if (
          url.includes('/rest/v1/master_products') &&
          url.includes('id=in.')
        ) {
          return new Response(
            JSON.stringify([
              {
                id: 'mp-513-earbud',
                slug: 'marshall-motif-ii-anc',
                name: 'Marshall Motif II A.N.C.',
                model: 'Motif II A.N.C.',
                brand: 'Marshall',
                category_id: null,
                metadata: null,
                specifications: { category_slug: 'earbuds' },
                min_price: 4990000,
                max_price: 5490000,
                merchant_count: 2,
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/master_products')) {
          if (statsMastersFetched) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          statsMastersFetched = true;
          return new Response(
            JSON.stringify([
              {
                id: 'mp-513-earbud',
                slug: 'marshall-motif-ii-anc',
                name: 'Marshall Motif II A.N.C.',
                model: 'Motif II A.N.C.',
                category_id: null,
                metadata: null,
                specifications: { category_slug: 'earbuds' },
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/reviews')) {
          return new Response(
            JSON.stringify([
              {
                id: 'rev-513-1',
                product_id: 'prod-513-1',
                author_name: 'Minh Quân',
                rating_star: 5,
                comment:
                  'Chất âm Marshall đặc trưng, chống ồn chủ động rất tốt khi đi tàu điện, pin dùng thực tế khoảng 6 tiếng liên tục.',
                variation: 'Black',
                created_at: '2026-10-18T10:00:00Z',
                reviewer_type: 'user',
                upvotes: 6,
                downvotes: 0,
                report_count: 0,
                helpfulness_weight: null,
                criteria_ratings: { audio: 4.9, battery: 4.7 },
                review_flags: {
                  verdict: 'authentic',
                  fake_probability: 0.04,
                  flag_category: 'authentic',
                  include_in_rating: true,
                  reason: 'Đánh giá chi tiết trải nghiệm thực tế',
                  signals: {},
                },
              },
            ]),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'content-range': '0-0/1',
              },
            }
          );
        }
        return new Response('[]', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/0',
          },
        });
      }) as typeof fetch;

      const merchantProfile513 = await rateApi513.getMerchantProfileById(
        '00000000-0000-4000-8000-000000000513'
      );
      assert.ok(merchantProfile513, 'merchantProfile513 must resolve (#513)');
      assert.equal(
        merchantProfile513.listings[0]?.master_product?.category_slug,
        'earbuds',
        'getMerchantProfileById must resolve category_slug via getMasterProductCategorySlug from specifications.category_slug (#513)'
      );
      assert.ok(
        merchantProfile513.recent_reviews[0]?.trust_assessment,
        'getMerchantProfileById recent_reviews must include trust_assessment (#513)'
      );

      const stats513 = await rateApi513.getRatePlatformStats();
      const earbudsCat513 = stats513.categoriesWithCounts.find(
        (c) => c.slug === 'earbuds'
      );
      assert.equal(
        earbudsCat513?.productCount,
        1,
        'getRatePlatformStats must count published products with category_id=null into their resolved canonical category (#513)'
      );
      assert.equal(
        stats513.recentReviewsSample[0]?.masterRouteHref,
        '/earbuds/marshall-motif-ii-anc',
        'getRatePlatformStats recentReviewsSample must resolve /earbuds/[slug] via specifications.category_slug (#513)'
      );
      assert.ok(
        (stats513.recentReviewsSample[0]?.helpfulness_weight ?? 0) > 1,
        'getRatePlatformStats recentReviewsSample must compute JReviews weight when helpfulness_weight is null (#513)'
      );
      assert.ok(
        stats513.recentReviewsSample[0]?.trust_assessment,
        'getRatePlatformStats recentReviewsSample must include trust_assessment (#513)'
      );
    } finally {
      globalThis.fetch = origFetch513;
    }
  }

  console.log(
    '  ✅ [72/73] specifications.category_slug resolution & merchant/stats review trust_assessment mapping (#513) passed'
  );

  // 73. Issue #517: Harden URL product keyword extraction and shop fallback in inspectProductOrShopUrl and lookupExtensionProduct
  {
    const rateApi517 =
      require('../../../lib/rate-api') as typeof import('../../../lib/rate-api');
    const extServer517 =
      require('../extension') as typeof import('../extension');

    assert.equal(
      rateApi517.extractProductKeywordFromUrl(
        'https://shopee.vn/Dien-thoai-Apple-iPhone-16-Pro-Max-256GB-Chinh-hang-VN-A-i.88201679.29512841920'
      ),
      'Apple iPhone 16 Pro Max 256GB',
      'extractProductKeywordFromUrl must strip Dien thoai and Chinh hang VN A from Shopee URLs (#517)'
    );
    assert.equal(
      rateApi517.extractProductKeywordFromUrl(
        'https://tiki.vn/tai-nghe-bluetooth-apple-airpods-pro-2-usb-c-chinh-hang-p274019283.html'
      ),
      'apple airpods pro 2 usb c',
      'extractProductKeywordFromUrl must strip tai nghe bluetooth and chinh hang from Tiki URLs (#517)'
    );
    assert.equal(
      rateApi517.extractProductKeywordFromUrl(
        'https://www.lazada.vn/products/laptop-apple-macbook-air-m3-13-inch-256gb-chinh-hang-i123456789-s987654321.html'
      ),
      'apple macbook air m3 13 inch 256gb',
      'extractProductKeywordFromUrl must strip laptop and chinh hang from Lazada URLs (#517)'
    );
    assert.equal(
      rateApi517.extractProductKeywordFromUrl(
        'https://shopee.vn/Op-lung-iPhone-16-Pro-Max-Chinh-hang-i.111.222'
      ),
      'Op lung iPhone 16 Pro Max',
      'extractProductKeywordFromUrl must preserve accessory tokens like Op lung so detectAccessoryOrJunk catches them (#517)'
    );

    const parsedAmbiguity517 = extServer517.extractStorageAndAmbiguity({
      title: 'Dien thoai Apple iPhone 16 Pro Max 256GB Chinh hang VN A',
    });
    assert.equal(
      parsedAmbiguity517.cleanModelSearchQuery,
      'Apple iPhone 16 Pro Max',
      'extractStorageAndAmbiguity must strip non-accented URL slug noise tokens (#517)'
    );
    assert.equal(parsedAmbiguity517.storageGb, 256);

    const origFetch517 = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (
          url.includes('/rest/v1/products') &&
          url.includes('platform_item_id=in.')
        ) {
          return new Response(JSON.stringify(null), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (
          url.includes('/rest/v1/merchants') &&
          url.includes('platform_shop_id=in.')
        ) {
          return new Response(
            JSON.stringify([
              {
                id: 'merch-517-apple',
                platform: 'shopee',
                platform_shop_id: '88201679',
                name: 'Apple Flagship Store',
                slug: 'apple-flagship-store',
                is_official: true,
                rating_star: 4.9,
                follower_count: 1500000,
                location: 'TP. Hồ Chí Minh',
                risk_score: 2,
                metadata: {},
                updated_at: '2026-10-19T00:00:00Z',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (
          url.includes('/rest/v1/master_products') &&
          url.includes('slug=eq.apple-iphone-16-pro-max-256gb')
        ) {
          return new Response(
            JSON.stringify({
              id: 'mp-517-ip16pm',
              slug: 'apple-iphone-16-pro-max-256gb',
              name: 'Apple iPhone 16 Pro Max 256GB',
              brand: 'Apple',
              model: 'iPhone 16 Pro Max',
              model_key: 'apple-iphone-16-pro-max-256gb',
              category_id: 'cat-smartphones',
              min_price: 29990000,
              max_price: 33990000,
              merchant_count: 4,
              average_rating: 4.9,
              user_rating_weighted: 4.9,
              expert_rating: 4.9,
              total_reviews: 120,
              has_5g: true,
              colors: ['Natural Titanium'],
              status: 'published',
              specifications: { category_slug: 'smartphones' },
              key_specs: {},
              metadata: {},
              thumbnail: null,
              images: [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/rest/v1/rpc/search_master_products')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const inspected517 = await rateApi517.inspectProductOrShopUrl(
        'https://shopee.vn/Dien-thoai-Apple-iPhone-16-Pro-Max-256GB-Chinh-hang-VN-A-i.88201679.99999999999'
      );
      assert.equal(
        inspected517.matchedType,
        'master_product',
        'inspectProductOrShopUrl must resolve unindexed e-commerce product URLs to their canonical MasterProduct (#517)'
      );
      assert.equal(
        inspected517.masterProduct?.slug,
        'apple-iphone-16-pro-max-256gb'
      );
      assert.equal(
        inspected517.merchantProfile?.platform_shop_id,
        '88201679',
        'inspectProductOrShopUrl must attach the tracked merchantProfile from parsedUrl.platformShopId even when platformItemId is not yet in rate.products (#517)'
      );

      const inspectedShopFallback517 = await rateApi517.inspectProductOrShopUrl(
        'https://shopee.vn/San-pham-chua-co-trong-danh-muc-i.88201679.88888888888'
      );
      assert.equal(
        inspectedShopFallback517.matchedType,
        'merchant',
        'inspectProductOrShopUrl must fall back to matchedType=merchant when the product is unknown but platformShopId is a tracked merchant (#517)'
      );
      assert.equal(
        inspectedShopFallback517.merchantProfile?.name,
        'Apple Flagship Store'
      );
    } finally {
      globalThis.fetch = origFetch517;
    }
  }

  console.log(
    '  ✅ [73/74] URL product keyword extraction & shop fallback in inspectProductOrShopUrl and lookupExtensionProduct (#517) passed'
  );

  // =========================================================================
  // 74. MerchantRiskBreakdown Schema Alignment, Empty JSONB Fallback & Ratio Derivation (#521)
  // =========================================================================
  {
    const { extractPersistedBreakdown, mapOfferRowToMerchantOffer } =
      await import('@/lib/rate-api');
    const domain521 = await import('@/lib/rate-domain');
    const serverRate521 = await import('@/server/rate');

    assert.equal(
      domain521.extractPersistedBreakdown,
      extractPersistedBreakdown,
      'rate-domain.ts must re-export extractPersistedBreakdown (#521)'
    );
    assert.equal(
      serverRate521.extractPersistedBreakdown,
      extractPersistedBreakdown,
      'server/rate/index.ts must re-export extractPersistedBreakdown (#521)'
    );

    // 74.1 Empty {} top-level review_risk_breakdown (Postgres DEFAULT '{}'::jsonb) falls through to metadata.review_risk_breakdown
    const fromMetaFallback = extractPersistedBreakdown({
      review_risk_breakdown: {} as never,
      metadata: {
        review_risk_breakdown: {
          total_reviews: 20,
          authentic_count: 15,
          coin_spam_count: 3,
          seeding_fake_count: 2,
          sabotage_or_bombing_count: 0,
          suspicious_ratio_pct: 25,
        },
      },
    });
    assert.deepEqual(
      fromMetaFallback,
      {
        total_reviews: 20,
        authentic_count: 15,
        coin_spam_count: 3,
        seeding_fake_count: 2,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 25,
      },
      'extractPersistedBreakdown must fall back to metadata.review_risk_breakdown when top-level review_risk_breakdown is an empty {} JSONB object (#521)'
    );

    // 74.2 Ratio-based breakdown payload with total_reviews derives missing counts and suspicious_ratio_pct
    const fromRatios = extractPersistedBreakdown({
      review_risk_breakdown: {
        total_reviews: 40,
        seeding_ratio: 0.25,
        coin_spam_ratio: 0.1,
        sabotage_ratio: 0.05,
      } as never,
      metadata: null,
    });
    assert.deepEqual(
      fromRatios,
      {
        total_reviews: 40,
        authentic_count: 24,
        coin_spam_count: 4,
        seeding_fake_count: 10,
        sabotage_or_bombing_count: 2,
        suspicious_ratio_pct: 40,
      },
      'extractPersistedBreakdown must derive authentic_count, coin_spam_count, seeding_fake_count, sabotage_or_bombing_count, and suspicious_ratio_pct from ratio fields when explicit count fields are absent (#521)'
    );

    // 74.3 mapOfferRowToMerchantOffer ignores empty {} top-level review_risk_breakdown and falls back to metadata.review_risk_breakdown
    const offer521 = mapOfferRowToMerchantOffer({
      id: 'offer-521',
      cluster_id: 'master-521',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB',
      price_current: 28_990_000,
      price_original: 34_990_000,
      stock: 10,
      rating_star: 4.9,
      rating_count: 120,
      url: 'https://shopee.vn/product/1/2',
      merchants: {
        id: 'merch-521',
        name: 'Shop 521',
        platform: 'shopee',
        is_official: true,
        rating_star: 4.9,
        follower_count: 50000,
        location: 'TP. Hồ Chí Minh',
        risk_score: 5,
        review_risk_score: 15,
        review_risk_breakdown: {},
        metadata: {
          review_risk_breakdown: {
            total_reviews: 10,
            authentic_count: 9,
            coin_spam_count: 1,
            seeding_fake_count: 0,
            sabotage_or_bombing_count: 0,
            suspicious_ratio_pct: 10,
          },
        },
      },
    });
    assert.deepEqual(
      offer521.merchant.review_risk_breakdown,
      {
        total_reviews: 10,
        authentic_count: 9,
        coin_spam_count: 1,
        seeding_fake_count: 0,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 10,
      },
      'mapOfferRowToMerchantOffer must ignore empty {} top-level review_risk_breakdown and fall back to metadata.review_risk_breakdown (#521)'
    );
  }

  console.log(
    '  ✅ [74/75] MerchantRiskBreakdown Schema Alignment, Empty JSONB Fallback & Ratio Derivation (#521) passed'
  );

  // =========================================================================
  // 75. GET /api/v1/rate/products Offset Pagination, key_specs.battery Fast-Charge Fallback & OpenAPI Route Coverage (#526)
  // =========================================================================
  {
    const { NextRequest } = await import('next/server');
    const { buildRateOpenApiSpec } = await import('@/server/rate/openapi');
    const { getMasterProducts } = await import('@/lib/rate-api');
    const productsRoute526 = await import('@/app/api/v1/rate/products/route');

    // 75.1 OpenAPI 3.1.0 specification covers all route handlers including /api/v1/rate/merchants/directory
    const spec526 = buildRateOpenApiSpec('https://rate.vn');
    assert.ok(
      spec526.paths['/api/v1/rate/merchants/directory']?.get,
      'buildRateOpenApiSpec must document GET /api/v1/rate/merchants/directory (#526)'
    );
    const productParams526 =
      spec526.paths['/api/v1/rate/products']?.get?.parameters ?? [];
    assert.ok(
      productParams526.some((p) => p.name === 'facets') &&
        productParams526.some((p) => p.name === 'compactScreen') &&
        productParams526.some(
          (p) => p.name === 'minRating' && p.description.includes('0-5')
        ),
      'buildRateOpenApiSpec GET /api/v1/rate/products must document facets, compactScreen, and 0-5 minRating scale (#526)'
    );

    // 75.2 GET /api/v1/rate/products wires ?offset= into getMasterProducts and returns offset in response payload, and key_specs.battery parses <N>W
    let capturedRpcOffset526: number | null = null;
    const origFetch526 = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/categories')) {
        return new Response(
          JSON.stringify({
            id: '00000000-0000-4000-8000-000000000520',
            slug: 'smartphones',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/rpc/search_master_products')) {
        if (init?.body && typeof init.body === 'string') {
          const parsedBody = JSON.parse(init.body) as { p_offset?: number };
          if (typeof parsedBody.p_offset === 'number') {
            capturedRpcOffset526 = parsedBody.p_offset;
          }
        }
        return new Response('{"message":"function not found"}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/rest/v1/master_products')) {
        const u526 = new URL(url);
        const offset526 = Number(u526.searchParams.get('offset') ?? 0);
        const limit526 = Number(u526.searchParams.get('limit') ?? 1000);
        const rows526 = [
          {
            id: '00000000-0000-4000-8000-000000000521',
            slug: 'samsung-galaxy-s25-256gb',
            name: 'Samsung Galaxy S25 256GB',
            brand: 'Samsung',
            model: 'Galaxy S25',
            model_key: 'samsung-galaxy-s25:256gb',
            category_id: null,
            min_price: 19_990_000,
            max_price: 21_990_000,
            merchant_count: 3,
            status: 'published',
            specifications: { battery: { capacity_mah: 4000 } },
            key_specs: { battery: '4000 mAh | 25W' },
            metadata: { category_slug: 'smartphones' },
            thumbnail: null,
            images: [],
          },
          {
            id: '00000000-0000-4000-8000-000000000522',
            slug: 'samsung-galaxy-s25-ultra-256gb',
            name: 'Samsung Galaxy S25 Ultra 256GB',
            brand: 'Samsung',
            model: 'Galaxy S25 Ultra',
            model_key: 'samsung-galaxy-s25-ultra:256gb',
            category_id: null,
            min_price: 28_990_000,
            max_price: 31_990_000,
            merchant_count: 5,
            status: 'published',
            specifications: { battery: { capacity_mah: 5000 } },
            key_specs: { battery: '5000 mAh | 45W' },
            metadata: { category_slug: 'smartphones' },
            thumbnail: null,
            images: [],
          },
        ];
        return new Response(
          JSON.stringify(rows526.slice(offset526, offset526 + limit526)),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const fastCharged526 = await getMasterProducts({
        minFastChargingW: 45,
      });
      assert.equal(
        fastCharged526.length,
        1,
        'getMasterProducts fallback must match key_specs.battery "<N>W" when specifications.battery.fast_charging_w is absent (#526)'
      );
      assert.equal(fastCharged526[0]?.slug, 'samsung-galaxy-s25-ultra-256gb');

      const req526 = new NextRequest(
        'https://rate.vn/api/v1/rate/products?q=Samsung&limit=1&offset=1'
      );
      const res526 = await productsRoute526.GET(req526);
      assert.equal(res526.status, 200);
      const body526 = (await res526.json()) as {
        ok: boolean;
        count: number;
        offset: number;
        data: Array<{ slug: string }>;
      };
      assert.equal(body526.ok, true);
      assert.equal(body526.offset, 1);
      assert.equal(
        capturedRpcOffset526,
        1,
        'GET /api/v1/rate/products must pass offset to getMasterProducts (#526)'
      );
      assert.equal(body526.data.length, 1);
      assert.equal(
        body526.data[0]?.slug,
        'samsung-galaxy-s25-ultra-256gb',
        'GET /api/v1/rate/products?offset=1&limit=1 must return the second matched product (#526)'
      );
    } finally {
      globalThis.fetch = origFetch526;
    }
  }

  console.log(
    '  ✅ [75/75] GET /api/v1/rate/products Offset Pagination, key_specs.battery Fast-Charge Fallback & OpenAPI Route Coverage (#526) passed'
  );

  // =========================================================================
  // 76. 1v1 Versus Unpriced Tiebreaks, UI Persona Presets & Catalog Spec Fallbacks (#533)
  // =========================================================================
  {
    const { comparePositiveMinPrices } = await import('@/lib/rate-domain');
    assert.equal(comparePositiveMinPrices(19_990_000, 25_000_000), 'A');
    assert.equal(comparePositiveMinPrices(25_000_000, 19_990_000), 'B');
    assert.equal(comparePositiveMinPrices(20_000_000, 20_000_000), 'equal');
    assert.equal(
      comparePositiveMinPrices(0, 25_000_000),
      'B',
      'Unpriced product A (0 VND) must not beat priced product B (#533)'
    );
    assert.equal(
      comparePositiveMinPrices(25_000_000, 0),
      'A',
      'Priced product A must beat unpriced product B (0 VND) (#533)'
    );
    assert.equal(comparePositiveMinPrices(0, 0), 'unknown');

    const { NextRequest } = await import('next/server');
    const { getMasterProducts } = await import('@/server/rate');
    const versusRoute533 = await import('@/app/api/v1/rate/versus/route');
    const origFetch533 = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/rpc/search_master_products')) {
        return new Response('{"message":"function not found"}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/rest/v1/master_products')) {
        const u533 = new URL(url);
        const offset533 = Number(u533.searchParams.get('offset') ?? 0);
        const limit533 = Number(u533.searchParams.get('limit') ?? 1000);
        const rows533 = [
          {
            id: '00000000-0000-4000-8000-000000000531',
            slug: 'unpriced-phone-a-256gb',
            name: 'Unpriced Phone A 256GB',
            brand: 'Samsung',
            model: 'Phone A',
            model_key: 'samsung-phone-a:256gb',
            category_id: null,
            min_price: 0,
            max_price: 0,
            merchant_count: 0,
            battery_mah: null,
            screen_size_inch: 0,
            average_rating: 4.5,
            user_rating_weighted: 4.5,
            expert_rating: 8.8,
            total_reviews: 20,
            status: 'published',
            specifications: {
              battery: { capacity_mah: 5000 },
            },
            key_specs: {
              screen: '6.1 inch Dynamic AMOLED 2X | 120Hz',
              battery: '5000 mAh | 45W',
            },
            metadata: { category_slug: 'smartphones' },
            thumbnail: null,
            images: [],
          },
          {
            id: '00000000-0000-4000-8000-000000000532',
            slug: 'priced-phone-b-256gb',
            name: 'Priced Phone B 256GB',
            brand: 'Samsung',
            model: 'Phone B',
            model_key: 'samsung-phone-b:256gb',
            category_id: null,
            min_price: 24_990_000,
            max_price: 26_990_000,
            merchant_count: 4,
            battery_mah: 0,
            screen_size_inch: null,
            average_rating: 4.5,
            user_rating_weighted: 4.5,
            expert_rating: 8.8,
            total_reviews: 20,
            status: 'published',
            specifications: {
              display: { size_inch: 6.7 },
            },
            key_specs: {
              screen: '6.7 inch Dynamic AMOLED 2X | 120Hz',
              battery: '5400 mAh | 65W',
            },
            metadata: { category_slug: 'smartphones' },
            thumbnail: null,
            images: [],
          },
        ];
        return new Response(
          JSON.stringify(rows533.slice(offset533, offset533 + limit533)),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const compact533 = await getMasterProducts({
        maxScreenSizeInch: 6.3,
      });
      assert.equal(
        compact533.length,
        1,
        'getMasterProducts fallback must parse key_specs.screen when screen_size_inch is 0 (#533)'
      );
      assert.equal(compact533[0]?.slug, 'unpriced-phone-a-256gb');

      const battery533 = await getMasterProducts({
        minBatteryMah: 5200,
      });
      assert.equal(
        battery533.length,
        1,
        'getMasterProducts fallback must parse key_specs.battery "<N> mAh" when battery_mah is 0 (#533)'
      );
      assert.equal(battery533[0]?.slug, 'priced-phone-b-256gb');

      const versusReq533 = new NextRequest(
        'https://rate.vn/api/v1/rate/versus?pair=unpriced-phone-a-256gb-vs-priced-phone-b-256gb&persona=photography'
      );
      const versusRes533 = await versusRoute533.GET(versusReq533);
      assert.equal(versusRes533.status, 200);
      const versusBody533 = (await versusRes533.json()) as {
        ok: boolean;
        persona: string;
        weights: { camera: number };
        overall_winner: { side: 'A' | 'B'; slug: string };
        price_comparison: {
          cheaper_slug: string;
          price_delta_vnd: number;
          price_delta_percent: number;
        };
      };
      assert.equal(versusBody533.ok, true);
      assert.equal(
        versusBody533.persona,
        'photography',
        'GET /api/v1/rate/versus must recognize UI persona preset "photography" (#533)'
      );
      assert.equal(versusBody533.weights.camera, 45);
      assert.equal(
        versusBody533.price_comparison.cheaper_slug,
        'priced-phone-b-256gb',
        'cheaper_slug must resolve to the priced product when the other product has min_price=0 (#533)'
      );
      assert.equal(
        versusBody533.price_comparison.price_delta_vnd,
        0,
        'price_delta_vnd must be 0 when one product is unpriced (#533)'
      );
      assert.equal(versusBody533.price_comparison.price_delta_percent, 0);
    } finally {
      globalThis.fetch = origFetch533;
    }
  }

  console.log(
    '  ✅ [76/77] 1v1 Versus Unpriced Tiebreaks, UI Persona Presets & Catalog Spec Fallbacks (#533) passed'
  );

  // 77. Issue #532: URL inspect matched merchant offer pairing, platform-scoped shop lookup, Lazada SKU skip, and earbuds URL price floor
  {
    const rateApi532 =
      require('../../../lib/rate-api') as typeof import('../../../lib/rate-api');
    const extServer532 =
      require('../extension') as typeof import('../extension');

    // 77a. detectAccessoryOrJunk applies the 400k VND earbuds floor when category words were stripped from title but present in URL
    const earbudsGate532 = extServer532.detectAccessoryOrJunk({
      title: 'soundpeats air4',
      url: 'https://tiki.vn/tai-nghe-bluetooth-soundpeats-air4-p123.html',
      price: 800_000,
    });
    assert.equal(
      earbudsGate532.isAccessory,
      false,
      'detectAccessoryOrJunk must apply the 400k VND earbuds floor for tiki.vn/tai-nghe-bluetooth-soundpeats-air4-p123.html at 800k VND (#532)'
    );

    const origFetch532 = globalThis.fetch;
    const merchantLookupUrls532: string[] = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (
          url.includes('/rest/v1/products') &&
          url.includes('platform_item_id=in.')
        ) {
          return new Response(JSON.stringify(null), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/rest/v1/merchants')) {
          merchantLookupUrls532.push(url);
          if (
            url.includes('platform_shop_id=in.') &&
            url.includes('platform=eq.shopee')
          ) {
            return new Response(
              JSON.stringify([
                {
                  id: 'merch-532-shop-a',
                  platform: 'shopee',
                  platform_shop_id: '88201679',
                  name: 'Shop A Flagship',
                  slug: 'shop-a-flagship',
                  is_official: true,
                  rating_star: 4.9,
                  follower_count: 500000,
                  location: 'Hà Nội',
                  risk_score: 4,
                  metadata: {},
                  updated_at: '2026-10-19T00:00:00Z',
                },
              ]),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (
          url.includes('/rest/v1/master_products') &&
          url.includes('slug=eq.apple-iphone-16-pro-max-256gb')
        ) {
          return new Response(
            JSON.stringify({
              id: 'mp-532-ip16pm',
              slug: 'apple-iphone-16-pro-max-256gb',
              name: 'Apple iPhone 16 Pro Max 256GB',
              brand: 'Apple',
              model: 'iPhone 16 Pro Max',
              model_key: 'apple-iphone-16-pro-max-256gb',
              category_id: 'cat-smartphones',
              min_price: 28990000,
              max_price: 31990000,
              merchant_count: 2,
              average_rating: 4.9,
              user_rating_weighted: 4.9,
              expert_rating: 4.9,
              total_reviews: 40,
              has_5g: true,
              colors: ['Black Titanium'],
              status: 'published',
              specifications: { category_slug: 'smartphones' },
              key_specs: {},
              metadata: {},
              thumbnail: null,
              images: [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (
          url.includes('/rest/v1/v_products_with_merchant_trust') &&
          url.includes('cluster_id=eq.mp-532-ip16pm')
        ) {
          const parsedUrl = new URL(url);
          const offset = Number(parsedUrl.searchParams.get('offset') ?? 0);
          if (offset > 0) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          // Cheapest offer is Shop B (28.99M), second offer is Shop A (29.99M)
          return new Response(
            JSON.stringify([
              {
                id: 'offer-532-shop-b',
                cluster_id: 'mp-532-ip16pm',
                merchant_id: 'merch-532-shop-b',
                platform: 'shopee',
                title: 'iPhone 16 Pro Max 256GB Shop B',
                price_current: 28990000,
                price_original: 29990000,
                stock: 5,
                rating_star: 4.7,
                rating_count: 10,
                url: 'https://shopee.vn/i.999999.111',
                merchant_name: 'Shop B Cheaper',
                merchant_is_official: false,
                merchant_location: 'TP.HCM',
                threat_risk_score: 25,
                dosafe_risk_score: 25,
                review_risk_score: 20,
                review_risk_breakdown: {},
              },
              {
                id: 'offer-532-shop-a',
                cluster_id: 'mp-532-ip16pm',
                merchant_id: 'merch-532-shop-a',
                platform: 'shopee',
                title: 'iPhone 16 Pro Max 256GB Shop A',
                price_current: 29990000,
                price_original: 34990000,
                stock: 10,
                rating_star: 4.9,
                rating_count: 80,
                url: 'https://shopee.vn/i.88201679.222',
                merchant_name: 'Shop A Flagship',
                merchant_is_official: true,
                merchant_location: 'Hà Nội',
                threat_risk_score: 4,
                dosafe_risk_score: 4,
                review_risk_score: 2,
                review_risk_breakdown: {},
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      // 77b. Shopee URL with Vietnamese diacritics and Shop A's ID picks Shop A's offer (not Shop B's cheaper offer)
      const inspectedShopee532 = await rateApi532.inspectProductOrShopUrl(
        'https://shopee.vn/%C4%90i%E1%BB%87n-tho%E1%BA%A1i-Apple-iPhone-16-Pro-Max-256GB-i.88201679.777777777'
      );
      assert.equal(inspectedShopee532.matchedType, 'master_product');
      assert.equal(
        inspectedShopee532.merchantProfile?.id,
        'merch-532-shop-a',
        'merchantProfile must be Shop A (#532)'
      );
      assert.equal(
        inspectedShopee532.matchedOffer?.id,
        'offer-532-shop-a',
        'matchedOffer must be Shop A offer (offer-532-shop-a), not Shop B cheapest offer (#532)'
      );
      assert.equal(
        inspectedShopee532.matchedOffer?.price_current,
        29990000,
        'matchedOffer price must match Shop A offer (#532)'
      );
      assert.ok(
        merchantLookupUrls532.some(
          (u) =>
            u.includes('platform_shop_id=in.') &&
            u.includes('platform=eq.shopee')
        ),
        'Shop lookup must filter by platform=eq.shopee (#532)'
      );

      // 77c. Lazada product URL with -s<sku> skips shop lookup so SKU number never collides with another platform shop ID
      merchantLookupUrls532.length = 0;
      const inspectedLazada532 = await rateApi532.inspectProductOrShopUrl(
        'https://www.lazada.vn/products/apple-iphone-16-pro-max-256gb-i123456789-s88201679.html'
      );
      assert.equal(inspectedLazada532.matchedType, 'master_product');
      assert.ok(
        !merchantLookupUrls532.some((u) => u.includes('platform_shop_id=in.')),
        'Lazada product URL must skip platform_shop_id lookup because -s<sku> is a SKU ID (#532)'
      );
      assert.equal(
        inspectedLazada532.matchedOffer?.id,
        'offer-532-shop-b',
        'Lazada product URL without shop match must pick cheapest offer (#532)'
      );
    } finally {
      globalThis.fetch = origFetch532;
    }
  }

  console.log(
    '  ✅ [77/78] URL Inspect Merchant-Offer Pairing, Platform Shop Filter, Lazada SKU Skip & Earbuds URL Floor (#532) passed'
  );

  // 78. Issue #542: Normalize CompareWorkspace rating scales, positive spec fallbacks, and head-to-head zero guards
  {
    const domain542 =
      require('../../../lib/rate-domain') as typeof import('../../../lib/rate-domain');

    assert.equal(domain542.normalizeCompareFiveStarRating(4.8), 4.8);
    assert.equal(
      domain542.normalizeCompareFiveStarRating(9.2),
      4.6,
      '10-point Lab/User ratings must scale to 5-point scale (#542)'
    );
    assert.equal(domain542.normalizeCompareFiveStarRating(92), 4.6);
    assert.equal(domain542.normalizeCompareFiveStarRating(0), 0);
    assert.equal(domain542.normalizeCompareFiveStarRating(-5), 0);

    assert.equal(
      domain542.resolveCompareEffectiveUserRating({
        user_rating_weighted: 9.4,
        average_rating: 4.5,
      }),
      4.7,
      'resolveCompareEffectiveUserRating must normalize 10-point user_rating_weighted to 5-point scale (#542)'
    );
    assert.equal(
      domain542.resolveCompareEffectiveUserRating({
        user_rating_weighted: 0,
        average_rating: 9.0,
      }),
      4.5,
      'resolveCompareEffectiveUserRating must fall back to normalized average_rating when user_rating_weighted is 0 (#542)'
    );
    assert.equal(
      domain542.resolveCompareExpertRating5({ expert_rating: 9.2 }),
      4.6,
      'resolveCompareExpertRating5 must normalize 10-point Lab scores to 5.0 scale (#542)'
    );
    assert.equal(
      domain542.resolveCompareExpertRating5({ expert_rating: 0 }),
      null
    );

    // Positive spec fallbacks when top-level or nested field is 0
    assert.equal(
      domain542.resolveCompareDisplaySizeInch({
        screen_size_inch: 0,
        specifications: { display: { size_inch: 0 } },
        key_specs: { screen: '6.3" LTPO OLED 120Hz' },
      }),
      6.3,
      'resolveCompareDisplaySizeInch must fall through 0 values to key_specs.screen (#542)'
    );
    // Two decimals parse whole, never as the digits after the point.
    for (const [screen, inch] of [
      ['6.78 inch AMOLED', 6.78],
      ['6.67" OLED', 6.67],
      ['6,9 inch', 6.9],
      ['Màn 13 inch', 13],
    ] as const) {
      assert.equal(
        domain542.resolveCompareDisplaySizeInch({
          screen_size_inch: 0,
          specifications: {},
          key_specs: { screen },
        }),
        inch,
        `key_specs.screen "${screen}" must parse as ${inch}"`
      );
    }
    assert.equal(
      domain542.resolveCompareRamGb({
        ram_gb: 0,
        specifications: { hardware: { ram_gb: 16 } },
        key_specs: { ram: '16GB LPDDR5X' },
      }),
      16,
      'resolveCompareRamGb must fall through ram_gb=0 to specifications.hardware.ram_gb (#542)'
    );
    assert.equal(
      domain542.resolveCompareStorageGb({
        storage_gb: 0,
        specifications: { hardware: { storage_gb: 0 } },
        key_specs: { storage: '1.5TB NVMe' },
      }),
      1536,
      'resolveCompareStorageGb must fall through 0 values and parse TB in key_specs.storage (#542)'
    );
    assert.equal(
      domain542.resolveCompareMemoryScore({
        ram_gb: 0,
        storage_gb: 0,
        specifications: {},
        key_specs: {},
      }),
      0,
      'resolveCompareMemoryScore must return 0 when no RAM or storage is present so headToHeadSummary excludes unspecd earbuds (#542)'
    );
    assert.equal(
      domain542.resolveCompareBatteryMah({
        battery_mah: 0,
        specifications: { battery: { capacity_mah: 0 } },
        key_specs: { battery: '5500 mAh, 80W' },
      }),
      5500,
      'resolveCompareBatteryMah must fall through 0 values to key_specs.battery (#542)'
    );

    const compareWsSrc = fs.readFileSync(
      path.join(webSrcRoot, 'components/compare/CompareWorkspace.tsx'),
      'utf8'
    );
    assert.ok(
      !compareWsSrc.includes("from '@/lib/leaderboard-engine'"),
      'CompareWorkspace.tsx must import buildPopular1v1BattlesForCategory from @/lib/rate-domain (#542)'
    );
    assert.ok(
      compareWsSrc.includes('resolveCompareExpertRating5') &&
        compareWsSrc.includes('resolveCompareMemoryScore') &&
        compareWsSrc.includes('resolveCompareBatteryMah'),
      'CompareWorkspace.tsx must use normalized rating and positive spec fallback helpers (#542)'
    );
  }

  console.log(
    '  ✅ [78/79] CompareWorkspace Rating Scale Normalization, Positive Spec Fallbacks & Zero Guards (#542) passed'
  );

  // =========================================================================
  // 79. Watchlist Target Price Presets, Live KPI Sync & PriceHistorySection Guards (#549)
  // =========================================================================
  {
    const wlStore549 =
      await import('../../../components/watchlist/watchlist-store');

    assert.equal(
      wlStore549.computeWatchlistTargetPrice(1_000_000, 5),
      950_000,
      'computeWatchlistTargetPrice must not round 1,000,000 VND -5% back up to 1,000,000 VND (#549)'
    );
    assert.equal(
      wlStore549.computeWatchlistTargetPrice(500_000, 5),
      480_000,
      'computeWatchlistTargetPrice must use 10k VND steps below 2M VND and stay strictly below basePrice (#549)'
    );
    assert.equal(
      wlStore549.computeWatchlistTargetPrice(100_000, 5),
      90_000,
      'computeWatchlistTargetPrice must subtract step when rounding would equal basePrice (#549)'
    );
    assert.equal(
      wlStore549.computeWatchlistTargetPrice(25_000_000, 5),
      23_800_000,
      'computeWatchlistTargetPrice must use 100k VND steps at or above 2M VND (#549)'
    );
    assert.equal(
      wlStore549.computeWatchlistTargetPrice(25_000_000, 10),
      22_500_000
    );
    assert.equal(
      wlStore549.computeWatchlistTargetPrice(0, 5),
      10_000_000,
      'computeWatchlistTargetPrice must fall back to 10,000,000 VND when basePrice is 0 (#549)'
    );

    assert.equal(
      wlStore549.sanitizeWatchlistTargetPrice(420_000, 500_000),
      420_000
    );
    assert.equal(
      wlStore549.sanitizeWatchlistTargetPrice(500, 500_000),
      wlStore549.MIN_WATCHLIST_TARGET_PRICE,
      'sanitizeWatchlistTargetPrice must clamp positive custom target prices to MIN_WATCHLIST_TARGET_PRICE (#549)'
    );
    assert.equal(
      wlStore549.sanitizeWatchlistTargetPrice(0, 1_000_000),
      950_000,
      'sanitizeWatchlistTargetPrice must fall back to computeWatchlistTargetPrice when customTarget <= 0 (#549)'
    );

    const wlWorkspaceSrc = fs.readFileSync(
      path.join(webSrcRoot, 'components/watchlist/WatchlistWorkspace.tsx'),
      'utf8'
    );
    assert.ok(
      wlWorkspaceSrc.includes('resolveCompareEffectiveUserRating(liveProd)') &&
        wlWorkspaceSrc.includes('computeWatchlistTargetPrice(minP, 5)') &&
        wlWorkspaceSrc.includes('currentMin > 0 && item.priceWhenAdded > 0'),
      'WatchlistWorkspace.tsx must use computeWatchlistTargetPrice, resolveCompareEffectiveUserRating, and zero-guarded diffFromAdded (#549)'
    );

    const priceHistorySrc = fs.readFileSync(
      path.join(webSrcRoot, 'components/price-history/PriceHistorySection.tsx'),
      'utf8'
    );
    assert.ok(
      priceHistorySrc.includes('price > MAX_VALID_VND_PRICE') &&
        priceHistorySrc.includes('pt.price_original <= MAX_VALID_VND_PRICE') &&
        priceHistorySrc.includes('if (allValues.length === 0)'),
      'PriceHistorySection.tsx must filter invalid timestamps/prices and bound price_original by MAX_VALID_VND_PRICE (#549)'
    );
  }

  console.log(
    '  ✅ [79/80] Watchlist Target Price Presets, Live KPI Sync & PriceHistorySection Guards (#549) passed'
  );

  // =========================================================================
  // 80. DeepInspectWorkspace, CategoryCatalogToolbar & gen-db-types Hardening (#554)
  // =========================================================================
  {
    const domain554 = await import('../../../lib/rate-domain');

    assert.equal(
      domain554.resolveCompareExpertRating10({ expert_rating: 4.5 }),
      9.0,
      'resolveCompareExpertRating10 must scale 5-star expert_rating (4.5) to 9.0/10 (#554)'
    );
    assert.equal(
      domain554.resolveCompareExpertRating10({ expert_rating: 9.2 }),
      9.2,
      'resolveCompareExpertRating10 must preserve 10-point expert_rating (9.2/10) (#554)'
    );
    assert.equal(
      domain554.resolveCompareExpertRating10({ expert_rating: 0 }),
      null,
      'resolveCompareExpertRating10 must return null when expert_rating <= 0 (#554)'
    );

    const deepInspectSrc = fs.readFileSync(
      path.join(webSrcRoot, 'components/inspect/DeepInspectWorkspace.tsx'),
      'utf8'
    );
    assert.ok(
      deepInspectSrc.includes("discount?.verdict === 'suspicious_discount'") &&
        deepInspectSrc.includes('o.merchant?.platform') &&
        deepInspectSrc.includes('priceHistory?.byOffer?.[o.id]') &&
        deepInspectSrc.includes('resolveCompareExpertRating10'),
      'DeepInspectWorkspace.tsx must handle suspicious_discount verdict, per-offer CSV verdict/platform fallbacks, and normalized ratings (#554)'
    );

    const catalogToolbarSrc = fs.readFileSync(
      path.join(
        webSrcRoot,
        'components/leaderboard/CategoryCatalogToolbar.tsx'
      ),
      'utf8'
    );
    assert.ok(
      catalogToolbarSrc.includes('resolveCompareEffectiveUserRating(p)') &&
        catalogToolbarSrc.includes('resolveCompareExpertRating10(p)'),
      'CategoryCatalogToolbar.tsx must normalize user and expert ratings across Markdown, CSV, and JSON exports (#554)'
    );

    const genDbTypesSrc = fs.readFileSync(
      path.join(repoRoot, 'scripts/gen-db-types.mjs'),
      'utf8'
    );
    assert.ok(
      genDbTypesSrc.includes('fetchTextWithTimeout') &&
        genDbTypesSrc.includes('keepAliveTimer') &&
        !genDbTypesSrc.includes('AbortSignal.timeout'),
      'scripts/gen-db-types.mjs must use ref-d fetchTextWithTimeout and keepAliveTimer instead of unref-d AbortSignal.timeout (#554)'
    );
  }

  console.log(
    '  ✅ [80/80] DeepInspectWorkspace, CategoryCatalogToolbar & gen-db-types Hardening (#554) passed'
  );

  // =========================================================================
  // 81. Competitor sabotage adds no dynamic review risk (#645)
  // =========================================================================
  {
    const { computeDynamicReviewRisk, evaluateReviewTrustAssessment } =
      await import('@/lib/rate-api');
    // The verdicts the importer stores (ai-review-analyzer.ts): 'fake' for
    // seeding, sabotage and bombing, 'suspicious' for coin spam.
    const importerVerdict = (category: string) =>
      ['seeding_fake', 'competitor_sabotage', 'review_bombing'].includes(
        category
      )
        ? 'fake'
        : category === 'low_value_coin_spam'
          ? 'suspicious'
          : 'authentic';
    const review645 = (
      flag_category: string | null,
      include_in_rating: boolean,
      verdict = importerVerdict(flag_category ?? '')
    ) => ({ flag_category, include_in_rating, verdict }) as never;

    const sabotaged = computeDynamicReviewRisk([
      review645('authentic', true),
      review645('authentic', true),
      review645('competitor_sabotage', false),
      review645('review_bombing', false),
    ]);
    assert.equal(
      sabotaged.reviewRiskScore,
      15,
      'a seller whose only flagged reviews are sabotage or review bombing stays at the baseline (#645, #671)'
    );
    assert.equal(sabotaged.breakdown.sabotage_or_bombing_count, 2);
    assert.equal(sabotaged.breakdown.suspicious_ratio_pct, 50);

    const seeded = computeDynamicReviewRisk([
      review645('authentic', true),
      review645('seeding_fake', false),
      review645('low_value_coin_spam', false),
      review645('competitor_sabotage', false),
    ]);
    assert.equal(
      seeded.reviewRiskScore,
      34,
      'baseline 15 + seeding min(45, 25% x 75); coin spam (#654) and sabotage (#645) add nothing'
    );

    // Coin-farming comments are excluded but, as in the importer, do not
    // penalise the seller (#654).
    const coinSpamOnly = computeDynamicReviewRisk([
      review645('authentic', true),
      review645('low_value_coin_spam', false),
      review645('low_value_coin_spam', false),
      review645('authentic', false),
    ]);
    assert.equal(coinSpamOnly.reviewRiskScore, 15);
    assert.equal(coinSpamOnly.breakdown.coin_spam_count, 3);
    assert.equal(coinSpamOnly.breakdown.suspicious_ratio_pct, 75);

    // A missing category still counts a 'fake' verdict as seeding.
    const uncategorised = computeDynamicReviewRisk([
      review645('authentic', true),
      review645(null, false, 'fake'),
    ]);
    assert.equal(uncategorised.reviewRiskScore, 53);
    assert.equal(uncategorised.breakdown.seeding_fake_count, 1);

    // Above the 15 baseline, the seeding contribution matches the importer's
    // (seedingRiskPenalty in @repo/shared-data) for every mix, and is capped
    // at 45 (#671).
    const { seedingRiskPenalty } = await import('@repo/shared-data');
    for (let total = 1; total <= 40; total++) {
      for (let seeding = 0; seeding <= total; seeding++) {
        const mix = [
          ...Array.from({ length: seeding }, () =>
            review645('seeding_fake', false)
          ),
          ...Array.from({ length: total - seeding }, () =>
            review645('authentic', true)
          ),
        ];
        assert.equal(
          computeDynamicReviewRisk(mix).reviewRiskScore,
          15 + seedingRiskPenalty(seeding, total),
          `${seeding}/${total} seeding`
        );
      }
    }
    const allSeeded = computeDynamicReviewRisk([
      review645('seeding_fake', false),
      review645('seeding_fake', false),
    ]);
    assert.equal(
      allSeeded.reviewRiskScore,
      60,
      '100% seeding is capped at baseline 15 + 45'
    );

    const pendingOnly = computeDynamicReviewRisk([
      review645('authentic', false, 'unanalyzed'),
    ]);
    assert.equal(pendingOnly.reviewRiskScore, 15);
    assert.equal(pendingOnly.breakdown.total_reviews, 0);

    // Same formula as the importer's evaluateMerchantRisk (#671).
    const rated = (
      flag_category: string,
      rating_star: number,
      comment: string
    ) =>
      ({
        flag_category,
        include_in_rating: flag_category === 'authentic',
        verdict: importerVerdict(flag_category),
        rating_star,
        comment,
      }) as never;
    const fiveGood = Array.from({ length: 5 }, () =>
      rated('authentic', 5, 'Máy chạy mượt, pin tốt')
    );
    // Seeding is capped at +45.
    assert.equal(
      computeDynamicReviewRisk(
        Array.from({ length: 4 }, () => rated('seeding_fake', 5, 'Tuyệt vời'))
      ).reviewRiskScore,
      60
    );
    // Genuine 1-2 star complaints at 20% or more add min(25, ratio x 45).
    const complaints = [
      ...fiveGood.slice(0, 3),
      rated('authentic', 1, 'Máy lỗi màn hình sau 2 ngày'),
      rated('authentic', 2, 'Pin tụt nhanh, nóng'),
    ];
    assert.equal(computeDynamicReviewRisk(complaints).reviewRiskScore, 33);
    // A star-only low rating counts at a quarter: 0.25 / 5 is under 20%.
    assert.equal(
      computeDynamicReviewRisk([
        ...fiveGood.slice(0, 4),
        rated('authentic', 1, ''),
      ]).reviewRiskScore,
      15
    );
    // Sabotage 1-star reviews are not complaints.
    assert.equal(
      computeDynamicReviewRisk([
        ...fiveGood.slice(0, 3),
        rated('competitor_sabotage', 1, 'Shop lừa đảo'),
        rated('review_bombing', 1, 'Tệ'),
      ]).reviewRiskScore,
      15
    );
    // A platform rating label ("Rất không hài lòng") is star-only too.
    assert.equal(
      computeDynamicReviewRisk([
        ...fiveGood.slice(0, 3),
        rated('authentic', 1, 'Rất không hài lòng'),
        rated('authentic', 1, 'Rất không hài lòng.'),
      ]).reviewRiskScore,
      15
    );
    // A low-star review left out of the rating is no complaint.
    assert.equal(
      computeDynamicReviewRisk([
        ...fiveGood.slice(0, 4),
        {
          ...(rated('authentic', 1, 'Máy lỗi') as object),
          include_in_rating: false,
        } as never,
      ]).reviewRiskScore,
      15
    );
    // Exactly 20% counts: 1 of 5 adds round(0.2 x 45) = 9.
    assert.equal(
      computeDynamicReviewRisk([
        ...fiveGood.slice(0, 4),
        rated('authentic', 2, 'Pin tụt nhanh'),
      ]).reviewRiskScore,
      24
    );
    // The star-only rule is copied from the importer; keep them identical.
    const literal = (file: string, name: string) => {
      const src = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const match = new RegExp(`const ${name} =\\s*(/.*?/i);`).exec(src);
      assert.ok(match, `${name} literal in ${file}`);
      return match[1];
    };
    assert.equal(
      literal('apps/web/src/lib/rate-api.ts', 'RATING_ONLY_LABEL_RE'),
      literal(
        'apps/importer/src/shopee/ai-review-analyzer.ts',
        'RATING_LABEL_RE'
      ),
      'web and importer star-only labels are identical (#671)'
    );
    // The merchant list reads the stars and text the complaint term needs.
    assert.ok(
      fs
        .readFileSync(
          path.join(repoRoot, 'apps/web/src/lib/rate-api.ts'),
          'utf8'
        )
        .includes("'id, product_id, rating_star, comment, review_flags("),
      'getMerchantsList selects rating_star and comment for review risk (#671)'
    );
    // Official store -15, free channels +10, 50k+ followers -5.
    assert.equal(
      computeDynamicReviewRisk(fiveGood, { isOfficial: true }).reviewRiskScore,
      0
    );
    assert.equal(
      computeDynamicReviewRisk(fiveGood, { platform: 'facebook' })
        .reviewRiskScore,
      25
    );
    assert.equal(
      computeDynamicReviewRisk(fiveGood, { followerCount: 50000 })
        .reviewRiskScore,
      10
    );

    // The trust model labels them by category too, not as fabricated.
    const axis = (flag_category: string) =>
      evaluateReviewTrustAssessment({
        rating_star: 1,
        comment: 'Shop lừa đảo, đừng mua, sang shop khác mua rẻ hơn',
        reviewer_type: 'user',
        upvotes: 0,
        downvotes: 0,
        report_count: 0,
        flag_category,
        verdict: importerVerdict(flag_category),
        include_in_rating: false,
        signals: null,
      } as never).authenticity;
    assert.equal(axis('competitor_sabotage'), 'sabotage');
    assert.equal(axis('review_bombing'), 'bombing');
    assert.equal(axis('seeding_fake'), 'fabricated');
  }

  console.log(
    '  ✅ [81/81] Competitor sabotage adds no dynamic review risk (#645) passed'
  );

  // =========================================================================
  // 82. Plain wording in Markdown/CSV/JSON exports (#661)
  // =========================================================================
  {
    const exportJargon = /audit|seeding|radar|kiểm định|kiểm toán|kèo thơm/i;
    for (const [locale, messages] of Object.entries({
      vi: viMessages,
      en: enMessages,
      cs: csMessages,
    })) {
      for (const ns of ['productDetail', 'deals', 'watchlist'] as const) {
        const entries = Object.entries(
          (messages as Record<string, Record<string, unknown>>)[ns] ?? {}
        );
        let checked = 0;
        for (const [key, value] of entries) {
          // Export content only; the export buttons are page labels.
          // shareAuditPriceSources is inserted into the Markdown summary.
          const isExport =
            /^md|Md|Csv|Json/.test(key) || key === 'shareAuditPriceSources';
          if (!isExport || /^(copy|copied|export)/.test(key)) continue;
          checked += 1;
          assert.ok(
            typeof value !== 'string' || !exportJargon.test(value),
            `${locale}.${ns}.${key} export text must use plain words (#661): ${String(value)}`
          );
        }
        assert.ok(checked > 0, `${locale}.${ns}: no export keys checked`);
      }
    }
    // Hardcoded export text in every component, comments left out (#673).
    const componentsDir = path.join(repoRoot, 'apps/web/src/components');
    const tsxFiles = (
      fs.readdirSync(componentsDir, {
        recursive: true,
      }) as string[]
    ).filter((f) => f.endsWith('.tsx'));
    assert.ok(tsxFiles.length >= 30, 'components were scanned');
    for (const file of tsxFiles) {
      const src = fs
        .readFileSync(path.join(componentsDir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      assert.ok(
        !/Deal Radar|Radar Genuine|Radar Fake|Anomaly Radar|AI Seeding|AI-Audited|\bAudit\b/.test(
          src
        ),
        `components/${file} export text must use plain words (#661, #673)`
      );
    }
  }

  console.log('  ✅ [82/82] Plain wording in exports (#661) passed');

  // =========================================================================
  // 83. No jargon in any shopper-facing message (#673)
  // =========================================================================
  {
    // The developer docs keep their technical terms on purpose.
    const technicalNamespaces = new Set(['developers', 'openapi']);
    const jargon = /radar|kèo|audit|kiểm định|kiểm toán|seeding/i;
    const offenders: string[] = [];
    const walk = (node: unknown, key: string, locale: string) => {
      if (typeof node === 'string') {
        // {seeding} is a placeholder name, not shown text.
        if (jargon.test(node.replace(/\{\w+\}/g, '')))
          offenders.push(`${locale}.${key}`);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node))
          walk(v, key ? `${key}.${k}` : k, locale);
      }
    };
    for (const [locale, messages] of Object.entries({
      vi: viMessages,
      en: enMessages,
      cs: csMessages,
    })) {
      for (const [ns, node] of Object.entries(messages)) {
        if (!technicalNamespaces.has(ns)) walk(node, ns, locale);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'shopper-facing messages must use plain words (#673)'
    );
  }

  console.log(
    '  ✅ [83/83] No jargon in shopper-facing messages (#673) passed'
  );

  // =========================================================================
  // 84. English labels are sentence case (#677)
  // =========================================================================
  {
    // Placeholders, names (brands, products, retailers, programs) and acronyms
    // keep their capitals; two or more other capitalised words in a row mean
    // Title Case.
    const names =
      /Rate\.vn|Rate Lab|Rate Cloud|DOS ID|DOSafe|JReviews|Markdown|TikTok Shop|Official Mall|Apple Watch|Galaxy Watch|Galaxy Buds|Galaxy Tab|Xiaomi Watch|Xiaomi Pad|Huawei Watch|AirPods Pro|Hoang Ha Mobile|Hoang Ha|Di Dong Viet|The Gioi Di Dong|Phong Vu|Natural Titanium|Alex Nguyen|Shopee|Lazada|Tiki|Apple|iPhone|Pro|Max|Samsung|Galaxy|Xiaomi|Google|Pixel|Huawei|Garmin|Sony|Bose|Sennheiser|MacBook|iPad|Rate\b|Bayesian \w+|Helpful|Report|[A-Z]{2,}\w*|\w+-[A-Z]\w*/g;
    const strip = (s: string) => s.replace(/\{[^}]+\}/g, '').replace(names, '');
    const titleCase =
      /\b[A-Z][a-z]+\b(\s+(&|and|of|to|for|in|the|a|on|with|by|or|from|vs|at)?\s*\b[A-Z][a-z]+\b)+/;
    const allowed = new Set<string>();
    const offenders: string[] = [];
    const walk = (node: unknown, key: string) => {
      if (typeof node === 'string') {
        if (!allowed.has(key) && titleCase.test(strip(node)))
          offenders.push(`${key}: ${node}`);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node))
          walk(v, key ? `${key}.${k}` : k);
      }
    };
    for (const [ns, node] of Object.entries(enMessages)) {
      if (ns !== 'developers' && ns !== 'openapi') walk(node, ns);
    }
    assert.deepEqual(
      offenders,
      [],
      'English labels must be sentence case (#677)'
    );
  }

  console.log('  ✅ [84/84] English labels are sentence case (#677) passed');

  // =========================================================================
  // 85. Vietnamese labels are sentence case (#679)
  // =========================================================================
  {
    const U =
      'A-ZĐÂĂÊÔƠƯÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ';
    const L =
      'a-zđâăêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ';
    // Names keep their capitals: brands, products, retailers, programs,
    // places and people used in examples.
    const names =
      /Rate\.vn|Rate Lab|Rate Cloud|DOS ID|DOSafe|JReviews|Markdown|TikTok Shop|Official Mall|Apple Watch|Galaxy Watch|Galaxy Buds|Galaxy Tab|Xiaomi Watch|Xiaomi Pad|Huawei Watch|AirPods Pro|Hoàng Hà|Di Động Việt|Thế Giới Di Động|Phong Vũ|Việt Nam|Bộ TT&TT|Minh Quân|Hà Nội|Nguyễn Văn A|Pro Max|Pro|Titan Tự Nhiên|AI Review Analyzer|Rate Trust Score|Bayesian|GSMArena|PhoneArena|GitHub|Wi-Fi|Bluetooth|Hi-Res|Qi|MagSafe|Hz|Bayes|Rate Lab|API Playground|Kiểm tra link|Liên hệ|Hữu ích|Báo cáo|Shopee|Lazada|Tiki|Apple|iPhone|Samsung|Galaxy|Xiaomi|Google|Pixel|Sony|Bose|Sennheiser|MacBook|iPad|Rate\b|[A-ZĐ]{2,}\w*/g;
    const strip = (s: string) =>
      s
        .normalize('NFC')
        .replace(/\{[^}]+\}/g, '')
        .replace(names, ' ');
    // Vietnamese Title Case often capitalises each compound word ("Màn hình &
    // Hiển thị"), so a capital after a lowercase word or "&" counts too.
    const titleCase = new RegExp(
      `(?:[${L}]|&)\\s+[${U}][${L}]+|(^|[\\s(])[${U}][${L}]+\\s+[${U}][${L}]+`,
      'u'
    );
    const offenders: string[] = [];
    const walk = (node: unknown, key: string) => {
      if (typeof node === 'string') {
        if (titleCase.test(strip(node))) offenders.push(`${key}: ${node}`);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node))
          walk(v, key ? `${key}.${k}` : k);
      }
    };
    // analyzerCopy rebuilds the analyzer's stored text, so it stays as stored.
    for (const [ns, node] of Object.entries(viMessages)) {
      if (!['developers', 'openapi', 'analyzerCopy'].includes(ns))
        walk(node, ns);
    }
    assert.deepEqual(
      offenders,
      [],
      'Vietnamese labels must be sentence case (#679)'
    );
  }

  console.log('  ✅ [85/85] Vietnamese labels are sentence case (#679) passed');

  console.log('🎉 All Rate.vn Core Architecture tests passed!');
}

runCoreArchitectureSuite();
