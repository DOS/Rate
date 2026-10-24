import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { normalizeRateLocale } from '@/lib/rate-i18n';

// Rendered per request: caching would store one 404 entry for every path a
// scanner tries (DOS/Rate#491).
export const dynamic = 'force-dynamic';

// Titled as a 404 rather than with the site's default title (DOS/Rate#877).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: normalizeRateLocale(locale),
    namespace: 'errors.notFound',
  });
  return { title: `${t('title')} | Rate.vn` };
}

// Unknown paths get the localized not-found page of this segment instead of
// the bare root one.
export default function UnknownPage() {
  notFound();
}
