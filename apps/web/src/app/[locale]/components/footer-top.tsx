import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  BsArrowLeftRight,
  BsBell,
  BsCodeSlash,
  BsShieldCheck,
} from 'react-icons/bs';

export default async function FooterTop({
  // Without a locale the request locale is used (DOS/Rate#646).
  locale,
}: {
  locale?: string;
}) {
  const tFooter = await getTranslations({
    locale: locale ?? (await getLocale()),
    namespace: 'rate.footer',
  });
  return (
    // Named by its title, so the band is a region landmark of its own after
    // <main>. h2: it follows whatever level the page ended on (DOS/Rate#764).
    <section
      className="rate-footer-cta rate-surface-dark py-5"
      aria-labelledby="rate-footer-cta-title"
    >
      <div className="container">
        <div className="row align-items-center justify-content-between g-4">
          <div className="col-lg-7 col-md-12">
            <span className="rate-eyebrow mb-2">{tFooter('bannerBadge')}</span>
            <h2 id="rate-footer-cta-title" className="rate-footer-cta-title">
              {tFooter('bannerTitle')}
            </h2>
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
