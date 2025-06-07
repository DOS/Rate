const { test } = require('@playwright/test');

test('find component picker', async ({ page }) => {
  console.log('🔍 Find component picker...');
  
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
  
  // Listen to plugin logs
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
  
  // Select Bank in ListingType
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  const parentContainer = listingTypeLabel.locator('xpath=..').first();
  const combobox = parentContainer.locator('[role="combobox"]').first();
  
  await combobox.click();
  await page.waitForTimeout(2000);
  
  const bankOption = page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(3000);
  console.log('✅ Bank selected');
  
  // Click Dynamic Zone button
  const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
  await dzButton.click();
  await page.waitForTimeout(3000);
  console.log('✅ Dynamic Zone button clicked');
  
  // Look for component picker in different ways
  console.log('🔍 Looking for component picker...');
  
  // Method 1: Look for text "Pick one component"
  const pickText = page.locator('text=Pick one component').first();
  if (await pickText.isVisible()) {
    console.log('✅ Found "Pick one component" text');
    
    // Find the container with component options
    const pickerContainer = pickText.locator('xpath=ancestor::*[contains(@class, "modal") or contains(@class, "dialog") or contains(@class, "picker")]').first();
    
    if (await pickerContainer.isVisible()) {
      console.log('✅ Found picker container');
      
      // Count components
      const componentButtons = await pickerContainer.locator('button').count();
      console.log(`🔍 Total component buttons: ${componentButtons}`);
      
      // Look for specific component categories
      const contactCount = await pickerContainer.locator('text=contact').count();
      const violationCount = await pickerContainer.locator('text=violation').count();
      const infoCount = await pickerContainer.locator('text=info').count();
      const utilitiesCount = await pickerContainer.locator('text=utilities').count();
      const mediaCount = await pickerContainer.locator('text=media').count();
      const reviewCount = await pickerContainer.locator('text=review').count();
      const ratingCount = await pickerContainer.locator('text=rating').count();
      
      console.log(`📊 Component categories found:`);
      console.log(`   - contact: ${contactCount}`);
      console.log(`   - violation: ${violationCount}`);
      console.log(`   - info: ${infoCount}`);
      console.log(`   - utilities: ${utilitiesCount}`);
      console.log(`   - media: ${mediaCount}`);
      console.log(`   - review: ${reviewCount}`);
      console.log(`   - rating: ${ratingCount}`);
      
      // Test smart loading
      if (contactCount > 0 && violationCount === 0) {
        console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
      } else if (violationCount > 0) {
        console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
      } else {
        console.log('⚠️ UNCLEAR: Need to check component filtering');
      }
      
      await page.screenshot({ path: 'find-component-picker.png' });
      
    } else {
      console.log('❌ Picker container not found');
    }
  } else {
    console.log('❌ "Pick one component" text not found');
    
    // Method 2: Look for any visible component categories directly
    console.log('🔍 Method 2: Looking for component categories directly...');
    
    const contactElements = await page.locator('text=contact').count();
    const violationElements = await page.locator('text=violation').count();
    
    console.log(`📊 Direct search: contact=${contactElements}, violation=${violationElements}`);
    
    if (contactElements > 0 || violationElements > 0) {
      console.log('✅ Found component categories on page');
      
      // Find the parent container of these elements
      const contactElement = page.locator('text=contact').first();
      if (await contactElement.isVisible()) {
        const container = contactElement.locator('xpath=ancestor::*[position()=5]').first();
        
        // Count all components in this container
        const allButtons = await container.locator('button').count();
        console.log(`🔍 Total buttons in container: ${allButtons}`);
        
        // Test smart loading
        if (contactElements > 0 && violationElements === 0) {
          console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
        } else if (violationElements > 0) {
          console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
        }
        
        await page.screenshot({ path: 'find-component-picker-method2.png' });
      }
    } else {
      console.log('❌ No component categories found');
    }
  }
}); 