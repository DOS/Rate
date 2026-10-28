import assert from 'node:assert/strict';

// The report-only Content Security Policy (DOS/Rate#1311): a nonce per request on
// both the request (for Next.js) and the response, a script-src with no inline
// allowance, and a report endpoint that only logs.

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

async function main() {
  const { buildContentSecurityPolicy, createCspNonce, CSP_HEADER } =
    await import('../csp');

  const a = createCspNonce();
  const b = createCspNonce();
  assert.notEqual(a, b, 'a fresh nonce per request');
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/, '128 random bits, base64');

  const policy = buildContentSecurityPolicy('n0nce', {
    supabaseUrl: 'https://abc.supabase.co/rest/v1',
  });
  const directive = (name: string) =>
    policy
      .split('; ')
      .find((d) => d.startsWith(`${name} `))
      ?.slice(name.length + 1);
  assert.equal(
    directive('script-src'),
    "'self' 'nonce-n0nce' 'strict-dynamic'",
    'scripts: the nonce, never unsafe-inline or unsafe-eval in production'
  );
  assert.equal(directive('default-src'), "'self'");
  assert.equal(
    directive('connect-src'),
    "'self' https://abc.supabase.co wss://abc.supabase.co"
  );
  assert.equal(directive('object-src'), "'none'");
  assert.equal(directive('frame-ancestors'), "'self'");
  assert.equal(directive('report-uri'), '/api/csp-report');
  assert.match(
    buildContentSecurityPolicy('x', { dev: true }),
    /script-src 'self' 'nonce-x' 'strict-dynamic' 'unsafe-eval'/
  );
  assert.doesNotMatch(
    buildContentSecurityPolicy('x', { supabaseUrl: 'javascript:alert(1)' }),
    /javascript/,
    'only an http(s) Supabase URL is added'
  );

  // The proxy: the same policy on the response and on the forwarded request.
  const { NextRequest } = await import('next/server');
  const { localeProxy } = await import('../../proxy');
  const res = localeProxy(
    new NextRequest('https://rate.vn/smartphones', {
      headers: { host: 'rate.vn', 'x-forwarded-proto': 'https' },
    })
  );
  const sent = res.headers.get(CSP_HEADER);
  assert.ok(sent, 'pages carry the report-only policy');
  assert.match(
    sent,
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/
  );
  assert.equal(
    res.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`),
    sent,
    'Next.js reads the same nonce from the request'
  );
  assert.equal(
    res.headers.get('content-security-policy'),
    null,
    'nothing is enforced yet'
  );
  const res2 = localeProxy(
    new NextRequest('https://rate.vn/smartphones', {
      headers: { host: 'rate.vn', 'x-forwarded-proto': 'https' },
    })
  );
  assert.notEqual(res2.headers.get(CSP_HEADER), sent, 'one nonce per request');

  // The report endpoint logs a report and answers 204 whatever it gets.
  const { POST } = await import('../../app/api/csp-report/route');
  const lines: string[] = [];
  // The logger writes warnings to stderr.
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const ok = await POST(
      new Request('https://rate.vn/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://rate.vn/smartphones?email=a@b.c',
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'inline',
            'line-number': 3,
          },
        }),
      })
    );
    assert.equal(ok.status, 204);
    const bad = await POST(
      new Request('https://rate.vn/api/csp-report', {
        method: 'POST',
        body: 'not json',
      })
    );
    assert.equal(bad.status, 204);
  } finally {
    console.error = original;
  }
  const logged = lines.join('\n');
  assert.match(logged, /csp violation/);
  assert.match(logged, /script-src-elem/);
  assert.match(logged, /https:\/\/rate\.vn\/smartphones/);
  assert.doesNotMatch(logged, /email=/, 'no query string is logged');

  console.warn('  ✅ report-only CSP with a per-request nonce (#1311)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
