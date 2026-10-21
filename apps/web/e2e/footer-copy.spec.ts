import { expect, test } from '@playwright/test';

// The site-wide footer talks to shoppers in their language: no route paths,
// raw API links or untranslated labels (DOS/Rate#617).
const LOCALES = [
  {
    path: '/',
    lang: 'vi',
    label: 'Bảng xếp hạng sản phẩm',
    icons: [
      'Mã nguồn trên GitHub',
      'API cho nhà phát triển',
      'Độ tin cậy gian hàng',
    ],
  },
  {
    path: '/en',
    lang: 'en',
    label: 'Product rankings',
    icons: ['Source code on GitHub', 'Developer API', 'Shop trust scores'],
  },
  {
    path: '/cs',
    lang: 'cs',
    label: 'Žebříček produktů',
    icons: [
      'Zdrojový kód na GitHubu',
      'API pro vývojáře',
      'Důvěryhodnost obchodů',
    ],
  },
];

for (const { path, lang, label, icons } of LOCALES) {
  test(`footer on ${path} has no route paths or API jargon`, async ({
    page,
  }) => {
    await page.goto(path);
    // /en and /cs redirect to / with a locale cookie; make sure it took.
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(label);
    const text = await footer.innerText();
    for (const term of [
      '(/',
      '/api/',
      'JSON Endpoint',
      'Dual Risk Score',
      'REST v1',
      // An untranslated key renders as its path.
      'rate.footer.',
    ]) {
      expect(text).not.toContain(term);
    }
    await expect(footer.locator('a[href*="/api/"]')).toHaveCount(0);
    // The call-to-action band above the footer shares the same voice.
    const cta = (
      await page.locator('.rate-footer-cta').first().innerText()
    ).toLowerCase();
    for (const term of ['seeding', 'kiểm định', 'audit']) {
      expect(cta).not.toContain(term);
    }
    // Icon-only links are named in the page's language (DOS/Rate#619).
    const iconLinks = footer.locator('a.social-link');
    await expect(iconLinks).toHaveCount(icons.length);
    for (const [i, name] of icons.entries()) {
      await expect(iconLinks.nth(i)).toHaveAccessibleName(name);
    }
    for (const href of ['/leaderboard', '/inspect', '/developers']) {
      await expect(footer.locator(`a[href$="${href}"]`).first()).toBeAttached();
    }
  });
}
