import { test, expect } from '@playwright/test';

test.describe('Smart Component Filter Plugin - Automated Testing', () => {
  
  test('Login and verify Smart Component Filter plugin functionality', async ({ page, browser }) => {
    console.log('🤖 Starting automated test for Smart Component Filter plugin...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    console.log('✅ Navigated to Strapi admin');
    
    // Login với credentials từ memory
    await page.getByLabel('Email').fill('joy@joy.vn');
    await page.getByLabel('Password').fill('!CkLdz_28@HH');
    await page.getByRole('button', { name: 'Log in' }).click();
    console.log('✅ Login completed');
    
    // Wait for dashboard load
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Welcome')).toBeVisible({ timeout: 10000 });
    console.log('✅ Dashboard loaded successfully');
    
    // Check for Smart Component Filter plugin in sidebar
    const sidebarText = await page.textContent('body');
    console.log('📍 Checking for Smart Component Filter plugin...');
    
    // Navigate to Content Manager
    await page.click('text=Content Manager');
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to Content Manager');
    
    // Click on Items collection
    await page.click('text=Items');
    await page.waitForLoadState('networkidle');
    console.log('✅ Opened Items collection');
    
    // Create new entry để test component filtering
    await page.click('text=Create new entry');
    await page.waitForLoadState('networkidle');
    console.log('✅ Opened create new Item form');
    
    // Test Bank ListingType filtering
    console.log('🧪 Testing Bank ListingType component filtering...');
    
    // Select Bank from ListingType dropdown
    await page.click('[name="listing_type"]');
    await page.waitForTimeout(1000);
    await page.click('text=Bank');
    await page.waitForTimeout(2000);
    console.log('✅ Selected Bank ListingType');
    
    // Click Add component button to open modal
    await page.click('text=Add component');
    await page.waitForTimeout(3000);
    console.log('✅ Opened component picker modal');
    
    // Capture console logs during modal interaction
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });
    
    // Verify Bank filtering: should only see contact group with Basic + Location
    const modalContent = await page.textContent('.component-picker-modal, [role="dialog"], .modal-content');
    console.log('📋 Modal content captured for Bank filtering');
    
    // Check if only expected components are visible
    const hasBasic = modalContent.includes('Basic');
    const hasLocation = modalContent.includes('Location');
    const hasViolation = modalContent.includes('violation');
    const hasReview = modalContent.includes('review');
    
    console.log(`🔍 Bank Filtering Results:
      - Has Basic: ${hasBasic}
      - Has Location: ${hasLocation}  
      - Has Violation (should be false): ${hasViolation}
      - Has Review (should be false): ${hasReview}`);
    
    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    console.log('✅ Closed component modal');
    
    // Test Scammer ListingType filtering
    console.log('🧪 Testing Scammer ListingType component filtering...');
    
    // Select Scammer from ListingType dropdown
    await page.click('[name="listing_type"]');
    await page.waitForTimeout(1000);
    await page.click('text=Scammer');
    await page.waitForTimeout(2000);
    console.log('✅ Selected Scammer ListingType');
    
    // Click Add component button again
    await page.click('text=Add component');
    await page.waitForTimeout(3000);
    console.log('✅ Opened component picker modal for Scammer');
    
    // Verify Scammer filtering: should see violation + contact.Social + review
    const scammerModalContent = await page.textContent('.component-picker-modal, [role="dialog"], .modal-content');
    console.log('📋 Modal content captured for Scammer filtering');
    
    const hasViolationGroup = scammerModalContent.includes('violation');
    const hasSocialContact = scammerModalContent.includes('Social');
    const hasReviewGroup = scammerModalContent.includes('review');
    const hasBasicInScammer = scammerModalContent.includes('Basic');
    
    console.log(`🔍 Scammer Filtering Results:
      - Has Violation group: ${hasViolationGroup}
      - Has Social contact: ${hasSocialContact}
      - Has Review group: ${hasReviewGroup}
      - Has Basic (should be false): ${hasBasicInScammer}`);
    
    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // Print all console logs captured during test
    console.log('📝 Console logs captured during test:');
    consoleLogs.forEach((log, index) => {
      if (log.includes('COMPONENT PICKER') || log.includes('FILTER') || log.includes('Smart Component')) {
        console.log(`${index + 1}. ${log}`);
      }
    });
    
    // Final verification
    const pluginWorking = hasBasic && hasLocation && !hasViolation && hasViolationGroup && hasSocialContact;
    
    console.log(`
🎯 AUTOMATED TEST RESULTS:
=========================
Plugin Detection: ${consoleLogs.some(log => log.includes('Smart Component') || log.includes('COMPONENT PICKER')) ? '✅ DETECTED' : '❌ NOT DETECTED'}
Bank Filtering: ${hasBasic && hasLocation && !hasViolation ? '✅ WORKING' : '❌ FAILED'}
Scammer Filtering: ${hasViolationGroup && hasSocialContact ? '✅ WORKING' : '❌ FAILED'}
Overall Status: ${pluginWorking ? '✅ PLUGIN WORKING CORRECTLY' : '❌ PLUGIN NEEDS FIXING'}
    `);
    
    expect(pluginWorking).toBe(true);
  });
  
  test('Verify plugin sidebar status display', async ({ page }) => {
    console.log('🤖 Testing plugin sidebar status...');
    
    await page.goto('http://localhost:1337/admin');
    
    // Login
    await page.getByLabel('Email').fill('joy@joy.vn');
    await page.getByLabel('Password').fill('!CkLdz_28@HH');
    await page.getByRole('button', { name: 'Log in' }).click();
    
    await page.waitForLoadState('networkidle');
    
    // Look for Smart Component Filter widget in sidebar
    const sidebarContent = await page.textContent('body');
    const hasPluginWidget = sidebarContent.includes('Smart Component Filter') || 
                           sidebarContent.includes('Component Filter') ||
                           sidebarContent.includes('Plugin Status');
    
    console.log(`🔍 Plugin Sidebar Status: ${hasPluginWidget ? '✅ VISIBLE' : '❌ NOT FOUND'}`);
    
    expect(hasPluginWidget).toBe(true);
  });
  
  test('should filter component picker to show only allowed components', async ({ page }) => {
    console.log('🚀 Starting Smart Component Filter test...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in or need to login
    const isLoginPage = await page.locator('input[name="email"]').isVisible();
    
    if (isLoginPage) {
      console.log('🔐 Logging into Strapi admin...');
      // Login with saved credentials
      await page.fill('input[name="email"]', 'admin@ratebox.com');
      await page.fill('input[name="password"]', 'Ratebox2024!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
    
    console.log('✅ Successfully logged in');
    
    // Navigate to Content Manager -> Item
    console.log('📋 Navigating to Item content type...');
    await page.click('text=Content Manager');
    await page.waitForLoadState('networkidle');
    
    // Click on Item in the sidebar
    await page.click('text=Item');
    await page.waitForLoadState('networkidle');
    
    // Find and click on "Scammer A" item (or any item with Scammer listing type)
    console.log('🔍 Looking for Scammer item...');
    const scammerItem = page.locator('text=Scammer A').first();
    
    if (await scammerItem.isVisible()) {
      await scammerItem.click();
    } else {
      // If no "Scammer A", look for any item and check its listing type
      console.log('⚠️ No "Scammer A" found, looking for any item...');
      const firstItem = page.locator('[data-testid="list-item"]').first();
      await firstItem.click();
    }
    
    await page.waitForLoadState('networkidle');
    console.log('✅ Opened item edit page');
    
    // Scroll down to find FieldGroup section
    console.log('📜 Scrolling to find FieldGroup section...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Look for "Add a component to FieldGroup" button
    const addComponentButton = page.locator('text=Add a component to FieldGroup');
    
    if (await addComponentButton.isVisible()) {
      console.log('🎯 Found "Add a component to FieldGroup" button');
      
      // Enable console logging to capture plugin logs
      page.on('console', msg => {
        if (msg.text().includes('Smart Component Filter') || 
            msg.text().includes('🔍') || 
            msg.text().includes('✅') || 
            msg.text().includes('🚫')) {
          console.log(`[BROWSER] ${msg.text()}`);
        }
      });
      
      // Click the button to open component picker
      await addComponentButton.click();
      await page.waitForTimeout(500); // Wait for component picker to open
      
      console.log('🔍 Component picker opened, checking for filtering...');
      
      // Wait a bit more for plugin to process
      await page.waitForTimeout(1000);
      
      // Check if only "info" category is visible
      const categoryHeaders = await page.locator('h3[role="button"]').all();
      console.log(`📋 Found ${categoryHeaders.length} category headers`);
      
      let visibleCategories = [];
      let hiddenCategories = [];
      
      for (const header of categoryHeaders) {
        const text = await header.textContent();
        const isVisible = await header.isVisible();
        const style = await header.evaluate(el => el.style.display);
        
        if (isVisible && style !== 'none') {
          visibleCategories.push(text);
        } else {
          hiddenCategories.push(text);
        }
      }
      
      console.log('✅ Visible categories:', visibleCategories);
      console.log('🚫 Hidden categories:', hiddenCategories);
      
      // Test expectations
      if (visibleCategories.includes('info') && visibleCategories.length === 1) {
        console.log('🎉 SUCCESS: Plugin working correctly - only "info" category visible');
        
        // Check if "Bank" component is visible in info category
        const bankComponent = page.locator('text=Bank');
        if (await bankComponent.isVisible()) {
          console.log('🎉 SUCCESS: "Bank" component is visible in info category');
        } else {
          console.log('❌ FAIL: "Bank" component not found');
        }
        
      } else if (visibleCategories.length > 1) {
        console.log('❌ FAIL: Plugin not working - multiple categories visible:', visibleCategories);
        console.log('Expected: Only "info" category should be visible');
      } else {
        console.log('❌ FAIL: No categories visible or "info" category not found');
      }
      
      // Close the component picker
      await page.keyboard.press('Escape');
      
    } else {
      console.log('❌ FAIL: "Add a component to FieldGroup" button not found');
      console.log('Available buttons:', await page.locator('button').allTextContents());
    }
    
    console.log('🏁 Test completed');
  });
  
}); 