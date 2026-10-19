'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BsBarChart,
  BsCheckCircle,
  BsExclamationOctagon,
  BsExclamationTriangle,
} from 'react-icons/bs';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import { Link } from '@/lib/navigation';
import type {
  MasterProductPriceHistorySummary,
  MerchantOffer,
} from '@/lib/rate-domain';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';

interface ProductOffersExplorerProps {
  readonly productName: string;
  readonly productSlug: string;
  readonly offers: readonly MerchantOffer[];
  readonly byOffer: MasterProductPriceHistorySummary['byOffer'];
  readonly radarSignal?: RadarSignal | null;
}

export type OfferSortKey = 'price_asc' | 'trust_desc' | 'discount_desc';

export default function ProductOffersExplorer({
  productName,
  productSlug,
  offers,
  byOffer,
  radarSignal,
}: ProductOffersExplorerProps) {
  const t = useTranslations('productDetail');
  const tVerdict = useTranslations('priceVerdict');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [highTrustOnly, setHighTrustOnly] = useState(false);
  const [sortBy, setSortBy] = useState<OfferSortKey>('price_asc');
  const [copiedOffersMd, setCopiedOffersMd] = useState(false);

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of offers) {
      const p = o.platform.toLowerCase();
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [offers]);

  const priceSpreadAudit = useMemo(() => {
    const valid = offers.filter((o) => Number(o.price_current || 0) > 0);
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
      platformCount: platforms.length,
    };
  }, [offers, platforms.length]);

  const filteredOffers = useMemo(() => {
    const base = offers.filter((o) => {
      if (
        selectedPlatform !== 'all' &&
        o.platform.toLowerCase() !== selectedPlatform
      ) {
        return false;
      }
      if (officialOnly && !o.merchant.is_official) {
        return false;
      }
      const trustScore = Math.max(0, 100 - (o.merchant.risk_score || 0));
      if (highTrustOnly && trustScore < 80) {
        return false;
      }
      return true;
    });

    return [...base].sort((a, b) => {
      const trustA = Math.max(0, 100 - (a.merchant.risk_score || 0));
      const trustB = Math.max(0, 100 - (b.merchant.risk_score || 0));
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
  }, [offers, selectedPlatform, officialOnly, highTrustOnly, sortBy]);

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
      const trust = Math.max(0, 100 - (o.merchant.risk_score || 0));
      const analysis = byOffer[o.id];
      return [
        o.platform.toUpperCase(),
        o.merchant.name.replace(/\|/g, '-'),
        o.merchant.is_official ? 'Yes' : 'No',
        `${trust}%`,
        `${o.price_current.toLocaleString('vi-VN')} ₫`,
        o.price_original
          ? `${o.price_original.toLocaleString('vi-VN')} ₫`
          : '-',
        analysis
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
      `### 🛡️ Rate.vn Cross-Platform Price Audit: ${productName}`,
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
      const trust = Math.max(0, 100 - (o.merchant.risk_score || 0));
      const analysis = byOffer[o.id];
      return [
        o.id,
        o.platform,
        o.merchant.name,
        o.merchant.is_official ? 'true' : 'false',
        String(trust),
        String(o.merchant.dosafe_risk_score || 0),
        String(o.merchant.review_risk_score || 0),
        String(o.price_current),
        String(o.price_original || ''),
        analysis?.verdict || 'normal',
        o.url,
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
    a.download = `rate-offers-${productSlug}.csv`;
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
      offers: filteredOffers.map((o) => ({
        id: o.id,
        platform: o.platform,
        merchantName: o.merchant.name,
        isOfficialMall: o.merchant.is_official,
        trustScorePercent: Math.max(0, 100 - (o.merchant.risk_score || 0)),
        priceCurrentVnd: o.price_current,
        priceOriginalVnd: o.price_original || null,
        verdict: byOffer[o.id]?.verdict || 'normal',
        url: o.url,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-offers-${productSlug}.json`;
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
              ({priceSpreadAudit.cheapest.merchant.name}){' '}
              {t('offersSpreadInsteadOf')}{' '}
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
              {t('offersFilterAll', { count: offers.length })}
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
            <button
              type="button"
              onClick={handleCopyOffersMarkdown}
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold bg-white px-3 py-1"
              style={{ fontSize: '0.8125rem' }}
              data-testid="copy-offers-md-btn"
            >
              {copiedOffersMd ? t('offersCopiedMd') : t('offersCopyMd')}
            </button>
            <button
              type="button"
              onClick={handleDownloadOffersCsv}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold bg-white px-3 py-1"
              style={{ fontSize: '0.8125rem' }}
              data-testid="download-offers-csv-btn"
            >
              {t('offersExportCsv')}
            </button>
            <button
              type="button"
              onClick={handleDownloadOffersJson}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold bg-white px-3 py-1"
              style={{ fontSize: '0.8125rem' }}
              data-testid="download-offers-json-btn"
            >
              {t('offersExportJson')}
            </button>
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
                const origPrice = offer.price_original
                  ? offer.price_original.toLocaleString('vi-VN')
                  : null;
                const trustScore = Math.max(
                  0,
                  100 - (offer.merchant.risk_score || 0)
                );
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
                                {offer.merchant.name}
                              </Link>
                            ) : (
                              offer.merchant.name
                            )}
                          </div>
                          {offer.merchant.is_official && (
                            <span className="badge bg-success-subtle text-success small">
                              {t('offersOfficialMallBadge')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className="small text-truncate"
                      style={{ maxWidth: '280px' }}
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
                      <div className="d-inline-flex align-items-center justify-content-end flex-wrap gap-1">
                        <Link
                          href={`/inspect?q=${encodeURIComponent(offer.url)}&price=${offer.price_current}`}
                          className="btn btn-sm btn-outline-primary rounded-pill px-2"
                          title={t('offersInspectBtnTitle')}
                        >
                          {t('offersInspectBtn')}
                        </Link>
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                        >
                          {t('offersSourceLinkBtn')}
                        </a>
                      </div>
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
