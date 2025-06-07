const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter Plugin Test', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    
    // Login (assuming we have saved credentials)
    try {
      await page.waitForSelector('input[name="email"]', { timeout: 5000 });
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/admin/content-manager/**', { timeout: 10000 });
    } catch (error) {
      console.log('Already logged in or login not needed');
    }
  });

  test('Test Custom Field in Content-Type Builder', async ({ page }) => {
    console.log('🧪 Testing Custom Field in Content-Type Builder...');
    
    // Navigate to Content-Type Builder
    await page.goto('http://localhost:1337/admin/plugins/content-type-builder');
    await page.waitForLoadState('networkidle');
    
    // Look for Listing Type
    await page.waitForSelector('text=Listing Type', { timeout: 10000 });
    await page.click('text=Listing Type');
    
    // Try to add a new field
    await page.waitForSelector('button:has-text("Add another field")', { timeout: 5000 });
    await page.click('button:has-text("Add another field")');
    
    // Look for Component Multi-Select field type
    const customFieldExists = await page.locator('text=Component Multi-Select').isVisible();
    
    if (customFieldExists) {
      console.log('✅ Component Multi-Select field found!');
      await page.click('text=Component Multi-Select');
      
      // Check if we can see the field configuration
      await page.waitForSelector('input[name="name"]', { timeout: 5000 });
      console.log('✅ Custom field configuration loaded');
      
      // Cancel to avoid making changes
      await page.click('button:has-text("Cancel")');
    } else {
      console.log('❌ Component Multi-Select field not found');
      // Take screenshot for debugging
      await page.screenshot({ path: 'debug-custom-field-missing.png' });
    }
  });

  test('Test Enhanced Filter in Content Manager', async ({ page }) => {
    console.log('🧪 Testing Enhanced Filter in Content Manager...');
    
    // Navigate to Items content manager
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
    await page.waitForLoadState('networkidle');
    
    // Try to create a new item
    await page.click('button:has-text("Create new entry")');
    await page.waitForLoadState('networkidle');
    
    // Look for ListingType field
    const listingTypeField = page.locator('select[name="ListingType"]');
    if (await listingTypeField.isVisible()) {
      console.log('✅ ListingType field found');
      
      // Select a listing type
      await listingTypeField.selectOption('Bank');
      await page.waitForTimeout(1000);
      
      // Look for component picker modal or section
      const componentSection = page.locator('[data-testid="component-picker"], .component-picker, [class*="component"]');
      if (await componentSection.isVisible()) {
        console.log('✅ Component section found');
        
        // Check if Enhanced filter is working
        const visibleComponents = await page.locator('.component-item:visible, [data-component]:visible').count();
        console.log(`📊 Visible components: ${visibleComponents}`);
        
        if (visibleComponents > 0 && visibleComponents < 23) {
          console.log('✅ Enhanced filter appears to be working (filtered components)');
        } else if (visibleComponents === 23) {
          console.log('⚠️ All components visible - filter may not be working');
        } else {
          console.log('❓ No components visible - need to investigate');
        }
      } else {
        console.log('❌ Component section not found');
      }
    } else {
      console.log('❌ ListingType field not found');
    }
    
    // Take screenshot for reference
    await page.screenshot({ path: 'debug-enhanced-filter-test.png' });
  });

  test('Compare CSS vs Enhanced Filter', async ({ page }) => {
    console.log('🧪 Comparing CSS vs Enhanced Filter...');
    
    // Navigate to Items content manager
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
    await page.waitForLoadState('networkidle');
    
    // Create new entry
    await page.click('button:has-text("Create new entry")');
    await page.waitForLoadState('networkidle');
    
    // Select ListingType
    const listingTypeField = page.locator('select[name="ListingType"]');
    if (await listingTypeField.isVisible()) {
      await listingTypeField.selectOption('Scammer');
      await page.waitForTimeout(2000);
      
      // Count visible components with different methods
      const cssFilteredCount = await page.locator('.component-item:not([style*="display: none"])').count();
      const enhancedFilteredCount = await page.locator('[data-enhanced-visible="true"]').count();
      const totalComponents = await page.locator('.component-item, [data-component]').count();
      
      console.log(`📊 Total components: ${totalComponents}`);
      console.log(`📊 CSS filtered: ${cssFilteredCount}`);
      console.log(`📊 Enhanced filtered: ${enhancedFilteredCount}`);
      
      if (cssFilteredCount !== totalComponents || enhancedFilteredCount !== totalComponents) {
        console.log('✅ Filtering is working!');
      } else {
        console.log('⚠️ No filtering detected');
      }
    }
    
    await page.screenshot({ path: 'debug-filter-comparison.png' });
  });
}); 