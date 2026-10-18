'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations('authPortal');
  const router = useRouter();
  const callbackUrl = '/';
  const label = t('signOutBtnLabel');

  const handleSignOut = async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {
      // Ignore client sign-out error
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <button
      type="button"
      className={
        className ?? 'btn btn-outline-secondary rounded-pill btn-sm px-3'
      }
      onClick={handleSignOut}
      aria-label={label}
    >
      {label}
    </button>
  );
}
