import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  BsArrowLeftRight,
  BsBell,
  BsCodeSlash,
  BsShieldCheck,
} from 'react-icons/bs';

export default async function FooterTop({
  locale = 'vi',
}: {
  locale?: string;
}) {
  const tFooter = await getTranslations({ locale, namespace: 'rate.footer' });
  return (
    <section className="rate-footer-cta rate-surface-dark py-5">
      <div className="container">
        <div className="row align-items-center justify-content-between g-4">
          <div className="col-lg-7 col-md-12">
            <span className="rate-eyebrow mb-2">{tFooter('bannerBadge')}</span>
            <h4 className="rate-footer-cta-title">{tFooter('bannerTitle')}</h4>
            <p className="rate-footer-cta-desc">{tFooter('bannerDesc')}</p>
          </div>

          <div className="col-lg-5 col-md-12">
            <div className="rate-footer-cta-actions">
              <Link href="/inspect" className="btn btn-primary fw-semibold">
                <BsShieldCheck aria-hidden="true" />
                {tFooter('bannerInspectCta')}
              </Link>
              <Link
                href="/compare"
                className="btn btn-outline-light fw-semibold"
              >
                <BsArrowLeftRight aria-hidden="true" />
                {tFooter('bannerCompareCta')}
              </Link>
            </div>
            <div className="rate-section-links rate-footer-cta-links">
              <Link href="/watchlist">
                <BsBell aria-hidden="true" />
                {tFooter('bannerCta')}
              </Link>
              <Link href="/developers">
                <BsCodeSlash aria-hidden="true" />
                {tFooter('bannerApiLink')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
