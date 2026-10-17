/**
 * @repo/shared-data/server
 *
 * Service-role Supabase clients (bypass RLS). For background crawlers, ingestion
 * pipelines and admin jobs only. apps/web must not import this entry: its ESLint
 * config forbids it, because a public route using these clients skips every RLS
 * policy and grant on the `rate` schema.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let _adminClient: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (service role, bypassing RLS).
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}

/**
 * Get a client scoped to the 'rate' schema with admin privileges.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRateClient(): SupabaseClient<any, 'rate'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getAdminClient() as any).schema('rate');
}

/**
 * Get a client scoped to the 'dosafe' schema for querying threat intelligence.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDosafeClient(): SupabaseClient<any, 'dosafe'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getAdminClient() as any).schema('dosafe');
}
