const { test, expect } = require('@playwright/test');

test.describe('Force Real-time Component Filtering v1.0.3', () => {
  test('Force re-filtering when ListingType changes', async ({ page }) => {
    console.log('🚀 Testing force real-time filtering v1.0.3...');
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.text().includes('🎯') || msg.text().includes('🔄') || msg.text().includes('✅') || msg.text().includes('❌') || msg.text().includes('📦')) {
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

    // Navigate to create Item page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForTimeout(2000);
    console.log('📋 On create Item page');

    // Step 1: Select Bank first
    console.log('🎯 Step 1: Selecting Bank in ListingType...');
    
    const listingTypeField = page.locator('input[name="ListingType"]').first();
    await listingTypeField.click();
    await page.waitForTimeout(500);
    
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Bank selected');

    // Step 2: Open component picker
    console.log('🎯 Step 2: Opening component picker...');
    const addComponentText = page.locator('text=Add a component to FieldGroup');
    await addComponentText.click();
    await page.waitForTimeout(1000);

    // Verify picker opened
    const contactCategory = page.locator('text=contact');
    await expect(contactCategory).toBeVisible();
    console.log('✅ Component picker opened');

    // Step 3: Verify initial filtering for Bank
    console.log('🎯 Step 3: Verifying initial filtering for Bank...');
    
    const mediaCategory = page.locator('button:has-text("media")');
    await expect(mediaCategory).toBeVisible();
    
    const violationCategory = page.locator('button:has-text("violation")');
    await expect(violationCategory).not.toBeVisible();
    
    console.log('✅ Initial filtering verified - Bank shows contact + media only');

    // Step 4: Change to Scammer while picker is open (FORCE RE-FILTER TEST)
    console.log('🎯 Step 4: Changing to Scammer while picker is OPEN (Force Re-filter)...');
    
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Scammer');
    await page.waitForTimeout(2000); // Wait longer for force re-filtering
    console.log('✅ Changed to Scammer while picker was open');

    // Step 5: Verify force real-time filtering for Scammer
    console.log('🎯 Step 5: Verifying FORCE real-time filtering for Scammer...');
    
    // Check that violation category is now visible (was hidden before)
    await expect(violationCategory).toBeVisible();
    
    // Check that media category is now hidden (was visible before)  
    await expect(mediaCategory).not.toBeVisible();
    
    console.log('✅ FORCE real-time filtering verified - Scammer shows contact + violation only');

    // Step 6: Change back to Bank while picker is still open
    console.log('🎯 Step 6: Changing back to Bank while picker is OPEN (Force Re-filter)...');
    
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Bank');
    await page.waitForTimeout(2000); // Wait longer for force re-filtering
    console.log('✅ Changed back to Bank while picker was open');

    // Step 7: Verify force real-time filtering back to Bank
    console.log('🎯 Step 7: Verifying FORCE real-time filtering back to Bank...');
    
    // Check that media category is visible again
    await expect(mediaCategory).toBeVisible();
    
    // Check that violation category is hidden again
    await expect(violationCategory).not.toBeVisible();
    
    console.log('✅ FORCE real-time filtering verified - Back to Bank shows contact + media only');
    console.log('🎉 Force real-time filtering test completed successfully!');
  });
}); 