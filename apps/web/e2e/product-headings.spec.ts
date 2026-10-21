import { expect, test } from '@playwright/test';

// Product-page headings, eyebrows and buttons speak to shoppers, not about
// internal section numbers, rating engines or audits (DOS/Rate#625).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
// Compared in lower case: eyebrows are uppercased by CSS and innerText
// returns the transformed text.
const JARGON = [
  'jreviews',
  'dual-rating',
  '#2',
  'tco',
  'bàn cân',
  'kiểm định',
  'audit',
  'komise',
];

for (const [path, lang] of [
  [PRODUCT, 'vi'],
  [`/en${PRODUCT}`, 'en'],
  [`/cs${PRODUCT}`, 'cs'],
] as const) {
  test(`product headings are plain on ${lang}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('#specs-section h2')).toBeVisible();
    const labels = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.container h2, .container h3, .container .rate-eyebrow, .container .badge, .container a.btn'
        )
      )
        // The footer call-to-action is shared site-wide and tested there.
        .filter((el) => !el.closest('.rate-footer-cta'))
        .map((el) => el.innerText)
    );
    expect(labels.length).toBeGreaterThan(5);
    for (const label of labels) {
      for (const term of JARGON) {
        expect(
          label.toLowerCase(),
          `"${label}" contains "${term}"`
        ).not.toContain(term);
      }
    }
  });
}
