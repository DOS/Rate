import { expect, test, type Page } from '@playwright/test';

// The desktop navbar fits on one row: catalogues sit in a "Categories"
// dropdown and Home / Watchlist live in the phone menu only (DOS/Rate#611).
async function headerHeight(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.round(
      document.querySelector('.header')!.getBoundingClientRect().height
    )
  );
}

for (const locale of ['vi', 'en', 'cs']) {
  for (const width of [992, 1024, 1280, 1440]) {
    test(`navbar is one row at ${width}px (${locale})`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/faq');
      // One row is ~74px; a wrapped navbar is ~115px.
      expect(await headerHeight(page)).toBeLessThanOrEqual(90);
      const sw = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      expect(sw).toBeLessThanOrEqual(width);
    });
  }
}

test('categories dropdown opens, links and closes on Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/faq');
  const toggle = page.locator('button[aria-controls="rate-nav-categories"]');
  const menu = page.locator('#rate-nav-categories');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();
  // A click before hydration does nothing; retry until the menu opens.
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
      timeout: 500,
    });
  }).toPass();
  await expect(menu.locator('a')).toHaveCount(5);
  await expect(menu.locator('a[href$="/laptops"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('phone menu still lists every catalogue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/faq');
  const navToggle = page.locator('button.nav-toggle');
  const menu = page.locator('#rate-nav-menu');
  await expect(async () => {
    if ((await navToggle.getAttribute('aria-expanded')) !== 'true') {
      await navToggle.click();
    }
    await expect(menu).toHaveClass(/nav-menus-wrapper-open/, { timeout: 500 });
  }).toPass();
  for (const path of [
    '/smartphones',
    '/laptops',
    '/tablets',
    '/smartwatches',
    '/earbuds',
    '/watchlist',
  ]) {
    await expect(
      menu.locator(`ul.nav-menu a[href$="${path}"]`).first()
    ).toBeVisible();
  }
});
