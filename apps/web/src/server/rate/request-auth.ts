import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type RateSchemaClient = ReturnType<ReturnType<typeof createClient>['schema']>;

export interface AuthenticatedRateRequest {
  ok: true;
  userId: string;
  email: string | null;
  /** `rate` schema client that sends the caller's JWT, so RLS and auth.uid() apply. */
  rateClient: RateSchemaClient;
}

export interface RejectedRateRequest {
  ok: false;
  response: NextResponse;
}

export function readBearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Verifies the caller's Supabase access token and returns a client that acts as
 * that user. Write routes use this instead of a service-role client, so the
 * database sees the real caller (auth.uid()) and RLS / grants stay in force.
 */
export async function authenticateRateRequest(
  request: Request,
  action: string
): Promise<AuthenticatedRateRequest | RejectedRateRequest> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: 'Missing Supabase configuration',
          code: 'CONFIG_MISSING',
        },
        { status: 500 }
      ),
    };
  }

  const token = readBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: `Authentication required to ${action}`,
          code: 'AUTH_REQUIRED',
        },
        { status: 401 }
      ),
    };
  }

  const baseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await baseClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: 'Invalid or expired authentication token',
          code: 'AUTH_INVALID',
        },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    rateClient: baseClient.schema('rate'),
  };
}

export interface RpcRejection {
  status: number;
  code: string;
  /** Fixed user-facing text. The database message is never echoed: native
   * errors with the same SQLSTATE would leak schema and constraint names. */
  error: string;
}

/** Maps a deliberate RPC SQLSTATE to an HTTP rejection, or null for other errors. */
export function mapRpcRejection(
  error: { code?: string } | null | undefined,
  table: Record<string, RpcRejection>
): RpcRejection | null {
  const rejection = (error?.code && table[error.code]) || null;
  if (rejection) {
    // Native Postgres errors can share these SQLSTATEs; keep the real text in logs.
    console.warn(
      '[rate-rpc] rejected',
      error?.code,
      (error as { message?: string })?.message
    );
  }
  return rejection;
}

/** PostgREST reports a function missing from its schema cache as PGRST202. */
export function isMissingRpcError(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === 'PGRST202';
}
