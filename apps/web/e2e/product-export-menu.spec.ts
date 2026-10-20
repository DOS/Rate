import { expect, test } from '@playwright/test';

// Each product-page section keeps its Markdown/CSV/JSON exports in one
// "Export data" menu instead of a row of buttons (DOS/Rate#623).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const EXPORT_TEST_IDS = [
  'product-export-csv-btn',
  'download-reviews-csv-btn',
  'download-specs-csv-btn',
  'download-price-history-csv-btn',
  'download-offers-csv-btn',
];

test('export actions are folded into menus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  for (const id of EXPORT_TEST_IDS) {
    await expect(page.getByTestId(id)).toBeAttached();
    await expect(page.getByTestId(id)).toBeHidden();
  }
});

test('the spec export menu opens and downloads a CSV', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  const menu = page.locator('#specs-section details.rate-export-menu');
  const csv = page.getByTestId('download-specs-csv-btn');
  // A click before hydration still toggles <details>; retry until the list
  // is open and on screen.
  await expect(async () => {
    if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await menu.locator('summary').click();
    }
    await expect(csv).toBeVisible({ timeout: 500 });
  }).toPass();
  const box = await menu.locator('.rate-export-menu-list').boundingBox();
  expect(box && box.x).toBeGreaterThanOrEqual(0);
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    csv.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  // A download action closes the menu.
  await expect(csv).toBeHidden();
});

test('every export menu opens fully on screen on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  await page.waitForLoadState('networkidle');
  const menus = await page.locator('details.rate-export-menu').all();
  expect(menus.length).toBe(EXPORT_TEST_IDS.length);
  for (const menu of menus) {
    await menu.scrollIntoViewIfNeeded();
    await menu.locator('summary').click();
    const box = await menu.locator('.rate-export-menu-list').boundingBox();
    expect(box && box.x).toBeGreaterThanOrEqual(0);
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);
    await menu.locator('summary').click();
  }
});
