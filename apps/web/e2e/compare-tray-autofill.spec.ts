import { expect, test } from '@playwright/test';

// Opening /compare shows its defaults or a shared ?slugs= list without
// writing them into the visitor's compare tray; only their own edits do
// (DOS/Rate#714).
const KEY = 'rate_compare_tray_v1';
const SHARED =
  '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb';
const readTray = (page: import('@playwright/test').Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), KEY);
const tray = (page: import('@playwright/test').Page) =>
  page.locator('div.position-fixed.bottom-0 .card');

test('visiting /compare leaves an empty tray empty', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto('/compare'))?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
  // Give the client effects time to run before asserting nothing was saved.
  await page.waitForLoadState('networkidle');
  expect(await readTray(page)).toBeNull();

  await page.goto('/merchants');
  await expect(page.locator('h1')).toBeVisible();
  await expect(tray(page)).toHaveCount(0);
});

test('a shared /compare link does not replace the saved tray', async ({
  page,
}) => {
  await page.goto('/deals');
  const saved = JSON.stringify([
    {
      slug: 'iphone-16-pro-max-256gb',
      name: 'iPhone 16 Pro Max 256GB',
      brand: 'Apple',
      thumbnail: null,
      min_price: 28990000,
      categorySlug: 'smartphones',
    },
  ]);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [KEY, saved]
  );

  expect((await page.goto(SHARED))?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  expect(JSON.parse((await readTray(page)) ?? '[]')).toHaveLength(1);
});

test('removing a device on /compare still updates the tray', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(SHARED))?.status()).toBe(200);
  await page
    .getByRole('button', { name: /^(Xóa|Remove) .*Galaxy S25 Ultra/ })
    .first()
    .click();
  await expect
    .poll(async () =>
      JSON.parse((await readTray(page)) ?? '[]').map(
        (i: { slug: string }) => i.slug
      )
    )
    .toEqual(['iphone-16-pro-max-256gb']);
});
