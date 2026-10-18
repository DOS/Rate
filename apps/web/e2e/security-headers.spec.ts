import { expect, test } from '@playwright/test';

// Response security headers from next.config.mjs (DOS/Rate#424): pages and
// API routes alike, and no X-Powered-By.
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
    const csp = headers['content-security-policy'] ?? '';
    for (const directive of [
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(headers['x-powered-by']).toBeUndefined();
  });
}
