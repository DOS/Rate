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
  /** `headers` are the cache headers @supabase/ssr requires on any response
   * that sets auth cookies (Cache-Control: private, no-store, ...). */
  setAll?(
    cookies: { name: string; value: string; options: CookieWriteOptions }[],
    headers: Record<string, string>
  ): void;
}

export function supabasePublicEnv(): { url: string; anonKey: string } | null {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const rawAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  const url =
    typeof rawUrl === 'string' ? rawUrl.replace(/\p{Cc}+/gu, '').trim() : '';
  const anonKey =
    typeof rawAnonKey === 'string'
      ? rawAnonKey.replace(/\p{Cc}+/gu, '').trim()
      : '';
  return url && anonKey ? { url, anonKey } : null;
}

/** Supabase stores the session in `sb-<project>-auth-token` cookies (possibly chunked). */
export function hasSupabaseAuthCookie(cookies: CookieRecord[]): boolean {
  if (!Array.isArray(cookies)) return false;
  return cookies.some(
    (c) =>
      Boolean(c) &&
      typeof c.name === 'string' &&
      c.name.startsWith('sb-') &&
      c.name.includes('-auth-token') &&
      typeof c.value === 'string' &&
      Boolean(c.value.replace(/\p{Cc}+/gu, '').trim())
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
      setAll: (cookies, headers) => adapter.setAll?.(cookies, headers ?? {}),
    },
  });
}
