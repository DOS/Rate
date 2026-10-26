'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  type RadarSignal,
} from '@/lib/deal-radar';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';

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

export function sanitizeShareAuditText(
  value: unknown,
  maxLength = 200
): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeShareAuditFields(input: {
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly offerCount: number;
}) {
  const rawUser = Number(input.userScore5);
  const safeUserScore5 =
    Number.isFinite(rawUser) && rawUser > 0 ? Math.min(5, rawUser) : 0;
  const rawExpert =
    input.expertScore10 != null ? Number(input.expertScore10) : 0;
  const safeExpertScore10 =
    Number.isFinite(rawExpert) && rawExpert > 0
      ? Math.min(10, rawExpert <= 5 ? rawExpert * 2 : rawExpert)
      : null;
  const rawReviews = Number(input.authenticReviews);
  const safeAuthenticReviews =
    Number.isFinite(rawReviews) && rawReviews > 0
      ? Math.min(10_000_000, Math.floor(rawReviews))
      : 0;
  const rawPrice = Number(input.minPriceVnd);
  const safeMinPriceVnd =
    Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= MAX_VALID_VND_PRICE
      ? Math.round(rawPrice)
      : 0;
  const rawOffers = Number(input.offerCount);
  const safeOfferCount =
    Number.isFinite(rawOffers) && rawOffers > 0
      ? Math.min(10_000_000, Math.floor(rawOffers))
      : 0;
  const safeModelKeyToken =
    (typeof input.modelKey === 'string' ? input.modelKey : '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'audit';

  return {
    safeUserScore5,
    safeExpertScore10,
    safeAuthenticReviews,
    safeMinPriceVnd,
    safeOfferCount,
    safeModelKeyToken,
  };
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

  const {
    safeUserScore5,
    safeExpertScore10,
    safeAuthenticReviews,
    safeMinPriceVnd,
    safeOfferCount,
    safeModelKeyToken,
  } = normalizeShareAuditFields({
    modelKey,
    userScore5,
    expertScore10,
    authenticReviews,
    minPriceVnd,
    offerCount,
  });

  const safeName = sanitizeShareAuditText(name, 160);
  const safeBrand = sanitizeShareAuditText(brand, 80);
  const safeModelKey = sanitizeShareAuditText(modelKey, 120);
  const safeKeySpecLine = keySpecLine
    ? sanitizeShareAuditText(keySpecLine, 240)
    : '';

  const handleCopyMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const priceStr =
        safeMinPriceVnd > 0
          ? t('shareAuditPriceSources', {
              price: safeMinPriceVnd.toLocaleString('vi-VN'),
              count: safeOfferCount,
            })
          : t('shareAuditUpdating');
      const userScoreStr =
        safeUserScore5 > 0
          ? t('shareAuditMdUserScoreVal', {
              score: safeUserScore5.toFixed(2),
              count: safeAuthenticReviews,
            })
          : t('shareAuditMdNoReviews');
      const expertScoreStr =
        safeExpertScore10 != null
          ? `${safeExpertScore10.toFixed(1)}/10`
          : t('shareAuditMdNoExpert');
      const lines = [
        t('shareAuditMdTitle', { name: safeName, brand: safeBrand }),
        t('shareAuditMdUserScore', { score: userScoreStr }),
        t('shareAuditMdExpertScore', { score: expertScoreStr }),
        ...(safeKeySpecLine
          ? [t('shareAuditMdKeySpecs', { specs: safeKeySpecLine })]
          : []),
        t('shareAuditMdMinPrice', { price: priceStr }),
        ...(radarSignal
          ? [t('shareAuditMdRadar', { signal: radarLabel(radarSignal) })]
          : []),
        t('shareAuditMdModelKey', { modelKey: safeModelKey }),
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
      safeName,
      safeBrand,
      safeModelKey,
      safeUserScore5 > 0 ? safeUserScore5.toFixed(2) : '',
      safeExpertScore10 != null ? safeExpertScore10.toFixed(1) : '',
      safeAuthenticReviews,
      safeMinPriceVnd > 0 ? safeMinPriceVnd : '',
      safeOfferCount,
      safeKeySpecLine,
      ...(radarSignal ? radarCsvCells(radarSignal) : []),
    ];
    const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${row.map(escapeCsvCell).join(',')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-product-${safeModelKeyToken}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadProductJson = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      source: 'Rate.vn product summary',
      exportedAt: new Date().toISOString(),
      product: {
        name: safeName,
        brand: safeBrand,
        modelKey: safeModelKey,
        userScore5: safeUserScore5 > 0 ? safeUserScore5 : null,
        expertScore10: safeExpertScore10,
        authenticReviews: safeAuthenticReviews,
        minPriceVnd: safeMinPriceVnd,
        offerCount: safeOfferCount,
        keySpecLine: safeKeySpecLine || null,
        dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-product-${safeModelKeyToken}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-2">
      <ExportMenu label={t('exportMenu')}>
        {(close) => (
          <>
            <button
              type="button"
              onClick={handleCopyMarkdown}
              title={t('shareAuditCopyMdTitle')}
            >
              {copiedMd ? t('shareAuditCopiedMdBtn') : t('shareAuditCopyMdBtn')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadProductCsv();
                close();
              }}
              data-testid="product-export-csv-btn"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadProductJson();
                close();
              }}
              data-testid="product-export-json-btn"
            >
              JSON
            </button>
          </>
        )}
      </ExportMenu>
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
