const { test, expect } = require('@playwright/test');

test('MCP Test Cache Fix - Real-time Filtering', async ({ page }) => {
  console.log('🚀 MCP Testing cache fix for real-time filtering...');
  
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
  
  // Test 1: Select Bank and open component picker
  console.log('🎯 Test 1: Selecting Bank and opening component picker...');
  const listingTypeInput = await page.locator('input[name="ListingType"]');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption = await page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank');
  
  // Open component picker
  const addComponentButton = await page.locator('button').filter({ hasText: /Add a component/ }).first();
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Count components for Bank
  const bankComponents = await page.locator('[role="dialog"] button').count();
  console.log(`📊 Bank components visible: ${bankComponents}`);
  await page.screenshot({ path: 'mcp-test-bank-components.png' });
  
  // Close picker
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Test 2: Change to Scammer and open component picker
  console.log('🎯 Test 2: Changing to Scammer...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const scammerOption = await page.locator('text=Scammer').first();
  await scammerOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Scammer');
  
  // Open component picker again
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Count components for Scammer
  const scammerComponents = await page.locator('[role="dialog"] button').count();
  console.log(`📊 Scammer components visible: ${scammerComponents}`);
  await page.screenshot({ path: 'mcp-test-scammer-components.png' });
  
  // Test 3: Real-time filtering test
  console.log('🎯 Test 3: Testing real-time filtering while picker is open...');
  
  // Try to change ListingType while picker is open
  const listingTypeField = await page.locator('input[name="ListingType"]');
  if (await listingTypeField.isVisible()) {
    await listingTypeField.click();
    await page.waitForTimeout(500);
    
    const bankOption2 = await page.locator('text=Bank').first();
    await bankOption2.click();
    await page.waitForTimeout(2000); // Wait for real-time filtering
    console.log('✅ Changed back to Bank while picker open');
    
    // Check if components changed back
    const bankComponentsAgain = await page.locator('[role="dialog"] button').count();
    console.log(`📊 Bank components after real-time change: ${bankComponentsAgain}`);
    
    // Verify the fix worked
    if (bankComponentsAgain !== scammerComponents) {
      console.log('🎉 SUCCESS: Cache fix working! Real-time filtering detected component change.');
      console.log(`   Bank: ${bankComponents} → ${bankComponentsAgain} components`);
      console.log(`   Scammer: ${scammerComponents} components`);
    } else {
      console.log('❌ ISSUE: Components did not change - cache issue may persist');
      console.log(`   All counts: ${bankComponents}, ${scammerComponents}, ${bankComponentsAgain}`);
    }
  } else {
    console.log('❌ ListingType field not accessible while picker is open');
  }
  
  await page.screenshot({ path: 'mcp-test-cache-fix-final.png' });
  console.log('✅ MCP Test completed');
  
  // Log browser console for debugging
  page.on('console', msg => {
    if (msg.text().includes('🔍') || msg.text().includes('🎯') || msg.text().includes('🔄')) {
      console.log('🖥️ Browser:', msg.text());
    }
  });
}); 