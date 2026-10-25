'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsDownload } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  MAX_VALID_VND_PRICE,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
  type MasterProduct,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarResponse,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';

const CATALOG_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeCatalogToolbarText(
  value: unknown,
  fallback = '',
  maxLen = 160
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(CATALOG_CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeCatalogPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function sanitizeCatalogCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

export function sanitizeCatalogDownloadSlug(
  value: unknown,
  fallback = 'catalog'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(CATALOG_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

interface CategoryCatalogToolbarProps {
  readonly categorySlug: string;
  readonly categoryTitle: string;
  readonly products: readonly MasterProduct[];
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
}

export default function CategoryCatalogToolbar({
  categorySlug,
  categoryTitle,
  products,
  dealRadar,
}: CategoryCatalogToolbarProps) {
  const t = useTranslations('catalog');
  const [slugA, setSlugA] = useState<string>('');
  const [slugB, setSlugB] = useState<string>('');
  const [copiedCatalogMd, setCopiedCatalogMd] = useState(false);
  const { ref: exportMenuRef, close: closeExportMenu } = useDetailsDismiss();

  const radarIndex = useDealRadarIndex(dealRadar);
  const radarFor = (slug: string) => getRadarSignal(radarIndex, slug);

  const safeCategorySlug = sanitizeCatalogDownloadSlug(
    categorySlug,
    'smartphones'
  );
  const safeCategoryTitle = sanitizeCatalogToolbarText(
    categoryTitle,
    safeCategorySlug,
    120
  );

  const effectiveSlugA = useMemo(() => {
    if (slugA && products.some((p) => p.slug === slugA)) return slugA;
    return products[0]?.slug ?? '';
  }, [slugA, products]);

  const effectiveSlugB = useMemo(() => {
    if (
      slugB &&
      slugB !== effectiveSlugA &&
      products.some((p) => p.slug === slugB)
    ) {
      return slugB;
    }
    return products.find((p) => p.slug !== effectiveSlugA)?.slug ?? '';
  }, [slugB, effectiveSlugA, products]);

  const handleCopyCatalogMarkdown = async () => {
    if (typeof navigator === 'undefined' || products.length === 0) return;
    const headers = [
      '#',
      'Model',
      'Brand',
      'User Rating (/5.0)',
      'Expert Score (/10)',
      'Authentic Reviews',
      'Min Price (VND)',
      'Price signal',
    ];
    const sep = headers.map(() => '---');
    const rows = products.map((p, idx) => {
      const rawUser = resolveCompareEffectiveUserRating(p);
      const userRating = rawUser > 0 ? rawUser : null;
      const expertScore10 = resolveCompareExpertRating10(p);
      const radar = radarFor(p.slug);
      const minPrice = sanitizeCatalogPriceVnd(p.min_price);
      const authReviews = sanitizeCatalogCount(
        p.authentic_review_count || p.total_reviews || 0
      );
      return [
        String(idx + 1),
        sanitizeCatalogToolbarText(p.name, 'Unknown'),
        sanitizeCatalogToolbarText(p.brand, '-', 80),
        userRating != null
          ? `${userRating.toFixed(1)}/5.0`
          : t('toolbar.unratedText'),
        expertScore10 != null
          ? `${expertScore10.toFixed(1)}/10`
          : t('toolbar.unratedText'),
        String(authReviews),
        minPrice > 0 ? `${minPrice.toLocaleString('vi-VN')} ₫` : '-',
        radarMarkdownCell(radar),
      ];
    });

    const md = [
      `### 📂 Rate.vn category catalog: ${safeCategoryTitle} (${products.length} devices)`,
      '',
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopiedCatalogMd(true);
      setTimeout(() => setCopiedCatalogMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadCatalogCsv = () => {
    if (typeof document === 'undefined' || products.length === 0) return;
    const headers = [
      'Rank',
      'Slug',
      'Name',
      'Brand',
      'Category',
      'UserRating5',
      'ExpertScore10',
      'AuthenticReviewCount',
      'MerchantCount',
      'MinPriceVND',
      'MaxPriceVND',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = products.map((p, idx) => {
      const rawUser = resolveCompareEffectiveUserRating(p);
      const userRating = rawUser > 0 ? rawUser : null;
      const expertScore10 = resolveCompareExpertRating10(p);
      const radar = radarFor(p.slug);
      return [
        String(idx + 1),
        sanitizeCatalogToolbarText(p.slug, '', 120),
        sanitizeCatalogToolbarText(p.name, 'Unknown'),
        sanitizeCatalogToolbarText(p.brand, '', 80),
        safeCategorySlug,
        userRating != null ? userRating.toFixed(1) : '',
        expertScore10 != null ? expertScore10.toFixed(1) : '',
        String(
          sanitizeCatalogCount(p.authentic_review_count || p.total_reviews || 0)
        ),
        String(sanitizeCatalogCount(p.merchant_count)),
        String(sanitizeCatalogPriceVnd(p.min_price)),
        String(sanitizeCatalogPriceVnd(p.max_price)),
        ...radarCsvCells(radar),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsvCell).join(','),
        ...rows.map((r) => r.map(escapeCsvCell).join(',')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-catalog-${safeCategorySlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCategoryJson = () => {
    if (typeof document === 'undefined' || products.length === 0) return;
    const payload = {
      source: 'Rate.vn Category Catalog',
      categorySlug: safeCategorySlug,
      categoryTitle: safeCategoryTitle,
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map((p, idx) => {
        const rawUser = resolveCompareEffectiveUserRating(p);
        const expertScore10 = resolveCompareExpertRating10(p);
        return {
          rank: idx + 1,
          slug: sanitizeCatalogToolbarText(p.slug, '', 120),
          name: sanitizeCatalogToolbarText(p.name, 'Unknown'),
          brand: sanitizeCatalogToolbarText(p.brand, '', 80),
          userRating: rawUser > 0 ? rawUser : null,
          expertRating: expertScore10,
          minPriceVnd: sanitizeCatalogPriceVnd(p.min_price),
          dealRadar: radarExportFields(radarFor(p.slug)),
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-catalog-${safeCategorySlug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) return null;

  return (
    <div className="rate-card rate-catalog-toolbar mb-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        {products.length >= 2 ? (
          <div className="d-flex align-items-center flex-grow-1 flex-wrap gap-2">
            <span className="rate-catalog-toolbar-label">
              {t('toolbar.quick1v1Label', { title: safeCategoryTitle })}
            </span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '190px' }}
              value={effectiveSlugA}
              onChange={(e) => setSlugA(e.target.value)}
              aria-label={t('toolbar.selectDeviceAAria')}
            >
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="rate-catalog-toolbar-vs" aria-hidden="true">
              vs
            </span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '190px' }}
              value={effectiveSlugB}
              onChange={(e) => setSlugB(e.target.value)}
              aria-label={t('toolbar.selectDeviceBAria')}
            >
              {products
                .filter((p) => p.slug !== effectiveSlugA)
                .map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
            </select>
            {effectiveSlugA && effectiveSlugB && (
              <Link
                href={`/compare/${effectiveSlugA}-vs-${effectiveSlugB}`}
                className="btn btn-sm btn-primary fw-semibold px-3"
                data-testid="catalog-1v1-go-btn"
              >
                {t('toolbar.versusGoBtn')}
              </Link>
            )}
          </div>
        ) : (
          <div />
        )}

        <details ref={exportMenuRef} className="rate-export-menu ms-auto">
          <summary>
            <BsDownload aria-hidden="true" />
            {t('toolbar.exportMenu')}
          </summary>
          <div className="rate-export-menu-list">
            <button
              type="button"
              onClick={handleCopyCatalogMarkdown}
              data-testid="copy-catalog-md-btn"
            >
              {copiedCatalogMd
                ? t('toolbar.copiedMdBtn')
                : t('toolbar.copyMdBtn')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadCatalogCsv();
                closeExportMenu();
              }}
              data-testid="download-catalog-csv-btn"
            >
              {t('toolbar.exportCsvBtn')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadCategoryJson();
                closeExportMenu();
              }}
              data-testid="download-catalog-json-btn"
            >
              {t('toolbar.exportJsonBtn')}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
