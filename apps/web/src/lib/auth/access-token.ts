'use client';

/**
 * Returns the signed-in user's Supabase access token, or null when nobody is signed
 * in. Write endpoints (reviews, votes, price alerts) require it as a Bearer token.
 * The Supabase client loads on the first call, when the user writes, so pages
 * that only read do not ship it (DOS/Rate#756).
 */
export const MAX_BROWSER_ACCESS_TOKEN_LENGTH = 16_384;

export function sanitizeBrowserAccessToken(rawToken: unknown): string | null {
  if (typeof rawToken !== 'string') return null;
  const trimmed = rawToken.replace(/\p{Cc}+/gu, '').trim();
  if (
    !trimmed ||
    trimmed.length > MAX_BROWSER_ACCESS_TOKEN_LENGTH ||
    /\s/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export async function getBrowserAccessToken(): Promise<string | null> {
  try {
    const { getBrowserSupabase } = await import('@/lib/supabase/browser');
    const { data } = await getBrowserSupabase().auth.getSession();
    return sanitizeBrowserAccessToken(data.session?.access_token);
  } catch {
    return null;
  }
}

export async function authorizedJsonHeaders(): Promise<Record<
  string,
  string
> | null> {
  const token = await getBrowserAccessToken();
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Headers for a same-origin write the user asked for. Adds the Bearer token when
 * the browser client has a session; without one the request still goes out, so
 * the route can authenticate the @supabase/ssr cookie session itself and answer
 * 401 when nobody is signed in.
 */
export async function jsonWriteHeaders(): Promise<Record<string, string>> {
  const token = await getBrowserAccessToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
