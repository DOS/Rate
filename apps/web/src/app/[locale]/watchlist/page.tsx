import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getMasterProducts } from '@/lib/rate-api';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import WatchlistWorkspace from '@/components/watchlist/WatchlistWorkspace';
import ClientMessages from '@/components/providers/ClientMessages';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'watchlist' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: 'https://rate.vn/watchlist',
    },
  };
}

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // No empty fallback: it would be cached for the whole revalidate window. A
  // failed regeneration keeps the last good page instead (DOS/Rate#491).
  const catalogProducts = await getMasterProducts({
    categorySlug: 'all',
    limit: 100,
  });

  return (
    <ClientMessages scope="watchlist">
      <>
        <NavbarDarkDynamic links={[]} />
        <WatchlistWorkspace catalogProducts={catalogProducts} locale={locale} />
        <CompareTrayBar />
        <FooterTop locale={locale} />
        <FooterDynamic sections={[]} links={[]} locale={locale} />
        <BackToTop />
      </>
    </ClientMessages>
  );
}
