import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCachedInspectProductOrShopUrl } from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import DeepInspectWorkspace from '@/components/inspect/DeepInspectWorkspace';
import ClientMessages from '@/components/providers/ClientMessages';

// Reads searchParams, so it renders per request. The [locale] layout's
// generateStaticParams would otherwise make it static, and the searchParams
// read would then fail with DYNAMIC_SERVER_USAGE (DOS/Rate#491).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { locale } = await params;
  const sp = await searchParams;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'inspect' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: 'https://rate.vn/inspect',
    },
    // Every query renders its own result page; only the tool itself is a
    // search result (DOS/Rate#746).
    ...(sp.q || sp.url ? { robots: { index: false, follow: true } } : {}),
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
  setRequestLocale(locale);
  const t = await getTranslations({
    locale: normalizeRateLocale(locale),
    namespace: 'inspect',
  });
  const sp = await searchParams;
  const rawQ = sp.q ?? sp.url ?? '';
  const initialQuery = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim() || '';

  const initialInspection = initialQuery
    ? await getCachedInspectProductOrShopUrl(initialQuery).catch(() => null)
    : null;

  return (
    <ClientMessages scope="inspect">
      <>
        <NavbarDarkDynamic links={[]} />
        <Suspense
          fallback={
            <div className="rate-island-fallback container py-5 text-center">
              {t('loading')}
            </div>
          }
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
    </ClientMessages>
  );
}
