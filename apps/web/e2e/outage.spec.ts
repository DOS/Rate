import { expect, test } from '@playwright/test';

// scripts/e2e/run.mjs answers 500 to every PostgREST query containing
// "e2e-fault", simulating a database outage for these URLs only. An outage must
// surface as 5xx, never as a 404 that crawlers would act on (DOS/Rate#323).
const BINGBOT =
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';

for (const path of [
  '/smartphones/e2e-fault-product',
  '/merchants/e2e-fault-shop',
  '/compare/e2e-fault-a-vs-e2e-fault-b',
  '/api/v1/rate/products/e2e-fault-product',
]) {
  test(`database outage on ${path} is a 5xx, not a 404`, async ({
    request,
  }) => {
    for (const userAgent of [undefined, BINGBOT]) {
      const res = await request.get(path, {
        headers: userAgent ? { 'user-agent': userAgent } : {},
      });
      expect(
        res.status(),
        userAgent ?? 'default user agent'
      ).toBeGreaterThanOrEqual(500);
    }
  });
}
