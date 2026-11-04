import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRateClient } from '@/lib/rate-api';
import { isMissingRpcError } from '@/server/rate/request-auth';
import { rateLimitExceededResponse } from '@/server/rate/api-handler';
import { createLogger } from '@/lib/logger';

const log = createLogger('server.extension-observations');

/**
 * ExtensionObservation v1 ingest (DOS/Rate#1606, M2 of
 * Docs/Proposals/2026-10-28-extension-data-source.md). An opted-in install
 * gets a pseudonymous submitter id and sends observations into the
 * quarantine table, through the narrow RPCs of
 * Docs/Proposals/2026-11-04-dos-me-extension-observations.sql. Nothing
 * reaches public prices; Rate-Services verifies (M3).
 *
 * Off until the table exists: every route answers 404 unless
 * RATE_EXTENSION_OBSERVATIONS is "1", and then makes no database call.
 * Writes also need two server secrets: RATE_EXTENSION_INGEST_KEY, which the
 * RPCs check so nobody can call them around this route, and
 * RATE_NETWORK_HASH_SALT for the per-network limits.
 */

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rate-Extension-Version',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

/** Browser-extension origins: the only browser callers these routes serve. */
const EXTENSION_ORIGIN_RE =
  /^(?:chrome-extension|moz-extension|extension):\/\/[a-z0-9-]{1,64}$/i;

/**
 * The response headers for a request: CORS only for an extension origin.
 * Callers without an Origin (the extension's service worker sends one;
 * server tools send none) get no CORS header at all.
 */
export function observationHeaders(
  request?: Request | null
): Record<string, string> {
  const origin = request?.headers.get('origin') ?? '';
  return EXTENSION_ORIGIN_RE.test(origin)
    ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
    : { ...BASE_HEADERS };
}

/**
 * A web page's request: any http(s) Origin. Refused, so a site the user
 * visits cannot register ids or send observations from the user's network.
 */
export function isWebPageOrigin(request: Request): boolean {
  return /^https?:\/\//i.test(request.headers.get('origin') ?? '');
}

export function isJsonRequest(request: Request): boolean {
  return /^application\/json\b/i.test(
    request.headers.get('content-type') ?? ''
  );
}

export function isExtensionObservationsEnabled(): boolean {
  return process.env.RATE_EXTENSION_OBSERVATIONS === '1';
}

/**
 * The per-network limits need the salt, and the RPCs need the ingest key;
 * writes are refused until both are set.
 */
export function hasNetworkHashSalt(
  salt = process.env.RATE_NETWORK_HASH_SALT
): boolean {
  return typeof salt === 'string' && salt.length >= 16;
}

export function ingestKey(
  key = process.env.RATE_EXTENSION_INGEST_KEY
): string | null {
  return typeof key === 'string' && key.length >= 32 ? key : null;
}

export function observationResponse(
  request: Request | null,
  status: number,
  body: Record<string, unknown>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: observationHeaders(request),
  });
}

export const notEnabledResponse = (request: Request | null) =>
  observationResponse(request, 404, {
    ok: false,
    code: 'NOT_ENABLED',
    error: 'Extension observations are not enabled.',
  });

export const unavailableResponse = (request: Request | null) =>
  observationResponse(request, 503, {
    ok: false,
    code: 'OBSERVATIONS_UNAVAILABLE',
    error: 'Extension observations are not available yet.',
  });

export const webPageRefusedResponse = (request: Request | null) =>
  observationResponse(request, 403, {
    ok: false,
    code: 'CROSS_SITE',
    error: 'Web pages cannot call this endpoint.',
  });

export const notJsonResponse = (request: Request | null) =>
  observationResponse(request, 415, {
    ok: false,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    error: 'Send Content-Type: application/json.',
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubmitterId(raw: unknown): string | null {
  return typeof raw === 'string' && UUID_RE.test(raw)
    ? raw.toLowerCase()
    : null;
}

/**
 * The network range of an IP: the /24 of IPv4 (also IPv4-mapped IPv6), the
 * /48 of IPv6; null for anything else (no address, a placeholder, a
 * malformed value).
 */
export function networkPrefixOf(ip: string): string | null {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    mapped?.[1] ?? ip
  );
  if (v4) {
    const parts = v4.slice(1, 5).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (!/^[0-9a-f:]{2,39}$/i.test(ip) || !ip.includes(':')) return null;
  const halves = ip.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/48`;
}

/**
 * HMAC-SHA256 of the network range with RATE_NETWORK_HASH_SALT, as lowercase
 * hex: lets Rate-Services tell independent submitters apart without the raw
 * IP ever being stored. An address that gives no range shares one "unknown"
 * bucket, so the per-network limits still hold. Null only without a salt of
 * at least 16 characters.
 */
export function networkHashFor(
  ip: string,
  salt = process.env.RATE_NETWORK_HASH_SALT
): string | null {
  if (!hasNetworkHashSalt(salt)) return null;
  const prefix = networkPrefixOf(ip) ?? 'unknown';
  return createHmac('sha256', salt as string)
    .update(prefix)
    .digest('hex');
}

interface LooseRpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string; details?: string } | null;
  }>;
}

/** Calls one of the M2 RPCs as anon; their types land with the migration. */
export function callObservationRpc(
  fn:
    | 'register_extension_submitter'
    | 'submit_extension_observation'
    | 'delete_extension_submitter',
  args?: Record<string, unknown>
) {
  return (getRateClient() as unknown as LooseRpcClient).rpc(fn, args);
}

/**
 * An RPC failure as an answer: never a success, never the raw message. The
 * code is logged (not the message, which can carry input).
 */
export function rpcFailureResponse(
  request: Request | null,
  error: { code?: string; details?: string }
): NextResponse {
  log.warn('extension observation rpc refused', {
    code: typeof error.code === 'string' ? error.code.slice(0, 16) : null,
  });
  if (isMissingRpcError(error)) return unavailableResponse(request);
  if (error.code === '54000') {
    // The per-submitter and per-network limits are hourly; the global
    // register brake (DETAIL "submitter") is per minute.
    return rateLimitExceededResponse(
      'Too many requests; try again later.',
      observationHeaders(request),
      error.details === 'submitter' ? 60 : 3600
    );
  }
  if (error.code === 'P0002') {
    return observationResponse(request, 404, {
      ok: false,
      code: 'UNKNOWN_SUBMITTER',
      error: 'Unknown submitter.',
    });
  }
  if (error.code === '42501') {
    // The ingest key was refused: a server configuration problem.
    return unavailableResponse(request);
  }
  if (error.code === '22023') {
    const field =
      typeof error.details === 'string' &&
      /^[a-z_]{1,32}(?:\.[a-z_]{1,32})?$/.test(error.details)
        ? error.details
        : null;
    return observationResponse(request, 400, {
      ok: false,
      code: 'INVALID_OBSERVATION',
      error: 'The observation was refused.',
      field,
    });
  }
  return observationResponse(request, 502, {
    ok: false,
    code: 'PERSIST_FAILED',
    error: 'Could not store the observation.',
  });
}

/** The answer to a preflight: 404 while the routes are off. */
export function observationOptions(request: Request): Response {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse(request);
  return new Response(null, {
    status: 204,
    headers: observationHeaders(request),
  });
}
