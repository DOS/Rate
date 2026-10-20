import { expect, test } from '@playwright/test';

// The compare tray starts collapsed on phones so it does not cover the page,
// and expanded on wider screens (DOS/Rate#607).
const items = [
  ['iphone-16-pro-max-256gb', 'iPhone 16 Pro Max 256GB', 28990000],
  ['samsung-galaxy-s25-ultra-256gb', 'Galaxy S25 Ultra 256GB', 26490000],
].map(([slug, name, min_price]) => ({
  slug,
  name,
  min_price,
  thumbnail: null,
  brand: '',
}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('rate_compare_tray_v1', value);
  }, JSON.stringify(items));
});

const tray = (page: import('@playwright/test').Page) =>
  page.locator('div.position-fixed.bottom-0 .card').first();

test('compare tray starts collapsed on a phone and expands on tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/deals');
  const card = tray(page);
  await expect(card).toBeVisible();
  await expect(card.locator('#rate-compare-tray-items')).toHaveCount(0);
  expect((await card.boundingBox())?.height ?? 999).toBeLessThanOrEqual(72);
  await expect(card.locator('a.btn-danger')).toBeVisible();

  const toggle = card.locator(
    'button[aria-controls="rate-compare-tray-items"]'
  );
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('#rate-compare-tray-items')).toBeVisible();
});

test('compare tray starts expanded on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/deals');
  const card = tray(page);
  await expect(card.locator('#rate-compare-tray-items')).toBeVisible();
});
