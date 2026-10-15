'use client';

import React, { useMemo, useState } from 'react';
import { Link } from '@/lib/navigation';
import type { MerchantSummary } from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import {
  BsArrowCounterclockwise,
  BsBoxSeam,
  BsCheckCircleFill,
  BsFunnel,
  BsPeopleFill,
  BsSearch,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsSortDown,
  BsStarFill,
} from 'react-icons/bs';

export type MerchantSortOption =
  'trust_desc' | 'products_desc' | 'seeding_asc' | 'followers_desc';

export type MerchantRiskTier = 'all' | 'safe' | 'moderate' | 'warning';

interface MerchantDirectoryExplorerProps {
  readonly initialMerchants: readonly MerchantSummary[];
  readonly locale: string;
  readonly initialQuery?: string;
  readonly initialPlatform?: string;
  readonly initialOfficialOnly?: boolean;
  readonly initialSort?: MerchantSortOption;
}

export default function MerchantDirectoryExplorer({
  initialMerchants,
  locale,
  initialQuery = '',
  initialPlatform = 'all',
  initialOfficialOnly = false,
  initialSort = 'trust_desc',
}: MerchantDirectoryExplorerProps) {
  const lang = normalizeRateLocale(locale);
  const [query, setQuery] = useState(initialQuery);
  const [platform, setPlatform] = useState(initialPlatform.toLowerCase());
  const [officialOnly, setOfficialOnly] = useState(initialOfficialOnly);
  const [riskTier, setRiskTier] = useState<MerchantRiskTier>('all');
  const [sortBy, setSortBy] = useState<MerchantSortOption>(initialSort);

  const labels = useMemo(() => {
    if (lang === 'en') {
      return {
        totalMerchants: 'Tracked Merchants',
        officialMalls: 'Official Malls',
        highTrustShops: 'High-Trust Sellers (>=80)',
        avgTrustScore: 'Average Trust Score',
        searchPlaceholder: 'Search by merchant name, shop ID, or platform...',
        allPlatforms: 'All Platforms',
        officialMallOnly: 'Official Mall Only',
        riskFilterLabel: 'Trust Level:',
        riskAll: 'All Tiers',
        riskSafe: 'Safe (>= 80)',
        riskModerate: 'Moderate (60-79)',
        riskWarning: 'Warning (< 60)',
        sortLabel: 'Sort by:',
        sortTrust: 'Highest Trust Score',
        sortProducts: 'Most Tracked Products',
        sortSeeding: 'Lowest AI Review Risk',
        sortFollowers: 'Most Followers',
        resetFilters: 'Reset filters',
        showingCount: 'Showing',
        ofCount: 'of',
        merchantsUnit: 'merchants',
        officialBadge: 'Official Mall',
        platformRating: 'Platform Rating',
        noRating: 'N/A',
        followers: 'Followers',
        trackedProducts: 'Tracked Listings',
        productsUnit: 'products',
        dosafeZero: '0 scam alerts in DOSafe Threat Intel',
        dosafeAlert: 'Active risk flags in DOSafe Threat Intel',
        authenticLabel: 'Authentic:',
        filteredSpamSuffix: 'spam/seeding filtered',
        noAbnormalReviews: 'No abnormal review patterns detected',
        priceRangeLabel: 'Listed price range:',
        viewTrustProfileCta: 'View Trust Profile & Listings →',
        openStorefrontCta: 'Original Store ↗',
        emptyTitle: 'No matching merchants found',
        emptySubtitle:
          'Try clearing filters or paste a Shopee/Lazada/TikTok Shop URL into our Deep Inspector.',
        inspectUrlCta: 'Inspect Any Store or Product Link →',
      };
    }
    if (lang === 'cs') {
      return {
        totalMerchants: 'Sledované obchody',
        officialMalls: 'Oficiální obchody (Mall)',
        highTrustShops: 'Vysoká důvěra (>=80)',
        avgTrustScore: 'Průměrné Trust skóre',
        searchPlaceholder: 'Hledat podle názvu obchodu, ID nebo tržiště...',
        allPlatforms: 'Všechny platformy',
        officialMallOnly: 'Pouze Official Mall',
        riskFilterLabel: 'Úroveň důvěry:',
        riskAll: 'Všechny úrovně',
        riskSafe: 'Bezpečné (>= 80)',
        riskModerate: 'Střední (60-79)',
        riskWarning: 'Varování (< 60)',
        sortLabel: 'Řadit dle:',
        sortTrust: 'Nejvyšší Trust Score',
        sortProducts: 'Nejvíce produktů',
        sortSeeding: 'Nejnižší AI Review Risk',
        sortFollowers: 'Nejvíce sledujících',
        resetFilters: 'Vymazat filtry',
        showingCount: 'Zobrazeno',
        ofCount: 'z',
        merchantsUnit: 'obchodů',
        officialBadge: 'Oficiální obchod (Mall)',
        platformRating: 'Hodnocení na tržišti',
        noRating: 'Není',
        followers: 'Sledující',
        trackedProducts: 'Sledované nabídky',
        productsUnit: 'produktů',
        dosafeZero: 'Žádná varování v databázi DOSafe',
        dosafeAlert: 'Detekováno riziko v systému DOSafe',
        authenticLabel: 'Autentické:',
        filteredSpamSuffix: 'spam/seeding odfiltrováno',
        noAbnormalReviews: 'Žádné podezřelé vzorce recenzí',
        priceRangeLabel: 'Cenové rozpětí nabídek:',
        viewTrustProfileCta: 'Zobrazit profil důvěryhodnosti →',
        openStorefrontCta: 'Původní obchod ↗',
        emptyTitle: 'Žádný odpovídající obchod nebyl nalezen',
        emptySubtitle:
          'Zkuste upravit filtry nebo vložte odkaz na obchod do hloubkového auditu.',
        inspectUrlCta: 'Prověřit odkaz na obchod nebo produkt →',
      };
    }
    return {
      totalMerchants: 'Gian hàng đang theo dõi',
      officialMalls: 'Gian hàng Chính hãng (Mall)',
      highTrustShops: 'Độ tin cậy cao (>=80)',
      avgTrustScore: 'Điểm Trust trung bình',
      searchPlaceholder:
        'Tìm tên gian hàng, mã shop_id hoặc sàn (Shopee, Lazada, TikTok)...',
      allPlatforms: 'Tất cả sàn',
      officialMallOnly: 'Chỉ hiện Official Mall',
      riskFilterLabel: 'Mức tín nhiệm:',
      riskAll: 'Tất cả mức',
      riskSafe: 'An toàn (>= 80)',
      riskModerate: 'Trung bình (60-79)',
      riskWarning: 'Cảnh báo (< 60)',
      sortLabel: 'Sắp xếp:',
      sortTrust: 'Điểm Tin cậy cao nhất',
      sortProducts: 'Nhiều sản phẩm nhất',
      sortSeeding: 'Rủi ro Seeding thấp nhất',
      sortFollowers: 'Nhiều người theo dõi nhất',
      resetFilters: 'Xóa bộ lọc',
      showingCount: 'Hiển thị',
      ofCount: 'trên',
      merchantsUnit: 'gian hàng',
      officialBadge: 'Chính hãng (Official Mall)',
      platformRating: 'Đánh giá sàn',
      noRating: 'Chưa có',
      followers: 'Người theo dõi',
      trackedProducts: 'Sản phẩm đang theo dõi',
      productsUnit: 'sản phẩm',
      dosafeZero: 'Không có cảnh báo lừa đảo trong DOSafe',
      dosafeAlert: 'Có cảnh báo rủi ro trên hệ thống DOSafe',
      authenticLabel: 'Thực chất:',
      filteredSpamSuffix: 'spam/seeding đã lọc',
      noAbnormalReviews: 'Chưa phát hiện đánh giá bất thường',
      priceRangeLabel: 'Khoảng giá niêm yết:',
      viewTrustProfileCta: 'Xem Hồ sơ Tín nhiệm & Giá bán →',
      openStorefrontCta: 'Mở gian hàng gốc ↗',
      emptyTitle: 'Không tìm thấy gian hàng phù hợp',
      emptySubtitle:
        'Hãy thử xóa bộ lọc hoặc dán trực tiếp link gian hàng/sản phẩm vào công cụ Kiểm toán sâu.',
      inspectUrlCta: 'Kiểm toán Link Gian hàng hoặc Sản phẩm bất kỳ →',
    };
  }, [lang]);

  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of initialMerchants) {
      const p = m.platform.toLowerCase();
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return counts;
  }, [initialMerchants]);

  const availablePlatforms = useMemo(() => {
    const base = ['shopee', 'lazada', 'tiktok', 'tiki'];
    for (const p of platformCounts.keys()) {
      if (!base.includes(p)) base.push(p);
    }
    return base;
  }, [platformCounts]);

  const summaryStats = useMemo(() => {
    const total = initialMerchants.length;
    const official = initialMerchants.filter((m) => m.is_official).length;
    const safe = initialMerchants.filter((m) => m.trust_score >= 80).length;
    const avgTrust =
      total > 0
        ? Math.round(
            initialMerchants.reduce((acc, m) => acc + m.trust_score, 0) / total
          )
        : 100;
    return { total, official, safe, avgTrust };
  }, [initialMerchants]);

  const filteredMerchants = useMemo(() => {
    const kw = query.trim().toLowerCase();

    const filtered = initialMerchants.filter((m) => {
      if (platform !== 'all' && m.platform.toLowerCase() !== platform) {
        return false;
      }
      if (officialOnly && !m.is_official) {
        return false;
      }
      if (riskTier === 'safe' && m.trust_score < 80) {
        return false;
      }
      if (
        riskTier === 'moderate' &&
        (m.trust_score < 60 || m.trust_score >= 80)
      ) {
        return false;
      }
      if (riskTier === 'warning' && m.trust_score >= 60) {
        return false;
      }
      if (kw) {
        const matchName = m.name.toLowerCase().includes(kw);
        const matchShopId = m.platform_shop_id.toLowerCase().includes(kw);
        const matchPlatform = m.platform.toLowerCase().includes(kw);
        const matchSlug = m.slug ? m.slug.toLowerCase().includes(kw) : false;
        if (!matchName && !matchShopId && !matchPlatform && !matchSlug) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'trust_desc':
          return (
            b.trust_score - a.trust_score || b.product_count - a.product_count
          );
        case 'products_desc':
          return (
            b.product_count - a.product_count || b.trust_score - a.trust_score
          );
        case 'seeding_asc':
          return (
            a.review_risk_score - b.review_risk_score ||
            b.trust_score - a.trust_score
          );
        case 'followers_desc':
          return (
            b.follower_count - a.follower_count || b.trust_score - a.trust_score
          );
        default:
          return 0;
      }
    });
  }, [initialMerchants, query, platform, officialOnly, riskTier, sortBy]);

  const hasActiveFilters =
    query.trim() !== '' ||
    platform !== 'all' ||
    officialOnly ||
    riskTier !== 'all' ||
    sortBy !== 'trust_desc';

  const handleReset = () => {
    setQuery('');
    setPlatform('all');
    setOfficialOnly(false);
    setRiskTier('all');
    setSortBy('trust_desc');
  };

  return (
    <div>
      {/* KPI Summary Strip */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.totalMerchants}</div>
            <div className="fs-4 fw-bold text-dark d-flex align-items-center gap-2">
              <BsShop className="text-primary" />
              {summaryStats.total}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.officialMalls}</div>
            <div className="fs-4 fw-bold text-success d-flex align-items-center gap-2">
              <BsCheckCircleFill />
              {summaryStats.official}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.highTrustShops}</div>
            <div className="fs-4 fw-bold text-primary d-flex align-items-center gap-2">
              <BsShieldCheck />
              {summaryStats.safe}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.avgTrustScore}</div>
            <div className="fs-4 fw-bold text-dark">
              {summaryStats.avgTrust}
              <span className="fs-6 text-muted fw-normal">/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Filter & Search Controls */}
      <div className="card rounded-4 mb-4 border bg-white p-4 shadow-sm">
        <div className="row g-3 align-items-center">
          {/* Search Input */}
          <div className="col-lg-5 col-md-12">
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0 text-muted">
                <BsSearch />
              </span>
              <input
                type="search"
                className="form-control bg-light border-start-0"
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={labels.searchPlaceholder}
              />
            </div>
          </div>

          {/* Risk Tier Filter */}
          <div className="col-lg-3 col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted">
                <BsFunnel className="me-1" /> {labels.riskFilterLabel}
              </span>
              <select
                className="form-select"
                value={riskTier}
                onChange={(e) =>
                  setRiskTier(e.target.value as MerchantRiskTier)
                }
                aria-label={labels.riskFilterLabel}
              >
                <option value="all">{labels.riskAll}</option>
                <option value="safe">{labels.riskSafe}</option>
                <option value="moderate">{labels.riskModerate}</option>
                <option value="warning">{labels.riskWarning}</option>
              </select>
            </div>
          </div>

          {/* Sort Select */}
          <div className="col-lg-4 col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted">
                <BsSortDown className="me-1" /> {labels.sortLabel}
              </span>
              <select
                className="form-select"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as MerchantSortOption)
                }
                aria-label={labels.sortLabel}
              >
                <option value="trust_desc">{labels.sortTrust}</option>
                <option value="products_desc">{labels.sortProducts}</option>
                <option value="seeding_asc">{labels.sortSeeding}</option>
                <option value="followers_desc">{labels.sortFollowers}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Platform Pills + Official Toggle */}
        <div className="d-flex justify-content-between align-items-center border-top mt-3 flex-wrap gap-2 pt-3">
          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlatform('all')}
              className={`btn btn-sm rounded-pill px-3 ${
                platform === 'all' ? 'btn-dark fw-semibold' : 'btn-outline-dark'
              }`}
            >
              {labels.allPlatforms} ({initialMerchants.length})
            </button>
            {availablePlatforms.map((p) => {
              const count = platformCounts.get(p) ?? 0;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`btn btn-sm rounded-pill text-uppercase px-3 ${
                    platform === p
                      ? 'btn-danger fw-semibold'
                      : 'btn-outline-secondary'
                  }`}
                >
                  {p} ({count})
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setOfficialOnly(!officialOnly)}
              className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-1 px-3 ${
                officialOnly ? 'btn-success fw-semibold' : 'btn-outline-success'
              }`}
            >
              <BsCheckCircleFill />
              {labels.officialMallOnly}
            </button>
          </div>

          <div className="d-flex align-items-center gap-3">
            <span className="small text-muted">
              {labels.showingCount}{' '}
              <strong className="text-dark">{filteredMerchants.length}</strong>{' '}
              {labels.ofCount} {initialMerchants.length} {labels.merchantsUnit}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-sm btn-link text-danger text-decoration-none d-inline-flex align-items-center gap-1 p-0"
              >
                <BsArrowCounterclockwise />
                {labels.resetFilters}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {filteredMerchants.length === 0 ? (
        <div className="card rounded-4 border bg-white p-5 text-center shadow-sm">
          <div className="mb-3">
            <BsShieldExclamation className="fs-1 text-warning" />
          </div>
          <h3 className="h5 fw-bold mb-2">{labels.emptyTitle}</h3>
          <p
            className="text-muted small mx-auto mb-4"
            style={{ maxWidth: 520 }}
          >
            {labels.emptySubtitle}
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-outline-secondary rounded-pill px-4"
              >
                {labels.resetFilters}
              </button>
            )}
            <Link
              href={
                query.trim()
                  ? `/inspect?q=${encodeURIComponent(query.trim())}`
                  : '/inspect'
              }
              className="btn btn-danger rounded-pill fw-medium px-4"
            >
              🔬 {labels.inspectUrlCta}
            </Link>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {filteredMerchants.map((merchant) => {
            const trustBadgeClass =
              merchant.trust_score >= 80
                ? 'bg-success text-white'
                : merchant.trust_score >= 50
                  ? 'bg-warning text-dark'
                  : 'bg-danger text-white';

            const minPriceText = merchant.min_price
              ? `${merchant.min_price.toLocaleString('vi-VN')} ₫`
              : null;
            const maxPriceText =
              merchant.max_price && merchant.max_price !== merchant.min_price
                ? `${merchant.max_price.toLocaleString('vi-VN')} ₫`
                : null;

            return (
              <div className="col-lg-6 col-12" key={merchant.id}>
                <div className="card rounded-4 h-100 border p-4 shadow-sm">
                  <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold fs-4 flex-shrink-0"
                        style={{ width: '56px', height: '56px' }}
                      >
                        <BsShop />
                      </div>
                      <div>
                        <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                          <span className="badge bg-danger text-uppercase small">
                            {merchant.platform}
                          </span>
                          {merchant.is_official && (
                            <span className="badge bg-success-subtle text-success small d-inline-flex align-items-center gap-1">
                              <BsCheckCircleFill /> {labels.officialBadge}
                            </span>
                          )}
                          <span className="text-muted small">
                            ID: <code>{merchant.platform_shop_id}</code>
                          </span>
                        </div>
                        <h3 className="h5 fw-bold mb-0">
                          <Link
                            href={`/merchants/${merchant.id}`}
                            className="text-dark text-decoration-none"
                          >
                            {merchant.name}
                          </Link>
                        </h3>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-end">
                      <span
                        className={`badge ${trustBadgeClass} rounded-pill fs-6 px-3 py-2`}
                      >
                        Trust: {merchant.trust_score}/100
                      </span>
                    </div>
                  </div>

                  {/* Shop Quick Metrics */}
                  <div className="row g-2 mb-3">
                    <div className="col-sm-4 col-6">
                      <div className="bg-light rounded-3 p-2 px-3">
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {labels.platformRating}
                        </div>
                        <div className="fw-bold small d-flex align-items-center gap-1">
                          <BsStarFill className="text-warning" />
                          {merchant.rating_star
                            ? `${merchant.rating_star.toFixed(2)} / 5.0`
                            : labels.noRating}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-6">
                      <div className="bg-light rounded-3 p-2 px-3">
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {labels.followers}
                        </div>
                        <div className="fw-bold small d-flex align-items-center gap-1">
                          <BsPeopleFill className="text-primary" />
                          {merchant.follower_count > 0
                            ? merchant.follower_count.toLocaleString('vi-VN')
                            : '-'}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="bg-light rounded-3 p-2 px-3">
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {labels.trackedProducts}
                        </div>
                        <div className="fw-bold small d-flex align-items-center gap-1">
                          <BsBoxSeam className="text-success" />
                          {merchant.product_count} {labels.productsUnit}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dual Risk Score Breakdown */}
                  <div className="rounded-3 mb-3 border bg-white p-3">
                    <div className="row g-3">
                      <div className="border-end col-6">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="small text-muted fw-medium">
                            🛡️ DOSafe Threat Risk
                          </span>
                          <span
                            className={`badge rounded-pill ${
                              merchant.dosafe_risk_score === 0
                                ? 'bg-success-subtle text-success'
                                : 'bg-danger-subtle text-danger'
                            }`}
                          >
                            {merchant.dosafe_risk_score}/100
                          </span>
                        </div>
                        <div
                          className="small text-muted"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {merchant.dosafe_risk_score === 0
                            ? labels.dosafeZero
                            : labels.dosafeAlert}
                        </div>
                      </div>

                      <div className="col-6">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="small text-muted fw-medium">
                            🤖 AI Review Risk
                          </span>
                          <span
                            className={`badge rounded-pill ${
                              merchant.review_risk_score <= 15
                                ? 'bg-success-subtle text-success'
                                : merchant.review_risk_score <= 40
                                  ? 'bg-warning-subtle text-warning-emphasis'
                                  : 'bg-danger-subtle text-danger'
                            }`}
                          >
                            {merchant.review_risk_score}/100
                          </span>
                        </div>
                        <div
                          className="small text-muted"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {merchant.review_risk_breakdown.total_reviews > 0 ? (
                            <>
                              {labels.authenticLabel}{' '}
                              <strong>
                                {merchant.review_risk_breakdown.authentic_count}
                              </strong>
                              /{merchant.review_risk_breakdown.total_reviews} (
                              {merchant.review_risk_breakdown.coin_spam_count +
                                merchant.review_risk_breakdown
                                  .seeding_fake_count}{' '}
                              {labels.filteredSpamSuffix})
                            </>
                          ) : (
                            labels.noAbnormalReviews
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {minPriceText && (
                    <div className="small text-muted mb-3">
                      {labels.priceRangeLabel}{' '}
                      <strong className="text-danger">
                        {minPriceText}
                        {maxPriceText ? ` - ${maxPriceText}` : ''}
                      </strong>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                    <Link
                      href={`/merchants/${merchant.id}`}
                      className="btn btn-primary rounded-pill fw-medium px-4"
                    >
                      {labels.viewTrustProfileCta}
                    </Link>
                    {merchant.url && (
                      <a
                        href={merchant.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                      >
                        {labels.openStorefrontCta}
                      </a>
                    )}
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
