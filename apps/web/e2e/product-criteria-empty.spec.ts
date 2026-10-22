import { expect, test } from '@playwright/test';

// A product without per-criterion scores shows one empty-state line instead
// of five empty bars, and the price signal pill uses the site font
// (DOS/Rate#719).
for (const locale of ['vi', 'en', 'cs']) {
  test(`product page criteria empty state in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect(
      (await page.goto('/smartphones/iphone-16-pro-max-256gb'))?.status()
    ).toBe(200);
    const empty = page.getByTestId('pdv-criteria-empty');
    await expect(empty).toBeVisible();
    await expect(empty).not.toHaveText('');
    await expect(page.locator('.rate-pdv-crit-row')).toHaveCount(0);

    const badge = page.getByTestId('radar-badge').first();
    if (await badge.count()) {
      const family = await badge.evaluate(
        (el) => getComputedStyle(el).fontFamily
      );
      expect(family.toLowerCase()).not.toContain('monospace');
    }
  });
}
