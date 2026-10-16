'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getPublicClient } from '@repo/shared-data';
import { normalizeRateLocale } from '@/lib/rate-i18n';

export function SignInButton({ className }: { className?: string }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const locale = normalizeRateLocale(params?.locale);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getPublicClient();
      supabase.auth.getSession().then(({ data }) => {
        if (active) setIsAuthenticated(Boolean(data.session));
      });
    } catch {
      // Ignore client initialization errors in SSR/CI placeholder environments
    }
    return () => {
      active = false;
    };
  }, []);

  if (isAuthenticated) return null;

  const targetHref = '/login';
  const label =
    locale === 'en'
      ? 'Sign In'
      : locale === 'cs'
        ? 'Přihlásit se'
        : 'Đăng nhập';

  return (
    <button
      type="button"
      className={className ?? 'btn btn-outline-danger rounded-pill btn-sm px-3'}
      onClick={() => router.push(targetHref)}
      aria-label={label}
    >
      {label}
    </button>
  );
}
