import { expect, test } from '@playwright/test';

// The site-wide footer talks to shoppers in their language: no route paths,
// raw API links or untranslated labels (DOS/Rate#617).
const LOCALES = [
  { path: '/', lang: 'vi', label: 'Bảng xếp hạng sản phẩm' },
  { path: '/en', lang: 'en', label: 'Product rankings' },
  { path: '/cs', lang: 'cs', label: 'Žebříček produktů' },
];

for (const { path, lang, label } of LOCALES) {
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
    for (const href of ['/leaderboard', '/inspect', '/developers']) {
      await expect(footer.locator(`a[href$="${href}"]`).first()).toBeAttached();
    }
  });
}
