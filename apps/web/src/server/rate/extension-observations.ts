import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRateClient } from '@/lib/rate-api';
import { isMissingRpcError } from '@/server/rate/request-auth';
import { rateLimitExceededResponse } from '@/server/rate/api-handler';

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
 */

export const EXTENSION_OBSERVATION_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Rate-Extension-Version',
  'Cache-Control': 'no-store',
};

export function isExtensionObservationsEnabled(): boolean {
  return process.env.RATE_EXTENSION_OBSERVATIONS === '1';
}

/**
 * The per-network limit needs the salt: without it every request's
 * network_hash is null and fresh submitter ids walk around the
 * per-submitter limit. Observations are refused until it is set.
 */
export function hasNetworkHashSalt(
  salt = process.env.RATE_NETWORK_HASH_SALT
): boolean {
  return typeof salt === 'string' && salt.length >= 16;
}

export function observationResponse(
  status: number,
  body: Record<string, unknown>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: EXTENSION_OBSERVATION_HEADERS,
  });
}

export const notEnabledResponse = () =>
  observationResponse(404, {
    ok: false,
    code: 'NOT_ENABLED',
    error: 'Extension observations are not enabled.',
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubmitterId(raw: unknown): string | null {
  return typeof raw === 'string' && UUID_RE.test(raw)
    ? raw.toLowerCase()
    : null;
}

/**
 * The network range of an IP: the /24 of IPv4, the /48 of IPv6; null for
 * anything else (no address, a placeholder, a malformed value).
 */
export function networkPrefixOf(ip: string): string | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
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
 * IP ever being stored. Null without a salt of at least 16 characters or
 * without a usable address.
 */
export function networkHashFor(
  ip: string,
  salt = process.env.RATE_NETWORK_HASH_SALT
): string | null {
  if (typeof salt !== 'string' || salt.length < 16) return null;
  const prefix = networkPrefixOf(ip);
  return prefix
    ? createHmac('sha256', salt).update(prefix).digest('hex')
    : null;
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

/** An RPC failure as an answer: never a success, never the raw message. */
export function rpcFailureResponse(error: {
  code?: string;
  details?: string;
}): NextResponse {
  if (isMissingRpcError(error)) {
    return observationResponse(503, {
      ok: false,
      code: 'OBSERVATIONS_UNAVAILABLE',
      error: 'Extension observations are not available yet.',
    });
  }
  if (error.code === '54000') {
    return rateLimitExceededResponse(
      'Too many observations; try again later.',
      EXTENSION_OBSERVATION_HEADERS
    );
  }
  if (error.code === 'P0002') {
    return observationResponse(404, {
      ok: false,
      code: 'UNKNOWN_SUBMITTER',
      error: 'Unknown submitter.',
    });
  }
  if (error.code === '22023') {
    const field =
      typeof error.details === 'string' &&
      /^[a-z_]{1,32}(?:\.[a-z_]{1,32})?$/.test(error.details)
        ? error.details
        : null;
    return observationResponse(400, {
      ok: false,
      code: 'INVALID_OBSERVATION',
      error: 'The observation was refused.',
      field,
    });
  }
  return observationResponse(502, {
    ok: false,
    code: 'PERSIST_FAILED',
    error: 'Could not store the observation.',
  });
}
