import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import { getCachedRatePlatformStats } from '@/server/rate';
import {
  BsCheckCircleFill,
  BsCodeSlash,
  BsCpu,
  BsDatabaseCheck,
  BsGraphUpArrow,
  BsShieldCheck,
  BsShop,
} from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'staticPages' });
  const alternates = {
    canonical: 'https://rate.vn/about-us',
    languages: {
      vi: 'https://rate.vn/about-us',
      en: 'https://rate.vn/about-us',
      cs: 'https://rate.vn/about-us',
    },
  };
  return {
    title: t('aboutSeoTitle'),
    description: t('aboutSeoDesc'),
    alternates,
  };
}

export default async function AboutUsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [stats, t] = await Promise.all([
    getCachedRatePlatformStats(),
    getTranslations({ locale, namespace: 'staticPages' }),
  ]);

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3">
          <div className="row align-items-center g-4">
            <div className="col-lg-8">
              <span className="badge bg-danger rounded-pill fw-semibold mb-3 px-3 py-2">
                {t('aboutHeroBadge')}
              </span>
              <h1 className="display-6 fw-bold mb-3 text-white">
                {t('aboutHeroTitlePrefix')}{' '}
                <span className="text-danger">Rate.vn</span>
              </h1>
              <p className="lead text-white-50 mb-4">{t('aboutHeroDesc')}</p>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/smartphones"
                  className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                >
                  {t('aboutBtnCatalog')}
                </Link>
                <Link
                  href="/developers"
                  className="btn btn-outline-light rounded-pill fw-medium px-4 py-2"
                >
                  {t('aboutBtnDevs')}
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 bg-opacity-50 border-secondary border-opacity-25 border bg-black p-4 text-white">
                <div className="small text-uppercase text-white-50 fw-bold mb-3">
                  {t('aboutStatsTitle')}
                </div>
                <div className="row g-3">
                  <div className="col-6">
                    <div className="h3 fw-bold text-warning mb-0">
                      {stats.masterProductsCount}
                    </div>
                    <div className="small text-white-50">
                      {t('aboutStat1Label')}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-info mb-0">
                      {stats.priceObservationsCount}
                    </div>
                    <div className="small text-white-50">
                      {t('aboutStat2Label')}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-success mb-0">
                      {stats.authenticRatioPct}%
                    </div>
                    <div className="small text-white-50">
                      {t('aboutStat3Label')}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-light mb-0">
                      {stats.merchantsCount}
                    </div>
                    <div className="small text-white-50">
                      {t('aboutStat4Label')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Pillars of Verification */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="mb-5 text-center">
            <h2 className="h3 fw-bold mb-2">{t('aboutPillarsTitle')}</h2>
            <p className="text-muted mb-0">
              {t('aboutPillarsDescPrefix')} <code>DOS/Rate</code>{' '}
              {t('aboutPillarsDescSuffix')}
            </p>
          </div>

          <div className="row g-4">
            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsCpu className="text-primary fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">{t('aboutPillar1Title')}</h4>
                <p className="text-muted small mb-3">{t('aboutPillar1Desc')}</p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/compare"
                    className="text-primary small fw-semibold text-decoration-none"
                  >
                    {t('aboutPillar1Link')}
                  </Link>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsGraphUpArrow className="text-success fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">{t('aboutPillar2Title')}</h4>
                <p className="text-muted small mb-3">{t('aboutPillar2Desc')}</p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/watchlist"
                    className="text-success small fw-semibold text-decoration-none"
                  >
                    {t('aboutPillar2Link')}
                  </Link>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsShieldCheck className="text-danger fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">{t('aboutPillar3Title')}</h4>
                <p className="text-muted small mb-3">{t('aboutPillar3Desc')}</p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/merchants"
                    className="text-danger small fw-semibold text-decoration-none"
                  >
                    {t('aboutPillar3Link')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open-Core Transparency Section */}
      <section className="border-top bg-white py-5">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-7">
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                {t('aboutOpenCoreBadge')}
              </span>
              <h3 className="fw-bold mb-3">{t('aboutOpenCoreTitle')}</h3>
              <p className="text-muted mb-3">{t('aboutOpenCoreDesc')}</p>
              <ul className="list-unstyled d-flex flex-column mb-0 gap-2">
                <li className="d-flex align-items-center small gap-2">
                  <BsCheckCircleFill className="text-success flex-shrink-0" />
                  <span>
                    <strong>{t('aboutBullet1Label')}</strong>{' '}
                    {t('aboutBullet1Desc')}
                  </span>
                </li>
                <li className="d-flex align-items-center small gap-2">
                  <BsDatabaseCheck className="text-primary flex-shrink-0" />
                  <span>
                    <strong>{t('aboutBullet2Label')}</strong>{' '}
                    {t('aboutBullet2Desc')}
                  </span>
                </li>
                <li className="d-flex align-items-center small gap-2">
                  <BsCodeSlash className="text-danger flex-shrink-0" />
                  <span>
                    <strong>{t('aboutBullet3Label')}</strong>{' '}
                    {t('aboutBullet3Desc')}
                  </span>
                </li>
              </ul>
            </div>

            <div className="col-lg-5">
              <div className="card rounded-4 bg-light border p-4">
                <h5 className="fw-bold mb-3">
                  <BsShop className="text-primary me-2" />
                  {t('aboutQuickLinksTitle')}
                </h5>
                <div className="d-grid gap-2">
                  <Link
                    href="/smartphones"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    {t('aboutLinkSmartphones')}
                  </Link>
                  <Link
                    href="/laptops"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    {t('aboutLinkLaptops')}
                  </Link>
                  <Link
                    href="/tablets"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    {t('aboutLinkTablets')}
                  </Link>
                  <Link
                    href="/faq"
                    className="btn btn-outline-primary rounded-3 px-3 py-2 text-start"
                  >
                    {t('aboutLinkFaq')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
