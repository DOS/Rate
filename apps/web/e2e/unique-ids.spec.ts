import { expect, test } from '@playwright/test';

// The navbar renders the locale switcher twice, and the English flag used
// fixed clipPath ids, so every page had duplicate ids (DOS/Rate#1079).
// The English flag is drawn as the current locale's flag on /en pages.
for (const path of ['/en', '/en/smartphones']) {
  test(`ids are unique on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('nav').first()).toBeVisible();
    const duplicates = await page.evaluate(() => {
      const counts = new Map<string, number>();
      for (const el of document.querySelectorAll('[id]')) {
        counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
      }
      return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });
}
