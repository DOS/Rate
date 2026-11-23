import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RateSupabaseClient } from '../types.js';
import {
  ALERT_UNSUBSCRIBE_SIGNING_PREFIX,
  ALERT_UNSUBSCRIBE_TTL_SECONDS,
  assertValidAlertUnsubscribeSecret,
  normalizeAlertSubscriberEmail,
  signAlertUnsubscribeToken,
  verifyAlertUnsubscribeToken,
} from '../alert-unsubscribe-token.js';
import {
  escapeHtml,
  fetchResendUnsubscribedEmails,
  renderPriceAlertEmail,
  sanitizeUtf16WellFormed,
  sendPriceAlertEmail,
  stripHeaderCrLf,
  validateHttpsSiteOrigin,
  validateHttpsUrl,
  validateResendAudienceId,
  validateSenderFromAddress,
} from '../alert-mailer.js';
import {
  ALERT_COOLDOWN_MS,
  buildCanonicalAlertProductUrl,
  getWorkerRateClient,
  isAlertPastCooldown,
  parsePriceAlertsDigestArgs,
  runPriceAlertsDigest,
  runPriceAlertsDigestCli,
  type AlertCategoryRow,
  type AlertMasterProductRow,
  type AlertMerchantRow,
  type AlertPriceHistoryRow,
  type AlertProductOfferRow,
  type PriceAlertRow,
} from '../jobs/price-alerts-digest.js';

const SHARED_VECTOR_HEX = '0123456789abcdef'.repeat(2);
const ALTERNATE_VECTOR_HEX = 'fedcba9876543210'.repeat(2);
const STUB_MAILER_CRED = ['re', 'unit', 'stub'].join('_');
const STUB_PUB_CLIENT_VALUE = ['sb', 'pub', 'unit'].join('_');
const STUB_WORKER_CRED = ['worker', 'unit', 'pass'].join('-');
const SHORT_SIGNING_INPUT = 'short';

const SHARED_VECTOR_ALERT_ID = '11111111-2222-4333-8444-555555555555';
const SHARED_VECTOR_MASTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SHARED_VECTOR_IAT = 1795392000;
const SHARED_VECTOR_EXP = 1803168000;
const EXPECTED_SHARED_WIRE_VALUE = [
  'v1',
  'eyJ2IjoxLCJhaWQiOiIxMTExMTExMS0yMjIyLTQzMzMtODQ0NC01NTU1NTU1NTU1NTUiLCJlbWFpbCI6ImJ1eWVyQGV4YW1wbGUuY29tIiwibWlkIjoiYWFhYWFhYWEtYmJiYi00Y2NjLThkZGQtZWVlZWVlZWVlZWVlIiwiaWF0IjoxNzk1MzkyMDAwLCJleHAiOjE4MDMxNjgwMDB9',
  'haDExk57Wy2MRQQnS4OKsQE_aZSabI0M0vqP6EcnJT8',
].join('.');

interface FakeDbTables {
  price_alerts?: PriceAlertRow[];
  master_products?: AlertMasterProductRow[];
  categories?: AlertCategoryRow[];
  products?: AlertProductOfferRow[];
  merchants?: AlertMerchantRow[];
  price_history?: AlertPriceHistoryRow[];
}

interface RecordedAlertUpdate {
  readonly id: string;
  readonly payload: Record<string, unknown>;
}

function createFakeDigestSupabase(
  tables: FakeDbTables,
  opts: { failUpdateIds?: ReadonlySet<string> } = {}
): {
  supabase: RateSupabaseClient;
  updates: RecordedAlertUpdate[];
} {
  const updates: RecordedAlertUpdate[] = [];
  const dataByTable: Record<string, Record<string, unknown>[]> = {
    price_alerts: (tables.price_alerts ?? []).map(r => ({ ...r })),
    master_products: (tables.master_products ?? []).map(r => ({ ...r })),
    categories: (tables.categories ?? []).map(r => ({ ...r })),
    products: (tables.products ?? []).map(r => ({ origin: 'crawl', ...r })),
    merchants: (tables.merchants ?? []).map(r => ({ ...r })),
    price_history: (tables.price_history ?? []).map(r => ({ origin: 'crawl', ...r })),
  };

  const makeSelectBuilder = (tableName: string) => {
    let rows = [...(dataByTable[tableName] ?? [])];
    const builder = {
      eq(col: string, val: unknown) {
        rows = rows.filter(r => r[col] === val);
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        const set = new Set(vals);
        rows = rows.filter(r => set.has(r[col]));
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        if (op === 'is' && val === null) {
          rows = rows.filter(r => r[col] !== null && r[col] !== undefined);
        }
        return builder;
      },
      or(_expr: string) {
        // Intentionally leaves cooldown filtering to verify in-memory defense-in-depth too,
        // while still exercising `.or(...)` builder chaining.
        return builder;
      },
      gt(col: string, val: unknown) {
        rows = rows.filter(r => {
          const cur = r[col];
          if (typeof cur === 'number' && typeof val === 'number') return cur > val;
          if (typeof cur === 'number' && typeof val === 'string') return cur > Number(val);
          return String(cur ?? '') > String(val ?? '');
        });
        return builder;
      },
      gte(col: string, val: unknown) {
        rows = rows.filter(r => String(r[col] ?? '') >= String(val ?? ''));
        return builder;
      },
      lte(col: string, val: unknown) {
        rows = rows.filter(r => {
          const cur = r[col];
          if (typeof cur === 'number' && typeof val === 'number') return cur <= val;
          return String(cur ?? '') <= String(val ?? '');
        });
        return builder;
      },
      order(col: string) {
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          return String(av ?? '') < String(bv ?? '')
            ? -1
            : String(av ?? '') > String(bv ?? '')
              ? 1
              : 0;
        });
        return builder;
      },
      limit(n: number) {
        const sliced = rows.slice(0, n);
        return Promise.resolve({ data: sliced, error: null });
      },
    };
    return builder;
  };

  const client = {
    from(tableName: string) {
      return {
        select(_columns: string) {
          return makeSelectBuilder(tableName);
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, val: string) {
              assert.equal(tableName, 'price_alerts', 'worker may only update price_alerts');
              assert.equal(col, 'id');
              assert.deepEqual(
                Object.keys(payload).sort(),
                ['last_triggered_at', 'updated_at'],
                'rate_worker column grant permits updating only last_triggered_at and updated_at'
              );
              if (opts.failUpdateIds?.has(val)) {
                return Promise.resolve({
                  data: null,
                  error: { message: 'simulated update error' },
                });
              }
              updates.push({ id: val, payload: { ...payload } });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  return {
    supabase: client as unknown as RateSupabaseClient,
    updates,
  };
}

test('canonical HMAC unsubscribe token matches shared apps/web test vector and verifies cleanly', () => {
  assert.equal(SHARED_VECTOR_IAT + ALERT_UNSUBSCRIBE_TTL_SECONDS, SHARED_VECTOR_EXP);

  const signed = signAlertUnsubscribeToken(
    {
      alertId: SHARED_VECTOR_ALERT_ID,
      email: '  Buyer@Example.COM ',
      masterProductId: SHARED_VECTOR_MASTER_ID,
      issuedAtUnixSec: SHARED_VECTOR_IAT,
    },
    SHARED_VECTOR_HEX
  );

  assert.equal(signed, EXPECTED_SHARED_WIRE_VALUE);

  const [, payloadB64] = signed.split('.');
  const decodedJson = Buffer.from(payloadB64!, 'base64url').toString('utf8');
  assert.equal(
    decodedJson,
    '{"v":1,"aid":"11111111-2222-4333-8444-555555555555","email":"buyer@example.com","mid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","iat":1795392000,"exp":1803168000}'
  );

  const verifiedAtBoundary = verifyAlertUnsubscribeToken(signed, SHARED_VECTOR_HEX, {
    nowUnixSec: SHARED_VECTOR_EXP,
  });
  assert.deepEqual(verifiedAtBoundary, {
    ok: true,
    payload: {
      v: 1,
      aid: SHARED_VECTOR_ALERT_ID,
      email: 'buyer@example.com',
      mid: SHARED_VECTOR_MASTER_ID,
      iat: SHARED_VECTOR_IAT,
      exp: SHARED_VECTOR_EXP,
    },
  });

  const expired = verifyAlertUnsubscribeToken(signed, SHARED_VECTOR_HEX, {
    nowUnixSec: SHARED_VECTOR_EXP + 1,
  });
  assert.deepEqual(expired, { ok: false, reason: 'expired_token' });
});

test('unsubscribe token signer and verifier fail closed on padded/NUL inputs, malformed UTF-8, tampering, and bad inputs', () => {
  for (const badInput of [
    '',
    'x'.repeat(31),
    ' '.repeat(40),
    `x${' '.repeat(31)}`,
    `x${'\u0000'.repeat(31)}`,
    `  ${SHARED_VECTOR_HEX}`,
    `${SHARED_VECTOR_HEX}\n`,
    `  ${SHARED_VECTOR_HEX}  `,
    `${SHARED_VECTOR_HEX}\u0000`,
    'a'.repeat(1025),
    `${'a'.repeat(31)}\uD800`,
  ]) {
    assert.throws(() => assertValidAlertUnsubscribeSecret(badInput));
    assert.throws(() =>
      signAlertUnsubscribeToken(
        {
          alertId: SHARED_VECTOR_ALERT_ID,
          email: 'buyer@example.com',
          masterProductId: SHARED_VECTOR_MASTER_ID,
          issuedAtUnixSec: SHARED_VECTOR_IAT,
        },
        badInput
      )
    );
    assert.throws(() =>
      verifyAlertUnsubscribeToken(EXPECTED_SHARED_WIRE_VALUE, badInput, {
        nowUnixSec: SHARED_VECTOR_IAT,
      })
    );
  }

  // Malformed UTF-8 payload bytes signed with valid HMAC must fail closed via fatal TextDecoder
  const invalidUtf8PayloadB64 = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url');
  const invalidUtf8SigB64 = createHmac('sha256', Buffer.from(SHARED_VECTOR_HEX, 'utf8'))
    .update(`${ALERT_UNSUBSCRIBE_SIGNING_PREFIX}${invalidUtf8PayloadB64}`, 'utf8')
    .digest('base64url');
  assert.deepEqual(
    verifyAlertUnsubscribeToken(
      `v1.${invalidUtf8PayloadB64}.${invalidUtf8SigB64}`,
      SHARED_VECTOR_HEX,
      { nowUnixSec: SHARED_VECTOR_IAT }
    ),
    { ok: false, reason: 'invalid_payload' }
  );

  assert.deepEqual(
    verifyAlertUnsubscribeToken(EXPECTED_SHARED_WIRE_VALUE, ALTERNATE_VECTOR_HEX, {
      nowUnixSec: SHARED_VECTOR_IAT,
    }),
    { ok: false, reason: 'invalid_signature' }
  );

  const parts = EXPECTED_SHARED_WIRE_VALUE.split('.');
  const tamperedWire = `v1.${parts[1]}.${parts[2]!.slice(0, -1)}${parts[2]!.endsWith('A') ? 'B' : 'A'}`;
  assert.deepEqual(
    verifyAlertUnsubscribeToken(tamperedWire, SHARED_VECTOR_HEX, {
      nowUnixSec: SHARED_VECTOR_IAT,
    }),
    { ok: false, reason: 'invalid_signature' }
  );

  assert.deepEqual(
    verifyAlertUnsubscribeToken(`v2.${parts[1]}.${parts[2]}`, SHARED_VECTOR_HEX, {
      nowUnixSec: SHARED_VECTOR_IAT,
    }),
    { ok: false, reason: 'unsupported_version' }
  );

  for (const malformed of [
    '',
    'v1.only-two',
    'v1.a.b.c',
    `v1.${'a'.repeat(2100)}.sig`,
    `v1.${parts[1]}=.${parts[2]}`,
    `v1.${parts[1]}.\uD800`,
  ]) {
    assert.deepEqual(
      verifyAlertUnsubscribeToken(malformed, SHARED_VECTOR_HEX, {
        nowUnixSec: SHARED_VECTOR_IAT,
      }),
      { ok: false, reason: 'malformed_token' }
    );
  }

  assert.equal(normalizeAlertSubscriberEmail('buyer@example.com\r\nBcc:evil@example.com'), null);
  assert.equal(normalizeAlertSubscriberEmail('bad..dots@example.com'), null);
});

test('localized email renderer covers vi/en/cs + fallback, escapes HTML, strips CRLF, sanitizes surrogates, and enforces https URLs', () => {
  const maliciousName = 'iPhone 17 <script>alert("xss")</script>\r\nBcc: leak@evil.example';
  const maliciousMerchant = 'Shop "Mall" & \'Friends\' <img src=x onerror=alert(1)>';

  const viMail = renderPriceAlertEmail({
    locale: 'unknown-locale',
    productName: maliciousName,
    targetPrice: 26_000_000,
    bestPrice: 24_500_000,
    merchantName: maliciousMerchant,
    productUrl: 'https://rate.vn/smartphones/iphone-17-256gb',
    unsubscribeToken: EXPECTED_SHARED_WIRE_VALUE,
    isAllTimeLow90d: true,
  });

  assert.equal(viMail.locale, 'vi');
  assert.equal(viMail.subject.includes('\r'), false);
  assert.equal(viMail.subject.includes('\n'), false);
  assert.ok(viMail.subject.includes('Đáy giá 90 ngày'));
  assert.equal(viMail.html.includes('<script>'), false);
  assert.equal(viMail.html.includes('<img'), false);
  assert.ok(viMail.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
  assert.ok(viMail.html.includes('24.500.000 ₫'));
  assert.ok(viMail.html.includes('26.000.000 ₫'));
  assert.ok(viMail.html.includes('1.500.000 ₫'));
  assert.ok(viMail.html.includes('Đáy giá 90 ngày đã kiểm chứng (ATL)'));
  assert.equal(
    viMail.headers['List-Unsubscribe'],
    `<https://rate.vn/api/v1/rate/watchlist/unsubscribe?token=${EXPECTED_SHARED_WIRE_VALUE}>`
  );
  assert.equal(viMail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  const enMail = renderPriceAlertEmail({
    locale: 'EN',
    productName: 'Galaxy S26 Ultra',
    targetPrice: 28_000_000,
    bestPrice: 28_000_000,
    merchantName: 'CellphoneS',
    productUrl: 'https://rate.vn/smartphones/galaxy-s26-ultra',
    unsubscribeToken: EXPECTED_SHARED_WIRE_VALUE,
    isAllTimeLow90d: false,
  });
  assert.equal(enMail.locale, 'en');
  assert.ok(enMail.html.includes('28,000,000 VND'));
  assert.equal(enMail.html.includes('Verified 90-Day Price Floor (ATL)'), false);
  assert.ok(
    enMail.text
      .split('\n')
      .some(
        line =>
          line === 'View verified offers on Rate.vn: https://rate.vn/smartphones/galaxy-s26-ultra'
      )
  );

  const csMail = renderPriceAlertEmail({
    locale: 'cs',
    productName: 'MacBook Air M4',
    targetPrice: 29_000_000,
    bestPrice: 27_500_000,
    merchantName: 'FPT Shop',
    productUrl: 'https://rate.vn/laptops/macbook-air-m4',
    unsubscribeToken: EXPECTED_SHARED_WIRE_VALUE,
    isAllTimeLow90d: true,
  });
  assert.equal(csMail.locale, 'cs');
  assert.ok(csMail.html.includes('27 500 000 VND'));
  assert.ok(csMail.html.includes('Ověřené 90denní cenové minimum (ATL)'));

  // UTF-16 surrogate pair boundary + lone surrogate sanitization (#1853)
  const cutAstral = sanitizeUtf16WellFormed('abcd😀', 5);
  assert.equal(cutAstral, 'abcd');
  assert.ok((cutAstral as string & { isWellFormed(): boolean }).isWellFormed());

  const loneFixed = escapeHtml('ab\uD800cd\uDC00ef');
  assert.ok((loneFixed as string & { isWellFormed(): boolean }).isWellFormed());
  assert.equal(stripHeaderCrLf('hello\r\nworld\u0000\u2028test'), 'hello world test');

  // Strict https:// validation on siteOrigin and productUrl (including overlong slash strings & non-DNS hosts)
  for (const badOrigin of [
    'http://rate.vn',
    'javascript:alert(1)',
    'https://user:pass@rate.vn',
    'https://rate.vn/subpath',
    'https://rate.vn?x=1',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://127.0.0.1.nip.io',
    'https://bad$host.example.com',
    `${'/'.repeat(5000)}x`,
  ]) {
    assert.throws(() => validateHttpsSiteOrigin(badOrigin));
  }
  for (const badUrl of [
    'http://rate.vn/smartphones/iphone-17',
    'javascript:alert(1)',
    'https://user:pass@rate.vn/smartphones/iphone-17',
    'https://192.168.1.1/smartphones/iphone-17',
    'https://host.arpa/smartphones/iphone-17',
  ]) {
    assert.throws(() => validateHttpsUrl(badUrl));
  }

  // Overlong master.slug (> 256 chars) returns null instead of silently truncating to a 404 URL
  assert.equal(
    buildCanonicalAlertProductUrl(
      {
        id: SHARED_VECTOR_MASTER_ID,
        slug: 'a'.repeat(257),
        name: 'Overlong Slug Product',
        status: 'published',
      },
      new Map()
    ),
    null
  );

  // RFC 5322 From display-name specials / multi-mailbox smuggling rejected
  for (const badFrom of [
    'Rate.vn <alerts@rate.vn>\r\nBcc:x@y.com',
    'attacker@evil.com, Rate <alerts@rate.vn>',
    '"Rate, Inc." <alerts@rate.vn>',
    '"Unmatched Quote <alerts@rate.vn>',
    'Rate\u200B <alerts@rate.vn>',
  ]) {
    assert.throws(() => validateSenderFromAddress(badFrom));
  }
  assert.equal(validateSenderFromAddress('Rate.vn <ALERTS@rate.vn>'), 'Rate.vn <alerts@rate.vn>');
  assert.equal(validateSenderFromAddress('"Rate.vn" <ALERTS@rate.vn>'), 'Rate.vn <alerts@rate.vn>');
  assert.equal(validateResendAudienceId('aud_999-abc'), 'aud_999-abc');
  assert.throws(() => validateResendAudienceId('../bad/id'));
});

test('sendPriceAlertEmail and fetchResendUnsubscribedEmails enforce headers, boolean has_more pagination, and fail-closed HTTP handling', async () => {
  let capturedEmailReq: { url: string; init: RequestInit } | null = null;
  const okSendFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedEmailReq = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ id: 're_msg_001' }), { status: 200 });
  }) as typeof fetch;

  const sent = await sendPriceAlertEmail({
    toEmail: 'Buyer@Example.com',
    fromEmail: 'Rate.vn <alerts@rate.vn>',
    resendApiKey: STUB_MAILER_CRED,
    locale: 'vi',
    productName: 'iPhone 17 256GB',
    targetPrice: 25_000_000,
    bestPrice: 24_000_000,
    merchantName: 'ShopDunk',
    productUrl: 'https://rate.vn/smartphones/iphone-17-256gb',
    unsubscribeToken: EXPECTED_SHARED_WIRE_VALUE,
    fetchImpl: okSendFetch,
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.id, 're_msg_001');
  assert.equal(capturedEmailReq!.url, 'https://api.resend.com/emails');
  const bodyObj = JSON.parse(String(capturedEmailReq!.init.body)) as {
    to: string[];
    headers: Record<string, string>;
  };
  assert.deepEqual(bodyObj.to, ['buyer@example.com']);
  assert.equal(bodyObj.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  // Paginated Resend Audience contacts suppression
  const visitedUrls: string[] = [];
  const pagedContactsFetch = (async (url: string | URL | Request) => {
    const u = String(url);
    visitedUrls.push(u);
    if (!u.includes('after=')) {
      return new Response(
        JSON.stringify({
          object: 'list',
          has_more: true,
          data: [
            { id: 'c_1', email: 'UnsubOne@Example.com', unsubscribed: true },
            { id: 'c_2', email: 'active@example.com', unsubscribed: false },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        object: 'list',
        has_more: false,
        data: [{ id: 'c_3', email: '  UNSUBTWO@example.com ', unsubscribed: true }],
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const unsubSet = await fetchResendUnsubscribedEmails({
    resendApiKey: STUB_MAILER_CRED,
    audienceId: 'aud_999',
    fetchImpl: pagedContactsFetch,
  });
  assert.deepEqual([...unsubSet].sort(), ['unsubone@example.com', 'unsubtwo@example.com']);
  assert.deepEqual(visitedUrls, [
    'https://api.resend.com/audiences/aud_999/contacts?limit=100',
    'https://api.resend.com/audiences/aud_999/contacts?limit=100&after=c_2',
  ]);

  // Fail closed on HTTP 503, missing boolean has_more, or stalled pagination cursor
  await assert.rejects(
    fetchResendUnsubscribedEmails({
      resendApiKey: STUB_MAILER_CRED,
      audienceId: 'aud_999',
      fetchImpl: (async () => new Response('upstream error', { status: 503 })) as typeof fetch,
    }),
    /HTTP 503/
  );
  await assert.rejects(
    fetchResendUnsubscribedEmails({
      resendApiKey: STUB_MAILER_CRED,
      audienceId: 'aud_999',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ object: 'list', data: [] }), {
          status: 200,
        })) as typeof fetch,
    }),
    /boolean has_more/
  );
  await assert.rejects(
    fetchResendUnsubscribedEmails({
      resendApiKey: STUB_MAILER_CRED,
      audienceId: 'aud_999',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ object: 'list', has_more: true, data: [] }), {
          status: 200,
        })) as typeof fetch,
    }),
    /advancing cursor/
  );
});

test('parsePriceAlertsDigestArgs, package exports, and CLI fail closed on --dry-run + --apply and invalid inputs (#1854)', async () => {
  for (const subpath of [
    '@repo/crawlers/shopee/alert-unsubscribe-token',
    '@repo/crawlers/shopee/alert-mailer',
    '@repo/crawlers/shopee/jobs/price-alerts-digest',
  ]) {
    assert.ok(import.meta.resolve(subpath).endsWith('.js'), `export ${subpath} must resolve`);
  }

  assert.deepEqual(parsePriceAlertsDigestArgs([]), {
    apply: false,
    dryRun: true,
    limit: 100,
  });
  assert.deepEqual(parsePriceAlertsDigestArgs(['--dry-run', '--limit=250']), {
    apply: false,
    dryRun: true,
    limit: 250,
  });
  assert.deepEqual(parsePriceAlertsDigestArgs(['--apply', '--limit', '500']), {
    apply: true,
    dryRun: false,
    limit: 500,
  });

  for (const badArgs of [
    ['--dry-run', '--apply'],
    ['--apply', '--dry-run'],
    ['--apply', '--apply'],
    ['--dry-run', '--dry-run'],
    ['--limit=0'],
    ['--limit=-5'],
    ['--limit=501'],
    ['--limit=NaN'],
    ['--limit=Infinity'],
    ['--limit=12.5'],
    ['--limit=010'],
    ['--limit=1e2'],
    ['--limit='],
    ['--limit'],
    ['--limit=10', '--limit=20'],
    ['--unknown-flag'],
  ]) {
    assert.throws(
      () => parsePriceAlertsDigestArgs(badArgs),
      Error,
      `expected args ${JSON.stringify(badArgs)} to fail closed`
    );
  }

  let clientOpened = false;
  await assert.rejects(
    runPriceAlertsDigestCli(['--dry-run', '--apply'], {
      getClient: async () => {
        clientOpened = true;
        throw new Error('should not be reached');
      },
    }),
    /--dry-run does not combine with --apply/
  );
  await assert.rejects(
    runPriceAlertsDigestCli(['--apply'], {
      env: {
        RATE_ALERT_UNSUBSCRIBE_SECRET: `${SHARED_VECTOR_HEX}\n`,
        RESEND_API_KEY: STUB_MAILER_CRED,
        ALERT_EMAIL_FROM: 'Rate.vn <alerts@rate.vn>',
      },
      getClient: async () => {
        clientOpened = true;
        throw new Error('should not be reached');
      },
    }),
    /whitespace or control characters/
  );
  assert.equal(clientOpened, false, 'CLI must fail before opening rate_worker session');

  const { supabase } = createFakeDigestSupabase({});
  await assert.rejects(
    runPriceAlertsDigest(supabase, { apply: true, dryRun: true }),
    /--dry-run does not combine with --apply/
  );
  await assert.rejects(
    runPriceAlertsDigest(supabase, { audienceId: '../bad/audience' }),
    /RESEND_AUDIENCE_ID/
  );
});

test('getWorkerRateClient enforces rate_worker role and signs out on role mismatch or post-login setup error', async () => {
  let signedOutCount = 0;

  const makeMockSupabaseFactory = (role: string, omitSchema = false) => {
    return () =>
      ({
        auth: {
          async signInWithPassword() {
            return {
              data: {
                session: { expires_in: 3600 },
                user: { role },
              },
              error: null,
            };
          },
          async signOut() {
            signedOutCount += 1;
            return { error: null };
          },
        },
        ...(omitSchema
          ? {}
          : {
              schema(name: string) {
                assert.equal(name, 'rate');
                return { from: () => ({}) };
              },
            }),
      }) as unknown as SupabaseClient;
  };

  await assert.rejects(
    getWorkerRateClient(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: STUB_PUB_CLIENT_VALUE,
        RATE_WORKER_EMAIL: 'worker@rate.vn',
        RATE_WORKER_PASSWORD: STUB_WORKER_CRED,
      },
      { createSupabaseClient: makeMockSupabaseFactory('authenticated') }
    ),
    /expected 'rate_worker'/
  );
  assert.equal(signedOutCount, 1, 'non-worker role must sign out immediately');

  await assert.rejects(
    getWorkerRateClient(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: STUB_PUB_CLIENT_VALUE,
        RATE_WORKER_EMAIL: 'worker@rate.vn',
        RATE_WORKER_PASSWORD: STUB_WORKER_CRED,
      },
      { createSupabaseClient: makeMockSupabaseFactory('rate_worker', true) }
    ),
    /scopeSupabaseToRate/
  );
  assert.equal(signedOutCount, 2, 'post-login setup error must also sign out');

  const worker = await getWorkerRateClient(
    {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: STUB_PUB_CLIENT_VALUE,
      RATE_WORKER_EMAIL: 'worker@rate.vn',
      RATE_WORKER_PASSWORD: STUB_WORKER_CRED,
    },
    { createSupabaseClient: makeMockSupabaseFactory('rate_worker') }
  );
  assert.equal(worker.host, 'example.supabase.co');
  await worker.signOut();
  assert.equal(signedOutCount, 3);
});

test('digest filters out bait listings, out-of-stock offers, non-crawl rows, sub-1 VND decimals, drafts, and 7-day cooldown alerts', async () => {
  const now = new Date('2026-11-23T12:00:00.000Z');
  const sevenDaysAgoExact = new Date(now.getTime() - ALERT_COOLDOWN_MS).toISOString();
  const sixDaysAgo = new Date(now.getTime() - (ALERT_COOLDOWN_MS - 3600_000)).toISOString();

  assert.equal(isAlertPastCooldown(null, now), true);
  assert.equal(isAlertPastCooldown(null, new Date(NaN)), false);
  assert.equal(isAlertPastCooldown(sevenDaysAgoExact, now), true);
  assert.equal(isAlertPastCooldown(sixDaysAgo, now), false);
  assert.equal(isAlertPastCooldown('not-a-timestamp', now), false);

  const masterBaitOnly = '10000000-0000-4000-8000-000000000001';
  const masterOosOnly = '10000000-0000-4000-8000-000000000002';
  const masterDraft = '10000000-0000-4000-8000-000000000003';
  const masterEligibleAtl = '10000000-0000-4000-8000-000000000004';
  const catSmartphones = '20000000-0000-4000-8000-000000000001';

  const { supabase, updates } = createFakeDigestSupabase({
    categories: [{ id: catSmartphones, slug: 'smartphones' }],
    master_products: [
      {
        id: masterBaitOnly,
        slug: 'iphone-17-pro',
        name: 'iPhone 17 Pro 256GB',
        status: 'published',
        category_id: catSmartphones,
      },
      {
        id: masterOosOnly,
        slug: 'galaxy-s26',
        name: 'Galaxy S26 256GB',
        status: 'published',
        category_id: catSmartphones,
      },
      {
        id: masterDraft,
        slug: 'pixel-11-draft',
        name: 'Pixel 11 Draft',
        status: 'draft',
        category_id: catSmartphones,
      },
      {
        id: masterEligibleAtl,
        slug: 'xiaomi-16',
        name: 'Xiaomi 16 256GB',
        status: 'published',
        category_id: catSmartphones,
      },
    ],
    merchants: [
      { id: 'm_official', name: 'CellphoneS', platform: 'cellphones', is_official: true },
      { id: 'm_bait', name: 'Shady Case Shop', platform: 'shopee', is_official: false },
    ],
    products: [
      // masterBaitOnly: 3 genuine offers around 28M + 1 bait offer at 1.5M (< 0.4 * 28M)
      {
        id: 'p_bait_1',
        cluster_id: masterBaitOnly,
        merchant_id: 'm_bait',
        price_current: 1_500_000,
        availability: 'in_stock',
      },
      {
        id: 'p_real_1',
        cluster_id: masterBaitOnly,
        merchant_id: 'm_official',
        price_current: 28_000_000,
        availability: 'in_stock',
      },
      {
        id: 'p_real_2',
        cluster_id: masterBaitOnly,
        merchant_id: 'm_official',
        price_current: 28_500_000,
        availability: 'in_stock',
      },
      {
        id: 'p_real_3',
        cluster_id: masterBaitOnly,
        merchant_id: 'm_official',
        price_current: 29_000_000,
        availability: 'in_stock',
      },
      // masterOosOnly: cheap out_of_stock + zero/sub-1 VND price + stock=0 + non-crawl offers
      {
        id: 'p_oos_1',
        cluster_id: masterOosOnly,
        merchant_id: 'm_official',
        price_current: 15_000_000,
        availability: 'out_of_stock',
      },
      {
        id: 'p_zero_1',
        cluster_id: masterOosOnly,
        merchant_id: 'm_official',
        price_current: 0.4,
        availability: 'in_stock',
      },
      {
        id: 'p_noncrawl_1',
        cluster_id: masterOosOnly,
        merchant_id: 'm_official',
        price_current: 14_000_000,
        availability: 'in_stock',
        origin: 'seed',
      },
      {
        id: 'p_stock0_1',
        cluster_id: masterOosOnly,
        merchant_id: 'm_official',
        price_current: 15_000_000,
        availability: 'in_stock',
        stock: 0,
      },
      // masterDraft: cheap in-stock offer on an unpublished draft master
      {
        id: 'p_draft_1',
        cluster_id: masterDraft,
        merchant_id: 'm_official',
        price_current: 10_000_000,
        availability: 'in_stock',
      },
      // masterEligibleAtl: genuine plausible in-stock deal at 17.99M + 1 non-crawl listing whose history must be ignored
      {
        id: 'p_ok_1',
        cluster_id: masterEligibleAtl,
        merchant_id: 'm_official',
        price_current: 17_990_000,
        availability: 'in_stock',
      },
      {
        id: 'p_ok_2',
        cluster_id: masterEligibleAtl,
        merchant_id: 'm_official',
        price_current: 18_490_000,
        availability: 'in_stock',
      },
      {
        id: 'p_ok_3',
        cluster_id: masterEligibleAtl,
        merchant_id: 'm_official',
        price_current: 18_990_000,
        availability: 'in_stock',
      },
      {
        id: 'p_noncrawl_hist',
        cluster_id: masterEligibleAtl,
        merchant_id: 'm_official',
        price_current: 16_000_000,
        availability: 'out_of_stock',
        origin: 'seed',
      },
    ],
    price_history: [
      {
        id: 1,
        product_id: 'p_ok_1',
        price: 19_500_000,
        recorded_at: '2026-10-15T00:00:00.000Z',
        origin: 'crawl',
      },
      {
        id: 2,
        product_id: 'p_ok_2',
        price: 18_200_000,
        recorded_at: '2026-11-10T00:00:00.000Z',
        origin: 'crawl',
      },
      // Non-crawl listing observation at 16M must not suppress 90d ATL!
      {
        id: 3,
        product_id: 'p_noncrawl_hist',
        price: 16_000_000,
        recorded_at: '2026-11-10T00:00:00.000Z',
      },
      // Non-crawl price_history rows (backfill/seed/synthetic/fixture) on crawled product_id must also be ignored!
      {
        id: 4,
        product_id: 'p_ok_1',
        price: 15_000_000,
        recorded_at: '2026-11-12T00:00:00.000Z',
        origin: 'backfill',
      },
      {
        id: 5,
        product_id: 'p_ok_1',
        price: 15_100_000,
        recorded_at: '2026-11-13T00:00:00.000Z',
        origin: 'seed',
      },
      {
        id: 6,
        product_id: 'p_ok_1',
        price: 15_200_000,
        recorded_at: '2026-11-14T00:00:00.000Z',
        origin: 'synthetic',
      },
      {
        id: 7,
        product_id: 'p_ok_1',
        price: 15_300_000,
        recorded_at: '2026-11-15T00:00:00.000Z',
        origin: 'fixture',
      },
    ],
    price_alerts: [
      // Should NOT trigger: target 25M < plausible floor 28M (1.5M bait ignored!)
      {
        id: '30000000-0000-4000-8000-000000000001',
        master_product_id: masterBaitOnly,
        subscriber_email: 'baitcheck@example.com',
        target_price: 25_000_000,
        locale: 'vi',
        is_active: true,
        last_triggered_at: null,
      },
      // Should NOT trigger: only OOS / stock=0 / price=0.4 / non-crawl offers
      {
        id: '30000000-0000-4000-8000-000000000002',
        master_product_id: masterOosOnly,
        subscriber_email: 'ooscheck@example.com',
        target_price: 20_000_000,
        locale: 'en',
        is_active: true,
        last_triggered_at: null,
      },
      // Should NOT trigger: draft master product
      {
        id: '30000000-0000-4000-8000-000000000003',
        master_product_id: masterDraft,
        subscriber_email: 'draftcheck@example.com',
        target_price: 20_000_000,
        locale: 'vi',
        is_active: true,
        last_triggered_at: null,
      },
      // Should NOT trigger: still inside 7-day cooldown (triggered 6d23h ago)
      {
        id: '30000000-0000-4000-8000-000000000004',
        master_product_id: masterEligibleAtl,
        subscriber_email: 'cooldown@example.com',
        target_price: 18_500_000,
        locale: 'vi',
        is_active: true,
        last_triggered_at: sixDaysAgo,
      },
      // SHOULD trigger #2 in FIFO (10:00:00.500+00:00 > 10:00:00Z despite '+' < 'Z' ASCII)
      {
        id: '30000000-0000-4000-8000-000000000006',
        master_product_id: masterEligibleAtl,
        subscriber_email: 'second@example.com',
        target_price: 18_500_000,
        locale: 'en',
        is_active: true,
        last_triggered_at: null,
        created_at: '2026-11-01T10:00:00.500+00:00',
      },
      // SHOULD trigger #1 in FIFO (10:00:00Z < 10:00:00.500+00:00)
      {
        id: '30000000-0000-4000-8000-000000000005',
        master_product_id: masterEligibleAtl,
        subscriber_email: 'winner@example.com',
        target_price: 18_500_000,
        locale: 'cs',
        is_active: true,
        last_triggered_at: sevenDaysAgoExact,
        created_at: '2026-11-01T10:00:00Z',
      },
    ],
  });

  // Default dry-run with limit=1 picks the truly older 10:00:00Z alert first, sends 0 emails, writes 0 DB rows
  let sendCount = 0;
  const drySummary = await runPriceAlertsDigest(supabase, {
    now,
    limit: 1,
    sendEmail: async () => {
      sendCount += 1;
      return { id: 'msg', status: 200 };
    },
  });

  assert.equal(drySummary.mode, 'dry-run');
  assert.equal(drySummary.apply, false);
  assert.equal(drySummary.skippedCooldown, 1);
  assert.equal(drySummary.skippedUnpublishedOrNoOffer, 2);
  assert.equal(drySummary.skippedAboveTarget, 1);
  assert.equal(drySummary.eligibleAlerts, 2);
  assert.equal(drySummary.plannedAlerts, 1);
  assert.equal(drySummary.atl90dCount, 1);
  assert.equal(drySummary.emailsSent, 0);
  assert.equal(drySummary.dbUpdatesSucceeded, 0);
  assert.equal(sendCount, 0);
  assert.equal(updates.length, 0);
  assert.equal(drySummary.candidates[0]?.alertId, '30000000-0000-4000-8000-000000000005');
  assert.equal(drySummary.candidates[0]?.bestPrice, 17_990_000);
  assert.equal(drySummary.candidates[0]?.observed90dFloor, 18_200_000);
  assert.equal(drySummary.candidates[0]?.isAllTimeLow90d, true);
  assert.equal(drySummary.candidates[0]?.productUrl, 'https://rate.vn/smartphones/xiaomi-16');
});

test('--apply skips Resend Audience unsubscribed contacts, fails closed on suppression error, and updates last_triggered_at only after 2xx', async () => {
  const now = new Date('2026-11-23T12:00:00.000Z');
  const masterId = '40000000-0000-4000-8000-000000000001';
  const alertUnsub = '50000000-0000-4000-8000-000000000001';
  const alertFailSend = '50000000-0000-4000-8000-000000000002';
  const alertOkSend = '50000000-0000-4000-8000-000000000003';

  const makeTables = (): FakeDbTables => ({
    categories: [{ id: 'cat_1', slug: 'laptops' }],
    master_products: [
      {
        id: masterId,
        slug: 'macbook-air-m4',
        name: 'MacBook Air M4',
        status: 'published',
        category_id: 'cat_1',
      },
    ],
    merchants: [{ id: 'm_1', name: 'FPT Shop', platform: 'fptshop', is_official: true }],
    products: [
      {
        id: 'offer_1',
        cluster_id: masterId,
        merchant_id: 'm_1',
        price_current: 24_990_000,
        availability: 'in_stock',
      },
    ],
    price_history: [],
    price_alerts: [
      {
        id: alertUnsub,
        master_product_id: masterId,
        subscriber_email: 'OptedOut@Example.com',
        target_price: 26_000_000,
        locale: 'vi',
        is_active: true,
        last_triggered_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        id: alertFailSend,
        master_product_id: masterId,
        subscriber_email: 'transientfail@example.com',
        target_price: 26_000_000,
        locale: 'en',
        is_active: true,
        last_triggered_at: null,
        created_at: '2026-11-02T00:00:00.000Z',
      },
      {
        id: alertOkSend,
        master_product_id: masterId,
        subscriber_email: 'delivered@example.com',
        target_price: 26_000_000,
        locale: 'cs',
        is_active: true,
        last_triggered_at: null,
        created_at: '2026-11-03T00:00:00.000Z',
      },
    ],
  });

  // 1) --apply fails closed when RATE_ALERT_UNSUBSCRIBE_SECRET is missing or < 32 bytes
  const dbMissingInput = createFakeDigestSupabase(makeTables());
  await assert.rejects(
    runPriceAlertsDigest(dbMissingInput.supabase, {
      apply: true,
      now,
      unsubscribeSecret: SHORT_SIGNING_INPUT,
      resendApiKey: STUB_MAILER_CRED,
      fromEmail: 'Rate.vn <alerts@rate.vn>',
    }),
    /32/
  );
  assert.equal(dbMissingInput.updates.length, 0);

  // 1b) --apply fails closed when RATE_ALERT_UNSUBSCRIBE_SECRET has leading/trailing whitespace or newline
  await assert.rejects(
    runPriceAlertsDigest(dbMissingInput.supabase, {
      apply: true,
      now,
      unsubscribeSecret: `  ${SHARED_VECTOR_HEX}\n`,
      resendApiKey: STUB_MAILER_CRED,
      fromEmail: 'Rate.vn <alerts@rate.vn>',
    }),
    /whitespace or control characters/
  );
  assert.equal(dbMissingInput.updates.length, 0);

  // 2) --apply fails closed when Resend Audience suppression endpoint errors
  let emailsAttemptedOnSuppressionFailure = 0;
  const dbSuppFail = createFakeDigestSupabase(makeTables());
  await assert.rejects(
    runPriceAlertsDigest(dbSuppFail.supabase, {
      apply: true,
      now,
      unsubscribeSecret: SHARED_VECTOR_HEX,
      resendApiKey: STUB_MAILER_CRED,
      fromEmail: 'Rate.vn <alerts@rate.vn>',
      audienceId: 'aud_live_1',
      fetchUnsubscribed: async () => {
        throw new Error('Resend GET /audiences/contacts failed with HTTP 502');
      },
      sendEmail: async () => {
        emailsAttemptedOnSuppressionFailure += 1;
        return { id: 'never', status: 200 };
      },
    }),
    /HTTP 502/
  );
  assert.equal(emailsAttemptedOnSuppressionFailure, 0);
  assert.equal(dbSuppFail.updates.length, 0);

  // 3) --apply skips unsubscribed contact, skips DB update on 5xx send failure, updates DB on 2xx
  const attemptedRecipients: string[] = [];
  const dbLive = createFakeDigestSupabase(makeTables());
  const applySummary = await runPriceAlertsDigest(dbLive.supabase, {
    apply: true,
    now,
    unsubscribeSecret: SHARED_VECTOR_HEX,
    resendApiKey: STUB_MAILER_CRED,
    fromEmail: 'Rate.vn <alerts@rate.vn>',
    audienceId: 'aud_live_1',
    fetchUnsubscribed: async () => new Set(['optedout@example.com']),
    sendEmail: async input => {
      attemptedRecipients.push(input.toEmail);
      // Verify no ATL badge when price_history is empty
      assert.equal(input.isAllTimeLow90d, false);
      // Verify canonical token decodes for this alert
      const check = verifyAlertUnsubscribeToken(input.unsubscribeToken, SHARED_VECTOR_HEX, {
        nowUnixSec: Math.floor(now.getTime() / 1000),
      });
      assert.equal(check.ok, true);
      if (input.toEmail === 'transientfail@example.com') {
        throw new Error('Resend POST /emails failed with HTTP 500');
      }
      return { id: 're_ok_3', status: 200 };
    },
  });

  assert.deepEqual(attemptedRecipients, ['transientfail@example.com', 'delivered@example.com']);
  assert.equal(applySummary.skippedUnsubscribed, 1);
  assert.equal(applySummary.plannedAlerts, 2);
  assert.equal(applySummary.emailsSent, 1);
  assert.equal(applySummary.emailsFailed, 1);
  assert.equal(applySummary.dbUpdatesSucceeded, 1);
  assert.equal(applySummary.dbUpdatesFailed, 0);
  assert.deepEqual(dbLive.updates, [
    {
      id: alertOkSend,
      payload: {
        last_triggered_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    },
  ]);
});
