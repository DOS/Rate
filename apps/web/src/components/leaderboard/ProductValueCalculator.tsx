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

type HorizonMonths = 12 | 24 | 36;

function estimateResaleRetentionRatio(
  brand: string,
  categorySlug: string,
  months: HorizonMonths
): number {
  const b = (brand || '').toLowerCase();
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

  const metrics = useMemo(() => {
    const safeMinPrice = Math.max(0, Number(minPriceVnd || 0));
    const safeMaxPrice = Math.max(safeMinPrice, Number(maxPriceVnd || 0));
    const rawCombined10 =
      userScore5 > 0 && expertScore10 != null
        ? userScore5 * 2 * 0.6 + expertScore10 * 0.4
        : userScore5 > 0
          ? userScore5 * 2
          : (expertScore10 ?? 0);
    const combined10 = rawCombined10 > 0 ? Number(rawCombined10.toFixed(2)) : 0;
    const costPerPoint10 =
      safeMinPrice > 0 && combined10 > 0
        ? Math.round(safeMinPrice / combined10)
        : 0;

    const retentionRatio = includeResale
      ? estimateResaleRetentionRatio(brand, categorySlug, months)
      : 0;
    const estimatedResaleVnd = Math.round(safeMinPrice * retentionRatio);
    const netOwnershipCostVnd = Math.max(0, safeMinPrice - estimatedResaleVnd);
    const totalDays = months * 30.4;
    const dailyCostVnd =
      safeMinPrice > 0 ? Math.round(netOwnershipCostVnd / totalDays) : 0;
    const monthlyCostVnd =
      safeMinPrice > 0 ? Math.round(netOwnershipCostVnd / months) : 0;
    const maxSpreadSavingsVnd = Math.max(0, safeMaxPrice - safeMinPrice);

    return {
      combined10,
      costPerPoint10,
      retentionPct: Math.round(retentionRatio * 100),
      estimatedResaleVnd,
      netOwnershipCostVnd,
      dailyCostVnd,
      monthlyCostVnd,
      maxSpreadSavingsVnd,
    };
  }, [
    brand,
    categorySlug,
    expertScore10,
    includeResale,
    maxPriceVnd,
    minPriceVnd,
    months,
    userScore5,
  ]);

  if (!minPriceVnd || minPriceVnd <= 0) {
    return null;
  }

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
      const resale = Math.round(minPriceVnd * ratio);
      const net = Math.max(0, minPriceVnd - resale);
      return [
        h,
        minPriceVnd,
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
    a.download = `rate-tco-${categorySlug}-${months}m.csv`;
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
      minPriceVnd,
      maxPriceVnd,
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
    a.download = `rate-tco-${categorySlug}-${months}m.json`;
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
              price: minPriceVnd.toLocaleString('vi-VN'),
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
            📥 CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadValueJson}
            data-testid="download-value-json-btn"
            className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3"
          >
            📦 JSON
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-3 col-6">
          <div className="rounded-3 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('valueCalcCardCostPerPointTitle')}
            </div>
            <div className="h5 fw-bold font-monospace text-dark rate-tabular mb-1">
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
            <div className="h5 fw-bold font-monospace text-danger rate-tabular mb-1">
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
            <div className="h5 fw-bold font-monospace text-success rate-tabular mb-1">
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
            <div className="h5 fw-bold font-monospace text-primary rate-tabular mb-1">
              {valueCriterionScore5 > 0
                ? `★ ${valueCriterionScore5.toFixed(1)}/5.0`
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
