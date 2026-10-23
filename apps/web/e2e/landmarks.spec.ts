import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Every page puts its content in one <main id="main-content">, opens with a
// skip link to it, keeps the rest in landmarks and steps its headings down
// one level at a time (DOS/Rate#764). a11y.spec.ts runs the WCAG tags; these
// axe rules are best practices, so they are named here.
const SKIP_LINK_PAGES = [
  '/',
  '/smartphones',
  '/smartphones/iphone-16-pro-max-256gb',
  '/compare',
  '/merchants',
  '/inspect',
  '/faq',
  '/watchlist',
  '/leaderboard',
  '/deals',
];

const LANDMARK_PAGES: { path: string; status?: number }[] = [
  ...SKIP_LINK_PAGES.map((path) => ({ path })),
  { path: '/laptops' },
  {
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  },
  { path: '/merchants/11111111-1111-4111-8111-111111111111' },
  { path: '/developers' },
  { path: '/about-us' },
  { path: '/contact-us' },
  { path: '/privacy-policy' },
  { path: '/login' },
  { path: '/a11y-unknown-page', status: 404 },
];

const RULES = [
  'landmark-one-main',
  'landmark-no-duplicate-main',
  'landmark-main-is-top-level',
  'region',
  'heading-order',
];

// Headings hidden at one width (the catalog filter panel's title on desktop)
// change the order axe sees, so both layouts are checked.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  for (const { path, status = 200 } of LANDMARK_PAGES) {
    test(`one main landmark and ordered headings on ${path} (${viewport.name})`, async ({
      page,
    }) => {
      // The home page and the merchant directory render thousands of nodes.
      test.setTimeout(90_000);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const res = await page.goto(path);
      expect(res?.status()).toBe(status);
      // Scan the hydrated page: effects add DOM after load.
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('main#main-content')).toHaveCount(1);

      const { violations } = await new AxeBuilder({ page })
        .withRules(RULES)
        .analyze();
      const summary = violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 5)
            .map((n) => n.target.join(' '))
            .join(' | ')}`
      );
      expect(summary).toEqual([]);
    });
  }
}

for (const path of SKIP_LINK_PAGES) {
  test(`the skip link is the first stop and focuses main on ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const skip = page.locator('a.rate-skip-link');
    await expect(skip).toHaveAttribute('href', '#main-content');
    await expect(skip).toHaveText('Chuyển đến nội dung chính');

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
    // The next stop is a control inside the content, not the navbar.
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('main')?.id ?? 'outside main'
        )
      )
      .toBe('main-content');
  });
}

test('the skip link speaks the page language', async ({ page }) => {
  await page.goto('/en/faq');
  await expect(page.locator('a.rate-skip-link')).toHaveText(
    'Skip to main content'
  );
  await page.goto('/cs/faq');
  await expect(page.locator('a.rate-skip-link')).toHaveText(
    'Přeskočit na hlavní obsah'
  );
});
