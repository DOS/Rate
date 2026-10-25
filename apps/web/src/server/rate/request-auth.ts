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
  if (
    !request ||
    typeof request !== 'object' ||
    !request.headers ||
    typeof request.headers.get !== 'function'
  ) {
    return '';
  }
  const rawHeader = request.headers.get('authorization');
  if (typeof rawHeader !== 'string' || /\p{Cc}/u.test(rawHeader)) return '';
  const header = rawHeader.trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) return '';
  const token = match[1].trim();
  if (
    !token ||
    token.length > MAX_BEARER_TOKEN_LENGTH ||
    /[\s\p{Cc}]/u.test(token) ||
    /^(?:null|undefined|nan|true|false|0)$/i.test(token)
  ) {
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

const AUTH_COOKIE_RE = /^(sb-[a-z0-9_-]{1,64}-auth-token)(?:\.\d{1,3})?$/i;
const BASE64_PREFIX = 'base64-';
const MAX_COOKIE_SESSION_LENGTH = 16_384;

/**
 * Reads the access token from the @supabase/ssr session cookie
 * (`sb-<ref>-auth-token`, possibly split into `.0`, `.1` chunks and
 * `base64-` encoded) without touching the network.
 */
export async function readCookieAccessToken(
  cookies: CookieRecord[]
): Promise<string | null> {
  if (!Array.isArray(cookies)) return null;
  const safeCookies = cookies.filter((c): c is CookieRecord =>
    Boolean(
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof c.name === 'string' &&
      typeof c.value === 'string'
    )
  );
  if (safeCookies.length === 0) return null;
  const byName = new Map(safeCookies.map((c) => [c.name, c.value]));
  const key = safeCookies
    .map((c) => AUTH_COOKIE_RE.exec(c.name)?.[1])
    .find((k): k is string => Boolean(k));
  if (!key) return null;
  const raw = await combineChunks(key, (name) => byName.get(name));
  if (!raw || raw.length > MAX_COOKIE_SESSION_LENGTH) return null;
  try {
    const json = raw.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
      : raw;
    if (!json || json.length > MAX_COOKIE_SESSION_LENGTH) return null;
    const session = JSON.parse(json) as { access_token?: unknown } | null;
    if (
      !session ||
      typeof session !== 'object' ||
      Array.isArray(session) ||
      typeof session.access_token !== 'string'
    ) {
      return null;
    }
    const token = session.access_token.trim();
    if (
      !token ||
      token.length > MAX_BEARER_TOKEN_LENGTH ||
      /[\s\p{Cc}]/u.test(token) ||
      /^(?:null|undefined|nan|true|false|0)$/i.test(token)
    ) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Cookies ride along on cross-site requests, so a cookie-authenticated write must
 * come from this site. Browsers send Origin on every POST fetch.
 */
export function isSameOriginRequest(request: Request): boolean {
  if (
    !request ||
    typeof request !== 'object' ||
    !request.headers ||
    typeof request.headers.get !== 'function'
  ) {
    return false;
  }
  const rawOrigin = request.headers.get('origin');
  if (
    typeof rawOrigin !== 'string' ||
    !rawOrigin ||
    rawOrigin.length > 2048 ||
    /[\s\p{Cc}]/u.test(rawOrigin) ||
    rawOrigin.trim().toLowerCase() === 'null'
  ) {
    return false;
  }
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  let fallbackHost = '';
  try {
    fallbackHost =
      typeof request.url === 'string' ? new URL(request.url).host : '';
  } catch {
    fallbackHost = '';
  }
  const host = (
    forwardedHost ||
    request.headers.get('host')?.trim() ||
    fallbackHost
  ).toLowerCase();
  if (
    !host ||
    host.length > 255 ||
    /[\s\p{Cc}/\\@]/u.test(host) ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..')
  ) {
    return false;
  }
  try {
    const parsedOrigin = new URL(rawOrigin.trim());
    if (
      parsedOrigin.protocol !== 'http:' &&
      parsedOrigin.protocol !== 'https:'
    ) {
      return false;
    }
    if (parsedOrigin.username !== '' || parsedOrigin.password !== '') {
      return false;
    }
    return parsedOrigin.host.toLowerCase() === host;
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
  const safeError =
    error && typeof error === 'object' && !Array.isArray(error) ? error : null;
  const code = typeof safeError?.code === 'string' ? safeError.code.trim() : '';
  const rejection =
    code &&
    table &&
    typeof table === 'object' &&
    !Array.isArray(table) &&
    Object.hasOwn(table, code)
      ? (table[code] ?? null)
      : null;
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
