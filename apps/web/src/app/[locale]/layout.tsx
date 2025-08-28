import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "ListingHub - Next Ts Business Directory & Listing Template",
  description: "ListingHub - Next Ts Business Directory & Listing Template",
};

export default function LocaleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
