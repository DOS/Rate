'use client';

import React, { useMemo, useState } from 'react';
import type {
  DiscountVerdictType,
  MasterProductPriceHistorySummary,
  OfferDiscountAnalysis,
  PriceHistoryPoint,
} from '@/lib/rate-api';

interface PriceHistorySectionProps {
  productName: string;
  history: MasterProductPriceHistorySummary;
}

type TimeRangeKey = '30d' | '90d' | 'all';

const SERIES_COLORS = [
  '#dc2626',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
];

function getVerdictBadgeStyle(verdict: DiscountVerdictType): {
  badgeClass: string;
  icon: string;
} {
  switch (verdict) {
    case 'fake_discount':
      return {
        badgeClass: 'bg-danger text-white',
        icon: '🚨',
      };
    case 'suspicious_discount':
      return {
        badgeClass: 'bg-warning text-dark',
        icon: '⚠️',
      };
    case 'genuine_deal':
      return {
        badgeClass: 'bg-success text-white',
        icon: '✅',
      };
    default:
      return {
        badgeClass: 'bg-secondary-subtle text-secondary-emphasis',
        icon: '📊',
      };
  }
}

function formatVnd(price: number | null | undefined): string {
  if (price == null || price <= 0) return '-';
  return `${Math.round(price).toLocaleString('vi-VN')} ₫`;
}

function formatCompactVnd(price: number): string {
  if (price >= 1_000_000) {
    const tr = price / 1_000_000;
    return `${tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(1)}tr`;
  }
  if (price >= 1_000) {
    return `${Math.round(price / 1_000)}k`;
  }
  return `${price}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export default function PriceHistorySection({
  productName,
  history,
}: PriceHistorySectionProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all');
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const offerAnalyses = useMemo<OfferDiscountAnalysis[]>(
    () => Object.values(history.byOffer),
    [history.byOffer]
  );

  // Reference anchor timestamp = latest observation in dataset (deterministic for SSR/Client)
  const latestTimestampMs = useMemo(() => {
    if (history.points.length === 0) return 0;
    let maxMs = 0;
    for (const pt of history.points) {
      const ms = new Date(pt.recorded_at).getTime();
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs;
  }, [history.points]);

  const filteredPoints = useMemo<PriceHistoryPoint[]>(() => {
    let pts = history.points;
    if (selectedProductId !== 'ALL') {
      pts = pts.filter((p) => p.product_id === selectedProductId);
    }
    if (timeRange !== 'all' && latestTimestampMs > 0) {
      const days = timeRange === '30d' ? 30 : 90;
      const cutoff = latestTimestampMs - days * 24 * 60 * 60 * 1000;
      const withinRange = pts.filter(
        (p) => new Date(p.recorded_at).getTime() >= cutoff
      );
      if (withinRange.length > 0) {
        pts = withinRange;
      }
    }
    return pts;
  }, [history.points, selectedProductId, timeRange, latestTimestampMs]);

  // SVG Chart dimensions & coordinate mapping
  const chartGeometry = useMemo(() => {
    const width = 820;
    const height = 280;
    const padLeft = 72;
    const padRight = 28;
    const padTop = 26;
    const padBottom = 42;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (filteredPoints.length === 0) {
      return null;
    }

    const allValues: number[] = [];
    for (const pt of filteredPoints) {
      if (pt.price > 0) allValues.push(pt.price);
      if (pt.price_original && pt.price_original > pt.price) {
        allValues.push(pt.price_original);
      }
    }

    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const span = Math.max(rawMax - rawMin, rawMin * 0.08, 500_000);
    const minY = Math.max(0, Math.floor((rawMin - span * 0.15) / 100_000) * 100_000);
    const maxY = Math.ceil((rawMax + span * 0.15) / 100_000) * 100_000;
    const yRange = Math.max(maxY - minY, 1);

    const times = filteredPoints.map((p) => new Date(p.recorded_at).getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const tRange = maxT - minT;
    const isSingleMoment = tRange < 60_000;

    const getX = (index: number, total: number, tMs: number) => {
      if (total <= 1) return padLeft + plotW / 2;
      if (isSingleMoment) {
        const bandW = Math.min(plotW * 0.6, total * 90);
        const startX = padLeft + (plotW - bandW) / 2;
        return startX + (index / (total - 1)) * bandW;
      }
      return padLeft + ((tMs - minT) / tRange) * plotW;
    };

    const getY = (val: number) => {
      return padTop + plotH - ((val - minY) / yRange) * plotH;
    };

    const mapped = filteredPoints.map((pt, idx) => {
      const tMs = new Date(pt.recorded_at).getTime();
      const x = getX(idx, filteredPoints.length, tMs);
      const yPrice = getY(pt.price);
      const yOriginal =
        pt.price_original && pt.price_original > pt.price
          ? getY(pt.price_original)
          : null;
      return {
        pt,
        idx,
        x,
        yPrice,
        yOriginal,
      };
    });

    // Group by product_id to draw separate lines per merchant offer
    const seriesMap = new Map<
      string,
      {
        productId: string;
        merchantName: string;
        color: string;
        nodes: typeof mapped;
      }
    >();

    offerAnalyses.forEach((oa, i) => {
      seriesMap.set(oa.product_id, {
        productId: oa.product_id,
        merchantName: oa.merchant_name,
        color: SERIES_COLORS[i % SERIES_COLORS.length] || '#dc2626',
        nodes: [],
      });
    });

    for (const node of mapped) {
      const existing = seriesMap.get(node.pt.product_id);
      if (existing) {
        existing.nodes.push(node);
      } else {
        seriesMap.set(node.pt.product_id, {
          productId: node.pt.product_id,
          merchantName: node.pt.merchant_name,
          color: '#dc2626',
          nodes: [node],
        });
      }
    }

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = minY + ratio * yRange;
      return {
        value,
        y: getY(value),
      };
    });

    const lowestEverY =
      history.lowestEverPrice &&
      history.lowestEverPrice >= minY &&
      history.lowestEverPrice <= maxY
        ? getY(history.lowestEverPrice)
        : null;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      isSingleMoment,
      mapped,
      series: Array.from(seriesMap.values()).filter((s) => s.nodes.length > 0),
      yTicks,
      lowestEverY,
    };
  }, [filteredPoints, offerAnalyses, history.lowestEverPrice]);

  const activeNode =
    chartGeometry && activePointIndex != null
      ? chartGeometry.mapped[activePointIndex] ||
        chartGeometry.mapped[chartGeometry.mapped.length - 1]
      : chartGeometry?.mapped[chartGeometry.mapped.length - 1] || null;

  return (
    <div
      id="price-history-section"
      className="card border-0 shadow-sm rounded-4 p-4 p-md-5 mb-5"
    >
      {/* Header & Summary Badges */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3 mb-4">
        <div>
          <h2 className="h4 fw-bold mb-1 d-flex align-items-center gap-2">
            <span>📈</span> Biểu Đồ Lịch Sử Giá &amp; Kiểm Chứng Giảm Giá Ảo
          </h2>
          <p className="text-muted small mb-0">
            Theo dõi biến động giá thực tế theo thời gian của{' '}
            <strong>{productName}</strong> và phát hiện hành vi nâng khống giá
            gạch ngang trước các đợt Sale.
          </p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {history.fakeDiscountCount > 0 ? (
            <span className="badge bg-danger text-white px-3 py-2 rounded-pill small">
              🚨 Phát hiện {history.fakeDiscountCount} nơi bán nâng giá gốc / giảm ảo
            </span>
          ) : (
            <span className="badge bg-success-subtle text-success px-3 py-2 rounded-pill small">
              ✓ Không phát hiện chiêu trò nâng khống giá gốc
            </span>
          )}
          {history.genuineDealCount > 0 && (
            <span className="badge bg-success text-white px-3 py-2 rounded-pill small">
              🔥 {history.genuineDealCount} nơi bán đang ở vùng giá tốt thật
            </span>
          )}
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="border rounded-4 p-3 h-100 bg-light">
            <div className="text-muted small mb-1">Giá tốt nhất hiện tại</div>
            <div className="h5 fw-bold text-danger mb-1">
              {formatVnd(history.currentMinPrice)}
            </div>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              Tổng hợp từ {offerAnalyses.length} gian hàng
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="border rounded-4 p-3 h-100 bg-success-subtle border-success-subtle">
            <div className="text-success-emphasis small mb-1">
              Đáy giá lịch sử từng ghi nhận
            </div>
            <div className="h5 fw-bold text-success mb-1">
              {formatVnd(history.lowestEverPrice)}
            </div>
            <div className="text-success-emphasis" style={{ fontSize: '0.75rem' }}>
              {history.lowestEverMerchant
                ? `${history.lowestEverMerchant} (${history.lowestEverDate ? formatDateShort(history.lowestEverDate) : ''})`
                : 'Dữ liệu chuẩn hóa Rate.vn'}
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="border rounded-4 p-3 h-100 bg-light">
            <div className="text-muted small mb-1">Đỉnh giá thực tế</div>
            <div className="h5 fw-bold text-dark mb-1">
              {formatVnd(history.highestEverPrice)}
            </div>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              Dựa trên {history.points.length} mốc quan sát giá
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div
            className={`border rounded-4 p-3 h-100 ${
              history.fakeDiscountCount > 0
                ? 'bg-danger-subtle border-danger-subtle'
                : 'bg-light'
            }`}
          >
            <div className="text-muted small mb-1">Kiểm định khuyến mãi AI</div>
            <div
              className={`h5 fw-bold mb-1 ${
                history.fakeDiscountCount > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {history.fakeDiscountCount > 0
                ? `${history.fakeDiscountCount} Cảnh báo ảo`
                : '100% Minh bạch'}
            </div>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              So sánh giá gạch ngang vs lịch sử thực
            </div>
          </div>
        </div>
      </div>

      {/* Controls: Merchant Filter & Time Range */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-3">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="small text-muted fw-medium me-1">Gian hàng:</span>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId('ALL');
              setActivePointIndex(null);
            }}
            className={`btn btn-sm rounded-pill px-3 ${
              selectedProductId === 'ALL'
                ? 'btn-dark fw-semibold'
                : 'btn-outline-secondary'
            }`}
          >
            Tất cả ({offerAnalyses.length})
          </button>
          {offerAnalyses.map((oa, idx) => {
            const color = SERIES_COLORS[idx % SERIES_COLORS.length] || '#dc2626';
            const isSelected = selectedProductId === oa.product_id;
            return (
              <button
                key={oa.product_id}
                type="button"
                onClick={() => {
                  setSelectedProductId(oa.product_id);
                  setActivePointIndex(null);
                }}
                className={`btn btn-sm rounded-pill px-3 d-inline-flex align-items-center gap-2 ${
                  isSelected ? 'btn-dark fw-semibold' : 'btn-outline-secondary'
                }`}
              >
                <span
                  className="rounded-circle d-inline-block"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: color,
                  }}
                />
                <span>{oa.merchant_name}</span>
              </button>
            );
          })}
        </div>

        <div className="btn-group btn-group-sm" role="group" aria-label="Khoảng thời gian">
          {(
            [
              { key: '30d', label: '30 ngày' },
              { key: '90d', label: '90 ngày' },
              { key: 'all', label: 'Toàn bộ' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTimeRange(item.key);
                setActivePointIndex(null);
              }}
              className={`btn ${
                timeRange === item.key ? 'btn-danger' : 'btn-outline-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Time-Series Chart */}
      {chartGeometry ? (
        <div className="border rounded-4 p-3 bg-white mb-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-2">
            <div className="d-flex flex-wrap align-items-center gap-3 small">
              <span className="d-inline-flex align-items-center gap-1 text-dark fw-medium">
                <span
                  style={{
                    width: '18px',
                    height: '3px',
                    backgroundColor: '#dc2626',
                    display: 'inline-block',
                  }}
                />
                Giá bán thực tế (Actual Price)
              </span>
              <span className="d-inline-flex align-items-center gap-1 text-muted">
                <span
                  style={{
                    width: '18px',
                    height: '0px',
                    borderTop: '2px dashed #9ca3af',
                    display: 'inline-block',
                  }}
                />
                Giá gốc gạch ngang (Claimed Original)
              </span>
              <span className="d-inline-flex align-items-center gap-1 text-success">
                <span
                  style={{
                    width: '18px',
                    height: '0px',
                    borderTop: '2px dotted #16a34a',
                    display: 'inline-block',
                  }}
                />
                Đáy giá lịch sử ({formatVnd(history.lowestEverPrice)})
              </span>
            </div>

            {activeNode && (
              <div className="badge bg-light text-dark border px-3 py-2 rounded-pill small">
                📅 {formatDateShort(activeNode.pt.recorded_at)} -{' '}
                <strong>{activeNode.pt.merchant_name}</strong>:{' '}
                <span className="text-danger fw-bold">
                  {formatVnd(activeNode.pt.price)}
                </span>
                {activeNode.pt.price_original &&
                  activeNode.pt.price_original > activeNode.pt.price && (
                    <span className="text-muted ms-2 text-decoration-line-through">
                      {formatVnd(activeNode.pt.price_original)}
                    </span>
                  )}
              </div>
            )}
          </div>

          <div className="table-responsive">
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="w-100"
              style={{ minWidth: '580px', maxHeight: '300px' }}
              role="img"
              aria-label={`Biểu đồ lịch sử giá của ${productName}`}
            >
              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {chartGeometry.yTicks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={chartGeometry.padLeft}
                    y1={t.y}
                    x2={chartGeometry.width - chartGeometry.padRight}
                    y2={t.y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                  <text
                    x={chartGeometry.padLeft - 8}
                    y={t.y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#64748b"
                  >
                    {formatCompactVnd(t.value)}
                  </text>
                </g>
              ))}

              {/* Historical Lowest Price Reference Line */}
              {chartGeometry.lowestEverY != null && (
                <line
                  x1={chartGeometry.padLeft}
                  y1={chartGeometry.lowestEverY}
                  x2={chartGeometry.width - chartGeometry.padRight}
                  y2={chartGeometry.lowestEverY}
                  stroke="#16a34a"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              )}

              {/* Merchant Series Lines */}
              {chartGeometry.series.map((s) => {
                const actualPointsAttr = s.nodes
                  .map((n) => `${n.x.toFixed(1)},${n.yPrice.toFixed(1)}`)
                  .join(' ');
                const origNodes = s.nodes.filter((n) => n.yOriginal != null);
                const origPointsAttr = origNodes
                  .map((n) => `${n.x.toFixed(1)},${(n.yOriginal ?? n.yPrice).toFixed(1)}`)
                  .join(' ');

                return (
                  <g key={s.productId}>
                    {origNodes.length >= 2 && (
                      <polyline
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.75"
                        strokeDasharray="5 4"
                        points={origPointsAttr}
                      />
                    )}
                    {s.nodes.length >= 2 && (
                      <polyline
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={actualPointsAttr}
                      />
                    )}

                    {/* Data Points */}
                    {s.nodes.map((n) => {
                      const isHovered = activeNode?.idx === n.idx;
                      return (
                        <g
                          key={`${s.productId}-${n.idx}`}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setActivePointIndex(n.idx)}
                          onClick={() => setActivePointIndex(n.idx)}
                        >
                          {n.yOriginal != null && (
                            <>
                              <line
                                x1={n.x}
                                y1={n.yOriginal}
                                x2={n.x}
                                y2={n.yPrice}
                                stroke="#cbd5e1"
                                strokeWidth="1"
                                strokeDasharray="2 2"
                              />
                              <circle
                                cx={n.x}
                                cy={n.yOriginal}
                                r={isHovered ? 5 : 3.5}
                                fill="#ffffff"
                                stroke="#94a3b8"
                                strokeWidth="2"
                              />
                            </>
                          )}
                          <circle
                            cx={n.x}
                            cy={n.yPrice}
                            r={isHovered ? 6.5 : 4.5}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* X-Axis Date Labels */}
              {chartGeometry.mapped.length > 0 &&
                (chartGeometry.isSingleMoment ? (
                  <text
                    x={chartGeometry.padLeft + chartGeometry.plotW / 2}
                    y={chartGeometry.height - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#64748b"
                  >
                    {formatDateShort(chartGeometry.mapped[0]?.pt.recorded_at || '')}
                  </text>
                ) : (
                  <>
                    <text
                      x={chartGeometry.mapped[0]?.x ?? chartGeometry.padLeft}
                      y={chartGeometry.height - 12}
                      textAnchor="start"
                      fontSize="11"
                      fill="#64748b"
                    >
                      {formatDateShort(chartGeometry.mapped[0]?.pt.recorded_at || '')}
                    </text>
                    {chartGeometry.mapped.length >= 3 && (
                      <text
                        x={
                          chartGeometry.mapped[
                            Math.floor(chartGeometry.mapped.length / 2)
                          ]?.x ?? chartGeometry.width / 2
                        }
                        y={chartGeometry.height - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#64748b"
                      >
                        {formatDateShort(
                          chartGeometry.mapped[
                            Math.floor(chartGeometry.mapped.length / 2)
                          ]?.pt.recorded_at || ''
                        )}
                      </text>
                    )}
                    {chartGeometry.mapped.length >= 2 && (
                      <text
                        x={
                          chartGeometry.mapped[chartGeometry.mapped.length - 1]
                            ?.x ?? chartGeometry.width - chartGeometry.padRight
                        }
                        y={chartGeometry.height - 12}
                        textAnchor="end"
                        fontSize="11"
                        fill="#64748b"
                      >
                        {formatDateShort(
                          chartGeometry.mapped[chartGeometry.mapped.length - 1]
                            ?.pt.recorded_at || ''
                        )}
                      </text>
                    )}
                  </>
                ))}
            </svg>
          </div>
        </div>
      ) : (
        <div className="alert alert-light border rounded-4 text-muted small mb-4">
          Chưa có dữ liệu chuỗi thời gian cho bộ lọc này.
        </div>
      )}

      {/* Per-Merchant Fake Discount Detector Cards */}
      <div>
        <h3 className="h6 fw-bold mb-3 d-flex align-items-center gap-2">
          <span>🔍</span> Phân Tích Độ Trung Thực Giá Khuyến Mãi Từng Gian Hàng
        </h3>
        <div className="row g-3">
          {offerAnalyses.map((oa) => {
            const style = getVerdictBadgeStyle(oa.verdict);
            return (
              <div key={oa.product_id} className="col-12 col-md-6">
                <div className="border rounded-4 p-3 h-100 bg-white">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div>
                      <span className="badge bg-danger text-uppercase me-2 small">
                        {oa.platform}
                      </span>
                      <span className="fw-bold text-dark small">
                        {oa.merchant_name}
                      </span>
                    </div>
                    <span className={`badge ${style.badgeClass} rounded-pill px-3 py-1 small`}>
                      {style.icon} {oa.badge_label}
                    </span>
                  </div>

                  <div className="d-flex flex-wrap align-items-baseline gap-3 mb-2">
                    <div>
                      <span className="text-muted small">Giá hiện tại: </span>
                      <span className="fw-bold text-danger">
                        {formatVnd(oa.price_current)}
                      </span>
                    </div>
                    {oa.price_original && (
                      <div>
                        <span className="text-muted small">Giá gạch ngang: </span>
                        <span className="text-muted text-decoration-line-through small">
                          {formatVnd(oa.price_original)}
                        </span>
                        <span className="badge bg-light text-dark border ms-1 small">
                          -{oa.claimed_discount_pct}% công bố
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="d-flex flex-wrap gap-3 text-muted mb-2" style={{ fontSize: '0.78rem' }}>
                    <span>
                      Trung vị lịch sử: <strong>{formatVnd(oa.historical_median_price)}</strong>
                    </span>
                    <span>
                      Thấp nhất: <strong>{formatVnd(oa.historical_min_price)}</strong>
                    </span>
                    <span>
                      Cao nhất: <strong>{formatVnd(oa.historical_max_price)}</strong>
                    </span>
                  </div>

                  <p className="small text-secondary mb-0 lh-sm">
                    {oa.explanation}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
