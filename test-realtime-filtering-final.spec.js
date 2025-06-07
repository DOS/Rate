const { test, expect } = require('@playwright/test');

test.describe('Real-time Component Filtering', () => {
  test('Real-time filtering when popup is open', async ({ page }) => {
    console.log('🚀 Testing real-time filtering when popup is open...');
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.text().includes('🎯') || msg.text().includes('🔄') || msg.text().includes('✅') || msg.text().includes('❌')) {
        console.log('🖥️ Browser:', msg.text());
      }
    });

    // Navigate to login page
    await page.goto('http://localhost:1337/admin/auth/login');
    
    // Login
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('**/admin');
    console.log('✅ Logged in');
    
    // Navigate to create item page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    console.log('📋 On create Item page');
    
    // Step 1: Select Bank first
    console.log('🎯 Step 1: Selecting Bank in ListingType...');
    
    // Find and click the ListingType field
    const listingTypeField = page.locator('input[name="ListingType"]').first();
    await listingTypeField.click();
    await page.waitForTimeout(500);
    
    // Select Bank from dropdown
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Bank selected');
    
    // Step 2: Open component picker
    console.log('🎯 Step 2: Opening component picker...');
    const addComponentText = page.locator('text=Add a component to FieldGroup');
    await expect(addComponentText).toBeVisible();
    await addComponentText.click();
    await page.waitForTimeout(1000);
    
    // Verify picker opened - check for component categories
    const contactCategory = page.locator('text=contact');
    await expect(contactCategory).toBeVisible();
    console.log('✅ Component picker opened');
    
    // Step 3: Verify initial filtering for Bank (should show contact + media only)
    console.log('🎯 Step 3: Verifying initial filtering for Bank...');
    
    // Check that contact category is visible
    await expect(contactCategory).toBeVisible();
    
    // Check that media category is visible  
    const mediaCategory = page.locator('button:has-text("media")');
    await expect(mediaCategory).toBeVisible();
    
    // Check that violation category is hidden
    const violationCategory = page.locator('button:has-text("violation")');
    await expect(violationCategory).not.toBeVisible();
    
    console.log('✅ Initial filtering verified - Bank shows contact + media only');
    
    // Step 4: Change to Scammer while picker is open (REAL-TIME TEST)
    console.log('🎯 Step 4: Changing to Scammer while picker is OPEN...');
    
    // Click on ListingType dropdown while picker is still open
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Scammer');
    await page.waitForTimeout(1000);
    console.log('✅ Changed to Scammer while picker was open');
    
    // Step 5: Verify real-time filtering (should now show contact + violation)
    console.log('🎯 Step 5: Verifying real-time filtering for Scammer...');
    
    // Wait a bit for real-time filtering to apply
    await page.waitForTimeout(500);
    
    // Check that contact category is still visible
    await expect(contactCategory).toBeVisible();
    
    // Check that violation category is now visible (was hidden before)
    await expect(violationCategory).toBeVisible();
    
    // Check that media category is now hidden (was visible before)
    await expect(mediaCategory).not.toBeVisible();
    
    console.log('✅ Real-time filtering verified - Scammer shows contact + violation');
    
    // Step 6: Change back to Bank while picker is still open
    console.log('🎯 Step 6: Changing back to Bank while picker is OPEN...');
    
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Changed back to Bank while picker was open');
    
    // Step 7: Verify real-time filtering back to Bank
    console.log('🎯 Step 7: Verifying real-time filtering back to Bank...');
    
    // Wait for real-time filtering
    await page.waitForTimeout(500);
    
    // Check that contact category is visible
    await expect(contactCategory).toBeVisible();
    
    // Check that media category is visible again
    await expect(mediaCategory).toBeVisible();
    
    // Check that violation category is hidden again
    await expect(violationCategory).not.toBeVisible();
    
    console.log('✅ Real-time filtering back to Bank verified');
    
    // Step 8: Test component selection
    console.log('🎯 Step 8: Testing component selection...');
    
    // Try to select a contact component
    const basicComponent = page.locator('text=Basic');
    await expect(basicComponent).toBeVisible();
    await basicComponent.click();
    await page.waitForTimeout(500);
    
    console.log('✅ Component selection works');
    
    console.log('🎉 Real-time filtering test completed successfully!');
  });
}); 