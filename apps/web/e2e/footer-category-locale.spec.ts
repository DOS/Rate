import { expect, test } from '@playwright/test';

// The footer call to action and the catalogue category switcher follow the
// active locale (DOS/Rate#646). /deals, /leaderboard and /merchants rendered
// the footer without a locale, which used to fall back to Vietnamese, and the
// switcher showed the Vietnamese category names from the database.
const BADGE = {
  vi: 'Chấm điểm minh bạch, chống seeding',
  en: 'Open rating, anti-seeding',
};

for (const path of ['/deals', '/leaderboard', '/merchants', '/no-such-page']) {
  test(`the footer of ${path} reads in English`, async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL ?? '' }]);
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const footer = page.locator('.rate-footer-cta');
    if (path !== '/no-such-page') {
      await expect(footer).toContainText(BADGE.en);
      await expect(footer).not.toContainText(BADGE.vi);
    }
    // The site footer (rendered on every page, the 404 included).
    const body = await page.locator('body').innerText();
    expect(body).toContain('part of the DOS ecosystem');
    expect(body).not.toContain('thuộc hệ sinh thái DOS');
  });
}

test('catalogue category names follow the locale', async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL ?? '' }]);
  await page.goto('/smartphones');
  await expect(page.locator('label[for="cat-smartphones"]')).toHaveText(
    'Smartphones'
  );
  await expect(page.locator('label[for="cat-earbuds"]')).toHaveText('Earbuds');

  await page
    .context()
    .addCookies([{ name: 'NEXT_LOCALE', value: 'vi', url: baseURL ?? '' }]);
  await page.goto('/smartphones');
  // Vietnamese keeps the database names.
  await expect(page.locator('label[for="cat-smartphones"]')).toHaveText(
    'Điện thoại'
  );
});
