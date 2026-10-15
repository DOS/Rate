'use client';

import React, { useState } from 'react';
import { Link } from '@/lib/navigation';
import {
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsSendFill,
  BsShieldCheck,
} from 'react-icons/bs';

interface QuarantineApiResult {
  accepted: boolean;
  status: string;
  jobId: string | null;
  canonicalUrl: string | null;
  reason: string;
}

export default function CommunityQuarantineSubmitForm() {
  const [url, setUrl] = useState(
    'https://cellphones.com.vn/iphone-16-pro-max.html'
  );
  const [title, setTitle] = useState(
    'Apple iPhone 16 Pro Max 256GB Chính hãng VN/A'
  );
  const [currentPrice, setCurrentPrice] = useState('30990000');
  const [originalPrice, setOriginalPrice] = useState('34990000');
  const [skuText, setSkuText] = useState('256GB Titan Tự Nhiên');
  const [sellerName, setSellerName] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QuarantineApiResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim(),
          currentPrice: Number(currentPrice) || 0,
          originalPrice: originalPrice.trim()
            ? Number(originalPrice)
            : undefined,
          skuText: skuText.trim() || undefined,
          sellerName: sellerName.trim() || undefined,
          consentGranted,
          extensionVersion: 'web-portal-2.1.0',
        }),
      });
      const data = (await res.json()) as QuarantineApiResult;
      setResult(data);
    } catch (err) {
      setResult({
        accepted: false,
        status: 'rejected_invalid_payload',
        jobId: null,
        canonicalUrl: null,
        reason:
          err instanceof Error
            ? err.message
            : 'Không thể kết nối tới cổng Zero-Trust Quarantine.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card rounded-4 p-md-5 border bg-white p-4 shadow-sm">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill fw-semibold mb-2 px-3 py-1">
            🛡️ Zero-Trust Quarantine Ingestion (`rate.crawl_jobs`)
          </span>
          <h3 className="h4 fw-bold mb-1">
            Đóng Góp Link Sản Phẩm Mới Hoặc Báo Cáo Khuyến Mãi Ảo
          </h3>
          <p className="text-muted small mb-0">
            Hỗ trợ toàn bộ 10 sàn/đại lý: Shopee, Lazada, Tiki, TikTok Shop,
            CellphoneS, Thế Giới Di Động, FPT Shop, Hoàng Hà Mobile, Di Động
            Việt và Phong Vũ.
          </p>
        </div>
        <Link
          href={`/inspect?q=${encodeURIComponent(url)}`}
          className="btn btn-sm btn-outline-primary rounded-pill fw-semibold px-3"
        >
          🔍 Mở trong Trình Kiểm Định (/inspect)
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="row g-3">
        <div className="col-md-7">
          <label className="form-label small fw-bold text-secondary">
            Đường dẫn sản phẩm TMĐT (URL) *
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="form-control"
            placeholder="https://shopee.vn/product/... hoặc https://cellphones.com.vn/..."
          />
        </div>

        <div className="col-md-5">
          <label className="form-label small fw-bold text-secondary">
            Tên sản phẩm hiển thị trên sàn *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-control"
            placeholder="Ví dụ: Apple iPhone 16 Pro Max 256GB..."
          />
        </div>

        <div className="col-md-3 col-6">
          <label className="form-label small fw-bold text-secondary">
            Giá đang bán (VNĐ) *
          </label>
          <input
            type="number"
            required
            min={50000}
            value={currentPrice}
            onChange={(e) => setCurrentPrice(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="col-md-3 col-6">
          <label className="form-label small fw-bold text-secondary">
            Giá gốc gạch ngang (VNĐ)
          </label>
          <input
            type="number"
            min={0}
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            className="form-control"
            placeholder="Tùy chọn"
          />
        </div>

        <div className="col-md-3 col-6">
          <label className="form-label small fw-bold text-secondary">
            Phiên bản RAM / ROM (SKU)
          </label>
          <input
            type="text"
            value={skuText}
            onChange={(e) => setSkuText(e.target.value)}
            className="form-control"
            placeholder="Ví dụ: 256GB Titan"
          />
        </div>

        <div className="col-md-3 col-6">
          <label className="form-label small fw-bold text-secondary">
            Tên Gian hàng / Đại lý
          </label>
          <input
            type="text"
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            className="form-control"
            placeholder="Tùy chọn"
          />
        </div>

        <div className="col-12">
          <div className="form-check bg-light rounded-3 border p-3 ps-5">
            <input
              id="community-quarantine-consent"
              type="checkbox"
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
              className="form-check-input"
            />
            <label
              htmlFor="community-quarantine-consent"
              className="form-check-label small text-secondary"
            >
              <strong>Đồng thuận đóng góp dữ liệu ẩn danh (Opt-In):</strong> Tôi
              đồng ý gửi thông tin giá công khai của sản phẩm này qua bộ lọc{' '}
              <code>Zero-Trust Quarantine</code> (tự động xóa toàn bộ tham số
              tracking/PII trước khi lưu vào hàng đợi kiểm chứng{' '}
              <code>rate.crawl_jobs</code>).
            </label>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between col-12 flex-wrap gap-3">
          <div className="small text-muted d-flex align-items-center gap-1">
            <BsShieldCheck className="text-success fs-5" />
            <span>
              Tự động từ chối phụ kiện/linh kiện giá rẻ để bảo vệ độ sạch của{' '}
              <code>rate.master_products</code>.
            </span>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-danger rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2"
          >
            <BsSendFill />
            {isSubmitting
              ? 'Đang kiểm duyệt Zero-Trust...'
              : 'Gửi Link Vào Hàng Đợi Kiểm Toán'}
          </button>
        </div>
      </form>

      {result && (
        <div
          className={`alert rounded-4 mt-4 mb-0 border ${
            result.accepted
              ? 'alert-success border-success'
              : 'alert-warning border-warning'
          }`}
        >
          <div className="d-flex align-items-start gap-2">
            {result.accepted ? (
              <BsCheckCircleFill className="text-success fs-4 mt-1 flex-shrink-0" />
            ) : (
              <BsExclamationTriangleFill className="text-warning fs-4 mt-1 flex-shrink-0" />
            )}
            <div>
              <div className="fw-bold mb-1">
                {result.accepted
                  ? 'Đã tiếp nhận vào cổng Zero-Trust Quarantine'
                  : 'Tín hiệu bị từ chối bởi bộ lọc Zero-Trust Gatekeeper'}{' '}
                <span className="badge bg-dark ms-1">{result.status}</span>
              </div>
              <div className="small mb-1">{result.reason}</div>
              {result.canonicalUrl && (
                <div className="small font-monospace text-muted">
                  URL chuẩn hóa (đã lọc PII): {result.canonicalUrl}
                  {result.jobId ? ` • Job ID: ${result.jobId}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
