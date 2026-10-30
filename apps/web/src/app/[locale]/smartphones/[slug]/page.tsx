import type { Metadata } from 'next';
import { Fragment } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { notFound, permanentRedirect } from 'next/navigation';
import { resolveItemRoute } from '@/server/rate/item-route';
import {
  itemSizePanelBytes,
  loadItemPageContext,
  pickRenderedSize,
  type ItemPageVariant,
} from '@/server/rate/item-page';
import {
  buildItemProductGroupNode,
  itemVariantLabel,
  itemFromStats,
  withoutItemSiblings,
} from '@/lib/item-page';
import ItemVariantPicker from '@/components/product/item/ItemVariantPicker';
import ItemVariantPanels from '@/components/product/item/ItemVariantPanels';
import ItemLazySizePanel, {
  type ItemSizePanelKind,
} from '@/components/product/item/ItemLazySizePanel';
import { shouldLazyLoadSizes } from '@/lib/item-size-panel';
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
import { buildProductSpecGroups } from '@/lib/product-spec-rows';
import {
  listingCountForSaleState,
  masterSaleState,
  saleStateLabelKey,
} from '@/lib/sale-state';
import {
  computeProductStandingInCategory,
  scoreMasterProductForLeaderboard,
} from '@/lib/leaderboard-engine';
import { deviceImageSrcSet } from '@/lib/device-images';
import ProductLeaderboardBadges from '@/components/leaderboard/ProductLeaderboardBadges';
import ProductShareAuditButton from '@/components/leaderboard/ProductShareAuditButton';
import ProductValueCalculator from '@/components/leaderboard/ProductValueCalculator';
import ProductOffersExplorer from '@/components/leaderboard/ProductOffersExplorer';
import ProductSpecsExportToolbar from '@/components/leaderboard/ProductSpecsExportToolbar';
import ClientMessages from '@/components/providers/ClientMessages';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  productMarketStats,
} from '@/lib/product-market-stats';
import {
  firstImageUrl,
  usableImageUrls,
  productImageUrl,
} from '@/lib/rate-domain-core';
import { versusHref } from '@/lib/item-compare';

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
  // RATE_ITEM_MODEL on: an Item URL describes its selected variant and is
  // canonical (Q1, DOS/Rate#1153). Off: null, the page as before.
  const itemRoute = await resolveItemRoute({ slug, categoryBasePath });
  // A URL the page 308s away (an old variant URL, an Item under another
  // category) is never its own canonical: it points where the page goes.
  if (itemRoute?.kind === 'redirect') {
    return {
      alternates: { canonical: `https://rate.vn${itemRoute.to.split('?')[0]}` },
    };
  }
  // The sizes the page itself shows, so the title quotes the same "from".
  const itemPage =
    itemRoute?.kind === 'render' && itemRoute.variants.length > 1
      ? await loadItemPageContext(itemRoute.item, itemRoute.variants)
      : null;
  const renderedSize =
    itemPage && itemRoute?.kind === 'render'
      ? pickRenderedSize(itemPage.variants, itemRoute.variantSlug)
      : null;
  const product =
    itemRoute?.kind === 'not_found'
      ? null
      : await getCachedMasterProductBySlug(
          renderedSize?.variant.slug ??
            (itemRoute?.kind === 'render' ? itemRoute.variantSlug : slug)
        );
  if (!product) {
    return {
      title: t('notFoundTitle'),
    };
  }
  // The stored stats, like every other page shows (DOS/Rate#1141). An Item
  // URL is the Item: its name and the "from" price over its sizes (#1154).
  const itemMeta = itemRoute?.kind === 'render' ? itemRoute.item : null;
  const isItemGroup = (itemPage?.variants.length ?? 0) > 1;
  const marketStats =
    itemPage && isItemGroup
      ? itemFromStats(itemPage.variants.map((v) => v.product))
      : productMarketStats(product);
  const hasPrice = marketStats.minPrice > 0;
  const name = (isItemGroup ? itemMeta?.name : null) || product.name;
  const minPrice = marketStats.minPrice.toLocaleString('vi-VN');
  const canonicalUrl = `https://rate.vn${categoryBasePath}/${
    itemRoute?.kind === 'render' ? itemRoute.itemSlug : product.slug
  }`;

  return {
    // The product name first; the site name, then the price give way to fit
    // a search result (DOS/Rate#782). No "from 0 ₫" without a price.
    title: fitTitle([
      ...(hasPrice
        ? [
            t('metaTitle', { name, minPrice }),
            t('metaTitleShort', { name, minPrice }),
          ]
        : []),
      `${name} | Rate.vn`,
      name,
    ]),
    description: fitDescription(
      hasPrice
        ? t('metaDesc', {
            name,
            brand: product.brand,
            merchantCount: marketStats.sellerCount,
          })
        : t('metaDescNoStock', { name, brand: product.brand })
    ),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(lang),
      title: t('ogTitle', { name }),
      description: hasPrice ? t('ogDesc', { minPrice }) : t('ogDescNoStock'),
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
  // RATE_ITEM_MODEL on: an old variant URL 308s to its Item URL with `?v=`,
  // and an Item URL renders its selected variant until the Item page ships
  // (Q1, DOS/Rate#1153, #1154). Off: null, and the page is as before.
  const itemRoute = await resolveItemRoute({ slug, categoryBasePath });
  if (itemRoute?.kind === 'redirect') permanentRedirect(itemRoute.to);
  // Neither a published Item nor a variant of one: no fallback to the old
  // master lookup, which would show a variant of an unpublished Item.
  if (itemRoute?.kind === 'not_found') notFound();
  // RATE_ITEM_MODEL on and an Item URL: every size's offers and history, and
  // the listings whose size is not stated (#1154). Null otherwise. A size
  // whose read failed is left out, and the page renders a size that loaded.
  const itemPage =
    itemRoute?.kind === 'render' && itemRoute.variants.length > 0
      ? await loadItemPageContext(itemRoute.item, itemRoute.variants)
      : null;
  const renderedSize =
    itemPage && itemRoute?.kind === 'render'
      ? pickRenderedSize(itemPage.variants, itemRoute.variantSlug)
      : null;
  const productSlug =
    renderedSize?.variant.slug ??
    (itemRoute?.kind === 'render' ? itemRoute.variantSlug : slug);
  const [t, tNav, tSale, storedProduct] = await Promise.all([
    getTranslations({ locale, namespace: 'productDetail' }),
    getTranslations({ locale, namespace: 'rate.nav' }),
    getTranslations({ locale, namespace: 'saleState' }),
    getCachedMasterProductBySlug(productSlug),
  ]);

  if (!storedProduct) {
    notFound();
  }
  const itemVariants = itemPage?.variants ?? [];
  const isItemGroup = itemVariants.length > 1;

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

  // A sold-out listing's last price is no deal (DOS/Rate#1141).
  const inStockOffers = offers.filter((o) => !isOfferUnavailable(o));
  const radarSignal = computeProductRadarSignal(product, inStockOffers);
  const radarNote = radarExplanation(radarSignal);
  const peerRadarIndex = buildRadarIndex(categoryDealRadar);

  const leaderboardBadges = computeProductStandingInCategory(
    product,
    categoryPeers
  );
  // "From" price, range and seller count: the stored stats every other page
  // shows (in-stock listings, no bait prices), not the offer list below,
  // which also holds sold-out listings at their last price (DOS/Rate#1141).
  const marketStats = productMarketStats(product);
  const currentMinPrice = marketStats.minPrice;
  // An Item's other sizes are the same device, not competitors (#1154).
  const relatedCompetitors = rankRelatedCompetitors(
    itemPage
      ? withoutItemSiblings(
          categoryPeers,
          itemVariants.map((v) => v.variant.slug)
        )
      : categoryPeers,
    product.slug,
    currentMinPrice
  );
  // The Item page's name and "from" price span its sizes.
  const displayName = itemPage?.item.name || product.name;
  const heroStats = isItemGroup
    ? itemFromStats(itemVariants.map((v) => v.product))
    : marketStats;

  const specs = product.specifications as ProductSpecifications;
  const keySpecs = product.key_specs as KeySpecs;
  const sellerCount = marketStats.sellerCount;
  const heroMinPriceFormatted = heroStats.minPrice.toLocaleString('vi-VN');
  // Why there is no price, when there is none (DOS/Rate#1188).
  const saleState = masterSaleState({
    minPrice: currentMinPrice,
    listingCount: listingCountForSaleState(offers.length, inStockOffers.length),
    metadata: product.metadata,
    availabilityStatus: specs?.availability?.status,
  });
  const saleStateKey =
    saleState === 'on_sale' ? null : saleStateLabelKey(saleState);

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

  const keySpecLine = buildKeySpecLine(product, categorySlug);
  const mainImage = firstImageUrl(product.images);

  const canonicalUrl = `https://rate.vn${categoryBasePath}/${
    itemRoute?.kind === 'render' ? itemRoute.itemSlug : product.slug
  }`;

  const productDescription =
    currentMinPrice > 0
      ? t('metaDesc', {
          name: product.name,
          brand: product.brand,
          merchantCount: sellerCount,
        })
      : t('metaDescNoStock', {
          name: product.name,
          brand: product.brand,
        });
  const aggregateRating =
    displayUserRating > 0 && authenticCount > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(displayUserRating.toFixed(2)),
          reviewCount: authenticCount,
          bestRating: 5,
          worstRating: 1,
        }
      : null;
  const itemGroupNode =
    itemPage && isItemGroup
      ? buildItemProductGroupNode({
          itemKey: itemPage.item.item_key,
          name: displayName,
          brand: itemPage.item.brand || product.brand,
          canonicalUrl,
          description:
            heroStats.minPrice > 0
              ? t('metaDesc', {
                  name: displayName,
                  brand: itemPage.item.brand || product.brand,
                  merchantCount: heroStats.sellerCount,
                })
              : t('metaDescNoStock', {
                  name: displayName,
                  brand: itemPage.item.brand || product.brand,
                }),
          images: usableImageUrls(product.images).map(absoluteUrl),
          variants: itemVariants.map((v) => {
            const stats = productMarketStats(v.product);
            return {
              variantKey: v.variant.variant_key,
              label: itemVariantLabel(v.variant),
              minPrice: stats.minPrice,
              maxPrice: stats.maxPrice,
              sellerCount: stats.sellerCount,
            };
          }),
          aggregateRating,
        })
      : null;

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
            name: displayName,
            item: canonicalUrl,
          },
        ],
      },
      itemGroupNode ?? {
        '@type': 'Product',
        name: product.name,
        brand: {
          '@type': 'Brand',
          name: product.brand,
        },
        sku: product.model_key,
        url: canonicalUrl,
        description: productDescription,
        image: usableImageUrls(product.images).map(absoluteUrl),
        // Only with a buyable price: a lowPrice of 0 is not an offer.
        ...(currentMinPrice > 0
          ? {
              offers: {
                '@type': 'AggregateOffer',
                priceCurrency: 'VND',
                lowPrice: currentMinPrice,
                highPrice: marketStats.maxPrice,
                // Sellers, like "N nơi bán": one store's several listings of
                // the model are one offer to a shopper.
                offerCount: sellerCount,
              },
            }
          : {}),
        ...(aggregateRating ? { aggregateRating } : {}),
      },
    ],
  };

  // The history chart and the offer table of one size; the variant page
  // renders them for its own master, an Item page once per size (#1154).
  const renderPriceHistory = (v: {
    product: { name: string };
    priceHistory: typeof priceHistory;
    minPrice: number;
    radarSignal: typeof radarSignal;
  }) => (
    <PriceHistorySection
      productName={v.product.name}
      // Its "current lowest" is the page's "from" price (DOS/Rate#1141).
      history={{
        ...v.priceHistory,
        currentMinPrice: v.minPrice > 0 ? v.minPrice : null,
      }}
      radarSignal={v.radarSignal}
    />
  );
  const renderOffersBody = (v: {
    product: { name: string; slug: string };
    offers: typeof offers;
    priceHistory: typeof priceHistory;
    radarSignal: typeof radarSignal;
    emptyText: string;
  }) => (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <span className="rate-eyebrow text-muted d-block mb-1">
            {t('offersEyebrow')}
          </span>
          <h2 className="h4 fw-bold d-flex align-items-center mb-0 gap-2">
            <BsShieldCheck aria-hidden="true" />{' '}
            {t('offersTitle', { count: v.offers.length })}
          </h2>
        </div>
        <span className="badge bg-light text-secondary rounded-pill border px-3 py-2">
          {t('offersMedianBadge')}
        </span>
      </div>

      {v.offers.length === 0 ? (
        <p className="text-muted mb-0">{v.emptyText}</p>
      ) : (
        <ProductOffersExplorer
          productName={v.product.name}
          productSlug={v.product.slug}
          offers={v.offers}
          byOffer={v.priceHistory.byOffer}
          radarSignal={v.radarSignal}
        />
      )}
    </>
  );
  const pageEmptyOffersText = saleStateKey
    ? tSale(`${saleStateKey}Hint`)
    : t('noOffersYet');
  const variantPanelInput = (v: ItemPageVariant) => ({
    product: v.product,
    offers: v.offers,
    priceHistory: v.priceHistory,
    radarSignal: v.radarSignal,
    minPrice: productMarketStats(v.product).minPrice,
    emptyText:
      v.product.id === product.id ? pageEmptyOffersText : t('noOffersYet'),
  });
  // The price strip of one size: price, range, all-time low, price watch and
  // the share card; an Item page renders it once per size (#1154).
  const renderPriceStrip = (v: {
    product: typeof product;
    offers: typeof offers;
    priceHistory: typeof priceHistory;
    radarSignal: typeof radarSignal;
    stats: typeof marketStats;
    saleState: typeof saleState;
    saleStateKey: typeof saleStateKey;
  }) => (
    <div className="rounded-4 bg-light mb-2 border p-3">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
        <div>
          <div className="text-muted small">
            {t('priceReferenceLabel', { count: v.stats.sellerCount })}
          </div>
          <div className="fw-bold text-dark rate-tabular fs-5">
            {v.stats.minPrice > 0 ? (
              `${v.stats.minPrice.toLocaleString('vi-VN')} ₫`
            ) : v.saleStateKey ? (
              <span data-sale-state={v.saleState}>{tSale(v.saleStateKey)}</span>
            ) : (
              t('priceNoneInStock')
            )}
            {v.stats.minPrice > 0 && v.stats.minPrice !== v.stats.maxPrice && (
              <span className="small fw-normal text-muted ms-2">
                ~ {v.stats.maxPrice.toLocaleString('vi-VN')} ₫
              </span>
            )}
            {v.priceHistory.lowestEverPrice != null && (
              <span className="badge bg-success-subtle text-success fw-normal ms-2">
                {t('allTimeLowBadge', {
                  price: v.priceHistory.lowestEverPrice.toLocaleString('vi-VN'),
                })}
              </span>
            )}
          </div>
        </div>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <PriceWatchButton
            slug={v.product.slug}
            name={v.product.name}
            brand={v.product.brand}
            categoryPath={categoryBasePath}
            thumbnail={productImageUrl(v.product)}
            currentMinPrice={v.stats.minPrice}
            size="sm"
          />
          <a
            href="#price-history-section"
            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
          >
            {t('auditPriceBtn', { count: v.offers.length })}
          </a>
          <ProductShareAuditButton
            name={v.product.name}
            brand={v.product.brand}
            modelKey={v.product.model_key}
            userScore5={Number(displayUserRating.toFixed(2))}
            expertScore10={expertRating10}
            authenticReviews={authenticCount}
            minPriceVnd={v.stats.minPrice}
            offerCount={v.stats.sellerCount}
            keySpecLine={keySpecLine}
            radarSignal={v.radarSignal}
          />
        </div>
      </div>
    </div>
  );
  const variantStripInput = (v: ItemPageVariant) => {
    const inStock = v.offers.filter((o) => !isOfferUnavailable(o));
    const stats = productMarketStats(v.product);
    const sizeSaleState = masterSaleState({
      minPrice: stats.minPrice,
      listingCount: listingCountForSaleState(v.offers.length, inStock.length),
      metadata: v.product.metadata,
      availabilityStatus: (v.product.specifications as ProductSpecifications)
        ?.availability?.status,
    });
    return {
      product: v.product,
      offers: v.offers,
      priceHistory: v.priceHistory,
      radarSignal: v.radarSignal,
      stats,
      saleState: sizeSaleState,
      saleStateKey:
        sizeSaleState === 'on_sale' ? null : saleStateLabelKey(sizeSaleState),
    };
  };
  const defaultVariantKey =
    renderedSize?.variant.variant_key ??
    (itemRoute?.kind === 'render' ? itemRoute.variantKey : '');
  // An Item with many sizes (above 4, or about 150 KB of other sizes' data)
  // renders only its default size here; the others load when picked, from a
  // cached route, so the payload does not grow with every size (#1285).
  const defaultSize = itemVariants.find(
    (v) => v.variant.variant_key === defaultVariantKey
  );
  const lazySizes =
    isItemGroup &&
    defaultSize !== undefined &&
    shouldLazyLoadSizes(
      itemVariants.length,
      itemSizePanelBytes(itemVariants.filter((v) => v !== defaultSize))
    );
  const sizeSlugs = Object.fromEntries(
    itemVariants.map((v) => [v.variant.variant_key, v.variant.slug])
  );
  const sizeStripContext = {
    categoryPath: categoryBasePath,
    userScore5: Number(displayUserRating.toFixed(2)),
    expertScore10: expertRating10,
    authenticReviews: authenticCount,
    keySpecLine,
  };
  const renderSizePanels = (
    kind: ItemSizePanelKind,
    render: (v: ItemPageVariant) => React.ReactNode
  ) =>
    lazySizes && defaultSize ? (
      <ItemLazySizePanel
        kind={kind}
        defaultKey={defaultVariantKey}
        defaultNode={render(defaultSize)}
        slugs={sizeSlugs}
        context={sizeStripContext}
      />
    ) : (
      <ItemVariantPanels
        defaultKey={defaultVariantKey}
        panels={itemVariants.map((v) => ({
          key: v.variant.variant_key,
          node: render(v),
        }))}
      />
    );

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
                {displayName}
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
                {product.variant_name && !isItemGroup && (
                  <>
                    {product.brand || product.has_5g ? ' · ' : ''}
                    <ContentText text={product.variant_name} locale={locale} />
                  </>
                )}
              </p>

              <h1 className="h2 fw-bold text-dark mb-2">{displayName}</h1>
              {/* Price in the first screen on phones, ahead of the scoreboard
            (DOS/Rate#605); the full price strip stays further down. */}
              {heroStats.minPrice > 0 && heroStats.sellerCount > 0 && (
                <p className="rate-pdv-price-line mb-3">
                  {t.rich('heroPriceLine', {
                    price: heroMinPriceFormatted,
                    count: heroStats.sellerCount,
                    strong: (chunks) => (
                      <strong className="rate-tabular">{chunks}</strong>
                    ),
                  })}
                </p>
              )}
              {isItemGroup && (
                <ItemVariantPicker
                  label={t('itemVariantLabel')}
                  defaultKey={defaultVariantKey}
                  options={itemVariants.map((v) => {
                    const stats = productMarketStats(v.product);
                    return {
                      key: v.variant.variant_key,
                      label: itemVariantLabel(v.variant),
                      priceLabel:
                        stats.minPrice > 0
                          ? t('itemVariantPrice', {
                              price: stats.minPrice.toLocaleString('vi-VN'),
                            })
                          : t('itemVariantNoPrice'),
                    };
                  })}
                />
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
                        text={localizeSpecValue(
                          specs?.design?.resistance || specs?.design?.materials,
                          locale
                        )}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Neutral Market Price Reference Strip (De-commercialized per DESIGN.md v3.0) */}
              {isItemGroup
                ? renderSizePanels('strip', (v) =>
                    renderPriceStrip(variantStripInput(v))
                  )
                : renderPriceStrip({
                    product,
                    offers,
                    priceHistory,
                    radarSignal,
                    stats: marketStats,
                    saleState,
                    saleStateKey,
                  })}

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
            // Rows with no value and groups with no row are left out
            // (DOS/Rate#1186).
            const specGroups = buildProductSpecGroups({
              specs,
              keySpecs,
              product,
              template: specTemplate,
              ui: specUi,
              locale,
            });
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
                      categorySlug={categorySlug}
                      radarSignal={radarSignal}
                    />
                    <span className="badge bg-dark-subtle text-dark rounded-pill px-3 py-2">
                      {specSectionBadge(specUi, specGroups.length)}
                    </span>
                  </div>
                </div>

                <PhoneCollapsible
                  className="row g-4"
                  showMoreLabel={t('specsShowAll')}
                  showLessLabel={t('specsShowLess')}
                  openOnHash="#specs-section"
                  collapsible={specGroups.length > 3}
                >
                  {specGroups.map(({ group, rows }, i) => (
                    <div key={group} className="col-md-6 col-12">
                      <div className="rounded-4 h-100 border bg-white p-4">
                        <h3 className="h6 fw-bold text-primary mb-3">
                          {specGroupHeading(
                            specUi,
                            group,
                            i + 1,
                            specTemplate.has5g
                          )}
                        </h3>
                        <dl className="row small mb-0">
                          {rows.map(({ label, value }) => (
                            <Fragment key={label}>
                              <dt className="text-muted col-5">{label}</dt>
                              <dd className="fw-medium col-7">
                                <ContentText text={value} locale={locale} />
                              </dd>
                            </Fragment>
                          ))}
                        </dl>
                      </div>
                    </div>
                  ))}
                </PhoneCollapsible>
              </div>
            );
          })()}

          {/* SECTION #3: Time-Series Price History Chart, Fake Discount Detector & Neutral Merchant Audit */}
          {isItemGroup
            ? renderSizePanels('history', (v) =>
                renderPriceHistory(variantPanelInput(v))
              )
            : renderPriceHistory({
                product,
                priceHistory,
                minPrice: currentMinPrice,
                radarSignal,
              })}

          {/* Neutral Merchant Reference & Trust Audit Table */}
          <div
            id="offers-table"
            className="card rounded-4 p-md-5 mt-4 mb-5 border-0 p-4 shadow-sm"
          >
            {isItemGroup
              ? renderSizePanels('offers', (v) =>
                  renderOffersBody(variantPanelInput(v))
                )
              : renderOffersBody({
                  product,
                  offers,
                  priceHistory,
                  radarSignal,
                  emptyText: pageEmptyOffersText,
                })}
          </div>

          {/* Listings whose size is not stated: their own group, never part
              of the "from" price (Q2, DOS/Rate#1154). */}
          {itemPage && itemPage.unknownOffers.length > 0 && (
            <div
              id="offers-unknown-size"
              className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm"
              data-testid="pdv-unknown-size-offers"
            >
              <h2 className="h5 fw-bold mb-1">
                {t('unknownSizeTitle', {
                  count: itemPage.unknownOffers.length,
                })}
              </h2>
              <p className="text-muted small mb-3">{t('unknownSizeNote')}</p>
              <ProductOffersExplorer
                productName={displayName}
                productSlug={itemPage.item.slug}
                offers={itemPage.unknownOffers}
                byOffer={itemPage.unknownByOffer}
              />
            </div>
          )}

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
                maxPriceVnd={marketStats.maxPrice}
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
                                srcSet={
                                  deviceImageSrcSet(peerThumb) ?? undefined
                                }
                                // 68 px box less padding and border.
                                sizes="50px"
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
                            href={versusHref(product.slug, peer.slug)}
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
