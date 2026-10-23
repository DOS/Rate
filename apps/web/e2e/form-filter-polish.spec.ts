import { expect, type Page, test } from '@playwright/test';

// The catalog rating filter keeps each option on one line (DOS/Rate#794), and
// sign-in fields declare their purpose for autofill (DOS/Rate#795).
const lineCount = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((labels) =>
    labels.map((label) => {
      // Text lines only: the star icon sits at its own vertical offset.
      const tops = new Set<number>();
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const r of range.getClientRects()) {
          if (r.width > 0) tops.add(Math.round(r.top));
        }
      }
      return tops.size;
    })
  );

for (const locale of ['vi', 'en', 'cs']) {
  test(`rating filter options stay on one line in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    await page.setViewportSize({ width: 1366, height: 900 });
    expect((await page.goto('/smartphones'))?.status()).toBe(200);
    const labels = page.locator('label[for^="rating-"]');
    await expect(labels).toHaveCount(4);
    await expect(labels.first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Poll: the sidebar can still be laying out right after hydration.
    await expect
      .poll(() => lineCount(page, 'label[for^="rating-"]'))
      .toEqual([1, 1, 1, 1]);
  });
}

test('sign-in and register fields declare autocomplete', async ({ page }) => {
  expect((await page.goto('/login'))?.status()).toBe(200);
  await expect(page.locator('#rate-auth-email')).toHaveAttribute(
    'autocomplete',
    'email'
  );
  await expect(page.locator('#rate-auth-password')).toHaveAttribute(
    'autocomplete',
    'current-password'
  );

  expect((await page.goto('/register'))?.status()).toBe(200);
  await expect(page.locator('#rate-auth-email')).toHaveAttribute(
    'autocomplete',
    'email'
  );
  await expect(page.locator('#rate-auth-password')).toHaveAttribute(
    'autocomplete',
    'new-password'
  );
});
