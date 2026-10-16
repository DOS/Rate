'use client';

import React, { useMemo, useState } from 'react';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@/lib/rate-api';

interface CategoryCatalogToolbarProps {
  readonly categorySlug: string;
  readonly categoryTitle: string;
  readonly products: readonly MasterProduct[];
}

export default function CategoryCatalogToolbar({
  categorySlug,
  categoryTitle,
  products,
}: CategoryCatalogToolbarProps) {
  const [slugA, setSlugA] = useState<string>('');
  const [slugB, setSlugB] = useState<string>('');
  const [copiedCatalogMd, setCopiedCatalogMd] = useState(false);

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
    ];
    const sep = headers.map(() => '---');
    const rows = products.map((p, idx) => {
      const userRating =
        p.user_rating_weighted && Number(p.user_rating_weighted) > 0
          ? Number(p.user_rating_weighted)
          : Number(p.average_rating || 4.8);
      const expertScore10 = Number(
        (
          (p.expert_rating && Number(p.expert_rating) > 0
            ? Number(p.expert_rating)
            : userRating) * 2
        ).toFixed(1)
      );
      return [
        String(idx + 1),
        p.name.replace(/\|/g, '-'),
        p.brand || '-',
        `${userRating.toFixed(1)}/5.0`,
        `${expertScore10.toFixed(1)}/10`,
        String(p.authentic_review_count || p.total_reviews || 12),
        p.min_price ? `${Number(p.min_price).toLocaleString('vi-VN')} ₫` : '-',
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
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
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
    ];
    const rows = products.map((p, idx) => {
      const userRating =
        p.user_rating_weighted && Number(p.user_rating_weighted) > 0
          ? Number(p.user_rating_weighted)
          : Number(p.average_rating || 4.8);
      const expertScore10 = Number(
        (
          (p.expert_rating && Number(p.expert_rating) > 0
            ? Number(p.expert_rating)
            : userRating) * 2
        ).toFixed(1)
      );
      return [
        String(idx + 1),
        p.slug,
        p.name,
        p.brand || '',
        categorySlug,
        userRating.toFixed(1),
        expertScore10.toFixed(1),
        String(p.authentic_review_count || p.total_reviews || 12),
        String(p.merchant_count || 10),
        String(p.min_price || 0),
        String(p.max_price || 0),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
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
            style={{ fontSize: '0.76rem' }}
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
            style={{ fontSize: '0.76rem' }}
            data-testid="download-catalog-csv-btn"
          >
            📥 Xuất CSV ngành hàng
          </button>
        </div>
      </div>
    </div>
  );
}
