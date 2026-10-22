import { expect, test } from '@playwright/test';

// On phones the navbar sticks to the top but keeps its place in the page, so
// the first hero's eyebrow and heading start below it (DOS/Rate#715).
const PAGES = [
  '/',
  '/smartphones',
  '/merchants',
  '/deals',
  '/leaderboard',
  '/faq',
  '/compare',
  '/inspect',
];

for (const path of PAGES) {
  test(`${path} starts below the navbar on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    expect((await page.goto(path))?.status()).toBe(200);
    const header = page.locator('div.header').first();
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const firstText = page
      .locator('main, body')
      .first()
      .locator('.rate-eyebrow, h1')
      .first();
    await expect(firstText).toBeVisible();
    const textBox = await firstText.boundingBox();
    expect(textBox!.y).toBeGreaterThanOrEqual(
      headerBox!.y + headerBox!.height - 1
    );
  });
}

test('the navbar stays on top while scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/merchants');
  await page.evaluate(() => window.scrollTo(0, 900));
  // header-fixed (added on scroll) sets top: -1px.
  await expect
    .poll(async () =>
      Math.abs(
        (await page.locator('div.header').first().boundingBox())?.y ?? 999
      )
    )
    .toBeLessThanOrEqual(1);
});
