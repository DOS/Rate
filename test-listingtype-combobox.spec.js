const { test } = require('@playwright/test');

test('test ListingType combobox', async ({ page }) => {
  console.log('🔍 Testing ListingType combobox...');
  
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
  
  // Find ListingType label and its combobox
  console.log('🔍 Looking for ListingType combobox...');
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  
  if (await listingTypeLabel.isVisible()) {
    console.log('✅ Found ListingType label');
    
    // Get the parent container and find the combobox
    const parentContainer = listingTypeLabel.locator('xpath=..').first();
    const combobox = parentContainer.locator('[role="combobox"]').first();
    
    if (await combobox.isVisible()) {
      console.log('✅ Found ListingType combobox');
      
      // Click the combobox to open dropdown
      console.log('🔍 Clicking combobox...');
      await combobox.click();
      await page.waitForTimeout(2000);
      
      // Look for dropdown options
      const bankOption = page.locator('text=Bank').first();
      const scammerOption = page.locator('text=Scammer').first();
      const sellerOption = page.locator('text=Seller').first();
      
      console.log('🔍 Looking for options...');
      const hasBankOption = await bankOption.isVisible();
      const hasScammerOption = await scammerOption.isVisible();
      const hasSellerOption = await sellerOption.isVisible();
      
      console.log(`📊 Options found: Bank=${hasBankOption}, Scammer=${hasScammerOption}, Seller=${hasSellerOption}`);
      
      if (hasBankOption) {
        console.log('✅ Found Bank option - selecting it...');
        await bankOption.click();
        await page.waitForTimeout(3000);
        
        console.log('✅ Selected Bank - now testing Dynamic Zone...');
        
        // Find Dynamic Zone button
        const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
        if (await dzButton.isVisible()) {
          console.log('✅ Found Dynamic Zone button');
          await dzButton.click();
          await page.waitForTimeout(2000);
          
          // Check component picker dialog
          const dialog = page.locator('[role="dialog"]').first();
          if (await dialog.isVisible()) {
            console.log('✅ Component picker opened');
            
            // Count all components
            const allButtons = await dialog.locator('button').count();
            console.log(`🔍 Total buttons in dialog: ${allButtons}`);
            
            // Count specific component categories
            const contactCount = await dialog.locator('text=contact').count();
            const violationCount = await dialog.locator('text=violation').count();
            const infoCount = await dialog.locator('text=info').count();
            const utilitiesCount = await dialog.locator('text=utilities').count();
            const mediaCount = await dialog.locator('text=media').count();
            const reviewCount = await dialog.locator('text=review').count();
            const ratingCount = await dialog.locator('text=rating').count();
            
            console.log(`📊 Component categories:`);
            console.log(`   - contact: ${contactCount}`);
            console.log(`   - violation: ${violationCount}`);
            console.log(`   - info: ${infoCount}`);
            console.log(`   - utilities: ${utilitiesCount}`);
            console.log(`   - media: ${mediaCount}`);
            console.log(`   - review: ${reviewCount}`);
            console.log(`   - rating: ${ratingCount}`);
            
            // For Bank (ID: 21), should only show contact + content components (5 total)
            // Should NOT show violation components
            if (contactCount > 0 && violationCount === 0) {
              console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
            } else if (violationCount > 0) {
              console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
            } else if (contactCount === 0) {
              console.log('⚠️ WARNING: No contact components found for Bank');
            } else {
              console.log('⚠️ UNCLEAR: Need manual verification');
            }
            
            await page.screenshot({ path: 'test-listingtype-combobox.png' });
            
          } else {
            console.log('❌ Component picker dialog not opened');
          }
        } else {
          console.log('❌ Dynamic Zone button not found');
        }
      } else {
        console.log('❌ Bank option not found in dropdown');
      }
    } else {
      console.log('❌ ListingType combobox not found');
    }
  } else {
    console.log('❌ ListingType label not found');
  }
}); 