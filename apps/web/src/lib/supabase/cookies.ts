import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CookieRecord {
  name: string;
  value: string;
}

export interface CookieWriteOptions {
  [key: string]: unknown;
}

export interface CookieAdapter {
  getAll(): CookieRecord[];
  setAll?(
    cookies: { name: string; value: string; options: CookieWriteOptions }[]
  ): void;
}

export function supabasePublicEnv(): { url: string; anonKey: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return url && anonKey ? { url, anonKey } : null;
}

/** Supabase stores the session in `sb-<project>-auth-token` cookies (possibly chunked). */
export function hasSupabaseAuthCookie(cookies: CookieRecord[]): boolean {
  return cookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );
}

/** A server client that reads (and, when setAll is given, refreshes) the cookie session. */
export function createCookieSupabase(
  adapter: CookieAdapter
): SupabaseClient | null {
  const env = supabasePublicEnv();
  if (!env) return null;
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => adapter.getAll(),
      setAll: (cookies) => adapter.setAll?.(cookies),
    },
  });
}
