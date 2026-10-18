import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import DeepInspectWorkspace from '@/components/inspect/DeepInspectWorkspace';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'inspect' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: 'https://rate.vn/inspect',
    },
  };
}

export default async function InspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const rawQ = sp.q ?? sp.url ?? '';
  const initialQuery = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim() || '';

  const initialInspection = initialQuery
    ? await getCachedInspectProductOrShopUrl(initialQuery).catch(() => null)
    : null;

  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <Suspense
        fallback={<div className="container py-5 text-center">Loading...</div>}
      >
        <DeepInspectWorkspace
          initialQuery={initialQuery}
          initialInspection={initialInspection}
          locale={locale}
        />
      </Suspense>
      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
