'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';
import {
  computeEffectivePrice,
  INSTALLMENT_TERMS,
  MAX_INSTALLMENT_FEE_PERCENT,
  MAX_VOUCHER_PERCENT,
  sanitizeVndAmount,
  selectEffectivePriceBaseOffers,
  TRADE_IN_CONDITION_FACTORS,
  type EffectivePriceOfferCandidate,
  type InstallmentTerm,
  type TradeInConditionTier,
  type VoucherDiscountMode,
} from '@/lib/effective-price';
import {
  formatNumber,
  formatPercent,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';
import ContentText from '@/components/elementary/ContentText';
import StarRating from '@/components/elementary/StarRating';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ProductValueCalculatorProps {
  readonly productName: string;
  readonly brand: string;
  readonly categorySlug: string;
  readonly minPriceVnd: number;
  readonly maxPriceVnd: number;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly valueCriterionScore5: number;
  readonly radarSignal?: RadarSignal | null;
  readonly initialIncludeResale?: boolean;
  readonly offers?: readonly EffectivePriceOfferCandidate[];
  readonly initialEffectivePanelOpen?: boolean;
  readonly initialTradeInEnabled?: boolean;
}

export type HorizonMonths = 12 | 24 | 36;

export function sanitizeValueCriterionScore5(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number(Math.min(5, num).toFixed(1));
}

export function sanitizeValueCalcFileToken(value: unknown): string {
  if (typeof value !== 'string') return 'devices';
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return cleaned || 'devices';
}

export function estimateResaleRetentionRatio(
  brand: string,
  categorySlug: string,
  months: HorizonMonths
): number {
  const b = typeof brand === 'string' ? brand.toLowerCase() : '';
  const isApple = b.includes('apple');
  const isLaptop = categorySlug === 'laptops';
  const isEarbuds = categorySlug === 'earbuds';

  if (isEarbuds) {
    if (months === 12) return 0.35;
    if (months === 24) return 0.2;
    return 0.1;
  }

  const base12 = isApple ? (isLaptop ? 0.66 : 0.62) : isLaptop ? 0.56 : 0.52;
  if (months === 12) return base12;
  if (months === 24) return Number((base12 * 0.74).toFixed(2));
  return Number((base12 * 0.54).toFixed(2));
}

export interface ProductValueMetricsInput {
  readonly brand: string;
  readonly categorySlug: string;
  readonly minPriceVnd: number;
  readonly maxPriceVnd: number;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly months: HorizonMonths;
  readonly includeResale: boolean;
}

export function computeProductValueMetrics({
  brand,
  categorySlug,
  minPriceVnd,
  maxPriceVnd,
  userScore5,
  expertScore10,
  months,
  includeResale,
}: ProductValueMetricsInput) {
  const rawMin = Number(minPriceVnd);
  const safeMinPrice =
    Number.isFinite(rawMin) && rawMin > 0 && rawMin <= MAX_VALID_VND_PRICE
      ? Math.round(rawMin)
      : 0;
  const rawMax = Number(maxPriceVnd);
  const safeMaxPrice =
    Number.isFinite(rawMax) &&
    rawMax >= safeMinPrice &&
    rawMax <= MAX_VALID_VND_PRICE
      ? Math.round(rawMax)
      : safeMinPrice;
  const rawUser5 = Number(userScore5);
  const safeUser5 =
    Number.isFinite(rawUser5) && rawUser5 > 0 ? Math.min(5, rawUser5) : 0;
  const rawExpert = expertScore10 != null ? Number(expertScore10) : 0;
  const safeExpert10 =
    Number.isFinite(rawExpert) && rawExpert > 0
      ? Math.min(10, rawExpert <= 5 ? rawExpert * 2 : rawExpert)
      : null;

  const rawCombined10 =
    safeUser5 > 0 && safeExpert10 != null
      ? safeUser5 * 2 * 0.6 + safeExpert10 * 0.4
      : safeUser5 > 0
        ? safeUser5 * 2
        : (safeExpert10 ?? 0);
  const combined10 = rawCombined10 > 0 ? Number(rawCombined10.toFixed(2)) : 0;
  const costPerPoint10 =
    safeMinPrice > 0 && combined10 > 0
      ? Math.round(safeMinPrice / combined10)
      : 0;

  const safeMonths: HorizonMonths =
    months === 12 || months === 24 || months === 36 ? months : 24;
  const retentionRatio = includeResale
    ? estimateResaleRetentionRatio(brand, categorySlug, safeMonths)
    : 0;
  const estimatedResaleVnd = Math.round(safeMinPrice * retentionRatio);
  const netOwnershipCostVnd = Math.max(0, safeMinPrice - estimatedResaleVnd);
  const totalDays = safeMonths * 30.4;
  const dailyCostVnd =
    safeMinPrice > 0 ? Math.round(netOwnershipCostVnd / totalDays) : 0;
  const monthlyCostVnd =
    safeMinPrice > 0 ? Math.round(netOwnershipCostVnd / safeMonths) : 0;
  const maxSpreadSavingsVnd = Math.max(0, safeMaxPrice - safeMinPrice);

  return {
    safeMinPrice,
    safeMaxPrice,
    combined10,
    costPerPoint10,
    retentionPct: Math.round(retentionRatio * 100),
    estimatedResaleVnd,
    netOwnershipCostVnd,
    dailyCostVnd,
    monthlyCostVnd,
    maxSpreadSavingsVnd,
  };
}

export default function ProductValueCalculator({
  productName,
  brand,
  categorySlug,
  minPriceVnd,
  maxPriceVnd,
  userScore5,
  expertScore10,
  valueCriterionScore5,
  radarSignal,
  initialIncludeResale = true,
  offers,
  initialEffectivePanelOpen = false,
  initialTradeInEnabled = false,
}: ProductValueCalculatorProps) {
  const t = useTranslations('productDetail');
  const locale = useLocale();
  const baseId = useId();
  const effectivePanelId = `${baseId}-effective-panel`;
  const basePriceInputId = `${baseId}-base-price`;
  const voucherAmountInputId = `${baseId}-voucher-amount`;
  const voucherPercentInputId = `${baseId}-voucher-percent`;
  const voucherCapInputId = `${baseId}-voucher-cap`;
  const oldBenchmarkInputId = `${baseId}-old-benchmark`;
  const tradeInBonusInputId = `${baseId}-trade-in-bonus`;
  const installmentFeeInputId = `${baseId}-installment-fee`;

  const [months, setMonths] = useState<HorizonMonths>(24);
  const [includeResale, setIncludeResale] =
    useState<boolean>(initialIncludeResale);
  const [isEffectiveOpen, setIsEffectiveOpen] = useState<boolean>(
    initialEffectivePanelOpen
  );
  const [offerTier, setOfferTier] = useState<'lowest' | 'vna'>('lowest');
  const [customBasePriceInput, setCustomBasePriceInput] = useState<
    string | null
  >(null);
  const [discountMode, setDiscountMode] =
    useState<VoucherDiscountMode>('fixed');
  const [discountAmountInput, setDiscountAmountInput] = useState<string>('');
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('');
  const [discountCapInput, setDiscountCapInput] = useState<string>('');
  const [tradeInEnabled, setTradeInEnabled] = useState<boolean>(
    initialTradeInEnabled
  );
  const [oldBenchmarkInput, setOldBenchmarkInput] = useState<string>('');
  const [conditionTier, setConditionTier] =
    useState<TradeInConditionTier>('grade_1_mint');
  const [tradeInBonusInput, setTradeInBonusInput] = useState<string>('');
  const [installmentTerm, setInstallmentTerm] =
    useState<InstallmentTerm>('cash');
  const [installmentFeeInput, setInstallmentFeeInput] = useState<string>('0');

  const metrics = useMemo(
    () =>
      computeProductValueMetrics({
        brand,
        categorySlug,
        minPriceVnd,
        maxPriceVnd,
        userScore5,
        expertScore10,
        months,
        includeResale,
      }),
    [
      brand,
      categorySlug,
      expertScore10,
      includeResale,
      maxPriceVnd,
      minPriceVnd,
      months,
      userScore5,
    ]
  );

  const baseOffers = useMemo(
    () => selectEffectivePriceBaseOffers(offers, metrics.safeMinPrice),
    [offers, metrics.safeMinPrice]
  );
  const hasDistinctVnaOffer =
    baseOffers.bestOfficialVnaOffer !== null &&
    baseOffers.bestOfficialVnaOffer.offer.id !==
      baseOffers.bestPlausibleOffer?.offer.id;
  const activeOfferTier: 'lowest' | 'vna' =
    offerTier === 'vna' && baseOffers.bestOfficialVnaOffer ? 'vna' : 'lowest';
  const boundOffer =
    activeOfferTier === 'vna'
      ? baseOffers.bestOfficialVnaOffer
      : baseOffers.bestPlausibleOffer;
  const boundPriceVnd =
    activeOfferTier === 'vna' && baseOffers.bestOfficialVnaPriceVnd !== null
      ? baseOffers.bestOfficialVnaPriceVnd
      : baseOffers.bestPlausiblePriceVnd;
  const activeBasePriceVnd =
    customBasePriceInput !== null
      ? sanitizeVndAmount(customBasePriceInput)
      : boundPriceVnd;

  const effectiveResult = useMemo(
    () =>
      computeEffectivePrice({
        basePriceVnd: activeBasePriceVnd,
        discountMode,
        discountAmountVnd: Number(discountAmountInput),
        discountPercent: Number(discountPercentInput),
        discountMaxCapVnd: discountCapInput ? Number(discountCapInput) : null,
        tradeInEnabled,
        oldDeviceResaleBenchmarkVnd: Number(oldBenchmarkInput),
        tradeInConditionTier: conditionTier,
        tradeInBonusVnd: Number(tradeInBonusInput),
        installmentTerm,
        installmentFeePercent: Number(installmentFeeInput),
      }),
    [
      activeBasePriceVnd,
      conditionTier,
      discountAmountInput,
      discountCapInput,
      discountMode,
      discountPercentInput,
      installmentFeeInput,
      installmentTerm,
      oldBenchmarkInput,
      tradeInBonusInput,
      tradeInEnabled,
    ]
  );

  const boundOfferSourceMeta = boundOffer
    ? {
        merchantName: boundOffer.offer.merchant?.name?.trim() || null,
        platformLabel: boundOffer.offer.platform.toUpperCase(),
      }
    : radarSignal?.genuineDeal?.merchantName
      ? {
          merchantName: radarSignal.genuineDeal.merchantName.trim() || null,
          platformLabel: radarSignal.genuineDeal.platform.toUpperCase(),
        }
      : null;

  if (metrics.safeMinPrice <= 0) {
    return null;
  }

  const safeValueCriterionScore5 =
    sanitizeValueCriterionScore5(valueCriterionScore5);
  const safeCategoryFileToken = sanitizeValueCalcFileToken(categorySlug);

  const handleDownloadValueCsv = () => {
    if (typeof window === 'undefined') return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      t('valueCalcCsvColHorizon'),
      t('valueCalcCsvColMinPrice'),
      t('valueCalcCsvColRetentionPct'),
      t('valueCalcCsvColResaleVnd'),
      t('valueCalcCsvColNetCostVnd'),
      t('valueCalcCsvColMonthlyCostVnd'),
      t('valueCalcCsvColDailyCostVnd'),
      ...(radarSignal ? RADAR_CSV_HEADERS : []),
    ];
    const horizons: HorizonMonths[] = [12, 24, 36];
    const rows = horizons.map((h) => {
      const ratio = includeResale
        ? estimateResaleRetentionRatio(brand, categorySlug, h)
        : 0;
      const resale = Math.round(metrics.safeMinPrice * ratio);
      const net = Math.max(0, metrics.safeMinPrice - resale);
      return [
        h,
        metrics.safeMinPrice,
        Math.round(ratio * 100),
        resale,
        net,
        Math.round(net / h),
        Math.round(net / (h * 30.4)),
        ...(radarSignal ? radarCsvCells(radarSignal) : []),
      ];
    });
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-tco-${safeCategoryFileToken}-${months}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadValueJson = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      source: 'Rate.vn Value Efficiency & TCO Calculator',
      productName,
      brand,
      categorySlug,
      selectedHorizonMonths: months,
      includeResale,
      minPriceVnd: metrics.safeMinPrice,
      maxPriceVnd: metrics.safeMaxPrice,
      metrics,
      dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-tco-${safeCategoryFileToken}-${months}m.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mb-4 p-4 shadow-sm">
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
        <div>
          <span className="rate-eyebrow text-danger d-block mb-1">
            {t('valueCalcEyebrow')}
          </span>
          <h3 className="h5 fw-bold mb-1">
            {t('valueCalcHeading', { name: productName })}
          </h3>
          <p className="text-muted small mb-0">
            {t('valueCalcSubtitle', {
              price: formatNumber(metrics.safeMinPrice, locale),
              score:
                metrics.combined10 > 0
                  ? `${formatPlainNumber(metrics.combined10, locale)}/10`
                  : t('valueCalcNoScoreYet'),
            })}
          </p>
        </div>

        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="d-inline-flex flex-wrap gap-1"
            role="group"
            aria-label={t('valueCalcHorizonAria')}
          >
            {([12, 24, 36] as HorizonMonths[]).map((m) => (
              <Button
                key={m}
                type="button"
                variant={months === m ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={months === m}
                onClick={() => setMonths(m)}
              >
                {t('valueCalcMonthsBtn', { months: m })}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            variant={includeResale ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={includeResale}
            onClick={() => setIncludeResale((prev) => !prev)}
          >
            {includeResale
              ? t('valueCalcIncludeResaleOn', {
                  pct: formatPlainNumber(metrics.retentionPct, locale),
                })
              : t('valueCalcIncludeResaleOff')}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadValueCsv}
            data-testid="download-value-csv-btn"
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadValueJson}
            data-testid="download-value-json-btn"
          >
            JSON
          </Button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-3 col-6">
          <Card tone="elevated" className="h-100 p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardCostPerPointTitle')}
            </div>
            <div className="h5 fw-bold rate-tabular text-dark mb-1">
              {metrics.costPerPoint10 > 0
                ? formatPriceVnd(metrics.costPerPoint10, locale)
                : t('valueCalcNotAvailable')}
            </div>
            <div className="small text-secondary">
              {metrics.combined10 > 0
                ? t('valueCalcCardCostPerPointSub', {
                    score: formatPlainNumber(metrics.combined10, locale),
                  })
                : t('valueCalcCardCostPerPointEmpty')}
            </div>
          </Card>
        </div>

        <div className="col-md-3 col-6">
          <Card tone="elevated" className="h-100 p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardDailyCostTitle', { months })}
            </div>
            <div className="h5 fw-bold rate-tabular text-danger mb-1">
              {formatPriceVnd(metrics.dailyCostVnd, locale, {
                symbol: t('valueCalcPerDayUnit'),
              })}
            </div>
            <div className="small text-secondary rate-tabular">
              ~
              {formatPriceVnd(metrics.monthlyCostVnd, locale, {
                symbol: t('valueCalcPerMonthUnit'),
              })}
            </div>
          </Card>
        </div>

        <div className="col-md-3 col-6">
          <Card tone="elevated" className="h-100 p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardResaleTitle', { months })}
            </div>
            <div
              className={`h5 fw-bold rate-tabular mb-1 ${
                includeResale ? 'text-success' : 'text-muted'
              }`}
            >
              {includeResale
                ? formatPriceVnd(metrics.estimatedResaleVnd, locale)
                : t('valueCalcNotAvailable')}
            </div>
            <div className="small text-secondary">
              {includeResale
                ? t('valueCalcCardResaleSubOn', {
                    pct: formatPlainNumber(metrics.retentionPct, locale),
                    brand,
                  })
                : t('valueCalcCardResaleSubOff')}
            </div>
          </Card>
        </div>

        <div className="col-md-3 col-6">
          <Card tone="elevated" className="h-100 p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardValueScoreTitle')}
            </div>
            <div className="h5 mb-1">
              <StarRating
                value={safeValueCriterionScore5}
                emptyLabel={t('valueCalcNotAvailable')}
              />
            </div>
            <div className="small text-secondary rate-tabular">
              {metrics.maxSpreadSavingsVnd > 0
                ? t('valueCalcSpreadSavingsSub', {
                    amount: formatNumber(metrics.maxSpreadSavingsVnd, locale),
                  })
                : t('valueCalcUniformPriceSub')}
            </div>
          </Card>
        </div>
      </div>

      <div className="border-top mt-3 pt-3">
        <Button
          type="button"
          variant={isEffectiveOpen ? 'secondary' : 'outline'}
          size="sm"
          aria-expanded={isEffectiveOpen}
          aria-controls={isEffectiveOpen ? effectivePanelId : undefined}
          onClick={() => setIsEffectiveOpen((prev) => !prev)}
          data-testid="effective-price-toggle-btn"
        >
          {t('effToggle')}
        </Button>

        {isEffectiveOpen && (
          <Card
            tone="elevated"
            id={effectivePanelId}
            data-testid="effective-price-panel"
            className="mt-3 p-3"
          >
            <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
              <div>
                <h4 className="h6 fw-bold mb-1">{t('effToggle')}</h4>
                {boundOfferSourceMeta && (
                  <p className="text-muted small mb-0">
                    {boundOfferSourceMeta.merchantName ? (
                      <>
                        <ContentText
                          text={boundOfferSourceMeta.merchantName}
                          locale={locale}
                        />{' '}
                        ({boundOfferSourceMeta.platformLabel})
                      </>
                    ) : (
                      boundOfferSourceMeta.platformLabel
                    )}{' '}
                    - {formatPriceVnd(boundPriceVnd, locale)}
                  </p>
                )}
              </div>

              {hasDistinctVnaOffer && baseOffers.bestOfficialVnaPriceVnd && (
                <div
                  className="d-inline-flex flex-wrap gap-1"
                  role="group"
                  aria-label={t('effBase')}
                >
                  <Button
                    type="button"
                    variant={
                      activeOfferTier === 'lowest' ? 'secondary' : 'outline'
                    }
                    size="sm"
                    aria-pressed={activeOfferTier === 'lowest'}
                    onClick={() => {
                      setOfferTier('lowest');
                      setCustomBasePriceInput(null);
                    }}
                  >
                    {t('offersSpreadLowLabel')}{' '}
                    {formatPriceVnd(baseOffers.bestPlausiblePriceVnd, locale)}
                  </Button>
                  <Button
                    type="button"
                    variant={
                      activeOfferTier === 'vna' ? 'secondary' : 'outline'
                    }
                    size="sm"
                    aria-pressed={activeOfferTier === 'vna'}
                    onClick={() => {
                      setOfferTier('vna');
                      setCustomBasePriceInput(null);
                    }}
                  >
                    {t('oVna')} (
                    {formatPriceVnd(baseOffers.bestOfficialVnaPriceVnd, locale)}
                    )
                  </Button>
                </div>
              )}
            </div>

            <div className="row g-3">
              <div className="col-md-4">
                <label
                  htmlFor={basePriceInputId}
                  className="form-label small fw-semibold mb-1"
                >
                  {t('effBase')}
                </label>
                <input
                  id={basePriceInputId}
                  type="number"
                  min={0}
                  max={MAX_VALID_VND_PRICE}
                  step={10000}
                  value={customBasePriceInput ?? String(boundPriceVnd)}
                  onChange={(e) => setCustomBasePriceInput(e.target.value)}
                  className="form-control form-control-sm rate-tabular"
                />
              </div>

              <div className="col-md-8">
                <div
                  className="d-flex align-items-center flex-wrap gap-2 mb-2"
                  role="group"
                  aria-label={t('effDisc')}
                >
                  <Button
                    type="button"
                    variant={discountMode === 'fixed' ? 'secondary' : 'outline'}
                    size="sm"
                    aria-pressed={discountMode === 'fixed'}
                    onClick={() => setDiscountMode('fixed')}
                  >
                    VND
                  </Button>
                  <Button
                    type="button"
                    variant={
                      discountMode === 'percent' ? 'secondary' : 'outline'
                    }
                    size="sm"
                    aria-pressed={discountMode === 'percent'}
                    onClick={() => setDiscountMode('percent')}
                  >
                    %
                  </Button>
                </div>

                {discountMode === 'fixed' ? (
                  <div>
                    <label
                      htmlFor={voucherAmountInputId}
                      className="form-label small fw-semibold mb-1"
                    >
                      {t('effDisc')} (VND)
                    </label>
                    <input
                      id={voucherAmountInputId}
                      type="number"
                      min={0}
                      max={MAX_VALID_VND_PRICE}
                      step={50000}
                      value={discountAmountInput}
                      placeholder="0"
                      onChange={(e) => setDiscountAmountInput(e.target.value)}
                      className="form-control form-control-sm rate-tabular"
                    />
                  </div>
                ) : (
                  <div className="row g-2">
                    <div className="col-sm-6">
                      <label
                        htmlFor={voucherPercentInputId}
                        className="form-label small fw-semibold mb-1"
                      >
                        {t('effDisc')} (0-
                        {formatPercent(MAX_VOUCHER_PERCENT, locale)})
                      </label>
                      <input
                        id={voucherPercentInputId}
                        type="number"
                        min={0}
                        max={MAX_VOUCHER_PERCENT}
                        step={1}
                        value={discountPercentInput}
                        placeholder="0"
                        onChange={(e) =>
                          setDiscountPercentInput(e.target.value)
                        }
                        className="form-control form-control-sm rate-tabular"
                      />
                    </div>
                    <div className="col-sm-6">
                      <label
                        htmlFor={voucherCapInputId}
                        className="form-label small fw-semibold mb-1"
                      >
                        {t('effCap')}
                      </label>
                      <input
                        id={voucherCapInputId}
                        type="number"
                        min={0}
                        max={MAX_VALID_VND_PRICE}
                        step={50000}
                        value={discountCapInput}
                        placeholder="0"
                        onChange={(e) => setDiscountCapInput(e.target.value)}
                        className="form-control form-control-sm rate-tabular"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="col-12">
                <div className="border-top pt-3">
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                    <Button
                      type="button"
                      variant={tradeInEnabled ? 'secondary' : 'outline'}
                      size="sm"
                      aria-pressed={tradeInEnabled}
                      onClick={() => setTradeInEnabled((prev) => !prev)}
                      data-testid="effective-trade-in-toggle-btn"
                    >
                      {t('effTrade')}
                    </Button>

                    <div
                      className="d-flex align-items-center flex-wrap gap-1"
                      role="group"
                      aria-label={t('effTerm')}
                    >
                      {INSTALLMENT_TERMS.map((term) => (
                        <Button
                          key={String(term)}
                          type="button"
                          variant={
                            installmentTerm === term ? 'primary' : 'outline'
                          }
                          size="sm"
                          aria-pressed={installmentTerm === term}
                          onClick={() => setInstallmentTerm(term)}
                        >
                          {term === 'cash'
                            ? t('effCash')
                            : t('valueCalcMonthsBtn', {
                                months: term,
                              })}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {tradeInEnabled && (
                    <div className="row g-2 mb-3">
                      <div className="col-md-4">
                        <label
                          htmlFor={oldBenchmarkInputId}
                          className="form-label small fw-semibold mb-1"
                        >
                          {t('effOld')}
                        </label>
                        <input
                          id={oldBenchmarkInputId}
                          type="number"
                          min={0}
                          max={MAX_VALID_VND_PRICE}
                          step={100000}
                          value={oldBenchmarkInput}
                          placeholder="0"
                          onChange={(e) => setOldBenchmarkInput(e.target.value)}
                          className="form-control form-control-sm rate-tabular"
                        />
                      </div>
                      <div className="col-md-4">
                        <label
                          htmlFor={tradeInBonusInputId}
                          className="form-label small fw-semibold mb-1"
                        >
                          {t('effBonus')}
                        </label>
                        <input
                          id={tradeInBonusInputId}
                          type="number"
                          min={0}
                          max={MAX_VALID_VND_PRICE}
                          step={100000}
                          value={tradeInBonusInput}
                          placeholder="0"
                          onChange={(e) => setTradeInBonusInput(e.target.value)}
                          className="form-control form-control-sm rate-tabular"
                        />
                      </div>
                      <div className="col-md-4 d-flex flex-column justify-content-end">
                        <div
                          className="d-flex flex-wrap gap-1"
                          role="group"
                          aria-label={t('effTrade')}
                        >
                          {(
                            [
                              'grade_1_mint',
                              'grade_2_light_wear',
                              'grade_3_battery_under_85',
                            ] as const
                          ).map((tier, idx) => {
                            const pct = Math.round(
                              TRADE_IN_CONDITION_FACTORS[tier] * 100
                            );
                            return (
                              <Button
                                key={tier}
                                type="button"
                                variant={
                                  conditionTier === tier
                                    ? 'secondary'
                                    : 'outline'
                                }
                                size="sm"
                                aria-pressed={conditionTier === tier}
                                onClick={() => setConditionTier(tier)}
                              >
                                {t('effC', { n: idx + 1 })} (
                                {formatPercent(pct, locale)})
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {installmentTerm !== 'cash' && (
                    <div className="row g-2 mb-3">
                      <div className="col-md-4">
                        <label
                          htmlFor={installmentFeeInputId}
                          className="form-label small fw-semibold mb-1"
                        >
                          {t('effFee')} (0-
                          {formatPercent(MAX_INSTALLMENT_FEE_PERCENT, locale)})
                        </label>
                        <input
                          id={installmentFeeInputId}
                          type="number"
                          min={0}
                          max={MAX_INSTALLMENT_FEE_PERCENT}
                          step={0.5}
                          value={installmentFeeInput}
                          onChange={(e) =>
                            setInstallmentFeeInput(e.target.value)
                          }
                          className="form-control form-control-sm rate-tabular"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="row g-3 mt-1">
              <div className="col-md-4">
                <Card className="h-100 p-3">
                  <div className="text-muted small mb-1">{t('effNet')}</div>
                  <div
                    className="h5 fw-bold rate-tabular text-dark mb-1"
                    data-testid="effective-net-payable"
                  >
                    {formatPriceVnd(effectiveResult.netCashPayableVnd, locale)}
                  </div>
                  {effectiveResult.voucherSavingsVnd > 0 && (
                    <div className="small text-secondary rate-tabular">
                      {t('effDisc')}: -
                      {formatPriceVnd(
                        effectiveResult.voucherSavingsVnd,
                        locale
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {tradeInEnabled && effectiveResult.oldDeviceBenchmarkVnd > 0 && (
                <div className="col-md-4">
                  <Card className="h-100 p-3">
                    <div className="text-muted small mb-1">
                      {t('effStore')} / {t('effSelf')}
                    </div>
                    <div className="small text-dark rate-tabular mb-1">
                      {t('effStore')}:{' '}
                      {formatPriceVnd(
                        effectiveResult.storeTradeInCreditVnd,
                        locale
                      )}{' '}
                      / {t('effSelf')}:{' '}
                      {formatPriceVnd(
                        effectiveResult.oldDeviceBenchmarkVnd,
                        locale
                      )}
                    </div>
                    <div
                      className={`small fw-semibold rate-tabular ${
                        effectiveResult.selfResaleComparisonDeltaVnd > 0
                          ? 'text-success'
                          : effectiveResult.selfResaleComparisonDeltaVnd < 0
                            ? 'text-warning-emphasis'
                            : 'text-muted'
                      }`}
                    >
                      {effectiveResult.selfResaleComparisonDeltaVnd === 0
                        ? `${t('effStore')} = ${t('effSelf')}`
                        : effectiveResult.netCashPayableVnd === 0 &&
                            effectiveResult.selfResaleNetPayableVnd === 0
                          ? `${
                              effectiveResult.selfResaleComparisonDeltaVnd > 0
                                ? t('effStore')
                                : t('effSelf')
                            }: +${formatPriceVnd(
                              Math.abs(
                                effectiveResult.selfResaleComparisonDeltaVnd
                              ),
                              locale
                            )}`
                          : effectiveResult.selfResaleComparisonDeltaVnd > 0
                            ? `${t('effStore')}: ${t('cheaperByBadge', {
                                amount: formatNumber(
                                  effectiveResult.selfResaleComparisonDeltaVnd,
                                  locale
                                ),
                              })}`
                            : `${t('effSelf')}: ${t('cheaperByBadge', {
                                amount: formatNumber(
                                  Math.abs(
                                    effectiveResult.selfResaleComparisonDeltaVnd
                                  ),
                                  locale
                                ),
                              })}`}
                    </div>
                  </Card>
                </div>
              )}

              <div
                className={
                  tradeInEnabled && effectiveResult.oldDeviceBenchmarkVnd > 0
                    ? 'col-md-4'
                    : 'col-md-8'
                }
              >
                <Card className="h-100 p-3">
                  <div className="text-muted small mb-1">
                    {installmentTerm === 'cash'
                      ? t('effCash')
                      : `${t('effTerm')} (${t('valueCalcMonthsBtn', {
                          months: effectiveResult.installmentMonths,
                        })})`}
                  </div>
                  {installmentTerm === 'cash' ? (
                    <div className="h5 fw-bold rate-tabular text-dark mb-0">
                      {formatPriceVnd(
                        effectiveResult.netCashPayableVnd,
                        locale
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="h5 fw-bold rate-tabular text-danger mb-1">
                        {formatPriceVnd(
                          effectiveResult.monthlyPaymentVnd,
                          locale,
                          { symbol: t('valueCalcPerMonthUnit') }
                        )}
                      </div>
                      <div className="small text-secondary rate-tabular">
                        {t('effFee')}:{' '}
                        {formatPriceVnd(
                          effectiveResult.conversionFeeVnd,
                          locale
                        )}{' '}
                        / {t('effTotal')}:{' '}
                        {formatPriceVnd(effectiveResult.totalPaidVnd, locale)}
                        {effectiveResult.totalDiffVsCashVnd > 0
                          ? ` (+${formatPriceVnd(
                              effectiveResult.totalDiffVsCashVnd,
                              locale
                            )})`
                          : ''}
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>

            <p
              className="text-muted small mb-0 mt-3"
              data-testid="effective-price-disclaimer"
            >
              {t('effNote')}
            </p>
          </Card>
        )}
      </div>
    </Card>
  );
}
