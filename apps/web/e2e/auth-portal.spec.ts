import { expect, test } from '@playwright/test';

// On phones the sign-in form comes before the benefits panel, and the panel
// talks to shoppers, not about the database (DOS/Rate#606).
test('login form is in the first screen on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  const email = page.locator('input[type="email"]').first();
  await expect(email).toBeVisible();
  const box = await email.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(844);
});

test('login copy has no schema, route or database names', async ({ page }) => {
  await page.goto('/login');
  const text = await page.locator('main, body').first().innerText();
  for (const term of [
    'rate.review_votes',
    '(/watchlist)',
    'Row Level Security',
    'PostgreSQL',
    'Supabase',
  ]) {
    expect(text).not.toContain(term);
  }
});
