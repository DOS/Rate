import { expect, test, type Page } from '@playwright/test';

// Header links prefetch on intent, not on sight: neither the closed phone
// menu (DOS/Rate#1064) nor an open one or the desktop navbar fetches its
// routes until the visitor points at, focuses or touches a link
// (DOS/Rate#1330).
// /contact-us links /developers in its body, so the checks use navbar
// routes the page itself does not link.
const NAV_ONLY = ['/leaderboard', '/tablets'];

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

test('a phone menu prefetches a link only once it is pointed at', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const prefetched = recordPrefetches(page);
  expect((await page.goto('/contact-us'))?.status()).toBe(200);
  await settle(page);
  for (const path of NAV_ONLY) expect(prefetched).not.toContain(path);

  await page.locator('.nav-toggle').click();
  await expect(page.locator('.nav-menus-wrapper-open')).toBeVisible();
  await settle(page);
  for (const path of NAV_ONLY) expect(prefetched).not.toContain(path);

  await page
    .locator('.nav-menus-wrapper-open a[href="/leaderboard"]:visible')
    .first()
    .hover();
  await expect
    .poll(() => prefetched.has('/leaderboard'), { timeout: 10_000 })
    .toBe(true);
});

test('desktop prefetches a navbar link on hover, not on sight', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const prefetched = recordPrefetches(page);
  expect((await page.goto('/contact-us'))?.status()).toBe(200);
  await settle(page);
  expect(prefetched).not.toContain('/leaderboard');

  await page
    .locator(
      'header a[href="/leaderboard"]:visible, nav a[href="/leaderboard"]:visible'
    )
    .first()
    .hover();
  await expect
    .poll(() => prefetched.has('/leaderboard'), { timeout: 10_000 })
    .toBe(true);
});
