import { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css'
import 'animate.css/animate.css'
import './style/scss/style.scss'
import BootstrapClient from './BootstrapClient'



export const metadata: Metadata = {
  title: "ListingHub - Next Ts Business Directory & Listing Template",
  description: "ListingHub - Next Ts Business Directory & Listing Template",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
       <head>
        <meta name="darkreader-lock" />
        <style>{`
          :root{
            --bs-primary:#e21e3d;
            --bs-primary-2:#e21e3d;
            --bs-primary-rgb:226,30,61;
            --bs-link-color:#e21e3d;
            --bs-link-hover-color:#b71831;
            --bs-primary-bg-subtle: rgba(226,30,61,0.10);
            --bs-primary-border-subtle: rgba(226,30,61,0.25);
            --bs-primary-bg-dark:#b71831;
          }
        `}</style>
       </head>
      <body className={``}>
        <BootstrapClient />
        {children}
      </body>
    </html>
  );
}
