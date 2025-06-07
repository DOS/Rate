const { test } = require('@playwright/test'); 

test('test seller ui', async ({ page }) => { 
  page.setDefaultTimeout(60000);
  
  await page.goto('http://localhost:1337/admin/auth/login'); 
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[name="email"]', 'admin@ratebox.vn'); 
  await page.fill('input[name="password"]', 'Abc@123456'); 
  await page.click('button[type="submit"]'); 
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (error) {
    if (page.url().includes('/admin')) {
      console.log('✅ At admin page');
    } else {
      throw error;
    }
  } 
  
  console.log('✅ Login successful, going to create page...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en'); 
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); 
  
  // Check plugin version
  const version = await page.locator('div:has-text("Smart Filter v1.0.6")').first();
  if (await version.isVisible()) {
    console.log('✅ Plugin v1.0.6 loaded');
  } else {
    console.log('❌ Plugin version not found');
  }
  
  await page.click('[data-strapi-field-name="ListingType"] button'); 
  await page.waitForTimeout(1000); 
  
  const seller = page.locator('text=Seller').first(); 
  if (await seller.isVisible()) { 
    console.log('✅ Found Seller option');
    await seller.click(); 
    await page.waitForTimeout(3000); 
    
    console.log('Selected Seller, checking Dynamic Zone...'); 
    const dzButton = page.locator('[data-strapi-field-name="FieldGroup"] button').first(); 
    if (await dzButton.isVisible()) { 
      await dzButton.click(); 
      await page.waitForTimeout(2000); 
      
      const components = await page.locator('div[role="dialog"] button').count(); 
      console.log('Components shown:', components); 
      
      if (components > 20) {
        console.log('❌ SHOWING ALL COMPONENTS - Plugin not working');
      } else {
        console.log('✅ Components filtered - Plugin working');
      }
    } else {
      console.log('❌ Dynamic Zone button not found');
    }
  } else {
    console.log('❌ Seller option not found');
  }
});
