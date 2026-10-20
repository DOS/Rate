'use client';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Returns the signed-in user's Supabase access token, or null when nobody is signed
 * in. Write endpoints (reviews, votes, price alerts) require it as a Bearer token.
 */
export async function getBrowserAccessToken(): Promise<string | null> {
  try {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data.session?.access_token ?? null;
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
