import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Light and dark theme (DOS/Rate#1435): the page follows the system until the
// visitor picks a theme in the toggle; the choice is kept, and it is on
// <html> before the body is parsed, so the first paint already has it.
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';

// Records the first data-bs-theme value <html> gets and whether <body>
// existed at that moment. Init scripts run before the page's own scripts.
async function watchFirstTheme(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __firstTheme?: { theme: string | null; bodyParsed: boolean };
    };
    new MutationObserver((_, observer) => {
      const theme = document.documentElement.getAttribute('data-bs-theme');
      if (theme && !w.__firstTheme) {
        w.__firstTheme = { theme, bodyParsed: document.body !== null };
        observer.disconnect();
      }
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme'],
    });
  });
}

const firstTheme = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __firstTheme?: { theme: string | null; bodyParsed: boolean };
        }
      ).__firstTheme
  );

for (const colorScheme of ['light', 'dark'] as const) {
  test(`with no choice the page follows a ${colorScheme} system, before the body`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await watchFirstTheme(page);
    await page.goto('/');
    expect(await firstTheme(page)).toEqual({
      theme: colorScheme,
      bodyParsed: false,
    });
    await expect(page.locator('html')).toHaveAttribute(
      'data-bs-theme',
      colorScheme
    );
  });
}

test('the toggle choice is kept and applied before the body on the next page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(PRODUCT);
  const toggle = page.getByTestId('theme-toggle').first();
  await toggle.locator('[data-theme-choice="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect(toggle.locator('[data-theme-choice="dark"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const darkBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );

  // The next page load: dark although the system is light, set before the
  // body is parsed (no flash of the light theme), and the same canvas.
  await watchFirstTheme(page);
  await page.goto('/');
  expect(await firstTheme(page)).toEqual({ theme: 'dark', bodyParsed: false });
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ).toBe(darkBg);

  // Back to the system: the choice is dropped and light follows.
  await page
    .getByTestId('theme-toggle')
    .first()
    .locator('[data-theme-choice="system"]')
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  expect(
    await page.evaluate(() => localStorage.getItem('rate-theme'))
  ).toBeNull();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');
});

test('the phone menu offers the three themes by name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.nav-toggle').click();
  const toggle = page.locator('#rate-nav-menu').getByTestId('theme-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole('button')).toHaveText([
    'Sáng',
    'Tối',
    'Theo hệ thống',
  ]);
  await toggle.getByRole('button', { name: 'Tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
});

// The theme script runs on cached pages, which carry no nonce, so the CSP
// allows it by hash: the hash in the policy must be the script's own.
test('the theme script is allowed by its CSP hash', async ({ request }) => {
  const res = await request.get('/');
  const policy = res.headers()['content-security-policy-report-only'] ?? '';
  const html = await res.text();
  const script = html.match(
    /<head>(?:<[^>]+>)*?<script>([^<]+)<\/script>/
  )?.[1];
  expect(script).toContain('data-bs-theme');
  const hash = createHash('sha256').update(script!).digest('base64');
  expect(policy).toContain(`'sha256-${hash}'`);
});
