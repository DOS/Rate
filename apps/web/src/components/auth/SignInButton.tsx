'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SignInButton({ className }: { className?: string }) {
  const t = useTranslations('authPortal');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    try {
      const supabase = getBrowserSupabase();
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
  const label = t('signInBtnLabel');

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
