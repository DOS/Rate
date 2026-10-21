import { expect, test } from '@playwright/test';

// About, FAQ, privacy and contact pages explain Rate.vn in plain words:
// no table names, rating-engine brands or audit wording (DOS/Rate#641).
const JARGON = [
  'jreviews',
  'open-core',
  'dual risk',
  'kiểm toán',
  'audit',
  'seeding',
  'rate.master_products',
  'rate.price_history',
  'rate.merchants',
  'rate.review_votes',
  'pg_trgm',
  'voter_hash',
  'supabase',
];
const PAGES = ['/about-us', '/faq', '/privacy-policy', '/contact-us'];

for (const [prefix, lang] of [
  ['', 'vi'],
  ['/en', 'en'],
  ['/cs', 'cs'],
] as const) {
  for (const path of PAGES) {
    test(`${path} is plain on ${lang}`, async ({ page }) => {
      await page.goto(`${prefix}${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1').first()).toBeVisible();
      const text = (
        await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll('footer, .rate-footer-cta, nav, script, style')
            .forEach((el) => el.remove());
          return clone.innerText || clone.textContent || '';
        })
      ).toLowerCase();
      const title = (await page.title()).toLowerCase();
      for (const term of JARGON) {
        expect(text, `body contains "${term}"`).not.toContain(term);
        expect(title).not.toContain(term);
      }
    });
  }
}
