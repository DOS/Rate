import { expect, test, type Page } from '@playwright/test';

// /leaderboard is cached with the default tab; the browser applies the tab
// in the URL and keeps it there on a click (DOS/Rate#508).
test.use({
  storageState: {
    cookies: [
      {
        name: 'NEXT_LOCALE',
        value: 'vi',
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    origins: [],
  },
});

// The category switcher is a group of single-select buttons (DOS/Rate#1067).
const categories = (page: Page) =>
  page.getByRole('group', { name: 'Chọn ngành hàng' });
const selectedTab = (page: Page) =>
  categories(page).getByRole('button', { pressed: true });
// The active criterion is the dark pill.
const activeCriterion = (page: Page) => page.locator('button.btn-dark');

test('/leaderboard is served from the page cache', async ({ request }) => {
  expect((await request.get('/leaderboard')).status()).toBe(200);
  const res = await request.get('/leaderboard?cat=earbuds');
  expect(res.status()).toBe(200);
  expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
  // Only the URL reader is client-rendered: the category switcher is in the
  // server HTML.
  expect(await res.text()).toContain('aria-label="Chọn ngành hàng"');
});

test('a leaderboard deep link opens its tab, and a click updates the URL', async ({
  page,
}) => {
  await page.goto('/leaderboard?cat=earbuds&criterion=user');
  await expect(selectedTab(page)).toContainText('Tai nghe ANC');
  await expect(activeCriterion(page)).toContainText('Điểm người mua thực chất');

  await categories(page)
    .getByRole('button', { name: /Laptop & MacBook/ })
    .click();
  await expect(selectedTab(page)).toContainText('Laptop & MacBook');
  await expect(page).toHaveURL(/\/leaderboard\?cat=laptops&criterion=user$/);
});

test('a same-route link back to /leaderboard resets the tab', async ({
  page,
}) => {
  await page.goto('/leaderboard?cat=earbuds');
  await expect(selectedTab(page)).toContainText('Tai nghe ANC');
  await page.evaluate(() => {
    // A client-side navigation to the plain URL, like the navbar link.
    const link = document.querySelector<HTMLAnchorElement>(
      '#navigation a[href="/leaderboard"]'
    );
    link?.click();
  });
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(selectedTab(page)).toContainText('Điện thoại');
});

test('an unknown leaderboard tab falls back to the defaults', async ({
  page,
}) => {
  await page.goto('/leaderboard?cat=nope&criterion=user');
  // The effect ran: the criterion from the URL is applied...
  await expect(activeCriterion(page)).toContainText('Điểm người mua thực chất');
  // ...and the unknown category falls back to smartphones.
  await expect(selectedTab(page)).toContainText('Điện thoại');
});

test('a criterion click keeps the chosen brand', async ({ page }) => {
  await page.goto('/leaderboard');
  const brand = page.getByLabel('Lọc theo thương hiệu');
  const criterion = page.locator('button', {
    hasText: 'Điểm người mua thực chất',
  });
  // A choice made before hydration is reset to "all" when React takes over;
  // retry until the brand survives the criterion click.
  await expect(async () => {
    if ((await brand.inputValue()) !== 'Apple') {
      await brand.selectOption('Apple');
    }
    await criterion.click();
    await expect(page).toHaveURL(/criterion=user/, { timeout: 1000 });
    await expect(brand).toHaveValue('Apple', { timeout: 1000 });
  }).toPass();
});
