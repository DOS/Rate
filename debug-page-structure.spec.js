const { test } = require('@playwright/test');

test('debug page structure', async ({ page }) => {
  console.log('🔍 Debug page structure...');
  
  // Login
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (e) {
    if (page.url().includes('/admin')) console.log('✅ At admin page');
  }
  console.log('✅ Login successful');
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Take screenshot
  await page.screenshot({ path: 'debug-page-structure.png' });
  
  // Find all elements that might be ListingType
  console.log('🔍 Looking for ListingType elements...');
  
  // Try different selectors
  const selectors = [
    '[data-strapi-field-name="ListingType"]',
    'input[name="ListingType"]',
    'button:has-text("ListingType")',
    'label:has-text("ListingType")',
    '*:has-text("ListingType")'
  ];
  
  for (const selector of selectors) {
    try {
      const elements = await page.locator(selector).count();
      console.log(`🔍 Selector "${selector}": ${elements} elements found`);
      
      if (elements > 0) {
        const first = page.locator(selector).first();
        const text = await first.textContent();
        console.log(`   First element text: "${text}"`);
      }
    } catch (e) {
      console.log(`❌ Selector "${selector}" failed:`, e.message);
    }
  }
  
  // Look for all buttons
  const buttons = await page.locator('button').count();
  console.log(`🔍 Total buttons found: ${buttons}`);
  
  // Look for relation fields
  const relations = await page.locator('input[type="text"]').count();
  console.log(`🔍 Total text inputs found: ${relations}`);
}); 