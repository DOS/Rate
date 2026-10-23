import { expect, test } from '@playwright/test';

// /inspect without ?q= shows the first sample link's result. The server
// computes it, so the page does not fetch it after hydration and grow under
// the reader (DOS/Rate#763: live CLS 0.30 came from that late fetch).
test('/inspect renders the sample inspection without a client fetch', async ({
  page,
}) => {
  const inspectCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/v1/rate/inspect'))
      inspectCalls.push(req.url());
  });
  expect((await page.goto('/inspect'))?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(inspectCalls).toEqual([]);
});

// Pages whose body mounts on the client keep the footer below the fold while
// it loads, so loading them causes no large layout shift (DOS/Rate#763).
for (const path of ['/login', '/register', '/inspect']) {
  test(`${path} loads with CLS below 0.1 on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { value: number; hadRecentInput: boolean }
        >) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    expect((await page.goto(path))?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    // The client body (with the page h1) mounted, so the fallback is gone.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Let late mounts and fonts settle.
    await page.waitForTimeout(1000);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls
    );
    expect(cls).toBeLessThan(0.1);
  });
}
