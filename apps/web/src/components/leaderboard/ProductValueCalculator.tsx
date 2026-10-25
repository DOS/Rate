'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';

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
}

export type HorizonMonths = 12 | 24 | 36;

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
}: ProductValueCalculatorProps) {
  const t = useTranslations('productDetail');
  const [months, setMonths] = useState<HorizonMonths>(24);
  const [includeResale, setIncludeResale] = useState<boolean>(true);

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

  if (metrics.safeMinPrice <= 0) {
    return null;
  }

  const rawValueScore = Number(valueCriterionScore5);
  const safeValueCriterionScore5 =
    Number.isFinite(rawValueScore) && rawValueScore > 0
      ? Math.min(5, rawValueScore)
      : 0;
  const safeCategoryFileToken =
    (typeof categorySlug === 'string' ? categorySlug : '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'devices';

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
    <div className="rate-card mb-4 p-4">
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
              price: metrics.safeMinPrice.toLocaleString('vi-VN'),
              score:
                metrics.combined10 > 0
                  ? `${metrics.combined10}/10`
                  : t('valueCalcNoScoreYet'),
            })}
          </p>
        </div>

        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="btn-group btn-group-sm"
            role="group"
            aria-label={t('valueCalcHorizonAria')}
          >
            {([12, 24, 36] as HorizonMonths[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={`btn rounded-pill fw-semibold me-1 px-3 ${
                  months === m ? 'btn-danger' : 'btn-outline-secondary'
                }`}
              >
                {t('valueCalcMonthsBtn', { months: m })}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIncludeResale((prev) => !prev)}
            className={`btn btn-sm rounded-pill fw-medium px-3 ${
              includeResale ? 'btn-dark' : 'btn-outline-dark'
            }`}
          >
            {includeResale
              ? t('valueCalcIncludeResaleOn', { pct: metrics.retentionPct })
              : t('valueCalcIncludeResaleOff')}
          </button>

          <button
            type="button"
            onClick={handleDownloadValueCsv}
            data-testid="download-value-csv-btn"
            className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadValueJson}
            data-testid="download-value-json-btn"
            className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3"
          >
            JSON
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-3 col-6">
          <div className="rounded-3 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardCostPerPointTitle')}
            </div>
            <div className="h5 fw-bold rate-tabular text-dark mb-1">
              {metrics.costPerPoint10 > 0
                ? `${metrics.costPerPoint10.toLocaleString('vi-VN')} ₫`
                : t('valueCalcNotAvailable')}
            </div>
            <div className="small text-secondary">
              {metrics.combined10 > 0
                ? t('valueCalcCardCostPerPointSub', {
                    score: metrics.combined10,
                  })
                : t('valueCalcCardCostPerPointEmpty')}
            </div>
          </div>
        </div>

        <div className="col-md-3 col-6">
          <div className="rounded-3 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardDailyCostTitle', { months })}
            </div>
            <div className="h5 fw-bold rate-tabular text-danger mb-1">
              {metrics.dailyCostVnd.toLocaleString('vi-VN')}{' '}
              {t('valueCalcPerDayUnit')}
            </div>
            <div className="small text-secondary rate-tabular">
              ~{metrics.monthlyCostVnd.toLocaleString('vi-VN')}{' '}
              {t('valueCalcPerMonthUnit')}
            </div>
          </div>
        </div>

        <div className="col-md-3 col-6">
          <div className="rounded-3 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardResaleTitle', { months })}
            </div>
            <div className="h5 fw-bold rate-tabular text-success mb-1">
              {includeResale
                ? `${metrics.estimatedResaleVnd.toLocaleString('vi-VN')} ₫`
                : '0 ₫'}
            </div>
            <div className="small text-secondary">
              {includeResale
                ? t('valueCalcCardResaleSubOn', {
                    pct: metrics.retentionPct,
                    brand,
                  })
                : t('valueCalcCardResaleSubOff')}
            </div>
          </div>
        </div>

        <div className="col-md-3 col-6">
          <div className="rounded-3 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardValueScoreTitle')}
            </div>
            <div className="h5 fw-bold rate-tabular text-primary mb-1">
              {safeValueCriterionScore5 > 0
                ? `★ ${safeValueCriterionScore5.toFixed(1)}/5.0`
                : t('valueCalcNotAvailable')}
            </div>
            <div className="small text-secondary rate-tabular">
              {metrics.maxSpreadSavingsVnd > 0
                ? t('valueCalcSpreadSavingsSub', {
                    amount: metrics.maxSpreadSavingsVnd.toLocaleString('vi-VN'),
                  })
                : t('valueCalcUniformPriceSub')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
