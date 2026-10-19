import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  getCachedMasterProducts,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import DealFinderWorkspace from '@/components/deals/DealFinderWorkspace';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'deals' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: 'https://rate.vn/deals',
    },
  };
}

export default async function DealsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'deals' });
  const [products, dealRadar] = await Promise.all([
    getCachedMasterProducts({
      categorySlug: 'all',
      limit: 100,
      sort: 'rating_desc',
    }),
    getCrossPlatformDealRadar({
      categorySlug: 'all',
      // Max page size so every ranked card gets its own Radar badge.
      limit: 50,
    }),
  ]);

  return (
    <main className="bg-light min-vh-100">
      <NavbarDarkDynamic links={[]} />
      <section className="py-4">
        <div className="container">
          <div className="rate-scoreboard-dark rate-surface-dark rounded-4 mb-4 p-4">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <div className="rate-eyebrow mb-2">{t('pageEyebrow')}</div>
                <h1 className="h3 fw-bold mb-1 text-white">{t('pageTitle')}</h1>
                <p className="text-white-50 small mb-0">{t('pageSubtitle')}</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/leaderboard"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('leaderboardBtn')}
                </Link>
                <Link
                  href="/inspect"
                  className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                >
                  {t('inspectBtn')}
                </Link>
              </div>
            </div>
          </div>

          <DealFinderWorkspace products={products} dealRadar={dealRadar} />
        </div>
      </section>
      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </main>
  );
}
