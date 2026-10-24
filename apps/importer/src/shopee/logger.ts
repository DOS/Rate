import crypto from 'node:crypto';

export interface ImporterAlgorithmMetadata {
  algo: string;
  version: string;
  paramsHash: string;
}

function canonicalizeParamValue(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeParamValue(item, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .map(k => [k, canonicalizeParamValue(obj[k], depth + 1)]);
}

/**
 * Computes a deterministic algorithm provenance descriptor `{ algo, version, paramsHash }`
 * for Open-Core scoring and normalization engines.
 */
export function computeImporterAlgorithmMetadata(
  algo: string,
  version: string,
  params: Record<string, unknown>
): ImporterAlgorithmMetadata {
  const sortedEntries = canonicalizeParamValue(params, 0);
  const canonicalJson = JSON.stringify(sortedEntries);
  const paramsHash = crypto
    .createHash('sha256')
    .update(`${algo}@${version}:${canonicalJson}`)
    .digest('hex')
    .slice(0, 12);
  return {
    algo,
    version,
    paramsHash,
  };
}

export const MAX_LOG_STRING_LENGTH = 8000;
export const MAX_LOG_META_KEYS = 60;

/**
 * Computes exponential backoff with full jitter for LLM / network retries on 429 or 5xx (Audit C8).
 */
export function computeRetryDelayMs(
  attempt: number,
  baseDelayMs = 400,
  maxDelayMs = 5000,
  randomFn: () => number = Math.random
): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.min(10, Math.floor(attempt))) : 0;
  const safeBaseDelayMs =
    Number.isFinite(baseDelayMs) && baseDelayMs >= 1 ? Math.floor(baseDelayMs) : 400;
  const safeMaxDelayMs =
    Number.isFinite(maxDelayMs) && maxDelayMs >= safeBaseDelayMs
      ? Math.floor(maxDelayMs)
      : Math.max(5000, safeBaseDelayMs);
  const exp = Math.min(safeMaxDelayMs, safeBaseDelayMs * Math.pow(2, safeAttempt));
  const half = Math.floor(exp / 2);
  const rawRand = randomFn();
  const clampedRand = Number.isFinite(rawRand) ? Math.max(0, Math.min(0.999999999, rawRand)) : 0.5;
  const jitter = Math.floor(clampedRand * (exp - half + 1));
  return Math.min(safeMaxDelayMs, half + jitter);
}

/**
 * Sanitizes untrusted AI-generated output text (`ai_summary`, `pros`, `cons`, `reason`)
 * by stripping HTML tags, control characters, URLs, and phone/Zalo numbers to prevent
 * prompt-injection phishing or rival spam from surfacing on public pages (Audit C8).
 */
export function sanitizeAiGeneratedText(raw: unknown, maxLen = 400): string {
  if (typeof raw !== 'string') return '';
  return (
    raw
      // `[^<>]` rather than `[^>]`: a run of unclosed '<' would otherwise be
      // rescanned to the end of the string from each '<' (quadratic).
      .replace(/<[^<>]*>/g, ' ')
      // Strip explicit http(s):// and www. URLs
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link-removed]')
      // Strip bare domain links with common TLDs/paths (e.g. bit.ly/xyz, shopee.vn/abc, t.me/xyz)
      .replace(
        /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:vn|com|net|org|io|me|ly|gg|co|shop|store|xyz|info)(?:\/\S*)?\b/gi,
        '[link-removed]'
      )
      // Strip Vietnamese phone / Zalo numbers (e.g. 0912345678, +84 912 345 678, 098.123.4567)
      .replace(/(?:\+?84|0)\s*[1-9](?:[\s.-]*\d){7,9}\b/g, '[phone-removed]')
      // eslint-disable-next-line no-control-regex -- stripping control characters is intentional
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen)
  );
}

/**
 * Redacts PII (emails), proxy credentials (`user:pass@`), Bearer/JWT tokens, and API keys
 * from log strings and metadata values (Audit Low).
 */
export function redactSensitiveString(raw: string): string {
  if (!raw) return raw;
  const bounded = raw.length > MAX_LOG_STRING_LENGTH ? raw.slice(0, MAX_LOG_STRING_LENGTH) : raw;
  return (
    bounded
      // Proxy credentials in URLs: http://user:pass@host -> http://u***:p***@host
      .replace(/(\bhttps?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1u***:p***@')
      // Query-parameter secrets: ?api_key=... / &token=... -> ?api_key=[REDACTED]
      .replace(
        /([?&](?:api_?key|token|secret|password|access_token|service_role_key)=)[^&\s#]+/gi,
        '$1[REDACTED]'
      )
      // Bearer / eyJ JWT tokens
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(
        /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        '[REDACTED_JWT]'
      )
      // API keys (sk-..., sbp_..., sb_secret_..., AIza..., ghp_..., github_pat_...)
      .replace(
        /\b(?:sk-[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        '[REDACTED_KEY]'
      )
      // Email addresses: alice@example.com -> a***@example.com
      .replace(
        /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
        '$1***@$2'
      )
  );
}

const SENSITIVE_META_KEY_RE =
  /(password|secret|token|api_?key|service_role|authorization|cookie|credential|jwt)/i;

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeLogMeta(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>()
): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveString(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: redactSensitiveString(value.message || ''),
    };
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, 50).map(item => sanitizeLogMeta(item, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_OBJECT_KEYS.has(k)) continue;
      if (count >= MAX_LOG_META_KEYS) break;
      count += 1;
      if (SENSITIVE_META_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeLogMeta(v, depth + 1, seen);
      }
    }
    return out;
  }
  return redactSensitiveString(String(value));
}

export type ImporterLogLevel = 'info' | 'warn' | 'error';

export interface ImporterLogContext {
  component: string;
  runId?: string | null;
  jobId?: string | null;
  platform?: string | null;
}

export interface ImporterLogEntry {
  timestamp: string;
  level: ImporterLogLevel;
  service: '@repo/crawlers';
  component: string;
  run_id: string | null;
  job_id: string | null;
  platform: string | null;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Structured JSON logger for `@repo/crawlers` (`apps/importer`) with secret/PII redaction (Audit Low).
 */
export class ImporterStructuredLogger {
  private context: ImporterLogContext;

  constructor(context: ImporterLogContext) {
    this.context = { ...context };
  }

  public child(overrides: Partial<ImporterLogContext>): ImporterStructuredLogger {
    return new ImporterStructuredLogger({
      ...this.context,
      ...overrides,
    });
  }

  public formatEntry(
    level: ImporterLogLevel,
    event: string,
    message: string,
    meta?: Record<string, unknown>
  ): ImporterLogEntry {
    const sanitizedMeta = meta ? (sanitizeLogMeta(meta) as Record<string, unknown>) : undefined;
    return {
      timestamp: new Date().toISOString(),
      level,
      service: '@repo/crawlers',
      component: this.context.component,
      run_id: this.context.runId ?? process.env.RATE_RUN_ID ?? null,
      job_id: this.context.jobId ?? null,
      platform: this.context.platform ?? null,
      event,
      message: redactSensitiveString(message),
      ...(sanitizedMeta && Object.keys(sanitizedMeta).length > 0 ? { meta: sanitizedMeta } : {}),
    };
  }

  public info(event: string, message: string, meta?: Record<string, unknown>): ImporterLogEntry {
    const entry = this.formatEntry('info', event, message, meta);
    console.log(JSON.stringify(entry));
    return entry;
  }

  public warn(event: string, message: string, meta?: Record<string, unknown>): ImporterLogEntry {
    const entry = this.formatEntry('warn', event, message, meta);
    console.warn(JSON.stringify(entry));
    return entry;
  }

  public error(event: string, message: string, meta?: Record<string, unknown>): ImporterLogEntry {
    const entry = this.formatEntry('error', event, message, meta);
    console.error(JSON.stringify(entry));
    return entry;
  }
}

export function createImporterLogger(
  component: string,
  overrides: Omit<ImporterLogContext, 'component'> = {}
): ImporterStructuredLogger {
  return new ImporterStructuredLogger({
    component,
    ...overrides,
  });
}
