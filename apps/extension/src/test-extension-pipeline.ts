import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectEcommercePlatform,
  extractIdsFromUrl,
  parseVndPriceText,
  sanitizeProductUrl,
} from './extractors/ecommerce-detector.js';
import {
  DEFAULT_API_BASE_URL,
  escapeSafeExternalHref,
  isPrivilegedExtensionSender,
  normalizeAllowedApiBaseUrl,
} from './security-guards.js';
import * as extModule from '../../web/src/server/rate/extension.js';
import * as rateApiRootMod from '../../web/src/lib/rate-api.js';
const {
  EXTENSION_CAPABILITY_MATRIX,
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  detectPlatformFromInput,
  evaluateExtensionPriceVerdict,
  extractKeywordFromProductUrl,
  extractStorageAndAmbiguity,
  ingestExtensionCrowdSignal,
  lookupExtensionProduct,
} = (
  'EXTENSION_CAPABILITY_MATRIX' in extModule
    ? extModule
    : (extModule as unknown as { default: typeof extModule }).default
) as typeof extModule;
const {
  MAX_VALID_VND_PRICE,
  getMasterProductPriceHistory,
  mapOfferRowToMerchantOffer,
  mapTrustViewRowToMerchantOffer,
  normalizeOfferOriginalPrice,
  parseEcommerceUrlOrQuery,
} = (
  'parseEcommerceUrlOrQuery' in rateApiRootMod
    ? rateApiRootMod
    : (rateApiRootMod as unknown as { default: typeof rateApiRootMod }).default
) as typeof rateApiRootMod;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envCandidate of [
  path.resolve(__dirname, '../../web/.env.local'),
  path.resolve(__dirname, '../../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
]) {
  if (fs.existsSync(envCandidate)) {
    const lines = fs.readFileSync(envCandidate, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) {
        process.env[m[1]] = (m[2] || '').replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

async function runTests() {
  console.log(
    '🧪 Running Rate Browser Extension MV3 & Hybrid Lookup/Quarantine Verification Suite...'
  );

  // 1. Privacy Gate: URL Canonicalization & 10-Platform Extraction
  const dirtyShopeeUrl =
    'https://shopee.vn/Dien-thoai-iPhone-16-Pro-Max-256GB-i.88201679.29512841920?sp_atk=991823-abcd&xptdk=112233&utm_source=facebook';
  const cleanUrl = sanitizeProductUrl(dirtyShopeeUrl);
  assert.equal(
    cleanUrl,
    'https://shopee.vn/Dien-thoai-iPhone-16-Pro-Max-256GB-i.88201679.29512841920',
    'Must strip sp_atk, xptdk, and utm_* tracking parameters'
  );
  assert.equal(canonicalizeProductUrl(dirtyShopeeUrl), cleanUrl);
  assert.equal(detectEcommercePlatform(cleanUrl!), 'shopee');
  assert.deepEqual(extractIdsFromUrl('shopee', cleanUrl!), {
    externalShopId: '88201679',
    externalItemId: '29512841920',
  });
  assert.equal(
    detectEcommercePlatform(
      'https://www.tiktok.com/@appleflagship/product/1729384756'
    ),
    'tiktok'
  );
  assert.deepEqual(
    extractIdsFromUrl(
      'tiktok',
      'https://www.tiktok.com/@appleflagship/product/1729384756'
    ),
    {
      externalShopId: 'appleflagship',
      externalItemId: '1729384756',
    }
  );
  assert.equal(
    detectEcommercePlatform(
      'https://hoanghamobile.com/dien-thoai/iphone-16-pro-max-256gb'
    ),
    'hoangha'
  );
  assert.equal(
    detectEcommercePlatform('https://didongviet.vn/dien-thoai/iphone-16.html'),
    'didongviet'
  );
  assert.equal(
    detectEcommercePlatform('https://phongvu.vn/macbook-air-m3'),
    'phongvu'
  );
  assert.equal(
    detectEcommercePlatform('https://mall.shopee.vn/item-i.1.2'),
    'shopee'
  );
  assert.equal(
    detectEcommercePlatform('https://www.topzone.vn/iphone/iphone-16-pro-max'),
    'tgdd'
  );
  assert.equal(
    detectEcommercePlatform('https://www.google.com/search?q=shopee.vn'),
    null,
    'Must not misclassify query-string mentions of shopee.vn as Shopee platform'
  );
  assert.equal(
    detectEcommercePlatform('https://shopee.vn.evil.com/item-i.1.2'),
    null,
    'Must reject spoofed domains where shopee.vn is only a subdomain prefix'
  );
  assert.equal(
    detectEcommercePlatform('not-a-valid-url-shopee.vn'),
    null,
    'Must reject non-URL strings'
  );
  assert.equal(
    detectPlatformFromInput(null, 'https://shopee.vn.evil.com/item-i.1.2'),
    null,
    'Server detectPlatformFromInput must reject spoofed subdomain prefixes'
  );
  assert.equal(
    detectPlatformFromInput(null, 'https://www.dienmayxanh.com/dtdd/iphone-16'),
    'tgdd'
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://www.tiktok.com/@appleflagship/product/1729384756'
    ),
    {
      isUrl: true,
      platform: 'tiktok',
      platformShopId: 'appleflagship',
      platformItemId: '1729384756',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://cellphones.com.vn/iphone-16-pro-max.html'
    ),
    {
      isUrl: true,
      platform: 'cellphones',
      platformShopId: null,
      platformItemId: 'iphone-16-pro-max',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://www.topzone.vn/iphone/iphone-16-pro-max-256gb'
    ),
    {
      isUrl: true,
      platform: 'tgdd',
      platformShopId: null,
      platformItemId: 'iphone-16-pro-max-256gb',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://fptshop.com.vn/dien-thoai/iphone-16-pro-max'
    ),
    {
      isUrl: true,
      platform: 'fptshop',
      platformShopId: null,
      platformItemId: 'iphone-16-pro-max',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://hoanghamobile.com/dien-thoai/iphone-16-pro-max'
    ),
    {
      isUrl: true,
      platform: 'hoangha',
      platformShopId: null,
      platformItemId: 'iphone-16-pro-max',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://didongviet.vn/dien-thoai/iphone-16-pro-max.html'
    ),
    {
      isUrl: true,
      platform: 'didongviet',
      platformShopId: null,
      platformItemId: 'iphone-16-pro-max',
      internalSlug: null,
    }
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery('https://phongvu.vn/macbook-air-m3'),
    {
      isUrl: true,
      platform: 'phongvu',
      platformShopId: null,
      platformItemId: 'macbook-air-m3',
      internalSlug: null,
    }
  );
  assert.equal(
    parseEcommerceUrlOrQuery('https://shopee.vn.evil.com/item-i.1.2').platform,
    null,
    'parseEcommerceUrlOrQuery must reject spoofed domains'
  );
  assert.equal(Object.keys(EXTENSION_CAPABILITY_MATRIX).length, 10);
  assert.equal(parseVndPriceText('28.990.000₫ - 34.990.000₫'), 28990000);
  console.log(
    '  ✅ [1/6] URL Canonicalization & 10-Platform ID Extraction passed'
  );

  // 2. Gatekeeper Layer 0: Accessory & Spare Part Rejection
  const caseCheck = detectAccessoryOrJunk({
    title: 'Ốp lưng chống sốc MagSafe cho iPhone 16 Pro Max trong suốt',
    price: 89000,
  });
  assert.equal(caseCheck.isAccessory, true);

  const lowPriceCheck = detectAccessoryOrJunk({
    title: 'iPhone 16 Pro Max 256GB Like New',
    price: 350000,
  });
  assert.equal(lowPriceCheck.isAccessory, true);

  const realEarbudsCheck = detectAccessoryOrJunk({
    title: 'Tai nghe Bluetooth Sony WF-C700N Chính hãng',
    price: 890000,
  });
  assert.equal(
    realEarbudsCheck.isAccessory,
    false,
    'Genuine wireless earbuds >= 400k VND must not be rejected by phone 1.2M VND floor'
  );

  const fakeEarbudsAccessoryCheck = detectAccessoryOrJunk({
    title: 'Tai nghe Bluetooth AirPods Pro 2',
    price: 150000,
  });
  assert.equal(fakeEarbudsAccessoryCheck.isAccessory, true);

  const realPhoneCheck = detectAccessoryOrJunk({
    title: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    price: 28990000,
  });
  assert.equal(realPhoneCheck.isAccessory, false);
  console.log('  ✅ [2/6] Accessory & Junk Gatekeeper passed');

  // 3. Codex [P2] Variant Ambiguity Detection vs Selected SKU Disambiguation
  const multiVariantNoSku = extractStorageAndAmbiguity({
    title: 'Điện thoại Apple iPhone 16 Pro Max 256GB / 512GB / 1TB VN/A',
    selectedVariant: null,
  });
  assert.equal(multiVariantNoSku.storageGb, null);
  assert.equal(multiVariantNoSku.hasMultipleStorageInTitle, true);

  const multiVariantWithSelectedSku = extractStorageAndAmbiguity({
    title: 'Điện thoại Apple iPhone 16 Pro Max 256GB / 512GB / 1TB VN/A',
    selectedVariant: 'Titan Tự Nhiên - 512GB',
  });
  assert.equal(multiVariantWithSelectedSku.storageGb, 512);
  assert.equal(multiVariantWithSelectedSku.hasMultipleStorageInTitle, false);
  console.log('  ✅ [3/6] Variant Ambiguity & SKU Disambiguation passed');

  // 4. Codex [P2] Evidence-Based 5-Level Price Verdict (above_market vs inflated_fake_sale)
  const sampleOffers = [
    {
      id: 'off-1',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB',
      price_current: 28990000,
      price_original: 30990000,
      rating_star: 4.9,
      rating_count: 120,
      historical_sold: 500,
      stock: 15,
      url: 'https://shopee.vn/i.1.2',
      updated_at: new Date().toISOString(),
      merchant: {
        id: 'm-1',
        name: 'Apple Flagship Store',
        is_official: true,
        location: 'TP.HCM',
        rating_star: 4.9,
        risk_score: 5,
        dosafe_risk_score: 0,
        review_risk_score: 5,
      },
    },
    {
      id: 'off-2',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB',
      price_current: 29490000,
      price_original: null,
      rating_star: 4.8,
      rating_count: 85,
      historical_sold: 210,
      stock: 10,
      url: 'https://shopee.vn/i.3.4',
      updated_at: new Date().toISOString(),
      merchant: {
        id: 'm-2',
        name: 'Shop Công Nghệ B',
        is_official: false,
        location: 'Hà Nội',
        rating_star: 4.8,
        risk_score: 12,
        dosafe_risk_score: 0,
        review_risk_score: 12,
      },
    },
  ];

  // High price WITHOUT fake strikethrough originalPrice -> must be `above_market`, NOT `inflated_fake_sale`
  const aboveMarketVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 32500000,
    observedOriginalPrice: null,
    offers: sampleOffers,
    priceHistory: null,
  });
  assert.equal(aboveMarketVerdict.verdict, 'above_market');

  // High price WITH inflated strikethrough originalPrice (39.990.000₫) -> `inflated_fake_sale`
  const fakeSaleVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 29500000,
    observedOriginalPrice: 39990000,
    offers: sampleOffers,
    priceHistory: null,
  });
  assert.equal(fakeSaleVerdict.verdict, 'inflated_fake_sale');

  // Lowest market deal -> `genuine_deal`
  const genuineDealVerdict = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 27990000,
    observedOriginalPrice: 29990000,
    offers: sampleOffers,
    priceHistory: null,
  });
  assert.equal(genuineDealVerdict.verdict, 'genuine_deal');
  console.log('  ✅ [4/6] Evidence-Based 5-Level Price Verdict passed');

  // 5. Codex [P1 & P2] Zero-Trust Crowd Ingest Quarantine & Privacy/Capability Gates
  const noConsentRes = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: '29512841920',
    externalShopId: '88201679',
    url: dirtyShopeeUrl,
    title: 'Điện thoại iPhone 16 Pro Max 256GB',
    price: 28990000,
    userConsentOptIn: false,
  });
  assert.equal(noConsentRes.accepted, false);
  assert.equal(noConsentRes.jobState, 'skipped_no_consent');

  const accessoryRejectRes = await ingestExtensionCrowdSignal({
    platform: 'tiktok',
    externalItemId: '1729401928401',
    url: 'https://shop.tiktok.com/view/product/1729401928401',
    title: 'Ốp lưng chống sốc iPhone 16 Pro Max trong suốt',
    price: 99000,
    userConsentOptIn: true,
  });
  assert.equal(accessoryRejectRes.accepted, false);
  assert.equal(accessoryRejectRes.jobState, 'skipped_accessory');

  const mismatchedDomainRes = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: '29512841920',
    url: 'https://www.lazada.vn/products/iphone-16-i29512841920.html',
    title: 'Điện thoại iPhone 16 Pro Max 256GB',
    price: 28990000,
    userConsentOptIn: true,
  });
  assert.equal(mismatchedDomainRes.accepted, false);
  assert.equal(
    mismatchedDomainRes.jobState,
    'rejected_invalid_url',
    'Must reject crowd ingest when URL domain does not match declared platform'
  );
  assert.equal(EXTENSION_CAPABILITY_MATRIX.shopee.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.lazada.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.tiki.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.tiktok.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.cellphones.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.tgdd.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.fptshop.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.hoangha.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.didongviet.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.phongvu.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.tiktok.lookup, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.hoangha.lookup, true);
  assert.equal(DEFAULT_API_BASE_URL, 'https://rate.vn');
  assert.equal(
    normalizeAllowedApiBaseUrl('https://evil.example.com/steal'),
    'https://rate.vn',
    'Must reject untrusted API base origins and fall back to https://rate.vn'
  );
  assert.equal(
    normalizeAllowedApiBaseUrl('https://rate.vn/'),
    'https://rate.vn'
  );
  assert.equal(
    normalizeAllowedApiBaseUrl('http://localhost:3000/'),
    'http://localhost:3000'
  );
  assert.equal(
    isPrivilegedExtensionSender({ tab: { id: 42 } }),
    false,
    'Content script sender with sender.tab must NOT be allowed to update settings'
  );
  assert.equal(
    isPrivilegedExtensionSender({
      tab: undefined,
      url: 'chrome-extension://abcdefghijklmnop/sidepanel/sidepanel.html',
    }),
    true
  );
  assert.equal(
    escapeSafeExternalHref('javascript:alert(1)'),
    'https://rate.vn',
    'Must neutralize javascript: URLs in sidepanel links'
  );
  assert.equal(
    escapeSafeExternalHref('data:text/html,<script>alert(1)</script>'),
    'https://rate.vn'
  );
  assert.equal(
    escapeSafeExternalHref('https://shopee.vn/item?a=1&b=2'),
    'https://shopee.vn/item?a=1&amp;b=2'
  );
  const manifestJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8')
  ) as { permissions?: string[] };
  assert.deepEqual(
    manifestJson.permissions,
    ['storage', 'sidePanel'],
    'manifest.json must request only least-privilege storage and sidePanel permissions without tabs (Audit C7, #174)'
  );
  if (fs.existsSync(path.resolve(__dirname, '../dist/manifest.json'))) {
    // esbuild bundles each entry (#238): no output may import another file,
    // and the content script (no module support in MV3) must not use import/export.
    for (const rel of [
      'background/service-worker.js',
      'sidepanel/sidepanel.js',
      'content/content-script.js',
    ]) {
      const out = fs.readFileSync(
        path.resolve(__dirname, '../dist', rel),
        'utf8'
      );
      assert.ok(
        !/^\s*import\s|^\s*export\s|from\s+['"]\.{1,2}\//m.test(out),
        `dist/${rel} must be a self-contained bundle (#238, replaces #174's security-guards copy)`
      );
      // The worker and panel inline the security guards (rate.vn allowlist);
      // the content script inlines the marketplace detector.
      const marker = rel.startsWith('content/') ? 'shopee' : 'rate.vn';
      assert.ok(
        out.includes(marker),
        `dist/${rel} must contain its bundled dependencies ("${marker}")`
      );
    }
  }
  const apiHandlerMod =
    await import('../../web/src/server/rate/api-handler.js');
  const {
    BoundedSlidingWindowRateLimiter,
    extractClientRateLimitKey,
    parseBoundedStringParam,
    parseOptionalVndPriceParam,
    parseCompareSlugsParam,
    parseWatchlistSlugsParam,
    parseVersusQueryParams,
    parseReviewsQueryParams,
    parseProductsFilterBounds,
    resolveReviewVoteInput,
  } = (
    'BoundedSlidingWindowRateLimiter' in apiHandlerMod
      ? apiHandlerMod
      : (apiHandlerMod as unknown as { default: typeof apiHandlerMod }).default
  ) as typeof apiHandlerMod;

  const limiter = new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
    maxBuckets: 3,
  });
  assert.equal(limiter.allow('1.2.3.4', 1_000), true);
  assert.equal(limiter.allow('1.2.3.4', 2_000), true);
  assert.equal(
    limiter.allow('1.2.3.4', 3_000),
    false,
    'Must reject once maxRequests is reached within windowMs'
  );
  assert.equal(
    limiter.allow('1.2.3.4', 61_001),
    true,
    'Must reset window after windowMs elapses'
  );
  assert.equal(limiter.allow('2.2.2.2', 62_000), true);
  assert.equal(limiter.allow('3.3.3.3', 62_000), true);
  assert.equal(limiter.allow('4.4.4.4', 62_000), true);
  assert.equal(
    limiter.size,
    3,
    'BoundedSlidingWindowRateLimiter must never exceed maxBuckets'
  );
  assert.equal(
    extractClientRateLimitKey(
      new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1 ' })
    ),
    '203.0.113.7'
  );
  assert.equal(
    extractClientRateLimitKey(new Headers({ 'x-real-ip': '198.51.100.9' })),
    '198.51.100.9'
  );
  assert.equal(extractClientRateLimitKey(new Headers()), 'anon');
  assert.equal(parseBoundedStringParam('  hello world  ', 5), 'hello');
  assert.equal(parseBoundedStringParam('   ', 10), null);
  assert.equal(parseOptionalVndPriceParam(' 25990000.4 '), 25990000);
  assert.equal(parseOptionalVndPriceParam('999000000'), 500_000_000);
  assert.equal(parseOptionalVndPriceParam('-100'), null);
  assert.equal(parseOptionalVndPriceParam('abc'), null);
  assert.equal(parseOptionalVndPriceParam(''), null);
  assert.deepEqual(
    parseCompareSlugsParam(
      ' iphone-16-pro-max , IPHONE-16-PRO-MAX , bad<script>slug , galaxy-s24-ultra , xiaomi-15-ultra , find-x8-pro , extra-fifth-slug '
    ),
    ['iphone-16-pro-max', 'galaxy-s24-ultra', 'xiaomi-15-ultra', 'find-x8-pro'],
    'parseCompareSlugsParam must deduplicate case-insensitively, reject invalid characters, and cap at 4 slugs'
  );
  assert.deepEqual(parseCompareSlugsParam('   , ??? , /etc/passwd '), []);
  assert.deepEqual(
    parseWatchlistSlugsParam(
      ' Apple-iPhone-16-128GB , apple-iphone-16-128gb , bad<script>slug , Samsung-Galaxy-S24-Ultra , extra-ignored ',
      2
    ),
    ['apple-iphone-16-128gb', 'samsung-galaxy-s24-ultra'],
    'parseWatchlistSlugsParam must lowercase, deduplicate, reject invalid characters, and cap at maxSlugs'
  );
  assert.deepEqual(parseWatchlistSlugsParam('   , ??? , /etc/passwd '), []);
  assert.deepEqual(
    parseVersusQueryParams(
      new URLSearchParams('pair=Apple-iPhone-16-vs-Samsung-Galaxy-S25')
    ),
    ['apple-iphone-16', 'samsung-galaxy-s25']
  );
  assert.deepEqual(
    parseVersusQueryParams(
      new URLSearchParams('slugA=xiaomi-15-ultra&slugB=oppo-find-x8-pro')
    ),
    ['xiaomi-15-ultra', 'oppo-find-x8-pro']
  );
  assert.equal(
    parseVersusQueryParams(
      new URLSearchParams('pair=same-model-vs-same-model')
    ),
    null,
    'Identical slugs must be rejected by parseVersusQueryParams'
  );
  assert.equal(
    parseVersusQueryParams(
      new URLSearchParams('pair=bad<script>-vs-samsung-galaxy-s25')
    ),
    null,
    'Malformed slug characters must be rejected by parseVersusQueryParams'
  );
  assert.deepEqual(
    parseReviewsQueryParams(
      new URLSearchParams('slug=iphone-16-pro-max-256gb&hideFake=true')
    ),
    {
      masterProductId: null,
      slug: 'iphone-16-pro-max-256gb',
      hideFake: true,
      limit: 50,
    }
  );
  assert.deepEqual(
    parseReviewsQueryParams(
      new URLSearchParams(
        'productId=123e4567-e89b-12d3-a456-426614174000&limit=25'
      )
    ),
    {
      masterProductId: '123e4567-e89b-12d3-a456-426614174000',
      slug: null,
      hideFake: false,
      limit: 25,
    }
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams('slug=iphone-16-pro-max-256gb&limit=999')
    ),
    null,
    'parseReviewsQueryParams must reject out-of-range limit'
  );
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams('masterProductId=not-a-uuid&slug=iphone-16-pro-max')
    ),
    null,
    'parseReviewsQueryParams must reject malformed masterProductId even when slug is present'
  );
  assert.equal(
    parseReviewsQueryParams(new URLSearchParams('slug=bad<script>slug')),
    null,
    'parseReviewsQueryParams must reject malformed slug characters'
  );
  assert.deepEqual(
    parseProductsFilterBounds(
      new URLSearchParams(
        'category=LAPTOPS&brands=Apple,apple,bad<script>,Samsung&minPrice=15000000&maxPrice=35000000'
      )
    ),
    {
      categorySlug: 'laptops',
      brands: ['Apple', 'Samsung'],
      minPrice: 15_000_000,
      maxPrice: 35_000_000,
    }
  );
  assert.equal(
    parseProductsFilterBounds(new URLSearchParams('category=unknown-cat')),
    null,
    'parseProductsFilterBounds must reject unknown category slugs'
  );
  assert.equal(
    parseProductsFilterBounds(
      new URLSearchParams('minPrice=30000000&maxPrice=20000000')
    ),
    null,
    'parseProductsFilterBounds must reject inverted price ranges (minPrice > maxPrice)'
  );
  assert.equal(
    resolveReviewVoteInput({}),
    null,
    'Empty vote body must not silently default to an upvote'
  );
  assert.equal(
    resolveReviewVoteInput({ voteType: 'invalid_action', helpful: true }),
    null,
    'Invalid voteType must be rejected even if helpful is present'
  );
  assert.deepEqual(resolveReviewVoteInput({ vote: 'down' }), {
    voteType: 'down',
    reportReason: 'spam',
  });
  assert.deepEqual(
    resolveReviewVoteInput({ voteType: 'REPORT', reason: 'FAKE' }),
    {
      voteType: 'report',
      reportReason: 'fake',
    }
  );
  assert.deepEqual(resolveReviewVoteInput({ helpful: false }), {
    voteType: 'down',
    reportReason: 'spam',
  });

  const dealsUnitMod = await import('../../web/src/server/rate/deals.js');
  const { computeCrossPlatformDealRadarFromData: computeRadarUnit } = (
    'computeCrossPlatformDealRadarFromData' in dealsUnitMod
      ? dealsUnitMod
      : (dealsUnitMod as unknown as { default: typeof dealsUnitMod }).default
  ) as typeof dealsUnitMod;
  const mockRadarCluster = [
    {
      master: {
        id: 'm-radar-1',
        slug: 'samsung-galaxy-s24-ultra-256gb',
        name: 'Samsung Galaxy S24 Ultra 256GB',
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        min_price: 23990000,
        max_price: 27990000,
        average_rating: 4.9,
        total_reviews: 50,
        merchant_count: 3,
      } as never,
      offers: [
        {
          id: 'o-tiki',
          platform: 'tiki',
          price_current: 23990000,
          price_original: 25990000,
          url: 'https://tiki.vn/p1.html',
          merchant: {
            id: 'm1',
            name: 'Tiki Trading',
            is_official: true,
            risk_score: 5,
          },
        },
        {
          id: 'o-cps',
          platform: 'cellphones',
          price_current: 25990000,
          price_original: 26990000,
          url: 'https://cellphones.com.vn/p1.html',
          merchant: {
            id: 'm2',
            name: 'CellphoneS',
            is_official: true,
            risk_score: 5,
          },
        },
        {
          id: 'o-shopee',
          platform: 'shopee',
          price_current: 26990000,
          price_original: 31990000,
          url: 'https://shopee.vn/product/1/2',
          merchant: {
            id: 'm3',
            name: 'Shopee Seller',
            is_official: false,
            risk_score: 20,
          },
        },
      ] as never[],
    },
  ];
  const tikiOnlyRadar = computeRadarUnit(mockRadarCluster, {
    platform: 'tiki',
    limit: 10,
  });
  assert.equal(tikiOnlyRadar.platformFilter, 'tiki');
  assert.equal(tikiOnlyRadar.genuineDeals.length, 1);
  assert.equal(tikiOnlyRadar.genuineDeals[0]!.platform, 'tiki');
  assert.equal(
    tikiOnlyRadar.fakeSaleTraps.length,
    0,
    'Shopee fake-sale trap must be excluded when filtering Deal Radar by platform=tiki'
  );
  const shopeeOnlyRadar = computeRadarUnit(mockRadarCluster, {
    platform: 'shopee',
    limit: 10,
  });
  assert.equal(shopeeOnlyRadar.fakeSaleTraps.length, 1);
  assert.equal(shopeeOnlyRadar.fakeSaleTraps[0]!.platform, 'shopee');

  const cacheTagsMod = await import('../../web/src/server/rate/cache-tags.js');
  const { resolveRevalidationTargets, RATE_CACHE_TAGS } = (
    'resolveRevalidationTargets' in cacheTagsMod
      ? cacheTagsMod
      : (cacheTagsMod as unknown as { default: typeof cacheTagsMod }).default
  ) as typeof cacheTagsMod;
  const revalTargets = resolveRevalidationTargets({
    slugs: ['iphone-16-pro-max'],
    merchants: ['shopee:88201679'],
    paths: ['/vi/smartphones/iphone-16-pro-max'],
  });
  assert.ok(revalTargets.tags.includes('rate:product:iphone-16-pro-max'));
  assert.ok(revalTargets.tags.includes(RATE_CACHE_TAGS.PRODUCTS));
  assert.ok(
    revalTargets.tags.includes(RATE_CACHE_TAGS.OFFERS),
    'Slug/merchant revalidation must invalidate rate:offers'
  );
  assert.ok(
    revalTargets.tags.includes(RATE_CACHE_TAGS.PRICE_HISTORY),
    'Slug revalidation must invalidate rate:price-history'
  );
  assert.ok(
    revalTargets.tags.includes(RATE_CACHE_TAGS.REVIEWS),
    'Slug revalidation must invalidate rate:reviews'
  );
  assert.ok(revalTargets.tags.includes(RATE_CACHE_TAGS.DEALS));
  assert.ok(revalTargets.tags.includes('rate:merchant:shopee:88201679'));
  assert.deepEqual(revalTargets.paths, ['/vi/smartphones/iphone-16-pro-max']);

  const openApiCheckMod = await import('../../web/src/server/rate/openapi.js');
  const { buildRateOpenApiSpec: buildSpecForCheck } = (
    'buildRateOpenApiSpec' in openApiCheckMod
      ? openApiCheckMod
      : (openApiCheckMod as unknown as { default: typeof openApiCheckMod })
          .default
  ) as typeof openApiCheckMod;
  const specDoc = buildSpecForCheck('https://rate.vn');
  assert.equal(specDoc.openapi, '3.1.0');
  const ingestPayloadSchema = specDoc.components.schemas
    .ExtensionQuarantineIngestPayload as {
    required?: string[];
  };
  assert.deepEqual(ingestPayloadSchema.required, [
    'platform',
    'externalItemId',
    'url',
    'title',
    'price',
    'userConsentOptIn',
  ]);
  const verdictLevelSchema = specDoc.components.schemas.PriceVerdictLevel as {
    enum?: string[];
  };
  assert.deepEqual(verdictLevelSchema.enum, [
    'genuine_deal',
    'fair_market',
    'above_market',
    'inflated_fake_sale',
    'insufficient_data',
    'ambiguous_variant',
    'skipped_accessory',
  ]);
  const lookupParamNames = (
    specDoc.paths['/api/v1/rate/extension/lookup']?.get?.parameters ?? []
  ).map((p) => p.name);
  assert.ok(lookupParamNames.includes('selectedVariant'));
  assert.ok(lookupParamNames.includes('skuText'));
  assert.ok(lookupParamNames.includes('externalId'));

  const rateApiBatchMod = await import('../../web/src/lib/rate-api.js');
  const { getMasterProductOffersBatch, filterAndSortMerchants } = (
    'getMasterProductOffersBatch' in rateApiBatchMod
      ? rateApiBatchMod
      : (rateApiBatchMod as unknown as { default: typeof rateApiBatchMod })
          .default
  ) as typeof rateApiBatchMod;
  const emptyBatchMap = await getMasterProductOffersBatch(['', '   ']);
  assert.equal(
    emptyBatchMap.size,
    0,
    'getMasterProductOffersBatch must return an empty Map for empty/whitespace IDs without querying PostgREST'
  );

  // Verify filterAndSortMerchants filters and sorts across all candidates before applying limit (#347)
  const sampleMerchants = [
    {
      id: 'm-1',
      platform: 'shopee',
      platform_shop_id: 'shop-1',
      name: 'Mega Follower Shop',
      slug: 'mega-follower-shop',
      url: 'https://shopee.vn/shop/shop-1',
      is_official: true,
      rating_star: 4.8,
      follower_count: 900_000,
      location: 'HCM',
      dosafe_risk_score: 25,
      review_risk_score: 30,
      risk_score: 30,
      trust_score: 70,
      product_count: 5,
      min_price: 10_000_000,
      max_price: 20_000_000,
      review_risk_breakdown: {
        total_reviews: 10,
        authentic_count: 7,
        coin_spam_count: 2,
        seeding_fake_count: 1,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 30,
      },
      updated_at: null,
    },
    {
      id: 'm-2',
      platform: 'cellphones',
      platform_shop_id: 'cps-official',
      name: 'CellphoneS Official',
      slug: 'cellphones-official',
      url: 'https://cellphones.com.vn',
      is_official: true,
      rating_star: 4.9,
      follower_count: 50_000,
      location: 'HCM',
      dosafe_risk_score: 4,
      review_risk_score: 2,
      risk_score: 4,
      trust_score: 96,
      product_count: 42,
      min_price: 5_000_000,
      max_price: 45_000_000,
      review_risk_breakdown: {
        total_reviews: 100,
        authentic_count: 98,
        coin_spam_count: 2,
        seeding_fake_count: 0,
        sabotage_or_bombing_count: 0,
        suspicious_ratio_pct: 2,
      },
      updated_at: null,
    },
  ];
  const searchedWithLimit1 = filterAndSortMerchants(sampleMerchants, {
    q: 'cellphones',
    limit: 1,
  });
  assert.equal(searchedWithLimit1.length, 1);
  assert.equal(
    searchedWithLimit1[0]?.id,
    'm-2',
    'filterAndSortMerchants must match q across all candidates before slicing to limit=1'
  );
  const sortedBySeedingLimit1 = filterAndSortMerchants(sampleMerchants, {
    sort: 'seeding_asc',
    minTrust: 90,
    limit: 1,
  });
  assert.equal(sortedBySeedingLimit1.length, 1);
  assert.equal(
    sortedBySeedingLimit1[0]?.id,
    'm-2',
    'filterAndSortMerchants must sort by seeding_asc and filter by minTrust before slicing to limit=1'
  );

  console.log(
    '  ✅ [5/6] Zero-Trust Quarantine, Opt-In Consent, Bounded Rate Limiter, OpenAPI 3.1 Contract, Batched Offers & Full 10/10 Platform Capability Matrix passed'
  );

  // 6. Live Read-Only Lookup against Supabase `rate` schema (when real credentials are present)
  const sbUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const isCiPlaceholder = !sbUrl || sbUrl.includes('example.supabase.co');

  if (isCiPlaceholder) {
    console.log(
      '  ✅ [6/6] Live Read-Only Lookup skipped in CI placeholder environment'
    );
  } else {
    const rateApiMod = await import('../../web/src/lib/rate-api.js');
    const { getMasterProducts } = (
      'getMasterProducts' in rateApiMod
        ? rateApiMod
        : (rateApiMod as unknown as { default: typeof rateApiMod }).default
    ) as typeof rateApiMod;
    const existingCatalog = await getMasterProducts({ limit: 5 });
    const sampleMaster = existingCatalog[0];

    const liveLookup = await lookupExtensionProduct({
      platform: 'shopee',
      url: dirtyShopeeUrl,
      title: sampleMaster
        ? `Điện thoại ${sampleMaster.brand} ${sampleMaster.name} Chính hãng`
        : 'Điện thoại Apple iPhone 16 Pro Max 256GB VN/A',
      selectedVariant: sampleMaster?.storage_gb
        ? `${sampleMaster.storage_gb}GB`
        : '256GB',
      price: sampleMaster ? Number(sampleMaster.min_price) : 28990000,
      originalPrice: sampleMaster
        ? Math.round(Number(sampleMaster.min_price) * 1.25)
        : 34990000,
      mode: 'full',
    });
    assert.equal(
      liveLookup.canonicalUrl,
      'https://shopee.vn/Dien-thoai-iPhone-16-Pro-Max-256GB-i.88201679.29512841920'
    );
    assert.equal(liveLookup.isAccessoryOrPart, false);
    if (sampleMaster) {
      assert.notEqual(
        liveLookup.matchStatus,
        'not_found',
        `Must match existing catalog product "${sampleMaster.name}"`
      );
      assert.ok(liveLookup.masterProduct?.id);
      assert.ok(liveLookup.categorySlug);
      assert.ok(
        liveLookup.productDetailUrl?.startsWith(`/${liveLookup.categorySlug}/`)
      );
      assert.ok(
        liveLookup.leaderboardUrl?.includes(`cat=${liveLookup.categorySlug}`)
      );
      assert.ok(Array.isArray(liveLookup.leaderboardStandings));
      if (liveLookup.leaderboardStandings.length > 0) {
        assert.ok(liveLookup.leaderboardStandings[0]!.rank >= 1);
        assert.ok(liveLookup.leaderboardStandings[0]!.score10 > 0);
      }
      assert.ok(liveLookup.radarSignal);
      assert.ok(
        ['genuine_deal', 'fake_sale_trap', 'none'].includes(
          liveLookup.radarSignal.verdict
        )
      );
      assert.ok(liveLookup.radarSignal.spreadPct >= 0);
    }

    // Verify non-smartphone 5-category routing (e.g., Laptops -> `/laptops/...`)
    const laptopLookup = await lookupExtensionProduct({
      platform: 'fptshop',
      url: 'https://fptshop.com.vn/may-tinh-xach-tay/macbook-air-m4-13-inch-256gb',
      title: 'Laptop Apple MacBook Air M4 13 inch 256GB Chính Hãng SA/A',
      selectedVariant: '256GB',
      price: 25490000,
      originalPrice: 26990000,
      mode: 'pill',
    });
    if (laptopLookup.masterProduct) {
      assert.equal(laptopLookup.categorySlug, 'laptops');
      assert.ok(laptopLookup.productDetailUrl?.startsWith('/laptops/'));
      assert.equal(laptopLookup.leaderboardUrl, '/leaderboard?cat=laptops');
      assert.ok(laptopLookup.radarSignal);
    }

    console.log(
      `  ✅ [6/9] Live Read-Only Lookup matched "${liveLookup.masterProduct?.name || 'N/A'}" (cat=${liveLookup.categorySlug}, rank=#${liveLookup.leaderboardStandings?.[0]?.rank}/${liveLookup.leaderboardStandings?.[0]?.totalInCategory}, radar=${liveLookup.radarSignal?.verdict}, offers=${liveLookup.allOffers.length})`
    );

    const dealsMod = await import('../../web/src/server/rate/deals.js');
    const {
      getCrossPlatformDealRadar,
      computeCrossPlatformDealRadarFromData,
      computeProductRadarSignal,
    } = (
      'getCrossPlatformDealRadar' in dealsMod
        ? dealsMod
        : (dealsMod as unknown as { default: typeof dealsMod }).default
    ) as typeof dealsMod;

    const radar = await getCrossPlatformDealRadar({ limit: 8 });
    assert.ok(radar.totalClustersAnalyzed >= 0);
    assert.ok(radar.totalOffersAnalyzed >= 0);
    assert.ok(Array.isArray(radar.genuineDeals));
    assert.ok(Array.isArray(radar.fakeSaleTraps));
    assert.ok(Array.isArray(radar.priceSpreadLeaders));

    if (sampleMaster) {
      const fixtureOffers = [
        {
          id: 'offer-low',
          platform: 'shopee',
          external_id: 'sp-1',
          merchant_id: 'm-1',
          merchant_name: 'Apple Flagship Store',
          is_official_mall: true,
          merchant_risk_score: 5,
          merchant: {
            id: 'm-1',
            name: 'Apple Flagship Store',
            platform: 'shopee',
            is_official_mall: true,
            risk_score: 5,
            rating: 4.9,
          },
          title: sampleMaster.name,
          url: 'https://shopee.vn/product/1/1',
          image_url: sampleMaster.image_url || null,
          price_current: 24990000,
          price_original: 29990000,
          discount_pct: 17,
          in_stock: true,
          historical_low_price: 24990000,
          updated_at: new Date().toISOString(),
        },
        {
          id: 'offer-mid',
          platform: 'lazada',
          external_id: 'lz-1',
          merchant_id: 'm-2',
          merchant_name: 'Lazada Official Mall',
          is_official_mall: true,
          merchant_risk_score: 8,
          merchant: {
            id: 'm-2',
            name: 'Lazada Official Mall',
            platform: 'lazada',
            is_official_mall: true,
            risk_score: 8,
            rating: 4.8,
          },
          title: sampleMaster.name,
          url: 'https://www.lazada.vn/products/p-i1.html',
          image_url: sampleMaster.image_url || null,
          price_current: 27990000,
          price_original: 29990000,
          discount_pct: 7,
          in_stock: true,
          historical_low_price: 26990000,
          updated_at: new Date().toISOString(),
        },
        {
          id: 'offer-trap',
          platform: 'tiki',
          external_id: 'tk-1',
          merchant_id: 'm-3',
          merchant_name: 'Trap Store',
          is_official_mall: false,
          merchant_risk_score: 45,
          merchant: {
            id: 'm-3',
            name: 'Trap Store',
            platform: 'tiki',
            is_official_mall: false,
            risk_score: 45,
            rating: 4.1,
          },
          title: sampleMaster.name,
          url: 'https://tiki.vn/product-p1.html',
          image_url: sampleMaster.image_url || null,
          price_current: 28990000,
          price_original: 36990000,
          discount_pct: 22,
          in_stock: true,
          historical_low_price: 27990000,
          updated_at: new Date().toISOString(),
        },
      ];
      const deterministicRadar = computeCrossPlatformDealRadarFromData(
        [{ master: sampleMaster, offers: fixtureOffers }],
        { limit: 8 }
      );
      assert.equal(deterministicRadar.totalClustersAnalyzed, 1);
      assert.equal(deterministicRadar.totalOffersAnalyzed, 3);
      assert.ok(deterministicRadar.genuineDeals.length >= 1);
      assert.ok(deterministicRadar.genuineDeals[0]!.savingsVsMedianVnd > 0);
      assert.ok(deterministicRadar.priceSpreadLeaders.length >= 1);
      assert.ok(deterministicRadar.priceSpreadLeaders[0]!.spreadVnd > 0);

      const perProductSignal = computeProductRadarSignal(
        sampleMaster,
        fixtureOffers
      );
      assert.equal(perProductSignal.verdict, 'genuine_deal');
      assert.ok(perProductSignal.spreadPct > 0);
    }
    console.log(
      `  ✅ [7/9] Cross-Platform Deal Radar & per-product computeProductRadarSignal verified (liveClusters=${radar.totalClustersAnalyzed}, liveOffers=${radar.totalOffersAnalyzed})`
    );

    const openApiMod = await import('../../web/src/server/rate/openapi.js');
    const { buildRateOpenApiSpec } = (
      'buildRateOpenApiSpec' in openApiMod
        ? openApiMod
        : (openApiMod as unknown as { default: typeof openApiMod }).default
    ) as typeof openApiMod;

    const openApiSpec = buildRateOpenApiSpec('https://rate.vn');
    assert.equal(openApiSpec.openapi, '3.1.0');
    assert.equal(openApiSpec.info.version, '1.7.0');
    assert.ok('/api/v1/rate/deals' in openApiSpec.paths);
    assert.ok('/api/v1/rate/extension/lookup' in openApiSpec.paths);
    assert.ok('/api/v1/rate/openapi' in openApiSpec.paths);
    assert.ok('ProductDealRadarSignal' in openApiSpec.components.schemas);
    console.log(
      `  ✅ [8/9] Public REST API v1 OpenAPI 3.1.0 Spec verified (${Object.keys(openApiSpec.paths).length} endpoints, ${Object.keys(openApiSpec.components.schemas).length} schemas)`
    );

    const rateServerMod = await import('../../web/src/server/rate/index.js');
    const { getMerchantsList, getMerchantProfileById } = (
      'getMerchantsList' in rateServerMod
        ? rateServerMod
        : (rateServerMod as unknown as { default: typeof rateServerMod })
            .default
    ) as typeof rateServerMod;

    const merchantsList = await getMerchantsList({
      sort: 'trust_desc',
      limit: 20,
    });
    assert.ok(Array.isArray(merchantsList));
    if (merchantsList.length > 0) {
      assert.ok(merchantsList[0]!.trust_score >= 0);
      const firstMerchantProfile = await getMerchantProfileById(
        merchantsList[0]!.id
      );
      assert.ok(firstMerchantProfile);
      assert.equal(firstMerchantProfile.id, merchantsList[0]!.id);
      assert.ok(Array.isArray(firstMerchantProfile.listings));
    }
    console.log(
      `  ✅ [9/9] Live Merchant Risk & Trust Directory verified (${merchantsList.length} merchants audited)`
    );
  }

  // OpenAPI 3.1 contract verification (#359)
  const openApiMod = await import('../../web/src/server/rate/openapi.js');
  const { buildRateOpenApiSpec } = (
    'buildRateOpenApiSpec' in openApiMod
      ? openApiMod
      : (openApiMod as unknown as { default: typeof openApiMod }).default
  ) as typeof openApiMod;
  const openApiSpec = buildRateOpenApiSpec('https://rate.vn');
  const productParamNames = (
    openApiSpec.paths['/api/v1/rate/products']?.get?.parameters ?? []
  ).map((p) => p.name);
  for (const expectedParam of [
    'minRefreshHz',
    'has5g',
    'minBatteryMah',
    'minFastChargeW',
    'hasNfc',
  ]) {
    assert.ok(
      productParamNames.includes(expectedParam),
      `OpenAPI /api/v1/rate/products must document ${expectedParam}`
    );
  }
  const versusParamNames = (
    openApiSpec.paths['/api/v1/rate/versus']?.get?.parameters ?? []
  ).map((p) => p.name);
  for (const expectedParam of [
    'w_screen',
    'w_performance',
    'w_camera',
    'w_battery',
    'w_value',
  ]) {
    assert.ok(
      versusParamNames.includes(expectedParam),
      `OpenAPI /api/v1/rate/versus must document ${expectedParam}`
    );
  }
  const reviewParamNames = (
    openApiSpec.paths['/api/v1/rate/reviews']?.get?.parameters ?? []
  ).map((p) => p.name);
  assert.ok(reviewParamNames.includes('masterProductId'));
  assert.ok(reviewParamNames.includes('limit'));
  const ingestProps = (
    openApiSpec.components.schemas.ExtensionQuarantineIngestPayload as {
      properties: Record<string, { maximum?: number }>;
    }
  ).properties;
  assert.equal(ingestProps.price?.maximum, 500_000_000);
  assert.equal(ingestProps.originalPrice?.maximum, 500_000_000);
  console.log(
    '  ✅ [OpenAPI 3.1] Spec parameter and schema bounds verified (#359)'
  );

  // Verify 10-platform URL parsing, Phong Vu SKU stripping, decimal VND parsing, and crowd ingest URL guard (#365)
  assert.deepEqual(
    parseEcommerceUrlOrQuery('https://shopee.vn/opaanlp/88201679/25678901234'),
    {
      isUrl: true,
      platform: 'shopee',
      platformShopId: '88201679',
      platformItemId: '25678901234',
      internalSlug: null,
    },
    'parseEcommerceUrlOrQuery must support Shopee /opaanlp/<shopId>/<itemId> share URLs'
  );
  assert.deepEqual(
    parseEcommerceUrlOrQuery(
      'https://www.tiktok.com/@appleflagship/video/7421234567890123456'
    ),
    {
      isUrl: true,
      platform: 'tiktok',
      platformShopId: null,
      platformItemId: null,
      internalSlug: null,
    },
    'parseEcommerceUrlOrQuery must not treat non-commerce TikTok /video/<id> URLs as product listings'
  );
  assert.equal(
    parseEcommerceUrlOrQuery('https://www.thegioididong.com/dtdd')
      .platformItemId,
    null,
    'parseEcommerceUrlOrQuery must reject 1-segment TGDD category index URLs'
  );
  assert.equal(
    parseEcommerceUrlOrQuery('https://fptshop.com.vn/dien-thoai')
      .platformItemId,
    null,
    'parseEcommerceUrlOrQuery must reject 1-segment FPT Shop category index URLs'
  );
  assert.equal(
    parseEcommerceUrlOrQuery(
      'https://cellphones.com.vn/sforum/danh-gia-iphone-16e'
    ).platformItemId,
    null,
    'parseEcommerceUrlOrQuery must reject CellphoneS sforum blog URLs'
  );
  assert.equal(
    parseEcommerceUrlOrQuery(
      'https://didongviet.vn/dchannel/tren-tay-iphone-16e.html'
    ).platformItemId,
    null,
    'parseEcommerceUrlOrQuery must reject Di Dong Viet dchannel blog URLs'
  );

  assert.equal(
    extractKeywordFromProductUrl(
      'https://phongvu.vn/apple-iphone-16e-128gb--s2502001'
    ),
    'apple iphone 16e 128gb',
    'extractKeywordFromProductUrl must strip Phong Vu --s<sku> suffix'
  );
  assert.equal(
    extractKeywordFromProductUrl(
      'https://shopee.vn/opaanlp/88201679/25678901234'
    ),
    '',
    'extractKeywordFromProductUrl must return empty string for numeric Shopee /opaanlp/ share URLs'
  );
  assert.equal(
    extractKeywordFromProductUrl(
      'https://cellphones.com.vn/catalogsearch/result?q=iphone'
    ),
    '',
    'extractKeywordFromProductUrl must return empty string for non-product search paths'
  );

  assert.equal(
    detectEcommercePlatform('https://www.dienmayxanh.com/dtdd/iphone-16e'),
    'tgdd',
    'detectEcommercePlatform must map dienmayxanh.com to tgdd'
  );
  assert.deepEqual(
    extractIdsFromUrl(
      'shopee',
      'https://shopee.vn/opaanlp/88201679/25678901234'
    ),
    {
      externalShopId: '88201679',
      externalItemId: '25678901234',
    }
  );
  assert.deepEqual(
    extractIdsFromUrl(
      'tiktok',
      'https://www.tiktok.com/@appleflagship/video/7421234567890123456'
    ),
    {
      externalItemId: null,
      externalShopId: null,
    }
  );
  assert.deepEqual(
    extractIdsFromUrl(
      'cellphones',
      'https://cellphones.com.vn/sforum/danh-gia-iphone-16e'
    ),
    {
      externalItemId: null,
      externalShopId: null,
    }
  );
  assert.equal(
    parseVndPriceText('28990000.00'),
    28990000,
    'parseVndPriceText must strip decimal .00 instead of concatenating fractional digits'
  );
  assert.equal(
    parseVndPriceText('28,990,000.00 ₫'),
    28990000,
    'parseVndPriceText must parse thousand-separated decimal VND strings'
  );

  const nonProductUrlIngest = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: '29512841920',
    url: 'https://shopee.vn/search?keyword=iphone',
    title: 'Điện thoại iPhone 16 Pro Max 256GB',
    price: 28990000,
    userConsentOptIn: true,
  });
  assert.equal(nonProductUrlIngest.accepted, false);
  assert.equal(
    nonProductUrlIngest.jobState,
    'rejected_invalid_url',
    'ingestExtensionCrowdSignal must reject search/category URLs that lack a product item ID'
  );

  let capturedIngestPayload: Record<string, unknown> | null = null;
  const invertedOriginalIngest = await ingestExtensionCrowdSignal({
    platform: 'shopee',
    externalItemId: '29512841920',
    externalShopId: '88201679',
    url: 'https://shopee.vn/product/88201679/29512841920',
    title: 'Điện thoại iPhone 16 Pro Max 256GB',
    price: 28990000,
    originalPrice: 19990000,
    userConsentOptIn: true,
    rateClient: {
      rpc: async (_fn, args) => {
        capturedIngestPayload = args.p_payload as Record<string, unknown>;
        return { data: { state: 'enqueued', job_id: 'job-365' }, error: null };
      },
    },
  });
  assert.equal(invertedOriginalIngest.accepted, true);
  assert.equal(
    capturedIngestPayload?.['observed_original_price'],
    null,
    'ingestExtensionCrowdSignal must normalize inverted originalPrice (< price) to null'
  );
  console.log(
    '  ✅ [URL & Extension Hardening] Shopee /opaanlp/, TikTok video exclusion, retail path filtering, Phong Vu SKU stripping & crowd ingest URL guard verified (#365)'
  );

  // Verify merchant review_risk extraction, price history Infinity guard, and Deal Radar bounds (#371)
  assert.equal(MAX_VALID_VND_PRICE, 1_000_000_000);
  assert.equal(normalizeOfferOriginalPrice(28_990_000, 32_990_000), 32_990_000);
  assert.equal(
    normalizeOfferOriginalPrice(28_990_000, 19_990_000),
    null,
    'normalizeOfferOriginalPrice must reject inverted original price < priceCurrent'
  );
  assert.equal(
    normalizeOfferOriginalPrice(28_990_000, 9_000_000_000),
    null,
    'normalizeOfferOriginalPrice must reject astronomical original price > 1B VND'
  );

  const mappedFallbackOffer = mapOfferRowToMerchantOffer({
    id: 'off-371',
    platform: 'shopee',
    title: 'iPhone 16 Pro Max 256GB',
    price_current: 28_990_000,
    price_original: 9_000_000_000,
    stock: 5,
    rating_star: 4.9,
    rating_count: 42,
    url: 'https://shopee.vn/product/88201679/29512841920',
    merchants: {
      id: 'm-371',
      name: 'Seeding Trap Shop',
      platform: 'shopee',
      is_official: false,
      rating_star: 4.2,
      follower_count: 120,
      location: 'HN',
      risk_score: 12,
      metadata: {
        dosafe_risk_score: 15,
        review_risk_score: 68,
        combined_risk_score: 48,
        seeding_spam_ratio_pct: 55,
      },
    },
  });
  assert.equal(mappedFallbackOffer.price_original, null);
  assert.equal(mappedFallbackOffer.merchant.dosafe_risk_score, 15);
  assert.equal(mappedFallbackOffer.merchant.review_risk_score, 68);
  assert.equal(mappedFallbackOffer.merchant.risk_score, 68);
  assert.ok(mappedFallbackOffer.merchant.review_risk_breakdown !== null);

  const mappedTrustViewOffer = mapTrustViewRowToMerchantOffer({
    id: 'off-tv-371',
    merchant_id: 'm-tv-371',
    platform: 'lazada',
    title: 'Galaxy S25 Ultra',
    price_current: 26_990_000,
    price_original: 15_000_000,
    stock: 3,
    rating_star: 4.8,
    rating_count: 19,
    url: 'https://www.lazada.vn/products/p-i123.html',
    merchant_name: 'Lazada Store',
    merchant_is_official: true,
    threat_risk_score: 8,
    dosafe_risk_score: 8,
    review_risk_score: 10,
  });
  assert.equal(
    mappedTrustViewOffer.price_original,
    null,
    'mapTrustViewRowToMerchantOffer must normalize inverted price_original to null'
  );

  const origFetch371 = globalThis.fetch;
  const origSupabaseUrl371 = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origSupabaseAnon371 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key';
    }
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            id: 1,
            product_id: 'off-valid-371',
            price: 9_000_000_000,
            price_original: 10_000_000_000,
            recorded_at: '2026-10-18T10:00:00Z',
            source: 'crawler',
          },
          {
            id: 2,
            product_id: 'off-valid-371',
            price: 27_990_000,
            price_original: 9_000_000_000,
            recorded_at: '2026-10-18T11:00:00Z',
            source: 'crawler',
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )) as typeof fetch;

    const zeroPriceSummary = await getMasterProductPriceHistory('master-371', [
      {
        ...mappedFallbackOffer,
        id: 'off-zero-371',
        price_current: 0,
        price_original: null,
      },
      {
        ...mappedFallbackOffer,
        id: 'off-runaway-371',
        price_current: 5_000_000_000,
        price_original: null,
      },
    ]);
    assert.equal(zeroPriceSummary.points.length, 0);
    assert.deepEqual(zeroPriceSummary.byOffer, {});
    assert.equal(zeroPriceSummary.currentMinPrice, null);
    assert.equal(zeroPriceSummary.lowestEverPrice, null);

    const boundedPriceSummary = await getMasterProductPriceHistory(
      'master-371',
      [
        {
          ...mappedFallbackOffer,
          id: 'off-valid-371',
          price_current: 28_990_000,
          price_original: null,
        },
      ]
    );
    assert.equal(
      boundedPriceSummary.points.length,
      1,
      'getMasterProductPriceHistory must drop >1B VND price_history points'
    );
    assert.equal(boundedPriceSummary.points[0]?.price, 27_990_000);
    assert.equal(
      boundedPriceSummary.points[0]?.price_original,
      null,
      'getMasterProductPriceHistory must normalize >1B VND price_original on history rows to null'
    );
    assert.equal(
      boundedPriceSummary.byOffer['off-valid-371']?.historical_max_price,
      28_990_000
    );
  } finally {
    globalThis.fetch = origFetch371;
    if (origSupabaseUrl371 === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = origSupabaseUrl371;
    }
    if (origSupabaseAnon371 === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origSupabaseAnon371;
    }
  }

  const dealsMod371 = await import('../../web/src/server/rate/deals.js');
  const { computeCrossPlatformDealRadarFromData: runDealRadar371 } = (
    'computeCrossPlatformDealRadarFromData' in dealsMod371
      ? dealsMod371
      : (dealsMod371 as unknown as { default: typeof dealsMod371 }).default
  ) as typeof dealsMod371;

  const radar371 = runDealRadar371([
    {
      master: {
        id: 'mp-371',
        slug: 'apple-iphone-16-pro-max-256gb',
        name: 'iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        model: 'iPhone 16 Pro Max',
        model_key: 'apple_iphone_16_pro_max_256gb',
        category_id: null,
        ram_gb: 8,
        storage_gb: 256,
        screen_size_inch: 6.9,
        battery_mah: 4685,
        has_5g: true,
        min_price: 26_990_000,
        max_price: 29_990_000,
        average_rating: 4.9,
        user_rating_weighted: 4.9,
        expert_rating: 9.4,
        total_reviews: 50,
        merchant_count: 3,
        thumbnail: null,
        images: [],
        key_specs: null,
        specifications: null,
        metadata: { category_slug: 'smartphones' },
      },
      offers: [
        {
          id: 'o-seeding-cheap',
          platform: 'shopee',
          title: 'iPhone 16 Pro Max',
          price_current: 25_990_000,
          price_original: 29_990_000,
          stock: 5,
          rating_star: 4.9,
          rating_count: 100,
          url: 'https://shopee.vn/product/1/1',
          merchant: {
            id: 'm-seeding',
            name: 'High Review Risk Shop',
            platform: 'shopee',
            is_official: false,
            rating_star: 4.5,
            follower_count: 500,
            location: 'HN',
            risk_score: 10,
            dosafe_risk_score: 10,
            review_risk_score: 65,
            review_risk_breakdown: null,
          },
        },
        {
          id: 'o-clean-deal',
          platform: 'lazada',
          title: 'iPhone 16 Pro Max',
          price_current: 26_990_000,
          price_original: 9_000_000_000,
          stock: 5,
          rating_star: 4.9,
          rating_count: 80,
          url: 'https://www.lazada.vn/products/p-i2.html',
          merchant: {
            id: 'm-clean',
            name: 'Clean Official Mall',
            platform: 'lazada',
            is_official: true,
            rating_star: 4.9,
            follower_count: 10000,
            location: 'HCM',
            risk_score: 8,
            dosafe_risk_score: 8,
            review_risk_score: 12,
            review_risk_breakdown: null,
          },
        },
        {
          id: 'o-mid',
          platform: 'tiki',
          title: 'iPhone 16 Pro Max',
          price_current: 28_990_000,
          price_original: 29_990_000,
          stock: 5,
          rating_star: 4.9,
          rating_count: 60,
          url: 'https://tiki.vn/p3.html',
          merchant: {
            id: 'm-mid',
            name: 'Tiki Trading',
            platform: 'tiki',
            is_official: true,
            rating_star: 4.9,
            follower_count: 50000,
            location: 'HCM',
            risk_score: 5,
            dosafe_risk_score: 5,
            review_risk_score: 5,
            review_risk_breakdown: null,
          },
        },
        {
          id: 'o-high',
          platform: 'fptshop',
          title: 'iPhone 16 Pro Max',
          price_current: 29_990_000,
          price_original: 31_990_000,
          stock: 5,
          rating_star: 4.9,
          rating_count: 40,
          url: 'https://fptshop.com.vn/dien-thoai/iphone-16-pro-max',
          merchant: {
            id: 'm-fpt',
            name: 'FPT Shop',
            platform: 'fptshop',
            is_official: true,
            rating_star: 4.9,
            follower_count: 40000,
            location: 'HCM',
            risk_score: 5,
            dosafe_risk_score: 5,
            review_risk_score: 5,
            review_risk_breakdown: null,
          },
        },
        {
          id: 'o-runaway',
          platform: 'cellphones',
          title: 'Corrupted 5B Offer',
          price_current: 5_000_000_000,
          price_original: 6_000_000_000,
          stock: 1,
          rating_star: 5,
          rating_count: 1,
          url: 'https://cellphones.com.vn/iphone-16-pro-max.html',
          merchant: {
            id: 'm-cps',
            name: 'CellphoneS',
            platform: 'cellphones',
            is_official: true,
            rating_star: 4.9,
            follower_count: 10000,
            location: 'HCM',
            risk_score: 5,
            dosafe_risk_score: 5,
            review_risk_score: 5,
            review_risk_breakdown: null,
          },
        },
      ],
    },
  ]);
  assert.equal(
    radar371.totalOffersAnalyzed,
    4,
    'computeCrossPlatformDealRadarFromData must exclude >1B VND corrupted offers'
  );
  assert.equal(
    radar371.genuineDeals[0]?.merchantId,
    'm-clean',
    'computeCrossPlatformDealRadarFromData must skip merchants with review_risk_score > 30 even if base risk_score <= 30'
  );
  assert.equal(
    radar371.genuineDeals[0]?.priceOriginal,
    null,
    'computeCrossPlatformDealRadarFromData must normalize >1B VND price_original to null'
  );
  assert.equal(radar371.genuineDeals[0]?.claimedDiscountPct, 0);
  assert.equal(radar371.genuineDeals[0]?.merchantRiskScore, 12);
  console.log(
    '  ✅ [Merchant Dual-Risk & Deal Radar Bounds] Metadata review_risk extraction, price_history Infinity guard, and 1B VND Deal Radar bounds verified (#371)'
  );

  // 26. Extension Signal Sanitization & Runtime ID Sender Guard (#382)
  const { sanitizeExtensionProductSignal, MAX_VALID_EXTENSION_VND_PRICE } =
    await import('./security-guards.js');
  assert.equal(MAX_VALID_EXTENSION_VND_PRICE, 1_000_000_000);

  const glitchedSignal = sanitizeExtensionProductSignal({
    platform: 'shopee',
    canonicalUrl: 'https://shopee.vn/product/123/456',
    externalItemId: '456',
    externalShopId: '123',
    title: '  Apple iPhone 16 Pro Max 256GB  ',
    selectedVariant: '   ',
    price: 2_899_000_000_000, // > 1B VND unscaled glitch
    originalPrice: 30_000_000,
    ratingStar: 6.2, // > 5 out of bounds
    ratingCount: -5, // negative out of bounds
  });
  assert.equal(glitchedSignal.title, 'Apple iPhone 16 Pro Max 256GB');
  assert.equal(glitchedSignal.selectedVariant, null);
  assert.equal(
    glitchedSignal.price,
    null,
    'sanitizeExtensionProductSignal must drop price > MAX_VALID_EXTENSION_VND_PRICE so lookup does not 400'
  );
  assert.equal(glitchedSignal.originalPrice, 30_000_000);
  assert.equal(
    glitchedSignal.ratingStar,
    null,
    'ratingStar > 5 must be dropped'
  );
  assert.equal(
    glitchedSignal.ratingCount,
    null,
    'negative ratingCount must be dropped'
  );

  const invertedSignal = sanitizeExtensionProductSignal({
    platform: 'tiki',
    canonicalUrl: 'https://tiki.vn/iphone-p123.html',
    externalItemId: '123',
    externalShopId: null,
    title: 'iPhone 16 Pro Max',
    selectedVariant: 'Titan Tự Nhiên',
    price: 28_990_000,
    originalPrice: 20_000_000, // < price
    ratingStar: 4.888,
    ratingCount: 42,
  });
  assert.equal(invertedSignal.price, 28_990_000);
  assert.equal(
    invertedSignal.originalPrice,
    null,
    'sanitizeExtensionProductSignal must drop inverted originalPrice < price'
  );
  assert.equal(invertedSignal.ratingStar, 4.89);
  assert.equal(invertedSignal.ratingCount, 42);

  assert.equal(
    isPrivilegedExtensionSender(
      { id: 'ext-other', url: 'chrome-extension://ext-other/sidepanel.html' },
      'ext-rate-own'
    ),
    false,
    'isPrivilegedExtensionSender must reject messages from a foreign extension runtime ID'
  );
  assert.equal(
    isPrivilegedExtensionSender(
      {
        id: 'ext-rate-own',
        url: 'chrome-extension://ext-rate-own/sidepanel.html',
      },
      'ext-rate-own'
    ),
    true,
    'isPrivilegedExtensionSender must accept messages matching the own extension runtime ID'
  );
  console.log(
    '  ✅ [Extension Signal & Sender Guards] sanitizeExtensionProductSignal bounds & runtimeId verification passed (#382)'
  );

  console.log('🎉 All Rate Browser Extension MV3 v2 tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Extension test suite failed:', err);
  process.exit(1);
});
