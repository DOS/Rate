const { test, expect } = require('@playwright/test');

test('Simple Cache Test', async ({ page }) => {
  console.log('🚀 Testing cache fix...');
  
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
  
  // Test 1: Select Bank and check console logs
  console.log('🎯 Test 1: Selecting Bank...');
  const listingTypeInput = await page.locator('input[name="ListingType"]');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption = await page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank');
  
  // Test 2: Select Scammer and check console logs
  console.log('🎯 Test 2: Changing to Scammer...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const scammerOption = await page.locator('text=Scammer').first();
  await scammerOption.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Scammer');
  
  // Test 3: Back to Bank
  console.log('🎯 Test 3: Back to Bank...');
  await listingTypeInput.click();
  await page.waitForTimeout(500);
  
  const bankOption2 = await page.locator('text=Bank').first();
  await bankOption2.click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank again');
  
  await page.screenshot({ path: 'simple-cache-test.png' });
  console.log('✅ Test completed - Check browser console for plugin logs');
}); 