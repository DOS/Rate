'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/lib/navigation';
import type { KeySpecs, MasterProduct } from '@repo/shared-data';
import {
  getMasterProductHref,
  type MerchantSummary,
  type UrlInspectionResult,
} from '@/lib/rate-api';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import { getRadarSignal } from '@/lib/deal-radar';
import {
  BsArrowRight,
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsLightningChargeFill,
  BsLink45Deg,
  BsSearch,
  BsShieldCheck,
  BsShop,
  BsStarFill,
  BsXLg,
} from 'react-icons/bs';

interface HeroSearchInspectorProps {
  initialProducts: MasterProduct[];
  initialMerchants: MerchantSummary[];
}

const SAMPLE_INSPECT_LINKS = [
  {
    label: 'iPhone 16 128GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-128GB-i.88201679.27110898667',
  },
  {
    label: 'iPhone 16 Plus 256GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-Plus-256GB-i.88201679.29410893286',
  },
  {
    label: 'iPhone 15 128GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-15-128GB-i.88201679.18093055535',
  },
  {
    label: 'Shop: Apple Flagship Store',
    value: 'https://shopee.vn/shop/88201679',
  },
];

function isLikelyEcommerceUrl(input: string): boolean {
  const s = input.trim();
  return (
    /^https?:\/\//i.test(s) ||
    /shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|i\.\d+\.\d+/i.test(s)
  );
}

export default function HeroSearchInspector({
  initialProducts,
  initialMerchants,
}: HeroSearchInspectorProps) {
  const router = useRouter();
  const radarIndex = useDealRadarIndex();
  const [mode, setMode] = useState<'search' | 'inspect'>('search');
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [inspectQuery, setInspectQuery] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] =
    useState<UrlInspectionResult | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialProducts.slice(0, 5);
    return initialProducts
      .filter((item) => {
        const keySpecs = (item.key_specs || {}) as KeySpecs;
        const haystacks = [
          item.name,
          item.brand,
          item.model,
          item.variant_name || '',
          item.model_key,
          keySpecs.chip || '',
          keySpecs.screen || '',
        ];
        return haystacks.some((h) => h && h.toLowerCase().includes(q));
      })
      .slice(0, 6);
  }, [query, initialProducts]);

  const filteredMerchants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialMerchants.slice(0, 2);
    return initialMerchants
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.platform_shop_id.toLowerCase().includes(q) ||
          m.platform.toLowerCase().includes(q)
      )
      .slice(0, 3);
  }, [query, initialMerchants]);

  const runUrlInspection = async (targetInput: string) => {
    const cleaned = targetInput.trim();
    if (!cleaned) return;
    setMode('inspect');
    setInspectQuery(cleaned);
    setIsInspecting(true);
    setInspectError(null);

    try {
      const resp = await fetch(
        `/api/v1/rate/lookup?q=${encodeURIComponent(cleaned)}`
      );
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        throw new Error(
          json.error || 'Không thể tra cứu dữ liệu sản phẩm/shop'
        );
      }
      setInspectResult(json.data as UrlInspectionResult);
    } catch (err) {
      setInspectError(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ kiểm định'
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      router.push('/smartphones');
      return;
    }
    // If user pasted a Shopee/Lazada URL directly into the search box, switch to URL Inspector automatically!
    if (isLikelyEcommerceUrl(trimmed)) {
      setIsDropdownOpen(false);
      void runUrlInspection(trimmed);
      return;
    }
    if (activeIndex >= 0 && activeIndex < filteredProducts.length) {
      const target = filteredProducts[activeIndex];
      if (target) {
        setIsDropdownOpen(false);
        router.push(getMasterProductHref(target));
        return;
      }
    }
    setIsDropdownOpen(false);
    router.push(`/smartphones?q=${encodeURIComponent(trimmed)}`);
  };

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runUrlInspection(inspectQuery);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredProducts.length - 1
      );
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="position-relative text-start">
      {/* Mode Switcher Pills */}
      <div className="d-flex justify-content-center mb-3 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`btn btn-sm rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2 ${
            mode === 'search'
              ? 'btn-primary shadow-sm'
              : 'btn-dark bg-opacity-75 text-light border-secondary'
          }`}
        >
          <BsSearch />
          Tìm Sản Phẩm &amp; Thông Số (10 Nhóm)
        </button>
        <button
          type="button"
          onClick={() => setMode('inspect')}
          className={`btn btn-sm rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2 ${
            mode === 'inspect'
              ? 'btn-danger shadow-sm'
              : 'btn-dark bg-opacity-75 text-light border-secondary'
          }`}
        >
          <BsShieldCheck />
          Dán Link Kiểm Tra Giá Ảo &amp; Độ Uy Tín Shop
        </button>
      </div>

      {/* Mode 1: Autocomplete Product & Spec Search */}
      {mode === 'search' ? (
        <div className="position-relative">
          <form
            onSubmit={handleSearchSubmit}
            className="search-wrap rounded-pill border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsSearch className="text-primary fs-5" />
              </div>
              <div className="col">
                <input
                  type="text"
                  value={query}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(-1);
                    setIsDropdownOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  className="form-control fw-medium rounded-pill border-0 ps-2 shadow-none"
                  placeholder="Tìm tên máy, chip (VD: iPhone 16, Apple A18) hoặc dán link Shopee..."
                  aria-label="Tìm kiếm sản phẩm công nghệ hoặc dán link kiểm định"
                  autoComplete="off"
                />
              </div>
              {query && (
                <div className="col-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setActiveIndex(-1);
                    }}
                    className="btn btn-sm btn-light rounded-circle text-muted"
                    aria-label="Xóa từ khóa"
                  >
                    <BsXLg />
                  </button>
                </div>
              )}
              <div className="col-auto">
                <button
                  type="submit"
                  className="btn btn-primary rounded-pill fw-semibold px-4 py-2"
                >
                  Tìm kiếm
                </button>
              </div>
            </div>
          </form>

          {/* Autocomplete Dropdown Panel */}
          {isDropdownOpen && (
            <div
              className="card rounded-4 position-absolute start-0 end-0 mt-2 overflow-hidden border shadow-lg"
              style={{ zIndex: 1050 }}
            >
              <div className="card-body p-3">
                {isLikelyEcommerceUrl(query) && (
                  <div className="alert alert-danger d-flex align-items-center justify-content-between rounded-3 mb-3 px-3 py-2">
                    <div className="small">
                      <strong>Phát hiện đường dẫn TMĐT!</strong> Bấm để kiểm tra
                      lịch sử giá, giảm giá ảo và điểm rủi ro shop ngay.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        void runUrlInspection(query);
                      }}
                      className="btn btn-sm btn-danger rounded-pill fw-semibold ms-2 flex-shrink-0"
                    >
                      Kiểm định Link →
                    </button>
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-center mb-2 px-2">
                  <span
                    className="text-muted text-uppercase fw-bold"
                    style={{ fontSize: '0.72rem' }}
                  >
                    📱 Sản phẩm chuẩn hóa ({filteredProducts.length})
                  </span>
                  <Link
                    href="/smartphones"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-primary text-decoration-none small fw-semibold"
                  >
                    Bộ lọc 10 nhóm thông số →
                  </Link>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-muted small px-2 py-3">
                    Không tìm thấy mẫu máy khớp với &ldquo;{query}&rdquo;. Bạn
                    có thể chuyển sang tab{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        void runUrlInspection(query);
                      }}
                      className="btn btn-link btn-sm p-0 align-baseline"
                    >
                      Kiểm định Link / Từ khóa
                    </button>
                    .
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {filteredProducts.map((item, idx) => {
                      const keySpecs = (item.key_specs || {}) as KeySpecs;
                      const thumb =
                        item.thumbnail ||
                        (item.images && item.images.length > 0
                          ? item.images[0]
                          : null);
                      const minPrice = Number(
                        item.min_price || 0
                      ).toLocaleString('vi-VN');
                      const rating =
                        item.user_rating_weighted &&
                        Number(item.user_rating_weighted) > 0
                          ? Number(item.user_rating_weighted)
                          : Number(item.average_rating || 0);

                      return (
                        <div
                          key={item.id}
                          className={`list-group-item list-group-item-action rounded-3 d-flex align-items-center justify-content-between gap-2 border-0 px-2 py-2 ${
                            idx === activeIndex ? 'bg-primary-subtle' : ''
                          }`}
                        >
                          <Link
                            href={getMasterProductHref(item)}
                            onClick={() => setIsDropdownOpen(false)}
                            className="d-flex align-items-center text-decoration-none text-dark flex-grow-1 gap-3"
                          >
                            <div
                              className="rounded-3 bg-light d-flex align-items-center justify-content-center flex-shrink-0 border"
                              style={{ width: '48px', height: '48px' }}
                            >
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={item.name}
                                  style={{
                                    maxWidth: '40px',
                                    maxHeight: '40px',
                                    objectFit: 'contain',
                                  }}
                                />
                              ) : (
                                <span className="small text-muted">📱</span>
                              )}
                            </div>
                            <div>
                              <div className="fw-bold small text-dark">
                                {item.name}
                              </div>
                              <div
                                className="text-muted d-flex align-items-center flex-wrap gap-2"
                                style={{ fontSize: '0.75rem' }}
                              >
                                <span className="badge bg-light text-secondary border">
                                  {item.brand}
                                </span>
                                {keySpecs.chip && (
                                  <span>⚡ {keySpecs.chip}</span>
                                )}
                                {item.storage_gb && (
                                  <span>💾 {item.storage_gb}GB</span>
                                )}
                                {rating > 0 && (
                                  <span className="text-warning-emphasis fw-semibold">
                                    ★ {rating.toFixed(1)}
                                  </span>
                                )}
                                <RadarBadge
                                  signal={getRadarSignal(radarIndex, item.slug)}
                                />
                              </div>
                            </div>
                          </Link>

                          <div className="d-flex align-items-center flex-shrink-0 gap-2">
                            <div className="me-1 text-end">
                              <div className="fw-bold text-danger small">
                                {minPrice} ₫
                              </div>
                              <div
                                className="text-muted"
                                style={{ fontSize: '0.7rem' }}
                              >
                                {item.merchant_count || 0} nơi bán
                              </div>
                            </div>
                            <CompareQuickToggle
                              item={{
                                slug: item.slug,
                                name: item.name,
                                brand: item.brand,
                                thumbnail: thumb ?? null,
                                min_price: Number(item.min_price || 0),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredMerchants.length > 0 && (
                  <div className="border-top mt-2 pt-2">
                    <div className="d-flex justify-content-between align-items-center mb-1 px-2">
                      <span
                        className="text-muted text-uppercase fw-bold"
                        style={{ fontSize: '0.72rem' }}
                      >
                        🏪 Gian hàng &amp; Hồ sơ Tín nhiệm (
                        {filteredMerchants.length})
                      </span>
                      <Link
                        href="/merchants"
                        onClick={() => setIsDropdownOpen(false)}
                        className="text-primary text-decoration-none small"
                      >
                        Xem tất cả shop →
                      </Link>
                    </div>
                    {filteredMerchants.map((m) => (
                      <Link
                        key={m.id}
                        href={`/merchants/${m.id}`}
                        onClick={() => setIsDropdownOpen(false)}
                        className="d-flex align-items-center justify-content-between rounded-3 text-decoration-none text-dark hover-bg-light px-2 py-2"
                      >
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-danger text-uppercase small">
                            {m.platform}
                          </span>
                          <span className="fw-semibold small">{m.name}</span>
                          {m.is_official && (
                            <span className="badge bg-success-subtle text-success small">
                              Mall
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center small gap-2">
                          <span className="badge bg-success-subtle text-success rounded-pill">
                            Trust: {m.trust_score}/100
                          </span>
                          <span
                            className="text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            DOSafe: {m.dosafe_risk_score}/100
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Mode 2: URL / Link Inspector */
        <div>
          <form
            onSubmit={handleInspectSubmit}
            className="search-wrap rounded-pill border-danger border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsLink45Deg className="text-danger fs-4" />
              </div>
              <div className="col">
                <input
                  type="text"
                  value={inspectQuery}
                  onChange={(e) => setInspectQuery(e.target.value)}
                  className="form-control fw-medium rounded-pill border-0 ps-2 shadow-none"
                  placeholder="Dán link sản phẩm/shop Shopee, Lazada, Tiki hoặc nhập tên sản phẩm..."
                  aria-label="Dán link sản phẩm hoặc gian hàng để kiểm định"
                />
              </div>
              {inspectQuery && (
                <div className="col-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectQuery('');
                      setInspectResult(null);
                      setInspectError(null);
                    }}
                    className="btn btn-sm btn-light rounded-circle text-muted"
                    aria-label="Xóa đường dẫn"
                  >
                    <BsXLg />
                  </button>
                </div>
              )}
              <div className="col-auto">
                <button
                  type="submit"
                  disabled={isInspecting}
                  className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                >
                  {isInspecting ? 'Đang kiểm định...' : 'Kiểm định ngay'}
                </button>
              </div>
            </div>
          </form>

          {/* Sample One-Click Inspection Pills */}
          <div className="d-flex align-items-center justify-content-center mt-2 flex-wrap gap-2">
            <span className="text-light small opacity-75">
              Thử nhanh với dữ liệu thật:
            </span>
            {SAMPLE_INSPECT_LINKS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => void runUrlInspection(sample.value)}
                className="badge bg-dark bg-opacity-75 text-light border-light border-opacity-25 rounded-pill fw-normal border px-3 py-2"
                style={{ cursor: 'pointer' }}
              >
                <BsLightningChargeFill className="text-warning me-1" />
                {sample.label}
              </button>
            ))}
          </div>

          {inspectError && (
            <div className="alert alert-danger rounded-4 mt-3 mb-0">
              {inspectError}
            </div>
          )}

          {/* Instant URL Inspection Result Card */}
          {inspectResult && (
            <div className="card rounded-4 text-dark mt-3 overflow-hidden border-0 shadow-lg">
              <div className="card-header bg-dark d-flex justify-content-between align-items-center flex-wrap gap-2 px-4 py-3 text-white">
                <div className="d-flex align-items-center gap-2">
                  <BsShieldCheck className="text-success fs-5" />
                  <span className="fw-bold">
                    Kết Quả Kiểm Định Giá Bán, Review AI &amp; Tín Nhiệm Gian
                    Hàng
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectResult(null)}
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  Đóng
                </button>
              </div>

              <div className="card-body p-4">
                {inspectResult.masterProduct ? (
                  <div className="row g-4 align-items-center">
                    <div className="col-lg-7">
                      <div className="d-flex align-items-start gap-3">
                        {inspectResult.masterProduct.images?.[0] && (
                          <img
                            src={inspectResult.masterProduct.images[0]}
                            alt={inspectResult.masterProduct.name}
                            className="rounded-3 bg-light flex-shrink-0 border p-2"
                            style={{
                              width: '84px',
                              height: '84px',
                              objectFit: 'contain',
                            }}
                          />
                        )}
                        <div>
                          <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                            <span className="badge bg-primary-subtle text-primary rounded-pill">
                              {inspectResult.masterProduct.brand}
                            </span>
                            {inspectResult.parsedUrl.platform && (
                              <span className="badge bg-danger text-uppercase rounded-pill">
                                {inspectResult.parsedUrl.platform}
                              </span>
                            )}
                            {inspectResult.discountAnalysis && (
                              <span
                                className={`badge rounded-pill ${
                                  inspectResult.discountAnalysis.verdict ===
                                  'fake_discount'
                                    ? 'bg-danger text-white'
                                    : inspectResult.discountAnalysis.verdict ===
                                        'genuine_deal'
                                      ? 'bg-success text-white'
                                      : 'bg-secondary-subtle text-secondary'
                                }`}
                              >
                                {inspectResult.discountAnalysis.badge_label}
                              </span>
                            )}
                            <RadarBadge
                              signal={
                                inspectResult.radarSignal ??
                                getRadarSignal(
                                  radarIndex,
                                  inspectResult.masterProduct.slug
                                )
                              }
                            />
                          </div>

                          <h4 className="h5 fw-bold mb-1">
                            <Link
                              href={getMasterProductHref(
                                inspectResult.masterProduct
                              )}
                              className="text-dark text-decoration-none"
                            >
                              {inspectResult.masterProduct.name}
                            </Link>
                          </h4>

                          <div className="text-danger fw-bold fs-5 mb-1">
                            Giá tốt nhất:{' '}
                            {Number(
                              inspectResult.masterProduct.min_price
                            ).toLocaleString('vi-VN')}{' '}
                            ₫
                            {inspectResult.priceHistory?.lowestEverPrice && (
                              <span className="text-success small fw-semibold ms-2">
                                (Đáy lịch sử:{' '}
                                {inspectResult.priceHistory.lowestEverPrice.toLocaleString(
                                  'vi-VN'
                                )}{' '}
                                ₫)
                              </span>
                            )}
                          </div>

                          {inspectResult.discountAnalysis && (
                            <p className="text-muted small mb-0">
                              {inspectResult.discountAnalysis.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-5">
                      <div className="rounded-4 bg-light border p-3">
                        {inspectResult.merchantProfile && (
                          <div className="d-flex justify-content-between align-items-center border-bottom mb-2 pb-2">
                            <div className="small">
                              <span className="text-muted">Gian hàng: </span>
                              <Link
                                href={`/merchants/${inspectResult.merchantProfile.id}`}
                                className="fw-bold text-dark text-decoration-none"
                              >
                                {inspectResult.merchantProfile.name}
                              </Link>
                              {inspectResult.merchantProfile.is_official && (
                                <BsCheckCircleFill className="text-success ms-1" />
                              )}
                            </div>
                            <span className="badge bg-success rounded-pill text-white">
                              Trust: {inspectResult.merchantProfile.trust_score}
                              /100
                            </span>
                          </div>
                        )}

                        {inspectResult.reviewSummary && (
                          <div className="d-flex justify-content-between align-items-center small mb-3">
                            <span className="text-muted">
                              Độ trung thực Review AI:
                            </span>
                            <span className="fw-bold text-success">
                              ✓ {inspectResult.reviewSummary.authentic_pct}%
                              thực chất (trong{' '}
                              {inspectResult.reviewSummary.total_analyzed} đánh
                              giá)
                            </span>
                          </div>
                        )}

                        <div className="d-flex flex-wrap gap-2">
                          <Link
                            href={getMasterProductHref(
                              inspectResult.masterProduct
                            )}
                            className="btn btn-primary btn-sm rounded-pill fw-semibold flex-grow-1 px-3"
                          >
                            Xem 10 Nhóm Thông Số &amp; Lịch Sử Giá{' '}
                            <BsArrowRight className="ms-1" />
                          </Link>
                          <Link
                            href={`/inspect?q=${encodeURIComponent(inspectQuery)}`}
                            className="btn btn-outline-danger btn-sm rounded-pill fw-medium px-3"
                          >
                            🔬 Báo cáo Kiểm toán
                          </Link>
                          {inspectResult.merchantProfile && (
                            <Link
                              href={`/merchants/${inspectResult.merchantProfile.id}`}
                              className="btn btn-outline-dark btn-sm rounded-pill px-3"
                            >
                              Hồ sơ Shop
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : inspectResult.merchantProfile ? (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <div className="d-flex align-items-center mb-1 gap-2">
                        <span className="badge bg-danger text-uppercase">
                          {inspectResult.merchantProfile.platform}
                        </span>
                        {inspectResult.merchantProfile.is_official && (
                          <span className="badge bg-success-subtle text-success">
                            Official Mall
                          </span>
                        )}
                        <span className="badge bg-success rounded-pill text-white">
                          Trust Score:{' '}
                          {inspectResult.merchantProfile.trust_score}/100
                        </span>
                      </div>
                      <h4 className="h5 fw-bold mb-1">
                        <BsShop className="text-primary me-2" />
                        {inspectResult.merchantProfile.name}
                      </h4>
                      <div className="text-muted small">
                        DOSafe Threat Risk:{' '}
                        <strong>
                          {inspectResult.merchantProfile.dosafe_risk_score}/100
                        </strong>{' '}
                        • AI Review Risk:{' '}
                        <strong>
                          {inspectResult.merchantProfile.review_risk_score}/100
                        </strong>{' '}
                        • Đang theo dõi{' '}
                        <strong>
                          {inspectResult.merchantProfile.product_count} sản phẩm
                        </strong>
                      </div>
                    </div>
                    <Link
                      href={`/merchants/${inspectResult.merchantProfile.id}`}
                      className="btn btn-primary rounded-pill fw-semibold px-4"
                    >
                      Mở Hồ Sơ Tín Nhiệm Gian Hàng →
                    </Link>
                  </div>
                ) : (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <h5 className="fw-bold d-flex align-items-center mb-1 gap-2">
                        <BsExclamationTriangleFill className="text-warning" />
                        Sản phẩm/Link này chưa có trong bộ đệm kiểm định trực
                        tiếp
                      </h5>
                      <p className="text-muted small mb-0">
                        Bạn có thể tra cứu các dòng máy chuẩn hóa tương đương
                        hoặc xem hồ sơ các gian hàng chính hãng bên dưới.
                      </p>
                    </div>
                    <Link
                      href={`/smartphones?q=${encodeURIComponent(inspectResult.query)}`}
                      className="btn btn-outline-primary rounded-pill fw-semibold px-4"
                    >
                      Tìm trong Danh mục Điện thoại →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
