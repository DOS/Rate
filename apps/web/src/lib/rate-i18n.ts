import csMessages from '../../locales/cs.json';
import enMessages from '../../locales/en.json';
import viMessages from '../../locales/vi.json';

export type SupportedRateLocale = 'vi' | 'en' | 'cs';
export type RateLocale = SupportedRateLocale;

export function normalizeRateLocale(
  locale?: string | null
): SupportedRateLocale {
  if (locale === 'en' || locale === 'cs') {
    return locale;
  }
  return 'vi';
}

// All UI copy lives in the next-intl catalogs (locales/*.json), the single
// source of truth for every locale. These compile-time bindings fail the build
// if any locale catalog is missing a key present in vi.json.
type RateCopyStrings = typeof viMessages.rate;
const _enRateCheck: RateCopyStrings = enMessages.rate;
const _csRateCheck: RateCopyStrings = csMessages.rate;
void _enRateCheck;
void _csRateCheck;

type ErrorsCopyStrings = typeof viMessages.errors;
const _enErrorsCheck: ErrorsCopyStrings = enMessages.errors;
const _csErrorsCheck: ErrorsCopyStrings = csMessages.errors;
void _enErrorsCheck;
void _csErrorsCheck;

type CompareCopyStrings = typeof viMessages.compare;
const _enCompareCheck: CompareCopyStrings = enMessages.compare;
const _csCompareCheck: CompareCopyStrings = csMessages.compare;
void _enCompareCheck;
void _csCompareCheck;

type LeaderboardCopyStrings = typeof viMessages.leaderboard;
const _enLeaderboardCheck: LeaderboardCopyStrings = enMessages.leaderboard;
const _csLeaderboardCheck: LeaderboardCopyStrings = csMessages.leaderboard;
void _enLeaderboardCheck;
void _csLeaderboardCheck;

type ReviewsCopyStrings = typeof viMessages.reviews;
const _enReviewsCheck: ReviewsCopyStrings = enMessages.reviews;
const _csReviewsCheck: ReviewsCopyStrings = csMessages.reviews;
void _enReviewsCheck;
void _csReviewsCheck;

type WatchlistCopyStrings = typeof viMessages.watchlist;
const _enWatchlistCheck: WatchlistCopyStrings = enMessages.watchlist;
const _csWatchlistCheck: WatchlistCopyStrings = csMessages.watchlist;
void _enWatchlistCheck;
void _csWatchlistCheck;

type DealsCopyStrings = typeof viMessages.deals;
const _enDealsCheck: DealsCopyStrings = enMessages.deals;
const _csDealsCheck: DealsCopyStrings = csMessages.deals;
void _enDealsCheck;
void _csDealsCheck;

type InspectCopyStrings = typeof viMessages.inspect;
const _enInspectCheck: InspectCopyStrings = enMessages.inspect;
const _csInspectCheck: InspectCopyStrings = csMessages.inspect;
void _enInspectCheck;
void _csInspectCheck;

type MerchantsCopyStrings = typeof viMessages.merchants;
const _enMerchantsCheck: MerchantsCopyStrings = enMessages.merchants;
const _csMerchantsCheck: MerchantsCopyStrings = csMessages.merchants;
void _enMerchantsCheck;
void _csMerchantsCheck;

type ProductDetailCopyStrings = typeof viMessages.productDetail;
const _enProductDetailCheck: ProductDetailCopyStrings =
  enMessages.productDetail;
const _csProductDetailCheck: ProductDetailCopyStrings =
  csMessages.productDetail;
void _enProductDetailCheck;
void _csProductDetailCheck;

type HomePageCopyStrings = typeof viMessages.homePage;
const _enHomePageCheck: HomePageCopyStrings = enMessages.homePage;
const _csHomePageCheck: HomePageCopyStrings = csMessages.homePage;
void _enHomePageCheck;
void _csHomePageCheck;

type DevelopersCopyStrings = typeof viMessages.developers;
const _enDevelopersCheck: DevelopersCopyStrings = enMessages.developers;
const _csDevelopersCheck: DevelopersCopyStrings = csMessages.developers;
void _enDevelopersCheck;
void _csDevelopersCheck;

type StaticPagesCopyStrings = typeof viMessages.staticPages;
const _enStaticPagesCheck: StaticPagesCopyStrings = enMessages.staticPages;
const _csStaticPagesCheck: StaticPagesCopyStrings = csMessages.staticPages;
void _enStaticPagesCheck;
void _csStaticPagesCheck;

type CatalogCopyStrings = typeof viMessages.catalog;
const _enCatalogCheck: CatalogCopyStrings = enMessages.catalog;
const _csCatalogCheck: CatalogCopyStrings = csMessages.catalog;
void _enCatalogCheck;
void _csCatalogCheck;

type HeroSearchCopyStrings = typeof viMessages.heroSearch;
const _enHeroSearchCheck: HeroSearchCopyStrings = enMessages.heroSearch;
const _csHeroSearchCheck: HeroSearchCopyStrings = csMessages.heroSearch;
void _enHeroSearchCheck;
void _csHeroSearchCheck;

type AuthPortalCopyStrings = typeof viMessages.authPortal;
const _enAuthPortalCheck: AuthPortalCopyStrings = enMessages.authPortal;
const _csAuthPortalCheck: AuthPortalCopyStrings = csMessages.authPortal;
void _enAuthPortalCheck;
void _csAuthPortalCheck;
