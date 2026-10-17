import { NextResponse } from 'next/server';
import { parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createCookieSupabase,
  hasSupabaseAuthCookie,
  type CookieRecord,
} from '@/lib/supabase/cookies';

type RateSchemaClient = ReturnType<SupabaseClient['schema']>;

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

function readCookies(request: Request): CookieRecord[] {
  return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
    name: c.name,
    value: c.value ?? '',
  }));
}

/**
 * Cookies ride along on cross-site requests, so a cookie-authenticated write must
 * come from this site. Browsers send Origin on every POST fetch.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Verifies the caller's Supabase session and returns a client that acts as that
 * user. Write routes use this instead of a service-role client, so the database
 * sees the real caller (auth.uid()) and RLS / grants stay in force.
 *
 * Accepts an `Authorization: Bearer` access token (browser extension, API
 * clients) or the cookie session set by the web app's browser client. Cookie
 * sessions must come from a same-origin request.
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
    return authenticateCookieSession(request, action);
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

function rejected(
  status: number,
  code: string,
  error: string
): RejectedRateRequest {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error, code }, { status }),
  };
}

async function authenticateCookieSession(
  request: Request,
  action: string
): Promise<AuthenticatedRateRequest | RejectedRateRequest> {
  const cookies = readCookies(request);
  if (!hasSupabaseAuthCookie(cookies)) {
    return rejected(
      401,
      'AUTH_REQUIRED',
      `Authentication required to ${action}`
    );
  }
  if (!isSameOriginRequest(request)) {
    return rejected(403, 'CROSS_SITE', 'Cross-site request rejected');
  }
  // Route handlers do not refresh the session (proxy.ts does), so no setAll.
  const supabase = createCookieSupabase({ getAll: () => cookies });
  if (!supabase) {
    return rejected(500, 'CONFIG_MISSING', 'Missing Supabase configuration');
  }
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user?.id) {
    return rejected(
      401,
      'AUTH_INVALID',
      'Invalid or expired authentication token'
    );
  }
  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    rateClient: supabase.schema('rate'),
  };
}

/** PostgREST reports a function missing from its schema cache as PGRST202. */
export function isMissingRpcError(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === 'PGRST202';
}
