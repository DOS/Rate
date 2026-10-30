import Link from 'next/link';

import { PAGE_META_CSP } from '@/lib/csp';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

// Only reached outside the [locale] segment, which renders its own branded
// page. The root layout has no <html>, so this page brings its own.
export default function RootNotFound() {
  return (
    // The theme script may set data-bs-theme before hydration (#1435).
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta httpEquiv="Content-Security-Policy" content={PAGE_META_CSP} />
      </head>
      <body>
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
          <h1>404</h1>
          <p>
            <Link href="/">Rate.vn</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
