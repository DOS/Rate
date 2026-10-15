import React from 'react';
import { Link } from '@/lib/navigation';
import { BsArrowLeftRight, BsBellFill, BsCodeSlash } from 'react-icons/bs';
import { getRateCopy } from '@/lib/rate-i18n';

export default function FooterTop({ locale = 'vi' }: { locale?: string }) {
  const copy = getRateCopy(locale);
  return (
    <section
      className="bg-cover bg-primary-2 position-relative py-5"
      style={{ backgroundImage: `url('/img/brand-section.png')` }}
    >
      <div className="container">
        <div className="row align-items-center justify-content-between g-4">
          <div className="col-xl-7 col-lg-7 col-md-12">
            <div className="callsTitles">
              <h4 className="text-white mb-2 lh-base fw-bold">
                {copy.footer.bannerTitle}
              </h4>
              <p className="text-white opacity-75 m-0">
                {copy.footer.bannerDesc}
              </p>
            </div>
          </div>

          <div className="col-xl-5 col-lg-5 col-md-12">
            <div className="d-flex flex-wrap justify-content-lg-end gap-2">
              <Link
                href="/watchlist"
                className="btn btn-whites rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2"
              >
                <BsBellFill className="text-primary" />
                {copy.footer.bannerCta}
              </Link>
              <Link
                href="/compare"
                className="btn btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2"
              >
                <BsArrowLeftRight />
                {copy.footer.bannerCompareCta}
              </Link>
              <Link
                href="/developers"
                className="btn btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-2"
              >
                <BsCodeSlash />
                REST API v1
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
