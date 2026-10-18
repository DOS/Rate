import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.1 A/AA checks with axe on the main public pages (seeded in
// apps/web/e2e/seed.sql). color-contrast is left out until the design tokens
// are fixed (DOS/Rate#362); every other rule must pass.
const PAGES = [
  '/',
  '/smartphones',
  '/smartphones/iphone-16-pro-max-256gb',
  '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  '/merchants',
  '/merchants/11111111-1111-4111-8111-111111111111',
  '/leaderboard',
  '/deals',
];

for (const path of PAGES) {
  test(`no accessibility violations on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // Scan the hydrated page: effects add DOM after load.
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const summary = violations.map(
      (v) =>
        `${v.impact} ${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`
    );
    expect(summary).toEqual([]);
  });
}
