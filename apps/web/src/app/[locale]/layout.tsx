import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { AppProviders } from '@/app/providers';
import { defaultOpenGraph } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tSeo = await getTranslations({ locale, namespace: 'rate.seo' });
  return {
    metadataBase: new URL('https://rate.vn'),
    title: tSeo('siteTitle'),
    description: tSeo('siteDescription'),
    // Default share card. og:title/description come from each page's own
    // title/description, and Next fills the Twitter title, description and
    // image from the page's resolved openGraph, so neither is set here.
    openGraph: defaultOpenGraph(locale),
    twitter: {
      card: 'summary_large_image',
      site: '@rate_vn',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  // Client Components read scoped namespaces via NextIntlClientProvider.
  // Server Components read the full catalog through getTranslations.
  const clientMessages = {
    rate: { nav: (messages.rate as Record<string, unknown>)?.nav },
    errors: { global: (messages.errors as Record<string, unknown>)?.global },
    compare: messages.compare,
    leaderboard: messages.leaderboard,
    reviews: messages.reviews,
    watchlist: messages.watchlist,
    deals: messages.deals,
    inspect: messages.inspect,
    merchants: messages.merchants,
    productDetail: messages.productDetail,
    homePage: messages.homePage,
    developers: messages.developers,
    staticPages: messages.staticPages,
    catalog: messages.catalog,
    heroSearch: messages.heroSearch,
    authPortal: messages.authPortal,
  };

  return (
    <NextIntlClientProvider locale={locale} messages={clientMessages}>
      <AppProviders>{children}</AppProviders>
    </NextIntlClientProvider>
  );
}
