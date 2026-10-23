import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PageShell from '../components/page-shell';
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
    title: t('metaOtpTitle'),
    // Sign-in screens are not search results (DOS/Rate#746).
    robots: { index: false, follow: true },
  };
}

export default async function TwoFactorAuthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'authPortal' });
  return (
    <ClientMessages scope="auth">
      <PageShell locale={locale}>
        <Suspense
          fallback={
            <div className="container py-5 text-center">
              {t('loadingFallback')}
            </div>
          }
        >
          <RateAuthPortal mode="two-factor-auth" locale={locale} />
        </Suspense>
      </PageShell>
    </ClientMessages>
  );
}
