import { expect, test } from '@playwright/test';

// /developers is sentence case and drops internal jargon and stale counts in
// every locale (DOS/Rate#695).
const COPY = {
  vi: {
    title: 'Tài liệu REST API v1 cho nhà phát triển | Rate.vn',
    h1: 'Cổng nhà phát triển & REST API v1',
  },
  en: {
    title: 'REST API v1 docs for developers | Rate.vn',
    h1: 'Developer portal & REST API v1',
  },
  cs: {
    title: 'Dokumentace REST API v1 pro vývojáře | Rate.vn',
    h1: 'Portál pro vývojáře & REST API v1',
  },
};

for (const [locale, copy] of Object.entries(COPY)) {
  test(`developers page copy is plain in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/developers'))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page).toHaveTitle(copy.title);
    await expect(page.locator('h1')).toHaveText(copy.h1);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const jargon of [
      'zero-strapi',
      'anti-detect',
      'zero-trust',
      'telemetry',
      '15 rest api',
      'next.js 16',
      'postgresql 17',
    ]) {
      expect(text).not.toContain(jargon);
    }
  });
}
