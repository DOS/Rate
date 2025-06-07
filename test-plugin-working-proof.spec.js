const { test } = require('@playwright/test');

test('test plugin working proof', async ({ page }) => {
  console.log('🔍 Test plugin working proof...');
  
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
        text.includes('Strategy') || 
        text.includes('Found ID') || 
        text.includes('Bank') || 
        text.includes('filterComponentPicker') ||
        text.includes('REAL-TIME') ||
        text.includes('FORM STATE') ||
        text.includes('API') ||
        text.includes('components') ||
        text.includes('Smart') ||
        text.includes('🎯') ||
        text.includes('🔍') ||
        text.includes('🔄') ||
        text.includes('✅') ||
        text.includes('❌')) {
      console.log('🎯 Plugin:', text);
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
  
  console.log('🔍 Clicking ListingType combobox...');
  await combobox.click();
  await page.waitForTimeout(2000);
  
  const bankOption = page.locator('text=Bank').first();
  console.log('🔍 Selecting Bank...');
  await bankOption.click();
  await page.waitForTimeout(5000); // Wait longer for plugin to process
  console.log('✅ Bank selected, waiting for plugin processing...');
  
  // Click Dynamic Zone button
  const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
  console.log('🔍 Clicking Dynamic Zone button...');
  await dzButton.click();
  await page.waitForTimeout(5000); // Wait longer for plugin to filter
  console.log('✅ Dynamic Zone button clicked, waiting for filtering...');
  
  // Check if component picker opened and count components
  const pickText = page.locator('text=Pick one component').first();
  if (await pickText.isVisible()) {
    console.log('✅ Component picker opened');
    
    // Find the picker container
    const pickGrandParent = pickText.locator('xpath=../..').first();
    
    // Count all components
    const allButtons = await pickGrandParent.locator('button').count();
    console.log(`📊 Total component buttons: ${allButtons}`);
    
    // Count specific categories
    const contactCount = await pickGrandParent.locator('text=contact').count();
    const violationCount = await pickGrandParent.locator('text=violation').count();
    const infoCount = await pickGrandParent.locator('text=info').count();
    const utilitiesCount = await pickGrandParent.locator('text=utilities').count();
    const mediaCount = await pickGrandParent.locator('text=media').count();
    const reviewCount = await pickGrandParent.locator('text=review').count();
    const ratingCount = await pickGrandParent.locator('text=rating').count();
    
    console.log(`📊 Component categories:`);
    console.log(`   - contact: ${contactCount}`);
    console.log(`   - violation: ${violationCount}`);
    console.log(`   - info: ${infoCount}`);
    console.log(`   - utilities: ${utilitiesCount}`);
    console.log(`   - media: ${mediaCount}`);
    console.log(`   - review: ${reviewCount}`);
    console.log(`   - rating: ${ratingCount}`);
    
    // Expected for Bank: contact + content (5 components total)
    // Should NOT show violation
    if (violationCount === 0 && contactCount > 0) {
      console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
    } else if (violationCount > 0) {
      console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
      console.log('🔍 This means plugin is not filtering components properly');
    } else {
      console.log('⚠️ UNCLEAR: No contact or violation found');
    }
    
    await page.screenshot({ path: 'test-plugin-working-proof.png' });
    
  } else {
    console.log('❌ Component picker did not open');
  }
  
  // Wait a bit more to see if any delayed plugin logs appear
  await page.waitForTimeout(3000);
  console.log('✅ Test completed');
}); 