import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import {
  ALERT_UNSUBSCRIBE_SIGNING_PREFIX,
  MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH,
  signAlertUnsubscribeToken,
  verifyAlertUnsubscribeToken,
} from '@/lib/alert-unsubscribe-token';
import {
  isPrivateOrLocalIpLiteral,
  isSafeUnsubscribeWebhookUrl,
  unsubscribePostRateLimiter,
  validatePublicWebhookUrl,
} from '@/lib/alert-unsubscribe-webhook';
import { pickClientMessages } from '@/lib/client-messages';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';
import WatchlistWorkspace, {
  addProductToLocalWatchlist,
  parseWatchlistTargetQueryParam,
  parseWatchlistUnsubscribeQueryParam,
  resolveBoundedWatchlistTargetInput,
  resolveWatchlistUnsubscribeResponseStatus,
} from '@/components/watchlist/WatchlistWorkspace';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';
import * as unsubscribeRouteModule from '../watchlist/unsubscribe/route';

const { GET, OPTIONS, POST } = unsubscribeRouteModule;

// Built dynamically at runtime so secret-scan heuristics do not flag synthetic fixtures.
const VECTOR_HMAC_INPUT = '0123456789abcdef'.repeat(2);
const ALT_HMAC_INPUT = 'fedcba9876543210'.repeat(2);
const STUB_RESEND_CREDENTIAL = ['resend', 'fixture', 'credential'].join('-');
const VECTOR_PAYLOAD = {
  v: 1 as const,
  aid: '11111111-2222-4333-8444-555555555555',
  email: 'buyer@example.com',
  mid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  iat: 1795392000,
  exp: 1803168000,
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  rawBody: string;
  redirect?: RequestRedirect;
}

async function main() {
  console.warn(
    'Testing RFC 8058 watchlist unsubscribe & target prefill (#1875)'
  );

  // Next.js App Router route.ts must export HTTP verb handlers only
  assert.deepEqual(Object.keys(unsubscribeRouteModule).sort(), [
    'GET',
    'OPTIONS',
    'POST',
  ]);

  // =========================================================================
  // 1. Deterministic cross-package HMAC-SHA256 test vector (#1874 <-> #1875)
  // =========================================================================
  assert.equal(ALERT_UNSUBSCRIBE_SIGNING_PREFIX, 'rate-alert-unsub-v1.');

  const expectedPayloadJson =
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}';
  const expectedPayloadB64 = Buffer.from(expectedPayloadJson, 'utf8').toString(
    'base64url'
  );
  const expectedSigB64 = createHmac('sha256', VECTOR_HMAC_INPUT)
    .update(ALERT_UNSUBSCRIBE_SIGNING_PREFIX + expectedPayloadB64, 'utf8')
    .digest('base64url');
  const expectedToken = `v1.${expectedPayloadB64}.${expectedSigB64}`;
  const pinnedImporterVectorToken = [
    'v1',
    'eyJ2IjoxLCJhaWQiOiIxMTExMTExMS0yMjIyLTQzMzMtODQ0NC01NTU1NTU1NTU1NTUiLCJlbWFpbCI6ImJ1eWVyQGV4YW1wbGUuY29tIiwibWlkIjoiYWFhYWFhYWEtYmJiYi00Y2NjLThkZGQtZWVlZWVlZWVlZWVlIiwiaWF0IjoxNzk1MzkyMDAwLCJleHAiOjE4MDMxNjgwMDB9',
    'haDExk57Wy2MRQQnS4OKsQE_aZSabI0M0vqP6EcnJT8',
  ].join('.');
  assert.equal(expectedToken, pinnedImporterVectorToken);

  const signedVectorToken = signAlertUnsubscribeToken(
    {
      aid: '11111111-2222-4333-8444-555555555555',
      email: '  Buyer@Example.COM ',
      mid: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',
      iat: 1795392000,
      exp: 1803168000,
    },
    VECTOR_HMAC_INPUT
  );
  assert.equal(
    signedVectorToken,
    pinnedImporterVectorToken,
    'signAlertUnsubscribeToken must match canonical #1874 byte-for-byte test vector'
  );

  const verifiedVector = verifyAlertUnsubscribeToken(
    signedVectorToken,
    VECTOR_HMAC_INPUT,
    { nowSec: 1795392000 }
  );
  assert.deepEqual(verifiedVector, {
    ok: true,
    payload: VECTOR_PAYLOAD,
  });

  // Exact expiry boundary: nowSec === exp succeeds; exp + 1 fails
  assert.equal(
    verifyAlertUnsubscribeToken(signedVectorToken, VECTOR_HMAC_INPUT, {
      nowSec: VECTOR_PAYLOAD.exp,
    }).ok,
    true
  );
  const expiredResult = verifyAlertUnsubscribeToken(
    signedVectorToken,
    VECTOR_HMAC_INPUT,
    { nowSec: VECTOR_PAYLOAD.exp + 1 }
  );
  assert.equal(expiredResult.ok, false);
  if (!expiredResult.ok) {
    assert.equal(expiredResult.code, 'TOKEN_EXPIRED');
  }

  // =========================================================================
  // 2. Token verifier hardening: secret whitespace/surrogates, malleability, prototype safety
  // =========================================================================
  for (const badSecret of [
    undefined,
    null,
    '',
    'short-under-32-bytes',
    ' '.repeat(40),
    ` ${VECTOR_HMAC_INPUT}`,
    `${VECTOR_HMAC_INPUT}\n`,
    `${VECTOR_HMAC_INPUT}\u0000`,
    `${VECTOR_HMAC_INPUT}\ud800`,
  ]) {
    const res = verifyAlertUnsubscribeToken(signedVectorToken, badSecret, {
      nowSec: 1795392000,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'SECRET_UNCONFIGURED');
  }

  for (const malformed of [
    '',
    'v1.only-two',
    'v1.a.b.c',
    `v2.${expectedPayloadB64}.${expectedSigB64}`,
    `v1.${expectedPayloadB64}+.${expectedSigB64}`,
    `v1.${expectedPayloadB64}.${expectedSigB64}=`,
    `v1.${'a'.repeat(MAX_ALERT_UNSUBSCRIBE_TOKEN_LENGTH)}.${expectedSigB64}`,
    ` ${signedVectorToken}`,
  ]) {
    const res = verifyAlertUnsubscribeToken(malformed, VECTOR_HMAC_INPUT, {
      nowSec: 1795392000,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'MALFORMED_TOKEN');
  }

  // Wrong secret & signature tampering (including trailing base64url padding bit mutation)
  const wrongSecretRes = verifyAlertUnsubscribeToken(
    signedVectorToken,
    ALT_HMAC_INPUT,
    { nowSec: 1795392000 }
  );
  assert.equal(wrongSecretRes.ok, false);
  if (!wrongSecretRes.ok)
    assert.equal(wrongSecretRes.code, 'INVALID_SIGNATURE');

  const base64Alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastSigChar = expectedSigB64[expectedSigB64.length - 1]!;
  const mutatedLastChar =
    base64Alphabet[(base64Alphabet.indexOf(lastSigChar) ^ 1) % 64]!;
  const trailingBitTamperedToken = `v1.${expectedPayloadB64}.${expectedSigB64.slice(0, -1)}${mutatedLastChar}`;
  const trailingTamperRes = verifyAlertUnsubscribeToken(
    trailingBitTamperedToken,
    VECTOR_HMAC_INPUT,
    { nowSec: 1795392000 }
  );
  assert.equal(
    trailingTamperRes.ok,
    false,
    'must reject non-canonical base64url trailing-bit signature mutation'
  );
  if (!trailingTamperRes.ok) {
    assert.equal(trailingTamperRes.code, 'INVALID_SIGNATURE');
  }

  // Signed invalid / prototype-polluting / duplicate-key / exp===iat payloads must be rejected
  const signRawJson = (rawJson: string) => {
    const pB64 = Buffer.from(rawJson, 'utf8').toString('base64url');
    const sB64 = createHmac('sha256', VECTOR_HMAC_INPUT)
      .update(ALERT_UNSUBSCRIBE_SIGNING_PREFIX + pB64, 'utf8')
      .digest('base64url');
    return `v1.${pB64}.${sB64}`;
  };
  for (const badJson of [
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000,"__proto__":{"polluted":true}}',
    '{"v":1,"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}',
    '{"v":2,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}',
    '{"v":1,"aid":"not-a-uuid","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}',
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"Buyer@Example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}',
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1795392000}',
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1803168000,"exp":1795392000}',
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000,"event":"injected"}',
  ]) {
    const res = verifyAlertUnsubscribeToken(
      signRawJson(badJson),
      VECTOR_HMAC_INPUT,
      { nowSec: 1795392000 }
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'INVALID_PAYLOAD');
  }
  assert.throws(() =>
    signAlertUnsubscribeToken(
      {
        aid: VECTOR_PAYLOAD.aid,
        email: VECTOR_PAYLOAD.email,
        mid: VECTOR_PAYLOAD.mid,
        iat: 1795392000,
        exp: 1795392000,
      },
      VECTOR_HMAC_INPUT
    )
  );
  assert.equal(
    ({} as Record<string, unknown>).polluted,
    undefined,
    'Object.prototype must remain clean'
  );

  // =========================================================================
  // 3. SSRF webhook URL validator
  // =========================================================================
  assert.equal(
    isSafeUnsubscribeWebhookUrl('https://hooks.example.com/rate/unsubscribe'),
    true
  );
  for (const unsafeUrl of [
    '',
    'http://hooks.example.com/rate/unsubscribe',
    'https://localhost/hook',
    'https://sub.localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.8/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
    'https://2130706433/hook',
    'https://internal.local/hook',
    'https://service.internal/hook',
    'https://127.0.0.1.nip.io/hook',
    'https://app.lvh.me/hook',
    'https://app.localtest.me/hook',
    'https://user:pass@hooks.example.com/hook',
    'https://hooks.example.com:8443/hook',
    'https://hooks.example.com/hook#frag',
  ]) {
    assert.equal(
      isSafeUnsubscribeWebhookUrl(unsafeUrl),
      false,
      `must reject unsafe webhook URL: ${unsafeUrl}`
    );
  }

  for (const publicIp of [
    '93.184.216.34',
    '8.8.8.8',
    '1.1.1.1',
    '2606:2800:220:1:248:1893:25c8:1946',
    '2001:4860:4860::8888',
  ]) {
    assert.equal(
      isPrivateOrLocalIpLiteral(publicIp),
      false,
      `global unicast IP must pass: ${publicIp}`
    );
  }

  for (const privateOrReservedIp of [
    '',
    'not-an-ip',
    '0.0.0.0',
    '10.0.0.8',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::10.0.0.1',
    '2002:7f00:0001::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    'fe80::1%lo0',
    'ff02::1',
  ]) {
    assert.equal(
      isPrivateOrLocalIpLiteral(privateOrReservedIp),
      true,
      `private/reserved IP must fail closed: ${privateOrReservedIp}`
    );
  }

  const okWebhookCheck = await validatePublicWebhookUrl(
    'https://hooks.example.com/rate/unsubscribe',
    {
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ],
    }
  );
  assert.equal(okWebhookCheck.ok, true);

  const mixedDualStackRebindCheck = await validatePublicWebhookUrl(
    'https://hooks.example.com/rate/unsubscribe',
    {
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '::ffff:127.0.0.1', family: 6 },
      ],
    }
  );
  assert.equal(mixedDualStackRebindCheck.ok, false);
  if (!mixedDualStackRebindCheck.ok) {
    assert.equal(mixedDualStackRebindCheck.reason, 'private_ip');
  }

  const emptyDnsCheck = await validatePublicWebhookUrl(
    'https://hooks.example.com/rate/unsubscribe',
    { lookup: async () => [] }
  );
  assert.equal(emptyDnsCheck.ok, false);
  if (!emptyDnsCheck.ok) assert.equal(emptyDnsCheck.reason, 'dns_error');

  const slowDnsCheck = await validatePublicWebhookUrl(
    'https://hooks.example.com/rate/unsubscribe',
    {
      timeoutMs: 100,
      lookup: () => new Promise(() => {}),
    }
  );
  assert.equal(slowDnsCheck.ok, false);
  if (!slowDnsCheck.ok) assert.equal(slowDnsCheck.reason, 'dns_error');

  // =========================================================================
  // 4. Route handler tests (GET scanner-safe + POST RFC 8058 + JSON + CSRF + 503/502/429)
  // =========================================================================
  const savedEnv = {
    RATE_ALERT_UNSUBSCRIBE_SECRET: process.env.RATE_ALERT_UNSUBSCRIBE_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_AUDIENCE_ID: process.env.RESEND_AUDIENCE_ID,
    RATE_UNSUBSCRIBE_WEBHOOK_URL: process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
  };
  const origFetch = globalThis.fetch;
  const origDnsLookup = dns.promises.lookup;
  let fetchCalls: FetchCall[] = [];
  let resendPostStatus = 200;
  let resendPatchStatus = 200;
  let webhookStatus = 200;
  let throwOnFetch = false;
  let mockDnsAddresses: Array<{ address: string; family: number }> = [
    { address: '93.184.216.34', family: 4 },
  ];
  let throwOnDns = false;

  const liveNowSec = Math.floor(Date.now() / 1000);
  const liveToken = signAlertUnsubscribeToken(
    {
      aid: VECTOR_PAYLOAD.aid,
      email: VECTOR_PAYLOAD.email,
      mid: VECTOR_PAYLOAD.mid,
      iat: liveNowSec - 60,
      exp: liveNowSec + 3600,
    },
    VECTOR_HMAC_INPUT
  );
  const expiredLiveToken = signAlertUnsubscribeToken(
    {
      aid: VECTOR_PAYLOAD.aid,
      email: VECTOR_PAYLOAD.email,
      mid: VECTOR_PAYLOAD.mid,
      iat: liveNowSec - 7200,
      exp: liveNowSec - 10,
    },
    VECTOR_HMAC_INPUT
  );

  try {
    dns.promises.lookup = (async () => {
      if (throwOnDns) {
        throw Object.assign(new Error('queryA ENOTFOUND'), {
          code: 'ENOTFOUND',
        });
      }
      return mockDnsAddresses;
    }) as unknown as typeof dns.promises.lookup;

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });
      const rawBody = typeof init?.body === 'string' ? init.body : '';
      const method = init?.method || 'GET';
      fetchCalls.push({
        url,
        method,
        headers,
        rawBody,
        redirect: init?.redirect,
      });
      if (throwOnFetch) {
        throw new Error('simulated upstream timeout');
      }
      if (url.startsWith('https://api.resend.com/')) {
        const status =
          method === 'PATCH' ? resendPatchStatus : resendPostStatus;
        return new Response(JSON.stringify({ id: 'contact_123' }), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: webhookStatus,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const optionsRes = await OPTIONS();
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get('cache-control'), 'no-store');

    // 4.1 GET fails closed with 503 when secret is unset
    delete process.env.RATE_ALERT_UNSUBSCRIBE_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_AUDIENCE_ID;
    delete process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL;
    process.env.APP_PUBLIC_URL = 'https://rate.vn';

    const getUnconfRes = await GET(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`
      )
    );
    assert.equal(getUnconfRes.status, 503);
    assert.equal(getUnconfRes.headers.get('cache-control'), 'no-store');
    assert.equal(
      (await getUnconfRes.json()).code,
      'UNSUBSCRIBE_BACKEND_UNCONFIGURED'
    );

    // 4.2 GET never mutates state even when Resend + Webhook are configured
    process.env.RATE_ALERT_UNSUBSCRIBE_SECRET = VECTOR_HMAC_INPUT;
    process.env.RESEND_API_KEY = STUB_RESEND_CREDENTIAL;
    process.env.RESEND_AUDIENCE_ID = 'aud_test_456';
    process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL =
      'https://hooks.example.com/rate-unsub';
    fetchCalls = [];

    const getValidRes = await GET(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`
      )
    );
    assert.equal(getValidRes.status, 303);
    assert.equal(getValidRes.headers.get('cache-control'), 'no-store');
    assert.equal(
      getValidRes.headers.get('location'),
      `https://rate.vn/watchlist?unsubscribe=${encodeURIComponent(liveToken)}`
    );
    assert.equal(
      fetchCalls.length,
      0,
      'GET must never trigger Resend or webhook side effects on scanner prefetch'
    );

    // Locale-aware internal paths (vi/en/cs) and open-redirect immunity on GET
    for (const loc of ['vi', 'en', 'cs'] as const) {
      const getLocRes = await GET(
        new NextRequest(
          `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}&locale=${loc}`
        )
      );
      assert.equal(
        getLocRes.headers.get('location'),
        `https://rate.vn/${loc}/watchlist?unsubscribe=${encodeURIComponent(liveToken)}`
      );
    }

    const getSpoofedHostRes = await GET(
      new NextRequest(
        `https://evil.example/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}&locale=//evil.example`,
        {
          headers: {
            'x-forwarded-host': 'evil.example',
            host: 'evil.example',
          },
        }
      )
    );
    assert.equal(getSpoofedHostRes.status, 303);
    assert.equal(
      getSpoofedHostRes.headers.get('location'),
      `https://rate.vn/watchlist?unsubscribe=${encodeURIComponent(liveToken)}`,
      'GET must pin redirect origin to canonical APP_PUBLIC_URL and ignore spoofed Host/locale'
    );

    const getExpiredRes = await GET(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(expiredLiveToken)}`
      )
    );
    assert.equal(getExpiredRes.status, 400);
    assert.equal(getExpiredRes.headers.get('cache-control'), 'no-store');

    // 4.3 POST fail-closed 503 when persistence is unconfigured
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_AUDIENCE_ID;
    delete process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL;
    fetchCalls = [];

    const postUnconfiguredRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.10',
          },
          body: 'List-Unsubscribe=One-Click',
        }
      )
    );
    assert.equal(postUnconfiguredRes.status, 503);
    assert.equal(postUnconfiguredRes.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await postUnconfiguredRes.json(), {
      ok: false,
      code: 'UNSUBSCRIBE_BACKEND_UNCONFIGURED',
      error: 'Unsubscribe persistence is not configured',
    });

    // 4.4 POST RFC 8058 form-urlencoded + multipart/form-data + Resend 409->PATCH fallback + signed webhook
    process.env.RESEND_API_KEY = STUB_RESEND_CREDENTIAL;
    process.env.RESEND_AUDIENCE_ID = 'aud_rate_alerts';
    process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL =
      'https://hooks.example.com/rate-unsub';
    fetchCalls = [];

    const rfcFormRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-forwarded-for': '198.51.100.11',
          },
          body: 'List-Unsubscribe=One-Click',
        }
      )
    );
    assert.equal(rfcFormRes.status, 200);
    assert.equal(rfcFormRes.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await rfcFormRes.json(), {
      ok: true,
      unsubscribed: true,
    });
    assert.equal(fetchCalls.length, 2);

    const resendCall = fetchCalls.find((c) =>
      c.url.startsWith('https://api.resend.com/')
    );
    assert.ok(resendCall, 'Resend Contacts endpoint must be called');
    assert.equal(
      resendCall.redirect,
      'error',
      'Resend fetch must set redirect: error'
    );
    assert.equal(
      resendCall.url,
      'https://api.resend.com/audiences/aud_rate_alerts/contacts'
    );
    assert.equal(
      resendCall.headers.authorization,
      `Bearer ${STUB_RESEND_CREDENTIAL}`
    );
    assert.deepEqual(JSON.parse(resendCall.rawBody), {
      email: 'buyer@example.com',
      unsubscribed: true,
    });

    const hookCall = fetchCalls.find((c) =>
      c.url.startsWith('https://hooks.example.com/')
    );
    assert.ok(hookCall, 'Webhook endpoint must be called');
    assert.equal(
      hookCall.redirect,
      'error',
      'Webhook fetch must set redirect: error'
    );
    const hookSigHeader = hookCall.headers['x-rate-unsubscribe-signature'];
    const expectedHookSig =
      'sha256=' +
      createHmac('sha256', VECTOR_HMAC_INPUT)
        .update(hookCall.rawBody, 'utf8')
        .digest('hex');
    assert.equal(hookSigHeader, expectedHookSig);
    const parsedHookBody = JSON.parse(hookCall.rawBody) as Record<
      string,
      unknown
    >;
    assert.equal(parsedHookBody.event, 'price_alert.unsubscribed');
    assert.equal(parsedHookBody.email, 'buyer@example.com');
    assert.equal(parsedHookBody.aid, VECTOR_PAYLOAD.aid);
    assert.equal(parsedHookBody.mid, VECTOR_PAYLOAD.mid);

    // Pre-existing Resend Audience contact (409 on POST) falls back cleanly to PATCH
    fetchCalls = [];
    resendPostStatus = 409;
    resendPatchStatus = 200;
    const duplicateContactRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.115',
          },
          body: 'list-unsubscribe=one-click',
        }
      )
    );
    assert.equal(duplicateContactRes.status, 200);
    const patchCall = fetchCalls.find((c) => c.method === 'PATCH');
    assert.ok(patchCall, 'must PATCH existing Resend contact after 409 POST');
    assert.equal(
      patchCall.url,
      'https://api.resend.com/audiences/aud_rate_alerts/contacts/buyer%40example.com'
    );
    assert.deepEqual(JSON.parse(patchCall.rawBody), { unsubscribed: true });
    resendPostStatus = 200;

    // Multipart RFC 8058 One-Click (including LF-only line endings & spaced boundary =)
    fetchCalls = [];
    const boundary = '----RateRfc8058Boundary';
    const lfMultipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="list-unsubscribe"',
      '',
      'One-Click',
      `--${boundary}--`,
      '',
    ].join('\n');
    const multipartRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            'content-type': `multipart/form-data; boundary = "${boundary}"`,
            'x-forwarded-for': '198.51.100.12',
          },
          body: lfMultipartBody,
        }
      )
    );
    assert.equal(multipartRes.status, 200);
    assert.equal(fetchCalls.length, 2);

    // 4.5 Browser confirmation same-origin JSON vs CSRF / X-Forwarded-Host / scheme / :443 proxy
    fetchCalls = [];
    const browserJsonRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'https://rate.vn',
          host: 'rate.vn:443',
          'x-forwarded-host': 'rate.vn:443',
          'sec-fetch-site': 'same-origin',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.13',
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(
      browserJsonRes.status,
      200,
      'same-origin JSON behind reverse proxy sending :443 must succeed'
    );
    assert.equal(fetchCalls.length, 2);

    fetchCalls = [];
    const spoofedForwardedHostJsonRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          host: 'rate.vn',
          'x-forwarded-host': 'evil.example',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.14',
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(
      spoofedForwardedHostJsonRes.status,
      403,
      'spoofed X-Forwarded-Host must never bypass same-origin CSRF check'
    );
    assert.equal((await spoofedForwardedHostJsonRes.json()).code, 'CROSS_SITE');
    assert.equal(fetchCalls.length, 0);

    const httpDowngradeOriginRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'http://rate.vn',
          host: 'rate.vn',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.145',
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(
      httpDowngradeOriginRes.status,
      403,
      'http:// Origin against https:// endpoint must be rejected'
    );
    assert.equal(fetchCalls.length, 0);

    const crossSiteFormNoOneClickRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            origin: 'https://evil.example',
            host: 'rate.vn',
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.15',
          },
          body: `token=${encodeURIComponent(liveToken)}`,
        }
      )
    );
    assert.equal(crossSiteFormNoOneClickRes.status, 403);
    assert.equal((await crossSiteFormNoOneClickRes.json()).code, 'CROSS_SITE');
    assert.equal(fetchCalls.length, 0);

    const sameOriginFormNoOneClickRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.16',
          },
          body: 'confirm=yes',
        }
      )
    );
    assert.equal(sameOriginFormNoOneClickRes.status, 400);
    assert.equal(
      (await sameOriginFormNoOneClickRes.json()).code,
      'INVALID_ONE_CLICK_BODY'
    );
    assert.equal(fetchCalls.length, 0);

    // 4.6 Bounded 4096-byte body guard (413)
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'.repeat(4097)));
        controller.close();
      },
    });
    const oversizedRes = await POST(
      new NextRequest(
        `https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(liveToken)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.17',
          },
          body: oversizedStream,
          duplex: 'half',
        } as ConstructorParameters<typeof NextRequest>[1] & { duplex: 'half' }
      )
    );
    assert.equal(oversizedRes.status, 413);
    assert.equal((await oversizedRes.json()).code, 'PAYLOAD_TOO_LARGE');

    // 4.7 Upstream failure returns 502 PERSIST_FAILED (never falsely 200)
    const origConsoleError = console.error;
    console.error = () => {};
    try {
      resendPostStatus = 500;
      const upstreamFailRes = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.18',
          },
          body: JSON.stringify({ token: liveToken }),
        })
      );
      assert.equal(upstreamFailRes.status, 502);
      assert.equal((await upstreamFailRes.json()).code, 'PERSIST_FAILED');

      resendPostStatus = 200;
      webhookStatus = 502;
      const webhookFailRes = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.185',
          },
          body: JSON.stringify({ token: liveToken }),
        })
      );
      assert.equal(webhookFailRes.status, 502);
      assert.equal((await webhookFailRes.json()).code, 'PERSIST_FAILED');
      webhookStatus = 200;

      throwOnFetch = true;
      const timeoutRes = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.19',
          },
          body: JSON.stringify({ token: liveToken }),
        })
      );
      assert.equal(timeoutRes.status, 502);
      throwOnFetch = false;
    } finally {
      console.error = origConsoleError;
    }

    // Unsafe webhook env var fails closed with 503
    process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL = 'http://127.0.0.1:8080/hook';
    fetchCalls = [];
    const unsafeHookRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'https://rate.vn',
          host: 'rate.vn',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.20',
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(unsafeHookRes.status, 503);
    assert.equal(fetchCalls.length, 0);

    // DNS rebinding to private/IMDS IP fails closed with 503 and 0 fetch calls;
    // transient DNS ENOTFOUND fails closed with 502 and 0 fetch calls.
    const origConsoleErrDns = console.error;
    console.error = () => {};
    try {
      process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL =
        'https://rebind.example.com/rate-unsub';
      mockDnsAddresses = [{ address: '169.254.169.254', family: 4 }];
      fetchCalls = [];
      const rebindRes = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.205',
          },
          body: JSON.stringify({ token: liveToken }),
        })
      );
      assert.equal(rebindRes.status, 503);
      assert.equal(fetchCalls.length, 0);

      throwOnDns = true;
      fetchCalls = [];
      const dnsFailRes = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.206',
          },
          body: JSON.stringify({ token: liveToken }),
        })
      );
      assert.equal(dnsFailRes.status, 502);
      assert.equal(fetchCalls.length, 0);
    } finally {
      console.error = origConsoleErrDns;
      throwOnDns = false;
      mockDnsAddresses = [{ address: '93.184.216.34', family: 4 }];
      delete process.env.RATE_UNSUBSCRIBE_WEBHOOK_URL;
    }

    // 4.8 Rate limiter: 20 requests/min per IP, 21st returns 429 with Retry-After: 60
    unsubscribePostRateLimiter.pruneExpired(Date.now() + 120_000);
    const rateTestIp = '198.51.100.200';
    for (let i = 0; i < 20; i++) {
      const r = await POST(
        new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
          method: 'POST',
          headers: {
            origin: 'https://rate.vn',
            host: 'rate.vn',
            'content-type': 'application/json',
            'x-forwarded-for': rateTestIp,
          },
          body: JSON.stringify({ token: 'bad-token' }),
        })
      );
      assert.equal(r.status, 400, `attempt ${i + 1} should reach validator`);
    }
    const limitedRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'https://rate.vn',
          host: 'rate.vn',
          'content-type': 'application/json',
          'x-forwarded-for': rateTestIp,
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(limitedRes.status, 429);
    assert.equal(limitedRes.headers.get('retry-after'), '60');
    assert.equal(limitedRes.headers.get('cache-control'), 'no-store');
    assert.equal((await limitedRes.json()).code, 'RATE_LIMIT_EXCEEDED');

    const neighborIpRes = await POST(
      new NextRequest('https://rate.vn/api/v1/rate/watchlist/unsubscribe', {
        method: 'POST',
        headers: {
          origin: 'https://rate.vn',
          host: 'rate.vn',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.201',
        },
        body: JSON.stringify({ token: liveToken }),
      })
    );
    assert.equal(neighborIpRes.status, 200);
  } finally {
    globalThis.fetch = origFetch;
    dns.promises.lookup = origDnsLookup;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  // =========================================================================
  // 5. Watchlist ?target= validation, ?unsubscribe= SSR across vi/en/cs & OpenAPI
  // =========================================================================
  assert.equal(parseWatchlistTargetQueryParam('1000'), 1_000);
  assert.equal(parseWatchlistTargetQueryParam(' 24500000 '), 24_500_000);
  assert.equal(
    parseWatchlistTargetQueryParam(String(MAX_VALID_VND_PRICE)),
    MAX_VALID_VND_PRICE
  );
  for (const invalidTarget of [
    null,
    undefined,
    '',
    '0',
    '999',
    '-20000',
    '01000',
    '24500000.5',
    '1e6',
    '0x1000',
    '24500000vnd',
    'NaN',
    String(MAX_VALID_VND_PRICE + 1),
  ]) {
    assert.equal(
      parseWatchlistTargetQueryParam(invalidTarget),
      null,
      `target=${String(invalidTarget)} must be ignored`
    );
  }
  assert.equal(resolveBoundedWatchlistTargetInput(500, 20_000_000), 1_000);
  assert.equal(resolveBoundedWatchlistTargetInput(5_000, 20_000_000), 5_000);
  assert.equal(resolveBoundedWatchlistTargetInput(0, 20_000_000), 19_000_000);
  assert.equal(typeof addProductToLocalWatchlist, 'function');

  assert.equal(parseWatchlistUnsubscribeQueryParam(null), null);
  assert.deepEqual(parseWatchlistUnsubscribeQueryParam('bad-token'), {
    token: '',
    status: 'invalid',
  });
  assert.deepEqual(parseWatchlistUnsubscribeQueryParam(signedVectorToken), {
    token: signedVectorToken,
    status: 'ready',
  });
  assert.equal(
    resolveWatchlistUnsubscribeResponseStatus(200, {
      ok: true,
      unsubscribed: true,
    }),
    'confirmed'
  );
  assert.equal(
    resolveWatchlistUnsubscribeResponseStatus(503, {
      ok: false,
      code: 'UNSUBSCRIBE_BACKEND_UNCONFIGURED',
    }),
    'unconfigured'
  );
  assert.equal(
    resolveWatchlistUnsubscribeResponseStatus(400, {
      ok: false,
      code: 'TOKEN_EXPIRED',
    }),
    'invalid'
  );
  assert.equal(
    resolveWatchlistUnsubscribeResponseStatus(502, {
      ok: false,
      code: 'PERSIST_FAILED',
    }),
    'error'
  );

  const IntlProvider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const rawLocaleJson = readFileSync(
      new URL(`../../../../../../locales/${locale}.json`, import.meta.url),
      'utf8'
    );
    assert.equal(
      /[\u2013\u2014]/.test(rawLocaleJson),
      false,
      `locales/${locale}.json must contain zero en/em-dashes`
    );
    const catalog = JSON.parse(rawLocaleJson) as {
      watchlist: Record<string, string>;
    };
    const scoped = pickClientMessages(catalog, 'watchlist');

    for (const status of [
      'ready',
      'submitting',
      'confirmed',
      'invalid',
      'unconfigured',
      'error',
    ] as const) {
      const html = renderToStaticMarkup(
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: scoped,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(WatchlistWorkspace, {
            catalogProducts: [],
            locale,
            initialUnsubscribeState: {
              token: status === 'invalid' ? '' : signedVectorToken,
              status,
            },
          })
        )
      );
      assert.ok(
        html.includes('data-testid="watchlist-unsubscribe-banner"'),
        `${locale}/${status}: renders unsubscribe banner`
      );
      assert.ok(
        html.includes('btn-outline-dark'),
        `${locale}/${status}: dismiss button uses dark-theme-safe btn-outline-dark`
      );
      assert.equal(
        html.includes('aria-live="polite"'),
        false,
        `${locale}/${status}: status/alert role relies on native ARIA live semantics`
      );
      assert.ok(html.includes(catalog.watchlist.unsubTitle!));
      if (status === 'ready') {
        assert.ok(
          html.includes('data-testid="watchlist-unsubscribe-confirm-btn"')
        );
        assert.ok(html.includes(catalog.watchlist.unsubConfirmBtn!));
      } else if (status === 'submitting') {
        assert.ok(html.includes('disabled=""'));
        assert.ok(html.includes(catalog.watchlist.unsubSubmittingBtn!));
      } else if (status === 'confirmed') {
        assert.ok(html.includes('role="status"'));
        assert.ok(html.includes(catalog.watchlist.unsubSuccess!));
      } else if (status === 'invalid') {
        assert.ok(html.includes('role="alert"'));
        assert.ok(html.includes(catalog.watchlist.unsubInvalid!));
      } else if (status === 'unconfigured') {
        assert.ok(html.includes('role="alert"'));
        assert.ok(html.includes(catalog.watchlist.unsubUnconfigured!));
      } else if (status === 'error') {
        assert.ok(html.includes('role="alert"'));
        assert.ok(html.includes(catalog.watchlist.unsubError!));
        assert.ok(
          html.includes('data-testid="watchlist-unsubscribe-confirm-btn"')
        );
      }
    }
  }

  // OpenAPI 3.1 contract check
  const openApi = buildRateOpenApiSpec('https://rate.vn');
  const unsubPath = openApi.paths['/api/v1/rate/watchlist/unsubscribe'];
  assert.ok(unsubPath?.get, 'OpenAPI must document GET /watchlist/unsubscribe');
  assert.ok(
    unsubPath?.post,
    'OpenAPI must document POST /watchlist/unsubscribe'
  );
  assert.ok(unsubPath.get.responses['303']);
  assert.ok(unsubPath.post.responses['200']);
  assert.ok(unsubPath.post.responses['503']);
  assert.ok(
    unsubPath.post.requestBody?.content['application/x-www-form-urlencoded']
  );

  // Zero SUPABASE_SECRET_KEY / @repo/shared-data/server in new files
  for (const relPath of [
    '../../../../../lib/alert-unsubscribe-token.ts',
    '../../../../../lib/alert-unsubscribe-webhook.ts',
    '../watchlist/unsubscribe/route.ts',
  ]) {
    const src = readFileSync(new URL(relPath, import.meta.url), 'utf8');
    assert.equal(src.includes('SUPABASE_' + 'SECRET_KEY'), false);
    assert.equal(src.includes('@repo/shared-data/server'), false);
  }

  // Telemetry URL scrubber redacts ?unsubscribe= and ?token= (case-insensitive) before Sentry capture
  const { scrubSensitiveTelemetryUrl } =
    await import('../../../../../../instrumentation-client');
  assert.equal(
    scrubSensitiveTelemetryUrl(
      `https://rate.vn/watchlist?unsubscribe=${encodeURIComponent(signedVectorToken)}&keep=1`
    ),
    'https://rate.vn/watchlist?unsubscribe=%5BREDACTED%5D&keep=1'
  );
  assert.equal(
    scrubSensitiveTelemetryUrl(
      `https://rate.vn/watchlist?UNSUBSCRIBE=${encodeURIComponent(signedVectorToken)}&TOKEN=abc123`
    ),
    'https://rate.vn/watchlist?UNSUBSCRIBE=%5BREDACTED%5D&TOKEN=%5BREDACTED%5D'
  );
  assert.equal(
    scrubSensitiveTelemetryUrl(
      `/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(signedVectorToken)}`
    ),
    '/api/v1/rate/watchlist/unsubscribe?token=%5BREDACTED%5D'
  );
  assert.equal(
    scrubSensitiveTelemetryUrl('https://rate.vn/smartphones'),
    'https://rate.vn/smartphones'
  );

  console.warn('All watchlist unsubscribe & target prefill tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
