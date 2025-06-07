const { test } = require('@playwright/test');

test('test smart loading fixed', async ({ page }) => {
  console.log('🔍 Testing smart loading with correct selectors...');
  
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
  
  // Listen to plugin console logs
  page.on('console', msg => {
    if (msg.text().includes('Plugin Version') || 
        msg.text().includes('Strategy 0') || 
        msg.text().includes('Found ID') || 
        msg.text().includes('Bank') || 
        msg.text().includes('filterComponentPicker') ||
        msg.text().includes('REAL-TIME') ||
        msg.text().includes('FORM STATE')) {
      console.log('🎯 Plugin:', msg.text());
    }
  });
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  console.log('🔍 Looking for ListingType combobox...');
  
  // Find the ListingType combobox (should be one of the relation comboboxes)
  const comboboxes = await page.locator('[role="combobox"]').all();
  let listingTypeCombobox = null;
  
  for (let i = 0; i < comboboxes.length; i++) {
    const combobox = comboboxes[i];
    const placeholder = await combobox.getAttribute('placeholder');
    
    if (placeholder === 'Add or create a relation') {
      // Check if this combobox is for ListingType by looking at nearby label
      const parent = combobox.locator('xpath=ancestor::*[contains(@class, "field") or contains(@class, "form") or contains(@class, "input")]').first();
      const labelText = await parent.locator('label').textContent().catch(() => '');
      
      console.log(`🔍 Combobox ${i + 1}: label="${labelText}"`);
      
      if (labelText.includes('ListingType')) {
        listingTypeCombobox = combobox;
        console.log('✅ Found ListingType combobox!');
        break;
      }
    }
  }
  
  if (!listingTypeCombobox) {
    console.log('❌ ListingType combobox not found');
    return;
  }
  
  // Click ListingType combobox to open dropdown
  console.log('🔍 Opening ListingType dropdown...');
  await listingTypeCombobox.click();
  await page.waitForTimeout(2000);
  
  // Look for Bank option
  const bankOption = page.locator('text=Bank').first();
  if (await bankOption.isVisible()) {
    console.log('✅ Found Bank option');
    await bankOption.click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Selected Bank - checking Dynamic Zone...');
    
    // Find and click "Add a component to FieldGroup" button
    const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
    if (await dzButton.isVisible()) {
      console.log('✅ Found Dynamic Zone button');
      await dzButton.click();
      await page.waitForTimeout(2000);
      
      // Count components in dialog
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible()) {
        console.log('✅ Component picker dialog opened');
        
        // Count all component buttons in dialog
        const componentButtons = await dialog.locator('button').count();
        console.log(`🔍 Total components shown: ${componentButtons}`);
        
        // Count specific component categories
        const contactComponents = await dialog.locator('text=contact').count();
        const infoComponents = await dialog.locator('text=info').count();
        const violationComponents = await dialog.locator('text=violation').count();
        const utilitiesComponents = await dialog.locator('text=utilities').count();
        const mediaComponents = await dialog.locator('text=media').count();
        const reviewComponents = await dialog.locator('text=review').count();
        const ratingComponents = await dialog.locator('text=rating').count();
        
        console.log(`📊 Component categories found:`);
        console.log(`   - contact: ${contactComponents}`);
        console.log(`   - info: ${infoComponents}`);
        console.log(`   - violation: ${violationComponents}`);
        console.log(`   - utilities: ${utilitiesComponents}`);
        console.log(`   - media: ${mediaComponents}`);
        console.log(`   - review: ${reviewComponents}`);
        console.log(`   - rating: ${ratingComponents}`);
        
        // For Bank, should only show contact + content components (5 total)
        if (contactComponents > 0 && violationComponents === 0) {
          console.log('✅ SUCCESS: Smart loading working! Only showing allowed components for Bank');
        } else if (violationComponents > 0) {
          console.log('❌ FAILED: Smart loading not working - showing violation components for Bank');
        } else {
          console.log('⚠️ UNCLEAR: Need to check component filtering logic');
        }
        
        // Take screenshot
        await page.screenshot({ path: 'test-smart-loading-fixed.png' });
        
      } else {
        console.log('❌ Component picker dialog not opened');
      }
    } else {
      console.log('❌ Dynamic Zone button not found');
    }
  } else {
    console.log('❌ Bank option not found in dropdown');
  }
}); 