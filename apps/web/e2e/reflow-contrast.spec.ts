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
  // Longer sort labels pushed the catalog sideways in en and cs
  // (DOS/Rate#1082).
  '/en/smartphones',
  '/cs/smartphones',
  // Czech copy is the longest; the merchant rating line did not wrap
  // (DOS/Rate#1084).
  '/cs/leaderboard',
  '/cs/merchants/excluded-review-store',
  // A long unbroken store name wraps in the header (DOS/Rate#1472).
  '/merchants/unbroken-name-store',
];

for (const path of PHONE_PAGES) {
  test(`${path} fits a 320px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    expect((await page.goto(path))?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(320);
    // The toggle's 44px tap area (its ::after, DOS/Rate#717) stays inside the
    // viewport and clear of the header icons.
    const toggle = page.locator('.nav-toggle');
    await expect(toggle).toBeVisible();
    const hit = await toggle.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const size = parseFloat(getComputedStyle(el, '::after').width) || 0;
      const icons = [...document.querySelectorAll('.mobile_nav li')].map(
        (li) => li.getBoundingClientRect().right
      );
      return {
        size,
        left: box.left + (box.width - size) / 2,
        right: box.left + (box.width + size) / 2,
        iconsRight: Math.max(0, ...icons),
      };
    });
    expect(hit.size).toBeGreaterThanOrEqual(44);
    expect(hit.left).toBeGreaterThanOrEqual(hit.iconsRight);
    expect(hit.right).toBeLessThanOrEqual(320);
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
