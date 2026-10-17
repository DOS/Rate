import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const PUBLIC_API_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

const DB_INTERNAL_ERROR_REGEX =
  /PGRST\d+|relation\s+"[^"]+"|column\s+"[^"]+"|permission denied|syntax error at|duplicate key value|violates foreign key|violates check constraint|schema\s+"rate"|rate-api:\s*failed to/i;

/**
 * Audit T9: Prevent leaking internal PostgreSQL / PostgREST / Supabase schema or query errors
 * to public API consumers while preserving safe validation messages.
 */
export function sanitizePublicApiError(
  err: unknown,
  fallbackMessage = 'Internal server error'
): string {
  if (!(err instanceof Error)) {
    return fallbackMessage;
  }
  const msg = err.message.trim();
  if (!msg || msg.length > 240 || DB_INTERNAL_ERROR_REGEX.test(msg)) {
    return fallbackMessage;
  }
  return msg;
}

export function jsonApiError(
  status: number,
  fallbackMessage: string,
  err?: unknown,
  extraHeaders?: Record<string, string>
) {
  const safeError = err
    ? sanitizePublicApiError(err, fallbackMessage)
    : fallbackMessage;
  return NextResponse.json(
    {
      ok: false,
      error: safeError,
    },
    {
      status,
      headers: {
        ...PUBLIC_API_CORS_HEADERS,
        ...extraHeaders,
      },
    }
  );
}

export function parseBoundedIntParam(
  raw: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (raw == null || raw.trim() === '') return defaultValue;
  const schema = z.coerce.number().int();
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(parsed.data)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed.data, min), max);
}

export function parseBoundedNumberParam(
  raw: string | null | undefined,
  min: number,
  max: number
): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const schema = z.coerce.number();
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(parsed.data)) {
    return undefined;
  }
  if (parsed.data < min || parsed.data > max) {
    return Math.min(Math.max(parsed.data, min), max);
  }
  return parsed.data;
}
