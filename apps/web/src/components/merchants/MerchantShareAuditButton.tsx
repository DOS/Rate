'use client';

import { useState } from 'react';

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
        `### 🛡️ Biên Bản Kiểm Toán Tín Nhiệm Gian Hàng: ${merchantName} (${platform.toUpperCase()})`,
        `- **Phân loại:** ${isOfficial ? 'Gian hàng Chính hãng (Official Mall)' : 'Gian hàng tiêu chuẩn'} | Shop ID: \`${platformShopId}\``,
        `- **Chỉ số Tín nhiệm Tổng hợp (Rate Trust Score):** **${trustScore}/100** (${trustLevelLabel})`,
        `- **Rủi ro an ninh DOSafe Threat Intel:** ${dosafeRiskScore}/100`,
        `- **Rủi ro gian lận đánh giá (AI Review Seeding Risk):** ${reviewSeedingRiskScore}/100`,
        `- **Kiểm toán Radar Giá 60 Ngày:** 🟢 ${genuineDealCount} kèo đáy lịch sử | 🚨 ${fakeSaleTrapCount} cảnh báo kê khống giá gốc`,
        `- **Tỷ lệ đánh giá người mua thật:** ${authenticPct}% (${authenticReviews}/${totalReviews} đánh giá thật, đã lọc ${flaggedReviews} bài Seeding/Spam)`,
        `- **Số thiết bị đang theo dõi giá:** ${productCount} mẫu chuẩn hóa`,
        `- **Hồ sơ kiểm toán trực tiếp trên Rate.vn:** ${window.location.href}`,
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
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Tên Gian Hàng',
      'Sàn',
      'Shop ID',
      'Phân Loại',
      'Trust Score (/100)',
      'Mức Tín Nhiệm',
      'DOSafe Risk (/100)',
      'Seeding Risk (/100)',
      'Kèo Đáy 60N',
      'Cảnh Báo Kê Khống 60N',
      'Review Thật',
      'Tổng Review',
      'Review Bị Gắn Cờ',
      'Số Thiết Bị Theo Dõi',
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
    const csvContent = `\uFEFF${headers.map(escapeCsv).join(',')}\n${row.map(escapeCsv).join(',')}`;
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
        title="Sao chép biên bản kiểm toán tín nhiệm gian hàng định dạng Markdown"
      >
        {copiedMd
          ? '✓ Đã chép biên bản Markdown!'
          : '📋 Sao chép biên bản tín nhiệm'}
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
        title="Sao chép đường dẫn hồ sơ gian hàng"
      >
        {copiedUrl ? '✓ Đã chép link!' : '🔗 Chép link'}
      </button>
    </div>
  );
}
