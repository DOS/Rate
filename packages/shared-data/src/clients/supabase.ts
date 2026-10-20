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
function isValidSupabaseHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
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
    _publicClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _publicClient;
}
