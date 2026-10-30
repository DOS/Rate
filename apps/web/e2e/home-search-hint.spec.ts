import { expect, test } from '@playwright/test';

// The home search hint reads whole on a 360px phone in every locale, and the
// long hint with its examples stays on wider screens (DOS/Rate#1488).
for (const locale of ['vi', 'en', 'cs']) {
  test(`home search hint fits a 360px phone in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    await page.setViewportSize({ width: 360, height: 800 });
    expect((await page.goto('/'))?.status()).toBe(200);
    const input = page.locator('form.search-wrap input').first();
    await expect(input).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const fit = async () =>
      input.evaluate((el: HTMLInputElement) => {
        const style = getComputedStyle(el);
        // Measured in the input's own font; an empty font would fall back
        // to the canvas's 10px default and pass by mistake.
        if (!style.font) return false;
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = style.font;
        const room =
          el.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight);
        return ctx.measureText(el.placeholder).width <= room;
      });
    await expect.poll(fit).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect
      .poll(() => input.getAttribute('placeholder'))
      .toMatch(/iPhone 16/);
  });
}
