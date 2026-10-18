'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/lib/navigation';
import { escapeCsvCell } from '@/lib/csv-safe';
import type { MasterProduct } from '@/lib/rate-domain';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarResponse,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';

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
  const [slugA, setSlugA] = useState<string>('');
  const [slugB, setSlugB] = useState<string>('');
  const [copiedCatalogMd, setCopiedCatalogMd] = useState(false);

  const radarIndex = useDealRadarIndex(dealRadar);
  const radarFor = (slug: string) => getRadarSignal(radarIndex, slug);

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
      'Deal Radar',
    ];
    const sep = headers.map(() => '---');
    const rows = products.map((p, idx) => {
      const rawUser = Number(p.user_rating_weighted || p.average_rating || 0);
      const userRating = rawUser > 0 ? rawUser : null;
      const rawExpert =
        p.expert_rating != null && Number(p.expert_rating) > 0
          ? Number(p.expert_rating)
          : null;
      const expertScore10 =
        rawExpert != null
          ? Number((rawExpert > 5 ? rawExpert : rawExpert * 2).toFixed(1))
          : null;
      const radar = radarFor(p.slug);
      return [
        String(idx + 1),
        p.name.replace(/\|/g, '-'),
        p.brand || '-',
        userRating != null ? `${userRating.toFixed(1)}/5.0` : 'chưa có',
        expertScore10 != null ? `${expertScore10.toFixed(1)}/10` : 'chưa có',
        String(p.authentic_review_count || p.total_reviews || 0),
        p.min_price ? `${Number(p.min_price).toLocaleString('vi-VN')} ₫` : '-',
        radarMarkdownCell(radar),
      ];
    });

    const md = [
      `### 📂 Rate.vn Category Catalog Audit: ${categoryTitle} (${products.length} devices)`,
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
      const rawUser = Number(p.user_rating_weighted || p.average_rating || 0);
      const userRating = rawUser > 0 ? rawUser : null;
      const rawExpert =
        p.expert_rating != null && Number(p.expert_rating) > 0
          ? Number(p.expert_rating)
          : null;
      const expertScore10 =
        rawExpert != null
          ? Number((rawExpert > 5 ? rawExpert : rawExpert * 2).toFixed(1))
          : null;
      const radar = radarFor(p.slug);
      return [
        String(idx + 1),
        p.slug,
        p.name,
        p.brand || '',
        categorySlug,
        userRating != null ? userRating.toFixed(1) : '',
        expertScore10 != null ? expertScore10.toFixed(1) : '',
        String(p.authentic_review_count || p.total_reviews || 0),
        String(p.merchant_count || 0),
        String(p.min_price || 0),
        String(p.max_price || 0),
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
    a.download = `rate-catalog-${categorySlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCategoryJson = () => {
    if (typeof document === 'undefined' || products.length === 0) return;
    const payload = {
      source: 'Rate.vn Category Catalog',
      categorySlug,
      categoryTitle,
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map((p, idx) => {
        const rawUser = Number(p.user_rating_weighted || p.average_rating || 0);
        const rawExpert = Number(p.expert_rating || 0);
        return {
          rank: idx + 1,
          slug: p.slug,
          name: p.name,
          brand: p.brand,
          userRating: rawUser > 0 ? rawUser : null,
          expertRating: rawExpert > 0 ? rawExpert : null,
          minPriceVnd: Number(p.min_price || 0),
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
    a.download = `rate-catalog-${categorySlug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) return null;

  return (
    <div className="card rounded-4 mb-3 border bg-white p-3 shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        {products.length >= 2 ? (
          <div className="d-flex align-items-center flex-grow-1 flex-wrap gap-2">
            <span className="small fw-semibold text-dark">
              ⚔️ Chọn nhanh kèo 1v1 ({categoryTitle}):
            </span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '210px' }}
              value={effectiveSlugA}
              onChange={(e) => setSlugA(e.target.value)}
              aria-label="Chọn máy A để đối đầu 1v1"
            >
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="badge bg-danger rounded-pill">VS</span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '210px' }}
              value={effectiveSlugB}
              onChange={(e) => setSlugB(e.target.value)}
              aria-label="Chọn máy B để đối đầu 1v1"
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
                className="btn btn-sm btn-danger rounded-pill fw-semibold px-3 py-1"
                data-testid="catalog-1v1-go-btn"
              >
                Đấu 1v1 ngay →
              </Link>
            )}
          </div>
        ) : (
          <div />
        )}

        <div className="d-flex align-items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyCatalogMarkdown}
            className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3 py-1"
            style={{ fontSize: '0.8125rem' }}
            data-testid="copy-catalog-md-btn"
          >
            {copiedCatalogMd
              ? '✅ Đã chép danh mục MD!'
              : '📋 Sao chép danh mục Markdown'}
          </button>
          <button
            type="button"
            onClick={handleDownloadCatalogCsv}
            className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
            style={{ fontSize: '0.8125rem' }}
            data-testid="download-catalog-csv-btn"
          >
            📥 Xuất CSV ngành hàng
          </button>
          <button
            type="button"
            onClick={handleDownloadCategoryJson}
            className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
            style={{ fontSize: '0.8125rem' }}
            data-testid="download-catalog-json-btn"
          >
            📦 Xuất JSON
          </button>
        </div>
      </div>
    </div>
  );
}
