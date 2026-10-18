'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { escapeCsvCell } from '@/lib/csv-safe';

interface MerchantShareAuditButtonProps {
  readonly merchantName: string;
  readonly platform: string;
  readonly platformShopId: string;
  readonly isOfficial: boolean;
  readonly trustScore: number;
  readonly trustLevelLabel: string;
  readonly dosafeRiskScore: number;
  readonly reviewSeedingRiskScore: number;
  readonly authenticReviews: number;
  readonly totalReviews: number;
  readonly flaggedReviews: number;
  readonly productCount: number;
  readonly genuineDealCount?: number;
  readonly fakeSaleTrapCount?: number;
}

export default function MerchantShareAuditButton({
  merchantName,
  platform,
  platformShopId,
  isOfficial,
  trustScore,
  trustLevelLabel,
  dosafeRiskScore,
  reviewSeedingRiskScore,
  authenticReviews,
  totalReviews,
  flaggedReviews,
  productCount,
  genuineDealCount = 0,
  fakeSaleTrapCount = 0,
}: MerchantShareAuditButtonProps) {
  const t = useTranslations('merchants');
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyMerchantMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const authenticPct =
        totalReviews > 0
          ? Math.round((authenticReviews / totalReviews) * 100)
          : 100;
      const lines = [
        t('mdHeading', {
          name: merchantName,
          platform: platform.toUpperCase(),
        }),
        t('mdCategoryLine', {
          type: isOfficial ? t('officialMallLabel') : t('standardShopLabel'),
          shopId: platformShopId,
        }),
        t('mdTrustLine', {
          score: trustScore,
          label: trustLevelLabel,
        }),
        t('mdDosafeLine', { score: dosafeRiskScore }),
        t('mdSeedingLine', { score: reviewSeedingRiskScore }),
        t('mdRadarLine', {
          genuine: genuineDealCount,
          traps: fakeSaleTrapCount,
        }),
        t('mdAuthenticLine', {
          pct: authenticPct,
          auth: authenticReviews,
          total: totalReviews,
          flagged: flaggedReviews,
        }),
        t('mdProductsLine', { count: productCount }),
        t('mdUrlLine', { url: window.location.href }),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyMerchantUrl = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadMerchantCsv = () => {
    if (typeof window === 'undefined') return;
    const headers = [
      'MerchantName',
      'Platform',
      'ShopID',
      'Tier',
      'TrustScore(/100)',
      'TrustLevel',
      'DOSafeRisk(/100)',
      'SeedingRisk(/100)',
      'GenuineDeals60D',
      'FakeSaleTraps60D',
      'AuthenticReviews',
      'TotalReviews',
      'FlaggedReviews',
      'TrackedProducts',
    ];
    const row = [
      merchantName,
      platform.toUpperCase(),
      platformShopId,
      isOfficial ? 'Official Mall' : 'Standard',
      trustScore,
      trustLevelLabel,
      dosafeRiskScore,
      reviewSeedingRiskScore,
      genuineDealCount,
      fakeSaleTrapCount,
      authenticReviews,
      totalReviews,
      flaggedReviews,
      productCount,
    ];
    const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${row.map(escapeCsvCell).join(',')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-merchant-${platform}-${platformShopId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMerchantJson = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      source: 'Rate.vn Merchant Dual-Risk Audit',
      exportedAt: new Date().toISOString(),
      merchant: {
        name: merchantName,
        platform,
        platformShopId,
        isOfficial,
        trustScore,
        trustLevelLabel,
        dosafeRiskScore,
        reviewSeedingRiskScore,
        genuineDealCount,
        fakeSaleTrapCount,
        authenticReviews,
        totalReviews,
        flaggedReviews,
        productCount,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-merchant-${platform}-${platformShopId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-flex justify-content-center mt-2 flex-wrap gap-2">
      <button
        type="button"
        onClick={handleCopyMerchantMarkdown}
        className="btn btn-danger btn-sm rounded-pill fw-semibold px-3"
        title={t('shareBtnTitle')}
      >
        {copiedMd ? t('shareCopiedMd') : t('shareCopyMd')}
      </button>
      <button
        type="button"
        onClick={handleDownloadMerchantCsv}
        data-testid="merchant-export-csv-btn"
        className="btn btn-outline-light btn-sm rounded-pill fw-semibold px-3"
      >
        📥 CSV
      </button>
      <button
        type="button"
        onClick={handleDownloadMerchantJson}
        data-testid="merchant-export-json-btn"
        className="btn btn-outline-light btn-sm rounded-pill fw-semibold px-3"
      >
        📦 JSON
      </button>
      <button
        type="button"
        onClick={handleCopyMerchantUrl}
        className="btn btn-outline-light btn-sm rounded-pill px-3"
        title={t('shareCopyUrlTitle')}
      >
        {copiedUrl ? t('shareCopiedUrl') : t('shareCopyUrl')}
      </button>
    </div>
  );
}
