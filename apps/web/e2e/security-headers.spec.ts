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
      expect(html).toMatch(/<script[^>]* nonce="[^"]+"/);
    }
    expect(headers['x-powered-by']).toBeUndefined();
  });
}
