import { expect, test } from '@playwright/test';

// The scoreboard has no "fake reviews filtered" eyebrow any more; the note is
// an info (i) button beside the buyer score that opens on hover, keyboard
// focus and tap (DOS/Rate#1946).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const NOTE = /^Điểm số đã lọc đánh giá ảo/;

test('the scoreboard shows no eyebrow and explains the score on hover and focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(PRODUCT))?.status()).toBe(200);

  const board = page.locator('.rate-pdv-board').first();
  await expect(board.locator('.rate-eyebrow')).toHaveCount(0);

  const info = page.getByTestId('pdv-score-filter-info');
  const button = info.getByRole('button', { name: 'Về điểm số này' });
  const bubble = info.getByRole('tooltip');
  await expect(button).toHaveAccessibleDescription(NOTE);
  await expect(bubble).toBeHidden();

  await button.hover();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText(NOTE);
  await page.mouse.move(0, 0);
  await expect(bubble).toBeHidden();

  // A key press first, so the focus that follows counts as keyboard focus.
  await page.keyboard.press('Shift');
  await button.focus();
  await expect(button).toBeFocused();
  await expect(bubble).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
});

test('a tap on a phone pins the score note open until the next tap outside', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  expect((await page.goto(PRODUCT))?.status()).toBe(200);

  const info = page.getByTestId('pdv-score-filter-info');
  const bubble = info.getByRole('tooltip');
  await info.getByRole('button').tap();
  await expect(bubble).toBeVisible();
  // The bubble stays inside the screen.
  const box = await bubble.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  await page.locator('h1').first().tap();
  await expect(bubble).toBeHidden();
  await context.close();
});
