import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { getCachedMerchantsList } from '@/server/rate';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import { BsSearch, BsShieldCheck } from 'react-icons/bs';
import MerchantDirectoryExplorer from '@/components/merchants/MerchantDirectoryExplorer';
import {
  DEFAULT_MERCHANT_DIRECTORY_FILTERS,
  MERCHANT_PAGE_SIZE,
  pageMerchantDirectory,
  summarizeMerchantDirectory,
} from '@/lib/merchant-directory';

// Cached: the page ships the unfiltered first page, and the explorer applies
// ?q= / ?platform= / ?official= / ?sort= in the browser through the
// directory API, so no request data is read here (DOS/Rate#560).
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const canonicalUrl = 'https://rate.vn/merchants';

  return {
    title: t('dirMetaTitle'),
    description: t('dirMetaDesc'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function MerchantsDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const merchants = await getCachedMerchantsList();

  // Only the first page and whole-directory stats go to the browser; the
  // explorer fetches further pages and exports from the directory API.
  const initialPage = pageMerchantDirectory(
    merchants,
    DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    0,
    MERCHANT_PAGE_SIZE
  );
  const summary = summarizeMerchantDirectory(merchants);

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <div
        className="hero-banner rate-surface-dark rate-ink-on-dark position-relative overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(216, 48, 48, 0.16), transparent 45%), radial-gradient(circle at 82% 18%, rgba(45, 186, 105, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
          paddingTop: '3.5rem',
          paddingBottom: '3.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="position-relative z-1 container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
              <div className="position-relative mt-2 text-start">
                <span className="rate-eyebrow mb-3">
                  {t('dirHeroBadge1')} · {t('dirHeroBadge2')}
                </span>
                <h1
                  className="fw-bold mb-2 text-white"
                  style={{
                    fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)',
                    letterSpacing: '-0.025em',
                  }}
                >
                  {t('dirHeroTitle')}
                </h1>
                <p
                  className="fs-6 mb-0"
                  style={{ color: '#94a3b8', maxWidth: '760px' }}
                >
                  {t('dirHeroSubtitle')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="py-5">
        <div className="container">
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="breadcrumb small mb-0">
              <li className="breadcrumb-item">
                <Link href="/" className="text-decoration-none">
                  {t('breadcrumbHome')}
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {t('breadcrumbMerchants')}
              </li>
            </ol>
          </nav>

          {/* Dual Risk Score Explanation Banner */}
          <div className="card rounded-4 bg-light mb-4 border-0 p-4 shadow-sm">
            <div className="row g-3 align-items-center">
              <div className="col-lg-8">
                <h2 className="h5 fw-bold d-flex align-items-center mb-1 gap-2">
                  <BsShieldCheck className="text-primary" />
                  {t('dualEngineTitle')}
                </h2>
                <p className="text-muted small mb-0">
                  {t('dualEngineDesc1')} <strong>DOSafe Threat Risk</strong>{' '}
                  {t('dualEngineDesc2')} <code>dosafe.threat_intel</code>{' '}
                  {t('dualEngineDesc3')} <strong>AI Review Risk</strong>{' '}
                  {t('dualEngineDesc4')}
                </p>
              </div>
              <div className="col-lg-4 text-lg-end d-flex justify-content-lg-end flex-wrap gap-2">
                <Link
                  href="/inspect"
                  className="btn btn-danger rounded-pill fw-medium btn-sm px-3"
                >
                  <BsSearch aria-hidden="true" className="me-1" />
                  {t('inspectUrlBtn')}
                </Link>
                <Link
                  href="/smartphones"
                  className="btn btn-outline-primary rounded-pill fw-medium btn-sm px-3"
                >
                  {t('browseProductsBtn')}
                </Link>
              </div>
            </div>
          </div>

          <MerchantDirectoryExplorer
            initialPage={initialPage}
            summary={summary}
            locale={locale}
          />
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
