import React, { Suspense } from 'react';
import type { Metadata } from 'next';
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
  return {
    title:
      lang === 'en'
        ? 'Deep URL & Fake Discount Inspector | Rate.vn'
        : lang === 'cs'
        ? 'Hloubkový audit URL a falešných slev | Rate.vn'
        : 'Trung Tâm Kiểm Toán Link Đa Sàn & Phát Hiện Giảm Giá Ảo | Rate.vn',
    description:
      lang === 'en'
        ? 'Paste any Shopee, Lazada, Tiki, or TikTok Shop link to verify true historical prices, Dual Merchant Risk Scores, and AI Review Seeding analysis.'
        : lang === 'cs'
        ? 'Vložte odkaz ze Shopee, Lazada nebo Tiki a ověřte skutečnou historii cen, duální skóre rizika obchodu a AI analýzu recenzí.'
        : 'Dán link sản phẩm Shopee, Lazada, Tiki, TikTok Shop để kiểm tra lịch sử giá thật, phát hiện nâng khống giá gốc và chấm điểm rủi ro kép của gian hàng.',
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
      <Suspense fallback={<div className="container py-5 text-center">Loading...</div>}>
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
