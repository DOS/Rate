import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import HeroSearchInspector from '@/components/home/HeroSearchInspector';
import CommunityQuarantineSubmitForm from '@/components/contact/CommunityQuarantineSubmitForm';
import { getMasterProducts } from '@/lib/rate-api';
import { getCachedMerchantsList } from '@/server/rate';
import {
  BsCodeSquare,
  BsEnvelopeAt,
  BsGithub,
  BsShieldExclamation,
  BsShop,
} from 'react-icons/bs';
import {
  HERO_MERCHANT_PRELOAD,
  toHeroMerchantSuggestions,
} from '@/lib/hero-merchants';
import { toHeroProductSuggestions } from '@/lib/hero-products';
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
  const t = await getTranslations({ locale, namespace: 'staticPages' });
  const alternates = {
    canonical: 'https://rate.vn/contact-us',
    languages: {
      vi: 'https://rate.vn/contact-us',
      en: 'https://rate.vn/contact-us',
      cs: 'https://rate.vn/contact-us',
    },
  };
  return {
    title: t('contactSeoTitle'),
    description: t('contactSeoDesc'),
    alternates,
  };
}

export default async function ContactUsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [products, merchants, t] = await Promise.all([
    getMasterProducts({ limit: 6 }),
    getCachedMerchantsList(),
    getTranslations({ locale, namespace: 'staticPages' }),
  ]);

  return (
    <ClientMessages scope="contact">
      <>
        <NavbarDarkDynamic links={[]} />

        <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
          <div className="container py-3">
            <div className="row justify-content-center mb-4 text-center">
              <div className="col-lg-9">
                <span className="badge bg-danger rounded-pill fw-semibold mb-3 px-3 py-2">
                  <BsShieldExclamation className="me-1" />{' '}
                  {t('contactHeroBadge')}
                </span>
                <h1 className="display-6 fw-bold mb-3 text-white">
                  {t('contactHeroTitle')}
                </h1>
                <p className="lead text-white-50 mb-0">
                  {t('contactHeroDesc')}
                </p>
              </div>
            </div>

            <div className="row justify-content-center">
              <div className="col-xl-9 col-lg-10">
                <HeroSearchInspector
                  initialProducts={toHeroProductSuggestions(products)}
                  initialMerchants={toHeroMerchantSuggestions(
                    merchants.slice(0, HERO_MERCHANT_PRELOAD)
                  )}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-light py-5">
          <div className="container">
            <div className="mb-4">
              <CommunityQuarantineSubmitForm />
            </div>

            <div className="row g-4">
              <div className="col-lg-4">
                <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                  <BsShieldExclamation className="text-danger fs-1 mb-3" />
                  <h4 className="h5 fw-bold mb-2">{t('contactCard1Title')}</h4>
                  <p className="text-muted small mb-3">
                    {t('contactCard1Desc')}
                  </p>
                  <Link
                    href="/smartphones"
                    className="btn btn-outline-danger rounded-pill fw-medium mt-auto"
                  >
                    {t('contactCard1Btn')}
                  </Link>
                </div>
              </div>

              <div className="col-lg-4">
                <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                  <BsShop className="text-primary fs-1 mb-3" />
                  <h4 className="h5 fw-bold mb-2">{t('contactCard2Title')}</h4>
                  <p className="text-muted small mb-3">
                    {t('contactCard2Desc')}
                  </p>
                  <Link
                    href="/merchants"
                    className="btn btn-outline-primary rounded-pill fw-medium mt-auto"
                  >
                    {t('contactCard2Btn')}
                  </Link>
                </div>
              </div>

              <div className="col-lg-4">
                <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                  <BsCodeSquare className="text-success fs-1 mb-3" />
                  <h4 className="h5 fw-bold mb-2">{t('contactCard3Title')}</h4>
                  <p className="text-muted small mb-3">
                    {t('contactCard3Desc')}
                  </p>
                  <div className="d-flex mt-auto flex-wrap gap-2">
                    <a
                      href="https://github.com/DOS/Rate/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-dark rounded-pill fw-medium d-inline-flex align-items-center gap-2 px-3"
                    >
                      <BsGithub /> {t('contactCard3GithubBtn')}
                    </a>
                    <Link
                      href="/developers"
                      className="btn btn-outline-success rounded-pill fw-medium px-3"
                    >
                      {t('contactCard3ApiBtn')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="card rounded-4 mt-4 border bg-white p-4 shadow-sm">
              <div className="row align-items-center g-3">
                <div className="col-lg-8">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: '52px', height: '52px' }}
                    >
                      <BsEnvelopeAt className="fs-4" />
                    </div>
                    <div>
                      <h5 className="fw-bold mb-1">
                        {t('contactFooterTitle')}
                      </h5>
                      <p className="text-muted small mb-0">
                        {t('contactFooterDescPrefix')}{' '}
                        <code>security@rate.vn</code>{' '}
                        {t('contactFooterDescMiddle')}{' '}
                        <code>github.com/DOS/Rate</code>.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4 text-lg-end">
                  <Link
                    href="/faq"
                    className="btn btn-primary rounded-pill fw-medium px-4"
                  >
                    {t('contactFooterFaqBtn')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <FooterTop locale={locale} />
        <FooterDynamic sections={[]} links={[]} locale={locale} />
        <BackToTop />
      </>
    </ClientMessages>
  );
}
