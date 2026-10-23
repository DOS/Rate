import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import { formatSoldCount } from '@/lib/sold-count';
import AnalyzerText from '@/components/reviews/AnalyzerText';
import { Link } from '@/lib/navigation';
import { getCategoryRouteHref, resolveProductImageUrl } from '@/lib/rate-api';
import {
  getCachedMerchantProfileById,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import {
  buildRadarIndex,
  getRadarSignal,
  selectMerchantRadar,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import PageShell from '../../components/page-shell';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import MerchantShareAuditButton from '@/components/merchants/MerchantShareAuditButton';
import {
  BsArrowDownCircle,
  BsBoxSeam,
  BsCheckCircleFill,
  BsExclamationTriangle,
  BsGraphUpArrow,
  BsPeopleFill,
  BsShieldCheck,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';
import { isPendingReview } from '@/lib/review-display';
import ContentText from '@/components/elementary/ContentText';
import { contentLang } from '@/lib/content-lang';
import ClientMessages from '@/components/providers/ClientMessages';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph, fitTitle, fitDescription } from '@/lib/seo';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

// Nothing is prerendered at build; each id renders on its first request.
export function generateStaticParams(): { id: string }[] {
  return [];
}

type PageParams = Promise<{ locale: string; id: string }>;

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const merchant = await getCachedMerchantProfileById(id);
  if (!merchant) {
    return {
      title: t('notFoundTitle'),
    };
  }
  const canonicalUrl = `https://rate.vn/merchants/${merchant.id}`;
  const fullTitle = t('profileMetaTitle', {
    name: merchant.name,
    platform: merchant.platform.toUpperCase(),
    score: merchant.trust_score,
  });
  const shortTitle = t('profileMetaTitleShort', {
    name: merchant.name,
    score: merchant.trust_score,
  });
  const description = fitDescription(
    t('profileMetaDesc', {
      name: merchant.name,
      dosafe: merchant.dosafe_risk_score,
      seeding: merchant.review_risk_score,
      count: merchant.product_count,
    })
  );

  return {
    // The store name first; the platform, the site name, then the score
    // give way to fit a search result (DOS/Rate#782). The share card keeps
    // the full title.
    title: fitTitle([
      fullTitle,
      `${shortTitle} | Rate.vn`,
      shortTitle,
      `${merchant.name} | Rate.vn`,
      merchant.name,
    ]),
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(normalizeRateLocale(locale)),
      title: fullTitle,
      description,
      url: canonicalUrl,
    },
  };
}

export default async function MerchantProfilePage({
  params,
}: {
  params: PageParams;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const tVerdict = await getTranslations({
    locale,
    namespace: 'priceVerdict',
  });
  const [merchant, dealRadar] = await Promise.all([
    getCachedMerchantProfileById(id),
    getCrossPlatformDealRadar({ categorySlug: 'all', limit: 50 }),
  ]);

  if (!merchant) {
    notFound();
  }

  const radarIndex = buildRadarIndex(dealRadar);
  const merchantRadar = selectMerchantRadar(dealRadar, merchant);
  const merchantGenuineDeals = merchantRadar.genuineDeals;
  const merchantFakeTraps = merchantRadar.fakeSaleTraps;

  const trustLevelLabel =
    merchant.trust_score >= 80
      ? t('trustHigh')
      : merchant.trust_score >= 50
        ? t('trustModerate')
        : t('trustRisk');

  const trustBadgeClass =
    merchant.trust_score >= 80
      ? 'bg-success text-white'
      : merchant.trust_score >= 50
        ? 'bg-warning text-dark'
        : 'bg-danger text-white';

  const brk = merchant.review_risk_breakdown;
  const authenticPct =
    brk.total_reviews > 0
      ? Math.round((brk.authentic_count / brk.total_reviews) * 1000) / 10
      : 100;

  const canonicalUrl = `https://rate.vn/merchants/${merchant.id}`;

  const merchantJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: t('breadcrumbHome'),
            item: 'https://rate.vn',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('breadcrumbMerchantsShort'),
            item: 'https://rate.vn/merchants',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: merchant.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'OnlineStore',
        name: merchant.name,
        url: canonicalUrl,
        ...(merchant.url ? { sameAs: [merchant.url] } : {}),
        ...(merchant.rating_star &&
        merchant.rating_star > 0 &&
        brk.total_reviews > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(merchant.rating_star.toFixed(2)),
                reviewCount: brk.total_reviews,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
    ],
  };

  return (
    <ClientMessages scope="merchantProfile">
      <PageShell locale={locale}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(merchantJsonLd).replace(/</g, '\\u003c'),
          }}
        />

        <div className="container py-5">
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="breadcrumb small mb-0">
              <li className="breadcrumb-item">
                <Link href="/" className="text-decoration-none">
                  {t('breadcrumbHome')}
                </Link>
              </li>
              <li className="breadcrumb-item">
                <Link href="/merchants" className="text-decoration-none">
                  {t('breadcrumbMerchantsShort')}
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                <ContentText text={merchant.name} locale={locale} />
              </li>
            </ol>
          </nav>

          {/* Merchant Header Card (DESIGN.md v3.0 Dark Obsidian Command Header) */}
          <div className="rate-scoreboard-dark p-md-5 mb-4 p-4">
            <div className="row g-4 align-items-center">
              <div className="col-lg-8">
                <div className="d-flex align-items-start gap-3">
                  <div
                    className="rounded-4 d-flex align-items-center justify-content-center fs-2 flex-shrink-0 text-white shadow-sm"
                    style={{
                      width: '72px',
                      height: '72px',
                      background:
                        'linear-gradient(135deg, rgba(216, 48, 48, 0.25), rgba(99, 102, 241, 0.25))',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                    }}
                  >
                    <BsShop />
                  </div>
                  <div>
                    <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                      <span className="badge bg-danger text-uppercase rounded-pill px-3 py-1">
                        {merchant.platform}
                      </span>
                      {merchant.is_official && (
                        <span
                          className="badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-1"
                          style={{
                            backgroundColor: 'rgba(45, 186, 105, 0.16)',
                            color: '#34d399',
                            border: '1px solid rgba(45, 186, 105, 0.35)',
                          }}
                        >
                          <BsCheckCircleFill /> {t('officialMallLabel')}
                        </span>
                      )}
                      <span
                        className="badge rounded-pill px-3 py-1"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                        }}
                      >
                        Shop ID: <code>{merchant.platform_shop_id}</code>
                      </span>
                    </div>
                    <h1 className="h2 fw-bold mb-2 text-white">
                      <ContentText text={merchant.name} locale={locale} />
                    </h1>
                    <div
                      className="d-flex align-items-center small flex-wrap gap-3"
                      style={{ color: '#94a3b8' }}
                    >
                      <span className="d-inline-flex align-items-center gap-1">
                        <BsStarFill className="text-warning" />
                        {t('platformRatingLabel')}{' '}
                        <strong className="font-monospace text-white">
                          {merchant.rating_star
                            ? `${merchant.rating_star.toFixed(2)} / 5.0`
                            : t('notUpdatedYet')}
                        </strong>
                      </span>
                      <span className="d-inline-flex align-items-center gap-1">
                        <BsPeopleFill className="text-info" />
                        {t('followersLabel')}{' '}
                        <strong className="font-monospace text-white">
                          {merchant.follower_count > 0
                            ? merchant.follower_count.toLocaleString('vi-VN')
                            : '-'}
                        </strong>
                      </span>
                      <span className="d-inline-flex align-items-center gap-1">
                        <BsBoxSeam className="text-success" />
                        {t('trackedModelsLabel')}{' '}
                        <strong className="font-monospace text-white">
                          {t('modelsCountUnit', {
                            count: merchant.product_count,
                          })}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-lg-4 text-lg-end">
                <div
                  className="rounded-4 p-3 text-center"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                  }}
                >
                  <div className="small mb-1" style={{ color: '#94a3b8' }}>
                    {t('compositeTrustScoreLabel')}
                  </div>
                  <div className="display-6 fw-bold font-monospace mb-1 text-white">
                    {merchant.trust_score}
                    <span
                      className="fs-5 fw-normal"
                      style={{ color: '#94a3b8' }}
                    >
                      /100
                    </span>
                  </div>
                  <div className="mb-3">
                    <span
                      className={`badge ${trustBadgeClass} rounded-pill px-3 py-2`}
                    >
                      {trustLevelLabel}
                    </span>
                  </div>
                  {merchant.url && (
                    <a
                      href={merchant.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-light btn-sm rounded-pill fw-medium"
                    >
                      {t('verifySourceOnPlatform', {
                        platform: merchant.platform.toUpperCase(),
                      })}
                    </a>
                  )}
                  <MerchantShareAuditButton
                    merchantName={merchant.name}
                    platform={merchant.platform}
                    platformShopId={merchant.platform_shop_id}
                    isOfficial={merchant.is_official}
                    trustScore={merchant.trust_score}
                    trustLevelLabel={trustLevelLabel}
                    dosafeRiskScore={merchant.dosafe_risk_score}
                    reviewSeedingRiskScore={merchant.review_risk_score}
                    authenticReviews={brk.authentic_count}
                    totalReviews={brk.total_reviews}
                    flaggedReviews={Math.max(
                      0,
                      brk.total_reviews - brk.authentic_count
                    )}
                    productCount={merchant.product_count}
                    genuineDealCount={merchantGenuineDeals.length}
                    fakeSaleTrapCount={merchantFakeTraps.length}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dual Risk Breakdown Section */}
          <div className="row g-4 mb-4">
            {/* 1. DOSafe Threat Intelligence Card */}
            <div className="col-lg-6 col-12">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div>
                    <span className="badge bg-primary-subtle text-primary rounded-pill small mb-2 px-3 py-1">
                      {t('layer1Badge')}
                    </span>
                    <h2 className="h5 fw-bold d-flex align-items-center mb-0 gap-2">
                      <BsShieldCheck className="text-success" />
                      {t('layer1Title')}
                    </h2>
                  </div>
                  <span
                    className={`badge rounded-pill fs-6 px-3 py-2 ${
                      merchant.dosafe_risk_score === 0
                        ? 'bg-success-subtle text-success'
                        : 'bg-danger text-white'
                    }`}
                  >
                    {t('scamRiskBadge', { score: merchant.dosafe_risk_score })}
                  </span>
                </div>

                <p className="text-muted small mb-3">{t('layer1Desc')}</p>

                <div className="rounded-3 bg-light mt-auto p-3">
                  <div className="d-flex align-items-center justify-content-between small mb-2">
                    <span className="text-muted">{t('scamStatusLabel')}</span>
                    <span className="fw-semibold text-success">
                      {merchant.dosafe_risk_score === 0
                        ? t('scamStatusClean')
                        : t('scamStatusAlert')}
                    </span>
                  </div>
                  <div className="d-flex align-items-center justify-content-between small mb-2">
                    <span className="text-muted">
                      {t('entityVerificationLabel')}
                    </span>
                    <span className="fw-semibold">
                      {merchant.is_official
                        ? t('entityOfficial')
                        : t('standardShopLabel')}
                    </span>
                  </div>
                  <div className="d-flex align-items-center justify-content-between small">
                    <span className="text-muted">
                      {t('piiProtectionLabel')}
                    </span>
                    <span className="fw-semibold text-secondary">
                      {t('piiProtectionValue')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. AI Review & Seeding Risk Card */}
            <div className="col-lg-6 col-12">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div>
                    <span className="badge bg-warning-subtle text-warning-emphasis rounded-pill small mb-2 px-3 py-1">
                      {t('layer2Badge')}
                    </span>
                    <h2 className="h5 fw-bold d-flex align-items-center mb-0 gap-2">
                      <BsGraphUpArrow className="text-primary" />
                      {t('layer2Title')}
                    </h2>
                  </div>
                  <span
                    className={`badge rounded-pill fs-6 px-3 py-2 ${
                      merchant.review_risk_score <= 15
                        ? 'bg-success-subtle text-success'
                        : merchant.review_risk_score <= 40
                          ? 'bg-warning-subtle text-warning-emphasis'
                          : 'bg-danger text-white'
                    }`}
                  >
                    {t('reviewRiskBadge', {
                      score: merchant.review_risk_score,
                    })}
                  </span>
                </div>

                <p className="text-muted small mb-3">
                  {t('layer2DescPrefix')} <strong>{brk.total_reviews}</strong>{' '}
                  {t('layer2DescMid')} <strong>{authenticPct}%</strong>).
                </p>

                <div className="row g-2 mt-auto">
                  <div className="col-sm-3 col-6">
                    <div className="rounded-3 bg-success-subtle p-2 text-center">
                      <div className="fw-bold text-success fs-5 font-monospace">
                        {brk.authentic_count}
                      </div>
                      <div
                        className="text-muted"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t('statAuthentic')}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-3 col-6">
                    <div className="rounded-3 bg-warning-subtle p-2 text-center">
                      <div className="fw-bold text-warning-emphasis fs-5 font-monospace">
                        {brk.coin_spam_count}
                      </div>
                      <div
                        className="text-muted"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t('statCoinSpam')}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-3 col-6">
                    <div className="rounded-3 bg-danger-subtle p-2 text-center">
                      <div className="fw-bold text-danger fs-5 font-monospace">
                        {brk.seeding_fake_count}
                      </div>
                      <div
                        className="text-muted"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t('statSeedingFake')}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-3 col-6">
                    <div className="rounded-3 bg-secondary-subtle p-2 text-center">
                      <div className="fw-bold text-secondary fs-5 font-monospace">
                        {brk.sabotage_or_bombing_count}
                      </div>
                      <div
                        className="text-muted"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t('statSabotage')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 10-Platform Deal Radar & Fake-Sale Trap Audit Card (#99) */}
          <div
            className="card rounded-4 mb-5 border bg-white p-4 shadow-sm"
            data-testid="merchant-profile-deal-radar"
          >
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <span className="badge bg-dark rounded-pill text-warning me-2">
                  {t('profileRadarBadge')}
                </span>
                <span className="small text-muted">
                  {t('profileRadarAnalyzed', {
                    count: dealRadar.totalOffersAnalyzed,
                  })}
                </span>
              </div>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-3 py-1">
                  {t('profileRadarGenuineCount', {
                    count: merchantGenuineDeals.length,
                  })}
                </span>
                <span
                  className={`badge rounded-pill border px-3 py-1 ${
                    merchantFakeTraps.length > 0
                      ? 'bg-danger-subtle text-danger border-danger-subtle'
                      : 'bg-light text-secondary'
                  }`}
                >
                  {merchantFakeTraps.length > 0
                    ? t('profileRadarFakeCount', {
                        count: merchantFakeTraps.length,
                      })
                    : t('profileRadarZeroFake')}
                </span>
                <Link
                  href="/deals"
                  className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
                >
                  {t('openRadar10PlatformsBtn')}
                </Link>
              </div>
            </div>
            {merchantGenuineDeals.length > 0 || merchantFakeTraps.length > 0 ? (
              <div className="row g-2">
                {merchantGenuineDeals.slice(0, 4).map((g) => (
                  <div key={g.id} className="col-md-6">
                    <div className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 d-flex justify-content-between align-items-center border p-2">
                      <div className="overflow-hidden pe-2">
                        <Link
                          href={g.productHref}
                          className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                        >
                          <BsArrowDownCircle
                            aria-hidden="true"
                            className="text-success me-1"
                          />
                          {g.productName}
                        </Link>
                        <div className="text-secondary small">
                          {t('low60dAndMedian', {
                            min: g.marketMinPrice.toLocaleString('vi-VN'),
                            median: g.marketMedianPrice.toLocaleString('vi-VN'),
                          })}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-end">
                        <div className="fw-bold text-success font-monospace small">
                          {g.priceCurrent.toLocaleString('vi-VN')} ₫
                        </div>
                        <span className="badge bg-success rounded-pill">
                          {t('vsMedianBadge', { pct: g.savingsVsMedianPct })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {merchantFakeTraps.slice(0, 4).map((tItem) => (
                  <div key={tItem.id} className="col-md-6">
                    <div className="rounded-3 border-danger-subtle bg-danger-subtle bg-opacity-10 d-flex justify-content-between align-items-center border p-2">
                      <div className="overflow-hidden pe-2">
                        <Link
                          href={tItem.productHref}
                          className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                        >
                          <BsExclamationTriangle
                            aria-hidden="true"
                            className="text-danger me-1"
                          />
                          {tItem.productName}
                        </Link>
                        <div className="text-secondary small">
                          {t('inflatedOriginalPrice', {
                            price: (tItem.priceOriginal || 0).toLocaleString(
                              'vi-VN'
                            ),
                          })}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-end">
                        <div className="fw-bold text-danger font-monospace small">
                          {tItem.priceCurrent.toLocaleString('vi-VN')} ₫
                        </div>
                        <span className="badge bg-danger rounded-pill">
                          {t('fakeMarkupBadge', { pct: tItem.fakeMarkupPct })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="small text-muted">
                {t('profileRadarCleanNote')}
              </div>
            )}
          </div>

          {/* SECTION #1: Recent Buyer Reviews & AI Flags Section (Rating-First Priority) */}
          <div className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm">
            <span className="rate-eyebrow text-primary d-block mb-1">
              {t('reviewsSectionEyebrow')}
            </span>
            <h2 className="h4 fw-bold mb-1">
              {t('reviewsSectionTitle', {
                count: merchant.recent_reviews.length,
              })}
            </h2>
            <p className="text-muted small mb-4">
              {t('reviewsSectionSubtitle')}
            </p>

            {merchant.recent_reviews.length === 0 ? (
              <div className="text-muted py-4 text-center">
                {t('noReviewsYet')}
              </div>
            ) : (
              <div className="row g-3">
                {merchant.recent_reviews.slice(0, 12).map((rev) => {
                  const isAuthentic = rev.include_in_rating;
                  const revCatSlug = rev.master_category_slug || 'smartphones';
                  const revCatBase = getCategoryRouteHref(revCatSlug);
                  const flagBadge = isPendingReview(rev)
                    ? {
                        label: t('flagPendingAnalysis'),
                        cls: 'bg-info-subtle text-info-emphasis',
                      }
                    : rev.flag_category === 'low_value_coin_spam'
                      ? {
                          label: t('flagCoinSpam'),
                          cls: 'bg-warning-subtle text-warning-emphasis',
                        }
                      : rev.flag_category === 'seeding_fake'
                        ? {
                            label: t('flagSeedingFake'),
                            cls: 'bg-danger-subtle text-danger',
                          }
                        : {
                            label: t('flagAuthenticWeight', {
                              weight: rev.helpfulness_weight.toFixed(2),
                            }),
                            cls: 'bg-success-subtle text-success',
                          };

                  return (
                    <div className="col-md-6 col-12" key={rev.id}>
                      <div
                        className={`rounded-4 h-100 border p-3 ${
                          isAuthentic ? 'bg-white' : 'bg-light opacity-75'
                        }`}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                          <div>
                            <div className="fw-bold small">
                              <ContentText
                                text={rev.author_name}
                                locale={locale}
                              />
                            </div>
                            {rev.master_slug ? (
                              <Link
                                href={`${revCatBase}/${rev.master_slug}#jreviews-section`}
                                className="text-primary text-decoration-none"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                <ContentText
                                  text={rev.product_title}
                                  locale={locale}
                                />
                              </Link>
                            ) : (
                              <div
                                className="text-muted"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                <ContentText
                                  text={rev.product_title}
                                  locale={locale}
                                />
                              </div>
                            )}
                          </div>
                          <span className="rate-score-badge-user">
                            ★ {rev.rating_star}/5
                          </span>
                        </div>

                        <p
                          className="small text-dark mb-2"
                          lang={contentLang(rev.comment, locale)}
                        >
                          {rev.comment || t('noCommentBody')}
                        </p>

                        <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                          <span
                            className={`badge ${flagBadge.cls} rounded-pill`}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {flagBadge.label}
                          </span>
                          {rev.reason && (
                            <span
                              className="text-muted"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              <AnalyzerText text={rev.reason} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION #2: Active Product Listings & Neutral Price Audit Table */}
          <div className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-2">
              <div>
                <span className="rate-eyebrow text-muted d-block mb-1">
                  {t('listingsSectionEyebrow')}
                </span>
                <h2 className="h4 fw-bold mb-1">
                  {t('listingsSectionTitle', {
                    count: merchant.listings.length,
                  })}
                </h2>
                <p className="text-muted small mb-0">
                  {t.rich('listingsSectionSubtitle', {
                    name: merchant.name,
                    value: (chunks) => (
                      <span lang={contentLang(merchant.name, locale)}>
                        {chunks}
                      </span>
                    ),
                  })}
                </p>
              </div>
            </div>

            {merchant.listings.length === 0 ? (
              <div className="text-muted py-4 text-center">
                {t('noListingsYet')}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table-hover mb-0 table align-middle">
                  <thead className="table-light small">
                    <tr>
                      <th scope="col">{t('colListedProduct')}</th>
                      <th scope="col">{t('colMasterProduct')}</th>
                      <th scope="col">{t('colRecordedPrice')}</th>
                      <th scope="col">{t('colPromoAudit')}</th>
                      <th scope="col" className="text-end">
                        {t('colAuditAndSource')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchant.listings.map((item) => {
                      const priceText =
                        item.price_current.toLocaleString('vi-VN');
                      const origText = item.price_original
                        ? item.price_original.toLocaleString('vi-VN')
                        : null;
                      const da = item.discount_analysis;
                      const badgeClass =
                        da?.verdict === 'fake_discount'
                          ? 'bg-danger text-white'
                          : da?.verdict === 'suspicious_discount'
                            ? 'bg-warning text-dark'
                            : da?.verdict === 'genuine_deal'
                              ? 'bg-success text-white'
                              : 'bg-light text-secondary border';
                      const resolvedImg = resolveProductImageUrl(
                        item.master_product?.slug,
                        item.image
                      );
                      // The category read with the master, not one guessed
                      // from its name, which linked earbuds and others under
                      // /smartphones (DOS/Rate#769).
                      const masterCatSlug =
                        item.master_product?.category_slug || 'smartphones';
                      const masterBaseHref =
                        getCategoryRouteHref(masterCatSlug);

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="d-flex align-items-center gap-3">
                              {resolvedImg && (
                                <img
                                  src={resolvedImg}
                                  alt={item.title}
                                  lang={contentLang(item.title, locale)}
                                  className="rounded border bg-white p-1"
                                  style={{
                                    width: '52px',
                                    height: '52px',
                                    objectFit: 'contain',
                                  }}
                                />
                              )}
                              <div>
                                <div
                                  className="fw-semibold small text-dark"
                                  lang={contentLang(item.title, locale)}
                                >
                                  {item.title}
                                </div>
                                <div
                                  className="text-muted"
                                  style={{ fontSize: '0.8125rem' }}
                                >
                                  {t('itemMetaLine')}{' '}
                                  <code>{item.platform_item_id}</code> •{' '}
                                  {t('soldLabel')}{' '}
                                  {formatSoldCount(
                                    item.historical_sold,
                                    item.historical_sold_display,
                                    locale
                                  )}{' '}
                                  • ★ {item.rating_star.toFixed(1)} (
                                  {item.rating_count})
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {item.master_product ? (
                              <div>
                                <div className="d-flex align-items-center flex-wrap gap-1">
                                  <Link
                                    href={`${masterBaseHref}/${item.master_product.slug}`}
                                    className="fw-semibold text-primary text-decoration-none small"
                                  >
                                    {item.master_product.name}
                                  </Link>
                                  <RadarBadge
                                    signal={getRadarSignal(
                                      radarIndex,
                                      item.master_product.slug
                                    )}
                                  />
                                </div>
                                <div
                                  className="text-muted"
                                  style={{ fontSize: '0.8125rem' }}
                                >
                                  {t('lowestMarketPriceLabel')}{' '}
                                  <strong className="font-monospace">
                                    {item.master_product.market_min_price.toLocaleString(
                                      'vi-VN'
                                    )}{' '}
                                    ₫
                                  </strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted small">
                                {t('unclusteredLabel')}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="fw-bold text-dark font-monospace">
                              {priceText} ₫
                            </div>
                            {origText && (
                              <div className="text-muted small text-decoration-line-through font-monospace">
                                {origText} ₫
                              </div>
                            )}
                          </td>
                          <td>
                            {da ? (
                              <div>
                                <span
                                  className={`badge ${badgeClass} rounded-pill small px-3 py-1`}
                                  title={
                                    discountVerdictCopy(tVerdict, da)
                                      .explanation
                                  }
                                >
                                  {discountVerdictCopy(tVerdict, da).label}
                                </span>
                                <div
                                  className="text-muted mt-1"
                                  style={{
                                    fontSize: '0.8125rem',
                                    maxWidth: '280px',
                                  }}
                                >
                                  {t('historicalLowObs', {
                                    price:
                                      da.historical_min_price.toLocaleString(
                                        'vi-VN'
                                      ),
                                    count: da.observation_count,
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="badge bg-light text-muted small border">
                                {t('collectingHistoryBadge')}
                              </span>
                            )}
                          </td>
                          <td className="text-end">
                            <div className="d-flex justify-content-end gap-2">
                              {item.master_product && (
                                <Link
                                  href={`${masterBaseHref}/${item.master_product.slug}#jreviews-section`}
                                  className="btn btn-sm btn-outline-primary rounded-pill px-3"
                                >
                                  {t('viewReviewsAndPricesBtn')}
                                </Link>
                              )}
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                              >
                                {t('verifySourceBtn')}
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
        </div>

        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}
