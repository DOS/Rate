import { expect, test } from '@playwright/test';

// style.scss ends with a template rule that removed every text field's border,
// so fields on light cards were invisible. Fields that do not opt out with a
// border-* utility must keep a visible outline (WCAG 1.4.11, >= 3:1).
const PAGES = [
  '/login',
  '/contact-us',
  '/deals',
  '/smartphones',
  '/merchants',
  '/leaderboard',
  '/compare',
];

function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

for (const path of PAGES) {
  test(`text fields have a visible outline on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // Wait for a laid-out field: some pages attach hidden inputs first and
    // render the visible ones on hydration.
    await expect(
      page
        .locator('input.form-control:visible, textarea.form-control:visible')
        .first()
    ).toBeVisible();
    const fields = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'input.form-control, textarea.form-control'
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => !/\bborder-0\b/.test(el.className))
        .map((el) => {
          const cs = getComputedStyle(el);
          return {
            cls: el.className,
            width: parseFloat(cs.borderTopWidth),
            border: cs.borderTopColor,
            bg: cs.backgroundColor,
          };
        })
    );
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.width, f.cls).toBeGreaterThanOrEqual(1);
      const [hi, lo] = [luminance(f.border), luminance(f.bg)].sort(
        (a, b) => b - a
      );
      expect(
        (hi! + 0.05) / (lo! + 0.05),
        `${f.cls} border vs field`
      ).toBeGreaterThanOrEqual(3);
    }
  });
}
