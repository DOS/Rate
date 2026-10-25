/**
 * @repo/shared-data/server
 *
 * Service-role Supabase clients (bypass RLS). For background crawlers, ingestion
 * pipelines and admin jobs only. apps/web must not import this entry: its ESLint
 * config forbids it, because a public route using these clients skips every RLS
 * policy and grant on the `rate` schema.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  isValidSupabaseApiKey,
  isValidSupabaseHttpUrl,
} from './clients/supabase.js';

export type SchemaScopedSupabaseClient = ReturnType<SupabaseClient['schema']>;
export { isValidSupabaseApiKey, isValidSupabaseHttpUrl };

let _adminClient: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (Supabase secret key, bypassing RLS).
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const supabaseUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      ''
    ).trim();
    const supabaseServiceKey = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.'
      );
    }
    if (!isValidSupabaseHttpUrl(supabaseUrl)) {
      throw new Error(
        'Invalid SUPABASE_URL: must use http:// or https:// protocol.'
      );
    }
    if (!isValidSupabaseApiKey(supabaseServiceKey)) {
      throw new Error(
        'Invalid SUPABASE_SECRET_KEY: must be a non-empty token without whitespace or control characters.'
      );
    }
    _adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}

/**
 * Get a client scoped to the 'rate' schema with admin privileges.
 */
export function getRateClient(): SchemaScopedSupabaseClient {
  return getAdminClient().schema('rate');
}

/**
 * Get a client scoped to the 'dosafe' schema for querying threat intelligence.
 */
export function getDosafeClient(): SchemaScopedSupabaseClient {
  return getAdminClient().schema('dosafe');
}
