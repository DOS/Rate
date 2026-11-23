import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import ProductOffersExplorer from '../../components/leaderboard/ProductOffersExplorer';
import ProductValueCalculator from '../../components/leaderboard/ProductValueCalculator';
import type { MerchantOffer } from '../rate-api';
import {
  computeEffectivePrice,
  MAX_INSTALLMENT_FEE_PERCENT,
  MAX_VOUCHER_PERCENT,
  selectEffectivePriceBaseOffers,
  type EffectivePriceOfferCandidate,
} from '../effective-price';
import { MAX_VALID_VND_PRICE } from '@repo/shared-data/rules';

function testVoucherMathAndBounds(): void {
  // Fixed discount
  const fixed = computeEffectivePrice({
    basePriceVnd: 28_990_000,
    discountMode: 'fixed',
    discountAmountVnd: 1_500_000,
  });
  assert.equal(fixed.voucherSavingsVnd, 1_500_000);
  assert.equal(fixed.priceAfterVoucherVnd, 27_490_000);
  assert.equal(fixed.netCashPayableVnd, 27_490_000);
  assert.equal(fixed.totalPaidVnd, 27_490_000);

  // Fixed discount larger than base price floors at 0 VND
  const floored = computeEffectivePrice({
    basePriceVnd: 5_000_000,
    discountMode: 'fixed',
    discountAmountVnd: 10_000_000,
  });
  assert.equal(floored.voucherSavingsVnd, 5_000_000);
  assert.equal(floored.priceAfterVoucherVnd, 0);
  assert.equal(floored.netCashPayableVnd, 0);

  // Percentage discount with optional max cap
  const pctUncapped = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    discountMode: 'percent',
    discountPercent: 15,
  });
  assert.equal(pctUncapped.voucherSavingsVnd, 3_000_000);
  assert.equal(pctUncapped.discountCapAppliedVnd, null);

  const pctCapped = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    discountMode: 'percent',
    discountPercent: 15,
    discountMaxCapVnd: 1_200_000,
  });
  assert.equal(pctCapped.voucherSavingsVnd, 1_200_000);
  assert.equal(pctCapped.priceAfterVoucherVnd, 18_800_000);
  assert.equal(pctCapped.discountCapAppliedVnd, 1_200_000);

  // Percentage discount clamped to MAX_VOUCHER_PERCENT (80%)
  const pctOverMax = computeEffectivePrice({
    basePriceVnd: 10_000_000,
    discountMode: 'percent',
    discountPercent: 95,
  });
  assert.equal(pctOverMax.discountPercentApplied, MAX_VOUCHER_PERCENT);
  assert.equal(pctOverMax.voucherSavingsVnd, 8_000_000);
  assert.equal(pctOverMax.priceAfterVoucherVnd, 2_000_000);

  // Rejects NaN, Infinity, negative inputs, and bounds MAX_VALID_VND_PRICE
  const corrupted = computeEffectivePrice({
    basePriceVnd: Number.NaN,
    discountMode: 'fixed',
    discountAmountVnd: Number.POSITIVE_INFINITY,
  });
  assert.equal(corrupted.basePriceVnd, 0);
  assert.equal(corrupted.netCashPayableVnd, 0);

  const negInputs = computeEffectivePrice({
    basePriceVnd: 15_000_000,
    discountMode: 'percent',
    discountPercent: -25,
    discountMaxCapVnd: -500_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: Number.NEGATIVE_INFINITY,
    tradeInBonusVnd: -1_000_000,
    installmentTerm: 6,
    installmentFeePercent: Number.NaN,
  });
  assert.equal(negInputs.voucherSavingsVnd, 0);
  assert.equal(negInputs.storeTradeInCreditVnd, 0);
  assert.equal(negInputs.conversionFeeVnd, 0);
  assert.equal(negInputs.netCashPayableVnd, 15_000_000);

  const overCeiling = computeEffectivePrice({
    basePriceVnd: MAX_VALID_VND_PRICE * 5,
    discountMode: 'fixed',
    discountAmountVnd: -100,
  });
  assert.equal(overCeiling.basePriceVnd, MAX_VALID_VND_PRICE);
  assert.equal(overCeiling.netCashPayableVnd, MAX_VALID_VND_PRICE);
}

function testTradeInAndSelfResaleDelta(): void {
  // Grade 1 (100%) + 2M bonus beats 10M self-resale by +2M
  const grade1 = computeEffectivePrice({
    basePriceVnd: 30_000_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 10_000_000,
    tradeInConditionTier: 'grade_1_mint',
    tradeInBonusVnd: 2_000_000,
  });
  assert.equal(grade1.tradeInConditionPct, 100);
  assert.equal(grade1.conditionAdjustedTradeInVnd, 10_000_000);
  assert.equal(grade1.storeTradeInCreditVnd, 12_000_000);
  assert.equal(grade1.selfResaleComparisonDeltaVnd, 2_000_000);
  assert.equal(grade1.netCashPayableVnd, 18_000_000);
  assert.equal(grade1.selfResaleNetPayableVnd, 20_000_000);

  // Grade 2 (85%) + 1M bonus vs 10M self-resale -> -500k (self-resale wins)
  const grade2 = computeEffectivePrice({
    basePriceVnd: 30_000_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 10_000_000,
    tradeInConditionTier: 'grade_2_light_wear',
    tradeInBonusVnd: 1_000_000,
  });
  assert.equal(grade2.tradeInConditionPct, 85);
  assert.equal(grade2.conditionAdjustedTradeInVnd, 8_500_000);
  assert.equal(grade2.storeTradeInCreditVnd, 9_500_000);
  assert.equal(grade2.selfResaleComparisonDeltaVnd, -500_000);
  assert.equal(grade2.netCashPayableVnd, 20_500_000);

  // Grade 3 (70%) + 1.5M bonus vs 10M self-resale -> -1.5M (self-resale wins)
  const grade3 = computeEffectivePrice({
    basePriceVnd: 30_000_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 10_000_000,
    tradeInConditionTier: 'grade_3_battery_under_85',
    tradeInBonusVnd: 1_500_000,
  });
  assert.equal(grade3.tradeInConditionPct, 70);
  assert.equal(grade3.conditionAdjustedTradeInVnd, 7_000_000);
  assert.equal(grade3.storeTradeInCreditVnd, 8_500_000);
  assert.equal(grade3.selfResaleComparisonDeltaVnd, -1_500_000);

  // Zero old-device benchmark suppresses phantom store bonus
  const zeroBenchmark = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 0,
    tradeInConditionTier: 'grade_1_mint',
    tradeInBonusVnd: 3_000_000,
  });
  assert.equal(zeroBenchmark.storeTradeInCreditVnd, 0);
  assert.equal(zeroBenchmark.selfResaleComparisonDeltaVnd, 0);
  assert.equal(zeroBenchmark.netCashPayableVnd, 20_000_000);

  // Trade-in + voucher exceeding base price floors net payable at 0 VND
  const zeroNet = computeEffectivePrice({
    basePriceVnd: 12_000_000,
    discountMode: 'fixed',
    discountAmountVnd: 2_000_000,
    tradeInEnabled: true,
    oldDeviceResaleBenchmarkVnd: 15_000_000,
    tradeInConditionTier: 'grade_1_mint',
    tradeInBonusVnd: 1_000_000,
  });
  assert.equal(zeroNet.netCashPayableVnd, 0);
  assert.equal(zeroNet.selfResaleNetPayableVnd, 0);
}

function testInstallmentRealityCheck(): void {
  // Cash ignores conversion fee
  const cash = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    installmentTerm: 'cash',
    installmentFeePercent: 6,
  });
  assert.equal(cash.installmentMonths, 0);
  assert.equal(cash.conversionFeeVnd, 0);
  assert.equal(cash.totalPaidVnd, 20_000_000);
  assert.equal(cash.monthlyPaymentVnd, 0);
  assert.equal(cash.totalDiffVsCashVnd, 0);

  // True 0% installment (default 0% fee)
  const trueZero = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    installmentTerm: 6,
  });
  assert.equal(trueZero.installmentMonths, 6);
  assert.equal(trueZero.installmentFeePercent, 0);
  assert.equal(trueZero.conversionFeeVnd, 0);
  assert.equal(trueZero.totalPaidVnd, 20_000_000);
  assert.equal(trueZero.monthlyPaymentVnd, 3_333_333);
  assert.equal(trueZero.totalDiffVsCashVnd, 0);

  // 6% conversion fee on 12 months
  const fee6 = computeEffectivePrice({
    basePriceVnd: 20_000_000,
    installmentTerm: 12,
    installmentFeePercent: 6,
  });
  assert.equal(fee6.conversionFeeVnd, 1_200_000);
  assert.equal(fee6.totalPaidVnd, 21_200_000);
  assert.equal(fee6.monthlyPaymentVnd, 1_766_667);
  assert.equal(fee6.totalDiffVsCashVnd, 1_200_000);

  // Fee above 15% clamps to MAX_INSTALLMENT_FEE_PERCENT (15%)
  const clampedFee = computeEffectivePrice({
    basePriceVnd: 10_000_000,
    installmentTerm: 3,
    installmentFeePercent: 40,
  });
  assert.equal(clampedFee.installmentFeePercent, MAX_INSTALLMENT_FEE_PERCENT);
  assert.equal(clampedFee.conversionFeeVnd, 1_500_000);
  assert.equal(clampedFee.totalPaidVnd, 11_500_000);
  assert.equal(clampedFee.monthlyPaymentVnd, 3_833_333);
  assert.equal(clampedFee.totalDiffVsCashVnd, 1_500_000);
}

function testOfferSelectionIgnoresBaitAndUnavailable(): void {
  const offers: EffectivePriceOfferCandidate[] = [
    {
      id: 'sold-out',
      platform: 'cellphones',
      title: 'iPhone 16 Pro Max 256GB Chính hãng VN/A',
      price_current: 25_000_000,
      availability: 'out_of_stock',
      merchant: { name: 'CellphoneS', is_official: true, risk_score: 5 },
    },
    {
      id: 'bait',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB VN/A giá sốc',
      price_current: 5_000_000,
      availability: 'in_stock',
      merchant: { name: 'Bait Shop', is_official: false, risk_score: 80 },
    },
    {
      id: 'imported',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay',
      price_current: 26_500_000,
      availability: 'in_stock',
      merchant: { name: 'Import Shop', is_official: false, risk_score: 25 },
    },
    {
      id: 'vna-mall',
      platform: 'shopee',
      title: 'iPhone 16 Pro Max 256GB Chính hãng VN/A',
      price_current: 28_990_000,
      availability: 'in_stock',
      merchant: {
        name: 'Apple Flagship Store',
        is_official: true,
        risk_score: 8,
      },
    },
    {
      id: 'vna-chain',
      platform: 'topzone',
      title: 'iPhone 16 Pro Max 256GB VN/A',
      price_current: 28_990_000,
      availability: 'in_stock',
      merchant: { name: 'TopZone', is_official: true, risk_score: 5 },
    },
  ];

  const selection = selectEffectivePriceBaseOffers(offers, 29_990_000);
  assert.equal(selection.bestPlausibleOffer?.offer.id, 'imported');
  assert.equal(selection.bestPlausiblePriceVnd, 26_500_000);
  // Same price tie breaks to authorized_vat chain (TopZone) over official_mall
  assert.equal(selection.bestOfficialVnaOffer?.offer.id, 'vna-chain');
  assert.equal(selection.bestOfficialVnaPriceVnd, 28_990_000);
  assert.equal(selection.bestOfficialVnaOffer?.sellerChannel, 'authorized_vat');

  const fallback = selectEffectivePriceBaseOffers([], 27_990_000);
  assert.equal(fallback.bestPlausibleOffer, null);
  assert.equal(fallback.bestPlausiblePriceVnd, 27_990_000);
  assert.equal(fallback.bestOfficialVnaPriceVnd, null);

  const corruptFallback = selectEffectivePriceBaseOffers(null, 999_999_999_999);
  assert.equal(corruptFallback.bestPlausiblePriceVnd, 0);
}

function testLocaleParityAndZeroDashes(): void {
  const newKeys = [
    'offersOfficialVnaOnlyBtn',
    'offersOriginVnaBadge',
    'offersOriginImportedBadge',
    'offersOriginUnknownBadge',
    'offersChannelAuthorizedVat',
    'offersChannelIndependentShop',
    'effToggle',
    'effBase',
    'effDisc',
    'effCap',
    'effTrade',
    'effOld',
    'effBonus',
    'effC',
    'effTerm',
    'effCash',
    'effFee',
    'effNet',
    'effStore',
    'effSelf',
    'effTotal',
    'effNote',
  ] as const;

  const readLocale = (loc: 'vi' | 'en' | 'cs') =>
    JSON.parse(
      readFileSync(
        new URL(`../../../locales/${loc}.json`, import.meta.url),
        'utf8'
      )
    ) as { productDetail: Record<string, string> };

  const catalogs = {
    vi: readLocale('vi').productDetail,
    en: readLocale('en').productDetail,
    cs: readLocale('cs').productDetail,
  };

  const placeholders = (s: string) =>
    [...new Set([...s.matchAll(/\{(\w+)(?=[},])/g)].map((m) => m[1]))].sort();

  for (const key of newKeys) {
    const viVal = catalogs.vi[key];
    assert.ok(viVal && viVal.trim().length > 0, `vi.productDetail.${key}`);
    for (const loc of ['vi', 'en', 'cs'] as const) {
      const val = catalogs[loc][key];
      assert.ok(
        val && val.trim().length > 0,
        `${loc}.productDetail.${key} missing`
      );
      assert.doesNotMatch(
        val,
        /[\u2013\u2014]/,
        `${loc}.productDetail.${key} must not contain en/em dashes`
      );
      assert.deepEqual(
        placeholders(val),
        placeholders(viVal),
        `${loc}.productDetail.${key} placeholder parity`
      );
    }
  }
}

function testUiSsrIntegration(): void {
  const IntlProvider =
    NextIntlClientProvider as unknown as React.ComponentType<{
      locale: string;
      messages: unknown;
      timeZone: string;
      children?: React.ReactNode;
    }>;

  const mkUiOffer = (
    id: string,
    platform: string,
    merchantName: string,
    isOfficial: boolean,
    title: string,
    price: number
  ): MerchantOffer =>
    ({
      id,
      platform,
      title,
      price_current: price,
      price_original: null,
      stock: 10,
      rating_star: 5,
      rating_count: 10,
      url: `https://example.test/${id}`,
      availability: 'in_stock',
      merchant: {
        id: `m-${id}`,
        name: merchantName,
        platform,
        is_official: isOfficial,
        rating_star: 5,
        follower_count: 1000,
        location: null,
        risk_score: 10,
        dosafe_risk_score: 10,
        review_risk_score: 10,
        review_risk_breakdown: null,
      },
    }) as MerchantOffer;

  const sampleOffers = [
    mkUiOffer(
      'o-vna',
      'topzone',
      'TopZone',
      true,
      'iPhone 16 Pro Max 256GB Chính hãng VN/A',
      29_990_000
    ),
    mkUiOffer(
      'o-imp',
      'shopee',
      'Xach Tay Shop',
      false,
      'iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay',
      26_500_000
    ),
  ];

  // ProductOffersExplorer renders origin badges, channel pills, and Official VN/A filter chip
  const explorerAllHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductOffersExplorer, {
        productName: 'iPhone 16 Pro Max 256GB',
        productSlug: 'iphone-16-pro-max-256gb',
        offers: sampleOffers,
        byOffer: {},
      })
    )
  );
  assert.ok(
    explorerAllHtml.includes('data-testid="offers-official-vna-filter-btn"')
  );
  assert.ok(explorerAllHtml.includes('data-origin="official_vna"'));
  assert.ok(explorerAllHtml.includes('data-origin="imported"'));
  assert.ok(explorerAllHtml.includes('data-channel="authorized_vat"'));
  assert.ok(explorerAllHtml.includes('data-channel="independent_shop"'));

  const explorerVnaHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductOffersExplorer, {
        productName: 'iPhone 16 Pro Max 256GB',
        productSlug: 'iphone-16-pro-max-256gb',
        offers: sampleOffers,
        byOffer: {},
        initialOfficialVnaOnly: true,
      })
    )
  );
  const explorerVnaTbody = explorerVnaHtml.slice(
    explorerVnaHtml.indexOf('<tbody>')
  );
  assert.ok(explorerVnaTbody.includes('TopZone'));
  assert.equal(explorerVnaTbody.includes('Xach Tay Shop'), false);
  assert.equal(explorerVnaTbody.includes('data-origin="imported"'), false);

  // ProductValueCalculator renders collapsed by default, and renders full panel + disclaimer when open
  const calcCollapsedHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculator, {
        productName: 'iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 26_500_000,
        maxPriceVnd: 29_990_000,
        userScore5: 4.8,
        expertScore10: 9.2,
        valueCriterionScore5: 4.5,
        offers: sampleOffers,
      })
    )
  );
  assert.ok(
    calcCollapsedHtml.includes('data-testid="effective-price-toggle-btn"')
  );
  assert.equal(
    calcCollapsedHtml.includes('data-testid="effective-price-panel"'),
    false
  );

  const calcOpenHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en', messages: enMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculator, {
        productName: 'iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 26_500_000,
        maxPriceVnd: 29_990_000,
        userScore5: 4.8,
        expertScore10: 9.2,
        valueCriterionScore5: 4.5,
        offers: sampleOffers,
        initialEffectivePanelOpen: true,
      })
    )
  );
  assert.ok(calcOpenHtml.includes('data-testid="effective-price-panel"'));
  assert.ok(calcOpenHtml.includes('data-testid="effective-price-disclaimer"'));
  assert.ok(calcOpenHtml.includes('Official VN/A (29.990.000'));
  assert.ok(calcOpenHtml.includes('26.500.000'));

  // Verify vi and cs SSR rendering & localization
  const calcViHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'vi', messages: viMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculator, {
        productName: 'iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 26_500_000,
        maxPriceVnd: 29_990_000,
        userScore5: 4.8,
        expertScore10: 9.2,
        valueCriterionScore5: 4.5,
        offers: sampleOffers,
        initialEffectivePanelOpen: true,
      })
    )
  );
  assert.ok(calcViHtml.includes(viMessages.productDetail.effNote));
  assert.ok(calcViHtml.includes('26.500.000'));

  const calcCsHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'cs', messages: csMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ProductValueCalculator, {
        productName: 'iPhone 16 Pro Max 256GB',
        brand: 'Apple',
        categorySlug: 'smartphones',
        minPriceVnd: 26_500_000,
        maxPriceVnd: 29_990_000,
        userScore5: 4.8,
        expertScore10: 9.2,
        valueCriterionScore5: 4.5,
        offers: sampleOffers,
        initialEffectivePanelOpen: true,
      })
    )
  );
  assert.ok(calcCsHtml.includes(csMessages.productDetail.effNote));
  assert.ok(calcCsHtml.includes('26\u00a0500\u00a0000'));
}

function main(): void {
  console.log('🧪 Running effective-price calculator tests...');
  testVoucherMathAndBounds();
  testTradeInAndSelfResaleDelta();
  testInstallmentRealityCheck();
  testOfferSelectionIgnoresBaitAndUnavailable();
  testLocaleParityAndZeroDashes();
  testUiSsrIntegration();
  console.log('✅ All effective-price calculator tests passed!');
}

main();
