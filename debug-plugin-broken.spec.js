const { test } = require('@playwright/test');

test('debug plugin broken', async ({ page }) => {
  console.log('🔍 Debug plugin not smart loading...');
  
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
  
  // Listen to console logs
  page.on('console', msg => {
    if (msg.text().includes('Plugin Version') || 
        msg.text().includes('Strategy 0') || 
        msg.text().includes('Found ID') || 
        msg.text().includes('Bank') || 
        msg.text().includes('filterComponentPicker')) {
      console.log('🎯 Plugin:', msg.text());
    }
  });
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // Check plugin version
  console.log('🔍 Checking plugin version...');
  const version = await page.locator('div:has-text("Smart Filter v1.0.7")').first();
  if (await version.isVisible()) {
    console.log('✅ Plugin v1.0.7 loaded');
  } else {
    console.log('❌ Plugin version not visible');
  }
  
  // Select Bank
  await page.click('[data-strapi-field-name="ListingType"] button');
  await page.waitForTimeout(1000);
  
  const bank = page.locator('text=Bank').first();
  if (await bank.isVisible()) {
    console.log('✅ Found Bank option');
    await bank.click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Selected Bank - checking Dynamic Zone...');
    
    // Open Dynamic Zone
    const dzButton = page.locator('[data-strapi-field-name="FieldGroup"] button').first();
    if (await dzButton.isVisible()) {
      await dzButton.click();
      await page.waitForTimeout(2000);
      
      // Count components
      const components = await page.locator('div[role="dialog"] button').count();
      console.log('🔍 Components shown:', components);
      
      if (components > 10) {
        console.log('❌ SHOWING ALL COMPONENTS - Plugin not working');
      } else {
        console.log('✅ Components filtered - Plugin working');
      }
      
      // Take screenshot
      await page.screenshot({ path: 'debug-plugin-broken.png' });
    }
  }
}); 