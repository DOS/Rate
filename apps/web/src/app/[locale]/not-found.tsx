import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from './components/navbar/NavbarDarkDynamic';
import FooterDynamic from './components/footer/FooterDynamic';
import BackToTop from './components/back-to-top';

export default async function NotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <section className="bg-light py-5">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <div className="card border-0 rounded-4 shadow-sm p-4 p-md-5 text-center bg-white">
                <div className="mb-3">
                  <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill px-3 py-2 fw-semibold">
                    404 - Rate.vn Catalog
                  </span>
                </div>
                <h1 className="h2 fw-bold text-dark mb-3">{t('title')}</h1>
                <p className="text-muted mb-2">{t('description')}</p>
                <p className="small text-secondary mb-4">{t('solution')}</p>

                <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
                  <Link
                    href="/"
                    className="btn btn-danger rounded-pill px-4 fw-semibold"
                  >
                    {t('redirect')}
                  </Link>
                  <Link
                    href="/compare"
                    className="btn btn-outline-dark rounded-pill px-4 fw-medium"
                  >
                    ⚖️ Compare 10 Spec Groups
                  </Link>
                  <Link
                    href="/merchants"
                    className="btn btn-outline-secondary rounded-pill px-4 fw-medium"
                  >
                    🛡️ Merchant Trust
                  </Link>
                </div>

                <div className="pt-4 border-top d-flex flex-wrap justify-content-center gap-2">
                  <Link
                    href="/smartphones"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    📱 Smartphones
                  </Link>
                  <Link
                    href="/laptops"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    💻 Laptops
                  </Link>
                  <Link
                    href="/tablets"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    📟 Tablets
                  </Link>
                  <Link
                    href="/smartwatches"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    ⌚ Smartwatches
                  </Link>
                  <Link
                    href="/earbuds"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    🎧 Earbuds
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <FooterDynamic sections={[]} links={[]} />
      <BackToTop />
    </>
  );
}
