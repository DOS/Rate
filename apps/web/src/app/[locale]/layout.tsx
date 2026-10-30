import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { AppProviders } from '@/app/providers';
import { pickClientMessages } from '@/lib/client-messages';
import { PAGE_META_CSP } from '@/lib/csp';
import { fontFaces } from '@/lib/fonts';
import { routing } from '@/lib/navigation';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { defaultOpenGraph } from '@/lib/seo';

// No locale is prerendered at build, which needs no database then. Each page
// renders on its first request and is cached from there, unless it reads
// searchParams (DOS/Rate#491).
export function generateStaticParams(): { locale: string }[] {
  return [];
}

// Upper bound for every page below, so even pages without data refresh daily
// (the footer's copyright year, for one). Pages may set a shorter period.
export const revalidate = 86400;

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
  // Client Components get only the shared messages here; each page adds its
  // own scope with <ClientMessages> (DOS/Rate#736). Server Components read
  // the full catalog through getTranslations.
  const clientMessages = pickClientMessages(await getMessages());

  return (
    <html
      lang={locale}
      className={fontFaces.map((font) => font.variable).join(' ')}
      // The theme script may set data-bs-theme before hydration (#1435).
      suppressHydrationWarning
    >
      <head>
        {/* Sets data-bs-theme before the body paints: the stored choice,
        else prefers-color-scheme (DOS/Rate#1435). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Not a header: see PAGE_META_CSP (DOS/Rate#1345). */}
        <meta httpEquiv="Content-Security-Policy" content={PAGE_META_CSP} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
