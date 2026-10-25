import { expect, test, type Page } from '@playwright/test';

// On phones the closed off-canvas menu does not prefetch its routes; opening it
// does. On desktop the menu is on screen and prefetches as before
// (DOS/Rate#1064).
const MENU_ONLY = ['/developers', '/tablets'];

function recordPrefetches(page: Page): Set<string> {
  const seen = new Set<string>();
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.searchParams.has('_rsc') && req.headers()['next-router-prefetch'])
      seen.add(url.pathname);
  });
  return seen;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Prefetches start after hydration, on idle.
  await page.waitForTimeout(1500);
}

test('a phone does not prefetch the closed menu, and does once it opens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const prefetched = recordPrefetches(page);
  expect((await page.goto('/contact-us'))?.status()).toBe(200);
  await settle(page);
  for (const path of MENU_ONLY) expect(prefetched).not.toContain(path);

  await page.locator('.nav-toggle').click();
  await expect(page.locator('.nav-menus-wrapper-open')).toBeVisible();
  await expect
    .poll(() => MENU_ONLY.filter((p) => prefetched.has(p)).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
});

test('desktop still prefetches the navbar links', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const prefetched = recordPrefetches(page);
  expect((await page.goto('/contact-us'))?.status()).toBe(200);
  await settle(page);
  await expect
    .poll(() => prefetched.has('/developers'), { timeout: 10_000 })
    .toBe(true);
});
