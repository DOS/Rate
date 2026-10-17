import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AppProviders } from '@/app/providers';
import { getRateCopy } from '@/lib/rate-i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getRateCopy(locale);
  const shareImage = {
    url: '/img/rate-og.png',
    width: 1200,
    height: 630,
    alt: copy.seo.siteTitle,
  };
  return {
    metadataBase: new URL('https://rate.vn'),
    title: copy.seo.siteTitle,
    description: copy.seo.siteDescription,
    // Default share card; pages that set their own openGraph/twitter replace it.
    openGraph: {
      type: 'website',
      siteName: 'Rate.vn',
      locale: OG_LOCALES[locale] ?? OG_LOCALES.vi,
      title: copy.seo.siteTitle,
      description: copy.seo.siteDescription,
      images: [shareImage],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@rate_vn',
      title: copy.seo.siteTitle,
      description: copy.seo.siteDescription,
      images: [shareImage.url],
    },
  };
}

const OG_LOCALES: Record<string, string> = {
  vi: 'vi_VN',
  en: 'en_US',
  cs: 'cs_CZ',
};

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

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppProviders>{children}</AppProviders>
    </NextIntlClientProvider>
  );
}
