import { expect, test } from '@playwright/test';

// The site-wide footer talks to shoppers in their language: no route paths,
// raw API links or untranslated labels (DOS/Rate#617).
for (const path of ['/', '/en', '/cs']) {
  test(`footer on ${path} has no route paths or API jargon`, async ({
    page,
  }) => {
    await page.goto(path);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    const text = await footer.innerText();
    for (const term of [
      '(/',
      '/api/',
      'JSON Endpoint',
      'Dual Risk Score',
      'REST v1',
    ]) {
      expect(text).not.toContain(term);
    }
    await expect(footer.locator('a[href*="/api/"]')).toHaveCount(0);
    for (const href of ['/leaderboard', '/inspect', '/developers']) {
      await expect(footer.locator(`a[href$="${href}"]`).first()).toBeAttached();
    }
  });
}
