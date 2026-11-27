import type { Metadata } from 'next';
import { isReviewFormV2Enabled } from '@/lib/review-form-v2';
import { Fragment } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { buildWatchlistComboHref } from '@/lib/combo-cart-links';
import { IntentLink } from '@/components/elementary/IntentLink';
import InfoTip from '@/components/elementary/InfoTip';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  getCachedCategorySlugById,
  resolveItemRoute,
} from '@/server/rate/item-route';
import {
  itemSizePanelBytes,
  loadItemPageContext,
  pickRenderedSize,
  type ItemPageVariant,
} from '@/server/rate/item-page';
import {
  buildItemProductGroupNode,
  buildPeerCompareLink,
  buildPeerItemSlugMap,
  isPeerItemGroupingDegraded,
  itemVariantLabel,
  itemFromStats,
  resolveCanonicalPeerSlug,
  resolvePeerVersusHref,
  withoutCurrentItemPeers,
} from '@/lib/item-page';
import ItemVariantPicker from '@/components/product/item/ItemVariantPicker';
import ItemVariantPanels from '@/components/product/item/ItemVariantPanels';
import ItemLazySizePanel, {
  type ItemSizePanelKind,
} from '@/components/product/item/ItemLazySizePanel';
import { shouldLazyLoadSizes } from '@/lib/item-size-panel';
import {
  getCachedMasterProductBySlug,
  getCachedPublishedMasterProductCategory,
  getCachedMasterProductOffers,
  getCachedMasterProductPoints,
  getCachedMasterProductPriceHistory,
  getCachedMasterPlaceDetail,
  getCachedPlaceBranchSiblings,
  getCachedMasterProductReviewsPage,
  getCachedMasterProductReviewStarCounts,
  getCachedMasterProductReviewSummary,
  getCachedMasterProductSiblings,
  getCachedMasterProducts,
  getCachedPopulatedCategorySlugs,
  groupCatalogRowsByItemWithStatus,
  computeProductRadarSignal,
} from '@/server/rate';
import { computeBayesianRatingSummary } from '@/lib/rate-api';
import {
  normalizeCompareFiveStarRating,
  resolveCompareEffectiveUserRating,
  resolveStoredRatingScore,
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
  BsBank,
  BsBoxSeam,
  BsBuilding,
  BsCapsule,
  BsCardChecklist,
  BsCheckCircleFill,
  BsCreditCard2Front,
  BsCupHot,
  BsDroplet,
  BsEarbuds,
  BsForkKnife,
  BsHeartPulse,
  BsHouseHeart,
  BsHospital,
  BsMortarboard,
  BsPersonArmsUp,
  BsLaptop,
  BsPhone,
  BsShieldCheck,
  BsShieldExclamation,
  BsSmartwatch,
  BsSnow,
  BsStars,
  BsTabletLandscape,
  BsTv,
  BsWifi,
  BsWind,
} from 'react-icons/bs';
import RadarBadge from '@/components/radar/RadarBadge';
import { getRadarSignal, type RadarIndex } from '@/lib/deal-radar';
import { startRenderTiming } from '@/lib/render-timing';
import { bayesianTierKey, radarExplanation } from '@/lib/product-detail-copy';
import {
  absoluteUrl,
  buildOgTruthCardImage,
  defaultOpenGraph,
  defaultTwitterCard,
  fitTitle,
  fitDescription,
} from '@/lib/seo';
import JReviewsSection from '@/components/reviews/JReviewsSection';
import PhoneCollapsible from '@/components/product/PhoneCollapsible';
import ProductVariantLinks from '@/components/product/ProductVariantLinks';
import {
  buildProductVariantLinks,
  siblingsInCategory,
} from '@/lib/product-variant-links';
import PriceHistorySection from '@/components/price-history/PriceHistorySection';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import PageShell from '../../components/page-shell';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';

import { normalizeRateLocale } from '@/lib/rate-i18n';
import {
  getSpecUiDictionary,
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
import {
  deviceImageCredit,
  deviceImageJsonLd,
  deviceImageSizesForHeight,
  deviceImageSrcSet,
} from '@/lib/device-images';
import ProductLeaderboardBadges from '@/components/leaderboard/ProductLeaderboardBadges';
import ProductShareAuditButton from '@/components/leaderboard/ProductShareAuditButton';
import ProductValueCalculator from '@/components/leaderboard/ProductValueCalculator';
import ProductOffersExplorer from '@/components/leaderboard/ProductOffersExplorer';
import ProductSpecsExportToolbar from '@/components/leaderboard/ProductSpecsExportToolbar';
import PlaceDetailsSection from '@/components/product/PlaceDetailsSection';
import {
  buildPlaceStructuredData,
  extractPlaceDisplayFacts,
  formatPlaceReferencePriceRange,
} from '@/lib/place-details';
import { pickEffectivePriceCandidates } from '@/lib/effective-price';
import ClientMessages from '@/components/providers/ClientMessages';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  getRatingCriteria,
  getRatingCriterionLabel,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  productMarketStats,
} from '@/lib/product-market-stats';
import {
  firstImageUrl,
  foreignCategoryProductHref,
  isCanonicalCategorySlug,
  isPlaceCategorySlug,
  isServiceCategorySlug,
  isWaveE3CategorySlug,
  resolveListingPriceCurrency,
  usableImageUrls,
  productImageUrl,
  storeImageSrcSet,
} from '@/lib/rate-domain-core';
import {
  formatDecimal,
  formatListingPrice,
  formatNumber,
  formatPercent,
  hasListingUnitSuffix,
} from '@/lib/locale-format';
import { displayedScore5, formatRatingValue } from '@/lib/rating-display';
import { catalogRowSlug } from '@/lib/item-directory';
import { isParseableVersusPair } from '@/lib/item-compare';
import StarRating from '@/components/elementary/StarRating';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

// The `sizes` of a store CDN hero image, whose aspect is not known: the hero
// column's width (col-lg-5, the full row below lg), so a landscape photo keeps
// the width it had without a srcSet. A square one is capped at 350 px tall
// (190 px on phones) and gets a little more than it shows (DOS/Rate#1417).
const STORE_HERO_SIZES =
  '(max-width: 767.98px) calc(100vw - 56px), (max-width: 991.98px) 690px, (max-width: 1199.98px) 360px, (max-width: 1399.98px) 430px, 480px';

// Nothing is prerendered at build; each slug renders on its first request.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export type PageParams = Promise<{ locale: string; slug: string }>;

/**
 * Master-product route: the product's own URL when it was asked for under
 * another category's path, else null (DOS/Rate#1366; the Item route has its
 * own check, #1281). When the category map cannot be read the page renders
 * as asked rather than guess a category.
 */
async function foreignCategoryHref(
  product: Parameters<typeof foreignCategoryProductHref>[0],
  categoryBasePath: string
): Promise<string | null> {
  let categorySlugById: ReadonlyMap<string, string>;
  try {
    categorySlugById = await getCachedCategorySlugById();
  } catch {
    return null;
  }
  return foreignCategoryProductHref(
    product,
    categoryBasePath,
    categorySlugById
  );
}

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
  // A product under another category's path 308s to its own; that URL is
  // the canonical (DOS/Rate#1366).
  const ownHref = itemRoute
    ? null
    : await foreignCategoryHref(product, categoryBasePath);
  if (ownHref) {
    return { alternates: { canonical: `https://rate.vn${ownHref}` } };
  }
  // The stored stats, like every other page shows (DOS/Rate#1141). An Item
  // URL is the Item: its name and the "from" price over its sizes (#1154).
  const itemMeta = itemRoute?.kind === 'render' ? itemRoute.item : null;
  const isItemGroup = (itemPage?.variants.length ?? 0) > 1;
  const marketStats =
    itemPage && isItemGroup
      ? itemFromStats(itemPage.variants.map((v) => v.product))
      : productMarketStats(product);
  const metaPlaceDetail =
    product.entity_type === 'place'
      ? await getCachedMasterPlaceDetail(product.id).catch(() => null)
      : null;
  const metaMinPriceVal =
    marketStats.minPrice > 0
      ? marketStats.minPrice
      : (metaPlaceDetail?.price_min ?? 0);
  const hasPrice = metaMinPriceVal > 0;
  const name = (isItemGroup ? itemMeta?.name : null) || product.name;
  const metaCategorySlug = categoryBasePath.replace(/^\/+/, '');
  const metaCurrency = resolveListingPriceCurrency({
    master: product,
    categorySlug: metaCategorySlug,
  });
  const metaHasUnitSuffix = hasListingUnitSuffix(
    metaCurrency,
    metaCategorySlug,
    metaPlaceDetail?.price_unit
  );
  const minPrice = metaHasUnitSuffix
    ? formatListingPrice(metaMinPriceVal, metaCurrency, locale, {
        categorySlug: metaCategorySlug,
        priceUnit: metaPlaceDetail?.price_unit,
      })
    : formatNumber(metaMinPriceVal, locale);
  const canonicalSlug =
    itemRoute?.kind === 'render' ? itemRoute.itemSlug : product.slug;
  const canonicalUrl = `https://rate.vn${categoryBasePath}/${canonicalSlug}`;
  const ogImage = buildOgTruthCardImage({
    type: 'product',
    slug: canonicalSlug,
    locale: lang,
    alt: name,
  });

  return {
    // The product name first; the site name, then the price give way to fit
    // a search result (DOS/Rate#782). No "from 0 ₫" without a price.
    title: fitTitle(
      [
        ...(hasPrice
          ? [
              t(metaHasUnitSuffix ? 'metaTitleCurrency' : 'metaTitle', {
                name,
                minPrice,
              }),
              t(
                metaHasUnitSuffix ? 'metaTitleShortCurrency' : 'metaTitleShort',
                { name, minPrice }
              ),
            ]
          : []),
        `${name} | Rate.vn`,
        name,
      ],
      undefined,
      locale
    ),
    description: fitDescription(
      hasPrice
        ? t('metaDesc', {
            name,
            brand: product.brand,
            merchantCount: marketStats.sellerCount,
          })
        : t('metaDescNoStock', { name, brand: product.brand }),
      locale
    ),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(lang),
      title: t('ogTitle', { name }),
      description: hasPrice
        ? t(metaHasUnitSuffix ? 'ogDescCurrency' : 'ogDesc', {
            minPrice,
          })
        : t('ogDescNoStock'),
      url: canonicalUrl,
      images: [ogImage],
    },
    twitter: defaultTwitterCard(ogImage),
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
  const timing = startRenderTiming('product', slug);
  const categorySlug = categoryBasePath.replace(/^\//, '') || 'smartphones';
  // RATE_ITEM_MODEL on: an old variant URL 308s to its Item URL with `?v=`,
  // and an Item URL renders its selected variant until the Item page ships
  // (Q1, DOS/Rate#1153, #1154). Off: null, and the page is as before.
  const itemRoute = await timing.time(
    'itemRoute',
    resolveItemRoute({ slug, categoryBasePath })
  );
  if (itemRoute?.kind === 'redirect') {
    timing.done();
    permanentRedirect(itemRoute.to);
  }
  // Neither a published Item nor a variant of one: no fallback to the old
  // master lookup, which would show a variant of an unpublished Item.
  if (itemRoute?.kind === 'not_found') {
    timing.done();
    notFound();
  }
  // The category peers depend on nothing below: read them alongside the item
  // and product reads instead of after them (DOS/Rate#1344). No fallback:
  // this page is cached, so an empty fallback would be served for the whole
  // revalidate window, and a failed regeneration keeps the last good page
  // instead (DOS/Rate#491). The rejection is handled where it is awaited.
  const peersRead = timing.time(
    'peers',
    getCachedMasterProducts({ categorySlug, limit: 50 })
  );
  peersRead.catch(() => undefined);
  // RATE_ITEM_MODEL on and an Item URL: every size's offers and history, and
  // the listings whose size is not stated (#1154). Null otherwise. A size
  // whose read failed is left out, and the page renders a size that loaded.
  const itemPage =
    itemRoute?.kind === 'render' && itemRoute.variants.length > 0
      ? await timing.time(
          'itemPage',
          loadItemPageContext(itemRoute.item, itemRoute.variants)
        )
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
    timing.time('product', getCachedMasterProductBySlug(productSlug)),
  ]);

  if (!storedProduct) {
    timing.done();
    notFound();
  }
  const isPlace = storedProduct.entity_type === 'place';
  // This product's offers and reviews depend only on its id: start them
  // alongside the category check below rather than after it (DOS/Rate#1344).
  // The rejection is handled where they are awaited; a redirect leaves them
  // unused.
  const offersRead = timing.time(
    'offers',
    getCachedMasterProductOffers(storedProduct.id)
  );
  const reviewPageRead = timing.time(
    'reviews',
    getCachedMasterProductReviewsPage(storedProduct.id)
  );
  const reviewStarCountsRead = timing.time(
    'reviewStarCounts',
    getCachedMasterProductReviewStarCounts(storedProduct.id)
  );
  const productPointsRead = timing.time(
    'productPoints',
    getCachedMasterProductPoints(
      storedProduct.id,
      storedProduct.slug,
      categorySlug
    )
  );
  const placeDetailRead = isPlace
    ? timing.time('placeDetail', getCachedMasterPlaceDetail(storedProduct.id))
    : Promise.resolve(null);
  const placeBranchesRead = placeDetailRead.then((detail) =>
    detail?.branch_group_key
      ? getCachedPlaceBranchSiblings(detail.branch_group_key, storedProduct.id)
      : []
  );
  placeDetailRead.catch(() => undefined);
  placeBranchesRead.catch(() => undefined);
  offersRead.catch(() => undefined);
  reviewPageRead.catch(() => undefined);
  reviewStarCountsRead.catch(() => undefined);
  productPointsRead.catch(() => undefined);
  // The other variants of this model, linked under the price where the
  // quick-spec cards used to be; Item routes (flag on) keep the #1154 size
  // picker instead. Cached per model and bounded. A failure fails the render
  // like the reads beside it, so ISR keeps the last good page (DOS/Rate#1436).
  const siblingsRead =
    isPlace || itemRoute
      ? Promise.resolve([])
      : timing.time(
          'siblings',
          getCachedMasterProductSiblings(storedProduct.model_key).then(
            async (rows) =>
              rows.length === 0
                ? rows
                : siblingsInCategory(
                    rows,
                    categorySlug,
                    await getCachedCategorySlugById()
                  )
          )
        );
  siblingsRead.catch(() => undefined);
  // Master-product route: a product asked for under another category's path
  // goes to its own (DOS/Rate#1366).
  if (!itemRoute) {
    const ownHref = await timing.time(
      'categorySlug',
      foreignCategoryHref(storedProduct, categoryBasePath)
    );
    if (ownHref) permanentRedirect(ownHref);
  }
  const itemVariants = itemPage?.variants ?? [];
  const isItemGroup = itemVariants.length > 1;

  // Each category shows only the spec groups and fields it has: earbuds have
  // no screen, RAM or camera, watches no 5G (DOS/Rate#1142).
  const specTemplate = getCategorySpecTemplate(categorySlug);
  const product = applyCategorySpecTemplate(categorySlug, storedProduct);
  const localizedCategoryLabel = isCanonicalCategorySlug(categorySlug)
    ? tNav(categorySlug)
    : categoryLabel;
  // Three independent chains, each started as soon as its input is known:
  // offers -> price history, reviews -> review summary, and peers ->
  // competitors -> their offers. Awaited in one stage after the product read
  // rather than in two, so the competitors' offers no longer wait for this
  // product's offers and reviews (DOS/Rate#1344).
  const marketStats = productMarketStats(product);
  const currentMinPrice = marketStats.minPrice;
  const priceHistoryRead: Promise<
    import('@/lib/rate-api').MasterProductPriceHistorySummary
  > = isPlace
    ? Promise.resolve({
        points: [],
        byOffer: {},
        lowestEverPrice: null,
        lowestEverDate: null,
        lowestEverMerchant: null,
        highestEverPrice: null,
        currentMinPrice: null,
        fakeDiscountCount: 0,
        genuineDealCount: 0,
      })
    : offersRead.then((offers) =>
        timing.time(
          'priceHistory',
          getCachedMasterProductPriceHistory(product.id, offers)
        )
      );
  const reviewSummaryRead = reviewPageRead.then((reviewPage) =>
    timing.time(
      'reviewSummary',
      getCachedMasterProductReviewSummary(product.id, reviewPage.reviews)
    )
  );
  const currentItemSlug =
    itemRoute?.kind === 'render' ? itemRoute.itemSlug : null;
  const currentSiblingSlugs = [
    ...(itemRoute?.kind === 'render'
      ? itemRoute.variants.map((v) => v.slug)
      : []),
    ...itemVariants.map((v) => v.variant.slug),
    ...itemVariants.map((v) => v.product.slug),
  ];
  const currentSiblingIds = [
    ...(itemRoute?.kind === 'render'
      ? itemRoute.variants.map((v) => v.id)
      : []),
    ...itemVariants.map((v) => v.variant.id),
    ...itemVariants.map((v) => v.product.id),
  ];
  const competitorsRead = peersRead.then(async (storedCategoryPeers) => {
    // RATE_ITEM_MODEL on: group category peers into one row per Item and drop
    // the current Item's sizes before standing and competitor rankings (#1819).
    // Preserve degraded status when peer Item links fail so mixed Item-vs-raw
    // 1v1 links are suppressed (#1834).
    const {
      rows: groupedCategoryPeers,
      itemModelActive: peerItemModelActive,
      degraded: peerGroupingDegraded,
    } = await groupCatalogRowsByItemWithStatus(storedCategoryPeers);
    const peerItemLinksDegraded = isPeerItemGroupingDegraded({
      currentItemSlug,
      itemModelActive: peerItemModelActive,
      degraded: peerGroupingDegraded,
    });
    const categoryPeers = withoutCurrentItemPeers(
      groupedCategoryPeers.map((peer) =>
        applyCategorySpecTemplate(categorySlug, peer)
      ),
      {
        productId: product.id,
        productSlug: product.slug,
        itemSlug: currentItemSlug,
        siblingSlugs: currentSiblingSlugs,
        siblingIds: currentSiblingIds,
      }
    );
    // "From" price: the stored stats every other page shows (in-stock
    // listings, no bait prices), not the offer list (DOS/Rate#1141).
    const relatedCompetitors = rankRelatedCompetitors(
      categoryPeers,
      product.slug,
      currentMinPrice
    );
    // Each competitor card's radar badge comes from that product's own
    // offers, as this product's signal does (DOS/Rate#1344).
    const readPeerOffers = () =>
      Promise.all(
        relatedCompetitors.map((peer) => getCachedMasterProductOffers(peer.id))
      );
    const competitorOffers = isPlace
      ? relatedCompetitors.map(() => [])
      : await timing.time('competitorOffers', readPeerOffers());
    return {
      categoryPeers,
      relatedCompetitors,
      competitorOffers,
      peerItemLinksDegraded,
    };
  });
  const [
    offers,
    reviewPage,
    reviewStarCounts,
    productPointsData,
    priceHistory,
    reviewSummary,
    {
      categoryPeers,
      relatedCompetitors,
      competitorOffers,
      peerItemLinksDegraded,
    },
    siblings,
    populatedCategorySlugs,
    placeDetail,
    placeBranches,
  ] = await Promise.all([
    offersRead,
    reviewPageRead,
    reviewStarCountsRead,
    productPointsRead,
    priceHistoryRead,
    reviewSummaryRead,
    competitorsRead,
    siblingsRead,
    timing.time('populatedCategories', getCachedPopulatedCategorySlugs()),
    placeDetailRead,
    placeBranchesRead,
  ]);
  const reviews = reviewPage.reviews;
  timing.done();
  // With review form v2 on, the category the RPC rates (DOS/Rate#1544).
  const reviewCategory = isReviewFormV2Enabled()
    ? await getCachedPublishedMasterProductCategory(product.id)
        .then((r) => r.category)
        .catch(() => null)
    : null;
  const variantLinks = itemRoute
    ? null
    : buildProductVariantLinks(product, siblings);
  const peerRadarIndex: RadarIndex = new Map(
    relatedCompetitors.map((peer, i) => [
      peer.slug,
      computeProductRadarSignal(
        peer,
        (competitorOffers[i] ?? []).filter((o) => !isOfferUnavailable(o))
      ),
    ])
  );

  // A sold-out listing's last price is no deal (DOS/Rate#1141).
  const inStockOffers = offers.filter((o) => !isOfferUnavailable(o));
  const radarSignal = computeProductRadarSignal(product, inStockOffers);
  const radarNote = radarExplanation(radarSignal, locale);

  const leaderboardBadges = computeProductStandingInCategory(
    product,
    categoryPeers
  );
  // The Item page's name and "from" price span its sizes.
  const displayName = itemPage?.item.name || product.name;
  const heroStats = isItemGroup
    ? itemFromStats(itemVariants.map((v) => v.product))
    : marketStats;

  const specs = product.specifications as ProductSpecifications;
  const keySpecs = product.key_specs as KeySpecs;
  const sellerCount = marketStats.sellerCount;
  const effectiveCurrency = resolveListingPriceCurrency({
    categorySlug,
    currency: offers[0]?.currency,
    metadata: product.metadata,
  });
  const effectivePriceUnit = placeDetail?.price_unit ?? null;
  const effectiveHasUnitSuffix = hasListingUnitSuffix(
    effectiveCurrency,
    categorySlug,
    effectivePriceUnit
  );
  const heroResolvedMinPrice =
    isPlace && heroStats.minPrice <= 0
      ? (placeDetail?.price_min ?? 0)
      : heroStats.minPrice;
  const showPlaceDetails =
    isPlace &&
    extractPlaceDisplayFacts({
      placeDetail,
      branches: placeBranches,
      categorySlug,
      locale,
      fallbackPriceMin: marketStats.minPrice,
      fallbackPriceMax: marketStats.maxPrice,
    }).hasPlaceFacts;
  const heroPlacePriceFormatted = isPlace
    ? formatPlaceReferencePriceRange({
        priceMin:
          heroStats.minPrice > 0
            ? heroStats.minPrice
            : (placeDetail?.price_min ?? null),
        priceMax:
          heroStats.maxPrice > 0
            ? heroStats.maxPrice
            : (placeDetail?.price_max ?? null),
        categorySlug,
        priceUnit: effectivePriceUnit,
        locale,
      })
    : null;
  const heroMinPriceFormatted = effectiveHasUnitSuffix
    ? formatListingPrice(heroResolvedMinPrice, effectiveCurrency, locale, {
        categorySlug,
        priceUnit: effectivePriceUnit,
      })
    : formatNumber(heroResolvedMinPrice, locale);
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
  // The headline is the stored rating every other page shows (D3); the
  // review list only gives the confidence tag and the counts.
  const storedRating = resolveStoredRatingScore(product);
  const displayUserRating =
    storedRating > 0
      ? storedRating
      : bayesianSummary.effectiveWeightSum > 0
        ? bayesianSummary.bayesianRating
        : rawUserRating;

  const keySpecLine = buildKeySpecLine(product, categorySlug);
  const mainImage = firstImageUrl(product.images);
  // The hero's sized copies: the local WebP renditions of a device photo, or
  // a store CDN's own resized copies (#1413, #1417). The box caps the photo
  // at 350 px tall, 190 px on phones (_product.scss).
  const heroDeviceSrcSet = deviceImageSrcSet(mainImage);
  const heroStoreSrcSet = heroDeviceSrcSet ? null : storeImageSrcSet(mainImage);
  const heroSrcSet = heroDeviceSrcSet ?? heroStoreSrcSet ?? undefined;
  // A licensed photo is shown with its notice (DOS/Rate#1756).
  const heroCredit = deviceImageCredit(mainImage);
  const heroSizes = heroDeviceSrcSet
    ? deviceImageSizesForHeight(mainImage, { phone: 190, other: 350 })
    : heroStoreSrcSet
      ? STORE_HERO_SIZES
      : undefined;

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
          ratingValue: displayedScore5(displayUserRating),
          reviewCount: authenticCount,
          bestRating: 5,
          worstRating: 1,
        }
      : null;
  // Both Product and ProductGroup nodes name a credited photo's licence (#1756, #1819).
  const toProductJsonLdImages = (
    rawImages: Parameters<typeof usableImageUrls>[0]
  ) =>
    usableImageUrls(rawImages).map((src) =>
      deviceImageJsonLd(src, absoluteUrl(src))
    );
  const jsonLdProductImages = toProductJsonLdImages(product.images);
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
          images: jsonLdProductImages,
          variants: itemVariants.map((v) => {
            const stats = productMarketStats(v.product);
            const variantImages = toProductJsonLdImages(v.product.images);
            return {
              variantKey: v.variant.variant_key,
              label: itemVariantLabel(v.variant),
              minPrice: stats.minPrice,
              maxPrice: stats.maxPrice,
              sellerCount: stats.sellerCount,
              ...(variantImages.length > 0 ? { images: variantImages } : {}),
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
      isPlace
        ? buildPlaceStructuredData({
            name: displayName,
            categorySlug,
            canonicalUrl,
            imageUrl: mainImage ? absoluteUrl(mainImage) : null,
            description: productDescription,
            placeDetail,
            ratingValue: displayUserRating,
            ratingCount: authenticCount,
          })
        : (itemGroupNode ?? {
            '@type': 'Product',
            name: product.name,
            brand: {
              '@type': 'Brand',
              name: product.brand,
            },
            sku: product.model_key,
            url: canonicalUrl,
            description: productDescription,
            ...(jsonLdProductImages.length > 0
              ? { image: jsonLdProductImages }
              : {}),
            // Only with a buyable VND price: a lowPrice of 0 or PCT rate is not a VND offer.
            ...(currentMinPrice > 0 && effectiveCurrency === 'VND'
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
          }),
    ],
  };

  // Neutral Market Price Reference Strip targets
  const renderPriceHistory = (v: {
    product: { name: string };
    offers: typeof offers;
    priceHistory: typeof priceHistory;
    minPrice: number;
    radarSignal: typeof radarSignal;
  }) => (
    <PriceHistorySection
      productName={v.product.name}
      categorySlug={categorySlug}
      currency={resolveListingPriceCurrency({
        categorySlug,
        currency: v.offers[0]?.currency ?? effectiveCurrency,
        metadata: product.metadata,
      })}
      // Its "current lowest" is the page's "from" price (DOS/Rate#1141).
      history={{
        ...v.priceHistory,
        currentMinPrice: v.minPrice > 0 ? v.minPrice : null,
      }}
      radarSignal={v.radarSignal}
      offers={v.offers}
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
  }) => {
    if (isPlace && v.offers.length === 0) {
      return null;
    }
    return (
      <div className="rounded-4 bg-light mb-2 border p-3">
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
          <div>
            <div className="text-muted small">
              {t('priceReferenceLabel', { count: v.stats.sellerCount })}
            </div>
            <div className="fw-bold text-dark rate-tabular fs-5">
              {v.stats.minPrice > 0 ? (
                formatListingPrice(
                  v.stats.minPrice,
                  effectiveCurrency,
                  locale,
                  {
                    categorySlug,
                    priceUnit: effectivePriceUnit,
                  }
                )
              ) : v.saleStateKey ? (
                <span data-sale-state={v.saleState}>
                  {tSale(v.saleStateKey)}
                </span>
              ) : (
                t('priceNoneInStock')
              )}
              {v.stats.minPrice > 0 &&
                v.stats.minPrice !== v.stats.maxPrice && (
                  <span className="small fw-normal text-muted ms-2">
                    ~{' '}
                    {formatListingPrice(
                      v.stats.maxPrice,
                      effectiveCurrency,
                      locale,
                      { categorySlug, priceUnit: effectivePriceUnit }
                    )}
                  </span>
                )}
              {!isPlace &&
                v.priceHistory.lowestEverPrice != null &&
                v.priceHistory.lowestEverPrice > 0 && (
                  <span className="badge bg-success-subtle text-success fw-normal ms-2">
                    {effectiveHasUnitSuffix
                      ? t('allTimeLowBadgeCurrency', {
                          price: formatListingPrice(
                            v.priceHistory.lowestEverPrice,
                            effectiveCurrency,
                            locale,
                            { categorySlug, priceUnit: effectivePriceUnit }
                          ),
                        })
                      : t('allTimeLowBadge', {
                          price: formatNumber(
                            v.priceHistory.lowestEverPrice,
                            locale
                          ),
                        })}
                  </span>
                )}
            </div>
          </div>
          <div className="d-flex align-items-center flex-wrap gap-2">
            {v.stats.minPrice > 0 && (
              <PriceWatchButton
                slug={v.product.slug}
                name={v.product.name}
                brand={v.product.brand}
                categoryPath={categoryBasePath}
                thumbnail={productImageUrl(v.product)}
                currentMinPrice={v.stats.minPrice}
                currency={effectiveCurrency}
                priceUnit={effectivePriceUnit}
                size="sm"
              />
            )}
            {!isPlace && (
              <a
                href="#pdv-price-history"
                className="btn btn-sm btn-outline-secondary rounded-pill px-3"
              >
                {t('auditPriceBtn', { count: v.offers.length })}
              </a>
            )}
            <ProductShareAuditButton
              slug={v.product.slug}
              name={v.product.name}
              brand={v.product.brand}
              modelKey={v.product.model_key}
              userScore5={displayUserRating}
              expertScore10={expertRating10}
              authenticReviews={authenticCount}
              minPriceVnd={v.stats.minPrice}
              currency={effectiveCurrency}
              categorySlug={categorySlug}
              offerCount={v.stats.sellerCount}
              keySpecLine={keySpecLine}
              radarSignal={v.radarSignal}
            />
          </div>
        </div>
      </div>
    );
  };
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
    userScore5: displayUserRating,
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

  const peerItemSlugMap = buildPeerItemSlugMap(
    { slug: product.slug, itemSlug: currentItemSlug },
    relatedCompetitors
  );
  const hasMultipleRouteVariants =
    isItemGroup ||
    (itemRoute?.kind === 'render' && itemRoute.variants.length > 1);
  const currentCompareRow = {
    id: product.id,
    slug: product.slug,
    item_slug: currentItemSlug,
    ...(hasMultipleRouteVariants && defaultVariantKey
      ? { variant_key: defaultVariantKey }
      : {}),
  };
  const { count: currentCompareCount } = buildPeerCompareLink(
    categorySlug,
    [currentCompareRow],
    1
  );
  const { href: compareAllHref, count: compareAllCount } = buildPeerCompareLink(
    categorySlug,
    [currentCompareRow, ...relatedCompetitors],
    4
  );
  const topPeerForCombo = relatedCompetitors[0];
  const topPeerComboSlug = topPeerForCombo
    ? resolveCanonicalPeerSlug({
        slug: topPeerForCombo.slug,
        item_slug: catalogRowSlug(topPeerForCombo),
      }) || topPeerForCombo.slug
    : null;
  const comboCartHref = buildWatchlistComboHref(
    topPeerComboSlug ? [product.slug, topPeerComboSlug] : [product.slug],
    { minItems: 1 }
  );

  const validCriteriaReviews = reviews.filter(
    (r) => r.include_in_rating && r.helpfulness_weight > 0 && r.criteria_ratings
  );
  const effectiveCriteriaSlug = isCanonicalCategorySlug(reviewCategory)
    ? reviewCategory
    : categorySlug;
  const expertCrit = product.expert_criteria_scores || {};
  const avgCrit = (key: string): number | null => {
    const legacyKey =
      key === 'display'
        ? 'screen'
        : key === 'anc'
          ? 'camera'
          : effectiveCriteriaSlug === 'earbuds' && key === 'sound'
            ? 'screen'
            : null;
    const vals = validCriteriaReviews
      .map((r) =>
        Number(
          r.criteria_ratings?.[key] ??
            (legacyKey ? r.criteria_ratings?.[legacyKey] : undefined) ??
            0
        )
      )
      .filter((v) => v >= 1 && v <= 5);
    if (vals.length > 0) {
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const expVal = Number(
      (expertCrit as Record<string, unknown>)[key] ??
        (legacyKey
          ? (expertCrit as Record<string, unknown>)[legacyKey]
          : undefined) ??
        0
    );
    if (expVal > 0) {
      return expVal > 5 ? expVal / 2 : expVal;
    }
    return null;
  };
  const criteria = getRatingCriteria(effectiveCriteriaSlug).map((crit) => ({
    label: getRatingCriterionLabel(crit, locale),
    score: avgCrit(crit.key),
  }));
  const hasCriteriaScores = criteria.some((crit) => crit.score != null);
  const heroSellerCount =
    heroStats.sellerCount > 0 ? heroStats.sellerCount : offers.length;
  const singleVariantLabel =
    !isItemGroup && !variantLinks ? product.variant_name?.trim() || null : null;
  const productColors = Array.isArray(product.colors)
    ? product.colors.map((c) => c.trim()).filter(Boolean)
    : [];
  const hasVariantStrip = Boolean(
    variantLinks ||
    isItemGroup ||
    singleVariantLabel ||
    productColors.length > 0
  );
  const userScoreBox = (
    <div className={`rate-pdv-score${hasCriteriaScores ? '' : ' is-compact'}`}>
      <div className="rate-pdv-score-label is-user">
        {t('userWeightedScoreLabel')}
        <InfoTip
          label={t('scoreFilterInfoLabel')}
          text={t('scoreFilterInfo')}
          testId="pdv-score-filter-info"
        />
      </div>
      <div className="rate-pdv-score-row">
        <StarRating
          value={displayUserRating}
          count={
            displayUserRating > 0 && authenticCount > 0 ? authenticCount : null
          }
          size="lg"
          title={t('userScoreHint')}
          testId="pdv-user-score"
        />
      </div>
      <div
        className="rate-pdv-confidence"
        data-testid="pdv-bayesian-confidence"
      >
        <span
          className={`rate-pdv-tag is-${bayesianSummary.confidenceTier}`}
          title={
            bayesianSummary.effectiveWeightSum > 0
              ? `Σw=${formatDecimal(bayesianSummary.effectiveWeightSum, locale, 2)} · c=${formatPercent(Math.round(bayesianSummary.confidenceRatio * 100), locale)}`
              : undefined
          }
        >
          {t(bayesianTierKey(bayesianSummary))}
          {bayesianSummary.effectiveWeightSum > 0 && (
            <span className="visually-hidden">
              {' '}
              (Σw=
              {formatDecimal(bayesianSummary.effectiveWeightSum, locale, 2)}, c=
              {Math.round(bayesianSummary.confidenceRatio * 100)}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
  const expertScoreBox =
    expertRating10 != null ? (
      <div
        className={`rate-pdv-score is-expert${
          hasCriteriaScores ? '' : ' h-100'
        }`}
      >
        <div className="rate-pdv-score-label is-expert">
          {t('expertScoreLabel')}
        </div>
        <div className="rate-pdv-score-row" title={t('expertScoreHint')}>
          <span className="rate-pdv-score-value is-small">
            {formatDecimal(expertRating10, locale, 1)}
          </span>
          <span className="rate-pdv-score-sub">/10</span>
          <span className="visually-hidden">{t('expertScoreHint')}</span>
        </div>
      </div>
    ) : null;

  return (
    <ClientMessages scope="productDetail">
      <PageShell
        locale={locale}
        populatedCategorySlugs={populatedCategorySlugs}
      >
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
              <div className="card rate-pdv-media-card rounded-4 p-md-4 p-3 text-center">
                <div
                  className={`rate-pdv-media d-flex align-items-center justify-content-center${
                    mainImage ? ' is-studio' : ''
                  }`}
                >
                  {mainImage ? (
                    // The main product image is the page's largest paint: fetch it
                    // ahead of the below-the-fold peer and offer thumbnails.
                    // React emits a preload for it into the page payload, which a
                    // prefetch applies too, so it names sized copies (heroSrcSet):
                    // a prefetched page never pulls the full image (#1413, #1417).
                    <img
                      srcSet={heroSrcSet}
                      sizes={heroSizes}
                      src={mainImage}
                      alt={product.name}
                      fetchPriority="high"
                      className="img-fluid rounded-3"
                    />
                  ) : (
                    <div className="rate-pdv-noimage">
                      {t('noProductImage')}
                    </div>
                  )}
                </div>
                {heroCredit && (
                  <p className="small text-muted mt-2 mb-0">
                    {t.rich('imageCredit', {
                      author: heroCredit.author,
                      license: heroCredit.license,
                      name: (chunks) => (
                        <span lang={heroCredit.authorLang}>{chunks}</span>
                      ),
                      source: (chunks) => (
                        <a
                          href={heroCredit.sourceUrl}
                          rel="noopener noreferrer"
                          className="text-muted"
                        >
                          {chunks}
                        </a>
                      ),
                      licenseLink: (chunks) => (
                        <a
                          href={heroCredit.licenseUrl}
                          rel="noopener noreferrer license"
                          className="text-muted"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
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
              {heroStats.minPrice > 0 && heroStats.sellerCount > 0 ? (
                <p
                  className={`rate-pdv-price-line ${
                    hasVariantStrip ? 'mb-2' : 'mb-3'
                  }`}
                >
                  {t.rich(
                    effectiveHasUnitSuffix
                      ? 'heroPriceLineCurrency'
                      : 'heroPriceLine',
                    {
                      price: heroMinPriceFormatted,
                      count: heroStats.sellerCount,
                      strong: (chunks) => (
                        <strong className="rate-tabular">{chunks}</strong>
                      ),
                    }
                  )}
                </p>
              ) : (
                isPlace &&
                heroPlacePriceFormatted && (
                  <p
                    className={`rate-pdv-price-line ${
                      hasVariantStrip ? 'mb-2' : 'mb-3'
                    }`}
                  >
                    <strong className="rate-tabular">
                      {heroPlacePriceFormatted}
                    </strong>
                  </p>
                )
              )}
              {/* Variants & available colors surfaced compactly directly under price (DOS/Rate#1945). */}
              {hasVariantStrip && (
                <div
                  className="rate-pdv-variant-strip"
                  data-testid="pdv-variant-strip"
                >
                  {variantLinks && (
                    <ProductVariantLinks
                      links={variantLinks}
                      basePath={categoryBasePath}
                      label={t('variantLinksLabel')}
                      unknownSizeLabel={t('variantLinksUnknownSize')}
                      priceLabel={(minPrice) =>
                        minPrice > 0
                          ? effectiveHasUnitSuffix
                            ? t('itemVariantPriceCurrency', {
                                price: formatListingPrice(
                                  minPrice,
                                  effectiveCurrency,
                                  locale,
                                  { categorySlug }
                                ),
                              })
                            : t('itemVariantPrice', {
                                price: formatNumber(minPrice, locale),
                              })
                          : t('itemVariantNoPrice')
                      }
                    />
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
                              ? effectiveHasUnitSuffix
                                ? t('itemVariantPriceCurrency', {
                                    price: formatListingPrice(
                                      stats.minPrice,
                                      effectiveCurrency,
                                      locale,
                                      { categorySlug }
                                    ),
                                  })
                                : t('itemVariantPrice', {
                                    price: formatNumber(stats.minPrice, locale),
                                  })
                              : t('itemVariantNoPrice'),
                        };
                      })}
                    />
                  )}
                  {singleVariantLabel && (
                    <div className="rate-pdv-variant-row">
                      <span
                        className="rate-pdv-variant-chip is-current"
                        data-testid="pdv-single-variant-chip"
                      >
                        <ContentText
                          text={singleVariantLabel}
                          locale={locale}
                        />
                      </span>
                    </div>
                  )}
                  {productColors.length > 0 && (
                    <div
                      className="rate-pdv-colors"
                      aria-label={t('availableColors')}
                    >
                      <span className="rate-pdv-colors-label">
                        {t('availableColors')}
                      </span>
                      {productColors.map((c, i) => (
                        <a
                          key={`${c}-${i}`}
                          href="#offers-table"
                          className="rate-pdv-color-chip"
                          lang={contentLang(c, locale)}
                        >
                          {c}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Below lg the scoreboard starts past the first phone screen, so
            the buyer score is repeated next to the price (DOS/Rate#630). */}
              {displayUserRating > 0 && (
                <p
                  className="rate-pdv-hero-score d-flex d-lg-none align-items-center mb-3 gap-1"
                  data-testid="pdv-hero-score"
                >
                  <span className="visually-hidden">
                    {t('userWeightedScoreLabel')}:
                  </span>
                  <StarRating
                    value={displayUserRating}
                    count={authenticCount > 0 ? authenticCount : null}
                    title={t('userScoreHint')}
                  />
                </p>
              )}

              {/* The specs come first, then the reviews, the price history and
              the sellers; this row jumps to each (DOS/Rate#1469, #1530). It
              sits under the price, before the scoreboard, so a phone shows it
              in the first screen (DOS/Rate#1517). */}
              <nav
                className="rate-pdv-jumpnav"
                aria-label={t('jumpNavAria')}
                data-testid="pdv-jump-nav"
              >
                {(!isPlace || showPlaceDetails) && (
                  <a
                    href={isPlace ? '#place-details-section' : '#specs-section'}
                  >
                    {t('jumpNavSpecs')}
                  </a>
                )}
                <a href="#jreviews-section">
                  {t('jumpNavReviews', { count: authenticCount })}
                </a>
                {!isPlace && (
                  <a href="#pdv-price-history">{t('jumpNavPriceHistory')}</a>
                )}
                {!isPlace && (
                  <a href="#offers-table">
                    {t('jumpNavOffers', { count: heroSellerCount })}
                  </a>
                )}
              </nav>
              {/* #1 Core Focus Above the Fold: JReviews Dual-Rating & 5-Criteria Scoreboard (DESIGN.md v3.0) */}
              <div
                className={`rate-scoreboard-dark rate-surface-dark rate-pdv-board${
                  hasCriteriaScores ? '' : ' is-compact'
                } mb-4`}
              >
                {/* No eyebrow above the board (DOS/Rate#1946): the
                    fake-review note is the InfoTip beside the buyer score. */}
                <div className="rate-pdv-tags">
                  {authenticCount > 0 && (
                    <span className="rate-pdv-tag is-good">
                      <BsCheckCircleFill aria-hidden="true" />
                      {t('authenticReviewsBadge', { count: authenticCount })}
                    </span>
                  )}
                  {ignoredCount > 0 && (
                    <span className="rate-pdv-tag is-bad">
                      <BsShieldExclamation aria-hidden="true" />
                      {t('filteredSeedingBadge', { count: ignoredCount })}
                    </span>
                  )}
                  <RadarBadge signal={radarSignal} minSpreadPct={0} />
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

                {hasCriteriaScores ? (
                  <div className="row g-3 align-items-stretch">
                    {/* Dual Score Boxes */}
                    <div className="col-md-5 d-flex flex-column col-12 gap-3">
                      {userScoreBox}
                      {expertScoreBox}
                    </div>

                    {/* 5-Criteria Breakdown Bars */}
                    <div className="col-md-7 d-flex flex-column justify-content-center col-12">
                      <div className="rate-pdv-crit h-100">
                        {criteria.map((crit) => {
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
                                    ? `${formatRatingValue(val, locale, 1)}/5`
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
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        expertScoreBox
                          ? 'row g-3 align-items-stretch'
                          : 'rate-pdv-compact-scores'
                      }
                    >
                      <div
                        className={
                          expertScoreBox ? 'col-sm-6 col-12' : undefined
                        }
                      >
                        {userScoreBox}
                      </div>
                      {expertScoreBox && (
                        <div className="col-sm-6 col-12">{expertScoreBox}</div>
                      )}
                    </div>
                    <p
                      className="rate-pdv-crit-empty mt-3 mb-0"
                      data-testid="pdv-criteria-empty"
                    >
                      {t('critEmpty')}
                    </p>
                  </>
                )}

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
                    {authenticCount > 0
                      ? t('readAndSubmitReviewsBtn', { count: authenticCount })
                      : t('writeOrReadReviewsBtn')}
                  </a>
                  {heroStats.minPrice > 0 && (
                    <PriceWatchButton
                      slug={product.slug}
                      name={product.name}
                      brand={product.brand}
                      categoryPath={categoryBasePath}
                      thumbnail={productImageUrl(product)}
                      currentMinPrice={
                        currentMinPrice > 0
                          ? currentMinPrice
                          : heroStats.minPrice
                      }
                      currency={effectiveCurrency}
                      priceUnit={effectivePriceUnit}
                      size="sm"
                    />
                  )}
                  <CompareQuickToggle
                    compact
                    includeWatchlist={false}
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

          {showPlaceDetails && (
            <PlaceDetailsSection
              locale={locale}
              categorySlug={categorySlug}
              placeDetail={placeDetail}
              branches={placeBranches}
              fallbackPriceMin={marketStats.minPrice}
              fallbackPriceMax={marketStats.maxPrice}
            />
          )}

          {/* The product first: spec groups, per category template
          (DOS/Rate#1142), then the reviews, the price history and the sellers
          last (DOS/Rate#1530). The price strip above keeps the best price in
          the first screen. */}
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
            if (isPlace && specGroups.length === 0) {
              return null;
            }
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
                    {!isPlace && specGroups.length > 0 && (
                      <ProductSpecsExportToolbar
                        productName={product.name}
                        productSlug={product.slug}
                        brand={product.brand}
                        specifications={specs || {}}
                        keySpecs={keySpecs || {}}
                        categorySlug={categorySlug}
                        radarSignal={radarSignal}
                      />
                    )}
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
                  {specGroups.map(({ group, rows }) => (
                    <div key={group} className="col-md-6 col-12">
                      <div className="rounded-4 h-100 border bg-white p-4">
                        <h3 className="h6 fw-bold text-primary mb-3">
                          {specGroupHeading(specUi, group, specTemplate.has5g)}
                        </h3>
                        <dl className="row small mb-0">
                          {rows.map(({ label, value, lang }) => (
                            <Fragment key={label}>
                              <dt className="text-muted col-5">{label}</dt>
                              <dd className="fw-medium col-7">
                                <ContentText
                                  text={value}
                                  lang={lang}
                                  locale={locale}
                                />
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

          {/* JReviews Dual-Rating, AI Review Synthesis & Interactive Voting (Core Product Value) */}
          <div className="mb-5">
            <JReviewsSection
              masterProductId={product.id}
              categorySlug={
                isCanonicalCategorySlug(categorySlug) ? categorySlug : undefined
              }
              productSlug={product.slug}
              productName={product.name}
              averageRating={normalizeCompareFiveStarRating(
                product.average_rating
              )}
              reviewCategorySlug={reviewCategory}
              userRatingWeighted={displayUserRating || null}
              ratingScore={storedRating || null}
              expertRating={resolveCompareExpertRating5(product)}
              expertReviewSummary={product.expert_review_summary || null}
              authenticReviewCount={authenticCount}
              ignoredReviewCount={ignoredCount}
              reviews={reviews}
              starCounts={reviewStarCounts}
              initialNextCursor={reviewPage.nextCursor}
              totalReviewCount={reviewPage.totalCount}
              summary={reviewSummary}
              productPoints={productPointsData.rows}
              productPointsReviewCount={productPointsData.reviewCount}
              radarSignal={radarSignal}
            />
          </div>

          {/* Time-Series Price History Chart, Fake Discount Detector & Neutral
          Merchant Audit. The wrapper is the jump row's target: a lazy size
          panel has no #price-history-section until it loads (#1469). */}
          {!isPlace && (
            <div id="pdv-price-history">
              {isItemGroup
                ? renderSizePanels('history', (v) =>
                    renderPriceHistory(variantPanelInput(v))
                  )
                : renderPriceHistory({
                    product,
                    offers,
                    priceHistory,
                    minPrice: currentMinPrice,
                    radarSignal,
                  })}
            </div>
          )}

          {/* Neutral Merchant Reference & Trust Audit Table */}
          {(!isPlace || offers.length > 0) && (
            <div
              id="offers-table"
              className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm"
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
          )}

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
          {!isPlace &&
            effectiveCurrency !== 'PCT' &&
            !isServiceCategorySlug(categorySlug) &&
            !isWaveE3CategorySlug(categorySlug) &&
            (() => {
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
                  valueCriterionScore5={lbScored.criteria.value ?? 0}
                  radarSignal={radarSignal}
                  offers={pickEffectivePriceCandidates(
                    defaultSize?.offers ?? offers,
                    currentMinPrice
                  )}
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
                  {comboCartHref && (
                    <Link
                      href={comboCartHref}
                      prefetch={false}
                      data-testid="pdv-combo-cart-link"
                      className="btn btn-sm btn-outline-success rounded-pill fw-semibold px-3"
                    >
                      {t('comboCartBtn')}
                    </Link>
                  )}
                  {currentCompareCount > 0 && compareAllCount >= 2 && (
                    <Link
                      href={compareAllHref}
                      className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                    >
                      {t('compareAllPeersBtn', {
                        count: compareAllCount,
                      })}
                    </Link>
                  )}
                </div>
              </div>

              <div
                className="row g-3"
                data-testid="same-category-value-alternatives"
              >
                {relatedCompetitors.map((peer) => {
                  const peerCanonicalSlug = resolveCanonicalPeerSlug({
                    slug: peer.slug,
                    item_slug: catalogRowSlug(peer),
                  });
                  const peerDetailHref = peerCanonicalSlug
                    ? `${categoryBasePath}/${encodeURIComponent(peerCanonicalSlug)}`
                    : categoryBasePath;
                  // Canonical 1v1 pair URL (`versusHref(product.slug, peer.slug)` when
                  // ungrouped), guarded by `resolvePeerVersusHref` and suppressed when
                  // peer Item link grouping degraded (#1367, #1819, #1834).
                  const resolvedVersusHref = resolvePeerVersusHref(
                    product.slug,
                    peer.slug,
                    peerItemSlugMap,
                    { degraded: peerItemLinksDegraded }
                  );
                  const versusSides = (resolvedVersusHref ?? '')
                    .replace(/^\/compare\//, '')
                    .split('-vs-');
                  const peerVersusHref =
                    resolvedVersusHref &&
                    versusSides.length === 2 &&
                    isParseableVersusPair(versusSides[0]!, versusSides[1]!)
                      ? resolvedVersusHref
                      : null;
                  const peerPrice = Number(peer.min_price || 0);
                  const priceDelta = peerPriceDelta(peerPrice, currentMinPrice);
                  const peerThumb = productImageUrl(peer);
                  const peerRating = resolveCompareEffectiveUserRating(peer);
                  const peerScore10 = peerRating * 2;
                  const currentScore10 = displayUserRating * 2;
                  const isVndCompetitor =
                    effectiveCurrency === 'VND' &&
                    !isPlace &&
                    !isServiceCategorySlug(categorySlug) &&
                    !isWaveE3CategorySlug(categorySlug) &&
                    !isPlaceCategorySlug(categorySlug);
                  const peerCostPerPoint =
                    isVndCompetitor && peerScore10 > 0 && peerPrice > 0
                      ? Math.round(peerPrice / peerScore10)
                      : 0;
                  const currentCostPerPoint =
                    isVndCompetitor && currentScore10 > 0
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
                                srcSet={
                                  deviceImageSrcSet(peerThumb) ?? undefined
                                }
                                // 68 px box less padding and border.
                                sizes="50px"
                                src={peerThumb}
                                alt={peer.name}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              (() => {
                                const iconProps = {
                                  'aria-hidden': true as const,
                                  className: 'text-muted',
                                };
                                switch (categorySlug) {
                                  case 'laptops':
                                    return <BsLaptop {...iconProps} />;
                                  case 'tablets':
                                    return <BsTabletLandscape {...iconProps} />;
                                  case 'smartwatches':
                                    return <BsSmartwatch {...iconProps} />;
                                  case 'earbuds':
                                    return <BsEarbuds {...iconProps} />;
                                  case 'tvs':
                                    return <BsTv {...iconProps} />;
                                  case 'air-conditioners':
                                    return <BsSnow {...iconProps} />;
                                  case 'refrigerators':
                                    return <BsBoxSeam {...iconProps} />;
                                  case 'washing-machines':
                                    return <BsDroplet {...iconProps} />;
                                  case 'air-purifiers':
                                    return <BsWind {...iconProps} />;
                                  case 'bank-savings':
                                    return <BsBank {...iconProps} />;
                                  case 'internet-telecom':
                                    return <BsWifi {...iconProps} />;
                                  case 'supplements':
                                    return <BsCapsule {...iconProps} />;
                                  case 'cosmetics':
                                    return <BsStars {...iconProps} />;
                                  case 'mother-baby':
                                    return <BsHeartPulse {...iconProps} />;
                                  case 'restaurants':
                                    return <BsForkKnife {...iconProps} />;
                                  case 'cafes':
                                    return <BsCupHot {...iconProps} />;
                                  case 'hotels':
                                    return <BsBuilding {...iconProps} />;
                                  case 'homestays':
                                    return <BsHouseHeart {...iconProps} />;
                                  case 'dental-clinics':
                                    return <BsHospital {...iconProps} />;
                                  case 'gyms-fitness':
                                    return <BsPersonArmsUp {...iconProps} />;
                                  case 'spas-aesthetics':
                                    return <BsStars {...iconProps} />;
                                  case 'english-centers':
                                    return <BsMortarboard {...iconProps} />;
                                  case 'credit-cards':
                                    return (
                                      <BsCreditCard2Front {...iconProps} />
                                    );
                                  default:
                                    return <BsPhone {...iconProps} />;
                                }
                              })()
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <div className="d-flex align-items-center mb-1 flex-wrap gap-1">
                              <span className="badge bg-secondary-subtle text-secondary small">
                                {peer.brand}
                              </span>
                              <StarRating
                                value={peerRating}
                                size="sm"
                                emptyLabel={t('peerNoRating')}
                              />
                              <RadarBadge
                                signal={getRadarSignal(
                                  peerRadarIndex,
                                  peer.slug
                                )}
                              />
                            </div>
                            <h4 className="h6 fw-bold text-truncate mb-1">
                              <Link
                                href={peerDetailHref}
                                className="text-dark text-decoration-none"
                              >
                                {peer.name}
                              </Link>
                            </h4>
                            <div className="d-flex align-items-center flex-wrap gap-2">
                              {peerPrice > 0 ? (
                                <span className="text-danger fw-bold small rate-tabular">
                                  {formatListingPrice(
                                    peerPrice,
                                    effectiveCurrency,
                                    locale,
                                    {
                                      categorySlug,
                                      priceUnit: effectivePriceUnit,
                                    }
                                  )}
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
                                  {effectiveCurrency === 'PCT'
                                    ? `${priceDelta < 0 ? '-' : '+'}${formatListingPrice(
                                        Math.abs(priceDelta),
                                        'PCT',
                                        locale,
                                        { includeUnitSuffix: false }
                                      )}`
                                    : priceDelta < 0
                                      ? t('cheaperByBadge', {
                                          amount: formatNumber(
                                            Math.abs(priceDelta),
                                            locale
                                          ),
                                        })
                                      : `+${formatListingPrice(
                                          priceDelta,
                                          effectiveCurrency,
                                          locale,
                                          {
                                            categorySlug,
                                            priceUnit: effectivePriceUnit,
                                          }
                                        )}`}
                                </span>
                              )}
                            </div>
                            {peerCostPerPoint > 0 && (
                              <div className="text-muted small rate-tabular mt-1">
                                {t('costPerPointUnit', {
                                  cost: formatNumber(peerCostPerPoint, locale),
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
                          {peerVersusHref && (
                            <IntentLink
                              href={peerVersusHref}
                              className="btn btn-sm btn-outline-primary rounded-pill fw-semibold flex-grow-1"
                            >
                              {t('compare1v1Btn')}
                            </IntentLink>
                          )}
                          <Link
                            href={peerDetailHref}
                            className={`btn btn-sm btn-light rounded-pill border px-3${peerVersusHref ? '' : ' flex-grow-1'}`}
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
