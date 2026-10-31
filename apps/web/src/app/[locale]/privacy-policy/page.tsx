import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import PageShell from '../components/page-shell';
import { BsDatabaseLock, BsShieldCheck, BsShieldLock } from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'staticPages' });
  const alternates = {
    canonical: 'https://rate.vn/privacy-policy',
    // One URL serves every locale (cookie), so no hreflang alternates (DOS/Rate#765).
  };
  return {
    title: t('privacySeoTitle'),
    description: t('privacySeoDesc'),
    alternates,
  };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'staticPages' });

  return (
    <PageShell locale={locale}>
      <section
        className="hero-banner rate-surface-dark rate-ink-on-dark border-bottom border-secondary border-opacity-25 py-5 text-white"
        style={{ background: 'var(--bs-dark)' }}
      >
        <div className="container py-3">
          <span className="badge bg-success rounded-pill fw-semibold mb-3 px-3 py-2">
            <BsShieldLock className="me-1" /> {t('privacyHeroBadge')}
          </span>
          <h1 className="display-6 fw-bold mb-3 text-white">
            {t('privacyHeroTitle')}
          </h1>
          <p className="lead text-white-50 mb-0">{t('privacyHeroDesc')}</p>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="card rounded-4 p-md-5 border bg-white p-4 shadow-sm">
                <h2 className="h5 fw-bold mb-3">{t('privacyS1Title')}</h2>
                <p className="text-secondary mb-4">{t('privacyS1Desc')}</p>

                <h2 className="h5 fw-bold mb-3">{t('privacyS2Title')}</h2>
                <p className="text-secondary mb-4">{t('privacyS2Desc')}</p>

                <h2 className="h5 fw-bold mb-3">{t('privacyS3Title')}</h2>
                <p className="text-secondary mb-4">{t('privacyS3Desc')}</p>

                <h2 className="h5 fw-bold mb-3">{t('privacyS4Title')}</h2>
                <p className="text-secondary mb-4">{t('privacyS4Desc')}</p>

                <h2 className="h5 fw-bold mb-3">{t('privacyS5Title')}</h2>
                <p className="text-secondary mb-0">{t('privacyS5Desc')}</p>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 mb-4 border bg-white p-4 shadow-sm">
                <BsDatabaseLock className="text-primary fs-1 mb-3" />
                <h3 className="h5 fw-bold mb-2">{t('privacySide1Title')}</h3>
                <p className="text-muted small mb-3">{t('privacySide1Desc')}</p>
                <Link
                  href="/developers"
                  className="btn btn-outline-primary rounded-pill fw-medium w-100"
                >
                  {t('privacySide1Btn')}
                </Link>
              </div>

              <div className="card rounded-4 bg-dark border-0 p-4 text-white shadow-sm">
                <BsShieldCheck className="text-success fs-2 mb-2" />
                <h4 className="h5 fw-bold mb-2 text-white">
                  {t('privacySide2Title')}
                </h4>
                <p className="small text-white-50 mb-3">
                  {t('privacySide2Desc')}
                </p>
                <Link
                  href="/contact-us"
                  className="btn btn-danger rounded-pill fw-semibold w-100"
                >
                  {t('privacySide2Btn')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
