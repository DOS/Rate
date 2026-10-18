import { expect, test } from '@playwright/test';

// axe reports text drawn on a CSS gradient as "incomplete", not as a
// violation, so a11y.spec.ts cannot catch a bad colour inside the dark
// gradient surfaces (DOS/Rate#428). Measure every coloured-text utility in
// them against the lightest opaque stop of its nearest dark surface:
// 4.5:1, or 3:1 for large text (WCAG 2.1 1.4.3).
const DARK_SURFACES =
  '.rate-ink-on-dark, .rate-surface-dark, .rate-scoreboard-dark';

const PAGES = [
  '/',
  '/smartphones',
  '/smartphones/iphone-16-pro-max-256gb',
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  '/merchants',
  '/leaderboard',
  '/deals',
];

// Pages whose dark surfaces hold coloured text today; the check must find
// some there, or it is passing without measuring anything.
const MUST_MEASURE = new Set([
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  '/leaderboard',
]);

for (const path of PAGES) {
  test(`text in dark gradient surfaces meets WCAG AA on ${path}`, async ({
    page,
  }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    const surfaces = page.locator(DARK_SURFACES);
    expect(
      await surfaces.count(),
      'page has a dark surface to check'
    ).toBeGreaterThan(0);

    const { checked, failures } = await page.evaluate((selector) => {
      const parse = (css: string) =>
        (css.match(/rgba?\([^)]+\)/g) ?? []).map((m) =>
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
      let count = 0;
      for (const surface of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(surface);
        // Opaque stops only. Translucent glows on top can lighten the ground
        // a little, so this is close to, not strictly, the worst case.
        const stops = parse(`${style.backgroundImage} ${style.backgroundColor}`)
          .filter((c) => c.length === 3 || c[3] === 1)
          .map(lum);
        if (stops.length === 0) {
          out.push(
            `${surface.className}: no opaque background colour to measure`
          );
          continue;
        }
        const bg = Math.max(...stops);
        const texts = surface.querySelectorAll<HTMLElement>(
          '[class*="text-muted"], [class*="text-secondary"], [class*="text-success"], [class*="text-danger"], [class*="text-info"], [class*="text-warning"], [class*="text-primary"]'
        );
        for (const el of texts) {
          // Measured against its own nearest dark surface, once.
          if (el.closest(selector) !== surface) continue;
          // Solid light islands inside the surface switch back to the dark
          // inks (_custom.scss); they are light backgrounds, not this one.
          const island = el.closest(
            '.bg-white, .bg-light, .card, .dropdown-menu'
          );
          if (
            island &&
            island !== surface &&
            surface.contains(island) &&
            (island.matches(
              ':is(.bg-white, .bg-light):not([class*="bg-opacity"])'
            ) ||
              (surface.matches('.rate-ink-on-dark') &&
                island.matches(
                  ':is(.card, .dropdown-menu):not(.bg-dark, .text-bg-dark)'
                )))
          ) {
            continue;
          }
          const text = el.textContent?.trim();
          if (!text || el.getClientRects().length === 0) continue;
          const s = getComputedStyle(el);
          const fg = parse(s.color)[0];
          if (!fg) {
            out.push(
              `${el.className} "${text.slice(0, 30)}": cannot parse colour ${s.color}`
            );
            continue;
          }
          const ratio =
            (Math.max(lum(fg), bg) + 0.05) / (Math.min(lum(fg), bg) + 0.05);
          const size = parseFloat(s.fontSize);
          const large =
            size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
          count += 1;
          if (ratio < (large ? 3 : 4.5)) {
            out.push(
              `${el.className} "${text.slice(0, 30)}" ${ratio.toFixed(2)}:1`
            );
          }
        }
      }
      return { checked: count, failures: out };
    }, DARK_SURFACES);

    expect(failures).toEqual([]);
    if (MUST_MEASURE.has(path)) expect(checked).toBeGreaterThan(0);
  });
}
