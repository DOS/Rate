/**
 * Centralized Supabase client for Rate platform.
 * Provides access to both 'rate' and 'dosafe' schemas.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

let _adminClient: SupabaseClient | null = null;
let _publicClient: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (service role, bypassing RLS).
 * Used by background crawlers, ingestion pipelines, and admin ops.
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
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

/**
 * Get public anon client (respects RLS) for browser / client-side components.
 */
export function getPublicClient(): SupabaseClient {
  if (!_publicClient) {
    _publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY);
  }
  return _publicClient;
}
