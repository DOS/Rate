'use client';

import React, { useMemo, useState } from 'react';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@repo/shared-data';
import {
  type CanonicalCategorySlug,
  getMasterProductCategorySlug,
} from '@/lib/rate-api';
import {
  scoreMasterProductForLeaderboard,
  type ScoredLeaderboardItem,
} from '@/lib/leaderboard-engine';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import type {
  CrossPlatformDealRadarItem,
  CrossPlatformDealRadarResponse,
  CrossPlatformPriceSpreadItem,
} from '@/server/rate/deals';

interface DealFinderWorkspaceProps {
  readonly products: MasterProduct[];
  readonly initialCategory?: CanonicalCategorySlug | 'all';
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
}

type PersonaKey =
  'default' | 'value_hunter' | 'photography' | 'gaming' | 'endurance';

const CATEGORY_OPTIONS: Array<{
  slug: CanonicalCategorySlug | 'all';
  label: string;
}> = [
  { slug: 'all', label: 'Tất cả 5 ngành hàng' },
  { slug: 'smartphones', label: 'Điện thoại' },
  { slug: 'tablets', label: 'Máy tính bảng' },
  { slug: 'laptops', label: 'Laptop' },
  { slug: 'smartwatches', label: 'Đồng hồ thông minh' },
  { slug: 'earbuds', label: 'Tai nghe' },
];

const PERSONA_OPTIONS: Array<{
  key: PersonaKey;
  label: string;
}> = [
  { key: 'value_hunter', label: '💎 Đáng tiền nhất (P/P)' },
  { key: 'default', label: '⚖️ Cân bằng toàn diện' },
  { key: 'photography', label: '📸 Camera / Âm thanh' },
  { key: 'gaming', label: '🎮 Hiệu năng & Chiến game' },
  { key: 'endurance', label: '🔋 Pin trâu & Sạc nhanh' },
];

export default function DealFinderWorkspace({
  products,
  initialCategory = 'all',
  dealRadar = null,
}: DealFinderWorkspaceProps) {
  const [categoryFilter, setCategoryFilter] = useState<
    CanonicalCategorySlug | 'all'
  >(initialCategory);
  const [persona, setPersona] = useState<PersonaKey>('value_hunter');
  const [maxBudgetVnd, setMaxBudgetVnd] = useState<number>(65_000_000);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [copiedRadarMd, setCopiedRadarMd] = useState<boolean>(false);
  const radarIndex = useDealRadarIndex(dealRadar);

  const filteredGenuineDeals = useMemo<CrossPlatformDealRadarItem[]>(() => {
    if (!dealRadar) return [];
    return dealRadar.genuineDeals.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const filteredFakeSaleTraps = useMemo<CrossPlatformDealRadarItem[]>(() => {
    if (!dealRadar) return [];
    return dealRadar.fakeSaleTraps.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const filteredPriceSpreadLeaders = useMemo<
    CrossPlatformPriceSpreadItem[]
  >(() => {
    if (!dealRadar || !Array.isArray(dealRadar.priceSpreadLeaders)) return [];
    return dealRadar.priceSpreadLeaders.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const handleCopyRadarMarkdown = async () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    try {
      const lines = [
        `### 🔥 Radar Kèo Thơm Đáy Lịch Sử & Cảnh Báo Bẫy Nâng Giá Gốc 10 Sàn - Rate.vn`,
        `- **Ngành hàng:** ${categoryFilter} | **Cụm sản phẩm phân tích:** ${dealRadar.totalClustersAnalyzed} (${dealRadar.totalOffersAnalyzed} gian hàng)`,
        '',
        '#### 🟢 Kèo Thơm Đáy Lịch Sử Thật (Genuine Deals)',
        '| Thiết bị | Sàn / Gian hàng | Giá Bán Hiện Tại | Trung Vị 10 Sàn | Tiết Kiệm Thật | Điểm JReviews |',
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredGenuineDeals.map(
          (g) =>
            `| ${g.productName} | ${g.platform.toUpperCase()} (${g.merchantName}) | **${g.priceCurrent.toLocaleString('vi-VN')} ₫** | ${g.marketMedianPrice.toLocaleString('vi-VN')} ₫ | -${g.savingsVsMedianVnd.toLocaleString('vi-VN')} ₫ (-${g.savingsVsMedianPct}%) | ${g.jreviewsScore10.toFixed(1)}/10 |`
        ),
        '',
        '#### 🚨 Bẫy Nâng Khống Giá Gốc (Fake Sale Traps)',
        '| Thiết bị | Sàn / Gian hàng | Giá Bán Thực Tế | Giá Gốc Kê Khống | Trung Vị 10 Sàn | Mức Thổi Phồng |',
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredFakeSaleTraps.map(
          (t) =>
            `| ${t.productName} | ${t.platform.toUpperCase()} (${t.merchantName}) | ${t.priceCurrent.toLocaleString('vi-VN')} ₫ | ${(t.priceOriginal || t.priceCurrent).toLocaleString('vi-VN')} ₫ | ${t.marketMedianPrice.toLocaleString('vi-VN')} ₫ | **+${t.fakeMarkupPct}%** |`
        ),
        '',
        '#### 📊 Chênh Lệch Giá Đa Sàn Lớn Nhất (Price Spread Leaders)',
        '| Thiết bị | Sàn Rẻ Nhất | Sàn Đắt Nhất | Giá Thấp Nhất | Giá Cao Nhất | Chênh Lệch Tuyệt Đối |',
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredPriceSpreadLeaders.map(
          (s) =>
            `| ${s.productName} | ${s.cheapestPlatform.toUpperCase()} (${s.cheapestMerchantName}) | ${s.priciestPlatform.toUpperCase()} (${s.priciestMerchantName}) | **${s.minPrice.toLocaleString('vi-VN')} ₫** | ${s.maxPrice.toLocaleString('vi-VN')} ₫ | **-${s.spreadVnd.toLocaleString('vi-VN')} ₫ (${s.spreadPct}%)** |`
        ),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedRadarMd(true);
      setTimeout(() => setCopiedRadarMd(false), 2200);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleDownloadRadarCsv = () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Phân Loại',
      'Thiết Bị',
      'Thương Hiệu',
      'Danh Mục',
      'Sàn',
      'Gian Hàng',
      'Official Mall',
      'Giá Hiện Tại (VND)',
      'Giá Gốc Niêm Yết (VND)',
      'Trung Vị 10 Sàn (VND)',
      'Tiết Kiệm So Trung Vị (%)',
      'Thổi Phồng Giá Gốc (%)',
      'Điểm JReviews (/10)',
    ];
    const allItems = [...filteredGenuineDeals, ...filteredFakeSaleTraps];
    const rows = [
      ...allItems.map((it) => [
        it.verdict,
        it.productName,
        it.brand,
        it.categorySlug,
        it.platform,
        it.merchantName,
        it.isOfficialMall ? 'Mall' : 'Standard',
        it.priceCurrent,
        it.priceOriginal ?? it.priceCurrent,
        it.marketMedianPrice,
        it.savingsVsMedianPct,
        it.fakeMarkupPct,
        it.jreviewsScore10.toFixed(1),
      ]),
      ...filteredPriceSpreadLeaders.map((sp) => [
        'price_spread_leader',
        sp.productName,
        sp.brand,
        sp.categorySlug,
        `${sp.cheapestPlatform} vs ${sp.priciestPlatform}`,
        sp.cheapestMerchantName,
        'Verified',
        sp.minPrice,
        sp.maxPrice,
        sp.medianPrice,
        sp.spreadPct,
        0,
        '-',
      ]),
    ];
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deal-radar-${categoryFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadRadarJson = () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    const payload = {
      source: 'Rate.vn 10-Platform Deal & Fake-Sale Anomaly Radar',
      categoryFilter,
      exportedAt: new Date().toISOString(),
      totalClustersAnalyzed: dealRadar.totalClustersAnalyzed,
      totalOffersAnalyzed: dealRadar.totalOffersAnalyzed,
      genuineDeals: filteredGenuineDeals,
      fakeSaleTraps: filteredFakeSaleTraps,
      priceSpreadLeaders: filteredPriceSpreadLeaders,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deal-radar-${categoryFilter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rankedDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const scored: Array<
      Omit<ScoredLeaderboardItem, 'rank'> & {
        personaScore5: number;
        spreadSavingsVnd: number;
        costPerPointVnd: number;
      }
    > = [];

    for (const p of products) {
      const cat = getMasterProductCategorySlug(p);
      if (categoryFilter !== 'all' && cat !== categoryFilter) continue;
      const minP = Number(p.min_price || 0);
      if (minP <= 0 || minP > maxBudgetVnd) continue;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.brand.toLowerCase().includes(q)
      ) {
        continue;
      }

      const item = scoreMasterProductForLeaderboard(p);
      const c = item.criteria;
      let personaScore5 = item.combinedScore5;
      if (persona === 'value_hunter') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.45 + c.value * 0.55).toFixed(2)
        );
      } else if (persona === 'photography') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.camera * 0.6).toFixed(2)
        );
      } else if (persona === 'gaming') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.performance * 0.6).toFixed(2)
        );
      } else if (persona === 'endurance') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.battery * 0.6).toFixed(2)
        );
      }

      const maxP = Number(p.max_price || minP);
      const spreadSavingsVnd = Math.max(0, maxP - minP);
      const combinedScore10 = item.combinedScore5 * 2;
      const costPerPointVnd =
        combinedScore10 > 0 ? Math.round(minP / combinedScore10) : minP;

      scored.push({
        ...item,
        personaScore5,
        spreadSavingsVnd,
        costPerPointVnd,
      });
    }

    scored.sort((a, b) => {
      if (b.personaScore5 !== a.personaScore5) {
        return b.personaScore5 - a.personaScore5;
      }
      return a.minPrice - b.minPrice;
    });

    return scored.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }, [products, categoryFilter, persona, maxBudgetVnd, searchQuery]);

  const handleCopyDealsMarkdown = async () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    try {
      const lines = [
        `### 💎 Bảng Xếp Hạng Top Deal Đã Kiểm Định (${rankedDeals.length} thiết bị) - Rate.vn`,
        `- **Ngân sách tối đa:** ${maxBudgetVnd.toLocaleString('vi-VN')} ₫ | **Hồ sơ nhu cầu:** ${persona}`,
        `- **Đường dẫn kiểm định:** ${window.location.href}`,
        '',
        '| Hạng | Thiết bị | Hãng | Điểm Nhu Cầu | Điểm JReviews | Giá Thấp Nhất | Tiết Kiệm Chênh Sàn | Radar |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rankedDeals
          .slice(0, 20)
          .map(
            (d) =>
              `| #${d.rank} | ${d.name} | ${d.brand} | **${d.personaScore5.toFixed(2)}/5.0** | ★ ${d.userScore5.toFixed(1)} (Lab ${d.expertScore10.toFixed(1)}/10) | **${d.minPrice.toLocaleString('vi-VN')} ₫** | ${d.spreadSavingsVnd > 0 ? `-${d.spreadSavingsVnd.toLocaleString('vi-VN')} ₫` : 'Đồng giá'} | ${radarMarkdownCell(getRadarSignal(radarIndex, d.slug))} |`
          ),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadDealsCsv = () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Hạng',
      'Thiết Bị',
      'Thương Hiệu',
      'Danh Mục',
      'Điểm Nhu Cầu (/5.0)',
      'Điểm Người Mua (/5.0)',
      'Điểm Chuyên Gia (/10)',
      'Giá Thấp Nhất (VND)',
      'Tiết Kiệm Chênh Sàn (VND)',
      'Chi Phí / Điểm JReviews (VND)',
      'Đường Dẫn',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = rankedDeals.map((d) => [
      d.rank,
      d.name,
      d.brand,
      d.categorySlug,
      d.personaScore5.toFixed(2),
      d.userScore5.toFixed(2),
      d.expertScore10.toFixed(1),
      d.minPrice,
      d.spreadSavingsVnd,
      d.costPerPointVnd,
      `${window.location.origin}${d.productHref}`,
      ...radarCsvCells(getRadarSignal(radarIndex, d.slug)),
    ]);
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deals-${categoryFilter}-${persona}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDealsJson = () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    const payload = {
      source: 'Rate.vn Verified Deal Finder',
      categoryFilter,
      persona,
      maxBudgetVnd,
      exportedAt: new Date().toISOString(),
      dealCount: rankedDeals.length,
      deals: rankedDeals.map((d) => ({
        rank: d.rank,
        slug: d.slug,
        name: d.name,
        brand: d.brand,
        category: d.categorySlug,
        dealRadar: radarExportFields(getRadarSignal(radarIndex, d.slug)),
        personaScore5: d.personaScore5,
        userScore5: d.userScore5,
        expertScore10: d.expertScore10,
        minPriceVnd: d.minPrice,
        spreadSavingsVnd: d.spreadSavingsVnd,
        costPerPointVnd: d.costPerPointVnd,
        href: d.productHref,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deals-${categoryFilter}-${persona}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Filter & Export Control Card */}
      <div className="rate-card p-md-4 mb-4 p-3">
        <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
          <div>
            <span className="badge bg-danger rounded-pill me-2 text-white">
              💎 Săn Deal Đã Kiểm Định 10 Sàn
            </span>
            <strong className="text-dark">
              Đang hiển thị {rankedDeals.length} thiết bị thỏa mãn ngân sách
            </strong>
          </div>
          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyDealsMarkdown}
              data-testid="deals-copy-md-btn"
              className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
            >
              {copiedMarkdown
                ? '✓ Đã sao chép Markdown!'
                : '📋 Sao chép Markdown'}
            </button>
            <button
              type="button"
              onClick={handleDownloadDealsCsv}
              data-testid="deals-export-csv-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              📥 Xuất CSV ({rankedDeals.length})
            </button>
            <button
              type="button"
              onClick={handleDownloadDealsJson}
              data-testid="deals-export-json-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              📦 Xuất JSON ({rankedDeals.length})
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
          <span className="small text-secondary fw-semibold me-1">
            Ngành hàng:
          </span>
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.slug}
              type="button"
              onClick={() => setCategoryFilter(opt.slug)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                categoryFilter === opt.slug
                  ? 'btn-dark fw-bold text-white'
                  : 'btn-light text-secondary border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Persona Pills */}
        <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
          <span className="small text-secondary fw-semibold me-1">
            Ưu tiên chấm điểm:
          </span>
          {PERSONA_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPersona(p.key)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                persona === p.key
                  ? 'btn-danger fw-bold text-white'
                  : 'btn-light text-secondary border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Budget Slider & Search */}
        <div className="row g-3 align-items-center">
          <div className="col-md-6">
            <div className="d-flex justify-content-between small mb-1">
              <span className="fw-semibold text-secondary">
                Trần ngân sách tối đa:
              </span>
              <strong className="text-danger font-monospace">
                ≤ {maxBudgetVnd.toLocaleString('vi-VN')} ₫
              </strong>
            </div>
            <input
              type="range"
              min={5_000_000}
              max={65_000_000}
              step={2_500_000}
              value={maxBudgetVnd}
              onChange={(e) => setMaxBudgetVnd(Number(e.target.value))}
              className="form-range"
              aria-label="Trần ngân sách tối đa"
            />
          </div>
          <div className="col-md-6">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhanh theo tên máy hoặc thương hiệu (Apple, Samsung, Xiaomi, Sony...)"
              className="form-control form-control-sm rounded-pill px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Live Cross-Platform Deal & Fake-Sale Trap Radar */}
      {dealRadar &&
        (filteredGenuineDeals.length > 0 ||
          filteredFakeSaleTraps.length > 0) && (
          <div
            className="rate-card p-md-4 mb-4 p-3"
            data-testid="cross-platform-deal-radar"
          >
            <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
              <div>
                <span className="badge bg-dark rounded-pill text-warning me-2">
                  🔥 RADAR KÈO THƠM & BẪY SALE ẢO 10 SÀN
                </span>
                <strong className="text-dark">
                  Đã quét {dealRadar.totalOffersAnalyzed} gian hàng trên{' '}
                  {dealRadar.totalClustersAnalyzed} cụm sản phẩm
                </strong>
              </div>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyRadarMarkdown}
                  data-testid="radar-copy-md-btn"
                  className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
                >
                  {copiedRadarMd
                    ? '✓ Đã chép Radar MD!'
                    : '📋 Sao chép Radar MD'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRadarCsv}
                  data-testid="radar-export-csv-btn"
                  className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
                >
                  📥 Xuất Radar CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRadarJson}
                  data-testid="radar-export-json-btn"
                  className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
                >
                  📦 Xuất Radar JSON
                </button>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-lg-6">
                <div className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 h-100 border p-3">
                  <div className="fw-bold text-success mb-2">
                    🟢 Kèo Thơm Đáy Lịch Sử Thật ({filteredGenuineDeals.length})
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {filteredGenuineDeals.slice(0, 6).map((g) => (
                      <div
                        key={g.id}
                        className="rounded-3 d-flex justify-content-between align-items-center border bg-white p-2"
                      >
                        <div className="overflow-hidden pe-2">
                          <Link
                            href={g.productHref}
                            className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                          >
                            {g.productName}
                          </Link>
                          <div className="text-secondary small">
                            <span className="badge bg-dark text-uppercase me-1">
                              {g.platform}
                            </span>
                            {g.merchantName} • Trung vị:{' '}
                            {g.marketMedianPrice.toLocaleString('vi-VN')} ₫
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <div className="fw-bold text-success font-monospace small">
                            {g.priceCurrent.toLocaleString('vi-VN')} ₫
                          </div>
                          <span className="badge bg-success rounded-pill">
                            -{g.savingsVsMedianPct}% so trung vị
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="rounded-3 border-danger-subtle bg-danger-subtle bg-opacity-10 h-100 border p-3">
                  <div className="fw-bold text-danger mb-2">
                    🚨 Cảnh Báo Nâng Khống Giá Gốc (
                    {filteredFakeSaleTraps.length})
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {filteredFakeSaleTraps.slice(0, 6).map((t) => (
                      <div
                        key={t.id}
                        className="rounded-3 d-flex justify-content-between align-items-center border bg-white p-2"
                      >
                        <div className="overflow-hidden pe-2">
                          <Link
                            href={t.productHref}
                            className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                          >
                            {t.productName}
                          </Link>
                          <div className="text-secondary small">
                            <span className="badge bg-secondary text-uppercase me-1">
                              {t.platform}
                            </span>
                            {t.merchantName} • Giá gốc kê:{' '}
                            <span className="text-decoration-line-through">
                              {(
                                t.priceOriginal || t.priceCurrent
                              ).toLocaleString('vi-VN')}{' '}
                              ₫
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <div className="fw-bold text-danger font-monospace small">
                            {t.priceCurrent.toLocaleString('vi-VN')} ₫
                          </div>
                          <span className="badge bg-danger rounded-pill">
                            Kê khống +{t.fakeMarkupPct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {filteredPriceSpreadLeaders.length > 0 && (
              <div
                data-testid="deals-price-spread-leaders"
                className="rounded-3 bg-light mt-3 border p-3"
              >
                <div className="fw-bold text-dark small mb-2">
                  📊 Bảng Xếp Hạng Chênh Lệch Giá Đa Sàn Lớn Nhất (
                  {filteredPriceSpreadLeaders.length} thiết bị)
                </div>
                <div className="row g-2">
                  {filteredPriceSpreadLeaders.slice(0, 6).map((s) => (
                    <div key={s.id} className="col-lg-4 col-md-6">
                      <div className="rounded-3 d-flex justify-content-between align-items-center h-100 border bg-white p-2">
                        <div className="overflow-hidden pe-2">
                          <Link
                            href={s.productHref}
                            className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                          >
                            {s.productName}
                          </Link>
                          <div className="text-secondary small">
                            <span className="badge bg-success text-uppercase me-1">
                              {s.cheapestPlatform}
                            </span>
                            ({s.minPrice.toLocaleString('vi-VN')} ₫) vs{' '}
                            <span className="badge bg-secondary text-uppercase">
                              {s.priciestPlatform}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <div className="fw-bold text-success font-monospace small">
                            -{s.spreadVnd.toLocaleString('vi-VN')} ₫
                          </div>
                          <span className="badge bg-warning text-dark rounded-pill">
                            Chênh {s.spreadPct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Ranked Deals Grid */}
      {rankedDeals.length === 0 ? (
        <div className="rate-card p-5 text-center">
          <p className="text-secondary mb-3">
            Không tìm thấy thiết bị nào trong mức ngân sách ≤{' '}
            {maxBudgetVnd.toLocaleString('vi-VN')} ₫.
          </p>
          <button
            type="button"
            onClick={() => {
              setMaxBudgetVnd(65_000_000);
              setCategoryFilter('all');
              setSearchQuery('');
            }}
            className="btn btn-sm btn-dark rounded-pill px-4"
          >
            Đặt lại bộ lọc ngân sách
          </button>
        </div>
      ) : (
        <div className="row g-3">
          {rankedDeals.map((deal) => (
            <div key={deal.slug} className="col-lg-6">
              <div className="rate-card d-flex flex-column justify-content-between h-100 p-3">
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge bg-dark rounded-pill text-white">
                        #{deal.rank} Deal
                      </span>
                      <span className="rate-spec-pill">{deal.brand}</span>
                      <span className="rate-score-badge-user">
                        ★ {deal.personaScore5.toFixed(2)}/5.0
                      </span>
                      <span className="rate-score-badge-expert">
                        Lab {deal.expertScore10.toFixed(1)}/10
                      </span>
                      <RadarBadge
                        signal={getRadarSignal(radarIndex, deal.slug)}
                        minSpreadPct={Infinity}
                      />
                    </div>
                    {deal.spreadSavingsVnd > 0 && (
                      <span className="badge bg-success-subtle text-success rounded-pill font-monospace">
                        Chênh sàn tiết kiệm{' '}
                        {deal.spreadSavingsVnd.toLocaleString('vi-VN')} ₫
                      </span>
                    )}
                  </div>

                  <div className="d-flex align-items-center my-2 gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={deal.thumbnail}
                      alt={deal.name}
                      className="rounded-3 flex-shrink-0 border bg-white p-1"
                      style={{ width: 64, height: 64, objectFit: 'contain' }}
                    />
                    <div className="overflow-hidden">
                      <Link
                        href={deal.productHref}
                        className="fw-bold text-dark text-decoration-none d-block text-truncate"
                      >
                        {deal.name}
                      </Link>
                      <div className="text-danger fw-bold font-monospace mt-1">
                        {deal.minPrice.toLocaleString('vi-VN')} ₫{' '}
                        <span className="text-secondary small fw-normal">
                          ({deal.costPerPointVnd.toLocaleString('vi-VN')} ₫ /
                          điểm JReviews)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center border-top mt-2 flex-wrap gap-2 pt-2">
                  <CompareQuickToggle
                    item={{
                      slug: deal.slug,
                      name: deal.name,
                      brand: deal.brand,
                      thumbnail: deal.thumbnail,
                      min_price: deal.minPrice,
                      categoryPath: deal.categoryPath,
                    }}
                  />
                  <Link
                    href={deal.productHref}
                    className="btn btn-sm btn-dark rounded-pill fw-semibold px-3"
                  >
                    Kiểm định giá 10 sàn →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
