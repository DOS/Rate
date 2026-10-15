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
  EXTENSION_CAPABILITY_MATRIX,
  canonicalizeProductUrl,
  detectAccessoryOrJunk,
  evaluateExtensionPriceVerdict,
  extractStorageAndAmbiguity,
  ingestExtensionCrowdSignal,
  lookupExtensionProduct,
} from '../../web/src/server/rate/extension.js';

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

  const nonShopeeRes = await ingestExtensionCrowdSignal({
    platform: 'lazada',
    externalItemId: '123456',
    url: 'https://www.lazada.vn/products/iphone-16-pro-max-i123456.html',
    title: 'Điện thoại iPhone 16 Pro Max 256GB',
    price: 28990000,
    userConsentOptIn: true,
  });
  assert.equal(nonShopeeRes.accepted, false);
  assert.equal(nonShopeeRes.jobState, 'platform_worker_pending_phase_5_1');
  assert.equal(EXTENSION_CAPABILITY_MATRIX.shopee.crowdVerifyQueue, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.lazada.crowdVerifyQueue, false);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.tiktok.lookup, true);
  assert.equal(EXTENSION_CAPABILITY_MATRIX.hoangha.lookup, true);
  console.log(
    '  ✅ [5/6] Zero-Trust Quarantine, Opt-In Consent & 10-Platform Capability Matrix passed'
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
    const { getMasterProducts } = await import('../../web/src/lib/rate-api.js');
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
    }
    console.log(
      `  ✅ [6/6] Live Read-Only Lookup matched "${liveLookup.masterProduct?.name || 'N/A'}" (matchStatus=${liveLookup.matchStatus}, verdict=${liveLookup.priceAssessment.verdict}, offers=${liveLookup.allOffers.length})`
    );
  }

  console.log('🎉 All Rate Browser Extension MV3 v2 tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Extension test suite failed:', err);
  process.exit(1);
});
