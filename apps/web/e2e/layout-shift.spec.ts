import { expect, test } from '@playwright/test';

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
    // Let late mounts and fonts settle.
    await page.waitForTimeout(1000);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls
    );
    expect(cls).toBeLessThan(0.1);
  });
}
