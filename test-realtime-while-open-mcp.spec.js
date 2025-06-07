const { test, expect } = require('@playwright/test');

test('MCP Test Real-time Filtering While Dynamic Zone Open', async ({ page }) => {
  console.log('🚀 MCP Testing real-time filtering while Dynamic Zone is open...');
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.text().includes('🔍') || msg.text().includes('🎯') || msg.text().includes('🔄') || msg.text().includes('Smart Component')) {
      console.log('🖥️ Browser:', msg.text());
    }
  });
  
  // Login
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  console.log('✅ Logged in');
  
  // Navigate to create Item page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  console.log('📋 On create Item page');
  
  const listingTypeInput = await page.locator('input[name="ListingType"]');
  
  // Step 1: Select Bank
  console.log('🎯 Step 1: Selecting Bank...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption = await page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank');
  
  // Step 2: Open Dynamic Zone component picker
  console.log('🎯 Step 2: Opening Dynamic Zone component picker...');
  const addComponentButton = await page.locator('button').filter({ hasText: /Add a component/ }).first();
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Check if picker is open
  const pickerDialog = await page.locator('[role="dialog"]');
  const isPickerOpen = await pickerDialog.isVisible();
  console.log(`📊 Component picker open: ${isPickerOpen}`);
  
  if (isPickerOpen) {
    // Count components for Bank
    const bankComponents = await page.locator('[role="dialog"] button').count();
    console.log(`📊 Bank components visible: ${bankComponents}`);
    await page.screenshot({ path: 'mcp-realtime-bank-open.png' });
    
    // Step 3: Change ListingType to Scammer WHILE picker is open
    console.log('🎯 Step 3: Changing to Scammer WHILE picker is open...');
    
    // Try to access ListingType field while picker is open
    const listingTypeField = await page.locator('input[name="ListingType"]');
    const isListingTypeAccessible = await listingTypeField.isVisible();
    console.log(`📊 ListingType field accessible while picker open: ${isListingTypeAccessible}`);
    
    if (isListingTypeAccessible) {
      await listingTypeField.click();
      await page.waitForTimeout(500);
      
      const scammerOption = await page.locator('text=Scammer').first();
      await scammerOption.click();
      await page.waitForTimeout(2000); // Wait for real-time filtering
      console.log('✅ Changed to Scammer while picker open');
      
      // Check if components updated in real-time
      const scammerComponents = await page.locator('[role="dialog"] button').count();
      console.log(`📊 Scammer components after real-time change: ${scammerComponents}`);
      await page.screenshot({ path: 'mcp-realtime-scammer-open.png' });
      
      // Verify real-time filtering worked
      if (scammerComponents !== bankComponents) {
        console.log('🎉 SUCCESS: Real-time filtering working while picker open!');
        console.log(`   Bank: ${bankComponents} components`);
        console.log(`   Scammer: ${scammerComponents} components`);
      } else {
        console.log('❌ ISSUE: Real-time filtering NOT working while picker open');
        console.log(`   Both show: ${bankComponents} components`);
      }
      
      // Step 4: Change back to Bank while picker still open
      console.log('🎯 Step 4: Changing back to Bank while picker still open...');
      await listingTypeField.click();
      await page.waitForTimeout(500);
      
      const bankOption2 = await page.locator('text=Bank').first();
      await bankOption2.click();
      await page.waitForTimeout(2000); // Wait for real-time filtering
      console.log('✅ Changed back to Bank while picker open');
      
      const bankComponentsAgain = await page.locator('[role="dialog"] button').count();
      console.log(`📊 Bank components after second real-time change: ${bankComponentsAgain}`);
      await page.screenshot({ path: 'mcp-realtime-bank-again-open.png' });
      
      // Final verification
      if (bankComponentsAgain === bankComponents && bankComponentsAgain !== scammerComponents) {
        console.log('🎉 PERFECT: Real-time filtering fully working!');
      } else {
        console.log('❌ ISSUE: Real-time filtering inconsistent');
      }
      
    } else {
      console.log('❌ ListingType field not accessible while picker is open');
      console.log('💡 This is the core issue - need to fix UI accessibility');
    }
    
  } else {
    console.log('❌ Component picker did not open');
  }
  
  await page.screenshot({ path: 'mcp-realtime-final.png' });
  console.log('✅ Real-time test completed');
}); 