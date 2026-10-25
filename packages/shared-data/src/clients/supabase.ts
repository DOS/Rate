/**
 * Public (anon) Supabase client for the Rate platform.
 *
 * Service-role clients live in `@repo/shared-data/server` so that code shipped to
 * browsers or exposed through public web routes never imports a client that
 * bypasses RLS.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _publicClient: SupabaseClient | null = null;

/**
 * Get the public anon client (respects RLS) for browser / client-side components.
 * Throws when the anon key is missing instead of falling back to a privileged key.
 */
export function isValidSupabaseHttpUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > 512 ||
    /\p{Cc}/u.test(trimmed) ||
    /\s/.test(trimmed)
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname) &&
      !parsed.hostname.startsWith('.') &&
      !parsed.hostname.endsWith('.') &&
      !parsed.hostname.includes('..') &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

export function isValidSupabaseApiKey(rawKey: string): boolean {
  if (typeof rawKey !== 'string') return false;
  const trimmed = rawKey.trim();
  return (
    trimmed.length >= 8 &&
    trimmed.length <= 4096 &&
    !/\p{Cc}/u.test(trimmed) &&
    !/\s/.test(trimmed)
  );
}

export function getPublicClient(): SupabaseClient {
  if (!_publicClient) {
    const supabaseUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      ''
    ).trim();
    const supabaseAnonKey = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      ''
    ).trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    }
    if (!isValidSupabaseHttpUrl(supabaseUrl)) {
      throw new Error(
        'Invalid NEXT_PUBLIC_SUPABASE_URL: must use http:// or https:// protocol.'
      );
    }
    if (!isValidSupabaseApiKey(supabaseAnonKey)) {
      throw new Error(
        'Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY: must be a non-empty token without whitespace or control characters.'
      );
    }
    _publicClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _publicClient;
}
