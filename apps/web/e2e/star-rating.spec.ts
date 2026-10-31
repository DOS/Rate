import { expect, test } from '@playwright/test';

// Ratings show as stars with the value and a short count, with no verbose
// words around them (DOS/Rate#1528).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';

test('the product scoreboard shows the buyer score as stars with a count', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(PRODUCT))?.status()).toBe(200);

  const score = page.getByTestId('pdv-user-score');
  await expect(score).toBeVisible();
  await expect(score).toHaveAttribute('role', 'img');
  // "4.6 trên 5 sao, 6 đánh giá": one label for screen readers.
  await expect(score).toHaveAttribute(
    'aria-label',
    /^\d\.\d trên 5 sao, [\d.]+ đánh giá$/
  );
  await expect(score.locator('.rate-stars-value')).toHaveText(/^\d\.\d$/);
  await expect(score.locator('.rate-stars-count')).toHaveText(/^\([\d.]+\)$/);
  // The band colour follows the printed value.
  const value = Number(await score.getAttribute('data-rating'));
  const band = value >= 4 ? 'is-good' : value >= 3 ? 'is-fair' : 'is-poor';
  await expect(score).toHaveClass(new RegExp(`\\b${band}\\b`));
  // The fill is the share of five stars.
  const fill = await score
    .locator('.rate-stars-fill')
    .evaluate((el) => (el as HTMLElement).style.width);
  expect(Number.parseFloat(fill)).toBeCloseTo((value / 5) * 100, 5);

  const text = await page.locator('main, body').first().innerText();
  for (const phrase of [
    'bài kiểm chứng',
    'chuẩn 10 nhóm',
    '(có trọng số)',
    '/ 5.0',
    '(Bayes)',
  ]) {
    expect(text, phrase).not.toContain(phrase);
  }
});

test('product cards and the leaderboard use the same stars', async ({
  page,
}) => {
  expect((await page.goto('/smartphones'))?.status()).toBe(200);
  await expect(
    page.locator('.rate-product-card .rate-stars').first()
  ).toBeVisible();
  expect((await page.goto('/leaderboard'))?.status()).toBe(200);
  await expect(page.locator('.rate-stars[role="img"]').first()).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('/5.0');
  expect(text).not.toContain('/ 5.0');
});
