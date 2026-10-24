import { expect, test } from '@playwright/test';

// /api/health reads the database with the app's own client (DOS/Rate#829).
// The failure paths (refused key, network error, timeout, cache window) are
// unit-tested in core-rate-architecture guard 94: the probe result is cached
// per server instance, so a simulated outage here would leak into the specs
// running in parallel against the same server.
test('/api/health reports a readable database', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store, max-age=0');
  const body = (await res.json()) as {
    status: string;
    service: string;
    checks: { database: string };
  };
  expect(body.status).toBe('ok');
  expect(body.service).toBe('rate-web');
  expect(body.checks).toEqual({ database: 'ok' });
});
