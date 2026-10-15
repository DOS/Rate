import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import RateAuthPortal from '@/components/auth/RateAuthPortal';
import { normalizeRateLocale } from '@/lib/rate-i18n';

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
        ? 'Create a Buyer Audit Account | Rate.vn'
        : lang === 'cs'
        ? 'Vytvořit účet | Rate.vn'
        : 'Đăng Ký Tài Khoản Rate.vn | Cộng Đồng Kiểm Toán Giá Thật & Thông Số',
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <Suspense fallback={<div className="container py-5 text-center">Loading...</div>}>
        <RateAuthPortal mode="register" locale={locale} />
      </Suspense>
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
