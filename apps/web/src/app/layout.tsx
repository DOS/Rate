import 'bootstrap/dist/css/bootstrap.css';
import './style/scss/style.scss';
import 'animate.css';
import BootstrapClient from './BootstrapClient';
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
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
          integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body>
        {children}
        {/* Bootstrap JS from the installed package (same version as the CSS above), not a CDN */}
        <BootstrapClient />
      </body>
    </html>
  );
}
