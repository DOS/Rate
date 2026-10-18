import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.1 A/AA checks with axe on the main public pages (seeded in
// apps/web/e2e/seed.sql): every rule must pass, color-contrast included
// (DOS/Rate#362).
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

// color-contrast walks every text node; the seeded directory (1100+ merchants)
// makes / and /merchants large, so allow more than the 30s default.
test.describe.configure({ timeout: 120_000 });

for (const path of PAGES) {
  test(`no accessibility violations on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // Scan the hydrated page: effects add DOM after load.
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
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

// axe reports text on a gradient as "incomplete", not as a violation, so the
// dark heroes (.rate-hero-dark, inline gradients) need their own check: every
// coloured-text utility inside them must stay readable on the lightest
// gradient stop.
const DARK_HERO_PAGES = [
  '/',
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  '/merchants',
  '/leaderboard',
];

for (const path of DARK_HERO_PAGES) {
  test(`dark hero text keeps WCAG AA contrast on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    const heroes = page.locator('.rate-hero-dark');
    expect(await heroes.count()).toBeGreaterThan(0);
    const failures = await heroes.evaluateAll((sections) => {
      const parse = (c: string) =>
        (c.match(/rgba?\(([^)]+)\)/g) ?? []).map((m) =>
          m
            .replace(/rgba?\(|\)/g, '')
            .split(/[,\s/]+/)
            .filter(Boolean)
            .map(Number)
        );
      const lum = ([r = 0, g = 0, b = 0]: number[]) => {
        const ch = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      };
      const out: string[] = [];
      for (const section of sections) {
        const style = getComputedStyle(section);
        // Opaque gradient stops only; translucent overlays sit on top of them.
        const stops = parse(style.backgroundImage + ' ' + style.backgroundColor)
          .filter((c) => c.length === 3 || c[3] === 1)
          .map(lum);
        if (stops.length === 0) {
          out.push(`${section.className}: no opaque background colour`);
          continue;
        }
        const bg = Math.max(...stops);
        const texts = section.querySelectorAll<HTMLElement>(
          '[class*="text-muted"], [class*="text-secondary"], [class*="text-success"], [class*="text-danger"], [class*="text-info"], [class*="text-warning"], [class*="text-primary"]'
        );
        for (const el of texts) {
          if (
            !el.textContent?.trim() ||
            el.closest('.bg-white, .bg-light, .card')
          )
            continue;
          const s = getComputedStyle(el);
          const fg = parse(s.color)[0] ?? [0, 0, 0];
          const ratio =
            (Math.max(lum(fg), bg) + 0.05) / (Math.min(lum(fg), bg) + 0.05);
          const size = parseFloat(s.fontSize);
          const large =
            size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) {
            out.push(
              `${el.className} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`
            );
          }
        }
      }
      return out;
    });
    expect(failures).toEqual([]);
  });
}
