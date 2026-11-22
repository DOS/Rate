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

export function sanitizeNullableMerchantScore100(
  value: unknown
): number | null {
  if (
    value == null ||
    (typeof value !== 'number' && typeof value !== 'string')
  ) {
    return null;
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    const clamped = Math.min(100, Math.max(0, Math.round(parsed)));
    return clamped === 0 ? 0 : clamped;
  }
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return clamped === 0 ? 0 : clamped;
}

const DEFAULT_MERCHANT_AUDIT_URL = 'https://rate.vn/merchants';

export function sanitizeMerchantAuditProfileUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || /[\s\p{Cc}\\]/u.test(rawUrl)) {
    return DEFAULT_MERCHANT_AUDIT_URL;
  }
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > 2048 ||
    trimmed.startsWith('//') ||
    /(?:^|\/)\.\.(?:\/|$|[?#])/i.test(trimmed) ||
    /%2e%2e|%5c/i.test(trimmed)
  ) {
    return DEFAULT_MERCHANT_AUDIT_URL;
  }
  try {
    const isAbsolute = /^https?:\/\//i.test(trimmed);
    if (!isAbsolute && !trimmed.startsWith('/')) {
      return DEFAULT_MERCHANT_AUDIT_URL;
    }
    const parsed = isAbsolute
      ? new URL(trimmed)
      : new URL(trimmed, 'https://rate.vn');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return DEFAULT_MERCHANT_AUDIT_URL;
    }
    if (parsed.username || parsed.password || !parsed.hostname) {
      return DEFAULT_MERCHANT_AUDIT_URL;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return DEFAULT_MERCHANT_AUDIT_URL;
  }
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

export interface MerchantShareAuditButtonProps {
  readonly merchantName: string;
  readonly platform: string;
  readonly platformShopId: string;
  readonly isOfficial: boolean;
  /** Null for a store with no data to score (DOS/Rate#1484). */
  readonly trustScore: number | null;
  readonly trustLevelLabel: string;
  /** Null when the seller has no DOSafe score (DOS/Rate#1479). */
  readonly dosafeRiskScore: number | null;
  /** Null when the seller has no measured review seeding risk (DOS/Rate#1821). */
  readonly reviewSeedingRiskScore: number | null;
  readonly authenticReviews: number;
  readonly totalReviews: number;
  readonly flaggedReviews: number;
  readonly productCount: number;
  readonly genuineDealCount?: number;
  readonly fakeSaleTrapCount?: number;
}

type SanitizedMerchantAuditFields = {
  safeMerchantName: string;
  safePlatform: string;
  safeShopId: string;
  isOfficial: boolean;
  safeTrustScore: number | null;
  safeTrustLevelLabel: string;
  safeDosafeRisk: number | null;
  safeSeedingRisk: number | null;
  safeTotalReviews: number;
  safeAuthenticReviews: number;
  safeFlaggedReviews: number;
  safeProductCount: number;
  safeGenuineDeals: number;
  safeFakeTraps: number;
};

function sanitizeMerchantAuditFields(
  props: MerchantShareAuditButtonProps
): SanitizedMerchantAuditFields {
  const safeMerchantName = sanitizeMerchantAuditText(
    props.merchantName,
    'Unknown'
  );
  const safePlatform = sanitizeMerchantAuditText(props.platform, 'shopee', 32);
  const safeShopId = sanitizeMerchantAuditText(
    props.platformShopId,
    'shop',
    80
  );
  const safeTrustLevelLabel = sanitizeMerchantAuditText(
    props.trustLevelLabel,
    '-',
    80
  );
  const safeTrustScore = sanitizeNullableMerchantScore100(props.trustScore);
  const safeDosafeRisk = sanitizeNullableMerchantScore100(
    props.dosafeRiskScore
  );
  const safeSeedingRisk = sanitizeNullableMerchantScore100(
    props.reviewSeedingRiskScore
  );
  const safeTotalReviews = sanitizeMerchantCount(props.totalReviews);
  const safeAuthenticReviews = Math.min(
    safeTotalReviews > 0
      ? safeTotalReviews
      : sanitizeMerchantCount(props.authenticReviews),
    sanitizeMerchantCount(props.authenticReviews)
  );
  const safeFlaggedReviews = sanitizeMerchantCount(props.flaggedReviews);
  const safeProductCount = sanitizeMerchantCount(props.productCount);
  const safeGenuineDeals = sanitizeMerchantCount(props.genuineDealCount ?? 0);
  const safeFakeTraps = sanitizeMerchantCount(props.fakeSaleTrapCount ?? 0);
  return {
    safeMerchantName,
    safePlatform,
    safeShopId,
    isOfficial: Boolean(props.isOfficial),
    safeTrustScore,
    safeTrustLevelLabel,
    safeDosafeRisk,
    safeSeedingRisk,
    safeTotalReviews,
    safeAuthenticReviews,
    safeFlaggedReviews,
    safeProductCount,
    safeGenuineDeals,
    safeFakeTraps,
  };
}

export type MerchantAuditTranslateFn = (
  key:
    | 'mdHeading'
    | 'mdCategoryLine'
    | 'officialMallLabel'
    | 'standardShopLabel'
    | 'mdTrustLineNoData'
    | 'mdTrustLine'
    | 'mdDosafeLineNoData'
    | 'mdDosafeLine'
    | 'mdSeedingLine'
    | 'mdSeedingLineNoReviews'
    | 'riskReviewLabel'
    | 'reviewRiskNoDataShort'
    | 'mdRadarLine'
    | 'mdAuthenticLine'
    | 'mdAuthenticLineNoReviews'
    | 'mdProductsLine'
    | 'mdUrlLine',
  values?: Record<string, string | number>
) => string;

export function buildMerchantAuditMarkdown(
  props: MerchantShareAuditButtonProps,
  t: MerchantAuditTranslateFn,
  profileUrl: string
): string {
  const f = sanitizeMerchantAuditFields(props);
  const safeProfileUrl = sanitizeMerchantAuditProfileUrl(profileUrl);
  const authenticPct = computeAuthenticReviewPercentage(
    f.safeAuthenticReviews,
    f.safeTotalReviews
  );
  const lines = [
    t('mdHeading', {
      name: f.safeMerchantName,
      platform: f.safePlatform.toUpperCase(),
    }),
    t('mdCategoryLine', {
      type: f.isOfficial ? t('officialMallLabel') : t('standardShopLabel'),
      shopId: f.safeShopId,
    }),
    f.safeTrustScore == null
      ? t('mdTrustLineNoData')
      : t('mdTrustLine', {
          score: f.safeTrustScore,
          label: f.safeTrustLevelLabel,
        }),
    f.safeDosafeRisk == null
      ? t('mdDosafeLineNoData')
      : t('mdDosafeLine', { score: f.safeDosafeRisk }),
    // Never coerce null/unknown review seeding risk to 0/100 (DOS/Rate#1249, #1821).
    f.safeSeedingRisk == null
      ? f.safeTotalReviews > 0
        ? `- **${t('riskReviewLabel')}:** ${t('reviewRiskNoDataShort').toLowerCase()}`
        : t('mdSeedingLineNoReviews')
      : t('mdSeedingLine', { score: f.safeSeedingRisk }),
    t('mdRadarLine', {
      genuine: f.safeGenuineDeals,
      traps: f.safeFakeTraps,
    }),
    f.safeTotalReviews > 0
      ? t('mdAuthenticLine', {
          pct: authenticPct,
          auth: f.safeAuthenticReviews,
          total: f.safeTotalReviews,
          flagged: f.safeFlaggedReviews,
        })
      : t('mdAuthenticLineNoReviews'),
    t('mdProductsLine', { count: f.safeProductCount }),
    t('mdUrlLine', { url: safeProfileUrl }),
  ];
  return lines.join('\n');
}

export function buildMerchantAuditCsv(
  props: MerchantShareAuditButtonProps
): string {
  const f = sanitizeMerchantAuditFields(props);
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
    f.safeMerchantName,
    f.safePlatform.toUpperCase(),
    f.safeShopId,
    f.isOfficial ? 'Official Mall' : 'Standard',
    // Empty for a store with no data (DOS/Rate#1484).
    f.safeTrustScore ?? '',
    f.safeTrustLevelLabel,
    // Empty without a DOSafe score (DOS/Rate#1479).
    f.safeDosafeRisk ?? '',
    // Empty without measured review seeding risk (DOS/Rate#1258, #1821).
    f.safeSeedingRisk ?? '',
    f.safeGenuineDeals,
    f.safeFakeTraps,
    f.safeAuthenticReviews,
    f.safeTotalReviews,
    f.safeFlaggedReviews,
    f.safeProductCount,
  ];
  return `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${row.map(escapeCsvCell).join(',')}`;
}

export function buildMerchantAuditJson(
  props: MerchantShareAuditButtonProps,
  exportedAt = new Date().toISOString()
) {
  const f = sanitizeMerchantAuditFields(props);
  return {
    source: 'Rate.vn seller risk summary',
    exportedAt,
    merchant: {
      name: f.safeMerchantName,
      platform: f.safePlatform,
      platformShopId: f.safeShopId,
      isOfficial: f.isOfficial,
      trustScore: f.safeTrustScore,
      trustLevelLabel: f.safeTrustLevelLabel,
      dosafeRiskScore: f.safeDosafeRisk,
      reviewSeedingRiskScore: f.safeSeedingRisk,
      genuineDealCount: f.safeGenuineDeals,
      fakeSaleTrapCount: f.safeFakeTraps,
      authenticReviews: f.safeAuthenticReviews,
      totalReviews: f.safeTotalReviews,
      flaggedReviews: f.safeFlaggedReviews,
      productCount: f.safeProductCount,
    },
  };
}

export default function MerchantShareAuditButton(
  props: MerchantShareAuditButtonProps
) {
  const t = useTranslations('merchants');
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const safePlatform = sanitizeMerchantAuditText(props.platform, 'shopee', 32);
  const safeShopId = sanitizeMerchantAuditText(
    props.platformShopId,
    'shop',
    80
  );
  const downloadFileBase = `rate-merchant-${sanitizeMerchantDownloadSlug(safePlatform, 'platform')}-${sanitizeMerchantDownloadSlug(safeShopId, 'shop')}`;

  const handleCopyMerchantMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const md = buildMerchantAuditMarkdown(
        props,
        (key, values) => t(key, values),
        `${window.location.origin}${window.location.pathname}`
      );
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyMerchantUrl = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(
        sanitizeMerchantAuditProfileUrl(
          `${window.location.origin}${window.location.pathname}`
        )
      );
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadMerchantCsv = () => {
    if (typeof window === 'undefined') return;
    const csvContent = buildMerchantAuditCsv(props);
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
    const payload = buildMerchantAuditJson(props);
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
