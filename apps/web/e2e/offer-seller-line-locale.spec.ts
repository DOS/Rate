import { expect, test } from '@playwright/test';

// The product page's seller line read "Trust: x%" and "DOSafe: x/100" in
// English on every locale (DOS/Rate#1269).
const PRODUCT = '/smartphones/e2e-bait-price-phone';

const CASES = [
  { prefix: '', trust: 'Độ tin cậy:', scam: 'Rủi ro lừa đảo:' },
  { prefix: '/en', trust: 'Trust:', scam: 'Scam risk:' },
  { prefix: '/cs', trust: 'Důvěryhodnost:', scam: 'Riziko podvodu:' },
];

for (const { prefix, trust, scam } of CASES) {
  test(`the seller line is localized on ${prefix || '/'}`, async ({ page }) => {
    expect((await page.goto(`${prefix}${PRODUCT}`))?.status()).toBe(200);
    const firstRow = page.locator('#offers-table tbody tr').first();
    await expect(firstRow).toContainText(trust);
    await expect(firstRow).toContainText(scam);
    await expect(firstRow).not.toContainText('DOSafe:');
    if (prefix !== '/en') {
      await expect(firstRow).not.toContainText('Trust:');
    }
  });
}
