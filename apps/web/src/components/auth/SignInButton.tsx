'use client';

import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import React from 'react';
import { normalizeRateLocale } from '@/lib/rate-i18n';

export function SignInButton({ className }: { className?: string }) {
  const { status } = useSession();
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const locale = normalizeRateLocale(params?.locale);

  if (status === 'authenticated') return null;

  const targetHref = locale === 'vi' ? '/login' : `/${locale}/login`;
  const label =
    locale === 'en' ? 'Sign In' : locale === 'cs' ? 'Přihlásit se' : 'Đăng nhập';

  return (
    <button
      type="button"
      className={className ?? 'btn btn-outline-danger rounded-pill px-3 btn-sm'}
      onClick={() => router.push(targetHref)}
      aria-label={label}
    >
      {label}
    </button>
  );
}
