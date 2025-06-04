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
  
}); 