'use client';

import { getPublicClient } from '@repo/shared-data';

/**
 * Returns the signed-in user's Supabase access token, or null when nobody is signed
 * in. Write endpoints (reviews, votes, price alerts) require it as a Bearer token.
 */
export async function getBrowserAccessToken(): Promise<string | null> {
  try {
    const { data } = await getPublicClient().auth.getSession();
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
