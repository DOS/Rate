/**
 * Canonical Stateless HMAC-SHA256 Unsubscribe Token Signer & Verifier (DOS/Rate#1874)
 *
 * Produces and verifies RFC 8058 one-click unsubscribe tokens shared with `apps/web`
 * (`v1.<payloadB64>.<sigB64>`), signed with `RATE_ALERT_UNSUBSCRIBE_SECRET` (>= 32 UTF-8 bytes).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { STRICT_UUID_REGEX } from './paging.js';

export const ALERT_UNSUBSCRIBE_TOKEN_VERSION = 1 as const;
export const ALERT_UNSUBSCRIBE_SIGNING_PREFIX = 'rate-alert-unsub-v1.';
export const ALERT_UNSUBSCRIBE_TTL_SECONDS = 7_776_000; // 90 days
export const MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES = 32;
export const MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES = 1024;
export const MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH = 2048;

const BASE64URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const LOCAL_PART_CHARS_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL_RE = /^[a-z0-9-]+$/;
const TLD_ALPHA_RE = /^[a-z]{2,63}$/;
const TLD_PUNYCODE_RE = /^xn--[a-z0-9-]{2,59}$/;
const EXPECTED_PAYLOAD_KEYS = new Set(['v', 'aid', 'email', 'mid', 'iat', 'exp']);
const UNSAFE_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FATAL_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export interface AlertUnsubscribeTokenPayload {
  readonly v: 1;
  readonly aid: string;
  readonly email: string;
  readonly mid: string;
  readonly iat: number;
  readonly exp: number;
}

export interface SignAlertUnsubscribeTokenInput {
  readonly alertId: string;
  readonly email: string;
  readonly masterProductId: string;
  readonly issuedAtUnixSec?: number;
}

export type AlertUnsubscribeVerifyFailureReason =
  | 'malformed_token'
  | 'unsupported_version'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'expired_token';

export type VerifyAlertUnsubscribeTokenResult =
  | { readonly ok: true; readonly payload: AlertUnsubscribeTokenPayload }
  | { readonly ok: false; readonly reason: AlertUnsubscribeVerifyFailureReason };

function isWellFormedUtf16(value: string): boolean {
  const maybe = value as string & { isWellFormed?: () => boolean };
  if (typeof maybe.isWellFormed === 'function') {
    return maybe.isWellFormed();
  }
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * Validates and normalizes an email address to lowercase ASCII/IDN-safe form in linear time.
 * Returns `null` if malformed, oversized, or containing control characters / lone surrogates.
 */
export function normalizeAlertSubscriberEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 320 || !isWellFormedUtf16(raw)) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 254) return null;
  if (/[\s\p{Cc}]/u.test(trimmed)) return null;

  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf('@')) return null;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length < 1 || local.length > 64 || domain.length < 3 || domain.length > 253) {
    return null;
  }
  if (
    !LOCAL_PART_CHARS_RE.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return null;
  }

  const labels = domain.split('.');
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (
      !label ||
      label.length > 63 ||
      !DOMAIN_LABEL_RE.test(label) ||
      label.startsWith('-') ||
      label.endsWith('-')
    ) {
      return null;
    }
  }
  const tld = labels[labels.length - 1]!;
  if (!TLD_ALPHA_RE.test(tld) && !TLD_PUNYCODE_RE.test(tld)) {
    return null;
  }
  return trimmed;
}

/**
 * Validates that `secret` (after trimming surrounding whitespace) is a well-formed UTF-16
 * string without control characters and measures `32..1024` UTF-8 bytes, matching `apps/web`.
 */
export function assertValidAlertUnsubscribeSecret(secret: unknown): Buffer {
  if (typeof secret !== 'string' || secret.length > 4096 || !isWellFormedUtf16(secret)) {
    throw new Error(
      `RATE_ALERT_UNSUBSCRIBE_SECRET must be a non-empty UTF-8 string of at least ${MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES} bytes.`
    );
  }
  const trimmed = secret.trim();
  if (!trimmed || /\p{Cc}/u.test(trimmed)) {
    throw new Error(
      `RATE_ALERT_UNSUBSCRIBE_SECRET must be a non-empty UTF-8 string without control characters.`
    );
  }
  const keyBytes = Buffer.from(trimmed, 'utf8');
  if (
    keyBytes.byteLength < MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES ||
    keyBytes.byteLength > MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES
  ) {
    throw new Error(
      `RATE_ALERT_UNSUBSCRIBE_SECRET must be between ${MIN_ALERT_UNSUBSCRIBE_SECRET_BYTES} and ${MAX_ALERT_UNSUBSCRIBE_SECRET_BYTES} UTF-8 bytes (got ${keyBytes.byteLength}).`
    );
  }
  return keyBytes;
}

function normalizeStrictUuid(raw: unknown, fieldName: string): string {
  if (typeof raw !== 'string' || !STRICT_UUID_REGEX.test(raw)) {
    throw new Error(`${fieldName} must be a canonical UUID.`);
  }
  return raw.toLowerCase();
}

/**
 * Signs a canonical `v1.<payloadB64>.<sigB64>` RFC 8058 unsubscribe token.
 * Key order is strictly locked to `{ v, aid, email, mid, iat, exp }` for cross-package interoperability.
 */
export function signAlertUnsubscribeToken(
  input: SignAlertUnsubscribeTokenInput,
  secret: string
): string {
  const keyBytes = assertValidAlertUnsubscribeSecret(secret);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Token input must be an object.');
  }

  const aid = normalizeStrictUuid(input.alertId, 'alertId');
  const mid = normalizeStrictUuid(input.masterProductId, 'masterProductId');
  const normalizedLowerEmail = normalizeAlertSubscriberEmail(input.email);
  if (!normalizedLowerEmail) {
    throw new Error('Invalid subscriber email for alert unsubscribe token.');
  }

  const issuedAtUnixSec =
    input.issuedAtUnixSec === undefined ? Math.floor(Date.now() / 1000) : input.issuedAtUnixSec;
  if (
    typeof issuedAtUnixSec !== 'number' ||
    !Number.isSafeInteger(issuedAtUnixSec) ||
    issuedAtUnixSec <= 0 ||
    issuedAtUnixSec + ALERT_UNSUBSCRIBE_TTL_SECONDS > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('issuedAtUnixSec must be a positive safe integer.');
  }

  const exp = issuedAtUnixSec + ALERT_UNSUBSCRIBE_TTL_SECONDS;
  const payloadJson = JSON.stringify({
    v: ALERT_UNSUBSCRIBE_TOKEN_VERSION,
    aid,
    email: normalizedLowerEmail,
    mid,
    iat: issuedAtUnixSec,
    exp,
  });
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const sigB64 = createHmac('sha256', keyBytes)
    .update(`${ALERT_UNSUBSCRIBE_SIGNING_PREFIX}${payloadB64}`, 'utf8')
    .digest('base64url');

  return `v1.${payloadB64}.${sigB64}`;
}

/**
 * Verifies a `v1.<payloadB64>.<sigB64>` token in constant time (`timingSafeEqual`),
 * enforcing canonical base64url encoding, fatal UTF-8 decoding, prototype-safe JSON parsing,
 * schema checks, and expiry.
 */
export function verifyAlertUnsubscribeToken(
  token: unknown,
  secret: string,
  options: { readonly nowUnixSec?: number } = {}
): VerifyAlertUnsubscribeTokenResult {
  const keyBytes = assertValidAlertUnsubscribeSecret(secret);

  const nowUnixSec =
    options?.nowUnixSec === undefined ? Math.floor(Date.now() / 1000) : options.nowUnixSec;
  if (typeof nowUnixSec !== 'number' || !Number.isFinite(nowUnixSec)) {
    throw new Error('nowUnixSec must be a finite number.');
  }

  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH ||
    !isWellFormedUtf16(token)
  ) {
    return { ok: false, reason: 'malformed_token' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed_token' };
  }
  const [versionPart, payloadB64, sigB64] = parts as [string, string, string];
  if (!versionPart || !payloadB64 || !sigB64) {
    return { ok: false, reason: 'malformed_token' };
  }
  if (!BASE64URL_SEGMENT_RE.test(payloadB64) || !BASE64URL_SEGMENT_RE.test(sigB64)) {
    return { ok: false, reason: 'malformed_token' };
  }
  if (versionPart !== 'v1') {
    return { ok: false, reason: 'unsupported_version' };
  }

  const actualSig = Buffer.from(sigB64, 'base64url');
  if (actualSig.toString('base64url') !== sigB64) {
    return { ok: false, reason: 'malformed_token' };
  }
  const expectedSig = createHmac('sha256', keyBytes)
    .update(`${ALERT_UNSUBSCRIBE_SIGNING_PREFIX}${payloadB64}`, 'utf8')
    .digest();

  if (actualSig.byteLength !== expectedSig.byteLength || !timingSafeEqual(actualSig, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const payloadBytes = Buffer.from(payloadB64, 'base64url');
  if (payloadBytes.toString('base64url') !== payloadB64) {
    return { ok: false, reason: 'invalid_payload' };
  }

  let parsed: unknown;
  try {
    const rawJson = FATAL_UTF8_DECODER.decode(payloadBytes);
    let hasUnsafeKey = false;
    parsed = JSON.parse(rawJson, (key, value: unknown) => {
      if (UNSAFE_JSON_KEYS.has(key)) {
        hasUnsafeKey = true;
        return undefined;
      }
      return value;
    });
    if (hasUnsafeKey) {
      return { ok: false, reason: 'invalid_payload' };
    }
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== EXPECTED_PAYLOAD_KEYS.size || keys.some(k => !EXPECTED_PAYLOAD_KEYS.has(k))) {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (obj.v !== ALERT_UNSUBSCRIBE_TOKEN_VERSION) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (typeof obj.aid !== 'string' || !STRICT_UUID_REGEX.test(obj.aid)) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (typeof obj.mid !== 'string' || !STRICT_UUID_REGEX.test(obj.mid)) {
    return { ok: false, reason: 'invalid_payload' };
  }
  const normalizedEmail = normalizeAlertSubscriberEmail(obj.email);
  if (!normalizedEmail || obj.email !== normalizedEmail) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (
    typeof obj.iat !== 'number' ||
    !Number.isSafeInteger(obj.iat) ||
    obj.iat <= 0 ||
    typeof obj.exp !== 'number' ||
    !Number.isSafeInteger(obj.exp) ||
    obj.exp <= obj.iat
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (nowUnixSec > obj.exp) {
    return { ok: false, reason: 'expired_token' };
  }

  return {
    ok: true,
    payload: {
      v: 1,
      aid: obj.aid.toLowerCase(),
      email: normalizedEmail,
      mid: obj.mid.toLowerCase(),
      iat: obj.iat,
      exp: obj.exp,
    },
  };
}
