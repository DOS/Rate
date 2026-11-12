import { expect, test } from '@playwright/test';

// The 404 of an unknown path is in the server HTML, not painted by the
// client over Next's empty `__next_error__` shell (DOS/Rate#1463, #1373).
const PATHS = [
  '/khong-ton-tai-abc',
  '/leaderboard/x',
  '/smartphones/a/b',
  '/foo.png',
  '/ads.txt',
  '/sitemap_index.xml',
];

for (const path of PATHS) {
  test(`${path} is a server-rendered Vietnamese 404`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(404);
    const html = await res.text();
    expect(html).not.toContain('__next_error__');
    expect(html).toMatch(/<html[^>]*\blang="vi"/);
    expect(html).toContain('<title>Không tìm thấy trang | Rate.vn</title>');
    expect(html).toMatch(/<h1[^>]*>Không tìm thấy trang<\/h1>/);
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/smartphones"');
  });
}

test('the 404 needs no JavaScript to show', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  expect((await page.goto('/khong-ton-tai-abc'))?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('h1')).toHaveText('Không tìm thấy trang');
  await expect(page.getByRole('link', { name: 'Quay về trang chủ' })).toHaveAttribute(
    'href',
    '/'
  );
  await expect(
    page.getByRole('navigation', { name: 'Tìm sản phẩm theo danh mục' })
  ).toBeVisible();
  await context.close();
});

test('the 404 is the same with an en cookie', async ({ request }) => {
  const res = await request.get('/khong-ton-tai-abc', {
    headers: { cookie: 'NEXT_LOCALE=en' },
  });
  expect(res.status()).toBe(404);
  const html = await res.text();
  expect(html).toMatch(/<html[^>]*\blang="vi"/);
  expect(html).toMatch(/<h1[^>]*>Không tìm thấy trang<\/h1>/);
});

// Current behaviour, kept on purpose: a missing product, merchant or versus
// page calls notFound() after its data read, and Next serves that as its
// empty error shell, painting [locale]/not-found.tsx on the client only. The
// status and noindex are right. Server HTML for these waits on Next
// (DOS/Rate#1625).
for (const path of [
  '/smartphones/does-not-exist-e2e',
  '/merchants/00000000-0000-4000-8000-000000000000',
  '/compare/no-such-a-vs-no-such-b',
]) {
  test(`${path} is a noindex 404 (shell until DOS/Rate#1625)`, async ({
    request,
  }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(404);
    expect(await res.text()).toMatch(
      /<meta name="robots" content="[^"]*noindex/
    );
  });
}
