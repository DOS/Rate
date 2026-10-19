import { expect, test } from '@playwright/test';

// The seeded directory has 1,100+ stores; the home trust section must stay a
// preview instead of rendering every one of them (DOS/Rate#450).
test('home merchant section is a capped preview of the directory', async ({
  page,
}) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  const cards = page.locator('.rate-merchant-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(6);
  expect((await res!.body()).length).toBeLessThan(1_500_000);
});
