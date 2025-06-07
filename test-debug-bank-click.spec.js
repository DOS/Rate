const { test } = require('@playwright/test');

test('debug Bank click', async ({ page }) => {
  console.log('🔍 Debug Bank click...');
  
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
  
  // Listen to ALL plugin logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Plugin Version') || 
        text.includes('🎯') || 
        text.includes('🔄') || 
        text.includes('DIRECT') ||
        text.includes('PARENT') ||
        text.includes('RELATION') ||
        text.includes('ListingType') ||
        text.includes('Bank') ||
        text.includes('handleListingTypeChange') ||
        text.includes('detectListingTypeId')) {
      console.log('🎯 Plugin:', text);
    }
  });
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  console.log('✅ At item create page');
  
  // Find and click ListingType combobox
  const listingTypeLabel = page.locator('text=ListingType');
  await listingTypeLabel.waitFor({ timeout: 10000 });
  console.log('✅ Found ListingType label');
  
  const parentContainer = listingTypeLabel.locator('..').locator('..');
  const combobox = parentContainer.locator('[role="combobox"]').first();
  await combobox.waitFor({ timeout: 5000 });
  console.log('✅ Found ListingType combobox');
  
  // Click to open dropdown
  await combobox.click();
  console.log('🔍 Clicked ListingType combobox');
  
  // Wait for dropdown to open
  await page.waitForTimeout(1000);
  
  // Find Bank option and inspect it
  const bankOption = page.locator('text=Bank').first();
  await bankOption.waitFor({ timeout: 5000 });
  console.log('✅ Found Bank option');
  
  // Get Bank option details
  const bankText = await bankOption.textContent();
  const bankElement = await bankOption.elementHandle();
  console.log('🔍 Bank option text:', bankText);
  
  if (bankElement) {
    const tagName = await bankElement.evaluate(el => el.tagName);
    const className = await bankElement.evaluate(el => el.className);
    const attributes = await bankElement.evaluate(el => {
      const attrs = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });
    console.log('🔍 Bank element details:', { tagName, className, attributes });
  }
  
  // Click Bank option
  console.log('🔍 Clicking Bank option...');
  await bankOption.click();
  
  // Wait for plugin processing
  await page.waitForTimeout(2000);
  console.log('✅ Bank click completed');
  
  // Check if plugin detected the click
  console.log('✅ Test completed - check logs for plugin detection');
}); 