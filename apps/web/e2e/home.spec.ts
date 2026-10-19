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

// The hero search fetches merchant matches as the user types instead of
// shipping the whole directory with the page (DOS/Rate#452).
test('hero search finds stores that are not in the page payload', async ({
  page,
}) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  // A low-ranked seeded store: never among the preloaded suggestions.
  expect(await res!.text()).not.toContain('last_ranked_shop');
  expect((await res!.body()).length).toBeLessThan(500_000);

  await page
    .getByLabel(/Tìm kiếm sản phẩm công nghệ|Search/)
    .first()
    .fill('Last Ranked');
  await expect(
    page.locator('a[href*="/merchants/"]', { hasText: 'Last Ranked Shop' })
  ).toBeVisible();
});
