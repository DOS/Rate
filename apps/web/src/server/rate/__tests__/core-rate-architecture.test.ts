import assert from 'node:assert/strict';
import {
  computeJReviewsWeight,
  getCategoryRouteHref,
  getMasterProductHref,
  parseEcommerceUrlOrQuery,
} from '../../../lib/rate-api';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
} from '../../../lib/category-filters';
import { getRateCopy, normalizeRateLocale } from '../../../lib/rate-i18n';
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

  // 8. DESIGN.md v2.0 & Unprefixed Locale Routing (localePrefix: "never")
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const repoRoot = path.resolve(__dirname, '../../../../../..');
  const designMdPath = path.join(repoRoot, 'DESIGN.md');
  assert.equal(
    fs.existsSync(designMdPath),
    true,
    'DESIGN.md must exist at repo root'
  );
  const designMd = fs.readFileSync(designMdPath, 'utf8');
  assert.ok(designMd.includes('Rate.vn Design System'));
  assert.ok(designMd.includes('10-Group Specification Matrix'));

  const navTsPath = path.resolve(__dirname, '../../../lib/navigation.ts');
  const navTs = fs.readFileSync(navTsPath, 'utf8');
  assert.ok(
    navTs.includes('localePrefix: "never"') ||
      navTs.includes("localePrefix: 'never'"),
    'navigation.ts must use localePrefix: "never" so switching languages never adds /en or /cs URL slugs'
  );
  assert.ok(
    navTs.includes('NEXT_LOCALE'),
    'navigation.ts must persist locale selection via NEXT_LOCALE cookie'
  );
  console.log(
    '  ✅ [8/8] DESIGN.md v2.0 & Unprefixed Locale Routing (localePrefix: "never") passed'
  );
  console.log('🎉 All Rate.vn Core Architecture tests passed!');
}

runCoreArchitectureSuite();
