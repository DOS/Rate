'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { escapeCsvCell } from '@/lib/csv-safe';

const CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeMerchantAuditText(
  value: unknown,
  fallback = '',
  maxLen = 160
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeMerchantScore100(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

export function sanitizeMerchantCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

export function computeAuthenticReviewPercentage(
  authenticReviews: unknown,
  totalReviews: unknown
): number {
  const total = sanitizeMerchantCount(totalReviews);
  if (total <= 0) return 100;
  const authentic = Math.min(total, sanitizeMerchantCount(authenticReviews));
  return Math.min(100, Math.max(0, Math.round((authentic / total) * 100)));
}

export function sanitizeMerchantDownloadSlug(
  value: unknown,
  fallback = 'merchant'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

interface MerchantShareAuditButtonProps {
  readonly merchantName: string;
  readonly platform: string;
  readonly platformShopId: string;
  readonly isOfficial: boolean;
  readonly trustScore: number;
  readonly trustLevelLabel: string;
  readonly dosafeRiskScore: number;
  /** null when the store has no analysed review (DOS/Rate#1249). */
  readonly reviewSeedingRiskScore: number | null;
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

  const safeMerchantName = sanitizeMerchantAuditText(merchantName, 'Unknown');
  const safePlatform = sanitizeMerchantAuditText(platform, 'shopee', 32);
  const safeShopId = sanitizeMerchantAuditText(platformShopId, 'shop', 80);
  const safeTrustLevelLabel = sanitizeMerchantAuditText(
    trustLevelLabel,
    '-',
    80
  );
  const safeTrustScore = sanitizeMerchantScore100(trustScore);
  const safeDosafeRisk = sanitizeMerchantScore100(dosafeRiskScore);
  const safeSeedingRisk =
    reviewSeedingRiskScore == null
      ? null
      : sanitizeMerchantScore100(reviewSeedingRiskScore);
  const safeTotalReviews = sanitizeMerchantCount(totalReviews);
  const safeAuthenticReviews = Math.min(
    safeTotalReviews > 0
      ? safeTotalReviews
      : sanitizeMerchantCount(authenticReviews),
    sanitizeMerchantCount(authenticReviews)
  );
  const safeFlaggedReviews = sanitizeMerchantCount(flaggedReviews);
  const safeProductCount = sanitizeMerchantCount(productCount);
  const safeGenuineDeals = sanitizeMerchantCount(genuineDealCount);
  const safeFakeTraps = sanitizeMerchantCount(fakeSaleTrapCount);
  const downloadFileBase = `rate-merchant-${sanitizeMerchantDownloadSlug(safePlatform, 'platform')}-${sanitizeMerchantDownloadSlug(safeShopId, 'shop')}`;

  const handleCopyMerchantMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const authenticPct = computeAuthenticReviewPercentage(
        safeAuthenticReviews,
        safeTotalReviews
      );
      const lines = [
        t('mdHeading', {
          name: safeMerchantName,
          platform: safePlatform.toUpperCase(),
        }),
        t('mdCategoryLine', {
          type: isOfficial ? t('officialMallLabel') : t('standardShopLabel'),
          shopId: safeShopId,
        }),
        t('mdTrustLine', {
          score: safeTrustScore,
          label: safeTrustLevelLabel,
        }),
        t('mdDosafeLine', { score: safeDosafeRisk }),
        t('mdSeedingLine', {
          score:
            safeSeedingRisk == null
              ? t('reviewRiskNoData')
              : `${safeSeedingRisk}/100`,
        }),
        t('mdRadarLine', {
          genuine: safeGenuineDeals,
          traps: safeFakeTraps,
        }),
        t('mdAuthenticLine', {
          pct: authenticPct,
          auth: safeAuthenticReviews,
          total: safeTotalReviews,
          flagged: safeFlaggedReviews,
        }),
        t('mdProductsLine', { count: safeProductCount }),
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
      safeMerchantName,
      safePlatform.toUpperCase(),
      safeShopId,
      isOfficial ? 'Official Mall' : 'Standard',
      safeTrustScore,
      safeTrustLevelLabel,
      safeDosafeRisk,
      safeSeedingRisk,
      safeGenuineDeals,
      safeFakeTraps,
      safeAuthenticReviews,
      safeTotalReviews,
      safeFlaggedReviews,
      safeProductCount,
    ];
    const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${row.map(escapeCsvCell).join(',')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${downloadFileBase}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMerchantJson = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      source: 'Rate.vn seller risk summary',
      exportedAt: new Date().toISOString(),
      merchant: {
        name: safeMerchantName,
        platform: safePlatform,
        platformShopId: safeShopId,
        isOfficial: Boolean(isOfficial),
        trustScore: safeTrustScore,
        trustLevelLabel: safeTrustLevelLabel,
        dosafeRiskScore: safeDosafeRisk,
        reviewSeedingRiskScore: safeSeedingRisk,
        genuineDealCount: safeGenuineDeals,
        fakeSaleTrapCount: safeFakeTraps,
        authenticReviews: safeAuthenticReviews,
        totalReviews: safeTotalReviews,
        flaggedReviews: safeFlaggedReviews,
        productCount: safeProductCount,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${downloadFileBase}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        CSV
      </button>
      <button
        type="button"
        onClick={handleDownloadMerchantJson}
        data-testid="merchant-export-json-btn"
        className="btn btn-outline-light btn-sm rounded-pill fw-semibold px-3"
      >
        JSON
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
