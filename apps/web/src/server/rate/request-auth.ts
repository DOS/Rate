import { NextResponse } from 'next/server';
import {
  combineChunks,
  parseCookieHeader,
  stringFromBase64URL,
} from '@supabase/ssr';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { Database } from '@repo/shared-data';
import {
  hasSupabaseAuthCookie,
  type CookieRecord,
} from '@/lib/supabase/cookies';
import { createLogger } from '@/lib/logger';
import { PUBLIC_API_CORS_HEADERS } from './api-handler';

const log = createLogger('server.rpc');

const rateSchemaOf = (client: SupabaseClient<Database>) =>
  client.schema('rate');
type RateSchemaClient = ReturnType<typeof rateSchemaOf>;

export interface AuthenticatedRateRequest {
  ok: true;
  userId: string;
  email: string | null;
  user: User;
  /** `rate` schema client that sends the caller's JWT, so RLS and auth.uid() apply. */
  rateClient: RateSchemaClient;
}

export interface RejectedRateRequest {
  ok: false;
  response: NextResponse;
}

const MAX_BEARER_TOKEN_LENGTH = 4096;

export function readBearerToken(request: Request): string {
  const header = (request.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) return '';
  const token = match[1].trim();
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH || /\s/.test(token)) {
    return '';
  }
  return token;
}

function readCookies(request: Request): CookieRecord[] {
  return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
    name: c.name,
    value: c.value ?? '',
  }));
}

const AUTH_COOKIE_RE = /^(sb-[^.]+-auth-token)(?:\.\d+)?$/;
const BASE64_PREFIX = 'base64-';

/**
 * Reads the access token from the @supabase/ssr session cookie
 * (`sb-<ref>-auth-token`, possibly split into `.0`, `.1` chunks and
 * `base64-` encoded) without touching the network.
 */
export async function readCookieAccessToken(
  cookies: CookieRecord[]
): Promise<string | null> {
  const byName = new Map(cookies.map((c) => [c.name, c.value]));
  const key = cookies
    .map((c) => AUTH_COOKIE_RE.exec(c.name)?.[1])
    .find((k): k is string => Boolean(k));
  if (!key) return null;
  const raw = await combineChunks(key, (name) => byName.get(name));
  if (!raw) return null;
  try {
    const json = raw.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
      : raw;
    const session = JSON.parse(json) as { access_token?: unknown };
    return typeof session.access_token === 'string' &&
      session.access_token.length > 0
      ? session.access_token
      : null;
  } catch {
    return null;
  }
}

/**
 * Cookies ride along on cross-site requests, so a cookie-authenticated write must
 * come from this site. Browsers send Origin on every POST fetch.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const host = (
    forwardedHost ||
    request.headers.get('host')?.trim() ||
    new URL(request.url).host
  ).toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === host;
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
  action: string,
  corsHeaders?: Record<string, string>
): Promise<AuthenticatedRateRequest | RejectedRateRequest> {
  const responseHeaders = {
    ...PUBLIC_API_CORS_HEADERS,
    ...corsHeaders,
  };
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!supabaseUrl || !anonKey) {
    return rejected(
      500,
      'CONFIG_MISSING',
      'Missing Supabase configuration',
      responseHeaders
    );
  }

  const bearer = readBearerToken(request);
  if (bearer) {
    return authenticateAccessToken(
      bearer,
      supabaseUrl,
      anonKey,
      responseHeaders
    );
  }
  return authenticateCookieSession(
    request,
    action,
    supabaseUrl,
    anonKey,
    responseHeaders
  );
}

async function authenticateAccessToken(
  token: string,
  supabaseUrl: string,
  anonKey: string,
  responseHeaders: Record<string, string>
): Promise<AuthenticatedRateRequest | RejectedRateRequest> {
  const baseClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await baseClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) {
    return rejected(
      401,
      'AUTH_INVALID',
      'Invalid or expired authentication token',
      responseHeaders
    );
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    user,
    rateClient: rateSchemaOf(baseClient),
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
    log.warn('rpc rejected', {
      code: error?.code,
      message: (error as { message?: string })?.message,
    });
  }
  return rejection;
}

function rejected(
  status: number,
  code: string,
  error: string,
  headers: Record<string, string>
): RejectedRateRequest {
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error, code },
      { status, headers }
    ),
  };
}

async function authenticateCookieSession(
  request: Request,
  action: string,
  supabaseUrl: string,
  anonKey: string,
  responseHeaders: Record<string, string>
): Promise<AuthenticatedRateRequest | RejectedRateRequest> {
  const cookies = readCookies(request);
  if (!hasSupabaseAuthCookie(cookies)) {
    return rejected(
      401,
      'AUTH_REQUIRED',
      `Authentication required to ${action}`,
      responseHeaders
    );
  }
  if (!isSameOriginRequest(request)) {
    return rejected(
      403,
      'CROSS_SITE',
      'Cross-site request rejected',
      responseHeaders
    );
  }
  // Validate the stored access token as is. A Supabase client here would refresh
  // an expired session and drop the rotated tokens (route handlers cannot set
  // the browser's cookies), which burns the refresh token. An expired token gets
  // a 401 and the browser client refreshes it.
  const token = await readCookieAccessToken(cookies);
  if (!token) {
    return rejected(
      401,
      'AUTH_INVALID',
      'Invalid or expired authentication token',
      responseHeaders
    );
  }
  return authenticateAccessToken(token, supabaseUrl, anonKey, responseHeaders);
}

/** PostgREST reports a function missing from its schema cache as PGRST202. */
export function isMissingRpcError(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === 'PGRST202';
}
