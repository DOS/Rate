'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@repo/shared-data';
import { getMasterProductHref } from '@/lib/rate-api';
import {
  getWatchlist,
  removeWatchlistItem,
  subscribeWatchlist,
  upsertWatchlistItem,
  type WatchlistItem,
} from './watchlist-store';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import { getRadarSignal } from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';

interface WatchlistWorkspaceProps {
  catalogProducts: MasterProduct[];
  locale?: string;
}

interface LiveWatchlistDeal {
  slug: string;
  current_min_price: number;
  current_max_price: number;
  merchant_count: number;
  platform_count: number;
  offer_platforms: string[];
  best_offer: {
    id: string;
    title: string;
    price: number;
    original_price: number;
    url: string;
    platform: string;
    merchant_name: string;
    is_official_mall: boolean;
  } | null;
}

const PLATFORM_DISPLAY_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiki: 'Tiki',
  tiktok: 'TikTok Shop',
  cellphones: 'CellphoneS',
  tgdd: 'Thế Giới Di Động',
  fptshop: 'FPT Shop',
  hoangha: 'Hoàng Hà Mobile',
  didongviet: 'Di Động Việt',
  phongvu: 'Phong Vũ',
};

export default function WatchlistWorkspace({
  catalogProducts,
  locale,
}: WatchlistWorkspaceProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [liveDeals, setLiveDeals] = useState<Record<string, LiveWatchlistDeal>>(
    {}
  );
  const radarIndex = useDealRadarIndex();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<number>(0);
  const [subscriberEmail, setSubscriberEmail] = useState<string>('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [copiedPortfolioMd, setCopiedPortfolioMd] = useState<boolean>(false);

  useEffect(() => {
    const sync = () => setItems(getWatchlist());
    sync();
    return subscribeWatchlist(sync);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const slugs = items.map((x) => x.slug).join(',');
    let cancelled = false;
    fetch(`/api/v1/rate/watchlist?slugs=${encodeURIComponent(slugs)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.ok && json.items) {
          setLiveDeals(json.items as Record<string, LiveWatchlistDeal>);
        }
      })
      .catch(() => {
        // Fallback to SSR catalogProducts snapshot
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const productBySlug = new Map<string, MasterProduct>(
    catalogProducts.map((p) => [p.slug, p])
  );

  const handleQuickAddCatalog = (p: MasterProduct) => {
    const minP = Number(p.min_price || 0);
    const targetP = Math.round((minP * 0.95) / 100000) * 100000;
    const thumb =
      p.thumbnail ||
      (p.images && p.images.length > 0 ? p.images[0] || null : null);
    const resolvedHref = getMasterProductHref(p);
    const resolvedCategoryPath =
      resolvedHref.replace(`/${p.slug}`, '') || '/smartphones';
    upsertWatchlistItem({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      categoryPath: resolvedCategoryPath,
      thumbnail: thumb,
      priceWhenAdded: minP,
      targetPrice: targetP,
      addedAt: new Date().toISOString(),
    });
  };

  const handleUpdateTarget = async (item: WatchlistItem) => {
    const cleanTarget = Math.max(100000, Math.round(editTarget));
    upsertWatchlistItem({
      ...item,
      targetPrice: cleanTarget,
    });
    setEditingSlug(null);
    try {
      await fetch('/api/v1/rate/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: item.slug,
          targetPrice: cleanTarget,
          subscriberEmail: subscriberEmail.trim() || undefined,
          locale: locale || 'vi',
        }),
      });
    } catch {
      // Local watchlist already updated
    }
  };

  const handleSyncAllCloudAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setIsSyncingCloud(true);
    setCloudSyncStatus(null);
    try {
      await Promise.all(
        items.map((item) =>
          fetch('/api/v1/rate/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug: item.slug,
              targetPrice: item.targetPrice,
              subscriberEmail: subscriberEmail.trim() || undefined,
              locale: locale || 'vi',
            }),
          })
        )
      );
      setCloudSyncStatus(
        `Đã đồng bộ ${items.length} cảnh báo giá mục tiêu lên hệ thống Rate Cloud!`
      );
    } catch {
      setCloudSyncStatus('Đã lưu cấu hình cảnh báo giá trên trình duyệt.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const reachedCount = items.filter((item) => {
    const live = productBySlug.get(item.slug);
    const currentMin = live ? Number(live.min_price || 0) : item.priceWhenAdded;
    return currentMin > 0 && currentMin <= item.targetPrice;
  }).length;

  const portfolioStats = items.reduce(
    (acc, item) => {
      const liveProd = productBySlug.get(item.slug);
      const liveDeal = liveDeals[item.slug];
      const curMin =
        liveDeal?.current_min_price ||
        (liveProd ? Number(liveProd.min_price || 0) : item.priceWhenAdded);
      const curMax =
        liveDeal?.current_max_price ||
        (liveProd ? Number(liveProd.max_price || curMin) : curMin);
      const userR = liveProd
        ? Number(
            liveProd.user_rating_weighted || liveProd.average_rating || 4.7
          )
        : 4.7;
      acc.totalMinVnd += curMin;
      acc.totalTargetVnd += item.targetPrice;
      acc.totalSpreadSavingsVnd += Math.max(0, curMax - curMin);
      acc.ratingSum += userR;
      return acc;
    },
    {
      totalMinVnd: 0,
      totalTargetVnd: 0,
      totalSpreadSavingsVnd: 0,
      ratingSum: 0,
    }
  );
  const avgPortfolioRating =
    items.length > 0
      ? Number((portfolioStats.ratingSum / items.length).toFixed(2))
      : 0;

  const handleCopyPortfolioMarkdown = async () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    try {
      const lines = [
        `### 🔔 Danh Mục Theo Dõi Giá & Kiểm Toán Thiết Bị (Rate.vn Watchlist - ${items.length} mẫu)`,
        `- **Tổng giá trị danh mục (Giá thấp nhất 10 sàn):** ${portfolioStats.totalMinVnd.toLocaleString('vi-VN')} ₫`,
        `- **Tổng ngân sách mục tiêu đặt canh:** ${portfolioStats.totalTargetVnd.toLocaleString('vi-VN')} ₫`,
        `- **Tổng mức tiết kiệm chéo giữa các sàn:** ${portfolioStats.totalSpreadSavingsVnd.toLocaleString('vi-VN')} ₫`,
        `- **Điểm JReviews trung bình danh mục:** ★ ${avgPortfolioRating.toFixed(2)}/5.0`,
        ``,
        `| Thiết bị | Hãng | Giá thấp nhất hiện tại | Giá mục tiêu | Độ lệch 10 sàn | Trạng thái | Deal tốt nhất |`,
        `| :--- | :--- | :---: | :---: | :---: | :---: | :--- |`,
        ...items.map((item) => {
          const liveProd = productBySlug.get(item.slug);
          const liveDeal = liveDeals[item.slug];
          const rSig = getRadarSignal(radarIndex, item.slug);
          const curMin =
            liveDeal?.current_min_price ||
            (liveProd ? Number(liveProd.min_price || 0) : item.priceWhenAdded);
          const curMax =
            liveDeal?.current_max_price ||
            (liveProd ? Number(liveProd.max_price || curMin) : curMin);
          const fallbackSpreadVnd = Math.max(0, curMax - curMin);
          const spreadStr = rSig?.priceSpread
            ? `+${rSig.priceSpread.spreadPct}% (${rSig.priceSpread.spreadVnd.toLocaleString('vi-VN')} ₫)`
            : fallbackSpreadVnd > 0
              ? `${fallbackSpreadVnd.toLocaleString('vi-VN')} ₫`
              : '0 ₫';
          const hit = curMin > 0 && curMin <= item.targetPrice;
          const bestOfferStr = liveDeal?.best_offer
            ? `${liveDeal.best_offer.merchant_name} (${liveDeal.best_offer.platform.toUpperCase()})`
            : `${liveProd?.merchant_count || 1} nguồn`;
          return `| ${item.name} | ${item.brand} | ${curMin.toLocaleString('vi-VN')} ₫ | ${item.targetPrice.toLocaleString('vi-VN')} ₫ | ${spreadStr} | ${hit ? '✅ Đạt mục tiêu' : '⏳ Đang canh'} | ${bestOfferStr} |`;
        }),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPortfolioMd(true);
      setTimeout(() => setCopiedPortfolioMd(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadPortfolioCsv = () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const headers = [
      'Slug',
      'Product Name',
      'Brand',
      'Category Path',
      'Current Lowest Price (VND)',
      'Target Price (VND)',
      'Price Spread 10-Platform (VND)',
      'Price Spread 10-Platform (%)',
      'Status',
      'Best Merchant',
      'Platform',
    ];
    const rows = items.map((item) => {
      const liveProd = productBySlug.get(item.slug);
      const liveDeal = liveDeals[item.slug];
      const rSig = getRadarSignal(radarIndex, item.slug);
      const curMin =
        liveDeal?.current_min_price ||
        (liveProd ? Number(liveProd.min_price || 0) : item.priceWhenAdded);
      const curMax =
        liveDeal?.current_max_price ||
        (liveProd ? Number(liveProd.max_price || curMin) : curMin);
      const spreadVnd =
        rSig?.priceSpread?.spreadVnd ?? Math.max(0, curMax - curMin);
      const spreadPct =
        rSig?.priceSpread?.spreadPct ??
        (curMin > 0 ? Math.round(((curMax - curMin) / curMin) * 1000) / 10 : 0);
      const hit = curMin > 0 && curMin <= item.targetPrice;
      const esc = (v: string | number) =>
        `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        esc(item.slug),
        esc(item.name),
        esc(item.brand),
        esc(item.categoryPath || '/smartphones'),
        esc(curMin),
        esc(item.targetPrice),
        esc(spreadVnd),
        esc(spreadPct),
        esc(hit ? 'TARGET_REACHED' : 'WATCHING'),
        esc(liveDeal?.best_offer?.merchant_name || ''),
        esc(liveDeal?.best_offer?.platform || ''),
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rate-vn-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPortfolioJson = () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const payload = {
      source: 'Rate.vn Watchlist Portfolio',
      exportedAt: new Date().toISOString(),
      portfolioStats,
      items: items.map((item) => {
        const liveProd = productBySlug.get(item.slug);
        const liveDeal = liveDeals[item.slug];
        const rSig = getRadarSignal(radarIndex, item.slug);
        const curMin =
          liveDeal?.current_min_price ||
          (liveProd ? Number(liveProd.min_price || 0) : item.priceWhenAdded);
        const curMax =
          liveDeal?.current_max_price ||
          (liveProd ? Number(liveProd.max_price || curMin) : curMin);
        return {
          ...item,
          currentMinPriceVnd: curMin,
          currentMaxPriceVnd: curMax,
          priceSpread10Platform: rSig?.priceSpread ?? {
            spreadVnd: Math.max(0, curMax - curMin),
            spreadPct:
              curMin > 0
                ? Math.round(((curMax - curMin) / curMin) * 1000) / 10
                : 0,
          },
          targetReached: curMin > 0 && curMin <= item.targetPrice,
          bestOffer: liveDeal?.best_offer || null,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rate-vn-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container py-5">
      {/* Header Banner (DESIGN.md v3.0 Dark Obsidian Command Header) */}
      <div className="rate-scoreboard-dark p-md-5 mb-4 p-4">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
          <div>
            <span className="badge bg-danger rounded-pill mb-2 px-3 py-2 text-white">
              🔔 Hệ Thống Canh Giá Thật &amp; Cảnh Báo Chạm Đáy Lịch Sử
            </span>
            <h1 className="h2 fw-bold mb-2 text-white">
              Danh Sách Theo Dõi Biến Động Giá ({items.length})
            </h1>
            <p className="text-white-50 mb-0">
              Đối chiếu giá thấp nhất trực tiếp từ `rate.master_products` và
              chuỗi thời gian `rate.price_history` để báo hiệu ngay khi chạm mức
              giá mục tiêu của bạn.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyPortfolioMarkdown}
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  {copiedPortfolioMd
                    ? '✓ Đã sao chép Markdown!'
                    : '📋 Sao chép danh mục Markdown'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPortfolioCsv}
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  📥 Xuất bảng CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPortfolioJson}
                  data-testid="download-watchlist-json-btn"
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  📦 Xuất JSON
                </button>
              </>
            )}
            <Link
              href="/inspect"
              className="btn btn-outline-light rounded-pill px-4"
            >
              🔬 Kiểm toán Link TMĐT
            </Link>
            <Link
              href="/smartphones"
              className="btn btn-outline-light rounded-pill px-4"
            >
              + Thêm sản phẩm từ danh mục
            </Link>
            {(() => {
              const firstCat = items[0]?.categoryPath || '/smartphones';
              const sameCatItems = items.filter(
                (x) => (x.categoryPath || '/smartphones') === firstCat
              );
              if (sameCatItems.length < 2) return null;
              const catSlug = firstCat.replace(/^\//, '') || 'smartphones';
              return (
                <Link
                  href={`/compare?cat=${catSlug}&slugs=${sameCatItems
                    .slice(0, 4)
                    .map((x) => x.slug)
                    .join(',')}`}
                  className="btn btn-danger rounded-pill fw-medium px-4"
                >
                  ⚖️ So sánh {Math.min(4, sameCatItems.length)} máy cùng danh
                  mục
                </Link>
              );
            })()}
          </div>
        </div>

        {/* Portfolio Value & Savings Summary Strip (#66) */}
        {items.length > 0 && (
          <div className="row g-3 border-top border-secondary border-opacity-25 mt-3 pt-3">
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  Tổng giá trị danh mục (Giá đáy)
                </div>
                <div className="h5 fw-bold font-monospace rate-tabular mb-0 text-white">
                  {portfolioStats.totalMinVnd.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  Tổng ngân sách mục tiêu
                </div>
                <div className="h5 fw-bold font-monospace text-info rate-tabular mb-0">
                  {portfolioStats.totalTargetVnd.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.28)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  Tiết kiệm chéo giữa 10 sàn
                </div>
                <div className="h5 fw-bold font-monospace text-success rate-tabular mb-0">
                  +
                  {portfolioStats.totalSpreadSavingsVnd.toLocaleString('vi-VN')}{' '}
                  ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  Điểm JReviews trung bình danh mục
                </div>
                <div className="h5 fw-bold font-monospace text-warning rate-tabular mb-0">
                  ★ {avgPortfolioRating.toFixed(2)} / 5.0
                </div>
              </div>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <form
            onSubmit={handleSyncAllCloudAlerts}
            className="row g-2 align-items-center border-top border-secondary border-opacity-25 mt-3 pt-3"
          >
            <div className="col-md-8">
              <input
                type="email"
                className="form-control form-control-sm rounded-pill px-3"
                placeholder="Nhập email nhận thông báo khi giá chạm ngưỡng mục tiêu (Tùy chọn - Cloud Alert API)..."
                value={subscriberEmail}
                onChange={(e) => setSubscriberEmail(e.target.value)}
              />
            </div>
            <div className="col-md-4 d-grid">
              <button
                type="submit"
                disabled={isSyncingCloud}
                className="btn btn-sm btn-danger rounded-pill fw-semibold"
              >
                {isSyncingCloud
                  ? 'Đang đồng bộ Cloud...'
                  : '☁️ Đồng Bộ Cảnh Báo Lên Rate Cloud'}
              </button>
            </div>
            {cloudSyncStatus && (
              <div className="small text-success fw-medium col-12 mt-1">
                ✓ {cloudSyncStatus}
              </div>
            )}
          </form>
        )}

        {/* Summary KPI Strip */}
        <div className="row g-3 border-top border-secondary border-opacity-25 mt-3 pt-3">
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
              <div className="small text-white-50">Sản phẩm đang theo dõi</div>
              <div className="h4 fw-bold mb-0 text-white">
                {items.length} mẫu
              </div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
              <div className="small text-white-50">Đã chạm mục tiêu mua</div>
              <div className="h4 fw-bold text-success mb-0">
                {reachedCount} mẫu đạt giá mục tiêu
              </div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
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
        <div className="card rounded-4 p-md-5 mb-4 border bg-white p-4 text-center shadow-sm">
          <div className="display-5 mb-3">🔔</div>
          <h3 className="h5 fw-bold mb-2">
            Bạn chưa thêm sản phẩm nào vào danh sách canh giá
          </h3>
          <p
            className="text-muted small mx-auto mb-4"
            style={{ maxWidth: '560px' }}
          >
            Hãy chọn nhanh một mẫu máy bên dưới hoặc bấm nút{' '}
            <strong>&ldquo;🔔 Theo dõi giảm giá&rdquo;</strong> trên bất kỳ
            trang chi tiết sản phẩm nào để thiết lập ngưỡng giá mục tiêu.
          </p>

          {catalogProducts.length > 0 && (
            <div className="row g-3 justify-content-center mt-2 text-start">
              {catalogProducts.slice(0, 3).map((p) => {
                const minP = Number(p.min_price || 0);
                const thumb =
                  p.thumbnail ||
                  (p.images && p.images.length > 0
                    ? p.images[0]
                    : '/img/placeholder.png');
                return (
                  <div key={p.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card rounded-4 bg-light h-100 border p-3">
                      <div className="d-flex align-items-center mb-3 gap-3">
                        <img
                          src={thumb}
                          alt={p.name}
                          className="rounded border bg-white p-1"
                          style={{
                            width: '64px',
                            height: '64px',
                            objectFit: 'contain',
                          }}
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
                        className="btn btn-sm btn-primary rounded-pill fw-medium w-100"
                      >
                        🔔 Canh giảm 5% (≤{' '}
                        {(
                          Math.round((minP * 0.95) / 100000) * 100000
                        ).toLocaleString('vi-VN')}{' '}
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
            const dealInfo = liveDeals[item.slug];
            const currentMin = dealInfo?.current_min_price
              ? Number(dealInfo.current_min_price)
              : live
                ? Number(live.min_price || 0)
                : item.priceWhenAdded;
            const currentMax = dealInfo?.current_max_price
              ? Number(dealInfo.current_max_price)
              : live
                ? Number(live.max_price || currentMin)
                : currentMin;
            const diffFromAdded = currentMin - item.priceWhenAdded;
            const diffFromTarget = currentMin - item.targetPrice;
            const targetReached =
              currentMin > 0 && currentMin <= item.targetPrice;
            const detailHref = live
              ? getMasterProductHref(live)
              : `${item.categoryPath || '/smartphones'}/${item.slug}`;
            const bestOffer = dealInfo?.best_offer || null;
            const platformCount =
              dealInfo?.platform_count || live?.merchant_count || 1;
            const radarSignal = getRadarSignal(radarIndex, item.slug);

            return (
              <div key={item.slug} className="col-lg-6 col-12">
                <div
                  className={`card rounded-4 h-100 bg-white p-4 shadow-sm ${
                    targetReached ? 'border-success border-2' : 'border'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
                    <div className="d-flex align-items-center gap-3">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="rounded-3 bg-light border p-2"
                          style={{
                            width: '76px',
                            height: '76px',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <div
                          className="rounded-3 bg-light d-flex align-items-center justify-content-center text-muted small border"
                          style={{ width: '76px', height: '76px' }}
                        >
                          No Img
                        </div>
                      )}
                      <div>
                        <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                          <span className="badge bg-secondary-subtle text-secondary">
                            {item.brand}
                          </span>
                          {targetReached ? (
                            <span className="badge bg-success rounded-pill text-white">
                              🎉 Đã chạm giá mục tiêu!
                            </span>
                          ) : (
                            <span className="badge bg-warning-subtle text-warning-emphasis border-warning-subtle rounded-pill border">
                              ⏳ Đang chờ giảm thêm{' '}
                              {Math.max(0, diffFromTarget).toLocaleString(
                                'vi-VN'
                              )}{' '}
                              ₫
                            </span>
                          )}
                        </div>
                        {(radarSignal.genuineDeal ||
                          radarSignal.fakeSaleTrap ||
                          radarSignal.priceSpread) && (
                          <div
                            className="d-flex align-items-center mb-1 flex-wrap gap-1"
                            data-testid="watchlist-radar-signal"
                          >
                            {radarSignal.genuineDeal && (
                              <span className="badge bg-success-subtle text-success rounded-pill small">
                                🟢 Kèo đáy lịch sử (-
                                {radarSignal.genuineDeal.savingsVsMedianPct}% so
                                trung vị tại{' '}
                                {radarSignal.genuineDeal.platform.toUpperCase()}
                                )
                              </span>
                            )}
                            {radarSignal.fakeSaleTrap && (
                              <span className="badge bg-danger-subtle text-danger rounded-pill small">
                                🚨 Cảnh báo sàn{' '}
                                {radarSignal.fakeSaleTrap.platform.toUpperCase()}{' '}
                                kê khống +
                                {radarSignal.fakeSaleTrap.fakeMarkupPct}%
                              </span>
                            )}
                            {radarSignal.priceSpread &&
                              radarSignal.priceSpread.spreadPct >= 3 && (
                                <span
                                  className="badge bg-warning-subtle text-dark border-warning-subtle rounded-pill small border"
                                  data-testid="watchlist-price-spread-badge"
                                >
                                  📊 Độ lệch 10 sàn +
                                  {radarSignal.priceSpread.spreadPct}% (Chênh{' '}
                                  {radarSignal.priceSpread.spreadVnd.toLocaleString(
                                    'vi-VN'
                                  )}{' '}
                                  ₫ giữa{' '}
                                  {radarSignal.priceSpread.cheapestPlatform.toUpperCase()}{' '}
                                  &amp;{' '}
                                  {radarSignal.priceSpread.priciestPlatform.toUpperCase()}
                                  )
                                </span>
                              )}
                          </div>
                        )}
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
                      includeWatchlist={false}
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
                      <div className="rounded-3 bg-light border p-2 text-center">
                        <div className="small text-muted">
                          Giá hiện tại thấp nhất
                        </div>
                        <div className="fw-bold text-danger">
                          {currentMin.toLocaleString('vi-VN')} ₫
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '11px' }}
                        >
                          {currentMin !== currentMax
                            ? `Cao nhất: ${currentMax.toLocaleString('vi-VN')} ₫`
                            : `${live?.merchant_count || 1} nơi bán`}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="rounded-3 bg-light border p-2 text-center">
                        <div className="small text-muted">
                          Giá lúc bắt đầu lưu
                        </div>
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
                      <div className="rounded-3 bg-primary-subtle border-primary-subtle border p-2 text-center">
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
                          className="btn btn-link btn-sm text-decoration-none p-0"
                          style={{ fontSize: '11px' }}
                        >
                          Đổi mức giá ✎
                        </button>
                      </div>
                    </div>
                  </div>

                  {bestOffer && (
                    <div
                      className={`rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 border px-3 py-2 ${
                        targetReached
                          ? 'bg-success-subtle border-success-subtle text-success-emphasis'
                          : 'bg-light text-dark'
                      }`}
                    >
                      <div className="small">
                        <span className="fw-semibold">
                          🔥 Giá thấp nhất trên {platformCount} sàn/đại lý:
                        </span>{' '}
                        <span className="badge bg-dark rounded-pill me-1 text-white">
                          {PLATFORM_DISPLAY_LABELS[bestOffer.platform] ||
                            bestOffer.platform.toUpperCase()}
                        </span>
                        <span className="fw-medium">
                          {bestOffer.merchant_name}
                        </span>{' '}
                        {bestOffer.is_official_mall && (
                          <span className="badge bg-success-subtle text-success border-success-subtle border">
                            Official Mall
                          </span>
                        )}
                      </div>
                      <a
                        href={bestOffer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="small fw-semibold text-primary text-decoration-none"
                      >
                        Mở deal {bestOffer.price.toLocaleString('vi-VN')} ₫ ↗
                      </a>
                    </div>
                  )}

                  {editingSlug === item.slug && (
                    <div className="rounded-3 bg-light d-flex align-items-center mb-3 gap-2 border p-3">
                      <input
                        type="number"
                        step={100000}
                        min={100000}
                        value={editTarget}
                        onChange={(e) =>
                          setEditTarget(Number(e.target.value || 0))
                        }
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

                  <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
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
                        className="btn btn-sm btn-primary rounded-pill fw-medium px-3"
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
