import assert from 'node:assert/strict';

// The report-only Content Security Policy (DOS/Rate#1311): a nonce per request on
// both the request (for Next.js) and the response, a script-src with no inline
// allowance, and a report endpoint that only logs.

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

async function main() {
  const {
    buildContentSecurityPolicy,
    buildReportOnlyCsp,
    createCspNonce,
    CSP_HEADER,
    PAGE_META_CSP,
    STATIC_CSP,
  } = await import('../csp');

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
  // Both report-only policies in the one header, the nonce one first, so Next.js
  // still finds the nonce (it reads the first script-src); the measured inline
  // policy reports with its own tag (DOS/Rate#1323).
  const policies = sent.split(', ');
  assert.equal(policies.length, 2, 'two report-only policies');
  assert.match(policies[0]!, /^default-src 'self'; script-src 'self' 'nonce-/);
  assert.equal(
    policies[1],
    "script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; report-uri /api/csp-report?policy=inline"
  );
  const { getScriptNonceFromHeader } = (await import(
    'next/dist/server/app-render/get-script-nonce-from-header' as string
  )) as { getScriptNonceFromHeader: (header: string) => string | undefined };
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policies[0]!)?.[1];
  assert.ok(nonce);
  assert.equal(
    getScriptNonceFromHeader(sent),
    nonce,
    'Next.js extracts the per-request nonce from the combined header'
  );
  assert.equal(
    getScriptNonceFromHeader(buildReportOnlyCsp('n0nce', { dev: true })),
    'n0nce'
  );
  assert.match(
    buildReportOnlyCsp('n0nce', { dev: true }),
    /, script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src/,
    'development keeps eval in the measured policy too'
  );
  const fs = await import('node:fs');
  const path = await import('node:path');
  // No enforcing policy header on a page: Next.js copies the proxy's response
  // headers onto the request, where it would hide the nonce (DOS/Rate#1345).
  assert.equal(
    res.headers.get('content-security-policy'),
    null,
    'nothing is enforced by header on a page'
  );
  // A client-sent enforcing policy does not reach the render either.
  const spoofed = localeProxy(
    new NextRequest('https://rate.vn/smartphones', {
      headers: {
        host: 'rate.vn',
        'x-forwarded-proto': 'https',
        'content-security-policy': "script-src 'nonce-chosen'",
      },
    })
  );
  assert.equal(
    spoofed.headers.get('x-middleware-request-content-security-policy'),
    null
  );
  assert.doesNotMatch(
    spoofed.headers.get('x-middleware-override-headers') ?? '',
    /(^|,)content-security-policy(,|$)/
  );
  assert.doesNotMatch(STATIC_CSP, /script-src|default-src/);
  assert.equal(
    PAGE_META_CSP,
    STATIC_CSP.replace("frame-ancestors 'self'; ", '').replace(/;$/, ''),
    'pages get the static policy in a <meta> tag, less frame-ancestors'
  );
  for (const file of [
    '../../app/[locale]/layout.tsx',
    '../../app/not-found.tsx',
    '../../app/global-error.tsx',
  ]) {
    assert.match(
      fs.readFileSync(path.join(__dirname, file), 'utf8'),
      /<meta httpEquiv="Content-Security-Policy" content=\{PAGE_META_CSP\} \/>/,
      `${file} carries the page policy`
    );
  }

  // next.config.mjs sets the static policy header only on the paths the proxy
  // does not serve: Vercel copies config headers onto the request too.
  const { pathToRegexp } = await import(
    'next/dist/compiled/path-to-regexp' as string
  );
  const nextConfig = fs.readFileSync(
    path.join(__dirname, '../../../next.config.mjs'),
    'utf8'
  );
  const rule = nextConfig.match(
    /source: ("[^"]+"),\s*headers: \[\s*\{\s*key: "Content-Security-Policy",\s*value:\s*("[^"]+")/
  );
  assert.ok(rule, 'next.config.mjs has one Content-Security-Policy rule');
  assert.equal(JSON.parse(rule[2]!), STATIC_CSP, 'the same static policy');
  assert.equal(
    nextConfig.match(/key: "Content-Security-Policy"/g)?.length,
    1,
    'and no other'
  );
  const configPaths = pathToRegexp(JSON.parse(rule[1]!), [], {
    strict: true,
    sensitive: false,
    delimiter: '/',
  }) as RegExp;
  const { config: proxyConfig } = await import('../../proxy');
  const proxied = proxyConfig.matcher.map(
    (m) =>
      pathToRegexp(m, [], {
        strict: true,
        sensitive: false,
        delimiter: '/',
      }) as RegExp
  );
  for (const p of [
    '/',
    '/smartphones',
    '/smartphones/iphone-16-pro-max-256gb',
    '/inspect',
    '/compare',
    '/api/health',
    '/_next/static/chunks/a.js',
    '/robots.txt',
    '/robots-txt',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/apisomething',
    '/smartphones/',
    '/en/smartphones',
    '/sitemap.xml',
    '/monitoring',
    '/img/logo.png',
  ]) {
    const byProxy = proxied.some((re) => re.test(p));
    assert.notEqual(
      configPaths.test(p),
      byProxy,
      `${p}: next.config.mjs sets the policy header exactly where the proxy does not run`
    );
  }
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
    const before = lines.length;
    // The same violation again is not logged twice.
    await POST(
      new Request('https://rate.vn/api/csp-report', {
        method: 'POST',
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://rate.vn/smartphones',
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'inline',
          },
        }),
      })
    );
    // A report without a directive, or for another site's page, is not logged.
    for (const report of [
      {},
      {
        'document-uri': 'https://evil.example/x',
        'effective-directive': 'script-src-elem',
      },
    ]) {
      await POST(
        new Request('https://rate.vn/api/csp-report', {
          method: 'POST',
          body: JSON.stringify({ 'csp-report': report }),
        })
      );
    }
    // A streamed body with no Content-Length stops being read past 8 KB.
    let pulled = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1024;
        if (pulled > 256 * 1024) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const huge = await POST(
      new Request('https://rate.vn/api/csp-report', {
        method: 'POST',
        body: big,
        duplex: 'half',
      } as RequestInit)
    );
    assert.equal(huge.status, 204);
    assert.ok(pulled <= 16 * 1024, `read ${pulled} bytes of an oversized body`);
    assert.equal(lines.length, before, 'no further log line');
    // The same violation from the measured inline policy is its own line, tagged.
    await POST(
      new Request('https://rate.vn/api/csp-report?policy=inline', {
        method: 'POST',
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://rate.vn/smartphones',
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'inline',
          },
        }),
      })
    );
    assert.equal(lines.length, before + 1, 'the inline policy logs apart');
    assert.match(lines[lines.length - 1]!, /"policy":"inline"/);
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
