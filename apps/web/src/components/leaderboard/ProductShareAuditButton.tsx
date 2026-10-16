'use client';

import React, { useState } from 'react';

interface ProductShareAuditButtonProps {
  readonly name: string;
  readonly brand: string;
  readonly modelKey: string;
  readonly userScore5: number;
  readonly expertScore10: number;
  readonly authenticReviews: number;
  readonly minPriceVnd: number;
  readonly offerCount: number;
  readonly keySpecLine?: string;
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
        `- **Điểm Người Mua Thực Chất (JReviews):** ★ ${userScore5.toFixed(2)}/5.0 (${authenticReviews} đánh giá thật đã lọc Seeding AI)`,
        `- **Điểm Chuyên Gia Rate Lab:** ${expertScore10.toFixed(1)}/10`,
        ...(keySpecLine ? [`- **Cấu Hình Chuẩn Hóa:** ${keySpecLine}`] : []),
        `- **Giá Tham Khảo Thấp Nhất:** ${priceStr}`,
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
        onClick={handleCopyLink}
        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
        title="Sao chép đường dẫn sản phẩm"
      >
        {copiedUrl ? '✓ Đã chép link!' : '🔗 Chép link'}
      </button>
    </div>
  );
}
