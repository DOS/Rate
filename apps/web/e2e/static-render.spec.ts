import { expect, test } from '@playwright/test';

// Pages without searchParams are cached after their first render instead of
// rendering on every request (DOS/Rate#491).
const CACHED = ['/faq', '/smartphones/iphone-16-pro-max-256gb', '/'];

for (const path of CACHED) {
  test(`${path} is served from the page cache after its first render`, async ({
    request,
  }) => {
    expect((await request.get(path)).status()).toBe(200);
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
    expect(res.headers()['cache-control'] ?? '').not.toContain('no-store');
  });
}

test('each locale has its own cached page and <html lang>', async ({
  request,
}) => {
  for (const locale of ['vi', 'en', 'cs']) {
    const headers = { cookie: `NEXT_LOCALE=${locale}` };
    await request.get('/faq', { headers });
    const res = await request.get('/faq', { headers });
    expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
    expect(await res.text()).toContain(`<html lang="${locale}"`);
  }
});

test('a page that reads searchParams still renders per request', async ({
  request,
}) => {
  const res = await request.get('/smartphones?page=2');
  expect(res.status()).toBe(200);
  expect(res.headers()['x-nextjs-cache']).toBeUndefined();
});
