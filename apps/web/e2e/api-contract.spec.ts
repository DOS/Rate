import { expect, test } from '@playwright/test';

// /compare tells an unknown slug apart from a product the same-category lock
// dropped (DOS/Rate#1364).
test('compare API lists unknown slugs apart from cross-category ones', async ({
  request,
}) => {
  const slugs = [
    'iphone-16-pro-max-256gb',
    'apple-watch-e2e-cellular',
    'does-not-exist-e2e',
  ];
  const res = await request.get(
    `/api/v1/rate/compare?slugs=${slugs.join(',')}`
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.requested_slugs).toEqual(slugs);
  expect(body.not_found_slugs).toEqual(['does-not-exist-e2e']);
  // The lock keeps the first product's category; the other published one
  // (a phone and a watch) is the cross-category exclusion.
  expect(body.count).toBe(1);
  const kept: string = body.data[0].slug;
  expect(['iphone-16-pro-max-256gb', 'apple-watch-e2e-cellular']).toContain(
    kept
  );
  expect(body.locked_category).toBe(
    kept === 'iphone-16-pro-max-256gb' ? 'smartphones' : 'smartwatches'
  );
  expect(body.excluded_cross_category_slugs).toEqual(
    slugs.filter((s) => s !== kept && s !== 'does-not-exist-e2e')
  );
});

// Past 30 requests a minute from one client, /lookup and /inspect answer the
// shared 429 shape (DOS/Rate#1377). The two routes share one limiter, so each
// test and each attempt uses its own client address: no bucket is shared
// with the other route, other specs or a CI retry. The limit counts every
// request, so a request with no query (400) is enough.
const LIMITED_PATHS = ['/api/v1/rate/lookup', '/api/v1/rate/inspect'];
for (const [index, path] of LIMITED_PATHS.entries()) {
  test(`${path} answers the shared 429 past its limit`, async ({
    request,
  }, testInfo) => {
    const id = Date.now() % 250;
    const client = `198.51.${100 + index * 10 + testInfo.retry}.${id}`;
    const headers = { 'x-forwarded-for': client };
    for (let i = 0; i < 30; i++) {
      const res = await request.get(path, { headers });
      expect(res.status(), `request ${i + 1}`).toBe(400);
    }
    const limited = await request.get(path, { headers });
    expect(limited.status()).toBe(429);
    expect(limited.headers()['retry-after']).toBe('60');
    expect(limited.headers()['access-control-expose-headers']).toContain(
      'Retry-After'
    );
    expect(await limited.json()).toEqual({
      ok: false,
      error: 'Rate limit exceeded. Maximum 30 inspections per minute.',
      code: 'RATE_LIMIT_EXCEEDED',
    });

    // Another client is not limited by this one.
    const other = await request.get(path, {
      headers: { 'x-forwarded-for': `203.0.${113 + index}.${id}` },
    });
    expect(other.status()).toBe(400);
  });
}
