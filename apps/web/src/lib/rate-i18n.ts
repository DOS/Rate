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

export interface RateLocaleCopy {
  locale: SupportedRateLocale;
  seo: {
    siteTitle: string;
    siteDescription: string;
  };
  nav: {
    home: string;
    smartphones: string;
    laptops: string;
    tablets: string;
    smartwatches: string;
    earbuds: string;
    leaderboard: string;
    merchants: string;
    inspect: string;
    compare: string;
    watchlist: string;
    developers: string;
    priceWatchCta: string;
  };
  footer: {
    copyRight: string;
    col1Title: string;
    col2Title: string;
    col3Title: string;
    trustTitle: string;
    antiSeedingSub: string;
    specGroupsSub: string;
    links: {
      smartphones: string;
      laptops: string;
      tablets: string;
      smartwatches: string;
      earbuds: string;
      leaderboard: string;
      inspect: string;
      compare: string;
      merchants: string;
      watchlist: string;
      developers: string;
      apiProducts: string;
      about: string;
      faq: string;
      privacy: string;
      contact: string;
      github: string;
    };
    bannerTitle: string;
    bannerDesc: string;
    bannerCta: string;
    bannerCompareCta: string;
  };
  home: {
    heroBadge: string;
    heroTitlePrefix: string;
    heroTitleHighlight: string;
    heroTitleSuffix: string;
    heroSubtitle: string;
    statProducts: string;
    statPricePoints: string;
    statReviews: string;
    statMerchants: string;
    catBadge: string;
    catTitlePrefix: string;
    catTitleHighlight: string;
    catSubtitle: string;
    catReadySuffix: string;
    catExpanding: string;
    featuredBadge: string;
    featuredTitlePrefix: string;
    featuredTitleHighlight: string;
    featuredSubtitle: string;
    viewAllCatalog: string;
    compareSpecsBtn: string;
    viewSpecAndPriceBtn: string;
    merchantBadge: string;
    merchantTitlePrefix: string;
    merchantTitleHighlight: string;
    merchantSubtitle: string;
    viewAllMerchants: string;
    viewMerchantAuditBtn: string;
    reviewsBadge: string;
    reviewsTitlePrefix: string;
    reviewsTitleHighlight: string;
    reviewsSubtitle: string;
    whyBadge: string;
    whyTitlePrefix: string;
    whyTitleHighlight: string;
    whySubtitle: string;
  };
}

// The copy lives in the next-intl catalogs (locales/*.json, namespace `rate`),
// the single source for every locale. These typed bindings fail to compile if a
// catalog is missing a key the UI reads.
type RateCopyStrings = Omit<RateLocaleCopy, 'locale'>;
const viCopy: RateCopyStrings = viMessages.rate;
const enCopy: RateCopyStrings = enMessages.rate;
const csCopy: RateCopyStrings = csMessages.rate;

type CompareCopyStrings = typeof viMessages.compare;
const _enCompareCheck: CompareCopyStrings = enMessages.compare;
const _csCompareCheck: CompareCopyStrings = csMessages.compare;
void _enCompareCheck;
void _csCompareCheck;

const RATE_COPY_DICTIONARY: Record<SupportedRateLocale, RateLocaleCopy> = {
  vi: { locale: 'vi', ...viCopy },
  en: { locale: 'en', ...enCopy },
  cs: { locale: 'cs', ...csCopy },
};

export function getRateCopy(locale?: string | null): RateLocaleCopy {
  const normalized = normalizeRateLocale(locale);
  return RATE_COPY_DICTIONARY[normalized];
}
