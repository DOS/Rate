import 'bootstrap/dist/css/bootstrap.css';
import './style/scss/style.scss';
import BootstrapClient from './BootstrapClient';
import { fontFaces } from '@/lib/fonts';
import { getLocale } from 'next-intl/server';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let locale = 'vi';
  try {
    locale = await getLocale();
  } catch {
    locale = 'vi';
  }

  return (
    <html
      lang={locale}
      className={fontFaces.map((font) => font.variable).join(' ')}
    >
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        {children}
        {/* Bootstrap JS from the installed package (same version as the CSS above), not a CDN */}
        <BootstrapClient />
      </body>
    </html>
  );
}
