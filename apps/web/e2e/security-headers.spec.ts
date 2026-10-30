import { expect, test } from '@playwright/test';

// Response security headers from next.config.mjs (DOS/Rate#424): pages and
// API routes alike, and no X-Powered-By. The static policy is a header on API
// routes and a <meta> tag on pages (DOS/Rate#1345).
const PATHS = ['/', '/smartphones/iphone-16-pro-max-256gb', '/api/health'];

for (const path of PATHS) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=63072000');
    const directives = [
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ];
    if (path.startsWith('/api/')) {
      const csp = headers['content-security-policy'] ?? '';
      for (const directive of ["frame-ancestors 'self'", ...directives]) {
        expect(csp).toContain(directive);
      }
    } else {
      // A page carries no enforcing policy header, which would hide the
      // report-only nonce from Next.js; the static policy is in a <meta> tag
      // and X-Frame-Options stops framing (DOS/Rate#1345).
      expect(headers['content-security-policy']).toBeUndefined();
      const html = await res.text();
      const meta = html.match(
        /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/
      );
      for (const directive of directives) {
        expect(meta?.[1]?.replace(/&#x27;/g, "'")).toContain(directive);
      }
    }
    expect(headers['x-powered-by']).toBeUndefined();
  });
}

// The report-only nonce reaches the render of a page rendered per request:
// every nonced script carries the nonce of its own response, and the next
// request gets another one (DOS/Rate#1345). Cached (ISR) pages have no nonce
// yet, see DOS/Rate#1348. The category page (force-dynamic, #491) is the one
// the live check found without a nonce before the fix (DOS/Rate#1427).
for (const path of ['/inspect', '/smartphones']) {
  test(`csp nonce on ${path} matches its header`, async ({ request }) => {
    const seen = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const policy = res.headers()['content-security-policy-report-only'] ?? '';
      const nonce = policy.match(/script-src [^;]*'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      const html = await res.text();
      const attrs = [...html.matchAll(/<script[^>]* nonce="([^"]+)"/g)].map(
        (m) => m[1]
      );
      expect(attrs.length).toBeGreaterThan(0);
      expect(new Set(attrs)).toEqual(new Set([nonce]));
      seen.add(nonce!);
    }
    expect(seen.size).toBe(2);
  });
}
