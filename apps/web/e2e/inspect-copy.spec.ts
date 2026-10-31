import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const inspectLabels = (lang: string) =>
  (
    JSON.parse(
      readFileSync(join(__dirname, `../locales/${lang}.json`), 'utf8')
    ) as { inspect: Record<string, string> }
  ).inspect;

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
      await page
        .locator('#rate-nav-menu ul.nav-menu a[href$="/inspect"]')
        .first()
        .innerText()
    ).toLowerCase();
    const navIconLabel = (
      (await page
        .locator('.mobile_nav a[href$="/inspect"]')
        .first()
        .getAttribute('aria-label')) ?? ''
    ).toLowerCase();
    expect(navLink.trim().length).toBeGreaterThan(0);
    // The page runs a sample check on load; scan its result panel too.
    await expect(page.locator('.container h2').first()).toBeVisible();
    const body = (
      await page.locator('.container').first().innerText()
    ).toLowerCase();
    for (const term of JARGON) {
      expect(hero).not.toContain(term);
      expect(navLink).not.toContain(term);
      expect(navIconLabel).not.toContain(term);
      expect(body).not.toContain(term);
    }
  });

  // The spec strip and the copied Markdown summary use translated labels, not
  // hardcoded English ones (DOS/Rate#702).
  test(`inspect summary labels are localized on ${lang}`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // A seeded product, so the summary has product, score and price lines.
    await page.goto(
      `${prefix}/inspect?q=${encodeURIComponent('iPhone 16 Pro Max')}`
    );
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('.rate-stars').first()).toBeVisible();
    await page.locator('.rate-export-menu summary').click();
    await page.getByTestId('inspect-copy-md-btn').click();
    const labels = inspectLabels(lang);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`**${labels.mdProduct}:**`);
    const md = await page.evaluate(() => navigator.clipboard.readText());
    for (const key of ['mdQuery', 'mdBuyerScore', 'mdPriceSignal', 'mdLink']) {
      expect(md).toContain(`**${labels[key]}:**`);
    }
    const body = await page.locator('.container').first().innerText();
    expect(body).toContain(`${labels.specModelKey}:`);
    for (const english of [
      'Rate.vn Inspector',
      'Master Product',
      'JReviews Buyer Score',
      'Trust Score',
      'Price Spread',
      '**URL:**',
    ]) {
      expect(md).not.toContain(english);
    }
    for (const english of ['SoC:', 'Model Key:', 'Official Mall']) {
      expect(body).not.toContain(english);
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
