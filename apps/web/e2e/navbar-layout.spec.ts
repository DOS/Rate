import { expect, test, type Page } from '@playwright/test';

// The server HTML lays the navbar out for the viewport by media query, so
// the page does not jump after hydration, and the phone header fits the
// screen (DOS/Rate#515).
async function cumulativeLayoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 500);
      })
  );
}

for (const viewport of [
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'phone', width: 375, height: 812 },
]) {
  test(`the home page does not shift on load (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await cumulativeLayoutShift(page)).toBeLessThan(0.1);
  });
}

test('the phone header keeps the menu button on screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.locator('.nav-toggle');
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  // Retried until hydration has attached the click handler.
  await expect(async () => {
    await toggle.click();
    await expect(page.locator('.nav-menus-wrapper')).toHaveClass(
      /nav-menus-wrapper-open/,
      { timeout: 500 }
    );
  }).toPass();
});

test('at exactly 992px only the desktop menu shows', async ({ page }) => {
  await page.setViewportSize({ width: 992, height: 768 });
  await page.goto('/');
  await expect(page.locator('#navigation .mobile_nav')).toBeHidden();
  await expect(page.locator('#navigation .nav-toggle')).toBeHidden();
  // The menu items float, so check a link rather than the zero-height list.
  await expect(
    page.locator('#navigation .nav-menu a[href="/leaderboard"]')
  ).toBeVisible();
});
