'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import {
  getWatchlist,
  removeWatchlistItem,
  subscribeWatchlist,
  upsertWatchlistItem,
  type WatchlistItem,
} from './watchlist-store';

interface PriceWatchButtonProps {
  slug: string;
  name: string;
  brand: string;
  categoryPath?: string;
  thumbnail: string | null;
  currentMinPrice: number;
  size?: 'sm' | 'md';
}

export default function PriceWatchButton({
  slug,
  name,
  brand,
  categoryPath = '/smartphones',
  thumbnail,
  currentMinPrice,
  size = 'md',
}: PriceWatchButtonProps) {
  const [watchedItem, setWatchedItem] = useState<WatchlistItem | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [targetInput, setTargetInput] = useState<number>(
    Math.round((currentMinPrice * 0.95) / 100000) * 100000
  );

  useEffect(() => {
    const sync = () => {
      const found = getWatchlist().find((x) => x.slug === slug) || null;
      setWatchedItem(found);
      if (found) {
        setTargetInput(found.targetPrice);
      } else if (currentMinPrice > 0) {
        setTargetInput(Math.round((currentMinPrice * 0.95) / 100000) * 100000);
      }
    };
    sync();
    return subscribeWatchlist(sync);
  }, [slug, currentMinPrice]);

  const handleSave = (customTarget: number) => {
    const cleanTarget = Math.max(100000, Math.round(customTarget));
    upsertWatchlistItem({
      slug,
      name,
      brand,
      categoryPath,
      thumbnail,
      priceWhenAdded: currentMinPrice,
      targetPrice: cleanTarget,
      addedAt: new Date().toISOString(),
    });
    setShowEditor(false);
  };

  const handleRemove = () => {
    removeWatchlistItem(slug);
    setShowEditor(false);
  };

  const preset5Pct = Math.round((currentMinPrice * 0.95) / 100000) * 100000;
  const preset10Pct = Math.round((currentMinPrice * 0.9) / 100000) * 100000;

  return (
    <div className="position-relative d-inline-block">
      <button
        type="button"
        onClick={() => setShowEditor((prev) => !prev)}
        className={`btn ${
          watchedItem ? 'btn-success text-white' : 'btn-outline-primary'
        } ${size === 'sm' ? 'btn-sm px-2 py-1' : 'px-3'} rounded-pill fw-medium`}
        title="Đặt ngưỡng giá mong muốn để theo dõi khi sản phẩm giảm giá thật"
      >
        {watchedItem
          ? `🔔 Đang canh giá: ≤ ${watchedItem.targetPrice.toLocaleString('vi-VN')} ₫`
          : '🔔 Theo dõi giảm giá'}
      </button>

      {showEditor && (
        <div
          className="card shadow-lg border rounded-4 p-3 position-absolute bg-white text-dark"
          style={{
            zIndex: 1050,
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '310px',
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong className="small">🔔 Đặt mục tiêu canh giá thật</strong>
            <button
              type="button"
              className="btn-close small"
              style={{ fontSize: '0.65rem' }}
              onClick={() => setShowEditor(false)}
              aria-label="Đóng"
            />
          </div>
          <p className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>
            Giá tốt nhất hiện tại:{' '}
            <strong className="text-danger">
              {currentMinPrice.toLocaleString('vi-VN')} ₫
            </strong>
          </p>

          <div className="d-flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => setTargetInput(preset5Pct)}
              className="btn btn-sm btn-light border rounded-pill flex-fill"
              style={{ fontSize: '0.75rem' }}
            >
              Giảm 5% ({preset5Pct.toLocaleString('vi-VN')} ₫)
            </button>
            <button
              type="button"
              onClick={() => setTargetInput(preset10Pct)}
              className="btn btn-sm btn-light border rounded-pill flex-fill"
              style={{ fontSize: '0.75rem' }}
            >
              Giảm 10% ({preset10Pct.toLocaleString('vi-VN')} ₫)
            </button>
          </div>

          <div className="input-group input-group-sm mb-2">
            <span className="input-group-text">Mức giá mục tiêu (₫)</span>
            <input
              type="number"
              step={100000}
              min={100000}
              value={targetInput}
              onChange={(e) => setTargetInput(Number(e.target.value || 0))}
              className="form-control fw-semibold"
            />
          </div>

          <div className="d-flex justify-content-between align-items-center gap-2 mt-2">
            {watchedItem ? (
              <button
                type="button"
                onClick={handleRemove}
                className="btn btn-sm btn-outline-danger rounded-pill px-2"
              >
                Bỏ theo dõi
              </button>
            ) : (
              <Link
                href="/watchlist"
                className="small text-primary text-decoration-none"
              >
                Xem danh sách canh giá ↗
              </Link>
            )}
            <button
              type="button"
              onClick={() => handleSave(targetInput)}
              className="btn btn-sm btn-primary rounded-pill px-3 fw-medium ms-auto"
            >
              Lưu mức giá
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
