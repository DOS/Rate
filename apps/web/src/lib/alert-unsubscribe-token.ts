import { createHmac, timingSafeEqual } from 'node:crypto';

export const ALERT_UNSUBSCRIBE_TOKEN_VERSION = 'v1';
export const ALERT_UNSUBSCRIBE_SIGNING_PREFIX = 'rate-alert-unsub-v1.';
export const MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH = 2048;
export const MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES = 32;
export const MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES = 1024;
export const DEFAULT_ALERT_UNSUBSCRIBE_TTL_SEC = 7_776_000; // 90 days

export interface AlertUnsubscribeTokenPayload {
  v: 1;
  aid: string;
  email: string;
  mid: string;
  iat: number;
  exp: number;
}

export interface SignAlertUnsubscribeTokenInput {
  aid: string;
  email: string;
  mid: string;
  iat: number;
  exp?: number;
}

export type AlertUnsubscribeVerifyErrorCode =
  | 'SECRET_UNCONFIGURED'
  | 'MALFORMED_TOKEN'
  | 'INVALID_SIGNATURE'
  | 'INVALID_PAYLOAD'
  | 'TOKEN_EXPIRED';

export type AlertUnsubscribeVerifyResult =
  | { ok: true; payload: AlertUnsubscribeTokenPayload }
  | {
      ok: false;
      code: AlertUnsubscribeVerifyErrorCode;
      error: string;
    };

const BASE64URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_EMAIL_PART_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_CHAR_RE = /^[a-z0-9.-]+$/;
const DOMAIN_LABEL_RE = /^[a-z0-9-]+$/;
const ALLOWED_PAYLOAD_KEYS = new Set([
  'v',
  'aid',
  'email',
  'mid',
  'iat',
  'exp',
]);
const UTF8_FATAL_DECODER = new TextDecoder('utf-8', { fatal: true });

/**
 * Validates `RATE_ALERT_UNSUBSCRIBE_SECRET` without mutating surrounding bytes,
 * matching `@repo/crawlers` (`apps/importer`) byte-for-byte: rejects lone UTF-16
 * surrogates, control characters, leading/trailing whitespace, or byte length
 * outside `[32, 1024]`.
 */
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function normalizeAlertUnsubscribeSecret(
  secret: unknown
): string | null {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  if (hasLoneSurrogate(secret)) {
    return null;
  }
  if (secret !== secret.trim() || /\p{Cc}/u.test(secret)) {
    return null;
  }
  const byteLength = Buffer.byteLength(secret, 'utf8');
  if (
    byteLength < MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES ||
    byteLength > MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES
  ) {
    return null;
  }
  return secret;
}

export function isValidAlertUnsubscribeSecret(
  secret: unknown
): secret is string {
  return normalizeAlertUnsubscribeSecret(secret) !== null;
}

export function isValidNormalizedAlertEmail(email: unknown): email is string {
  if (
    typeof email !== 'string' ||
    email.length < 3 ||
    email.length > 254 ||
    email !== email.toLowerCase() ||
    /[\s\p{Cc}]/u.test(email)
  ) {
    return false;
  }
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex > 64 || email.indexOf('@', atIndex + 1) !== -1) {
    return false;
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (
    !local ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !LOCAL_EMAIL_PART_RE.test(local)
  ) {
    return false;
  }
  if (
    domain.length < 3 ||
    domain.length > 253 ||
    !domain.includes('.') ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    domain.includes('..') ||
    !DOMAIN_CHAR_RE.test(domain)
  ) {
    return false;
  }
  const labels = domain.split('.');
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      !label.startsWith('-') &&
      !label.endsWith('-') &&
      DOMAIN_LABEL_RE.test(label)
  );
}

/**
 * Signs a canonical `v1.<payloadB64>.<sigB64>` RFC 8058 unsubscribe token
 * matching `@repo/crawlers` (`apps/importer/src/shopee/alert-unsubscribe-token.ts`)
 * byte-for-byte (key order: `v`, `aid`, `email`, `mid`, `iat`, `exp`).
 */
export function signAlertUnsubscribeToken(
  input: SignAlertUnsubscribeTokenInput,
  secret: string
): string {
  const cleanSecret = normalizeAlertUnsubscribeSecret(secret);
  if (!cleanSecret) {
    throw new Error(
      `RATE_ALERT_UNSUBSCRIBE_SECRET must be ${MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES}..${MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES} UTF-8 bytes with no control characters or surrounding whitespace`
    );
  }
  const aid =
    typeof input?.aid === 'string' ? input.aid.trim().toLowerCase() : '';
  const mid =
    typeof input?.mid === 'string' ? input.mid.trim().toLowerCase() : '';
  const email =
    typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const iat = input?.iat;
  const exp = input?.exp ?? iat + DEFAULT_ALERT_UNSUBSCRIBE_TTL_SEC;

  if (!UUID_RE.test(aid)) {
    throw new Error('Invalid alert UUID (aid)');
  }
  if (!UUID_RE.test(mid)) {
    throw new Error('Invalid master product UUID (mid)');
  }
  if (!isValidNormalizedAlertEmail(email)) {
    throw new Error('Invalid subscriber email');
  }
  if (typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat <= 0) {
    throw new Error('Invalid issued-at timestamp (iat)');
  }
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= iat) {
    throw new Error('Invalid expiration timestamp (exp must exceed iat)');
  }

  // Exact key order locked for cross-package interoperability (#1874, #1875).
  const payload: AlertUnsubscribeTokenPayload = {
    v: 1,
    aid,
    email,
    mid,
    iat,
    exp,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const sigB64 = createHmac('sha256', cleanSecret)
    .update(ALERT_UNSUBSCRIBE_SIGNING_PREFIX + payloadB64, 'utf8')
    .digest('base64url');
  return `${ALERT_UNSUBSCRIBE_TOKEN_VERSION}.${payloadB64}.${sigB64}`;
}

function parsePrototypeSafePayload(
  payloadBytes: Buffer
): AlertUnsubscribeTokenPayload | null {
  let jsonText: string;
  try {
    jsonText = UTF8_FATAL_DECODER.decode(payloadBytes);
  } catch {
    return null;
  }
  if (!jsonText || jsonText.length > MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH) {
    return null;
  }

  let sawForbiddenKey = false;
  let parsedMemberCount = 0;
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText, (key, value) => {
      if (key !== '') {
        parsedMemberCount += 1;
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        sawForbiddenKey = true;
        return undefined;
      }
      return value;
    });
  } catch {
    return null;
  }

  if (
    sawForbiddenKey ||
    parsedMemberCount !== ALLOWED_PAYLOAD_KEYS.size ||
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== ALLOWED_PAYLOAD_KEYS.size ||
    keys.some((k) => !ALLOWED_PAYLOAD_KEYS.has(k))
  ) {
    return null;
  }

  if (record.v !== 1) return null;
  if (typeof record.aid !== 'string' || !UUID_RE.test(record.aid)) return null;
  if (typeof record.mid !== 'string' || !UUID_RE.test(record.mid)) return null;
  if (!isValidNormalizedAlertEmail(record.email)) return null;
  if (
    typeof record.iat !== 'number' ||
    !Number.isSafeInteger(record.iat) ||
    record.iat <= 0
  ) {
    return null;
  }
  if (
    typeof record.exp !== 'number' ||
    !Number.isSafeInteger(record.exp) ||
    record.exp <= record.iat
  ) {
    return null;
  }

  const canonicalPayload: AlertUnsubscribeTokenPayload = {
    v: 1,
    aid: record.aid.toLowerCase(),
    email: record.email,
    mid: record.mid.toLowerCase(),
    iat: record.iat,
    exp: record.exp,
  };
  if (
    jsonText.replace(/[\t\n\r ]+/g, '').length !==
    JSON.stringify(canonicalPayload).length
  ) {
    return null;
  }
  return canonicalPayload;
}

/**
 * Verifies a stateless HMAC-SHA256 `v1.<payloadB64>.<sigB64>` unsubscribe token
 * in constant time and checks token expiration (`nowSec <= exp`).
 */
export function verifyAlertUnsubscribeToken(
  token: unknown,
  secret: unknown,
  options?: { nowSec?: number }
): AlertUnsubscribeVerifyResult {
  const cleanSecret = normalizeAlertUnsubscribeSecret(secret);
  if (!cleanSecret) {
    return {
      ok: false,
      code: 'SECRET_UNCONFIGURED',
      error: 'Unsubscribe verification is not configured',
    };
  }

  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH ||
    /[\s\p{Cc}]/u.test(token)
  ) {
    return {
      ok: false,
      code: 'MALFORMED_TOKEN',
      error: 'Malformed unsubscribe token',
    };
  }

  const segments = token.split('.');
  if (segments.length !== 3) {
    return {
      ok: false,
      code: 'MALFORMED_TOKEN',
      error: 'Malformed unsubscribe token',
    };
  }

  const [version, payloadB64, sigB64] = segments;
  if (
    version !== ALERT_UNSUBSCRIBE_TOKEN_VERSION ||
    !payloadB64 ||
    !sigB64 ||
    !BASE64URL_SEGMENT_RE.test(payloadB64) ||
    !BASE64URL_SEGMENT_RE.test(sigB64)
  ) {
    return {
      ok: false,
      code: 'MALFORMED_TOKEN',
      error: 'Malformed unsubscribe token',
    };
  }

  const expectedSig = createHmac('sha256', cleanSecret)
    .update(ALERT_UNSUBSCRIBE_SIGNING_PREFIX + payloadB64, 'utf8')
    .digest();
  const providedSig = Buffer.from(sigB64, 'base64url');
  if (
    providedSig.byteLength !== expectedSig.byteLength ||
    !timingSafeEqual(providedSig, expectedSig) ||
    providedSig.toString('base64url') !== sigB64
  ) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      error: 'Invalid unsubscribe token signature',
    };
  }

  const payloadBytes = Buffer.from(payloadB64, 'base64url');
  if (
    payloadBytes.byteLength === 0 ||
    payloadBytes.toString('base64url') !== payloadB64
  ) {
    return {
      ok: false,
      code: 'MALFORMED_TOKEN',
      error: 'Malformed unsubscribe token payload',
    };
  }

  const payload = parsePrototypeSafePayload(payloadBytes);
  if (!payload) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      error: 'Invalid unsubscribe token payload',
    };
  }

  let nowSec: number;
  if (options?.nowSec !== undefined) {
    if (
      typeof options.nowSec !== 'number' ||
      !Number.isFinite(options.nowSec)
    ) {
      return {
        ok: false,
        code: 'INVALID_PAYLOAD',
        error: 'Invalid verification clock',
      };
    }
    nowSec = Math.floor(options.nowSec);
  } else {
    nowSec = Math.floor(Date.now() / 1000);
  }

  if (nowSec > payload.exp) {
    return {
      ok: false,
      code: 'TOKEN_EXPIRED',
      error: 'Unsubscribe token has expired',
    };
  }

  return { ok: true, payload };
}
