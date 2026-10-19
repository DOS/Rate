import { expect, test } from '@playwright/test';

// /leaderboard is cached with the default tab; the browser applies the tab
// in the URL and keeps it there on a click (DOS/Rate#508).
test('/leaderboard is served from the page cache', async ({ request }) => {
  expect((await request.get('/leaderboard')).status()).toBe(200);
  const res = await request.get('/leaderboard?cat=earbuds');
  expect(res.status()).toBe(200);
  expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
});

test('a leaderboard deep link opens its tab, and a click updates the URL', async ({
  page,
}) => {
  await page.goto('/leaderboard?cat=earbuds&criterion=user');
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab', { selected: true })).toContainText(
    'Tai nghe ANC'
  );

  await tabs.getByRole('tab', { name: /Laptop & MacBook/ }).click();
  await expect(tabs.getByRole('tab', { selected: true })).toContainText(
    'Laptop & MacBook'
  );
  await expect(page).toHaveURL(/\/leaderboard\?cat=laptops&criterion=user$/);
});

test('an unknown leaderboard tab falls back to smartphones', async ({
  page,
}) => {
  await page.goto('/leaderboard?cat=nope');
  await expect(
    page.getByRole('tablist').getByRole('tab', { selected: true })
  ).toContainText('Điện thoại');
});
