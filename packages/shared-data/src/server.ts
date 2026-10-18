/**
 * @repo/shared-data/server
 *
 * Service-role Supabase clients (bypass RLS). For background crawlers, ingestion
 * pipelines and admin jobs only. apps/web must not import this entry: its ESLint
 * config forbids it, because a public route using these clients skips every RLS
 * policy and grant on the `rate` schema.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type SchemaScopedSupabaseClient = ReturnType<SupabaseClient['schema']>;

let _adminClient: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (service role, bypassing RLS).
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
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
