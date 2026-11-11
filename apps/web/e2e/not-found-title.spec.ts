import { expect, test } from '@playwright/test';

// Every 404 is titled as one, not with the site's default title
// (DOS/Rate#877, WCAG 2.4.2).
const TITLES = {
  vi: 'Không tìm thấy trang | Rate.vn',
  en: 'Page not found | Rate.vn',
};

// Unknown paths get the static Vietnamese root 404 whatever the locale
// cookie (DOS/Rate#1373, #1463).
for (const locale of Object.keys(TITLES)) {
  for (const path of ['/khong-ton-tai-abc', '/leaderboard/x']) {
    test(`${path} is titled as a 404 with the ${locale} cookie`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(path))?.status()).toBe(404);
      await expect(page).toHaveTitle(TITLES.vi);
    });
  }
}

// A missing versus page is still the localized not-found of its segment.
for (const [locale, title] of Object.entries(TITLES)) {
  test(`/compare/a-vs-b is titled as a 404 in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/compare/a-vs-b'))?.status()).toBe(404);
    await expect(page).toHaveTitle(title);
  });
}
