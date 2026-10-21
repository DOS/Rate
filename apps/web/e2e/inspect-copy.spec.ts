import { expect, test } from '@playwright/test';

// The link checker, the navbar entry to it and seller risk badges speak
// plainly in every locale (DOS/Rate#637).
const JARGON = [
  'kiểm toán',
  'audit',
  'dual risk',
  'dosafe threat',
  'ai review risk',
  'seeding',
];

for (const [prefix, lang] of [
  ['', 'vi'],
  ['/en', 'en'],
  ['/cs', 'cs'],
] as const) {
  test(`link checker and nav are plain on ${lang}`, async ({ page }) => {
    await page.goto(`${prefix}/inspect`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const hero = (
      await page.locator('.rate-scoreboard-dark').first().innerText()
    ).toLowerCase();
    const navLink = (
      await page.locator('a[href$="/inspect"]').first().innerText()
    ).toLowerCase();
    for (const term of JARGON) {
      expect(hero).not.toContain(term);
      expect(navLink).not.toContain(term);
    }
  });

  test(`seller profile risk badges are localized on ${lang}`, async ({
    page,
  }) => {
    await page.goto(`${prefix}/merchants/11111111-1111-4111-8111-111111111111`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const badges = (
      await page.locator('.container .badge').allInnerTexts()
    ).join('\n');
    expect(badges).toMatch(/\d+\/100/);
    expect(badges).not.toMatch(/(^|\n)(Risk|Review Risk): /);
  });
}
