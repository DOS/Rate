import { expect, test, type Page } from '@playwright/test';

// Vietnamese store, reviewer and variant names sit inside lang="vi" on en
// pages, so screen readers switch voice for them (WCAG 3.1.2, DOS/Rate#720).
// The seed (e2e/seed.sql) has a Vietnamese store ("Cửa Hàng Điện Thoại Hà
// Nội"), reviewers ("Lan Phương", "Thảo") and a variant ("Xanh Mòng Két").
const STORE = 'Cửa Hàng Điện Thoại Hà Nội';
const PAGES = [
  '/',
  '/smartphones',
  '/smartphones/iphone-16-pro-max-256gb',
  '/merchants',
  // The Vietnamese-named store and a store with a Vietnamese reviewer.
  '/merchants/11111111-1111-4111-8111-111111111112',
  '/merchants/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb250',
  '/deals',
  '/inspect?q=iPhone%2016%20Pro%20Max',
];

// Same letter set as src/lib/content-lang.ts: letters only Vietnamese uses
// among the site's languages.
const VIETNAMESE_SOURCE =
  '[àãèìĩòõùũăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]';

/** Rendered text nodes with Vietnamese letters whose nearest lang is not vi. */
async function unmarkedVietnamese(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const re = new RegExp(source, 'iu');
    const found: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').normalize('NFC').trim();
      const parent = node.parentElement;
      if (!text || !parent || !re.test(text)) continue;
      if (parent.closest('script, style, noscript, template')) continue;
      if (!parent.checkVisibility({ visibilityProperty: true })) continue;
      if (parent.closest('[lang]')?.getAttribute('lang') === 'vi') continue;
      found.push(text);
    }
    return found;
  }, VIETNAMESE_SOURCE);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page
    .context()
    .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL ?? '' }]);
});

for (const path of PAGES) {
  test(`Vietnamese names are marked lang="vi" on ${path} in en`, async ({
    page,
  }) => {
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await unmarkedVietnamese(page)).toEqual([]);
  });
}

test('product page marks store, reviewer and variant names', async ({
  page,
}) => {
  await page.goto('/smartphones/iphone-16-pro-max-256gb');
  await expect(
    page.locator('[lang="vi"]', { hasText: STORE }).first()
  ).toBeVisible();
  await expect(
    page.locator('[lang="vi"]', { hasText: /^Lan Phương$/ }).first()
  ).toBeAttached();
  // Only the variant value is Vietnamese; its English label is not marked.
  const variant = page.locator('[lang="vi"]', { hasText: /^Xanh Mòng Két$/ });
  await expect(variant.first()).toBeAttached();
  await expect(
    page.locator('div:has(> [lang="vi"])', {
      hasText: /^Variant: Xanh Mòng Két$/,
    })
  ).toHaveCount(1);
});

test('merchant profile marks only the store name in its subtitle', async ({
  page,
}) => {
  await page.goto('/merchants/11111111-1111-4111-8111-111111111112');
  await expect(page.locator('h1 [lang="vi"]')).toHaveText(STORE);
  const subtitle = page.locator('p', {
    hasText: /^Comparing prices recorded at /,
  });
  await expect(subtitle).toHaveCount(1);
  await expect(subtitle).not.toHaveAttribute('lang', /./);
  await expect(subtitle.locator('[lang="vi"]')).toHaveText(STORE);
});
