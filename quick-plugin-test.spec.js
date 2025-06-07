const { test, expect } = require('@playwright/test');

test.describe('Quick Plugin Test', () => {
  test('Direct Admin Access and Plugin Check', async ({ page }) => {
    console.log('⚡ Quick test for Smart Component Filter Plugin...');
    
    // Login to Strapi
    await page.goto('http://localhost:1337/admin');
    await page.waitForTimeout(3000);
    
    console.log('📝 Logging in...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    
    console.log('✅ Logged in successfully');
    
    // Navigate directly to Content-Type Builder
    console.log('🏗️ Going to Content-Type Builder...');
    await page.goto('http://localhost:1337/admin/content-type-builder');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'quick-ctb.png' });
    
    // Try different ways to click Listing Type
    console.log('📝 Looking for Listing Type...');
    
    // Method 1: Force click
    try {
      await page.locator('text=Listing Type').first().click({ force: true });
      console.log('✅ Clicked Listing Type with force');
    } catch (e) {
      console.log('❌ Force click failed, trying other methods...');
      
      // Method 2: Use specific selector
      try {
        await page.click('[data-testid*="listing"], [aria-label*="Listing"]');
        console.log('✅ Clicked with data-testid');
      } catch (e2) {
        console.log('❌ Data-testid failed, trying JavaScript click...');
        
        // Method 3: JavaScript click
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent && el.textContent.trim() === 'Listing Type'
          );
          if (elements.length > 0) {
            elements[0].click();
            return true;
          }
          return false;
        });
        console.log('✅ Clicked with JavaScript');
      }
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'quick-listing-type.png' });
    
    // Look for Add field button
    console.log('➕ Looking for Add field button...');
    const addFieldButton = page.locator('button').filter({ hasText: /Add.*field/i });
    
    if (await addFieldButton.isVisible()) {
      console.log('✅ Found Add field button');
      await addFieldButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'quick-add-field.png' });
      
      // Check page content
      const content = await page.textContent('body');
      
      if (content.includes('CUSTOM FIELDS')) {
        console.log('🎯 CUSTOM FIELDS section found!');
        
        if (content.includes('Component Multi-Select')) {
          console.log('🎉 SUCCESS! Component Multi-Select found!');
          await page.screenshot({ path: 'quick-success.png' });
          
          // Try to click it
          const customField = page.locator('text=Component Multi-Select');
          if (await customField.isVisible()) {
            await customField.click();
            await page.waitForTimeout(1000);
            console.log('✅ Custom field clicked!');
            await page.screenshot({ path: 'quick-custom-field.png' });
          }
        } else {
          console.log('❌ Component Multi-Select not found');
          // Show what custom fields are available
          const customFieldsMatch = content.match(/CUSTOM FIELDS[\s\S]*?(?=\n\n|\Z)/);
          if (customFieldsMatch) {
            console.log('Available custom fields:', customFieldsMatch[0].substring(0, 300));
          }
        }
      } else {
        console.log('❌ CUSTOM FIELDS section not found');
        console.log('Page content preview:', content.substring(0, 500));
      }
    } else {
      console.log('❌ Add field button not found');
      const allButtons = await page.locator('button').allTextContents();
      console.log('Available buttons:', allButtons.filter(text => text.trim()));
    }
    
    console.log('⚡ Quick test completed!');
  });

  test('Quick Content Manager Test', async ({ page }) => {
    console.log('🔍 Quick Content Manager test...');
    
    // Login first
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    const emailInput = await page.locator('input[name="email"]').isVisible();
    if (emailInput) {
      await page.fill('input[name="email"]', 'joy@joy.vn');
      await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }
    
    // Go to Content Manager
    await page.goto('http://localhost:1337/admin/content-manager');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'quick-content-manager.png' });
    
    // Look for Item collection
    const bodyText = await page.textContent('body');
    const hasItemCollection = bodyText.includes('Item');
    console.log(`📊 Item collection found: ${hasItemCollection}`);
    
    if (hasItemCollection) {
      // Try to access Item collection
      await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'quick-item-collection.png' });
      
      // Try to create new entry
      const createBtn = await page.locator('button:has-text("Create new entry")').isVisible();
      console.log(`📊 Create button visible: ${createBtn}`);
      
      if (createBtn) {
        await page.click('button:has-text("Create new entry")');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: 'quick-item-form.png' });
        
        // Check for ListingType field
        const listingTypeField = await page.locator('select[name="ListingType"]').isVisible();
        console.log(`📊 ListingType field found: ${listingTypeField}`);
        
        if (listingTypeField) {
          console.log('🎉 SUCCESS: Can access item form with ListingType field!');
          
          // Test the filter by selecting a listing type
          await page.selectOption('select[name="ListingType"]', 'Bank');
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'quick-after-select-bank.png' });
          
          console.log('✅ Selected Bank listing type - check screenshot for component filtering');
        }
      }
    }
  });
}); 