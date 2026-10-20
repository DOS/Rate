import { expect, test, type Locator } from '@playwright/test';

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

// A click before hydration toggles <details> without the alignment check;
// close and retry until the list is open and placed.
async function openMenu(menu: Locator) {
  await expect(async () => {
    const open = await menu.evaluate((el) => (el as HTMLDetailsElement).open);
    const aligned = await menu.getAttribute('data-align');
    if (open && !aligned) await menu.locator('summary').click();
    if (!open || !aligned) await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('data-align', /start|end/, {
      timeout: 500,
    });
    await expect(menu.locator('.rate-export-menu-list')).toBeVisible({
      timeout: 500,
    });
  }).toPass();
}

test('export actions are folded into menus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  for (const id of EXPORT_TEST_IDS) {
    await expect(page.getByTestId(id)).toBeAttached();
    await expect(page.getByTestId(id)).toBeHidden();
  }
});

test('the spec export menu downloads a CSV and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  const menu = page.locator('#specs-section details.rate-export-menu');
  await openMenu(menu);
  const csv = page.getByTestId('download-specs-csv-btn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    csv.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await expect(csv).toBeHidden();
});

test('Escape closes a menu and returns focus to it', async ({ page }) => {
  await page.goto(PRODUCT);
  const menu = page.locator('#specs-section details.rate-export-menu');
  await openMenu(menu);
  await page.getByTestId('download-specs-csv-btn').focus();
  await page.keyboard.press('Escape');
  await expect(menu.locator('.rate-export-menu-list')).toBeHidden();
  await expect(menu.locator('summary')).toBeFocused();
});

// Section headers wrap at different breakpoints, so check several widths.
for (const width of [390, 600, 768, 1024]) {
  test(`every export menu opens on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PRODUCT);
    const menus = page.locator('details.rate-export-menu');
    await expect(menus).toHaveCount(EXPORT_TEST_IDS.length);
    for (let i = 0; i < EXPORT_TEST_IDS.length; i++) {
      const menu = menus.nth(i);
      await menu.scrollIntoViewIfNeeded();
      await openMenu(menu);
      const box = await menu.locator('.rate-export-menu-list').boundingBox();
      expect(box && box.x).toBeGreaterThanOrEqual(0);
      expect(box && box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
    }
  });
}
