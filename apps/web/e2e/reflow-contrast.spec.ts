import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// At 320px no page scrolls sideways and the phone menu toggle stays inside
// the viewport (DOS/Rate#809, WCAG 1.4.10 Reflow).
const PHONE_PAGES = [
  '/',
  '/smartphones',
  '/smartphones/iphone-16-pro-max-256gb',
  '/merchants',
  '/compare',
];

for (const path of PHONE_PAGES) {
  test(`${path} fits a 320px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    expect((await page.goto(path))?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    const { scrollWidth, toggleRight } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      toggleRight:
        document.querySelector('.nav-toggle')?.getBoundingClientRect().right ??
        Infinity,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(320);
    expect(toggleRight).toBeLessThanOrEqual(320);
  });
}

test('the review sort control fits a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    (await page.goto('/smartphones/iphone-16-pro-max-256gb'))?.status()
  ).toBe(200);
  // Measured in page coordinates: scrolling it into view could also scroll
  // the page sideways and hide the overflow.
  const right = await page
    .locator('#review-sort-select')
    .evaluate((el) => el.getBoundingClientRect().right + window.scrollX);
  expect(right).toBeLessThanOrEqual(320);
});

// Reviews excluded from the score are set apart without dimming their text
// below 4.5:1 (DOS/Rate#811).
for (const path of [
  '/smartphones/e2e-excluded-review-phone',
  '/merchants/excluded-review-store',
]) {
  test(`excluded review text meets contrast on ${path}`, async ({ page }) => {
    expect((await page.goto(path))?.status()).toBe(200);
    const excluded = page.getByText('shop uy tín, giao nhanh nhận xu').first();
    await expect(excluded).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();
    expect(
      violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))
    ).toEqual([]);
  });
}
