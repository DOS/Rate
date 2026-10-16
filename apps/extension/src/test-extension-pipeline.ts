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
import * as extModule from '../../web/src/server/rate/extension.js';
const {
  EXTENSION_CAPABILITY_MATRIX,
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
  extractStorageAndAmbiguity,
  ingestExtensionCrowdSignal,
  lookupExtensionProduct,
} = (
  'EXTENSION_CAPABILITY_MATRIX' in extModule
    ? extModule
    : (extModule as unknown as { default: typeof extModule }).default
) as typeof extModule;

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
  console.log(
    '  ✅ [5/6] Zero-Trust Quarantine, Opt-In Consent & Full 10/10 Platform Capability Matrix passed'
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
      assert.ok(liveLookup.leaderboardStandings.length >= 1);
      assert.ok(liveLookup.leaderboardStandings[0]!.rank >= 1);
      assert.ok(liveLookup.leaderboardStandings[0]!.score10 > 0);
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
    }

    console.log(
      `  ✅ [6/9] Live Read-Only Lookup matched "${liveLookup.masterProduct?.name || 'N/A'}" (cat=${liveLookup.categorySlug}, rank=#${liveLookup.leaderboardStandings?.[0]?.rank}/${liveLookup.leaderboardStandings?.[0]?.totalInCategory}, versus=${liveLookup.versusUrl}, offers=${liveLookup.allOffers.length})`
    );

    const dealsMod = await import('../../web/src/server/rate/deals.js');
    const { getCrossPlatformDealRadar } = (
      'getCrossPlatformDealRadar' in dealsMod
        ? dealsMod
        : (dealsMod as unknown as { default: typeof dealsMod }).default
    ) as typeof dealsMod;

    const radar = await getCrossPlatformDealRadar({ limit: 8 });
    assert.ok(radar.totalClustersAnalyzed >= 10);
    assert.ok(radar.totalOffersAnalyzed >= 100);
    assert.ok(radar.genuineDeals.length >= 5);
    assert.ok(radar.genuineDeals[0]!.savingsVsMedianVnd > 0);
    assert.ok(radar.priceSpreadLeaders.length >= 5);
    assert.ok(radar.priceSpreadLeaders[0]!.spreadVnd > 0);
    console.log(
      `  ✅ [7/9] Live Cross-Platform Deal Radar & Spread Leaders verified (${radar.totalClustersAnalyzed} clusters, ${radar.totalOffersAnalyzed} offers, ${radar.genuineDeals.length} genuine deals, ${radar.fakeSaleTraps.length} fake-sale traps, topSpread="${radar.priceSpreadLeaders[0]!.productName}" +${radar.priceSpreadLeaders[0]!.spreadVnd.toLocaleString('vi-VN')}₫)`
    );

    const openApiMod = await import('../../web/src/server/rate/openapi.js');
    const { buildRateOpenApiSpec } = (
      'buildRateOpenApiSpec' in openApiMod
        ? openApiMod
        : (openApiMod as unknown as { default: typeof openApiMod }).default
    ) as typeof openApiMod;

    const openApiSpec = buildRateOpenApiSpec('https://rate.vn');
    assert.equal(openApiSpec.openapi, '3.1.0');
    assert.equal(openApiSpec.info.version, '1.6.0');
    assert.ok('/api/v1/rate/deals' in openApiSpec.paths);
    assert.ok('/api/v1/rate/extension/lookup' in openApiSpec.paths);
    assert.ok('/api/v1/rate/openapi' in openApiSpec.paths);
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
    assert.ok(merchantsList.length >= 18);
    assert.ok(merchantsList[0]!.trust_score >= 90);
    const firstMerchantProfile = await getMerchantProfileById(
      merchantsList[0]!.id
    );
    assert.ok(firstMerchantProfile);
    assert.equal(firstMerchantProfile.id, merchantsList[0]!.id);
    assert.ok(firstMerchantProfile.listings.length > 0);
    console.log(
      `  ✅ [9/9] Live Merchant Risk & Trust Directory verified (${merchantsList.length} merchants audited, top="${merchantsList[0]!.name}" trust=${merchantsList[0]!.trust_score}/100, listings=${firstMerchantProfile.listings.length})`
    );
  }

  console.log('🎉 All Rate Browser Extension MV3 v2 tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Extension test suite failed:', err);
  process.exit(1);
});
