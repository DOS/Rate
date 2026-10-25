'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import {
  BsBarChart,
  BsCheckCircle,
  BsExclamationOctagon,
  BsExclamationTriangle,
} from 'react-icons/bs';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import { Link } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
} from '@/lib/rate-domain';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { implausiblyLowOfferIds } from '@repo/shared-data/rules';
import { contentLang } from '@/lib/content-lang';
import ContentText from '@/components/elementary/ContentText';

interface ProductOffersExplorerProps {
  readonly productName: string;
  readonly productSlug: string;
  readonly offers: readonly MerchantOffer[];
  readonly byOffer: MasterProductPriceHistorySummary['byOffer'];
  readonly radarSignal?: RadarSignal | null;
}

export type OfferSortKey = 'price_asc' | 'trust_desc' | 'discount_desc';

export function computeMerchantTrustScore(riskScore: unknown): number {
  const num = Number(riskScore);
  const clampedRisk = Number.isFinite(num)
    ? Math.max(0, Math.min(100, Math.round(num)))
    : 0;
  return 100 - clampedRisk;
}

export function isSafeExternalOfferUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeOffersPriceSpreadAudit(
  offers: readonly MerchantOffer[],
  implausibleOfferIds: ReadonlySet<string> = new Set()
) {
  if (!Array.isArray(offers)) return null;
  const valid = offers.filter((o) => {
    const p = Number(o?.price_current);
    return (
      Number.isFinite(p) &&
      p > 0 &&
      p <= MAX_VALID_VND_PRICE &&
      !implausibleOfferIds.has(o.id)
    );
  });
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.price_current - b.price_current);
  const cheapest = sorted[0]!;
  const priciest = sorted[sorted.length - 1]!;
  const spreadVnd = Math.max(
    0,
    priciest.price_current - cheapest.price_current
  );
  if (spreadVnd <= 0) return null;
  const spreadPct = Number(
    ((spreadVnd / cheapest.price_current) * 100).toFixed(1)
  );
  return {
    cheapest,
    priciest,
    spreadVnd,
    spreadPct,
    platformCount: new Set(
      valid.map((o) =>
        typeof o.platform === 'string' ? o.platform.toLowerCase() : ''
      )
    ).size,
  };
}

export default function ProductOffersExplorer({
  productName,
  productSlug,
  offers,
  byOffer,
  radarSignal,
}: ProductOffersExplorerProps) {
  const t = useTranslations('productDetail');
  const tVerdict = useTranslations('priceVerdict');
  const locale = useLocale();
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [highTrustOnly, setHighTrustOnly] = useState(false);
  const [sortBy, setSortBy] = useState<OfferSortKey>('price_asc');
  const [copiedOffersMd, setCopiedOffersMd] = useState(false);

  const safeOffers = useMemo(
    () => (Array.isArray(offers) ? offers : []),
    [offers]
  );

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of safeOffers) {
      const p = typeof o.platform === 'string' ? o.platform.toLowerCase() : '';
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [safeOffers]);

  // Bait-price listings far below every other store (DOS/Rate#797): labelled,
  // listed after the plausible offers and left out of the price spread.
  const implausibleOfferIds = useMemo(
    () => implausiblyLowOfferIds(safeOffers),
    [safeOffers]
  );

  const priceSpreadAudit = useMemo(
    () => computeOffersPriceSpreadAudit(safeOffers, implausibleOfferIds),
    [safeOffers, implausibleOfferIds]
  );

  const filteredOffers = useMemo(() => {
    const base = safeOffers.filter((o) => {
      const plat =
        typeof o.platform === 'string' ? o.platform.toLowerCase() : '';
      if (selectedPlatform !== 'all' && plat !== selectedPlatform) {
        return false;
      }
      if (officialOnly && !o.merchant.is_official) {
        return false;
      }
      const trustScore = computeMerchantTrustScore(o.merchant.risk_score);
      if (highTrustOnly && trustScore < 80) {
        return false;
      }
      return true;
    });

    return [...base].sort((a, b) => {
      const implausibleA = implausibleOfferIds.has(a.id) ? 1 : 0;
      const implausibleB = implausibleOfferIds.has(b.id) ? 1 : 0;
      if (implausibleA !== implausibleB) return implausibleA - implausibleB;
      const trustA = computeMerchantTrustScore(a.merchant.risk_score);
      const trustB = computeMerchantTrustScore(b.merchant.risk_score);
      const discA =
        a.price_original && a.price_original > a.price_current
          ? (a.price_original - a.price_current) / a.price_original
          : 0;
      const discB =
        b.price_original && b.price_original > b.price_current
          ? (b.price_original - b.price_current) / b.price_original
          : 0;

      if (sortBy === 'trust_desc') {
        return trustB - trustA || a.price_current - b.price_current;
      }
      if (sortBy === 'discount_desc') {
        return discB - discA || a.price_current - b.price_current;
      }
      return a.price_current - b.price_current || trustB - trustA;
    });
  }, [
    safeOffers,
    selectedPlatform,
    officialOnly,
    highTrustOnly,
    sortBy,
    implausibleOfferIds,
  ]);

  const safeSlugFileToken =
    (typeof productSlug === 'string' ? productSlug : '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'audit';

  const handleCopyOffersMarkdown = async () => {
    if (typeof navigator === 'undefined' || filteredOffers.length === 0) return;
    const headers = [
      'Platform',
      'Merchant',
      'Official Mall',
      'Trust Score',
      'Current Price (VND)',
      'Original Price (VND)',
      'Price Verdict',
    ];
    const sep = headers.map(() => '---');
    const rows = filteredOffers.map((o) => {
      const trust = computeMerchantTrustScore(o.merchant.risk_score);
      const analysis = byOffer[o.id];
      const hasValidOrig =
        o.price_original != null &&
        Number.isFinite(Number(o.price_original)) &&
        Number(o.price_original) > o.price_current &&
        Number(o.price_original) <= MAX_VALID_VND_PRICE;
      return [
        o.platform.toUpperCase(),
        o.merchant.name.replace(/\|/g, '-'),
        o.merchant.is_official ? 'Yes' : 'No',
        `${trust}%`,
        `${o.price_current.toLocaleString('vi-VN')} ₫`,
        hasValidOrig ? `${o.price_original!.toLocaleString('vi-VN')} ₫` : '-',
        implausibleOfferIds.has(o.id)
          ? t('offersImplausiblyLowBadge')
          : analysis
            ? discountVerdictCopy(tVerdict, analysis).label
            : tVerdict('labelNormal'),
      ];
    });

    const radarLine = radarSignal
      ? t('offersMdRadarPrefix', { signal: radarMarkdownCell(radarSignal) })
      : '';
    const spreadLine = priceSpreadAudit
      ? t('offersMdSpreadLine', {
          count: priceSpreadAudit.platformCount,
          spreadVnd: priceSpreadAudit.spreadVnd.toLocaleString('vi-VN'),
          spreadPct: priceSpreadAudit.spreadPct,
          cheapestPlatform: priceSpreadAudit.cheapest.platform.toUpperCase(),
          cheapestMerchant: priceSpreadAudit.cheapest.merchant.name,
          priciestPlatform: priceSpreadAudit.priciest.platform.toUpperCase(),
        })
      : '';

    const md = [
      `### 🛡️ Rate.vn cross-store price check: ${productName}`,
      radarLine + spreadLine,
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopiedOffersMd(true);
      setTimeout(() => setCopiedOffersMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadOffersCsv = () => {
    if (typeof document === 'undefined' || filteredOffers.length === 0) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      'OfferID',
      'Platform',
      'MerchantName',
      'IsOfficialMall',
      'TrustScorePercent',
      'DosafeRiskScore',
      'ReviewRiskScore',
      'PriceCurrentVND',
      'PriceOriginalVND',
      'PriceVerdict',
      'OfferURL',
      ...(radarSignal ? RADAR_CSV_HEADERS : []),
    ];
    const rows = filteredOffers.map((o) => {
      const trust = computeMerchantTrustScore(o.merchant.risk_score);
      const analysis = byOffer[o.id];
      const hasValidOrig =
        o.price_original != null &&
        Number.isFinite(Number(o.price_original)) &&
        Number(o.price_original) > o.price_current &&
        Number(o.price_original) <= MAX_VALID_VND_PRICE;
      return [
        o.id,
        o.platform,
        o.merchant.name,
        o.merchant.is_official ? 'true' : 'false',
        String(trust),
        String(o.merchant.dosafe_risk_score || 0),
        String(o.merchant.review_risk_score || 0),
        String(o.price_current),
        hasValidOrig ? String(o.price_original) : '',
        implausibleOfferIds.has(o.id)
          ? 'implausibly_low'
          : analysis?.verdict || 'normal',
        isSafeExternalOfferUrl(o.url) ? o.url.trim() : '',
        ...(radarSignal ? radarCsvCells(radarSignal) : []),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-offers-${safeSlugFileToken}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadOffersJson = () => {
    if (typeof document === 'undefined' || filteredOffers.length === 0) return;
    const payload = {
      source: 'Rate.vn Cross-Platform Offers Explorer',
      productSlug,
      productName,
      exportedAt: new Date().toISOString(),
      offerCount: filteredOffers.length,
      dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      priceSpreadAudit: priceSpreadAudit
        ? {
            spreadVnd: priceSpreadAudit.spreadVnd,
            spreadPct: priceSpreadAudit.spreadPct,
            cheapestPlatform: priceSpreadAudit.cheapest.platform,
            cheapestMerchantName: priceSpreadAudit.cheapest.merchant.name,
            minPriceVnd: priceSpreadAudit.cheapest.price_current,
            priciestPlatform: priceSpreadAudit.priciest.platform,
            priciestMerchantName: priceSpreadAudit.priciest.merchant.name,
            maxPriceVnd: priceSpreadAudit.priciest.price_current,
          }
        : null,
      offers: filteredOffers.map((o) => {
        const hasValidOrig =
          o.price_original != null &&
          Number.isFinite(Number(o.price_original)) &&
          Number(o.price_original) > o.price_current &&
          Number(o.price_original) <= MAX_VALID_VND_PRICE;
        return {
          id: o.id,
          platform: o.platform,
          merchantName: o.merchant.name,
          isOfficialMall: o.merchant.is_official,
          trustScorePercent: computeMerchantTrustScore(o.merchant.risk_score),
          priceCurrentVnd: o.price_current,
          priceOriginalVnd: hasValidOrig ? o.price_original : null,
          verdict: implausibleOfferIds.has(o.id)
            ? 'implausibly_low'
            : byOffer[o.id]?.verdict || 'normal',
          implausiblyLow: implausibleOfferIds.has(o.id),
          url: isSafeExternalOfferUrl(o.url) ? o.url.trim() : '',
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-offers-${safeSlugFileToken}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {priceSpreadAudit && (
        <div
          data-testid="price-spread-audit-banner"
          className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 border p-3"
        >
          <div>
            <span className="badge bg-success rounded-pill me-2 text-white">
              {t('offersSpreadBadge', {
                count: priceSpreadAudit.platformCount,
              })}
            </span>
            <strong className="text-dark small">
              {t('offersSpreadSavePrefix')}{' '}
              <span className="text-success rate-tabular">
                {priceSpreadAudit.spreadVnd.toLocaleString('vi-VN')} ₫ (
                {priceSpreadAudit.spreadPct}%)
              </span>{' '}
              {t('offersSpreadBuyAt')}{' '}
              <span className="text-uppercase">
                {priceSpreadAudit.cheapest.platform}
              </span>{' '}
              (
              <ContentText
                text={priceSpreadAudit.cheapest.merchant.name}
                locale={locale}
              />
              ) {t('offersSpreadInsteadOf')}{' '}
              <span className="text-uppercase">
                {priceSpreadAudit.priciest.platform}
              </span>
            </strong>
          </div>
          <div className="small rate-tabular text-secondary">
            {t('offersSpreadLowLabel')}{' '}
            <strong className="text-success">
              {priceSpreadAudit.cheapest.price_current.toLocaleString('vi-VN')}{' '}
              ₫
            </strong>{' '}
            • {t('offersSpreadHighLabel')}{' '}
            <strong className="text-danger">
              {priceSpreadAudit.priciest.price_current.toLocaleString('vi-VN')}{' '}
              ₫
            </strong>
          </div>
        </div>
      )}

      {/* Interactive Filter, Sort & Export Toolbar */}
      <div className="rounded-3 bg-light mb-3 border p-3">
        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <div className="d-flex align-items-center flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedPlatform('all')}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                selectedPlatform === 'all'
                  ? 'btn-dark fw-semibold text-white'
                  : 'btn-outline-dark bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersFilterAll', { count: safeOffers.length })}
            </button>
            {platforms.map(([plat, count]) => (
              <button
                key={plat}
                type="button"
                onClick={() => setSelectedPlatform(plat)}
                className={`btn btn-sm rounded-pill text-uppercase px-2 py-1 ${
                  selectedPlatform === plat
                    ? 'btn-danger fw-semibold text-white'
                    : 'btn-outline-secondary bg-white'
                }`}
                style={{ fontSize: '0.8125rem' }}
              >
                {plat} ({count})
              </button>
            ))}
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2">
            <ExportMenu label={t('exportMenu')}>
              {(close) => (
                <>
                  <button
                    type="button"
                    onClick={handleCopyOffersMarkdown}
                    data-testid="copy-offers-md-btn"
                  >
                    {copiedOffersMd ? t('offersCopiedMd') : t('offersCopyMd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadOffersCsv();
                      close();
                    }}
                    data-testid="download-offers-csv-btn"
                  >
                    {t('offersExportCsv')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadOffersJson();
                      close();
                    }}
                    data-testid="download-offers-json-btn"
                  >
                    {t('offersExportJson')}
                  </button>
                </>
              )}
            </ExportMenu>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center border-top flex-wrap gap-2 pt-2">
          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOfficialOnly((v) => !v)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                officialOnly
                  ? 'btn-success fw-semibold text-white'
                  : 'btn-outline-success bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersOfficialOnlyBtn')}
            </button>
            <button
              type="button"
              onClick={() => setHighTrustOnly((v) => !v)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                highTrustOnly
                  ? 'btn-primary fw-semibold text-white'
                  : 'btn-outline-primary bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersHighTrustOnlyBtn')}
            </button>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">{t('offersSortLabel')}</span>
            <select
              className="form-select form-select-sm w-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as OfferSortKey)}
              aria-label={t('offersSortAria')}
            >
              <option value="price_asc">{t('offersSortPriceAsc')}</option>
              <option value="trust_desc">{t('offersSortTrustDesc')}</option>
              <option value="discount_desc">
                {t('offersSortDiscountDesc')}
              </option>
            </select>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <div className="rounded-3 border bg-white p-4 text-center">
          <p className="text-muted small mb-2">{t('offersEmptyFilterText')}</p>
          <button
            type="button"
            onClick={() => {
              setSelectedPlatform('all');
              setOfficialOnly(false);
              setHighTrustOnly(false);
            }}
            className="btn btn-sm btn-outline-danger rounded-pill px-3"
          >
            {t('offersResetFiltersBtn')}
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table-hover mb-0 table align-middle">
            <thead className="table-light small">
              <tr>
                <th scope="col" style={{ width: '25%' }}>
                  {t('offersColPlatformMerchant')}
                </th>
                <th scope="col">{t('offersColListingTitle')}</th>
                <th scope="col">{t('offersColTrustScore')}</th>
                <th scope="col">{t('offersColRecordedPrice')}</th>
                <th scope="col" className="text-end">
                  {t('offersColAuditSource')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOffers.map((offer) => {
                const price = offer.price_current.toLocaleString('vi-VN');
                const origPrice =
                  offer.price_original != null &&
                  Number.isFinite(Number(offer.price_original)) &&
                  Number(offer.price_original) > offer.price_current &&
                  Number(offer.price_original) <= MAX_VALID_VND_PRICE
                    ? offer.price_original.toLocaleString('vi-VN')
                    : null;
                const trustScore = computeMerchantTrustScore(
                  offer.merchant.risk_score
                );
                const safeOfferUrl = isSafeExternalOfferUrl(offer.url)
                  ? offer.url.trim()
                  : null;
                const trustBadgeClass =
                  trustScore >= 80
                    ? 'bg-success-subtle text-success'
                    : trustScore >= 50
                      ? 'bg-warning-subtle text-warning-emphasis'
                      : 'bg-danger-subtle text-danger';

                const discountAnalysis = byOffer[offer.id];
                const discountBadgeClass =
                  discountAnalysis?.verdict === 'fake_discount'
                    ? 'bg-danger text-white'
                    : discountAnalysis?.verdict === 'suspicious_discount'
                      ? 'bg-warning text-dark'
                      : discountAnalysis?.verdict === 'genuine_deal'
                        ? 'bg-success text-white'
                        : 'bg-light text-secondary border';
                const DiscountIcon =
                  discountAnalysis?.verdict === 'fake_discount'
                    ? BsExclamationOctagon
                    : discountAnalysis?.verdict === 'suspicious_discount'
                      ? BsExclamationTriangle
                      : discountAnalysis?.verdict === 'genuine_deal'
                        ? BsCheckCircle
                        : BsBarChart;

                return (
                  <tr key={offer.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-dark text-uppercase small">
                          {offer.platform}
                        </span>
                        <div>
                          <div className="fw-semibold small">
                            {offer.merchant.id ? (
                              <Link
                                href={`/merchants/${offer.merchant.id}`}
                                className="text-dark text-decoration-none"
                              >
                                <ContentText
                                  text={offer.merchant.name}
                                  locale={locale}
                                />
                              </Link>
                            ) : (
                              <ContentText
                                text={offer.merchant.name}
                                locale={locale}
                              />
                            )}
                          </div>
                          {offer.merchant.is_official && (
                            <span className="badge bg-success-subtle text-success small">
                              {t('offersOfficialMallBadge')}
                            </span>
                          )}
                          {implausibleOfferIds.has(offer.id) && (
                            <span
                              className="badge bg-danger-subtle text-danger small"
                              data-testid="offer-implausibly-low"
                              title={t('offersImplausiblyLowTitle')}
                            >
                              {t('offersImplausiblyLowBadge')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className="small text-truncate"
                      style={{ maxWidth: '280px' }}
                      lang={contentLang(offer.title, locale)}
                    >
                      {offer.title}
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1">
                        <div>
                          {offer.merchant.id ? (
                            <Link
                              href={`/merchants/${offer.merchant.id}`}
                              className={`badge ${trustBadgeClass} text-decoration-none small`}
                              title={t('offersMerchantTrustTitle')}
                            >
                              Trust: {trustScore}% ↗
                            </Link>
                          ) : (
                            <span className={`badge ${trustBadgeClass} small`}>
                              Trust: {trustScore}%
                            </span>
                          )}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          DOSafe: {offer.merchant.dosafe_risk_score}/100 |
                          Review Risk: {offer.merchant.review_risk_score}
                          /100
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold text-dark rate-tabular">
                        {price} ₫
                      </div>
                      {origPrice && (
                        <div className="text-muted small text-decoration-line-through rate-tabular">
                          {origPrice} ₫
                        </div>
                      )}
                      {discountAnalysis && (
                        <div className="mt-1">
                          <a
                            href="#price-history-section"
                            title={
                              discountVerdictCopy(tVerdict, discountAnalysis)
                                .explanation
                            }
                            className={`badge ${discountBadgeClass} text-decoration-none rounded-pill small`}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            <DiscountIcon aria-hidden="true" className="me-1" />
                            {
                              discountVerdictCopy(tVerdict, discountAnalysis)
                                .label
                            }
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="text-end">
                      {safeOfferUrl && (
                        <div className="d-inline-flex align-items-center justify-content-end flex-wrap gap-1">
                          <Link
                            href={`/inspect?q=${encodeURIComponent(safeOfferUrl)}&price=${offer.price_current}`}
                            className="btn btn-sm btn-outline-primary rounded-pill px-2"
                            title={t('offersInspectBtnTitle')}
                          >
                            {t('offersInspectBtn')}
                          </Link>
                          <a
                            href={safeOfferUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                          >
                            {t('offersSourceLinkBtn')}
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
