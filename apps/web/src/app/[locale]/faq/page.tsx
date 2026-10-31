import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import PageShell from '../components/page-shell';
import { BsQuestionCircleFill, BsShieldCheck } from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'staticPages' });
  const alternates = {
    canonical: 'https://rate.vn/faq',
    // One URL serves every locale (cookie), so no hreflang alternates (DOS/Rate#765).
  };
  return {
    title: t('faqSeoTitle'),
    description: t('faqSeoDesc'),
    alternates,
  };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'staticPages' });

  const faqItems = [
    { q: t('faqQ1'), a: t('faqA1') },
    { q: t('faqQ2'), a: t('faqA2') },
    { q: t('faqQ3'), a: t('faqA3') },
    { q: t('faqQ4'), a: t('faqA4') },
    { q: t('faqQ5'), a: t('faqA5') },
    { q: t('faqQ6'), a: t('faqA6') },
    { q: t('faqQ7'), a: t('faqA7') },
  ];

  return (
    <PageShell locale={locale}>
      <section
        className="hero-banner rate-surface-dark rate-ink-on-dark border-bottom border-secondary border-opacity-25 py-5 text-white"
        style={{ background: 'var(--bs-dark)' }}
      >
        <div className="container py-3 text-center">
          <span className="badge bg-primary rounded-pill fw-semibold mb-3 px-3 py-2">
            <BsQuestionCircleFill className="me-1" /> {t('faqHeroBadge')}
          </span>
          <h1 className="display-6 fw-bold mb-3 text-white">
            {t('faqHeroTitle')}
          </h1>
          <p
            className="lead text-white-50 mx-auto mb-0"
            style={{ maxWidth: '720px' }}
          >
            {t('faqHeroSubtitle')}
          </p>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-10">
              <div className="d-flex flex-column gap-3">
                {faqItems.map((item) => (
                  <div
                    key={item.q}
                    className="card rounded-4 border bg-white p-4 shadow-sm"
                  >
                    <h2 className="h5 fw-bold text-dark mb-2">{item.q}</h2>
                    <p className="text-secondary mb-0">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="card rounded-4 border-primary border-opacity-25 mt-4 border bg-white p-4 shadow-sm">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <div>
                    <h2 className="h5 fw-bold mb-1">
                      <BsShieldCheck className="text-primary me-2" />
                      {t('faqCtaTitle')}
                    </h2>
                    <p className="text-muted small mb-0">{t('faqCtaDesc')}</p>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Link
                      href="/developers"
                      className="btn btn-outline-primary rounded-pill fw-medium px-4"
                    >
                      {t('faqBtnPlayground')}
                    </Link>
                    <Link
                      href="/contact-us"
                      className="btn btn-primary rounded-pill fw-medium px-4"
                    >
                      {t('faqBtnContact')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
