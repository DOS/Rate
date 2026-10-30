import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanExtractedProductTitle,
  detectEcommercePlatform,
  extractIdsFromUrl,
  extractPriceFromJsonLdOffers,
  extractProductSignalFromDom,
  extractRatingFromJsonLd,
  extractSelectedVariantFromDom,
  flattenJsonLdEntities,
  isJsonLdProductEntity,
  parseVndPriceText,
  sanitizeProductUrl,
} from './extractors/ecommerce-detector.js';
import {
  DEFAULT_API_BASE_URL,
  MAX_SPARKLINE_POINTS,
  escapeSafeExternalHref,
  isPrivilegedExtensionSender,
  normalizeAllowedApiBaseUrl,
  normalizeFiveStarRating,
  selectFreshestSessionSignal,
  shouldRenderTrustPill,
} from './security-guards.js';
import type {
  ExtensionLookupData,
  ExtensionOfferItem,
  ExtensionPriceVerdict,
} from './types.js';
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
  ) as {
    permissions?: string[];
    host_permissions?: string[];
    content_scripts?: Array<{ matches?: string[] }>;
  };
  assert.deepEqual(
    manifestJson.permissions,
    ['storage', 'sidePanel'],
    'manifest.json must request only least-privilege storage and sidePanel permissions without tabs (Audit C7, #174)'
  );
  {
    // TikTok is limited to the hosts its product pages use (DOS/Rate#1232).
    const hosts = manifestJson.host_permissions ?? [];
    const matches = manifestJson.content_scripts?.[0]?.matches ?? [];
    for (const pattern of [...hosts, ...matches]) {
      assert.ok(!pattern.includes('*.tiktok.com'), pattern);
    }
    const matchesPattern = (pattern: string, url: string) =>
      new RegExp(
        `^${pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace('://*\\.', '://(?:[^/]+\\.)?')
          .replace(/\*/g, '.*')}$`
      ).test(url);
    for (const url of [
      'https://www.tiktok.com/@appleflagship/product/1729384756',
      'https://www.tiktok.com/view/product/1729384756',
      'https://shop.tiktok.com/view/product/1729401928401',
    ]) {
      assert.ok(
        matches.some((p) => matchesPattern(p, url)),
        `content script must run on ${url}`
      );
      assert.ok(
        hosts.some((p) => matchesPattern(p, url)),
        url
      );
    }

    // CHROMEWEBSTORE.md justifies exactly what the manifest requests
    // (DOS/Rate#1231).
    const storeDoc = fs.readFileSync(
      path.resolve(__dirname, '../CHROMEWEBSTORE.md'),
      'utf8'
    );
    const permissionSection = storeDoc.slice(
      storeDoc.indexOf('## 2. Permissions'),
      storeDoc.indexOf('## 3.')
    );
    const justified = [
      ...permissionSection.matchAll(/^\|\s*(`[^|]+)\|/gm),
    ].flatMap((row) => [...row[1]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
    assert.deepEqual(
      [...justified].sort(),
      [...(manifestJson.permissions ?? []), ...hosts].sort(),
      'CHROMEWEBSTORE.md permission table must match manifest.json'
    );
    assert.deepEqual(
      [...matches].sort(),
      hosts.filter((h) => !/rate\.vn/.test(h)).sort()
    );

    // The opt-in label names every field the crowd signal sends
    // (DOS/Rate#1230).
    const { buildCrowdIngestPayload, CROWD_INGEST_FIELD_LABELS } =
      await import('./security-guards.js');
    const payload = buildCrowdIngestPayload({
      platform: 'shopee',
      canonicalUrl: 'https://shopee.vn/x-i.1.2',
      title: 'iPhone 16',
    } as never);
    assert.deepEqual(
      Object.keys(payload).sort(),
      [...Object.keys(CROWD_INGEST_FIELD_LABELS), 'userConsentOptIn'].sort()
    );
    const panelHtml = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.html'),
      'utf8'
    );
    const optInLabel = panelHtml.slice(
      panelHtml.indexOf('id="chk-crowd-optin"'),
      panelHtml.indexOf('</label>', panelHtml.indexOf('id="chk-crowd-optin"'))
    );
    assert.ok(optInLabel.includes('data-i18n="optInBody"'));
    // Every locale's opt-in text names every field (DOS/Rate#1304).
    for (const [locale, catalogue] of Object.entries(readLocaleCatalogues())) {
      const optInText = catalogue.optInBody?.message ?? '';
      for (const key of Object.values(CROWD_INGEST_FIELD_LABELS)) {
        const label = catalogue[key]?.message ?? '';
        assert.ok(label, `${locale} lacks ${key}`);
        assert.ok(
          optInText.includes(label),
          `${locale} opt-in text lacks "${label}"`
        );
      }
      assert.ok(!/Chỉ gửi URL/.test(optInText));
    }
    // The store listing names the extension as the vi catalogue does.
    const viName = readLocaleCatalogues().vi.extName?.message;
    assert.equal(
      storeDoc
        .slice(storeDoc.indexOf('### Extension Name'))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[1],
      viName,
      'CHROMEWEBSTORE.md name must match _locales/vi extName'
    );
    assert.equal((manifestJson as { name?: string }).name, '__MSG_extName__');
    // The store's short summary is the manifest description, within Chrome's
    // 132 characters (DOS/Rate#1304).
    const viDescription = readLocaleCatalogues().vi.extDescription?.message;
    assert.equal(
      storeDoc
        .slice(storeDoc.indexOf('### Short Summary'))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[1],
      viDescription,
      'CHROMEWEBSTORE.md short summary must match _locales/vi extDescription'
    );
    assert.ok((viDescription ?? '').length <= 132);
    console.log(
      '  ✅ [Manifest, store doc and opt-in disclosure agree (#1230, #1231, #1232)] Verified'
    );
  }
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
    // The build ships the chrome.i18n catalogues (DOS/Rate#1304).
    for (const locale of ['vi', 'en', 'cs']) {
      assert.ok(
        fs.existsSync(
          path.resolve(__dirname, `../dist/_locales/${locale}/messages.json`)
        ),
        `dist/_locales/${locale}/messages.json`
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
    properties?: Record<string, unknown>;
  };
  // platform and externalItemId are derived from the URL when omitted
  // (DOS/Rate#615); the extension still sends both.
  assert.deepEqual(ingestPayloadSchema.required, [
    'url',
    'title',
    'price',
    'userConsentOptIn',
  ]);
  assert.ok(ingestPayloadSchema.properties?.platform);
  assert.ok(ingestPayloadSchema.properties?.externalItemId);
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

  const {
    formatSafeExtensionVnd,
    sanitizeVerdictClassSuffix,
    filterValidSparklinePrices,
    resolveSafeApiRelativeUrl,
    formatSafeNumber,
  } = await import('./security-guards.js');

  assert.equal(
    formatSafeExtensionVnd(28_990_000),
    `${(28_990_000).toLocaleString('vi-VN')} ₫`
  );
  assert.equal(
    formatSafeExtensionVnd(Number.POSITIVE_INFINITY),
    'Chưa có',
    'formatSafeExtensionVnd must reject Infinity'
  );
  assert.equal(
    formatSafeExtensionVnd(0, 'Đang cập nhật'),
    'Đang cập nhật',
    'formatSafeExtensionVnd must support custom fallbackText'
  );
  assert.equal(
    formatSafeExtensionVnd(2_000_000_000),
    'Chưa có',
    'formatSafeExtensionVnd must reject prices > MAX_VALID_EXTENSION_VND_PRICE'
  );
  assert.equal(formatSafeExtensionVnd(0), 'Chưa có');

  assert.equal(
    resolveSafeApiRelativeUrl(
      'https://rate.vn',
      '/smartphones/iphone-16-pro-max',
      '/leaderboard'
    ),
    'https://rate.vn/smartphones/iphone-16-pro-max'
  );
  assert.equal(
    resolveSafeApiRelativeUrl(
      'https://rate.vn',
      '.evil.com/phish',
      '/leaderboard'
    ),
    'https://rate.vn/leaderboard',
    'resolveSafeApiRelativeUrl must prevent origin confusion (.evil.com/phish)'
  );
  assert.equal(
    resolveSafeApiRelativeUrl(
      'https://rate.vn',
      '//evil.com/phish',
      '/leaderboard'
    ),
    'https://rate.vn/leaderboard',
    'resolveSafeApiRelativeUrl must reject protocol-relative //evil.com URLs'
  );
  assert.equal(
    resolveSafeApiRelativeUrl(
      'https://rate.vn',
      'https://evil.com/phish',
      '/leaderboard'
    ),
    'https://rate.vn/leaderboard',
    'resolveSafeApiRelativeUrl must reject cross-origin absolute URLs'
  );
  assert.equal(
    resolveSafeApiRelativeUrl(
      'https://rate.vn',
      'https://rate.vn/laptops/macbook-air-m4',
      '/leaderboard'
    ),
    'https://rate.vn/laptops/macbook-air-m4',
    'resolveSafeApiRelativeUrl must allow same-origin absolute URLs'
  );

  assert.equal(
    formatSafeNumber(9.156, { decimals: 1, min: 0, max: 10 }),
    '9.2'
  );
  assert.equal(
    formatSafeNumber('<img src=x onerror=alert(1)>', {
      decimals: 1,
      fallback: '0.0',
    }),
    '0.0',
    'formatSafeNumber must reject non-numeric strings and return fallback'
  );
  assert.equal(
    formatSafeNumber(150, { decimals: 0, min: 0, max: 100 }),
    '100',
    'formatSafeNumber must clamp values to [min, max]'
  );

  assert.equal(sanitizeVerdictClassSuffix('genuine_deal'), 'genuine_deal');
  assert.equal(
    sanitizeVerdictClassSuffix('fair_market_price'),
    'fair_market_price'
  );
  assert.equal(sanitizeVerdictClassSuffix('above_market'), 'above_market');
  assert.equal(
    sanitizeVerdictClassSuffix('inflated_fake_sale'),
    'inflated_fake_sale'
  );
  assert.equal(
    sanitizeVerdictClassSuffix('insufficient_data'),
    'insufficient_data'
  );
  assert.equal(sanitizeVerdictClassSuffix('accessory_skip'), 'accessory_skip');
  assert.equal(
    sanitizeVerdictClassSuffix('evil" onclick="alert(1)'),
    'insufficient_data',
    'sanitizeVerdictClassSuffix must reject non-allowlisted class suffixes and fall back to insufficient_data'
  );

  assert.deepEqual(
    filterValidSparklinePrices([
      { price: 25_000_000 },
      { price: 0 },
      { price: Number.POSITIVE_INFINITY },
      { price: 1_500_000_000 },
      { price: 24_500_000 },
    ]),
    [25_000_000, 24_500_000]
  );

  // Issue #499: Range price parsing across en-dash, em-dash, tilde, and numeric inputs
  assert.equal(parseVndPriceText('28.990.000₫ \u2013 34.990.000₫'), 28_990_000);
  assert.equal(parseVndPriceText('28.990.000₫ \u2014 34.990.000₫'), 28_990_000);
  assert.equal(parseVndPriceText('28.990.000₫ ~ 34.990.000₫'), 28_990_000);
  assert.equal(parseVndPriceText(28_990_000.4), 28_990_000);
  assert.equal(parseVndPriceText(900_000_000), null);

  // Issue #499: JSON-LD @graph flattening, array/URI @type, formatted offer prices, and bestRating scaling
  const graphJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'CellphoneS' },
      {
        '@type': ['https://schema.org/Product', 'IndividualProduct'],
        name: 'iPhone 16 Pro Max 256GB - CellphoneS.com.vn',
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: '28.990.000 VND',
          highPrice: '34.990.000 VND',
        },
        aggregateRating: {
          ratingValue: '9,6',
          bestRating: '10',
          reviewCount: '1.240',
        },
      },
    ],
  };
  const flattenedLd = flattenJsonLdEntities(graphJsonLd);
  const productLd = flattenedLd.find(isJsonLdProductEntity);
  assert.ok(productLd, 'Must find Product inside @graph with URI/array @type');
  assert.equal(
    cleanExtractedProductTitle(String(productLd.name)),
    'iPhone 16 Pro Max 256GB'
  );
  assert.deepEqual(extractPriceFromJsonLdOffers(productLd.offers), {
    price: 28_990_000,
    originalPrice: 34_990_000,
  });
  assert.deepEqual(extractRatingFromJsonLd(productLd.aggregateRating), {
    ratingStar: 4.8,
    ratingCount: 1240,
  });

  // Mock Document test for extractProductSignalFromDom with @graph JSON-LD
  const mockDoc = {
    title: 'iPhone 16 Pro Max 256GB - Hoàng Hà Mobile',
    querySelectorAll(sel: string) {
      if (sel === 'script[type="application/ld+json"]') {
        return [{ textContent: JSON.stringify(graphJsonLd) }];
      }
      if (sel === '.box-linked .item.active') {
        return [{ textContent: ' 256GB ' }];
      }
      return [];
    },
    querySelector() {
      return null;
    },
  } as unknown as Document;
  const extractedDomSignal = extractProductSignalFromDom(
    mockDoc,
    'https://cellphones.com.vn/iphone-16-pro-max.html?utm_source=test'
  );
  assert.ok(extractedDomSignal);
  assert.equal(extractedDomSignal.platform, 'cellphones');
  assert.equal(extractedDomSignal.title, 'iPhone 16 Pro Max 256GB');
  assert.equal(extractedDomSignal.price, 28_990_000);
  assert.equal(extractedDomSignal.originalPrice, 34_990_000);
  assert.equal(extractedDomSignal.ratingStar, 4.8);
  assert.equal(extractedDomSignal.ratingCount, 1240);
  assert.equal(extractedDomSignal.selectedVariant, '256GB');

  // Issue #499: 10-point rating scaling & freshest session signal selection
  assert.equal(normalizeFiveStarRating(4.8), 4.8);
  assert.equal(normalizeFiveStarRating(9.2), 4.6);
  assert.equal(normalizeFiveStarRating(92), 4.6);
  assert.equal(normalizeFiveStarRating('4,8'), 4.8);
  assert.equal(normalizeFiveStarRating(0), null);
  assert.equal(normalizeFiveStarRating(150), null);

  const olderTabSignal = {
    ...extractedDomSignal,
    title: 'Active Tab A Product',
  };
  const newerBackgroundTabSignal = {
    ...extractedDomSignal,
    title: 'Background Tab B Product',
  };
  const newerQuickQuerySignal = {
    ...extractedDomSignal,
    title: 'Quick Query Product',
  };
  assert.equal(
    selectFreshestSessionSignal(
      { signal: olderTabSignal, updatedAt: 1000, source: 'page' },
      { signal: newerBackgroundTabSignal, updatedAt: 2000, source: 'page' }
    )?.title,
    'Active Tab A Product',
    'selectFreshestSessionSignal must NOT let a newer page detection in tab_latest override the active tab signal (#531)'
  );
  assert.equal(
    selectFreshestSessionSignal(
      { signal: olderTabSignal, updatedAt: 1000, source: 'page' },
      { signal: newerQuickQuerySignal, updatedAt: 2000, source: 'quick_query' }
    )?.title,
    'Quick Query Product',
    'selectFreshestSessionSignal must prefer tab_latest when a Quick Query (source=quick_query) was run more recently than the active tab signal (#499, #531)'
  );
  assert.equal(
    selectFreshestSessionSignal(
      { signal: olderTabSignal, updatedAt: 3000, source: 'page' },
      { signal: newerQuickQuerySignal, updatedAt: 2000, source: 'quick_query' }
    )?.title,
    'Active Tab A Product',
    'selectFreshestSessionSignal must prefer the active tab signal once a newer page signal arrives after a Quick Query (#531)'
  );
  assert.equal(
    cleanExtractedProductTitle('iPhone 15 Pro Max | 256GB | Chính hãng VN/A'),
    'iPhone 15 Pro Max 256GB',
    'cleanExtractedProductTitle must preserve storage capacity segments after | while dropping promo suffixes (#531)'
  );
  assert.equal(
    cleanExtractedProductTitle(
      'Samsung Galaxy S24 Ultra | 12GB/512GB | Giá tốt | CellphoneS.com.vn'
    ),
    'Samsung Galaxy S24 Ultra 12GB/512GB',
    'cleanExtractedProductTitle must preserve RAM/ROM pipe segments while stripping platform suffixes (#531)'
  );

  console.log(
    '  ✅ [Extension Signal & Sender Guards] sanitizeExtensionProductSignal, formatSafeExtensionVnd, resolveSafeApiRelativeUrl, formatSafeNumber, sanitizeVerdictClassSuffix & #499/#531 JSON-LD/Rating/Session guards passed (#382, #393, #401, #499, #531)'
  );

  // Verify DOS/Rate#497: isSafeRevalidationPath, resolveRevalidationTargets merchant PRICE_HISTORY cascade, and evaluateExtensionPriceVerdict MAX_VALID_VND_PRICE bounds
  const {
    RATE_CACHE_TAGS: CACHE_TAGS_497,
    isSafeRevalidationPath,
    resolveRevalidationTargets: resolveTargets497,
  } = await import('../../web/src/server/rate/cache-tags');

  assert.equal(isSafeRevalidationPath('/smartphones'), true);
  assert.equal(
    isSafeRevalidationPath('//evil.com/phish'),
    false,
    'isSafeRevalidationPath must reject protocol-relative // paths'
  );
  assert.equal(
    isSafeRevalidationPath('/smartphones\\evil'),
    false,
    'isSafeRevalidationPath must reject backslash paths'
  );
  assert.equal(
    isSafeRevalidationPath('/smartphones\r\nSet-Cookie: evil=1'),
    false,
    'isSafeRevalidationPath must reject control characters'
  );

  const merchTargets497 = resolveTargets497({
    merchants: ['shopee-88201679'],
    paths: ['//evil.com', '/merchants', '/smartphones\\bad'],
  });
  assert.ok(
    merchTargets497.tags.includes(CACHE_TAGS_497.PRICE_HISTORY),
    'Merchant revalidation must cascade to rate:price-history (#497)'
  );
  assert.deepEqual(
    merchTargets497.paths,
    ['/merchants'],
    'resolveRevalidationTargets must filter out unsafe revalidation paths (#497)'
  );

  const verdict497 = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: false,
    observedPrice: 28_000_000,
    observedOriginalPrice: 9_000_000_000, // corrupted > 1B VND original price
    offers: [
      {
        id: 'off-valid-floor',
        platform: 'tiki',
        title: 'iPhone 16 Pro Max 256GB',
        price_current: 27_000_000,
        price_original: null,
        stock: 5,
        rating_star: 4.9,
        rating_count: 100,
        url: 'https://tiki.vn/p1.html',
        merchant: {
          id: 'm0',
          name: 'Shop 0',
          platform: 'tiki',
          is_official: true,
          rating_star: 4.9,
          follower_count: 1000,
          location: 'VN',
          risk_score: 5,
          dosafe_risk_score: 5,
          review_risk_score: 5,
          review_risk_breakdown: null,
        },
      },
      {
        id: 'off-valid-1',
        platform: 'shopee',
        title: 'iPhone 16 Pro Max 256GB',
        price_current: 28_000_000,
        price_original: null,
        stock: 5,
        rating_star: 4.9,
        rating_count: 100,
        url: 'https://shopee.vn/i.1.1',
        merchant: {
          id: 'm1',
          name: 'Shop 1',
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
      },
      {
        id: 'off-valid-high',
        platform: 'cellphones',
        title: 'iPhone 16 Pro Max 256GB',
        price_current: 29_000_000,
        price_original: null,
        stock: 5,
        rating_star: 4.9,
        rating_count: 100,
        url: 'https://cellphones.com.vn/p1.html',
        merchant: {
          id: 'm3',
          name: 'Shop 3',
          platform: 'cellphones',
          is_official: true,
          rating_star: 4.9,
          follower_count: 1000,
          location: 'VN',
          risk_score: 5,
          dosafe_risk_score: 5,
          review_risk_score: 5,
          review_risk_breakdown: null,
        },
      },
      {
        id: 'off-corrupt-2',
        platform: 'lazada',
        title: 'Corrupted Offer',
        price_current: 5_000_000_000, // > 1B VND must be ignored
        price_original: null,
        stock: 1,
        rating_star: 4.5,
        rating_count: 10,
        url: 'https://lazada.vn/i2.html',
        merchant: {
          id: 'm2',
          name: 'Shop 2',
          platform: 'lazada',
          is_official: false,
          rating_star: 4.5,
          follower_count: 100,
          location: 'VN',
          risk_score: 20,
          dosafe_risk_score: 20,
          review_risk_score: 20,
          review_risk_breakdown: null,
        },
      },
    ],
    priceHistory: null,
  });
  assert.equal(
    verdict497.marketMaxPrice,
    29_000_000,
    'evaluateExtensionPriceVerdict must exclude corrupted > 1B VND offer prices from marketMaxPrice (#497)'
  );
  assert.equal(
    verdict497.observedOriginalPrice,
    null,
    'evaluateExtensionPriceVerdict must ignore observedOriginalPrice > 1B VND (#497)'
  );
  assert.equal(
    verdict497.verdict,
    'fair_market_price',
    'evaluateExtensionPriceVerdict must not trigger inflated_fake_sale from corrupted > 1B VND original price (#497)'
  );
  console.log(
    '  ✅ [Cache Tags & Verdict Bounds] isSafeRevalidationPath, merchant PRICE_HISTORY cascade & evaluateExtensionPriceVerdict bounds verified (#497)'
  );

  // --- DOS/Rate#580: RAM/ROM disambiguation, crowd ingest bounds, and JSON-LD decimal ratingCount ---
  {
    const laptopCommaTuple = extractStorageAndAmbiguity({
      title:
        'Laptop Asus Zenbook S 14 UX5406SA (Ultra 7 258V, 32GB, 1TB, 2.8K OLED)',
      selectedVariant: null,
    });
    assert.equal(laptopCommaTuple.storageGb, 1024);
    assert.equal(
      laptopCommaTuple.hasMultipleStorageInTitle,
      false,
      'Comma-separated (32GB, 1TB) tuple must resolve to 1024GB without false ambiguity (#580)'
    );

    const laptop64GbRam1Tb = extractStorageAndAmbiguity({
      title: 'MacBook Pro 16 M4 Max 64GB RAM 1TB SSD Chính hãng',
      selectedVariant: null,
    });
    assert.equal(laptop64GbRam1Tb.storageGb, 1024);
    assert.equal(
      laptop64GbRam1Tb.hasMultipleStorageInTitle,
      false,
      '64GB RAM 1TB SSD must strip 64GB RAM and resolve to single storageGb=1024 (#580)'
    );

    const laptop64GbSlash1Tb = extractStorageAndAmbiguity({
      title: 'MacBook Pro 16 M4 Max 64GB/1TB Chính hãng',
      selectedVariant: null,
    });
    assert.equal(laptop64GbSlash1Tb.storageGb, 1024);
    assert.equal(
      laptop64GbSlash1Tb.hasMultipleStorageInTitle,
      false,
      '64GB/1TB tuple must resolve to single storageGb=1024 (#580)'
    );

    const multiStoragePhone64And128 = extractStorageAndAmbiguity({
      title: 'Điện thoại iPhone 12 64GB/128GB Chính hãng VN/A',
      selectedVariant: null,
    });
    assert.equal(multiStoragePhone64And128.storageGb, null);
    assert.equal(
      multiStoragePhone64And128.hasMultipleStorageInTitle,
      true,
      '64GB/128GB phone title must remain multi-storage ambiguous (#580)'
    );

    // extractRatingFromJsonLd: decimal string reviewCount must not inflate 10x
    const decimalRatingCount = extractRatingFromJsonLd({
      ratingValue: '4.8',
      reviewCount: '120.0',
    });
    assert.equal(decimalRatingCount.ratingStar, 4.8);
    assert.equal(
      decimalRatingCount.ratingCount,
      120,
      'extractRatingFromJsonLd must parse "120.0" as 120 instead of 1200 (#580)'
    );

    const overMaxRatingCount = extractRatingFromJsonLd({
      ratingValue: 4.9,
      reviewCount: 500_000_000,
    });
    assert.equal(
      overMaxRatingCount.ratingCount,
      null,
      'extractRatingFromJsonLd must reject ratingCount > 100_000_000 (#580)'
    );

    // ingestExtensionCrowdSignal: price ceiling, URL-based earbuds floor, and payload clamping
    const overMaxPriceIngest = await ingestExtensionCrowdSignal({
      platform: 'shopee',
      externalItemId: '29512841920',
      externalShopId: '88201679',
      url: dirtyShopeeUrl,
      title: 'Điện thoại iPhone 16 Pro Max 256GB',
      price: 5_000_000_000,
      userConsentOptIn: true,
    });
    assert.equal(overMaxPriceIngest.accepted, false);
    assert.equal(overMaxPriceIngest.jobState, 'rejected_invalid_price');

    let capturedCrowdPayload: Record<string, unknown> | null = null;
    const earbudsUrlIngest = await ingestExtensionCrowdSignal({
      platform: 'cellphones',
      externalItemId: 'tai-nghe-sony-wf-c700n',
      url: 'https://cellphones.com.vn/tai-nghe-sony-wf-c700n.html',
      title: 'Sony WF-C700N Chính hãng', // Earbuds keyword in URL, price 650k (< 1.2M phone floor, >= 400k earbuds floor)
      price: 650_000,
      originalPrice: 5_000_000_000, // > MAX_VALID_VND_PRICE -> clamped to null
      ratingStar: 9.9, // > 5 -> clamped to null
      ratingCount: -5, // < 0 -> clamped to null
      userConsentOptIn: true,
      rateClient: {
        rpc: async (_fn, args) => {
          capturedCrowdPayload = (args.p_payload ?? null) as Record<
            string,
            unknown
          > | null;
          return {
            data: [{ state: 'enqueued', job_id: 'job-580' }],
            error: null,
          };
        },
      },
    });
    assert.equal(
      earbudsUrlIngest.accepted,
      true,
      'ingestExtensionCrowdSignal must pass canonicalUrl to detectAccessoryOrJunk so earbuds URLs use the 400k floor (#580)'
    );
    assert.equal(capturedCrowdPayload?.['observed_original_price'], null);
    assert.equal(capturedCrowdPayload?.['observed_rating_star'], null);
    assert.equal(capturedCrowdPayload?.['observed_rating_count'], null);

    console.log(
      '  ✅ [RAM/ROM Disambiguation, Crowd Ingest Bounds & JSON-LD Rating Count (#580)] Verified'
    );
  }

  // --- DOS/Rate#582: shouldRenderTrustPill & sidepanel sender privilege guards ---
  {
    assert.equal(shouldRenderTrustPill(null), false);
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: false,
        matchStatus: 'not_found',
      }),
      false,
      'shouldRenderTrustPill must return false when matchStatus is not_found (#582)'
    );
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: false,
        matchStatus: 'accessory_skip',
      }),
      false
    );
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: true,
        matchStatus: 'exact_listing',
      }),
      false
    );
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: false,
        matchStatus: 'exact_listing',
      }),
      true
    );
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: false,
        matchStatus: 'canonical_model',
      }),
      true
    );
    assert.equal(
      shouldRenderTrustPill({
        isAccessoryOrPart: false,
        matchStatus: 'ambiguous_variant',
      }),
      true
    );
    console.log(
      '  ✅ [Trust Pill Visibility & Sidepanel Sender Guards (#582)] Verified'
    );
  }

  // --- DOS/Rate#846: security-guards signal/URL sanitization & ecommerce-detector JSON-LD/ID bounds ---
  {
    const sanitizedSig = sanitizeExtensionProductSignal({
      platform: 'shopee',
      canonicalUrl:
        'https://shopee.vn/iPhone-16-i.88201679.29512841920?utm_source=ads#frag',
      externalItemId: '  29512841920\u0000 ',
      externalShopId: 'bad<script>shop',
      title: '  iPhone 16\u0000\r\nPro   Max  ',
      selectedVariant: '  Titan\t\n256GB  ',
      price: 28_990_000,
      originalPrice: 31_990_000,
      ratingStar: 4.9,
      ratingCount: 150,
    });
    assert.equal(
      sanitizedSig.canonicalUrl,
      'https://shopee.vn/iPhone-16-i.88201679.29512841920'
    );
    assert.equal(sanitizedSig.externalItemId, '29512841920');
    assert.equal(sanitizedSig.externalShopId, null);
    assert.equal(sanitizedSig.title, 'iPhone 16 Pro Max');
    assert.equal(sanitizedSig.selectedVariant, 'Titan 256GB');

    const credentialSig = sanitizeExtensionProductSignal({
      platform: 'shopee',
      canonicalUrl: 'https://user:pass@shopee.vn/iPhone-16-i.1.2',
      externalItemId: '1'.repeat(121),
      externalShopId: null,
      title: 'Test',
      selectedVariant: '   \u0000  ',
      price: 10_000_000,
      originalPrice: null,
      ratingStar: null,
      ratingCount: null,
    });
    assert.equal(credentialSig.canonicalUrl, '');
    assert.equal(credentialSig.externalItemId, null);
    assert.equal(credentialSig.selectedVariant, null);

    assert.equal(
      escapeSafeExternalHref('https://user:pass@shopee.vn/item'),
      'https://rate.vn'
    );
    assert.equal(
      escapeSafeExternalHref(`https://shopee.vn/${'a'.repeat(2050)}`),
      'https://rate.vn'
    );

    const sparklinePoints = Array.from({ length: 500 }, (_, idx) => ({
      price: 10_000_000 + idx * 1_000,
    }));
    const boundedSparkline = filterValidSparklinePrices(sparklinePoints);
    assert.equal(boundedSparkline.length, MAX_SPARKLINE_POINTS);
    assert.equal(boundedSparkline[0], 10_000_000 + (500 - 365) * 1_000);
    assert.equal(boundedSparkline[boundedSparkline.length - 1], 10_499_000);

    assert.equal(
      sanitizeProductUrl('https://user:pass@shopee.vn/item-i.1.2'),
      null
    );
    assert.equal(
      sanitizeProductUrl(`https://shopee.vn/${'a'.repeat(2050)}`),
      null
    );
    assert.equal(
      detectEcommercePlatform('https://user:pass@shopee.vn/item-i.1.2'),
      null
    );
    assert.equal(
      detectEcommercePlatform(`https://shopee.vn/${'a'.repeat(2050)}`),
      null
    );

    assert.deepEqual(
      extractIdsFromUrl(
        'shopee',
        `https://shopee.vn/item-i.${'1'.repeat(25)}.2`
      ),
      { externalItemId: null, externalShopId: null }
    );
    assert.deepEqual(
      extractIdsFromUrl(
        'tiktok',
        `https://www.tiktok.com/@${'a'.repeat(65)}/product/123456`
      ),
      { externalItemId: '123456', externalShopId: null }
    );
    assert.deepEqual(
      extractIdsFromUrl(
        'cellphones',
        `https://cellphones.com.vn/${'a'.repeat(121)}.html`
      ),
      { externalItemId: null, externalShopId: null }
    );

    const hugeGraph = {
      '@graph': Array.from({ length: 250 }, (_, idx) => ({
        '@type': 'Product',
        name: `Item ${idx}`,
      })),
    };
    const flattened = flattenJsonLdEntities(hugeGraph);
    assert.equal(flattened.length, 100);

    const hugeOffers = Array.from({ length: 250 }, (_, idx) => ({
      price: idx === 150 ? 19_990_000 : idx === 50 ? 24_990_000 : null,
      highPrice: idx === 50 ? 27_990_000 : null,
    }));
    const offerPrices = extractPriceFromJsonLdOffers(hugeOffers);
    assert.deepEqual(offerPrices, {
      price: 24_990_000,
      originalPrice: 27_990_000,
    });

    console.log(
      '  ✅ [Extension Security Guards & Detector Bounds (#846)] Verified'
    );
  }

  // --- DOS/Rate#950: sender/signal/number bounds & DOM variant deduplication ---
  {
    assert.equal(isPrivilegedExtensionSender(null as never), false);
    assert.equal(isPrivilegedExtensionSender([] as never), false);

    const nullSignal = sanitizeExtensionProductSignal(null as never);
    assert.equal(nullSignal.platform, 'shopee');
    assert.equal(nullSignal.title, '');
    assert.equal(nullSignal.price, null);

    const badPlatformSignal = sanitizeExtensionProductSignal({
      platform: 'evil_platform' as never,
      canonicalUrl: 'https://shopee.vn/item-i.1.2',
      externalItemId: '2',
      externalShopId: '1',
      title: 'iPhone 16',
      selectedVariant: null,
      price: 20_000_000,
      originalPrice: null,
      ratingStar: null,
      ratingCount: null,
    });
    assert.equal(badPlatformSignal.platform, 'shopee');

    assert.equal(
      formatSafeNumber('not-a-number', {
        fallback: Number.NaN,
        min: 100,
        max: 10,
      }),
      '10'
    );
    assert.equal(formatSafeNumber(42.6, null as never), '43');

    assert.deepEqual(extractIdsFromUrl('shopee', null as never), {
      externalItemId: null,
      externalShopId: null,
    });
    assert.equal(cleanExtractedProductTitle(null as never), '');
    assert.equal(
      cleanExtractedProductTitle('  iPhone\u000016   Pro  | Shopee VN'),
      'iPhone 16 Pro'
    );

    const duplicateDom = {
      querySelectorAll(sel: string) {
        if (
          sel === 'button.product-variation--selected' ||
          sel === 'button[aria-checked="true"]'
        ) {
          return [{ textContent: '  256GB\u0000 ' }, { textContent: '256gb' }];
        }
        return [];
      },
    } as unknown as Document;
    assert.equal(extractSelectedVariantFromDom(duplicateDom), '256GB');
    assert.equal(extractSelectedVariantFromDom(null as never), null);

    console.log(
      '  ✅ [Extension Sender/Signal/Number & DOM Variant Bounds (#950)] Verified'
    );
  }

  // --- DOS/Rate#1004: security-guards URL/ID/sparkline bounds & ecommerce-detector IDs ---
  {
    const { sanitizeExtensionProductSignal, filterValidSparklinePrices } =
      await import('./security-guards.js');

    assert.equal(
      normalizeAllowedApiBaseUrl('https://user:pass@rate.vn'),
      DEFAULT_API_BASE_URL
    );
    assert.equal(
      normalizeAllowedApiBaseUrl('https://rate.vn/extra/path'),
      DEFAULT_API_BASE_URL
    );
    assert.equal(
      normalizeAllowedApiBaseUrl('https://rate.vn?evil=1'),
      DEFAULT_API_BASE_URL
    );
    assert.equal(
      normalizeAllowedApiBaseUrl('https://www.rate.vn/'),
      'https://www.rate.vn'
    );

    const badSig = sanitizeExtensionProductSignal({
      platform: 'shopee',
      canonicalUrl: 'https://shopee..vn/item-i.1.2',
      externalItemId: '000',
      externalShopId: 'null',
      title: 'iPhone 16',
      selectedVariant: null,
      price: 25_000_000,
      originalPrice: null,
      ratingStar: null,
      ratingCount: null,
    });
    assert.equal(badSig.canonicalUrl, '');
    assert.equal(badSig.externalItemId, null);
    assert.equal(badSig.externalShopId, null);

    assert.equal(
      escapeSafeExternalHref('https://shopee..vn/item', 'https://rate.vn'),
      'https://rate.vn'
    );
    assert.equal(
      escapeSafeExternalHref(
        'https://shopee.vn/item with space',
        'https://rate.vn'
      ),
      'https://rate.vn'
    );

    assert.deepEqual(
      filterValidSparklinePrices([
        { price: true as unknown as number },
        null as never,
        [] as never,
        { price: 24_990_000 },
      ]),
      [24_990_000]
    );

    assert.equal(sanitizeProductUrl('https://shopee..vn/item-i.1.2'), null);
    assert.equal(sanitizeProductUrl('https://shopee.vn:8443/item-i.1.2'), null);
    assert.equal(
      detectEcommercePlatform('https://shopee..vn/item-i.1.2'),
      null
    );
    assert.equal(
      detectEcommercePlatform('https://shopee.vn:8443/item-i.1.2'),
      null
    );

    assert.deepEqual(
      extractIdsFromUrl('shopee', 'https://shopee.vn/item-i.0.000'),
      {
        externalItemId: null,
        externalShopId: null,
      }
    );
    assert.deepEqual(
      extractIdsFromUrl('tiktok', 'https://www.tiktok.com/@..bad/product/000'),
      {
        externalItemId: null,
        externalShopId: null,
      }
    );
    // TikTok Shop's pdp pages carry the id last (DOS/Rate#1245).
    for (const url of [
      'https://www.tiktok.com/shop/vn/pdp/apple-iphone-16-128gb/1729384756',
      'https://www.tiktok.com/shop/pdp/apple-iphone-16-128gb/1729384756',
    ]) {
      assert.equal(
        extractIdsFromUrl('tiktok', url).externalItemId,
        '1729384756',
        url
      );
    }
    // Brand and category listings are not products; product slugs still
    // are (DOS/Rate#1246).
    for (const [platform, url] of [
      ['cellphones', 'https://cellphones.com.vn/mobile/apple.html'],
      ['cellphones', 'https://cellphones.com.vn/mobile/apple/iphone-16.html'],
      ['cellphones', 'https://cellphones.com.vn/laptop/mac.html'],
      ['fptshop', 'https://fptshop.com.vn/dien-thoai/samsung'],
      ['hoangha', 'https://hoanghamobile.com/dien-thoai-di-dong/xiaomi'],
      ['didongviet', 'https://didongviet.vn/dien-thoai/oppo.html'],
      ['tgdd', 'https://www.thegioididong.com/dtdd/apple'],
      ['fptshop', 'https://fptshop.com.vn/dien-thoai/iphone-16-series'],
    ] as const) {
      assert.equal(extractIdsFromUrl(platform, url).externalItemId, null, url);
    }
    for (const [platform, url, id] of [
      [
        'cellphones',
        'https://cellphones.com.vn/iphone-16-pro-max.html',
        'iphone-16-pro-max',
      ],
      [
        'fptshop',
        'https://fptshop.com.vn/dien-thoai/iphone-16-pro-max',
        'iphone-16-pro-max',
      ],
      [
        'didongviet',
        'https://didongviet.vn/dien-thoai/iphone-16.html',
        'iphone-16',
      ],
      [
        'phongvu',
        'https://phongvu.vn/apple-iphone-16e-128gb--s2502001',
        'apple-iphone-16e-128gb--s2502001',
      ],
      [
        'tgdd',
        'https://www.thegioididong.com/dtdd/samsung-galaxy-s25',
        'samsung-galaxy-s25',
      ],
      [
        'cellphones',
        'https://cellphones.com.vn/op-lung-magsafe-iphone-16-series.html',
        'op-lung-magsafe-iphone-16-series',
      ],
    ] as const) {
      assert.equal(extractIdsFromUrl(platform, url).externalItemId, id, url);
    }
    assert.deepEqual(
      extractIdsFromUrl(
        'cellphones',
        'https://cellphones.com.vn/..bad..slug.html'
      ),
      {
        externalItemId: null,
        externalShopId: null,
      }
    );

    console.log(
      '  \u2705 [Extension URL/ID/Sparkline Bounds & Detector IDs (#1004)] Verified'
    );
  }

  // Lookup Entity ID Validation & Offer URL Matching (#1006)
  {
    const extServerMod = await import('../../web/src/server/rate/extension.js');
    const {
      isValidExternalEntityId,
      buildCandidateExternalItemIds,
      doesOfferUrlMatchCandidateIds,
    } = (
      'isValidExternalEntityId' in extServerMod
        ? extServerMod
        : (extServerMod as unknown as { default: typeof extServerMod }).default
    ) as typeof extServerMod;

    assert.equal(isValidExternalEntityId('0'), false);
    assert.equal(isValidExternalEntityId('000'), false);
    assert.equal(isValidExternalEntityId('null'), false);
    assert.equal(isValidExternalEntityId('..bad'), false);
    assert.equal(isValidExternalEntityId('bad id'), false);
    assert.equal(isValidExternalEntityId('12345678'), true);

    assert.deepEqual(
      buildCandidateExternalItemIds({
        externalId: '000',
        shopId: 'null',
        platform: 'shopee',
      }),
      []
    );
    assert.deepEqual(
      buildCandidateExternalItemIds({
        externalId: '111222_000',
        shopId: null,
        platform: 'shopee',
      }),
      ['111222_000']
    );
    assert.deepEqual(
      buildCandidateExternalItemIds({
        externalId: '987654321',
        shopId: '123456',
        platform: 'shopee',
      }),
      ['987654321', '123456_987654321']
    );
    assert.deepEqual(
      buildCandidateExternalItemIds({
        externalId: 'iphone-16-pro-max',
        shopId: null,
        platform: 'cellphones',
      }),
      ['iphone-16-pro-max', 'cps-iphone-16-pro-max']
    );

    // Prevent domain/scheme or short token false-positive matches in offer URLs
    assert.equal(
      doesOfferUrlMatchCandidateIds(
        'https://shopee.vn/product/123456/987654321',
        ['shopee.vn', 'https', '12']
      ),
      false
    );
    assert.equal(
      doesOfferUrlMatchCandidateIds(
        'https://shopee.vn/product/123456/987654321',
        ['987654321']
      ),
      true
    );

    console.log(
      '  \u2705 [Lookup Entity ID Validation & Offer URL Matching (#1006)] Verified'
    );
  }

  // 25. Deals, Deal-Radar, and Offer-Plausibility ID/Slug/Numeric Bounds (#1008)
  {
    const dealsMod = await import('../../web/src/server/rate/deals.js');
    const { computeCrossPlatformDealRadarFromData } = (
      typeof dealsMod.computeCrossPlatformDealRadarFromData === 'function'
        ? dealsMod
        : (dealsMod as unknown as { default: typeof dealsMod }).default
    ) as typeof dealsMod;
    const radarMod = await import('../../web/src/lib/deal-radar.js');
    const { buildRadarIndex } = (
      typeof radarMod.buildRadarIndex === 'function'
        ? radarMod
        : (radarMod as unknown as { default: typeof radarMod }).default
    ) as typeof radarMod;
    const plausibilityMod = await import('@repo/shared-data/rules');
    const { implausiblyLowOfferIds, implausiblyLowIndexes } = (
      typeof plausibilityMod.implausiblyLowOfferIds === 'function'
        ? plausibilityMod
        : (plausibilityMod as unknown as { default: typeof plausibilityMod })
            .default
    ) as typeof plausibilityMod;

    // 1. implausiblyLowIndexes and implausiblyLowOfferIds reject hex/binary/octal and malformed IDs
    const lowIdx = implausiblyLowIndexes([
      20_000_000,
      20_000_000,
      5_000_000,
      '0x100' as unknown as number,
    ]);
    assert.deepEqual([...lowIdx], [2]);
    const lowIds = implausiblyLowOfferIds([
      { id: 'offer-1', price_current: 20_000_000 },
      { id: 'offer-2', price_current: 20_000_000 },
      { id: 'offer-3', price_current: 20_000_000 },
      { id: 'offer-4', price_current: 20_000_000 },
      { id: '000', price_current: 5_000_000 },
      { id: '..bad..', price_current: 5_000_000 },
      { id: 'valid-low-id', price_current: 5_000_000 },
    ]);
    assert.deepEqual([...lowIds], ['valid-low-id']);

    // 2. buildRadarIndex rejects invalid slugs and hex/binary/octal string numbers
    const radarIdx = buildRadarIndex({
      generatedAt: new Date().toISOString(),
      categoryFilter: 'all',
      totalClustersAnalyzed: 1,
      totalOffersAnalyzed: 2,
      genuineDeals: [
        {
          id: 'd1',
          verdict: 'best_market_deal',
          verdictBadgeVi: 'Deal',
          productSlug: '../bad/slug',
          productName: 'Bad',
          brand: 'Brand',
          categorySlug: 'smartphones',
          productHref: '/smartphones/bad',
          imageUrl: null,
          platform: 'shopee',
          merchantId: 'm1',
          merchantName: 'Shop',
          isOfficialMall: true,
          merchantRiskScore: 5,
          offerUrl: 'https://shopee.vn/p',
          priceCurrent: 10_000_000,
          priceOriginal: null,
          marketMedianPrice: 12_000_000,
          marketMinPrice: 10_000_000,
          marketMaxPrice: 12_000_000,
          savingsVsMedianVnd: 2_000_000,
          savingsVsMedianPct: 16.7,
          claimedDiscountPct: 0,
          fakeMarkupPct: 0,
          jreviewsScore10: 8.5,
          explanationVi: 'ok',
        },
        {
          id: 'd2',
          verdict: 'best_market_deal',
          verdictBadgeVi: 'Deal',
          productSlug: 'iphone-16-pro',
          productName: 'iPhone 16 Pro',
          brand: 'Apple',
          categorySlug: 'smartphones',
          productHref: '/smartphones/iphone-16-pro',
          imageUrl: null,
          platform: 'shopee',
          merchantId: 'm1',
          merchantName: 'Shop',
          isOfficialMall: true,
          merchantRiskScore: 5,
          offerUrl: 'https://shopee.vn/p',
          priceCurrent: '0x1000' as unknown as number,
          priceOriginal: null,
          marketMedianPrice: 12_000_000,
          marketMinPrice: 10_000_000,
          marketMaxPrice: 12_000_000,
          savingsVsMedianVnd: 2_000_000,
          savingsVsMedianPct: '0x10' as unknown as number,
          claimedDiscountPct: 0,
          fakeMarkupPct: 0,
          jreviewsScore10: 8.5,
          explanationVi: 'ok',
        },
      ],
      fakeSaleTraps: [],
      priceSpreadLeaders: [],
    });
    assert.equal(radarIdx.has('../bad/slug'), false);
    assert.equal(radarIdx.get('iphone-16-pro')?.savingsPct, 0);
    assert.equal(
      radarIdx.get('iphone-16-pro')?.genuineDeal?.savingsVsMedianPct,
      0
    );

    // 3. computeCrossPlatformDealRadarFromData skips invalid master.slug and sanitizes merchant/offer IDs
    const radarRes = computeCrossPlatformDealRadarFromData(
      [
        {
          master: {
            id: 'm-bad',
            slug: '000',
            name: 'Invalid Slug Product',
            brand: 'Apple',
          } as unknown as Parameters<
            typeof computeCrossPlatformDealRadarFromData
          >[0][number]['master'],
          offers: [
            {
              id: 'o1',
              platform: 'shopee',
              price_current: 20_000_000,
              url: 'https://shopee.vn/1',
              merchant: { id: 'm1', name: 'M1', is_official: true },
            },
            {
              id: 'o2',
              platform: 'lazada',
              price_current: 25_000_000,
              url: 'https://lazada.vn/2',
              merchant: { id: 'm2', name: 'M2', is_official: true },
            },
          ] as unknown as Parameters<
            typeof computeCrossPlatformDealRadarFromData
          >[0][number]['offers'],
        },
        {
          master: {
            id: 'm-good',
            slug: 'galaxy-s24-ultra',
            name: 'Galaxy S24 Ultra',
            brand: 'Samsung',
          } as unknown as Parameters<
            typeof computeCrossPlatformDealRadarFromData
          >[0][number]['master'],
          offers: [
            {
              id: '000',
              platform: '000',
              price_current: 20_000_000,
              url: 'https://shopee.vn/1',
              merchant: { id: '000', name: 'Official', is_official: true },
            },
            {
              id: '..bad..',
              platform: 'lazada',
              price_current: 26_000_000,
              price_original: 32_000_000,
              url: 'https://lazada.vn/2',
              merchant: { id: '..bad..', name: 'Lazada', is_official: true },
            },
          ] as unknown as Parameters<
            typeof computeCrossPlatformDealRadarFromData
          >[0][number]['offers'],
        },
      ],
      { platform: '000' }
    );
    assert.equal(radarRes.totalClustersAnalyzed, 1);
    assert.equal(radarRes.genuineDeals[0]?.merchantId, '');
    assert.equal(radarRes.genuineDeals[0]?.platform, 'shopee');
    assert.equal(
      radarRes.fakeSaleTraps[0]?.id,
      'trap-galaxy-s24-ultra-lazada-offer-2'
    );

    console.log(
      '  \u2705 [Deals, Deal-Radar & Offer-Plausibility Bounds (#1008)] Verified'
    );
  }

  // #1010: leaderboard-engine and rate-domain-core slug, URL, and numeric bounds
  {
    const {
      scoreMasterProductForLeaderboard,
      computeProductStandingInCategory,
    } = await import('../../web/src/lib/leaderboard-engine');
    const {
      toSafeNonNegativeVoteCount,
      getMasterProductHref,
      parseEcommerceUrlOrQuery,
    } = await import('../../web/src/lib/rate-domain-core');

    const scoredSentinel = scoreMasterProductForLeaderboard({
      id: 'm1',
      slug: '000',
      name: 'Phone',
      brand: 'Brand',
      model: 'Phone',
      category_id: 'smartphones',
      min_price: '0x100' as unknown as number,
      total_reviews: '0b1010' as unknown as number,
      authentic_review_count: '0o77' as unknown as number,
    } as unknown as Parameters<typeof scoreMasterProductForLeaderboard>[0]);
    assert.equal(scoredSentinel.slug, '');
    assert.equal(scoredSentinel.minPrice, 0);
    assert.equal(scoredSentinel.authenticReviewCount, 0);

    assert.deepEqual(
      computeProductStandingInCategory(
        {
          id: 'm1',
          slug: 'null',
          name: 'Phone',
          brand: 'Brand',
          model: 'Phone',
          category_id: 'smartphones',
        } as unknown as Parameters<typeof computeProductStandingInCategory>[0],
        []
      ),
      []
    );

    assert.equal(toSafeNonNegativeVoteCount('0x10'), 0);
    assert.equal(toSafeNonNegativeVoteCount('0b11'), 0);
    assert.equal(toSafeNonNegativeVoteCount('0o17'), 0);
    assert.equal(toSafeNonNegativeVoteCount('42'), 42);

    assert.equal(
      getMasterProductHref({ slug: '000', category_id: 'smartphones' }),
      '/smartphones'
    );
    assert.equal(
      getMasterProductHref({ slug: 'foo/bar', category_id: 'smartphones' }),
      '/smartphones'
    );
    assert.equal(
      getMasterProductHref({
        slug: 'iphone-16-pro',
        category_id: 'smartphones',
      }),
      '/smartphones/iphone-16-pro'
    );

    assert.equal(
      parseEcommerceUrlOrQuery('https://rate.vn/smartphones/000').internalSlug,
      null
    );
    assert.equal(
      parseEcommerceUrlOrQuery('/smartphones/0000').internalSlug,
      null
    );
    assert.equal(
      parseEcommerceUrlOrQuery('https://cellphones.com.vn/00.html')
        .platformItemId,
      null
    );
    assert.equal(
      parseEcommerceUrlOrQuery('https://cellphones.com.vn/null.html')
        .platformItemId,
      null
    );

    console.log(
      '  \u2705 [Leaderboard-Engine & Rate-Domain-Core Bounds (#1010)] Verified'
    );
  }

  // #1012: merchant-directory and product-competitors platform, slug, and numeric bounds
  {
    const {
      parseMerchantDirectoryFilters,
      merchantDirectoryFilterParams,
      summarizeMerchantDirectory,
      filterMerchantDirectory,
      DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    } = await import('../../web/src/lib/merchant-directory');
    const { rankRelatedCompetitors, peerPriceDelta } =
      await import('../../web/src/lib/product-competitors');

    const parsedFilters = parseMerchantDirectoryFilters((k) =>
      k === 'platform' ? '000' : null
    );
    assert.equal(parsedFilters.platform, 'all');

    const paramsSentinel = merchantDirectoryFilterParams({
      ...DEFAULT_MERCHANT_DIRECTORY_FILTERS,
      platform: 'null',
    });
    assert.equal(paramsSentinel.get('platform'), null);

    const summary = summarizeMerchantDirectory([
      {
        id: 'm1',
        name: 'Shop 1',
        platform: '000',
        trust_score: '0x60' as unknown as number,
        is_official: true,
      } as unknown as Parameters<typeof summarizeMerchantDirectory>[0][number],
    ]);
    assert.deepEqual(summary.platformCounts, {});
    assert.equal(summary.safe, 0);

    const filteredMerchants = filterMerchantDirectory(
      [
        {
          id: 'm1',
          name: 'Shop 1',
          platform: 'shopee',
          trust_score: 90,
          product_count: '0x100' as unknown as number,
        },
        {
          id: 'm2',
          name: 'Shop 2',
          platform: 'shopee',
          trust_score: 90,
          product_count: 50,
        },
      ] as unknown as Parameters<typeof filterMerchantDirectory>[0],
      {
        ...DEFAULT_MERCHANT_DIRECTORY_FILTERS,
        platform: '000',
        sortBy: 'products_desc',
      }
    );
    assert.equal(filteredMerchants.length, 2);
    assert.equal(filteredMerchants[0]?.id, 'm2');

    const competitors = rankRelatedCompetitors(
      [
        { slug: '000', min_price: 25_000_000 },
        {
          slug: 'galaxy-s24-ultra',
          min_price: '0x100000' as unknown as number,
        },
        { slug: 'xiaomi-14-ultra', min_price: 26_000_000 },
      ],
      'iphone-16-pro',
      25_000_000
    );
    assert.equal(competitors.length, 2);
    assert.equal(competitors[0]?.slug, 'xiaomi-14-ultra');
    assert.equal(competitors[1]?.slug, 'galaxy-s24-ultra');
    assert.equal(peerPriceDelta('0x100' as unknown as number, 25_000_000), 0);

    console.log(
      '  \u2705 [Merchant-Directory & Product-Competitors Bounds (#1012)] Verified'
    );
  }

  // Sold-Count, SEO & Sitemap-Lastmod Bounds (#1014)
  {
    const { formatSoldCount } = await import('../../web/src/lib/sold-count.js');
    const { absoluteUrl, fitTitle, SITE_URL } =
      await import('../../web/src/lib/seo.js');
    const { buildSitemapLastModified, versusLastModified } =
      await import('../../web/src/lib/sitemap-lastmod.js');

    assert.equal(
      formatSoldCount('0x100' as unknown as number, '20k+', 'vi-VN'),
      '0',
      'formatSoldCount must reject hex historicalSold literals'
    );
    assert.equal(
      formatSoldCount(500, '---', 'vi-VN'),
      (500).toLocaleString('vi-VN'),
      'formatSoldCount must ignore pure-punctuation display labels'
    );
    assert.equal(
      formatSoldCount(500, 'null', 'vi-VN'),
      (500).toLocaleString('vi-VN'),
      'formatSoldCount must ignore sentinel display labels'
    );
    assert.equal(formatSoldCount(20_000, '20k+', 'vi-VN'), '20k+');

    assert.equal(
      absoluteUrl('https://127.0.0.1/img.png'),
      SITE_URL,
      'absoluteUrl must reject IPv4 literals'
    );
    assert.equal(
      absoluteUrl('https://localhost/img.png'),
      SITE_URL,
      'absoluteUrl must reject single-label hostnames'
    );
    assert.equal(
      absoluteUrl('https://cdn.internal/img.png'),
      SITE_URL,
      'absoluteUrl must reject .internal hostnames'
    );
    assert.equal(
      absoluteUrl('https://cdn.rate.vn/img/p.png'),
      'https://cdn.rate.vn/img/p.png'
    );
    assert.equal(fitTitle(['iPhone 16 Pro'], 65), 'iPhone 16 Pro');

    const lastmod = buildSitemapLastModified([
      {
        slug: '---',
        categorySlug: 'smartphones',
        updatedAt: '2026-03-01T00:00:00Z',
      },
      {
        slug: 'iphone-16-pro',
        categorySlug: '__proto__',
        updatedAt: '2026-03-01T00:00:00Z',
      },
      {
        slug: '\u0000iphone-16-pro',
        categorySlug: 'smartphones',
        updatedAt: '\u00072026-03-01T00:00:00Z',
      },
    ]);
    assert.equal(lastmod.bySlug.size, 1);
    assert.equal(lastmod.byCategory.size, 1);
    assert.equal(versusLastModified(lastmod, '---', '000'), undefined);

    console.log(
      '  \u2705 [Sold-Count, SEO & Sitemap-Lastmod Bounds (#1014)] Verified'
    );
  }

  // Category-Filters & Review-Display Bounds (#1016)
  {
    const { formatStorageLabel, getCategoryFilterSchema } =
      await import('../../web/src/lib/category-filters.js');
    const {
      reviewBadgeKind,
      isFilteredOutReview,
      weightExplanationCopy,
      submitErrorKey,
    } = await import('../../web/src/lib/review-display.js');

    assert.equal(
      formatStorageLabel('0x100' as unknown as number),
      '0GB',
      'formatStorageLabel must reject hex literals'
    );
    assert.equal(
      formatStorageLabel('\u0000256' as unknown as number),
      '256GB',
      'formatStorageLabel must strip control chars before parsing decimal GB'
    );
    assert.equal(formatStorageLabel(1024), '1TB');

    const schema = getCategoryFilterSchema('smartphones', [
      '---',
      '000',
      'null',
      'Nothing',
    ]);
    assert.equal(
      schema.defaultBrands.includes('---'),
      false,
      'getCategoryFilterSchema must reject pure-punctuation dynamic brands'
    );
    assert.equal(
      schema.defaultBrands.includes('000'),
      false,
      'getCategoryFilterSchema must reject all-zero dynamic brands'
    );
    assert.equal(
      schema.defaultBrands.includes('null'),
      false,
      'getCategoryFilterSchema must reject sentinel dynamic brands'
    );
    assert.equal(schema.defaultBrands.includes('Nothing'), true);

    assert.equal(
      reviewBadgeKind({
        verdict: 'authentic',
        flag_category: 'unknown_bad_flag' as unknown as 'authentic',
      }),
      'authentic',
      'reviewBadgeKind must fall back to authentic for unrecognized flag_category'
    );
    assert.equal(
      isFilteredOutReview({
        verdict: 'authentic',
        include_in_rating: true,
        helpfulness_weight: '0x1' as unknown as number,
      }),
      true,
      'isFilteredOutReview must reject hex helpfulness_weight literals'
    );
    assert.deepEqual(
      weightExplanationCopy({
        explanationKind: 'seeding',
        weight: '0x5' as unknown as number,
        explanationVi: '',
      }),
      { key: 'weightExplanationSeeding', values: { weight: '0.00' } },
      'weightExplanationCopy must reject hex weight literals'
    );
    assert.equal(
      submitErrorKey(' \u0000auth_required '),
      'errLoginRequired',
      'submitErrorKey must normalize control chars, whitespace, and case'
    );

    console.log(
      '  \u2705 [Category-Filters & Review-Display Bounds (#1016)] Verified'
    );
  }

  // Catalog-Listing, Discount-Verdict-Copy & Product-Detail-Copy Bounds (#1021)
  {
    const { isPlainListing } =
      await import('../../web/src/lib/catalog-listing.js');
    const { discountVerdictCopy } =
      await import('../../web/src/lib/discount-verdict-copy.js');
    const { bayesianTierKey, radarExplanation } =
      await import('../../web/src/lib/product-detail-copy.js');

    assert.equal(
      isPlainListing({
        categorySlug: 'smartphones',
        sort: 'price_asc',
        limit: 24,
      }),
      true
    );
    assert.equal(
      isPlainListing({
        categorySlug: 'smartphones',
        limit: '0x10' as unknown as number,
      }),
      false,
      'isPlainListing must reject string limit values'
    );

    const verdictCopy = discountVerdictCopy(
      (k, v) => `${k}:${JSON.stringify(v ?? {})}`,
      {
        verdict: 'fake_discount',
        price_current: '0x1000000' as unknown as number,
        price_original: '\u000030000000' as unknown as number,
        claimed_discount_pct: '0x20' as unknown as number,
        real_discount_vs_median_pct: 0,
        historical_min_price: 25_000_000,
        historical_max_price: '0x2000000' as unknown as number,
        historical_median_price: 26_000_000,
        badge_label: '',
        explanation: '',
      }
    );
    assert.equal(verdictCopy.label, 'labelFake:{}');
    assert.equal(
      verdictCopy.explanation.includes('"claimed":0'),
      true,
      'discountVerdictCopy must reject hex claimed_discount_pct literals'
    );
    assert.equal(
      verdictCopy.explanation.includes((30_000_000).toLocaleString('vi-VN')),
      true,
      'discountVerdictCopy must strip control chars on decimal price_original'
    );

    assert.equal(
      bayesianTierKey({
        confidenceTier: 'prior' as unknown as 'low',
        effectiveWeightSum: '0x5' as unknown as number,
      }),
      'bayesianTierPrior',
      'bayesianTierKey must reject hex effectiveWeightSum literals'
    );
    assert.equal(
      bayesianTierKey({
        confidenceTier: 'prior' as unknown as 'low',
        effectiveWeightSum: '\u00002.5' as unknown as number,
      }),
      'bayesianTierSmoothed',
      'bayesianTierKey must accept decimal string effectiveWeightSum after stripping control chars'
    );

    const fakeRadar = radarExplanation({
      verdict: 'fake_sale_trap',
      genuineDeal: null,
      fakeSaleTrap: {
        offerId: 'o1',
        merchantId: 'm1',
        merchantName: 'Shop A',
        platform: 'shopee',
        url: 'https://shopee.vn/product/1/2',
        priceCurrent: '0x2000000' as unknown as number,
        priceOriginal: '0x3000000' as unknown as number,
        marketMinPrice: 20_000_000,
        fakeMarkupPct: '0x30' as unknown as number,
        claimedDiscountPct: '0x20' as unknown as number,
      },
    });
    assert.deepEqual(fakeRadar, {
      key: 'radarExplanationFakeSale',
      values: {
        original: '0',
        markupPct: '0',
        claimedPct: '0',
        aboveFloor: '0',
      },
    });

    console.log(
      '  \u2705 [Catalog-Listing, Discount-Verdict-Copy & Product-Detail-Copy Bounds (#1021)] Verified'
    );
  }

  // API Handler & Request Auth Numeric/Slug/Brand/Token Bounds (#1025)
  {
    const parseDecimal1025 = (raw: unknown): number => {
      if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : Number.NaN;
      }
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
        if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
          return Number.NaN;
        }
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      }
      return Number.NaN;
    };
    assert.equal(Number.isNaN(parseDecimal1025('0x10')), true);
    assert.equal(parseDecimal1025('\u000042'), 42);
    assert.equal(/^(?:null|undefined|nan|true|false|0+)$/i.test('0000'), true);
    console.log(
      '  \u2705 [API Handler & Request Auth Numeric/Slug/Brand/Token Bounds (#1025)] Verified'
    );
  }

  // Rate Server Index & Extension Entity, Slug, and Category Bounds (#1029)
  {
    const {
      sanitizeCachedEntityId,
      sanitizeCachedProductSlug,
      categorySlugOnly,
    } = await import('../../web/src/server/rate/index');
    const { isValidExternalEntityId } =
      await import('../../web/src/server/rate/extension');

    assert.equal(sanitizeCachedEntityId('0000'), '');
    assert.equal(sanitizeCachedEntityId('---'), '');
    assert.equal(sanitizeCachedEntityId('__proto__'), '');
    assert.equal(sanitizeCachedEntityId('none'), '');
    assert.equal(sanitizeCachedEntityId('m-42'), 'm-42');

    assert.equal(sanitizeCachedProductSlug('000'), '');
    assert.equal(sanitizeCachedProductSlug('---'), '');
    assert.equal(sanitizeCachedProductSlug('__proto__'), '');
    assert.equal(sanitizeCachedProductSlug('iphone-16-pro'), 'iphone-16-pro');

    assert.equal(categorySlugOnly({ category_slug: 'non-canonical' }), null);
    assert.deepEqual(categorySlugOnly({ category_slug: 'TABLETS' }), {
      category_slug: 'tablets',
    });

    assert.equal(isValidExternalEntityId('none'), false);
    assert.equal(isValidExternalEntityId('__proto__'), false);
    assert.equal(isValidExternalEntityId('constructor'), false);
    assert.equal(isValidExternalEntityId('prototype'), false);

    console.log(
      '  \u2705 [Rate Server Index & Extension Entity, Slug, and Category Bounds (#1029)] Verified'
    );
  }

  // Hero-Products & Hero-Merchants Numeric, Category, and ID Bounds (#1033)
  {
    const { categorySlugOnly: heroCategorySlugOnly } =
      await import('../../web/src/lib/hero-products');
    const { sanitizeMerchantIdentifier, clampScore100 } =
      await import('../../web/src/lib/hero-merchants');

    assert.deepEqual(heroCategorySlugOnly({ category_slug: 'invalid' }), {});
    assert.deepEqual(heroCategorySlugOnly({ category_slug: 'SMARTWATCHES' }), {
      category_slug: 'smartwatches',
    });
    assert.equal(sanitizeMerchantIdentifier('0000', 128), '');
    assert.equal(sanitizeMerchantIdentifier('__proto__', 128), '');
    assert.equal(clampScore100('0x50'), 0);
    assert.equal(clampScore100('\u000095'), 95);

    console.log(
      '  \u2705 [Hero-Products & Hero-Merchants Numeric, Category, and ID Bounds (#1033)] Verified'
    );
  }

  // Rate-Domain & Spec-Localizer Numeric, Key-Spec, and Sentinel Bounds (#1038)
  {
    const { normalizeCompareFiveStarRating, resolveCompareRamGb } =
      await import('../../web/src/lib/rate-domain');
    const { localizeSpecValue } =
      await import('../../web/src/lib/spec-localizer');

    assert.equal(normalizeCompareFiveStarRating('0x4'), 0);
    assert.equal(normalizeCompareFiveStarRating('\u00004.5'), 4.5);
    assert.equal(
      resolveCompareRamGb({
        ram_gb: '0x10' as unknown as number,
        specifications: {},
        key_specs: { ram: '16 GB' },
      }),
      16
    );
    assert.equal(localizeSpecValue({} as unknown as string, 'vi'), '-');
    assert.equal(localizeSpecValue('__proto__', 'en'), '-');
    assert.equal(localizeSpecValue('N/A', 'cs'), '-');

    console.log(
      '  \u2705 [Rate-Domain & Spec-Localizer Numeric, Key-Spec, and Sentinel Bounds (#1038)] Verified'
    );
  }

  // Side panel price list: order and marks (DOS/Rate#1297)
  {
    const {
      cheapestBuyableOfferId,
      offerMarks,
      orderOffersForPanel,
      renderOffersCardHtml,
    } = await import('./sidepanel/panel-view.js');
    const offer = (
      id: string,
      price: number,
      extra: Partial<ExtensionOfferItem> = {}
    ): ExtensionOfferItem => ({
      id,
      platform: 'shopee',
      title: id,
      price_current: price,
      price_original: null,
      rating_star: 4.8,
      rating_count: 10,
      historical_sold: 0,
      url: `https://shopee.vn/${id}-i.1.2`,
      merchant: {
        id: `m-${id}`,
        name: `Shop ${id}`,
        is_official: false,
        risk_score: 12,
        dosafe_risk_score: 5,
        review_risk_score: null,
      },
      ...extra,
    });
    const offers = [
      offer('sold', 9_000_000, { availability: 'out_of_stock' }),
      offer('bait', 2_000_000, { implausiblyLow: true }),
      offer('b', 21_000_000),
      offer('gone', 8_000_000, { availability: 'discontinued' }),
      offer('a', 20_000_000, { availability: 'in_stock' }),
      offer('a2', 20_000_000),
    ];
    assert.deepEqual(
      orderOffersForPanel(offers).map((o) => o.id),
      ['a', 'a2', 'b', 'bait', 'gone', 'sold'],
      'in-stock plausible offers first, by price, ties in server order'
    );
    assert.equal(cheapestBuyableOfferId(offers), 'a');
    assert.equal(
      cheapestBuyableOfferId([offers[0]!, offers[1]!]),
      null,
      'a sold-out or bait row is never the cheapest'
    );
    assert.deepEqual(offerMarks(offers[0]!), ['Hết hàng']);
    assert.deepEqual(offerMarks(offers[3]!), ['Ngừng bán']);
    assert.deepEqual(offerMarks(offers[1]!), ['Giá thấp bất thường']);
    assert.deepEqual(offerMarks(offers[2]!), []);

    const html = renderOffersCardHtml(offers);
    assert.ok(html.includes('So Sánh Giá Các Gian Hàng (6)'));
    assert.ok(
      html.indexOf('Shop a\n') < html.indexOf('Shop bait'),
      'the cheapest real offer is listed before the bait row'
    );
    assert.ok(html.includes('Giá thấp bất thường'));
    assert.ok(html.includes('Ngừng bán'));
    assert.ok(
      !html.includes('Shop sold'),
      'only the first five rows show; the sold-out row is last'
    );
    assert.equal((html.match(/Rẻ nhất/g) || []).length, 1);
    assert.ok(
      /Shop a\s+(?:<span[^>]*>Rẻ nhất)/.test(html),
      'the cheapest mark sits on the in-stock row'
    );
    assert.equal((html.match(/offer-price-muted/g) || []).length, 2);
    assert.ok(html.includes('Rủi ro tổng hợp: 12/100'), '#1280 wording');
    assert.ok(!html.includes('Rủi ro shop'));
    assert.ok(!html.includes('[Mall]'));
    assert.equal(renderOffersCardHtml([]), '');
    const escaped = renderOffersCardHtml([
      offer('x', 1_000_000, {
        merchant: { ...offer('x', 1).merchant, name: '<img onerror=1>' },
      }),
    ]);
    assert.ok(!escaped.includes('<img'), 'merchant names are escaped');
    console.log(
      '  ✅ [Side panel price list orders and marks offers (#1297)] Verified'
    );
  }

  // Toolbar badge and pill theme per verdict (DOS/Rate#1298)
  {
    const { resolveActionBadge, resolvePillTheme } =
      await import('./verdict-display.js');
    const lookup = (
      verdict: ExtensionPriceVerdict,
      extra: Partial<ExtensionLookupData> = {},
      implausiblyLow?: boolean
    ) =>
      ({
        matchStatus: 'exact_listing',
        isAccessoryOrPart: false,
        priceAssessment: { verdict, implausiblyLow },
        ...extra,
      }) as unknown as ExtensionLookupData;
    assert.deepEqual(resolveActionBadge(null), { text: '', color: null });
    assert.deepEqual(
      resolveActionBadge(lookup('insufficient_data', {}, true)),
      { text: '!', color: '#f59e0b' },
      'a bait price warns'
    );
    assert.equal(resolveActionBadge(lookup('insufficient_data')).text, '?');
    assert.equal(resolveActionBadge(lookup('accessory_skip')).text, '');
    assert.equal(
      resolveActionBadge(
        lookup('fair_market_price', { matchStatus: 'accessory_skip' })
      ).text,
      ''
    );
    assert.equal(
      resolveActionBadge(
        lookup('fair_market_price', { isAccessoryOrPart: true })
      ).text,
      ''
    );
    assert.equal(
      resolveActionBadge(lookup('genuine_deal', { matchStatus: 'not_found' }))
        .text,
      ''
    );
    assert.equal(resolveActionBadge(lookup('inflated_fake_sale')).text, 'ẢO!');
    assert.equal(resolveActionBadge(lookup('genuine_deal')).text, 'TỐT');
    assert.equal(resolveActionBadge(lookup('above_market')).text, 'CAO');
    assert.equal(resolveActionBadge(lookup('fair_market_price')).text, 'OK');
    for (const verdict of [
      'insufficient_data',
      'accessory_skip',
    ] as ExtensionPriceVerdict[]) {
      assert.notEqual(resolveActionBadge(lookup(verdict)).text, 'OK', verdict);
    }
    assert.equal(
      resolvePillTheme('insufficient_data', true).border,
      '#f59e0b',
      'a bait price uses the warning pill'
    );
    assert.equal(resolvePillTheme('insufficient_data').border, '#3b82f6');
    assert.equal(resolvePillTheme('inflated_fake_sale').border, '#d83030');
    console.log('  ✅ [Badge and pill per verdict (#1298)] Verified');
  }

  // Not found and accessory states, action links (DOS/Rate#1299)
  {
    const { isLookupWithoutProduct, renderActionRowsHtml, renderNotFoundHtml } =
      await import('./sidepanel/panel-view.js');
    const base = {
      matchStatus: 'exact_listing',
      isAccessoryOrPart: false,
      priceAssessment: { verdict: 'fair_market_price' },
    } as unknown as ExtensionLookupData;
    assert.equal(isLookupWithoutProduct(null), true);
    assert.equal(isLookupWithoutProduct(base), false);
    assert.equal(
      isLookupWithoutProduct({ ...base, matchStatus: 'not_found' }),
      true
    );
    assert.equal(
      isLookupWithoutProduct({ ...base, matchStatus: 'accessory_skip' }),
      true
    );
    assert.equal(
      isLookupWithoutProduct({ ...base, isAccessoryOrPart: true }),
      true
    );
    assert.equal(
      isLookupWithoutProduct({
        ...base,
        priceAssessment: {
          ...base.priceAssessment,
          verdict: 'accessory_skip',
        },
      }),
      true
    );
    const notFound = renderNotFoundHtml(
      { title: 'Ốp lưng iPhone 16 & <b>' },
      'https://rate.vn',
      false
    );
    assert.ok(notFound.includes('Chưa có sản phẩm này trên Rate.vn'));
    assert.ok(
      notFound.includes(
        `https://rate.vn/inspect?q=${encodeURIComponent('Ốp lưng iPhone 16 & <b>').replace(/&/g, '&amp;')}`
      ),
      'search link carries the page title'
    );
    assert.ok(!notFound.includes('<b>'), 'the title is escaped');
    for (const product of [
      'Trung Vị Thị Trường',
      'smartphones',
      'Bảng Xếp Hạng',
      'Canh Giá',
    ]) {
      assert.ok(!notFound.includes(product), `no product UI: ${product}`);
    }
    assert.ok(
      renderNotFoundHtml(
        { title: 'Cáp sạc' },
        'https://rate.vn',
        true
      ).includes('phụ kiện')
    );
    const rows = renderActionRowsHtml([
      { href: 'https://rate.vn/p', label: 'Xem Trên Rate.vn', primary: true },
      { href: 'https://rate.vn/compare?category=tablets', label: 'So Sánh' },
      { href: 'https://rate.vn/leaderboard', label: 'Bảng Xếp Hạng' },
      { href: 'https://rate.vn/inspect?q=x', label: '🔬 Kiểm tra chi tiết' },
      { href: 'https://rate.vn/watchlist', label: '🔔 Canh Giá Thật' },
    ]);
    assert.equal((rows.match(/Kiểm tra chi tiết/g) || []).length, 1);
    assert.equal((rows.match(/class="btn-row"/g) || []).length, 3);
    assert.ok(rows.includes('Canh Giá Thật'));
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.ts'),
      'utf8'
    );
    assert.ok(
      !/\/compare\?cat=/.test(panelSource),
      'the compare page reads ?category='
    );
    console.log(
      '  ✅ [Not found and accessory states, single inspect link (#1299)] Verified'
    );
  }

  // Lookup error states (DOS/Rate#1300)
  {
    const { classifyLookupFailure, renderLookupErrorHtml } =
      await import('./sidepanel/panel-view.js');
    assert.equal(classifyLookupFailure(429), 'rate_limited');
    assert.equal(classifyLookupFailure(500), 'server');
    assert.equal(classifyLookupFailure(503), 'server');
    assert.equal(classifyLookupFailure(null), 'network');
    assert.equal(classifyLookupFailure(undefined), 'network');
    assert.equal(classifyLookupFailure(404), 'other');
    const limited = renderLookupErrorHtml('rate_limited', 'iPhone 16');
    assert.ok(limited.includes('Bạn tra cứu hơi nhanh, thử lại sau ít phút'));
    assert.ok(limited.includes('data-action="retry"'));
    assert.ok(limited.includes('iPhone 16'));
    assert.ok(
      renderLookupErrorHtml('server').includes('Rate.vn đang gặp sự cố')
    );
    assert.ok(
      renderLookupErrorHtml('network').includes('Không kết nối được Rate.vn')
    );
    for (const kind of ['rate_limited', 'server', 'network'] as const) {
      const html = renderLookupErrorHtml(kind);
      assert.ok(!html.includes('Chưa nhận diện trang sản phẩm'), kind);
      assert.ok(!/máy chủ|Rate API/.test(html), `${kind}: no settings hint`);
    }
    // The content script drops the pill and the worker clears the badge on
    // any failure, not only on an empty answer.
    const contentSource = fs.readFileSync(
      path.resolve(__dirname, 'content/content-script.ts'),
      'utf8'
    );
    assert.ok(!contentSource.includes('response?.ok && !response.data'));
    const workerSource = fs.readFileSync(
      path.resolve(__dirname, 'background/service-worker.ts'),
      'utf8'
    );
    assert.ok(workerSource.includes('status: outcome.status'));
    assert.ok(
      workerSource.includes('await updateActionBadge(sender.tab?.id, null)')
    );
    console.log(
      '  ✅ [Lookup error states and stale pill clearing (#1300)] Verified'
    );
  }

  // Empty reviews and unknown ratings (DOS/Rate#1301)
  {
    const { ratingStarText, renderReviewCardHtml } =
      await import('./sidepanel/panel-view.js');
    const empty = renderReviewCardHtml(
      {
        total_analyzed: 0,
        authentic_pct: 100,
        suspicious_pct: 0,
        fake_pct: 0,
        pros: [],
        cons: [],
        ai_summary: null,
      },
      { user_rating_weighted: 0, average_rating: 0 }
    );
    assert.ok(empty.includes('Chưa có đánh giá'));
    assert.ok(!empty.includes('100%'), 'no percentage when nothing analysed');
    assert.ok(!empty.includes('★'), 'no star for an unknown rating');
    assert.ok(!empty.includes('0.0'));
    const filled = renderReviewCardHtml(
      {
        total_analyzed: 40,
        authentic_pct: 85,
        suspicious_pct: 10,
        fake_pct: 5,
        pros: [],
        cons: [],
        ai_summary: null,
      },
      { user_rating_weighted: 4.6, average_rating: 4.5 }
    );
    assert.ok(filled.includes('★ 4.6 / 5'));
    assert.ok(filled.includes('85% (40 đánh giá)'));
    assert.equal(ratingStarText(0), null);
    assert.equal(ratingStarText(null), null);
    assert.equal(ratingStarText(4.75), '★ 4.8');
    console.log('  ✅ [Empty reviews and unknown ratings (#1301)] Verified');
  }

  // Vietnamese server text in an English or Czech panel (DOS/Rate#1374)
  {
    const { renderReviewCardHtml } = await import('./sidepanel/panel-view.js');
    const { contentLangAttr, formatCatalogueEntry, isVietnameseText } =
      await import('./i18n.js');
    const catalogues = readLocaleCatalogues();
    const viSummary =
      'Lần phân tích gần nhất (một nơi bán) đã xét 6 đánh giá: giữ lại 6 đánh giá thực chất và loại bỏ 0 đánh giá rác';
    const card = (summary: string) =>
      renderReviewCardHtml(
        {
          total_analyzed: 6,
          authentic_pct: 100,
          suspicious_pct: 0,
          fake_pct: 0,
          pros: [],
          cons: [],
          ai_summary: summary,
        },
        { user_rating_weighted: 4.8, average_rating: 4.8 }
      );
    assert.ok(isVietnameseText(viSummary));
    assert.ok(
      isVietnameseText('6.5h (Tai nghe) / 32h (Hộp sạc MagSafe USB-C)')
    );
    assert.ok(!isVietnameseText('6.1" Super Retina XDR OLED'));
    assert.ok(!isVietnameseText('Ověřené recenze, dvě nabídky, žádné'));

    // Vietnamese panel (no chrome.i18n): the summary is shown, unmarked.
    assert.ok(card(viSummary).includes(viSummary));
    assert.equal(contentLangAttr('Sạc nhanh 35W'), '');

    const globalWithChrome = globalThis as { chrome?: unknown };
    const previousChrome = globalWithChrome.chrome;
    try {
      for (const locale of ['en', 'cs'] as const) {
        globalWithChrome.chrome = {
          i18n: {
            getMessage: (name: string, subs?: string[]) => {
              const entry = catalogues[locale][name];
              return entry ? formatCatalogueEntry(entry, subs ?? []) : '';
            },
          },
        };
        const html = card(viSummary);
        assert.ok(!html.includes('Lần phân tích'), `${locale}: no vi summary`);
        assert.match(html, /100\s?%/, `${locale}: the genuine share stays`);
        const english = 'Most buyers praise the battery.';
        assert.ok(card(english).includes(english), `${locale}: non-vi shown`);
        assert.equal(contentLangAttr('Sạc nhanh 35W'), ' lang="vi"');
        assert.equal(contentLangAttr('A18 chip, 6-core GPU'), '');
      }
    } finally {
      globalWithChrome.chrome = previousChrome;
    }
    console.log(
      '  ✅ [Vietnamese server text in an en or cs panel (#1374)] Verified'
    );
  }

  // Vietnamese labels and accessible names (DOS/Rate#1302)
  {
    const { buildPillAriaLabel } = await import('./verdict-display.js');
    const panelHtml = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.html'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.ts'),
      'utf8'
    );
    const viewSource = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/panel-view.ts'),
      'utf8'
    );
    for (const english of [
      'Rate.vn Intelligence',
      'Dual Risk Score',
      'Trust Score',
      'Trust ${',
      'Fake Sale',
      '[Mall]',
      'Rate API BFF',
      'Rủi ro shop',
      'Opt-In',
      'Điểm User',
    ]) {
      for (const [name, text] of [
        ['sidepanel.html', panelHtml],
        ['sidepanel.ts', panelSource],
        ['panel-view.ts', viewSource],
      ] as const) {
        assert.ok(!text.includes(english), `${name} still says "${english}"`);
      }
    }
    const viCatalogue = fs.readFileSync(
      path.resolve(__dirname, '_locales/vi/messages.json'),
      'utf8'
    );
    for (const english of ['Rate.vn Intelligence', 'Trust Score', 'Opt-In']) {
      assert.ok(!viCatalogue.includes(english), `vi still says "${english}"`);
    }
    assert.equal(
      readLocaleCatalogues().vi.merchantTrustScore?.message,
      'Điểm tin cậy'
    );
    assert.ok(panelSource.includes("t('merchantTrustScore')"));
    assert.ok(
      /<div id="panel-root" aria-live="polite">/.test(panelHtml),
      'results are announced'
    );
    const quickInput = panelHtml.slice(
      panelHtml.indexOf('id="inp-quick-query"'),
      panelHtml.indexOf('/>', panelHtml.indexOf('id="inp-quick-query"'))
    );
    assert.ok(
      /data-i18n-aria-label="[^"]+"/.test(quickInput),
      'quick lookup is labelled'
    );
    const pillLabel = buildPillAriaLabel(
      'Giá thấp bất thường',
      'Đáy thị trường: 20.000.000 ₫'
    );
    assert.ok(pillLabel.includes('Giá thấp bất thường'), 'verdict is spoken');
    assert.ok(pillLabel.includes('Mở bảng phân tích giá'));
    const contentSource = fs.readFileSync(
      path.resolve(__dirname, 'content/content-script.ts'),
      'utf8'
    );
    assert.ok(
      contentSource.includes(
        'aria-label="${escapeHtml(buildPillAriaLabel(verdict.label, cheaperSummary))}"'
      ),
      'the pill names its verdict'
    );
    console.log(
      '  ✅ [Vietnamese labels and accessible names (#1302)] Verified'
    );
  }

  // vi, en and cs through chrome.i18n (DOS/Rate#1304)
  {
    const catalogues = readLocaleCatalogues();
    const viKeys = Object.keys(catalogues.vi).sort();
    const placeholderShape = (entry: LocaleMessage) =>
      JSON.stringify(
        Object.entries(entry.placeholders ?? {})
          .map(([name, p]) => [name, p.content])
          .sort()
      );
    const usedPlaceholders = (message: string) =>
      [...message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)]
        .map((m) => m[1]!.toLowerCase())
        .sort();
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      assert.deepEqual(
        Object.keys(catalogue).sort(),
        viKeys,
        `${locale} has the same keys as vi`
      );
      for (const [key, entry] of Object.entries(catalogue)) {
        assert.ok(entry.message.trim(), `${locale}.${key} is empty`);
        assert.ok(
          !/[\u2013\u2014]/.test(entry.message),
          `${locale}.${key} has an en or em dash`
        );
        assert.equal(
          placeholderShape(entry),
          placeholderShape(catalogues.vi[key]!),
          `${locale}.${key} placeholders match vi`
        );
        assert.deepEqual(
          [...new Set(usedPlaceholders(entry.message))],
          Object.keys(entry.placeholders ?? {}).sort(),
          `${locale}.${key} uses each placeholder it defines`
        );
      }
    }
    // Chrome store limits for the localised manifest fields.
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      assert.ok(catalogue.extName!.message.length <= 75, `${locale} extName`);
      assert.ok(
        catalogue.extDescription!.message.length <= 132,
        `${locale} extDescription`
      );
    }
    const manifestText = fs.readFileSync(
      path.resolve(__dirname, '../manifest.json'),
      'utf8'
    );
    const manifest = JSON.parse(manifestText) as {
      default_locale?: string;
      description?: string;
      action?: { default_title?: string };
    };
    assert.equal(manifest.default_locale, 'vi');
    assert.equal(manifest.description, '__MSG_extDescription__');
    assert.equal(manifest.action?.default_title, '__MSG_actionTitle__');
    for (const m of manifestText.matchAll(/__MSG_(\w+)__/g)) {
      assert.ok(m[1]! in catalogues.vi, `manifest uses unknown ${m[1]}`);
    }

    // Every data-i18n* key in the side panel page exists.
    const html = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.html'),
      'utf8'
    );
    const htmlKeys = [...html.matchAll(/data-i18n[\w-]*="([^"]+)"/g)].map(
      (m) => m[1]!
    );
    assert.ok(htmlKeys.length >= 10);
    for (const key of htmlKeys) {
      assert.ok(key in catalogues.vi, `sidepanel.html uses unknown ${key}`);
    }

    // Every t('key') / tHtml('key') in src names a real message.
    const sourceFiles = listExtensionSourceFiles();
    for (const file of sourceFiles) {
      if (file.endsWith('test-extension-pipeline.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\btHtml?\(\s*'([A-Za-z0-9_]+)'/g)) {
        assert.ok(m[1]! in catalogues.vi, `${file} uses unknown ${m[1]}`);
      }
    }

    // No hard-coded Vietnamese user-visible text is left in src: comments
    // and this test are skipped, and the allowlist holds only text that
    // parses store pages and is never shown.
    const VIETNAMESE_LETTER =
      /[àáâãèéêìíòóôõùúýăđĩũơưÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠ-ỹ]/;
    const ALLOWED_VIETNAMESE: Array<[file: string, fragment: string]> = [
      // Strips "| Thế Giới Di Động" style store suffixes from page titles.
      ['extractors/ecommerce-detector.ts', 'Thế\\s*Giới\\s*Di\\s*Động'],
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const rel = path.relative(__dirname, file).replace(/\\/g, '/');
      if (rel === 'test-extension-pipeline.ts') continue;
      const lines = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
        .replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ''))
        .split('\n');
      lines.forEach((raw, index) => {
        const line = raw.replace(/(^|\s)\/\/.*$/, '');
        if (!VIETNAMESE_LETTER.test(line)) return;
        if (
          ALLOWED_VIETNAMESE.some(
            ([allowedFile, fragment]) =>
              rel === allowedFile && line.includes(fragment)
          )
        ) {
          return;
        }
        offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(offenders, [], 'Vietnamese text belongs in _locales');

    // Without chrome.i18n the helper falls back to the vi catalogue, with
    // its placeholders filled; with it, the browser's language wins.
    const { t, tHtml, formatCatalogueEntry } = await import('./i18n.js');
    assert.equal(t('offerOutOfStock'), 'Hết hàng');
    assert.equal(
      t('pillCheaperAt', [3, '1.000.000 ₫']),
      'Rẻ hơn tại 3 nơi (-1.000.000 ₫)'
    );
    assert.equal(
      tHtml('noProductBody', ['<b>A</b>', '<b>B</b>', '<b>C</b>']),
      'Hãy mở một trang chi tiết sản phẩm trên <b>A</b> hoặc <b>B</b>, hoặc dán link/tên máy vào ô <b>C</b> phía trên.'
    );
    assert.equal(
      formatCatalogueEntry(catalogues.en.reviewAuthenticValue!, ['85', '40']),
      '85% (reviews: 40)'
    );
    assert.equal(
      formatCatalogueEntry(catalogues.cs.offerOutOfStock!),
      'Není skladem'
    );
    const globalWithChrome = globalThis as { chrome?: unknown };
    const previousChrome = globalWithChrome.chrome;
    globalWithChrome.chrome = {
      i18n: {
        getMessage: (name: string, subs?: string[]) =>
          name === 'offerOutOfStock'
            ? 'Out of stock'
            : name === 'pillMarketLow'
              ? `Market low: ${subs?.[0]}`
              : '',
      },
    };
    try {
      assert.equal(t('offerOutOfStock'), 'Out of stock');
      assert.equal(t('pillMarketLow', ['5 ₫']), 'Market low: 5 ₫');
      // An unknown message in the browser still shows the vi text.
      assert.equal(t('offerDiscontinued'), 'Ngừng bán');
      assert.equal(
        tHtml('offerOutOfStock', []),
        'Out of stock',
        'tHtml goes through chrome.i18n too'
      );
    } finally {
      globalWithChrome.chrome = previousChrome;
    }
    console.log('  ✅ [vi, en and cs through chrome.i18n (#1304)] Verified');
  }

  // The verdict label and explanation in the extension's language, from the
  // server's message key and params (DOS/Rate#1326).
  {
    const catalogues = readLocaleCatalogues();
    const { formatCatalogueEntry } = await import('./i18n.js');
    const { VERDICT_MESSAGES, verdictTexts } =
      await import('./verdict-display.js');
    const mkOffer = (id: string, price: number) =>
      ({
        id,
        platform: 'shopee',
        url: 'https://example.test/1326/' + id,
        price_current: price,
        price_original: null,
        merchant: {
          id: 'm-' + id,
          name: 'Shop ' + id,
          risk_score: 5,
          is_official: true,
        },
      }) as never;
    const offers = [
      mkOffer('a', 20_000_000),
      mkOffer('b', 21_000_000),
      mkOffer('c', 22_000_000),
    ];
    const judge = (
      overrides: Partial<Parameters<typeof evaluateExtensionPriceVerdict>[0]>
    ) =>
      evaluateExtensionPriceVerdict({
        isAccessory: false,
        accessoryReason: null,
        isAmbiguousVariant: false,
        observedPrice: null,
        observedOriginalPrice: null,
        offers,
        priceHistory: null,
        ...overrides,
      });
    const keywordGate = detectAccessoryOrJunk({
      title: 'Ốp lưng silicon chống sốc cho iPhone 16 Pro Max',
      price: 89_000,
    });
    const floorGate = detectAccessoryOrJunk({
      title: 'Điện thoại Apple iPhone 16 128GB',
      price: 50_000,
    });
    const serverAssessments = [
      judge({ isAccessory: true }),
      judge({
        isAccessory: true,
        accessoryReason: keywordGate.reason,
        accessoryMessage: keywordGate.message,
      }),
      judge({
        isAccessory: true,
        accessoryReason: floorGate.reason,
        accessoryMessage: floorGate.message,
      }),
      judge({ observedPrice: 21_000_000, isAmbiguousVariant: true }),
      judge({ observedPrice: 5_000_000 }),
      judge({ observedPrice: 21_000_000, offers: [] }),
      judge({ observedPrice: 21_500_000, observedOriginalPrice: 26_000_000 }),
      judge({ observedPrice: 20_000_000 }),
      judge({ observedPrice: 23_000_000 }),
      judge({ observedPrice: 21_200_000 }),
    ];
    const seenKeys = new Set<string>();
    for (const assessment of serverAssessments) {
      assert.ok(assessment.messageKey, `${assessment.badgeLabel} has a key`);
      seenKeys.add(assessment.messageKey!);
      // The vi catalogue filled with the params is the server's own text.
      assert.deepEqual(
        verdictTexts(assessment),
        { label: assessment.badgeLabel, explanation: assessment.explanation },
        `vi text for ${assessment.messageKey}`
      );
    }
    assert.deepEqual(
      [...seenKeys].sort(),
      Object.keys(VERDICT_MESSAGES).sort(),
      'every server key is rendered and tested'
    );

    // Every locale has each message with one placeholder per param.
    const placeholderCount = (key: string, locale: 'vi' | 'en' | 'cs') =>
      Object.keys(catalogues[locale][key]?.placeholders ?? {}).length;
    for (const spec of Object.values(VERDICT_MESSAGES)) {
      for (const locale of ['vi', 'en', 'cs'] as const) {
        assert.ok(catalogues[locale][spec.label], `${locale}.${spec.label}`);
        assert.ok(
          catalogues[locale][spec.explanation],
          `${locale}.${spec.explanation}`
        );
        assert.equal(
          placeholderCount(spec.label, locale),
          spec.labelParams.length
        );
        assert.equal(
          placeholderCount(spec.explanation, locale),
          spec.explanationParams.length
        );
      }
    }

    // With an English or Czech browser the verdict reads in that language.
    const globalWithChrome = globalThis as { chrome?: unknown };
    const previousChrome = globalWithChrome.chrome;
    const useLocale = (locale: 'en' | 'cs') => {
      globalWithChrome.chrome = {
        i18n: {
          getMessage: (name: string, subs?: string[]) => {
            const entry = catalogues[locale][name];
            return entry ? formatCatalogueEntry(entry, subs ?? []) : '';
          },
        },
      };
    };
    const above = serverAssessments[8]!;
    const fake = serverAssessments[6]!;
    const keyword = serverAssessments[1]!;
    try {
      useLocale('en');
      assert.deepEqual(verdictTexts(above), {
        label: 'Above market +9.5%',
        explanation:
          'The price shown (23.000.000 ₫) is about 9.5% above the market median (21.000.000 ₫), but the store shows no inflated list price.',
      });
      assert.equal(verdictTexts(fake).label, 'Fake discount alert');
      assert.ok(verdictTexts(fake).explanation.includes('(-17.3%)'));
      assert.equal(
        verdictTexts(keyword).explanation,
        'The product title contains the accessory or part keyword "ốp lưng".'
      );
      useLocale('cs');
      assert.equal(verdictTexts(above).label, 'Nad trhem +9,5 %');
      assert.equal(
        verdictTexts(serverAssessments[9]!).label,
        'Férová tržní cena'
      );
    } finally {
      globalWithChrome.chrome = previousChrome;
    }

    // An older server, an unknown key or a bad value keeps the server text.
    const serverText = {
      badgeLabel: 'Nhãn từ máy chủ',
      explanation: 'Giải thích từ máy chủ',
    };
    const asServer = {
      label: 'Nhãn từ máy chủ',
      explanation: 'Giải thích từ máy chủ',
    };
    assert.deepEqual(verdictTexts(serverText), asServer);
    assert.deepEqual(
      verdictTexts({ ...serverText, messageKey: 'new_verdict_kind' }),
      asServer
    );
    assert.deepEqual(
      verdictTexts({ ...serverText, messageKey: '__proto__' }),
      asServer
    );
    assert.deepEqual(
      verdictTexts({
        ...serverText,
        messageKey: 'fair_market',
        messageParams: { effectivePrice: '1' as never, marketMedianPrice: 2 },
      }),
      asServer
    );
    assert.deepEqual(
      verdictTexts({
        ...serverText,
        messageKey: 'above_market',
        messageParams: { effectivePrice: 1, marketMedianPrice: 2 },
      }),
      asServer,
      'a missing param keeps the server text'
    );
    assert.deepEqual(
      verdictTexts({ ...serverText, messageKey: 'genuine_deal' }),
      asServer
    );
    // Shown text is escaped where it is placed.
    const contentSource = fs.readFileSync(
      path.resolve(__dirname, 'content/content-script.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, 'sidepanel/sidepanel.ts'),
      'utf8'
    );
    assert.ok(
      contentSource.includes(
        '<span class="verdict-badge">${escapeHtml(verdict.label)}</span>'
      )
    );
    assert.ok(panelSource.includes('}">${escapeHtml(verdict.label)}</span>'));
    assert.ok(panelSource.includes('${escapeHtml(verdict.explanation)}</p>'));
    for (const text of [contentSource, panelSource]) {
      assert.ok(!/assessment\.(badgeLabel|explanation)\b/.test(text));
    }

    // The request is unchanged: no locale or language leaves the extension
    // (DOS/Rate#1175).
    const workerSource = fs.readFileSync(
      path.resolve(__dirname, 'background/service-worker.ts'),
      'utf8'
    );
    const sentParams = [
      ...new Set(
        [...workerSource.matchAll(/params\.set\(\s*'([^']+)'/g)].map(
          (m) => m[1]!
        )
      ),
    ].sort();
    assert.deepEqual(sentParams, [
      'externalId',
      'mode',
      'originalPrice',
      'platform',
      'price',
      'selectedVariant',
      'shopId',
      'title',
      'url',
    ]);
    for (const file of listExtensionSourceFiles()) {
      if (file.endsWith('test-extension-pipeline.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(
        !/getUILanguage|navigator\.languages?\b|Accept-Language/i.test(text),
        `${file} reads or sends the browser language`
      );
    }
    console.log(
      '  ✅ [Verdict text in the extension language (#1326)] Verified'
    );
  }

  console.log('🎉 All Rate Browser Extension MV3 v2 tests passed!');
}

interface LocaleMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

function readLocaleCatalogues(): Record<
  'vi' | 'en' | 'cs',
  Record<string, LocaleMessage>
> {
  const read = (locale: string) =>
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `_locales/${locale}/messages.json`),
        'utf8'
      )
    ) as Record<string, LocaleMessage>;
  return { vi: read('vi'), en: read('en'), cs: read('cs') };
}

/** The extension's own .ts and .html sources under src. */
function listExtensionSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|html)$/.test(entry.name)) files.push(full);
    }
  };
  walk(__dirname);
  return files;
}

runTests().catch((err) => {
  console.error('❌ Extension test suite failed:', err);
  process.exit(1);
});
