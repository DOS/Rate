const { test, expect } = require('@playwright/test');

test.describe('Strapi Login and Plugin Test', () => {
  test('Login to Strapi and Check Plugin', async ({ page }) => {
    console.log('🔐 Testing Strapi login with correct credentials...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of login page
    await page.screenshot({ path: 'debug-login-page.png' });
    
    // Login with correct credentials
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to admin dashboard
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'debug-admin-dashboard.png' });
    
    console.log(`📍 Current URL after login: ${page.url()}`);
    
    // Check if we're successfully logged in
    const isLoggedIn = page.url().includes('/admin') && !page.url().includes('/login');
    console.log(`✅ Successfully logged in: ${isLoggedIn}`);
    
    if (isLoggedIn) {
      // Look for main navigation
      const contentManager = await page.locator('text=Content Manager').isVisible();
      const contentTypeBuilder = await page.locator('text=Content-Type Builder').isVisible();
      
      console.log(`📊 Content Manager visible: ${contentManager}`);
      console.log(`📊 Content-Type Builder visible: ${contentTypeBuilder}`);
      
      // Try to access Content-Type Builder
      if (contentTypeBuilder) {
        await page.click('text=Content-Type Builder');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: 'debug-content-type-builder-page.png' });
        
        // Look for Listing Type
        const listingType = await page.locator('text=Listing Type').isVisible();
        console.log(`📊 Listing Type found: ${listingType}`);
        
        if (listingType) {
          // Click on Listing Type to see its fields
          await page.click('text=Listing Type');
          await page.waitForLoadState('networkidle');
          await page.screenshot({ path: 'debug-listing-type-fields.png' });
          
          // Try to add a new field
          const addFieldButton = await page.locator('button:has-text("Add another field")').isVisible();
          console.log(`📊 Add field button visible: ${addFieldButton}`);
          
          if (addFieldButton) {
            await page.click('button:has-text("Add another field")');
            await page.waitForLoadState('networkidle');
            await page.screenshot({ path: 'debug-field-types.png' });
            
            // Look for our custom field type
            const customField = await page.locator('text=Component Multi-Select').isVisible();
            console.log(`📊 Component Multi-Select field found: ${customField}`);
            
            if (customField) {
              console.log('🎉 SUCCESS: Custom field is registered!');
            } else {
              console.log('❌ Custom field not found in field types');
            }
          }
        }
      }
    }
  });

  test('Test Content Manager Access', async ({ page }) => {
    console.log('🔍 Testing Content Manager access...');
    
    // Login first
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Navigate to Content Manager
    const contentManager = await page.locator('text=Content Manager').isVisible();
    if (contentManager) {
      await page.click('text=Content Manager');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'debug-content-manager.png' });
      
      // Look for Item collection type
      const itemCollection = await page.locator('text=Item').isVisible();
      console.log(`📊 Item collection found: ${itemCollection}`);
      
      if (itemCollection) {
        await page.click('text=Item');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: 'debug-item-list.png' });
        
        // Try to create new entry
        const createButton = await page.locator('button:has-text("Create new entry")').isVisible();
        console.log(`📊 Create new entry button found: ${createButton}`);
        
        if (createButton) {
          await page.click('button:has-text("Create new entry")');
          await page.waitForLoadState('networkidle');
          await page.screenshot({ path: 'debug-item-create-form.png' });
          
          // Look for ListingType field
          const listingTypeField = await page.locator('select[name="ListingType"]').isVisible();
          console.log(`📊 ListingType field found: ${listingTypeField}`);
          
          if (listingTypeField) {
            console.log('🎉 SUCCESS: Can access item creation form with ListingType field!');
          }
        }
      }
    }
  });
}); 