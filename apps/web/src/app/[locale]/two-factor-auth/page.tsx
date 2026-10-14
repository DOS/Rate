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
        ? 'Email OTP & Two-Factor Verification | Rate.vn'
        : lang === 'cs'
        ? 'Dvoufázové ověření a OTP | Rate.vn'
        : 'Xác Thực Hai Lớp & Mã OTP Email | Rate.vn',
  };
}

export default async function TwoFactorAuthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <Suspense fallback={<div className="container py-5 text-center">Loading...</div>}>
        <RateAuthPortal mode="two-factor-auth" locale={locale} />
      </Suspense>
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
