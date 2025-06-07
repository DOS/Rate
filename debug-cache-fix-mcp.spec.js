const { test, expect } = require('@playwright/test');

test('Debug Cache Fix MCP', async ({ page }) => {
  console.log('🚀 MCP Debug cache fix...');
  
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
  
  // Test ListingType selection and check console logs
  console.log('🎯 Testing ListingType selection...');
  
  const listingTypeInput = await page.locator('input[name="ListingType"]');
  
  // Test 1: Select Bank
  console.log('1️⃣ Selecting Bank...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption = await page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(2000); // Wait for plugin to process
  console.log('✅ Selected Bank');
  
  // Test 2: Select Scammer
  console.log('2️⃣ Selecting Scammer...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const scammerOption = await page.locator('text=Scammer').first();
  await scammerOption.click();
  await page.waitForTimeout(2000); // Wait for plugin to process
  console.log('✅ Selected Scammer');
  
  // Test 3: Back to Bank
  console.log('3️⃣ Back to Bank...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption2 = await page.locator('text=Bank').first();
  await bankOption2.click();
  await page.waitForTimeout(2000); // Wait for plugin to process
  console.log('✅ Selected Bank again');
  
  await page.screenshot({ path: 'debug-cache-fix-mcp.png' });
  console.log('✅ Debug completed - Check console logs above for plugin activity');
}); 