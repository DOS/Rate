import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import RateAuthPortal from '@/components/auth/RateAuthPortal';
import ClientMessages from '@/components/providers/ClientMessages';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'authPortal' });
  return {
    title: t('metaLoginTitle'),
    // Sign-in screens are not search results (DOS/Rate#746).
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'authPortal' });
  return (
    <ClientMessages scope="auth">
      <>
        <NavbarDarkDynamic links={[]} />
        <Suspense
          fallback={
            <div className="rate-island-fallback container py-5 text-center">
              {t('loadingFallback')}
            </div>
          }
        >
          <RateAuthPortal mode="login" locale={locale} />
        </Suspense>
        <FooterTop locale={locale} />
        <FooterDynamic sections={[]} links={[]} locale={locale} />
        <BackToTop />
      </>
    </ClientMessages>
  );
}
