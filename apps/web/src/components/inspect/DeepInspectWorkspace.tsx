'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import AnalyzerText from '@/components/reviews/AnalyzerText';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';
import { Link, useRouter } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductHref,
  resolveCompareBatteryMah,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
  resolveCompareRamGb,
  resolveCompareStorageGb,
  resolveProductImageUrl,
  type UrlInspectionResult,
} from '@/lib/rate-domain';
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
import { escapeCsvCell } from '@/lib/csv-safe';
import type { KeySpecs } from '@repo/shared-data';
import {
  BsArrowRight,
  BsBarChart,
  BsCheckCircle,
  BsCheckCircleFill,
  BsCoin,
  BsCpu,
  BsDownload,
  BsExclamationTriangleFill,
  BsGraphDownArrow,
  BsLink45Deg,
  BsRobot,
  BsSearch,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';
import ContentText from '@/components/elementary/ContentText';
import { contentLang } from '@/lib/content-lang';
import { SAMPLE_AUDIT_URLS } from '@/lib/inspect-samples';
import {
  implausiblyLowOfferIds,
  plausibleOffers,
} from '@repo/shared-data/rules';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import { productImageUrl } from '@/lib/rate-domain-core';

const INSPECT_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeInspectQuery(rawQuery: unknown, maxLen = 512): string {
  if (typeof rawQuery !== 'string') return '';
  const cleaned = rawQuery
    .replace(INSPECT_CONTROL_CHARS_RE, ' ')
    .replace(/`+/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeInspectPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function sanitizeInspectDownloadSlug(
  value: unknown,
  fallback = 'audit'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(INSPECT_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

interface DeepInspectWorkspaceProps {
  initialQuery?: string;
  initialInspection?: UrlInspectionResult | null;
  locale?: string;
}

export default function DeepInspectWorkspace({
  initialQuery = '',
  initialInspection = null,
}: DeepInspectWorkspaceProps) {
  const t = useTranslations('inspect');
  const tVerdict = useTranslations('priceVerdict');
  const locale = useLocale();
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
    const clean = sanitizeInspectQuery(targetQuery);
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
        setErrorMsg(t('errInspectFailed'));
      } else {
        setResult(payload.data);
      }
    } catch {
      setErrorMsg(t('errNetwork'));
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
    const clean = sanitizeInspectQuery(queryInput);
    if (!clean) return;
    router.replace(`/inspect?q=${encodeURIComponent(clean)}`);
    await runInspection(clean);
  };

  const handleSelectSample = async (sampleQuery: string) => {
    const clean = sanitizeInspectQuery(sampleQuery);
    if (!clean) return;
    setQueryInput(clean);
    router.replace(`/inspect?q=${encodeURIComponent(clean)}`);
    await runInspection(clean);
  };

  const handleCopyReportLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
      sanitizeInspectQuery(queryInput)
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
  // A sold-out listing is never the fallback match (DOS/Rate#1177).
  const matchedOffer =
    result?.matchedOffer ??
    plausibleOffers(
      (result?.allOffers ?? []).filter((o) => !isOfferUnavailable(o))
    )[0] ??
    null;
  const discount = result?.discountAnalysis ?? null;
  // Judged as the product page's offers table judges the row (#797).
  const implausibleOfferIds = implausiblyLowOfferIds(result?.allOffers ?? []);
  const offerImplausiblyLow =
    !!matchedOffer && implausibleOfferIds.has(matchedOffer.id);
  // Bait-price offers are labelled and listed after the plausible ones (#805).
  const listedOffers = [
    ...(result?.allOffers ?? []).filter((o) => !implausibleOfferIds.has(o.id)),
    ...(result?.allOffers ?? []).filter((o) => implausibleOfferIds.has(o.id)),
  ];
  const priceHistory = result?.priceHistory ?? null;
  const reviewSummary = result?.reviewSummary ?? null;
  const merchant = result?.merchantProfile ?? null;

  const radarSignal =
    result?.radarSignal ??
    (master ? getRadarSignal(radarIndex, master.slug) : EMPTY_RADAR_SIGNAL);
  const matchedGenuineDeal = radarSignal.genuineDeal ?? null;
  const matchedFakeTrap = radarSignal.fakeSaleTrap ?? null;
  const matchedPriceSpread = radarSignal.priceSpread ?? null;

  const masterUserRating = master
    ? resolveCompareEffectiveUserRating(master)
    : 0;
  const masterExpertRating10 = master
    ? resolveCompareExpertRating10(master)
    : null;

  const handleCopyAuditMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const cleanQuery = sanitizeInspectQuery(queryInput);
      const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
        cleanQuery
      )}`;
      const currentListedPrice = sanitizeInspectPriceVnd(
        matchedOffer?.price_current || master?.min_price || 0
      );
      const rawClaimedOrig = sanitizeInspectPriceVnd(
        matchedOffer?.price_original
      );
      const claimedOrigPrice = rawClaimedOrig > 0 ? rawClaimedOrig : null;
      const histLow = sanitizeInspectPriceVnd(
        priceHistory?.lowestEverPrice || master?.min_price || 0
      );
      const histHigh = sanitizeInspectPriceVnd(
        priceHistory?.highestEverPrice || master?.max_price || 0
      );
      const lines = [
        `### 🔬 ${t('title')} · Rate.vn`,
        `- **${t('mdQuery')}:** \`${cleanQuery}\``,
        ...(master
          ? [
              `- **${t('mdProduct')}:** ${master.name} (\`${master.model_key}\`)`,
              `- **${t('mdBuyerScore')}:** ${masterUserRating > 0 ? `★ ${masterUserRating.toFixed(2)}/5.0` : t('userNoScore')}${masterExpertRating10 != null ? ` | ${t('mdExpertScore')}: ${masterExpertRating10.toFixed(1)}/10` : ''} ${t('verifiedReviewsCount', { count: master.authentic_review_count || master.total_reviews || 0 })}`,
              `- **${t('mdPriceSignal')}:** ${radarMarkdownCell(radarSignal, locale)}`,
            ]
          : []),
        ...(discount
          ? [
              `- **${t('mdPriceVerdict')}:** **${discountVerdictCopy(tVerdict, discount).label}** (${discountVerdictCopy(tVerdict, discount).explanation})`,
            ]
          : []),
        ...(currentListedPrice > 0
          ? [
              `- **${t('currentPriceLabel')}:** ${currentListedPrice.toLocaleString('vi-VN')} ₫${claimedOrigPrice ? ` | ${t('claimedOriginalLabel')}: ${claimedOrigPrice.toLocaleString('vi-VN')} ₫` : ''}`,
              `- **${t('historicalLowLabel')} / ${t('historicalHighLabel')}:** ${histLow.toLocaleString('vi-VN')} ₫ - ${histHigh.toLocaleString('vi-VN')} ₫`,
            ]
          : []),
        ...(matchedGenuineDeal
          ? [
              `- ${t('radarGenuinePill', { pct: matchedGenuineDeal.savingsVsMedianPct, platform: matchedGenuineDeal.platform.toUpperCase(), price: matchedGenuineDeal.priceCurrent.toLocaleString('vi-VN') })}`,
            ]
          : []),
        ...(matchedFakeTrap
          ? [
              `- ${t('radarFakePill', { pct: matchedFakeTrap.fakeMarkupPct, platform: matchedFakeTrap.platform.toUpperCase() })}`,
            ]
          : []),
        ...(matchedPriceSpread
          ? [
              `- ${t('radarSpreadPill', { pct: matchedPriceSpread.spreadPct, vnd: matchedPriceSpread.spreadVnd.toLocaleString('vi-VN'), cheapest: matchedPriceSpread.cheapestPlatform.toUpperCase(), priciest: matchedPriceSpread.priciestPlatform.toUpperCase() })}`,
            ]
          : []),
        ...(merchant
          ? [
              `- **${t('mdSeller')}:** ${merchant.name} (${merchant.platform.toUpperCase()}) | ${t('mdTrustScore')}: **${merchant.trust_score}/100** (${t('dosafeRiskLabel')}: ${merchant.dosafe_risk_score}/100, ${t('reviewRiskLabel')}: ${merchant.review_risk_score}/100)`,
            ]
          : []),
        `- **${t('mdLink')}:** ${shareUrl}`,
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
    const escapeCsv = escapeCsvCell;
    const headers = [
      t('colMerchant'),
      'Platform',
      t('colListingTitle'),
      `${t('colCurrentPrice')} (VND)`,
      `${t('colOriginalPrice')} (VND)`,
      `${t('historicalLowLabel')} (VND)`,
      `${t('historicalHighLabel')} (VND)`,
      '10-Platform Price Spread (%)',
      t('colAuditStatus'),
      ...RADAR_CSV_HEADERS,
    ];
    const offers =
      listedOffers.length > 0
        ? listedOffers
        : matchedOffer
          ? [matchedOffer]
          : [];
    const histLow = sanitizeInspectPriceVnd(
      priceHistory?.lowestEverPrice || master?.min_price || 0
    );
    const histHigh = sanitizeInspectPriceVnd(
      priceHistory?.highestEverPrice || master?.max_price || 0
    );
    const cleanQuery = sanitizeInspectQuery(queryInput);
    const rows = offers.map((o) => [
      o.merchant?.name || merchant?.name || t('unknownShop'),
      (
        o.platform ||
        o.merchant?.platform ||
        merchant?.platform ||
        'shopee'
      ).toUpperCase(),
      o.title || master?.name || cleanQuery,
      sanitizeInspectPriceVnd(o.price_current),
      sanitizeInspectPriceVnd(o.price_original),
      histLow,
      histHigh,
      matchedPriceSpread?.spreadPct ?? 0,
      (() => {
        if (implausibleOfferIds.has(o.id)) return t('implausiblyLowBadge');
        const a =
          priceHistory?.byOffer?.[o.id] ??
          (o.id === matchedOffer?.id ? discount : null);
        return a ? discountVerdictCopy(tVerdict, a).label : t('checkedStatus');
      })(),
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
    a.download = `rate-inspect-${sanitizeInspectDownloadSlug(master?.slug, 'audit')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInspectJson = () => {
    if (typeof window === 'undefined' || !result) return;
    const payload = {
      source: 'Rate.vn Deep URL & Fake Discount Inspector',
      query: sanitizeInspectQuery(queryInput),
      exportedAt: new Date().toISOString(),
      dealRadar: radarExportFields(radarSignal),
      dealRadarContext: {
        genuineDeal: matchedGenuineDeal,
        fakeSaleTrap: matchedFakeTrap,
        priceSpread: matchedPriceSpread,
      },
      implausiblyLowOfferIds: [...implausibleOfferIds],
      inspection: result,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-inspect-${sanitizeInspectDownloadSlug(master?.slug, 'audit')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const keySpecs = (master?.key_specs || {}) as KeySpecs;
  const chipSpec =
    keySpecs.chip || master?.specifications?.hardware?.chipset || null;
  const resolvedRamGb = master ? resolveCompareRamGb(master) : null;
  const resolvedStorageGb = master ? resolveCompareStorageGb(master) : null;
  const ramSpec = keySpecs.ram || (resolvedRamGb ? `${resolvedRamGb}GB` : null);
  const storageSpec =
    keySpecs.storage ||
    (resolvedStorageGb
      ? resolvedStorageGb >= 1024
        ? `${Number((resolvedStorageGb / 1024).toFixed(1))}TB`
        : `${resolvedStorageGb}GB`
      : null);
  const resolvedBatteryMah = master ? resolveCompareBatteryMah(master) : null;
  const batterySpec =
    keySpecs.battery ||
    (resolvedBatteryMah ? `${resolvedBatteryMah} mAh` : null);
  const productHref = master ? getMasterProductHref(master) : '/smartphones';
  const productCategoryPath =
    productHref.replace(`/${master?.slug || ''}`, '') || '/smartphones';

  const { ref: exportMenuRef, close: closeExportMenu } = useDetailsDismiss();

  return (
    <div className="bg-light py-5">
      <div className="container">
        {/* Top Hero Inspector Card */}
        <div className="rate-scoreboard-dark rate-surface-dark p-lg-5 mb-4 p-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <span className="rate-eyebrow">{t('badge')}</span>
            <details ref={exportMenuRef} className="rate-export-menu ms-auto">
              <summary>
                <BsDownload aria-hidden="true" />
                {t('exportMenu')}
              </summary>
              <div className="rate-export-menu-list">
                <button
                  type="button"
                  onClick={handleCopyAuditMarkdown}
                  data-testid="inspect-copy-md-btn"
                >
                  {copiedMd ? t('copiedAuditMdBtn') : t('copyAuditMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadInspectCsv();
                    closeExportMenu();
                  }}
                  data-testid="inspect-export-csv-btn"
                >
                  {t('exportCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadInspectJson();
                    closeExportMenu();
                  }}
                  data-testid="inspect-export-json-btn"
                >
                  {t('exportJsonBtn')}
                </button>
                <button type="button" onClick={handleCopyReportLink}>
                  {copied ? t('copiedLinkBtn') : t('copyLinkBtn')}
                </button>
              </div>
            </details>
          </div>

          <h1 className="h2 fw-bold mb-2 text-white">{t('title')}</h1>
          <p className="text-white-50 mb-4">{t('subtitle')}</p>

          <form onSubmit={handleFormSubmit} className="row g-2 mb-3">
            <div className="col-lg-9">
              <div className="input-group input-group-lg">
                <span className="input-group-text text-danger border-0 bg-white">
                  <BsLink45Deg className="fs-4" />
                </span>
                <input
                  type="text"
                  className="form-control text-dark border-0"
                  placeholder={t('inputPlaceholder')}
                  // The sample URL pre-fills it, so the placeholder is never a
                  // visible label (DOS/Rate#1088).
                  aria-label={t('inputAria')}
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                />
              </div>
            </div>
            <div className="col-lg-3 d-grid">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary fw-semibold d-flex align-items-center justify-content-center gap-2 px-3 lh-sm"
              >
                <BsSearch />
                <span>{loading ? t('inspectingBtn') : t('inspectBtn')}</span>
              </button>
            </div>
          </form>

          {/* Sample quick-test pills */}
          <div className="d-flex align-items-center flex-wrap gap-2 pt-2">
            <span className="small text-white-50">{t('sampleLabel')}</span>
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
                      <span>{t('verdictTitle')}</span>
                    </h2>
                    {offerImplausiblyLow ? (
                      <span
                        className="badge bg-warning text-dark rounded-pill px-3 py-2"
                        data-testid="inspect-implausibly-low"
                        title={t('implausiblyLowTitle')}
                      >
                        <BsExclamationTriangleFill className="me-1" />
                        {t('implausiblyLowBadge')}
                      </span>
                    ) : discount?.verdict === 'fake_discount' ? (
                      <span className="badge bg-danger rounded-pill px-3 py-2 text-white">
                        <BsExclamationTriangleFill className="me-1" />
                        {t('fakeSaleWarning')}
                      </span>
                    ) : discount?.verdict === 'suspicious_discount' ? (
                      <span className="badge bg-warning text-dark rounded-pill px-3 py-2">
                        <BsExclamationTriangleFill className="me-1" />
                        {discountVerdictCopy(tVerdict, discount).label}
                      </span>
                    ) : discount ? (
                      <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-3 py-2">
                        <BsCheckCircleFill className="me-1" />
                        {t('genuineDiscountBadge')}
                      </span>
                    ) : null}
                  </div>

                  <div className="row g-3">
                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {t('currentPriceLabel')}
                        </div>
                        <div className="h5 fw-bold text-danger rate-tabular mb-0">
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
                          {t('claimedOriginalLabel')}
                        </div>
                        <div className="h6 fw-semibold text-secondary text-decoration-line-through rate-tabular mb-0">
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
                          {t('historicalLowLabel')}
                        </div>
                        <div className="h6 fw-bold text-success rate-tabular mb-0">
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
                          {t('historicalHighLabel')}
                        </div>
                        <div className="h6 fw-bold text-dark rate-tabular mb-0">
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
                          : discount.verdict === 'suspicious_discount'
                            ? 'bg-warning bg-opacity-10 text-dark'
                            : 'bg-success bg-opacity-10 text-success'
                      }`}
                    >
                      <strong>
                        {discountVerdictCopy(tVerdict, discount).label}:
                      </strong>{' '}
                      {discountVerdictCopy(tVerdict, discount).explanation}
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
                          {t('radarSectionBadge')}
                        </span>
                        <Link
                          href="/deals"
                          className="small fw-semibold text-danger text-decoration-none"
                        >
                          {t('openDealRadarLink')}
                        </Link>
                      </div>
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        {matchedGenuineDeal && (
                          <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-3 py-2">
                            {t('radarGenuinePill', {
                              pct: matchedGenuineDeal.savingsVsMedianPct,
                              platform:
                                matchedGenuineDeal.platform.toUpperCase(),
                              price:
                                matchedGenuineDeal.priceCurrent.toLocaleString(
                                  'vi-VN'
                                ),
                            })}
                          </span>
                        )}
                        {matchedFakeTrap && (
                          <span className="badge bg-danger-subtle text-danger border-danger-subtle rounded-pill border px-3 py-2">
                            {t('radarFakePill', {
                              pct: matchedFakeTrap.fakeMarkupPct,
                              platform: matchedFakeTrap.platform.toUpperCase(),
                            })}
                          </span>
                        )}
                        {matchedPriceSpread && (
                          <span className="badge bg-warning-subtle text-dark border-warning-subtle rounded-pill border px-3 py-2">
                            {t('radarSpreadPill', {
                              pct: matchedPriceSpread.spreadPct,
                              vnd: matchedPriceSpread.spreadVnd.toLocaleString(
                                'vi-VN'
                              ),
                              cheapest:
                                matchedPriceSpread.cheapestPlatform.toUpperCase(),
                              priciest:
                                matchedPriceSpread.priciestPlatform.toUpperCase(),
                            })}
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
                        {t('masterProductSection')}
                      </span>
                      <h3 className="h4 fw-bold text-dark mb-1">
                        {master.name}
                      </h3>
                      <div className="small text-muted">
                        {t('specModelKey')}: <code>{master.model_key}</code> |{' '}
                        {t('specBrand')}: <strong>{master.brand}</strong>
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
                            productImageUrl(master)
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
                          productImageUrl(master)
                        )}
                        currentMinPrice={Number(master.min_price || 0)}
                      />
                    </div>
                  </div>

                  {/* Quick Key Specs Strip */}
                  <div className="row g-2 mb-3">
                    {chipSpec && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <BsCpu className="text-danger me-1" />
                          <strong>{t('specChip')}:</strong>{' '}
                          <ContentText text={chipSpec} locale={locale} />
                        </div>
                      </div>
                    )}
                    {(ramSpec || storageSpec) && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>RAM/ROM:</strong>{' '}
                          {[ramSpec, storageSpec].filter(Boolean).join(' / ')}
                        </div>
                      </div>
                    )}
                    {batterySpec && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>{t('specBattery')}:</strong>{' '}
                          <ContentText text={batterySpec} locale={locale} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top flex-wrap gap-2 pt-3">
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <span className="rate-score-badge-user">
                        <BsStarFill className="text-warning" />
                        <span>
                          {masterUserRating > 0
                            ? `${masterUserRating.toFixed(1)}/5.0`
                            : t('userNoScore')}
                        </span>
                      </span>
                      <span className="rate-score-badge-expert">
                        <span>
                          {t('expertLabel')}{' '}
                          {masterExpertRating10 != null &&
                          masterExpertRating10 > 0
                            ? `${masterExpertRating10.toFixed(1)}/10`
                            : t('expertNoScore')}
                        </span>
                      </span>
                      <RadarBadge signal={radarSignal} />
                      <span className="small text-muted">
                        {t('verifiedReviewsCount', {
                          count:
                            master.authentic_review_count ||
                            master.total_reviews ||
                            0,
                        })}
                      </span>
                    </div>
                    <Link
                      href={productHref}
                      className="btn btn-danger rounded-pill btn-sm fw-semibold d-inline-flex align-items-center gap-2 px-4"
                    >
                      <span>{t('viewFullSpecsBtn')}</span>
                      <BsArrowRight />
                    </Link>
                  </div>
                </div>
              )}

              {/* 3. Cross-Merchant Offers Table */}
              {result.allOffers && result.allOffers.length > 0 && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <h3 className="h5 fw-bold text-dark mb-3">
                    {t('offersTableTitle')} ({result.allOffers.length})
                  </h3>
                  <div className="table-responsive">
                    <table className="mb-0 table align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>{t('colMerchant')}</th>
                          <th>{t('colListingTitle')}</th>
                          <th>{t('colCurrentPrice')}</th>
                          <th>{t('colOriginalPrice')}</th>
                          <th>{t('colAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listedOffers.map((offer) => (
                          <tr key={offer.id}>
                            <td>
                              <div className="fw-semibold text-dark">
                                {offer.merchant?.name ? (
                                  <ContentText
                                    text={offer.merchant.name}
                                    locale={locale}
                                  />
                                ) : (
                                  t('unknownShop')
                                )}
                              </div>
                              <span className="badge bg-secondary bg-opacity-10 text-secondary text-uppercase small">
                                {offer.merchant?.platform || 'shopee'}
                              </span>
                            </td>
                            <td
                              className="small text-muted"
                              lang={contentLang(offer.title, locale)}
                            >
                              {offer.title}
                            </td>
                            <td className="fw-bold text-danger">
                              {Number(offer.price_current).toLocaleString(
                                'vi-VN'
                              )}{' '}
                              ₫
                              {implausibleOfferIds.has(offer.id) && (
                                <span
                                  className="badge bg-warning text-dark d-block mt-1"
                                  data-testid="inspect-offer-implausibly-low"
                                  title={t('implausiblyLowTitle')}
                                >
                                  {t('implausiblyLowBadge')}
                                </span>
                              )}
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
                                  {t('auditShopBtn')}
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
                      {t('merchantAuditSection')}
                    </h3>
                  </div>

                  <div className="rounded-3 bg-light mb-3 p-3">
                    <div className="fw-bold text-dark fs-5 mb-1">
                      <ContentText text={merchant.name} locale={locale} />
                    </div>
                    <div className="d-flex align-items-center small text-muted flex-wrap gap-2">
                      <span className="badge bg-dark text-uppercase">
                        {merchant.platform}
                      </span>
                      {merchant.is_official && (
                        <span className="badge bg-danger">
                          {t('officialStore')}
                        </span>
                      )}
                      <span>ID: {merchant.platform_shop_id}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{t('dosafeRiskLabel')}</span>
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
                      <span className="text-muted">{t('reviewRiskLabel')}</span>
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
                    {t('viewMerchantProfileBtn')}
                  </Link>
                </div>
              )}

              {reviewSummary && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex align-items-center mb-3 gap-2">
                    <BsShieldExclamation className="text-danger fs-4" />
                    <h3 className="h5 fw-bold text-dark mb-0">
                      {t('reviewTaxonomySection')}
                    </h3>
                  </div>

                  <div className="d-flex flex-column small gap-2">
                    <div className="d-flex justify-content-between rounded-3 bg-success bg-opacity-10 text-success fw-semibold p-2">
                      <span>
                        <BsCheckCircle aria-hidden="true" className="me-1" />
                        {t('authenticLabel')}
                      </span>
                      <span>{reviewSummary.authentic_pct}%</span>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-warning bg-opacity-10 text-dark p-2">
                      <span>
                        <BsCoin aria-hidden="true" className="me-1" />
                        {t('coinSpamLabel')}
                      </span>
                      <strong>{reviewSummary.suspicious_pct}%</strong>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-danger bg-opacity-10 text-danger p-2">
                      <span>
                        <BsRobot aria-hidden="true" className="me-1" />
                        {t('seedingFakeLabel')}
                      </span>
                      <strong>{reviewSummary.fake_pct}%</strong>
                    </div>
                    <div className="d-flex justify-content-between rounded-3 bg-secondary bg-opacity-10 text-secondary p-2">
                      <span>
                        <BsBarChart aria-hidden="true" className="me-1" />
                        {t('totalAuditedLabel')}
                      </span>
                      <strong>{reviewSummary.total_analyzed}</strong>
                    </div>
                    {reviewSummary.ai_summary && (
                      <div className="rounded-3 bg-light text-muted mt-1 p-2">
                        <AnalyzerText text={reviewSummary.ai_summary} />
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
                {t('notFoundTitle')}
              </h2>
              <p className="text-muted mb-4">{t('notFoundDesc')}</p>
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
