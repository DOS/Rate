'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  type RadarSignal,
} from '@/lib/deal-radar';

interface ProductShareAuditButtonProps {
  readonly name: string;
  readonly brand: string;
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly offerCount: number;
  readonly keySpecLine?: string;
  readonly radarSignal?: RadarSignal;
}

export default function ProductShareAuditButton({
  name,
  brand,
  modelKey,
  userScore5,
  expertScore10,
  authenticReviews,
  minPriceVnd,
  offerCount,
  keySpecLine,
  radarSignal,
}: ProductShareAuditButtonProps) {
  const t = useTranslations('productDetail');
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const priceStr =
        minPriceVnd > 0
          ? t('shareAuditPriceSources', {
              price: minPriceVnd.toLocaleString('vi-VN'),
              count: offerCount,
            })
          : t('shareAuditUpdating');
      const userScoreStr =
        userScore5 > 0
          ? t('shareAuditMdUserScoreVal', {
              score: userScore5.toFixed(2),
              count: authenticReviews,
            })
          : t('shareAuditMdNoReviews');
      const expertScoreStr =
        expertScore10 != null
          ? `${expertScore10.toFixed(1)}/10`
          : t('shareAuditMdNoExpert');
      const lines = [
        t('shareAuditMdTitle', { name, brand }),
        t('shareAuditMdUserScore', { score: userScoreStr }),
        t('shareAuditMdExpertScore', { score: expertScoreStr }),
        ...(keySpecLine
          ? [t('shareAuditMdKeySpecs', { specs: keySpecLine })]
          : []),
        t('shareAuditMdMinPrice', { price: priceStr }),
        ...(radarSignal
          ? [t('shareAuditMdRadar', { signal: radarLabel(radarSignal) })]
          : []),
        t('shareAuditMdModelKey', { modelKey }),
        t('shareAuditMdUrl', { url: window.location.href }),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadProductCsv = () => {
    if (typeof window === 'undefined') return;
    const headers = [
      t('shareAuditCsvColDevice'),
      t('shareAuditCsvColBrand'),
      t('shareAuditCsvColModelKey'),
      t('shareAuditCsvColUserScore'),
      t('shareAuditCsvColExpertScore'),
      t('shareAuditCsvColAuthenticReviews'),
      t('shareAuditCsvColMinPrice'),
      t('shareAuditCsvColOfferCount'),
      t('shareAuditCsvColKeySpecs'),
      ...(radarSignal ? RADAR_CSV_HEADERS : []),
    ];
    const row = [
      name,
      brand,
      modelKey,
      userScore5 > 0 ? userScore5.toFixed(2) : '',
      expertScore10 != null ? expertScore10.toFixed(1) : '',
      authenticReviews,
      minPriceVnd,
      offerCount,
      keySpecLine || '',
      ...(radarSignal ? radarCsvCells(radarSignal) : []),
    ];
    const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${row.map(escapeCsvCell).join(',')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-product-${modelKey || 'audit'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadProductJson = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      source: 'Rate.vn Product Audit Summary',
      exportedAt: new Date().toISOString(),
      product: {
        name,
        brand,
        modelKey,
        userScore5: userScore5 > 0 ? userScore5 : null,
        expertScore10,
        authenticReviews,
        minPriceVnd,
        offerCount,
        keySpecLine: keySpecLine || null,
        dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-product-${modelKey || 'audit'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-2">
      <button
        type="button"
        onClick={handleCopyMarkdown}
        className="btn btn-sm btn-outline-danger rounded-pill fw-medium px-3"
        title={t('shareAuditCopyMdTitle')}
      >
        {copiedMd ? t('shareAuditCopiedMdBtn') : t('shareAuditCopyMdBtn')}
      </button>
      <button
        type="button"
        onClick={handleDownloadProductCsv}
        data-testid="product-export-csv-btn"
        className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3"
      >
        📥 CSV
      </button>
      <button
        type="button"
        onClick={handleDownloadProductJson}
        data-testid="product-export-json-btn"
        className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3"
      >
        📦 JSON
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
        title={t('shareAuditCopyLinkTitle')}
      >
        {copiedUrl ? t('shareAuditCopiedLinkBtn') : t('shareAuditCopyLinkBtn')}
      </button>
    </div>
  );
}
