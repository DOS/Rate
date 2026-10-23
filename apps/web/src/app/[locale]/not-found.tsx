import { getTranslations } from 'next-intl/server';
import {
  BsArrowLeftRight,
  BsEarbuds,
  BsLaptop,
  BsPhone,
  BsShieldCheck,
  BsSmartwatch,
  BsTablet,
} from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import PageShell from './components/page-shell';

export default async function NotFound() {
  const t = await getTranslations('errors.notFound');
  const tCat = await getTranslations('leaderboard');

  return (
    <PageShell footerTop={false}>
      <section className="bg-light py-5">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <div className="card rounded-4 p-md-5 border-0 bg-white p-4 text-center shadow-sm">
                <div className="mb-3">
                  <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill fw-semibold px-3 py-2">
                    404 - Rate.vn Catalog
                  </span>
                </div>
                <h1 className="h2 fw-bold text-dark mb-3">{t('title')}</h1>
                <p className="text-muted mb-2">{t('description')}</p>
                <p className="small text-secondary mb-4">{t('solution')}</p>

                <div className="d-flex justify-content-center mb-4 flex-wrap gap-2">
                  <Link
                    href="/"
                    className="btn btn-danger rounded-pill fw-semibold px-4"
                  >
                    {t('redirect')}
                  </Link>
                  <Link
                    href="/compare"
                    className="btn btn-outline-dark rounded-pill fw-medium px-4"
                  >
                    <BsArrowLeftRight aria-hidden="true" className="me-1" />
                    {t('compareCta')}
                  </Link>
                  <Link
                    href="/merchants"
                    className="btn btn-outline-secondary rounded-pill fw-medium px-4"
                  >
                    <BsShieldCheck aria-hidden="true" className="me-1" />
                    {t('merchantsCta')}
                  </Link>
                </div>

                <div className="border-top d-flex justify-content-center flex-wrap gap-2 pt-4">
                  <Link
                    href="/smartphones"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    <BsPhone aria-hidden="true" className="me-1" />
                    {tCat('tabSmartphones')}
                  </Link>
                  <Link
                    href="/laptops"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    <BsLaptop aria-hidden="true" className="me-1" />
                    {tCat('tabLaptops')}
                  </Link>
                  <Link
                    href="/tablets"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    <BsTablet aria-hidden="true" className="me-1" />
                    {tCat('tabTablets')}
                  </Link>
                  <Link
                    href="/smartwatches"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    <BsSmartwatch aria-hidden="true" className="me-1" />
                    {tCat('tabSmartwatches')}
                  </Link>
                  <Link
                    href="/earbuds"
                    className="btn btn-sm btn-light rounded-pill px-3"
                  >
                    <BsEarbuds aria-hidden="true" className="me-1" />
                    {tCat('tabEarbuds')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
