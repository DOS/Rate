import { expect, test } from '@playwright/test';

// Product pros & cons block from rate.product_points (DOS/Rate#1624, design
// sections 5.1, 5.3, 7.1): seeded on iphone-16-pro-max-256gb ('ai' + 'code'
// rows) and absent on samsung-galaxy-s25-ultra-256gb (no rows).
const WITH_POINTS = '/smartphones/iphone-16-pro-max-256gb';
const WITHOUT_POINTS = '/smartphones/samsung-galaxy-s25-ultra-256gb';

test('renders overall pros/cons with ai-over-code, 5/3 caps, criterion filter and zero writes', async ({
  page,
}) => {
  const writeOrAiRequests: string[] = [];
  page.on('request', (req) => {
    const method = req.method().toUpperCase();
    const url = req.url().toLowerCase();
    if (
      (method !== 'GET' && method !== 'HEAD') ||
      url.includes('openai') ||
      url.includes('dos.ai')
    ) {
      writeOrAiRequests.push(`${method} ${req.url()}`);
    }
  });

  expect((await page.goto(WITH_POINTS))?.status()).toBe(200);
  const block = page.getByTestId('product-points-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-points-method', 'ai');

  // Overall: capped at 5 pros out of 6 'ai' pros; both 'ai' cons shown; 'code' row excluded.
  await expect(block.getByTestId('product-point-pro')).toHaveCount(5);
  await expect(block.getByTestId('product-point-con')).toHaveCount(2);
  await expect(block).toContainText('Ảnh chụp đêm rõ nét, ít nhiễu');
  await expect(block).toContainText('· 18 người');
  await expect(block).toContainText('Sạc đầy mất gần 90 phút');
  await expect(block).toContainText('· 7 người');
  await expect(block).not.toContainText('Dòng code dự phòng khi chưa có ai');
  await expect(page.getByTestId('product-points-updated')).toHaveText(
    /^Cập nhật ngày 31\/10\/2026 · từ 18 đánh giá$/
  );

  // Filter by battery: caps 4 battery pros to 3 and keeps the stored battery con.
  const batteryBtn = block.locator('button[data-criterion="battery"]');
  await expect(async () => {
    if ((await batteryBtn.getAttribute('aria-pressed')) !== 'true') {
      await batteryBtn.click();
    }
    await expect(batteryBtn).toHaveAttribute('aria-pressed', 'true', {
      timeout: 500,
    });
  }).toPass();
  await expect(block.getByTestId('product-point-pro')).toHaveCount(3);
  await expect(block.getByTestId('product-point-con')).toHaveCount(1);
  await expect(block).not.toContainText('Ảnh chụp đêm rõ nét, ít nhiễu');

  // Filter by camera (pros only): hides the cons column instead of showing "0" or empty state.
  const cameraBtn = block.locator('button[data-criterion="camera"]');
  await cameraBtn.click();
  await expect(cameraBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(block.getByTestId('product-point-pro')).toHaveCount(2);
  await expect(block.getByTestId('product-points-cons')).toHaveCount(0);

  // Clicking the criterion card in the breakdown toggles back to overall.
  await page.getByTestId('jreviews-criterion-camera').click();
  await expect(block.getByTestId('product-point-pro')).toHaveCount(5);
  await expect(block.getByTestId('product-point-con')).toHaveCount(2);

  expect(writeOrAiRequests).toEqual([]);
});

test('is completely absent when the master has no product_points rows', async ({
  page,
}) => {
  expect((await page.goto(WITHOUT_POINTS))?.status()).toBe(200);
  await expect(page.locator('#jreviews-section')).toBeVisible();
  await expect(page.getByTestId('product-points-block')).toHaveCount(0);
});

for (const [locale, expectedHeadings, expectedMeta, expectedMention] of [
  [
    'en',
    ['Pros', 'Cons'],
    /^Updated 31\/10\/2026 · from 18 reviews$/,
    '· 18 people',
  ],
  [
    'cs',
    ['Klady', 'Zápory'],
    /^Aktualizováno 31\.\s*10\.\s*2026 · z 18 recenzí$/,
    '· 18 lidí',
  ],
] as const) {
  test(`localizes pros/cons headings, counts and date line in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto(WITH_POINTS))?.status()).toBe(200);
    const block = page.getByTestId('product-points-block');
    await expect(block).toBeVisible();
    await expect(block.getByRole('heading', { level: 3 })).toHaveText([
      ...expectedHeadings,
    ]);
    await expect(page.getByTestId('product-points-updated')).toHaveText(
      expectedMeta
    );
    await expect(block).toContainText(expectedMention);
  });
}
