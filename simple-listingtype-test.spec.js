const { test } = require('@playwright/test');

test('simple ListingType test', async ({ page }) => {
  console.log('🔍 Simple ListingType test...');
  
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
  
  // Look for ListingType label and find its associated input
  console.log('🔍 Looking for ListingType field...');
  
  // Try to find ListingType field by looking for the label first
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  
  if (await listingTypeLabel.isVisible()) {
    console.log('✅ Found ListingType label');
    
    // Find the input/combobox associated with this label
    const fieldContainer = listingTypeLabel.locator('xpath=ancestor::*[contains(@class, "field") or contains(@class, "form-group") or contains(@class, "input")]').first();
    const combobox = fieldContainer.locator('[role="combobox"]').first();
    
    if (await combobox.isVisible()) {
      console.log('✅ Found ListingType combobox');
      
      // Click to open dropdown
      await combobox.click();
      await page.waitForTimeout(2000);
      
      // Look for Bank option
      const bankOption = page.locator('text=Bank').first();
      if (await bankOption.isVisible()) {
        console.log('✅ Found Bank option');
        await bankOption.click();
        await page.waitForTimeout(3000);
        
        console.log('✅ Selected Bank');
        
        // Now look for Dynamic Zone button
        const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
        if (await dzButton.isVisible()) {
          console.log('✅ Found Dynamic Zone button');
          await dzButton.click();
          await page.waitForTimeout(2000);
          
          // Check if dialog opened
          const dialog = page.locator('[role="dialog"]').first();
          if (await dialog.isVisible()) {
            console.log('✅ Component picker opened');
            
            // Count components
            const allComponents = await dialog.locator('button').count();
            console.log(`🔍 Total components: ${allComponents}`);
            
            // Check for specific categories
            const hasContact = await dialog.locator('text=contact').count() > 0;
            const hasViolation = await dialog.locator('text=violation').count() > 0;
            
            console.log(`📊 Has contact: ${hasContact}, Has violation: ${hasViolation}`);
            
            if (hasContact && !hasViolation) {
              console.log('✅ SUCCESS: Smart loading working for Bank!');
            } else if (hasViolation) {
              console.log('❌ FAILED: Showing violation components for Bank');
            } else {
              console.log('⚠️ UNCLEAR: Need to check components');
            }
            
            await page.screenshot({ path: 'simple-listingtype-test.png' });
            
          } else {
            console.log('❌ Component picker not opened');
          }
        } else {
          console.log('❌ Dynamic Zone button not found');
        }
      } else {
        console.log('❌ Bank option not found');
      }
    } else {
      console.log('❌ ListingType combobox not found');
    }
  } else {
    console.log('❌ ListingType label not found');
  }
}); 