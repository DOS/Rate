const { test, expect } = require('@playwright/test');

test('Test Cache Fix - Real-time Filtering', async ({ page }) => {
  console.log('🚀 Testing cache fix for real-time filtering...');
  
  // Login
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  console.log('✅ Logged in successfully');
  
  // Navigate to create Item page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  console.log('📋 Navigated to create Item page');
  
  // Step 1: Select Bank
  console.log('🎯 Step 1: Selecting Bank...');
  const listingTypeInput = await page.locator('input[name="ListingType"]');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption = await page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank');
  
  // Step 2: Open component picker
  console.log('🎯 Step 2: Opening component picker...');
  const addComponentButton = await page.locator('button:has-text("Add a component to")').first();
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  console.log('✅ Component picker opened');
  
  // Check visible components for Bank
  const visibleComponentsBank = await page.locator('[role="dialog"] button').count();
  console.log(`📊 Visible components for Bank: ${visibleComponentsBank}`);
  
  // Step 3: Change to Scammer while picker is open
  console.log('🎯 Step 3: Changing to Scammer while picker is open...');
  
  // Close picker first
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Change to Scammer
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  const scammerOption = await page.locator('text=Scammer').first();
  await scammerOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Scammer');
  
  // Open picker again
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Check visible components for Scammer
  const visibleComponentsScammer = await page.locator('[role="dialog"] button').count();
  console.log(`📊 Visible components for Scammer: ${visibleComponentsScammer}`);
  
  // Step 4: Change back to Bank while picker is open
  console.log('🎯 Step 4: Changing back to Bank while picker is open...');
  
  // Try to change ListingType while picker is open
  const listingTypeField = await page.locator('input[name="ListingType"]');
  if (await listingTypeField.isVisible()) {
    await listingTypeField.click();
    await page.waitForTimeout(500);
    const bankOption2 = await page.locator('text=Bank').first();
    await bankOption2.click();
    await page.waitForTimeout(2000); // Wait for real-time filtering
    console.log('✅ Changed back to Bank while picker open');
    
    // Check if components changed
    const visibleComponentsBankAgain = await page.locator('[role="dialog"] button').count();
    console.log(`📊 Visible components for Bank (after change): ${visibleComponentsBankAgain}`);
    
    if (visibleComponentsBankAgain !== visibleComponentsScammer) {
      console.log('🎉 SUCCESS: Real-time filtering is working! Components changed.');
    } else {
      console.log('❌ ISSUE: Components did not change - cache issue may persist');
    }
  } else {
    console.log('❌ ListingType field not accessible while picker is open');
  }
  
  await page.screenshot({ path: 'test-cache-fix-final.png' });
  console.log('✅ Test completed');
}); 