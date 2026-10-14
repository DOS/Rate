'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@repo/shared-data';
import {
  getWatchlist,
  removeWatchlistItem,
  subscribeWatchlist,
  upsertWatchlistItem,
  type WatchlistItem,
} from './watchlist-store';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';

interface WatchlistWorkspaceProps {
  catalogProducts: MasterProduct[];
}

export default function WatchlistWorkspace({
  catalogProducts,
}: WatchlistWorkspaceProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<number>(0);

  useEffect(() => {
    const sync = () => setItems(getWatchlist());
    sync();
    return subscribeWatchlist(sync);
  }, []);

  const productBySlug = new Map<string, MasterProduct>(
    catalogProducts.map((p) => [p.slug, p])
  );

  const handleQuickAddCatalog = (p: MasterProduct) => {
    const minP = Number(p.min_price || 0);
    const targetP = Math.round((minP * 0.95) / 100000) * 100000;
    const thumb =
      p.thumbnail || (p.images && p.images.length > 0 ? p.images[0] || null : null);
    upsertWatchlistItem({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      categoryPath: '/smartphones',
      thumbnail: thumb,
      priceWhenAdded: minP,
      targetPrice: targetP,
      addedAt: new Date().toISOString(),
    });
  };

  const handleUpdateTarget = (item: WatchlistItem) => {
    upsertWatchlistItem({
      ...item,
      targetPrice: Math.max(100000, Math.round(editTarget)),
    });
    setEditingSlug(null);
  };

  const reachedCount = items.filter((item) => {
    const live = productBySlug.get(item.slug);
    const currentMin = live ? Number(live.min_price || 0) : item.priceWhenAdded;
    return currentMin > 0 && currentMin <= item.targetPrice;
  }).length;

  return (
    <div className="container py-5">
      {/* Header Banner */}
      <div className="card border-0 rounded-4 shadow-sm p-4 p-md-5 mb-4 bg-dark text-white">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
          <div>
            <span className="badge bg-danger text-white rounded-pill px-3 py-2 mb-2">
              🔔 Hệ Thống Canh Giá Thật &amp; Cảnh Báo Chạm Đáy Lịch Sử
            </span>
            <h1 className="h2 fw-bold text-white mb-2">
              Danh Sách Theo Dõi Biến Động Giá ({items.length})
            </h1>
            <p className="text-white-50 mb-0">
              Đối chiếu giá thấp nhất trực tiếp từ `rate.master_products` và chuỗi thời gian `rate.price_history` để báo hiệu ngay khi chạm mức giá mục tiêu của bạn.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link
              href="/smartphones"
              className="btn btn-outline-light rounded-pill px-4"
            >
              + Thêm sản phẩm từ danh mục
            </Link>
            {items.length >= 2 && (
              <Link
                href={`/compare?slugs=${items
                  .slice(0, 4)
                  .map((x) => x.slug)
                  .join(',')}`}
                className="btn btn-danger rounded-pill px-4 fw-medium"
              >
                ⚖️ So sánh {Math.min(4, items.length)} máy đang canh giá
              </Link>
            )}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="row g-3 mt-3 pt-3 border-top border-secondary border-opacity-25">
          <div className="col-sm-4 col-12">
            <div className="p-3 rounded-3 bg-white bg-opacity-10">
              <div className="small text-white-50">Sản phẩm đang theo dõi</div>
              <div className="h4 fw-bold text-white mb-0">{items.length} mẫu</div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="p-3 rounded-3 bg-white bg-opacity-10">
              <div className="small text-white-50">Đã chạm mục tiêu mua</div>
              <div className="h4 fw-bold text-success mb-0">
                {reachedCount} mẫu đạt giá mục tiêu
              </div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="p-3 rounded-3 bg-white bg-opacity-10">
              <div className="small text-white-50">Chống giảm giá ảo</div>
              <div className="h4 fw-bold text-info mb-0">
                100% đối chiếu trung vị 90 ngày
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State with Quick Add Suggestions */}
      {items.length === 0 ? (
        <div className="card border rounded-4 shadow-sm p-4 p-md-5 text-center bg-white mb-4">
          <div className="display-5 mb-3">🔔</div>
          <h3 className="h5 fw-bold mb-2">
            Bạn chưa thêm sản phẩm nào vào danh sách canh giá
          </h3>
          <p className="text-muted small mb-4 mx-auto" style={{ maxWidth: '560px' }}>
            Hãy chọn nhanh một mẫu máy bên dưới hoặc bấm nút{' '}
            <strong>&ldquo;🔔 Theo dõi giảm giá&rdquo;</strong> trên bất kỳ trang chi tiết sản phẩm nào để thiết lập ngưỡng giá mục tiêu.
          </p>

          {catalogProducts.length > 0 && (
            <div className="row g-3 justify-content-center text-start mt-2">
              {catalogProducts.slice(0, 3).map((p) => {
                const minP = Number(p.min_price || 0);
                const thumb =
                  p.thumbnail ||
                  (p.images && p.images.length > 0 ? p.images[0] : '/img/placeholder.png');
                return (
                  <div key={p.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card h-100 border rounded-4 p-3 bg-light">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <img
                          src={thumb}
                          alt={p.name}
                          className="rounded bg-white p-1 border"
                          style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                        />
                        <div>
                          <span className="badge bg-secondary-subtle text-secondary small mb-1">
                            {p.brand}
                          </span>
                          <h6 className="fw-bold mb-1">{p.name}</h6>
                          <div className="text-danger fw-bold small">
                            {minP.toLocaleString('vi-VN')} ₫
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickAddCatalog(p)}
                        className="btn btn-sm btn-primary rounded-pill w-100 fw-medium"
                      >
                        🔔 Canh giảm 5% (≤{' '}
                        {(Math.round((minP * 0.95) / 100000) * 100000).toLocaleString(
                          'vi-VN'
                        )}{' '}
                        ₫)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="row g-4">
          {items.map((item) => {
            const live = productBySlug.get(item.slug);
            const currentMin = live
              ? Number(live.min_price || 0)
              : item.priceWhenAdded;
            const currentMax = live
              ? Number(live.max_price || currentMin)
              : currentMin;
            const diffFromAdded = currentMin - item.priceWhenAdded;
            const diffFromTarget = currentMin - item.targetPrice;
            const targetReached = currentMin > 0 && currentMin <= item.targetPrice;
            const detailHref = `${item.categoryPath || '/smartphones'}/${item.slug}`;

            return (
              <div key={item.slug} className="col-lg-6 col-12">
                <div
                  className={`card h-100 rounded-4 shadow-sm p-4 bg-white ${
                    targetReached ? 'border-success border-2' : 'border'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                    <div className="d-flex align-items-center gap-3">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="rounded-3 bg-light p-2 border"
                          style={{
                            width: '76px',
                            height: '76px',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <div
                          className="rounded-3 bg-light border d-flex align-items-center justify-content-center text-muted small"
                          style={{ width: '76px', height: '76px' }}
                        >
                          No Img
                        </div>
                      )}
                      <div>
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                          <span className="badge bg-secondary-subtle text-secondary">
                            {item.brand}
                          </span>
                          {targetReached ? (
                            <span className="badge bg-success text-white rounded-pill">
                              🎉 Đã chạm giá mục tiêu!
                            </span>
                          ) : (
                            <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill">
                              ⏳ Đang chờ giảm thêm{' '}
                              {Math.max(0, diffFromTarget).toLocaleString('vi-VN')} ₫
                            </span>
                          )}
                        </div>
                        <h5 className="fw-bold mb-1">
                          <Link
                            href={detailHref}
                            className="text-dark text-decoration-none"
                          >
                            {item.name}
                          </Link>
                        </h5>
                        <div className="text-muted small">
                          Lưu ngày:{' '}
                          {new Date(item.addedAt).toLocaleDateString('vi-VN')}
                        </div>
                      </div>
                    </div>

                    <CompareQuickToggle
                      item={{
                        slug: item.slug,
                        name: item.name,
                        brand: item.brand,
                        thumbnail: item.thumbnail,
                        min_price: currentMin,
                      }}
                    />
                  </div>

                  {/* Price Comparison Grid */}
                  <div className="row g-2 mb-3">
                    <div className="col-sm-4 col-12">
                      <div className="p-2 rounded-3 bg-light border text-center">
                        <div className="small text-muted">Giá hiện tại thấp nhất</div>
                        <div className="fw-bold text-danger">
                          {currentMin.toLocaleString('vi-VN')} ₫
                        </div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          {currentMin !== currentMax
                            ? `Cao nhất: ${currentMax.toLocaleString('vi-VN')} ₫`
                            : `${live?.merchant_count || 1} nơi bán`}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="p-2 rounded-3 bg-light border text-center">
                        <div className="small text-muted">Giá lúc bắt đầu lưu</div>
                        <div className="fw-semibold text-dark">
                          {item.priceWhenAdded.toLocaleString('vi-VN')} ₫
                        </div>
                        <div
                          className={
                            diffFromAdded < 0
                              ? 'text-success fw-semibold'
                              : diffFromAdded > 0
                                ? 'text-danger'
                                : 'text-muted'
                          }
                          style={{ fontSize: '11px' }}
                        >
                          {diffFromAdded === 0
                            ? 'Chưa biến động'
                            : diffFromAdded < 0
                              ? `Đã giảm ${Math.abs(diffFromAdded).toLocaleString('vi-VN')} ₫`
                              : `Tăng ${diffFromAdded.toLocaleString('vi-VN')} ₫`}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="p-2 rounded-3 bg-primary-subtle border border-primary-subtle text-center">
                        <div className="small text-primary-emphasis">
                          Mức giá mục tiêu
                        </div>
                        <div className="fw-bold text-primary">
                          ≤ {item.targetPrice.toLocaleString('vi-VN')} ₫
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSlug(
                              editingSlug === item.slug ? null : item.slug
                            );
                            setEditTarget(item.targetPrice);
                          }}
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          style={{ fontSize: '11px' }}
                        >
                          Đổi mức giá ✎
                        </button>
                      </div>
                    </div>
                  </div>

                  {editingSlug === item.slug && (
                    <div className="p-3 rounded-3 bg-light border mb-3 d-flex align-items-center gap-2">
                      <input
                        type="number"
                        step={100000}
                        min={100000}
                        value={editTarget}
                        onChange={(e) => setEditTarget(Number(e.target.value || 0))}
                        className="form-control form-control-sm fw-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateTarget(item)}
                        className="btn btn-sm btn-primary rounded-pill px-3"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSlug(null)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2"
                      >
                        Hủy
                      </button>
                    </div>
                  )}

                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 pt-2 border-top mt-auto">
                    <button
                      type="button"
                      onClick={() => removeWatchlistItem(item.slug)}
                      className="btn btn-sm btn-outline-danger rounded-pill px-3"
                    >
                      Xóa khỏi danh sách
                    </button>
                    <div className="d-flex gap-2">
                      <Link
                        href={`${detailHref}#price-history-section`}
                        className="btn btn-sm btn-outline-primary rounded-pill px-3"
                      >
                        📈 Biểu đồ giá
                      </Link>
                      <Link
                        href={detailHref}
                        className="btn btn-sm btn-primary rounded-pill px-3 fw-medium"
                      >
                        Xem nơi bán tốt nhất →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
