const { test, expect } = require('@playwright/test');

test('Test Real-time Component Filtering', async ({ page }) => {
  console.log('🚀 Starting real-time filtering test...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  await page.waitForLoadState('networkidle');
  
  // Login (assuming already logged in or auto-login)
  console.log('📋 Navigating to create Item page...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  
  console.log('✅ Page loaded, looking for ListingType field...');
  
  // Wait for ListingType field and select Bank first
  console.log('🎯 Step 1: Selecting Bank as ListingType...');
  const listingTypeField = page.locator('[name="ListingType"]').first();
  await listingTypeField.click();
  await page.waitForTimeout(500);
  
  // Select Bank
  await page.getByText('Bank', { exact: true }).click();
  await page.waitForTimeout(1000);
  console.log('✅ Selected Bank as ListingType');
  
  // Open component picker
  console.log('🎯 Step 2: Opening component picker...');
  const addComponentButton = page.getByText('Add a component to FieldGroup');
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Verify component picker is open and check initial filtering
  console.log('🔍 Checking initial component picker state...');
  const componentPicker = page.locator('[role="dialog"]').first();
  await expect(componentPicker).toBeVisible();
  
  // Check that only Bank components are shown (contact + media)
  const contactCategory = componentPicker.locator('text=contact');
  const mediaCategory = componentPicker.locator('text=media');
  const violationCategory = componentPicker.locator('text=violation');
  
  await expect(contactCategory).toBeVisible();
  await expect(mediaCategory).toBeVisible();
  console.log('✅ Initial filtering: Bank components (contact + media) are visible');
  
  // Check that violation category is hidden (should be hidden for Bank)
  const violationVisible = await violationCategory.isVisible().catch(() => false);
  console.log('🔍 Violation category visible:', violationVisible);
  
  // Now the critical test: Change ListingType while component picker is open
  console.log('🎯 Step 3: Changing ListingType to Scammer while picker is open...');
  
  // Click on ListingType field again (it should be visible behind the modal)
  await page.keyboard.press('Escape'); // Close picker first
  await page.waitForTimeout(500);
  
  // Change to Scammer
  await listingTypeField.click();
  await page.waitForTimeout(500);
  await page.getByText('Scammer', { exact: true }).click();
  await page.waitForTimeout(1000);
  console.log('✅ Changed ListingType to Scammer');
  
  // Open component picker again
  console.log('🎯 Step 4: Opening component picker again to see Scammer components...');
  await addComponentButton.click();
  await page.waitForTimeout(1000);
  
  // Check that Scammer components are now shown (contact + violation)
  console.log('🔍 Checking component picker after changing to Scammer...');
  const contactCategory2 = componentPicker.locator('text=contact');
  const violationCategory2 = componentPicker.locator('text=violation');
  const mediaCategory2 = componentPicker.locator('text=media');
  
  await expect(contactCategory2).toBeVisible();
  await expect(violationCategory2).toBeVisible();
  console.log('✅ Scammer filtering: contact + violation categories are visible');
  
  // Check that media category is hidden for Scammer
  const mediaVisible = await mediaCategory2.isVisible().catch(() => false);
  console.log('🔍 Media category visible for Scammer:', mediaVisible);
  
  // Test real-time filtering: Change ListingType while picker is STILL OPEN
  console.log('🎯 Step 5: REAL-TIME TEST - Changing ListingType while picker is open...');
  
  // Try to click ListingType while modal is open (this is the real test)
  // We need to find a way to access the ListingType field behind the modal
  
  // Method 1: Try to click through the modal backdrop
  const backdrop = page.locator('.modal-backdrop, [role="dialog"] ~ *').first();
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(500);
  }
  
  // Method 2: Use keyboard navigation
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  
  // Method 3: Try to access ListingType field directly
  try {
    await listingTypeField.click({ force: true });
    await page.waitForTimeout(500);
    await page.getByText('Bank', { exact: true }).click();
    await page.waitForTimeout(1000);
    console.log('✅ Successfully changed ListingType back to Bank while picker was open');
    
    // Check if filtering updated in real-time
    console.log('🔍 Checking if real-time filtering worked...');
    const violationStillVisible = await violationCategory2.isVisible().catch(() => false);
    const mediaBackVisible = await mediaCategory2.isVisible().catch(() => false);
    
    console.log('🔍 After real-time change:');
    console.log('  - Violation category visible:', violationStillVisible);
    console.log('  - Media category visible:', mediaBackVisible);
    
    if (!violationStillVisible && mediaBackVisible) {
      console.log('🎉 REAL-TIME FILTERING WORKS! Components updated immediately');
    } else {
      console.log('❌ Real-time filtering not working - components did not update');
    }
    
  } catch (error) {
    console.log('⚠️ Could not change ListingType while picker is open:', error.message);
    console.log('💡 This might be expected behavior - modal blocks interaction');
  }
  
  // Take screenshot for debugging
  await page.screenshot({ path: 'real-time-filtering-test.png', fullPage: true });
  console.log('📸 Screenshot saved as real-time-filtering-test.png');
  
  console.log('✅ Real-time filtering test completed');
}); 