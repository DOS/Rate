import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AppProviders } from '@/app/providers';
import { getRateCopy } from '@/lib/rate-i18n';
import { defaultOpenGraph } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getRateCopy(locale);
  return {
    metadataBase: new URL('https://rate.vn'),
    title: copy.seo.siteTitle,
    description: copy.seo.siteDescription,
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
  // Only Client Components need messages in the browser, and the only client
  // consumer is the error boundary (errors.global). Server Components read the
  // full catalog through getTranslations, so nothing else is shipped.
  const clientMessages = {
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
  };

  return (
    <NextIntlClientProvider locale={locale} messages={clientMessages}>
      <AppProviders>{children}</AppProviders>
    </NextIntlClientProvider>
  );
}
