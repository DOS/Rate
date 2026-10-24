/**
 * Structured server logger: one JSON object per line, so Vercel / log drains can
 * filter by level and scope. Values under secret-looking keys are redacted and
 * error stacks are kept out of production logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const SECRET_KEY =
  /token|secret|password|passwd|authorization|cookie|api[-_]?key|service[-_]?role|anon[-_]?key|e-?mail/i;
// Postgres error text can echo user input ("Key (email)=(a@b.c) ..."); emails
// are personal data, so they are masked inside any logged string.
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_IN_TEXT = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const URL_CREDENTIALS_IN_TEXT = /(https?:\/\/[^/\s:@]+:)([^/\s@]+)(@)/gi;
const JWT_IN_TEXT =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const MAX_DEPTH = 4;
const MAX_STRING = 2000;
const MAX_KEYS = 60;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function scrubText(text: string): string {
  const bounded = text.slice(0, MAX_STRING + 256);
  return bounded
    .replace(EMAIL_IN_TEXT, '[email]')
    .replace(BEARER_IN_TEXT, 'Bearer [redacted]')
    .replace(URL_CREDENTIALS_IN_TEXT, '$1[redacted]$3')
    .replace(JWT_IN_TEXT, '[redacted]')
    .slice(0, MAX_STRING);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown; digest?: unknown };
    const safeName =
      typeof err.name === 'string' && err.name.trim()
        ? scrubText(err.name.replace(/\p{Cc}+/gu, '').trim()).slice(0, 128)
        : 'Error';
    return {
      name: safeName || 'Error',
      message: scrubText(err.message),
      ...(withCode.code !== undefined ? { code: withCode.code } : {}),
      ...(withCode.digest !== undefined ? { digest: withCode.digest } : {}),
      ...(isProduction()
        ? {}
        : {
            stack:
              typeof err.stack === 'string' ? scrubText(err.stack) : err.stack,
          }),
    };
  }
  if (err && typeof err === 'object') {
    // PostgREST / Supabase errors are plain objects: { code, message, details, hint }.
    return redact(err, 1) as LogFields;
  }
  return { message: scrubText(String(err)) };
}

export function redact(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === 'string') return scrubText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));
    }
    const out: LogFields = {};
    for (const [key, v] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const safeKey = key
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .slice(0, 120);
      if (!safeKey || UNSAFE_OBJECT_KEYS.has(safeKey)) continue;
      out[safeKey] = SECRET_KEY.test(safeKey)
        ? '[redacted]'
        : redact(v, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function createLogger(scope: string): Logger {
  const safeScope =
    (typeof scope === 'string'
      ? scope
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 128)
      : '') || 'app';
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (level === 'debug' && isProduction()) return;
    const redactedFields =
      fields && typeof fields === 'object' && !Array.isArray(fields)
        ? (redact(fields) as LogFields)
        : {};
    const line = JSON.stringify({
      ...redactedFields,
      ts: new Date().toISOString(),
      level,
      scope: safeScope,
      msg: scrubText(String(msg ?? '')),
    });
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      // eslint-disable-next-line no-console -- the logger is the one sanctioned console writer
      console.log(line);
    }
  };
  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}
