import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { type NextRequest, NextResponse } from 'next/server';
import {
  normalizeAlertUnsubscribeSecret,
  verifyAlertUnsubscribeToken,
  type AlertUnsubscribeTokenPayload,
} from '@/lib/alert-unsubscribe-token';
import { createLogger, serializeError } from '@/lib/logger';
import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  payloadTooLargeResponse,
  rateLimitExceededResponse,
} from '@/server/rate/api-handler';
import { normalizeOpenApiServerOrigin } from '@/server/rate/openapi';

const log = createLogger('api.watchlist.unsubscribe');

export const MAX_UNSUBSCRIBE_BODY_BYTES = 4_096;
const MAX_CONTENT_TYPE_HEADER_LENGTH = 512;
const BODY_READ_TIMEOUT_MS = 5_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const UNSUBSCRIBE_RATE_LIMIT_WINDOW_MS = 60_000;
const UNSUBSCRIBE_RATE_LIMIT_MAX_REQUESTS = 20;

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
};

export const unsubscribePostRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: UNSUBSCRIBE_RATE_LIMIT_WINDOW_MS,
  maxRequests: UNSUBSCRIBE_RATE_LIMIT_MAX_REQUESTS,
  maxBuckets: 5_000,
});

const UTF8_FATAL_DECODER = new TextDecoder('utf-8', { fatal: true });
const DIGITS_ONLY_RE = /^\d{1,10}$/;
const RESEND_AUDIENCE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ALPHA_TLD_RE = /^[a-z]{2,63}$/;
const VERCEL_PREVIEW_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/;

const DISALLOWED_WEBHOOK_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.arpa',
  '.lan',
  '.corp',
  '.home',
  '.intranet',
  '.nip.io',
  '.sslip.io',
  '.xip.io',
  '.lvh.me',
  '.localtest.me',
] as const;

function jsonNoStore(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function isSafeUnsubscribeWebhookUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 1024 || /[\s\p{Cc}]/u.test(trimmed)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password || parsed.hash) return false;
  if (parsed.port !== '' && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host.length > 253 ||
    !host.includes('.') ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..') ||
    host.startsWith('[') ||
    host.includes(':') ||
    host === 'localhost' ||
    isIP(host) !== 0 ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /^\d+$/.test(host)
  ) {
    return false;
  }
  if (
    DISALLOWED_WEBHOOK_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return false;
  }
  const labels = host.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (!ALPHA_TLD_RE.test(tld)) return false;
  return labels.every((label) => DNS_LABEL_RE.test(label));
}

function isLoopbackUrlHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function collectTrustedPreviewHosts(): string[] {
  const out: string[] = [];
  for (const candidate of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
  ]) {
    const cleaned = candidate?.trim().toLowerCase() ?? '';
    if (cleaned && VERCEL_PREVIEW_HOST_RE.test(cleaned)) {
      out.push(cleaned);
    }
  }
  return out;
}

function resolveSafeRedirectOrigin(request: Request): string {
  const configuredOrigin = normalizeOpenApiServerOrigin(
    process.env.APP_PUBLIC_URL || 'https://rate.vn'
  );
  try {
    const reqUrl = new URL(request.url);
    if (
      isLoopbackUrlHostname(reqUrl.hostname) &&
      (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') &&
      !reqUrl.username &&
      !reqUrl.password &&
      (reqUrl.port === '' || /^\d{1,5}$/.test(reqUrl.port))
    ) {
      return reqUrl.origin;
    }
    const reqHostLower = reqUrl.host.toLowerCase();
    for (const previewHost of collectTrustedPreviewHosts()) {
      if (reqUrl.protocol === 'https:' && reqHostLower === previewHost) {
        return `https://${previewHost}`;
      }
    }
  } catch {
    // Fall back to configured canonical origin
  }
  return configuredOrigin;
}

function canonicalizeHostHeaderOrigin(
  protocol: string,
  rawHost: string | null | undefined
): string | null {
  if (typeof rawHost !== 'string') return null;
  const trimmed = rawHost.trim();
  if (
    !trimmed ||
    trimmed.length > 255 ||
    /[\s\p{Cc}/\\@]/u.test(trimmed) ||
    trimmed.startsWith('.') ||
    trimmed.endsWith('.') ||
    trimmed.includes('..')
  ) {
    return null;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  try {
    const parsed = new URL(`${protocol}//${trimmed}`);
    if (parsed.username || parsed.password || parsed.origin === 'null') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Verifies same-origin browser requests without trusting spoofed `X-Forwarded-Host`
 * outside Vercel, enforcing scheme matching (`http:` vs `https:`), `Sec-Fetch-Site`
 * (`same-origin` when present), and default-port normalization (`:443` / `:80`).
 */
function isTrustedSameOriginPost(request: Request): boolean {
  const secFetchSite =
    request.headers.get('sec-fetch-site')?.trim().toLowerCase() ?? '';
  if (secFetchSite !== '' && secFetchSite !== 'same-origin') {
    return false;
  }

  const rawOrigin = request.headers.get('origin');
  if (
    typeof rawOrigin !== 'string' ||
    !rawOrigin ||
    rawOrigin.length > 2048 ||
    /[\s\p{Cc}]/u.test(rawOrigin)
  ) {
    return false;
  }

  let parsedOrigin: URL;
  let reqUrl: URL;
  try {
    parsedOrigin = new URL(rawOrigin);
    reqUrl = new URL(request.url);
  } catch {
    return false;
  }

  if (
    (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') ||
    parsedOrigin.username !== '' ||
    parsedOrigin.password !== '' ||
    parsedOrigin.origin === 'null'
  ) {
    return false;
  }

  const trustedOrigins = new Set<string>([
    normalizeOpenApiServerOrigin(
      process.env.APP_PUBLIC_URL || 'https://rate.vn'
    ),
  ]);
  if (
    isLoopbackUrlHostname(reqUrl.hostname) &&
    (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') &&
    !reqUrl.username &&
    !reqUrl.password
  ) {
    trustedOrigins.add(reqUrl.origin);
  }
  for (const previewHost of collectTrustedPreviewHosts()) {
    trustedOrigins.add(`https://${previewHost}`);
  }

  if (!trustedOrigins.has(parsedOrigin.origin)) {
    return false;
  }

  const proto = reqUrl.protocol === 'http:' ? 'http:' : 'https:';
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const forwardedOrigin = canonicalizeHostHeaderOrigin(proto, forwardedHost);
  const directOrigin = canonicalizeHostHeaderOrigin(
    proto,
    request.headers.get('host') ?? reqUrl.host
  );

  // Only prefer X-Forwarded-Host when set by Vercel or when it already resolves
  // to an allowlisted canonical origin (e.g. `rate.vn:443` behind an ingress proxy).
  const effectiveOrigin =
    process.env.VERCEL === '1'
      ? (forwardedOrigin ?? directOrigin)
      : forwardedOrigin && trustedOrigins.has(forwardedOrigin)
        ? forwardedOrigin
        : directOrigin;

  return effectiveOrigin !== null && parsedOrigin.origin === effectiveOrigin;
}

function isCrossSiteFetchMetadata(request: Request): boolean {
  const secFetchSite =
    request.headers.get('sec-fetch-site')?.trim().toLowerCase() ?? '';
  if (secFetchSite !== '' && secFetchSite !== 'same-origin') {
    return true;
  }
  if (request.headers.get('origin') !== null) {
    return !isTrustedSameOriginPost(request);
  }
  return false;
}

function resolveLocalizedWatchlistPath(
  rawLocale: string | null | undefined
): '/watchlist' | '/vi/watchlist' | '/en/watchlist' | '/cs/watchlist' {
  const cleaned =
    typeof rawLocale === 'string' ? rawLocale.trim().toLowerCase() : '';
  if (cleaned === 'vi') return '/vi/watchlist';
  if (cleaned === 'en') return '/en/watchlist';
  if (cleaned === 'cs') return '/cs/watchlist';
  return '/watchlist';
}

async function readBoundedRawBody(
  request: Request,
  maxBytes = MAX_UNSUBSCRIBE_BODY_BYTES
): Promise<
  | { kind: 'ok'; bytes: Uint8Array }
  | { kind: 'too_large' }
  | { kind: 'malformed' }
> {
  const rawLength = request.headers.get('content-length');
  if (rawLength !== null && rawLength.trim() !== '') {
    const trimmedLength = rawLength.trim();
    if (!DIGITS_ONLY_RE.test(trimmedLength)) {
      return { kind: 'malformed' };
    }
    const declared = Number(trimmedLength);
    if (!Number.isSafeInteger(declared)) {
      return { kind: 'malformed' };
    }
    if (declared > maxBytes) {
      return { kind: 'too_large' };
    }
  }
  if (!request.body) {
    return { kind: 'ok', bytes: new Uint8Array(0) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ done: true; value: undefined }>(
    (resolve) => {
      timerId = setTimeout(() => {
        timedOut = true;
        void reader.cancel().catch(() => undefined);
        resolve({ done: true, value: undefined });
      }, BODY_READ_TIMEOUT_MS);
    }
  );

  try {
    for (;;) {
      const { done, value } = await Promise.race([
        reader.read(),
        timeoutPromise,
      ]);
      if (timedOut) {
        return { kind: 'malformed' };
      }
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { kind: 'malformed' };
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'ok', bytes: combined };
}

function hasCaseInsensitiveOneClickPair(
  entries: Iterable<[string, FormDataEntryValue | string]>
): boolean {
  let matchCount = 0;
  let matchedOneClick = false;
  for (const [key, val] of entries) {
    if (key.trim().toLowerCase() === 'list-unsubscribe') {
      matchCount += 1;
      if (typeof val === 'string' && val.trim().toLowerCase() === 'one-click') {
        matchedOneClick = true;
      }
    }
  }
  return matchCount === 1 && matchedOneClick;
}

async function parseMultipartOneClick(
  rawContentType: string,
  bytes: Uint8Array
): Promise<boolean> {
  if (!/\bboundary\s*=/i.test(rawContentType)) {
    return false;
  }
  const normalizedContentType = rawContentType.replace(
    /\bboundary\s*=\s*/i,
    'boundary='
  );
  const tryParse = async (payload: Uint8Array): Promise<boolean> => {
    const synthetic = new Request('http://localhost/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': normalizedContentType },
      body: Buffer.from(payload),
    });
    const formData = await synthetic.formData();
    return hasCaseInsensitiveOneClickPair(formData.entries());
  };

  try {
    return await tryParse(bytes);
  } catch {
    try {
      const text = UTF8_FATAL_DECODER.decode(bytes);
      if (!text.includes('\r\n') && text.includes('\n')) {
        const crlfBytes = new TextEncoder().encode(text.replace(/\n/g, '\r\n'));
        return await tryParse(crlfBytes);
      }
    } catch {
      return false;
    }
    return false;
  }
}

type ExtractedPostToken =
  { ok: true; token: string } | { ok: false; response: NextResponse };

async function extractPostUnsubscribeToken(
  request: Request
): Promise<ExtractedPostToken> {
  const rawContentType = request.headers.get('content-type') ?? '';
  if (rawContentType.length > MAX_CONTENT_TYPE_HEADER_LENGTH) {
    return {
      ok: false,
      response: jsonNoStore(400, {
        ok: false,
        code: 'UNSUPPORTED_CONTENT_TYPE',
        error: 'Malformed Content-Type header',
      }),
    };
  }
  const mediaType = rawContentType.split(';')[0]?.trim().toLowerCase() ?? '';
  let queryToken = '';
  try {
    queryToken = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  } catch {
    queryToken = '';
  }

  if (mediaType === 'application/json') {
    if (!isTrustedSameOriginPost(request)) {
      return {
        ok: false,
        response: jsonNoStore(403, {
          ok: false,
          code: 'CROSS_SITE',
          error: 'Cross-site unsubscribe request rejected',
        }),
      };
    }

    const bodyRead = await readBoundedRawBody(request);
    if (bodyRead.kind === 'too_large') {
      return {
        ok: false,
        response: payloadTooLargeResponse(NO_STORE_HEADERS),
      };
    }
    if (bodyRead.kind === 'malformed' || bodyRead.bytes.byteLength === 0) {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_BODY',
          error: 'Invalid JSON request body',
        }),
      };
    }

    let sawForbiddenKey = false;
    let parsed: unknown;
    try {
      const jsonText = UTF8_FATAL_DECODER.decode(bodyRead.bytes);
      parsed = JSON.parse(jsonText, (key, value) => {
        if (
          key === '__proto__' ||
          key === 'constructor' ||
          key === 'prototype'
        ) {
          sawForbiddenKey = true;
          return undefined;
        }
        return value;
      });
    } catch {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_BODY',
          error: 'Invalid JSON request body',
        }),
      };
    }

    if (
      sawForbiddenKey ||
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_BODY',
          error: 'Invalid JSON request body',
        }),
      };
    }

    const rawBodyToken = (parsed as Record<string, unknown>).token;
    const bodyToken =
      typeof rawBodyToken === 'string' ? rawBodyToken.trim() : '';
    if (!bodyToken || (queryToken && queryToken !== bodyToken)) {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_TOKEN',
          error: 'Missing or mismatched unsubscribe token',
        }),
      };
    }
    return { ok: true, token: bodyToken };
  }

  if (
    mediaType === 'application/x-www-form-urlencoded' ||
    mediaType === 'multipart/form-data'
  ) {
    const bodyRead = await readBoundedRawBody(request);
    if (bodyRead.kind === 'too_large') {
      return {
        ok: false,
        response: payloadTooLargeResponse(NO_STORE_HEADERS),
      };
    }
    if (bodyRead.kind === 'malformed') {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_ONE_CLICK_BODY',
          error: 'Malformed form request body',
        }),
      };
    }

    let hasOneClick = false;
    if (mediaType === 'application/x-www-form-urlencoded') {
      try {
        const text = UTF8_FATAL_DECODER.decode(bodyRead.bytes);
        const params = new URLSearchParams(text);
        hasOneClick = hasCaseInsensitiveOneClickPair(params.entries());
      } catch {
        hasOneClick = false;
      }
    } else {
      hasOneClick = await parseMultipartOneClick(
        rawContentType,
        bodyRead.bytes
      );
    }

    if (!hasOneClick) {
      if (isCrossSiteFetchMetadata(request)) {
        return {
          ok: false,
          response: jsonNoStore(403, {
            ok: false,
            code: 'CROSS_SITE',
            error:
              'Cross-site form POST without List-Unsubscribe=One-Click rejected',
          }),
        };
      }
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_ONE_CLICK_BODY',
          error: 'RFC 8058 form POST requires List-Unsubscribe=One-Click',
        }),
      };
    }

    if (!queryToken) {
      return {
        ok: false,
        response: jsonNoStore(400, {
          ok: false,
          code: 'INVALID_TOKEN',
          error: 'Missing unsubscribe token query parameter',
        }),
      };
    }
    return { ok: true, token: queryToken };
  }

  const rawLength = request.headers.get('content-length')?.trim() ?? '';
  if (
    DIGITS_ONLY_RE.test(rawLength) &&
    Number(rawLength) > MAX_UNSUBSCRIBE_BODY_BYTES
  ) {
    return {
      ok: false,
      response: payloadTooLargeResponse(NO_STORE_HEADERS),
    };
  }
  if (isCrossSiteFetchMetadata(request)) {
    return {
      ok: false,
      response: jsonNoStore(403, {
        ok: false,
        code: 'CROSS_SITE',
        error: 'Cross-site unsubscribe request rejected',
      }),
    };
  }
  return {
    ok: false,
    response: jsonNoStore(400, {
      ok: false,
      code: 'UNSUPPORTED_CONTENT_TYPE',
      error:
        'Expected application/json or RFC 8058 List-Unsubscribe=One-Click form body',
    }),
  };
}

interface PersistenceConfig {
  resend: { apiKey: string; audienceId: string } | null;
  webhookUrl: string | null;
}

function resolvePersistenceConfig():
  { ok: true; config: PersistenceConfig } | { ok: false; error: string } {
  const resendKeyRaw = process.env.RESEND_API_KEY?.trim() ?? '';
  const resendAudienceRaw = process.env.RESEND_AUDIENCE_ID?.trim() ?? '';
  let resend: { apiKey: string; audienceId: string } | null = null;
  if (resendAudienceRaw && !resendKeyRaw) {
    return {
      ok: false,
      error: 'Unsubscribe persistence is not configured',
    };
  }
  if (resendKeyRaw && resendAudienceRaw) {
    if (
      /[\s\p{Cc}]/u.test(resendKeyRaw) ||
      !RESEND_AUDIENCE_ID_RE.test(resendAudienceRaw)
    ) {
      return {
        ok: false,
        error: 'Unsubscribe persistence is misconfigured',
      };
    }
    resend = { apiKey: resendKeyRaw, audienceId: resendAudienceRaw };
  }

  const rawWebhook = process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL?.trim() ?? '';
  let webhookUrl: string | null = null;
  if (rawWebhook) {
    if (!isSafeUnsubscribeWebhookUrl(rawWebhook)) {
      return {
        ok: false,
        error: 'Unsubscribe webhook URL must be a public https:// endpoint',
      };
    }
    webhookUrl = new URL(rawWebhook).toString();
  }

  if (!resend && !webhookUrl) {
    return {
      ok: false,
      error: 'Unsubscribe persistence is not configured',
    };
  }

  return { ok: true, config: { resend, webhookUrl } };
}

function releaseResponseBody(res: Response): void {
  try {
    void res.body?.cancel()?.catch(() => undefined);
  } catch {
    // Never let body cleanup turn a completed upstream status check into an error
  }
}

async function upsertResendUnsubscribedContact(
  apiKey: string,
  audienceId: string,
  email: string
): Promise<boolean> {
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const baseContactsUrl = `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const createRes = await fetch(baseContactsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, unsubscribed: true }),
      redirect: 'error',
      signal,
    });
    const createOk = createRes.ok;
    const createStatus = createRes.status;
    releaseResponseBody(createRes);
    if (createOk) {
      return true;
    }

    if (createStatus === 409 || createStatus === 422) {
      const patchRes = await fetch(
        `${baseContactsUrl}/${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ unsubscribed: true }),
          redirect: 'error',
          signal,
        }
      );
      const patchOk = patchRes.ok;
      const patchStatus = patchRes.status;
      releaseResponseBody(patchRes);
      if (patchOk) {
        return true;
      }
      log.error('Resend unsubscribe contact PATCH fallback failed', {
        status: patchStatus,
      });
      return false;
    }

    log.error('Resend unsubscribe contact POST failed', {
      status: createStatus,
    });
    return false;
  } catch (err: unknown) {
    log.error('Resend unsubscribe request threw', {
      error: serializeError(err),
    });
    return false;
  }
}

async function persistUnsubscribeSuppression(
  verified: AlertUnsubscribeTokenPayload,
  secret: string,
  config: PersistenceConfig
): Promise<boolean> {
  const tasks: Promise<boolean>[] = [];

  if (config.resend) {
    tasks.push(
      upsertResendUnsubscribedContact(
        config.resend.apiKey,
        config.resend.audienceId,
        verified.email
      )
    );
  }

  if (config.webhookUrl) {
    const webhookBody = JSON.stringify({
      event: 'price_alert.unsubscribed',
      ...verified,
      unsubscribedAt: new Date().toISOString(),
    });
    const sigHex = createHmac('sha256', secret)
      .update(webhookBody, 'utf8')
      .digest('hex');
    const targetUrl = config.webhookUrl;
    tasks.push(
      fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rate-Unsubscribe-Signature': `sha256=${sigHex}`,
        },
        body: webhookBody,
        redirect: 'error',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
        .then((res) => {
          const ok = res.ok;
          const status = res.status;
          releaseResponseBody(res);
          if (!ok) {
            log.error('Unsubscribe webhook returned non-2xx', {
              status,
            });
            return false;
          }
          return true;
        })
        .catch((err: unknown) => {
          log.error('Unsubscribe webhook request threw', {
            error: serializeError(err),
          });
          return false;
        })
    );
  }

  const outcomes = await Promise.all(tasks);
  return outcomes.length > 0 && outcomes.every(Boolean);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...NO_STORE_HEADERS,
      Allow: 'GET, POST, OPTIONS',
    },
  });
}

/**
 * GET /api/v1/rate/watchlist/unsubscribe?token=<token>
 * RFC 8058 Section 3.1 mail-scanner safe landing handler: never mutates state
 * on GET. Validates token signature and expiration, then redirects (303) to the
 * localized /watchlist confirmation banner.
 */
export async function GET(request: NextRequest) {
  const secret = normalizeAlertUnsubscribeSecret(
    process.env.RATE_ALERT_UNSUBSCRIBE_SECRET
  );
  if (!secret) {
    return jsonNoStore(503, {
      ok: false,
      code: 'UNSUBSCRIBE_BACKEND_UNCONFIGURED',
      error: 'Unsubscribe verification is not configured',
    });
  }

  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(request.url).searchParams;
  } catch {
    return jsonNoStore(400, {
      ok: false,
      code: 'MALFORMED_TOKEN',
      error: 'Malformed request URL',
    });
  }

  const rawToken = searchParams.get('token')?.trim() ?? '';
  const verified = verifyAlertUnsubscribeToken(rawToken, secret);
  if (!verified.ok) {
    return jsonNoStore(400, {
      ok: false,
      code: verified.code,
      error: verified.error,
    });
  }

  const origin = resolveSafeRedirectOrigin(request);
  const path = resolveLocalizedWatchlistPath(searchParams.get('locale'));
  const redirectUrl = new URL(path, origin);
  redirectUrl.searchParams.set('unsubscribe', rawToken);

  return new NextResponse(null, {
    status: 303,
    headers: {
      ...NO_STORE_HEADERS,
      Location: redirectUrl.toString(),
    },
  });
}

/**
 * POST /api/v1/rate/watchlist/unsubscribe
 * Executes RFC 8058 one-click email suppression (`List-Unsubscribe=One-Click`
 * form body + `?token=<token>`) or same-origin browser JSON confirmation
 * (`{ "token": "<token>" }`), failing closed when persistence is unconfigured.
 */
export async function POST(request: NextRequest) {
  try {
    const clientKey = extractClientRateLimitKey(request.headers);
    if (!unsubscribePostRateLimiter.allow(clientKey)) {
      return rateLimitExceededResponse(
        'Rate limit exceeded. Maximum 20 unsubscribe requests per minute.',
        NO_STORE_HEADERS,
        60
      );
    }

    const secret = normalizeAlertUnsubscribeSecret(
      process.env.RATE_ALERT_UNSUBSCRIBE_SECRET
    );
    if (!secret) {
      return jsonNoStore(503, {
        ok: false,
        code: 'UNSUBSCRIBE_BACKEND_UNCONFIGURED',
        error: 'Unsubscribe verification is not configured',
      });
    }

    const extracted = await extractPostUnsubscribeToken(request);
    if (!extracted.ok) {
      return extracted.response;
    }

    const verified = verifyAlertUnsubscribeToken(extracted.token, secret);
    if (!verified.ok) {
      return jsonNoStore(400, {
        ok: false,
        code: verified.code,
        error: verified.error,
      });
    }

    const persistence = resolvePersistenceConfig();
    if (!persistence.ok) {
      return jsonNoStore(503, {
        ok: false,
        code: 'UNSUBSCRIBE_BACKEND_UNCONFIGURED',
        error: persistence.error,
      });
    }

    const persisted = await persistUnsubscribeSuppression(
      verified.payload,
      secret,
      persistence.config
    );
    if (!persisted) {
      return jsonNoStore(502, {
        ok: false,
        code: 'PERSIST_FAILED',
        error: 'Could not persist unsubscribe preference',
      });
    }

    return jsonNoStore(200, {
      ok: true,
      unsubscribed: true,
    });
  } catch (error) {
    log.error('POST /watchlist/unsubscribe failed', {
      error: serializeError(error),
    });
    return jsonNoStore(500, {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Internal server error',
    });
  }
}
