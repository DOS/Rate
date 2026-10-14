'use client';

import { signOut } from 'next-auth/react';
import { useParams } from 'next/navigation';
import React from 'react';
import { getPublicClient } from '@repo/shared-data';
import { normalizeRateLocale } from '@/lib/rate-i18n';

export function SignOutButton({ className }: { className?: string }) {
  const params = useParams<{ locale: string }>();
  const locale = normalizeRateLocale(params?.locale);
  const callbackUrl = locale === 'vi' ? '/' : `/${locale}`;
  const label =
    locale === 'en' ? 'Sign Out' : locale === 'cs' ? 'Odhlásit se' : 'Đăng xuất';

  const handleSignOut = async () => {
    try {
      const supabase = getPublicClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore client sign-out error and proceed with NextAuth session sign-out
    }
    await signOut({ callbackUrl });
  };

  return (
    <button
      type="button"
      className={className ?? 'btn btn-outline-secondary rounded-pill px-3 btn-sm'}
      onClick={handleSignOut}
      aria-label={label}
    >
      {label}
    </button>
  );
}
