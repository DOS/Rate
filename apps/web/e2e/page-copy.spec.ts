import { expect, test } from '@playwright/test';

// Headings, eyebrows, badges and buttons on the home page, leaderboard and
// compare page speak to shoppers, not about rating engines or audits
// (DOS/Rate#639). Lower case: eyebrows are uppercased by CSS.
const JARGON = [
  'jreviews',
  'dual-rating',
  'dual risk',
  'bàn cân',
  'kiểm toán',
  'audit',
  'seeding',
  'open-core',
  'kiểm định',
];
const PAGES = [
  '/',
  '/leaderboard',
  '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
];

for (const [prefix, lang] of [
  ['', 'vi'],
  ['/en', 'en'],
  ['/cs', 'cs'],
] as const) {
  for (const path of PAGES) {
    test(`${path} labels are plain on ${lang}`, async ({ page }) => {
      await page.goto(`${prefix}${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1').first()).toBeVisible();
      const labels = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'h1, h2, h3, .rate-eyebrow, .rate-hero-kicker, .badge, .btn, summary, th'
          )
        )
          .filter((el) => !el.closest('.rate-footer-cta, footer'))
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
      const title = (await page.title()).toLowerCase();
      const description = (
        (await page
          .locator('meta[name="description"]')
          .getAttribute('content')) ?? ''
      ).toLowerCase();
      for (const term of JARGON) {
        expect(title).not.toContain(term);
        expect(description).not.toContain(term);
      }
    });
  }
}
