import type { Metadata } from 'next';

import { PAGE_META_CSP } from '@/lib/csp';
import { fontFaces } from '@/lib/fonts';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import vi from '../../locales/vi.json';

// The 404 of every path no route matches: unknown paths (the proxy rewrites
// them to /<locale>/<path>, under which nothing matches) and missing dotted
// paths (the afterFiles rewrite in next.config.mjs). Next server-renders this page for
// them with status 404. A page-level notFound() instead gets Next's empty
// `__next_error__` shell, whatever boundary is nearest (DOS/Rate#1463), which
// is why there is no [locale]/[...rest] catch-all.
//
// Static and in Vietnamese for every visitor: there is no locale segment
// here, and reading the NEXT_LOCALE cookie would make the page dynamic, which
// is a 500 inside static routes (DOS/Rate#1373, #732). The root layout has no
// <html>, so this page brings its own.
//
// Next puts this page into the flight data of every page (the root layout's
// not-found boundary), so it is kept small: plain links, few classes. A
// bigger one put the home page over its HTML budget (perf-budget.spec.ts).
const t = vi.errors.notFound;
const tCat = vi.leaderboard;

export const metadata: Metadata = {
  title: `${t.title} | Rate.vn`,
  description: t.description,
};

const CATEGORIES = [
  ['/smartphones', tCat.tabSmartphones],
  ['/laptops', tCat.tabLaptops],
  ['/tablets', tCat.tabTablets],
  ['/smartwatches', tCat.tabSmartwatches],
  ['/earbuds', tCat.tabEarbuds],
] as const;

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
        {/* The id PageShell gives the one <main> (landmarks.spec.ts). */}
        <main id="main-content" tabIndex={-1} className="container py-5">
          <h1 className="h2 fw-bold mb-3">{t.title}</h1>
          <p className="text-muted">{t.description}</p>
          <p>
            <a href="/" className="btn btn-danger rounded-pill px-4">
              {t.redirect}
            </a>
          </p>
          <nav aria-labelledby="nf-cat" className="border-top pt-3">
            <p id="nf-cat" className="small text-secondary mb-2">
              {t.searchLabel}
            </p>
            {CATEGORIES.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="btn btn-sm btn-light me-2 mb-2"
              >
                {label}
              </a>
            ))}
          </nav>
        </main>
      </body>
    </html>
  );
}
