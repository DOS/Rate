import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.2 A/AA checks with axe on every public page (seeded in
// apps/web/e2e/seed.sql), color-contrast included (DOS/Rate#362), at desktop
// and phone widths (DOS/Rate#421): every rule must pass.
const PAGES: { path: string; status?: number }[] = [
  { path: '/' },
  { path: '/smartphones' },
  { path: '/laptops' },
  { path: '/tablets' },
  { path: '/smartwatches' },
  { path: '/earbuds' },
  { path: '/smartphones/iphone-16-pro-max-256gb' },
  {
    path: '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
  },
  {
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  },
  { path: '/merchants' },
  { path: '/merchants/11111111-1111-4111-8111-111111111111' },
  { path: '/leaderboard' },
  { path: '/deals' },
  { path: '/inspect' },
  { path: '/watchlist' },
  { path: '/developers' },
  { path: '/about-us' },
  { path: '/contact-us' },
  { path: '/faq' },
  { path: '/privacy-policy' },
  { path: '/login' },
  { path: '/register' },
  { path: '/forgot-password' },
  { path: '/two-factor-auth' },
  { path: '/a11y-unknown-page', status: 404 },
];

// The phone width renders the mobile nav, the sticky filter bar and wrapped
// badges, which the desktop layout hides.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

// Both themes, picked through the system setting the theme script follows
// (DOS/Rate#1435).
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    for (const { path, status = 200 } of PAGES) {
      test(`no accessibility violations on ${path} (${viewport.name}, ${theme})`, async ({
        page,
      }) => {
        // color-contrast checks every text node; the home page and the merchant
        // directory render thousands, which takes longer than the 30s default.
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        const res = await page.goto(path);
        expect(res?.status()).toBe(status);
        // Scan the hydrated page: effects add DOM after load.
        await page.waitForLoadState('networkidle');
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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
  }
}
