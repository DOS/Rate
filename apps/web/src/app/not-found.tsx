import type { Metadata } from 'next';
import Link from 'next/link';

import { PAGE_META_CSP } from '@/lib/csp';
import { fontFaces } from '@/lib/fonts';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import vi from '../../locales/vi.json';

// The 404 of every path no route matches: unknown paths (the proxy sends them
// to /vi/<path>, under which nothing matches) and dotted paths (the
// afterFiles rewrite in next.config.mjs). Next server-renders this page for
// them with status 404. A page-level notFound() instead gets Next's empty
// `__next_error__` shell, whatever boundary is nearest (DOS/Rate#1463), which
// is why there is no [locale]/[...rest] catch-all.
//
// Static and in Vietnamese for every visitor: there is no locale segment
// here, and reading the NEXT_LOCALE cookie would make the page dynamic, which
// is a 500 inside static routes (DOS/Rate#1373, #732). The root layout has no
// <html>, so this page brings its own.
const t = vi.errors.notFound;
const tCat = vi.leaderboard;

export const metadata: Metadata = {
  title: `${t.title} | Rate.vn`,
  description: t.description,
};

const CATEGORIES = [
  { href: '/smartphones', label: tCat.tabSmartphones },
  { href: '/laptops', label: tCat.tabLaptops },
  { href: '/tablets', label: tCat.tabTablets },
  { href: '/smartwatches', label: tCat.tabSmartwatches },
  { href: '/earbuds', label: tCat.tabEarbuds },
];

export default function RootNotFound() {
  return (
    <html
      lang="vi"
      className={fontFaces.map((font) => font.variable).join(' ')}
      // The theme script may set data-bs-theme before hydration (#1435).
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta httpEquiv="Content-Security-Policy" content={PAGE_META_CSP} />
      </head>
      <body>
        <main className="bg-light min-vh-100 py-5">
          <div className="container py-5">
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <div className="card rounded-4 p-md-5 border-0 bg-white p-4 text-center shadow-sm">
                  <p className="mb-3">
                    <Link
                      href="/"
                      className="fw-bold text-dark text-decoration-none fs-4"
                    >
                      Rate.vn
                    </Link>
                  </p>
                  <p className="mb-3">
                    <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill fw-semibold px-3 py-2">
                      404
                    </span>
                  </p>
                  <h1 className="h2 fw-bold text-dark mb-3">{t.title}</h1>
                  <p className="text-muted mb-2">{t.description}</p>
                  <p className="small text-secondary mb-4">{t.solution}</p>

                  <div className="d-flex justify-content-center mb-4 flex-wrap gap-2">
                    <Link
                      href="/"
                      className="btn btn-danger rounded-pill fw-semibold px-4"
                    >
                      {t.redirect}
                    </Link>
                    <Link
                      href="/compare"
                      className="btn btn-outline-dark rounded-pill fw-medium px-4"
                    >
                      {t.compareCta}
                    </Link>
                    <Link
                      href="/merchants"
                      className="btn btn-outline-secondary rounded-pill fw-medium px-4"
                    >
                      {t.merchantsCta}
                    </Link>
                  </div>

                  <nav aria-label={t.searchLabel} className="border-top pt-4">
                    <p className="small text-secondary mb-2">{t.searchLabel}</p>
                    <div className="d-flex justify-content-center flex-wrap gap-2">
                      {CATEGORIES.map(({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          className="btn btn-sm btn-light rounded-pill px-3"
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
