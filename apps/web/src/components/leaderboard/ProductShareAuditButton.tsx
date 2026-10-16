'use client';

import { useState } from 'react';
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
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const priceStr =
        minPriceVnd > 0
          ? `${minPriceVnd.toLocaleString('vi-VN')} ₫ (${offerCount} nguồn kiểm định)`
          : 'Đang cập nhật';
      const lines = [
        `### 🛡️ Hồ Sơ Kiểm Định Thiết Bị: ${name} (${brand})`,
        `- **Điểm Người Mua Thực Chất (JReviews):** ${userScore5 > 0 ? `★ ${userScore5.toFixed(2)}/5.0 (${authenticReviews} đánh giá thật đã lọc Seeding AI)` : 'Chưa có đánh giá'}`,
        `- **Điểm Chuyên Gia Rate Lab:** ${expertScore10 != null ? `${expertScore10.toFixed(1)}/10` : 'Chưa có'}`,
        ...(keySpecLine ? [`- **Cấu Hình Chuẩn Hóa:** ${keySpecLine}`] : []),
        `- **Giá Tham Khảo Thấp Nhất:** ${priceStr}`,
        ...(radarSignal
          ? [`- **Tín Hiệu Deal Radar 60N:** ${radarLabel(radarSignal)}`]
          : []),
        `- **Mã Định Danh Chuẩn:** \`${modelKey}\``,
        `- **Xem chi tiết 10 nhóm thông số & lịch sử giá:** ${window.location.href}`,
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
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Thiết Bị',
      'Thương Hiệu',
      'Model Key',
      'Điểm Người Mua (/5.0)',
      'Điểm Chuyên Gia (/10)',
      'Review Thật',
      'Giá Thấp Nhất (VND)',
      'Số Nguồn Kiểm Định',
      'Cấu Hình Chuẩn Hóa',
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
    const csvContent = `\uFEFF${headers.map(escapeCsv).join(',')}\n${row.map(escapeCsv).join(',')}`;
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
        title="Sao chép thẻ tóm tắt kiểm định định dạng Markdown để dán lên diễn đàn/nhóm chat"
      >
        {copiedMd
          ? '✓ Đã sao chép hồ sơ Markdown!'
          : '📋 Sao chép hồ sơ kiểm định'}
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
        title="Sao chép đường dẫn sản phẩm"
      >
        {copiedUrl ? '✓ Đã chép link!' : '🔗 Chép link'}
      </button>
    </div>
  );
}
