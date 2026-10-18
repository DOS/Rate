import { Link } from '@/lib/navigation';
import {
  BsArrowLeftRight,
  BsBellFill,
  BsCodeSlash,
  BsShieldCheck,
} from 'react-icons/bs';
import { getRateCopy } from '@/lib/rate-i18n';

export default function FooterTop({ locale = 'vi' }: { locale?: string }) {
  const copy = getRateCopy(locale);
  return (
    <section
      className="position-relative py-5"
      style={{
        background:
          'linear-gradient(135deg, #0b0d11 0%, #131824 60%, #1a1f2e 100%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="container">
        <div className="row align-items-center justify-content-between g-4">
          <div className="col-xl-7 col-lg-7 col-md-12">
            <div className="d-flex flex-column gap-2">
              <div className="d-inline-flex align-items-center gap-2">
                <span
                  className="badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-1"
                  style={{
                    backgroundColor: 'rgba(45, 186, 105, 0.14)',
                    color: '#34d399',
                    border: '1px solid rgba(45, 186, 105, 0.3)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  <BsShieldCheck />
                  Open-Core Rating &amp; Anti-Seeding Engine
                </span>
              </div>
              <h4
                className="lh-base fw-bold mb-1 text-white"
                style={{ letterSpacing: '-0.02em' }}
              >
                {copy.footer.bannerTitle}
              </h4>
              <p
                className="m-0"
                style={{ color: '#94a3b8', fontSize: '0.95rem' }}
              >
                {copy.footer.bannerDesc}
              </p>
            </div>
          </div>

          <div className="col-xl-5 col-lg-5 col-md-12">
            <div className="d-flex justify-content-lg-end flex-wrap gap-2">
              <Link
                href="/inspect"
                className="btn rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2 text-white"
                style={{
                  backgroundColor: 'var(--bs-primary)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                <BsShieldCheck />
                Kiểm định Review &amp; Giá
              </Link>
              <Link
                href="/compare"
                className="btn btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2"
                style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}
              >
                <BsArrowLeftRight />
                {copy.footer.bannerCompareCta}
              </Link>
              <Link
                href="/watchlist"
                className="btn btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-2"
                style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}
              >
                <BsBellFill />
                {copy.footer.bannerCta}
              </Link>
              <Link
                href="/developers"
                className="btn btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-2"
                style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}
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
