import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { notFound } from 'next/navigation';
import {
  getCrossPlatformDealRadar,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
  getCachedMasterProductReviews,
  getCachedMasterProductReviewSummary,
  getCachedMasterProducts,
  computeProductRadarSignal,
  type CanonicalCategorySlug,
} from '@/server/rate';
import { computeBayesianRatingSummary } from '@/lib/rate-api';
import {
  normalizeCompareFiveStarRating,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating5,
  resolveCompareExpertRating10,
} from '@/lib/rate-domain';
import {
  buildKeySpecLine,
  peerPriceDelta,
  rankRelatedCompetitors,
} from '@/lib/product-competitors';
import { isFilteredOutReview } from '@/lib/review-display';
import {
  BsCardChecklist,
  BsCheckCircleFill,
  BsPhone,
  BsShieldCheck,
  BsShieldExclamation,
  BsStarFill,
} from 'react-icons/bs';
import RadarBadge from '@/components/radar/RadarBadge';
import { buildRadarIndex, getRadarSignal } from '@/lib/deal-radar';
import { bayesianTierKey, radarExplanation } from '@/lib/product-detail-copy';
import {
  absoluteUrl,
  defaultOpenGraph,
  fitTitle,
  SHARE_IMAGE,
  fitDescription,
} from '@/lib/seo';
import JReviewsSection from '@/components/reviews/JReviewsSection';
import PhoneCollapsible from '@/components/product/PhoneCollapsible';
import PriceHistorySection from '@/components/price-history/PriceHistorySection';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import PageShell from '../../components/page-shell';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';

import { normalizeRateLocale } from '@/lib/rate-i18n';
import {
  getSpecUiDictionary,
  localizeSpecValue,
  specGroupHeading,
  specSectionBadge,
} from '@/lib/spec-localizer';
import { contentLang } from '@/lib/content-lang';
import ContentText from '@/components/elementary/ContentText';
import {
  computeProductStandingInCategory,
  scoreMasterProductForLeaderboard,
} from '@/lib/leaderboard-engine';
import ProductLeaderboardBadges from '@/components/leaderboard/ProductLeaderboardBadges';
import ProductShareAuditButton from '@/components/leaderboard/ProductShareAuditButton';
import ProductValueCalculator from '@/components/leaderboard/ProductValueCalculator';
import ProductOffersExplorer from '@/components/leaderboard/ProductOffersExplorer';
import ProductSpecsExportToolbar from '@/components/leaderboard/ProductSpecsExportToolbar';
import ClientMessages from '@/components/providers/ClientMessages';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  plausibleMinPrice,
  specFieldApplies,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  firstImageUrl,
  usableImageUrls,
  productImageUrl,
} from '@/lib/rate-domain-core';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

// Nothing is prerendered at build; each slug renders on its first request.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export type PageParams = Promise<{ locale: string; slug: string }>;

export async function generateCategoryProductMetadata(
  params: PageParams,
  categoryBasePath = '/smartphones'
): Promise<Metadata> {
  const { locale, slug } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale, namespace: 'productDetail' });
  const product = await getCachedMasterProductBySlug(slug);
  if (!product) {
    return {
      title: t('notFoundTitle'),
    };
  }
  // A bait-price listing does not set the "from" price (DOS/Rate#797).
  const offers = await getCachedMasterProductOffers(product.id);
  const minPrice = plausibleMinPrice(
    Number(product.min_price || 0),
    offers
  ).toLocaleString('vi-VN');
  const canonicalUrl = `https://rate.vn${categoryBasePath}/${product.slug}`;

  return {
    // The product name first; the site name, then the price give way to fit
    // a search result (DOS/Rate#782).
    title: fitTitle([
      t('metaTitle', { name: product.name, minPrice }),
      t('metaTitleShort', { name: product.name, minPrice }),
      `${product.name} | Rate.vn`,
      product.name,
    ]),
    description: fitDescription(
      t('metaDesc', {
        name: product.name,
        brand: product.brand,
        merchantCount: product.merchant_count || 0,
      })
    ),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(lang),
      title: t('ogTitle', { name: product.name }),
      description: t('ogDesc', { minPrice }),
      url: canonicalUrl,
      images: [firstImageUrl(product.images) ?? SHARE_IMAGE],
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  return generateCategoryProductMetadata(params, '/smartphones');
}

export async function ProductDetailView({
  params,
  categoryBasePath = '/smartphones',
  categoryLabel = 'Smartphones',
}: {
  params: PageParams;
  categoryBasePath?: string;
  categoryLabel?: string;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [t, tNav, storedProduct] = await Promise.all([
    getTranslations({ locale, namespace: 'productDetail' }),
    getTranslations({ locale, namespace: 'rate.nav' }),
    getCachedMasterProductBySlug(slug),
  ]);

  if (!storedProduct) {
    notFound();
  }

  const categorySlug = categoryBasePath.replace(/^\//, '') || 'smartphones';
  // Each category shows only the spec groups and fields it has: earbuds have
  // no screen, RAM or camera, watches no 5G (DOS/Rate#1142).
  const specTemplate = getCategorySpecTemplate(categorySlug);
  const product = applyCategorySpecTemplate(categorySlug, storedProduct);
  const localizedCategoryLabel =
    categorySlug === 'smartphones' ||
    categorySlug === 'laptops' ||
    categorySlug === 'tablets' ||
    categorySlug === 'smartwatches' ||
    categorySlug === 'earbuds'
      ? tNav(categorySlug)
      : categoryLabel;
  const [offers, reviews, storedCategoryPeers, categoryDealRadar] =
    await Promise.all([
      getCachedMasterProductOffers(product.id),
      getCachedMasterProductReviews(product.id),
      // No fallbacks: this page is cached, so an empty fallback would be
      // served for the whole revalidate window. A failed regeneration keeps
      // the last good page instead (DOS/Rate#491).
      getCachedMasterProducts({ categorySlug, limit: 50 }),
      getCrossPlatformDealRadar({
        categorySlug: categorySlug as CanonicalCategorySlug,
        limit: 50,
      }),
    ]);
  const categoryPeers = storedCategoryPeers.map((peer) =>
    applyCategorySpecTemplate(categorySlug, peer)
  );
  const [reviewSummary, priceHistory] = await Promise.all([
    getCachedMasterProductReviewSummary(product.id, reviews),
    getCachedMasterProductPriceHistory(product.id, offers),
  ]);

  const radarSignal = computeProductRadarSignal(product, offers);
  const radarNote = radarExplanation(radarSignal);
  const peerRadarIndex = buildRadarIndex(categoryDealRadar);

  const leaderboardBadges = computeProductStandingInCategory(
    product,
    categoryPeers
  );
  // The lowest plausible offer: a bait-price listing far below every other
  // store does not set the "from" price (DOS/Rate#797).
  const currentMinPrice = plausibleMinPrice(
    Number(product.min_price || 0),
    offers
  );
  const relatedCompetitors = rankRelatedCompetitors(
    categoryPeers,
    product.slug,
    currentMinPrice
  );

  const specs = product.specifications as ProductSpecifications;
  const keySpecs = product.key_specs as KeySpecs;
  const minPriceFormatted = currentMinPrice.toLocaleString('vi-VN');
  // Same meaning as the catalogue card's seller count (distinct merchants with
  // a price), not the number of listings.
  const sellerCount = new Set(
    offers
      .filter((o) => Number(o.price_current) > 0)
      .map((o) => o.merchant?.id || o.id)
  ).size;
  const maxPriceFormatted = Number(product.max_price).toLocaleString('vi-VN');

  const authenticCount =
    product.authentic_review_count && product.authentic_review_count > 0
      ? product.authentic_review_count
      : reviews.filter((r) => r.include_in_rating && r.helpfulness_weight > 0)
          .length;
  const ignoredCount = reviews.filter(isFilteredOutReview).length;
  const rawUserRating = resolveCompareEffectiveUserRating(product);
  const expertRating10 = resolveCompareExpertRating10(product);
  const bayesianSummary = computeBayesianRatingSummary(reviews, rawUserRating);
  const displayUserRating =
    bayesianSummary.effectiveWeightSum > 0
      ? bayesianSummary.bayesianRating
      : rawUserRating;

  const keySpecLine = buildKeySpecLine(product);
  const mainImage = firstImageUrl(product.images);

  const canonicalUrl = `https://rate.vn${categoryBasePath}/${product.slug}`;

  const structuredDataGraph = {
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
            name: localizedCategoryLabel,
            item: `https://rate.vn${categoryBasePath}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: product.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'Product',
        name: product.name,
        brand: {
          '@type': 'Brand',
          name: product.brand,
        },
        sku: product.model_key,
        url: canonicalUrl,
        description: t('metaDesc', {
          name: product.name,
          brand: product.brand,
          merchantCount: product.merchant_count || 0,
        }),
        image: usableImageUrls(product.images).map(absoluteUrl),
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'VND',
          lowPrice: currentMinPrice,
          highPrice: Number(product.max_price || product.min_price || 0),
          offerCount: offers.length || product.merchant_count || 0,
        },
        ...(displayUserRating > 0 && authenticCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(displayUserRating.toFixed(2)),
                reviewCount: authenticCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
    ],
  };

  return (
    <ClientMessages scope="productDetail">
      <PageShell locale={locale}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredDataGraph).replace(
              /</g,
              '\\u003c'
            ),
          }}
        />
        <div className="container py-5">
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="breadcrumb small">
              <li className="breadcrumb-item">
                <Link href="/" className="text-decoration-none">
                  {t('breadcrumbHome')}
                </Link>
              </li>
              <li className="breadcrumb-item">
                <Link href={categoryBasePath} className="text-decoration-none">
                  {localizedCategoryLabel}
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {product.name}
              </li>
            </ol>
          </nav>

          {/* Main Info Section */}
          <div className="row g-4 mb-5">
            {/* Left: Images */}
            <div className="col-lg-5 col-12">
              <div className="card rounded-4 bg-light p-md-4 border-0 p-3 text-center shadow-sm">
                <div className="rate-pdv-media d-flex align-items-center justify-content-center">
                  {mainImage ? (
                    // The main product image is the page's largest paint: fetch it
                    // ahead of the below-the-fold peer and offer thumbnails.
                    <img
                      src={mainImage}
                      alt={product.name}
                      fetchPriority="high"
                      className="img-fluid rounded-3"
                    />
                  ) : (
                    <div className="text-muted">{t('noProductImage')}</div>
                  )}
                </div>

                {/* Colors */}
                {product.colors && product.colors.length > 0 && (
                  <div className="border-top mt-3 pt-3 text-start">
                    <div className="small text-muted mb-2">
                      {t('availableColors')}
                    </div>
                    <div className="rate-pdv-colors d-flex flex-wrap gap-2">
                      {product.colors.map((c, i) => (
                        <span
                          key={i}
                          className="badge text-dark rounded-pill small border bg-white px-3 py-2"
                          lang={contentLang(c, locale)}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Overview & Offers Highlights */}
            <div className="col-lg-7 d-flex flex-column col-12">
              <p className="rate-product-card-meta rate-pdv-meta mb-1">
                {[product.brand, product.has_5g ? '5G' : '']
                  .filter(Boolean)
                  .join(' · ')}
                {product.variant_name && (
                  <>
                    {product.brand || product.has_5g ? ' · ' : ''}
                    <ContentText text={product.variant_name} locale={locale} />
                  </>
                )}
              </p>

              <h1 className="h2 fw-bold text-dark mb-2">{product.name}</h1>
              {/* Price in the first screen on phones, ahead of the scoreboard
            (DOS/Rate#605); the full price strip stays further down. */}
              {currentMinPrice > 0 && sellerCount > 0 && (
                <p className="rate-pdv-price-line mb-3">
                  {t.rich('heroPriceLine', {
                    price: minPriceFormatted,
                    count: sellerCount,
                    strong: (chunks) => (
                      <strong className="rate-tabular">{chunks}</strong>
                    ),
                  })}
                </p>
              )}
              {/* Below lg the scoreboard starts past the first phone screen, so
            the buyer score is repeated next to the price (DOS/Rate#630). */}
              {displayUserRating > 0 && (
                <p
                  className="rate-pdv-hero-score d-flex d-lg-none align-items-center mb-3 gap-1"
                  data-testid="pdv-hero-score"
                >
                  <BsStarFill aria-hidden="true" className="text-warning" />
                  <span className="visually-hidden">
                    {t('userWeightedScoreLabel')}:
                  </span>
                  <strong className="rate-tabular">
                    {displayUserRating.toFixed(1)}
                  </strong>
                  <span>
                    {t('verifiedReviewsCount', { count: authenticCount })}
                  </span>
                </p>
              )}

              {/* #1 Core Focus Above the Fold: JReviews Dual-Rating & 5-Criteria Scoreboard (DESIGN.md v3.0) */}
              <div className="rate-scoreboard-dark rate-surface-dark rate-pdv-board mb-4">
                <div className="rate-pdv-board-head">
                  <span className="rate-eyebrow">{t('scoreboardEyebrow')}</span>
                  <div className="rate-pdv-tags">
                    <span className="rate-pdv-tag is-good">
                      <BsCheckCircleFill aria-hidden="true" />
                      {t('authenticReviewsBadge', { count: authenticCount })}
                    </span>
                    {ignoredCount > 0 && (
                      <span className="rate-pdv-tag is-bad">
                        <BsShieldExclamation aria-hidden="true" />
                        {t('filteredSeedingBadge', { count: ignoredCount })}
                      </span>
                    )}
                    <RadarBadge signal={radarSignal} minSpreadPct={0} />
                  </div>
                </div>

                {radarNote && (
                  <p
                    className="rate-pdv-radar-note"
                    data-testid="pdv-radar-signal"
                  >
                    {radarNote.key === 'radarExplanationGenuineDeal'
                      ? t.rich(radarNote.key, {
                          ...radarNote.values,
                          value: (chunks) => (
                            <span
                              lang={contentLang(
                                radarNote.values.merchant,
                                locale
                              )}
                            >
                              {chunks}
                            </span>
                          ),
                        })
                      : t(radarNote.key, radarNote.values)}
                  </p>
                )}

                <div className="row g-3 align-items-stretch">
                  {/* Dual Score Boxes */}
                  <div className="col-md-5 d-flex flex-column col-12 gap-3">
                    <div className="rate-pdv-score">
                      <div className="rate-pdv-score-label is-user">
                        {t('userWeightedScoreLabel')}
                      </div>
                      {displayUserRating > 0 ? (
                        <div className="rate-pdv-score-row">
                          <span className="rate-pdv-score-value">
                            {displayUserRating.toFixed(1)}
                          </span>
                          <span className="rate-pdv-score-sub">
                            {t('verifiedReviewsCount', {
                              count: authenticCount,
                            })}
                          </span>
                        </div>
                      ) : (
                        <div className="rate-pdv-score-empty">
                          {t('notAvailableYet')} ·{' '}
                          {t('verifiedReviewsCountNoScore', {
                            count: authenticCount,
                          })}
                        </div>
                      )}
                      <div
                        className="rate-pdv-confidence"
                        data-testid="pdv-bayesian-confidence"
                      >
                        <span
                          className={`rate-pdv-tag is-${bayesianSummary.confidenceTier}`}
                          title={
                            bayesianSummary.effectiveWeightSum > 0
                              ? `Σw=${bayesianSummary.effectiveWeightSum.toFixed(2)} · c=${Math.round(bayesianSummary.confidenceRatio * 100)}%`
                              : undefined
                          }
                        >
                          {t(bayesianTierKey(bayesianSummary))}
                          {bayesianSummary.effectiveWeightSum > 0 && (
                            <span className="visually-hidden">
                              {' '}
                              (Σw=
                              {bayesianSummary.effectiveWeightSum.toFixed(2)},
                              c=
                              {Math.round(
                                bayesianSummary.confidenceRatio * 100
                              )}
                              %)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="rate-pdv-score is-expert">
                      <div className="rate-pdv-score-label is-expert">
                        {t('expertScoreLabel')}
                      </div>
                      {expertRating10 != null ? (
                        <div className="rate-pdv-score-row">
                          <span className="rate-pdv-score-value is-small">
                            {expertRating10.toFixed(1)}
                          </span>
                          <span className="rate-pdv-score-sub">
                            {t('tenGroupStandardWithSlash')}
                          </span>
                        </div>
                      ) : (
                        <div className="rate-pdv-score-empty">
                          {t('notAvailableYet')} · {t('tenGroupStandard')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5-Criteria Breakdown Bars */}
                  <div className="col-md-7 d-flex flex-column justify-content-center col-12">
                    <div className="rate-pdv-crit h-100">
                      {(() => {
                        const validCriteriaReviews = reviews.filter(
                          (r) =>
                            r.include_in_rating &&
                            r.helpfulness_weight > 0 &&
                            r.criteria_ratings
                        );
                        const expertCrit = product.expert_criteria_scores || {};
                        const avgCrit = (key: string): number | null => {
                          const vals = validCriteriaReviews
                            .map((r) => Number(r.criteria_ratings?.[key] || 0))
                            .filter((v) => v >= 1 && v <= 5);
                          if (vals.length > 0) {
                            return (
                              vals.reduce((a, b) => a + b, 0) / vals.length
                            );
                          }
                          const expVal = Number(
                            (expertCrit as Record<string, unknown>)[key] || 0
                          );
                          if (expVal > 0) {
                            return expVal > 5 ? expVal / 2 : expVal;
                          }
                          return null;
                        };

                        const criteria = [
                          {
                            label:
                              categorySlug === 'earbuds'
                                ? t('critSoundstage')
                                : t('critDisplay'),
                            score: avgCrit('screen'),
                          },
                          {
                            label: t('critPerformance'),
                            score: avgCrit('performance'),
                          },
                          {
                            label:
                              categorySlug === 'earbuds'
                                ? t('critAncMic')
                                : t('critCamera'),
                            score: avgCrit('camera'),
                          },
                          {
                            label: t('critBattery'),
                            score: avgCrit('battery'),
                          },
                          {
                            label: t('critValue'),
                            score: avgCrit('value'),
                          },
                        ];
                        // No criterion scored yet: one line instead of five
                        // empty bars (#719).
                        if (criteria.every((crit) => crit.score == null)) {
                          return (
                            <p
                              className="rate-pdv-crit-empty mb-0"
                              data-testid="pdv-criteria-empty"
                            >
                              {t('critEmpty')}
                            </p>
                          );
                        }
                        return criteria.map((crit) => {
                          const val =
                            crit.score != null
                              ? Math.min(5, Math.max(1, Number(crit.score)))
                              : null;
                          const pct =
                            val != null ? Math.round((val / 5) * 100) : 0;
                          return (
                            <div key={crit.label} className="rate-pdv-crit-row">
                              <div className="rate-pdv-crit-head">
                                <span>{crit.label}</span>
                                <span
                                  className={`rate-pdv-crit-value${val == null ? ' is-empty' : ''}`}
                                >
                                  {val != null
                                    ? `${val.toFixed(1)}/5`
                                    : t('notAvailableYet')}
                                </span>
                              </div>
                              <div className="progress rate-pdv-crit-track">
                                <div
                                  className="progress-bar"
                                  role="progressbar"
                                  aria-label={crit.label}
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor:
                                      val == null
                                        ? 'transparent'
                                        : val >= 4.5
                                          ? '#2dba69'
                                          : val >= 3.8
                                            ? '#f59e0b'
                                            : '#f43f5e',
                                  }}
                                  aria-valuenow={val ?? undefined}
                                  aria-valuemin={0}
                                  aria-valuemax={5}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {product.expert_review_summary && (
                  <div className="rate-pdv-verdict">
                    <strong>{t('expertVerdictPrefix')}</strong>{' '}
                    <ContentText
                      text={product.expert_review_summary}
                      locale={locale}
                    />
                  </div>
                )}

                {/* Primary Review & Evaluation Actions */}
                <div className="rate-pdv-actions">
                  <a
                    href="#jreviews-section"
                    className="btn btn-primary fw-semibold"
                  >
                    {t('readAndSubmitReviewsBtn', { count: authenticCount })}
                  </a>
                  <a href="#specs-section" className="btn btn-outline-light">
                    {t('tenSpecGroupsBtn')}
                  </a>
                  <Link
                    href={`/compare?slugs=${product.slug}`}
                    className="btn btn-outline-light"
                  >
                    {t('headToHeadCompareBtn')}
                  </Link>
                  <CompareQuickToggle
                    compact
                    className="ms-lg-auto"
                    item={{
                      slug: product.slug,
                      name: product.name,
                      brand: product.brand,
                      thumbnail: productImageUrl(product),
                      min_price: currentMinPrice,
                      categoryPath: categoryBasePath,
                    }}
                  />
                </div>

                <ProductLeaderboardBadges
                  badges={leaderboardBadges}
                  locale={locale}
                />
              </div>

              {/* Quick specs grid (Category-adaptive per DESIGN.md v3.0) */}
              <div className="row g-2 mb-3">
                <div className="col-sm-4 col-6">
                  <div className="bg-light rounded-3 h-100 border p-3">
                    <div className="text-muted small">
                      {categorySlug === 'earbuds'
                        ? t('quickSpecDriver')
                        : t('quickSpecScreen')}
                    </div>
                    <div className="fw-semibold small">
                      <ContentText
                        text={String(
                          keySpecs?.screen ||
                            (specs?.display?.size_inch
                              ? `${specs.display.size_inch}" ${specs?.display?.type || ''}`.trim()
                              : specs?.display?.type ||
                                specs?.multimedia?.loudspeaker ||
                                '-')
                        )}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-sm-4 col-6">
                  <div className="bg-light rounded-3 h-100 border p-3">
                    <div className="text-muted small">
                      {t('quickSpecChipset')}
                    </div>
                    <div className="fw-semibold small">
                      <ContentText
                        text={String(
                          keySpecs?.chip ||
                            specs?.hardware?.chipset ||
                            specs?.hardware?.cpu ||
                            '-'
                        )}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
                {(specTemplate.groups.includes('camera') ||
                  categorySlug === 'earbuds') && (
                  <div className="col-sm-4 col-6">
                    <div className="bg-light rounded-3 h-100 border p-3">
                      <div className="text-muted small">
                        {categorySlug === 'earbuds' &&
                        !keySpecs?.camera &&
                        !specs?.camera?.main_camera
                          ? t('quickSpecAudioAnc')
                          : t('quickSpecMainCamera')}
                      </div>
                      <div className="fw-semibold small">
                        <ContentText
                          text={String(
                            keySpecs?.camera ||
                              specs?.camera?.main_camera ||
                              specs?.multimedia?.audio_features ||
                              '-'
                          )}
                          locale={locale}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {(specTemplate.ram || specTemplate.storage) && (
                  <div className="col-sm-4 col-6">
                    <div className="bg-light rounded-3 h-100 border p-3">
                      <div className="text-muted small">
                        {t('quickSpecMemory')}
                      </div>
                      <div className="fw-semibold small">
                        {(() => {
                          const ram = product.ram_gb ?? specs?.hardware?.ram_gb;
                          const rom =
                            product.storage_gb ?? specs?.hardware?.storage_gb;
                          if (ram && rom) return `${ram}GB / ${rom}GB`;
                          if (ram) return `${ram}GB RAM`;
                          if (rom) return `${rom}GB`;
                          return keySpecs?.ram || keySpecs?.storage || '-';
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                <div className="col-sm-4 col-6">
                  <div className="bg-light rounded-3 h-100 border p-3">
                    <div className="text-muted small">
                      {t('quickSpecBattery')}
                    </div>
                    <div className="fw-semibold small">
                      <ContentText
                        text={String(
                          keySpecs?.battery ||
                            (specs?.battery?.capacity_mah
                              ? `${specs.battery.capacity_mah} mAh`
                              : specs?.battery?.charging || '-')
                        )}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-sm-4 col-6">
                  <div className="bg-light rounded-3 h-100 border p-3">
                    <div className="text-muted small">
                      {t('quickSpecDurability')}
                    </div>
                    <div className="fw-semibold small">
                      <ContentText
                        text={String(
                          specs?.design?.resistance ||
                            specs?.design?.materials ||
                            '-'
                        )}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Neutral Market Price Reference Strip (De-commercialized per DESIGN.md v3.0) */}
              <div className="rounded-4 bg-light mb-2 border p-3">
                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
                  <div>
                    <div className="text-muted small">
                      {t('priceReferenceLabel', { count: offers.length })}
                    </div>
                    <div className="fw-bold text-dark rate-tabular fs-5">
                      {minPriceFormatted} ₫
                      {currentMinPrice !== Number(product.max_price || 0) && (
                        <span className="small fw-normal text-muted ms-2">
                          ~ {maxPriceFormatted} ₫
                        </span>
                      )}
                      {priceHistory.lowestEverPrice != null && (
                        <span className="badge bg-success-subtle text-success fw-normal ms-2">
                          {t('allTimeLowBadge', {
                            price:
                              priceHistory.lowestEverPrice.toLocaleString(
                                'vi-VN'
                              ),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <PriceWatchButton
                      slug={product.slug}
                      name={product.name}
                      brand={product.brand}
                      categoryPath={categoryBasePath}
                      thumbnail={productImageUrl(product)}
                      currentMinPrice={currentMinPrice}
                      size="sm"
                    />
                    <a
                      href="#price-history-section"
                      className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                    >
                      {t('auditPriceBtn', { count: offers.length })}
                    </a>
                    <ProductShareAuditButton
                      name={product.name}
                      brand={product.brand}
                      modelKey={product.model_key}
                      userScore5={Number(displayUserRating.toFixed(2))}
                      expertScore10={expertRating10}
                      authenticReviews={authenticCount}
                      minPriceVnd={currentMinPrice}
                      offerCount={offers.length}
                      keySpecLine={keySpecLine}
                      radarSignal={radarSignal}
                    />
                  </div>
                </div>
              </div>

              <details className="rate-pdv-devinfo">
                <summary>{t('devInfoToggle')}</summary>
                <p>
                  {t('canonicalModelKeyLabel')} <code>{product.model_key}</code>
                </p>
              </details>
            </div>
          </div>

          {/* SECTION #1: JReviews Dual-Rating, AI Review Synthesis & Interactive Voting (Core Product Value) */}
          <div className="mb-5">
            <JReviewsSection
              masterProductId={product.id}
              productSlug={product.slug}
              productName={product.name}
              averageRating={normalizeCompareFiveStarRating(
                product.average_rating
              )}
              userRatingWeighted={
                normalizeCompareFiveStarRating(product.user_rating_weighted) ||
                null
              }
              expertRating={resolveCompareExpertRating5(product)}
              expertReviewSummary={product.expert_review_summary || null}
              authenticReviewCount={authenticCount}
              ignoredReviewCount={ignoredCount}
              reviews={reviews}
              summary={reviewSummary}
              radarSignal={radarSignal}
            />
          </div>

          {/* SECTION #2: Spec groups, per category template (DOS/Rate#1142) */}
          {(() => {
            const specUi = getSpecUiDictionary(locale);
            const loc = (v: string | number | boolean | null | undefined) => (
              <ContentText
                text={localizeSpecValue(v, locale)}
                locale={locale}
              />
            );
            const groupHeading = (group: SpecGroupKey) =>
              specGroupHeading(
                specUi,
                group,
                specTemplate.groups.indexOf(group) + 1,
                specTemplate.has5g
              );
            const shows = (group: SpecGroupKey, field: string) =>
              specFieldApplies(specTemplate, group, field);
            const groupNodes: Record<SpecGroupKey, ReactNode> = {
              display: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('display')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.screenSize}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.display?.size_inch
                          ? `${specs.display.size_inch} inch`
                          : product.screen_size_inch
                            ? `${product.screen_size_inch} inch`
                            : '-'}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.panelType}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.display?.type || keySpecs?.screen)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.resolution}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.display?.resolution)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.refreshRate}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.display?.refresh_rate_hz
                          ? `${specs.display.refresh_rate_hz} Hz`
                          : '-'}
                      </dd>
                      <dt className="text-muted col-5">{specUi.fields.ppi}</dt>
                      <dd className="fw-medium col-7">
                        {specs?.display?.ppi ? `${specs.display.ppi} ppi` : '-'}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.protection}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.display?.protection)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.displayFeatures}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.display?.features)}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              hardware: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('hardware')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.chipset}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.hardware?.chipset || keySpecs?.chip)}
                      </dd>
                      <dt className="text-muted col-5">{specUi.fields.cpu}</dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.hardware?.cpu)}
                      </dd>
                      {shows('hardware', 'gpu') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.gpu}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs?.hardware?.gpu)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">{specUi.fields.ram}</dt>
                      <dd className="fw-medium col-7">
                        {specs?.hardware?.ram_gb
                          ? `${specs.hardware.ram_gb} GB`
                          : product.ram_gb
                            ? `${product.ram_gb} GB`
                            : '-'}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.storage}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.hardware?.storage_gb
                          ? `${specs.hardware.storage_gb} GB`
                          : product.storage_gb
                            ? `${product.storage_gb} GB`
                            : '-'}
                      </dd>
                      {shows('hardware', 'storage_expansion') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.storageExpansion}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs?.hardware?.storage_expansion)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">{specUi.fields.os}</dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.hardware?.os)}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              camera: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('camera')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.rearSetup}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.camera?.rear_setup)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.mainCamera}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.camera?.main_camera || keySpecs?.camera)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.secondCamera}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.camera?.second_camera)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.thirdCamera}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.camera?.third_camera)}
                      </dd>
                      {specs?.camera?.fourth_camera && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.fourthCamera}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs.camera.fourth_camera)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.frontCamera}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.camera?.front_camera)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.videoAndFlash}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(
                          [specs?.camera?.video_recording, specs?.camera?.flash]
                            .filter(Boolean)
                            .join(' | ')
                        )}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              battery: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('battery')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.batteryCapacity}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.battery?.capacity_mah
                          ? `${specs.battery.capacity_mah} mAh`
                          : product.battery_mah
                            ? `${product.battery_mah} mAh`
                            : loc(keySpecs?.battery)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.batteryType}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.battery?.type)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.chargingTech}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.battery?.charging)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.fastCharging}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.battery?.fast_charging_w
                          ? `${specs.battery.fast_charging_w} W`
                          : '-'}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.reverseCharging}
                      </dt>
                      <dd className="fw-medium col-7">
                        {typeof specs?.battery?.reverse_charging === 'string'
                          ? loc(specs.battery.reverse_charging)
                          : specs?.battery?.reverse_charging === true
                            ? specUi.supported
                            : specs?.battery?.reverse_charging === false
                              ? specUi.no
                              : '-'}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              design: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('design')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.dimensions}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.design?.dimensions)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.weight}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.design?.weight_g
                          ? `${specs.design.weight_g} g`
                          : '-'}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.materialsAndBuild}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(
                          [specs?.design?.materials, specs?.design?.build]
                            .filter(Boolean)
                            .join(' | ')
                        )}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.resistance}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.design?.resistance)}
                      </dd>
                      {shows('design', 'biometrics') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.biometrics}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs?.design?.biometrics)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.physicalKeys}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.design?.keys)}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              cellular: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('cellular')}
                    </h3>
                    <dl className="row small mb-0">
                      {shows('cellular', 'has_5g') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.support5g}
                          </dt>
                          <dd className="fw-medium col-7">
                            {(specs?.cellular?.has_5g ?? product.has_5g)
                              ? specUi.has5gYes
                              : specUi.no}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.networkTech}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.cellular?.technology)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.simType}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.cellular?.sim_type)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.dataSpeed}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.cellular?.data_speed)}
                      </dd>
                      {shows('cellular', 'bands_5g') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.bands5g4g}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(
                              [
                                specs?.cellular?.bands_5g,
                                specs?.cellular?.bands_4g,
                              ]
                                .filter(Boolean)
                                .join(' | ')
                            )}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.volteVowifi}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.cellular?.volte || specs?.cellular?.vowifi
                          ? [
                              specs?.cellular?.volte ? 'VoLTE' : null,
                              specs?.cellular?.vowifi ? 'VoWiFi' : null,
                            ]
                              .filter(Boolean)
                              .join(' + ')
                          : '-'}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              connectivity: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('connectivity')}
                    </h3>
                    <dl className="row small mb-0">
                      {shows('connectivity', 'wlan') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.wlan}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs?.connectivity?.wlan)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.bluetooth}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.connectivity?.bluetooth)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.usbPort}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.connectivity?.usb)}
                      </dd>
                      {shows('connectivity', 'nfc') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.nfc}
                          </dt>
                          <dd className="fw-medium col-7">
                            {specs?.connectivity?.nfc === true
                              ? specUi.yes
                              : specs?.connectivity?.nfc === false
                                ? specUi.no
                                : '-'}
                          </dd>
                        </>
                      )}
                      {shows('connectivity', 'location') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.locationGps}
                          </dt>
                          <dd className="fw-medium col-7">
                            {loc(specs?.connectivity?.location)}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.sensorsAndOther}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(
                          [
                            specs?.connectivity?.sensors,
                            specs?.connectivity?.other,
                          ]
                            .filter(Boolean)
                            .join(' | ')
                        )}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              multimedia: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('multimedia')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.loudspeaker}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.multimedia?.loudspeaker)}
                      </dd>
                      {shows('multimedia', 'headphone_jack_35mm') && (
                        <>
                          <dt className="text-muted col-5">
                            {specUi.fields.jack35mm}
                          </dt>
                          <dd className="fw-medium col-7">
                            {specs?.multimedia?.headphone_jack_35mm === true
                              ? specUi.yes
                              : specs?.multimedia?.headphone_jack_35mm === false
                                ? specUi.no
                                : '-'}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted col-5">
                        {specUi.fields.audioFeatures}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.multimedia?.audio_features)}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              availability: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('availability')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.announcedDate}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.availability?.announced)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.commercialStatus}
                      </dt>
                      <dd className="fw-medium col-7">
                        {specs?.availability?.status
                          ? loc(specs.availability.status)
                          : specUi.availableStatus}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.msrpPrice}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.availability?.prices_msrp)}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
              regulatory: (
                <div className="col-md-6 col-12">
                  <div className="rounded-4 h-100 border bg-white p-4">
                    <h3 className="h6 fw-bold text-primary mb-3">
                      {groupHeading('regulatory')}
                    </h3>
                    <dl className="row small mb-0">
                      <dt className="text-muted col-5">
                        {specUi.fields.certifications}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.regulatory?.certifications)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.fccApproval}
                      </dt>
                      <dd className="fw-medium col-7">
                        {loc(specs?.regulatory?.fcc_approval)}
                      </dd>
                      <dt className="text-muted col-5">
                        {specUi.fields.sarLevel}
                      </dt>
                      <dd className="fw-medium col-7">
                        {[
                          specs?.regulatory?.sar_head
                            ? `${specUi.fields.sarHeadPrefix}: ${specs.regulatory.sar_head}`
                            : null,
                          specs?.regulatory?.sar_body
                            ? `${specUi.fields.sarBodyPrefix}: ${specs.regulatory.sar_body}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' | ') || '-'}
                      </dd>
                    </dl>
                  </div>
                </div>
              ),
            };
            return (
              <div
                id="specs-section"
                className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm"
              >
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-2">
                  <div>
                    <span className="rate-eyebrow text-muted d-block mb-1">
                      {specUi.sectionEyebrow}
                    </span>
                    <h2 className="h4 fw-bold d-flex align-items-center mb-0 gap-2">
                      <BsCardChecklist aria-hidden="true" />{' '}
                      {specUi.sectionTitle}
                    </h2>
                  </div>
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <ProductSpecsExportToolbar
                      productName={product.name}
                      productSlug={product.slug}
                      brand={product.brand}
                      specifications={specs || {}}
                      keySpecs={keySpecs || {}}
                      radarSignal={radarSignal}
                    />
                    <span className="badge bg-dark-subtle text-dark rounded-pill px-3 py-2">
                      {specSectionBadge(specUi, specTemplate.groups.length)}
                    </span>
                  </div>
                </div>

                <PhoneCollapsible
                  className="row g-4"
                  showMoreLabel={t('specsShowAll')}
                  showLessLabel={t('specsShowLess')}
                  openOnHash="#specs-section"
                >
                  {specTemplate.groups.map((group) => (
                    <Fragment key={group}>{groupNodes[group]}</Fragment>
                  ))}
                </PhoneCollapsible>
              </div>
            );
          })()}

          {/* SECTION #3: Time-Series Price History Chart, Fake Discount Detector & Neutral Merchant Audit */}
          <PriceHistorySection
            productName={product.name}
            history={priceHistory}
            radarSignal={radarSignal}
          />

          {/* Neutral Merchant Reference & Trust Audit Table */}
          <div
            id="offers-table"
            className="card rounded-4 p-md-5 mt-4 mb-5 border-0 p-4 shadow-sm"
          >
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <span className="rate-eyebrow text-muted d-block mb-1">
                  {t('offersEyebrow')}
                </span>
                <h2 className="h4 fw-bold d-flex align-items-center mb-0 gap-2">
                  <BsShieldCheck aria-hidden="true" />{' '}
                  {t('offersTitle', { count: offers.length })}
                </h2>
              </div>
              <span className="badge bg-light text-secondary rounded-pill border px-3 py-2">
                {t('offersMedianBadge')}
              </span>
            </div>

            {offers.length === 0 ? (
              <p className="text-muted mb-0">{t('noOffersYet')}</p>
            ) : (
              <ProductOffersExplorer
                productName={product.name}
                productSlug={product.slug}
                offers={offers}
                byOffer={priceHistory.byOffer}
                radarSignal={radarSignal}
              />
            )}
          </div>

          {/* Interactive Value Efficiency & 2-Year Ownership Calculator (#62) */}
          {(() => {
            const lbScored = scoreMasterProductForLeaderboard(
              product,
              'combined'
            );
            return (
              <ProductValueCalculator
                productName={product.name}
                brand={product.brand}
                categorySlug={categorySlug}
                minPriceVnd={currentMinPrice}
                maxPriceVnd={Number(
                  product.max_price || product.min_price || 0
                )}
                userScore5={lbScored.userScore5}
                expertScore10={lbScored.expertScore10}
                valueCriterionScore5={lbScored.criteria.value}
                radarSignal={radarSignal}
              />
            );
          })()}

          {/* Related Competitors & 1-Click Head-to-Head Compare */}
          {relatedCompetitors.length > 0 && (
            <div className="card rounded-4 mt-4 border-0 bg-white p-4 shadow-sm">
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div>
                  <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-1 px-3 py-1">
                    {t('competitorsBadge', {
                      category: localizedCategoryLabel,
                    })}
                  </span>
                  <h3 className="h5 fw-bold mb-0">
                    {t('competitorsTitle', { name: product.name })}
                  </h3>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Link
                    href="/deals"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
                  >
                    {t('dealHub10PlatformsBtn')}
                  </Link>
                  <Link
                    href={`/compare?slugs=${[product.slug, ...relatedCompetitors.map((c) => c.slug)].slice(0, 4).join(',')}`}
                    className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                  >
                    {t('compareAllPeersBtn', {
                      count: Math.min(4, relatedCompetitors.length + 1),
                    })}
                  </Link>
                </div>
              </div>

              <div
                className="row g-3"
                data-testid="same-category-value-alternatives"
              >
                {relatedCompetitors.map((peer) => {
                  const peerPrice = Number(peer.min_price || 0);
                  const priceDelta = peerPriceDelta(peerPrice, currentMinPrice);
                  const peerThumb = productImageUrl(peer);
                  const peerRating = resolveCompareEffectiveUserRating(peer);
                  const peerScore10 = peerRating * 2;
                  const currentScore10 = displayUserRating * 2;
                  const peerCostPerPoint =
                    peerScore10 > 0 && peerPrice > 0
                      ? Math.round(peerPrice / peerScore10)
                      : 0;
                  const currentCostPerPoint =
                    currentScore10 > 0
                      ? Math.round(currentMinPrice / currentScore10)
                      : 0;
                  const costPerPointDelta =
                    peerCostPerPoint > 0 && currentCostPerPoint > 0
                      ? peerCostPerPoint - currentCostPerPoint
                      : 0;

                  return (
                    <div key={peer.id} className="col-lg-4 col-md-6 col-12">
                      <div className="card rounded-4 bg-light h-100 border p-3">
                        <div className="d-flex align-items-center mb-3 gap-3">
                          <div
                            className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 border bg-white p-2"
                            style={{ width: '68px', height: '68px' }}
                          >
                            {peerThumb ? (
                              <img
                                loading="lazy"
                                decoding="async"
                                src={peerThumb}
                                alt={peer.name}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              <BsPhone
                                aria-hidden="true"
                                className="text-muted"
                              />
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <div className="d-flex align-items-center mb-1 flex-wrap gap-1">
                              <span className="badge bg-secondary-subtle text-secondary small">
                                {peer.brand}
                              </span>
                              <span className="badge bg-warning-subtle text-dark small">
                                ★{' '}
                                {peerRating > 0
                                  ? peerRating.toFixed(1)
                                  : t('peerNoRating')}
                              </span>
                              <RadarBadge
                                signal={getRadarSignal(
                                  peerRadarIndex,
                                  peer.slug
                                )}
                              />
                            </div>
                            <h4 className="h6 fw-bold text-truncate mb-1">
                              <Link
                                href={`${categoryBasePath}/${peer.slug}`}
                                className="text-dark text-decoration-none"
                              >
                                {peer.name}
                              </Link>
                            </h4>
                            <div className="d-flex align-items-center flex-wrap gap-2">
                              {peerPrice > 0 ? (
                                <span className="text-danger fw-bold small rate-tabular">
                                  {peerPrice.toLocaleString('vi-VN')} ₫
                                </span>
                              ) : (
                                <span className="text-muted small">
                                  {t('peerNoPrice')}
                                </span>
                              )}
                              {priceDelta !== 0 && (
                                <span
                                  className={`badge rounded-pill ${
                                    priceDelta < 0
                                      ? 'bg-success-subtle text-success'
                                      : 'bg-secondary-subtle text-secondary'
                                  }`}
                                  style={{ fontSize: '0.8125rem' }}
                                >
                                  {priceDelta < 0
                                    ? t('cheaperByBadge', {
                                        amount:
                                          Math.abs(priceDelta).toLocaleString(
                                            'vi-VN'
                                          ),
                                      })
                                    : `+${priceDelta.toLocaleString('vi-VN')} ₫`}
                                </span>
                              )}
                            </div>
                            {peerCostPerPoint > 0 && (
                              <div className="text-muted small rate-tabular mt-1">
                                {t('costPerPointUnit', {
                                  cost: peerCostPerPoint.toLocaleString(
                                    'vi-VN'
                                  ),
                                })}
                                {costPerPointDelta < 0 && (
                                  <span className="text-success fw-semibold ms-1">
                                    {t('betterValueTag')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="d-flex mt-auto gap-2">
                          <Link
                            href={`/compare/${product.slug}-vs-${peer.slug}`}
                            className="btn btn-sm btn-outline-primary rounded-pill fw-semibold flex-grow-1"
                          >
                            {t('compare1v1Btn')}
                          </Link>
                          <Link
                            href={`${categoryBasePath}/${peer.slug}`}
                            className="btn btn-sm btn-light rounded-pill border px-3"
                          >
                            {t('detailsBtn')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}

export default async function SmartphoneDetailPage({
  params,
}: {
  params: PageParams;
}) {
  return <ProductDetailView params={params} categoryBasePath="/smartphones" />;
}
