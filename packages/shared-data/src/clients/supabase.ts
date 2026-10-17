/**
 * Public (anon) Supabase client for the Rate platform.
 *
 * Service-role clients live in `@repo/shared-data/server` so that code shipped to
 * browsers or exposed through public web routes never imports a client that
 * bypasses RLS.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  '';

let _publicClient: SupabaseClient | null = null;

/**
 * Get the public anon client (respects RLS) for browser / client-side components.
 * Throws when the anon key is missing instead of falling back to a privileged key.
 */
export function getPublicClient(): SupabaseClient {
  if (!_publicClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    }
    _publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _publicClient;
}
