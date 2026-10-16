'use client';

import React, { useEffect, useState } from 'react';
import { Link, useRouter } from '@/lib/navigation';
import {
  getMasterProductHref,
  resolveProductImageUrl,
  type UrlInspectionResult,
} from '@/lib/rate-api';
import { normalizeRateLocale, type SupportedRateLocale } from '@/lib/rate-i18n';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import RadarBadge from '@/components/radar/RadarBadge';
import {
  EMPTY_RADAR_SIGNAL,
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import type { KeySpecs } from '@repo/shared-data';
import {
  BsArrowRight,
  BsCheckCircleFill,
  BsClipboardCheck,
  BsCpu,
  BsExclamationTriangleFill,
  BsGraphDownArrow,
  BsLink45Deg,
  BsSearch,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';

interface DeepInspectWorkspaceProps {
  initialQuery?: string;
  initialInspection?: UrlInspectionResult | null;
  locale?: string;
}

const SAMPLE_AUDIT_URLS = [
  {
    label: 'iPhone 16 128GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-128GB-i.88201679.27110898667',
  },
  {
    label: 'iPhone 16 Plus 256GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-Plus-256GB-i.88201679.29410893286',
  },
  {
    label: 'iPhone 15 128GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-15-128GB-i.88201679.18093055535',
  },
  {
    label: 'Gian hàng: Apple Flagship Store (88201679)',
    query: 'https://shopee.vn/shop/88201679',
  },
];

interface InspectCopy {
  badge: string;
  title: string;
  subtitle: string;
  inputPlaceholder: string;
  inspectBtn: string;
  inspectingBtn: string;
  copyLinkBtn: string;
  copiedLinkBtn: string;
  sampleLabel: string;
  verdictTitle: string;
  claimedOriginalLabel: string;
  currentPriceLabel: string;
  historicalLowLabel: string;
  historicalHighLabel: string;
  fakeSaleWarning: string;
  genuineDiscountBadge: string;
  masterProductSection: string;
  viewFullSpecsBtn: string;
  merchantAuditSection: string;
  dosafeRiskLabel: string;
  reviewRiskLabel: string;
  viewMerchantProfileBtn: string;
  reviewTaxonomySection: string;
  authenticLabel: string;
  coinSpamLabel: string;
  seedingFakeLabel: string;
  sabotageLabel: string;
  offersTableTitle: string;
  colMerchant: string;
  colListingTitle: string;
  colCurrentPrice: string;
  colOriginalPrice: string;
  colAuditStatus: string;
  colAction: string;
  notFoundTitle: string;
  notFoundDesc: string;
}

const INSPECT_COPY: Record<SupportedRateLocale, InspectCopy> = {
  vi: {
    badge: '🔬 Trung Tâm Kiểm Toán Giá Ảo & Tín Nhiệm Đa Sàn (REST API v1)',
    title: 'Kiểm Toán Link Sản Phẩm & Phát Hiện Nâng Khống Giá Gốc',
    subtitle:
      'Dán link Shopee, Lazada, Tiki, TikTok Shop hoặc tên thiết bị để đối chiếu trực tiếp với chuỗi thời gian rate.price_history, kiểm tra điểm rủi ro kép của gian hàng và lọc bình luận Seeding.',
    inputPlaceholder:
      'Dán URL sản phẩm/gian hàng (vd: https://shopee.vn/...-i.88201679.27110898667) hoặc nhập tên máy...',
    inspectBtn: 'Chạy Kiểm Toán Ngay',
    inspectingBtn: 'Đang phân tích...',
    copyLinkBtn: 'Sao chép Link Báo cáo',
    copiedLinkBtn: 'Đã sao chép Link!',
    sampleLabel: 'Chạy thử mẫu dữ liệu thật:',
    verdictTitle: 'Kết Luận Kiểm Toán Giá & Khuyến Mãi Dựa Trên Bằng Chứng',
    claimedOriginalLabel: 'Giá gạch ngang gian hàng khai báo',
    currentPriceLabel: 'Giá bán hiện tại đang niêm yết',
    historicalLowLabel: 'Đáy lịch sử ghi nhận (rate.price_history)',
    historicalHighLabel: 'Đỉnh lịch sử thực tế đã ghi nhận',
    fakeSaleWarning:
      'CẢNH BÁO GIẢM GIÁ ẢO: Giá gạch ngang cao bất thường so với đỉnh lịch sử thực tế!',
    genuineDiscountBadge:
      'ĐÃ KIỂM CHỨNG: Mức giá niêm yết phù hợp với biên độ lịch sử giá thật.',
    masterProductSection: 'Thiết Bị Gốc Đã Chuẩn Hóa 10 Nhóm Thông Số',
    viewFullSpecsBtn: 'Xem 10 nhóm thông số & biểu đồ giá chi tiết',
    merchantAuditSection: 'Hồ Sơ Tín Nhiệm Kép Của Gian Hàng (Dual Risk Score)',
    dosafeRiskLabel: 'Rủi ro an ninh DOSafe Threat Intel',
    reviewRiskLabel: 'Rủi ro gian lận đánh giá (Review Seeding Risk)',
    viewMerchantProfileBtn: 'Xem hồ sơ kiểm toán gian hàng',
    reviewTaxonomySection: 'Phân Bổ 5 Nhóm Đánh Giá Qua AI Review Analyzer',
    authenticLabel: 'Đánh giá thực chất (Authentic)',
    coinSpamLabel: 'Bình luận rác cày xu (Coin Spam)',
    seedingFakeLabel: 'Seeding / Buff đơn ảo',
    sabotageLabel: 'Phá hoại / Dìm hàng bất thường',
    offersTableTitle: 'Bảng Đối Chiếu Giá Chéo Giữa Các Gian Hàng Cùng Mẫu Máy',
    colMerchant: 'Gian hàng / Sàn',
    colListingTitle: 'Tên niêm yết trên sàn',
    colCurrentPrice: 'Giá hiện tại',
    colOriginalPrice: 'Giá gạch ngang',
    colAuditStatus: 'Trạng thái kiểm định',
    colAction: 'Liên kết',
    notFoundTitle: 'Chưa Tìm Thấy Bản Ghi Trùng Khớp Trực Tiếp',
    notFoundDesc:
      'Hãy thử chọn một trong các đường dẫn mẫu bên trên hoặc tìm theo tên dòng máy (ví dụ: iPhone 16, Galaxy S24, MacBook).',
  },
  en: {
    badge: '🔬 Deep URL & Fake Discount Audit Center (REST API v1)',
    title: 'Inspect Marketplace URLs & Detect Inflated Strikethrough Prices',
    subtitle:
      'Paste any Shopee, Lazada, Tiki, or TikTok Shop listing link or device name to cross-check against rate.price_history time-series, Dual Merchant Risk Scores, and AI Review Seeding analysis.',
    inputPlaceholder:
      'Paste product/shop URL (e.g. https://shopee.vn/...-i.88201679.27110898667) or model name...',
    inspectBtn: 'Run Deep Audit',
    inspectingBtn: 'Auditing...',
    copyLinkBtn: 'Copy Shareable Audit Link',
    copiedLinkBtn: 'Audit Link Copied!',
    sampleLabel: 'Try live verified URLs:',
    verdictTitle: 'Evidence-Based Price & Discount Audit Verdict',
    claimedOriginalLabel: 'Seller Claimed Strikethrough Price',
    currentPriceLabel: 'Current Listed Selling Price',
    historicalLowLabel: 'Verified Historical Low (rate.price_history)',
    historicalHighLabel: 'Verified Historical High',
    fakeSaleWarning:
      'INFLATED FAKE SALE ALERT: Claimed original price exceeds verified historical peak!',
    genuineDiscountBadge:
      'VERIFIED: Listed price aligns with genuine historical price observations.',
    masterProductSection: 'Matched Canonical Product (10 Spec Groups)',
    viewFullSpecsBtn: 'View 10 spec groups & full price history',
    merchantAuditSection: 'Merchant Dual Risk Score Audit',
    dosafeRiskLabel: 'DOSafe Cybersecurity Threat Risk',
    reviewRiskLabel: 'AI Review Manipulation & Seeding Risk',
    viewMerchantProfileBtn: 'Open Merchant Audit Profile',
    reviewTaxonomySection: 'AI Review Analyzer 5-Category Breakdown',
    authenticLabel: 'Authentic Buyer Reviews',
    coinSpamLabel: 'Low-Value Coin Farming Spam',
    seedingFakeLabel: 'Paid Seeding / Fake Reviews',
    sabotageLabel: 'Competitor Sabotage / Review Bombing',
    offersTableTitle: 'Cross-Merchant Offer Comparison for This Model',
    colMerchant: 'Merchant / Platform',
    colListingTitle: 'Marketplace Listing Title',
    colCurrentPrice: 'Current Price',
    colOriginalPrice: 'Strikethrough',
    colAuditStatus: 'Audit Verdict',
    colAction: 'Link',
    notFoundTitle: 'No Direct Listing Match Found Yet',
    notFoundDesc:
      'Try clicking one of the live sample URLs above or enter a standardized device name (e.g. iPhone 16).',
  },
  cs: {
    badge: '🔬 Hloubkový audit URL a falešných slev (REST API v1)',
    title: 'Kontrola odkazů z tržišť a detekce uměle navýšených cen',
    subtitle:
      'Vložte odkaz ze Shopee, Lazada, Tiki nebo název zařízení pro okamžité porovnání s historií cen rate.price_history, duálním skóre rizika obchodu a AI analýzou recenzí.',
    inputPlaceholder:
      'Vložte URL produktu/obchodu (např. https://shopee.vn/...-i.88201679.27110898667) nebo název modelu...',
    inspectBtn: 'Spustit hloubkový audit',
    inspectingBtn: 'Probíhá analýza...',
    copyLinkBtn: 'Kopírovat odkaz na report',
    copiedLinkBtn: 'Odkaz zkopírován!',
    sampleLabel: 'Vyzkoušejte živé ukázky:',
    verdictTitle: 'Výsledek auditu ceny a slevy na základě důkazů',
    claimedOriginalLabel: 'Deklarovaná přeškrtnutá cena prodejce',
    currentPriceLabel: 'Aktuální prodejní cena',
    historicalLowLabel: 'Historické minimum (rate.price_history)',
    historicalHighLabel: 'Skutečné historické maximum',
    fakeSaleWarning:
      'VAROVÁNÍ FALEŠNÉ SLEVY: Přeškrtnutá cena převyšuje historické maximum!',
    genuineDiscountBadge:
      'OVĚŘENO: Cena odpovídá skutečné historii pozorovaných cen.',
    masterProductSection: 'Spárovaný kanonický produkt (10 skupin parametrů)',
    viewFullSpecsBtn: 'Zobrazit 10 skupin parametrů a graf cen',
    merchantAuditSection: 'Duální skóre rizika obchodu (Dual Risk Score)',
    dosafeRiskLabel: 'Kyberbezpečnostní riziko DOSafe',
    reviewRiskLabel: 'Riziko manipulace recenzí (Seeding)',
    viewMerchantProfileBtn: 'Zobrazit audit obchodu',
    reviewTaxonomySection: 'Rozdělení recenzí podle AI Review Analyzer',
    authenticLabel: 'Skutečné recenze (Authentic)',
    coinSpamLabel: 'Spam za mince (Coin Spam)',
    seedingFakeLabel: 'Placený seeding / falešné recenze',
    sabotageLabel: 'Sabotáž / Review bombing',
    offersTableTitle: 'Porovnání nabídek napříč obchody pro tento model',
    colMerchant: 'Obchod / Platforma',
    colListingTitle: 'Název nabídky',
    colCurrentPrice: 'Aktuální cena',
    colOriginalPrice: 'Původní cena',
    colAuditStatus: 'Stav auditu',
    colAction: 'Odkaz',
    notFoundTitle: 'Žádná přímá shoda nebyla nalezena',
    notFoundDesc:
      'Vyzkoušejte některý z ukázkových odkazů výše nebo zadejte název zařízení (např. iPhone 16).',
  },
};

export default function DeepInspectWorkspace({
  initialQuery = '',
  initialInspection = null,
  locale,
}: DeepInspectWorkspaceProps) {
  const normalizedLocale = normalizeRateLocale(locale);
  const copy = INSPECT_COPY[normalizedLocale];
  const router = useRouter();

  const [queryInput, setQueryInput] = useState(
    initialQuery || SAMPLE_AUDIT_URLS[0]!.query
  );
  const [result, setResult] = useState<UrlInspectionResult | null>(
    initialInspection
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const radarIndex = useDealRadarIndex();

  const runInspection = async (targetQuery: string) => {
    const clean = targetQuery.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/v1/rate/inspect?q=${encodeURIComponent(clean)}`
      );
      const payload = (await res.json()) as {
        ok?: boolean;
        data?: UrlInspectionResult;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.data) {
        setErrorMsg(payload.error || 'Failed to inspect URL');
      } else {
        setResult(payload.data);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialInspection && queryInput) {
      void runInspection(queryInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = queryInput.trim();
    if (!clean) return;
    router.replace(`/inspect?q=${encodeURIComponent(clean)}`);
    await runInspection(clean);
  };

  const handleSelectSample = async (sampleQuery: string) => {
    setQueryInput(sampleQuery);
    router.replace(`/inspect?q=${encodeURIComponent(sampleQuery)}`);
    await runInspection(sampleQuery);
  };

  const handleCopyReportLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
      queryInput.trim()
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const master = result?.masterProduct ?? null;
  const matchedOffer = result?.matchedOffer ?? result?.allOffers?.[0] ?? null;
  const discount = result?.discountAnalysis ?? null;
  const priceHistory = result?.priceHistory ?? null;
  const reviewSummary = result?.reviewSummary ?? null;
  const merchant = result?.merchantProfile ?? null;

  const radarSignal =
    result?.radarSignal ??
    (master ? getRadarSignal(radarIndex, master.slug) : EMPTY_RADAR_SIGNAL);
  const matchedGenuineDeal = radarSignal.genuineDeal ?? null;
  const matchedFakeTrap = radarSignal.fakeSaleTrap ?? null;
  const matchedPriceSpread = radarSignal.priceSpread ?? null;

  const handleCopyAuditMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
        queryInput.trim()
      )}`;
      const currentListedPrice = Number(
        matchedOffer?.price_current || master?.min_price || 0
      );
      const claimedOrigPrice = matchedOffer?.price_original
        ? Number(matchedOffer.price_original)
        : null;
      const histLow = Number(
        priceHistory?.lowestEverPrice || master?.min_price || 0
      );
      const histHigh = Number(
        priceHistory?.highestEverPrice || master?.max_price || 0
      );
      const masterUserRating = master
        ? Number(master.user_rating_weighted || master.average_rating || 0)
        : 0;
      const lines = [
        `### 🔬 Biên Bản Kiểm Toán Giá & Tín Nhiệm (Rate.vn Inspector)`,
        `- **Truy vấn kiểm định:** \`${queryInput.trim()}\``,
        ...(master
          ? [
              `- **Thiết bị gốc chuẩn hóa:** ${master.name} (\`${master.model_key}\`)`,
              `- **Điểm Người Mua Thực Chất (JReviews):** ${masterUserRating > 0 ? `★ ${masterUserRating.toFixed(2)}/5.0` : 'chưa có điểm'} (${master.authentic_review_count || master.total_reviews || 0} đánh giá thật)`,
              `- **Tín hiệu Deal Radar 60N:** ${radarMarkdownCell(radarSignal)}`,
            ]
          : []),
        ...(discount
          ? [
              `- **Kết luận kiểm định giá:** **${discount.badge_label}** (${discount.explanation})`,
            ]
          : []),
        ...(currentListedPrice > 0
          ? [
              `- **Giá đang niêm yết:** ${currentListedPrice.toLocaleString('vi-VN')} ₫${claimedOrigPrice ? ` | Giá gạch ngang khai báo: ${claimedOrigPrice.toLocaleString('vi-VN')} ₫` : ''}`,
              `- **Biên độ lịch sử giá thật:** Đáy ${histLow.toLocaleString('vi-VN')} ₫ - Đỉnh ${histHigh.toLocaleString('vi-VN')} ₫`,
            ]
          : []),
        ...(matchedGenuineDeal
          ? [
              `- **Tín hiệu Radar Kèo Thơm 10 Sàn:** 🔥 Đáy giá -${matchedGenuineDeal.savingsVsMedianPct}% so trung vị tại ${matchedGenuineDeal.platform.toUpperCase()} (${matchedGenuineDeal.merchantName})`,
            ]
          : []),
        ...(matchedFakeTrap
          ? [
              `- **Cảnh báo Radar Bẫy Sale Ảo 10 Sàn:** 🚨 Kê khống giá gốc +${matchedFakeTrap.fakeMarkupPct}% tại ${matchedFakeTrap.platform.toUpperCase()} (${matchedFakeTrap.merchantName})`,
            ]
          : []),
        ...(matchedPriceSpread
          ? [
              `- **Kiểm toán Độ lệch giá 10 sàn:** Chênh lệch **+${matchedPriceSpread.spreadPct}%** (${matchedPriceSpread.spreadVnd.toLocaleString('vi-VN')} ₫) giữa ${matchedPriceSpread.cheapestPlatform.toUpperCase()} (${matchedPriceSpread.minPrice.toLocaleString('vi-VN')} ₫) và ${matchedPriceSpread.priciestPlatform.toUpperCase()} (${matchedPriceSpread.maxPrice.toLocaleString('vi-VN')} ₫)`,
            ]
          : []),
        ...(merchant
          ? [
              `- **Gian hàng:** ${merchant.name} (${merchant.platform.toUpperCase()}) | Trust Score: **${merchant.trust_score}/100** (DOSafe Risk: ${merchant.dosafe_risk_score}/100, Seeding Risk: ${merchant.review_risk_score}/100)`,
            ]
          : []),
        `- **Xem báo cáo trực tiếp:** ${shareUrl}`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadInspectCsv = () => {
    if (typeof window === 'undefined' || !result) return;
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Gian Hàng',
      'Sàn',
      'Tên Niêm Yết',
      'Giá Hiện Tại (VND)',
      'Giá Gạch Ngang (VND)',
      'Đáy Lịch Sử (VND)',
      'Đỉnh Lịch Sử (VND)',
      'Độ Lệch Giá 10 Sàn (%)',
      'Kết Luận Kiểm Toán',
      ...RADAR_CSV_HEADERS,
    ];
    const offers = result.allOffers || (matchedOffer ? [matchedOffer] : []);
    const histLow = Number(
      priceHistory?.lowestEverPrice || master?.min_price || 0
    );
    const histHigh = Number(
      priceHistory?.highestEverPrice || master?.max_price || 0
    );
    const rows = offers.map((o) => [
      o.merchant?.name || merchant?.name || 'Marketplace Shop',
      (o.merchant?.platform || merchant?.platform || 'shopee').toUpperCase(),
      o.title || master?.name || queryInput.trim(),
      Number(o.price_current || 0),
      Number(o.price_original || 0),
      histLow,
      histHigh,
      matchedPriceSpread?.spreadPct ?? 0,
      discount?.badge_label || 'Đã kiểm định',
      ...radarCsvCells(radarSignal),
    ]);
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-inspect-${master?.slug || 'audit'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadInspectJson = () => {
    if (typeof window === 'undefined' || !result) return;
    const payload = {
      source: 'Rate.vn Deep URL & Fake Discount Inspector',
      query: queryInput.trim(),
      exportedAt: new Date().toISOString(),
      dealRadar: radarExportFields(radarSignal),
      dealRadarContext: {
        genuineDeal: matchedGenuineDeal,
        fakeSaleTrap: matchedFakeTrap,
        priceSpread: matchedPriceSpread,
      },
      inspection: result,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-inspect-${master?.slug || 'audit'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const keySpecs = (master?.key_specs || {}) as KeySpecs;
  const productHref = master ? getMasterProductHref(master) : '/smartphones';
  const productCategoryPath =
    productHref.replace(`/${master?.slug || ''}`, '') || '/smartphones';

  return (
    <div className="bg-light py-5">
      <div className="container">
        {/* Top Hero Inspector Card */}
        <div className="rate-scoreboard-dark p-lg-5 mb-4 p-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <span className="rate-eyebrow text-white">{copy.badge}</span>
            <div className="d-flex align-items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyAuditMarkdown}
                className="btn btn-sm btn-danger rounded-pill d-inline-flex align-items-center fw-semibold gap-2 px-3"
              >
                <BsClipboardCheck />
                <span>
                  {copiedMd
                    ? '✓ Đã chép biên bản Markdown!'
                    : '📋 Sao chép biên bản Markdown'}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDownloadInspectCsv}
                data-testid="inspect-export-csv-btn"
                className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
              >
                📥 Xuất CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadInspectJson}
                data-testid="inspect-export-json-btn"
                className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
              >
                📦 Xuất JSON
              </button>
              <button
                type="button"
                onClick={handleCopyReportLink}
                className="btn btn-sm btn-outline-light rounded-pill d-inline-flex align-items-center gap-2 px-3"
              >
                <BsClipboardCheck />
                <span>{copied ? copy.copiedLinkBtn : copy.copyLinkBtn}</span>
              </button>
            </div>
          </div>

          <h1 className="h2 fw-bold mb-2 text-white">{copy.title}</h1>
          <p className="text-white-50 mb-4">{copy.subtitle}</p>

          <form onSubmit={handleFormSubmit} className="row g-2 mb-3">
            <div className="col-lg-9">
              <div className="input-group input-group-lg">
                <span className="input-group-text text-danger border-0 bg-white">
                  <BsLink45Deg className="fs-4" />
                </span>
                <input
                  type="text"
                  className="form-control border-0"
                  placeholder={copy.inputPlaceholder}
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                />
              </div>
            </div>
            <div className="col-lg-3 d-grid">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-danger btn-lg fw-semibold d-flex align-items-center justify-content-center gap-2"
              >
                <BsSearch />
                <span>{loading ? copy.inspectingBtn : copy.inspectBtn}</span>
              </button>
            </div>
          </form>

          {/* Sample quick-test pills */}
          <div className="d-flex align-items-center flex-wrap gap-2 pt-2">
            <span className="small text-white-50">{copy.sampleLabel}</span>
            {SAMPLE_AUDIT_URLS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => handleSelectSample(s.query)}
                className="btn btn-sm btn-outline-light rounded-pill small px-3 py-1"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="alert alert-danger rounded-4 mb-4 p-4">
            <BsExclamationTriangleFill className="me-2" />
            {errorMsg}
          </div>
        )}

        {result && (master || merchant) ? (
          <div className="row g-4">
            {/* Left 8 Columns: Price Verdict, Master Product & Cross-Merchant Offers */}
            <div className="col-lg-8 d-flex flex-column gap-4">
              {/* 1. Price & Fake Discount Verdict Card */}
              {(matchedOffer || priceHistory) && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h2 className="h5 fw-bold text-dark d-flex align-items-center mb-0 gap-2">
                      <BsGraphDownArrow className="text-danger" />
                      <span>{copy.verdictTitle}</span>
                    </h2>
                    {discount?.verdict === 'fake_discount' ? (
                      <span className="badge bg-danger rounded-pill px-3 py-2 text-white">
                        <BsExclamationTriangleFill className="me-1" />
                        {copy.fakeSaleWarning}
                      </span>
                    ) : (
                      <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-3 py-2">
                        <BsCheckCircleFill className="me-1" />
                        {copy.genuineDiscountBadge}
                      </span>
                    )}
                  </div>

                  <div className="row g-3">
                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {copy.currentPriceLabel}
                        </div>
                        <div className="h5 fw-bold text-danger font-monospace mb-0">
                          {Number(
                            matchedOffer?.price_current ||
                              master?.min_price ||
                              0
                          ).toLocaleString('vi-VN')}{' '}
                          ₫
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {copy.claimedOriginalLabel}
                        </div>
                        <div className="h6 fw-semibold text-secondary text-decoration-line-through font-monospace mb-0">
                          {matchedOffer?.price_original
                            ? `${Number(
                                matchedOffer.price_original
                              ).toLocaleString('vi-VN')} ₫`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {copy.historicalLowLabel}
                        </div>
                        <div className="h6 fw-bold text-success font-monospace mb-0">
                          {priceHistory?.lowestEverPrice
                            ? `${Number(
                                priceHistory.lowestEverPrice
                              ).toLocaleString('vi-VN')} ₫`
                            : `${Number(master?.min_price || 0).toLocaleString(
                                'vi-VN'
                              )} ₫`}
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {copy.historicalHighLabel}
                        </div>
                        <div className="h6 fw-bold text-dark font-monospace mb-0">
                          {priceHistory?.highestEverPrice
                            ? `${Number(
                                priceHistory.highestEverPrice
                              ).toLocaleString('vi-VN')} ₫`
                            : `${Number(master?.max_price || 0).toLocaleString(
                                'vi-VN'
                              )} ₫`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {discount?.explanation && (
                    <div
                      className={`rounded-3 small fw-medium mt-3 p-3 ${
                        discount.verdict === 'fake_discount'
                          ? 'bg-danger bg-opacity-10 text-danger'
                          : 'bg-success bg-opacity-10 text-success'
                      }`}
                    >
                      <strong>{discount.badge_label}:</strong>{' '}
                      {discount.explanation}
                    </div>
                  )}

                  {(matchedGenuineDeal ||
                    matchedFakeTrap ||
                    matchedPriceSpread) && (
                    <div
                      className="rounded-3 bg-light mt-3 border p-3"
                      data-testid="inspect-deal-radar-verdict"
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <span className="badge bg-dark rounded-pill text-warning">
                          🔥 TÍN HIỆU RADAR 10 SÀN &amp; CHÊNH LỆCH GIÁ
                        </span>
                        <Link
                          href="/deals"
                          className="small fw-semibold text-danger text-decoration-none"
                        >
                          Mở Radar Kèo Thơm 10 Sàn →
                        </Link>
                      </div>
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        {matchedGenuineDeal && (
                          <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-3 py-2">
                            🟢 Kèo thơm đáy giá -
                            {matchedGenuineDeal.savingsVsMedianPct}% tại{' '}
                            {matchedGenuineDeal.platform.toUpperCase()} (
                            {matchedGenuineDeal.priceCurrent.toLocaleString(
                              'vi-VN'
                            )}{' '}
                            ₫)
                          </span>
                        )}
                        {matchedFakeTrap && (
                          <span className="badge bg-danger-subtle text-danger border-danger-subtle rounded-pill border px-3 py-2">
                            🚨 Cảnh báo Sale Ảo +{matchedFakeTrap.fakeMarkupPct}
                            % tại {matchedFakeTrap.platform.toUpperCase()}
                          </span>
                        )}
                        {matchedPriceSpread && (
                          <span className="badge bg-warning-subtle text-dark border-warning-subtle rounded-pill border px-3 py-2">
                            📊 Độ lệch giá 10 sàn: +
                            {matchedPriceSpread.spreadPct}% (Chênh{' '}
                            {matchedPriceSpread.spreadVnd.toLocaleString(
                              'vi-VN'
                            )}{' '}
                            ₫ giữa{' '}
                            {matchedPriceSpread.cheapestPlatform.toUpperCase()}{' '}
                            và{' '}
                            {matchedPriceSpread.priciestPlatform.toUpperCase()})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Canonical Master Product Card */}
              {master && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
                    <div>
                      <span className="badge bg-dark rounded-pill mb-2 px-3 py-1 text-white">
                        {copy.masterProductSection}
                      </span>
                      <h3 className="h4 fw-bold text-dark mb-1">
                        {master.name}
                      </h3>
                      <div className="small text-muted">
                        Model Key: <code>{master.model_key}</code> | Brand:{' '}
                        <strong>{master.brand}</strong>
                      </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                      <CompareQuickToggle
                        item={{
                          slug: master.slug,
                          name: master.name,
                          brand: master.brand,
                          categoryPath: productCategoryPath,
                          thumbnail: resolveProductImageUrl(
                            master.slug,
                            master.thumbnail || master.images?.[0] || null
                          ),
                          min_price: Number(master.min_price || 0),
                        }}
                      />
                      <PriceWatchButton
                        slug={master.slug}
                        name={master.name}
                        brand={master.brand}
                        categoryPath={productCategoryPath}
                        thumbnail={resolveProductImageUrl(
                          master.slug,
                          master.thumbnail || master.images?.[0] || null
                        )}
                        currentMinPrice={Number(master.min_price || 0)}
                      />
                    </div>
                  </div>

                  {/* Quick Key Specs Strip */}
                  <div className="row g-2 mb-3">
                    {keySpecs.chip && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <BsCpu className="text-danger me-1" />
                          <strong>SoC:</strong> {keySpecs.chip}
                        </div>
                      </div>
                    )}
                    {keySpecs.ram && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>RAM/ROM:</strong> {keySpecs.ram} /{' '}
                          {keySpecs.storage || ''}
                        </div>
                      </div>
                    )}
                    {keySpecs.battery && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>Battery:</strong> {keySpecs.battery}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top flex-wrap gap-2 pt-3">
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <span className="rate-score-badge-user">
                        <BsStarFill className="text-warning" />
                        <span>
                          {Number(
                            master.user_rating_weighted ||
                              master.average_rating ||
                              0
                          ) > 0
                            ? `${Number(
                                master.user_rating_weighted ||
                                  master.average_rating ||
                                  0
                              ).toFixed(1)}/5.0`
                            : 'User: chưa có điểm'}
                        </span>
                      </span>
                      <span className="rate-score-badge-expert">
                        <span>
                          Expert{' '}
                          {master.expert_rating != null &&
                          Number(master.expert_rating) > 0
                            ? `${Number(master.expert_rating).toFixed(1)}/10`
                            : 'chưa có điểm'}
                        </span>
                      </span>
                      <RadarBadge signal={radarSignal} />
                      <span className="small text-muted">
                        (
                        {master.authentic_review_count ||
                          master.total_reviews ||
                          0}{' '}
                        verified reviews)
                      </span>
                    </div>
                    <Link
                      href={productHref}
                      className="btn btn-danger rounded-pill btn-sm fw-semibold d-inline-flex align-items-center gap-2 px-4"
                    >
                      <span>{copy.viewFullSpecsBtn}</span>
                      <BsArrowRight />
                    </Link>
                  </div>
                </div>
              )}

              {/* 3. Cross-Merchant Offers Table */}
              {result.allOffers && result.allOffers.length > 0 && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <h3 className="h5 fw-bold text-dark mb-3">
                    {copy.offersTableTitle} ({result.allOffers.length})
                  </h3>
                  <div className="table-responsive">
                    <table className="mb-0 table align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>{copy.colMerchant}</th>
                          <th>{copy.colListingTitle}</th>
                          <th>{copy.colCurrentPrice}</th>
                          <th>{copy.colOriginalPrice}</th>
                          <th>{copy.colAction}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.allOffers.map((offer) => (
                          <tr key={offer.id}>
                            <td>
                              <div className="fw-semibold text-dark">
                                {offer.merchant?.name || 'Marketplace Shop'}
                              </div>
                              <span className="badge bg-secondary bg-opacity-10 text-secondary text-uppercase small">
                                {offer.merchant?.platform || 'shopee'}
                              </span>
                            </td>
                            <td className="small text-muted">{offer.title}</td>
                            <td className="fw-bold text-danger">
                              {Number(offer.price_current).toLocaleString(
                                'vi-VN'
                              )}{' '}
                              ₫
                            </td>
                            <td className="small text-muted text-decoration-line-through">
                              {offer.price_original
                                ? `${Number(
                                    offer.price_original
                                  ).toLocaleString('vi-VN')} ₫`
                                : '-'}
                            </td>
                            <td>
                              {offer.merchant?.id && (
                                <Link
                                  href={`/merchants/${offer.merchant.id}`}
                                  className="btn btn-sm btn-outline-dark rounded-pill px-3"
                                >
                                  Audit Shop
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right 4 Columns: Merchant Dual Risk Profile & AI Review Taxonomy */}
            <div className="col-lg-4 d-flex flex-column gap-4">
              {merchant && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex align-items-center mb-3 gap-2">
                    <BsShop className="text-danger fs-4" />
                    <h3 className="h5 fw-bold text-dark mb-0">
                      {copy.merchantAuditSection}
                    </h3>
                  </div>

                  <div className="rounded-3 bg-light mb-3 p-3">
                    <div className="fw-bold text-dark fs-5 mb-1">
                      {merchant.name}
                    </div>
                    <div className="d-flex align-items-center small text-muted flex-wrap gap-2">
                      <span className="badge bg-dark text-uppercase">
                        {merchant.platform}
                      </span>
                      {merchant.is_official && (
                        <span className="badge bg-danger">Official Mall</span>
                      )}
                      <span>ID: {merchant.platform_shop_id}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{copy.dosafeRiskLabel}</span>
                      <strong className="text-success">
                        {Number(merchant.dosafe_risk_score || 0).toFixed(0)}/100
                      </strong>
                    </div>
                    <div className="progress" style={{ height: 8 }}>
                      <div
                        className="progress-bar bg-success"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, Number(merchant.dosafe_risk_score || 0))
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{copy.reviewRiskLabel}</span>
                      <strong
                        className={
                          Number(merchant.review_risk_score || 0) >= 40
                            ? 'text-danger'
                            : 'text-primary'
                        }
                      >
                        {Number(merchant.review_risk_score || 0).toFixed(0)}/100
                      </strong>
                    </div>
                    <div className="progress" style={{ height: 8 }}>
                      <div
                        className={`progress-bar ${
                          Number(merchant.review_risk_score || 0) >= 40
                            ? 'bg-danger'
                            : 'bg-primary'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, Number(merchant.review_risk_score || 0))
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Link
                    href={`/merchants/${merchant.id}`}
                    className="btn btn-outline-danger rounded-pill fw-semibold w-100"
                  >
                    <BsShieldCheck className="me-2" />
                    {copy.viewMerchantProfileBtn}
                  </Link>
                </div>
              )}

              {reviewSummary && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex align-items-center mb-3 gap-2">
                    <BsShieldExclamation className="text-danger fs-4" />
                    <h3 className="h5 fw-bold text-dark mb-0">
                      {copy.reviewTaxonomySection}
                    </h3>
                  </div>

                  <div className="d-flex flex-column small gap-2">
                    <div className="d-flex justify-content-between rounded-3 bg-success bg-opacity-10 text-success fw-semibold p-2">
                      <span>✅ {copy.authenticLabel}</span>
                      <span>{reviewSummary.authentic_pct}%</span>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-warning bg-opacity-10 text-dark p-2">
                      <span>🪙 {copy.coinSpamLabel}</span>
                      <strong>{reviewSummary.suspicious_pct}%</strong>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-danger bg-opacity-10 text-danger p-2">
                      <span>🤖 {copy.seedingFakeLabel}</span>
                      <strong>{reviewSummary.fake_pct}%</strong>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-secondary bg-opacity-10 text-secondary p-2">
                      <span>📊 Total Audited</span>
                      <strong>{reviewSummary.total_analyzed}</strong>
                    </div>
                    {reviewSummary.ai_summary && (
                      <div className="rounded-3 bg-light text-muted mt-1 p-2">
                        {reviewSummary.ai_summary}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          !loading && (
            <div className="card rounded-4 border-0 bg-white p-5 text-center shadow-sm">
              <h2 className="h4 fw-bold text-dark mb-2">
                {copy.notFoundTitle}
              </h2>
              <p className="text-muted mb-4">{copy.notFoundDesc}</p>
              {result?.suggestions && result.suggestions.length > 0 && (
                <div className="d-flex justify-content-center flex-wrap gap-2">
                  {result.suggestions.map((item) => (
                    <Link
                      key={item.id}
                      href={getMasterProductHref(item)}
                      className="btn btn-outline-danger rounded-pill btn-sm px-3"
                    >
                      {item.name} (
                      {Number(item.min_price).toLocaleString('vi-VN')} ₫)
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
