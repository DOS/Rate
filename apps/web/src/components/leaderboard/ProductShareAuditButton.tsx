'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  type RadarSignal,
} from '@/lib/deal-radar';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  MAX_VALID_VND_PRICE,
} from '@/lib/rate-domain';
import {
  collapseWhitespace,
  formatListingPrice,
  formatNumber,
  hasListingUnitSuffix,
  localizeDecimalPoints,
  sanitizeCurrencyPriceValue,
} from '@/lib/locale-format';
import { formatScoreFixed, roundScore } from '@/lib/rating-display';
import {
  buildOgTruthCardPath,
  isValidOgSlug,
  isValidOgVariantKey,
} from '@/lib/seo';

interface ProductShareAuditButtonProps {
  readonly slug?: string;
  readonly name: string;
  readonly brand: string;
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly currency?: 'VND' | 'PCT';
  readonly categorySlug?: string | null;
  readonly offerCount: number;
  readonly keySpecLine?: string;
  readonly radarSignal?: RadarSignal;
}

const PRODUCT_DETAIL_PATH_SLUG_RE = new RegExp(
  `^\\/(?:(?:vi|en|cs)\\/)?(?:${ALL_CANONICAL_CATEGORY_SLUGS.join('|')})\\/([^/?#]+)\\/?$`,
  'i'
);

export function resolveShareAuditOgDownloadUrl(input: {
  readonly slug?: string | null;
  readonly pathname?: string | null;
  readonly search?: string | null;
  readonly locale?: string | null;
}): string | null {
  const explicitSlug =
    typeof input.slug === 'string'
      ? input.slug.replace(/\p{Cc}+/gu, '').trim()
      : '';
  let resolvedSlug = isValidOgSlug(explicitSlug, 120) ? explicitSlug : '';
  let resolvedVariant: string | null = null;

  if (!resolvedSlug && typeof input.pathname === 'string') {
    const match = input.pathname.trim().match(PRODUCT_DETAIL_PATH_SLUG_RE);
    if (match?.[1]) {
      try {
        const decoded = decodeURIComponent(match[1]).trim();
        if (isValidOgSlug(decoded, 120)) {
          resolvedSlug = decoded;
        }
      } catch {
        // Ignore malformed percent-encoding in pathname.
      }
    }
    if (resolvedSlug && typeof input.search === 'string' && input.search) {
      const rawVar = new URLSearchParams(input.search).get('v');
      const cleanVar =
        typeof rawVar === 'string' ? rawVar.trim().toLowerCase() : '';
      if (isValidOgVariantKey(cleanVar)) {
        resolvedVariant = cleanVar;
      }
    }
  }

  if (!resolvedSlug) return null;
  return buildOgTruthCardPath({
    type: 'product',
    slug: resolvedSlug,
    variant: resolvedVariant,
    locale: input.locale,
    format: 'social',
    download: true,
  });
}

export function sanitizeShareAuditText(
  value: unknown,
  maxLength = 200,
  locale?: string | null
): string {
  if (typeof value !== 'string') return '';
  return collapseWhitespace(value.replace(/\p{Cc}+/gu, ' '), locale)
    .trim()
    .slice(0, maxLength);
}

// Markdown code spans cannot escape a backtick, so one in the text would end
// the span early; a straight quote keeps the value readable (#1099).
export function sanitizeShareAuditCodeSpan(
  value: unknown,
  maxLength = 200
): string {
  return sanitizeShareAuditText(value, maxLength).replace(/`/g, "'");
}

export type ShareAuditMarkdownTranslatorKey =
  | 'shareAuditPriceSources'
  | 'shareAuditPriceSourcesCurrency'
  | 'shareAuditUpdating'
  | 'shareAuditMdUserScoreVal'
  | 'shareAuditMdNoReviews'
  | 'shareAuditMdNoExpert'
  | 'shareAuditMdTitle'
  | 'shareAuditMdUserScore'
  | 'shareAuditMdExpertScore'
  | 'shareAuditMdKeySpecs'
  | 'shareAuditMdMinPrice'
  | 'shareAuditMdRadar'
  | 'shareAuditMdModelKey'
  | 'shareAuditMdUrl';

export function buildShareAuditMarkdown(params: {
  readonly name: string;
  readonly brand: string;
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly currency?: string | null;
  readonly categorySlug?: string | null;
  readonly offerCount: number;
  readonly keySpecLine?: string;
  readonly radarSignal?: RadarSignal | null;
  readonly url: string;
  readonly locale?: string | null;
  readonly t: (
    key: ShareAuditMarkdownTranslatorKey,
    values?: Record<string, string | number>
  ) => string;
}): string {
  const locale =
    typeof params.locale === 'string' && params.locale.trim()
      ? params.locale
      : 'vi';
  const {
    safeUserScore5,
    safeExpertScore10,
    safeAuthenticReviews,
    safeMinPriceVnd,
    safeOfferCount,
  } = normalizeShareAuditFields({
    modelKey: params.modelKey,
    userScore5: params.userScore5,
    expertScore10: params.expertScore10,
    authenticReviews: params.authenticReviews,
    minPriceVnd: params.minPriceVnd,
    currency: params.currency,
    offerCount: params.offerCount,
  });
  const safeName = sanitizeShareAuditText(params.name, 160, locale);
  const safeBrand = sanitizeShareAuditText(params.brand, 80, locale);
  const safeKeySpecLine = params.keySpecLine
    ? sanitizeShareAuditText(params.keySpecLine, 240, locale)
    : '';
  const hasCustomUnit = hasListingUnitSuffix(
    params.currency,
    params.categorySlug
  );
  const priceStr =
    safeMinPriceVnd > 0
      ? hasCustomUnit
        ? params.t('shareAuditPriceSourcesCurrency', {
            price: formatListingPrice(
              safeMinPriceVnd,
              params.currency,
              locale,
              { categorySlug: params.categorySlug }
            ),
            count: safeOfferCount,
          })
        : params.t('shareAuditPriceSources', {
            price: formatNumber(safeMinPriceVnd, locale),
            count: safeOfferCount,
          })
      : params.t('shareAuditUpdating');
  const userScoreStr =
    safeUserScore5 > 0
      ? params.t('shareAuditMdUserScoreVal', {
          score: localizeDecimalPoints(
            formatScoreFixed(safeUserScore5, 2),
            locale
          ),
          count: safeAuthenticReviews,
        })
      : params.t('shareAuditMdNoReviews');
  const expertScoreStr =
    safeExpertScore10 != null
      ? `${localizeDecimalPoints(formatScoreFixed(safeExpertScore10, 1), locale)}/10`
      : params.t('shareAuditMdNoExpert');
  const radarSignalLabel = params.radarSignal
    ? radarLabel(params.radarSignal, 0, locale)
    : '';
  const t = params.t;
  const lines = [
    t('shareAuditMdTitle', { name: safeName, brand: safeBrand }),
    t('shareAuditMdUserScore', { score: userScoreStr }),
    t('shareAuditMdExpertScore', { score: expertScoreStr }),
    ...(safeKeySpecLine
      ? [t('shareAuditMdKeySpecs', { specs: safeKeySpecLine })]
      : []),
    t('shareAuditMdMinPrice', { price: priceStr }),
    ...(radarSignalLabel
      ? [t('shareAuditMdRadar', { signal: radarSignalLabel })]
      : []),
    t('shareAuditMdModelKey', {
      modelKey: sanitizeShareAuditCodeSpan(params.modelKey, 120),
    }),
    t('shareAuditMdUrl', { url: params.url }),
  ];
  return lines.join('\n');
}

export function normalizeShareAuditFields(input: {
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly currency?: string | null;
  readonly offerCount: number;
}) {
  const rawUser = Number(input.userScore5);
  const safeUserScore5 =
    Number.isFinite(rawUser) && rawUser > 0 ? Math.min(5, rawUser) : 0;
  const rawExpert =
    input.expertScore10 != null ? Number(input.expertScore10) : 0;
  const safeExpertScore10 =
    Number.isFinite(rawExpert) && rawExpert > 0
      ? roundScore(Math.min(10, rawExpert <= 5 ? rawExpert * 2 : rawExpert), 1)
      : null;
  const rawReviews = Number(input.authenticReviews);
  const safeAuthenticReviews =
    Number.isFinite(rawReviews) && rawReviews > 0
      ? Math.min(10_000_000, Math.floor(rawReviews))
      : 0;
  const rawPrice = Number(input.minPriceVnd);
  const safeMinPriceVnd =
    Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= MAX_VALID_VND_PRICE
      ? sanitizeCurrencyPriceValue(rawPrice, input.currency)
      : 0;
  const rawOffers = Number(input.offerCount);
  const safeOfferCount =
    Number.isFinite(rawOffers) && rawOffers > 0
      ? Math.min(10_000_000, Math.floor(rawOffers))
      : 0;
  const safeModelKeyToken =
    (typeof input.modelKey === 'string' ? input.modelKey : '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'audit';

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
  slug,
  name,
  brand,
  modelKey,
  userScore5,
  expertScore10,
  authenticReviews,
  minPriceVnd,
  currency,
  categorySlug,
  offerCount,
  keySpecLine,
  radarSignal,
}: ProductShareAuditButtonProps) {
  const t = useTranslations('productDetail');
  const locale = useLocale();
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
    currency,
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
      const md = buildShareAuditMarkdown({
        name,
        brand,
        modelKey,
        userScore5,
        expertScore10,
        authenticReviews,
        minPriceVnd,
        currency,
        categorySlug,
        offerCount,
        keySpecLine,
        radarSignal,
        url: window.location.href,
        locale,
        t,
      });
      await navigator.clipboard.writeText(md);
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
      safeUserScore5 > 0 ? formatScoreFixed(safeUserScore5, 2) : '',
      safeExpertScore10 != null ? formatScoreFixed(safeExpertScore10, 1) : '',
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
        currency: currency ?? 'VND',
        minPrice: safeMinPriceVnd,
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

  const handleDownloadTruthCardPng = () => {
    if (typeof window === 'undefined') return;
    const downloadUrl = resolveShareAuditOgDownloadUrl({
      slug,
      pathname: window.location.pathname,
      search: window.location.search,
      locale,
    });
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `rate-truth-card-${safeModelKeyToken}-4x5.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-2">
      <ExportMenu label={t('exportMenu')}>
        {(close) => (
          <>
            <button
              type="button"
              onClick={() => {
                handleDownloadTruthCardPng();
                close();
              }}
              title={t('shareAuditDownloadPngTitle')}
              data-testid="product-export-og-png-btn"
            >
              {t('shareAuditDownloadPngBtn')}
            </button>
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
