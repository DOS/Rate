import { expect, test } from '@playwright/test';

// Every 404 under a locale is titled as one, not with the site's default
// title (DOS/Rate#877, WCAG 2.4.2).
const PATHS = ['/khong-ton-tai-abc', '/leaderboard/x', '/compare/a-vs-b'];
const TITLES = {
  vi: 'Không tìm thấy trang | Rate.vn',
  en: 'Page not found | Rate.vn',
};

for (const [locale, title] of Object.entries(TITLES)) {
  for (const path of PATHS) {
    test(`${path} is titled as a 404 in ${locale}`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(path))?.status()).toBe(404);
      await expect(page).toHaveTitle(title);
    });
  }
}
