import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Next's build-time matcher compiler reads AsyncLocalStorage from globalThis
// (normally populated by next/dist/server/node-environment).
Object.assign(globalThis, { AsyncLocalStorage });

// Dotted dynamic page routes (/merchants/:id, /compare/:versus, and
// /:category/:slug, with or without /vi|/en|/cs prefixes) must pass through
// src/proxy.ts for locale routing and per-request CSP nonces instead of
// skipping the proxy, getting the static non-page CSP header, or being
// rewritten to /vi/__not-found (DOS/Rate#1807). Unknown static asset paths
// (/foo.png, /ads.txt, /unknown/asset.js) keep their #732/#1463 404 rewrite.

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

async function main() {
  const { NextRequest } = await import('next/server');
  const { pathToRegexp } = await import(
    'next/dist/compiled/path-to-regexp' as string
  );
  const { getMiddlewareMatchers } = (await import(
    'next/dist/build/analysis/get-page-static-info' as string
  )) as {
    getMiddlewareMatchers: (
      matchers: string[],
      options: { i18n?: undefined }
    ) => Array<{ regexp: string; originalSource: string }>;
  };

  const { CSP_HEADER } = await import('../csp');
  const { config: proxyConfig, localeProxy } = await import('../../proxy');

  const nextConfigSrc = fs.readFileSync(
    path.join(__dirname, '../../../next.config.mjs'),
    'utf8'
  );
  const cspRule = nextConfigSrc.match(
    /source:\s*("[^"]+"),\s*headers: \[\s*\{\s*key: "Content-Security-Policy"/
  );
  assert.ok(cspRule, 'next.config.mjs defines the static CSP source');
  const notFoundRewriteRule = nextConfigSrc.match(
    /source:\s*("[^"]+"),\s*destination:\s*"\/vi\/__not-found"/
  );
  assert.ok(
    notFoundRewriteRule,
    'next.config.mjs defines the dotted-path /vi/__not-found rewrite'
  );

  // Next.js compiles routes-manifest.json custom routes with caseSensitive: false
  // (/i), whereas functions-config-manifest.json middleware matchers execute via
  // new RegExp(matcher.regexp) with no /i flag.
  const compileCustomRoute = (source: string) =>
    pathToRegexp(source, [], {
      strict: true,
      sensitive: false,
      delimiter: '/',
    }) as RegExp;

  const middlewareRegexes = getMiddlewareMatchers(proxyConfig.matcher, {
    i18n: undefined,
  }).map((m) => new RegExp(m.regexp));
  const staticCspRegex = compileCustomRoute(JSON.parse(cspRule[1]!));
  const notFoundRewriteRegex = compileCustomRoute(
    JSON.parse(notFoundRewriteRule[1]!)
  );

  const byMiddleware = (p: string) =>
    middlewareRegexes.some((re) => re.test(p));

  const dottedDynamicPagePaths = [
    '/merchants/anker.vn',
    '/merchants/Anker.VN',
    '/merchants/viettel.store',
    '/merchants/didongthongminhchinhhang.vn',
    '/merchants/samsung.official.vn',
    '/merchants/shop_1.vn',
    '/merchants/anker.vn/',
    '/Merchants/anker.vn',
    '/vi/merchants/anker.vn',
    '/en/merchants/anker.vn',
    '/EN/merchants/anker.vn',
    '/cs/merchants/anker.vn',
    '/CS/Merchants/anker.vn',
    '/smartphones/nokia-8.1',
    '/laptops/thinkpad-x1-carbon-11.2',
    '/tablets/ipad-pro-12.9',
    '/smartwatches/watch-gt4-46.0mm',
    '/earbuds/airpods-pro-bt5.3',
    '/vi/smartphones/nokia-8.1',
    '/Vi/smartphones/nokia-8.1',
    '/en/laptops/thinkpad-x1-carbon-11.2',
    '/cs/tablets/ipad-pro-12.9',
    '/en/smartwatches/watch-gt4-46.0mm',
    '/cs/earbuds/airpods-pro-bt5.3',
    '/compare/nokia-7.2-vs-nokia-8.1',
    '/vi/compare/nokia-7.2-vs-nokia-8.1',
    '/en/compare/nokia-7.2-vs-nokia-8.1',
    '/cs/compare/nokia-7.2-vs-nokia-8.1',
    '/CS/compare/nokia-7.2-vs-nokia-8.1',
  ];

  for (const p of dottedDynamicPagePaths) {
    assert.equal(
      byMiddleware(p),
      true,
      `${p} must match compiled Next.js middleware matcher`
    );
    assert.equal(
      staticCspRegex.test(p),
      false,
      `${p} must not get the static non-page CSP header`
    );
    assert.equal(
      notFoundRewriteRegex.test(p),
      false,
      `${p} must not be rewritten to /vi/__not-found`
    );
  }

  const staticAssetFourOhFourPaths = [
    '/foo.png',
    '/nonexistent.png',
    '/ads.txt',
    '/manifest.json',
    '/site.webmanifest',
    '/browserconfig.xml',
    '/a.b',
    '/unknown/asset.js',
    '/sitemap_index.xml',
    '/en/foo.png',
    '/EN/foo.png',
    '/vi/ads.txt',
    '/cs/unknown/asset.js',
    '/merchants/.',
    '/merchants/..',
    '/merchants/.env',
    '/merchants/anker.',
    '/merchants/foo..bar',
    '/merchants/-bad.vn',
    '/smartphones/.git',
    '/smartphones/foo..bar',
    '/smartphones/nokia.',
    '/compare/..hidden',
    '/compare/100%25.png',
    '/compare/nokia-8.1%25-vs-nokia-7.2',
    '/merchants/anker.vn/logo.png',
    '/smartphones/nokia-8.1/photo.jpg',
    '/compare/nokia-7.2-vs-nokia-8.1/extra.json',
  ];

  for (const p of staticAssetFourOhFourPaths) {
    assert.equal(
      byMiddleware(p),
      false,
      `${p} must skip compiled Next.js middleware matcher`
    );
    assert.equal(
      staticCspRegex.test(p),
      true,
      `${p} must carry the static CSP header`
    );
    assert.equal(
      notFoundRewriteRegex.test(p),
      true,
      `${p} must rewrite to /vi/__not-found when no public/static file matches`
    );
  }

  const reservedNonPagePaths = [
    '/_next/static/chunks/main.js',
    '/_NEXT/static/chunks/main.js',
    '/_vercel/insights/script.js',
    '/_VERCEL/insights/script.js',
    '/api/health',
    '/API/health',
    '/api/v1/rate/openapi.json',
    '/api/v1/rate/merchants/anker.vn',
    '/API/v1/rate/merchants/anker.vn',
    '/api/v1/rate/products/nokia-8.1',
    '/Monitoring',
    '/Sitemap',
    '/APIsomething',
    '/a.b/smartphones',
    '/merchants/a.b/extra',
  ];

  for (const p of reservedNonPagePaths) {
    assert.equal(byMiddleware(p), false, `${p} must skip proxy.ts`);
    assert.equal(
      staticCspRegex.test(p),
      true,
      `${p} must carry the static CSP header`
    );
    assert.equal(
      notFoundRewriteRegex.test(p),
      false,
      `${p} must not be rewritten to /vi/__not-found`
    );
  }

  // Runtime localeProxy behavior on unprefixed dotted dynamic routes.
  for (const [p, cookieLocale, expectedLocale] of [
    ['/merchants/anker.vn', undefined, 'vi'],
    ['/merchants/anker.vn', 'en', 'en'],
    ['/merchants/viettel.store', 'cs', 'cs'],
    ['/smartphones/nokia-8.1', 'en', 'en'],
    ['/compare/nokia-7.2-vs-nokia-8.1', 'cs', 'cs'],
  ] as const) {
    const headers: Record<string, string> = {
      host: 'rate.vn',
      'x-forwarded-proto': 'https',
      'content-security-policy': "script-src 'nonce-attacker'",
    };
    if (cookieLocale) headers.cookie = `NEXT_LOCALE=${cookieLocale}`;

    const res = localeProxy(
      new NextRequest(`https://rate.vn${p}`, { headers })
    );
    assert.equal(res.status, 200, `${p} renders without redirect`);
    assert.equal(
      res.headers.get('x-middleware-rewrite'),
      `https://rate.vn/${expectedLocale}${p}`,
      `${p} rewrites to /${expectedLocale}${p}`
    );
    const reportOnly = res.headers.get(CSP_HEADER);
    assert.ok(reportOnly, `${p} carries report-only CSP header`);
    assert.match(
      reportOnly,
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'sha256-[A-Za-z0-9+/=]+' 'strict-dynamic'/
    );
    assert.equal(
      res.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`),
      reportOnly,
      `${p} forwards the same report-only CSP nonce to Next.js`
    );
    assert.equal(
      res.headers.get('content-security-policy'),
      null,
      `${p} sets no enforcing CSP header on the response`
    );
    assert.equal(
      res.headers.get('x-middleware-request-content-security-policy'),
      null,
      `${p} strips any client-supplied enforcing CSP header`
    );
  }

  // Runtime localeProxy behavior on locale-prefixed dotted dynamic routes.
  for (const [prefixed, expectedPath, expectedCookie] of [
    ['/vi/merchants/anker.vn', '/merchants/anker.vn', 'vi'],
    ['/en/merchants/anker.vn', '/merchants/anker.vn', 'en'],
    ['/cs/merchants/anker.vn', '/merchants/anker.vn', 'cs'],
    ['/EN/merchants/anker.vn', '/merchants/anker.vn', 'en'],
    [
      '/en/smartphones/nokia-8.1?tab=specs',
      '/smartphones/nokia-8.1?tab=specs',
      'en',
    ],
    [
      '/cs/compare/nokia-7.2-vs-nokia-8.1',
      '/compare/nokia-7.2-vs-nokia-8.1',
      'cs',
    ],
  ] as const) {
    const res = localeProxy(
      new NextRequest(`https://rate.vn${prefixed}`, {
        headers: { host: 'rate.vn', 'x-forwarded-proto': 'https' },
      })
    );
    assert.equal(res.status, 308, `${prefixed} 308-redirects to strip locale`);
    assert.equal(
      res.headers.get('location'),
      `https://rate.vn${expectedPath}`,
      `${prefixed} redirects to ${expectedPath}`
    );
    assert.equal(
      res.cookies.get('NEXT_LOCALE')?.value,
      expectedCookie,
      `${prefixed} persists NEXT_LOCALE=${expectedCookie}`
    );
  }

  // Linear-time guard against ReDoS across all compiled matchers.
  for (const input of [
    `/${'a'.repeat(20_000)}`,
    `/merchants/${'a.'.repeat(10_000)}/c`,
    `/${'a.'.repeat(10_000)}/c`,
    `/merchants/${'.segments/'.repeat(2_000)}tail`,
    `/${'a'.repeat(10_000)}\nb.png`,
  ]) {
    const start = performance.now();
    byMiddleware(input);
    staticCspRegex.test(input);
    notFoundRewriteRegex.test(input);
    const elapsedMs = performance.now() - start;
    assert.ok(
      elapsedMs < 100,
      `route regexes must run in linear time (${elapsedMs.toFixed(2)}ms on ${input.length} chars)`
    );
  }

  console.warn('  ✅ proxy dotted-slug routing & CSP suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
