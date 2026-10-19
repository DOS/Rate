import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { AppProviders } from '@/app/providers';
import BootstrapClient from '@/app/BootstrapClient';
import { fontFaces } from '@/lib/fonts';
import { routing } from '@/lib/navigation';
import { defaultOpenGraph } from '@/lib/seo';

// No locale is prerendered at build, which needs no database then. Each page
// renders on its first request and is cached from there, unless it reads
// searchParams (DOS/Rate#491).
export function generateStaticParams(): { locale: string }[] {
  return [];
}

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
  if (!hasLocale(routing.locales, locale)) notFound();
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
    <html
      lang={locale}
      className={fontFaces.map((font) => font.variable).join(' ')}
    >
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
        {/* Bootstrap JS from the installed package (same version as the CSS), not a CDN */}
        <BootstrapClient />
      </body>
    </html>
  );
}
